/// <reference types="vite/client" />

type SkillInfo = {
  name: string
  description: string
  scope: 'global' | 'project'
  filePath: string
}

interface Window {
  api: {
    claude: {
      query: (
        prompt: string,
        cwd: string,
        sessionId: string | null
      ) => Promise<{ sessionId: string | null } | { error: string }>
      onEvent: (callback: (event: unknown) => void) => () => void
      onPermission: (callback: (permission: unknown) => void) => () => void
      respondPermission: (approved: boolean) => void
      abort: () => void
    }
    dialog: {
      pickFolder: () => Promise<string | null>
    }
    skills: {
      list: (cwd: string) => Promise<{ global: SkillInfo[]; project: SkillInfo[] }>
    }
  }
}
