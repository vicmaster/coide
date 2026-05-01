import React, { useCallback, useEffect, useRef, useState } from 'react'
import TerminalPanel, { type TerminalTab } from './TerminalPanel'
import ProcessesView from './ProcessesView'
import { useUiStore } from '../store/ui'

const PROCESSES_TAB_ID = '__processes__'

export default function BottomPanel({ cwd }: { cwd: string }): React.JSX.Element {
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string>(PROCESSES_TAB_ID)

  const createTerminal = useCallback(() => {
    const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setTabs((prev) => {
      const next = [...prev, { id, title: `Terminal ${prev.length + 1}` }]
      return next
    })
    setActiveTabId(id)
  }, [])

  const closeTerminal = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      setActiveTabId((curr) => {
        if (curr !== id) return curr
        return next.length > 0 ? next[next.length - 1].id : PROCESSES_TAB_ID
      })
      return next
    })
  }, [])

  // Auto-create the first terminal on mount and focus it. Strict-mode guard
  // prevents double-fire in dev.
  const didInitRef = useRef(false)
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setTabs([{ id, title: 'Terminal 1' }])
    // Only land on Terminal if no external request has set us to Processes already.
    setActiveTabId((curr) => (curr === PROCESSES_TAB_ID && useUiStore.getState().bottomPanelFocusNonce === 0 ? id : curr))
  }, [])

  // Switch to Processes tab when an external trigger (status bar chip, /tasks) requests focus.
  const focusNonce = useUiStore((s) => s.bottomPanelFocusNonce)
  useEffect(() => {
    if (focusNonce > 0) setActiveTabId(PROCESSES_TAB_ID)
  }, [focusNonce])

  const showingProcesses = activeTabId === PROCESSES_TAB_ID

  return (
    <div className="flex flex-col h-full bg-canvas border-t border-line-soft">
      {/* Tab bar */}
      <div className="flex items-center gap-0 px-2 h-8 min-h-[32px] bg-surface-1 border-b border-line-soft">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              className={`flex items-center gap-1.5 px-3 py-1 text-[11px] cursor-pointer rounded-t transition-colors ${
                active ? 'text-fg-muted bg-canvas' : 'text-fg-subtle hover:text-fg-muted'
              }`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
              <span>{tab.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); closeTerminal(tab.id) }}
                className="text-fg-faint hover:text-fg-muted ml-1"
                title="Close terminal"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )
        })}
        <button
          onClick={createTerminal}
          className="text-fg-faint hover:text-fg-muted px-2 py-1 text-[13px] transition-colors"
          title="New terminal"
        >
          +
        </button>
        <div className="flex-1" />
        <div
          className={`flex items-center gap-1.5 px-3 py-1 text-[11px] cursor-pointer rounded-t transition-colors ${
            showingProcesses ? 'text-fg-muted bg-canvas' : 'text-fg-subtle hover:text-fg-muted'
          }`}
          onClick={() => setActiveTabId(PROCESSES_TAB_ID)}
          title="Background processes"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v6m0 10v6m11-11h-6m-10 0H1" />
          </svg>
          <span>Processes</span>
        </div>
      </div>

      {/* Terminal view — kept mounted to preserve xterm state when toggling tabs */}
      <div className={`${showingProcesses ? 'hidden' : 'flex flex-1 min-h-0'}`}>
        <TerminalPanel
          cwd={cwd}
          tabs={tabs}
          activeTabId={showingProcesses ? null : activeTabId}
          visible={!showingProcesses}
          onTabsChange={setTabs}
        />
      </div>

      {/* Processes view */}
      {showingProcesses && <ProcessesView />}
    </div>
  )
}
