import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readdir, readFile, mkdir, writeFile, rm } from 'fs/promises'
import { homedir, tmpdir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { runClaude, abortClaude, respondPermission } from './claude'

type SkillInfo = { name: string; description: string; scope: 'global' | 'project'; filePath: string }

async function scanSkillsDir(dir: string, scope: 'global' | 'project'): Promise<SkillInfo[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const skills: SkillInfo[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const filePath = join(dir, entry.name)
      const content = await readFile(filePath, 'utf-8')
      const firstLine = content.split('\n').find((l) => l.trim()) ?? ''
      const description = firstLine.replace(/^#+\s*/, '').trim()
      const name = entry.name.replace(/\.md$/, '')
      skills.push({ name, description, scope, filePath })
    }
    return skills
  } catch {
    return []
  }
}

let mainWindow: BrowserWindow | null = null
let skipPermissions = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle(
  'claude:query',
  async (_event, { prompt, cwd, sessionId }: { prompt: string; cwd: string; sessionId: string | null }) => {
    if (!mainWindow) return null
    try {
      const newSessionId = await runClaude(prompt, cwd, sessionId, mainWindow, skipPermissions)
      return { sessionId: newSessionId }
    } catch (err) {
      return { error: String(err) }
    }
  }
)

ipcMain.handle('claude:abort', () => {
  abortClaude()
})

ipcMain.handle('claude:permission-response', (_event, approved: boolean) => {
  respondPermission(approved)
})

ipcMain.handle('settings:skip-permissions', (_event, value: boolean) => {
  skipPermissions = value
})

ipcMain.handle('dialog:pickFolder', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: app.getPath('home')
  })
  return result.canceled ? null : result.filePaths[0]
})

const IMAGES_DIR = join(tmpdir(), 'coide-images')
const EXT_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

ipcMain.handle(
  'claude:save-image',
  async (_event, { base64, mediaType }: { base64: string; mediaType: string }) => {
    const ext = EXT_MAP[mediaType] ?? 'png'
    await mkdir(IMAGES_DIR, { recursive: true })
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const filePath = join(IMAGES_DIR, filename)
    await writeFile(filePath, Buffer.from(base64, 'base64'))
    return filePath
  }
)

ipcMain.handle('skills:list', async (_event, { cwd }: { cwd: string }) => {
  const globalDir = join(homedir(), '.claude', 'commands')
  const projectDir = join(cwd, '.claude', 'commands')
  const [global, project] = await Promise.all([
    scanSkillsDir(globalDir, 'global'),
    scanSkillsDir(projectDir, 'project')
  ])
  return { global, project }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.coide')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  rm(IMAGES_DIR, { recursive: true, force: true }).catch(() => {})
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
