import React, { useEffect, useCallback } from 'react'
import { RELEASE_NOTES } from '../data/releaseNotes'

export default function ReleaseNotesModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-md max-h-[75vh] flex flex-col rounded-2xl bg-[#141414] border border-white/[0.1] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white/90">Release Notes</h2>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/60 transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {RELEASE_NOTES.map((release, i) => (
            <div key={release.version}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm font-semibold font-mono ${i === 0 ? 'text-blue-400' : 'text-white/70'}`}>
                  v{release.version}
                </span>
                {i === 0 && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                    latest
                  </span>
                )}
                <span className="text-[10px] text-white/25 font-mono">{release.date}</span>
              </div>
              <ul className="space-y-1">
                {release.notes.map((note, j) => (
                  <li key={j} className="flex items-start gap-2 text-[11px] text-white/50">
                    <span className="text-white/20 mt-0.5 flex-shrink-0">-</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
              {i < RELEASE_NOTES.length - 1 && (
                <div className="border-t border-white/[0.04] mt-4" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
