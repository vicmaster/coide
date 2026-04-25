import type { ToolCallMessage } from '../store/sessions'

/** Compact display name. mcp__<server>__<function> → <server>:<function> */
export function formatToolName(name: string): string {
  const m = name.match(/^mcp__(.+?)__(.+)$/)
  return m ? `${m[1]}:${m[2]}` : name
}

/** One-line label for a single tool call */
export function inlineLabel(name: string, input: Record<string, unknown>, done: boolean): string {
  const verb = done ? pastTense(name) : presentTense(name)
  const detail = toolDetail(name, input)
  return detail ? `${verb}  ${detail}` : verb
}

function pastTense(name: string): string {
  switch (name) {
    case 'Read': return 'Read'
    case 'Write': return 'Wrote'
    case 'Edit': return 'Edited'
    case 'Bash': return 'Ran'
    case 'Glob': return 'Glob'
    case 'Grep': return 'Search'
    case 'WebFetch': return 'Fetched'
    case 'WebSearch': return 'Searched'
    case 'TodoWrite': return 'Updated todos'
    case 'Task': return 'Task'
    case 'Agent': return 'Agent'
    default: return name
  }
}

function presentTense(name: string): string {
  switch (name) {
    case 'Read': return 'Reading'
    case 'Write': return 'Writing'
    case 'Edit': return 'Editing'
    case 'Bash': return 'Running'
    case 'Glob': return 'Globbing'
    case 'Grep': return 'Searching'
    case 'WebFetch': return 'Fetching'
    case 'WebSearch': return 'Searching'
    case 'TodoWrite': return 'Updating todos'
    case 'Task': return 'Task'
    case 'Agent': return 'Agent'
    default: return name
  }
}

function toolDetail(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Bash': return String(input.command ?? '').split('\n')[0].slice(0, 72)
    case 'Read':
    case 'Write':
    case 'Edit': return shortenPath(String(input.file_path ?? input.path ?? ''))
    case 'Glob': return String(input.pattern ?? '')
    case 'Grep': return `/${String(input.pattern ?? '')}/`
    case 'WebFetch':
    case 'WebSearch': return String(input.url ?? input.query ?? '').slice(0, 60)
    case 'Task':
    case 'Agent': return String(input.description ?? input.prompt ?? '').slice(0, 60)
    case 'TodoWrite': return ''
    default: {
      const first = Object.values(input)[0]
      return first != null ? String(first).slice(0, 50) : ''
    }
  }
}

function shortenPath(p: string): string {
  // Show last 3 segments for readability
  const parts = p.split('/')
  if (parts.length <= 3) return p
  return '…/' + parts.slice(-3).join('/')
}

/** Build a grouped summary like "Read 3 files, Edited 2 files" */
export function buildGroupSummary(messages: ToolCallMessage[]): string {
  if (messages.length === 1) {
    const m = messages[0]
    return inlineLabel(m.tool_name, m.input, m.result !== undefined)
  }

  const counts: Record<string, number> = {}
  for (const m of messages) {
    const key = m.tool_name
    counts[key] = (counts[key] ?? 0) + 1
  }

  const parts: string[] = []
  if (counts['Read']) parts.push(`Read ${counts['Read']} file${counts['Read'] > 1 ? 's' : ''}`)
  if (counts['Write']) parts.push(`Created ${counts['Write']} file${counts['Write'] > 1 ? 's' : ''}`)
  if (counts['Edit']) parts.push(`Edited ${counts['Edit']} file${counts['Edit'] > 1 ? 's' : ''}`)
  if (counts['Bash']) parts.push(`Ran ${counts['Bash']} command${counts['Bash'] > 1 ? 's' : ''}`)
  if (counts['Grep']) parts.push(`${counts['Grep']} search${counts['Grep'] > 1 ? 'es' : ''}`)
  if (counts['Glob']) parts.push(`${counts['Glob']} glob${counts['Glob'] > 1 ? 's' : ''}`)

  const todoKeys = ['TodoWrite', 'TodoRead', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet']
  const todos = todoKeys.reduce((sum, k) => sum + (counts[k] ?? 0), 0)
  if (todos > 0) parts.push('updated todo list')

  const known = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', ...todoKeys]
  const other = messages.length - known.reduce((sum, k) => sum + (counts[k] ?? 0), 0)
  if (other > 0) parts.push(`${other} other tool${other > 1 ? 's' : ''}`)

  return parts.join(', ')
}
