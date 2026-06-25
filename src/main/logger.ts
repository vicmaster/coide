/**
 * Shared buffered debug logger for the main process.
 *
 * Previously each module (claude, workflow, workflowTriggers, webhookServer,
 * marketplace) had its own logger; only claude.ts batched writes — the rest did
 * a synchronous-callback `appendFile` plus a `console.log` on every event. This
 * coalesces all writes into one 200ms-batched async append, and gates console
 * output behind dev / COIDE_DEBUG so production isn't doing per-event console I/O.
 */
import { appendFile, writeFile } from 'fs'

export const LOG_PATH = '/tmp/coide-debug.log'
const CONSOLE = process.env.COIDE_DEBUG === '1' || process.env.NODE_ENV !== 'production'

let buffer: string[] = []
let timer: ReturnType<typeof setTimeout> | null = null

function flush(): void {
  timer = null
  if (buffer.length === 0) return
  const batch = buffer.join('\n') + '\n'
  buffer = []
  appendFile(LOG_PATH, batch, () => {})
}

/** Append a line to the debug log (buffered). Console echo only in dev / COIDE_DEBUG. */
export function logLine(msg: string): void {
  buffer.push(`[${new Date().toISOString()}] ${msg}`)
  if (CONSOLE) console.log(msg)
  if (!timer) timer = setTimeout(flush, 200)
}

/** A tagged logger, e.g. createLogger('workflow') prefixes lines with `[workflow]`. */
export function createLogger(tag: string): (msg: string) => void {
  const prefix = `[${tag}] `
  return (msg: string) => logLine(prefix + msg)
}

// Truncate the log once at process start so each launch begins fresh.
writeFile(LOG_PATH, '', () => {})
