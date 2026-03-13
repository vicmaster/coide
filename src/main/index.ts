import { app, shell, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron'
import { join } from 'path'
import { readdir, readFile, mkdir, writeFile, rm } from 'fs/promises'
import { homedir, tmpdir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { runClaude, abortClaude, respondPermission } from './claude'
import { spawnTerminal, writeTerminal, resizeTerminal, killTerminal, killAllTerminals } from './terminal'
import { processFile, FILES_DIR } from './fileExtractor'
import { type CoideSettings, DEFAULT_SETTINGS } from '../shared/types'

type SkillInfo = { name: string; description: string; scope: 'global' | 'project'; filePath: string }

function parseSkillFrontmatter(content: string): { description: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { description: '', body: content }
  const yaml = match[1]
  const body = match[2]
  const descMatch = yaml.match(/^description:\s*(.+)$/m)
  return { description: descMatch ? descMatch[1].trim() : '', body }
}

async function scanSkillsDir(dir: string, scope: 'global' | 'project'): Promise<SkillInfo[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const skills: SkillInfo[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const filePath = join(dir, entry.name, 'SKILL.md')
      try {
        const content = await readFile(filePath, 'utf-8')
        const { description: fmDescription, body } = parseSkillFrontmatter(content)
        // Use frontmatter description, or fall back to first heading/line in body
        const description =
          fmDescription ||
          (body.split('\n').find((l) => l.trim()) ?? '').replace(/^#+\s*/, '').trim()
        skills.push({ name: entry.name, description, scope, filePath })
      } catch {
        // No SKILL.md in this folder, skip
      }
    }
    return skills
  } catch {
    return []
  }
}

let mainWindow: BrowserWindow | null = null
let currentSettings: CoideSettings = { ...DEFAULT_SETTINGS }

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    // DevTools: Cmd+Option+I in dev mode
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
  async (_event, { prompt, cwd, sessionId, coideSessionId }: { prompt: string; cwd: string; sessionId: string | null; coideSessionId: string }) => {
    if (!mainWindow) return null
    try {
      const newSessionId = await runClaude(prompt, cwd, sessionId, coideSessionId, mainWindow, currentSettings)
      return { sessionId: newSessionId }
    } catch (err) {
      return { error: String(err) }
    }
  }
)

ipcMain.handle('claude:abort', (_event, coideSessionId?: string) => {
  abortClaude(coideSessionId)
})

ipcMain.handle('claude:permission-response', (_event, { approved, coideSessionId }: { approved: boolean; coideSessionId?: string }) => {
  respondPermission(approved, coideSessionId)
})

ipcMain.handle('settings:sync', (_event, settings: Partial<CoideSettings>) => {
  currentSettings = { ...DEFAULT_SETTINGS, ...settings }
})

ipcMain.handle('dialog:pickFolder', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: app.getPath('home')
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:pickFile', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    defaultPath: app.getPath('home')
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle(
  'dialog:saveFile',
  async (_event, { defaultName, content }: { defaultName: string; content: string }) => {
    if (!mainWindow) return { error: 'No window' }
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    try {
      await writeFile(result.filePath, content, 'utf-8')
      return { success: true }
    } catch (err) {
      return { error: String(err) }
    }
  }
)

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

ipcMain.handle('fs:readFile', async (_event, { filePath }: { filePath: string }) => {
  try {
    const content = await readFile(filePath, 'utf-8')
    return { content }
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle(
  'fs:revertFile',
  async (_event, { filePath, originalContent }: { filePath: string; originalContent: string | null }) => {
    try {
      if (originalContent == null) {
        await rm(filePath, { force: true })
      } else {
        await writeFile(filePath, originalContent, 'utf-8')
      }
      return { success: true }
    } catch (err) {
      return { error: String(err) }
    }
  }
)

ipcMain.handle('skills:list', async (_event, { cwd }: { cwd: string }) => {
  const globalDir = join(homedir(), '.claude', 'skills')
  const projectDir = join(cwd, '.claude', 'skills')
  const [global, project] = await Promise.all([
    scanSkillsDir(globalDir, 'global'),
    scanSkillsDir(projectDir, 'project')
  ])
  return { global, project }
})

ipcMain.handle(
  'skills:write',
  async (
    _event,
    { scope, name, content, cwd }: { scope: 'global' | 'project'; name: string; content: string; cwd: string }
  ) => {
    try {
      if (!name || /[/\\\s]|\.\./.test(name)) {
        return { error: 'Invalid skill name. Use only letters, numbers, hyphens, and underscores.' }
      }
      const baseDir =
        scope === 'global'
          ? join(homedir(), '.claude', 'skills', name)
          : join(cwd, '.claude', 'skills', name)
      await mkdir(baseDir, { recursive: true })
      await writeFile(join(baseDir, 'SKILL.md'), content, 'utf-8')
      return { success: true }
    } catch (err) {
      return { error: String(err) }
    }
  }
)

ipcMain.handle('skills:delete', async (_event, { filePath }: { filePath: string }) => {
  try {
    await rm(join(filePath, '..'), { recursive: true, force: true })
    return { success: true }
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle('system:homedir', () => homedir())

ipcMain.handle('git:branch', async (_event, { cwd }: { cwd: string }) => {
  try {
    const { execFile } = await import('child_process')
    return new Promise<string>((resolve) => {
      execFile('git', ['branch', '--show-current'], { cwd }, (err, stdout) => {
        resolve(err ? '' : stdout.trim())
      })
    })
  } catch {
    return ''
  }
})

ipcMain.handle('claude:save-temp-file', async (_event, { base64, name }: { base64: string; name: string }) => {
  try {
    await mkdir(FILES_DIR, { recursive: true })
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`
    const filePath = join(FILES_DIR, filename)
    await writeFile(filePath, Buffer.from(base64, 'base64'))
    return filePath
  } catch {
    return null
  }
})

ipcMain.handle('claude:process-file', async (_event, { filePath }: { filePath: string }) => {
  try {
    return await processFile(filePath)
  } catch (err) {
    return { error: String((err as Error).message || err) }
  }
})

ipcMain.handle('dialog:pickFiles', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Supported', extensions: [
        'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'csv', 'txt',
        'md', 'json', 'yaml', 'yml', 'xml', 'html', 'htm',
        'log', 'env', 'toml', 'ini', 'cfg',
        'sh', 'py', 'js', 'ts', 'jsx', 'tsx', 'rb', 'go', 'rs', 'java',
        'c', 'cpp', 'h', 'hpp', 'css', 'scss', 'sql',
        'png', 'jpg', 'jpeg', 'gif', 'webp'
      ]},
      { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'csv', 'txt'] },
      { name: 'Code', extensions: ['py', 'js', 'ts', 'jsx', 'tsx', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'css', 'sql'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    defaultPath: app.getPath('home')
  })
  return result.canceled ? null : result.filePaths
})

ipcMain.handle('mcp:list', async (_event, { cwd }: { cwd: string }) => {
  type McpEntry = { name: string; command?: string; args?: string[]; url?: string; scope: 'global' | 'project' }
  const results: McpEntry[] = []

  // Global: ~/.claude/settings.json → mcpServers
  try {
    const raw = await readFile(join(homedir(), '.claude', 'settings.json'), 'utf-8')
    const json = JSON.parse(raw)
    const servers = json.mcpServers ?? {}
    for (const [name, cfg] of Object.entries(servers) as [string, Record<string, unknown>][]) {
      results.push({ name, command: cfg.command as string | undefined, args: cfg.args as string[] | undefined, url: cfg.url as string | undefined, scope: 'global' })
    }
  } catch {
    // no global settings
  }

  // Project: <cwd>/.mcp.json → mcpServers
  try {
    const raw = await readFile(join(cwd, '.mcp.json'), 'utf-8')
    const json = JSON.parse(raw)
    const servers = json.mcpServers ?? {}
    for (const [name, cfg] of Object.entries(servers) as [string, Record<string, unknown>][]) {
      results.push({ name, command: cfg.command as string | undefined, args: cfg.args as string[] | undefined, url: cfg.url as string | undefined, scope: 'project' })
    }
  } catch {
    // no project mcp config
  }

  return results
})

ipcMain.handle(
  'hooks:read',
  async (_event, { scope, cwd }: { scope: 'global' | 'project'; cwd: string }) => {
    const filePath =
      scope === 'global'
        ? join(homedir(), '.claude', 'settings.json')
        : join(cwd, '.claude', 'settings.json')
    try {
      const raw = await readFile(filePath, 'utf-8')
      const json = JSON.parse(raw)
      return { hooks: json.hooks ?? {} }
    } catch {
      return { hooks: {} }
    }
  }
)

ipcMain.handle(
  'hooks:write',
  async (
    _event,
    { scope, hooks, cwd }: { scope: 'global' | 'project'; hooks: Record<string, unknown>; cwd: string }
  ) => {
    const dir =
      scope === 'global' ? join(homedir(), '.claude') : join(cwd, '.claude')
    const filePath = join(dir, 'settings.json')
    try {
      await mkdir(dir, { recursive: true })
      let json: Record<string, unknown> = {}
      try {
        json = JSON.parse(await readFile(filePath, 'utf-8'))
      } catch {
        // file doesn't exist yet
      }
      if (Object.keys(hooks).length === 0) {
        delete json.hooks
      } else {
        json.hooks = hooks
      }
      await writeFile(filePath, JSON.stringify(json, null, 2) + '\n', 'utf-8')
      return { success: true }
    } catch (err) {
      return { error: String(err) }
    }
  }
)

// Terminal IPC handlers
ipcMain.handle(
  'terminal:spawn',
  (_event, { id, cwd }: { id: string; cwd: string }) => {
    if (!mainWindow) return { error: 'No window' }
    return spawnTerminal(id, cwd, mainWindow)
  }
)

ipcMain.handle('terminal:write', (_event, { id, data }: { id: string; data: string }) => {
  writeTerminal(id, data)
})

ipcMain.handle('terminal:resize', (_event, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
  resizeTerminal(id, cols, rows)
})

ipcMain.handle('terminal:kill', (_event, { id }: { id: string }) => {
  killTerminal(id)
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.coide')
  if (process.platform === 'darwin') {
    const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
    app.dock.setIcon(icon)
  }
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  killAllTerminals()
  rm(IMAGES_DIR, { recursive: true, force: true }).catch(() => {})
  rm(FILES_DIR, { recursive: true, force: true }).catch(() => {})
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
