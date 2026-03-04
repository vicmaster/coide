import React, { useState, useEffect } from 'react'
import { loader, DiffEditor, useMonaco } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { detectLanguage } from '../utils/diff'

// Use local monaco-editor instead of CDN (which may not load in Electron)
loader.config({ monaco })

// Disable Monaco's built-in workers (we only use it for diffs, not editing)
// This prevents the "ts.worker.js does not exist" warning from Vite
self.MonacoEnvironment = {
  getWorker: () => new Worker(URL.createObjectURL(new Blob([''], { type: 'text/javascript' })))
}

const THEME_NAME = 'coide-dark'

function useCoideTheme(): boolean {
  const monaco = useMonaco()
  const [defined, setDefined] = useState(false)

  useEffect(() => {
    if (monaco && !defined) {
      monaco.editor.defineTheme(THEME_NAME, {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#111111',
          'diffEditor.insertedTextBackground': '#22c55e12',
          'diffEditor.removedTextBackground': '#ef444412',
          'diffEditor.insertedLineBackground': '#22c55e08',
          'diffEditor.removedLineBackground': '#ef444408',
          'editorLineNumber.foreground': '#ffffff18',
          'editorGutter.background': '#111111',
          'scrollbar.shadow': '#00000000',
          'editorOverviewRuler.border': '#00000000'
        }
      })
      setDefined(true)
    }
  }, [monaco, defined])

  return defined
}

export default function DiffViewer({
  filePath,
  original,
  modified,
  height = 360,
  renderSideBySide = true
}: {
  filePath: string
  original: string
  modified: string
  height?: number
  renderSideBySide?: boolean
}): React.JSX.Element {
  const themeDefined = useCoideTheme()
  const language = detectLanguage(filePath)
  const fileName = filePath.split('/').pop() ?? filePath

  return (
    <div className="rounded-lg overflow-hidden border border-white/[0.06]">
      {/* File path header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] border-b border-white/[0.06]">
        <span className="text-[10px] font-mono text-white/30 truncate">{fileName}</span>
        <span className="text-[10px] text-white/15 truncate ml-auto">{filePath}</span>
      </div>

      {/* Monaco DiffEditor */}
      <div style={{ height }}>
        {themeDefined ? (
          <DiffEditor
            original={original}
            modified={modified}
            language={language}
            theme={THEME_NAME}
            options={{
              readOnly: true,
              renderSideBySide,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              lineNumbers: 'on',
              folding: false,
              glyphMargin: false,
              lineDecorationsWidth: 0,
              lineNumbersMinChars: 3,
              renderOverviewRuler: false,
              overviewRulerBorder: false,
              scrollbar: {
                vertical: 'auto',
                horizontal: 'auto',
                verticalScrollbarSize: 4,
                horizontalScrollbarSize: 4
              }
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-white/20 text-xs">
            Loading diff...
          </div>
        )}
      </div>
    </div>
  )
}
