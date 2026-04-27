import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useResolvedTheme } from '../../renderer/src/hooks/useResolvedTheme'
import { useSettingsStore } from '../../renderer/src/store/settings'

type MqlListener = (e: { matches: boolean }) => void

function installMatchMedia(initialMatches: boolean): {
  setMatches: (m: boolean) => void
} {
  let matches = initialMatches
  let listener: MqlListener | null = null

  const mql = {
    get matches() {
      return matches
    },
    media: '(prefers-color-scheme: light)',
    addEventListener: (_evt: string, cb: MqlListener) => {
      listener = cb
    },
    removeEventListener: () => {
      listener = null
    }
  }

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn(() => mql)
  })

  return {
    setMatches: (m: boolean) => {
      matches = m
      listener?.({ matches: m })
    }
  }
}

describe('useResolvedTheme', () => {
  beforeEach(() => {
    useSettingsStore.setState({ theme: 'dark' })
  })

  it('returns "dark" when preference is "dark", regardless of system', () => {
    installMatchMedia(true) // system prefers light
    useSettingsStore.setState({ theme: 'dark' })
    const { result } = renderHook(() => useResolvedTheme())
    expect(result.current).toBe('dark')
  })

  it('returns "light" when preference is "light", regardless of system', () => {
    installMatchMedia(false) // system prefers dark
    useSettingsStore.setState({ theme: 'light' })
    const { result } = renderHook(() => useResolvedTheme())
    expect(result.current).toBe('light')
  })

  it('returns system theme when preference is "system" — light', () => {
    installMatchMedia(true)
    useSettingsStore.setState({ theme: 'system' })
    const { result } = renderHook(() => useResolvedTheme())
    expect(result.current).toBe('light')
  })

  it('returns system theme when preference is "system" — dark', () => {
    installMatchMedia(false)
    useSettingsStore.setState({ theme: 'system' })
    const { result } = renderHook(() => useResolvedTheme())
    expect(result.current).toBe('dark')
  })

  it('reacts to system preference changes when preference is "system"', () => {
    const mql = installMatchMedia(false)
    useSettingsStore.setState({ theme: 'system' })
    const { result } = renderHook(() => useResolvedTheme())
    expect(result.current).toBe('dark')

    act(() => mql.setMatches(true))
    expect(result.current).toBe('light')

    act(() => mql.setMatches(false))
    expect(result.current).toBe('dark')
  })

  it('updates when settings preference changes', () => {
    installMatchMedia(true) // system prefers light
    useSettingsStore.setState({ theme: 'dark' })
    const { result } = renderHook(() => useResolvedTheme())
    expect(result.current).toBe('dark')

    act(() => useSettingsStore.setState({ theme: 'light' }))
    expect(result.current).toBe('light')

    act(() => useSettingsStore.setState({ theme: 'system' }))
    expect(result.current).toBe('light') // system says light
  })
})
