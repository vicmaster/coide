import React, { useState, useEffect, useCallback } from 'react'
import { loader, Editor, useMonaco } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { useSkillEditorStore } from '../store/skillEditor'
import { useSessionsStore } from '../store/sessions'

loader.config({ monaco })

const THEME_NAME = 'coide-dark'

function useCoideTheme(): boolean {
  const m = useMonaco()
  const [defined, setDefined] = useState(false)

  useEffect(() => {
    if (m && !defined) {
      m.editor.defineTheme(THEME_NAME, {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#111111',
          'editorLineNumber.foreground': '#ffffff18',
          'editorGutter.background': '#111111',
          'scrollbar.shadow': '#00000000',
          'editorOverviewRuler.border': '#00000000'
        }
      })
      setDefined(true)
    }
  }, [m, defined])

  return defined
}

const TEMPLATE = '# Skill Name\n\nDescribe what this skill does...\n'

export default function SkillEditorModal(): React.JSX.Element | null {
  const { isOpen, mode, skillName, skillScope, filePath, close } = useSkillEditorStore()
  const themeDefined = useCoideTheme()

  const [name, setName] = useState('')
  const [scope, setScope] = useState<'global' | 'project'>('project')
  const [content, setContent] = useState(TEMPLATE)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  const cwd = useSessionsStore((s) => {
    const session = s.sessions.find((sess) => sess.id === s.activeSessionId)
    return session?.cwd ?? localStorage.getItem('cwd') ?? ''
  })

  // Reset state when modal opens
  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setSaving(false)

    if (mode === 'create') {
      setName('')
      setScope(skillScope)
      setContent(TEMPLATE)
    } else {
      setName(skillName)
      setScope(skillScope)
      if (filePath) {
        setLoading(true)
        window.api.fs
          .readFile(filePath)
          .then((res) => {
            if (res.error) setError(res.error)
            else setContent(res.content ?? '')
          })
          .catch((err: Error) => setError(err.message))
          .finally(() => setLoading(false))
      }
    }
  }, [isOpen, mode, skillName, skillScope, filePath])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    },
    [close]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  const handleSave = async (): Promise<void> => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Skill name is required.')
      return
    }
    if (/[^a-zA-Z0-9_-]/.test(trimmedName)) {
      setError('Name can only contain letters, numbers, hyphens, and underscores.')
      return
    }
    if (!content.trim()) {
      setError('Skill content cannot be empty.')
      return
    }

    setSaving(true)
    setError(null)
    const result = await window.api.skills.write(scope, trimmedName, content, cwd)
    setSaving(false)

    if (result.error) {
      setError(result.error)
    } else {
      window.dispatchEvent(new Event('coide:skills-changed'))
      close()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-[90vw] max-w-3xl rounded-xl border border-white/[0.08] bg-[#0d0d0d] shadow-2xl overflow-hidden flex flex-col"
        style={{ height: '75vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.06] flex-shrink-0">
          <span className="text-sm font-medium text-white/80">
            {mode === 'create' ? 'New Skill' : `Edit /${skillName}`}
          </span>
          <button
            onClick={close}
            className="ml-auto text-white/30 hover:text-white/70 transition-colors text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        {/* Name + Scope */}
        <div className="px-4 py-3 border-b border-white/[0.06] flex-shrink-0 space-y-3">
          {/* Name input */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-white/30 mb-1.5">
              Name
            </label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-white/30">/</span>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))
                  setError(null)
                }}
                disabled={mode === 'edit'}
                placeholder="my-skill"
                className="flex-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-sm text-white/80 placeholder-white/20 outline-none focus:border-white/[0.15] disabled:opacity-50 disabled:cursor-not-allowed"
                autoFocus
              />
            </div>
          </div>

          {/* Scope selector — create mode only */}
          {mode === 'create' && (
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-white/30 mb-1.5">
                Scope
              </label>
              <div className="flex gap-1">
                {(['project', 'global'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    className={`flex-1 rounded-md py-1.5 text-xs font-medium capitalize transition-colors ${
                      scope === s
                        ? 'bg-white/10 text-white'
                        : 'text-white/35 hover:text-white/60 hover:bg-white/5 border border-white/[0.06]'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-white/20">
                {scope === 'project'
                  ? 'Saved to .claude/skills/ in your project'
                  : 'Saved to ~/.claude/skills/ (available everywhere)'}
              </p>
            </div>
          )}
        </div>

        {/* Monaco Editor */}
        <div className="flex-1 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-full text-white/20 text-sm">
              Loading...
            </div>
          ) : (
            themeDefined && (
              <Editor
                value={content}
                onChange={(v) => setContent(v ?? '')}
                language="markdown"
                theme={THEME_NAME}
                options={{
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  lineNumbers: 'on',
                  folding: true,
                  glyphMargin: false,
                  lineDecorationsWidth: 0,
                  lineNumbersMinChars: 4,
                  renderOverviewRuler: false,
                  overviewRulerBorder: false,
                  wordWrap: 'on',
                  scrollbar: {
                    vertical: 'auto',
                    horizontal: 'auto',
                    verticalScrollbarSize: 6,
                    horizontalScrollbarSize: 6
                  }
                }}
              />
            )
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03] border-t border-white/[0.06] flex-shrink-0">
          <span className="text-xs text-red-400/80 truncate max-w-[60%]">
            {error ?? ''}
          </span>
          <div className="flex gap-2">
            <button
              onClick={close}
              className="rounded-md px-3 py-1.5 text-xs text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-blue-600/90 hover:bg-blue-600 px-4 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
