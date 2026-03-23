import type { McpServerInfo } from '../store/sessions'

export function parseMcpFromInit(
  mcpServers: { name: string; status: string }[],
  tools: string[]
): McpServerInfo[] {
  const toolsByServer = new Map<string, string[]>()
  for (const t of tools) {
    const match = t.match(/^mcp__(.+?)__(.+)$/)
    if (match) {
      const arr = toolsByServer.get(match[1]) ?? []
      arr.push(match[2])
      toolsByServer.set(match[1], arr)
    }
  }
  return mcpServers.map((s) => ({
    name: s.name,
    status: s.status as 'connected' | 'failed' | 'pending',
    tools: toolsByServer.get(s.name.replace(/[\s.]/g, '_')) ?? []
  }))
}
