import { execFile } from 'child_process'
import { promisify } from 'util'
import { BrowserWindow } from 'electron'
import { readFile, stat } from 'fs/promises'

const pExecFile = promisify(execFile)

export type ProcStatus = 'running' | 'exited' | 'killed' | 'orphaned' | 'untracked' | 'stopped'

export interface BgProcess {
  shellId: string // Claude's tool_use_id for the originating Bash call
  taskId: string | null // Claude's task registry ID (e.g. "b407td0kk"); shown to users
  description: string | null // Claude's human description (e.g. "Sleep for 120 seconds")
  command: string
  outputFile: string | null // path Claude writes background output to; we tail it
  startedAt: number
  endedAt: number | null
  pid: number | null
  status: ProcStatus
  exitCode: number | null
  lastOutput: string | null
  lastOutputAt: number | null
}

interface SessionState {
  byShellId: Map<string, BgProcess>
  // BashOutput tool_id → shellId, so when its tool_result arrives we know which shell to attribute
  outputCalls: Map<string, string>
  claudePidProvider: () => number | null
}

const sessions = new Map<string, SessionState>()
let mainWindow: BrowserWindow | null = null

let pollTimer: NodeJS.Timeout | null = null

export function attachWindow(win: BrowserWindow): void {
  mainWindow = win
}

export function attachClaudePid(coideSessionId: string, claudePidProvider: () => number | null): void {
  let s = sessions.get(coideSessionId)
  if (!s) {
    s = { byShellId: new Map(), outputCalls: new Map(), claudePidProvider }
    sessions.set(coideSessionId, s)
  } else {
    s.claudePidProvider = claudePidProvider
  }
  ensurePollTimer()
}

export function clearSession(coideSessionId: string): void {
  // Claude finished its turn but the bash subprocesses keep running independently.
  // We hold onto their PIDs and the liveness poll detects death — there's no
  // need to flag them as anything special on Claude's exit.
  const s = sessions.get(coideSessionId)
  if (!s) return
  s.outputCalls.clear()
}

export function dropSession(coideSessionId: string): void {
  sessions.delete(coideSessionId)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('processes:update', { coideSessionId, processes: [] })
  }
}

export function listProcesses(coideSessionId: string): BgProcess[] {
  const s = sessions.get(coideSessionId)
  if (!s) return []
  return [...s.byShellId.values()].sort((a, b) => a.startedAt - b.startedAt)
}

/**
 * Called when claude.ts sees a tool_input event. We inspect the tool call and,
 * if it's a Bash with run_in_background or a Bash* management call, track it.
 */
export async function noteToolInput(
  coideSessionId: string,
  toolId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<void> {
  const s = sessions.get(coideSessionId)
  if (!s) return

  if (toolName === 'Bash' && input.run_in_background === true) {
    const command = String(input.command ?? '')
    const proc: BgProcess = {
      shellId: toolId,
      taskId: null,
      description: null,
      command,
      outputFile: null,
      startedAt: Date.now(),
      endedAt: null,
      pid: null,
      status: 'running',
      exitCode: null,
      lastOutput: null,
      lastOutputAt: null
    }
    s.byShellId.set(toolId, proc)
    broadcast(coideSessionId)
    // Resolve PID asynchronously — Claude spawned the child just before this event fired.
    void resolvePid(coideSessionId, toolId, command).then(() => broadcast(coideSessionId))
    return
  }

  if (toolName === 'BashOutput') {
    const shellId = String(input.bash_id ?? '')
    if (shellId) s.outputCalls.set(toolId, shellId)
    return
  }

  if (toolName === 'KillShell') {
    const shellId = String(input.shell_id ?? '')
    const proc = s.byShellId.get(shellId)
    if (proc && proc.status === 'running') {
      proc.status = 'killed'
      proc.endedAt = Date.now()
      broadcast(coideSessionId)
    }
  }
}

/**
 * Called when claude.ts sees a tool_result. If it's the result of a BashOutput
 * call we previously tracked, capture the snippet onto the originating shell.
 */
export function noteToolResult(coideSessionId: string, toolId: string, content: string): void {
  const s = sessions.get(coideSessionId)
  if (!s) return
  const shellId = s.outputCalls.get(toolId)
  if (!shellId) return
  s.outputCalls.delete(toolId)
  const proc = s.byShellId.get(shellId)
  if (!proc) return
  proc.lastOutput = truncateOutput(content)
  proc.lastOutputAt = Date.now()
  broadcast(coideSessionId)
}

/**
 * Called when claude.ts sees a `system/task_started` event. Enrich our
 * tracked shell with task_id + description from Claude's task registry.
 */
export function noteTaskStarted(
  coideSessionId: string,
  toolUseId: string,
  taskId: string,
  description: string | null
): void {
  const s = sessions.get(coideSessionId)
  if (!s) return
  const proc = s.byShellId.get(toolUseId)
  if (!proc) return
  proc.taskId = taskId
  if (description) proc.description = description
  broadcast(coideSessionId)
}

/**
 * Called when claude.ts sees `system/task_updated`. Patch contains updated
 * fields like { status: 'killed', end_time: <ms> }. We trust Claude's status.
 */
export function noteTaskUpdated(
  coideSessionId: string,
  toolUseId: string,
  patch: Record<string, unknown>
): void {
  const s = sessions.get(coideSessionId)
  if (!s) return
  const proc = s.byShellId.get(toolUseId)
  if (!proc) return
  if (typeof patch.status === 'string') {
    proc.status = mapClaudeStatus(patch.status)
  }
  if (typeof patch.end_time === 'number') {
    proc.endedAt = patch.end_time
  }
  broadcast(coideSessionId)
}

/**
 * Called when claude.ts sees `system/task_notification`. Captures the path
 * Claude is writing the task's stdout to — we tail it for live output.
 */
export function noteTaskNotification(
  coideSessionId: string,
  toolUseId: string,
  status: string | null,
  outputFile: string | null
): void {
  const s = sessions.get(coideSessionId)
  if (!s) return
  const proc = s.byShellId.get(toolUseId)
  if (!proc) return
  if (outputFile && proc.outputFile !== outputFile) {
    proc.outputFile = outputFile
    void readOutputSnippet(outputFile).then((snip) => {
      if (snip != null) {
        proc.lastOutput = snip
        proc.lastOutputAt = Date.now()
        broadcast(coideSessionId)
      }
    })
  }
  if (status) {
    const mapped = mapClaudeStatus(status)
    // Only update status from a still-running row. task_notification (status='stopped')
    // arrives after task_updated (status='killed') and would otherwise downgrade the
    // more specific signal info to a generic "stopped".
    if (mapped !== 'running' && proc.status === 'running') proc.status = mapped
    if (proc.endedAt == null && mapped !== 'running') proc.endedAt = Date.now()
    broadcast(coideSessionId)
  }
}

export function mapClaudeStatus(s: string): ProcStatus {
  // Claude emits 'running' | 'killed' | 'stopped' (and likely 'completed'/'failed').
  // We map straight through where possible; unknown values become 'exited'.
  switch (s) {
    case 'running': return 'running'
    case 'killed': return 'killed'
    case 'stopped': return 'stopped'
    case 'completed': return 'exited'
    case 'failed': return 'exited'
    default: return 'exited'
  }
}

async function readOutputSnippet(path: string): Promise<string | null> {
  try {
    const st = await stat(path)
    const MAX = 4096
    const start = Math.max(0, st.size - MAX)
    const buf = await readFile(path)
    const text = buf.subarray(start).toString('utf8')
    return truncateOutput(text)
  } catch {
    return null
  }
}

export async function killByPid(pid: number): Promise<{ ok: boolean; error?: string }> {
  if (!pid || pid < 1) return { ok: false, error: 'invalid pid' }
  try {
    process.kill(pid, 'SIGTERM')
  } catch (err) {
    return { ok: false, error: String(err) }
  }
  // Escalate to SIGKILL after 3s if still alive
  setTimeout(() => {
    try { process.kill(pid, 0); process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
  }, 3000)
  return { ok: true }
}

export async function killShell(coideSessionId: string, shellId: string): Promise<{ ok: boolean; error?: string }> {
  const s = sessions.get(coideSessionId)
  if (!s) return { ok: false, error: 'unknown session' }
  const proc = s.byShellId.get(shellId)
  if (!proc) return { ok: false, error: 'unknown shell' }
  if (proc.pid == null) return { ok: false, error: 'pid not resolved' }
  const res = await killByPid(proc.pid)
  if (res.ok) {
    proc.status = 'killed'
    proc.endedAt = Date.now()
    broadcast(coideSessionId)
  }
  return res
}

// ---- internals ----

function broadcast(coideSessionId: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('processes:update', {
    coideSessionId,
    processes: listProcesses(coideSessionId)
  })
}

function ensurePollTimer(): void {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    for (const [coideSessionId, state] of sessions) {
      let changed = false
      for (const proc of state.byShellId.values()) {
        // Liveness check via PID — fallback when Claude doesn't deliver task_updated
        if ((proc.status === 'running' || proc.status === 'orphaned') && proc.pid != null) {
          if (!isAlive(proc.pid)) {
            proc.status = 'exited'
            proc.endedAt = Date.now()
            proc.exitCode = null
            changed = true
          }
        }
        // Tail Claude's output file while still running so the user gets live snippets
        if (proc.outputFile && (proc.status === 'running' || proc.status === 'orphaned')) {
          const path = proc.outputFile
          void readOutputSnippet(path).then((snip) => {
            if (snip != null && snip !== proc.lastOutput) {
              proc.lastOutput = snip
              proc.lastOutputAt = Date.now()
              broadcast(coideSessionId)
            }
          })
        }
      }
      if (changed) broadcast(coideSessionId)
    }
  }, 2000)
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function resolvePid(coideSessionId: string, shellId: string, command: string): Promise<void> {
  // Try several times on a backoff. Claude usually forks the child within a few
  // hundred ms, but timing varies; if the process detaches itself (PPID=1 via
  // setsid/nohup) we still find it because we match by command line, not parent.
  const delays = [0, 200, 500, 1000, 2500]
  const cmdSnippet = command.slice(0, 60).trim()
  if (!cmdSnippet) {
    markUntracked(coideSessionId, shellId)
    return
  }

  const startedAt = Date.now()
  for (const d of delays) {
    if (d > 0) await delay(d)
    const proc = sessions.get(coideSessionId)?.byShellId.get(shellId)
    if (!proc || proc.pid != null) return // already resolved or row gone
    const pid = await findRecentByCommand(cmdSnippet, startedAt)
    if (pid != null) {
      proc.pid = pid
      broadcast(coideSessionId)
      return
    }
  }

  markUntracked(coideSessionId, shellId)
}

function markUntracked(coideSessionId: string, shellId: string): void {
  const proc = sessions.get(coideSessionId)?.byShellId.get(shellId)
  if (!proc || proc.pid != null) return
  if (proc.status === 'running') proc.status = 'untracked'
  broadcast(coideSessionId)
}

async function findRecentByCommand(snippet: string, ourStart: number): Promise<number | null> {
  // pgrep -f matches the full command line; -l adds the command for filtering
  let stdout: string
  try {
    const result = await pExecFile('pgrep', ['-f', snippet])
    stdout = result.stdout
  } catch {
    return null
  }
  const pids = stdout.split('\n').map((l) => parseInt(l.trim(), 10)).filter((n) => Number.isFinite(n) && n !== process.pid)
  if (pids.length === 0) return null

  // For each candidate, check it actually started recently (within the last 10s
  // of when we registered the shell). This avoids matching a long-running
  // process that happens to share the same command line.
  const candidates: { pid: number; ageMs: number }[] = []
  for (const pid of pids) {
    const startedMs = await readStartTimeMs(pid)
    if (startedMs == null) continue
    const ageMs = startedMs - ourStart
    // Allow some slack on either side: process may have started slightly before
    // we registered (clock skew, race) or up to 10s after.
    if (ageMs > -3000 && ageMs < 10_000) {
      candidates.push({ pid, ageMs })
    }
  }
  if (candidates.length === 0) return null
  // Pick the one whose start time is closest to (and not before) our own.
  candidates.sort((a, b) => Math.abs(a.ageMs) - Math.abs(b.ageMs))
  return candidates[0].pid
}

async function readStartTimeMs(pid: number): Promise<number | null> {
  // macOS: `ps -o lstart=` prints e.g. "Thu May  1 19:14:32 2026".
  // Linux: same flag works on most distros.
  try {
    const { stdout } = await pExecFile('ps', ['-o', 'lstart=', '-p', String(pid)])
    const t = Date.parse(stdout.trim())
    return Number.isFinite(t) ? t : null
  } catch {
    return null
  }
}

export function truncateOutput(s: string): string {
  const MAX_CHARS = 2000
  const MAX_LINES = 20
  const lines = s.split('\n')
  let trimmed = lines.length > MAX_LINES ? '… (truncated)\n' + lines.slice(-MAX_LINES).join('\n') : s
  if (trimmed.length > MAX_CHARS) trimmed = '… (truncated)\n' + trimmed.slice(-MAX_CHARS)
  return trimmed
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
