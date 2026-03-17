import React, { useState, useEffect, useRef, useCallback } from 'react'

export type MentionItem = {
  path: string
  type: 'file' | 'folder' | 'url'
}

export function useAtMentionItems(query: string | null, cwd: string): MentionItem[] {
  const [items, setItems] = useState<MentionItem[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (query === null || query.length === 0) {
      setItems([])
      return
    }

    // Check if it looks like a URL
    if (/^https?:\/\//i.test(query)) {
      setItems([{ path: query, type: 'url' }])
      return
    }

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      window.api.fs.listFiles(cwd, query).then((results) => {
        setItems(results.map((r) => ({ path: r.path, type: r.type })))
      })
    }, 80)

    return () => clearTimeout(debounceRef.current)
  }, [query, cwd])

  return items
}

type Props = {
  items: MentionItem[]
  selectedIndex: number
  onSelect: (item: MentionItem) => void
  onHover: (index: number) => void
  anchorLeft: number
}

const TYPE_STYLES = {
  file: 'bg-blue-500/20 text-blue-400',
  folder: 'bg-purple-500/20 text-purple-400',
  url: 'bg-green-500/20 text-green-400'
}

export default function AtMentionAutocomplete({
  items,
  selectedIndex,
  onSelect,
  onHover,
  anchorLeft
}: Props): React.JSX.Element | null {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (items.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50">
      <div
        ref={listRef}
        className="mx-3 rounded-lg border border-white/[0.1] bg-[#1a1a1a] shadow-xl overflow-y-auto"
        style={{ maxHeight: '320px' }}
      >
        {items.map((item, i) => (
          <button
            key={`${item.type}-${item.path}`}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(item)
            }}
            onMouseEnter={() => onHover(i)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
              i === selectedIndex ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
            }`}
          >
            <span className="text-xs text-white/80 font-mono truncate flex-1">{item.path}</span>
            <span
              className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${TYPE_STYLES[item.type]}`}
            >
              {item.type}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
