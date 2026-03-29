import React, { useEffect, useCallback, useState } from 'react'
import { useSessionsStore, type SessionUsage } from '../store/sessions'
import { useSettingsStore } from '../store/settings'
import { useRateLimitStore, type RateLimitWindow } from '../store/rateLimit'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}

function formatResetTime(resetsAt: number, now: number): string {
  const ms = resetsAt * 1000 - now
  if (ms <= 0) return '0m'
  const mins = Math.ceil(ms / 60_000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function estimateCost(usage: SessionUsage, model: string): number {
  const costPerMInput = model === 'haiku' ? 0.8 : model === 'sonnet' ? 3 : 5
  const costPerMOutput = model === 'haiku' ? 4 : model === 'sonnet' ? 15 : 25
  return (usage.inputTokens * costPerMInput + usage.outputTokens * costPerMOutput) / 1_000_000
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }): React.JSX.Element {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-[11px] text-white/40">{label}</span>
      <span className={`text-[11px] font-mono ${color ?? 'text-white/70'}`}>{value}</span>
    </div>
  )
}

function RateLimitRow({ window: w, now }: { window: RateLimitWindow; now: number }): React.JSX.Element {
  const isThrottled = w.status !== 'allowed'
  const resetsInMs = w.resetsAt * 1000 - now
  const totalWindowMs = w.rateLimitType === 'five_hour' ? 5 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  const elapsed = totalWindowMs - resetsInMs
  const pct = isThrottled ? 100 : Math.min(Math.max((elapsed / totalWindowMs) * 100, 0), 100)
  const barColor = isThrottled || pct > 90 ? 'bg-red-500/70' : pct > 70 ? 'bg-yellow-500/60' : 'bg-blue-500/60'
  const valColor = isThrottled || pct > 90 ? 'text-red-400/80' : pct > 70 ? 'text-amber-400/70' : 'text-blue-400/60'
  const label = w.rateLimitType === 'five_hour' ? '5-hour window' : '7-day window'

  return (
    <div className="space-y-1.5 py-1">
      <div className="flex justify-between items-center">
        <span className="text-[11px] text-white/40">{label}</span>
        <span className={`text-[11px] font-mono ${valColor}`}>
          {isThrottled ? 'THROTTLED' : `resets ${formatResetTime(w.resetsAt, now)}`}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/[0.07]">
        <div className={`h-1.5 rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function StatsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const session = useSessionsStore((s) => {
    const active = s.sessions.find((sess) => sess.id === s.activeSessionId)
    return active ?? null
  })
  const model = useSettingsStore((s) => s.model) || 'opus'
  const effort = useSettingsStore((s) => s.effort)
  const rateLimitWindows = useRateLimitStore((s) => s.windows)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

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

  const usage = session?.usage ?? { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }
  const totalTokens = usage.inputTokens + usage.outputTokens
  const contextPct = Math.min((totalTokens / 1_000_000) * 100, 100)
  const cost = estimateCost(usage, model)
  const duration = session ? now - session.createdAt : 0
  const messageCount = session?.messages.filter((m) => m.role === 'user' || m.role === 'assistant').length ?? 0
  const rateLimitEntries = Object.values(rateLimitWindows)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-sm rounded-2xl bg-[#141414] border border-white/[0.1] p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white/90">Session Stats</h2>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/60 transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Session info */}
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/20 mb-2">Session</p>
          <StatRow label="Model" value={model} color="text-white/80" />
          {effort && <StatRow label="Effort" value={effort} color="text-violet-400/70" />}
          <StatRow label="Duration" value={formatDuration(duration)} />
          <StatRow label="Messages" value={String(messageCount)} />
          {session?.claudeSessionId && (
            <StatRow label="Session ID" value={session.claudeSessionId.slice(0, 12)} color="text-white/40" />
          )}
        </div>

        {/* Token usage */}
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/20 mb-2">Token Usage</p>
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] text-white/40">Context</span>
            <span className="text-[11px] font-mono text-white/70">{formatTokens(totalTokens)} / 1M</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/[0.07] mb-2">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${
                contextPct > 90 ? 'bg-red-500/70' : contextPct > 70 ? 'bg-yellow-500/60' : 'bg-blue-500/60'
              }`}
              style={{ width: `${contextPct}%` }}
            />
          </div>
          <StatRow label="Input" value={formatTokens(usage.inputTokens)} />
          <StatRow label="Output" value={formatTokens(usage.outputTokens)} />
          {usage.cacheReadTokens > 0 && <StatRow label="Cache read" value={formatTokens(usage.cacheReadTokens)} />}
          {usage.cacheCreationTokens > 0 && <StatRow label="Cache write" value={formatTokens(usage.cacheCreationTokens)} />}
          <div className="border-t border-white/[0.06] mt-1 pt-1">
            <StatRow label="Estimated cost" value={`$${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}`} color="text-green-400/70" />
          </div>
        </div>

        {/* Rate limits */}
        {rateLimitEntries.length > 0 && (
          <div className={`rounded-lg border p-3 ${
            rateLimitEntries.some((w) => w.status !== 'allowed')
              ? 'border-red-500/20 bg-red-500/[0.04]'
              : 'border-white/[0.06] bg-white/[0.03]'
          }`}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/20 mb-2">Rate Limit</p>
            {rateLimitEntries.map((w) => (
              <RateLimitRow key={w.rateLimitType} window={w} now={now} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
