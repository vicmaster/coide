import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  claude: {
    query: (prompt: string, cwd: string, sessionId: string | null, coideSessionId: string, worktreeName?: string) =>
      ipcRenderer.invoke('claude:query', { prompt, cwd, sessionId, coideSessionId, worktreeName }),

    onEvent: (callback: (event: unknown) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: unknown): void => callback(data)
      ipcRenderer.on('claude:event', handler)
      return () => ipcRenderer.removeListener('claude:event', handler)
    },

    onPermission: (callback: (permission: unknown) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: unknown): void => callback(data)
      ipcRenderer.on('claude:permission', handler)
      return () => ipcRenderer.removeListener('claude:permission', handler)
    },

    respondPermission: (approved: boolean, coideSessionId?: string) =>
      ipcRenderer.invoke('claude:permission-response', { approved, coideSessionId }),


    abort: (coideSessionId?: string) => ipcRenderer.invoke('claude:abort', coideSessionId),

    saveImage: (base64: string, mediaType: string): Promise<string> =>
      ipcRenderer.invoke('claude:save-image', { base64, mediaType }),

    processFile: (filePath: string) =>
      ipcRenderer.invoke('claude:process-file', { filePath }),

    saveTempFile: (base64: string, name: string): Promise<string | null> =>
      ipcRenderer.invoke('claude:save-temp-file', { base64, name }),

    checkBinary: (customPath?: string): Promise<{ found: boolean; path: string; version?: string }> =>
      ipcRenderer.invoke('claude:check-binary', { customPath })
  },
  dialog: {
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder'),
    pickFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFile'),
    pickFiles: (): Promise<string[] | null> => ipcRenderer.invoke('dialog:pickFiles'),
    saveFile: (defaultName: string, content: string): Promise<{ success?: boolean; canceled?: boolean; error?: string }> =>
      ipcRenderer.invoke('dialog:saveFile', { defaultName, content })
  },
  agents: {
    list: (cwd: string) => ipcRenderer.invoke('agents:list', { cwd })
  },
  skills: {
    list: (cwd: string) => ipcRenderer.invoke('skills:list', { cwd }),
    write: (scope: string, name: string, content: string, cwd: string) =>
      ipcRenderer.invoke('skills:write', { scope, name, content, cwd }),
    delete: (filePath: string) => ipcRenderer.invoke('skills:delete', { filePath })
  },
  settings: {
    sync: (settings: Record<string, unknown>) =>
      ipcRenderer.invoke('settings:sync', settings)
  },
  fs: {
    readFile: (filePath: string): Promise<{ content?: string; error?: string }> =>
      ipcRenderer.invoke('fs:readFile', { filePath }),
    revertFile: (filePath: string, originalContent: string | null): Promise<{ success?: boolean; error?: string }> =>
      ipcRenderer.invoke('fs:revertFile', { filePath, originalContent }),
    listFiles: (cwd: string, query: string): Promise<{ path: string; type: 'file' | 'folder' }[]> =>
      ipcRenderer.invoke('fs:listFiles', { cwd, query })
  },
  system: {
    homedir: (): Promise<string> => ipcRenderer.invoke('system:homedir')
  },
  git: {
    branch: (cwd: string): Promise<string> => ipcRenderer.invoke('git:branch', { cwd }),
    isRepo: (cwd: string): Promise<boolean> => ipcRenderer.invoke('git:isRepo', { cwd }),
    worktreeCreate: (cwd: string, branch: string): Promise<{ path: string; branch: string; error?: string }> =>
      ipcRenderer.invoke('git:worktreeCreate', { cwd, branch }),
    worktreeMerge: (cwd: string, branch: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:worktreeMerge', { cwd, branch }),
    worktreeRemove: (cwd: string, worktreePath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:worktreeRemove', { cwd, worktreePath })
  },
  mcp: {
    list: (cwd: string) => ipcRenderer.invoke('mcp:list', { cwd })
  },
  hooks: {
    read: (scope: string, cwd: string) => ipcRenderer.invoke('hooks:read', { scope, cwd }),
    write: (scope: string, hooks: unknown, cwd: string) =>
      ipcRenderer.invoke('hooks:write', { scope, hooks, cwd })
  },
  workflow: {
    list: () => ipcRenderer.invoke('workflow:list'),
    load: (id: string) => ipcRenderer.invoke('workflow:load', { id }),
    save: (workflow: unknown) => ipcRenderer.invoke('workflow:save', { workflow }),
    delete: (id: string) => ipcRenderer.invoke('workflow:delete', { id }),
    run: (workflowId: string, cwd: string, inputValues?: Record<string, string>): Promise<{ executionId?: string; error?: string }> =>
      ipcRenderer.invoke('workflow:run', { workflowId, cwd, inputValues }),
    abort: (executionId: string) => ipcRenderer.invoke('workflow:abort', { executionId }),
    templates: () => ipcRenderer.invoke('workflow:templates'),
    reviewResponse: (executionId: string, nodeId: string, approved: boolean) =>
      ipcRenderer.invoke('workflow:review-response', { executionId, nodeId, approved }),
    listExecutions: (workflowId?: string) =>
      ipcRenderer.invoke('workflow:executions:list', { workflowId }),
    getExecution: (id: string) => ipcRenderer.invoke('workflow:executions:get', { id }),
    deleteExecution: (id: string) => ipcRenderer.invoke('workflow:executions:delete', { id }),
    exportWorkflow: (workflow: unknown): Promise<{ success?: boolean; canceled?: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('workflow:export', { workflow }),
    importWorkflow: (): Promise<{ success?: boolean; canceled?: boolean; workflow?: unknown; error?: string }> =>
      ipcRenderer.invoke('workflow:import'),
    onEvent: (callback: (event: unknown) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: unknown): void => callback(data)
      ipcRenderer.on('workflow:event', handler)
      return () => ipcRenderer.removeListener('workflow:event', handler)
    }
  },
  terminal: {
    spawn: (id: string, cwd: string): Promise<{ pid: number }> =>
      ipcRenderer.invoke('terminal:spawn', { id, cwd }),
    write: (id: string, data: string) =>
      ipcRenderer.invoke('terminal:write', { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
    kill: (id: string) =>
      ipcRenderer.invoke('terminal:kill', { id }),
    onData: (callback: (event: { id: string; data: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: { id: string; data: string }): void => callback(data)
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.removeListener('terminal:data', handler)
    },
    onExit: (callback: (event: { id: string; exitCode: number }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: { id: string; exitCode: number }): void => callback(data)
      ipcRenderer.on('terminal:exit', handler)
      return () => ipcRenderer.removeListener('terminal:exit', handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
