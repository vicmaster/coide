import type { Message, ToolCallMessage } from '../store/sessions'

export type FileStatus = 'created' | 'modified' | 'read'

export type FileChangelogEntry = {
  filePath: string
  status: FileStatus
  firstOriginalContent: string | null
  editCount: number
}

const WRITE_TOOLS = new Set(['Edit', 'Write'])
const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'Glob', 'Grep'])

export function buildFileChangelog(messages: Message[]): FileChangelogEntry[] {
  const entries = new Map<string, FileChangelogEntry>()

  for (const msg of messages) {
    if (msg.role !== 'tool_call') continue
    const tc = msg as ToolCallMessage
    if (tc.denied) continue
    if (!FILE_TOOLS.has(tc.tool_name)) continue

    const fp = tc.input?.file_path ?? tc.input?.path
    if (typeof fp !== 'string' || !fp) continue

    const existing = entries.get(fp)

    if (WRITE_TOOLS.has(tc.tool_name)) {
      if (existing) {
        existing.editCount++
        if (existing.status === 'read') {
          existing.status = tc.originalContent == null ? 'created' : 'modified'
          existing.firstOriginalContent = tc.originalContent ?? null
        }
      } else {
        entries.set(fp, {
          filePath: fp,
          status: tc.originalContent == null ? 'created' : 'modified',
          firstOriginalContent: tc.originalContent ?? null,
          editCount: 1
        })
      }
    } else if (!existing) {
      entries.set(fp, {
        filePath: fp,
        status: 'read',
        firstOriginalContent: null,
        editCount: 0
      })
    }
  }

  const statusOrder: Record<FileStatus, number> = { created: 0, modified: 1, read: 2 }
  return Array.from(entries.values()).sort((a, b) => {
    const so = statusOrder[a.status] - statusOrder[b.status]
    if (so !== 0) return so
    return a.filePath.localeCompare(b.filePath)
  })
}
