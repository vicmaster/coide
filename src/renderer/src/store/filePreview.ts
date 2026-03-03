import { create } from 'zustand'

type FilePreviewStore = {
  filePath: string | null
  open: (path: string) => void
  close: () => void
}

export const useFilePreviewStore = create<FilePreviewStore>()((set) => ({
  filePath: null,
  open: (path: string) => set({ filePath: path }),
  close: () => set({ filePath: null })
}))
