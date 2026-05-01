import { create } from 'zustand'

export type BgProcess = BgProcessRow

export const EMPTY_PROCESSES: BgProcess[] = []

interface ProcessesState {
  bySession: Record<string, BgProcess[]>
  setForSession: (coideSessionId: string, processes: BgProcess[]) => void
  clearSession: (coideSessionId: string) => void
}

export const useProcessesStore = create<ProcessesState>((set) => ({
  bySession: {},
  setForSession: (coideSessionId, processes) =>
    set((state) => ({
      bySession: { ...state.bySession, [coideSessionId]: processes }
    })),
  clearSession: (coideSessionId) =>
    set((state) => {
      const next = { ...state.bySession }
      delete next[coideSessionId]
      return { bySession: next }
    })
}))

export function processesForSession(state: ProcessesState, coideSessionId: string | null): BgProcess[] {
  if (!coideSessionId) return []
  return state.bySession[coideSessionId] ?? []
}
