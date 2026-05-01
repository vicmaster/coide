import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: class {}
}))

import { mapClaudeStatus, truncateOutput } from '../../main/processes'

describe('mapClaudeStatus', () => {
  it('maps known statuses', () => {
    expect(mapClaudeStatus('running')).toBe('running')
    expect(mapClaudeStatus('killed')).toBe('killed')
    expect(mapClaudeStatus('stopped')).toBe('stopped')
    expect(mapClaudeStatus('completed')).toBe('exited')
    expect(mapClaudeStatus('failed')).toBe('exited')
  })

  it('falls back to exited for unknown values', () => {
    expect(mapClaudeStatus('something-new')).toBe('exited')
    expect(mapClaudeStatus('')).toBe('exited')
  })
})

describe('truncateOutput', () => {
  it('passes short content through unchanged', () => {
    expect(truncateOutput('hello\nworld')).toBe('hello\nworld')
  })

  it('keeps the last 20 lines when exceeding the line cap', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`)
    const result = truncateOutput(lines.join('\n'))
    expect(result.startsWith('… (truncated)\n')).toBe(true)
    expect(result).toContain('line 30')
    expect(result).not.toContain('line 1\n')
  })

  it('truncates when exceeding the character cap even with few lines', () => {
    const big = 'x'.repeat(3000)
    const result = truncateOutput(big)
    expect(result.startsWith('… (truncated)\n')).toBe(true)
    expect(result.length).toBeLessThan(3000)
  })
})
