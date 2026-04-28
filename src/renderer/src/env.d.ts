/// <reference types="vite/client" />

type SkillInfo = {
  name: string
  description: string
  scope: 'global' | 'project'
  filePath: string
}

type MemorySource = 'project-memory' | 'global-claude' | 'project-claude' | 'subagent-claude'
type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

type MemoryFile = {
  filePath: string
  source: MemorySource
  name: string
  description?: string
  memoryType?: MemoryType
  exists: boolean
  size?: number
  mtime?: number
  isIndex?: boolean
}

interface Window {
  api: {
    claude: {
      query: (
        prompt: string,
        cwd: string,
        sessionId: string | null,
        coideSessionId: string,
        worktreeName?: string
      ) => Promise<{ sessionId: string | null } | { error: string }>
      onEvent: (callback: (event: unknown) => void) => () => void
      onPermission: (callback: (permission: unknown) => void) => () => void
      respondPermission: (approved: boolean, coideSessionId?: string) => void
      abort: (coideSessionId?: string) => void
      saveImage: (base64: string, mediaType: string) => Promise<string>
      checkBinary: (customPath?: string) => Promise<{ found: boolean; path: string; version?: string }>
    }
    dialog: {
      pickFolder: () => Promise<string | null>
      pickFile: () => Promise<string | null>
      saveFile: (defaultName: string, content: string) => Promise<{ success?: boolean; canceled?: boolean; error?: string }>
    }
    system: {
      homedir: () => Promise<string>
    }
    git: {
      branch: (cwd: string) => Promise<string>
      isRepo: (cwd: string) => Promise<boolean>
      worktreeCreate: (cwd: string, branch: string) => Promise<{ path: string; branch: string; error?: string }>
      worktreeMerge: (cwd: string, branch: string) => Promise<{ success: boolean; error?: string }>
      worktreeRemove: (cwd: string, worktreePath: string) => Promise<{ success: boolean; error?: string }>
    }
    mcp: {
      list: (cwd: string) => Promise<unknown[]>
    }
    skills: {
      list: (cwd: string) => Promise<{ global: SkillInfo[]; project: SkillInfo[] }>
      write: (scope: 'global' | 'project', name: string, content: string, cwd: string) => Promise<{ success?: boolean; error?: string }>
      delete: (filePath: string) => Promise<{ success?: boolean; error?: string }>
    }
    memory: {
      list: (cwd: string) => Promise<{
        projectMemoryDir: string
        files: MemoryFile[]
        error?: string
      }>
      read: (filePath: string, cwd: string) => Promise<{ content?: string; error?: string }>
      write: (filePath: string, content: string, cwd: string) => Promise<{ success?: boolean; error?: string }>
      delete: (filePath: string, cwd: string) => Promise<{ success?: boolean; error?: string }>
    }
    settings: {
      sync: (settings: Record<string, unknown>) => Promise<void>
    }
    fs: {
      readFile: (filePath: string) => Promise<{ content?: string; error?: string }>
      revertFile: (filePath: string, originalContent: string | null) => Promise<{ success?: boolean; error?: string }>
    }
    workflow: {
      list: () => Promise<unknown[]>
      load: (id: string) => Promise<unknown>
      save: (workflow: unknown) => Promise<{ success?: boolean; error?: string }>
      delete: (id: string) => Promise<{ success?: boolean; error?: string }>
      run: (workflowId: string, cwd: string, inputValues?: Record<string, string>) => Promise<{ executionId?: string; error?: string }>
      abort: (executionId: string) => Promise<void>
      templates: () => Promise<unknown[]>
      onEvent: (callback: (event: unknown) => void) => () => void
    }
    hooks: {
      read: (scope: 'global' | 'project', cwd: string) => Promise<{ hooks: Record<string, unknown> }>
      write: (scope: 'global' | 'project', hooks: Record<string, unknown>, cwd: string) => Promise<{ success?: boolean; error?: string }>
    }
  }
}
