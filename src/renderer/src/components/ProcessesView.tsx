import React, { useEffect, useState } from 'react'
import { useSessionsStore } from '../store/sessions'
import { useProcessesStore, EMPTY_PROCESSES, type BgProcess } from '../store/processes'

export default function ProcessesView(): React.JSX.Element {
  const activeSessionId = useSessionsStore((s) => s.activeSessionId)
  const bySession = useProcessesStore((s) => s.bySession)
  const processes = activeSessionId ? bySession[activeSessionId] ?? EMPTY_PROCESSES : EMPTY_PROCESSES

  if (processes.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center bg-canvas">
        <div className="text-center text-[11px] text-fg-faint max-w-xs px-6">
          No background processes this session.<br />
          Claude will list them here when it runs something in the background.
        </div>
      </div>
    )
  }

  const counts = summarize(processes)
  const showSummary = processes.length >= 5

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-canvas">
      {showSummary && (
        <div className="sticky top-0 z-10 px-3 py-1.5 text-[10px] text-fg-faint bg-surface-1 border-b border-line-soft flex items-center gap-3">
          <span>{counts.running} running</span>
          <span>·</span>
          <span>{counts.exited + counts.killed} done</span>
          {counts.failed > 0 && (
            <>
              <span>·</span>
              <span className="text-red-400/70">{counts.failed} failed</span>
            </>
          )}
        </div>
      )}
      <div>
        {processes.map((p) => (
          <ProcessRow key={p.shellId} proc={p} sessionId={activeSessionId!} />
        ))}
      </div>
    </div>
  )
}

function summarize(procs: BgProcess[]): { running: number; exited: number; killed: number; failed: number } {
  let running = 0, exited = 0, killed = 0, failed = 0
  for (const p of procs) {
    if (p.status === 'running' || p.status === 'orphaned' || p.status === 'untracked') running++
    else if (p.status === 'killed') killed++
    else if (p.status === 'stopped' || p.status === 'exited') {
      if (p.exitCode != null && p.exitCode !== 0) failed++
      else exited++
    }
  }
  return { running, exited, killed, failed }
}

function ProcessRow({ proc, sessionId }: { proc: BgProcess; sessionId: string }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [killing, setKilling] = useState(false)

  const isAlive = proc.status === 'running' || proc.status === 'orphaned' || proc.status === 'untracked'
  const tickingNow = useTickingClock(isAlive)
  const runtime = formatRuntime(proc, isAlive ? tickingNow : (proc.endedAt ?? proc.lastOutputAt ?? proc.startedAt))

  const handleKill = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (killing || !isAlive) return
    setKilling(true)
    try {
      await window.api.processes.kill(sessionId, proc.shellId)
    } finally {
      // Status will update via broadcast; reset local state after a short window
      setTimeout(() => setKilling(false), 3500)
    }
  }

  return (
    <div className="border-b border-line-soft/40 last:border-b-0">
      <div
        className="flex items-center gap-3 h-9 px-3 cursor-pointer hover:bg-overlay-2 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-fg-faint flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <StatusDot status={proc.status} exitCode={proc.exitCode} />
        <span className="flex-1 min-w-0 truncate text-xs text-fg-muted font-mono">{proc.command || '(empty command)'}</span>
        <span className="flex-shrink-0 w-[68px] text-[10px] text-fg-faint font-mono">
          {proc.pid != null ? `PID ${proc.pid}` : '—'}
        </span>
        <span className="flex-shrink-0 w-[110px] text-[10px] text-fg-subtle">
          {statusLabel(proc)}
          <span className="text-fg-faint ml-1">{runtime}</span>
        </span>
        <div className="flex-shrink-0 w-[56px] flex justify-end">
          {isAlive ? (
            <button
              onClick={handleKill}
              disabled={killing || proc.pid == null}
              className="text-[10px] font-medium px-2 py-0.5 rounded border border-red-500/30 text-red-400/70 hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={
                proc.pid == null
                  ? proc.status === 'untracked'
                    ? "Couldn't match this shell to a process — coide can't kill it"
                    : 'PID not yet resolved'
                  : 'Send SIGTERM (then SIGKILL after 3s)'
              }
            >
              {killing ? 'Killing…' : 'Kill'}
            </button>
          ) : null}
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-2.5">
          <div className="bg-overlay-1 border border-line-soft rounded mx-7 px-2.5 py-2 text-[10px] font-mono text-fg-subtle leading-relaxed max-h-[120px] overflow-y-auto whitespace-pre-wrap">
            {proc.lastOutput ?? '— No output captured yet —'}
          </div>
          <div className="mx-7 mt-1 text-[9px] italic text-fg-faint">
            {proc.outputFile ? `tail of ${proc.outputFile}` : 'Last read by Claude · not a live stream'}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusDot({ status, exitCode }: { status: BgProcess['status']; exitCode: number | null }): React.JSX.Element {
  let className = 'w-1.5 h-1.5 rounded-full flex-shrink-0 '
  if (status === 'running') className += 'bg-blue-400 animate-pulse'
  else if (status === 'orphaned') className += 'bg-amber-400/70'
  else if (status === 'untracked') className += 'bg-overlay-4 ring-1 ring-amber-400/30'
  else if (status === 'killed') className += 'bg-red-400/70'
  else if (status === 'stopped') className += 'bg-green-400/60'
  else if (status === 'exited') className += exitCode != null && exitCode !== 0 ? 'bg-red-400' : 'bg-green-400'
  else className += 'bg-overlay-4'
  return <span className={className} />
}

function statusLabel(p: BgProcess): string {
  if (p.status === 'running') return 'running'
  if (p.status === 'orphaned') return 'orphaned'
  if (p.status === 'untracked') return 'untracked'
  if (p.status === 'killed') return 'killed'
  if (p.status === 'stopped') return 'stopped'
  if (p.status === 'exited') return p.exitCode != null ? `exited ${p.exitCode}` : 'exited'
  return p.status
}

function formatRuntime(p: BgProcess, end: number): string {
  const ms = Math.max(0, end - p.startedAt)
  const s = Math.floor(ms / 1000)
  if (s < 60) return ` ${s}s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m < 60) return ` ${m}m ${rs}s`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return ` ${h}h ${rm}m`
}

function useTickingClock(active: boolean): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}
