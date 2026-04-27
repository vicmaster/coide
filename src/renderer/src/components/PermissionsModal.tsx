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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-md rounded-2xl bg-surface-3 border border-line-strong p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-fg-strong">Permissions</h2>
          <button
            onClick={onClose}
            className="text-fg-subtle hover:text-fg-muted transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>
        <p className="text-[11px] text-fg-subtle mb-5 leading-relaxed">
          Choose which tools auto-approve without asking. You can also click <span className="text-fg-muted">Always allow</span> on any prompt to add it here.
        </p>

        <div className="rounded-lg border border-line bg-overlay-1 p-3 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-fg-strong font-medium">Skip all prompts</p>
              <p className="text-[11px] text-fg-subtle mt-0.5 leading-relaxed">
                Auto-approve every tool. Overrides the per-tool toggles below.
              </p>
            </div>
            <Toggle
              checked={skipPermissions}
              onChange={(v) => update({ skipPermissions: v })}
            />
          </div>
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-faint mb-2">Per tool</p>

        <div className={`space-y-1 ${skipPermissions ? 'opacity-40 pointer-events-none' : ''}`}>
          {MANAGEABLE_TOOLS.map((tool) => {
            const checked = autoApproveTools.includes(tool.name)
            return (
              <div
                key={tool.name}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-overlay-1 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs text-fg-strong font-mono">{tool.name}</p>
                  <p className="text-[11px] text-fg-subtle mt-0.5">{tool.description}</p>
                </div>
                <Toggle checked={checked} onChange={() => toggleTool(tool.name)} />
              </div>
            )
          })}
        </div>

        <div className="border-t border-line-soft mt-4 pt-4 flex items-center justify-between">
          <button
            onClick={clearAll}
            disabled={autoApproveTools.length === 0}
            className="text-[11px] text-fg-subtle hover:text-fg-muted transition-colors disabled:opacity-40 disabled:hover:text-fg-subtle"
          >
            Reset all to Ask
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-overlay-3 px-4 py-1.5 text-xs text-fg-muted hover:bg-overlay-4 transition-colors"
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
      className={`relative h-5 w-9 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-blue-600' : 'bg-overlay-3'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`}
      />
    </button>
  )
}
