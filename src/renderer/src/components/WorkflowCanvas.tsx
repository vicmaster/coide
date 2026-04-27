import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type NodeProps,
  Handle,
  Position,
  BackgroundVariant
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useWorkflowStore } from '../store/workflow'
import { useSessionsStore } from '../store/sessions'
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  WorkflowEvent,
  WorkflowNodeStatus,
  WorkflowInputVar,
  WorkflowNodeData,
  WorkflowExecutionRecord,
  ReviewRequest,
  SetVarSpec,
  WorkflowMetrics,
  WorkflowTrigger,
  MarketplaceIndex,
  MarketplaceEntry
} from '../../../shared/workflow-types'

// --- Constants ---
const AVAILABLE_TOOLS = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch',
  'Task', 'TaskCreate', 'TaskUpdate'
]

// --- Custom Node Components ---

function statusColor(status: WorkflowNodeStatus): string {
  switch (status) {
    case 'running':
      return 'bg-blue-500 animate-pulse'
    case 'done':
      return 'bg-green-500'
    case 'failed':
      return 'bg-red-500'
    case 'skipped':
      return 'bg-yellow-500/50'
    case 'awaiting_review':
      return 'bg-orange-400 animate-pulse'
    default:
      return 'bg-overlay-4'
  }
}

function statusBorderColor(status: WorkflowNodeStatus): string {
  switch (status) {
    case 'running':
      return 'border-blue-500/60'
    case 'done':
      return 'border-green-500/60'
    case 'failed':
      return 'border-red-500/60'
    case 'awaiting_review':
      return 'border-orange-400/60'
    default:
      return 'border-line'
  }
}

function PromptNode({ data, selected }: NodeProps): React.JSX.Element {
  const status: WorkflowNodeStatus = (data.status as WorkflowNodeStatus) || 'idle'
  const output = data.output as string | undefined
  return (
    <div
      className={`bg-surface-2 rounded-[10px] border-2 px-3 py-2.5 w-[192px] ${statusBorderColor(status)} ${selected ? 'ring-1 ring-blue-500/40' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-overlay-4 !w-2 !h-2" />
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-[7px] h-[7px] rounded-full ${statusColor(status)}`} />
        <span className="text-[9px] font-bold tracking-wider text-blue-400 font-mono">
          PROMPT
        </span>
        {data.model && (
          <span className="bg-blue-500/10 text-blue-400 text-[8px] px-1.5 py-0.5 rounded font-mono">
            {data.model as string}
          </span>
        )}
      </div>
      <div className="text-xs font-medium text-fg-strong truncate">
        {data.label as string}
      </div>
      <div className="text-[10px] text-fg-subtle truncate mt-0.5">
        {(data.prompt as string)?.slice(0, 40)}...
      </div>
      {Array.isArray(data.allowedTools) && (data.allowedTools as string[]).length > 0 && (
        <div className="text-[8px] text-emerald-400/60 font-mono mt-1 truncate">
          🔒 {(data.allowedTools as string[]).slice(0, 3).join(', ')}
          {(data.allowedTools as string[]).length > 3 ? '…' : ''}
        </div>
      )}
      {status === 'done' && (
        <div className="text-[9px] text-green-500/70 font-mono mt-1">✓ done</div>
      )}
      {status === 'running' && (
        <div className="text-[9px] text-blue-400/70 font-mono mt-1">⟳ running...</div>
      )}
      {status === 'failed' && (
        <div className="text-[9px] text-red-400/70 font-mono mt-1 truncate">
          ✗ {(output as string)?.slice(0, 30) || 'failed'}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-overlay-4 !w-2 !h-2" />
    </div>
  )
}

function ConditionNode({ data, selected }: NodeProps): React.JSX.Element {
  const status: WorkflowNodeStatus = (data.status as WorkflowNodeStatus) || 'idle'
  return (
    <div
      className={`bg-surface-2 rounded-[10px] border-2 px-3 py-2.5 w-[192px] ${statusBorderColor(status)} ${selected ? 'ring-1 ring-yellow-500/40' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-overlay-4 !w-2 !h-2" />
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-[7px] h-[7px] rounded-full ${statusColor(status)}`} />
        <span className="text-[9px] font-bold tracking-wider text-amber-400 font-mono">
          CONDITION
        </span>
      </div>
      <div className="text-xs font-medium text-fg-strong truncate">
        {data.label as string}
      </div>
      <div className="text-[10px] text-fg-subtle truncate mt-0.5 font-mono">
        {(data.expression as string)?.slice(0, 35)}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="yes"
        style={{ top: '70%' }}
        className="!bg-green-500/60 !w-2 !h-2"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="no"
        style={{ top: '30%' }}
        className="!bg-red-500/60 !w-2 !h-2"
      />
    </div>
  )
}

function ScriptNode({ data, selected }: NodeProps): React.JSX.Element {
  const status: WorkflowNodeStatus = (data.status as WorkflowNodeStatus) || 'idle'
  return (
    <div
      className={`bg-surface-2 rounded-[10px] border-2 px-3 py-2.5 w-[192px] ${statusBorderColor(status)} ${selected ? 'ring-1 ring-purple-500/40' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-overlay-4 !w-2 !h-2" />
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-[7px] h-[7px] rounded-full ${statusColor(status)}`} />
        <span className="text-[9px] font-bold tracking-wider text-purple-400 font-mono">
          SCRIPT
        </span>
      </div>
      <div className="text-xs font-medium text-fg-strong truncate">
        {data.label as string}
      </div>
      <div className="text-[10px] text-fg-subtle truncate mt-0.5 font-mono">
        {(data.command as string)?.slice(0, 35)}
      </div>
      {status === 'done' && (
        <div className="text-[9px] text-green-500/70 font-mono mt-1">✓ done</div>
      )}
      {status === 'running' && (
        <div className="text-[9px] text-blue-400/70 font-mono mt-1">⟳ running...</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-overlay-4 !w-2 !h-2" />
    </div>
  )
}

function ParallelNode({ data, selected }: NodeProps): React.JSX.Element {
  const status: WorkflowNodeStatus = (data.status as WorkflowNodeStatus) || 'idle'
  return (
    <div
      className={`bg-surface-2 rounded-[10px] border-2 px-3 py-2.5 w-[160px] ${statusBorderColor(status)} ${selected ? 'ring-1 ring-cyan-500/40' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-overlay-4 !w-2 !h-2" />
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-[7px] h-[7px] rounded-full ${statusColor(status)}`} />
        <span className="text-[9px] font-bold tracking-wider text-cyan-400 font-mono">
          PARALLEL
        </span>
      </div>
      <div className="text-xs font-medium text-fg-strong truncate">{data.label as string}</div>
      <div className="text-[9px] text-fg-subtle font-mono mt-0.5">⇉ fan-out to all branches</div>
      <Handle type="source" position={Position.Right} className="!bg-cyan-500/60 !w-2 !h-2" />
    </div>
  )
}

function JoinNode({ data, selected }: NodeProps): React.JSX.Element {
  const status: WorkflowNodeStatus = (data.status as WorkflowNodeStatus) || 'idle'
  return (
    <div
      className={`bg-surface-2 rounded-[10px] border-2 px-3 py-2.5 w-[160px] ${statusBorderColor(status)} ${selected ? 'ring-1 ring-cyan-500/40' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-cyan-500/60 !w-2 !h-2" />
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-[7px] h-[7px] rounded-full ${statusColor(status)}`} />
        <span className="text-[9px] font-bold tracking-wider text-cyan-400 font-mono">JOIN</span>
      </div>
      <div className="text-xs font-medium text-fg-strong truncate">{data.label as string}</div>
      <div className="text-[9px] text-fg-subtle font-mono mt-0.5">⇇ wait for all</div>
      <Handle type="source" position={Position.Right} className="!bg-overlay-4 !w-2 !h-2" />
    </div>
  )
}

function LoopNode({ data, selected }: NodeProps): React.JSX.Element {
  const status: WorkflowNodeStatus = (data.status as WorkflowNodeStatus) || 'idle'
  const iteration = data.iteration as number | undefined
  return (
    <div
      className={`bg-surface-2 rounded-[10px] border-2 px-3 py-2.5 w-[192px] ${statusBorderColor(status)} ${selected ? 'ring-1 ring-pink-500/40' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-overlay-4 !w-2 !h-2" />
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-[7px] h-[7px] rounded-full ${statusColor(status)}`} />
        <span className="text-[9px] font-bold tracking-wider text-pink-400 font-mono">LOOP</span>
        {iteration ? (
          <span className="bg-pink-500/10 text-pink-400 text-[8px] px-1.5 py-0.5 rounded font-mono">
            #{iteration}
          </span>
        ) : null}
      </div>
      <div className="text-xs font-medium text-fg-strong truncate">{data.label as string}</div>
      <div className="text-[9px] text-fg-subtle truncate mt-0.5 font-mono">
        while {(data.condition as string)?.slice(0, 24)}
      </div>
      <div className="text-[9px] text-fg-faint font-mono mt-0.5">
        max {(data.maxIterations as number) ?? 10}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="body"
        style={{ left: '25%' }}
        className="!bg-pink-500/60 !w-2 !h-2"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="exit"
        className="!bg-overlay-4 !w-2 !h-2"
      />
    </div>
  )
}

function HumanReviewNode({ data, selected }: NodeProps): React.JSX.Element {
  const status: WorkflowNodeStatus = (data.status as WorkflowNodeStatus) || 'idle'
  return (
    <div
      className={`bg-surface-2 rounded-[10px] border-2 px-3 py-2.5 w-[192px] ${statusBorderColor(status)} ${selected ? 'ring-1 ring-orange-400/40' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-overlay-4 !w-2 !h-2" />
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-[7px] h-[7px] rounded-full ${statusColor(status)}`} />
        <span className="text-[9px] font-bold tracking-wider text-orange-400 font-mono">
          REVIEW
        </span>
      </div>
      <div className="text-xs font-medium text-fg-strong truncate">{data.label as string}</div>
      <div className="text-[10px] text-fg-subtle truncate mt-0.5">
        {(data.message as string)?.slice(0, 40) || 'Requires human approval'}
      </div>
      {status === 'awaiting_review' && (
        <div className="text-[9px] text-orange-400 font-mono mt-1">⏸ awaiting review</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-overlay-4 !w-2 !h-2" />
    </div>
  )
}

function SubworkflowNode({ data, selected }: NodeProps): React.JSX.Element {
  const status: WorkflowNodeStatus = (data.status as WorkflowNodeStatus) || 'idle'
  const wfName = (data.childName as string) || '(not selected)'
  return (
    <div
      className={`bg-surface-2 rounded-[10px] border-2 px-3 py-2.5 w-[192px] ${statusBorderColor(status)} ${selected ? 'ring-1 ring-violet-500/40' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-overlay-4 !w-2 !h-2" />
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-[7px] h-[7px] rounded-full ${statusColor(status)}`} />
        <span className="text-[9px] font-bold tracking-wider text-violet-400 font-mono">
          SUB-FLOW
        </span>
      </div>
      <div className="text-xs font-medium text-fg-strong truncate">{data.label as string}</div>
      <div className="text-[10px] text-fg-subtle truncate mt-0.5">
        ↳ {wfName}
      </div>
      {status === 'done' && (
        <div className="text-[9px] text-green-500/70 font-mono mt-1">✓ done</div>
      )}
      {status === 'running' && (
        <div className="text-[9px] text-blue-400/70 font-mono mt-1">⟳ running...</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-overlay-4 !w-2 !h-2" />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  prompt: PromptNode,
  condition: ConditionNode,
  script: ScriptNode,
  parallel: ParallelNode,
  join: JoinNode,
  loop: LoopNode,
  humanReview: HumanReviewNode,
  subworkflow: SubworkflowNode
}

// --- Converters between WorkflowDefinition and React Flow format ---

function toFlowNodes(
  wfNodes: WorkflowNode[],
  nodeStates: Record<string, { status: WorkflowNodeStatus; output?: string; iteration?: number }>,
  workflowsById?: Map<string, string>
): Node[] {
  return wfNodes.map((n) => {
    const d = n.data
    const base = {
      label: n.label,
      status: nodeStates[n.id]?.status ?? 'idle',
      output: nodeStates[n.id]?.output ?? '',
      iteration: nodeStates[n.id]?.iteration
    }
    let extra: Record<string, unknown> = {}
    if (d.type === 'prompt') {
      extra = {
        prompt: d.prompt,
        model: d.model,
        systemPrompt: d.systemPrompt,
        allowedTools: d.allowedTools,
        setVars: d.setVars
      }
    } else if (d.type === 'condition') extra = { expression: d.expression }
    else if (d.type === 'script') extra = { command: d.command }
    else if (d.type === 'join') extra = { separator: d.separator }
    else if (d.type === 'loop') extra = { condition: d.condition, maxIterations: d.maxIterations }
    else if (d.type === 'humanReview') extra = { message: d.message }
    else if (d.type === 'subworkflow') {
      extra = {
        workflowId: d.workflowId,
        inputMapping: d.inputMapping,
        captureVars: d.captureVars,
        childName: workflowsById?.get(d.workflowId) ?? ''
      }
    }
    return {
      id: n.id,
      type: d.type,
      position: n.position,
      selected: false,
      data: { ...base, ...extra }
    }
  })
}

function toFlowEdges(wfEdges: WorkflowEdge[]): Edge[] {
  return wfEdges.map((e) => {
    const handle = e.sourceHandle ?? e.label
    const color =
      handle === 'yes'
        ? '#22c55e60'
        : handle === 'no'
          ? '#ef444460'
          : handle === 'body'
            ? '#ec489960'
            : handle === 'exit'
              ? '#ffffff30'
              : '#ffffff20'
    const labelColor =
      handle === 'yes' ? '#22c55e'
        : handle === 'no' ? '#ef4444'
          : handle === 'body' ? '#ec4899'
            : handle === 'exit' ? '#ffffff80'
              : '#ffffff60'
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined,
      label: e.label || undefined,
      style: { stroke: color },
      labelStyle: { fill: labelColor, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
      labelBgStyle: { fill: `${labelColor}15` }
    }
  })
}

function fromFlowNodes(nodes: Node[]): WorkflowNode[] {
  return nodes.map((n) => {
    const t = n.type as string
    let data: WorkflowNodeData
    if (t === 'prompt') {
      data = {
        type: 'prompt',
        prompt: (n.data.prompt as string) || '',
        systemPrompt: (n.data.systemPrompt as string) || undefined,
        model: (n.data.model as string) || undefined,
        allowedTools: (n.data.allowedTools as string[]) || undefined,
        setVars: (n.data.setVars as SetVarSpec[]) || undefined
      }
    } else if (t === 'condition') {
      data = { type: 'condition', expression: (n.data.expression as string) || '' }
    } else if (t === 'script') {
      data = { type: 'script', command: (n.data.command as string) || '' }
    } else if (t === 'parallel') {
      data = { type: 'parallel' }
    } else if (t === 'join') {
      data = { type: 'join', separator: (n.data.separator as string) || undefined }
    } else if (t === 'loop') {
      data = {
        type: 'loop',
        condition: (n.data.condition as string) || '',
        maxIterations: (n.data.maxIterations as number) ?? 10
      }
    } else if (t === 'humanReview') {
      data = { type: 'humanReview', message: (n.data.message as string) || undefined }
    } else if (t === 'subworkflow') {
      data = {
        type: 'subworkflow',
        workflowId: (n.data.workflowId as string) || '',
        inputMapping: (n.data.inputMapping as Record<string, string>) || undefined,
        captureVars: (n.data.captureVars as string[]) || undefined
      }
    } else {
      data = { type: 'prompt', prompt: '' }
    }
    return {
      id: n.id,
      label: (n.data.label as string) || n.id,
      position: n.position,
      data
    }
  })
}

function fromFlowEdges(edges: Edge[]): WorkflowEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: (e.sourceHandle as string) || undefined,
    label: (e.label as string) || (e.sourceHandle as string) || undefined
  }))
}

// --- Node Config Panel ---

function NodeConfigPanel(): React.JSX.Element | null {
  const { selectedNodeId, setSelectedNodeId, currentWorkflow, updateCurrentWorkflow, execution } =
    useWorkflowStore()

  if (!selectedNodeId || !currentWorkflow) return null

  const node = currentWorkflow.nodes.find((n) => n.id === selectedNodeId)
  if (!node) return null

  const nodeState = execution?.nodeStates[selectedNodeId]
  const isRunning = execution?.status === 'running'

  const updateNodeData = (patch: Record<string, unknown>): void => {
    const updatedNodes = currentWorkflow.nodes.map((n) =>
      n.id === selectedNodeId
        ? { ...n, data: { ...n.data, ...patch } as typeof n.data }
        : n
    )
    updateCurrentWorkflow({ nodes: updatedNodes })
  }

  const updateNodeLabel = (label: string): void => {
    const updatedNodes = currentWorkflow.nodes.map((n) =>
      n.id === selectedNodeId ? { ...n, label } : n
    )
    updateCurrentWorkflow({ nodes: updatedNodes })
  }

  const nodeTypeLabel = node.data.type === 'subworkflow' ? 'SUB-FLOW' : node.data.type.toUpperCase()
  const typeColor =
    node.data.type === 'prompt' ? 'bg-blue-500/15 text-blue-400'
      : node.data.type === 'condition' ? 'bg-amber-500/15 text-amber-400'
        : node.data.type === 'script' ? 'bg-purple-500/15 text-purple-400'
          : node.data.type === 'parallel' || node.data.type === 'join' ? 'bg-cyan-500/15 text-cyan-400'
            : node.data.type === 'loop' ? 'bg-pink-500/15 text-pink-400'
              : node.data.type === 'subworkflow' ? 'bg-violet-500/15 text-violet-400'
                : 'bg-orange-500/15 text-orange-400'

  return (
    <div className="w-[320px] flex-shrink-0 bg-surface-2 border-l border-line-soft flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-4 border-b border-line-soft">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-fg-strong">Node Config</span>
          <span className={`text-[8px] font-bold font-mono px-1.5 py-0.5 rounded ${typeColor}`}>
            {nodeTypeLabel}
          </span>
        </div>
        <button
          onClick={() => setSelectedNodeId(null)}
          className="text-fg-subtle hover:text-fg-muted text-sm"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Name */}
        <div>
          <label className="text-[10px] font-medium text-fg-subtle block mb-1">Name</label>
          <input
            value={node.label}
            onChange={(e) => updateNodeLabel(e.target.value)}
            disabled={isRunning}
            className="w-full bg-surface-1 border border-line rounded-md px-2.5 py-1.5 text-xs text-fg-strong focus:border-blue-500/40 focus:outline-none"
          />
        </div>

        {/* Prompt-specific fields */}
        {node.data.type === 'prompt' && (
          <PromptNodeConfig node={node.data} update={updateNodeData} disabled={isRunning} />
        )}

        {/* Condition-specific fields */}
        {node.data.type === 'condition' && (
          <div>
            <label className="text-[10px] font-medium text-fg-subtle block mb-1">Expression</label>
            <textarea
              value={node.data.expression}
              onChange={(e) => updateNodeData({ expression: e.target.value })}
              disabled={isRunning}
              rows={3}
              className="w-full bg-surface-1 border border-line rounded-md px-2.5 py-2 text-[11px] text-fg-strong font-mono resize-none focus:border-blue-500/40 focus:outline-none"
            />
            <p className="text-[9px] text-fg-faint mt-1 font-mono">
              Vars: <code className="text-amber-400/60">output</code>,{' '}
              <code className="text-amber-400/60">vars</code>,{' '}
              <code className="text-amber-400/60">iteration</code>
            </p>
          </div>
        )}

        {/* Script-specific fields */}
        {node.data.type === 'script' && (
          <div>
            <label className="text-[10px] font-medium text-fg-subtle block mb-1">Command</label>
            <textarea
              value={node.data.command}
              onChange={(e) => updateNodeData({ command: e.target.value })}
              disabled={isRunning}
              rows={3}
              className="w-full bg-surface-1 border border-line rounded-md px-2.5 py-2 text-[11px] text-fg-strong font-mono resize-none focus:border-blue-500/40 focus:outline-none"
            />
          </div>
        )}

        {/* Parallel: no config */}
        {node.data.type === 'parallel' && (
          <div className="text-[10px] text-fg-subtle leading-relaxed">
            Pure fan-out node. Each outgoing edge becomes a concurrent branch. Use a
            <span className="text-cyan-400"> Join </span>
            node downstream to merge their outputs.
          </div>
        )}

        {/* Join: separator */}
        {node.data.type === 'join' && (
          <div>
            <label className="text-[10px] font-medium text-fg-subtle block mb-1">
              Separator (between branch outputs)
            </label>
            <input
              value={node.data.separator ?? ''}
              placeholder={'\\n\\n---\\n\\n'}
              onChange={(e) => updateNodeData({ separator: e.target.value })}
              disabled={isRunning}
              className="w-full bg-surface-1 border border-line rounded-md px-2.5 py-1.5 text-[11px] text-fg-strong font-mono focus:border-blue-500/40 focus:outline-none"
            />
            <p className="text-[9px] text-fg-faint mt-1">
              Join waits for ALL incoming edges before running. Note: if any upstream branch is
              skipped (condition false), the Join will wait forever.
            </p>
          </div>
        )}

        {/* Loop: condition + maxIterations */}
        {node.data.type === 'loop' && (
          <>
            <div>
              <label className="text-[10px] font-medium text-fg-subtle block mb-1">
                Continue While (expression)
              </label>
              <textarea
                value={node.data.condition}
                onChange={(e) => updateNodeData({ condition: e.target.value })}
                disabled={isRunning}
                rows={3}
                className="w-full bg-surface-1 border border-line rounded-md px-2.5 py-2 text-[11px] text-fg-strong font-mono resize-none focus:border-blue-500/40 focus:outline-none"
              />
              <p className="text-[9px] text-fg-faint mt-1 font-mono">
                Vars: <code className="text-pink-400/60">output</code>,{' '}
                <code className="text-pink-400/60">vars</code>,{' '}
                <code className="text-pink-400/60">iteration</code>
              </p>
            </div>
            <div>
              <label className="text-[10px] font-medium text-fg-subtle block mb-1">
                Max Iterations
              </label>
              <input
                type="number"
                min={1}
                max={1000}
                value={node.data.maxIterations}
                onChange={(e) => updateNodeData({ maxIterations: parseInt(e.target.value, 10) || 1 })}
                disabled={isRunning}
                className="w-full bg-surface-1 border border-line rounded-md px-2.5 py-1.5 text-xs text-fg-strong font-mono focus:border-blue-500/40 focus:outline-none"
              />
            </div>
            <div className="text-[10px] text-fg-subtle leading-relaxed">
              <div><span className="text-pink-400">body</span> handle (bottom): linear chain that runs each iteration.</div>
              <div><span className="text-fg-muted">exit</span> handle (right): continues after loop ends.</div>
            </div>
          </>
        )}

        {/* Sub-workflow */}
        {node.data.type === 'subworkflow' && (
          <SubworkflowNodeConfig
            node={node.data}
            currentWorkflowId={currentWorkflow.id}
            update={updateNodeData}
            disabled={isRunning}
          />
        )}

        {/* Human review */}
        {node.data.type === 'humanReview' && (
          <div>
            <label className="text-[10px] font-medium text-fg-subtle block mb-1">
              Message for reviewer
            </label>
            <textarea
              value={node.data.message ?? ''}
              onChange={(e) => updateNodeData({ message: e.target.value })}
              disabled={isRunning}
              rows={3}
              placeholder="What should the reviewer check?"
              className="w-full bg-surface-1 border border-line rounded-md px-2.5 py-2 text-[11px] text-fg-strong resize-none focus:border-blue-500/40 focus:outline-none"
            />
            <p className="text-[9px] text-fg-faint mt-1">
              Pauses execution. Approve → continue; Reject → ends this branch.
            </p>
          </div>
        )}

        {/* Output display */}
        {nodeState && (nodeState.status === 'done' || nodeState.status === 'failed' || nodeState.status === 'running') && (
          <div>
            <label className="text-[10px] font-medium text-fg-subtle block mb-1">Output</label>
            <div className="bg-surface-1 border border-line-soft rounded-md p-2.5 max-h-40 overflow-y-auto">
              {nodeState.status === 'running' && (
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                  <span className="text-[9px] text-blue-400 font-mono">Streaming output...</span>
                </div>
              )}
              <pre className="text-[10px] text-fg-subtle font-mono whitespace-pre-wrap break-words">
                {nodeState.output || nodeState.error || '(no output)'}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PromptNodeConfig({
  node,
  update,
  disabled
}: {
  node: Extract<WorkflowNodeData, { type: 'prompt' }>
  update: (patch: Record<string, unknown>) => void
  disabled: boolean
}): React.JSX.Element {
  const allowedTools = node.allowedTools ?? []
  const setVars = node.setVars ?? []

  const toggleTool = (tool: string): void => {
    const current = new Set(allowedTools)
    if (current.has(tool)) current.delete(tool)
    else current.add(tool)
    update({ allowedTools: current.size === 0 ? undefined : Array.from(current) })
  }

  const addSetVar = (): void => {
    update({ setVars: [...setVars, { name: '', extractor: '' }] })
  }
  const updateSetVar = (i: number, patch: Partial<SetVarSpec>): void => {
    const next = setVars.map((v, idx) => (idx === i ? { ...v, ...patch } : v))
    update({ setVars: next })
  }
  const removeSetVar = (i: number): void => {
    const next = setVars.filter((_, idx) => idx !== i)
    update({ setVars: next.length === 0 ? undefined : next })
  }

  return (
    <>
      <div>
        <label className="text-[10px] font-medium text-fg-subtle block mb-1">Model</label>
        <select
          value={node.model || ''}
          onChange={(e) => update({ model: e.target.value || undefined })}
          disabled={disabled}
          className="w-full bg-surface-1 border border-line rounded-md px-2.5 py-1.5 text-xs text-fg-strong font-mono focus:border-blue-500/40 focus:outline-none"
        >
          <option value="">default</option>
          <option value="opus">opus</option>
          <option value="sonnet">sonnet</option>
          <option value="haiku">haiku</option>
        </select>
      </div>
      <div>
        <label className="text-[10px] font-medium text-fg-subtle block mb-1">Prompt</label>
        <textarea
          value={node.prompt}
          onChange={(e) => update({ prompt: e.target.value })}
          disabled={disabled}
          rows={5}
          className="w-full bg-surface-1 border border-blue-500/30 rounded-md px-2.5 py-2 text-[11px] text-fg-strong font-mono leading-relaxed resize-none focus:border-blue-500/50 focus:outline-none"
        />
        <p className="text-[9px] text-fg-faint mt-1 font-mono">
          Use <code className="text-blue-400/60">{'{{prev.output}}'}</code>,{' '}
          <code className="text-blue-400/60">{'{{input.key}}'}</code>,{' '}
          <code className="text-blue-400/60">{'{{vars.name}}'}</code>
        </p>
      </div>
      <div>
        <label className="text-[10px] font-medium text-fg-subtle block mb-1">
          System Prompt (optional)
        </label>
        <textarea
          value={node.systemPrompt || ''}
          onChange={(e) => update({ systemPrompt: e.target.value || undefined })}
          disabled={disabled}
          rows={2}
          className="w-full bg-surface-1 border border-line rounded-md px-2.5 py-2 text-[11px] text-fg-muted font-mono resize-none focus:border-blue-500/40 focus:outline-none"
        />
      </div>

      {/* Allowed tools */}
      <div>
        <label className="text-[10px] font-medium text-fg-subtle block mb-1">
          Allowed Tools{' '}
          <span className="text-fg-faint font-normal">
            ({allowedTools.length === 0 ? 'all' : allowedTools.length})
          </span>
        </label>
        <div className="flex flex-wrap gap-1">
          {AVAILABLE_TOOLS.map((tool) => {
            const on = allowedTools.includes(tool)
            return (
              <button
                key={tool}
                onClick={() => toggleTool(tool)}
                disabled={disabled}
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                  on
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-surface-1 text-fg-subtle border-line hover:border-line-strong'
                }`}
              >
                {tool}
              </button>
            )
          })}
        </div>
        <p className="text-[9px] text-fg-faint mt-1">
          None selected = all tools allowed. Select any to restrict to those only.
        </p>
      </div>

      {/* Set vars */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-medium text-fg-subtle">Set Variables from Output</label>
          <button
            onClick={addSetVar}
            disabled={disabled}
            className="text-[9px] text-blue-400 hover:text-blue-300"
          >
            + add
          </button>
        </div>
        {setVars.length === 0 && (
          <p className="text-[9px] text-fg-faint">Capture output into workflow variables</p>
        )}
        {setVars.map((v, i) => (
          <div key={i} className="flex gap-1 mt-1 items-start">
            <input
              value={v.name}
              placeholder="name"
              onChange={(e) => updateSetVar(i, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
              disabled={disabled}
              className="flex-1 bg-surface-1 border border-line rounded px-2 py-1 text-[10px] text-fg-strong font-mono focus:outline-none focus:border-blue-500/40"
            />
            <input
              value={v.extractor}
              placeholder="raw | json:path | regex:pat | lines:1-5"
              onChange={(e) => updateSetVar(i, { extractor: e.target.value })}
              disabled={disabled}
              className="flex-[2] bg-surface-1 border border-line rounded px-2 py-1 text-[10px] text-fg-muted font-mono focus:outline-none focus:border-blue-500/40"
            />
            <button
              onClick={() => removeSetVar(i)}
              disabled={disabled}
              className="text-[10px] text-red-400/60 hover:text-red-400 px-1"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

function SubworkflowNodeConfig({
  node,
  currentWorkflowId,
  update,
  disabled
}: {
  node: Extract<WorkflowNodeData, { type: 'subworkflow' }>
  currentWorkflowId: string
  update: (patch: Record<string, unknown>) => void
  disabled: boolean
}): React.JSX.Element {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [templates, setTemplates] = useState<WorkflowDefinition[]>([])
  const [childInputs, setChildInputs] = useState<WorkflowInputVar[]>([])

  useEffect(() => {
    Promise.all([
      window.api.workflow.list(),
      window.api.workflow.templates()
    ]).then(([wfs, tpls]) => {
      const wfList = (wfs as WorkflowDefinition[]).filter((w) => w.id !== currentWorkflowId)
      const tplList = (tpls as WorkflowDefinition[]).filter((t) => t.id !== currentWorkflowId)
      setWorkflows(wfList)
      setTemplates(tplList)
    })
  }, [currentWorkflowId])

  useEffect(() => {
    if (!node.workflowId) {
      setChildInputs([])
      return
    }
    window.api.workflow.load(node.workflowId).then((wf) => {
      const w = wf as WorkflowDefinition | null
      if (w) {
        setChildInputs(w.inputs ?? [])
        return
      }
      // Built-in template fallback (not saved on disk but resolvable at run-time)
      const tpl = templates.find((t) => t.id === node.workflowId)
      setChildInputs(tpl?.inputs ?? [])
    })
  }, [node.workflowId, templates])

  const mapping = node.inputMapping ?? {}
  const updateMapping = (key: string, value: string): void => {
    const next = { ...mapping, [key]: value }
    if (!value) delete next[key]
    update({ inputMapping: next })
  }

  const captureVars = node.captureVars ?? []
  const updateCapture = (text: string): void => {
    const list = text.split(',').map((s) => s.trim()).filter(Boolean)
    update({ captureVars: list.length > 0 ? list : undefined })
  }

  return (
    <>
      <div>
        <label className="text-[10px] font-medium text-fg-subtle block mb-1">Target workflow</label>
        <select
          value={node.workflowId}
          onChange={(e) => update({ workflowId: e.target.value })}
          disabled={disabled}
          className="w-full bg-surface-1 border border-line rounded-md px-2.5 py-1.5 text-xs text-fg-strong focus:border-violet-500/40 focus:outline-none"
        >
          <option value="">— select —</option>
          {workflows.length > 0 && (
            <optgroup label="Saved workflows">
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </optgroup>
          )}
          {templates.length > 0 && (
            <optgroup label="Built-in templates">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {childInputs.length > 0 && (
        <div>
          <label className="text-[10px] font-medium text-fg-subtle block mb-1">Input mapping</label>
          <div className="space-y-1.5">
            {childInputs.map((inp) => (
              <div key={inp.key}>
                <div className="text-[10px] text-fg-muted font-mono">{inp.key}</div>
                <input
                  value={mapping[inp.key] ?? ''}
                  onChange={(e) => updateMapping(inp.key, e.target.value)}
                  placeholder={inp.placeholder || `{{input.${inp.key}}}`}
                  disabled={disabled}
                  className="w-full bg-surface-1 border border-line rounded-md px-2 py-1 text-[10px] text-fg-strong font-mono focus:outline-none focus:border-violet-500/40"
                />
              </div>
            ))}
          </div>
          <p className="text-[9px] text-fg-faint mt-1">
            Use <code className="text-amber-400/60">{'{{input.x}}'}</code>,{' '}
            <code className="text-amber-400/60">{'{{vars.y}}'}</code>, or raw text.
          </p>
        </div>
      )}

      <div>
        <label className="text-[10px] font-medium text-fg-subtle block mb-1">
          Capture vars (comma-separated; blank = all)
        </label>
        <input
          value={captureVars.join(', ')}
          onChange={(e) => updateCapture(e.target.value)}
          placeholder="e.g. draft, score"
          disabled={disabled}
          className="w-full bg-surface-1 border border-line rounded-md px-2 py-1.5 text-[11px] text-fg-strong font-mono focus:outline-none focus:border-violet-500/40"
        />
        <p className="text-[9px] text-fg-faint mt-1">
          Child's final vars with these names are copied into this workflow's vars.
        </p>
      </div>
    </>
  )
}

// --- Main Workflow Canvas ---

let nodeCounter = 0

export default function WorkflowCanvas(): React.JSX.Element {
  const {
    currentWorkflow,
    setCurrentWorkflow,
    updateCurrentWorkflow,
    execution,
    setExecution,
    selectedNodeId,
    setSelectedNodeId,
    closeCanvas,
    workflows,
    setWorkflows,
    reviewQueue,
    executions,
    setExecutions
  } = useWorkflowStore()

  const cwd = useSessionsStore((s) => {
    const active = s.sessions.find((sess) => sess.id === s.activeSessionId)
    return active?.cwd ?? localStorage.getItem('cwd') ?? ''
  })

  const [showTemplates, setShowTemplates] = useState(!currentWorkflow)
  const [saveFlash, setSaveFlash] = useState(false)
  const [showRunDialog, setShowRunDialog] = useState(false)
  const [showInputsEditor, setShowInputsEditor] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showVars, setShowVars] = useState(false)
  const [showMetrics, setShowMetrics] = useState(false)
  const [showTriggers, setShowTriggers] = useState(false)

  const [templateDefs, setTemplateDefs] = useState<WorkflowDefinition[]>([])
  useEffect(() => {
    window.api.workflow.templates().then((tpls) => setTemplateDefs(tpls as WorkflowDefinition[]))
  }, [])
  const workflowsById = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of templateDefs) map.set(t.id, t.name)
    for (const w of workflows) map.set(w.id, w.name)
    return map
  }, [workflows, templateDefs])

  // Convert workflow to React Flow format
  const nodeStates = execution?.nodeStates ?? {}
  const initialNodes = useMemo(
    () => (currentWorkflow ? toFlowNodes(currentWorkflow.nodes, nodeStates, workflowsById) : []),
    [currentWorkflow?.id]
  )
  const initialEdges = useMemo(
    () => (currentWorkflow ? toFlowEdges(currentWorkflow.edges) : []),
    [currentWorkflow?.id]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync React Flow state when workflow changes
  useEffect(() => {
    if (!currentWorkflow) return
    setNodes(toFlowNodes(currentWorkflow.nodes, nodeStates, workflowsById))
    setEdges(toFlowEdges(currentWorkflow.edges))
  }, [currentWorkflow?.id, currentWorkflow?.nodes, currentWorkflow?.edges, workflowsById])

  // Update node status during execution
  useEffect(() => {
    if (!execution || !currentWorkflow) return
    setNodes((prev) =>
      prev.map((n) => {
        const ns = execution.nodeStates[n.id]
        if (!ns) return n
        return {
          ...n,
          data: {
            ...n.data,
            status: ns.status,
            output: ns.output || ns.error || '',
            iteration: ns.iteration
          }
        }
      })
    )
  }, [execution?.nodeStates])

  // Subscribe to workflow events
  useEffect(() => {
    const unsub = window.api.workflow.onEvent((event: unknown) => {
      const e = event as WorkflowEvent
      const store = useWorkflowStore.getState()
      switch (e.type) {
        case 'node:start':
          store.updateNodeState(e.nodeId, {
            status: 'running',
            startedAt: Date.now(),
            iteration: e.iteration
          })
          break
        case 'node:done':
          store.updateNodeState(e.nodeId, {
            status: 'done',
            output: e.output,
            finishedAt: Date.now(),
            iteration: e.iteration
          })
          break
        case 'node:failed':
          store.updateNodeState(e.nodeId, {
            status: 'failed',
            error: e.error,
            finishedAt: Date.now()
          })
          break
        case 'node:skipped':
          store.updateNodeState(e.nodeId, { status: 'skipped' })
          break
        case 'node:awaiting-review':
          store.updateNodeState(e.nodeId, { status: 'awaiting_review' })
          store.pushReview(e.request)
          break
        case 'variable:set':
          store.setVariable(e.name, e.value)
          break
        case 'loop:iterate':
          store.updateNodeState(e.nodeId, { iteration: e.iteration })
          break
        case 'execution:done': {
          const exec = store.execution
          store.setExecution(exec ? { ...exec, status: 'done', finishedAt: Date.now() } : null)
          if (e.record) {
            store.setExecutions([e.record, ...store.executions.filter((r) => r.id !== e.record!.id)])
          }
          break
        }
        case 'execution:failed': {
          const exec = store.execution
          store.setExecution(exec ? { ...exec, status: 'failed', finishedAt: Date.now() } : null)
          if (e.record) {
            store.setExecutions([e.record, ...store.executions.filter((r) => r.id !== e.record!.id)])
          }
          break
        }
        case 'execution:aborted': {
          const exec = store.execution
          store.setExecution(exec ? { ...exec, status: 'aborted', finishedAt: Date.now() } : null)
          if (e.record) {
            store.setExecutions([e.record, ...store.executions.filter((r) => r.id !== e.record!.id)])
          }
          break
        }
      }
    })
    return unsub
  }, [])

  // Load saved workflows
  useEffect(() => {
    window.api.workflow.list().then((wfs) => setWorkflows(wfs as WorkflowDefinition[]))
  }, [])

  // Load executions for current workflow
  useEffect(() => {
    if (!currentWorkflow) return
    window.api.workflow
      .listExecutions(currentWorkflow.id)
      .then((recs) => setExecutions(recs as WorkflowExecutionRecord[]))
  }, [currentWorkflow?.id])

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id)
      setShowInputsEditor(false)
      setShowHistory(false)
      setShowVars(false)
      setShowMetrics(false)
      setShowTriggers(false)
    },
    [setSelectedNodeId]
  )

  const onNodeDragStop = useCallback(() => {
    if (!currentWorkflow) return
    const updatedNodes = fromFlowNodes(nodes)
    updateCurrentWorkflow({ nodes: updatedNodes })
  }, [nodes, currentWorkflow])

  const addNode = (
    type: 'prompt' | 'condition' | 'script' | 'parallel' | 'join' | 'loop' | 'humanReview' | 'subworkflow'
  ): void => {
    if (!currentWorkflow) return
    const id = `node-${++nodeCounter}-${Date.now()}`
    const labels: Record<string, string> = {
      prompt: 'New Prompt',
      condition: 'New Condition',
      script: 'New Script',
      parallel: 'Fork',
      join: 'Join',
      loop: 'Loop',
      humanReview: 'Human Review',
      subworkflow: 'Sub-flow'
    }
    let data: WorkflowNodeData
    if (type === 'prompt') data = { type: 'prompt', prompt: '' }
    else if (type === 'condition') data = { type: 'condition', expression: '' }
    else if (type === 'script') data = { type: 'script', command: '' }
    else if (type === 'parallel') data = { type: 'parallel' }
    else if (type === 'join') data = { type: 'join' }
    else if (type === 'loop') data = { type: 'loop', condition: 'iteration < 3', maxIterations: 10 }
    else if (type === 'subworkflow') data = { type: 'subworkflow', workflowId: '' }
    else data = { type: 'humanReview' }

    const newNode: WorkflowNode = {
      id,
      label: labels[type],
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data
    }
    updateCurrentWorkflow({ nodes: [...currentWorkflow.nodes, newNode] })
  }

  const deleteSelectedNode = (): void => {
    if (!selectedNodeId || !currentWorkflow) return
    updateCurrentWorkflow({
      nodes: currentWorkflow.nodes.filter((n) => n.id !== selectedNodeId),
      edges: currentWorkflow.edges.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId
      )
    })
    setSelectedNodeId(null)
  }

  const handleSave = async (): Promise<void> => {
    if (!currentWorkflow) return
    const updatedNodes = fromFlowNodes(nodes)
    const updatedEdges = fromFlowEdges(edges)
    const wf = { ...currentWorkflow, nodes: updatedNodes, edges: updatedEdges }
    await window.api.workflow.save(wf)
    setCurrentWorkflow(wf)
    const wfs = await window.api.workflow.list()
    setWorkflows(wfs as WorkflowDefinition[])
    setSaveFlash(true)
    setTimeout(() => setSaveFlash(false), 2000)
  }

  const [runTargetCwd, setRunTargetCwd] = useState<string>('')

  const handleRun = (targetCwd?: string): void => {
    if (!currentWorkflow) return
    const effective = targetCwd || cwd
    if (!effective) {
      alert('No working directory set. Please select a folder in your session first.')
      return
    }
    setRunTargetCwd(effective)
    if (currentWorkflow.inputs && currentWorkflow.inputs.length > 0) {
      setShowRunDialog(true)
    } else {
      startExecution({}, effective)
    }
  }

  const startExecution = async (inputValues: Record<string, string>, targetCwd?: string): Promise<void> => {
    if (!currentWorkflow) return
    const effective = targetCwd || runTargetCwd || cwd
    if (!effective) {
      alert('No working directory set. Please select a folder in your session first.')
      return
    }
    setShowRunDialog(false)
    await handleSave()
    const nodeStatesInit: Record<string, { nodeId: string; status: WorkflowNodeStatus }> = {}
    for (const n of currentWorkflow.nodes) {
      nodeStatesInit[n.id] = { nodeId: n.id, status: 'idle' }
    }
    setExecution({
      id: '',
      workflowId: currentWorkflow.id,
      status: 'running',
      nodeStates: nodeStatesInit,
      vars: {},
      startedAt: Date.now()
    })
    const result = await window.api.workflow.run(currentWorkflow.id, effective, inputValues)
    if (result.executionId) {
      const current = useWorkflowStore.getState().execution
      if (current) setExecution({ ...current, id: result.executionId })
    }
    // Refresh workflow to pick up updated recentCwds
    const refreshed = await window.api.workflow.load(currentWorkflow.id)
    if (refreshed) setCurrentWorkflow(refreshed as WorkflowDefinition)
  }

  const pickCwdAndRun = async (): Promise<void> => {
    const picked = await window.api.dialog.pickFolder()
    if (picked) handleRun(picked)
  }

  const handleAbort = (): void => {
    if (execution?.id) window.api.workflow.abort(execution.id)
  }

  const createNew = (): void => {
    const id = `wf-${Date.now()}`
    const wf: WorkflowDefinition = {
      id,
      name: 'New Workflow',
      nodes: [],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    setCurrentWorkflow(wf)
    setShowTemplates(false)
    setExecution(null)
  }

  const useTemplate = (tpl: WorkflowDefinition): void => {
    const id = `wf-${Date.now()}`
    const wf: WorkflowDefinition = {
      ...tpl,
      id,
      isTemplate: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    setCurrentWorkflow(wf)
    setShowTemplates(false)
    setExecution(null)
  }

  const openWorkflow = async (id: string): Promise<void> => {
    const wf = (await window.api.workflow.load(id)) as WorkflowDefinition | null
    if (wf) {
      setCurrentWorkflow(wf)
      setShowTemplates(false)
      setExecution(null)
    }
  }

  const handleImport = async (): Promise<void> => {
    const result = await window.api.workflow.importWorkflow()
    if (result.canceled) return
    if (result.error) {
      alert(`Import failed: ${result.error}`)
      return
    }
    if (result.workflow) {
      const wf = result.workflow as WorkflowDefinition
      setCurrentWorkflow(wf)
      setShowTemplates(false)
      setExecution(null)
      const wfs = await window.api.workflow.list()
      setWorkflows(wfs as WorkflowDefinition[])
    }
  }

  const handleExport = async (): Promise<void> => {
    if (!currentWorkflow) return
    const updatedNodes = fromFlowNodes(nodes)
    const updatedEdges = fromFlowEdges(edges)
    const wf = { ...currentWorkflow, nodes: updatedNodes, edges: updatedEdges }
    const result = await window.api.workflow.exportWorkflow(wf)
    if (result.error) alert(`Export failed: ${result.error}`)
  }

  const isRunning = execution?.status === 'running'

  if (showTemplates || !currentWorkflow) {
    return (
      <TemplatesView
        onUseTemplate={useTemplate}
        onCreateNew={createNew}
        onImport={handleImport}
        workflows={workflows}
        onOpenWorkflow={openWorkflow}
        onClose={closeCanvas}
        onWorkflowsChanged={async () => {
          const wfs = await window.api.workflow.list()
          setWorkflows(wfs as WorkflowDefinition[])
        }}
      />
    )
  }

  const runningNodeCount = currentWorkflow.nodes.length
  const doneCount = Object.values(nodeStates).filter(
    (ns) => ns.status === 'done' || ns.status === 'skipped'
  ).length
  const currentRunning = Object.values(nodeStates).find((ns) => ns.status === 'running')
  const currentRunningNode = currentRunning
    ? currentWorkflow.nodes.find((n) => n.id === currentRunning.nodeId)
    : null
  const varsCount = execution?.vars ? Object.keys(execution.vars).length : 0

  const closeSidePanels = (): void => {
    setSelectedNodeId(null)
    setShowInputsEditor(false)
    setShowHistory(false)
    setShowVars(false)
    setShowMetrics(false)
    setShowTriggers(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="h-[46px] bg-surface-2 border-b border-line-soft flex items-center px-3 gap-2 flex-shrink-0">
        <button
          onClick={closeCanvas}
          className="text-fg-subtle hover:text-fg-muted text-sm flex-shrink-0"
          title="Back to workflow list"
        >
          ←
        </button>
        <input
          value={currentWorkflow.name}
          onChange={(e) => updateCurrentWorkflow({ name: e.target.value })}
          className="bg-transparent text-sm font-semibold text-fg-strong focus:outline-none border-b border-transparent focus:border-blue-500/40 min-w-0 flex-1 max-w-[240px]"
        />

        <div className="w-px h-5 bg-overlay-3" />

        {/* Add-node dropdown */}
        <AddNodeMenu onAdd={addNode} disabled={isRunning} />

        <div className="w-px h-5 bg-overlay-3" />

        {/* Panel toggles — segmented */}
        <div className="flex items-center bg-surface-1 border border-line rounded overflow-hidden">
          <SegButton
            active={showInputsEditor}
            onClick={() => { closeSidePanels(); setShowInputsEditor(true) }}
            disabled={isRunning}
            activeTone="blue"
            title="Workflow inputs"
          >
            Inputs{currentWorkflow.inputs?.length ? ` · ${currentWorkflow.inputs.length}` : ''}
          </SegButton>
          <div className="w-px h-4 bg-overlay-3" />
          <SegButton
            active={showVars}
            onClick={() => { closeSidePanels(); setShowVars(true) }}
            activeTone="emerald"
            title="Runtime variables"
          >
            Vars{varsCount > 0 ? ` · ${varsCount}` : ''}
          </SegButton>
          <div className="w-px h-4 bg-overlay-3" />
          <SegButton
            active={showHistory}
            onClick={() => { closeSidePanels(); setShowHistory(true) }}
            activeTone="white"
            title="Execution history"
          >
            History{executions.length ? ` · ${executions.length}` : ''}
          </SegButton>
          <div className="w-px h-4 bg-overlay-3" />
          <SegButton
            active={showMetrics}
            onClick={() => { closeSidePanels(); setShowMetrics(true) }}
            activeTone="white"
            title="Execution metrics"
          >
            Metrics
          </SegButton>
          <div className="w-px h-4 bg-overlay-3" />
          <SegButton
            active={showTriggers}
            onClick={() => { closeSidePanels(); setShowTriggers(true) }}
            activeTone="white"
            title="Triggers (cron / file watcher / webhook)"
          >
            Triggers{currentWorkflow.triggers?.length ? ` · ${currentWorkflow.triggers.length}` : ''}
          </SegButton>
        </div>

        <div className="flex-1 min-w-1" />

        {selectedNodeId && !isRunning && (
          <button
            onClick={deleteSelectedNode}
            className="text-[10px] text-red-400/70 bg-red-500/10 px-2.5 py-1 rounded hover:bg-red-500/20 flex-shrink-0"
            title="Delete selected node"
          >
            Delete
          </button>
        )}

        {/* Overflow menu: Import / Export */}
        <OverflowMenu
          onImport={handleImport}
          onExport={handleExport}
          onShareToMarketplace={async () => {
            await handleSave()
            await window.api.workflow.marketplaceShare(currentWorkflow)
          }}
          disabled={isRunning}
        />

        <button
          onClick={handleSave}
          disabled={isRunning}
          className={`text-[10px] font-medium px-3 py-1 rounded transition-colors disabled:opacity-40 flex-shrink-0 ${
            saveFlash
              ? 'text-green-400 bg-green-500/15'
              : 'text-fg-muted bg-overlay-2 hover:bg-overlay-3'
          }`}
        >
          {saveFlash ? '✓ Saved' : 'Save'}
        </button>
        {isRunning ? (
          <button
            onClick={handleAbort}
            className="text-[10px] font-semibold text-fg bg-red-600 px-3 py-1 rounded hover:bg-red-700 flex-shrink-0"
          >
            ■ Stop
          </button>
        ) : (
          <RunButton
            disabled={currentWorkflow.nodes.length === 0}
            currentCwd={cwd}
            recentCwds={currentWorkflow.recentCwds ?? []}
            onRun={handleRun}
            onPickCwd={pickCwdAndRun}
          />
        )}
      </div>

      {/* Canvas + side panel */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            className="bg-surface-1"
          >
            <Background color="#ffffff08" variant={BackgroundVariant.Dots} gap={20} />
            <Controls
              className="!bg-surface-2 !border-line !rounded-lg [&>button]:!bg-surface-2 [&>button]:!border-line-soft [&>button]:!text-fg-muted [&>button:hover]:!bg-overlay-3"
            />
            <MiniMap
              nodeColor="#3b82f620"
              maskColor="#0a0a0a90"
              className="!bg-surface-2 !border-line !rounded-lg"
            />
          </ReactFlow>
        </div>

        {selectedNodeId && !showInputsEditor && !showHistory && !showVars && !showMetrics && !showTriggers && <NodeConfigPanel />}
        {showInputsEditor && (
          <InputsEditor
            inputs={currentWorkflow.inputs ?? []}
            onChange={(inputs) => updateCurrentWorkflow({ inputs })}
            onClose={() => setShowInputsEditor(false)}
          />
        )}
        {showVars && (
          <VarsPanel vars={execution?.vars ?? {}} onClose={() => setShowVars(false)} />
        )}
        {showHistory && currentWorkflow && (
          <HistoryPanel
            workflowId={currentWorkflow.id}
            onClose={() => setShowHistory(false)}
          />
        )}
        {showMetrics && currentWorkflow && (
          <MetricsPanel
            workflowId={currentWorkflow.id}
            executions={executions}
            onClose={() => setShowMetrics(false)}
          />
        )}
        {showTriggers && currentWorkflow && (
          <TriggersPanel
            workflow={currentWorkflow}
            currentCwd={cwd}
            onChange={(triggers) => updateCurrentWorkflow({ triggers })}
            onSave={handleSave}
            onClose={() => setShowTriggers(false)}
          />
        )}
      </div>

      {/* Run dialog */}
      {showRunDialog && currentWorkflow.inputs && (
        <RunDialog
          inputs={currentWorkflow.inputs}
          onRun={startExecution}
          onCancel={() => setShowRunDialog(false)}
        />
      )}

      {/* Human review dialog */}
      {reviewQueue.length > 0 && <ReviewDialog request={reviewQueue[0]} />}

      {/* Status bar */}
      <div className="h-7 bg-surface-1 border-t border-line-soft flex items-center px-4 gap-4 flex-shrink-0">
        {isRunning ? (
          <span className="text-[10px] text-blue-400 font-mono">
            ⟳ Running {doneCount}/{runningNodeCount}
            {currentRunningNode ? ` · ${currentRunningNode.label}` : ''}
          </span>
        ) : execution?.status === 'done' ? (
          <span className="text-[10px] text-green-400 font-mono">
            ✓ Completed ({doneCount}/{runningNodeCount} nodes)
          </span>
        ) : execution?.status === 'failed' ? (
          <span className="text-[10px] text-red-400 font-mono">✗ Failed</span>
        ) : execution?.status === 'aborted' ? (
          <span className="text-[10px] text-amber-400 font-mono">⏹ Aborted</span>
        ) : (
          <span className="text-[10px] text-fg-faint font-mono">Ready</span>
        )}
        <div className="flex-1" />
        <span className="text-[9px] text-fg-faint font-mono">⌘⇧W toggle</span>
      </div>
    </div>
  )
}

// --- Toolbar helpers ---

function useOutsideClose(ref: React.RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onClose])
}

type AddKind = 'prompt' | 'condition' | 'script' | 'parallel' | 'join' | 'loop' | 'humanReview' | 'subworkflow'

function AddNodeMenu({
  onAdd,
  disabled
}: {
  onAdd: (type: AddKind) => void
  disabled: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOutsideClose(ref, () => setOpen(false))

  const items: { group: string; nodes: { type: AddKind; label: string; desc: string; dot: string }[] }[] = [
    {
      group: 'Core',
      nodes: [
        { type: 'prompt', label: 'Prompt', desc: 'Run Claude with a prompt', dot: 'bg-blue-400' },
        { type: 'script', label: 'Script', desc: 'Run a shell command', dot: 'bg-purple-400' },
        { type: 'condition', label: 'Condition', desc: 'Branch yes / no', dot: 'bg-amber-400' }
      ]
    },
    {
      group: 'Flow',
      nodes: [
        { type: 'parallel', label: 'Fork', desc: 'Fan out to all branches', dot: 'bg-cyan-400' },
        { type: 'join', label: 'Join', desc: 'Wait for all branches', dot: 'bg-cyan-400' },
        { type: 'loop', label: 'Loop', desc: 'Repeat while condition', dot: 'bg-pink-400' },
        { type: 'humanReview', label: 'Review', desc: 'Pause for approval', dot: 'bg-orange-400' }
      ]
    },
    {
      group: 'Compose',
      nodes: [
        { type: 'subworkflow', label: 'Sub-flow', desc: 'Call another workflow', dot: 'bg-violet-400' }
      ]
    }
  ]

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={`text-[10px] px-2.5 py-1 rounded border disabled:opacity-40 flex items-center gap-1 ${
          open
            ? 'text-fg bg-overlay-3 border-line-strong'
            : 'text-fg-muted bg-overlay-1 border-line hover:bg-overlay-3'
        }`}
      >
        <span className="font-semibold">+ Add</span>
        <span className="text-fg-subtle">▾</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-surface-1 border border-line-strong rounded-lg shadow-2xl z-20 w-[240px] py-1">
          {items.map((group, gi) => (
            <div key={group.group}>
              {gi > 0 && <div className="h-px bg-overlay-2 my-1" />}
              <div className="text-[9px] font-mono uppercase tracking-wider text-fg-subtle px-3 py-1">
                {group.group}
              </div>
              {group.nodes.map((n) => (
                <button
                  key={n.type}
                  onClick={() => {
                    onAdd(n.type)
                    setOpen(false)
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-overlay-1 flex items-center gap-2"
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${n.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-fg-strong">{n.label}</div>
                    <div className="text-[9px] text-fg-subtle truncate">{n.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SegButton({
  active,
  onClick,
  disabled,
  children,
  activeTone,
  title
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  activeTone: 'blue' | 'emerald' | 'white'
  title?: string
}): React.JSX.Element {
  const activeClass =
    activeTone === 'blue'
      ? 'text-blue-400 bg-blue-500/15'
      : activeTone === 'emerald'
        ? 'text-emerald-400 bg-emerald-500/15'
        : 'text-fg bg-overlay-3'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`text-[10px] px-2.5 py-1 disabled:opacity-40 ${
        active ? activeClass : 'text-fg-muted hover:bg-overlay-1'
      }`}
    >
      {children}
    </button>
  )
}

function OverflowMenu({
  onImport,
  onExport,
  onShareToMarketplace,
  disabled
}: {
  onImport: () => void
  onExport: () => void
  onShareToMarketplace: () => void
  disabled: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOutsideClose(ref, () => setOpen(false))

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={`text-[12px] w-7 h-7 rounded border flex items-center justify-center disabled:opacity-40 ${
          open
            ? 'text-fg bg-overlay-3 border-line-strong'
            : 'text-fg-muted bg-overlay-1 border-line hover:bg-overlay-3'
        }`}
        title="More actions"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-surface-1 border border-line-strong rounded-lg shadow-2xl z-20 w-[200px] py-1">
          <button
            onClick={() => { onImport(); setOpen(false) }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-fg-muted hover:bg-overlay-1"
          >
            Import workflow…
          </button>
          <button
            onClick={() => { onExport(); setOpen(false) }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-fg-muted hover:bg-overlay-1"
          >
            Export workflow…
          </button>
          <div className="h-px bg-overlay-2 my-1" />
          <button
            onClick={() => { onShareToMarketplace(); setOpen(false) }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-emerald-400/85 hover:bg-overlay-1"
          >
            Share to marketplace…
          </button>
        </div>
      )}
    </div>
  )
}

function RunButton({
  disabled,
  currentCwd,
  recentCwds,
  onRun,
  onPickCwd
}: {
  disabled: boolean
  currentCwd: string
  recentCwds: string[]
  onRun: (cwd?: string) => void
  onPickCwd: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOutsideClose(ref, () => setOpen(false))
  const recents = recentCwds.filter((c) => c !== currentCwd).slice(0, 5)
  const shortPath = (p: string): string => {
    if (!p) return ''
    const parts = p.split('/').filter(Boolean)
    return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p
  }
  return (
    <div ref={ref} className="relative flex-shrink-0 flex items-stretch">
      <button
        onClick={() => onRun()}
        disabled={disabled}
        className="text-[10px] font-semibold text-fg bg-green-600 px-3 py-1 rounded-l hover:bg-green-700 disabled:opacity-40"
        title={currentCwd ? `Run on ${currentCwd}` : 'Run'}
      >
        ▶ Run
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="text-[10px] font-semibold text-fg bg-green-700 hover:bg-green-600 px-1.5 rounded-r border-l border-green-900/50 disabled:opacity-40"
        title="Run on…"
      >
        ▾
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-surface-1 border border-line-strong rounded-lg shadow-2xl z-20 w-[280px] py-1">
          {currentCwd && (
            <>
              <div className="text-[9px] font-mono uppercase tracking-wider text-fg-subtle px-3 py-1">
                Current
              </div>
              <button
                onClick={() => { setOpen(false); onRun(currentCwd) }}
                className="w-full text-left px-3 py-1.5 hover:bg-overlay-1 flex items-center gap-2"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-fg-strong truncate">{shortPath(currentCwd)}</div>
                </div>
              </button>
            </>
          )}
          {recents.length > 0 && (
            <>
              <div className="h-px bg-overlay-2 my-1" />
              <div className="text-[9px] font-mono uppercase tracking-wider text-fg-subtle px-3 py-1">
                Recent
              </div>
              {recents.map((rc) => (
                <button
                  key={rc}
                  onClick={() => { setOpen(false); onRun(rc) }}
                  className="w-full text-left px-3 py-1.5 hover:bg-overlay-1 flex items-center gap-2"
                  title={rc}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-fg-subtle" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-fg-muted truncate font-mono">
                      {shortPath(rc)}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
          <div className="h-px bg-overlay-2 my-1" />
          <button
            onClick={() => { setOpen(false); onPickCwd() }}
            className="w-full text-left px-3 py-1.5 hover:bg-overlay-1 text-[11px] text-blue-400"
          >
            Run on other project…
          </button>
        </div>
      )}
    </div>
  )
}

// --- Vars Panel ---

function VarsPanel({
  vars,
  onClose
}: {
  vars: Record<string, string>
  onClose: () => void
}): React.JSX.Element {
  const entries = Object.entries(vars)
  return (
    <div className="w-[320px] flex-shrink-0 bg-surface-2 border-l border-line-soft flex flex-col overflow-hidden">
      <div className="h-11 flex items-center justify-between px-4 border-b border-line-soft">
        <span className="text-xs font-semibold text-fg-strong">Workflow Variables</span>
        <button onClick={onClose} className="text-fg-subtle hover:text-fg-muted text-sm">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <p className="text-[10px] text-fg-subtle leading-relaxed">
          Variables set during execution via prompt node&apos;s <span className="text-blue-400">Set Variables</span> configuration.
          Use <code className="text-blue-400/60">{'{{vars.name}}'}</code> to reference them.
        </p>
        {entries.length === 0 ? (
          <p className="text-[10px] text-fg-faint italic">No variables set yet.</p>
        ) : (
          entries.map(([name, value]) => (
            <div key={name} className="bg-surface-1 border border-line-soft rounded-md p-2.5">
              <div className="text-[10px] font-mono text-emerald-400">{name}</div>
              <pre className="text-[10px] text-fg-muted font-mono whitespace-pre-wrap break-words mt-1 max-h-32 overflow-y-auto">
                {value || '(empty)'}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// --- Metrics Panel ---

function formatDuration(ms: number): string {
  if (ms <= 0) return '0s'
  if (ms < 1000) return `${ms}ms`
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  if (mins < 60) return `${mins}m ${rem}s`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

function MetricsPanel({
  workflowId,
  executions,
  onClose
}: {
  workflowId: string
  executions: WorkflowExecutionRecord[]
  onClose: () => void
}): React.JSX.Element {
  const [metrics, setMetrics] = useState<WorkflowMetrics | null>(null)

  useEffect(() => {
    window.api.workflow.metrics(workflowId).then((m) => setMetrics(m as WorkflowMetrics | null))
  }, [workflowId, executions.length])

  const successRate = metrics && metrics.totalRuns > 0
    ? Math.round((metrics.successRuns / metrics.totalRuns) * 100)
    : 0

  const tokens = metrics?.totalTokens ?? { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
  const totalTok = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheCreation

  return (
    <div className="w-[380px] flex-shrink-0 bg-surface-2 border-l border-line-soft flex flex-col overflow-hidden">
      <div className="h-11 flex items-center justify-between px-4 border-b border-line-soft">
        <span className="text-xs font-semibold text-fg-strong">Metrics</span>
        <button onClick={onClose} className="text-fg-subtle hover:text-fg-muted text-sm">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!metrics || metrics.totalRuns === 0 ? (
          <div className="text-[11px] text-fg-subtle leading-relaxed">
            No executions yet. Run this workflow to start collecting metrics.
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Total runs" value={String(metrics.totalRuns)} />
              <StatCard
                label="Success"
                value={`${successRate}%`}
                accent={successRate >= 80 ? 'green' : successRate >= 50 ? 'amber' : 'red'}
              />
              <StatCard label="Avg duration" value={formatDuration(metrics.avgDurationMs)} />
              <StatCard
                label="Total tokens"
                value={formatTokens(totalTok)}
                accent="blue"
              />
            </div>

            {/* Status breakdown */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-fg-subtle mb-1.5">
                Status breakdown
              </div>
              <div className="bg-surface-1 border border-line-soft rounded p-2 space-y-1">
                <BreakdownRow label="Success" count={metrics.successRuns} total={metrics.totalRuns} color="bg-green-500" />
                <BreakdownRow label="Failed" count={metrics.failedRuns} total={metrics.totalRuns} color="bg-red-500" />
                <BreakdownRow label="Aborted" count={metrics.abortedRuns} total={metrics.totalRuns} color="bg-amber-500" />
              </div>
            </div>

            {/* Tokens detail */}
            {totalTok > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-fg-subtle mb-1.5">
                  Token usage
                </div>
                <div className="bg-surface-1 border border-line-soft rounded p-2 space-y-1 text-[11px] font-mono">
                  <div className="flex justify-between"><span className="text-fg-muted">Input</span><span className="text-fg-strong">{formatTokens(tokens.input)}</span></div>
                  <div className="flex justify-between"><span className="text-fg-muted">Output</span><span className="text-fg-strong">{formatTokens(tokens.output)}</span></div>
                  <div className="flex justify-between"><span className="text-fg-muted">Cache read</span><span className="text-fg-muted">{formatTokens(tokens.cacheRead)}</span></div>
                  <div className="flex justify-between"><span className="text-fg-muted">Cache write</span><span className="text-fg-muted">{formatTokens(tokens.cacheCreation)}</span></div>
                </div>
              </div>
            )}

            {/* Top failing nodes */}
            {metrics.topFailingNodes.length > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-fg-subtle mb-1.5">
                  Most failing nodes
                </div>
                <div className="bg-surface-1 border border-line-soft rounded p-2 space-y-1">
                  {metrics.topFailingNodes.map((n) => (
                    <div key={n.nodeId} className="flex items-center justify-between text-[11px]">
                      <span className="text-fg-strong truncate flex-1">{n.nodeLabel}</span>
                      <span className="text-red-400 font-mono ml-2">{n.failures}×</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Last run */}
            {metrics.lastRunAt && (
              <div className="text-[10px] text-fg-subtle font-mono pt-1 border-t border-line-soft">
                Last run: {new Date(metrics.lastRunAt).toLocaleString()} · {metrics.lastStatus}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent
}: {
  label: string
  value: string
  accent?: 'green' | 'amber' | 'red' | 'blue'
}): React.JSX.Element {
  const tone =
    accent === 'green' ? 'text-green-400'
      : accent === 'amber' ? 'text-amber-400'
        : accent === 'red' ? 'text-red-400'
          : accent === 'blue' ? 'text-blue-400'
            : 'text-fg-strong'
  return (
    <div className="bg-surface-1 border border-line-soft rounded p-2.5">
      <div className="text-[9px] font-mono uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${tone}`}>{value}</div>
    </div>
  )
}

function BreakdownRow({
  label,
  count,
  total,
  color
}: {
  label: string
  count: number
  total: number
  color: string
}): React.JSX.Element {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <div className="w-16 text-fg-muted">{label}</div>
      <div className="flex-1 bg-overlay-1 h-1.5 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-12 text-right font-mono text-fg-muted">{count} ({pct}%)</div>
    </div>
  )
}

// --- Triggers Panel ---

function TriggersPanel({
  workflow,
  currentCwd,
  onChange,
  onSave,
  onClose
}: {
  workflow: WorkflowDefinition
  currentCwd: string
  onChange: (triggers: WorkflowTrigger[]) => void
  onSave: () => Promise<void>
  onClose: () => void
}): React.JSX.Element {
  const triggers = workflow.triggers ?? []

  const addTrigger = async (kind: 'cron' | 'fileWatcher' | 'webhook'): Promise<void> => {
    const id = `trg-${Date.now()}`
    let next: WorkflowTrigger
    if (kind === 'cron') {
      next = {
        id,
        type: 'cron',
        enabled: false,
        schedule: '0 * * * *',
        cwd: currentCwd
      }
    } else if (kind === 'fileWatcher') {
      next = {
        id,
        type: 'fileWatcher',
        enabled: false,
        paths: ['**/*'],
        cwd: currentCwd,
        events: ['change'],
        debounceMs: 1000
      }
    } else {
      const { token } = await window.api.workflow.generateTriggerToken()
      next = {
        id,
        type: 'webhook',
        enabled: false,
        token,
        cwd: currentCwd
      }
    }
    onChange([...triggers, next])
  }

  const updateTrigger = (id: string, patch: Partial<WorkflowTrigger>): void => {
    onChange(triggers.map((t) => (t.id === id ? { ...t, ...patch } as WorkflowTrigger : t)))
  }

  const removeTrigger = (id: string): void => {
    onChange(triggers.filter((t) => t.id !== id))
  }

  const testTrigger = async (id: string): Promise<void> => {
    await onSave()
    const result = await window.api.workflow.testTrigger(workflow.id, id)
    if (!result.ok) alert(`Test failed: ${result.error ?? 'unknown'}`)
  }

  return (
    <div className="w-[420px] flex-shrink-0 bg-surface-2 border-l border-line-soft flex flex-col overflow-hidden">
      <div className="h-11 flex items-center justify-between px-4 border-b border-line-soft">
        <span className="text-xs font-semibold text-fg-strong">Triggers</span>
        <button onClick={onClose} className="text-fg-subtle hover:text-fg-muted text-sm">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex gap-1.5">
          <button
            onClick={() => addTrigger('cron')}
            className="flex-1 text-[10px] text-fg-muted bg-overlay-1 border border-line rounded px-2 py-1.5 hover:bg-overlay-3"
          >
            + Schedule
          </button>
          <button
            onClick={() => addTrigger('fileWatcher')}
            className="flex-1 text-[10px] text-fg-muted bg-overlay-1 border border-line rounded px-2 py-1.5 hover:bg-overlay-3"
          >
            + File watch
          </button>
          <button
            onClick={() => addTrigger('webhook')}
            className="flex-1 text-[10px] text-fg-muted bg-overlay-1 border border-line rounded px-2 py-1.5 hover:bg-overlay-3"
          >
            + Webhook
          </button>
        </div>

        {triggers.length === 0 && (
          <div className="text-[11px] text-fg-subtle leading-relaxed">
            No triggers configured. Add a schedule, file watcher, or webhook to fire this workflow
            automatically. Changes take effect after Save.
          </div>
        )}

        {triggers.map((t) => (
          <TriggerCard
            key={t.id}
            workflowId={workflow.id}
            trigger={t}
            onUpdate={(patch) => updateTrigger(t.id, patch)}
            onRemove={() => removeTrigger(t.id)}
            onTest={() => testTrigger(t.id)}
          />
        ))}

        <p className="text-[9px] text-fg-faint leading-relaxed pt-2 border-t border-line-soft">
          Triggers require this app to stay running. Changes are applied on Save.
        </p>
      </div>
    </div>
  )
}

function TriggerCard({
  workflowId,
  trigger,
  onUpdate,
  onRemove,
  onTest
}: {
  workflowId: string
  trigger: WorkflowTrigger
  onUpdate: (patch: Partial<WorkflowTrigger>) => void
  onRemove: () => void
  onTest: () => void
}): React.JSX.Element {
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null)

  useEffect(() => {
    if (trigger.type !== 'webhook') return
    window.api.workflow
      .webhookUrl(workflowId, trigger.id, trigger.token)
      .then((r) => setWebhookUrl(r.url))
  }, [trigger, workflowId])

  const typeColor =
    trigger.type === 'cron' ? 'text-cyan-400 bg-cyan-500/10'
      : trigger.type === 'fileWatcher' ? 'text-emerald-400 bg-emerald-500/10'
        : 'text-violet-400 bg-violet-500/10'
  const typeLabel =
    trigger.type === 'cron' ? 'SCHEDULE'
      : trigger.type === 'fileWatcher' ? 'FILE WATCHER'
        : 'WEBHOOK'

  const copyUrl = (): void => {
    if (webhookUrl) navigator.clipboard.writeText(webhookUrl).catch(() => {})
  }

  return (
    <div className="bg-surface-1 border border-line rounded-md p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className={`text-[8px] font-bold tracking-wider font-mono px-1.5 py-0.5 rounded ${typeColor}`}>
          {typeLabel}
        </span>
        <input
          value={trigger.name ?? ''}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Label (optional)"
          className="flex-1 bg-transparent text-[11px] text-fg-strong focus:outline-none min-w-0"
        />
        <label className="flex items-center gap-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={trigger.enabled}
            onChange={(e) => onUpdate({ enabled: e.target.checked })}
            className="accent-green-500 w-3 h-3"
          />
          <span className="text-[10px] text-fg-muted">on</span>
        </label>
      </div>

      {trigger.type === 'cron' && (
        <>
          <div>
            <label className="text-[9px] text-fg-subtle block mb-0.5">Cron schedule</label>
            <input
              value={trigger.schedule}
              onChange={(e) => onUpdate({ schedule: e.target.value })}
              placeholder="*/15 * * * *"
              className="w-full bg-surface-2 border border-line rounded px-2 py-1 text-[11px] text-fg-strong font-mono focus:border-cyan-500/40 focus:outline-none"
            />
            <p className="text-[9px] text-fg-faint mt-0.5 font-mono">
              e.g. <span className="text-cyan-400/70">0 9 * * 1-5</span> (9am weekdays)
            </p>
          </div>
          <CwdField cwd={trigger.cwd} onChange={(cwd) => onUpdate({ cwd })} />
        </>
      )}

      {trigger.type === 'fileWatcher' && (
        <>
          <div>
            <label className="text-[9px] text-fg-subtle block mb-0.5">Paths (glob, one per line)</label>
            <textarea
              value={trigger.paths.join('\n')}
              onChange={(e) => onUpdate({ paths: e.target.value.split('\n').map((p) => p.trim()).filter(Boolean) })}
              rows={2}
              placeholder="src/**/*.ts"
              className="w-full bg-surface-2 border border-line rounded px-2 py-1 text-[11px] text-fg-strong font-mono resize-none focus:border-emerald-500/40 focus:outline-none"
            />
          </div>
          <CwdField cwd={trigger.cwd} onChange={(cwd) => onUpdate({ cwd })} />
          <div className="flex gap-3">
            {(['add', 'change', 'unlink'] as const).map((ev) => (
              <label key={ev} className="flex items-center gap-1 text-[10px] text-fg-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={trigger.events?.includes(ev) ?? false}
                  onChange={(e) => {
                    const current = new Set(trigger.events ?? [])
                    if (e.target.checked) current.add(ev)
                    else current.delete(ev)
                    onUpdate({ events: Array.from(current) })
                  }}
                  className="accent-emerald-500 w-3 h-3"
                />
                {ev}
              </label>
            ))}
          </div>
          <div>
            <label className="text-[9px] text-fg-subtle block mb-0.5">Debounce (ms)</label>
            <input
              type="number"
              min={0}
              value={trigger.debounceMs ?? 1000}
              onChange={(e) => onUpdate({ debounceMs: parseInt(e.target.value, 10) || 0 })}
              className="w-24 bg-surface-2 border border-line rounded px-2 py-1 text-[11px] text-fg-strong font-mono focus:outline-none"
            />
          </div>
        </>
      )}

      {trigger.type === 'webhook' && (
        <>
          <CwdField cwd={trigger.cwd} onChange={(cwd) => onUpdate({ cwd })} />
          <div>
            <label className="text-[9px] text-fg-subtle block mb-0.5">URL (local only)</label>
            <div className="flex gap-1">
              <input
                value={webhookUrl ?? 'Server not running'}
                readOnly
                className="flex-1 bg-surface-2 border border-line rounded px-2 py-1 text-[10px] text-fg-muted font-mono focus:outline-none"
              />
              <button
                onClick={copyUrl}
                disabled={!webhookUrl}
                className="text-[10px] text-fg-muted bg-overlay-2 border border-line rounded px-2 py-1 hover:bg-overlay-4 disabled:opacity-40"
              >
                Copy
              </button>
            </div>
            <p className="text-[9px] text-fg-faint mt-0.5">
              POST to fire. JSON body becomes input values. Token-gated.
            </p>
          </div>
        </>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onTest}
          className="text-[10px] text-blue-400/80 hover:text-blue-300 px-2 py-0.5"
        >
          Test now
        </button>
        <button
          onClick={onRemove}
          className="text-[10px] text-red-400/60 hover:text-red-400 px-2 py-0.5"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

function CwdField({
  cwd,
  onChange
}: {
  cwd: string
  onChange: (cwd: string) => void
}): React.JSX.Element {
  const pick = async (): Promise<void> => {
    const picked = await window.api.dialog.pickFolder()
    if (picked) onChange(picked)
  }
  return (
    <div>
      <label className="text-[9px] text-fg-subtle block mb-0.5">Working directory</label>
      <div className="flex gap-1">
        <input
          value={cwd}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/path/to/project"
          className="flex-1 bg-surface-2 border border-line rounded px-2 py-1 text-[11px] text-fg-strong font-mono focus:outline-none min-w-0"
        />
        <button
          onClick={pick}
          className="text-[10px] text-fg-muted bg-overlay-2 border border-line rounded px-2 py-1 hover:bg-overlay-4"
        >
          Pick…
        </button>
      </div>
    </div>
  )
}

// --- History Panel ---

function HistoryPanel({
  workflowId,
  onClose
}: {
  workflowId: string
  onClose: () => void
}): React.JSX.Element {
  const { executions, setExecutions } = useWorkflowStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = executions.find((r) => r.id === selectedId)

  const refresh = async (): Promise<void> => {
    const recs = (await window.api.workflow.listExecutions(workflowId)) as WorkflowExecutionRecord[]
    setExecutions(recs)
  }
  useEffect(() => {
    refresh()
  }, [workflowId])

  const del = async (id: string): Promise<void> => {
    await window.api.workflow.deleteExecution(id)
    if (selectedId === id) setSelectedId(null)
    refresh()
  }

  return (
    <div className="w-[360px] flex-shrink-0 bg-surface-2 border-l border-line-soft flex flex-col overflow-hidden">
      <div className="h-11 flex items-center justify-between px-4 border-b border-line-soft">
        <span className="text-xs font-semibold text-fg-strong">Execution History</span>
        <button onClick={onClose} className="text-fg-subtle hover:text-fg-muted text-sm">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {executions.length === 0 && (
          <p className="text-[10px] text-fg-faint italic">No past executions.</p>
        )}
        {executions.map((rec) => (
          <div
            key={rec.id}
            onClick={() => setSelectedId(rec.id)}
            className={`bg-surface-1 border rounded-md p-2.5 cursor-pointer transition-colors ${
              selectedId === rec.id
                ? 'border-blue-500/40'
                : 'border-line-soft hover:border-line-strong'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                    rec.status === 'done'
                      ? 'bg-green-500/15 text-green-400'
                      : rec.status === 'failed'
                        ? 'bg-red-500/15 text-red-400'
                        : 'bg-amber-500/15 text-amber-400'
                  }`}
                >
                  {rec.status}
                </span>
                <span className="text-[10px] text-fg-muted font-mono">
                  {new Date(rec.startedAt).toLocaleString()}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); del(rec.id) }}
                className="text-[10px] text-red-400/60 hover:text-red-400"
              >
                ×
              </button>
            </div>
            <div className="text-[9px] text-fg-subtle mt-1 font-mono">
              {Math.round((rec.finishedAt - rec.startedAt) / 1000)}s ·{' '}
              {Object.keys(rec.nodeStates).length} nodes
              {Object.keys(rec.finalVars).length > 0
                ? ` · ${Object.keys(rec.finalVars).length} vars`
                : ''}
            </div>
            {rec.error && (
              <div className="text-[9px] text-red-400/70 mt-1 truncate">{rec.error}</div>
            )}
          </div>
        ))}

        {selected && (
          <div className="mt-3 bg-surface-1 border border-line rounded-md p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-fg-strong">Details</span>
              <button
                onClick={() => replayIntoCurrent(selected)}
                className="text-[9px] text-blue-400 hover:text-blue-300 font-mono"
              >
                load inputs/vars →
              </button>
            </div>
            {Object.keys(selected.inputValues).length > 0 && (
              <div>
                <div className="text-[9px] text-fg-subtle mb-1">Inputs</div>
                {Object.entries(selected.inputValues).map(([k, v]) => (
                  <div key={k} className="text-[9px] font-mono text-fg-muted">
                    <span className="text-blue-400">{k}</span>={v.slice(0, 60)}
                    {v.length > 60 ? '…' : ''}
                  </div>
                ))}
              </div>
            )}
            {Object.keys(selected.finalVars).length > 0 && (
              <div>
                <div className="text-[9px] text-fg-subtle mb-1">Final Variables</div>
                {Object.entries(selected.finalVars).map(([k, v]) => (
                  <div key={k} className="text-[9px] font-mono text-fg-muted">
                    <span className="text-emerald-400">{k}</span>=
                    {v.slice(0, 60)}
                    {v.length > 60 ? '…' : ''}
                  </div>
                ))}
              </div>
            )}
            <div>
              <div className="text-[9px] text-fg-subtle mb-1">Nodes</div>
              {Object.values(selected.nodeStates).map((ns) => (
                <div key={ns.nodeId} className="text-[9px] font-mono text-fg-muted flex gap-2">
                  <span
                    className={
                      ns.status === 'done'
                        ? 'text-green-500'
                        : ns.status === 'failed'
                          ? 'text-red-500'
                          : ns.status === 'skipped'
                            ? 'text-yellow-500/60'
                            : 'text-fg-subtle'
                    }
                  >
                    {ns.status}
                  </span>
                  <span>{ns.nodeId}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function replayIntoCurrent(rec: WorkflowExecutionRecord): void {
  const { currentWorkflow, setExecution } = useWorkflowStore.getState()
  if (!currentWorkflow || currentWorkflow.id !== rec.workflowId) return
  setExecution({
    id: rec.id,
    workflowId: rec.workflowId,
    status: rec.status === 'done' ? 'done' : rec.status === 'failed' ? 'failed' : 'aborted',
    nodeStates: rec.nodeStates,
    vars: rec.finalVars,
    startedAt: rec.startedAt,
    finishedAt: rec.finishedAt
  })
}

// --- Run Dialog ---

function RunDialog({
  inputs,
  onRun,
  onCancel
}: {
  inputs: WorkflowInputVar[]
  onRun: (values: Record<string, string>) => void
  onCancel: () => void
}): React.JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const input of inputs) init[input.key] = input.defaultValue ?? ''
    return init
  })

  const hasEmptyInputs = inputs.some((inp) => !values[inp.key]?.trim())

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (hasEmptyInputs) return
    onRun(values)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="bg-surface-2 border border-line-strong rounded-xl w-[440px] max-h-[80vh] flex flex-col shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-line-soft">
          <h2 className="text-sm font-semibold text-fg-strong">Run Workflow</h2>
          <p className="text-[11px] text-fg-subtle mt-0.5">Fill in the inputs before running</p>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {inputs.map((input) => (
            <div key={input.key}>
              <label className="text-[11px] font-medium text-fg-muted block mb-1.5">
                {input.label}
              </label>
              <textarea
                value={values[input.key] ?? ''}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [input.key]: e.target.value }))
                }
                placeholder={input.placeholder}
                rows={2}
                className="w-full bg-surface-1 border border-line-strong rounded-lg px-3 py-2 text-xs text-fg-strong placeholder-fg-faint font-mono resize-none focus:border-blue-500/40 focus:outline-none"
              />
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-line-soft flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-[11px] text-fg-muted bg-overlay-2 px-4 py-1.5 rounded-md hover:bg-overlay-3"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={hasEmptyInputs}
            className="text-[11px] font-semibold text-fg bg-green-600 px-4 py-1.5 rounded-md hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ▶ Run
          </button>
        </div>
      </form>
    </div>
  )
}

// --- Review Dialog ---

function ReviewDialog({ request }: { request: ReviewRequest }): React.JSX.Element {
  const { popReview } = useWorkflowStore()

  const respond = async (approved: boolean): Promise<void> => {
    await window.api.workflow.reviewResponse(request.executionId, request.nodeId, approved)
    popReview(request.nodeId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-2 border border-orange-400/30 rounded-xl w-[560px] max-h-[80vh] flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-line-soft">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
            <h2 className="text-sm font-semibold text-fg-strong">Human Review Needed</h2>
            <span className="text-[9px] font-mono text-orange-400/70">{request.label}</span>
          </div>
          {request.message && (
            <p className="text-[11px] text-fg-muted mt-1 leading-relaxed">{request.message}</p>
          )}
        </div>
        <div className="px-5 py-3 border-b border-line-soft space-y-2 overflow-y-auto flex-1 max-h-[50vh]">
          <div>
            <div className="text-[10px] font-medium text-fg-subtle mb-1">Previous Node Output</div>
            <pre className="bg-surface-1 border border-line-soft rounded-md p-3 text-[11px] text-fg-muted font-mono whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
              {request.prevOutput || '(empty)'}
            </pre>
          </div>
          {Object.keys(request.vars).length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-fg-subtle mb-1">Workflow Variables</div>
              <div className="bg-surface-1 border border-line-soft rounded-md p-3">
                {Object.entries(request.vars).map(([k, v]) => (
                  <div key={k} className="text-[10px] font-mono text-fg-muted">
                    <span className="text-emerald-400">{k}</span>={v.slice(0, 120)}
                    {v.length > 120 ? '…' : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 flex justify-end gap-2">
          <button
            onClick={() => respond(false)}
            className="text-[11px] text-red-300 bg-red-500/15 border border-red-500/30 px-4 py-1.5 rounded-md hover:bg-red-500/25"
          >
            ✕ Reject
          </button>
          <button
            onClick={() => respond(true)}
            className="text-[11px] font-semibold text-fg bg-green-600 px-4 py-1.5 rounded-md hover:bg-green-700"
          >
            ✓ Approve
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Inputs Editor ---

function InputsEditor({
  inputs,
  onChange,
  onClose
}: {
  inputs: WorkflowInputVar[]
  onChange: (inputs: WorkflowInputVar[]) => void
  onClose: () => void
}): React.JSX.Element {
  const addInput = (): void => {
    const key = `input_${Date.now()}`
    onChange([...inputs, { key, label: 'New Input', placeholder: '' }])
  }
  const updateInput = (index: number, patch: Partial<WorkflowInputVar>): void => {
    const updated = inputs.map((inp, i) => (i === index ? { ...inp, ...patch } : inp))
    onChange(updated)
  }
  const removeInput = (index: number): void => {
    onChange(inputs.filter((_, i) => i !== index))
  }

  return (
    <div className="w-[272px] flex-shrink-0 bg-surface-2 border-l border-line-soft flex flex-col overflow-hidden">
      <div className="h-11 flex items-center justify-between px-4 border-b border-line-soft">
        <span className="text-xs font-semibold text-fg-strong">Workflow Inputs</span>
        <button onClick={onClose} className="text-fg-subtle hover:text-fg-muted text-sm">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-[10px] text-fg-subtle leading-relaxed">
          Define inputs that users fill in before running. Use{' '}
          <code className="text-blue-400/60">{'{{input.key}}'}</code> in node prompts.
        </p>
        {inputs.map((inp, i) => (
          <div key={i} className="space-y-2 pb-3 border-b border-line-soft">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-fg-faint font-mono">#{i + 1}</span>
              <button
                onClick={() => removeInput(i)}
                className="text-[10px] text-red-400/60 hover:text-red-400"
              >
                remove
              </button>
            </div>
            <div>
              <label className="text-[9px] text-fg-subtle block mb-0.5">Key</label>
              <input
                value={inp.key}
                onChange={(e) =>
                  updateInput(i, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })
                }
                className="w-full bg-surface-1 border border-line rounded px-2 py-1 text-[10px] text-fg-strong font-mono focus:outline-none focus:border-blue-500/40"
              />
            </div>
            <div>
              <label className="text-[9px] text-fg-subtle block mb-0.5">Label</label>
              <input
                value={inp.label}
                onChange={(e) => updateInput(i, { label: e.target.value })}
                className="w-full bg-surface-1 border border-line rounded px-2 py-1 text-[10px] text-fg-strong focus:outline-none focus:border-blue-500/40"
              />
            </div>
            <div>
              <label className="text-[9px] text-fg-subtle block mb-0.5">Placeholder</label>
              <input
                value={inp.placeholder ?? ''}
                onChange={(e) => updateInput(i, { placeholder: e.target.value })}
                className="w-full bg-surface-1 border border-line rounded px-2 py-1 text-[10px] text-fg-muted focus:outline-none focus:border-blue-500/40"
              />
            </div>
          </div>
        ))}
        <button
          onClick={addInput}
          className="w-full text-[10px] font-medium text-blue-400 bg-blue-500/10 py-1.5 rounded-md hover:bg-blue-500/20"
        >
          + Add Input
        </button>
      </div>
    </div>
  )
}

// --- Templates View ---

type TemplatesTab = 'builtin' | 'marketplace' | 'saved'

function TemplatesView({
  onUseTemplate,
  onCreateNew,
  onImport,
  workflows,
  onOpenWorkflow,
  onClose,
  onWorkflowsChanged
}: {
  onUseTemplate: (tpl: WorkflowDefinition) => void
  onCreateNew: () => void
  onImport: () => void
  workflows: WorkflowDefinition[]
  onOpenWorkflow: (id: string) => void
  onClose: () => void
  onWorkflowsChanged: () => void
}): React.JSX.Element {
  const [templates, setTemplates] = useState<WorkflowDefinition[]>([])
  const [tab, setTab] = useState<TemplatesTab>('builtin')

  useEffect(() => {
    window.api.workflow.templates().then((t) => setTemplates(t as WorkflowDefinition[]))
  }, [])

  return (
    <div className="flex flex-col h-full bg-surface-1">
      <div className="h-[46px] bg-surface-2 border-b border-line-soft flex items-center px-4 gap-3 flex-shrink-0">
        <button onClick={onClose} className="text-fg-subtle hover:text-fg-muted text-sm mr-1">
          ←
        </button>
        <span className="text-sm font-semibold text-fg-strong">Workflow Templates</span>
        <div className="flex items-center bg-surface-1 border border-line rounded overflow-hidden ml-3">
          <SegButton active={tab === 'builtin'} onClick={() => setTab('builtin')} activeTone="blue">
            Built-in{templates.length ? ` · ${templates.length}` : ''}
          </SegButton>
          <div className="w-px h-4 bg-overlay-3" />
          <SegButton
            active={tab === 'marketplace'}
            onClick={() => setTab('marketplace')}
            activeTone="emerald"
            title="Community-shared workflows from coide-flows-marketplace"
          >
            Marketplace
          </SegButton>
          <div className="w-px h-4 bg-overlay-3" />
          <SegButton active={tab === 'saved'} onClick={() => setTab('saved')} activeTone="white">
            Saved{workflows.length ? ` · ${workflows.length}` : ''}
          </SegButton>
        </div>
        <div className="flex-1" />
        <button
          onClick={onImport}
          className="text-[10px] text-fg-muted bg-overlay-2 border border-line px-3 py-1 rounded hover:bg-overlay-3"
        >
          Import…
        </button>
        <button
          onClick={onCreateNew}
          className="text-[10px] font-semibold text-fg bg-blue-600 px-3 py-1 rounded hover:bg-blue-700"
        >
          + Blank Workflow
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'builtin' && (
          <div className="grid grid-cols-3 gap-4">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="bg-surface-2 rounded-lg border border-line-soft p-4 flex flex-col gap-2"
              >
                <div className="text-sm font-semibold text-fg-strong">{tpl.name}</div>
                <div className="text-[11px] text-fg-subtle leading-relaxed flex-1">
                  {tpl.description}
                </div>
                <div className="text-[9px] text-fg-faint font-mono">{tpl.nodes.length} nodes</div>
                <button
                  onClick={() => onUseTemplate(tpl)}
                  className="mt-1 text-[11px] font-medium text-fg bg-blue-600 rounded-md py-1.5 hover:bg-blue-700"
                >
                  Use Template
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'marketplace' && (
          <MarketplaceTab installedWorkflows={workflows} onInstalled={onWorkflowsChanged} />
        )}

        {tab === 'saved' && (
          workflows.length === 0 ? (
            <div className="text-[12px] text-fg-subtle">
              No saved workflows yet. Create one from a template, the marketplace, or a blank canvas.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {workflows.map((wf) => (
                <div
                  key={wf.id}
                  onClick={() => onOpenWorkflow(wf.id)}
                  className="bg-surface-2 rounded-lg border border-line-soft p-4 flex flex-col gap-1 cursor-pointer hover:border-line-strong transition-colors"
                >
                  <div className="text-sm font-medium text-fg-strong">{wf.name}</div>
                  <div className="text-[9px] text-fg-faint font-mono">
                    {wf.nodes.length} nodes · updated{' '}
                    {new Date(wf.updatedAt).toLocaleDateString()}
                  </div>
                  {wf.marketplaceId && (
                    <div className="text-[9px] text-emerald-400/70 font-mono mt-0.5">
                      ↓ marketplace · v{wf.marketplaceVersion ?? '?'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

// --- Marketplace Tab ---

function MarketplaceTab({
  installedWorkflows,
  onInstalled
}: {
  installedWorkflows: WorkflowDefinition[]
  onInstalled: () => void
}): React.JSX.Element {
  const [state, setState] = useState<{
    loading: boolean
    error?: string
    index?: MarketplaceIndex
  }>({ loading: true })
  const [installing, setInstalling] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const load = async (force = false): Promise<void> => {
    setState({ loading: true })
    const result = await window.api.workflow.marketplaceList(force)
    setState({ loading: false, index: result.index, error: result.error })
  }

  useEffect(() => { load(false) }, [])

  // Map: marketplaceId → installed version (so we can show "installed / update")
  const installedById = useMemo(() => {
    const m = new Map<string, string>()
    for (const wf of installedWorkflows) {
      if (wf.marketplaceId) m.set(wf.marketplaceId, wf.marketplaceVersion ?? '0.0.0')
    }
    return m
  }, [installedWorkflows])

  const install = async (entry: MarketplaceEntry): Promise<void> => {
    setInstalling(entry.id)
    const result = await window.api.workflow.marketplaceInstall(entry)
    setInstalling(null)
    if (result.error) {
      alert(`Install failed: ${result.error}`)
      return
    }
    onInstalled()
  }

  const filteredEntries = useMemo(() => {
    if (!state.index) return []
    const q = query.trim().toLowerCase()
    if (!q) return state.index.templates
    return state.index.templates.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.author.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
    )
  }, [state.index, query])

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, tag, or author…"
          className="flex-1 bg-surface-1 border border-line rounded-md px-3 py-1.5 text-xs text-fg-strong focus:border-emerald-500/40 focus:outline-none"
        />
        <button
          onClick={() => load(true)}
          disabled={state.loading}
          className="text-[10px] text-fg-muted bg-overlay-2 border border-line px-3 py-1.5 rounded hover:bg-overlay-3 disabled:opacity-40"
        >
          {state.loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <button
          onClick={() => window.api.workflow.marketplaceOpen()}
          className="text-[10px] text-fg-muted hover:text-fg-strong px-2"
          title="Open the marketplace repo on GitHub"
        >
          Open repo ↗
        </button>
      </div>

      {state.error && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 rounded-md px-3 py-2 mb-4">
          {state.error}
        </div>
      )}

      {state.loading && !state.index && (
        <div className="text-[12px] text-fg-subtle">Loading marketplace…</div>
      )}

      {state.index && filteredEntries.length === 0 && !state.loading && (
        <div className="text-[12px] text-fg-subtle">
          {query ? `No templates match "${query}".` : 'No templates available.'}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {filteredEntries.map((entry) => {
          const installedVersion = installedById.get(entry.id)
          const upToDate = installedVersion === entry.version
          const updateAvailable = installedVersion && installedVersion !== entry.version
          return (
            <div
              key={entry.id}
              className="bg-surface-2 rounded-lg border border-line-soft p-4 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-fg-strong leading-tight">{entry.name}</div>
                <div className="text-[9px] text-fg-subtle font-mono shrink-0">v{entry.version}</div>
              </div>
              <div className="text-[11px] text-fg-subtle leading-relaxed flex-1">
                {entry.description}
              </div>
              <div className="flex flex-wrap gap-1">
                {entry.tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="text-[9px] text-emerald-400/70 bg-emerald-500/[0.06] px-1.5 py-0.5 rounded font-mono"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="text-[9px] text-fg-faint font-mono">by {entry.author}</div>
              <button
                onClick={() => install(entry)}
                disabled={installing === entry.id || upToDate}
                className={`mt-1 text-[11px] font-medium rounded-md py-1.5 ${
                  upToDate
                    ? 'text-emerald-300 bg-emerald-500/10 cursor-default'
                    : updateAvailable
                      ? 'text-fg bg-amber-600 hover:bg-amber-700'
                      : 'text-fg bg-emerald-600 hover:bg-emerald-700'
                } disabled:opacity-60`}
              >
                {installing === entry.id
                  ? 'Installing…'
                  : upToDate
                    ? `✓ Installed v${installedVersion}`
                    : updateAvailable
                      ? `Update to v${entry.version}`
                      : 'Install'}
              </button>
            </div>
          )
        })}
      </div>

      {state.index && (
        <div className="text-[9px] text-fg-faint font-mono mt-6 text-right">
          Updated {state.index.updatedAt}
        </div>
      )}
    </div>
  )
}
