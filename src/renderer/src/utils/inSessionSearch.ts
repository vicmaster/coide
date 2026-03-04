import type { Message, TextMessage, ToolCallMessage } from '../store/sessions'

export interface SearchMatch {
  messageId: string
  charIndex: number
  length: number
}

export function getSearchableText(msg: Message): string {
  if (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'error') {
    return (msg as TextMessage).text ?? ''
  }
  if (msg.role === 'tool_call') {
    const tc = msg as ToolCallMessage
    const inp = tc.input as Record<string, unknown>
    const parts = [tc.tool_name]
    if (inp.command) parts.push(String(inp.command))
    if (inp.file_path) parts.push(String(inp.file_path))
    if (inp.content) parts.push(String(inp.content))
    if (tc.result) parts.push(tc.result)
    return parts.join(' ')
  }
  return ''
}

export function findMatches(messages: Message[], query: string): SearchMatch[] {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  const matches: SearchMatch[] = []

  for (const msg of messages) {
    const text = getSearchableText(msg).toLowerCase()
    let startIndex = 0
    while (true) {
      const idx = text.indexOf(q, startIndex)
      if (idx === -1) break
      matches.push({ messageId: msg.id, charIndex: idx, length: query.length })
      startIndex = idx + 1
    }
  }

  return matches
}
