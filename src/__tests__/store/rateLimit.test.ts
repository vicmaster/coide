import { describe, it, expect, beforeEach } from 'vitest'
import { useRateLimitStore } from '../../renderer/src/store/rateLimit'

function resetStore(): void {
  useRateLimitStore.setState({ windows: {}, updatedAt: null })
}

describe('RateLimit Store', () => {
  beforeEach(resetStore)

  describe('setWindow', () => {
    it('stores a five_hour window', () => {
      useRateLimitStore.getState().setWindow({
        status: 'allowed',
        resetsAt: 1774818000,
        rateLimitType: 'five_hour'
      })
      const state = useRateLimitStore.getState()
      expect(state.windows['five_hour']).toEqual({
        status: 'allowed',
        resetsAt: 1774818000,
        rateLimitType: 'five_hour'
      })
      expect(state.updatedAt).toBeTypeOf('number')
    })

    it('stores multiple window types independently', () => {
      const { setWindow } = useRateLimitStore.getState()
      setWindow({ status: 'allowed', resetsAt: 1774818000, rateLimitType: 'five_hour' })
      setWindow({ status: 'allowed', resetsAt: 1775000000, rateLimitType: 'seven_day' })

      const state = useRateLimitStore.getState()
      expect(Object.keys(state.windows)).toHaveLength(2)
      expect(state.windows['five_hour'].resetsAt).toBe(1774818000)
      expect(state.windows['seven_day'].resetsAt).toBe(1775000000)
    })

    it('updates an existing window', () => {
      const { setWindow } = useRateLimitStore.getState()
      setWindow({ status: 'allowed', resetsAt: 1774818000, rateLimitType: 'five_hour' })
      setWindow({ status: 'throttled', resetsAt: 1774819000, rateLimitType: 'five_hour' })

      const state = useRateLimitStore.getState()
      expect(state.windows['five_hour'].status).toBe('throttled')
      expect(state.windows['five_hour'].resetsAt).toBe(1774819000)
    })
  })

  describe('clear', () => {
    it('resets all state', () => {
      useRateLimitStore.getState().setWindow({
        status: 'allowed',
        resetsAt: 1774818000,
        rateLimitType: 'five_hour'
      })
      useRateLimitStore.getState().clear()

      const state = useRateLimitStore.getState()
      expect(state.windows).toEqual({})
      expect(state.updatedAt).toBeNull()
    })
  })
})
