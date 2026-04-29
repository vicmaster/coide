import React, { useEffect, useState } from 'react'
import { useSessionsStore } from '../store/sessions'
import { useUiStore } from '../store/ui'
import { pickAgentIcon, type IconDef } from '../utils/agentIcons'

type AgentEntry = {
  name: string
  description: string
  scope: 'global' | 'project'
}

export default function AvailableAgents(): React.JSX.Element {
  const cwd = useSessionsStore(
    (s) => s.sessions.find((sess) => sess.id === s.activeSessionId)?.cwd ?? ''
  )
  const [agents, setAgents] = useState<AgentEntry[]>([])
  const [home, setHome] = useState<string>('')
  const prefillInput = useUiStore((s) => s.prefillInput)
  const openMemoryFile = useUiStore((s) => s.openMemoryFile)

  useEffect(() => {
    if (!cwd) {
      setAgents([])
      return
    }
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const result = await (window.api as unknown as {
          agents: { list: (cwd: string) => Promise<{ global: AgentEntry[]; project: AgentEntry[] }> }
        }).agents.list(cwd)
        if (cancelled) return
        const merged = [...(result.project ?? []), ...(result.global ?? [])]
        // Dedupe by name, project takes precedence
        const seen = new Set<string>()
        setAgents(
          merged.filter((a) => {
            if (seen.has(a.name)) return false
            seen.add(a.name)
            return true
          })
        )
      } catch {
        if (!cancelled) setAgents([])
      }
    }
    load()
    void homeOnce().then((h) => !cancelled && setHome(h))
    return () => {
      cancelled = true
    }
  }, [cwd])

  if (agents.length === 0) {
    return (
      <div>
        <SectionLabel label="Available Agents" />
        <p className="mt-2 text-[11px] text-fg-faint text-center">
          No subagents found in <span className="font-mono">.claude/agents/</span>
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-fg-faint">
          Available Agents
        </p>
        <span className="text-[10px] text-fg-subtle font-mono">{agents.length}</span>
      </div>
      <div className="space-y-0.5">
        {agents.map((agent) => (
          <AgentRow
            key={agent.name}
            agent={agent}
            home={home}
            onDispatch={() => prefillInput(`@${agent.name} `)}
            onEdit={() => {
              const filePath =
                agent.scope === 'project'
                  ? `${cwd}/.claude/agents/${agent.name}.md`
                  : `${home}/.claude/agents/${agent.name}.md`
              openMemoryFile(filePath)
            }}
          />
        ))}
      </div>
    </div>
  )
}

function AgentRow({
  agent,
  onDispatch,
  onEdit
}: {
  agent: AgentEntry
  home: string
  onDispatch: () => void
  onEdit: () => void
}): React.JSX.Element {
  const icon = pickAgentIcon(agent.name, agent.description)
  return (
    <div className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-overlay-2 transition-colors">
      <AgentIcon icon={icon} />
      <button
        onClick={onDispatch}
        className="min-w-0 flex-1 text-left"
        title={`Dispatch with @${agent.name}`}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-fg-muted truncate">{agent.name}</span>
          {agent.scope === 'global' && (
            <span className="text-[8px] uppercase tracking-wider text-fg-faint flex-shrink-0">
              global
            </span>
          )}
        </div>
        {agent.description && (
          <p className="text-[10px] text-fg-faint leading-snug line-clamp-2 mt-0.5">
            {agent.description}
          </p>
        )}
      </button>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={onEdit}
          className="p-1 rounded hover:bg-overlay-3 text-fg-faint hover:text-fg-muted"
          title="Edit configuration"
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 11l1.5-.5 7-7L9 2 2 9v2zM9 3l1.5 1.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          onClick={onDispatch}
          className="p-1 rounded hover:bg-overlay-3 text-fg-faint hover:text-blue-400"
          title="Insert @-mention"
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.2" />
            <path
              d="M10 7v1.5a2 2 0 002 2 2 2 0 002-2v-1.5a7 7 0 10-3 5.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

function AgentIcon({ icon }: { icon: IconDef }): React.JSX.Element {
  return (
    <span
      className={`flex-shrink-0 mt-0.5 ${icon.tone}`}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">${icon.paths}</svg>`
      }}
    />
  )
}

function SectionLabel({ label }: { label: string }): React.JSX.Element {
  return (
    <p className="px-1 mb-2 text-[10px] font-semibold uppercase tracking-widest text-fg-faint">
      {label}
    </p>
  )
}

let cachedHome: string | null = null
async function homeOnce(): Promise<string> {
  if (cachedHome) return cachedHome
  try {
    cachedHome = await window.api.system.homedir()
  } catch {
    cachedHome = ''
  }
  return cachedHome
}
