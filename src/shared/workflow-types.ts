// Workflow node status during execution
export type WorkflowNodeStatus = 'idle' | 'running' | 'done' | 'failed' | 'skipped'

// --- Node data types ---
export type PromptNodeData = {
  type: 'prompt'
  prompt: string
  systemPrompt?: string
  model?: string
}

export type ConditionNodeData = {
  type: 'condition'
  expression: string // JS expression — `output` variable is available
}

export type ScriptNodeData = {
  type: 'script'
  command: string
}

export type WorkflowNodeData = PromptNodeData | ConditionNodeData | ScriptNodeData

// --- Input variables (user fills in before running) ---
export type WorkflowInputVar = {
  key: string // e.g. 'company', 'product'
  label: string // e.g. 'Company name or URL'
  placeholder?: string
  defaultValue?: string
}

// --- Workflow definition (persisted as JSON) ---
export type WorkflowNode = {
  id: string
  data: WorkflowNodeData
  label: string
  position: { x: number; y: number }
}

export type WorkflowEdge = {
  id: string
  source: string
  target: string
  label?: string // 'yes' | 'no' for condition branches
}

export type WorkflowDefinition = {
  id: string
  name: string
  description?: string
  inputs?: WorkflowInputVar[] // user-defined input variables
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: number
  updatedAt: number
  isTemplate?: boolean
}

// --- Runtime execution state ---
export type WorkflowNodeRunState = {
  nodeId: string
  status: WorkflowNodeStatus
  output?: string
  error?: string
  startedAt?: number
  finishedAt?: number
}

export type WorkflowExecutionState = {
  id: string
  workflowId: string
  status: 'idle' | 'running' | 'done' | 'failed' | 'aborted'
  nodeStates: Record<string, WorkflowNodeRunState>
  startedAt?: number
  finishedAt?: number
}

// --- Events sent from main → renderer ---
export type WorkflowEvent =
  | { type: 'node:start'; executionId: string; nodeId: string }
  | { type: 'node:done'; executionId: string; nodeId: string; output: string }
  | { type: 'node:failed'; executionId: string; nodeId: string; error: string }
  | { type: 'node:skipped'; executionId: string; nodeId: string }
  | { type: 'execution:done'; executionId: string }
  | { type: 'execution:failed'; executionId: string; error: string }
  | { type: 'execution:aborted'; executionId: string }
