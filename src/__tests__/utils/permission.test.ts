import { describe, it, expect } from 'vitest'
import { extractPlan, computeDiffHeight } from '../../renderer/src/utils/permission'

describe('extractPlan', () => {
  it('returns the plan string when input.plan is set', () => {
    expect(extractPlan({ plan: '## Step 1\n- Do the thing' })).toBe('## Step 1\n- Do the thing')
  })

  it('preserves multi-line markdown content', () => {
    const plan = '# Plan\n\n1. First\n2. Second\n\n```ts\nconst x = 1\n```'
    expect(extractPlan({ plan })).toBe(plan)
  })

  it('falls back to JSON when input.plan is missing', () => {
    const out = extractPlan({ other: 'value' })
    expect(out).toContain('```json')
    expect(out).toContain('"other": "value"')
  })

  it('falls back to JSON when input.plan is non-string', () => {
    const out = extractPlan({ plan: 42 })
    expect(out).toContain('```json')
    expect(out).toContain('"plan": 42')
  })

  it('falls back to JSON when input.plan is empty string', () => {
    const out = extractPlan({ plan: '   ' })
    expect(out).toContain('```json')
  })

  it('returns empty string for null/undefined input', () => {
    expect(extractPlan(null)).toBe('')
    expect(extractPlan(undefined)).toBe('')
  })
})

describe('computeDiffHeight', () => {
  it('clamps to a minimum of 240', () => {
    expect(computeDiffHeight(400)).toBe(240)
    expect(computeDiffHeight(0)).toBe(240)
  })

  it('caps at 600 on tall viewports', () => {
    expect(computeDiffHeight(1200)).toBe(600)
    expect(computeDiffHeight(2000)).toBe(600)
  })

  it('uses viewport - 280 in the middle range', () => {
    expect(computeDiffHeight(700)).toBe(420)
    expect(computeDiffHeight(800)).toBe(520)
  })
})
