import { BrowserWindow } from 'electron'
import { exec as execCallback } from 'child_process'
import { appendFile } from 'fs'
import { runClaude, onClaudeResult, onClaudeUsage, offClaudeUsage, abortClaude } from './claude'
import { loadWorkflow, saveExecutionRecord, saveWorkflow } from './workflowStore'
import { interpolate, applyExtractor, evaluateCondition } from '../shared/workflowHelpers'

function wfLog(msg: string): void {
  const line = `[${new Date().toISOString()}] [workflow] ${msg}\n`
  console.log(line.trim())
  appendFile('/tmp/coide-debug.log', line, () => {})
}
import type { CoideSettings } from '../shared/types'
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  WorkflowEvent,
  WorkflowNodeRunState,
  WorkflowExecutionRecord,
  ReviewRequest,
  SetVarSpec,
  WorkflowTokenUsage
} from '../shared/workflow-types'

const MAX_SUBWORKFLOW_DEPTH = 3

// --- Active executions ---
type ActiveExec = {
  aborted: boolean
  vars: Record<string, string>
  nodeStates: Record<string, WorkflowNodeRunState>
  inputValues: Record<string, string>
  wf: WorkflowDefinition
  cwd: string
  win: BrowserWindow
  settings: CoideSettings
  activeSessions: Set<string>
  pendingReviews: Map<string, (approved: boolean) => void>
  nodeTokens: Record<string, WorkflowTokenUsage>
  totalTokens: WorkflowTokenUsage
  depth: number
  triggeredBy?: 'manual' | 'cron' | 'fileWatcher' | 'webhook'
}

function zeroUsage(): WorkflowTokenUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
}

function addUsage(a: WorkflowTokenUsage, b: WorkflowTokenUsage): WorkflowTokenUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheCreation: a.cacheCreation + b.cacheCreation
  }
}

const activeExecutions = new Map<string, ActiveExec>()

let executionCounter = 0

function sendEvent(win: BrowserWindow, event: WorkflowEvent): void {
  win.webContents.send('workflow:event', event)
}

function applySetVars(
  setVars: SetVarSpec[] | undefined,
  output: string,
  exec: ActiveExec,
  executionId: string
): void {
  if (!setVars || setVars.length === 0) return
  for (const spec of setVars) {
    const name = spec.name?.trim()
    if (!name) continue
    const value = applyExtractor(spec.extractor ?? '', output)
    exec.vars[name] = value
    sendEvent(exec.win, { type: 'variable:set', executionId, name, value })
  }
}

// --- Graph helpers ---
function getIncomingEdges(wf: WorkflowDefinition, nodeId: string): WorkflowEdge[] {
  return wf.edges.filter((e) => e.target === nodeId)
}

function getOutgoingEdges(wf: WorkflowDefinition, nodeId: string, handle?: string): WorkflowEdge[] {
  return wf.edges.filter(
    (e) => e.source === nodeId && (handle === undefined || (e.sourceHandle ?? e.label) === handle)
  )
}

function findStartNodes(wf: WorkflowDefinition): WorkflowNode[] {
  const targets = new Set(wf.edges.map((e) => e.target))
  return wf.nodes.filter((n) => !targets.has(n.id))
}

// --- Execute individual node types ---
async function executePromptNode(
  node: WorkflowNode,
  prevOutput: string,
  executionId: string,
  exec: ActiveExec,
  iteration: number
): Promise<string> {
  if (node.data.type !== 'prompt') throw new Error('Not a prompt node')

  const prompt = interpolate(node.data.prompt, prevOutput, exec.inputValues, exec.vars)
  wfLog(`Prompt node "${node.label}" iter=${iteration}: length=${prompt.length}`)
  const coideSessionId = `wf-${executionId}-${node.id}-${iteration}-${Date.now()}`
  exec.activeSessions.add(coideSessionId)

  const nodeSettings: CoideSettings = {
    ...exec.settings,
    skipPermissions: true,
    planMode: false,
    model: node.data.model || exec.settings.model,
    systemPrompt: node.data.systemPrompt || '',
    allowedTools: node.data.allowedTools && node.data.allowedTools.length > 0
      ? node.data.allowedTools
      : undefined
  }

  // Aggregate token usage for this node run
  onClaudeUsage(coideSessionId, (u) => {
    const delta: WorkflowTokenUsage = {
      input: u.input_tokens,
      output: u.output_tokens,
      cacheRead: u.cache_read_input_tokens,
      cacheCreation: u.cache_creation_input_tokens
    }
    exec.nodeTokens[node.id] = addUsage(exec.nodeTokens[node.id] ?? zeroUsage(), delta)
    exec.totalTokens = addUsage(exec.totalTokens, delta)
  })

  const resultPromise = new Promise<string>((resolve, reject) => {
    onClaudeResult(coideSessionId, (result, isError) => {
      exec.activeSessions.delete(coideSessionId)
      offClaudeUsage(coideSessionId)
      if (isError) reject(new Error(result))
      else resolve(result)
    })
  })

  runClaude(prompt, exec.cwd, null, coideSessionId, exec.win, nodeSettings).catch((err) => {
    wfLog(`runClaude rejected for node "${node.label}": ${err}`)
  })

  const output = await resultPromise
  applySetVars(node.data.setVars, output, exec, executionId)
  return output
}

async function executeSubworkflowNode(
  node: WorkflowNode,
  prevOutput: string,
  executionId: string,
  exec: ActiveExec
): Promise<string> {
  if (node.data.type !== 'subworkflow') throw new Error('Not a subworkflow node')

  if (exec.depth >= MAX_SUBWORKFLOW_DEPTH) {
    throw new Error(`Sub-workflow depth limit (${MAX_SUBWORKFLOW_DEPTH}) exceeded`)
  }

  const child = await loadWorkflow(node.data.workflowId)
  if (!child) throw new Error(`Sub-workflow not found: ${node.data.workflowId}`)

  // Resolve child inputs from parent's context via inputMapping templates
  const childInputs: Record<string, string> = {}
  const mapping = node.data.inputMapping ?? {}
  for (const key of Object.keys(mapping)) {
    childInputs[key] = interpolate(mapping[key], prevOutput, exec.inputValues, exec.vars)
  }
  // Inherit any child input defaults not mapped
  for (const inp of child.inputs ?? []) {
    if (!(inp.key in childInputs) && inp.defaultValue) {
      childInputs[inp.key] = inp.defaultValue
    }
  }

  const childResult = await runChildWorkflow(child, childInputs, exec)

  // Capture child vars into parent
  const capture = node.data.captureVars
  const toCopy = capture && capture.length > 0 ? capture : Object.keys(childResult.finalVars)
  for (const name of toCopy) {
    if (childResult.finalVars[name] !== undefined) {
      exec.vars[name] = childResult.finalVars[name]
      sendEvent(exec.win, { type: 'variable:set', executionId, name, value: childResult.finalVars[name] })
    }
  }

  return childResult.output
}

function executeScriptNode(node: WorkflowNode, exec: ActiveExec, prevOutput: string): Promise<string> {
  if (node.data.type !== 'script') throw new Error('Not a script node')
  const cmd = interpolate(node.data.command, prevOutput, exec.inputValues, exec.vars)
  return new Promise((resolve, reject) => {
    execCallback(cmd, { cwd: exec.cwd, timeout: 120_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout)
    })
  })
}

async function waitForReview(
  executionId: string,
  node: WorkflowNode,
  prevOutput: string,
  exec: ActiveExec
): Promise<boolean> {
  if (node.data.type !== 'humanReview') throw new Error('Not a humanReview node')
  const req: ReviewRequest = {
    executionId,
    nodeId: node.id,
    label: node.label,
    message: node.data.message,
    prevOutput: prevOutput.slice(0, 5000),
    vars: { ...exec.vars }
  }
  sendEvent(exec.win, { type: 'node:awaiting-review', executionId, nodeId: node.id, request: req })
  return new Promise<boolean>((resolve) => {
    exec.pendingReviews.set(node.id, resolve)
  })
}

// --- Main DAG scheduler ---
/**
 * Walk the graph node-by-node. For parallel fan-out we run outgoing branches
 * concurrently with Promise.all; for joins we wait until all incoming branches
 * have completed. For loops we iterate the body chain until condition fails.
 *
 * Each "task" is an async branch that may recursively run its successors.
 */

async function runFromNode(
  nodeId: string,
  prevOutput: string,
  executionId: string,
  exec: ActiveExec,
  visited: Set<string>,
  joinCollectors: Map<string, { outputs: string[]; arrivals: number; expected: number }>
): Promise<void> {
  if (exec.aborted) return
  const wf = exec.wf
  const node = wf.nodes.find((n) => n.id === nodeId)
  if (!node) return

  // If this is a join node — accumulate into the collector and bail unless we're the last one.
  if (node.data.type === 'join') {
    const expected = getIncomingEdges(wf, nodeId).length
    const collector = joinCollectors.get(nodeId) ?? { outputs: [], arrivals: 0, expected }
    joinCollectors.set(nodeId, collector)
    collector.outputs.push(prevOutput)
    collector.arrivals += 1

    if (collector.arrivals < collector.expected) {
      return // wait for siblings
    }

    // All arrived — combine and continue
    const sep = node.data.separator ?? '\n\n---\n\n'
    const combined = collector.outputs.join(sep)
    await markNodeStart(exec, executionId, node.id)
    await markNodeDone(exec, executionId, node.id, combined)
    const next = getOutgoingEdges(wf, node.id)
    await Promise.all(
      next.map((e) => runFromNode(e.target, combined, executionId, exec, visited, joinCollectors))
    )
    return
  }

  if (visited.has(nodeId) && node.data.type !== 'loop') {
    // Avoid infinite loops outside of designed loop nodes
    return
  }
  visited.add(nodeId)

  try {
    await markNodeStart(exec, executionId, node.id)
    const nodeType = node.data.type

    if (nodeType === 'prompt') {
      const output = await executePromptNode(node, prevOutput, executionId, exec, 1)
      await markNodeDone(exec, executionId, node.id, output)
      await runSuccessors(node.id, output, executionId, exec, visited, joinCollectors)
      return
    }

    if (nodeType === 'script') {
      const output = await executeScriptNode(node, exec, prevOutput)
      await markNodeDone(exec, executionId, node.id, output)
      await runSuccessors(node.id, output, executionId, exec, visited, joinCollectors)
      return
    }

    if (nodeType === 'parallel') {
      await markNodeDone(exec, executionId, node.id, prevOutput)
      const branches = getOutgoingEdges(wf, node.id)
      await Promise.all(
        branches.map((e) => runFromNode(e.target, prevOutput, executionId, exec, new Set(visited), joinCollectors))
      )
      return
    }

    if (nodeType === 'condition') {
      const result = evaluateCondition(node.data.expression, prevOutput, exec.vars, 1)
      await markNodeDone(exec, executionId, node.id, result ? 'yes' : 'no')
      const takenLabel = result ? 'yes' : 'no'
      const skippedLabel = result ? 'no' : 'yes'
      for (const e of getOutgoingEdges(wf, node.id, skippedLabel)) {
        sendEvent(exec.win, { type: 'node:skipped', executionId, nodeId: e.target })
        exec.nodeStates[e.target] = {
          nodeId: e.target,
          status: 'skipped',
          finishedAt: Date.now()
        }
      }
      const next = getOutgoingEdges(wf, node.id, takenLabel)
      await Promise.all(
        next.map((e) => runFromNode(e.target, prevOutput, executionId, exec, visited, joinCollectors))
      )
      return
    }

    if (nodeType === 'subworkflow') {
      const output = await executeSubworkflowNode(node, prevOutput, executionId, exec)
      await markNodeDone(exec, executionId, node.id, output)
      await runSuccessors(node.id, output, executionId, exec, visited, joinCollectors)
      return
    }

    if (nodeType === 'humanReview') {
      await markAwaitingReview(exec, node.id)
      const approved = await waitForReview(executionId, node, prevOutput, exec)
      if (!approved) {
        await markNodeDone(exec, executionId, node.id, 'rejected')
        // Rejection ends this branch — don't follow successors
        return
      }
      await markNodeDone(exec, executionId, node.id, 'approved')
      await runSuccessors(node.id, prevOutput, executionId, exec, visited, joinCollectors)
      return
    }

    if (nodeType === 'loop') {
      // Loop is "do-while": execute body chain, then evaluate condition.
      // Body edges use handle 'body', exit edges use handle 'exit'.
      let currentOutput = prevOutput
      let iteration = 0
      const maxIter = Math.max(1, Math.min(1000, node.data.maxIterations || 10))

      while (iteration < maxIter && !exec.aborted) {
        iteration += 1
        sendEvent(exec.win, { type: 'loop:iterate', executionId, nodeId: node.id, iteration })
        await markNodeStart(exec, executionId, node.id, iteration)

        // Run the body branch chain linearly (first body edge target and its descendants)
        // We support only a linear chain back to the loop for simplicity — the chain ends
        // when it encounters an edge back to this loop node (or runs out).
        const bodyEdges = getOutgoingEdges(wf, node.id, 'body')
        const bodyVisited = new Set<string>()
        for (const bodyEdge of bodyEdges) {
          currentOutput = await runLoopBody(
            bodyEdge.target,
            currentOutput,
            executionId,
            exec,
            bodyVisited,
            node.id
          )
        }

        const shouldContinue = evaluateCondition(
          node.data.condition,
          currentOutput,
          exec.vars,
          iteration
        )
        if (!shouldContinue) break
      }

      await markNodeDone(exec, executionId, node.id, currentOutput)
      const exitEdges = getOutgoingEdges(wf, node.id, 'exit')
      await Promise.all(
        exitEdges.map((e) =>
          runFromNode(e.target, currentOutput, executionId, exec, visited, joinCollectors)
        )
      )
      return
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sendEvent(exec.win, { type: 'node:failed', executionId, nodeId: node.id, error: msg.slice(0, 2000) })
    exec.nodeStates[node.id] = {
      nodeId: node.id,
      status: 'failed',
      error: msg,
      finishedAt: Date.now()
    }
    throw err
  }
}

async function runLoopBody(
  startNodeId: string,
  prevOutput: string,
  executionId: string,
  exec: ActiveExec,
  visited: Set<string>,
  loopNodeId: string
): Promise<string> {
  if (exec.aborted) return prevOutput
  const wf = exec.wf
  const node = wf.nodes.find((n) => n.id === startNodeId)
  if (!node) return prevOutput

  // Reached loop again — body complete
  if (startNodeId === loopNodeId) return prevOutput
  if (visited.has(startNodeId)) return prevOutput
  visited.add(startNodeId)

  let output = prevOutput
  await markNodeStart(exec, executionId, node.id)
  try {
    if (node.data.type === 'prompt') {
      output = await executePromptNode(node, prevOutput, executionId, exec, 1)
    } else if (node.data.type === 'script') {
      output = await executeScriptNode(node, exec, prevOutput)
    } else if (node.data.type === 'condition') {
      const r = evaluateCondition(node.data.expression, prevOutput, exec.vars, 1)
      output = r ? 'yes' : 'no'
    }
    await markNodeDone(exec, executionId, node.id, output)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sendEvent(exec.win, { type: 'node:failed', executionId, nodeId: node.id, error: msg.slice(0, 2000) })
    exec.nodeStates[node.id] = {
      nodeId: node.id,
      status: 'failed',
      error: msg,
      finishedAt: Date.now()
    }
    throw err
  }

  // Continue the chain — take first outgoing edge only (linear body)
  const next = getOutgoingEdges(wf, node.id)[0]
  if (!next) return output
  return runLoopBody(next.target, output, executionId, exec, visited, loopNodeId)
}

async function runSuccessors(
  nodeId: string,
  output: string,
  executionId: string,
  exec: ActiveExec,
  visited: Set<string>,
  joinCollectors: Map<string, { outputs: string[]; arrivals: number; expected: number }>
): Promise<void> {
  const next = getOutgoingEdges(exec.wf, nodeId)
  await Promise.all(
    next.map((e) => runFromNode(e.target, output, executionId, exec, visited, joinCollectors))
  )
}

async function markNodeStart(
  exec: ActiveExec,
  executionId: string,
  nodeId: string,
  iteration?: number
): Promise<void> {
  exec.nodeStates[nodeId] = {
    nodeId,
    status: 'running',
    startedAt: Date.now(),
    iteration
  }
  sendEvent(exec.win, { type: 'node:start', executionId, nodeId, iteration })
}

async function markNodeDone(
  exec: ActiveExec,
  executionId: string,
  nodeId: string,
  output: string
): Promise<void> {
  const prev = exec.nodeStates[nodeId]
  exec.nodeStates[nodeId] = {
    nodeId,
    status: 'done',
    startedAt: prev?.startedAt ?? Date.now(),
    finishedAt: Date.now(),
    output: output.slice(0, 10_000),
    iteration: prev?.iteration,
    tokens: exec.nodeTokens[nodeId]
  }
  sendEvent(exec.win, {
    type: 'node:done',
    executionId,
    nodeId,
    output: output.slice(0, 2000),
    iteration: prev?.iteration
  })
}

async function markAwaitingReview(
  exec: ActiveExec,
  nodeId: string
): Promise<void> {
  exec.nodeStates[nodeId] = {
    nodeId,
    status: 'awaiting_review',
    startedAt: Date.now()
  }
}

// --- Public API ---
export async function executeWorkflow(
  workflowId: string,
  cwd: string,
  win: BrowserWindow,
  settings: CoideSettings,
  inputValues?: Record<string, string>,
  triggeredBy?: 'manual' | 'cron' | 'fileWatcher' | 'webhook'
): Promise<string> {
  wfLog(`executeWorkflow: workflowId=${workflowId}, cwd=${cwd}, triggeredBy=${triggeredBy ?? 'manual'}`)
  const wf = await loadWorkflow(workflowId)
  if (!wf) throw new Error(`Workflow not found: ${workflowId}`)

  const executionId = `exec-${++executionCounter}-${Date.now()}`
  const startedAt = Date.now()
  const exec: ActiveExec = {
    aborted: false,
    vars: {},
    nodeStates: {},
    inputValues: inputValues ?? {},
    wf,
    cwd,
    win,
    settings,
    activeSessions: new Set(),
    pendingReviews: new Map(),
    nodeTokens: {},
    totalTokens: zeroUsage(),
    depth: 0,
    triggeredBy: triggeredBy ?? 'manual'
  }
  activeExecutions.set(executionId, exec)

  // Record cwd in workflow's recents (max 8, most recent first)
  try {
    const current = wf.recentCwds ?? []
    const updated = [cwd, ...current.filter((c) => c !== cwd)].slice(0, 8)
    if (JSON.stringify(updated) !== JSON.stringify(current)) {
      wf.recentCwds = updated
      await saveWorkflow(wf)
    }
  } catch (e) {
    wfLog(`recentCwds update failed: ${e}`)
  }

  const startNodes = findStartNodes(wf)
  if (startNodes.length === 0) {
    activeExecutions.delete(executionId)
    throw new Error('No start node found in workflow')
  }

  const joinCollectors = new Map<string, { outputs: string[]; arrivals: number; expected: number }>()
  const visited = new Set<string>()

  let record: WorkflowExecutionRecord | null = null
  try {
    await Promise.all(
      startNodes.map((n) => runFromNode(n.id, '', executionId, exec, visited, joinCollectors))
    )

    const finishedAt = Date.now()
    record = {
      id: executionId,
      workflowId: wf.id,
      workflowName: wf.name,
      status: exec.aborted ? 'aborted' : 'done',
      startedAt,
      finishedAt,
      inputValues: exec.inputValues,
      finalVars: { ...exec.vars },
      nodeStates: { ...exec.nodeStates },
      cwd,
      tokens: exec.totalTokens,
      triggeredBy: exec.triggeredBy
    }
    if (exec.aborted) {
      sendEvent(win, { type: 'execution:aborted', executionId, record })
    } else {
      sendEvent(win, { type: 'execution:done', executionId, record })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    record = {
      id: executionId,
      workflowId: wf.id,
      workflowName: wf.name,
      status: 'failed',
      startedAt,
      finishedAt: Date.now(),
      inputValues: exec.inputValues,
      finalVars: { ...exec.vars },
      nodeStates: { ...exec.nodeStates },
      error: msg,
      cwd,
      tokens: exec.totalTokens,
      triggeredBy: exec.triggeredBy
    }
    sendEvent(win, { type: 'execution:failed', executionId, error: msg.slice(0, 500), record })
  } finally {
    activeExecutions.delete(executionId)
    if (record) {
      saveExecutionRecord(record).catch((e) => wfLog(`saveExecutionRecord failed: ${e}`))
    }
  }

  return executionId
}

// Run a sub-workflow from within a parent exec. Tokens bubble up to parent; no execution
// record is persisted for the child (it's part of the parent run).
async function runChildWorkflow(
  wf: WorkflowDefinition,
  inputValues: Record<string, string>,
  parent: ActiveExec
): Promise<{ output: string; finalVars: Record<string, string> }> {
  const executionId = `exec-${++executionCounter}-${Date.now()}-child`
  const child: ActiveExec = {
    aborted: parent.aborted,
    vars: {},
    nodeStates: {},
    inputValues,
    wf,
    cwd: parent.cwd,
    win: parent.win,
    settings: parent.settings,
    activeSessions: parent.activeSessions, // share, so abort cascades
    pendingReviews: new Map(),
    nodeTokens: {},
    totalTokens: zeroUsage(),
    depth: parent.depth + 1,
    triggeredBy: parent.triggeredBy
  }
  activeExecutions.set(executionId, child)

  const startNodes = findStartNodes(wf)
  if (startNodes.length === 0) {
    activeExecutions.delete(executionId)
    throw new Error(`Sub-workflow "${wf.name}" has no start node`)
  }

  const joinCollectors = new Map<string, { outputs: string[]; arrivals: number; expected: number }>()
  const visited = new Set<string>()

  let lastOutput = ''
  try {
    const results = await Promise.all(
      startNodes.map((n) => runFromNode(n.id, '', executionId, child, visited, joinCollectors))
    )
    // Use output of the terminal node (first one with no successors) as the child's output
    const terminal = findTerminalNode(wf, child.nodeStates)
    lastOutput = terminal?.output ?? String(results[0] ?? '')
  } finally {
    activeExecutions.delete(executionId)
    // Bubble tokens up
    parent.totalTokens = addUsage(parent.totalTokens, child.totalTokens)
    // Cascade abort state
    if (child.aborted) parent.aborted = true
  }

  return { output: lastOutput, finalVars: { ...child.vars } }
}

function findTerminalNode(
  wf: WorkflowDefinition,
  nodeStates: Record<string, WorkflowNodeRunState>
): WorkflowNodeRunState | null {
  // Prefer done nodes with no outgoing edges; fallback to last-finished done node
  const hasOutgoing = new Set(wf.edges.map((e) => e.source))
  const doneStates = Object.values(nodeStates).filter((s) => s.status === 'done')
  const terminal = doneStates.filter((s) => !hasOutgoing.has(s.nodeId))
  if (terminal.length > 0) {
    terminal.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    return terminal[0]
  }
  doneStates.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
  return doneStates[0] ?? null
}

export function abortWorkflow(executionId: string): void {
  const exec = activeExecutions.get(executionId)
  if (!exec) return
  exec.aborted = true
  for (const sess of exec.activeSessions) abortClaude(sess)
  // Resolve any pending reviews as rejected
  for (const [, resolve] of exec.pendingReviews) resolve(false)
  exec.pendingReviews.clear()
}

export function respondToReview(
  executionId: string,
  nodeId: string,
  approved: boolean
): { ok: boolean } {
  const exec = activeExecutions.get(executionId)
  if (!exec) return { ok: false }
  const resolver = exec.pendingReviews.get(nodeId)
  if (!resolver) return { ok: false }
  exec.pendingReviews.delete(nodeId)
  resolver(approved)
  return { ok: true }
}
