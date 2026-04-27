import React, { useState, useEffect, useCallback } from 'react'
import { useSessionsStore } from '../store/sessions'
import { useSkillEditorStore } from '../store/skillEditor'
import { useWorkflowStore } from '../store/workflow'
import { BUILT_IN_COMMANDS } from '../data/commands'
import WorktreeDialog from './WorktreeDialog'
import type { WorkflowDefinition } from '../../../shared/workflow-types'

type Tab = 'sessions' | 'skills' | 'commands' | 'workflows'

export default function Sidebar(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('sessions')
  const { createSession, activeSessionId } = useSessionsStore()
  const [gitBranch, setGitBranch] = useState('')
  const [isGitRepo, setIsGitRepo] = useState(false)
  const [worktreeDialogOpen, setWorktreeDialogOpen] = useState(false)

  const cwd = useSessionsStore((state) => {
    const session = state.sessions.find((s) => s.id === state.activeSessionId)
    return session?.cwd ?? localStorage.getItem('cwd') ?? ''
  })

  useEffect(() => {
    if (!cwd) { setGitBranch(''); setIsGitRepo(false); return }
    window.api.git.branch(cwd).then(setGitBranch)
    window.api.git.isRepo(cwd).then(setIsGitRepo)
  }, [cwd])

  const handleNewSession = (): void => {
    const store = useSessionsStore.getState()
    const currentSession = store.sessions.find((s) => s.id === store.activeSessionId)
    const cwd = currentSession?.cwd ?? localStorage.getItem('cwd') ?? ''
    createSession(cwd)
  }

  const handleNewSessionInFolder = async (): Promise<void> => {
    const folder = await window.api.dialog.pickFolder()
    if (folder) createSession(folder)
  }

  return (
    <aside className="flex h-full w-64 flex-col bg-surface-2 border-r border-line-soft">
      {/* Title — offset for macOS traffic lights */}
      <div className="flex items-center justify-between px-4 pt-[46px] pb-3">
        <span className="text-sm font-semibold tracking-tight text-fg-strong">coide</span>
        <button
          onClick={() => window.dispatchEvent(new Event('coide:toggle-search'))}
          className="p-1 rounded text-fg-faint hover:text-fg-muted hover:bg-overlay-2 transition-colors"
          title="Search sessions (⇧⌘F)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex px-2 gap-0.5 mb-2">
        {(['sessions', 'skills', 'commands', 'workflows'] as Tab[]).map((tab) => {
          const label: Record<Tab, string> = {
            sessions: 'Sessions',
            skills: 'Skills',
            commands: 'Cmds',
            workflows: 'Flows'
          }
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-overlay-3 text-fg'
                  : 'text-fg-subtle hover:text-fg-muted hover:bg-overlay-2'
              }`}
            >
              {label[tab]}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {activeTab === 'sessions' && <SessionsList />}
        {activeTab === 'skills' && <SkillsList />}
        {activeTab === 'commands' && <CommandsList />}
        {activeTab === 'workflows' && <WorkflowsList />}
      </div>

      {/* Git branch */}
      {gitBranch && (
        <div className="px-3 py-1.5 border-t border-line-soft flex items-center gap-1.5 text-[11px] text-fg-subtle font-mono truncate">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
          <span className="truncate">{gitBranch}</span>
        </div>
      )}

      {/* Footer actions */}
      {activeTab === 'sessions' && (
        <div className="p-2 border-t border-line-soft space-y-1.5">
          <div className="flex">
            <button
              onClick={handleNewSession}
              className="flex-1 rounded-l-md bg-blue-600/90 hover:bg-blue-600 py-1.5 text-xs font-medium text-fg transition-colors"
            >
              + New Session
            </button>
            <button
              onClick={handleNewSessionInFolder}
              className="rounded-r-md bg-blue-600/90 hover:bg-blue-600 px-2 py-1.5 text-xs text-fg border-l border-blue-500/50 transition-colors"
              title="New session in different folder"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>
          {isGitRepo && (
            <button
              onClick={() => setWorktreeDialogOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 rounded-md border border-purple-500/20 bg-purple-500/10 hover:bg-purple-500/20 py-1.5 text-xs font-medium text-purple-400/80 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
              Worktree
            </button>
          )}
        </div>
      )}
      {worktreeDialogOpen && (
        <WorktreeDialog
          cwd={cwd}
          onClose={() => setWorktreeDialogOpen(false)}
          onCreated={(sessionId, initialPrompt) => {
            setWorktreeDialogOpen(false)
            if (initialPrompt) {
              useSessionsStore.getState().setPendingAction({ type: 'send', text: initialPrompt })
            }
          }}
        />
      )}
      {activeTab === 'workflows' && (
        <div className="p-2 border-t border-line-soft flex gap-1.5">
          <button
            onClick={() => {
              const { openCanvas, setCurrentWorkflow } = useWorkflowStore.getState()
              const id = `wf-${Date.now()}`
              setCurrentWorkflow({
                id,
                name: 'New Workflow',
                nodes: [],
                edges: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
              })
              openCanvas()
            }}
            className="flex-1 rounded-md bg-blue-600/90 hover:bg-blue-600 py-1.5 text-xs font-medium text-fg transition-colors"
          >
            + New
          </button>
          <button
            onClick={() => {
              const { openCanvas, setCurrentWorkflow } = useWorkflowStore.getState()
              setCurrentWorkflow(null) // will show templates view
              openCanvas()
            }}
            className="flex-1 rounded-md border border-line bg-overlay-1 hover:bg-overlay-3 py-1.5 text-xs font-medium text-fg-muted hover:text-fg-strong transition-colors"
          >
            Templates
          </button>
        </div>
      )}
      {activeTab === 'skills' && (
        <div className="p-2 border-t border-line-soft flex gap-1.5">
          <button
            onClick={() => useSkillEditorStore.getState().openNew()}
            className="flex-1 rounded-md bg-blue-600/90 hover:bg-blue-600 py-1.5 text-xs font-medium text-fg transition-colors"
          >
            + New
          </button>
          <button
            onClick={async () => {
              const filePath = await window.api.dialog.pickFile()
              if (!filePath) return
              const { content, error } = await window.api.fs.readFile(filePath)
              if (error || !content) return
              // Extract name from frontmatter if present, otherwise derive from filename
              const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
              let name: string | null = null
              if (fmMatch) {
                const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m)
                if (nameMatch) name = nameMatch[1].trim()
              }
              if (!name) {
                const parts = filePath.split('/')
                const fileName = parts[parts.length - 1]
                if (fileName.toLowerCase() === 'skill.md') {
                  name = parts[parts.length - 2] ?? 'imported-skill'
                } else {
                  name = fileName.replace(/\.md$/i, '')
                }
              }
              name = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'imported-skill'
              // If no frontmatter, open editor so user can add description
              if (!fmMatch) {
                const store = useSessionsStore.getState()
                const session = store.sessions.find((s) => s.id === store.activeSessionId)
                const cwd = session?.cwd ?? localStorage.getItem('cwd') ?? ''
                // Write the file first so the editor can load it
                await window.api.skills.write('project', name, content, cwd)
                window.dispatchEvent(new Event('coide:skills-changed'))
                const projectDir = cwd + '/.claude/skills/' + name + '/SKILL.md'
                useSkillEditorStore.getState().openEdit({ name, scope: 'project', filePath: projectDir })
              } else {
                const store = useSessionsStore.getState()
                const session = store.sessions.find((s) => s.id === store.activeSessionId)
                const cwd = session?.cwd ?? localStorage.getItem('cwd') ?? ''
                await window.api.skills.write('project', name, content, cwd)
                window.dispatchEvent(new Event('coide:skills-changed'))
              }
            }}
            className="flex-1 rounded-md border border-line bg-overlay-1 hover:bg-overlay-3 py-1.5 text-xs font-medium text-fg-muted hover:text-fg-strong transition-colors"
          >
            Import
          </button>
        </div>
      )}
    </aside>
  )
}

function SectionLabel({ label }: { label: string }): React.JSX.Element {
  return (
    <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-fg-faint">
      {label}
    </p>
  )
}

function SessionsList(): React.JSX.Element {
  const sessions = useSessionsStore((state) => state.sessions)
  const activeSessionId = useSessionsStore((state) => state.activeSessionId)
  const { setActiveSession, deleteSession, renameSession } = useSessionsStore()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const commitRename = (): void => {
    if (renamingId && renameValue.trim()) {
      renameSession(renamingId, renameValue.trim())
    }
    setRenamingId(null)
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-1">
        <p className="text-[11px] text-fg-faint">No sessions yet</p>
        <p className="text-[10px] text-fg-ghost">Start typing to begin</p>
      </div>
    )
  }

  return (
    <div>
      <SectionLabel label="Recent" />
      {sessions.map((session) => (
        <div key={session.id} className="group relative">
          <button
            onClick={() => setActiveSession(session.id)}
            onDoubleClick={() => {
              setRenamingId(session.id)
              setRenameValue(session.title)
            }}
            className={`w-full rounded-md px-2 py-1.5 text-left transition-colors ${
              session.id === activeSessionId
                ? 'bg-overlay-3 text-fg-strong'
                : 'text-fg-muted hover:bg-overlay-2 hover:text-fg-muted'
            }`}
          >
            {renamingId === session.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setRenamingId(null)
                  e.stopPropagation()
                }}
                onBlur={commitRename}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-transparent text-xs text-fg-strong outline-none border-b border-blue-400/50 pr-5"
              />
            ) : (
              <p className="text-xs truncate pr-5">{session.title}</p>
            )}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-fg-faint font-mono truncate">
                {session.cwd.split('/').pop()}
              </span>
              {session.branch && (
                <span className={`text-[9px] font-mono px-1 py-0.5 rounded flex-shrink-0 ${
                  session.worktree
                    ? 'bg-purple-500/15 text-purple-400/60'
                    : 'bg-overlay-2 text-fg-faint'
                }`}>
                  {session.branch}
                </span>
              )}
              {session.worktree && (
                <span className="text-[8px] font-medium text-purple-400/40 flex-shrink-0">wt</span>
              )}
              {session.forkOf && (
                <span className="text-[9px] font-medium text-fg-subtle flex-shrink-0" title={`Forked from "${session.forkOf.title}"`}>⑂</span>
              )}
            </div>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              deleteSession(session.id)
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 text-fg-faint hover:text-fg-muted transition-all"
            title="Delete session"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

function SkillsList(): React.JSX.Element {
  const [skills, setSkills] = useState<{ global: SkillInfo[]; project: SkillInfo[] }>({ global: [], project: [] })
  const [search, setSearch] = useState('')
  const setPendingAction = useSessionsStore((s) => s.setPendingAction)

  const cwd = useSessionsStore((state) => {
    const session = state.sessions.find((s) => s.id === state.activeSessionId)
    return session?.cwd ?? localStorage.getItem('cwd') ?? ''
  })

  const refresh = useCallback(() => {
    window.api.skills.list(cwd).then(setSkills)
  }, [cwd])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    window.addEventListener('coide:skills-changed', refresh)
    return () => window.removeEventListener('coide:skills-changed', refresh)
  }, [refresh])

  const filter = (list: SkillInfo[]): SkillInfo[] => {
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
  }

  const filteredProject = filter(skills.project)
  const filteredGlobal = filter(skills.global)
  const hasResults = filteredProject.length > 0 || filteredGlobal.length > 0

  const handleRun = useCallback((skill: SkillInfo) => {
    setPendingAction({ type: 'send', text: `/${skill.name}` })
  }, [setPendingAction])

  const handleEdit = useCallback((skill: SkillInfo) => {
    useSkillEditorStore.getState().openEdit(skill)
  }, [])

  const handleDelete = useCallback(async (skill: SkillInfo) => {
    await window.api.skills.delete(skill.filePath)
    window.dispatchEvent(new Event('coide:skills-changed'))
  }, [])

  const handleExport = useCallback(async (skill: SkillInfo) => {
    const { content, error } = await window.api.fs.readFile(skill.filePath)
    if (error || !content) return
    await window.api.dialog.saveFile(`${skill.name}.md`, content)
  }, [])

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter skills…"
        className="w-full rounded-md border border-line bg-overlay-1 px-2 py-1.5 text-[11px] text-fg-strong placeholder-fg-faint outline-none focus:border-line-strong"
      />
      {filteredProject.length > 0 && (
        <div>
          <SectionLabel label="Project" />
          <div className="space-y-1">
            {filteredProject.map((skill) => (
              <SkillRow
                key={skill.filePath}
                skill={skill}
                onRun={handleRun}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onExport={handleExport}
              />
            ))}
          </div>
        </div>
      )}
      {filteredGlobal.length > 0 && (
        <div>
          <SectionLabel label="Global" />
          <div className="space-y-1">
            {filteredGlobal.map((skill) => (
              <SkillRow
                key={skill.filePath}
                skill={skill}
                onRun={handleRun}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onExport={handleExport}
              />
            ))}
          </div>
        </div>
      )}
      {!hasResults && (
        <p className="text-center text-[10px] text-fg-faint py-4">
          {search ? 'No matching skills' : 'No skills found'}
        </p>
      )}
    </div>
  )
}

const SkillRow = React.memo(function SkillRow({
  skill,
  onRun,
  onEdit,
  onDelete,
  onExport
}: {
  skill: SkillInfo
  onRun: (skill: SkillInfo) => void
  onEdit: (skill: SkillInfo) => void
  onDelete: (skill: SkillInfo) => void
  onExport: (skill: SkillInfo) => void
}): React.JSX.Element {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="group rounded-md border border-line-soft bg-overlay-1 hover:bg-overlay-2 px-2.5 py-2 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-fg-muted">/{skill.name}</span>
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-fg-subtle">Delete?</span>
            <button
              onClick={() => { onDelete(skill); setConfirmDelete(false) }}
              className="text-red-400 hover:text-red-300 transition-colors"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-fg-subtle hover:text-fg-muted transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
            <button
              onClick={() => onEdit(skill)}
              className="text-[10px] text-fg-subtle hover:text-fg-muted transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => onExport(skill)}
              className="text-[10px] text-fg-subtle hover:text-fg-muted transition-colors"
            >
              Exp
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-[10px] text-fg-subtle hover:text-red-400 transition-colors"
            >
              Del
            </button>
            <button
              onClick={() => onRun(skill)}
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
            >
              Run
            </button>
          </div>
        )}
      </div>
      <p className="mt-0.5 text-[10px] text-fg-subtle truncate">{skill.description}</p>
    </div>
  )
})

function WorkflowsList(): React.JSX.Element {
  const { workflows, setWorkflows, setCurrentWorkflow, openCanvas, setExecution } =
    useWorkflowStore()

  useEffect(() => {
    window.api.workflow.list().then((wfs) => setWorkflows(wfs as WorkflowDefinition[]))
  }, [])

  const handleOpen = async (id: string): Promise<void> => {
    const wf = (await window.api.workflow.load(id)) as WorkflowDefinition | null
    if (wf) {
      setCurrentWorkflow(wf)
      setExecution(null)
      openCanvas()
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    await window.api.workflow.delete(id)
    const wfs = await window.api.workflow.list()
    setWorkflows(wfs as WorkflowDefinition[])
  }

  if (workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <p className="text-[11px] text-fg-faint text-center mb-3">
          No saved workflows yet
        </p>
        <p className="text-[10px] text-fg-ghost text-center">
          Create a new workflow or start from a template
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {workflows.map((wf) => (
        <div
          key={wf.id}
          className="group flex items-center rounded-md px-2 py-2 hover:bg-overlay-1 cursor-pointer transition-colors"
          onClick={() => handleOpen(wf.id)}
        >
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-fg-muted truncate">{wf.name}</div>
            <div className="text-[10px] text-fg-faint">
              {wf.nodes.length} nodes
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDelete(wf.id)
            }}
            className="opacity-0 group-hover:opacity-100 text-fg-faint hover:text-red-400 text-xs transition-opacity ml-1"
            title="Delete workflow"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

function CommandsList(): React.JSX.Element {
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? BUILT_IN_COMMANDS.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.description.toLowerCase().includes(search.toLowerCase())
      )
    : BUILT_IN_COMMANDS

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter commands…"
        className="w-full rounded-md border border-line bg-overlay-1 px-2 py-1.5 text-[11px] text-fg-strong placeholder-fg-faint outline-none focus:border-line-strong"
      />
      {filtered.length > 0 ? (
        <div>
          <SectionLabel label="CLI Reference" />
          <p className="px-2 mb-1.5 text-[10px] text-fg-faint">
            These commands work in the Claude Code CLI terminal, not in coide chat.
          </p>
          <div className="space-y-0.5">
            {filtered.map((cmd) => (
              <div
                key={cmd.name}
                className="rounded-md px-2 py-1.5"
              >
                <div className="text-xs font-mono text-fg-subtle">{cmd.name}</div>
                <div className="text-[10px] text-fg-faint">{cmd.description}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-center text-[10px] text-fg-faint py-4">No matching commands</p>
      )}
    </div>
  )
}
