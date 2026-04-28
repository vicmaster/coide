import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useSessionsStore } from '../store/sessions'
import { useMonacoCoideTheme } from '../hooks/useMonacoCoideTheme'
import MarkdownRenderer from './MarkdownRenderer'

const SOURCE_ORDER: MemorySource[] = ['project-memory', 'project-claude', 'global-claude', 'subagent-claude']
const SOURCE_LABEL: Record<MemorySource, string> = {
  'project-memory': 'PROJECT MEMORY',
  'project-claude': 'CLAUDE.MD',
  'global-claude': 'CLAUDE.MD',
  'subagent-claude': 'SUBAGENTS'
}

const TYPE_TONE: Record<NonNullable<MemoryType>, { fg: string; bg: string }> = {
  project: { fg: 'text-blue-400/80', bg: 'bg-blue-500/15' },
  feedback: { fg: 'text-amber-400/80', bg: 'bg-amber-500/15' },
  user: { fg: 'text-purple-400/80', bg: 'bg-purple-500/15' },
  reference: { fg: 'text-emerald-400/80', bg: 'bg-emerald-500/15' }
}

function formatRelative(mtime?: number): string {
  if (!mtime) return ''
  const diff = Date.now() - mtime
  const min = 60_000
  const hr = 60 * min
  const day = 24 * hr
  if (diff < min) return 'just now'
  if (diff < hr) return `${Math.floor(diff / min)}m ago`
  if (diff < day) return `${Math.floor(diff / hr)}h ago`
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`
  const d = new Date(mtime)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function MemoryTab(): React.JSX.Element {
  const cwd = useSessionsStore(
    (s) => s.sessions.find((sess) => sess.id === s.activeSessionId)?.cwd ?? ''
  )

  const [files, setFiles] = useState<MemoryFile[]>([])
  const [memoryDir, setMemoryDir] = useState('')
  const [selected, setSelected] = useState<MemoryFile | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!cwd) return
    setLoading(true)
    try {
      const result = await window.api.memory.list(cwd)
      setFiles(result.files ?? [])
      setMemoryDir(result.projectMemoryDir ?? '')
    } finally {
      setLoading(false)
    }
  }, [cwd])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (!cwd) {
    return (
      <div className="flex-1 p-3">
        <p className="text-[11px] text-fg-faint text-center mt-4">No active session</p>
      </div>
    )
  }

  if (selected) {
    return (
      <MemoryEditor
        file={selected}
        cwd={cwd}
        onBack={() => {
          setSelected(null)
          refresh()
        }}
        onDelete={async () => {
          await window.api.memory.delete(selected.filePath, cwd)
          setSelected(null)
          refresh()
        }}
      />
    )
  }

  const filtered = files.filter((f) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      f.name.toLowerCase().includes(q) ||
      (f.description?.toLowerCase().includes(q) ?? false)
    )
  })

  const grouped = SOURCE_ORDER.map((source) => ({
    source,
    files: filtered.filter((f) => f.source === source)
  }))

  return (
    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
      <div className="flex items-center gap-1.5 rounded-md bg-overlay-1 border border-line-soft px-2 py-1.5">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="text-fg-faint flex-shrink-0">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search memories…"
          className="flex-1 bg-transparent text-[11px] text-fg-muted placeholder:text-fg-faint outline-none font-mono"
        />
        <button
          onClick={refresh}
          className="p-0.5 rounded hover:bg-overlay-2 text-fg-faint hover:text-fg-subtle"
          title="Reload"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M1 4v4h4M15 12V8h-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2.5 10a6 6 0 0110.2-3M13.5 6a6 6 0 01-10.2 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {loading && files.length === 0 ? (
        <p className="text-[11px] text-fg-faint text-center mt-4">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState onCreate={() => setSelected(makeNewMemoryDraft(memoryDir))} />
      ) : (
        grouped.map((group, idx) => {
          if (group.files.length === 0) return null
          const showHeader =
            idx === 0 ||
            SOURCE_LABEL[group.source] !== SOURCE_LABEL[grouped[idx - 1]?.source]
          return (
            <div key={group.source} className="flex flex-col gap-1.5">
              {showHeader && (
                <div className="flex items-center justify-between px-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-fg-faint">
                    {SOURCE_LABEL[group.source]}
                  </p>
                  {group.source === 'project-memory' && (
                    <button
                      onClick={() => setSelected(makeNewMemoryDraft(memoryDir))}
                      className="text-[9px] font-semibold tracking-wider text-blue-400/70 hover:text-blue-400"
                    >
                      + NEW
                    </button>
                  )}
                </div>
              )}
              {group.files.map((file) => (
                <MemoryRow key={file.filePath} file={file} onSelect={() => setSelected(file)} />
              ))}
            </div>
          )
        })
      )}
    </div>
  )
}

function makeNewMemoryDraft(memoryDir: string): MemoryFile {
  return {
    filePath: `${memoryDir}/new_memory.md`,
    source: 'project-memory',
    name: 'new_memory.md',
    exists: false
  }
}

function EmptyState({ onCreate }: { onCreate: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
      <div className="h-10 w-10 rounded-full bg-overlay-1 border border-line-soft flex items-center justify-center text-fg-subtle">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 2.5h6.5L13 6v7.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-10a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
          <path d="M9 2.5V6h4" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </div>
      <p className="text-xs text-fg-muted">No memories yet</p>
      <p className="text-[10px] text-fg-faint leading-relaxed max-w-[200px]">
        Memories appear here when Claude records learnings across sessions.
      </p>
      <button
        onClick={onCreate}
        className="mt-2 px-2.5 py-1 rounded bg-overlay-2 hover:bg-overlay-3 border border-line-soft text-[10px] font-medium text-fg-muted hover:text-fg-strong transition-colors"
      >
        + New memory
      </button>
    </div>
  )
}

function MemoryRow({
  file,
  onSelect
}: {
  file: MemoryFile
  onSelect: () => void
}): React.JSX.Element {
  if (file.source === 'project-memory' && !file.isIndex) {
    return <MemoryEntryRow file={file} onSelect={onSelect} />
  }
  return <FileAnchorRow file={file} onSelect={onSelect} />
}

function MemoryEntryRow({
  file,
  onSelect
}: {
  file: MemoryFile
  onSelect: () => void
}): React.JSX.Element {
  const tone = file.memoryType ? TYPE_TONE[file.memoryType] : null
  const displayName = file.name.replace(/\.md$/, '').replace(/^(project|feedback|user|reference)_/, '').replace(/_/g, ' ')
  return (
    <button
      onClick={onSelect}
      className="text-left rounded-md px-2 py-1.5 bg-overlay-1 hover:bg-overlay-2 border border-line-soft hover:border-line transition-colors"
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        {tone && (
          <span className={`px-1 py-px rounded text-[8px] font-semibold ${tone.fg} ${tone.bg}`}>
            {file.memoryType}
          </span>
        )}
        <span className="text-[11px] text-fg-muted truncate">{displayName}</span>
      </div>
      {file.description && (
        <p className="text-[9px] text-fg-faint leading-snug line-clamp-2">{file.description}</p>
      )}
    </button>
  )
}

function FileAnchorRow({
  file,
  onSelect
}: {
  file: MemoryFile
  onSelect: () => void
}): React.JSX.Element {
  const labels: Record<MemorySource, { primary: string; secondary: (f: MemoryFile) => string }> = {
    'project-memory': { primary: 'MEMORY.md (index)', secondary: () => 'project memory index' },
    'project-claude': { primary: 'Project · ./CLAUDE.md', secondary: (f) => f.exists ? formatMeta(f) : 'missing — click to create' },
    'global-claude': { primary: 'Global · ~/.claude/CLAUDE.md', secondary: (f) => f.exists ? formatMeta(f) : 'missing — click to create' },
    'subagent-claude': { primary: file.name, secondary: () => '.claude/agents/' }
  }
  const { primary, secondary } = labels[file.source]
  return (
    <button
      onClick={onSelect}
      className="text-left rounded-md px-2 py-1.5 hover:bg-overlay-2 transition-colors flex items-center gap-2"
    >
      <span className="text-fg-faint flex-shrink-0">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path d="M3 2.5h6.5L13 6v7.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-10a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
          <path d="M9 2.5V6h4" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-fg-muted truncate">{primary}</p>
        <p className="text-[9px] text-fg-faint truncate font-mono">{secondary(file)}</p>
      </div>
    </button>
  )
}

function formatMeta(file: MemoryFile): string {
  const parts: string[] = []
  if (file.mtime) parts.push(`edited ${formatRelative(file.mtime)}`)
  if (file.size) parts.push(`${(file.size / 1024).toFixed(1)} KB`)
  return parts.join(' · ')
}

function MemoryEditor({
  file,
  cwd,
  onBack,
  onDelete
}: {
  file: MemoryFile
  cwd: string
  onBack: () => void
  onDelete: () => void
}): React.JSX.Element {
  const [content, setContent] = useState<string>('')
  const [original, setOriginal] = useState<string>('')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { defined: themeDefined, theme } = useMonacoCoideTheme()

  const dirty = content !== original

  useEffect(() => {
    let cancelled = false
    const init = async (): Promise<void> => {
      if (!file.exists) {
        const seed = file.source === 'project-memory'
          ? "---\nname: \ndescription: \ntype: \n---\n\n"
          : ''
        if (!cancelled) {
          setContent(seed)
          setOriginal(seed)
          setLoaded(true)
        }
        return
      }
      const result = await window.api.memory.read(file.filePath, cwd)
      if (cancelled) return
      if (result.error) {
        setError(result.error)
      } else {
        setContent(result.content ?? '')
        setOriginal(result.content ?? '')
      }
      setLoaded(true)
    }
    init()
    return () => {
      cancelled = true
    }
  }, [file, cwd])

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    const result = await window.api.memory.write(file.filePath, content, cwd)
    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else {
      setOriginal(content)
    }
  }, [file, content, cwd])

  const canDelete = file.source === 'project-memory' && !file.isIndex && file.exists

  const headerLabel = useMemo(() => file.name, [file])

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-2 border-b border-line-soft">
        <button
          onClick={onBack}
          className="p-0.5 rounded hover:bg-overlay-2 text-fg-muted hover:text-fg-strong"
          title="Back"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 3l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-[11px] font-medium text-fg-strong truncate flex-1" title={file.filePath}>
          {headerLabel}
        </span>
        {dirty && <span className="text-[9px] text-amber-400/70 flex-shrink-0">●</span>}
      </div>

      <div className="flex items-center justify-between gap-2 px-3">
        <div className="flex bg-overlay-1 border border-line-soft rounded p-0.5 gap-0.5">
          <button
            onClick={() => setMode('edit')}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              mode === 'edit' ? 'bg-overlay-3 text-fg-strong' : 'text-fg-subtle hover:text-fg-muted'
            }`}
          >
            Edit
          </button>
          <button
            onClick={() => setMode('preview')}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              mode === 'preview' ? 'bg-overlay-3 text-fg-strong' : 'text-fg-subtle hover:text-fg-muted'
            }`}
          >
            Preview
          </button>
        </div>
        <div className="flex items-center gap-1">
          {canDelete && (
            <button
              onClick={onDelete}
              className="px-1.5 py-0.5 rounded hover:bg-red-500/10 text-fg-faint hover:text-red-400 text-[10px] font-medium transition-colors"
              title="Delete memory"
            >
              Delete
            </button>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              !dirty || saving
                ? 'bg-overlay-2 text-fg-faint cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-3 px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-[10px] text-red-400/80 font-mono">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 px-3 pb-3 overflow-hidden">
        {!loaded ? (
          <p className="text-[11px] text-fg-faint text-center mt-4">Loading…</p>
        ) : mode === 'edit' ? (
          <div className="h-full rounded border border-line-soft overflow-hidden">
            {themeDefined && (
              <Editor
                value={content}
                onChange={(v) => setContent(v ?? '')}
                language="markdown"
                theme={theme}
                options={{
                  fontSize: 12,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  folding: false,
                  glyphMargin: false,
                  lineDecorationsWidth: 0,
                  lineNumbersMinChars: 3,
                  overviewRulerBorder: false,
                  scrollbar: {
                    vertical: 'auto',
                    horizontal: 'auto',
                    verticalScrollbarSize: 4,
                    horizontalScrollbarSize: 4
                  }
                }}
              />
            )}
          </div>
        ) : (
          <div className="h-full overflow-auto rounded border border-line-soft bg-surface-2 p-3">
            <MarkdownRenderer>{content || '*(empty)*'}</MarkdownRenderer>
          </div>
        )}
      </div>
    </div>
  )
}
