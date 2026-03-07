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
        sessionId: string | null,
        coideSessionId: string
      ) => Promise<{ sessionId: string | null } | { error: string }>
      onEvent: (callback: (event: unknown) => void) => () => void
      onPermission: (callback: (permission: unknown) => void) => () => void
      respondPermission: (approved: boolean, coideSessionId?: string) => void
      abort: (coideSessionId?: string) => void
      saveImage: (base64: string, mediaType: string) => Promise<string>
    }
    dialog: {
      pickFolder: () => Promise<string | null>
      pickFile: () => Promise<string | null>
      saveFile: (defaultName: string, content: string) => Promise<{ success?: boolean; canceled?: boolean; error?: string }>
    }
    system: {
      homedir: () => Promise<string>
    }
    mcp: {
      list: (cwd: string) => Promise<unknown[]>
    }
    skills: {
      list: (cwd: string) => Promise<{ global: SkillInfo[]; project: SkillInfo[] }>
      write: (scope: 'global' | 'project', name: string, content: string, cwd: string) => Promise<{ success?: boolean; error?: string }>
      delete: (filePath: string) => Promise<{ success?: boolean; error?: string }>
    }
    settings: {
      sync: (settings: Record<string, unknown>) => Promise<void>
    }
    fs: {
      readFile: (filePath: string) => Promise<{ content?: string; error?: string }>
      revertFile: (filePath: string, originalContent: string | null) => Promise<{ success?: boolean; error?: string }>
    }
    hooks: {
      read: (scope: 'global' | 'project', cwd: string) => Promise<{ hooks: Record<string, unknown> }>
      write: (scope: 'global' | 'project', hooks: Record<string, unknown>, cwd: string) => Promise<{ success?: boolean; error?: string }>
    }
  }
}
