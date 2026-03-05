import React, { useState } from 'react'
import { useSettingsStore } from '../store/settings'
import { useSessionsStore } from '../store/sessions'

export default function WelcomeModal(): React.JSX.Element | null {
  const defaultCwd = useSettingsStore((s) => s.defaultCwd)
  const sessions = useSessionsStore((s) => s.sessions)
  const [picking, setPicking] = useState(false)

  const shouldShow = !defaultCwd && sessions.length === 0

  if (!shouldShow) return null

  const handleChooseFolder = async (): Promise<void> => {
    setPicking(true)
    const folder = await window.api.dialog.pickFolder()
    setPicking(false)
    if (!folder) return
    useSettingsStore.getState().updateSettings({ defaultCwd: folder })
    localStorage.setItem('cwd', folder)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.1] bg-[#141414] p-6 shadow-2xl text-center">
        <h2 className="text-lg font-semibold text-white/90 mb-1">Welcome to coide</h2>
        <p className="text-xs text-white/40 mb-6">
          Pick your default projects folder to get started.
        </p>
        <button
          onClick={handleChooseFolder}
          disabled={picking}
          className="rounded-lg bg-blue-600/90 hover:bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
        >
          {picking ? 'Choosing...' : 'Choose Folder'}
        </button>
      </div>
    </div>
  )
}
