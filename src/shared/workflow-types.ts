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

export type SubworkflowNodeData = {
  type: 'subworkflow'
  workflowId: string // target workflow id
  // Maps parent inputs/vars to child inputs. Values are template strings like "{{input.company}}" or "{{vars.foo}}".
  inputMapping?: Record<string, string>
  // Names of child finalVars to copy into parent vars. Empty/undefined = copy all.
  captureVars?: string[]
}

export type WorkflowNodeData =
  | PromptNodeData
  | ConditionNodeData
  | ScriptNodeData
  | ParallelNodeData
  | JoinNodeData
  | LoopNodeData
  | HumanReviewNodeData
  | SubworkflowNodeData

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

// --- Triggers (fire workflow automatically) ---
export type WorkflowTriggerCron = {
  id: string
  type: 'cron'
  enabled: boolean
  name?: string
  schedule: string // e.g. "*/15 * * * *"
  cwd: string
  inputValues?: Record<string, string>
}

export type WorkflowTriggerFileWatcher = {
  id: string
  type: 'fileWatcher'
  enabled: boolean
  name?: string
  paths: string[] // glob patterns, relative to cwd
  cwd: string
  events?: ('add' | 'change' | 'unlink')[] // default ['change']
  debounceMs?: number // default 1000
  inputValues?: Record<string, string>
}

export type WorkflowTriggerWebhook = {
  id: string
  type: 'webhook'
  enabled: boolean
  name?: string
  token: string // generated secret; required as ?token= query
  cwd: string
  inputValues?: Record<string, string>
}

export type WorkflowTrigger =
  | WorkflowTriggerCron
  | WorkflowTriggerFileWatcher
  | WorkflowTriggerWebhook

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
  recentCwds?: string[] // history of project directories this workflow has run against
  triggers?: WorkflowTrigger[]
  // Marketplace tracking — set when a workflow was installed from coide-flows-marketplace
  marketplaceId?: string
  marketplaceVersion?: string
}

// --- Marketplace (community-shared workflows from coide-flows-marketplace repo) ---
export type MarketplaceEntry = {
  id: string
  name: string
  description: string
  author: string
  tags: string[]
  version: string
  path: string // relative path within the marketplace repo
}

export type MarketplaceIndex = {
  schemaVersion: number
  updatedAt: string
  templates: MarketplaceEntry[]
}

// --- Token usage (accumulated per node or execution) ---
export type WorkflowTokenUsage = {
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
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
  tokens?: WorkflowTokenUsage
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
  cwd?: string
  tokens?: WorkflowTokenUsage
  triggeredBy?: 'manual' | 'cron' | 'fileWatcher' | 'webhook'
}

// --- Metrics aggregated across executions ---
export type WorkflowMetrics = {
  workflowId: string
  workflowName: string
  totalRuns: number
  successRuns: number
  failedRuns: number
  abortedRuns: number
  avgDurationMs: number
  totalTokens: WorkflowTokenUsage
  lastRunAt?: number
  lastStatus?: 'done' | 'failed' | 'aborted'
  // Top failing nodes: [{ nodeId, nodeLabel, failures }]
  topFailingNodes: { nodeId: string; nodeLabel: string; failures: number }[]
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
