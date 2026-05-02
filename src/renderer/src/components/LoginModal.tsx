import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

type LoginStatus = 'idle' | 'running' | 'success' | 'failed' | 'cancelled'

// Heuristic — `claude /login` prints "Login successful" on success
function detectSuccess(buffer: string): boolean {
  return /login successful|logged in|authentication successful/i.test(buffer)
}

export default function LoginModal(): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<LoginStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const bufferRef = useRef<string>('')
  const dataUnsubRef = useRef<(() => void) | null>(null)
  const exitUnsubRef = useRef<(() => void) | null>(null)
  const successDetectedRef = useRef(false)

  // Listen for global trigger
  useEffect(() => {
    const handler = (): void => {
      setOpen(true)
      setStatus('running')
      setErrorMsg(null)
      bufferRef.current = ''
      successDetectedRef.current = false
      window.api.login.start().then((res) => {
        if (res.error) {
          setErrorMsg(res.error)
          setStatus('failed')
        }
      })
    }
    window.addEventListener('coide:open-login', handler)
    return () => window.removeEventListener('coide:open-login', handler)
  }, [])

  // Mount the terminal once the container is in the DOM
  useEffect(() => {
    if (!open || !containerRef.current || termRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      theme: {
        background: '#0d0d0d',
        foreground: '#e5e5e5',
        cursor: '#e5e5e5'
      },
      allowTransparency: true,
      scrollback: 2000,
      convertEol: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fit.fit()
    // Push the post-fit size to the PTY (start was spawned with default 100×30)
    setTimeout(() => {
      try {
        fit.fit()
        window.api.login.resize(term.cols, term.rows)
      } catch { /* ignore */ }
    }, 50)

    // Forward terminal keystrokes to the PTY
    term.onData((data) => {
      window.api.login.input(data)
    })

    term.onResize(({ cols, rows }) => {
      window.api.login.resize(cols, rows)
    })

    termRef.current = term
    fitRef.current = fit

    // Subscribe to PTY data + exit
    dataUnsubRef.current = window.api.login.onData(({ data }) => {
      bufferRef.current += data
      term.write(data)
      if (!successDetectedRef.current && detectSuccess(bufferRef.current)) {
        successDetectedRef.current = true
      }
    })
    exitUnsubRef.current = window.api.login.onExit(({ exitCode }) => {
      const success = exitCode === 0 && successDetectedRef.current
      setStatus(success ? 'success' : 'failed')
      if (success) {
        window.dispatchEvent(new CustomEvent('coide:login-success'))
        setTimeout(() => setOpen(false), 1500)
      }
    })

    // Resize on container size changes
    const ro = new ResizeObserver(() => {
      try { fit.fit() } catch { /* ignore */ }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
    }
  }, [open])

  // Tear down terminal + listeners when modal closes
  useEffect(() => {
    if (open) return
    dataUnsubRef.current?.()
    exitUnsubRef.current?.()
    dataUnsubRef.current = null
    exitUnsubRef.current = null
    termRef.current?.dispose()
    termRef.current = null
    fitRef.current = null
  }, [open])

  if (!open) return null

  const handleCancel = (): void => {
    if (status === 'running') {
      window.api.login.cancel()
      setStatus('cancelled')
    }
    setOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-2xl rounded-2xl border border-line-strong bg-surface-3 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <div>
            <h2 className="text-[14px] font-semibold text-fg-strong">Sign in to Claude</h2>
            <p className="text-[11px] text-fg-subtle mt-0.5">
              {status === 'running' && 'claude /login — type or paste directly into the terminal'}
              {status === 'success' && 'Logged in. Resuming your task…'}
              {status === 'failed' && (errorMsg ?? 'Login did not complete.')}
              {status === 'cancelled' && 'Cancelled.'}
              {status === 'idle' && 'Starting…'}
            </p>
          </div>
          <button
            onClick={handleCancel}
            className="text-[11px] text-fg-subtle hover:text-fg-muted px-2 py-1 rounded"
          >
            {status === 'running' ? 'Cancel' : 'Close'}
          </button>
        </div>

        <div className="p-3 bg-[#0d0d0d]">
          <div ref={containerRef} className="h-80 w-full" />
        </div>

        <div className="px-5 py-2.5 border-t border-line">
          <p className="text-[10px] text-fg-faint">
            Click the auth URL to open it in your browser, then paste the code back into the terminal above.
          </p>
        </div>
      </div>
    </div>
  )
}
