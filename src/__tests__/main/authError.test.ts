import { describe, it, expect } from 'vitest'
import { isAuthError } from '../../main/claude'

describe('isAuthError', () => {
  it('detects HTTP 401 status', () => {
    expect(isAuthError('API Error: 401 something went wrong')).toBe(true)
  })

  it('detects authentication_error type from Anthropic API responses', () => {
    expect(
      isAuthError('{"type":"error","error":{"type":"authentication_error","message":"Invalid authentication credentials"}}')
    ).toBe(true)
  })

  it('matches case-insensitively', () => {
    expect(isAuthError('UNAUTHORIZED')).toBe(true)
    expect(isAuthError('Invalid API Key')).toBe(true)
  })

  it('does not match unrelated 401 substrings (e.g. inside a longer number)', () => {
    expect(isAuthError('processed 4012 records')).toBe(false)
  })

  it('does not match generic errors', () => {
    expect(isAuthError('Network error')).toBe(false)
    expect(isAuthError('Tool denied')).toBe(false)
    expect(isAuthError('')).toBe(false)
  })
})
