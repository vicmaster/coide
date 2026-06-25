import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createIdbStorage } from '../../renderer/src/store/idbStorage'

// jsdom has no IndexedDB, so the adapter falls back to localStorage — these
// tests exercise that path plus the throttle/coalesce logic that is backend-agnostic.
describe('createIdbStorage (localStorage fallback)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('round-trips a value after the throttle window', async () => {
    const storage = createIdbStorage<{ n: number }>(800)
    storage.setItem('k', { state: { n: 1 }, version: 0 })
    // Nothing written before the window elapses.
    expect(localStorage.getItem('k')).toBeNull()
    await vi.advanceTimersByTimeAsync(800)
    expect(localStorage.getItem('k')).toBe(JSON.stringify({ state: { n: 1 }, version: 0 }))
    const read = await storage.getItem('k')
    expect(read).toEqual({ state: { n: 1 }, version: 0 })
  })

  it('coalesces a burst of writes and flushes once with the last value', async () => {
    const storage = createIdbStorage<{ n: number }>(500)
    for (let n = 0; n < 10; n++) {
      storage.setItem('k', { state: { n }, version: 0 })
    }
    // Still coalescing right up to the window boundary.
    await vi.advanceTimersByTimeAsync(499)
    expect(localStorage.getItem('k')).toBeNull()
    // One flush fires, last value wins.
    await vi.advanceTimersByTimeAsync(1)
    expect(localStorage.getItem('k')).toBe(JSON.stringify({ state: { n: 9 }, version: 0 }))
    // No further writes are scheduled after the flush.
    localStorage.removeItem('k')
    await vi.advanceTimersByTimeAsync(2000)
    expect(localStorage.getItem('k')).toBeNull()
  })

  it('returns null for a missing key', async () => {
    const storage = createIdbStorage(800)
    expect(await storage.getItem('missing')).toBeNull()
  })

  it('removeItem cancels a pending write and deletes the key', async () => {
    const storage = createIdbStorage<{ n: number }>(800)
    localStorage.setItem('k', 'old')
    storage.setItem('k', { state: { n: 1 }, version: 0 })
    await storage.removeItem('k')
    await vi.advanceTimersByTimeAsync(800)
    expect(localStorage.getItem('k')).toBeNull()
  })
})
