import { BrowserWindow, Notification } from 'electron'
import { appendFileSync, writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
// Use eval('require') to bypass vite/rollup bundling for native modules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pty = (eval('require') as NodeRequire)('node-pty') as typeof import('node-pty')

const CLAUDE_BIN = '/Users/victor/.local/bin/claude'
const LOG = '/tmp/coide-debug.log'

function log(msg: string): void {
  try { appendFileSync(LOG, `[${new Date().toISOString()}] ${msg}\n`) } catch {}
  console.log(msg)
}

try { writeFileSync(LOG, '') } catch {}

function notify(win: BrowserWindow, title: string, body: string): void {
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

// Module-level state
let activePty: pty.IPty | null = null
let activeWin: BrowserWindow | null = null

type PendingPermission = {
  tool_id: string
  tool_name: string
  input: Record<string, unknown>
  originalContent?: string | null
}
let pendingPermissions: PendingPermission[] = []
let waitingForPermission = false
let pendingEventBuffer: Record<string, unknown>[] = []

export function abortClaude(): void {
  if (activePty) {
    try { activePty.kill('SIGTERM') } catch {}
    activePty = null
  }
  pendingPermissions = []
  waitingForPermission = false
  pendingEventBuffer = []
}

export function respondPermission(approved: boolean): void {
  if (!activeWin) return
  const win = activeWin

  const toolInfo = pendingPermissions.shift()
  if (!toolInfo) return

  if (approved) {
    // Show tool card for the approved tool
    win.webContents.send('claude:event', {
      type: 'tool_start',
      tool_id: toolInfo.tool_id,
      tool_name: toolInfo.tool_name
    })
    win.webContents.send('claude:event', {
      type: 'tool_input',
      tool_id: toolInfo.tool_id,
      tool_name: toolInfo.tool_name,
      input: toolInfo.input,
      originalContent: toolInfo.originalContent
    })

    // If more tools are queued, stay in waiting state — renderer will show next dialog
    if (pendingPermissions.length > 0) return

    // All tools approved — flush buffered events
    waitingForPermission = false
    const buffered = pendingEventBuffer.slice()
    pendingEventBuffer = []
    for (const raw of buffered) {
      handleEvent(raw, win)
    }
  } else {
    // Revert file changes for Edit/Write tools (they already executed in -p mode)
    revertFileChange(toolInfo)
    for (const remaining of pendingPermissions) {
      revertFileChange(remaining)
    }

    // Deny the current tool and all remaining pending tools
    win.webContents.send('claude:event', {
      type: 'tool_denied',
      tool_id: toolInfo.tool_id,
      tool_name: toolInfo.tool_name,
      input: toolInfo.input,
      originalContent: toolInfo.originalContent
    })
    for (const remaining of pendingPermissions) {
      win.webContents.send('claude:event', {
        type: 'tool_denied',
        tool_id: remaining.tool_id,
        tool_name: remaining.tool_name,
        input: remaining.input,
        originalContent: remaining.originalContent
      })
    }
    win.webContents.send('claude:event', { type: 'stream_end' })

    pendingPermissions = []
    pendingEventBuffer = []
    waitingForPermission = false

    if (activePty) {
      try { activePty.kill('SIGTERM') } catch {}
      activePty = null
    }
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

function handleEvent(raw: Record<string, unknown>, win: BrowserWindow): void {
  const type = raw.type as string

  if (type === 'user') {
    const content = (raw.message as Record<string, unknown>)?.content as Array<Record<string, unknown>>
    if (!Array.isArray(content)) return

    for (const block of content) {
      if (block.type === 'tool_result') {
        const resultContent = Array.isArray(block.content)
          ? (block.content as Array<Record<string, unknown>>).map((c) => c.text ?? '').join('')
          : (block.content as string) ?? ''
        win.webContents.send('claude:event', {
          type: 'tool_result',
          tool_id: block.tool_use_id,
          content: resultContent
        })
      }
    }
  }

  if (type === 'result') {
    win.webContents.send('claude:event', {
      type: 'result',
      result: raw.result ?? '',
      session_id: raw.session_id ?? null,
      is_error: raw.is_error ?? false
    })
    win.webContents.send('claude:event', { type: 'stream_end' })

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
  win: BrowserWindow,
  skipPermissions = false
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    abortClaude()

    // Use -p (print/non-interactive) for JSON event stream
    // Always skip CLI-level permissions — coide's own permission dialog is the gate
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions']
    if (sessionId) args.push('--resume', sessionId)

    const env = { ...process.env } as Record<string, string>
    delete env['CLAUDECODE']
    delete env['CLAUDE_CODE_SESSION_ID']

    log(`Spawning PTY: ${CLAUDE_BIN} -p <prompt> --output-format stream-json --verbose${sessionId ? ' --resume ' + sessionId : ''}`)
    log(`CWD: ${cwd}`)

    const ptyProc = pty.spawn(CLAUDE_BIN, args, {
      name: 'xterm',
      cols: 220,
      rows: 50,
      cwd,
      env
    })

    activePty = ptyProc
    activeWin = win

    let lineBuffer = ''
    let settled = false

    function settle(fn: () => void): void {
      if (settled) return
      settled = true
      fn()
      setTimeout(() => {
        try { ptyProc.kill('SIGTERM') } catch {}
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
          log(`Event: ${JSON.stringify(raw).slice(0, 200)}`)

          // Always settle the promise when result arrives
          if (raw.type === 'result') {
            settle(() => resolve((raw.session_id as string) ?? null))
          }

          // Forward usage data from every assistant event (before tool logic which may `continue`)
          if (raw.type === 'assistant') {
            const msg = raw.message as Record<string, unknown> | undefined
            const usage = msg?.usage as Record<string, number> | undefined
            if (usage) {
              win.webContents.send('claude:event', {
                type: 'usage',
                input_tokens: usage.input_tokens ?? 0,
                output_tokens: usage.output_tokens ?? 0,
                cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
                cache_read_input_tokens: usage.cache_read_input_tokens ?? 0
              })
            }
          }

          // Detect tool_use in assistant events (only when not already waiting)
          if (raw.type === 'assistant' && !waitingForPermission) {
            const content = (raw.message as Record<string, unknown>)?.content as Array<Record<string, unknown>>
            if (Array.isArray(content)) {
              const toolBlocks = content.filter((b) => b.type === 'tool_use')
              if (toolBlocks.length > 0) {
                const needsPermission = toolBlocks.some((b) => PERMISSION_REQUIRED.has(b.name as string))

                if (needsPermission) {
                  if (skipPermissions) {
                    // Auto-approve all tools — show cards immediately, no dialog
                    for (const block of toolBlocks) {
                      const toolInput = (block.input ?? {}) as Record<string, unknown>
                      const originalContent = captureOriginalContent(block.name as string, toolInput)
                      win.webContents.send('claude:event', { type: 'tool_start', tool_id: block.id as string, tool_name: block.name as string })
                      win.webContents.send('claude:event', { type: 'tool_input', tool_id: block.id as string, tool_name: block.name as string, input: toolInput, originalContent })
                    }
                    // Fall through to normal event processing (no buffering)
                  } else {
                    // Show dialog for dangerous tools; auto-approve safe ones immediately
                    for (const block of toolBlocks) {
                      const toolInput = (block.input ?? {}) as Record<string, unknown>
                      const toolInfo: PendingPermission = {
                        tool_id: block.id as string,
                        tool_name: block.name as string,
                        input: toolInput,
                        originalContent: captureOriginalContent(block.name as string, toolInput)
                      }
                      if (PERMISSION_REQUIRED.has(block.name as string)) {
                        pendingPermissions.push(toolInfo)
                        win.webContents.send('claude:permission', toolInfo)
                        notify(win, 'Permission Needed', `Claude wants to use ${block.name as string}`)
                      } else {
                        // Safe tool: show card immediately without asking
                        win.webContents.send('claude:event', { type: 'tool_start', tool_id: toolInfo.tool_id, tool_name: toolInfo.tool_name })
                        win.webContents.send('claude:event', { type: 'tool_input', tool_id: toolInfo.tool_id, tool_name: toolInfo.tool_name, input: toolInfo.input })
                      }
                    }
                    waitingForPermission = true
                    continue // Buffer subsequent events until user responds
                  }
                } else {
                  // All tools are safe — auto-approve, show tool cards immediately
                  for (const block of toolBlocks) {
                    win.webContents.send('claude:event', { type: 'tool_start', tool_id: block.id as string, tool_name: block.name as string })
                    win.webContents.send('claude:event', { type: 'tool_input', tool_id: block.id as string, tool_name: block.name as string, input: (block.input ?? {}) as Record<string, unknown> })
                  }
                  // Fall through to normal event processing (no buffering)
                }
              }
            }
          }

          // Buffer events while waiting for permission; otherwise handle immediately
          if (waitingForPermission) {
            pendingEventBuffer.push(raw)
          } else {
            handleEvent(raw, win)
          }
        } catch {
          log(`Non-JSON line: ${trimmed.slice(0, 120)}`)
        }
      }
    })

    ptyProc.onExit(({ exitCode }) => {
      activePty = null
      log(`PTY exited with code: ${exitCode}`)

      if (lineBuffer.trim()) {
        try {
          const raw = JSON.parse(lineBuffer.trim())
          if (raw.type === 'result') settle(() => resolve((raw.session_id as string) ?? null))
          if (waitingForPermission) {
            pendingEventBuffer.push(raw)
          } else {
            handleEvent(raw, win)
          }
        } catch {}
        lineBuffer = ''
      }

      if (!settled) {
        const errMsg = `Claude exited with code ${exitCode}`
        win.webContents.send('claude:event', { type: 'error', result: errMsg })
        win.webContents.send('claude:event', { type: 'stream_end' })
        settle(() => reject(new Error(errMsg)))
      }
    })
  })
}
