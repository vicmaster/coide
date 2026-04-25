// Pure helpers used by the workflow engine. Kept in `shared/` so they can be
// unit-tested without pulling in Electron or Node-only deps.

import type {
  WorkflowDefinition,
  WorkflowExecutionRecord,
  WorkflowMetrics,
  WorkflowTokenUsage
} from './workflow-types'

export const MARKETPLACE_OWNER = 'vicmaster'
export const MARKETPLACE_REPO = 'coide-flows-marketplace'
export const MARKETPLACE_BRANCH = 'main'
export const MARKETPLACE_RAW_BASE = `https://raw.githubusercontent.com/${MARKETPLACE_OWNER}/${MARKETPLACE_REPO}/${MARKETPLACE_BRANCH}`

/**
 * Interpolate `{{prev.output}}`, `{{input.key}}`, and `{{vars.name}}` placeholders
 * in a template string. Unknown keys resolve to empty string.
 */
export function interpolate(
  template: string,
  prevOutput: string,
  inputValues: Record<string, string>,
  vars: Record<string, string>
): string {
  let result = template.replace(/\{\{prev\.output\}\}/g, prevOutput)
  result = result.replace(/\{\{input\.(\w+)\}\}/g, (_, key) => inputValues[key] ?? '')
  result = result.replace(/\{\{vars\.(\w+)\}\}/g, (_, key) => vars[key] ?? '')
  return result
}

/**
 * Resolve an extractor string against node output.
 *
 * Supported forms:
 *   ""                     → raw output
 *   "json:path.to.field"   → JSON.parse, walk dotted path
 *   "regex:pattern"        → first capture group, or full match
 *   "lines:N" / "lines:N-M" → slice of lines (1-indexed, inclusive)
 *
 * Returns empty string on malformed input / no match.
 */
export function applyExtractor(extractor: string, output: string): string {
  const ext = (extractor ?? '').trim()
  if (!ext) return output

  if (ext.startsWith('json:')) {
    try {
      const path = ext.slice(5).trim()
      const parsed = JSON.parse(output)
      const parts = path.split('.').filter(Boolean)
      let cur: unknown = parsed
      for (const p of parts) {
        if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
          cur = (cur as Record<string, unknown>)[p]
        } else {
          return ''
        }
      }
      return typeof cur === 'string' ? cur : JSON.stringify(cur)
    } catch {
      return ''
    }
  }

  if (ext.startsWith('regex:')) {
    try {
      const pattern = ext.slice(6)
      const re = new RegExp(pattern)
      const m = output.match(re)
      if (!m) return ''
      return m[1] ?? m[0]
    } catch {
      return ''
    }
  }

  if (ext.startsWith('lines:')) {
    const range = ext.slice(6).trim()
    const lines = output.split(/\r?\n/)
    const [startStr, endStr] = range.split('-')
    const start = Math.max(1, parseInt(startStr, 10) || 1)
    const end = endStr ? Math.max(start, parseInt(endStr, 10) || start) : start
    return lines.slice(start - 1, end).join('\n')
  }

  return output
}

/**
 * Evaluate a workflow condition expression. Exposes `output`, `vars`, and
 * `iteration` to the expression. Returns false on eval failure (never throws).
 */
export function evaluateCondition(
  expression: string,
  output: string,
  vars: Record<string, string>,
  iteration: number
): boolean {
  try {
    const fn = new Function('output', 'vars', 'iteration', `return Boolean(${expression})`)
    return Boolean(fn(output, vars, iteration))
  } catch {
    return false
  }
}

function zeroUsage(): WorkflowTokenUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
}

/**
 * Aggregate a set of execution records into a WorkflowMetrics summary.
 * Pure function — extracted from the main-process store so we can unit-test it
 * without touching the filesystem.
 */
export function aggregateWorkflowMetrics(
  wf: WorkflowDefinition,
  records: WorkflowExecutionRecord[]
): WorkflowMetrics {
  const nodeLabels = new Map(wf.nodes.map((n) => [n.id, n.label]))

  let totalRuns = 0
  let successRuns = 0
  let failedRuns = 0
  let abortedRuns = 0
  let totalDuration = 0
  let durationCount = 0
  const totalTokens = zeroUsage()
  const failureCounts = new Map<string, number>()
  let lastRunAt: number | undefined
  let lastStatus: 'done' | 'failed' | 'aborted' | undefined

  for (const rec of records) {
    totalRuns += 1
    if (rec.status === 'done') successRuns += 1
    else if (rec.status === 'failed') failedRuns += 1
    else if (rec.status === 'aborted') abortedRuns += 1

    if (typeof rec.finishedAt === 'number' && typeof rec.startedAt === 'number') {
      totalDuration += rec.finishedAt - rec.startedAt
      durationCount += 1
    }

    if (rec.tokens) {
      totalTokens.input += rec.tokens.input
      totalTokens.output += rec.tokens.output
      totalTokens.cacheRead += rec.tokens.cacheRead
      totalTokens.cacheCreation += rec.tokens.cacheCreation
    }

    if (lastRunAt === undefined || rec.startedAt > lastRunAt) {
      lastRunAt = rec.startedAt
      lastStatus = rec.status
    }

    for (const ns of Object.values(rec.nodeStates)) {
      if (ns.status === 'failed') {
        failureCounts.set(ns.nodeId, (failureCounts.get(ns.nodeId) ?? 0) + 1)
      }
    }
  }

  const topFailingNodes = [...failureCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nodeId, failures]) => ({
      nodeId,
      nodeLabel: nodeLabels.get(nodeId) ?? nodeId,
      failures
    }))

  return {
    workflowId: wf.id,
    workflowName: wf.name,
    totalRuns,
    successRuns,
    failedRuns,
    abortedRuns,
    avgDurationMs: durationCount === 0 ? 0 : Math.round(totalDuration / durationCount),
    totalTokens,
    lastRunAt,
    lastStatus,
    topFailingNodes
  }
}

/**
 * Build a GitHub "new issue" URL prefilled with the workflow JSON, for users
 * who want to submit a workflow to the marketplace. Pure / no network calls.
 * Strips runtime-only fields (recentCwds, marketplaceId/Version) before
 * embedding so the JSON is reusable as a clean template.
 */
export function buildMarketplaceShareUrl(workflow: WorkflowDefinition): string {
  const cleaned: Record<string, unknown> = {
    ...workflow,
    isTemplate: true,
    createdAt: 0,
    updatedAt: 0
  }
  delete cleaned.recentCwds
  delete cleaned.marketplaceId
  delete cleaned.marketplaceVersion
  const body = [
    '<!-- Submit a workflow to coide-flows-marketplace -->',
    '',
    '**Suggested name:** ' + (workflow.name || ''),
    '**Description:** _add a one-liner_',
    '**Tags:** _comma-separated_',
    '',
    '## Workflow JSON',
    '',
    '```json',
    JSON.stringify(cleaned, null, 2),
    '```'
  ].join('\n')
  const params = new URLSearchParams({
    title: `Submit workflow: ${workflow.name || 'untitled'}`,
    body
  })
  return `https://github.com/${MARKETPLACE_OWNER}/${MARKETPLACE_REPO}/issues/new?${params.toString()}`
}
