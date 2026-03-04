import React, { useRef, useEffect } from 'react'

interface Props {
  query: string
  onQueryChange: (q: string) => void
  matchCount: number
  activeIndex: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

export default function InSessionSearchBar({
  query,
  onQueryChange,
  matchCount,
  activeIndex,
  onNext,
  onPrev,
  onClose
}: Props): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.nativeEvent.stopImmediatePropagation()
      onClose()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) onPrev()
      else onNext()
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#1a1a1a] px-4 py-1.5">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30 flex-shrink-0">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in conversation…"
        className="flex-1 bg-transparent text-xs text-white/80 placeholder-white/25 outline-none"
      />
      {query && (
        <span className="text-[11px] text-white/30 font-mono tabular-nums flex-shrink-0">
          {matchCount > 0 ? `${activeIndex + 1} of ${matchCount}` : 'No results'}
        </span>
      )}
      <div className="flex items-center gap-0.5">
        <button
          onClick={onPrev}
          disabled={matchCount === 0}
          className="rounded p-0.5 text-white/30 hover:text-white/60 disabled:opacity-25 transition-colors"
          title="Previous (Shift+Enter)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          onClick={onNext}
          disabled={matchCount === 0}
          className="rounded p-0.5 text-white/30 hover:text-white/60 disabled:opacity-25 transition-colors"
          title="Next (Enter)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
      <button
        onClick={onClose}
        className="rounded p-0.5 text-white/30 hover:text-white/60 transition-colors"
        title="Close (Esc)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
