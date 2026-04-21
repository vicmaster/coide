// Workflow node status during execution
export type WorkflowNodeStatus =
  | 'idle'
  | 'running'
  | 'done'
  | 'failed'
  | 'skipped'
  | 'awaiting_review'

// --- Set-vars extractors (used by prompt nodes to capture outputs into workflow.vars) ---
export type SetVarSpec = {
  name: string
  // Extractor syntax:
  //   ""             — store raw output
  //   "json:path.to.field" — JSON.parse and resolve path
  //   "regex:pattern"     — first capture group (or full match)
  //   "lines:5-10"        — slice of lines
  extractor: string
}

// --- Node data types ---
export type PromptNodeData = {
  type: 'prompt'
  prompt: string
  systemPrompt?: string
  model?: string
  allowedTools?: string[]
  setVars?: SetVarSpec[]
}

export type ConditionNodeData = {
  type: 'condition'
  expression: string // JS expression — `output` and `vars` variables are available
}

export type ScriptNodeData = {
  type: 'script'
  command: string
}

export type ParallelNodeData = {
  type: 'parallel'
  // pure fan-out node — the outgoing edges define the branches
}

export type JoinNodeData = {
  type: 'join'
  // waits for ALL incoming edges to complete; joined outputs concatenated with separators
  separator?: string
}

export type LoopNodeData = {
  type: 'loop'
  // Condition evaluated after body runs — loop continues while expression is truthy.
  // Available variables: `output` (last body output), `vars`, `iteration` (1-indexed)
  condition: string
  maxIterations: number
}

export type HumanReviewNodeData = {
  type: 'humanReview'
  message?: string
}

export type WorkflowNodeData =
  | PromptNodeData
  | ConditionNodeData
  | ScriptNodeData
  | ParallelNodeData
  | JoinNodeData
  | LoopNodeData
  | HumanReviewNodeData

export type WorkflowNodeType = WorkflowNodeData['type']

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
  sourceHandle?: string // handle id on source node (used for condition yes/no, loop body/exit)
  label?: string // 'yes' | 'no' | 'body' | 'exit' | custom
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
  iteration?: number // for loop bodies
}

export type WorkflowExecutionState = {
  id: string
  workflowId: string
  status: 'idle' | 'running' | 'done' | 'failed' | 'aborted'
  nodeStates: Record<string, WorkflowNodeRunState>
  vars?: Record<string, string>
  startedAt?: number
  finishedAt?: number
}

// --- Persisted execution record (for history & replay) ---
export type WorkflowExecutionRecord = {
  id: string
  workflowId: string
  workflowName: string
  status: 'done' | 'failed' | 'aborted'
  startedAt: number
  finishedAt: number
  inputValues: Record<string, string>
  finalVars: Record<string, string>
  nodeStates: Record<string, WorkflowNodeRunState>
  error?: string
}

// --- Human-review request payload ---
export type ReviewRequest = {
  executionId: string
  nodeId: string
  label: string
  message?: string
  prevOutput: string
  vars: Record<string, string>
}

// --- Events sent from main → renderer ---
export type WorkflowEvent =
  | { type: 'node:start'; executionId: string; nodeId: string; iteration?: number }
  | { type: 'node:done'; executionId: string; nodeId: string; output: string; iteration?: number }
  | { type: 'node:failed'; executionId: string; nodeId: string; error: string }
  | { type: 'node:skipped'; executionId: string; nodeId: string }
  | { type: 'node:awaiting-review'; executionId: string; nodeId: string; request: ReviewRequest }
  | { type: 'variable:set'; executionId: string; name: string; value: string }
  | { type: 'loop:iterate'; executionId: string; nodeId: string; iteration: number }
  | { type: 'execution:done'; executionId: string; record?: WorkflowExecutionRecord }
  | { type: 'execution:failed'; executionId: string; error: string; record?: WorkflowExecutionRecord }
  | { type: 'execution:aborted'; executionId: string; record?: WorkflowExecutionRecord }
