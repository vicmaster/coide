import { create } from 'zustand'

type HookEditorStore = {
  isOpen: boolean
  initialScope: 'global' | 'project'
  open: (scope?: 'global' | 'project') => void
  close: () => void
}

export const useHookEditorStore = create<HookEditorStore>()((set) => ({
  isOpen: false,
  initialScope: 'global',
  open: (scope = 'global') => set({ isOpen: true, initialScope: scope }),
  close: () => set({ isOpen: false })
}))
