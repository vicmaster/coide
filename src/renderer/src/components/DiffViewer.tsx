import React from 'react'
import { loader, DiffEditor } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { detectLanguage } from '../utils/diff'
import { useMonacoCoideTheme } from '../hooks/useMonacoCoideTheme'

// Use local monaco-editor instead of CDN (which may not load in Electron)
loader.config({ monaco })

// Disable Monaco's built-in workers (we only use it for diffs, not editing)
// This prevents the "ts.worker.js does not exist" warning from Vite
self.MonacoEnvironment = {
  getWorker: () => new Worker(URL.createObjectURL(new Blob([''], { type: 'text/javascript' })))
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
  const { defined: themeDefined, theme } = useMonacoCoideTheme({ withDiff: true })
  const language = detectLanguage(filePath)
  const fileName = filePath.split('/').pop() ?? filePath

  return (
    <div className="rounded-lg overflow-hidden border border-line-soft">
      {/* File path header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-overlay-1 border-b border-line-soft">
        <span className="text-[10px] font-mono text-fg-subtle truncate">{fileName}</span>
        <span className="text-[10px] text-fg-faint truncate ml-auto">{filePath}</span>
      </div>

      {/* Monaco DiffEditor */}
      <div style={{ height }}>
        {themeDefined ? (
          <DiffEditor
            original={original}
            modified={modified}
            language={language}
            theme={theme}
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
          <div className="flex items-center justify-center h-full text-fg-faint text-xs">
            Loading diff...
          </div>
        )}
      </div>
    </div>
  )
}
