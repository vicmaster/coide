import { create } from 'zustand'

export type RightPanelTab = 'agents' | 'context' | 'mcp' | 'memory'

type UiStore = {
  rightPanelTab: RightPanelTab
  pendingMemoryFilePath: string | null
  pendingInputPrefill: string | null
  bottomPanelOpen: boolean
  bottomPanelFocusNonce: number
  setRightPanelTab: (tab: RightPanelTab) => void
  openMemoryFile: (filePath: string) => void
  consumePendingMemoryFile: () => void
  prefillInput: (text: string) => void
  consumeInputPrefill: () => string | null
  setBottomPanelOpen: (open: boolean) => void
  toggleBottomPanel: () => void
  focusProcessesTab: () => void
}

export const useUiStore = create<UiStore>()((set, get) => ({
  rightPanelTab: 'agents',
  pendingMemoryFilePath: null,
  pendingInputPrefill: null,
  bottomPanelOpen: false,
  bottomPanelFocusNonce: 0,
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab }),
  openMemoryFile: (filePath) =>
    set({ rightPanelTab: 'memory', pendingMemoryFilePath: filePath }),
  consumePendingMemoryFile: () => set({ pendingMemoryFilePath: null }),
  prefillInput: (text) => set({ pendingInputPrefill: text }),
  consumeInputPrefill: () => {
    const value = get().pendingInputPrefill
    set({ pendingInputPrefill: null })
    return value
  },
  setBottomPanelOpen: (open) => set({ bottomPanelOpen: open }),
  toggleBottomPanel: () => set((s) => ({ bottomPanelOpen: !s.bottomPanelOpen })),
  focusProcessesTab: () =>
    set((s) => ({
      bottomPanelOpen: true,
      bottomPanelFocusNonce: s.bottomPanelFocusNonce + 1
    }))
}))
