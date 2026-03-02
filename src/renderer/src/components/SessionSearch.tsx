import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useSessionsStore, type Session, type TextMessage } from '../store/sessions'

type SearchResult = {
  session: Session
  matchSource: 'title' | 'message'
  snippet: string
  matchIndex: number // char index of match within snippet (for highlighting)
  matchLength: number
}

function searchSessions(sessions: Session[], query: string): SearchResult[] {
  const q = query.toLowerCase()
  const results: SearchResult[] = []

  for (const session of sessions) {
    // Check title
    if (session.title.toLowerCase().includes(q)) {
      const idx = session.title.toLowerCase().indexOf(q)
      results.push({
        session,
        matchSource: 'title',
        snippet: session.title,
        matchIndex: idx,
        matchLength: q.length
      })
      continue
    }

    // Check message text
    for (const msg of session.messages) {
      if (msg.role === 'tool_call') continue
      const text = (msg as TextMessage).text
      if (!text) continue
      const lowerText = text.toLowerCase()
      if (lowerText.includes(q)) {
        const idx = lowerText.indexOf(q)
        const start = Math.max(0, idx - 30)
        const end = Math.min(text.length, idx + q.length + 50)
        const prefix = start > 0 ? '...' : ''
        const suffix = end < text.length ? '...' : ''
        const raw = text.slice(start, end).replace(/\n/g, ' ')
        const snippet = prefix + raw + suffix
        const matchIndex = prefix.length + (idx - start)
        results.push({
          session,
          matchSource: 'message',
          snippet,
          matchIndex,
          matchLength: q.length
        })
        break
      }
    }
  }

  return results
}

function relativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return new Date(timestamp).toLocaleDateString()
}

function HighlightedText({ text, matchIndex, matchLength }: { text: string; matchIndex: number; matchLength: number }): React.JSX.Element {
  if (matchLength === 0 || matchIndex < 0) return <>{text}</>
  const before = text.slice(0, matchIndex)
  const match = text.slice(matchIndex, matchIndex + matchLength)
  const after = text.slice(matchIndex + matchLength)
  return (
    <>
      {before}
      <span className="text-blue-400 font-medium">{match}</span>
      {after}
    </>
  )
}

export default function SessionSearch(): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const sessions = useSessionsStore((s) => s.sessions)
  const setActiveSession = useSessionsStore((s) => s.setActiveSession)

  // Listen for toggle event
  useEffect(() => {
    const handler = (): void => {
      setOpen((prev) => {
        if (!prev) {
          // Opening — reset state
          setQuery('')
          setDebouncedQuery('')
          setSelectedIndex(0)
        }
        return !prev
      })
    }
    window.addEventListener('coide:toggle-search', handler)
    return () => window.removeEventListener('coide:toggle-search', handler)
  }, [])

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150)
    return () => clearTimeout(timer)
  }, [query])

  // Search
  const results = useMemo(() => {
    if (!debouncedQuery.trim()) {
      // Show all sessions when no query
      return sessions.map((session) => ({
        session,
        matchSource: 'title' as const,
        snippet: session.title,
        matchIndex: -1,
        matchLength: 0
      }))
    }
    return searchSessions(sessions, debouncedQuery.trim())
  }, [sessions, debouncedQuery])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const selectResult = useCallback(
    (result: SearchResult) => {
      setActiveSession(result.session.id)
      setOpen(false)
    },
    [setActiveSession]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % Math.max(results.length, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + results.length) % Math.max(results.length, 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (results[selectedIndex]) selectResult(results[selectedIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    },
    [results, selectedIndex, selectResult]
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-white/[0.1] bg-[#1a1a1a] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.08]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30 shrink-0">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions..."
            className="flex-1 bg-transparent text-sm text-white/90 placeholder-white/25 outline-none"
          />
          <kbd className="text-[10px] text-white/20 border border-white/[0.08] rounded px-1.5 py-0.5 font-mono">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-1">
              <p className="text-sm text-white/25">No sessions found</p>
              <p className="text-xs text-white/15">Try a different search term</p>
            </div>
          ) : (
            results.map((result, i) => (
              <button
                key={result.session.id}
                onClick={() => selectResult(result)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  i === selectedIndex
                    ? 'bg-white/[0.08]'
                    : 'hover:bg-white/[0.04]'
                } ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-white/80 truncate">
                    {result.matchSource === 'title' && debouncedQuery.trim() ? (
                      <HighlightedText text={result.snippet} matchIndex={result.matchIndex} matchLength={result.matchLength} />
                    ) : (
                      result.session.title
                    )}
                  </p>
                  <span className="text-[10px] text-white/20 shrink-0">
                    {relativeTime(result.session.createdAt)}
                  </span>
                </div>
                <p className="text-[10px] text-white/25 mt-0.5 font-mono">
                  {result.session.cwd.split('/').pop()}
                </p>
                {result.matchSource === 'message' && (
                  <p className="text-[11px] text-white/35 mt-1.5 leading-relaxed truncate">
                    &ldquo;<HighlightedText text={result.snippet} matchIndex={result.matchIndex} matchLength={result.matchLength} />&rdquo;
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
