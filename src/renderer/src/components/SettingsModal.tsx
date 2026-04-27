import React, { useEffect, useCallback } from 'react'
import { useSettingsStore } from '../store/settings'
import { useHookEditorStore } from '../store/hookEditor'
import { DEFAULT_SETTINGS } from '../../../shared/types'

export default function SettingsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const settings = useSettingsStore()
  const update = settings.updateSettings
  const reset = settings.resetSettings

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

  const handlePickDefaultCwd = async (): Promise<void> => {
    const folder = await window.api.dialog.pickFolder()
    if (folder) update({ defaultCwd: folder })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-md rounded-2xl bg-surface-3 border border-line-strong p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-fg-strong">Settings</h2>
          <button
            onClick={onClose}
            className="text-fg-subtle hover:text-fg-muted transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Essential */}
        <SectionLabel>Essential</SectionLabel>

        <SettingRow label="Model">
          <Select
            value={settings.model}
            onChange={(v) => update({ model: v })}
            options={[
              { value: '', label: 'Default' },
              { value: 'sonnet', label: 'Sonnet 4' },
              { value: 'opus', label: 'Opus 4' },
              { value: 'haiku', label: 'Haiku 4.5' }
            ]}
          />
        </SettingRow>

        <SettingRow label="Permissions">
          <button
            onClick={() => {
              onClose()
              window.dispatchEvent(new CustomEvent('coide:open-permissions'))
            }}
            className="rounded-lg border border-line bg-overlay-1 px-3 py-1 text-xs text-fg-muted hover:text-fg-strong hover:bg-overlay-2 transition-colors"
          >
            Manage…
          </button>
        </SettingRow>

        <SettingRow label="Notifications">
          <Toggle
            checked={settings.notifications}
            onChange={(v) => update({ notifications: v })}
          />
        </SettingRow>

        <SettingRow label="Auto-compact">
          <Toggle
            checked={settings.autoCompact}
            onChange={(v) => update({ autoCompact: v })}
          />
        </SettingRow>

        <div className="mb-4">
          <label className="block text-xs text-fg-muted mb-1.5">System Prompt</label>
          <textarea
            value={settings.systemPrompt}
            onChange={(e) => update({ systemPrompt: e.target.value })}
            placeholder="Appended to Claude's system prompt..."
            rows={3}
            className="w-full rounded-lg border border-line bg-overlay-1 px-3 py-2 text-xs text-fg-strong placeholder-fg-faint outline-none focus:border-line-strong transition-colors resize-none"
          />
        </div>

        {/* Divider */}
        <div className="border-t border-line-soft my-4" />

        {/* Advanced */}
        <SectionLabel>Advanced</SectionLabel>

        <div className="mb-3">
          <label className="block text-xs text-fg-muted mb-1.5">Claude Binary</label>
          <input
            type="text"
            value={settings.claudeBinaryPath}
            onChange={(e) => update({ claudeBinaryPath: e.target.value })}
            className="w-full rounded-lg border border-line bg-overlay-1 px-3 py-1.5 text-xs text-fg-muted font-mono outline-none focus:border-line-strong transition-colors"
          />
        </div>

        <div className="mb-3">
          <label className="block text-xs text-fg-muted mb-1.5">Default CWD</label>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={settings.defaultCwd}
              onChange={(e) => update({ defaultCwd: e.target.value })}
              className="flex-1 rounded-lg border border-line bg-overlay-1 px-3 py-1.5 text-xs text-fg-muted font-mono outline-none focus:border-line-strong transition-colors"
            />
            <button
              onClick={handlePickDefaultCwd}
              className="rounded-lg border border-line bg-overlay-1 px-2.5 py-1.5 text-xs text-fg-subtle hover:text-fg-muted hover:bg-overlay-2 transition-colors"
              title="Browse..."
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-xs text-fg-muted mb-1.5">Hooks</label>
          <button
            onClick={() => {
              onClose()
              useHookEditorStore.getState().open()
            }}
            className="rounded-lg border border-line bg-overlay-1 px-3 py-1.5 text-xs text-fg-subtle hover:text-fg-muted hover:bg-overlay-2 transition-colors"
          >
            Configure Hooks...
          </button>
        </div>

        <SettingRow label="Font Size">
          <SegmentedControl
            value={settings.fontSize}
            onChange={(v) => update({ fontSize: v as 'small' | 'medium' | 'large' })}
            options={[
              { value: 'small', label: 'S' },
              { value: 'medium', label: 'M' },
              { value: 'large', label: 'L' }
            ]}
          />
        </SettingRow>

        <SettingRow label="Effort Level">
          <Select
            value={settings.effort}
            onChange={(v) => update({ effort: v })}
            options={[
              { value: '', label: 'Default' },
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' }
            ]}
          />
        </SettingRow>

        {/* Footer */}
        <div className="border-t border-line-soft mt-4 pt-4 flex items-center justify-between">
          <button
            onClick={() => reset()}
            className="text-[11px] text-fg-subtle hover:text-fg-muted transition-colors"
          >
            Reset to Defaults
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

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-faint mb-3">{children}</p>
  )
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between mb-3">
      <label className="text-xs text-fg-muted">{label}</label>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-overlay-3'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`}
      />
    </button>
  )
}

function Select({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}): React.JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-line bg-overlay-1 px-2.5 py-1 text-xs text-fg-muted outline-none focus:border-line-strong transition-colors appearance-none cursor-pointer pr-6"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23666' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center'
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-surface-4 text-fg-strong">
          {opt.label}
        </option>
      ))}
    </select>
  )
}

function SegmentedControl({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}): React.JSX.Element {
  return (
    <div className="flex rounded-lg border border-line overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-xs transition-colors ${
            value === opt.value
              ? 'bg-overlay-3 text-fg-strong'
              : 'text-fg-subtle hover:text-fg-muted'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
