import React, { useState, useEffect, useMemo } from 'react'
import type { ToolCallMessage } from '../store/sessions'
import { useSessionsStore } from '../store/sessions'
import DiffViewer from './DiffViewer'
import { buildDiffFromToolInput } from '../utils/diff'
import { useFilePreviewStore } from '../store/filePreview'
import { useSettingsStore } from '../store/settings'
import { detectError, type DetectedError } from '../utils/errorDetection'

const TOOL_ICONS: Record<string, string> = {
  Bash: '$',
  Read: 'R',
  Write: 'W',
  Edit: 'E',
  Glob: '*',
  Grep: '/',
  Task: 'T',
  WebFetch: '↗',
  WebSearch: '↗',
  TodoWrite: '✓',
  TodoRead: '✓',
  TaskCreate: '✓',
  TaskUpdate: '✓',
  TaskList: '✓',
  TaskGet: '✓'
}

function toolIcon(name: string): string {
  return TOOL_ICONS[name] ?? '⚙'
}

// Format tool input into a readable one-liner summary
function inputSummary(name: string, input: Record<string, unknown>): string {
  if (name === 'Bash') return String(input.command ?? '').split('\n')[0].slice(0, 80)
  if (name === 'Read') return String(input.file_path ?? input.path ?? '')
  if (name === 'Write' || name === 'Edit') return String(input.file_path ?? input.path ?? '')
  if (name === 'Glob') return String(input.pattern ?? '')
  if (name === 'Grep') return String(input.pattern ?? '')
  if (name === 'WebFetch' || name === 'WebSearch') return String(input.url ?? input.query ?? '')
  if (name === 'TaskCreate') return String(input.subject ?? '')
  if (name === 'TaskUpdate') return `#${input.taskId ?? '?'} → ${input.status ?? '?'}`
  if (name === 'TaskList') return 'List all tasks'
  if (name === 'TaskGet') return `#${input.taskId ?? '?'}`
  const first = Object.values(input)[0]
  return first != null ? String(first).slice(0, 60) : ''
}

function truncateResult(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '\n... (truncated)'
}

function handleFixThis(message: ToolCallMessage): void {
  const command =
    message.tool_name === 'Bash' ? String(message.input.command ?? '').split('\n')[0] : ''

  const prompt = command
    ? `The command \`${command}\` failed with this error:\n\n\`\`\`\n${truncateResult(message.result!, 500)}\n\`\`\`\n\nPlease fix this error.`
    : `The ${message.tool_name} tool failed with this error:\n\n\`\`\`\n${truncateResult(message.result!, 500)}\n\`\`\`\n\nPlease fix this error.`

  useSessionsStore.getState().setPendingAction({ type: 'send', text: prompt })
}

function handleExplainError(message: ToolCallMessage): void {
  const prompt = `Explain this error in simple terms:\n\n\`\`\`\n${truncateResult(message.result!, 500)}\n\`\`\`\n\nWhat went wrong and what are possible fixes?`

  useSessionsStore.getState().setPendingAction({ type: 'send', text: prompt })
}

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write'])

function ToolCallCardInner({
  message,
  isLoading
}: {
  message: ToolCallMessage
  isLoading?: boolean
}): React.JSX.Element {
  const compact = useSettingsStore((s) => s.compactMode)
  const isFileOp = message.tool_name === 'Edit' || message.tool_name === 'Write'
  const [expanded, setExpanded] = useState(isFileOp)
  const done = message.result !== undefined
  const denied = message.denied === true
  const summary = inputSummary(message.tool_name, message.input)
  const hasFilePath = FILE_TOOLS.has(message.tool_name) && !!summary

  const diff = useMemo(
    () => isFileOp ? buildDiffFromToolInput(message.tool_name, message.input, message.originalContent) : null,
    [isFileOp, message.tool_name, message.input, message.originalContent]
  )

  const error: DetectedError | null = useMemo(
    () => (done && !denied && message.result ? detectError(message.tool_name, message.result) : null),
    [done, denied, message.result, message.tool_name]
  )

  // Auto-expand on error
  useEffect(() => {
    if (error) setExpanded(true)
  }, [error])

  const dotClass = denied
    ? 'bg-red-500/60'
    : error?.severity === 'error'
      ? 'bg-red-400/70'
      : error?.severity === 'warning'
        ? 'bg-orange-400/70'
        : done
          ? 'bg-green-500/60'
          : 'bg-yellow-400/70 animate-pulse'

  const borderClass = denied
    ? 'border-red-500/[0.12] bg-red-500/[0.03]'
    : error?.severity === 'error'
      ? 'border-red-400/[0.15] bg-red-500/[0.04]'
      : error?.severity === 'warning'
        ? 'border-orange-400/[0.12] bg-orange-500/[0.03]'
        : 'border-white/[0.07] bg-white/[0.025]'

  return (
    <div className={`${compact ? 'my-0.5' : 'my-1'} rounded-lg border overflow-hidden text-xs ${borderClass}`}>
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`w-full flex items-center gap-2 ${compact ? 'px-2 py-1.5' : 'px-3 py-2'} text-left hover:bg-white/[0.03] transition-colors`}
      >
        {/* Status dot */}
        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotClass}`} />

        {/* Icon */}
        <span className="font-mono text-white/25 w-3 text-center flex-shrink-0">
          {toolIcon(message.tool_name)}
        </span>

        {/* Tool name */}
        <span className={`font-medium flex-shrink-0 ${denied ? 'text-red-400/60' : 'text-white/50'}`}>
          {message.tool_name}
        </span>

        {/* Status labels for file ops */}
        {isFileOp && denied && (
          <span className="text-[10px] text-red-400/50 flex-shrink-0">
            rejected — file not modified
          </span>
        )}
        {isFileOp && done && !denied && (
          <span className="text-[10px] text-green-400/40 flex-shrink-0">file updated</span>
        )}

        {/* Denied label for non-file ops */}
        {!isFileOp && denied && (
          <span className="text-[10px] text-red-400/50 flex-shrink-0">denied</span>
        )}

        {/* Error summary badge */}
        {error && (
          <span
            className={`text-[10px] flex-shrink-0 ${
              error.severity === 'error' ? 'text-red-400/70' : 'text-orange-400/60'
            }`}
          >
            {error.summary}
          </span>
        )}

        {/* Summary */}
        {summary && !denied && !error && (
          hasFilePath ? (
            <span
              className="text-blue-400/60 hover:text-blue-400 font-mono truncate min-w-0 cursor-pointer transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                useFilePreviewStore.getState().open(summary)
              }}
            >
              {summary}
            </span>
          ) : (
            <span className="text-white/25 font-mono truncate min-w-0">{summary}</span>
          )
        )}

        {/* Expand toggle */}
        <span className="ml-auto text-white/15 flex-shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06]">
          {/* Diff view for file operations */}
          {diff ? (
            <div className="p-3">
              <DiffViewer
                filePath={diff.filePath}
                original={diff.original}
                modified={diff.modified}
                height={240}
              />
            </div>
          ) : (
            /* Raw input for other tools */
            <div className="px-3 py-2">
              <p className="text-[10px] text-white/20 uppercase tracking-wider mb-1.5">Input</p>
              <pre className="text-[11px] text-white/50 font-mono overflow-x-auto whitespace-pre-wrap break-words leading-relaxed max-h-40 overflow-y-auto">
                {JSON.stringify(message.input, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          {done && !denied && (
            <div className="px-3 py-2 border-t border-white/[0.05]">
              <p className="text-[10px] text-white/20 uppercase tracking-wider mb-1.5">Output</p>
              <pre className="text-[11px] text-white/50 font-mono overflow-x-auto whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-y-auto">
                {message.result || '(empty)'}
              </pre>
            </div>
          )}

          {/* Error action buttons */}
          {done && !denied && error && (
            <div className="px-3 py-2 border-t border-white/[0.05] flex gap-2">
              <button
                disabled={isLoading}
                onClick={() => handleFixThis(message)}
                className="text-[11px] px-2.5 py-1 rounded bg-red-500/10 text-red-400/80 hover:bg-red-500/20 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Fix this
              </button>
              <button
                disabled={isLoading}
                onClick={() => handleExplainError(message)}
                className="text-[11px] px-2.5 py-1 rounded bg-white/[0.05] text-white/40 hover:bg-white/[0.08] hover:text-white/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Explain error
              </button>
            </div>
          )}

          {!done && !denied && (
            <div className="px-3 py-2 border-t border-white/[0.05]">
              <span className="text-[11px] text-white/20 italic">Running…</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ToolCallCard = React.memo(ToolCallCardInner)
export default ToolCallCard
