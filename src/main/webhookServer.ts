import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { URL } from 'url'
import { appendFile } from 'fs'
import { fireWebhook } from './workflowTriggers'

function wLog(msg: string): void {
  const line = `[${new Date().toISOString()}] [webhook-server] ${msg}\n`
  console.log(line.trim())
  appendFile('/tmp/coide-debug.log', line, () => {})
}

let server: Server | null = null
let listeningPort: number | null = null

const MAX_BODY_BYTES = 64 * 1024 // 64KB — enough for a small JSON payload

function readJsonBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    if (req.method !== 'POST') {
      resolve({})
      return
    }
    let total = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        req.destroy()
        reject(new Error('Body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8').trim()
      if (!raw) {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Coerce all values to strings
          const out: Record<string, string> = {}
          for (const [k, v] of Object.entries(parsed)) {
            out[k] = typeof v === 'string' ? v : JSON.stringify(v)
          }
          resolve(out)
        } else {
          resolve({})
        }
      } catch {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${listeningPort}`)
    if (url.pathname === '/health') {
      send(res, 200, { ok: true })
      return
    }
    // /webhook/:workflowId/:triggerId
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'webhook' || parts.length !== 3) {
      send(res, 404, { error: 'Not found' })
      return
    }
    const [, workflowId, triggerId] = parts
    const token = url.searchParams.get('token') ?? ''
    if (!token) {
      send(res, 401, { error: 'Missing token' })
      return
    }
    const bodyInputs = await readJsonBody(req)
    const result = fireWebhook(workflowId, triggerId, token, bodyInputs)
    if (!result.ok) {
      send(res, 401, { error: result.error ?? 'Unauthorized' })
      return
    }
    send(res, 202, { accepted: true })
  } catch (err) {
    wLog(`request error: ${err}`)
    send(res, 500, { error: 'Server error' })
  }
}

export function startWebhookServer(preferredPort = 8787): Promise<number | null> {
  return new Promise((resolve) => {
    const tryPort = (port: number, attemptsLeft: number): void => {
      const s = createServer((req, res) => {
        handleRequest(req, res)
      })
      s.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
          tryPort(port + 1, attemptsLeft - 1)
        } else {
          wLog(`Failed to bind webhook server: ${err.message}`)
          resolve(null)
        }
      })
      // 127.0.0.1 only — never expose to the network
      s.listen(port, '127.0.0.1', () => {
        server = s
        listeningPort = port
        wLog(`Listening on http://127.0.0.1:${port}`)
        resolve(port)
      })
    }
    tryPort(preferredPort, 10)
  })
}

export function getWebhookPort(): number | null {
  return listeningPort
}

export function stopWebhookServer(): void {
  if (server) {
    server.close(() => { /* noop */ })
    server = null
    listeningPort = null
  }
}
