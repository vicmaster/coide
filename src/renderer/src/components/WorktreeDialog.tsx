import React, { useState, useRef, useEffect } from 'react'
import { useSessionsStore } from '../store/sessions'
import { useSettingsStore } from '../store/settings'

type Props = {
  cwd: string
  onClose: () => void
  onCreated: (sessionId: string, initialPrompt?: string) => void
}

export default function WorktreeDialog({ cwd, onClose, onCreated }: Props): React.JSX.Element {
  const [branch, setBranch] = useState('')
  const [prompt, setPrompt] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const defaultCwd = useSettingsStore((s) => s.defaultCwd)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleCreate = async (): Promise<void> => {
    const trimmed = branch.trim()
    if (!trimmed) return

    setCreating(true)
    setError(null)

    try {
      const result = await window.api.git.worktreeCreate(cwd, trimmed)
      if (result.error) {
        setError(result.error)
        setCreating(false)
        return
      }

      const sid = useSessionsStore.getState().createSession(result.path || cwd)
      useSessionsStore.getState().setWorktree(sid, {
        name: trimmed,
        branch: result.branch,
        path: result.path
      })
      useSessionsStore.getState().setGitInfo(sid, { isGitRepo: true, branch: result.branch })

      onCreated(sid, prompt.trim() || undefined)
      onClose()
    } catch (err) {
      setError(String(err))
      setCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCreate()
    }
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[360px] rounded-xl border border-white/[0.1] bg-[#1a1a1a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-purple-400/70">
              <path d="M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9a9 9 0 01-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <h2 className="text-[15px] font-semibold text-white/85">New Worktree Session</h2>
          </div>

          <p className="text-[11px] text-white/35 leading-relaxed">
            Create an isolated session on a separate branch. Changes stay in the worktree and won't affect your main working directory.
          </p>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-white/50">Branch name</label>
            <input
              ref={inputRef}
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="feat/payments"
              className="w-full rounded-md border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-[12px] text-white/80 font-mono placeholder-white/20 outline-none focus:border-purple-500/40"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-white/50">Initial prompt <span className="text-white/20">(optional)</span></label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Implement the payments API…"
              rows={2}
              className="w-full rounded-md border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-[12px] text-white/80 placeholder-white/20 outline-none focus:border-purple-500/40 resize-none"
            />
          </div>

          {error && (
            <p className="text-[11px] text-red-400/80 bg-red-500/10 rounded-md px-3 py-2 border border-red-500/20">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="rounded-md border border-white/[0.1] px-3.5 py-1.5 text-[12px] font-medium text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!branch.trim() || creating}
              className="rounded-md bg-purple-600 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-purple-500 disabled:opacity-30 flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9a9 9 0 01-9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
