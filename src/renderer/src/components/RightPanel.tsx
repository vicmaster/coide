import React, { useState } from 'react'

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
  return (
    <div>
      <SectionLabel label="Agent Tree" />
      <AgentNode name="Orchestrator" status="idle" depth={0} />
      <p className="mt-4 text-[11px] text-white/20 text-center">
        Agents appear here during a session
      </p>
    </div>
  )
}

type AgentStatus = 'running' | 'done' | 'failed' | 'pending' | 'idle'

function AgentNode({
  name,
  status,
  depth
}: {
  name: string
  status: AgentStatus
  depth: number
}): React.JSX.Element {
  const statusColors: Record<AgentStatus, string> = {
    running: 'bg-blue-400 animate-pulse',
    done: 'bg-green-400',
    failed: 'bg-red-400',
    pending: 'bg-white/20',
    idle: 'bg-white/[0.08]'
  }

  return (
    <div
      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors"
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
    >
      {depth > 0 && <span className="text-[10px] text-white/15">└</span>}
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${statusColors[status]}`} />
      <span className="text-xs text-white/50">{name}</span>
    </div>
  )
}

function TodoList(): React.JSX.Element {
  return (
    <div>
      <SectionLabel label="Tasks" />
      <p className="text-[11px] text-white/20 text-center mt-4">
        Todo items appear when Claude creates a task list
      </p>
    </div>
  )
}

function ContextTracker(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div>
        <SectionLabel label="Token Usage" />
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
          <div className="flex justify-between text-[11px] mb-2">
            <span className="text-white/40">Used</span>
            <span className="text-white/50 font-mono">0 / 200k</span>
          </div>
          <div className="h-1 w-full rounded-full bg-white/[0.07]">
            <div className="h-1 rounded-full bg-blue-500/60" style={{ width: '0%' }} />
          </div>
        </div>
      </div>

      <div>
        <SectionLabel label="Files in Context" />
        <p className="text-[11px] text-white/20 px-1">No files read yet</p>
      </div>
    </div>
  )
}
