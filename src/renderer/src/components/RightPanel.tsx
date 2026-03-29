import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useSessionsStore, type Task, type Agent, type ToolCallMessage, type SessionUsage, type Message, type McpServerInfo } from '../store/sessions'
import { useRateLimitStore, type RateLimitWindow } from '../store/rateLimit'
import FileChangelog from './FileChangelog'

const EMPTY_AGENTS: Agent[] = []
const EMPTY_TASKS: Task[] = []
const EMPTY_MESSAGES: Message[] = []
const EMPTY_USAGE: SessionUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }

type Tab = 'agents' | 'context' | 'mcp'

export default function RightPanel(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('agents')

  return (
    <aside className="flex h-full w-64 flex-col bg-[#111111] border-l border-white/[0.06]">
      {/* Header — matches sidebar and chat header height */}
      <div className="flex items-end px-3 pt-[46px] pb-2.5 border-b border-white/[0.06]">
        <div className="flex gap-0.5">
          {(['agents', 'context', 'mcp'] as Tab[]).map((tab) => (
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
        {activeTab === 'agents' && <AgentsTab />}
        {activeTab === 'context' && <ContextTab />}
        {activeTab === 'mcp' && <McpPanel />}
      </div>
    </aside>
  )
}

function AgentsTab(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <AgentTree />
      <div className="h-px bg-white/[0.06]" />
      <TodoList />
    </div>
  )
}

function ContextTab(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <ContextTracker />
      <RateLimitCard />
      <FileChangelog />
    </div>
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
    return session?.agents ?? EMPTY_AGENTS
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
          onClick={() => window.api.claude.abort(useSessionsStore.getState().activeSessionId ?? undefined)}
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
    if (!hasRunning) return undefined
    const intervalId = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(intervalId)
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
                onClick={() => window.api.claude.abort(useSessionsStore.getState().activeSessionId ?? undefined)}
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
    return session?.tasks ?? EMPTY_TASKS
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

const CONTEXT_LIMIT = 1_000_000
const FILE_TOOL_NAMES = new Set(['Read', 'Edit', 'Write', 'Glob', 'Grep'])

function ContextTracker(): React.JSX.Element {
  const usage = useSessionsStore((state) => {
    const session = state.sessions.find((s) => s.id === state.activeSessionId)
    return session?.usage ?? EMPTY_USAGE
  })

  const messages = useSessionsStore((state) => {
    const session = state.sessions.find((s) => s.id === state.activeSessionId)
    return session?.messages ?? EMPTY_MESSAGES
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
            <span className="text-white/50 font-mono">{formatTokens(total)} / 1M</span>
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
            {files.length} file{files.length !== 1 ? 's' : ''} touched
          </p>
        </div>
      )}
    </div>
  )
}

function formatResetTime(resetsAt: number, now: number): string {
  const ms = resetsAt * 1000 - now
  if (ms <= 0) return '0m'
  const mins = Math.ceil(ms / 60_000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function RateLimitBar({ window: w, now }: { window: RateLimitWindow; now: number }): React.JSX.Element {
  const isThrottled = w.status !== 'allowed'
  const resetsInMs = w.resetsAt * 1000 - now
  const totalWindowMs = w.rateLimitType === 'five_hour' ? 5 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  const elapsed = totalWindowMs - resetsInMs
  const pct = isThrottled ? 100 : Math.min(Math.max((elapsed / totalWindowMs) * 100, 0), 100)
  const barColor = isThrottled || pct > 90 ? 'bg-red-500/70' : pct > 70 ? 'bg-yellow-500/60' : 'bg-blue-500/60'
  const valColor = isThrottled || pct > 90 ? 'text-red-400/80' : pct > 70 ? 'text-amber-400/70' : 'text-blue-400/60'
  const label = w.rateLimitType === 'five_hour' ? '5-hour window' : '7-day window'

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-white/40">{label}</span>
        <span className={`font-mono ${valColor}`}>
          {isThrottled ? 'LIMIT' : `resets ${formatResetTime(w.resetsAt, now)}`}
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-white/[0.07]">
        <div
          className={`h-1 rounded-full transition-all duration-500 ease-out ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function RateLimitCard(): React.JSX.Element | null {
  const windows = useRateLimitStore((s) => s.windows)
  const [now, setNow] = useState(Date.now())

  const entries = Object.values(windows)

  useEffect(() => {
    if (entries.length === 0) return
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [entries.length])

  if (entries.length === 0) return null

  const anyThrottled = entries.some((w) => w.status !== 'allowed')
  const borderColor = anyThrottled ? 'border-red-500/20' : 'border-white/[0.06]'
  const bgColor = anyThrottled ? 'bg-red-500/[0.04]' : 'bg-white/[0.03]'

  return (
    <div>
      <SectionLabel label="Rate Limit" />
      <div className={`rounded-lg border ${borderColor} ${bgColor} p-3 space-y-3`}>
        {entries.map((w) => (
          <RateLimitBar key={w.rateLimitType} window={w} now={now} />
        ))}
        {anyThrottled && (
          <div className="rounded bg-red-500/10 px-2 py-1.5 flex items-center gap-1.5">
            <span className="text-[11px]">⏱</span>
            <span className="text-[10px] font-mono text-red-400/80">
              Throttled — resets {formatResetTime(entries[0].resetsAt, now)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

type McpConfigEntry = { name: string; command?: string; args?: string[]; url?: string; scope: 'global' | 'project' }

const EMPTY_MCP: McpServerInfo[] = []

function McpPanel(): React.JSX.Element {
  const [configEntries, setConfigEntries] = useState<McpConfigEntry[]>([])
  const cwd = useSessionsStore((s) => s.sessions.find((sess) => sess.id === s.activeSessionId)?.cwd ?? '')
  const liveServers = useSessionsStore((s) => {
    const session = s.sessions.find((sess) => sess.id === s.activeSessionId)
    return session?.mcpServers ?? EMPTY_MCP
  })

  useEffect(() => {
    if (!cwd) return
    window.api.mcp.list(cwd).then((result: McpConfigEntry[]) => setConfigEntries(result)).catch(() => {})
  }, [cwd])

  // Merge live status with static config
  const servers = useMemo(() => {
    const configMap = new Map(configEntries.map((c) => [c.name, c]))
    if (liveServers.length > 0) {
      return liveServers.map((live) => {
        const cfg = configMap.get(live.name)
        return { ...live, command: cfg?.command, args: cfg?.args, url: cfg?.url, scope: cfg?.scope }
      })
    }
    return configEntries.map((cfg) => ({
      name: cfg.name,
      status: 'pending' as const,
      tools: [] as string[],
      command: cfg.command,
      args: cfg.args,
      url: cfg.url,
      scope: cfg.scope
    }))
  }, [liveServers, configEntries])

  const handleReconnect = useCallback(() => {
    const store = useSessionsStore.getState()
    const sid = store.activeSessionId
    if (!sid) return
    window.api.claude.abort(sid)
    store.restartSession(sid)
    store.addMessage(sid, {
      id: Date.now().toString(),
      role: 'assistant',
      text: 'Session restarted. MCP servers will reconnect on the next message.'
    })
  }, [])

  const connected = servers.filter((s) => s.status === 'connected').length
  const failed = servers.filter((s) => s.status === 'failed').length
  const pending = servers.filter((s) => s.status === 'pending').length

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
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/20">MCP Servers</p>
        {failed > 0 && (
          <button
            onClick={handleReconnect}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
            title="Restart session to reconnect MCP servers"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="text-blue-400/70">
              <path d="M1 4v4h4M15 12V8h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2.5 10a6 6 0 0110.2-3M13.5 6a6 6 0 01-10.2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-[9px] font-medium text-blue-400/70">Reconnect</span>
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {servers.map((server) => (
          <McpServerCard key={server.name} server={server} />
        ))}
      </div>

      <p className="text-[10px] text-white/20 text-center mt-3">
        {connected > 0 && <span className="text-green-400/50">{connected} connected</span>}
        {connected > 0 && (failed > 0 || pending > 0) && <span> · </span>}
        {failed > 0 && <span className="text-red-400/50">{failed} failed</span>}
        {failed > 0 && pending > 0 && <span> · </span>}
        {pending > 0 && <span className="text-yellow-400/50">{pending} pending</span>}
      </p>
    </div>
  )
}

function McpServerCard({ server }: { server: McpServerInfo & { command?: string; args?: string[]; url?: string; scope?: string } }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)

  const statusDot =
    server.status === 'connected' ? 'bg-green-400'
    : server.status === 'failed' ? 'bg-red-400'
    : 'bg-yellow-400 animate-pulse'

  const statusBadge =
    server.status === 'connected' ? 'bg-green-500/15 text-green-400/70'
    : server.status === 'failed' ? 'bg-red-500/15 text-red-400/70'
    : 'bg-yellow-500/15 text-yellow-400/70'

  const cmdText = server.url ?? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2"
      >
        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${statusDot}`} />
        <span className="text-xs text-white/60 font-medium truncate flex-1 text-left">{server.name}</span>
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusBadge}`}>
          {server.status}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {cmdText && (
            <p className="text-[10px] text-white/25 font-mono truncate" title={cmdText}>{cmdText}</p>
          )}
          {server.tools.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <svg width="9" height="9" viewBox="0 0 16 16" fill="none" className="text-white/25">
                  <path d="M14.7 6.3a1 1 0 000-1.4l-1.6-1.6a1 1 0 00-1.4 0l-2.3 2.3-1.3-1.3a1 1 0 00-1.4 0l-4.4 4.4a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l4.4-4.4a1 1 0 000-1.4l-1.3-1.3 2.3-2.3z" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
                <span className="text-[10px] text-white/25">{server.tools.length} tool{server.tools.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-0.5">
                {server.tools.map((tool) => (
                  <div key={tool} className="flex items-center gap-1.5 px-1">
                    <span className="text-[10px] text-white/15">•</span>
                    <span className="text-[10px] text-white/35 font-mono truncate">{tool}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {server.tools.length === 0 && server.status === 'failed' && (
            <p className="text-[10px] text-red-400/40 italic">Failed to connect — no tools available</p>
          )}
        </div>
      )}
    </div>
  )
}
