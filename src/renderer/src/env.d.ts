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
      saveImage: (base64: string, mediaType: string) => Promise<string>
    }
    dialog: {
      pickFolder: () => Promise<string | null>
    }
    skills: {
      list: (cwd: string) => Promise<{ global: SkillInfo[]; project: SkillInfo[] }>
    }
    settings: {
      sync: (settings: Record<string, unknown>) => Promise<void>
    }
    fs: {
      readFile: (filePath: string) => Promise<{ content?: string; error?: string }>
      revertFile: (filePath: string, originalContent: string | null) => Promise<{ success?: boolean; error?: string }>
    }
  }
}
