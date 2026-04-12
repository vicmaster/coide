import { BrowserWindow } from 'electron'
import { exec } from 'child_process'
import { appendFile } from 'fs'
import { runClaude, onClaudeResult, abortClaude } from './claude'
import { loadWorkflow } from './workflowStore'

function wfLog(msg: string): void {
  const line = `[${new Date().toISOString()}] [workflow] ${msg}\n`
  console.log(line.trim())
  appendFile('/tmp/coide-debug.log', line, () => {})
}
import type { CoideSettings } from '../shared/types'
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEvent
} from '../shared/workflow-types'

// Active executions — keyed by executionId
const activeExecutions = new Map<
  string,
  { aborted: boolean; activeNodeSessionId?: string }
>()

let executionCounter = 0

function sendEvent(win: BrowserWindow, event: WorkflowEvent): void {
  win.webContents.send('workflow:event', event)
}

/** Interpolate {{prev.output}} and {{input.key}} in a prompt string */
function interpolate(
  template: string,
  prevOutput: string,
  inputValues: Record<string, string>
): string {
  let result = template.replace(/\{\{prev\.output\}\}/g, prevOutput)
  result = result.replace(/\{\{input\.(\w+)\}\}/g, (_, key) => inputValues[key] ?? '')
  return result
}

/** Find the start node (no incoming edges) */
function findStartNode(wf: WorkflowDefinition): WorkflowNode | null {
  const targets = new Set(wf.edges.map((e) => e.target))
  return wf.nodes.find((n) => !targets.has(n.id)) ?? null
}

/** Get the next node(s) from a given node, optionally filtered by edge label */
function getNextNodes(
  wf: WorkflowDefinition,
  nodeId: string,
  label?: string
): WorkflowNode[] {
  const edges = wf.edges.filter(
    (e) => e.source === nodeId && (label === undefined || e.label === label)
  )
  return edges
    .map((e) => wf.nodes.find((n) => n.id === e.target))
    .filter((n): n is WorkflowNode => n !== undefined)
}

/** Execute a Prompt node — spawns Claude CLI */
async function executePromptNode(
  node: WorkflowNode,
  prevOutput: string,
  cwd: string,
  executionId: string,
  win: BrowserWindow,
  settings: CoideSettings,
  inputValues: Record<string, string>
): Promise<string> {
  if (node.data.type !== 'prompt') throw new Error('Not a prompt node')

  const prompt = interpolate(node.data.prompt, prevOutput, inputValues)
  wfLog(`Prompt node "${node.label}": prompt length=${prompt.length}, cwd=${cwd}`)
  wfLog(`Prompt first 200 chars: ${prompt.slice(0, 200)}`)
  const coideSessionId = `wf-${executionId}-${node.id}`
  const exec = activeExecutions.get(executionId)
  if (exec) exec.activeNodeSessionId = coideSessionId

  // Build settings override for this node
  const nodeSettings: CoideSettings = {
    ...settings,
    skipPermissions: true, // workflows auto-approve
    planMode: false,
    model: node.data.model || settings.model,
    systemPrompt: node.data.systemPrompt || ''
  }

  // Register result callback to capture output text
  const resultPromise = new Promise<string>((resolve, reject) => {
    onClaudeResult(coideSessionId, (result, isError) => {
      if (isError) reject(new Error(result))
      else resolve(result)
    })
  })

  // Fire off Claude — runClaude returns the sessionId, but we need the result text
  runClaude(prompt, cwd, null, coideSessionId, win, nodeSettings).then(() => {
    wfLog(`runClaude resolved for node "${node.label}"`)
  }).catch((err) => {
    wfLog(`runClaude rejected for node "${node.label}": ${err}`)
  })

  return resultPromise
}

/** Execute a Script node — runs a shell command */
function executeScriptNode(
  node: WorkflowNode,
  cwd: string
): Promise<string> {
  if (node.data.type !== 'script') throw new Error('Not a script node')

  return new Promise((resolve, reject) => {
    exec(node.data.command, { cwd, timeout: 120_000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message))
      } else {
        resolve(stdout)
      }
    })
  })
}

/** Evaluate a Condition node expression */
function evaluateCondition(expression: string, output: string): boolean {
  try {
    const fn = new Function('output', `return Boolean(${expression})`)
    return fn(output)
  } catch {
    return false
  }
}

/** Main execution loop — walks the graph sequentially */
export async function executeWorkflow(
  workflowId: string,
  cwd: string,
  win: BrowserWindow,
  settings: CoideSettings,
  inputValues?: Record<string, string>
): Promise<string> {
  wfLog(`executeWorkflow called: workflowId=${workflowId}, cwd=${cwd}, inputs=${JSON.stringify(inputValues)}`)
  const wf = await loadWorkflow(workflowId)
  if (!wf) {
    wfLog(`Workflow not found: ${workflowId}`)
    throw new Error(`Workflow not found: ${workflowId}`)
  }
  wfLog(`Loaded workflow "${wf.name}" with ${wf.nodes.length} nodes`)

  const executionId = `exec-${++executionCounter}-${Date.now()}`
  activeExecutions.set(executionId, { aborted: false })

  let currentNode = findStartNode(wf)
  if (!currentNode) {
    wfLog('No start node found')
    throw new Error('No start node found in workflow')
  }
  wfLog(`Start node: "${currentNode.label}" (${currentNode.id})`)

  let currentOutput = ''

  try {
    while (currentNode) {
      const exec = activeExecutions.get(executionId)
      if (!exec || exec.aborted) {
        sendEvent(win, { type: 'execution:aborted', executionId })
        return executionId
      }

      sendEvent(win, { type: 'node:start', executionId, nodeId: currentNode.id })

      try {
        const nodeType = currentNode.data.type

        if (nodeType === 'prompt') {
          currentOutput = await executePromptNode(
            currentNode,
            currentOutput,
            cwd,
            executionId,
            win,
            settings,
            inputValues ?? {}
          )
        } else if (nodeType === 'script') {
          currentOutput = await executeScriptNode(currentNode, cwd)
        } else if (nodeType === 'condition') {
          const result = evaluateCondition(currentNode.data.expression, currentOutput)

          sendEvent(win, {
            type: 'node:done',
            executionId,
            nodeId: currentNode.id,
            output: result ? 'yes' : 'no'
          })

          // Follow the matching branch
          const branchLabel = result ? 'yes' : 'no'
          const nextNodes = getNextNodes(wf, currentNode.id, branchLabel)
          const skippedLabel = result ? 'no' : 'yes'
          const skippedNodes = getNextNodes(wf, currentNode.id, skippedLabel)
          for (const sn of skippedNodes) {
            sendEvent(win, { type: 'node:skipped', executionId, nodeId: sn.id })
          }

          currentNode = nextNodes[0] ?? null
          continue // skip the generic done/next below
        }

        // Non-condition: mark done and follow the single outgoing edge
        sendEvent(win, {
          type: 'node:done',
          executionId,
          nodeId: currentNode.id,
          output: currentOutput.slice(0, 2000) // cap event payload
        })

        const nextNodes = getNextNodes(wf, currentNode.id)
        currentNode = nextNodes[0] ?? null
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        sendEvent(win, {
          type: 'node:failed',
          executionId,
          nodeId: currentNode.id,
          error: errorMsg.slice(0, 2000)
        })
        sendEvent(win, {
          type: 'execution:failed',
          executionId,
          error: `Node "${currentNode.label}" failed: ${errorMsg.slice(0, 500)}`
        })
        activeExecutions.delete(executionId)
        return executionId
      }
    }

    sendEvent(win, { type: 'execution:done', executionId })
  } finally {
    activeExecutions.delete(executionId)
  }

  return executionId
}

/** Abort a running workflow execution */
export function abortWorkflow(executionId: string): void {
  const exec = activeExecutions.get(executionId)
  if (!exec) return
  exec.aborted = true
  if (exec.activeNodeSessionId) {
    abortClaude(exec.activeNodeSessionId)
  }
}
