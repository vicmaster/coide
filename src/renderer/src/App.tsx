import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import Sidebar from './components/Sidebar'
import Chat from './components/Chat'
import RightPanel from './components/RightPanel'
import SessionSearch from './components/SessionSearch'
import StatusBar from './components/StatusBar'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useResolvedTheme } from './hooks/useResolvedTheme'
import { useSessionsStore } from './store/sessions'
import { useWorkflowStore } from './store/workflow'
import { useProcessesStore, type BgProcess } from './store/processes'
import { useUiStore } from './store/ui'

// Lazy-load heavy components — BottomPanel (xterm ~6.1 MB), modals with Monaco, WorkflowCanvas with React Flow
const BottomPanel = React.lazy(() => import('./components/BottomPanel'))
const WorkflowCanvas = React.lazy(() => import('./components/WorkflowCanvas'))
const FilePreviewModal = React.lazy(() => import('./components/FilePreviewModal'))
const SkillEditorModal = React.lazy(() => import('./components/SkillEditorModal'))
const HookEditorModal = React.lazy(() => import('./components/HookEditorModal'))
const WelcomeModal = React.lazy(() => import('./components/WelcomeModal'))

export default function App(): React.JSX.Element {
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const terminalOpen = useUiStore((s) => s.bottomPanelOpen)
  const toggleBottomPanel = useUiStore((s) => s.toggleBottomPanel)
  const [terminalHeight, setTerminalHeight] = useState(250)
  const resizingRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(250)
  const isCanvasOpen = useWorkflowStore((s) => s.isCanvasOpen)
  const resolvedTheme = useResolvedTheme()
  useKeyboardShortcuts()

  useEffect(() => {
    useSessionsStore.persist.rehydrate()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  // Subscribe to background-process updates from main
  useEffect(() => {
    const unsub = window.api.processes.onUpdate(({ coideSessionId, processes }) => {
      useProcessesStore.getState().setForSession(coideSessionId, processes as BgProcess[])
    })
    return unsub
  }, [])

  // Toggle bottom panel with Cmd+J
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'j' && e.metaKey && !e.shiftKey) {
        e.preventDefault()
        toggleBottomPanel()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleBottomPanel])

  // Terminal resize drag handling
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    startYRef.current = e.clientY
    startHeightRef.current = terminalHeight

    const onMove = (ev: MouseEvent): void => {
      if (!resizingRef.current) return
      const delta = startYRef.current - ev.clientY
      const newHeight = Math.max(120, Math.min(window.innerHeight - 200, startHeightRef.current + delta))
      setTerminalHeight(newHeight)
    }
    const onUp = (): void => {
      resizingRef.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [terminalHeight])

  const cwd = useSessionsStore((s) => {
    const active = s.sessions.find((sess) => sess.id === s.activeSessionId)
    return active?.cwd ?? ''
  })

  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas">
      {/* macOS drag region */}
      <div className="drag-region" />

      {/* Left Sidebar */}
      <Sidebar />

      {/* Center: Chat/Workflow + Bottom Panel + Status bar */}
      <main className="flex flex-1 flex-col overflow-hidden min-w-0">
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {isCanvasOpen ? (
            <Suspense fallback={<div className="flex items-center justify-center h-full text-fg-faint text-xs">Loading workflow canvas…</div>}>
              <WorkflowCanvas />
            </Suspense>
          ) : (
            <Chat
              onToggleRightPanel={() => setRightPanelOpen((v) => !v)}
              rightPanelOpen={rightPanelOpen}
              onToggleTerminal={toggleBottomPanel}
              terminalOpen={terminalOpen}
            />
          )}
        </div>
        {terminalOpen && (
          <>
            <div
              onMouseDown={onResizeStart}
              className="h-[3px] cursor-row-resize hover:bg-blue-500/30 transition-colors"
            />
            <div style={{ height: terminalHeight }} className="min-h-0 flex-shrink-0">
              <Suspense fallback={<div className="flex items-center justify-center h-full text-fg-faint text-xs">Loading bottom panel…</div>}>
                <BottomPanel cwd={cwd} />
              </Suspense>
            </div>
          </>
        )}
        <StatusBar />
      </main>

      {/* Right Panel */}
      {rightPanelOpen && <RightPanel />}

      {/* Session search modal */}
      <SessionSearch />

      {/* Lazy-loaded modals */}
      <Suspense fallback={null}>
        <FilePreviewModal />
        <SkillEditorModal />
        <HookEditorModal />
        <WelcomeModal />
      </Suspense>
    </div>
  )
}
