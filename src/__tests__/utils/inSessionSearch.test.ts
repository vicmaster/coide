import { describe, it, expect } from 'vitest'
import { findMatches, getSearchableText } from '../../renderer/src/utils/inSessionSearch'
import type { Message, TextMessage, ToolCallMessage } from '../../renderer/src/store/sessions'

const userMsg = (id: string, text: string): TextMessage => ({ id, role: 'user', text })
const assistantMsg = (id: string, text: string): TextMessage => ({ id, role: 'assistant', text })
const toolMsg = (id: string, toolName: string, input: Record<string, unknown>, result?: string): ToolCallMessage => ({
  id,
  role: 'tool_call',
  tool_id: id,
  tool_name: toolName,
  input,
  result
})

describe('getSearchableText', () => {
  it('returns text for user/assistant messages', () => {
    expect(getSearchableText(userMsg('1', 'hello world'))).toBe('hello world')
    expect(getSearchableText(assistantMsg('2', 'response'))).toBe('response')
  })

  it('returns combined fields for tool calls', () => {
    const msg = toolMsg('1', 'Bash', { command: 'npm test' }, 'PASS')
    const text = getSearchableText(msg)
    expect(text).toContain('Bash')
    expect(text).toContain('npm test')
    expect(text).toContain('PASS')
  })

  it('includes file_path and content for file tools', () => {
    const msg = toolMsg('1', 'Write', { file_path: '/src/app.ts', content: 'export default 42' })
    const text = getSearchableText(msg)
    expect(text).toContain('/src/app.ts')
    expect(text).toContain('export default 42')
  })
})

describe('findMatches', () => {
  it('returns empty for empty query', () => {
    expect(findMatches([userMsg('1', 'hello')], '')).toEqual([])
    expect(findMatches([userMsg('1', 'hello')], '   ')).toEqual([])
  })

  it('finds matches in user messages', () => {
    const messages: Message[] = [userMsg('1', 'hello world')]
    const matches = findMatches(messages, 'hello')
    expect(matches).toHaveLength(1)
    expect(matches[0]).toEqual({ messageId: '1', charIndex: 0, length: 5 })
  })

  it('finds multiple matches in one message', () => {
    const messages: Message[] = [userMsg('1', 'test foo test bar test')]
    const matches = findMatches(messages, 'test')
    expect(matches).toHaveLength(3)
    expect(matches[0].charIndex).toBe(0)
    expect(matches[1].charIndex).toBe(9)
    expect(matches[2].charIndex).toBe(18)
  })

  it('is case insensitive', () => {
    const messages: Message[] = [userMsg('1', 'Hello World')]
    expect(findMatches(messages, 'hello')).toHaveLength(1)
    expect(findMatches(messages, 'WORLD')).toHaveLength(1)
  })

  it('finds matches across multiple messages', () => {
    const messages: Message[] = [
      userMsg('1', 'fix the bug'),
      assistantMsg('2', 'I found the bug in auth.ts')
    ]
    const matches = findMatches(messages, 'bug')
    expect(matches).toHaveLength(2)
    expect(matches[0].messageId).toBe('1')
    expect(matches[1].messageId).toBe('2')
  })

  it('searches tool call content', () => {
    const messages: Message[] = [
      toolMsg('1', 'Read', { file_path: '/src/auth.ts' }, 'function login() {}')
    ]
    const matches = findMatches(messages, 'auth')
    expect(matches).toHaveLength(1)
  })
})
