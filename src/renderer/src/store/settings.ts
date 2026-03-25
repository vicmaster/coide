import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type CoideSettings, DEFAULT_SETTINGS } from '../../../shared/types'

type SettingsStore = CoideSettings & {
  updateSettings: (partial: Partial<CoideSettings>) => void
  resetSettings: () => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      updateSettings: (partial: Partial<CoideSettings>) => set(partial),
      resetSettings: () => set(DEFAULT_SETTINGS)
    }),
    {
      name: 'coide-settings',
      merge: (persisted, current) => {
        const merged = {
          ...current,
          ...(persisted as Partial<SettingsStore>)
        }
        // Migration: existing users with defaultCwd already set skip onboarding
        if (merged.defaultCwd && (persisted as Record<string, unknown>)?.onboardingComplete === undefined) {
          merged.onboardingComplete = true
        }
        return merged
      },
    }
  )
)
