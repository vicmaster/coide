import { describe, it, expect } from 'vitest'
import {
  interpolate,
  applyExtractor,
  evaluateCondition,
  aggregateWorkflowMetrics
} from '../../shared/workflowHelpers'
import type {
  WorkflowDefinition,
  WorkflowExecutionRecord
} from '../../shared/workflow-types'

describe('interpolate', () => {
  it('returns template unchanged when there are no placeholders', () => {
    expect(interpolate('hello world', '', {}, {})).toBe('hello world')
  })

  it('substitutes {{prev.output}}', () => {
    expect(interpolate('previously: {{prev.output}}', 'the result', {}, {})).toBe(
      'previously: the result'
    )
  })

  it('substitutes {{input.key}} and {{vars.name}} from their maps', () => {
    const out = interpolate(
      'company={{input.company}} mood={{vars.mood}}',
      '',
      { company: 'Acme' },
      { mood: 'chipper' }
    )
    expect(out).toBe('company=Acme mood=chipper')
  })

  it('replaces missing keys with empty string', () => {
    expect(interpolate('[{{input.missing}}][{{vars.gone}}]', '', {}, {})).toBe('[][]')
  })

  it('replaces all occurrences, not just the first', () => {
    expect(interpolate('{{prev.output}}/{{prev.output}}', 'x', {}, {})).toBe('x/x')
  })

  it('ignores placeholders with invalid syntax', () => {
    expect(interpolate('{{unknown.thing}} stays', '', {}, {})).toBe('{{unknown.thing}} stays')
  })
})

describe('applyExtractor', () => {
  it('returns the raw output for empty extractor', () => {
    expect(applyExtractor('', 'raw value\n')).toBe('raw value\n')
  })

  it('returns the raw output for unknown prefix', () => {
    expect(applyExtractor('weird:thing', 'raw')).toBe('raw')
  })

  describe('json:', () => {
    it('extracts a nested path', () => {
      const output = JSON.stringify({ a: { b: { c: 'deep' } } })
      expect(applyExtractor('json:a.b.c', output)).toBe('deep')
    })

    it('stringifies non-string values at the path', () => {
      const output = JSON.stringify({ n: 42, arr: [1, 2, 3] })
      expect(applyExtractor('json:n', output)).toBe('42')
      expect(applyExtractor('json:arr', output)).toBe('[1,2,3]')
    })

    it('returns empty string when the path is missing', () => {
      expect(applyExtractor('json:missing.key', JSON.stringify({}))).toBe('')
    })

    it('returns empty string when output is not valid JSON', () => {
      expect(applyExtractor('json:a', 'not json at all')).toBe('')
    })
  })

  describe('regex:', () => {
    it('returns the first capture group when present', () => {
      expect(applyExtractor('regex:score=(\\d+)', 'hello score=7 bye')).toBe('7')
    })

    it('returns the full match when no capture group is specified', () => {
      expect(applyExtractor('regex:\\d+', 'there are 42 items')).toBe('42')
    })

    it('returns empty string on no match', () => {
      expect(applyExtractor('regex:nope', 'hello')).toBe('')
    })

    it('returns empty string on invalid regex', () => {
      expect(applyExtractor('regex:(unclosed', 'x')).toBe('')
    })
  })

  describe('lines:', () => {
    const sample = 'one\ntwo\nthree\nfour\nfive'

    it('extracts a single 1-indexed line', () => {
      expect(applyExtractor('lines:2', sample)).toBe('two')
    })

    it('extracts an inclusive range', () => {
      expect(applyExtractor('lines:2-4', sample)).toBe('two\nthree\nfour')
    })

    it('handles ranges past the end gracefully', () => {
      expect(applyExtractor('lines:4-99', sample)).toBe('four\nfive')
    })

    it('normalises CRLF line endings', () => {
      expect(applyExtractor('lines:2', 'one\r\ntwo\r\nthree')).toBe('two')
    })
  })
})

describe('evaluateCondition', () => {
  it('returns true for a trivially truthy expression', () => {
    expect(evaluateCondition('true', '', {}, 0)).toBe(true)
  })

  it('evaluates against the provided output', () => {
    expect(evaluateCondition('output.includes("bug")', 'found a bug', {}, 1)).toBe(true)
    expect(evaluateCondition('output.includes("bug")', 'clean', {}, 1)).toBe(false)
  })

  it('exposes vars and iteration to the expression', () => {
    expect(
      evaluateCondition('(parseInt(vars.score) || 0) < 8 && iteration < 5', '', { score: '6' }, 2)
    ).toBe(true)
    expect(
      evaluateCondition('(parseInt(vars.score) || 0) < 8 && iteration < 5', '', { score: '9' }, 2)
    ).toBe(false)
  })

  it('returns false when the expression throws instead of bubbling up', () => {
    expect(evaluateCondition('output.doesNotExist.crash', 'x', {}, 0)).toBe(false)
  })

  it('returns false for syntactically invalid expressions', () => {
    expect(evaluateCondition('((', '', {}, 0)).toBe(false)
  })
})

describe('aggregateWorkflowMetrics', () => {
  const wf: WorkflowDefinition = {
    id: 'wf-test',
    name: 'Test Flow',
    createdAt: 0,
    updatedAt: 0,
    nodes: [
      { id: 'n1', label: 'Seed', position: { x: 0, y: 0 }, data: { type: 'prompt', prompt: '' } },
      { id: 'n2', label: 'Review', position: { x: 0, y: 0 }, data: { type: 'prompt', prompt: '' } },
      { id: 'n3', label: 'Finalize', position: { x: 0, y: 0 }, data: { type: 'prompt', prompt: '' } }
    ],
    edges: []
  }

  const mkRecord = (
    id: string,
    status: 'done' | 'failed' | 'aborted',
    overrides: Partial<WorkflowExecutionRecord> = {}
  ): WorkflowExecutionRecord => ({
    id,
    workflowId: wf.id,
    workflowName: wf.name,
    status,
    startedAt: 1000,
    finishedAt: 3000,
    inputValues: {},
    finalVars: {},
    nodeStates: {},
    ...overrides
  })

  it('returns zeros for an empty history', () => {
    const m = aggregateWorkflowMetrics(wf, [])
    expect(m.totalRuns).toBe(0)
    expect(m.successRuns).toBe(0)
    expect(m.avgDurationMs).toBe(0)
    expect(m.topFailingNodes).toEqual([])
    expect(m.lastRunAt).toBeUndefined()
    expect(m.totalTokens).toEqual({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0 })
  })

  it('counts each status independently', () => {
    const m = aggregateWorkflowMetrics(wf, [
      mkRecord('r1', 'done'),
      mkRecord('r2', 'done'),
      mkRecord('r3', 'failed'),
      mkRecord('r4', 'aborted')
    ])
    expect(m.totalRuns).toBe(4)
    expect(m.successRuns).toBe(2)
    expect(m.failedRuns).toBe(1)
    expect(m.abortedRuns).toBe(1)
  })

  it('averages duration and rounds to whole ms', () => {
    const m = aggregateWorkflowMetrics(wf, [
      mkRecord('r1', 'done', { startedAt: 0, finishedAt: 1000 }),
      mkRecord('r2', 'done', { startedAt: 0, finishedAt: 2000 }),
      mkRecord('r3', 'done', { startedAt: 0, finishedAt: 3001 })
    ])
    expect(m.avgDurationMs).toBe(2000) // (1000+2000+3001)/3 = 2000.33 → 2000
  })

  it('sums token usage across all records', () => {
    const m = aggregateWorkflowMetrics(wf, [
      mkRecord('r1', 'done', {
        tokens: { input: 100, output: 50, cacheRead: 10, cacheCreation: 5 }
      }),
      mkRecord('r2', 'failed', {
        tokens: { input: 200, output: 0, cacheRead: 0, cacheCreation: 15 }
      })
    ])
    expect(m.totalTokens).toEqual({ input: 300, output: 50, cacheRead: 10, cacheCreation: 20 })
  })

  it('ranks failing nodes by frequency and resolves their labels', () => {
    const m = aggregateWorkflowMetrics(wf, [
      mkRecord('r1', 'failed', {
        nodeStates: {
          n1: { nodeId: 'n1', status: 'done' },
          n2: { nodeId: 'n2', status: 'failed' }
        }
      }),
      mkRecord('r2', 'failed', {
        nodeStates: {
          n2: { nodeId: 'n2', status: 'failed' },
          n3: { nodeId: 'n3', status: 'failed' }
        }
      }),
      mkRecord('r3', 'failed', {
        nodeStates: {
          n2: { nodeId: 'n2', status: 'failed' }
        }
      })
    ])
    expect(m.topFailingNodes[0]).toEqual({ nodeId: 'n2', nodeLabel: 'Review', failures: 3 })
    expect(m.topFailingNodes[1]).toEqual({ nodeId: 'n3', nodeLabel: 'Finalize', failures: 1 })
    expect(m.topFailingNodes).toHaveLength(2)
  })

  it('picks lastRunAt / lastStatus from the most recent record regardless of order', () => {
    const m = aggregateWorkflowMetrics(wf, [
      mkRecord('r-old', 'done', { startedAt: 1000 }),
      mkRecord('r-new', 'failed', { startedAt: 9999 }),
      mkRecord('r-mid', 'done', { startedAt: 5000 })
    ])
    expect(m.lastRunAt).toBe(9999)
    expect(m.lastStatus).toBe('failed')
  })

  it('falls back to nodeId when a failing node is missing from the workflow def', () => {
    const m = aggregateWorkflowMetrics(wf, [
      mkRecord('r1', 'failed', {
        nodeStates: {
          'deleted-node': { nodeId: 'deleted-node', status: 'failed' }
        }
      })
    ])
    expect(m.topFailingNodes[0]).toEqual({
      nodeId: 'deleted-node',
      nodeLabel: 'deleted-node',
      failures: 1
    })
  })
})
