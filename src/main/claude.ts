import { app, BrowserWindow, Notification } from 'electron'
import { appendFile, writeFile, readFile, unlink, existsSync } from 'fs'
import { writeFile as writeFileAsync, readFile as readFileAsync, unlink as unlinkAsync } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { type CoideSettings, DEFAULT_SETTINGS } from '../shared/types'
import * as processes from './processes'
import { execFile, spawn as spawnChild, type ChildProcessWithoutNullStreams } from 'child_process'

const LOG = '/tmp/coide-debug.log'

// Buffered async logger — collects messages and flushes periodically to avoid blocking main thread
let logBuffer: string[] = []
let logFlushTimer: ReturnType<typeof setTimeout> | null = null

function log(msg: string): void {
  logBuffer.push(`[${new Date().toISOString()}] ${msg}`)
  console.log(msg)
  if (!logFlushTimer) {
    logFlushTimer = setTimeout(flushLog, 200)
  }
}

function flushLog(): void {
  logFlushTimer = null
  if (logBuffer.length === 0) return
  const batch = logBuffer.join('\n') + '\n'
  logBuffer = []
  appendFile(LOG, batch, () => {})
}

writeFile(LOG, '', () => {})

export function resolveClaudeBinary(configured: string): string {
  // If user set an absolute path, use it directly
  if (configured && configured.startsWith('/')) return configured

  // macOS GUI apps don't inherit shell PATH, so check common install locations
  const candidates = [
    join(homedir(), '.local', 'bin', 'claude'),
    join(homedir(), '.npm-global', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude'
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      log(`Resolved claude binary: ${candidate}`)
      return candidate
    }
  }

  // Fallback to bare name (relies on PATH)
  return configured || 'claude'
}

let notificationsEnabled = true

// Workflow engine result callbacks — keyed by coideSessionId
const resultCallbacks = new Map<string, (result: string, isError: boolean) => void>()

export function onClaudeResult(
  coideSessionId: string,
  cb: (result: string, isError: boolean) => void
): void {
  resultCallbacks.set(coideSessionId, cb)
}

// Token usage callbacks (for workflow engine to aggregate per node/execution)
type UsageCallback = (usage: {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}) => void
const usageCallbacks = new Map<string, UsageCallback>()

export function onClaudeUsage(coideSessionId: string, cb: UsageCallback): void {
  usageCallbacks.set(coideSessionId, cb)
}

export function offClaudeUsage(coideSessionId: string): void {
  usageCallbacks.delete(coideSessionId)
}

// Keep a reference to prevent garbage collection from destroying notifications before they fire
let activeNotification: Notification | null = null

function notifyViaOsascript(title: string, body: string): void {
  // Use AppleScript to trigger a native macOS notification — works in all builds, no signing required
  const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`
  execFile('osascript', ['-e', script], (err) => {
    if (err) log(`osascript notification error: ${err}`)
  })
}

function notify(win: BrowserWindow, title: string, body: string): void {
  if (!notificationsEnabled) return
  if (win.isDestroyed()) return

  const isFocused = BrowserWindow.getFocusedWindow()?.id === win.id

  // Only do OS-level notifications when app is in background
  if (!isFocused) {
    app.dock?.bounce?.('informational')

    // Try Electron's native Notification (works in dev and properly signed builds)
    if (Notification.isSupported()) {
      try {
        activeNotification = new Notification({ title, body })
        activeNotification.on('click', () => {
          win.show()
          win.focus()
        })
        activeNotification.show()
      } catch {
        // fall through to osascript fallback
      }
    }

    // Also fire osascript — Electron's Notification silently fails in unsigned builds
    notifyViaOsascript(title, body)
  }
}

export function isAuthError(msg: string): boolean {
  if (!msg) return false
  return /\b401\b|authentication_error|invalid authentication|invalid api key|unauthorized/i.test(msg)
}

function stripAnsi(str: string): string {
  return str
    .replace(/\u001B\[[\d;]*[a-zA-Z]/g, '')
    .replace(/\u001B[^[]/g, '')
    .replace(/\r/g, '')
}

// Tools that require explicit user approval before running
const PERMISSION_REQUIRED = new Set(['Bash', 'Edit', 'Write', 'ExitPlanMode'])

// Per-session PTY state
type PendingPermission = {
  tool_id: string
  tool_name: string
  input: Record<string, unknown>
  originalContent?: string | null
}

type TurnState = {
  resolve: (sessionId: string | null) => void
  reject: (e: Error) => void
  settled: boolean
  prompt: string
}

type PtySession = {
  proc: ChildProcessWithoutNullStreams
  win: BrowserWindow
  coideSessionId: string
  alive: boolean
  cwd: string
  worktreeName?: string
  spawnFingerprint: string
  resumeSessionId: string | null
  pendingPermissions: PendingPermission[]
  waitingForPermission: boolean
  pendingEventBuffer: Record<string, unknown>[]
  currentTurn: TurnState | null
  lineBuffer: string
  staleResumeDetected: boolean
  retryInFlight: boolean
}

const ptySessions = new Map<string, PtySession>()

function killSessionPty(sess: PtySession): void {
  sess.alive = false
  try { sess.proc.kill('SIGTERM') } catch {}
  setTimeout(() => {
    try { sess.proc.kill('SIGKILL') } catch {}
  }, 500)
}

export function abortClaude(coideSessionId?: string): void {
  const interrupt = (sess: PtySession): void => {
    if (sess.alive) {
      // SIGINT asks Claude to stop the current turn but stay alive for the next one.
      try { sess.proc.kill('SIGINT') } catch {}
    }
    if (sess.currentTurn && !sess.currentTurn.settled) {
      sess.currentTurn.settled = true
      try { sess.currentTurn.reject(new Error('Aborted by user')) } catch {}
      sess.currentTurn = null
    }
    sess.win.webContents.send('claude:event', { coideSessionId: sess.coideSessionId, type: 'stream_end' })
  }

  if (coideSessionId) {
    const sess = ptySessions.get(coideSessionId)
    if (sess) interrupt(sess)
  } else {
    for (const sess of ptySessions.values()) interrupt(sess)
  }
}

export function disposeSession(coideSessionId: string): void {
  const sess = ptySessions.get(coideSessionId)
  if (!sess) return
  killSessionPty(sess)
  ptySessions.delete(coideSessionId)
  usageCallbacks.delete(coideSessionId)
}

export function disposeAll(): void {
  for (const sess of ptySessions.values()) killSessionPty(sess)
  ptySessions.clear()
  usageCallbacks.clear()
}

export async function respondPermission(approved: boolean, coideSessionId?: string): Promise<void> {
  if (!coideSessionId) return
  const sess = ptySessions.get(coideSessionId)
  if (!sess) return
  const win = sess.win

  const toolInfo = sess.pendingPermissions.shift()
  if (!toolInfo) return

  const tag = { coideSessionId }

  if (approved) {
    win.webContents.send('claude:event', {
      ...tag,
      type: 'tool_start',
      tool_id: toolInfo.tool_id,
      tool_name: toolInfo.tool_name
    })
    win.webContents.send('claude:event', {
      ...tag,
      type: 'tool_input',
      tool_id: toolInfo.tool_id,
      tool_name: toolInfo.tool_name,
      input: toolInfo.input,
      originalContent: toolInfo.originalContent
    })
    void processes.noteToolInput(coideSessionId, toolInfo.tool_id, toolInfo.tool_name, toolInfo.input)

    if (sess.pendingPermissions.length > 0) return

    sess.waitingForPermission = false
    const buffered = sess.pendingEventBuffer.slice()
    sess.pendingEventBuffer = []
    for (const raw of buffered) {
      handleEvent(raw, win, coideSessionId)
    }

    // PTY stays alive across turns — nothing to clean up here. If the PTY
    // unexpectedly died while waiting for permission, emit a stream_end and
    // drop it so the next prompt respawns.
    if (!sess.alive) {
      win.webContents.send('claude:event', { ...tag, type: 'stream_end' })
      ptySessions.delete(coideSessionId)
    }
  } else {
    log(`Denying permission for ${toolInfo.tool_name} [${coideSessionId.slice(0, 8)}]`)
    await revertFileChange(toolInfo)
    for (const remaining of sess.pendingPermissions) {
      await revertFileChange(remaining)
    }

    win.webContents.send('claude:event', {
      ...tag,
      type: 'tool_denied',
      tool_id: toolInfo.tool_id,
      tool_name: toolInfo.tool_name,
      input: toolInfo.input,
      originalContent: toolInfo.originalContent
    })
    for (const remaining of sess.pendingPermissions) {
      win.webContents.send('claude:event', {
        ...tag,
        type: 'tool_denied',
        tool_id: remaining.tool_id,
        tool_name: remaining.tool_name,
        input: remaining.input,
        originalContent: remaining.originalContent
      })
    }
    win.webContents.send('claude:event', { ...tag, type: 'stream_end' })

    sess.pendingPermissions = []
    sess.pendingEventBuffer = []
    sess.waitingForPermission = false

    // Reject the in-flight turn so the IPC promise resolves on the renderer side.
    if (sess.currentTurn && !sess.currentTurn.settled) {
      sess.currentTurn.settled = true
      try { sess.currentTurn.reject(new Error('Permission denied')) } catch {}
      sess.currentTurn = null
    }

    // On deny we tear down the PTY: with --permission-mode bypassPermissions Claude
    // has likely already executed the tool, so the only safe way to cancel any
    // queued follow-up tool calls in the same turn is to kill Claude. Background
    // processes from previous turns are lost; the next prompt respawns.
    disposeSession(coideSessionId)
  }
}

async function captureOriginalContent(toolName: string, input: Record<string, unknown>): Promise<string | null> {
  if (toolName !== 'Edit' && toolName !== 'Write') return null
  const filePath = String(input.file_path ?? input.path ?? '')
  if (!filePath) return null
  try {
    return await readFileAsync(filePath, 'utf-8')
  } catch {
    return null // File doesn't exist yet (new file)
  }
}

async function revertFileChange(toolInfo: PendingPermission): Promise<void> {
  if (toolInfo.tool_name !== 'Edit' && toolInfo.tool_name !== 'Write') return
  const filePath = String(toolInfo.input.file_path ?? toolInfo.input.path ?? '')
  if (!filePath) return

  try {
    if (toolInfo.originalContent != null) {
      await writeFileAsync(filePath, toolInfo.originalContent, 'utf-8')
      log(`Reverted file: ${filePath}`)
    } else {
      if (existsSync(filePath)) {
        await unlinkAsync(filePath)
        log(`Deleted new file: ${filePath}`)
      }
    }
  } catch (err) {
    log(`Failed to revert ${filePath}: ${err}`)
  }
}

function handleEvent(raw: Record<string, unknown>, win: BrowserWindow, coideSessionId: string): void {
  const type = raw.type as string
  const tag = { coideSessionId }

  if (type === 'user') {
    const content = (raw.message as Record<string, unknown>)?.content as Array<Record<string, unknown>>
    if (!Array.isArray(content)) return

    for (const block of content) {
      if (block.type === 'tool_result') {
        const resultContent = Array.isArray(block.content)
          ? (block.content as Array<Record<string, unknown>>).map((c) => c.text ?? '').join('')
          : (block.content as string) ?? ''
        win.webContents.send('claude:event', {
          ...tag,
          type: 'tool_result',
          tool_id: block.tool_use_id,
          content: resultContent
        })
        processes.noteToolResult(coideSessionId, block.tool_use_id as string, resultContent)
      }
    }
  }

  if (type === 'result') {
    // Notify workflow engine if a callback is registered for this session
    const resultCb = resultCallbacks.get(coideSessionId)
    if (resultCb) {
      resultCb(String(raw.result ?? ''), Boolean(raw.is_error))
      resultCallbacks.delete(coideSessionId)
    }
    usageCallbacks.delete(coideSessionId)
    // Claude is exiting; any background bash children become orphaned (still tracked
    // by PID so they can be killed, but Claude no longer owns them).
    processes.clearSession(coideSessionId)

    win.webContents.send('claude:event', {
      ...tag,
      type: 'result',
      result: raw.result ?? '',
      session_id: raw.session_id ?? null,
      is_error: raw.is_error ?? false
    })
    win.webContents.send('claude:event', { ...tag, type: 'stream_end' })

    if (raw.is_error) {
      const errText = String(raw.result ?? 'Something went wrong')
      // Surface auth failures so the renderer can prompt for /login and retry
      if (isAuthError(errText)) {
        win.webContents.send('claude:event', { ...tag, type: 'auth_required', message: errText.slice(0, 200) })
      }
      notify(win, 'Task Failed', errText.slice(0, 80))
    } else {
      const resultText = String(raw.result ?? '').slice(0, 80) || 'Claude finished your task'
      notify(win, 'Task Complete', resultText)
    }
  }

  if (type === 'system' && raw.subtype === 'init') {
    win.webContents.send('claude:event', {
      ...tag,
      type: 'system',
      subtype: 'init',
      mcp_servers: raw.mcp_servers ?? [],
      tools: raw.tools ?? []
    })
  }

  if (type === 'system' && raw.subtype === 'task_started') {
    processes.noteTaskStarted(
      coideSessionId,
      String(raw.tool_use_id ?? ''),
      String(raw.task_id ?? ''),
      raw.description != null ? String(raw.description) : null
    )
  }

  if (type === 'system' && raw.subtype === 'task_updated') {
    processes.noteTaskUpdated(
      coideSessionId,
      String(raw.tool_use_id ?? ''),
      (raw.patch ?? {}) as Record<string, unknown>
    )
  }

  if (type === 'system' && raw.subtype === 'task_notification') {
    processes.noteTaskNotification(
      coideSessionId,
      String(raw.tool_use_id ?? ''),
      raw.status != null ? String(raw.status) : null,
      raw.output_file != null ? String(raw.output_file) : null
    )
  }

  // 'assistant' usage is extracted in the onData loop (before tool logic) so it's not missed on `continue`
}

const MAX_LINE_BUFFER = 1024 * 1024
const MAX_EVENT_BUFFER = 500

function buildSpawnArgs(
  cwd: string,
  _resumeSessionId: string | null,
  settings: CoideSettings,
  worktreeName: string | undefined
): { args: string[]; fingerprint: string } {
  // --input-format=stream-json doesn't support --resume the way --print mode does
  // (it expects "deferred" sessions, which coide doesn't create). Conversation
  // history is held by coide's local store; each coide session gets its own Claude
  // process that lives across turns, but doesn't try to resume across app restarts.
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']
  if (settings.model) args.push('--model', settings.model)
  const coideSystemPrompt = [
    'You are running inside coide, a desktop GUI for Claude Code.',
    'Tool call results are NOT shown inline — they are hidden inside collapsible cards the user may not open.',
    'You MUST always include relevant output (file contents, command results, directory listings, etc.) directly in your text response.',
    'Never say "here it is" or "see above" without actually showing the content in your message.',
    `The current working directory is: ${cwd}. When the user says "your directory" or "this directory", they mean this path.`
  ].join(' ')
  const fullSystemPrompt = settings.systemPrompt
    ? `${coideSystemPrompt}\n\n${settings.systemPrompt}`
    : coideSystemPrompt
  args.push('--append-system-prompt', fullSystemPrompt)
  if (settings.effort) args.push('--effort', settings.effort)
  if (settings.allowedTools && settings.allowedTools.length > 0) {
    args.push('--allowed-tools', settings.allowedTools.join(','))
  }
  if (settings.planMode) args.push('--permission-mode', 'plan')
  else args.push('--permission-mode', 'bypassPermissions')
  if (worktreeName) args.push('--worktree', worktreeName)
  // Fingerprint excludes resumeSessionId — resume is only used for first spawn after app restart
  const fingerprint = JSON.stringify([cwd, settings.model, settings.effort, settings.allowedTools, settings.planMode, settings.systemPrompt, worktreeName])
  return { args, fingerprint }
}

function formatUserMessage(prompt: string): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } }) + '\n'
}

export function runClaude(
  prompt: string,
  cwd: string,
  sessionId: string | null,
  coideSessionId: string,
  win: BrowserWindow,
  settings: CoideSettings,
  worktreeName?: string
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (!prompt || !prompt.trim()) {
      reject(new Error('Empty prompt'))
      return
    }

    notificationsEnabled = settings.notifications

    const existing = ptySessions.get(coideSessionId)
    const fp = buildSpawnArgs(cwd, sessionId, settings, worktreeName).fingerprint

    // Reuse existing session when the spawn-relevant settings match. If they differ
    // (model/effort/cwd/etc), tear down and spawn fresh.
    if (existing && existing.alive && existing.spawnFingerprint === fp) {
      sendPromptToSession(existing, prompt, resolve, reject)
      return
    }
    if (existing) disposeSession(coideSessionId)

    const sess = spawnSession(cwd, sessionId, coideSessionId, win, settings, worktreeName, fp)
    sendPromptToSession(sess, prompt, resolve, reject)
  })
}

function sendPromptToSession(
  sess: PtySession,
  prompt: string,
  resolve: (sessionId: string | null) => void,
  reject: (e: Error) => void
): void {
  sess.pendingPermissions = []
  sess.waitingForPermission = false
  sess.pendingEventBuffer = []
  sess.currentTurn = { resolve, reject, settled: false, prompt }
  try {
    sess.proc.stdin.write(formatUserMessage(prompt))
  } catch (err) {
    sess.currentTurn = null
    sess.alive = false
    reject(new Error(`Failed to send prompt: ${err}`))
  }
}

function spawnSession(
  cwd: string,
  resumeSessionId: string | null,
  coideSessionId: string,
  win: BrowserWindow,
  settings: CoideSettings,
  worktreeName: string | undefined,
  fingerprint: string
): PtySession {
  const claudeBin = resolveClaudeBinary(settings.claudeBinaryPath)
  const { args } = buildSpawnArgs(cwd, resumeSessionId, settings, worktreeName)

  const env = { ...process.env } as Record<string, string>
  delete env['CLAUDECODE']
  delete env['CLAUDE_CODE_SESSION_ID']

  log(`Spawning Claude [${coideSessionId.slice(0, 8)}]: ${claudeBin} ${args.join(' ')}`)
  log(`CWD: ${cwd}`)

  // child_process.spawn (not node-pty) — Claude's --input-format=stream-json
  // requires stdin to be a real pipe; node-pty's TTY is rejected with
  // "Input must be provided either through stdin or as a prompt argument".
  const proc = spawnChild(claudeBin, args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  }) as ChildProcessWithoutNullStreams

  const sess: PtySession = {
    proc,
    win,
    coideSessionId,
    alive: true,
    cwd,
    worktreeName,
    spawnFingerprint: fingerprint,
    resumeSessionId,
    pendingPermissions: [],
    waitingForPermission: false,
    pendingEventBuffer: [],
    currentTurn: null,
    lineBuffer: '',
    staleResumeDetected: false,
    retryInFlight: false
  }
  ptySessions.set(coideSessionId, sess)
  processes.attachClaudePid(coideSessionId, () => proc.pid ?? null)
  attachListeners(sess, settings)
  return sess
}

function attachListeners(sess: PtySession, settings: CoideSettings): void {
  const { proc, win, coideSessionId } = sess
  const tag = { coideSessionId }
  const skipPermissions = settings.skipPermissions

  function settle(fn: (turn: TurnState) => void): void {
    const turn = sess.currentTurn
    if (!turn || turn.settled) return
    turn.settled = true
    fn(turn)
    sess.currentTurn = null
  }

  function retryWithoutResume(): void {
    if (sess.retryInFlight) return
    sess.retryInFlight = true
    log(`Stale resume detected for [${coideSessionId.slice(0, 8)}] — retrying without --resume`)
    const savedTurn = sess.currentTurn
    sess.currentTurn = null
    killSessionPty(sess)
    ptySessions.delete(coideSessionId)
    usageCallbacks.delete(coideSessionId)
    win.webContents.send('claude:event', { ...tag, type: 'session_reset', reason: 'stale_resume' })
    if (savedTurn) {
      runClaude(savedTurn.prompt, sess.cwd, null, coideSessionId, win, settings, sess.worktreeName).then(savedTurn.resolve, savedTurn.reject)
    }
  }

  async function processToolBlocks(
    toolBlocks: Array<Record<string, unknown>>,
    needsPermission: boolean
  ): Promise<boolean> {
      if (needsPermission) {
        if (skipPermissions) {
          for (const block of toolBlocks) {
            const toolInput = (block.input ?? {}) as Record<string, unknown>
            const originalContent = await captureOriginalContent(block.name as string, toolInput)
            win.webContents.send('claude:event', { ...tag, type: 'tool_start', tool_id: block.id as string, tool_name: block.name as string })
            win.webContents.send('claude:event', { ...tag, type: 'tool_input', tool_id: block.id as string, tool_name: block.name as string, input: toolInput, originalContent })
            void processes.noteToolInput(coideSessionId, block.id as string, block.name as string, toolInput)
          }
        } else {
          for (const block of toolBlocks) {
            const toolInput = (block.input ?? {}) as Record<string, unknown>
            const toolInfo: PendingPermission = {
              tool_id: block.id as string,
              tool_name: block.name as string,
              input: toolInput,
              originalContent: await captureOriginalContent(block.name as string, toolInput)
            }
            if (PERMISSION_REQUIRED.has(block.name as string)) {
              sess.pendingPermissions.push(toolInfo)
              win.webContents.send('claude:permission', { ...toolInfo, coideSessionId })
              notify(win, 'Permission Needed', `Claude wants to use ${block.name as string}`)
            } else {
              win.webContents.send('claude:event', { ...tag, type: 'tool_start', tool_id: toolInfo.tool_id, tool_name: toolInfo.tool_name })
              win.webContents.send('claude:event', { ...tag, type: 'tool_input', tool_id: toolInfo.tool_id, tool_name: toolInfo.tool_name, input: toolInfo.input })
              void processes.noteToolInput(coideSessionId, toolInfo.tool_id, toolInfo.tool_name, toolInfo.input)
            }
          }
          sess.waitingForPermission = true
          return true // Signal: skip to next line
        }
      } else {
        for (const block of toolBlocks) {
          const toolInput = (block.input ?? {}) as Record<string, unknown>
          win.webContents.send('claude:event', { ...tag, type: 'tool_start', tool_id: block.id as string, tool_name: block.name as string })
          win.webContents.send('claude:event', { ...tag, type: 'tool_input', tool_id: block.id as string, tool_name: block.name as string, input: toolInput })
          void processes.noteToolInput(coideSessionId, block.id as string, block.name as string, toolInput)
        }
      }
      return false
    }

  proc.stdout.on('data', (chunk: Buffer) => {
    const data = chunk.toString('utf8')
    sess.lineBuffer += stripAnsi(data)

    if (sess.lineBuffer.length > MAX_LINE_BUFFER) {
      log(`Line buffer exceeded ${MAX_LINE_BUFFER} bytes, truncating`)
      sess.lineBuffer = sess.lineBuffer.slice(-MAX_LINE_BUFFER / 2)
    }

    const lines = sess.lineBuffer.split('\n')
    sess.lineBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const raw = JSON.parse(trimmed)
        log(`Event [${coideSessionId.slice(0, 8)}]: ${JSON.stringify(raw).slice(0, 200)}`)

        if (raw.type === 'result') {
          if (sess.resumeSessionId && sess.staleResumeDetected && raw.is_error) {
            retryWithoutResume()
            continue
          }
          settle((turn) => turn.resolve((raw.session_id as string) ?? null))
          // First-result clears the resume — subsequent turns are continuations of the live PTY
          sess.resumeSessionId = null
          sess.staleResumeDetected = false
        }

        if (raw.type === 'assistant') {
          const msg = raw.message as Record<string, unknown> | undefined
          const usage = msg?.usage as Record<string, number> | undefined
          if (usage) {
            const normalized = {
              input_tokens: usage.input_tokens ?? 0,
              output_tokens: usage.output_tokens ?? 0,
              cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
              cache_read_input_tokens: usage.cache_read_input_tokens ?? 0
            }
            win.webContents.send('claude:event', {
              ...tag,
              type: 'usage',
              ...normalized
            })
            const usageCb = usageCallbacks.get(coideSessionId)
            if (usageCb) {
              try { usageCb(normalized) } catch { /* ignore */ }
            }
          }
        }

        if (raw.type === 'rate_limit_event') {
          const info = raw.rate_limit_info as Record<string, unknown> | undefined
          if (info) {
            win.webContents.send('claude:event', {
              ...tag,
              type: 'rate_limit',
              status: (info.status as string) ?? 'unknown',
              resetsAt: (info.resetsAt as number) ?? 0,
              rateLimitType: (info.rateLimitType as string) ?? 'five_hour'
            })
          }
        }

        if (raw.type === 'assistant') {
          const msg2 = raw.message as Record<string, unknown> | undefined
          const content2 = msg2?.content as Array<Record<string, unknown>> | undefined
          if (Array.isArray(content2)) {
            const thinkingBlock = content2.find((b) => b.type === 'thinking')
            if (thinkingBlock) {
              win.webContents.send('claude:event', { ...tag, type: 'thinking', thinking: thinkingBlock.thinking ?? '' })
            }
          }
        }

        if (raw.type === 'assistant' && !sess.waitingForPermission) {
          const content = (raw.message as Record<string, unknown>)?.content as Array<Record<string, unknown>>
          if (Array.isArray(content)) {
            const toolBlocks = content.filter((b) => b.type === 'tool_use')
            if (toolBlocks.length > 0) {
              const needsPermission = toolBlocks.some((b) => PERMISSION_REQUIRED.has(b.name as string))
              processToolBlocks(toolBlocks, needsPermission).then((shouldSkip) => {
                if (!shouldSkip) {
                  if (sess.waitingForPermission) {
                    if (sess.pendingEventBuffer.length < MAX_EVENT_BUFFER) {
                      sess.pendingEventBuffer.push(raw)
                    }
                  } else {
                    handleEvent(raw, win, coideSessionId)
                  }
                }
              }).catch((err) => {
                log(`processToolBlocks error: ${err}`)
              })
              continue
            }
          }
        }

        if (sess.retryInFlight) continue
        if (sess.waitingForPermission) {
          if (sess.pendingEventBuffer.length < MAX_EVENT_BUFFER) {
            sess.pendingEventBuffer.push(raw)
          }
        } else {
          handleEvent(raw, win, coideSessionId)
        }
      } catch {
        log(`Non-JSON line: ${trimmed.slice(0, 120)}`)
        if (sess.resumeSessionId && /No conversation found with session ID/i.test(trimmed)) {
          sess.staleResumeDetected = true
        }
      }
    }
  })

  proc.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trim()
    if (text) log(`stderr [${coideSessionId.slice(0, 8)}]: ${text.slice(0, 400)}`)
  })

  proc.on('exit', (exitCode) => {
    log(`Claude [${coideSessionId.slice(0, 8)}] exited with code: ${exitCode}`)
    sess.alive = false

    if (sess.retryInFlight) return

    if (sess.lineBuffer.trim()) {
      try {
        const raw = JSON.parse(sess.lineBuffer.trim())
        if (raw.type === 'result') {
          if (sess.resumeSessionId && sess.staleResumeDetected && raw.is_error) {
            retryWithoutResume()
            return
          }
          settle((turn) => turn.resolve((raw.session_id as string) ?? null))
        }
        if (sess.waitingForPermission) {
          sess.pendingEventBuffer.push(raw)
        } else if (!sess.retryInFlight) {
          handleEvent(raw, win, coideSessionId)
        }
      } catch {
        if (sess.resumeSessionId && /No conversation found with session ID/i.test(sess.lineBuffer)) {
          sess.staleResumeDetected = true
        }
      }
      sess.lineBuffer = ''
    }

    if (sess.resumeSessionId && sess.staleResumeDetected && exitCode !== 0 && (!sess.currentTurn || !sess.currentTurn.settled)) {
      retryWithoutResume()
      return
    }

    if (sess.waitingForPermission) {
      log(`PTY exited while waiting for permission — session kept alive for user response`)
      return
    }

    if (sess.currentTurn && !sess.currentTurn.settled) {
      const errMsg = `Claude exited with code ${exitCode}`
      win.webContents.send('claude:event', { ...tag, type: 'error', result: errMsg })
      win.webContents.send('claude:event', { ...tag, type: 'stream_end' })
      settle((turn) => turn.reject(new Error(errMsg)))
    }

    ptySessions.delete(coideSessionId)
  })
}
