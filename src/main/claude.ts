import { BrowserWindow, Notification } from 'electron'
import { appendFileSync, writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { type CoideSettings, DEFAULT_SETTINGS } from '../shared/types'
// Use eval('require') to bypass vite/rollup bundling for native modules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pty = (eval('require') as NodeRequire)('node-pty') as typeof import('node-pty')

const LOG = '/tmp/coide-debug.log'

function log(msg: string): void {
  try { appendFileSync(LOG, `[${new Date().toISOString()}] ${msg}\n`) } catch {}
  console.log(msg)
}

try { writeFileSync(LOG, '') } catch {}

function resolveClaudeBinary(configured: string): string {
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

function notify(win: BrowserWindow, title: string, body: string): void {
  if (!notificationsEnabled) return
  if (win.isDestroyed() || win.isFocused()) return
  const n = new Notification({ title, body })
  n.on('click', () => {
    win.show()
    win.focus()
  })
  n.show()
}

function stripAnsi(str: string): string {
  return str
    .replace(/\u001B\[[\d;]*[a-zA-Z]/g, '')
    .replace(/\u001B[^[]/g, '')
    .replace(/\r/g, '')
}

// Tools that require explicit user approval before running
const PERMISSION_REQUIRED = new Set(['Bash', 'Edit', 'Write'])

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
  if (coideSessionId) {
    const session = ptySessions.get(coideSessionId)
    if (session) {
      try { session.pty.kill('SIGTERM') } catch {}
      ptySessions.delete(coideSessionId)
    }
  } else {
    // Kill all sessions (app shutdown)
    for (const [id, session] of ptySessions) {
      try { session.pty.kill('SIGTERM') } catch {}
      ptySessions.delete(id)
    }
  }
}

export function respondPermission(approved: boolean, coideSessionId?: string): void {
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
  } else {
    revertFileChange(toolInfo)
    for (const remaining of sess.pendingPermissions) {
      revertFileChange(remaining)
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

    try { sess.pty.kill('SIGTERM') } catch {}
    ptySessions.delete(coideSessionId)
  }
}

function captureOriginalContent(toolName: string, input: Record<string, unknown>): string | null {
  if (toolName !== 'Edit' && toolName !== 'Write') return null
  const filePath = String(input.file_path ?? input.path ?? '')
  if (!filePath) return null
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return null // File doesn't exist yet (new file)
  }
}

function revertFileChange(toolInfo: PendingPermission): void {
  if (toolInfo.tool_name !== 'Edit' && toolInfo.tool_name !== 'Write') return
  const filePath = String(toolInfo.input.file_path ?? toolInfo.input.path ?? '')
  if (!filePath) return

  try {
    if (toolInfo.originalContent != null) {
      // Restore original content
      writeFileSync(filePath, toolInfo.originalContent, 'utf-8')
      log(`Reverted file: ${filePath}`)
    } else {
      // File was newly created — delete it
      if (existsSync(filePath)) {
        unlinkSync(filePath)
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

  // 'assistant' usage is extracted in the onData loop (before tool logic) so it's not missed on `continue`
}

export function runClaude(
  prompt: string,
  cwd: string,
  sessionId: string | null,
  coideSessionId: string,
  win: BrowserWindow,
  settings: CoideSettings
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    // No longer kills other sessions — each runs independently

    const skipPermissions = settings.skipPermissions
    notificationsEnabled = settings.notifications
    const claudeBin = resolveClaudeBinary(settings.claudeBinaryPath)

    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions']
    if (sessionId) args.push('--resume', sessionId)
    if (settings.model) args.push('--model', settings.model)
    if (settings.systemPrompt) args.push('--append-system-prompt', settings.systemPrompt)
    if (settings.effort) args.push('--effort', settings.effort)

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

    function settle(fn: () => void): void {
      if (sess.settled) return
      sess.settled = true
      fn()
      setTimeout(() => {
        try { ptyProc.kill('SIGTERM') } catch {}
        ptySessions.delete(coideSessionId)
      }, 200)
    }

    ptyProc.onData((data: string) => {
      lineBuffer += stripAnsi(data)
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const raw = JSON.parse(trimmed)
          log(`Event [${coideSessionId.slice(0, 8)}]: ${JSON.stringify(raw).slice(0, 200)}`)

          if (raw.type === 'result') {
            settle(() => resolve((raw.session_id as string) ?? null))
          }

          if (raw.type === 'assistant') {
            const msg = raw.message as Record<string, unknown> | undefined
            const usage = msg?.usage as Record<string, number> | undefined
            if (usage) {
              win.webContents.send('claude:event', {
                ...tag,
                type: 'usage',
                input_tokens: usage.input_tokens ?? 0,
                output_tokens: usage.output_tokens ?? 0,
                cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
                cache_read_input_tokens: usage.cache_read_input_tokens ?? 0
              })
            }
          }

          if (raw.type === 'assistant' && !sess.waitingForPermission) {
            const content = (raw.message as Record<string, unknown>)?.content as Array<Record<string, unknown>>
            if (Array.isArray(content)) {
              const toolBlocks = content.filter((b) => b.type === 'tool_use')
              if (toolBlocks.length > 0) {
                const needsPermission = toolBlocks.some((b) => PERMISSION_REQUIRED.has(b.name as string))

                if (needsPermission) {
                  if (skipPermissions) {
                    for (const block of toolBlocks) {
                      const toolInput = (block.input ?? {}) as Record<string, unknown>
                      const originalContent = captureOriginalContent(block.name as string, toolInput)
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
                        originalContent: captureOriginalContent(block.name as string, toolInput)
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
                    continue
                  }
                } else {
                  for (const block of toolBlocks) {
                    win.webContents.send('claude:event', { ...tag, type: 'tool_start', tool_id: block.id as string, tool_name: block.name as string })
                    win.webContents.send('claude:event', { ...tag, type: 'tool_input', tool_id: block.id as string, tool_name: block.name as string, input: (block.input ?? {}) as Record<string, unknown> })
                  }
                }
              }
            }
          }

          if (sess.waitingForPermission) {
            sess.pendingEventBuffer.push(raw)
          } else {
            handleEvent(raw, win, coideSessionId)
          }
        } catch {
          log(`Non-JSON line: ${trimmed.slice(0, 120)}`)
        }
      }
    })

    ptyProc.onExit(({ exitCode }) => {
      log(`PTY [${coideSessionId.slice(0, 8)}] exited with code: ${exitCode}`)

      if (lineBuffer.trim()) {
        try {
          const raw = JSON.parse(lineBuffer.trim())
          if (raw.type === 'result') settle(() => resolve((raw.session_id as string) ?? null))
          if (sess.waitingForPermission) {
            sess.pendingEventBuffer.push(raw)
          } else {
            handleEvent(raw, win, coideSessionId)
          }
        } catch {}
        lineBuffer = ''
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
