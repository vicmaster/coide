import { useEffect } from 'react'

const MARK_CLASS = 'coide-search-highlight'
const ACTIVE_CLASS = 'coide-search-highlight-active'

function clearMarks(container: HTMLElement): void {
  const marks = container.querySelectorAll(`mark.${MARK_CLASS}`)
  marks.forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark)
    parent.normalize()
  })
}

export function useHighlightMatches(
  messagesRef: React.RefObject<HTMLDivElement | null>,
  query: string,
  activeMatchIndex: number
): void {
  useEffect(() => {
    const container = messagesRef.current
    if (!container) return

    clearMarks(container)
    if (!query.trim()) return

    const q = query.toLowerCase()
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    const textNodes: Text[] = []

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as Text)
    }

    let globalMatchIdx = 0

    for (const node of textNodes) {
      const text = node.textContent ?? ''
      const lower = text.toLowerCase()
      const indices: number[] = []
      let searchFrom = 0
      while (true) {
        const idx = lower.indexOf(q, searchFrom)
        if (idx === -1) break
        indices.push(idx)
        searchFrom = idx + 1
      }

      if (indices.length === 0) continue

      // Split text node and wrap matches
      const frag = document.createDocumentFragment()
      let lastEnd = 0

      for (const idx of indices) {
        if (idx > lastEnd) {
          frag.appendChild(document.createTextNode(text.slice(lastEnd, idx)))
        }
        const mark = document.createElement('mark')
        mark.className = globalMatchIdx === activeMatchIndex
          ? `${MARK_CLASS} ${ACTIVE_CLASS}`
          : MARK_CLASS
        mark.textContent = text.slice(idx, idx + q.length)
        frag.appendChild(mark)
        lastEnd = idx + q.length
        globalMatchIdx++
      }

      if (lastEnd < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastEnd)))
      }

      node.parentNode?.replaceChild(frag, node)
    }

    // Scroll active mark into view
    const activeMark = container.querySelector(`mark.${ACTIVE_CLASS}`)
    if (activeMark) {
      activeMark.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }

    return () => {
      clearMarks(container)
    }
  }, [messagesRef, query, activeMatchIndex])
}
