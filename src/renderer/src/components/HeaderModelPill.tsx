import React, { useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../store/settings'

const MODELS = ['opus', 'sonnet', 'haiku'] as const
const EFFORT_LEVELS = ['low', 'med', 'high', 'max'] as const

const MODEL_DESCRIPTIONS: Record<string, string> = {
  opus: 'Most capable',
  sonnet: 'Balanced (default)',
  haiku: 'Fastest, lightest'
}

export default function HeaderModelPill(): React.JSX.Element {
  const model = useSettingsStore((s) => s.model)
  const effort = useSettingsStore((s) => s.effort)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Display values: when no override is set, show the defaults so the pill never reads empty.
  const displayModel = model || 'opus'
  const displayEffort = effort
    ? effort === 'medium' ? 'med' : effort
    : 'high'

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-mono transition-colors ${
          open
            ? 'bg-overlay-2 border-line-strong'
            : 'bg-overlay-1 border-line-soft hover:bg-overlay-2'
        }`}
        title="Model & effort"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-fg-faint">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <line x1="9" y1="2" x2="9" y2="4" />
          <line x1="15" y1="2" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="22" />
          <line x1="15" y1="20" x2="15" y2="22" />
          <line x1="20" y1="9" x2="22" y2="9" />
          <line x1="20" y1="14" x2="22" y2="14" />
          <line x1="2" y1="9" x2="4" y2="9" />
          <line x1="2" y1="14" x2="4" y2="14" />
        </svg>
        <span className="text-fg-muted">{displayModel}</span>
        <span className="h-3 w-px bg-line" />
        <span className="text-violet-400">{displayEffort}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-fg-faint transition-transform ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-64 rounded-lg border border-line-strong bg-surface-3 shadow-2xl overflow-hidden">
          <div className="px-3 pt-2.5 pb-1.5 text-[10px] uppercase tracking-wider text-fg-faint font-medium">Model</div>
          <div className="pb-1">
            {MODELS.map((m) => {
              const isActive = (model || 'opus') === m
              return (
                <button
                  key={m}
                  onClick={() => updateSettings({ model: m === 'opus' ? '' : m })}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-[12px] font-mono transition-colors ${
                    isActive ? 'bg-violet-500/15 text-violet-400' : 'text-fg-muted hover:bg-overlay-2'
                  }`}
                >
                  <span>{m}</span>
                  <span className={`text-[10px] font-sans ${isActive ? 'text-violet-400/70' : 'text-fg-faint'}`}>
                    {MODEL_DESCRIPTIONS[m]}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="border-t border-line-soft" />
          <div className="px-3 pt-2.5 pb-1.5 text-[10px] uppercase tracking-wider text-fg-faint font-medium">Effort</div>
          <div className="px-2 pb-2">
            <div className="flex items-center rounded-md border border-line-soft overflow-hidden">
              {EFFORT_LEVELS.map((level) => {
                const value = level === 'med' ? 'medium' : level
                const currentEffort = effort || 'high'
                const isActive = currentEffort === value
                return (
                  <button
                    key={level}
                    onClick={() => updateSettings({ effort: value === 'high' ? '' : value })}
                    className={`flex-1 px-1.5 py-1 text-[11px] font-mono transition-colors ${
                      isActive ? 'bg-violet-500/20 text-violet-400 font-medium' : 'text-fg-faint hover:text-fg-muted hover:bg-overlay-1'
                    }`}
                  >
                    {level}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="border-t border-line-soft px-3 py-1.5 text-[10px] text-fg-faint">
            Defaults: opus · high. Click again to reset.
          </div>
        </div>
      )}
    </div>
  )
}
