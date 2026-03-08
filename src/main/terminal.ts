/**
 * Terminal PTY manager — spawns shell processes and pipes data to/from renderer
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pty = eval('require')('node-pty')

import { BrowserWindow } from 'electron'
import { homedir } from 'os'

type PtyProcess = {
  onData: (callback: (data: string) => void) => { dispose: () => void }
  onExit: (callback: (e: { exitCode: number; signal?: number }) => void) => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: (signal?: string) => void
  pid: number
}

const terminals = new Map<string, PtyProcess>()

export function spawnTerminal(
  id: string,
  cwd: string,
  win: BrowserWindow
): { pid: number } {
  // Kill existing terminal with this id
  if (terminals.has(id)) {
    try { terminals.get(id)!.kill() } catch { /* already dead */ }
    terminals.delete(id)
  }

  const shell = process.env.SHELL || '/bin/zsh'
  const term: PtyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: cwd || homedir(),
    env: { ...process.env, TERM: 'xterm-256color' }
  })

  terminals.set(id, term)

  term.onData((data: string) => {
    if (win.isDestroyed()) return
    win.webContents.send('terminal:data', { id, data })
  })

  term.onExit(({ exitCode }) => {
    terminals.delete(id)
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:exit', { id, exitCode })
    }
  })

  return { pid: term.pid }
}

export function writeTerminal(id: string, data: string): void {
  terminals.get(id)?.write(data)
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  terminals.get(id)?.resize(cols, rows)
}

export function killTerminal(id: string): void {
  const term = terminals.get(id)
  if (term) {
    try { term.kill() } catch { /* already dead */ }
    terminals.delete(id)
  }
}

export function killAllTerminals(): void {
  for (const [id, term] of terminals) {
    try { term.kill() } catch { /* already dead */ }
    terminals.delete(id)
  }
}
