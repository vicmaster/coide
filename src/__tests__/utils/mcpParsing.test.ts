import { describe, it, expect } from 'vitest'
import { parseMcpFromInit } from '../../renderer/src/utils/mcpParsing'

describe('parseMcpFromInit', () => {
  it('parses simple server names and maps tools', () => {
    const result = parseMcpFromInit(
      [
        { name: 'context7', status: 'connected' },
        { name: 'canvas-mcp', status: 'failed' }
      ],
      [
        'Bash',
        'Read',
        'mcp__context7__resolve-library-id',
        'mcp__context7__query-docs',
        'mcp__canvas-mcp__canvas_create'
      ]
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      name: 'context7',
      status: 'connected',
      tools: ['resolve-library-id', 'query-docs']
    })
    expect(result[1]).toEqual({
      name: 'canvas-mcp',
      status: 'failed',
      tools: ['canvas_create']
    })
  })

  it('handles server names with spaces and dots (e.g. claude.ai integrations)', () => {
    const result = parseMcpFromInit(
      [
        { name: 'claude.ai Slack', status: 'connected' },
        { name: 'claude.ai Gmail', status: 'pending' }
      ],
      [
        'mcp__claude_ai_Slack__slack_send_message',
        'mcp__claude_ai_Slack__slack_read_channel',
        'mcp__claude_ai_Gmail__gmail_search_messages'
      ]
    )
    expect(result[0].name).toBe('claude.ai Slack')
    expect(result[0].tools).toEqual(['slack_send_message', 'slack_read_channel'])
    expect(result[1].tools).toEqual(['gmail_search_messages'])
  })

  it('returns empty tools for servers with no matching tools', () => {
    const result = parseMcpFromInit(
      [{ name: 'unknown-server', status: 'failed' }],
      ['Bash', 'Read', 'mcp__other__tool']
    )
    expect(result[0].tools).toEqual([])
  })

  it('ignores non-MCP tools in the tools list', () => {
    const result = parseMcpFromInit(
      [{ name: 'ctx', status: 'connected' }],
      ['Bash', 'Read', 'Edit', 'Grep', 'Glob', 'mcp__ctx__search']
    )
    expect(result[0].tools).toEqual(['search'])
  })

  it('handles empty inputs', () => {
    expect(parseMcpFromInit([], [])).toEqual([])
    expect(parseMcpFromInit([], ['mcp__foo__bar'])).toEqual([])
  })

  it('preserves status values', () => {
    const result = parseMcpFromInit(
      [
        { name: 'a', status: 'connected' },
        { name: 'b', status: 'failed' },
        { name: 'c', status: 'pending' }
      ],
      []
    )
    expect(result.map((s) => s.status)).toEqual(['connected', 'failed', 'pending'])
  })
})
