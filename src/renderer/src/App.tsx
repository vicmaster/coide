import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import Chat from './components/Chat'
import RightPanel from './components/RightPanel'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

export default function App(): React.JSX.Element {
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  useKeyboardShortcuts()

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
    </div>
  )
}
