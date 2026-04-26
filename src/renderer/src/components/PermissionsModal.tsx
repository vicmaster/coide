import React, { useCallback, useEffect } from 'react'
import { useSettingsStore } from '../store/settings'

const MANAGEABLE_TOOLS: { name: string; description: string }[] = [
  { name: 'Bash', description: 'Run shell commands' },
  { name: 'Edit', description: 'Modify existing files' },
  { name: 'Write', description: 'Create or overwrite files' },
  { name: 'ExitPlanMode', description: 'Exit plan mode and execute' }
]

export default function PermissionsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const skipPermissions = useSettingsStore((s) => s.skipPermissions)
  const autoApproveTools = useSettingsStore((s) => s.autoApproveTools)
  const update = useSettingsStore((s) => s.updateSettings)

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

  const toggleTool = (name: string): void => {
    const set = new Set(autoApproveTools)
    if (set.has(name)) set.delete(name)
    else set.add(name)
    update({ autoApproveTools: Array.from(set) })
  }

  const clearAll = (): void => update({ autoApproveTools: [] })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-md rounded-2xl bg-[#141414] border border-white/[0.1] p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-white/90">Permissions</h2>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/60 transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>
        <p className="text-[11px] text-white/40 mb-5 leading-relaxed">
          Choose which tools auto-approve without asking. You can also click <span className="text-white/60">Always allow</span> on any prompt to add it here.
        </p>

        <div className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-3 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-white/80 font-medium">Skip all prompts</p>
              <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">
                Auto-approve every tool. Overrides the per-tool toggles below.
              </p>
            </div>
            <Toggle
              checked={skipPermissions}
              onChange={(v) => update({ skipPermissions: v })}
            />
          </div>
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25 mb-2">Per tool</p>

        <div className={`space-y-1 ${skipPermissions ? 'opacity-40 pointer-events-none' : ''}`}>
          {MANAGEABLE_TOOLS.map((tool) => {
            const checked = autoApproveTools.includes(tool.name)
            return (
              <div
                key={tool.name}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs text-white/80 font-mono">{tool.name}</p>
                  <p className="text-[11px] text-white/40 mt-0.5">{tool.description}</p>
                </div>
                <Toggle checked={checked} onChange={() => toggleTool(tool.name)} />
              </div>
            )
          })}
        </div>

        <div className="border-t border-white/[0.06] mt-4 pt-4 flex items-center justify-between">
          <button
            onClick={clearAll}
            disabled={autoApproveTools.length === 0}
            className="text-[11px] text-white/30 hover:text-white/50 transition-colors disabled:opacity-40 disabled:hover:text-white/30"
          >
            Reset all to Ask
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-white/[0.08] px-4 py-1.5 text-xs text-white/70 hover:bg-white/[0.12] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-blue-600' : 'bg-white/[0.1]'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`}
      />
    </button>
  )
}
