import React from 'react'
import DiffViewer from './DiffViewer'
import { buildDiffFromToolInput } from '../utils/diff'

export type PermissionRequest = {
  tool_id: string
  tool_name: string
  input: Record<string, unknown>
  originalContent?: string | null
}

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
  TaskGet: '✓',
  ExitPlanMode: '▶'
}

function toolIcon(name: string): string {
  return TOOL_ICONS[name] ?? '⚙'
}

function inputPreview(name: string, input: Record<string, unknown>): string {
  if (name === 'Bash') return String(input.command ?? '')
  if (name === 'Read') return String(input.file_path ?? input.path ?? '')
  if (name === 'Write' || name === 'Edit') return String(input.file_path ?? input.path ?? '')
  if (name === 'Glob') return `Pattern: ${input.pattern ?? ''}`
  if (name === 'Grep') return `Pattern: ${input.pattern ?? ''}`
  if (name === 'WebFetch' || name === 'WebSearch') return String(input.url ?? input.query ?? '')
  return JSON.stringify(input, null, 2)
}

export default function PermissionDialog({
  permission,
  queueLength,
  onAllow,
  onDeny
}: {
  permission: PermissionRequest
  queueLength: number
  onAllow: () => void
  onDeny: () => void
}): React.JSX.Element {
  const isPlanApproval = permission.tool_name === 'ExitPlanMode'
  const isFileOp = permission.tool_name === 'Edit' || permission.tool_name === 'Write'
  const diff = isFileOp
    ? buildDiffFromToolInput(permission.tool_name, permission.input, permission.originalContent)
    : null

  const preview = isPlanApproval ? '' : inputPreview(permission.tool_name, permission.input)
  const wide = diff != null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={`w-full mx-4 rounded-2xl border border-white/[0.1] bg-[#141414] shadow-2xl p-5 ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg font-mono text-sm flex-shrink-0 ${
            isPlanApproval ? 'bg-blue-400/10 text-blue-400/80' : 'bg-yellow-400/10 text-yellow-400/80'
          }`}>
            {toolIcon(permission.tool_name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-white/30 uppercase tracking-wider">
              {isPlanApproval ? 'Plan ready' : isFileOp ? 'Review file change' : 'Permission required'}
              {queueLength > 1 ? ` (${queueLength} pending)` : ''}
            </p>
            <p className="text-sm font-medium text-white/80">
              {isPlanApproval ? 'Execute this plan?' : permission.tool_name}
              {diff?.isNewFile && (
                <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded bg-green-500/15 text-green-400/70">
                  New file
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Content: plan approval, diff, or text preview */}
        {isPlanApproval ? (
          <div className="rounded-lg bg-blue-500/[0.06] border border-blue-500/[0.12] p-3 mb-5">
            <p className="text-[12px] text-white/50 leading-relaxed">
              Claude has outlined a plan above. Approve to start execution, or reject to cancel.
            </p>
          </div>
        ) : diff ? (
          <div className="mb-5">
            <DiffViewer
              filePath={diff.filePath}
              original={diff.original}
              modified={diff.modified}
              height={360}
            />
          </div>
        ) : (
          <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-3 mb-5">
            <pre className="text-[11px] font-mono text-white/50 whitespace-pre-wrap break-all leading-relaxed max-h-36 overflow-y-auto">
              {preview}
            </pre>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onDeny}
            className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm text-white/50 hover:bg-white/[0.08] hover:text-white/70 transition-colors"
          >
            {isPlanApproval ? 'Reject Plan' : isFileOp ? 'Reject' : 'Deny'}
          </button>
          <button
            onClick={onAllow}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
              isPlanApproval ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {isPlanApproval ? 'Execute Plan' : isFileOp ? 'Accept' : 'Allow'}
          </button>
        </div>
      </div>
    </div>
  )
}
