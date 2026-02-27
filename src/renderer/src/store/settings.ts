import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type SettingsStore = {
  skipPermissions: boolean
  setSkipPermissions: (value: boolean) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      skipPermissions: false,
      setSkipPermissions: (value: boolean) => set({ skipPermissions: value })
    }),
    { name: 'coide-settings' }
  )
)
