import { app, BrowserWindow, Notification } from 'electron'
import { appendFile, writeFile, readFile, unlink, existsSync } from 'fs'
import { writeFile as writeFileAsync, readFile as readFileAsync, unlink as unlinkAsync } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { type CoideSettings, DEFAULT_SETTINGS } from '../shared/types'
// Use eval('require') to bypass vite/rollup bundling for native modules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pty = (eval('require') as NodeRequire)('node-pty') as typeof import('node-pty')
import { execFile } from 'child_process'

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

type PtySession = {
  pty: pty.IPty
  win: BrowserWindow
  coideSessionId: string
  pendingPermissions: PendingPermission[]
  waitingForPermission: boolean
  pendingEventBuffer: Record<string, unknown>[]
  settled: boolean
}

const ptySessions = new Map<string, PtySession>()

export function abortClaude(coideSessionId?: string): void {
  const killSession = (session: PtySession, id: string): void => {
    try { session.pty.kill('SIGTERM') } catch {}
    // Force-kill after 500ms if still alive
    setTimeout(() => {
      try { session.pty.kill('SIGKILL') } catch {}
    }, 500)
    ptySessions.delete(id)
  }

  if (coideSessionId) {
    const session = ptySessions.get(coideSessionId)
    if (session) killSession(session, coideSessionId)
  } else {
    for (const [id, session] of ptySessions) {
      killSession(session, id)
    }
  }
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

    if (sess.pendingPermissions.length > 0) return

    sess.waitingForPermission = false
    const buffered = sess.pendingEventBuffer.slice()
    sess.pendingEventBuffer = []
    for (const raw of buffered) {
      handleEvent(raw, win, coideSessionId)
    }

    // If PTY already exited while we were waiting for permission,
    // send stream_end and clean up now
    if (!sess.pty.pid) {
      if (!sess.settled) {
        win.webContents.send('claude:event', { ...tag, type: 'stream_end' })
      }
      ptySessions.delete(coideSessionId)
    }
  } else {
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

    try { if (sess.pty.pid) sess.pty.kill('SIGTERM') } catch {}
    ptySessions.delete(coideSessionId)
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

    win.webContents.send('claude:event', {
      ...tag,
      type: 'result',
      result: raw.result ?? '',
      session_id: raw.session_id ?? null,
      is_error: raw.is_error ?? false
    })
    win.webContents.send('claude:event', { ...tag, type: 'stream_end' })

    if (raw.is_error) {
      const errText = String(raw.result ?? 'Something went wrong').slice(0, 80)
      notify(win, 'Task Failed', errText)
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

  // 'assistant' usage is extracted in the onData loop (before tool logic) so it's not missed on `continue`
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

    const skipPermissions = settings.skipPermissions
    notificationsEnabled = settings.notifications
    const claudeBin = resolveClaudeBinary(settings.claudeBinaryPath)

    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose']
    if (sessionId) args.push('--resume', sessionId)
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
    // Permission mode: plan mode takes priority, otherwise bypass permissions
    // (coide handles its own permission UI via the skipPermissions setting)
    if (settings.planMode) args.push('--permission-mode', 'plan')
    else args.push('--permission-mode', 'bypassPermissions')
    if (worktreeName) args.push('--worktree', worktreeName)

    const env = { ...process.env } as Record<string, string>
    delete env['CLAUDECODE']
    delete env['CLAUDE_CODE_SESSION_ID']

    log(`Spawning PTY [${coideSessionId.slice(0, 8)}]: ${claudeBin} ${args.filter(a => a !== prompt).join(' ')}`)
    log(`CWD: ${cwd}`)

    const ptyProc = pty.spawn(claudeBin, args, {
      name: 'xterm',
      cols: 220,
      rows: 50,
      cwd,
      env
    })

    const tag = { coideSessionId }

    const sess: PtySession = {
      pty: ptyProc,
      win,
      coideSessionId,
      pendingPermissions: [],
      waitingForPermission: false,
      pendingEventBuffer: [],
      settled: false
    }
    ptySessions.set(coideSessionId, sess)

    let lineBuffer = ''
    const MAX_LINE_BUFFER = 1024 * 1024 // 1 MB cap on line buffer
    const MAX_EVENT_BUFFER = 500 // Max buffered events while waiting for permission
    // Stale-resume auto-recovery: when Claude CLI can't find the conversation we asked
    // to resume, silently retry once without --resume so the user's message still lands.
    let staleResumeDetected = false
    let retryInFlight = false

    function settle(fn: () => void): void {
      if (sess.settled) return
      sess.settled = true
      fn()
      setTimeout(() => {
        try { ptyProc.kill('SIGTERM') } catch {}
        ptySessions.delete(coideSessionId)
      }, 200)
    }

    function retryWithoutResume(): void {
      if (retryInFlight) return
      retryInFlight = true
      sess.settled = true // suppress the current run's error-result from reaching the renderer
      log(`Stale resume detected for [${coideSessionId.slice(0, 8)}] — retrying without --resume`)
      try { ptyProc.kill('SIGTERM') } catch {}
      ptySessions.delete(coideSessionId)
      usageCallbacks.delete(coideSessionId)
      // Inform renderer so it can clear the stale claudeSessionId in the store
      win.webContents.send('claude:event', { ...tag, type: 'session_reset', reason: 'stale_resume' })
      runClaude(prompt, cwd, null, coideSessionId, win, settings, worktreeName).then(resolve, reject)
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
            }
          }
          sess.waitingForPermission = true
          return true // Signal: skip to next line
        }
      } else {
        for (const block of toolBlocks) {
          win.webContents.send('claude:event', { ...tag, type: 'tool_start', tool_id: block.id as string, tool_name: block.name as string })
          win.webContents.send('claude:event', { ...tag, type: 'tool_input', tool_id: block.id as string, tool_name: block.name as string, input: (block.input ?? {}) as Record<string, unknown> })
        }
      }
      return false
    }

    ptyProc.onData((data: string) => {
      lineBuffer += stripAnsi(data)

      // Cap line buffer to prevent unbounded memory growth
      if (lineBuffer.length > MAX_LINE_BUFFER) {
        log(`Line buffer exceeded ${MAX_LINE_BUFFER} bytes, truncating`)
        lineBuffer = lineBuffer.slice(-MAX_LINE_BUFFER / 2)
      }

      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const raw = JSON.parse(trimmed)
          log(`Event [${coideSessionId.slice(0, 8)}]: ${JSON.stringify(raw).slice(0, 200)}`)

          if (raw.type === 'result') {
            // Auto-recover from stale --resume: if the CLI reported the conversation
            // wasn't found, silently retry without --resume. Suppress the error result
            // from propagating to the renderer.
            if (sessionId && staleResumeDetected && raw.is_error) {
              retryWithoutResume()
              continue
            }
            settle(() => resolve((raw.session_id as string) ?? null))
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

          // Forward rate limit events to renderer
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

          // Detect extended thinking blocks
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
                // Process tool blocks async (file reads for original content)
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

          // When stale-resume auto-recovery fires, suppress the doomed result event
          // so the renderer never renders the "No conversation found" error.
          if (retryInFlight) continue
          if (sess.waitingForPermission) {
            if (sess.pendingEventBuffer.length < MAX_EVENT_BUFFER) {
              sess.pendingEventBuffer.push(raw)
            }
          } else {
            handleEvent(raw, win, coideSessionId)
          }
        } catch {
          log(`Non-JSON line: ${trimmed.slice(0, 120)}`)
          if (sessionId && /No conversation found with session ID/i.test(trimmed)) {
            staleResumeDetected = true
          }
        }
      }
    })

    ptyProc.onExit(({ exitCode }) => {
      log(`PTY [${coideSessionId.slice(0, 8)}] exited with code: ${exitCode}`)

      // Auto-retry already took over — don't touch the outer promise
      if (retryInFlight) return

      if (lineBuffer.trim()) {
        try {
          const raw = JSON.parse(lineBuffer.trim())
          if (raw.type === 'result') {
            if (sessionId && staleResumeDetected && raw.is_error) {
              retryWithoutResume()
              return
            }
            settle(() => resolve((raw.session_id as string) ?? null))
          }
          if (sess.waitingForPermission) {
            sess.pendingEventBuffer.push(raw)
          } else if (!retryInFlight) {
            handleEvent(raw, win, coideSessionId)
          }
        } catch {
          if (sessionId && /No conversation found with session ID/i.test(lineBuffer)) {
            staleResumeDetected = true
          }
        }
        lineBuffer = ''
      }

      // Line buffer was empty but exit code suggests error and we flagged stale resume earlier
      if (sessionId && staleResumeDetected && exitCode !== 0 && !sess.settled) {
        retryWithoutResume()
        return
      }

      // If waiting for permission, keep the session alive so respondPermission
      // can replay buffered events (CLI exits before user clicks Accept/Reject)
      if (sess.waitingForPermission) {
        log(`PTY exited while waiting for permission — session kept alive for user response`)
        return
      }

      if (!sess.settled) {
        const errMsg = `Claude exited with code ${exitCode}`
        win.webContents.send('claude:event', { ...tag, type: 'error', result: errMsg })
        win.webContents.send('claude:event', { ...tag, type: 'stream_end' })
        settle(() => reject(new Error(errMsg)))
      }

      ptySessions.delete(coideSessionId)
    })
  })
}
