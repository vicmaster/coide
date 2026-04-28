import { readFile, readdir, writeFile, mkdir, stat, unlink } from 'fs/promises'
import { join, dirname, basename } from 'path'
import { homedir } from 'os'

export type MemorySource = 'project-memory' | 'global-claude' | 'project-claude' | 'subagent-claude'
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference' | undefined

export interface MemoryFile {
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

export interface MemoryListResult {
  projectMemoryDir: string
  files: MemoryFile[]
}

function encodeProjectDir(cwd: string): string {
  return cwd.replace(/\//g, '-')
}

export function projectMemoryDir(cwd: string): string {
  return join(homedir(), '.claude', 'projects', encodeProjectDir(cwd), 'memory')
}

export function parseFrontmatter(content: string): {
  description: string
  memoryType?: MemoryType
} {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return { description: '' }
  const yaml = match[1]
  const descMatch = yaml.match(/^description:\s*(.+)$/m)
  const typeMatch = yaml.match(/^type:\s*(.+)$/m)
  const rawType = typeMatch?.[1].trim().toLowerCase()
  const memoryType =
    rawType === 'user' || rawType === 'feedback' || rawType === 'project' || rawType === 'reference'
      ? (rawType as MemoryType)
      : undefined
  return {
    description: descMatch ? descMatch[1].trim() : '',
    memoryType
  }
}

async function statSafe(filePath: string): Promise<{ size?: number; mtime?: number; exists: boolean }> {
  try {
    const s = await stat(filePath)
    return { size: s.size, mtime: s.mtimeMs, exists: true }
  } catch {
    return { exists: false }
  }
}

async function buildMemoryFile(
  filePath: string,
  source: MemorySource,
  name: string,
  options: { isIndex?: boolean; readFrontmatter?: boolean } = {}
): Promise<MemoryFile> {
  const { exists, size, mtime } = await statSafe(filePath)
  const file: MemoryFile = {
    filePath,
    source,
    name,
    exists,
    size,
    mtime,
    isIndex: options.isIndex
  }
  if (exists && options.readFrontmatter) {
    try {
      const content = await readFile(filePath, 'utf-8')
      const { description, memoryType } = parseFrontmatter(content)
      if (description) file.description = description
      if (memoryType) file.memoryType = memoryType
    } catch {
      // ignore parse errors
    }
  }
  return file
}

export async function listMemoryFiles(cwd: string): Promise<MemoryListResult> {
  const memDir = projectMemoryDir(cwd)
  const files: MemoryFile[] = []

  // Project memory directory
  try {
    const entries = await readdir(memDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const filePath = join(memDir, entry.name)
      const isIndex = entry.name === 'MEMORY.md'
      files.push(
        await buildMemoryFile(filePath, 'project-memory', entry.name, {
          isIndex,
          readFrontmatter: !isIndex
        })
      )
    }
  } catch {
    // memory dir doesn't exist yet — that's fine
  }

  // Global CLAUDE.md
  files.push(
    await buildMemoryFile(join(homedir(), '.claude', 'CLAUDE.md'), 'global-claude', 'Global CLAUDE.md')
  )

  // Project CLAUDE.md
  files.push(await buildMemoryFile(join(cwd, 'CLAUDE.md'), 'project-claude', 'Project CLAUDE.md'))

  // Subagent CLAUDE.md files (one per agent)
  const agentsDir = join(cwd, '.claude', 'agents')
  try {
    const agentEntries = await readdir(agentsDir, { withFileTypes: true })
    for (const entry of agentEntries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const agentName = entry.name.replace(/\.md$/, '')
      files.push(
        await buildMemoryFile(join(agentsDir, entry.name), 'subagent-claude', agentName)
      )
    }
  } catch {
    // no subagents — that's fine
  }

  return { projectMemoryDir: memDir, files }
}

const ALLOWED_DIRS = (cwd: string): string[] => [
  projectMemoryDir(cwd),
  join(homedir(), '.claude'),
  cwd
]

function isPathAllowed(filePath: string, cwd: string): boolean {
  const allowed = ALLOWED_DIRS(cwd)
  return allowed.some((dir) => filePath === dir || filePath.startsWith(dir + '/'))
}

export async function readMemoryFile(filePath: string, cwd: string): Promise<string> {
  if (!isPathAllowed(filePath, cwd)) {
    throw new Error('Path not allowed')
  }
  return readFile(filePath, 'utf-8')
}

export async function writeMemoryFile(
  filePath: string,
  content: string,
  cwd: string
): Promise<void> {
  if (!isPathAllowed(filePath, cwd)) {
    throw new Error('Path not allowed')
  }
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf-8')
}

export async function deleteMemoryFile(filePath: string, cwd: string): Promise<void> {
  if (!isPathAllowed(filePath, cwd)) {
    throw new Error('Path not allowed')
  }
  // Don't allow deleting CLAUDE.md anchors via this method — only memory entries
  const base = basename(filePath)
  if (base === 'CLAUDE.md' || base === 'MEMORY.md') {
    throw new Error('Cannot delete anchor files via this API')
  }
  await unlink(filePath)
}
