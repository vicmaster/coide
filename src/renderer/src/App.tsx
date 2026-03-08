import React, { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from './components/Sidebar'
import Chat from './components/Chat'
import RightPanel from './components/RightPanel'
import TerminalPanel from './components/TerminalPanel'
import SessionSearch from './components/SessionSearch'
import FilePreviewModal from './components/FilePreviewModal'
import SkillEditorModal from './components/SkillEditorModal'
import HookEditorModal from './components/HookEditorModal'
import WelcomeModal from './components/WelcomeModal'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSessionsStore } from './store/sessions'

export default function App(): React.JSX.Element {
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalHeight, setTerminalHeight] = useState(250)
  const resizingRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(250)
  useKeyboardShortcuts()

  useEffect(() => {
    useSessionsStore.persist.rehydrate()
  }, [])

  // Toggle terminal with Ctrl+`
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'j' && e.metaKey && !e.shiftKey) {
        e.preventDefault()
        setTerminalOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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
    <div className="flex h-full w-full overflow-hidden bg-[#0d0d0d]">
      {/* macOS drag region */}
      <div className="drag-region" />

      {/* Left Sidebar */}
      <Sidebar />

      {/* Center: Chat + Terminal */}
      <main className="flex flex-1 flex-col overflow-hidden min-w-0">
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <Chat
            onToggleRightPanel={() => setRightPanelOpen((v) => !v)}
            rightPanelOpen={rightPanelOpen}
            onToggleTerminal={() => setTerminalOpen((v) => !v)}
            terminalOpen={terminalOpen}
          />
        </div>
        {terminalOpen && (
          <>
            {/* Resize handle */}
            <div
              onMouseDown={onResizeStart}
              className="h-[3px] cursor-row-resize hover:bg-blue-500/30 transition-colors"
            />
            <div style={{ height: terminalHeight }} className="min-h-0 flex-shrink-0">
              <TerminalPanel cwd={cwd} />
            </div>
          </>
        )}
      </main>

      {/* Right Panel */}
      {rightPanelOpen && <RightPanel />}

      {/* Session search modal */}
      <SessionSearch />

      {/* File preview modal */}
      <FilePreviewModal />

      {/* Skill editor modal */}
      <SkillEditorModal />

      {/* Hook editor modal */}
      <HookEditorModal />

      {/* Welcome modal — first-run onboarding */}
      <WelcomeModal />
    </div>
  )
}
