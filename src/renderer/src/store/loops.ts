import { create } from 'zustand'

export type LoopEntry = {
  sessionId: string
  prompt: string
  intervalMs: number
  intervalId: ReturnType<typeof setInterval>
  runCount: number
  skippedCount: number
  startedAt: number
}

type LoopsStore = {
  loops: Map<string, LoopEntry>
  addLoop: (entry: LoopEntry) => void
  removeLoop: (sessionId: string) => void
  tickLoop: (sessionId: string) => void
  skipLoop: (sessionId: string) => void
}

export const useLoopsStore = create<LoopsStore>((set, get) => ({
  loops: new Map(),

  addLoop: (entry) =>
    set((s) => {
      const m = new Map(s.loops)
      m.set(entry.sessionId, entry)
      return { loops: m }
    }),

  removeLoop: (sessionId) => {
    const entry = get().loops.get(sessionId)
    if (entry) clearInterval(entry.intervalId)
    set((s) => {
      const m = new Map(s.loops)
      m.delete(sessionId)
      return { loops: m }
    })
  },

  tickLoop: (sessionId) =>
    set((s) => {
      const entry = s.loops.get(sessionId)
      if (!entry) return s
      const m = new Map(s.loops)
      m.set(sessionId, { ...entry, runCount: entry.runCount + 1 })
      return { loops: m }
    }),

  skipLoop: (sessionId) =>
    set((s) => {
      const entry = s.loops.get(sessionId)
      if (!entry) return s
      const m = new Map(s.loops)
      m.set(sessionId, { ...entry, skippedCount: entry.skippedCount + 1 })
      return { loops: m }
    })
}))
