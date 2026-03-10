import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  claude: {
    query: (prompt: string, cwd: string, sessionId: string | null, coideSessionId: string) =>
      ipcRenderer.invoke('claude:query', { prompt, cwd, sessionId, coideSessionId }),

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
      ipcRenderer.invoke('claude:save-temp-file', { base64, name })
  },
  dialog: {
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder'),
    pickFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFile'),
    pickFiles: (): Promise<string[] | null> => ipcRenderer.invoke('dialog:pickFiles'),
    saveFile: (defaultName: string, content: string): Promise<{ success?: boolean; canceled?: boolean; error?: string }> =>
      ipcRenderer.invoke('dialog:saveFile', { defaultName, content })
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
      ipcRenderer.invoke('fs:revertFile', { filePath, originalContent })
  },
  system: {
    homedir: (): Promise<string> => ipcRenderer.invoke('system:homedir')
  },
  mcp: {
    list: (cwd: string) => ipcRenderer.invoke('mcp:list', { cwd })
  },
  hooks: {
    read: (scope: string, cwd: string) => ipcRenderer.invoke('hooks:read', { scope, cwd }),
    write: (scope: string, hooks: unknown, cwd: string) =>
      ipcRenderer.invoke('hooks:write', { scope, hooks, cwd })
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
