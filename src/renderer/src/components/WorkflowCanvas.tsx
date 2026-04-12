import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
  WorkflowInputVar
} from '../../../shared/workflow-types'

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
    default:
      return 'bg-white/20'
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
    default:
      return 'border-white/[0.08]'
  }
}

function PromptNode({ data, selected }: NodeProps): React.JSX.Element {
  const status: WorkflowNodeStatus = (data.status as WorkflowNodeStatus) || 'idle'
  const output = data.output as string | undefined
  return (
    <div
      className={`bg-[#111111] rounded-[10px] border-2 px-3 py-2.5 w-[192px] ${statusBorderColor(status)} ${selected ? 'ring-1 ring-blue-500/40' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-white/20 !w-2 !h-2" />
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
      <div className="text-xs font-medium text-white/90 truncate">
        {data.label as string}
      </div>
      <div className="text-[10px] text-white/35 truncate mt-0.5">
        {(data.prompt as string)?.slice(0, 40)}...
      </div>
      {status === 'done' && (
        <div className="text-[9px] text-green-500/70 font-mono mt-1">
          ✓ done
        </div>
      )}
      {status === 'running' && (
        <div className="text-[9px] text-blue-400/70 font-mono mt-1">
          ⟳ running...
        </div>
      )}
      {status === 'failed' && (
        <div className="text-[9px] text-red-400/70 font-mono mt-1 truncate">
          ✗ {(output as string)?.slice(0, 30) || 'failed'}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-white/20 !w-2 !h-2" />
    </div>
  )
}

function ConditionNode({ data, selected }: NodeProps): React.JSX.Element {
  const status: WorkflowNodeStatus = (data.status as WorkflowNodeStatus) || 'idle'
  return (
    <div
      className={`bg-[#111111] rounded-[10px] border-2 px-3 py-2.5 w-[192px] ${statusBorderColor(status)} ${selected ? 'ring-1 ring-yellow-500/40' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-white/20 !w-2 !h-2" />
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-[7px] h-[7px] rounded-full ${statusColor(status)}`} />
        <span className="text-[9px] font-bold tracking-wider text-amber-400 font-mono">
          CONDITION
        </span>
      </div>
      <div className="text-xs font-medium text-white/80 truncate">
        {data.label as string}
      </div>
      <div className="text-[10px] text-white/30 truncate mt-0.5 font-mono">
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
      className={`bg-[#111111] rounded-[10px] border-2 px-3 py-2.5 w-[192px] ${statusBorderColor(status)} ${selected ? 'ring-1 ring-purple-500/40' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-white/20 !w-2 !h-2" />
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-[7px] h-[7px] rounded-full ${statusColor(status)}`} />
        <span className="text-[9px] font-bold tracking-wider text-purple-400 font-mono">
          SCRIPT
        </span>
      </div>
      <div className="text-xs font-medium text-white/80 truncate">
        {data.label as string}
      </div>
      <div className="text-[10px] text-white/30 truncate mt-0.5 font-mono">
        {(data.command as string)?.slice(0, 35)}
      </div>
      {status === 'done' && (
        <div className="text-[9px] text-green-500/70 font-mono mt-1">✓ done</div>
      )}
      {status === 'running' && (
        <div className="text-[9px] text-blue-400/70 font-mono mt-1">⟳ running...</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-white/20 !w-2 !h-2" />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  prompt: PromptNode,
  condition: ConditionNode,
  script: ScriptNode
}

// --- Converters between WorkflowDefinition and React Flow format ---

function toFlowNodes(
  wfNodes: WorkflowNode[],
  nodeStates: Record<string, { status: WorkflowNodeStatus; output?: string }>
): Node[] {
  return wfNodes.map((n) => ({
    id: n.id,
    type: n.data.type,
    position: n.position,
    selected: false,
    data: {
      label: n.label,
      status: nodeStates[n.id]?.status ?? 'idle',
      output: nodeStates[n.id]?.output ?? '',
      ...(n.data.type === 'prompt'
        ? { prompt: n.data.prompt, model: n.data.model, systemPrompt: n.data.systemPrompt }
        : n.data.type === 'condition'
          ? { expression: n.data.expression }
          : { command: n.data.command })
    }
  }))
}

function toFlowEdges(wfEdges: WorkflowEdge[]): Edge[] {
  return wfEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.label || undefined,
    label: e.label || undefined,
    style: {
      stroke:
        e.label === 'yes'
          ? '#22c55e60'
          : e.label === 'no'
            ? '#ef444460'
            : '#ffffff20'
    },
    labelStyle: {
      fill: e.label === 'yes' ? '#22c55e' : e.label === 'no' ? '#ef4444' : '#ffffff60',
      fontSize: 10,
      fontFamily: 'JetBrains Mono, monospace'
    },
    labelBgStyle: {
      fill: e.label === 'yes' ? '#22c55e15' : e.label === 'no' ? '#ef444415' : '#ffffff08'
    }
  }))
}

function fromFlowNodes(nodes: Node[]): WorkflowNode[] {
  return nodes.map((n) => ({
    id: n.id,
    label: (n.data.label as string) || n.id,
    position: n.position,
    data:
      n.type === 'prompt'
        ? {
            type: 'prompt' as const,
            prompt: (n.data.prompt as string) || '',
            systemPrompt: (n.data.systemPrompt as string) || undefined,
            model: (n.data.model as string) || undefined
          }
        : n.type === 'condition'
          ? {
              type: 'condition' as const,
              expression: (n.data.expression as string) || ''
            }
          : {
              type: 'script' as const,
              command: (n.data.command as string) || ''
            }
  }))
}

function fromFlowEdges(edges: Edge[]): WorkflowEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: (e.label as string) || undefined
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

  return (
    <div className="w-[272px] flex-shrink-0 bg-[#111111] border-l border-white/[0.06] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white/90">Node Config</span>
          <span
            className={`text-[8px] font-bold font-mono px-1.5 py-0.5 rounded ${
              node.data.type === 'prompt'
                ? 'bg-blue-500/15 text-blue-400'
                : node.data.type === 'condition'
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'bg-purple-500/15 text-purple-400'
            }`}
          >
            {node.data.type.toUpperCase()}
          </span>
        </div>
        <button
          onClick={() => setSelectedNodeId(null)}
          className="text-white/40 hover:text-white/70 text-sm"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Name */}
        <div>
          <label className="text-[10px] font-medium text-white/40 block mb-1">Name</label>
          <input
            value={node.label}
            onChange={(e) => updateNodeLabel(e.target.value)}
            disabled={isRunning}
            className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-xs text-white/90 focus:border-blue-500/40 focus:outline-none"
          />
        </div>

        {/* Prompt-specific fields */}
        {node.data.type === 'prompt' && (
          <>
            <div>
              <label className="text-[10px] font-medium text-white/40 block mb-1">Model</label>
              <select
                value={node.data.model || ''}
                onChange={(e) => updateNodeData({ model: e.target.value || undefined })}
                disabled={isRunning}
                className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-xs text-white/90 font-mono focus:border-blue-500/40 focus:outline-none"
              >
                <option value="">default</option>
                <option value="opus">opus</option>
                <option value="sonnet">sonnet</option>
                <option value="haiku">haiku</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-white/40 block mb-1">Prompt</label>
              <textarea
                value={node.data.prompt}
                onChange={(e) => updateNodeData({ prompt: e.target.value })}
                disabled={isRunning}
                rows={5}
                className="w-full bg-[#0a0a0a] border border-blue-500/30 rounded-md px-2.5 py-2 text-[11px] text-white/80 font-mono leading-relaxed resize-none focus:border-blue-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-white/40 block mb-1">
                System Prompt (optional)
              </label>
              <textarea
                value={node.data.systemPrompt || ''}
                onChange={(e) => updateNodeData({ systemPrompt: e.target.value || undefined })}
                disabled={isRunning}
                rows={2}
                className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-md px-2.5 py-2 text-[11px] text-white/60 font-mono resize-none focus:border-blue-500/40 focus:outline-none"
              />
            </div>
          </>
        )}

        {/* Condition-specific fields */}
        {node.data.type === 'condition' && (
          <div>
            <label className="text-[10px] font-medium text-white/40 block mb-1">Expression</label>
            <textarea
              value={node.data.expression}
              onChange={(e) => updateNodeData({ expression: e.target.value })}
              disabled={isRunning}
              rows={3}
              className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-md px-2.5 py-2 text-[11px] text-white/80 font-mono resize-none focus:border-blue-500/40 focus:outline-none"
            />
            <p className="text-[9px] text-white/25 mt-1 font-mono">
              Variable: <code className="text-amber-400/60">output</code> = previous node&apos;s
              result
            </p>
          </div>
        )}

        {/* Script-specific fields */}
        {node.data.type === 'script' && (
          <div>
            <label className="text-[10px] font-medium text-white/40 block mb-1">Command</label>
            <textarea
              value={node.data.command}
              onChange={(e) => updateNodeData({ command: e.target.value })}
              disabled={isRunning}
              rows={3}
              className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-md px-2.5 py-2 text-[11px] text-white/80 font-mono resize-none focus:border-blue-500/40 focus:outline-none"
            />
          </div>
        )}

        {/* Output display */}
        {nodeState && (nodeState.status === 'done' || nodeState.status === 'failed' || nodeState.status === 'running') && (
          <div>
            <label className="text-[10px] font-medium text-white/40 block mb-1">Output</label>
            <div className="bg-[#0a0a0a] border border-white/[0.06] rounded-md p-2.5 max-h-40 overflow-y-auto">
              {nodeState.status === 'running' && (
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                  <span className="text-[9px] text-blue-400 font-mono">Streaming output...</span>
                </div>
              )}
              <pre className="text-[10px] text-white/45 font-mono whitespace-pre-wrap break-words">
                {nodeState.output || nodeState.error || '(no output)'}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
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
    updateNodeState,
    selectedNodeId,
    setSelectedNodeId,
    closeCanvas,
    workflows,
    setWorkflows
  } = useWorkflowStore()

  const cwd = useSessionsStore((s) => {
    const active = s.sessions.find((sess) => sess.id === s.activeSessionId)
    return active?.cwd ?? localStorage.getItem('cwd') ?? ''
  })

  const [showTemplates, setShowTemplates] = useState(!currentWorkflow)
  const [saveFlash, setSaveFlash] = useState(false)
  const [showRunDialog, setShowRunDialog] = useState(false)
  const [showInputsEditor, setShowInputsEditor] = useState(false)

  // Convert workflow to React Flow format
  const nodeStates = execution?.nodeStates ?? {}
  const initialNodes = useMemo(
    () => (currentWorkflow ? toFlowNodes(currentWorkflow.nodes, nodeStates) : []),
    [currentWorkflow?.id] // only recompute on workflow switch
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
    setNodes(toFlowNodes(currentWorkflow.nodes, nodeStates))
    setEdges(toFlowEdges(currentWorkflow.edges))
  }, [currentWorkflow?.id, currentWorkflow?.nodes, currentWorkflow?.edges])

  // Update node status during execution
  useEffect(() => {
    if (!execution || !currentWorkflow) return
    setNodes((prev) =>
      prev.map((n) => {
        const ns = execution.nodeStates[n.id]
        if (!ns) return n
        return {
          ...n,
          data: { ...n.data, status: ns.status, output: ns.output || ns.error || '' }
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
          store.updateNodeState(e.nodeId, { status: 'running', startedAt: Date.now() })
          break
        case 'node:done':
          store.updateNodeState(e.nodeId, {
            status: 'done',
            output: e.output,
            finishedAt: Date.now()
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
        case 'execution:done': {
          const exec = store.execution
          store.setExecution(exec ? { ...exec, status: 'done', finishedAt: Date.now() } : null)
          break
        }
        case 'execution:failed': {
          const exec = store.execution
          store.setExecution(exec ? { ...exec, status: 'failed', finishedAt: Date.now() } : null)
          break
        }
        case 'execution:aborted': {
          const exec = store.execution
          store.setExecution(exec ? { ...exec, status: 'aborted', finishedAt: Date.now() } : null)
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

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id)
      setShowInputsEditor(false)
    },
    [setSelectedNodeId]
  )

  // Sync node position changes back to workflow definition
  const onNodeDragStop = useCallback(() => {
    if (!currentWorkflow) return
    const updatedNodes = fromFlowNodes(nodes)
    updateCurrentWorkflow({ nodes: updatedNodes })
  }, [nodes, currentWorkflow])

  // Add a new node
  const addNode = (type: 'prompt' | 'condition' | 'script'): void => {
    if (!currentWorkflow) return
    const id = `node-${++nodeCounter}-${Date.now()}`
    const newNode: WorkflowNode = {
      id,
      label:
        type === 'prompt'
          ? 'New Prompt'
          : type === 'condition'
            ? 'New Condition'
            : 'New Script',
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data:
        type === 'prompt'
          ? { type: 'prompt', prompt: '' }
          : type === 'condition'
            ? { type: 'condition', expression: '' }
            : { type: 'script', command: '' }
    }
    updateCurrentWorkflow({ nodes: [...currentWorkflow.nodes, newNode] })
  }

  // Delete selected node
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

  // Save workflow
  const handleSave = async (): Promise<void> => {
    if (!currentWorkflow) return
    // Sync positions from React Flow
    const updatedNodes = fromFlowNodes(nodes)
    const updatedEdges = fromFlowEdges(edges)
    const wf = { ...currentWorkflow, nodes: updatedNodes, edges: updatedEdges }
    await window.api.workflow.save(wf)
    setCurrentWorkflow(wf)
    // Refresh list
    const wfs = await window.api.workflow.list()
    setWorkflows(wfs as WorkflowDefinition[])
    // Flash saved confirmation
    setSaveFlash(true)
    setTimeout(() => setSaveFlash(false), 2000)
  }

  // Run workflow — show input dialog if workflow has inputs, otherwise run directly
  const handleRun = (): void => {
    if (!currentWorkflow) return
    if (currentWorkflow.inputs && currentWorkflow.inputs.length > 0) {
      setShowRunDialog(true)
    } else {
      startExecution({})
    }
  }

  const startExecution = async (inputValues: Record<string, string>): Promise<void> => {
    if (!currentWorkflow) return
    if (!cwd) {
      alert('No working directory set. Please select a folder in your session first.')
      return
    }
    setShowRunDialog(false)
    // Save first to ensure engine reads latest
    await handleSave()
    // Init execution state
    const nodeStatesInit: Record<string, { nodeId: string; status: WorkflowNodeStatus }> = {}
    for (const n of currentWorkflow.nodes) {
      nodeStatesInit[n.id] = { nodeId: n.id, status: 'idle' }
    }
    setExecution({
      id: '',
      workflowId: currentWorkflow.id,
      status: 'running',
      nodeStates: nodeStatesInit,
      startedAt: Date.now()
    })
    const result = await window.api.workflow.run(currentWorkflow.id, cwd, inputValues)
    if (result.executionId) {
      const current = useWorkflowStore.getState().execution
      if (current) {
        setExecution({ ...current, id: result.executionId })
      }
    }
  }

  // Abort
  const handleAbort = (): void => {
    if (execution?.id) {
      window.api.workflow.abort(execution.id)
    }
  }

  // Create new blank workflow
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

  // Use a template
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

  // Open existing workflow
  const openWorkflow = async (id: string): Promise<void> => {
    const wf = (await window.api.workflow.load(id)) as WorkflowDefinition | null
    if (wf) {
      setCurrentWorkflow(wf)
      setShowTemplates(false)
      setExecution(null)
    }
  }

  const isRunning = execution?.status === 'running'

  // Templates view
  if (showTemplates || !currentWorkflow) {
    return <TemplatesView
      onUseTemplate={useTemplate}
      onCreateNew={createNew}
      workflows={workflows}
      onOpenWorkflow={openWorkflow}
      onClose={closeCanvas}
    />
  }

  const runningNodeCount = currentWorkflow.nodes.length
  const doneCount = Object.values(nodeStates).filter(
    (ns) => ns.status === 'done' || ns.status === 'skipped'
  ).length
  const currentRunning = Object.values(nodeStates).find((ns) => ns.status === 'running')
  const currentRunningNode = currentRunning
    ? currentWorkflow.nodes.find((n) => n.id === currentRunning.nodeId)
    : null

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="h-[46px] bg-[#111111] border-b border-white/[0.06] flex items-center px-4 gap-3 flex-shrink-0">
        <button
          onClick={closeCanvas}
          className="text-white/40 hover:text-white/70 text-sm mr-1"
        >
          ←
        </button>
        <input
          value={currentWorkflow.name}
          onChange={(e) => updateCurrentWorkflow({ name: e.target.value })}
          className="bg-transparent text-sm font-semibold text-white/90 focus:outline-none border-b border-transparent focus:border-blue-500/40 w-48"
        />
        <div className="flex-1" />
        <button
          onClick={() => addNode('prompt')}
          disabled={isRunning}
          className="text-[10px] text-white/60 bg-white/[0.04] border border-white/[0.08] px-2.5 py-1 rounded hover:bg-white/[0.08] disabled:opacity-40"
        >
          + Prompt
        </button>
        <button
          onClick={() => addNode('condition')}
          disabled={isRunning}
          className="text-[10px] text-white/60 bg-white/[0.04] border border-white/[0.08] px-2.5 py-1 rounded hover:bg-white/[0.08] disabled:opacity-40"
        >
          + Condition
        </button>
        <button
          onClick={() => addNode('script')}
          disabled={isRunning}
          className="text-[10px] text-white/60 bg-white/[0.04] border border-white/[0.08] px-2.5 py-1 rounded hover:bg-white/[0.08] disabled:opacity-40"
        >
          + Script
        </button>
        <button
          onClick={() => { setShowInputsEditor((v) => !v); setSelectedNodeId(null) }}
          disabled={isRunning}
          className={`text-[10px] px-2.5 py-1 rounded disabled:opacity-40 ${
            showInputsEditor
              ? 'text-blue-400 bg-blue-500/15'
              : 'text-white/60 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08]'
          }`}
        >
          Inputs{currentWorkflow.inputs?.length ? ` (${currentWorkflow.inputs.length})` : ''}
        </button>
        {selectedNodeId && !isRunning && (
          <button
            onClick={deleteSelectedNode}
            className="text-[10px] text-red-400/70 bg-red-500/10 px-2.5 py-1 rounded hover:bg-red-500/20"
          >
            Delete
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={isRunning}
          className={`text-[10px] font-medium px-3 py-1 rounded transition-colors disabled:opacity-40 ${
            saveFlash
              ? 'text-green-400 bg-green-500/15'
              : 'text-white/70 bg-white/[0.06] hover:bg-white/[0.1]'
          }`}
        >
          {saveFlash ? '✓ Saved' : 'Save'}
        </button>
        {isRunning ? (
          <button
            onClick={handleAbort}
            className="text-[10px] font-semibold text-white bg-red-600 px-3 py-1 rounded hover:bg-red-700"
          >
            ■ Stop
          </button>
        ) : (
          <button
            onClick={handleRun}
            disabled={currentWorkflow.nodes.length === 0}
            className="text-[10px] font-semibold text-white bg-green-600 px-3 py-1 rounded hover:bg-green-700 disabled:opacity-40"
          >
            ▶ Run
          </button>
        )}
      </div>

      {/* Canvas + Config panel */}
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
            className="bg-[#0a0a0a]"
          >
            <Background color="#ffffff08" variant={BackgroundVariant.Dots} gap={20} />
            <Controls
              className="!bg-[#111111] !border-white/[0.08] !rounded-lg [&>button]:!bg-[#111111] [&>button]:!border-white/[0.06] [&>button]:!text-white/50 [&>button:hover]:!bg-white/[0.08]"
            />
            <MiniMap
              nodeColor="#3b82f620"
              maskColor="#0a0a0a90"
              className="!bg-[#111111] !border-white/[0.08] !rounded-lg"
            />
          </ReactFlow>
        </div>

        {selectedNodeId && !showInputsEditor && <NodeConfigPanel />}
        {showInputsEditor && (
          <InputsEditor
            inputs={currentWorkflow.inputs ?? []}
            onChange={(inputs) => updateCurrentWorkflow({ inputs })}
            onClose={() => setShowInputsEditor(false)}
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

      {/* Status bar */}
      <div className="h-7 bg-[#0f0f0f] border-t border-white/[0.06] flex items-center px-4 gap-4 flex-shrink-0">
        {isRunning ? (
          <span className="text-[10px] text-blue-400 font-mono">
            ⟳ Running node {doneCount + 1}/{runningNodeCount}
            {currentRunningNode ? ` · ${currentRunningNode.label}` : ''}
          </span>
        ) : execution?.status === 'done' ? (
          <span className="text-[10px] text-green-400 font-mono">
            ✓ Completed ({doneCount}/{runningNodeCount} nodes)
          </span>
        ) : execution?.status === 'failed' ? (
          <span className="text-[10px] text-red-400 font-mono">✗ Failed</span>
        ) : (
          <span className="text-[10px] text-white/25 font-mono">Ready</span>
        )}
        <div className="flex-1" />
        <span className="text-[9px] text-white/20 font-mono">⌘⇧W toggle</span>
      </div>
    </div>
  )
}

// --- Run Dialog (input variables) ---

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
    for (const input of inputs) {
      init[input.key] = input.defaultValue ?? ''
    }
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
        className="bg-[#111111] border border-white/[0.1] rounded-xl w-[440px] max-h-[80vh] flex flex-col shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white/90">Run Workflow</h2>
          <p className="text-[11px] text-white/35 mt-0.5">Fill in the inputs before running</p>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {inputs.map((input) => (
            <div key={input.key}>
              <label className="text-[11px] font-medium text-white/50 block mb-1.5">
                {input.label}
              </label>
              <textarea
                value={values[input.key] ?? ''}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [input.key]: e.target.value }))
                }
                placeholder={input.placeholder}
                rows={2}
                className="w-full bg-[#0a0a0a] border border-white/[0.1] rounded-lg px-3 py-2 text-xs text-white/90 placeholder-white/20 font-mono resize-none focus:border-blue-500/40 focus:outline-none"
              />
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-white/[0.06] flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-[11px] text-white/50 bg-white/[0.06] px-4 py-1.5 rounded-md hover:bg-white/[0.1]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={hasEmptyInputs}
            className="text-[11px] font-semibold text-white bg-green-600 px-4 py-1.5 rounded-md hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ▶ Run
          </button>
        </div>
      </form>
    </div>
  )
}

// --- Inputs Editor (define input variables for workflow) ---

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
    <div className="w-[272px] flex-shrink-0 bg-[#111111] border-l border-white/[0.06] flex flex-col overflow-hidden">
      <div className="h-11 flex items-center justify-between px-4 border-b border-white/[0.06]">
        <span className="text-xs font-semibold text-white/90">Workflow Inputs</span>
        <button onClick={onClose} className="text-white/40 hover:text-white/70 text-sm">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-[10px] text-white/30 leading-relaxed">
          Define inputs that users fill in before running. Use <code className="text-blue-400/60">{'{{input.key}}'}</code> in node prompts.
        </p>

        {inputs.map((inp, i) => (
          <div key={i} className="space-y-2 pb-3 border-b border-white/[0.04]">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/25 font-mono">#{i + 1}</span>
              <button
                onClick={() => removeInput(i)}
                className="text-[10px] text-red-400/60 hover:text-red-400"
              >
                remove
              </button>
            </div>
            <div>
              <label className="text-[9px] text-white/35 block mb-0.5">Key</label>
              <input
                value={inp.key}
                onChange={(e) =>
                  updateInput(i, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })
                }
                className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded px-2 py-1 text-[10px] text-white/80 font-mono focus:outline-none focus:border-blue-500/40"
              />
            </div>
            <div>
              <label className="text-[9px] text-white/35 block mb-0.5">Label</label>
              <input
                value={inp.label}
                onChange={(e) => updateInput(i, { label: e.target.value })}
                className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded px-2 py-1 text-[10px] text-white/80 focus:outline-none focus:border-blue-500/40"
              />
            </div>
            <div>
              <label className="text-[9px] text-white/35 block mb-0.5">Placeholder</label>
              <input
                value={inp.placeholder ?? ''}
                onChange={(e) => updateInput(i, { placeholder: e.target.value })}
                className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded px-2 py-1 text-[10px] text-white/70 focus:outline-none focus:border-blue-500/40"
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

function TemplatesView({
  onUseTemplate,
  onCreateNew,
  workflows,
  onOpenWorkflow,
  onClose
}: {
  onUseTemplate: (tpl: WorkflowDefinition) => void
  onCreateNew: () => void
  workflows: WorkflowDefinition[]
  onOpenWorkflow: (id: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [templates, setTemplates] = useState<WorkflowDefinition[]>([])

  useEffect(() => {
    window.api.workflow.templates().then((t) => setTemplates(t as WorkflowDefinition[]))
  }, [])

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      <div className="h-[46px] bg-[#111111] border-b border-white/[0.06] flex items-center px-4 gap-3 flex-shrink-0">
        <button onClick={onClose} className="text-white/40 hover:text-white/70 text-sm mr-1">
          ←
        </button>
        <span className="text-sm font-semibold text-white/90">Workflow Templates</span>
        <div className="flex-1" />
        <button
          onClick={onCreateNew}
          className="text-[10px] font-semibold text-white bg-blue-600 px-3 py-1 rounded hover:bg-blue-700"
        >
          + Blank Workflow
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Built-in templates */}
        <h3 className="text-xs font-semibold text-white/50 mb-3 uppercase tracking-wider">
          Built-in Templates
        </h3>
        <div className="grid grid-cols-3 gap-4 mb-8">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-[#111111] rounded-lg border border-white/[0.06] p-4 flex flex-col gap-2"
            >
              <div className="text-sm font-semibold text-white/90">{tpl.name}</div>
              <div className="text-[11px] text-white/40 leading-relaxed flex-1">
                {tpl.description}
              </div>
              <div className="text-[9px] text-white/25 font-mono">
                {tpl.nodes.length} nodes
              </div>
              <button
                onClick={() => onUseTemplate(tpl)}
                className="mt-1 text-[11px] font-medium text-white bg-blue-600 rounded-md py-1.5 hover:bg-blue-700"
              >
                Use Template
              </button>
            </div>
          ))}
        </div>

        {/* Saved workflows */}
        {workflows.length > 0 && (
          <>
            <h3 className="text-xs font-semibold text-white/50 mb-3 uppercase tracking-wider">
              Saved Workflows
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {workflows.map((wf) => (
                <div
                  key={wf.id}
                  onClick={() => onOpenWorkflow(wf.id)}
                  className="bg-[#111111] rounded-lg border border-white/[0.06] p-4 flex flex-col gap-1 cursor-pointer hover:border-white/[0.12] transition-colors"
                >
                  <div className="text-sm font-medium text-white/80">{wf.name}</div>
                  <div className="text-[9px] text-white/25 font-mono">
                    {wf.nodes.length} nodes · updated{' '}
                    {new Date(wf.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
