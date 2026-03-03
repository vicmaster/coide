import { create } from 'zustand'

type SkillEditorStore = {
  isOpen: boolean
  mode: 'create' | 'edit'
  skillName: string
  skillScope: 'global' | 'project'
  filePath: string | null
  openNew: (scope?: 'global' | 'project') => void
  openEdit: (skill: { name: string; scope: 'global' | 'project'; filePath: string }) => void
  close: () => void
}

export const useSkillEditorStore = create<SkillEditorStore>()((set) => ({
  isOpen: false,
  mode: 'create',
  skillName: '',
  skillScope: 'project',
  filePath: null,
  openNew: (scope = 'project') =>
    set({ isOpen: true, mode: 'create', skillName: '', skillScope: scope, filePath: null }),
  openEdit: (skill) =>
    set({
      isOpen: true,
      mode: 'edit',
      skillName: skill.name,
      skillScope: skill.scope,
      filePath: skill.filePath
    }),
  close: () => set({ isOpen: false, skillName: '', filePath: null })
}))
