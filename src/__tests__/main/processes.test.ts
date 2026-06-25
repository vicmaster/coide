import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: class {}
}))

import { mapClaudeStatus, truncateOutput, readOutputTail } from '../../main/processes'
import { writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

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

describe('readOutputTail', () => {
  const tmp = (name: string): string => join(tmpdir(), `coide-tail-${process.pid}-${name}`)

  it('returns the file size and tail text', async () => {
    const p = tmp('basic.log')
    await writeFile(p, 'hello world')
    try {
      const res = await readOutputTail(p, null)
      expect(res).not.toBeNull()
      expect(res!.size).toBe(11)
      expect(res!.text).toBe('hello world')
    } finally {
      await rm(p, { force: true })
    }
  })

  it('skips the read when size is unchanged', async () => {
    const p = tmp('unchanged.log')
    await writeFile(p, 'abc')
    try {
      const first = await readOutputTail(p, null)
      expect(first!.size).toBe(3)
      // Same size as before → no new output → null without re-reading the body.
      expect(await readOutputTail(p, first!.size)).toBeNull()
    } finally {
      await rm(p, { force: true })
    }
  })

  it('reads only the last 4KB of a large file', async () => {
    const p = tmp('large.log')
    const head = 'A'.repeat(10_000)
    const tail = 'TAILMARKER'
    await writeFile(p, head + tail)
    try {
      const res = await readOutputTail(p, null)
      expect(res!.size).toBe(10_010)
      // Tail content is present; the 10KB head is not fully loaded into the snippet.
      expect(res!.text).toContain('TAILMARKER')
      expect(res!.text.length).toBeLessThan(5000)
    } finally {
      await rm(p, { force: true })
    }
  })

  it('returns null for a missing file', async () => {
    expect(await readOutputTail(tmp('does-not-exist.log'), null)).toBeNull()
  })
})
