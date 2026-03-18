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

type TerminalEntry = {
  proc: PtyProcess
  flushTimer: ReturnType<typeof setTimeout> | null
  buffer: string
}

const terminals = new Map<string, TerminalEntry>()

// Batch IPC messages: accumulate PTY data and flush every 16ms (~60fps)
function flushTerminalBuffer(id: string, win: BrowserWindow): void {
  const entry = terminals.get(id)
  if (!entry || !entry.buffer) return
  if (win.isDestroyed()) { entry.buffer = ''; return }
  win.webContents.send('terminal:data', { id, data: entry.buffer })
  entry.buffer = ''
  entry.flushTimer = null
}

export function spawnTerminal(
  id: string,
  cwd: string,
  win: BrowserWindow
): { pid: number } {
  // Kill existing terminal with this id
  const existing = terminals.get(id)
  if (existing) {
    if (existing.flushTimer) clearTimeout(existing.flushTimer)
    try { existing.proc.kill() } catch { /* already dead */ }
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

  const entry: TerminalEntry = { proc: term, flushTimer: null, buffer: '' }
  terminals.set(id, entry)

  term.onData((data: string) => {
    if (win.isDestroyed()) return
    entry.buffer += data
    if (!entry.flushTimer) {
      entry.flushTimer = setTimeout(() => flushTerminalBuffer(id, win), 16)
    }
  })

  term.onExit(({ exitCode }) => {
    // Flush remaining buffer before removing
    if (entry.buffer) flushTerminalBuffer(id, win)
    if (entry.flushTimer) clearTimeout(entry.flushTimer)
    terminals.delete(id)
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:exit', { id, exitCode })
    }
  })

  return { pid: term.pid }
}

export function writeTerminal(id: string, data: string): void {
  terminals.get(id)?.proc.write(data)
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  terminals.get(id)?.proc.resize(cols, rows)
}

export function killTerminal(id: string): void {
  const entry = terminals.get(id)
  if (entry) {
    if (entry.flushTimer) clearTimeout(entry.flushTimer)
    try { entry.proc.kill() } catch { /* already dead */ }
    terminals.delete(id)
  }
}

export function killAllTerminals(): void {
  for (const [id, entry] of terminals) {
    if (entry.flushTimer) clearTimeout(entry.flushTimer)
    try { entry.proc.kill() } catch { /* already dead */ }
    terminals.delete(id)
  }
}
