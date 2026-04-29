import { create } from 'zustand'

export type RightPanelTab = 'agents' | 'context' | 'mcp' | 'memory'

type UiStore = {
  rightPanelTab: RightPanelTab
  pendingMemoryFilePath: string | null
  pendingInputPrefill: string | null
  setRightPanelTab: (tab: RightPanelTab) => void
  openMemoryFile: (filePath: string) => void
  consumePendingMemoryFile: () => void
  prefillInput: (text: string) => void
  consumeInputPrefill: () => string | null
}

export const useUiStore = create<UiStore>()((set, get) => ({
  rightPanelTab: 'agents',
  pendingMemoryFilePath: null,
  pendingInputPrefill: null,
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab }),
  openMemoryFile: (filePath) =>
    set({ rightPanelTab: 'memory', pendingMemoryFilePath: filePath }),
  consumePendingMemoryFile: () => set({ pendingMemoryFilePath: null }),
  prefillInput: (text) => set({ pendingInputPrefill: text }),
  consumeInputPrefill: () => {
    const value = get().pendingInputPrefill
    set({ pendingInputPrefill: null })
    return value
  }
}))
