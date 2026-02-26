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

    abort: () => ipcRenderer.invoke('claude:abort')
  },
  dialog: {
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder')
  },
  skills: {
    list: (cwd: string) => ipcRenderer.invoke('skills:list', { cwd })
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
