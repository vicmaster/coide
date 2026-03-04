import React, { useState, useMemo, useEffect } from 'react'
import { useSessionsStore, type Task, type Agent, type ToolCallMessage } from '../store/sessions'
import FileChangelog from './FileChangelog'

type Tab = 'agents' | 'todo' | 'context' | 'files' | 'mcp'

export default function RightPanel(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('agents')

  return (
    <aside className="flex h-full w-64 flex-col bg-[#111111] border-l border-white/[0.06]">
      {/* Header — matches sidebar and chat header height */}
      <div className="flex items-end px-3 pt-[46px] pb-2.5 border-b border-white/[0.06]">
        <div className="flex gap-0.5">
          {(['agents', 'todo', 'context', 'files', 'mcp'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'bg-white/10 text-white/80'
                  : 'text-white/30 hover:text-white/55 hover:bg-white/5'
              }`}
            >
              {tab === 'mcp' ? 'MCP' : tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'agents' && <AgentTree />}
        {activeTab === 'todo' && <TodoList />}
        {activeTab === 'context' && <ContextTracker />}
        {activeTab === 'files' && <FileChangelog />}
        {activeTab === 'mcp' && <McpPanel />}
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
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list')
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
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/30 font-mono">{doneCount}/{total} done</span>
            <button
              onClick={() => setViewMode('list')}
              className={`p-0.5 rounded ${viewMode === 'list' ? 'text-white/50' : 'text-white/20 hover:text-white/40'}`}
              title="List view"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 3h10M1 6h10M1 9h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`p-0.5 rounded ${viewMode === 'timeline' ? 'text-white/50' : 'text-white/20 hover:text-white/40'}`}
              title="Timeline view"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="2" width="6" height="2" rx="0.5" fill="currentColor"/><rect x="3" y="5" width="8" height="2" rx="0.5" fill="currentColor"/><rect x="2" y="8" width="5" height="2" rx="0.5" fill="currentColor"/></svg>
            </button>
          </div>
        </div>
      ) : (
        <SectionLabel label="Agent Tree" />
      )}
      {viewMode === 'list' ? (
        <>
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
        </>
      ) : (
        <TimelineView agents={agents} />
      )}
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
      className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors"
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
    >
      {depth > 0 && <span className="text-[10px] text-white/15 mt-0.5">└</span>}
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1 ${statusColors[status]}`} />
      <div className="min-w-0 flex-1">
        <span className="text-xs text-white/50">{name}</span>
        {meta?.subagentType && (
          <span className="ml-1.5 text-[10px] text-white/20">{meta.subagentType}</span>
        )}
        {metaParts.length > 0 && (
          <p className="text-[10px] text-white/20 mt-0.5">{metaParts.join(' · ')}</p>
        )}
      </div>
      {status === 'running' && meta && (
        <button
          onClick={() => window.api.claude.abort()}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 text-white/30 hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
          title="Cancel (stops entire session)"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        </button>
      )}
    </div>
  )
}

function TimelineView({ agents }: { agents: Agent[] }): React.JSX.Element {
  const [tick, setTick] = useState(0)

  const hasRunning = agents.some((a) => a.status === 'running')

  useEffect(() => {
    if (!hasRunning) return
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [hasRunning])

  const now = Date.now()
  const timelineStart = Math.min(...agents.map((a) => a.startedAt))
  const timelineEnd = Math.max(
    ...agents.map((a) => {
      if (a.status === 'running') return now
      return a.startedAt + (a.durationMs ?? 0)
    })
  )
  const totalSpan = Math.max(timelineEnd - timelineStart, 1)

  // suppress unused var warning — tick drives re-render
  void tick

  return (
    <div className="space-y-1">
      {agents.map((agent) => {
        const start = agent.startedAt - timelineStart
        const duration =
          agent.status === 'running' ? now - agent.startedAt : (agent.durationMs ?? 0)
        const leftPct = (start / totalSpan) * 100
        const widthPct = Math.max((duration / totalSpan) * 100, 2)

        const barColor =
          agent.status === 'running'
            ? 'bg-blue-400/70'
            : agent.status === 'failed'
              ? 'bg-red-400/70'
              : 'bg-green-400/70'

        const metaParts: string[] = []
        if (duration > 0) metaParts.push(formatDuration(duration))
        if (agent.totalTokens != null)
          metaParts.push(`${(agent.totalTokens / 1000).toFixed(1)}k tok`)

        return (
          <div key={agent.toolId} className="group flex items-center gap-1.5">
            <span className="text-[10px] text-white/40 w-[72px] truncate flex-shrink-0" title={agent.name}>
              {agent.name}
            </span>
            <div className="flex-1 relative h-4">
              <div
                className={`absolute top-0.5 h-3 rounded-sm ${barColor} ${agent.status === 'running' ? 'animate-pulse' : ''}`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                title={metaParts.join(' · ') || agent.name}
              />
            </div>
            {agent.status === 'running' && (
              <button
                onClick={() => window.api.claude.abort()}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 text-white/30 hover:text-red-400 transition-all flex-shrink-0"
                title="Cancel (stops entire session)"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              </button>
            )}
          </div>
        )
      })}
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

      {files.length > 0 && (
        <div className="px-1">
          <p className="text-[10px] text-white/25">
            {files.length} file{files.length !== 1 ? 's' : ''} touched — see <span className="text-white/40">Files</span> tab
          </p>
        </div>
      )}
    </div>
  )
}

type McpServer = { name: string; command?: string; args?: string[]; url?: string; scope: 'global' | 'project' }

function McpPanel(): React.JSX.Element {
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const cwd = useSessionsStore((s) => s.sessions.find((sess) => sess.id === s.activeSessionId)?.cwd ?? '')

  useEffect(() => {
    if (!cwd) { setLoading(false); return }
    window.api.mcp.list(cwd).then((result: McpServer[]) => {
      setServers(result)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [cwd])

  if (loading) {
    return (
      <div>
        <SectionLabel label="MCP Servers" />
        <p className="text-[11px] text-white/20 text-center mt-4">Loading...</p>
      </div>
    )
  }

  if (servers.length === 0) {
    return (
      <div>
        <SectionLabel label="MCP Servers" />
        <p className="text-[11px] text-white/20 text-center mt-4">No MCP servers configured</p>
      </div>
    )
  }

  return (
    <div>
      <SectionLabel label="MCP Servers" />
      <div className="space-y-1.5">
        {servers.map((server) => (
          <div
            key={`${server.scope}-${server.name}`}
            className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-white/60 font-medium truncate">{server.name}</span>
              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                server.scope === 'global'
                  ? 'bg-blue-500/15 text-blue-400/70'
                  : 'bg-green-500/15 text-green-400/70'
              }`}>
                {server.scope}
              </span>
            </div>
            <p className="text-[10px] text-white/25 font-mono truncate">
              {server.url
                ? server.url
                : [server.command, ...(server.args ?? [])].join(' ')}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
