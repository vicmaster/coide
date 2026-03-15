import React, { useRef, useEffect } from 'react'

export type HistoryItem = {
  text: string
  timestamp: number
  cwd: string
}

type HistorySearchProps = {
  query: string
  onQueryChange: (q: string) => void
  items: HistoryItem[]
  selectedIndex: number
  onSelect: (item: HistoryItem) => void
  onHover: (index: number) => void
  onClose: () => void
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

function shortenCwd(cwd: string): string {
  return cwd.replace(/^\/Users\/[^/]+/, '~')
}

export default function HistorySearch({
  query,
  onQueryChange,
  items,
  selectedIndex,
  onSelect,
  onHover,
  onClose
}: HistorySearchProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-20">
      <div className="rounded-lg border border-white/[0.08] bg-[#1a1a1a] overflow-hidden shadow-xl">
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/40 flex-shrink-0">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                onHover(items.length > 0 ? (selectedIndex + 1) % items.length : 0)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                onHover(items.length > 0 ? (selectedIndex - 1 + items.length) % items.length : 0)
              } else if (e.key === 'Enter' && items.length > 0) {
                e.preventDefault()
                onSelect(items[selectedIndex])
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              }
            }}
            placeholder="Search past prompts…"
            className="flex-1 bg-transparent text-[13px] text-white/80 placeholder-white/20 outline-none font-mono"
          />
          <span className="text-[10px] text-white/20 font-mono flex-shrink-0">Ctrl+R</span>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[240px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-5 text-center">
              <p className="text-[11px] text-white/25">
                {query ? 'No matching prompts found' : 'Type to search past prompts'}
              </p>
            </div>
          ) : (
            items.map((item, i) => (
              <button
                key={`${item.timestamp}-${i}`}
                onClick={() => onSelect(item)}
                onMouseEnter={() => onHover(i)}
                className={`w-full text-left px-3 py-2 transition-colors ${
                  i === selectedIndex ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                }`}
              >
                <p className={`text-xs font-mono leading-snug line-clamp-2 ${
                  i === selectedIndex ? 'text-white/80' : 'text-white/50'
                }`}>
                  {item.text}
                </p>
                <p className="text-[10px] text-white/25 mt-1 font-mono">
                  {formatRelativeTime(item.timestamp)} · {shortenCwd(item.cwd)}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
