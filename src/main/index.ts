import { app, shell, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron'
import { join } from 'path'
import { readdir, readFile, mkdir, writeFile, rm } from 'fs/promises'
import { homedir, tmpdir } from 'os'
import { execFile as execFileImported } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { runClaude, abortClaude, respondPermission, resolveClaudeBinary } from './claude'
import { spawnTerminal, writeTerminal, resizeTerminal, killTerminal, killAllTerminals } from './terminal'
import { processFile, FILES_DIR } from './fileExtractor'
import { type CoideSettings, DEFAULT_SETTINGS } from '../shared/types'
import type { WorkflowDefinition } from '../shared/workflow-types'
import {
  listWorkflows,
  loadWorkflow,
  saveWorkflow,
  deleteWorkflow,
  getBuiltInTemplates,
  listExecutionRecords,
  loadExecutionRecord,
  deleteExecutionRecord
} from './workflowStore'
import { executeWorkflow, abortWorkflow, respondToReview } from './workflow'

type SkillInfo = { name: string; description: string; scope: 'global' | 'project'; filePath: string }
type AgentInfo = { name: string; description: string; scope: 'global' | 'project' }

async function scanAgentsDir(dir: string, scope: 'global' | 'project'): Promise<AgentInfo[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const agents: AgentInfo[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const name = entry.name.replace(/\.md$/, '')
      try {
        const content = await readFile(join(dir, entry.name), 'utf-8')
        const { description } = parseSkillFrontmatter(content)
        agents.push({ name, description, scope })
      } catch {
        agents.push({ name, description: '', scope })
      }
    }
    return agents
  } catch {
    return []
  }
}

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
  async (_event, { prompt, cwd, sessionId, coideSessionId, worktreeName }: { prompt: string; cwd: string; sessionId: string | null; coideSessionId: string; worktreeName?: string }) => {
    if (!mainWindow) return null
    try {
      const newSessionId = await runClaude(prompt, cwd, sessionId, coideSessionId, mainWindow, currentSettings, worktreeName)
      return { sessionId: newSessionId }
    } catch (err) {
      return { error: String(err) }
    }
  }
)

ipcMain.handle('claude:abort', (_event, coideSessionId?: string) => {
  abortClaude(coideSessionId)
})

ipcMain.handle('claude:check-binary', async (_event, { customPath }: { customPath?: string }) => {
  const binary = resolveClaudeBinary(customPath || currentSettings.claudeBinaryPath)
  try {
    const version = await new Promise<string>((resolve, reject) => {
      execFileImported(binary, ['--version'], { timeout: 5000 }, (err, stdout) => {
        if (err) reject(err)
        else resolve(stdout.trim())
      })
    })
    return { found: true, path: binary, version }
  } catch {
    return { found: false, path: binary }
  }
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

// Cache dir creation — only mkdir once per directory
const ensuredDirs = new Set<string>()
async function ensureDir(dir: string): Promise<void> {
  if (ensuredDirs.has(dir)) return
  await mkdir(dir, { recursive: true })
  ensuredDirs.add(dir)
}

ipcMain.handle(
  'claude:save-image',
  async (_event, { base64, mediaType }: { base64: string; mediaType: string }) => {
    const ext = EXT_MAP[mediaType] ?? 'png'
    await ensureDir(IMAGES_DIR)
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

ipcMain.handle('agents:list', async (_event, { cwd }: { cwd: string }) => {
  const globalDir = join(homedir(), '.claude', 'agents')
  const projectDir = join(cwd, '.claude', 'agents')
  const [global, project] = await Promise.all([
    scanAgentsDir(globalDir, 'global'),
    scanAgentsDir(projectDir, 'project')
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

ipcMain.handle('fs:listFiles', async (_event, { cwd, query }: { cwd: string; query: string }) => {
  try {
    // Use git ls-files for tracked files, fall back to shallow readdir
    const files = await new Promise<string[]>((resolve) => {
      execFileImported('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd, maxBuffer: 1024 * 1024 * 2, timeout: 5000 }, (err, stdout) => {
        if (err) {
          // Fallback: top-level readdir only (no recursive traversal)
          readdir(cwd).then(
            (entries) => resolve(entries.map(String).slice(0, 500)),
            () => resolve([])
          )
          return
        }
        resolve(stdout.split('\n').filter(Boolean))
      })
    })

    const q = query.toLowerCase()
    const results: { path: string; type: 'file' | 'folder' }[] = []
    const seenFolders = new Set<string>()

    for (const file of files) {
      if (results.length >= 15) break
      const lower = file.toLowerCase()
      // Match against filename or full path
      if (!lower.includes(q)) continue

      // Add parent folders that match
      const parts = file.split('/')
      for (let i = 1; i < parts.length; i++) {
        const folder = parts.slice(0, i).join('/') + '/'
        if (!seenFolders.has(folder) && folder.toLowerCase().includes(q)) {
          seenFolders.add(folder)
          if (results.length < 15) results.push({ path: folder, type: 'folder' })
        }
      }
      results.push({ path: file, type: 'file' })
    }

    return results.slice(0, 15)
  } catch {
    return []
  }
})

ipcMain.handle('system:homedir', () => homedir())

ipcMain.handle('git:branch', async (_event, { cwd }: { cwd: string }) => {
  try {
    return new Promise<string>((resolve) => {
      execFileImported('git', ['branch', '--show-current'], { cwd, timeout: 3000 }, (err, stdout) => {
        resolve(err ? '' : stdout.trim())
      })
    })
  } catch {
    return ''
  }
})

ipcMain.handle('git:isRepo', async (_event, { cwd }: { cwd: string }) => {
  try {
    return new Promise<boolean>((resolve) => {
      execFileImported('git', ['rev-parse', '--is-inside-work-tree'], { cwd, timeout: 3000 }, (err) => {
        resolve(!err)
      })
    })
  } catch {
    return false
  }
})

ipcMain.handle('git:worktreeCreate', async (_event, { cwd, branch }: { cwd: string; branch: string }) => {
  try {
    const worktreePath = join(cwd, '..', `.coide-worktree-${branch.replace(/[^a-zA-Z0-9-_]/g, '-')}`)
    return new Promise<{ path: string; branch: string; error?: string }>((resolve) => {
      execFileImported('git', ['worktree', 'add', '-b', branch, worktreePath], { cwd, timeout: 10000 }, (err) => {
        if (err) {
          // Branch may already exist, try without -b
          execFileImported('git', ['worktree', 'add', worktreePath, branch], { cwd, timeout: 10000 }, (err2) => {
            if (err2) resolve({ path: '', branch, error: String(err2) })
            else resolve({ path: worktreePath, branch })
          })
        } else {
          resolve({ path: worktreePath, branch })
        }
      })
    })
  } catch (err) {
    return { path: '', branch, error: String(err) }
  }
})

ipcMain.handle('git:worktreeMerge', async (_event, { cwd, branch }: { cwd: string; branch: string }) => {
  try {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      execFileImported('git', ['merge', branch], { cwd, timeout: 15000 }, (err, stdout, stderr) => {
        if (err) resolve({ success: false, error: stderr || String(err) })
        else resolve({ success: true })
      })
    })
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('git:worktreeRemove', async (_event, { cwd, worktreePath }: { cwd: string; worktreePath: string }) => {
  try {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      execFileImported('git', ['worktree', 'remove', worktreePath, '--force'], { cwd, timeout: 10000 }, (err) => {
        if (err) resolve({ success: false, error: String(err) })
        else resolve({ success: true })
      })
    })
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('claude:save-temp-file', async (_event, { base64, name }: { base64: string; name: string }) => {
  try {
    await ensureDir(FILES_DIR)
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

  // Read all config files in parallel
  const [globalRaw, localRaw, projectRaw] = await Promise.all([
    readFile(join(homedir(), '.claude', 'settings.json'), 'utf-8').catch(() => null),
    readFile(join(homedir(), '.claude.json'), 'utf-8').catch(() => null),
    readFile(join(cwd, '.mcp.json'), 'utf-8').catch(() => null)
  ])

  const parseServers = (raw: string | null, scope: 'global' | 'project', key = 'mcpServers'): void => {
    if (!raw) return
    try {
      const json = JSON.parse(raw)
      const servers = json[key] ?? {}
      for (const [name, cfg] of Object.entries(servers) as [string, Record<string, unknown>][]) {
        if (!results.some((r) => r.name === name)) {
          results.push({ name, command: cfg.command as string | undefined, args: cfg.args as string[] | undefined, url: cfg.url as string | undefined, scope })
        }
      }
    } catch { /* invalid JSON */ }
  }

  // Global: ~/.claude/settings.json → mcpServers
  parseServers(globalRaw, 'global')

  // Local: ~/.claude.json → mcpServers
  parseServers(localRaw, 'global')

  // Per-project servers in ~/.claude.json → projects[cwd].mcpServers
  if (localRaw) {
    try {
      const json = JSON.parse(localRaw)
      const projects = json.projects ?? {}
      for (const [projPath, projCfg] of Object.entries(projects) as [string, Record<string, unknown>][]) {
        if (cwd.startsWith(projPath)) {
          const projServers = (projCfg.mcpServers ?? {}) as Record<string, Record<string, unknown>>
          for (const [name, cfg] of Object.entries(projServers)) {
            if (!results.some((r) => r.name === name)) {
              results.push({ name, command: cfg.command as string | undefined, args: cfg.args as string[] | undefined, url: cfg.url as string | undefined, scope: 'project' })
            }
          }
        }
      }
    } catch { /* */ }
  }

  // Project: <cwd>/.mcp.json → mcpServers
  parseServers(projectRaw, 'project')

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

// Workflow IPC handlers
ipcMain.handle('workflow:list', async () => {
  return listWorkflows()
})

ipcMain.handle('workflow:load', async (_event, { id }: { id: string }) => {
  return loadWorkflow(id)
})

ipcMain.handle('workflow:save', async (_event, { workflow }: { workflow: WorkflowDefinition }) => {
  await saveWorkflow(workflow)
  return { success: true }
})

ipcMain.handle('workflow:delete', async (_event, { id }: { id: string }) => {
  await deleteWorkflow(id)
  return { success: true }
})

ipcMain.handle('workflow:templates', () => {
  return getBuiltInTemplates()
})

ipcMain.handle('workflow:run', async (_event, { workflowId, cwd, inputValues }: { workflowId: string; cwd: string; inputValues?: Record<string, string> }) => {
  if (!mainWindow) return { error: 'No window' }
  try {
    const executionId = await executeWorkflow(workflowId, cwd, mainWindow, currentSettings, inputValues)
    return { executionId }
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle('workflow:abort', (_event, { executionId }: { executionId: string }) => {
  abortWorkflow(executionId)
  return { success: true }
})

ipcMain.handle(
  'workflow:review-response',
  (_event, { executionId, nodeId, approved }: { executionId: string; nodeId: string; approved: boolean }) => {
    return respondToReview(executionId, nodeId, approved)
  }
)

ipcMain.handle(
  'workflow:executions:list',
  async (_event, { workflowId }: { workflowId?: string }) => {
    return listExecutionRecords(workflowId)
  }
)

ipcMain.handle('workflow:executions:get', async (_event, { id }: { id: string }) => {
  return loadExecutionRecord(id)
})

ipcMain.handle('workflow:executions:delete', async (_event, { id }: { id: string }) => {
  await deleteExecutionRecord(id)
  return { success: true }
})

ipcMain.handle(
  'workflow:export',
  async (_event, { workflow }: { workflow: WorkflowDefinition }) => {
    const result = await dialog.showSaveDialog({
      title: 'Export Workflow',
      defaultPath: `${workflow.name.replace(/[^a-z0-9_-]/gi, '_') || 'workflow'}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    try {
      await writeFile(result.filePath, JSON.stringify(workflow, null, 2), 'utf-8')
      return { success: true, path: result.filePath }
    } catch (err) {
      return { error: String(err) }
    }
  }
)

ipcMain.handle('workflow:import', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Import Workflow',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return { canceled: true }
  try {
    const raw = await readFile(result.filePaths[0], 'utf-8')
    const parsed = JSON.parse(raw) as WorkflowDefinition
    if (!parsed.id || !parsed.nodes || !parsed.edges) {
      return { error: 'Invalid workflow file — missing id, nodes, or edges' }
    }
    // Assign a fresh id so it doesn't clobber an existing workflow
    parsed.id = `wf-imported-${Date.now()}`
    parsed.isTemplate = false
    parsed.createdAt = Date.now()
    parsed.updatedAt = Date.now()
    await saveWorkflow(parsed)
    return { success: true, workflow: parsed }
  } catch (err) {
    return { error: String(err) }
  }
})

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
