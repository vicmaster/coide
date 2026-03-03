import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  claude: {
    query: (prompt: string, cwd: string, sessionId: string | null) =>
      ipcRenderer.invoke('claude:query', { prompt, cwd, sessionId }),

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

    respondPermission: (approved: boolean) =>
      ipcRenderer.invoke('claude:permission-response', approved),

    abort: () => ipcRenderer.invoke('claude:abort'),

    saveImage: (base64: string, mediaType: string): Promise<string> =>
      ipcRenderer.invoke('claude:save-image', { base64, mediaType })
  },
  dialog: {
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder')
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
