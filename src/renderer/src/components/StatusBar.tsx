import React from 'react'
import { useSessionsStore } from '../store/sessions'
import { useProcessesStore, EMPTY_PROCESSES, type BgProcess } from '../store/processes'
import { useUiStore } from '../store/ui'

export default function StatusBar(): React.JSX.Element {
  return (
    <div className="flex items-center justify-between h-[22px] px-2 bg-surface-1 border-t border-line-soft text-[10px] text-fg-faint flex-shrink-0">
      <div className="flex items-center gap-2">
        <TasksChip />
      </div>
      <div className="flex items-center gap-2">
        {/* Future slots — rate limit, etc. */}
      </div>
    </div>
  )
}

function TasksChip(): React.JSX.Element | null {
  const activeSessionId = useSessionsStore((s) => s.activeSessionId)
  const bySession = useProcessesStore((s) => s.bySession)
  const procs = activeSessionId ? bySession[activeSessionId] ?? EMPTY_PROCESSES : EMPTY_PROCESSES
  const focusProcessesTab = useUiStore((s) => s.focusProcessesTab)
  const bottomOpen = useUiStore((s) => s.bottomPanelOpen)
  const setBottomOpen = useUiStore((s) => s.setBottomPanelOpen)

  if (procs.length === 0) return null

  const summary = summarizeChip(procs)

  const onClick = (): void => {
    if (bottomOpen && summary.label) {
      setBottomOpen(false)
    } else {
      focusProcessesTab()
    }
  }

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-1.5 py-px h-[18px] rounded transition-colors hover:bg-overlay-2 ${bottomOpen ? 'bg-overlay-2 text-fg-muted' : ''}`}
      title="Background processes"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${summary.dotClass}`} />
      <span>{summary.label}</span>
    </button>
  )
}

function summarizeChip(procs: BgProcess[]): { label: string; dotClass: string } {
  let running = 0, failed = 0, exited = 0, killed = 0
  for (const p of procs) {
    if (p.status === 'running' || p.status === 'orphaned' || p.status === 'untracked') running++
    else if (p.status === 'killed') killed++
    else if (p.status === 'stopped' || p.status === 'exited') {
      if (p.exitCode != null && p.exitCode !== 0) failed++
      else exited++
    }
  }

  if (running > 0) {
    return { label: `${running} running`, dotClass: 'bg-blue-400 animate-pulse' }
  }
  if (failed > 0) {
    return { label: `${failed} failed`, dotClass: 'bg-red-400' }
  }
  return { label: `${exited + killed} done`, dotClass: 'bg-green-400/70' }
}
