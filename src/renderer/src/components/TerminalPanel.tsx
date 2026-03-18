import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface TerminalTab {
  id: string
  title: string
}

export default function TerminalPanel({ cwd }: { cwd: string }): React.JSX.Element {
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalsRef = useRef<Map<string, { term: Terminal; fitAddon: FitAddon }>>(new Map())
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  // Create a new terminal tab
  const createTab = useCallback(() => {
    const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const title = `Terminal ${tabs.length + 1}`
    setTabs((prev) => [...prev, { id, title }])
    setActiveTabId(id)
    return id
  }, [tabs.length])

  // Close a terminal tab
  const closeTab = useCallback((id: string) => {
    const entry = terminalsRef.current.get(id)
    if (entry) {
      entry.term.dispose()
      terminalsRef.current.delete(id)
    }
    window.api.terminal.kill(id)
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (activeTabId === id) {
        setActiveTabId(next.length > 0 ? next[next.length - 1].id : null)
      }
      return next
    })
  }, [activeTabId])

  // Initialize terminal when active tab changes
  useEffect(() => {
    if (!activeTabId || !containerRef.current || !cwd) return

    // Hide all terminals, show active
    for (const [id, entry] of terminalsRef.current) {
      const el = entry.term.element?.parentElement
      if (el) el.style.display = id === activeTabId ? '' : 'none'
    }

    // If terminal already exists for this tab, just fit it
    if (terminalsRef.current.has(activeTabId)) {
      const entry = terminalsRef.current.get(activeTabId)!
      setTimeout(() => entry.fitAddon.fit(), 0)
      return
    }

    // Create new xterm instance
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      theme: {
        background: '#0d0d0d',
        foreground: '#e5e5e5',
        cursor: '#e5e5e5',
        selectionBackground: 'rgba(255, 255, 255, 0.15)',
        black: '#1a1a1a',
        red: '#ff6b6b',
        green: '#69db7c',
        yellow: '#ffd43b',
        blue: '#74c0fc',
        magenta: '#da77f2',
        cyan: '#66d9e8',
        white: '#e5e5e5',
        brightBlack: '#555555',
        brightRed: '#ff8787',
        brightGreen: '#8ce99a',
        brightYellow: '#ffe066',
        brightBlue: '#91d5ff',
        brightMagenta: '#e599f7',
        brightCyan: '#99e9f2',
        brightWhite: '#ffffff'
      },
      allowTransparency: true,
      scrollback: 5000
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)

    // Create a wrapper div for this terminal
    const wrapper = document.createElement('div')
    wrapper.style.width = '100%'
    wrapper.style.height = '100%'
    containerRef.current.appendChild(wrapper)

    term.open(wrapper)
    fitAddon.fit()

    terminalsRef.current.set(activeTabId, { term, fitAddon })

    // Spawn PTY in main process
    const termId = activeTabId
    window.api.terminal.spawn(termId, cwd)

    // Pipe terminal input to PTY
    term.onData((data) => {
      window.api.terminal.write(termId, data)
    })

    // Resize PTY when terminal resizes
    term.onResize(({ cols, rows }) => {
      window.api.terminal.resize(termId, cols, rows)
    })

    // Initial resize to match actual size
    setTimeout(() => {
      fitAddon.fit()
      window.api.terminal.resize(termId, term.cols, term.rows)
    }, 50)
  }, [activeTabId, cwd])

  // Listen for PTY data and exit events
  useEffect(() => {
    const unsubData = window.api.terminal.onData(({ id, data }) => {
      const entry = terminalsRef.current.get(id)
      if (entry) entry.term.write(data)
    })

    const unsubExit = window.api.terminal.onExit(({ id }) => {
      const entry = terminalsRef.current.get(id)
      if (entry) {
        entry.term.writeln('\r\n\x1b[90m[Process exited]\x1b[0m')
      }
    })

    return () => {
      unsubData()
      unsubExit()
    }
  }, [])

  // Handle resize with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return
    resizeObserverRef.current = new ResizeObserver(() => {
      if (activeTabId) {
        const entry = terminalsRef.current.get(activeTabId)
        if (entry) {
          try { entry.fitAddon.fit() } catch { /* ignore */ }
        }
      }
    })
    resizeObserverRef.current.observe(containerRef.current)
    return () => resizeObserverRef.current?.disconnect()
  }, [activeTabId])

  // Auto-create first tab on mount (ref guard prevents double-fire in strict mode)
  const didInitRef = useRef(false)
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    createTab()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup all terminals on unmount
  useEffect(() => {
    return () => {
      for (const [id, entry] of terminalsRef.current) {
        entry.term.dispose()
        window.api.terminal.kill(id)
      }
      terminalsRef.current.clear()
    }
  }, [])

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] border-t border-white/[0.06]">
      {/* Tab bar */}
      <div className="flex items-center gap-0 px-2 h-8 min-h-[32px] bg-[#0a0a0a] border-b border-white/[0.06]">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center gap-1.5 px-3 py-1 text-[11px] cursor-pointer rounded-t transition-colors ${
              tab.id === activeTabId
                ? 'text-white/70 bg-[#0d0d0d]'
                : 'text-white/30 hover:text-white/50'
            }`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            <span>{tab.title}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                className="text-white/20 hover:text-white/60 ml-1"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        ))}
        <button
          onClick={createTab}
          className="text-white/20 hover:text-white/50 px-2 py-1 text-[13px] transition-colors"
          title="New terminal"
        >
          +
        </button>
      </div>

      {/* Terminal container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 px-1 py-1"
        style={{ position: 'relative' }}
      />
    </div>
  )
}
