import React, { useState, useMemo } from 'react'
import { useSessionsStore, type Task, type Agent, type ToolCallMessage } from '../store/sessions'

type Tab = 'agents' | 'todo' | 'context'

export default function RightPanel(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('agents')

  return (
    <aside className="flex h-full w-64 flex-col bg-[#111111] border-l border-white/[0.06]">
      {/* Header — matches sidebar and chat header height */}
      <div className="flex items-end px-3 pt-[46px] pb-2.5 border-b border-white/[0.06]">
        <div className="flex gap-0.5">
          {(['agents', 'todo', 'context'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'bg-white/10 text-white/80'
                  : 'text-white/30 hover:text-white/55 hover:bg-white/5'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'agents' && <AgentTree />}
        {activeTab === 'todo' && <TodoList />}
        {activeTab === 'context' && <ContextTracker />}
      </div>
    </aside>
  )
}

function SectionLabel({ label }: { label: string }): React.JSX.Element {
  return (
    <p className="px-1 mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/20">
      {label}
    </p>
  )
}

function AgentTree(): React.JSX.Element {
  const agents = useSessionsStore((state) => {
    const session = state.sessions.find((s) => s.id === state.activeSessionId)
    return session?.agents ?? []
  })

  const doneCount = agents.filter((a) => a.status === 'done').length
  const total = agents.length
  const hasRunning = agents.some((a) => a.status === 'running')
  const orchestratorStatus: AgentNodeStatus = hasRunning ? 'running' : total > 0 ? 'done' : 'idle'

  return (
    <div>
      {total > 0 ? (
        <div className="flex items-center justify-between px-1 mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/20">Agent Tree</p>
          <span className="text-[10px] text-white/30 font-mono">{doneCount}/{total} done</span>
        </div>
      ) : (
        <SectionLabel label="Agent Tree" />
      )}
      <AgentNodeRow name="Orchestrator" status={orchestratorStatus} depth={0} />
      {agents.map((agent) => (
        <AgentNodeRow
          key={agent.toolId}
          name={agent.name}
          status={agent.status}
          depth={1}
          meta={agent}
        />
      ))}
      {total === 0 && (
        <p className="mt-4 text-[11px] text-white/20 text-center">
          Agents appear here during a session
        </p>
      )}
    </div>
  )
}

type AgentNodeStatus = 'running' | 'done' | 'failed' | 'idle'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${Math.round(s % 60)}s`
}

function AgentNodeRow({
  name,
  status,
  depth,
  meta
}: {
  name: string
  status: AgentNodeStatus
  depth: number
  meta?: Agent
}): React.JSX.Element {
  const statusColors: Record<AgentNodeStatus, string> = {
    running: 'bg-blue-400 animate-pulse',
    done: 'bg-green-400',
    failed: 'bg-red-400',
    idle: 'bg-white/[0.08]'
  }

  const metaParts: string[] = []
  if (meta?.durationMs != null) metaParts.push(formatDuration(meta.durationMs))
  if (meta?.totalTokens != null) metaParts.push(`${(meta.totalTokens / 1000).toFixed(1)}k tok`)

  return (
    <div
      className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors"
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
    >
      {depth > 0 && <span className="text-[10px] text-white/15 mt-0.5">└</span>}
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1 ${statusColors[status]}`} />
      <div className="min-w-0">
        <span className="text-xs text-white/50">{name}</span>
        {meta?.subagentType && (
          <span className="ml-1.5 text-[10px] text-white/20">{meta.subagentType}</span>
        )}
        {metaParts.length > 0 && (
          <p className="text-[10px] text-white/20 mt-0.5">{metaParts.join(' · ')}</p>
        )}
      </div>
    </div>
  )
}

function TodoList(): React.JSX.Element {
  const tasks = useSessionsStore((state) => {
    const session = state.sessions.find((s) => s.id === state.activeSessionId)
    return session?.tasks ?? []
  })

  const completed = tasks.filter((t) => t.status === 'completed').length
  const total = tasks.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  if (total === 0) {
    return (
      <div>
        <SectionLabel label="Tasks" />
        <p className="text-[11px] text-white/20 text-center mt-4">
          Todo items appear when Claude creates a task list
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Header + counter */}
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/20">Tasks</p>
        <span className="text-[10px] text-white/30 font-mono">{completed}/{total} done</span>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-white/[0.07] mb-3">
        <div
          className="h-1 rounded-full bg-green-500/60 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Task list */}
      <div className="space-y-0.5">
        {tasks.map((task) => (
          <TaskItem key={task.taskId} task={task} />
        ))}
      </div>
    </div>
  )
}

function TaskItem({ task }: { task: Task }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)

  const dotClass =
    task.status === 'completed'
      ? 'bg-green-400'
      : task.status === 'in_progress'
        ? 'bg-blue-400 animate-pulse'
        : 'bg-white/20'

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors text-left"
      >
        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1 ${dotClass}`} />
        <div className="min-w-0 flex-1">
          <span
            className={`text-xs leading-snug ${
              task.status === 'completed'
                ? 'text-white/30 line-through'
                : 'text-white/60'
            }`}
          >
            {task.subject}
          </span>
          {task.status === 'in_progress' && task.activeForm && (
            <p className="text-[10px] italic text-blue-400/60 mt-0.5">{task.activeForm}</p>
          )}
        </div>
      </button>
      {expanded && task.description && (
        <div className="ml-5 mr-2 mb-1 px-2 py-1.5 rounded bg-white/[0.03] border border-white/[0.05]">
          <p className="text-[10px] text-white/30 leading-relaxed whitespace-pre-wrap">{task.description}</p>
        </div>
      )}
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

const CONTEXT_LIMIT = 200_000
const FILE_TOOL_NAMES = new Set(['Read', 'Edit', 'Write', 'Glob', 'Grep'])

function ContextTracker(): React.JSX.Element {
  const usage = useSessionsStore((state) => {
    const session = state.sessions.find((s) => s.id === state.activeSessionId)
    return session?.usage ?? { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }
  })

  const messages = useSessionsStore((state) => {
    const session = state.sessions.find((s) => s.id === state.activeSessionId)
    return session?.messages ?? []
  })

  const total = usage.inputTokens + usage.outputTokens
  const pct = Math.min((total / CONTEXT_LIMIT) * 100, 100)
  const barColor = pct > 90 ? 'bg-red-500/70' : pct > 70 ? 'bg-yellow-500/60' : 'bg-blue-500/60'

  const files = useMemo(() => {
    const paths = new Set<string>()
    for (const msg of messages) {
      if (msg.role !== 'tool_call') continue
      const tc = msg as ToolCallMessage
      if (!FILE_TOOL_NAMES.has(tc.tool_name)) continue
      const fp = tc.input?.file_path ?? tc.input?.path
      if (typeof fp === 'string' && fp) paths.add(fp)
    }
    return Array.from(paths)
  }, [messages])

  return (
    <div className="space-y-4">
      <div>
        <SectionLabel label="Token Usage" />
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
          <div className="flex justify-between text-[11px] mb-2">
            <span className="text-white/40">Used</span>
            <span className="text-white/50 font-mono">{formatTokens(total)} / 200k</span>
          </div>
          <div className="h-1 w-full rounded-full bg-white/[0.07]">
            <div
              className={`h-1 rounded-full transition-all duration-500 ease-out ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {total > 0 && (
            <div className="mt-2 space-y-0.5 text-[10px] text-white/25">
              <div className="flex justify-between">
                <span>Input</span>
                <span className="font-mono">{formatTokens(usage.inputTokens)}</span>
              </div>
              <div className="flex justify-between">
                <span>Output</span>
                <span className="font-mono">{formatTokens(usage.outputTokens)}</span>
              </div>
              {usage.cacheReadTokens > 0 && (
                <div className="flex justify-between">
                  <span>Cache read</span>
                  <span className="font-mono">{formatTokens(usage.cacheReadTokens)}</span>
                </div>
              )}
              {usage.cacheCreationTokens > 0 && (
                <div className="flex justify-between">
                  <span>Cache write</span>
                  <span className="font-mono">{formatTokens(usage.cacheCreationTokens)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/20">Files in Context</p>
          {files.length > 0 && (
            <span className="text-[10px] text-white/30 font-mono">{files.length} files</span>
          )}
        </div>
        {files.length === 0 ? (
          <p className="text-[11px] text-white/20 px-1">No files read yet</p>
        ) : (
          <div className="space-y-0.5">
            {files.map((fp) => (
              <div
                key={fp}
                className="rounded-md px-2 py-1 text-[11px] text-white/40 truncate hover:bg-white/5 transition-colors"
                title={fp}
              >
                {fp.split('/').pop()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
