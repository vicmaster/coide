import React, { Suspense } from 'react'
import type { DiffViewerProps } from './DiffViewer'

// Lazy boundary so monaco-editor (~MBs) stays out of the initial bundle and only
// loads when a diff is actually shown (permission prompt, tool card, changelog).
const DiffViewer = React.lazy(() => import('./DiffViewer'))

export default function LazyDiffViewer(props: DiffViewerProps): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div
          style={{ height: props.height ?? 360 }}
          className="flex items-center justify-center rounded-lg border border-line-soft bg-overlay-1 text-[11px] text-fg-faint"
        >
          Loading diff…
        </div>
      }
    >
      <DiffViewer {...props} />
    </Suspense>
  )
}
