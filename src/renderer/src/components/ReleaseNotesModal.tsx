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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-md max-h-[75vh] flex flex-col rounded-2xl bg-surface-3 border border-line-strong shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-line-soft">
          <h2 className="text-sm font-semibold text-fg-strong">Release Notes</h2>
          <button
            onClick={onClose}
            className="text-fg-subtle hover:text-fg-muted transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body — hide the 'next' sentinel; only released versions are shown to users */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {RELEASE_NOTES.filter((r) => r.version !== 'next').map((release, i, arr) => (
            <div key={release.version}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm font-semibold font-mono ${i === 0 ? 'text-blue-400' : 'text-fg-muted'}`}>
                  v{release.version}
                </span>
                {i === 0 && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                    latest
                  </span>
                )}
                <span className="text-[10px] text-fg-faint font-mono">{release.date}</span>
              </div>
              <ul className="space-y-1">
                {release.notes.map((note, j) => (
                  <li key={j} className="flex items-start gap-2 text-[11px] text-fg-muted">
                    <span className="text-fg-faint mt-0.5 flex-shrink-0">-</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
              {i < arr.length - 1 && (
                <div className="border-t border-line-soft mt-4" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
