import React, { useState, useEffect, useRef, useCallback } from 'react'
import { BUILT_IN_COMMANDS } from '../data/commands'

export type AutocompleteItem = {
  name: string
  description: string
  type: 'skill' | 'command'
}

/** Build the filtered autocomplete items list */
export function useSlashItems(query: string, cwd: string): AutocompleteItem[] {
  const [skills, setSkills] = useState<SkillInfo[]>([])

  const refresh = useCallback((): void => {
    window.api.skills.list(cwd).then((result) => {
      setSkills([...result.project, ...result.global])
    })
  }, [cwd])

  // Re-fetch skills each time the autocomplete opens (query becomes non-empty)
  // so newly created skills appear without needing a restart
  useEffect(() => {
    if (query) refresh()
  }, [query !== '', refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh()
    window.addEventListener('coide:skills-changed', refresh)
    return () => window.removeEventListener('coide:skills-changed', refresh)
  }, [refresh])

  const q = query.toLowerCase()

  const skillItems: AutocompleteItem[] = skills
    .filter((s) => s.name.toLowerCase().includes(q))
    .map((s) => ({ name: s.name, description: s.description, type: 'skill' as const }))

  const commandItems: AutocompleteItem[] = BUILT_IN_COMMANDS
    .filter((c) => c.name.slice(1).toLowerCase().includes(q))
    .map((c) => ({ name: c.name.slice(1), description: c.description, type: 'command' as const }))

  return [...skillItems, ...commandItems]
}

type Props = {
  items: AutocompleteItem[]
  selectedIndex: number
  onSelect: (item: AutocompleteItem) => void
  onHover: (index: number) => void
}

export default function SlashAutocomplete({ items, selectedIndex, onSelect, onHover }: Props): React.JSX.Element | null {
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll selected item into view
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
            key={`${item.type}-${item.name}`}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(item)
            }}
            onMouseEnter={() => onHover(i)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
              i === selectedIndex ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
            }`}
          >
            <span className="text-xs text-white/80 font-medium flex-shrink-0">/{item.name}</span>
            <span
              className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${
                item.type === 'skill'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-white/[0.06] text-white/25'
              }`}
            >
              {item.type === 'skill' ? 'skill' : 'cmd'}
            </span>
            <span className="text-[11px] text-white/30 truncate">{item.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
