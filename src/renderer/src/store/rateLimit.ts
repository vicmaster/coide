import { create } from 'zustand'

export type RateLimitWindow = {
  status: string // 'allowed' | 'throttled' | ...
  resetsAt: number // Unix seconds
  rateLimitType: string // 'five_hour' | 'seven_day'
}

type RateLimitStore = {
  windows: Record<string, RateLimitWindow> // keyed by rateLimitType
  updatedAt: number | null
  setWindow: (window: RateLimitWindow) => void
  clear: () => void
}

export const useRateLimitStore = create<RateLimitStore>((set) => ({
  windows: {},
  updatedAt: null,
  setWindow: (window) =>
    set((state) => ({
      windows: { ...state.windows, [window.rateLimitType]: window },
      updatedAt: Date.now()
    })),
  clear: () => set({ windows: {}, updatedAt: null })
}))
