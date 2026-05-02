/**
 * Login PTY runner — spawns `claude /login` interactively so coide can render
 * the OAuth flow inside the app and forward stdin from a modal.
 *
 * Why node-pty: `claude /login` is interactive and detects whether stdin is a
 * TTY. The main runner uses a regular pipe (stream-json), but here we need a
 * real terminal so the prompt appears and accepts input.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pty = eval('require')('node-pty')

import { BrowserWindow } from 'electron'
import { homedir } from 'os'
import { resolveClaudeBinary } from './claude'

type PtyProcess = {
  onData: (cb: (data: string) => void) => { dispose: () => void }
  onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: (signal?: string) => void
  pid: number
}

type LoginSession = {
  proc: PtyProcess
  win: BrowserWindow
  buffer: string
  exited: boolean
}

let active: LoginSession | null = null

export function startLogin(claudeBinaryPath: string, win: BrowserWindow): { pid: number } | { error: string } {
  // Only one login flow at a time
  if (active && !active.exited) {
    return { error: 'Login already in progress' }
  }

  const bin = resolveClaudeBinary(claudeBinaryPath)
  const env = { ...process.env, TERM: 'xterm-256color' } as Record<string, string>
  delete env['CLAUDECODE']
  delete env['CLAUDE_CODE_SESSION_ID']

  let proc: PtyProcess
  try {
    proc = pty.spawn(bin, ['/login'], {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: homedir(),
      env
    })
  } catch (err) {
    return { error: `Failed to spawn claude: ${err}` }
  }

  const sess: LoginSession = { proc, win, buffer: '', exited: false }
  active = sess

  proc.onData((data: string) => {
    if (win.isDestroyed()) return
    sess.buffer += data
    win.webContents.send('login:data', { data })
  })

  proc.onExit(({ exitCode }) => {
    sess.exited = true
    if (!win.isDestroyed()) {
      // Heuristic success detection: clean exit + buffer mentions logged in / success.
      const buf = sess.buffer.toLowerCase()
      const success =
        exitCode === 0 &&
        (buf.includes('logged in') || buf.includes('login successful') || buf.includes('success'))
      win.webContents.send('login:exit', { exitCode, success })
    }
    if (active === sess) active = null
  })

  return { pid: proc.pid }
}

export function writeLogin(data: string): void {
  if (!active || active.exited) return
  try {
    active.proc.write(data)
  } catch {
    // PTY may have died between checks
  }
}

export function resizeLogin(cols: number, rows: number): void {
  if (!active || active.exited) return
  try {
    active.proc.resize(cols, rows)
  } catch {
    // PTY may have died
  }
}

export function cancelLogin(): void {
  if (!active || active.exited) return
  try {
    active.proc.kill()
  } catch {
    // already dead
  }
  active = null
}
