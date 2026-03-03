import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useHookEditorStore } from '../store/hookEditor'
import { useSessionsStore } from '../store/sessions'
import {
  HOOK_EVENTS,
  type HookEvent,
  type HookHandler,
  type MatcherGroup,
  type HooksConfig
} from '../../../shared/hookTypes'

export default function HookEditorModal(): React.JSX.Element | null {
  const { isOpen, initialScope, close } = useHookEditorStore()
  const cwd = useSessionsStore((s) => {
    const session = s.sessions.find((sess) => sess.id === s.activeSessionId)
    return session?.cwd ?? localStorage.getItem('cwd') ?? ''
  })
  const [scope, setScope] = useState<'global' | 'project'>(initialScope)
  const [config, setConfig] = useState<HooksConfig>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (s: 'global' | 'project') => {
      setLoading(true)
      setError(null)
      try {
        const result = await window.api.hooks.read(s, cwd)
        setConfig((result.hooks ?? {}) as HooksConfig)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    },
    [cwd]
  )

  useEffect(() => {
    if (isOpen) {
      setScope(initialScope)
      load(initialScope)
    }
  }, [isOpen, initialScope, load])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  const handleScopeChange = (s: 'global' | 'project'): void => {
    setScope(s)
    load(s)
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      // Strip undefined values (timeout, matcher) so structured clone doesn't choke
      const clean = JSON.parse(JSON.stringify(config))
      const result = await window.api.hooks.write(scope, clean, cwd)
      if (result.error) {
        setError(result.error)
      } else {
        close()
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) close()
    },
    [close]
  )

  // --- Immutable update helpers ---

  const addEvent = (event: HookEvent): void => {
    setConfig((prev) => ({
      ...prev,
      [event]: [{ hooks: [{ type: 'command' as const, command: '' }] }]
    }))
  }

  const removeEvent = (event: HookEvent): void => {
    setConfig((prev) => {
      const next = { ...prev }
      delete next[event]
      return next
    })
  }

  const updateMatcherGroups = (event: HookEvent, groups: MatcherGroup[]): void => {
    setConfig((prev) => ({ ...prev, [event]: groups }))
  }

  const addMatcherGroup = (event: HookEvent): void => {
    const groups = config[event] ?? []
    updateMatcherGroups(event, [...groups, { hooks: [{ type: 'command', command: '' }] }])
  }

  const removeMatcherGroup = (event: HookEvent, idx: number): void => {
    const groups = (config[event] ?? []).filter((_, i) => i !== idx)
    if (groups.length === 0) {
      removeEvent(event)
    } else {
      updateMatcherGroups(event, groups)
    }
  }

  const updateMatcher = (event: HookEvent, groupIdx: number, matcher: string): void => {
    const groups = [...(config[event] ?? [])]
    groups[groupIdx] = { ...groups[groupIdx], matcher: matcher || undefined }
    updateMatcherGroups(event, groups)
  }

  const addHandler = (event: HookEvent, groupIdx: number): void => {
    const groups = [...(config[event] ?? [])]
    groups[groupIdx] = {
      ...groups[groupIdx],
      hooks: [...groups[groupIdx].hooks, { type: 'command', command: '' }]
    }
    updateMatcherGroups(event, groups)
  }

  const removeHandler = (event: HookEvent, groupIdx: number, hookIdx: number): void => {
    const groups = [...(config[event] ?? [])]
    const hooks = groups[groupIdx].hooks.filter((_, i) => i !== hookIdx)
    if (hooks.length === 0) {
      removeMatcherGroup(event, groupIdx)
    } else {
      groups[groupIdx] = { ...groups[groupIdx], hooks }
      updateMatcherGroups(event, groups)
    }
  }

  const updateHandler = (
    event: HookEvent,
    groupIdx: number,
    hookIdx: number,
    updates: Partial<HookHandler>
  ): void => {
    const groups = [...(config[event] ?? [])]
    const hooks = [...groups[groupIdx].hooks]
    hooks[hookIdx] = { ...hooks[hookIdx], ...updates }
    // Clean up fields based on type
    if (hooks[hookIdx].type === 'command') {
      delete hooks[hookIdx].prompt
    } else {
      delete hooks[hookIdx].command
    }
    groups[groupIdx] = { ...groups[groupIdx], hooks }
    updateMatcherGroups(event, groups)
  }

  if (!isOpen) return null

  const configuredEvents = Object.keys(config) as HookEvent[]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-[#141414] border border-white/[0.1] shadow-2xl flex flex-col max-h-[75vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-sm font-semibold text-white/90">Hook Configuration</h2>
          <button
            onClick={close}
            className="text-white/30 hover:text-white/60 transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Scope tabs */}
        <div className="flex gap-1 px-5 pb-3">
          {(['global', 'project'] as const).map((s) => (
            <button
              key={s}
              onClick={() => handleScopeChange(s)}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                scope === s
                  ? 'bg-white/[0.1] text-white/80'
                  : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
              }`}
            >
              {s === 'global' ? 'Global' : 'Project'}
            </button>
          ))}
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <p className="text-xs text-white/30 text-center py-8">Loading...</p>
          ) : configuredEvents.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-8">
              No hooks configured. Add an event to get started.
            </p>
          ) : (
            configuredEvents.map((event) => (
              <EventSection
                key={event}
                event={event}
                groups={config[event] ?? []}
                onRemoveEvent={() => removeEvent(event)}
                onAddMatcherGroup={() => addMatcherGroup(event)}
                onRemoveMatcherGroup={(idx) => removeMatcherGroup(event, idx)}
                onUpdateMatcher={(gIdx, val) => updateMatcher(event, gIdx, val)}
                onAddHandler={(gIdx) => addHandler(event, gIdx)}
                onRemoveHandler={(gIdx, hIdx) => removeHandler(event, gIdx, hIdx)}
                onUpdateHandler={(gIdx, hIdx, u) => updateHandler(event, gIdx, hIdx, u)}
              />
            ))
          )}

        </div>

        {/* Add Event — outside scrollable body so dropdown isn't clipped */}
        {!loading && (
          <div className="relative px-5 py-2 border-t border-white/[0.06]">
            <AddEventDropdown
              configuredEvents={configuredEvents}
              onAdd={addEvent}
            />
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-white/[0.06] px-5 py-3 flex items-center justify-between">
          <div className="text-xs text-red-400/80 max-w-[60%] truncate">
            {error ?? ''}
          </div>
          <div className="flex gap-2">
            <button
              onClick={close}
              className="rounded-lg px-4 py-1.5 text-xs text-white/40 hover:text-white/60 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-white/[0.08] px-4 py-1.5 text-xs text-white/70 hover:bg-white/[0.12] transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Sub-components ---

function EventSection({
  event,
  groups,
  onRemoveEvent,
  onAddMatcherGroup,
  onRemoveMatcherGroup,
  onUpdateMatcher,
  onAddHandler,
  onRemoveHandler,
  onUpdateHandler
}: {
  event: HookEvent
  groups: MatcherGroup[]
  onRemoveEvent: () => void
  onAddMatcherGroup: () => void
  onRemoveMatcherGroup: (idx: number) => void
  onUpdateMatcher: (groupIdx: number, value: string) => void
  onAddHandler: (groupIdx: number) => void
  onRemoveHandler: (groupIdx: number, hookIdx: number) => void
  onUpdateHandler: (groupIdx: number, hookIdx: number, updates: Partial<HookHandler>) => void
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 text-xs font-medium text-white/70 hover:text-white/90 transition-colors"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="currentColor"
            className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
          >
            <path d="M2 3l3 4 3-4H2z" />
          </svg>
          {event}
        </button>
        <button
          onClick={onRemoveEvent}
          className="text-white/20 hover:text-red-400/70 transition-colors text-sm leading-none"
          title="Remove event"
        >
          &times;
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-2">
          {groups.map((group, gIdx) => (
            <MatcherGroupCard
              key={gIdx}
              group={group}
              onRemove={() => onRemoveMatcherGroup(gIdx)}
              onUpdateMatcher={(val) => onUpdateMatcher(gIdx, val)}
              onAddHandler={() => onAddHandler(gIdx)}
              onRemoveHandler={(hIdx) => onRemoveHandler(gIdx, hIdx)}
              onUpdateHandler={(hIdx, u) => onUpdateHandler(gIdx, hIdx, u)}
            />
          ))}
          <button
            onClick={onAddMatcherGroup}
            className="text-[11px] text-white/25 hover:text-white/50 transition-colors"
          >
            + Add Matcher Group
          </button>
        </div>
      )}
    </div>
  )
}

function MatcherGroupCard({
  group,
  onRemove,
  onUpdateMatcher,
  onAddHandler,
  onRemoveHandler,
  onUpdateHandler
}: {
  group: MatcherGroup
  onRemove: () => void
  onUpdateMatcher: (value: string) => void
  onAddHandler: () => void
  onRemoveHandler: (hookIdx: number) => void
  onUpdateHandler: (hookIdx: number, updates: Partial<HookHandler>) => void
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-white/30 shrink-0">matcher</label>
        <input
          type="text"
          value={group.matcher ?? ''}
          onChange={(e) => onUpdateMatcher(e.target.value)}
          placeholder="e.g. Edit|Write (optional)"
          className="flex-1 rounded border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[11px] text-white/60 font-mono placeholder-white/15 outline-none focus:border-white/[0.12] transition-colors"
        />
        <button
          onClick={onRemove}
          className="text-white/15 hover:text-red-400/60 transition-colors text-xs leading-none"
          title="Remove matcher group"
        >
          &times;
        </button>
      </div>

      {group.hooks.map((hook, hIdx) => (
        <HookHandlerRow
          key={hIdx}
          hook={hook}
          onRemove={() => onRemoveHandler(hIdx)}
          onUpdate={(u) => onUpdateHandler(hIdx, u)}
        />
      ))}

      <button
        onClick={onAddHandler}
        className="text-[10px] text-white/20 hover:text-white/40 transition-colors pl-1"
      >
        + Add Hook
      </button>
    </div>
  )
}

function HookHandlerRow({
  hook,
  onRemove,
  onUpdate
}: {
  hook: HookHandler
  onRemove: () => void
  onUpdate: (updates: Partial<HookHandler>) => void
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-2">
      <select
        value={hook.type}
        onChange={(e) => onUpdate({ type: e.target.value as 'command' | 'prompt' })}
        className="rounded border border-white/[0.06] bg-white/[0.03] px-1.5 py-1 text-[11px] text-white/50 outline-none focus:border-white/[0.12] transition-colors appearance-none cursor-pointer shrink-0"
      >
        <option value="command" className="bg-[#1a1a1a]">command</option>
        <option value="prompt" className="bg-[#1a1a1a]">prompt</option>
      </select>

      {hook.type === 'command' ? (
        <input
          type="text"
          value={hook.command ?? ''}
          onChange={(e) => onUpdate({ command: e.target.value })}
          placeholder="bash command..."
          className="flex-1 rounded border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[11px] text-white/60 font-mono placeholder-white/15 outline-none focus:border-white/[0.12] transition-colors"
        />
      ) : (
        <textarea
          value={hook.prompt ?? ''}
          onChange={(e) => onUpdate({ prompt: e.target.value })}
          placeholder="LLM prompt..."
          rows={2}
          className="flex-1 rounded border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[11px] text-white/60 font-mono placeholder-white/15 outline-none focus:border-white/[0.12] transition-colors resize-none"
        />
      )}

      <input
        type="number"
        value={hook.timeout ?? ''}
        onChange={(e) => {
          const v = e.target.value ? Number(e.target.value) : undefined
          onUpdate({ timeout: v })
        }}
        placeholder="t/s"
        title="Timeout (seconds)"
        className="w-12 rounded border border-white/[0.06] bg-white/[0.03] px-1.5 py-1 text-[11px] text-white/40 font-mono placeholder-white/15 outline-none focus:border-white/[0.12] transition-colors text-center shrink-0"
      />

      <button
        onClick={onRemove}
        className="text-white/15 hover:text-red-400/60 transition-colors text-xs leading-none mt-1 shrink-0"
        title="Remove hook"
      >
        &times;
      </button>
    </div>
  )
}

function AddEventDropdown({
  configuredEvents,
  onAdd
}: {
  configuredEvents: HookEvent[]
  onAdd: (event: HookEvent) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const available = HOOK_EVENTS.filter((e) => !configuredEvents.includes(e))

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (available.length === 0) return <></>

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] text-white/25 hover:text-white/50 transition-colors"
      >
        + Add Event
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-1 rounded-lg border border-white/[0.1] bg-[#1a1a1a] shadow-xl py-1 z-10 max-h-48 overflow-y-auto">
          {available.map((event) => (
            <button
              key={event}
              onClick={() => {
                onAdd(event)
                setOpen(false)
              }}
              className="block w-full text-left px-3 py-1.5 text-[11px] text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
            >
              {event}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
