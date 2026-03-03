import React, { useState, useEffect, useCallback } from 'react'
import { loader, Editor, useMonaco } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { useFilePreviewStore } from '../store/filePreview'
import { useSessionsStore } from '../store/sessions'
import { detectLanguage } from '../utils/diff'

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

function resolvePath(filePath: string, cwd: string): string {
  if (filePath.startsWith('/')) return filePath
  // Strip leading ./ if present
  const cleaned = filePath.startsWith('./') ? filePath.slice(2) : filePath
  return `${cwd.replace(/\/$/, '')}/${cleaned}`
}

export default function FilePreviewModal(): React.JSX.Element | null {
  const filePath = useFilePreviewStore((s) => s.filePath)
  const close = useFilePreviewStore((s) => s.close)
  const themeDefined = useCoideTheme()

  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Resolve relative paths against active session CWD
  const cwd = useSessionsStore((s) => {
    const session = s.sessions.find((sess) => sess.id === s.activeSessionId)
    return session?.cwd ?? ''
  })

  const resolvedPath = filePath ? resolvePath(filePath, cwd) : null
  const fileName = resolvedPath?.split('/').pop() ?? ''
  const language = resolvedPath ? detectLanguage(resolvedPath) : 'plaintext'

  useEffect(() => {
    if (!resolvedPath) {
      setContent(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    setContent(null)
    window.api.fs
      .readFile(resolvedPath)
      .then((res) => {
        if (res.error) setError(res.error)
        else setContent(res.content ?? '')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [resolvedPath])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    },
    [close]
  )

  useEffect(() => {
    if (filePath) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [filePath, handleKeyDown])

  if (!filePath) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-[90vw] max-w-5xl rounded-xl border border-white/[0.08] bg-[#0d0d0d] shadow-2xl overflow-hidden flex flex-col"
        style={{ height: '75vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.06] flex-shrink-0">
          <span className="text-sm font-medium text-white/80 truncate">{fileName}</span>
          <span className="text-xs text-white/20 truncate ml-1">{resolvedPath}</span>
          <button
            onClick={close}
            className="ml-auto text-white/30 hover:text-white/70 transition-colors text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0">
          {loading && (
            <div className="flex items-center justify-center h-full text-white/20 text-sm">
              Loading...
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full text-red-400/60 text-sm px-8 text-center">
              {error}
            </div>
          )}
          {content !== null && !loading && !error && themeDefined && (
            <Editor
              value={content}
              language={language}
              theme={THEME_NAME}
              options={{
                readOnly: true,
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
                scrollbar: {
                  vertical: 'auto',
                  horizontal: 'auto',
                  verticalScrollbarSize: 6,
                  horizontalScrollbarSize: 6
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
