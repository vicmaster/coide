import { describe, it, expect } from 'vitest'
import {
  interpolate,
  applyExtractor,
  evaluateCondition
} from '../../shared/workflowHelpers'

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
