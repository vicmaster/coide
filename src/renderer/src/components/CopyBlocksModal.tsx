import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { useSessionsStore, type TextMessage } from '../store/sessions'

type ExtractedBlock = {
  index: number
  lang: string
  code: string
  preview: string
}

const CODE_BLOCK_RE = /^```(\w*)\n([\s\S]*?)^```/gm

function extractCodeBlocks(messages: ReturnType<typeof useSessionsStore.getState>['sessions'][0]['messages']): ExtractedBlock[] {
  const blocks: ExtractedBlock[] = []
  let blockIndex = 0
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    const text = (msg as TextMessage).text
    if (!text) continue
    CODE_BLOCK_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = CODE_BLOCK_RE.exec(text)) !== null) {
      const lang = m[1] || 'text'
      const code = m[2].trimEnd()
      const preview = code.split('\n').slice(0, 2).join('\n')
      blocks.push({ index: ++blockIndex, lang, code, preview })
    }
  }
  return blocks
}

export default function CopyBlocksModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const messages = useSessionsStore((s) => {
    const session = s.sessions.find((sess) => sess.id === s.activeSessionId)
    return session?.messages ?? []
  })
  const blocks = useMemo(() => extractCodeBlocks(messages), [messages])
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const handleCopy = (block: ExtractedBlock): void => {
    navigator.clipboard.writeText(block.code)
    setCopiedIndex(block.index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

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
      <div className="w-full max-w-2xl max-h-[70vh] flex flex-col rounded-2xl bg-[#141414] border border-white/[0.1] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white/90">Code Blocks</h2>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/60 transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        {blocks.length === 0 ? (
          <div className="p-8 text-center text-white/30 text-sm">No code blocks found in this session.</div>
        ) : (
          <div className="overflow-y-auto flex-1 divide-y divide-white/[0.04]">
            {blocks.map((block) => (
              <div key={block.index} className="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors">
                <span className="mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wide bg-white/[0.07] text-white/40 min-w-[42px] text-center">
                  {block.lang}
                </span>
                <pre className="flex-1 font-mono text-[11px] text-white/50 whitespace-pre-wrap leading-relaxed overflow-hidden" style={{ maxHeight: '2.6rem' }}>
                  {block.preview}
                </pre>
                <button
                  onClick={() => handleCopy(block)}
                  className={`flex-shrink-0 rounded px-2.5 py-1 text-[11px] font-medium border transition-colors mt-0.5 ${
                    copiedIndex === block.index
                      ? 'border-green-500/30 text-green-400/80 bg-green-500/10'
                      : 'border-white/[0.09] text-white/40 hover:text-white/80 hover:border-white/20'
                  }`}
                >
                  {copiedIndex === block.index ? 'Copied!' : 'Copy'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
