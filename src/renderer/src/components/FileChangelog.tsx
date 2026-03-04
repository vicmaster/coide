import React, { useState, useMemo, useCallback, memo } from 'react'
import { useSessionsStore, type Message } from '../store/sessions'
import { buildFileChangelog, type FileChangelogEntry, type FileStatus } from '../utils/changelog'
import DiffViewer from './DiffViewer'

const EMPTY_MESSAGES: Message[] = []
const STATUS_BADGE: Record<FileStatus | 'reverted' | 'deleted', { label: string; className: string }> = {
  created: { label: 'new', className: 'bg-green-500/20 text-green-400' },
  modified: { label: 'modified', className: 'bg-blue-500/20 text-blue-400' },
  read: { label: 'read', className: 'bg-white/10 text-white/40' },
  reverted: { label: 'reverted', className: 'bg-yellow-500/20 text-yellow-400' },
  deleted: { label: 'deleted', className: 'bg-red-500/20 text-red-400/60' }
}

export default function FileChangelog(): React.JSX.Element {
  const messages = useSessionsStore((state) => {
    const session = state.sessions.find((s) => s.id === state.activeSessionId)
    return session?.messages ?? EMPTY_MESSAGES
  })

  const entries = useMemo(() => buildFileChangelog(messages), [messages])

  const modifiedCount = entries.filter((e) => e.status === 'modified').length
  const createdCount = entries.filter((e) => e.status === 'created').length

  if (entries.length === 0) {
    return (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/20 px-1 mb-2">
          Files
        </p>
        <p className="text-[11px] text-white/20 text-center mt-4">
          Files appear here when Claude reads or edits them
        </p>
      </div>
    )
  }

  const parts: string[] = []
  if (modifiedCount > 0) parts.push(`${modifiedCount} modified`)
  if (createdCount > 0) parts.push(`${createdCount} new`)

  return (
    <div>
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/20">Files</p>
        {parts.length > 0 && (
          <span className="text-[10px] text-white/30 font-mono">{parts.join(' · ')}</span>
        )}
      </div>
      <div className="space-y-0.5">
        {entries.map((entry) => (
          <FileChangelogRow key={entry.filePath} entry={entry} />
        ))}
      </div>
    </div>
  )
}

const FileChangelogRow = memo(function FileChangelogRow({
  entry
}: {
  entry: FileChangelogEntry
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [diskContent, setDiskContent] = useState<string | null>(null)
  const [fileExists, setFileExists] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [reverted, setReverted] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const isWriteOp = entry.status === 'created' || entry.status === 'modified'
  // File already gone from disk — nothing to revert or delete
  const alreadyGone = fileExists === false && !reverted
  const canRevert = !reverted && !alreadyGone && isWriteOp
  const canDiff = !reverted && !alreadyGone && entry.status !== 'read'

  // Pick the right badge
  let badgeKey: FileStatus | 'reverted' | 'deleted'
  if (reverted) badgeKey = 'reverted'
  else if (alreadyGone && entry.status === 'created') badgeKey = 'deleted'
  else badgeKey = entry.status
  const badge = STATUS_BADGE[badgeKey]

  const fileName = entry.filePath.split('/').pop() ?? entry.filePath
  const dirPath = entry.filePath.split('/').slice(0, -1).join('/')

  // Revert label: "Delete" for created files, "Revert" for modified
  const revertLabel = entry.status === 'created' ? 'Delete' : 'Revert'

  const fetchDisk = useCallback(async () => {
    setLoading(true)
    const result = await window.api.fs.readFile(entry.filePath)
    if (result.error) {
      setFileExists(false)
      setDiskContent(null)
    } else {
      setFileExists(true)
      setDiskContent(result.content ?? '')
    }
    setLoading(false)
  }, [entry.filePath])

  const handleExpand = useCallback(async () => {
    if (entry.status === 'read') return
    const next = !expanded
    setExpanded(next)
    if (next && fileExists === null) {
      await fetchDisk()
    }
  }, [entry.status, expanded, fileExists, fetchDisk])

  const handleRevert = useCallback(async () => {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 3000)
      return
    }
    const result = await window.api.fs.revertFile(entry.filePath, entry.firstOriginalContent)
    if (result.success) {
      setReverted(true)
      setExpanded(false)
      setConfirming(false)
    }
  }, [confirming, entry.filePath, entry.firstOriginalContent])

  const expandable = entry.status !== 'read'

  return (
    <div className="rounded-md border border-transparent hover:border-white/[0.06] transition-colors">
      <div
        className={`flex items-center gap-2 px-2 py-1.5 ${expandable ? 'cursor-pointer' : ''}`}
        onClick={handleExpand}
      >
        {expandable && (
          <span className={`text-[10px] text-white/20 transition-transform ${expanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
        )}
        <div className="min-w-0 flex-1">
          <span className={`text-[11px] truncate block ${alreadyGone ? 'text-white/25 line-through' : 'text-white/50'}`}>
            {fileName}
          </span>
          {dirPath && (
            <span className="text-[10px] text-white/15 truncate block">{dirPath}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {entry.editCount > 1 && (
            <span className="text-[10px] text-white/20 font-mono">{entry.editCount} edits</span>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${badge.className}`}>
            {badge.label}
          </span>
        </div>
      </div>

      {expanded && expandable && (
        <div className="px-2 pb-2">
          {loading && (
            <div className="flex items-center justify-center py-4 text-white/20 text-xs">
              Loading...
            </div>
          )}
          {alreadyGone && (
            <div className="text-[11px] text-white/20 py-2 px-1">File no longer exists on disk</div>
          )}
          {canDiff && diskContent !== null && !loading && (
            <DiffViewer
              filePath={entry.filePath}
              original={entry.firstOriginalContent ?? ''}
              modified={diskContent}
              height={200}
              renderSideBySide={false}
            />
          )}
          <div className="flex items-center justify-end gap-2 mt-1.5">
            {!alreadyGone && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  fetchDisk()
                }}
                className="text-[10px] text-white/20 hover:text-white/40 transition-colors"
                title="Refresh"
              >
                ↻
              </button>
            )}
            {canRevert && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleRevert()
                }}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  confirming
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-white/5 text-white/30 hover:text-white/50 hover:bg-white/10'
                }`}
              >
                {confirming ? 'Confirm?' : revertLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
