import React, { useState, useEffect, useCallback } from 'react'
import { useSessionsStore } from '../store/sessions'
import { useSkillEditorStore } from '../store/skillEditor'
import { BUILT_IN_COMMANDS } from '../data/commands'

type Tab = 'sessions' | 'skills' | 'commands'

export default function Sidebar(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('sessions')
  const { createSession, activeSessionId } = useSessionsStore()

  const handleNewSession = (): void => {
    const store = useSessionsStore.getState()
    const currentSession = store.sessions.find((s) => s.id === store.activeSessionId)
    const cwd = currentSession?.cwd ?? localStorage.getItem('cwd') ?? '/Users/victor/Projects'
    createSession(cwd)
  }

  return (
    <aside className="flex h-full w-56 flex-col bg-[#111111] border-r border-white/[0.06]">
      {/* Title — offset for macOS traffic lights */}
      <div className="flex items-center justify-between px-4 pt-[46px] pb-3">
        <span className="text-sm font-semibold tracking-tight text-white/80">coide</span>
        <button
          onClick={() => window.dispatchEvent(new Event('coide:toggle-search'))}
          className="p-1 rounded text-white/25 hover:text-white/60 hover:bg-white/5 transition-colors"
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
        {(['sessions', 'skills', 'commands'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 rounded-md text-[11px] font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'bg-white/10 text-white'
                : 'text-white/35 hover:text-white/60 hover:bg-white/5'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {activeTab === 'sessions' && <SessionsList />}
        {activeTab === 'skills' && <SkillsList />}
        {activeTab === 'commands' && <CommandsList />}
      </div>

      {/* Footer actions */}
      {activeTab === 'sessions' && (
        <div className="p-2 border-t border-white/[0.06]">
          <button
            onClick={handleNewSession}
            className="w-full rounded-md bg-blue-600/90 hover:bg-blue-600 py-1.5 text-xs font-medium text-white transition-colors"
          >
            + New Session
          </button>
        </div>
      )}
      {activeTab === 'skills' && (
        <div className="p-2 border-t border-white/[0.06] flex gap-1.5">
          <button
            onClick={() => useSkillEditorStore.getState().openNew()}
            className="flex-1 rounded-md bg-blue-600/90 hover:bg-blue-600 py-1.5 text-xs font-medium text-white transition-colors"
          >
            + New
          </button>
          <button
            onClick={async () => {
              const filePath = await window.api.dialog.pickFile()
              if (!filePath) return
              const { content, error } = await window.api.fs.readFile(filePath)
              if (error || !content) return
              // Derive skill name: if filename is SKILL.md use parent folder, otherwise strip .md
              const parts = filePath.split('/')
              const fileName = parts[parts.length - 1]
              let name: string
              if (fileName.toLowerCase() === 'skill.md') {
                name = parts[parts.length - 2] ?? 'imported-skill'
              } else {
                name = fileName.replace(/\.md$/i, '')
              }
              name = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'imported-skill'
              const store = useSessionsStore.getState()
              const session = store.sessions.find((s) => s.id === store.activeSessionId)
              const cwd = session?.cwd ?? localStorage.getItem('cwd') ?? '/Users/victor/Projects'
              await window.api.skills.write('project', name, content, cwd)
              window.dispatchEvent(new Event('coide:skills-changed'))
            }}
            className="flex-1 rounded-md border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] py-1.5 text-xs font-medium text-white/60 hover:text-white/80 transition-colors"
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
    <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/20">
      {label}
    </p>
  )
}

function SessionsList(): React.JSX.Element {
  const sessions = useSessionsStore((state) => state.sessions)
  const activeSessionId = useSessionsStore((state) => state.activeSessionId)
  const { setActiveSession, deleteSession } = useSessionsStore()

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-1">
        <p className="text-[11px] text-white/20">No sessions yet</p>
        <p className="text-[10px] text-white/12">Start typing to begin</p>
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
            className={`w-full rounded-md px-2 py-1.5 text-left transition-colors ${
              session.id === activeSessionId
                ? 'bg-white/10 text-white/90'
                : 'text-white/50 hover:bg-white/5 hover:text-white/70'
            }`}
          >
            <p className="text-xs truncate pr-5">{session.title}</p>
            <p className="text-[10px] text-white/25 mt-0.5 font-mono truncate">
              {session.cwd.split('/').pop()}
            </p>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              deleteSession(session.id)
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 text-white/20 hover:text-white/60 transition-all"
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
    return session?.cwd ?? localStorage.getItem('cwd') ?? '/Users/victor/Projects'
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

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter skills…"
        className="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/80 placeholder-white/20 outline-none focus:border-white/[0.15]"
      />
      {filteredProject.length > 0 && (
        <div>
          <SectionLabel label="Project" />
          <div className="space-y-1">
            {filteredProject.map((skill) => (
              <SkillRow
                key={skill.filePath}
                skill={skill}
                onRun={() => setPendingAction({ type: 'send', text: `/${skill.name}` })}
                onEdit={() => useSkillEditorStore.getState().openEdit(skill)}
                onDelete={async () => {
                  await window.api.skills.delete(skill.filePath)
                  window.dispatchEvent(new Event('coide:skills-changed'))
                }}
                onExport={async () => {
                  const { content, error } = await window.api.fs.readFile(skill.filePath)
                  if (error || !content) return
                  await window.api.dialog.saveFile(`${skill.name}.md`, content)
                }}
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
                onRun={() => setPendingAction({ type: 'send', text: `/${skill.name}` })}
                onEdit={() => useSkillEditorStore.getState().openEdit(skill)}
                onDelete={async () => {
                  await window.api.skills.delete(skill.filePath)
                  window.dispatchEvent(new Event('coide:skills-changed'))
                }}
                onExport={async () => {
                  const { content, error } = await window.api.fs.readFile(skill.filePath)
                  if (error || !content) return
                  await window.api.dialog.saveFile(`${skill.name}.md`, content)
                }}
              />
            ))}
          </div>
        </div>
      )}
      {!hasResults && (
        <p className="text-center text-[10px] text-white/20 py-4">
          {search ? 'No matching skills' : 'No skills found'}
        </p>
      )}
    </div>
  )
}

function SkillRow({
  skill,
  onRun,
  onEdit,
  onDelete,
  onExport
}: {
  skill: SkillInfo
  onRun: () => void
  onEdit: () => void
  onDelete: () => void
  onExport: () => void
}): React.JSX.Element {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="group rounded-md border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] px-2.5 py-2 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/70">/{skill.name}</span>
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-white/40">Delete?</span>
            <button
              onClick={() => { onDelete(); setConfirmDelete(false) }}
              className="text-red-400 hover:text-red-300 transition-colors"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-white/40 hover:text-white/60 transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
            <button
              onClick={onEdit}
              className="text-[10px] text-white/40 hover:text-white/70 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={onExport}
              className="text-[10px] text-white/40 hover:text-white/70 transition-colors"
            >
              Exp
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-[10px] text-white/40 hover:text-red-400 transition-colors"
            >
              Del
            </button>
            <button
              onClick={onRun}
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
            >
              Run
            </button>
          </div>
        )}
      </div>
      <p className="mt-0.5 text-[10px] text-white/30 truncate">{skill.description}</p>
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
        className="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/80 placeholder-white/20 outline-none focus:border-white/[0.15]"
      />
      {filtered.length > 0 ? (
        <div>
          <SectionLabel label="CLI Reference" />
          <p className="px-2 mb-1.5 text-[10px] text-white/20">
            These commands work in the Claude Code CLI terminal, not in coide chat.
          </p>
          <div className="space-y-0.5">
            {filtered.map((cmd) => (
              <div
                key={cmd.name}
                className="rounded-md px-2 py-1.5"
              >
                <div className="text-xs font-mono text-white/40">{cmd.name}</div>
                <div className="text-[10px] text-white/25">{cmd.description}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-center text-[10px] text-white/20 py-4">No matching commands</p>
      )}
    </div>
  )
}
