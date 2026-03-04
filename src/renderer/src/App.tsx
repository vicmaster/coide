import React, { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Chat from './components/Chat'
import RightPanel from './components/RightPanel'
import SessionSearch from './components/SessionSearch'
import FilePreviewModal from './components/FilePreviewModal'
import SkillEditorModal from './components/SkillEditorModal'
import HookEditorModal from './components/HookEditorModal'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSessionsStore } from './store/sessions'

export default function App(): React.JSX.Element {
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  useKeyboardShortcuts()

  useEffect(() => {
    useSessionsStore.persist.rehydrate()
  }, [])

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#0d0d0d]">
      {/* macOS drag region */}
      <div className="drag-region" />

      {/* Left Sidebar */}
      <Sidebar />

      {/* Center: Chat */}
      <main className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Chat onToggleRightPanel={() => setRightPanelOpen((v) => !v)} rightPanelOpen={rightPanelOpen} />
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
    </div>
  )
}
