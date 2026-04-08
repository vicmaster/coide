import { describe, it, expect } from 'vitest'
import { inlineLabel, buildGroupSummary } from '../../renderer/src/utils/toolSummary'
import type { ToolCallMessage } from '../../renderer/src/store/sessions'

function makeTool(name: string, input: Record<string, unknown>, result?: string): ToolCallMessage {
  return {
    id: Math.random().toString(),
    role: 'tool_call',
    tool_id: 'tid',
    tool_name: name,
    input,
    result
  } as ToolCallMessage
}

describe('inlineLabel', () => {
  it('returns past tense with detail when done', () => {
    expect(inlineLabel('Read', { file_path: '/src/index.ts' }, true)).toBe('Read  /src/index.ts')
  })

  it('returns present tense when not done', () => {
    expect(inlineLabel('Read', { file_path: '/src/index.ts' }, false)).toBe('Reading  /src/index.ts')
  })

  it('handles Bash with command truncation', () => {
    const label = inlineLabel('Bash', { command: 'npm install react-query --save' }, true)
    expect(label).toBe('Ran  npm install react-query --save')
  })

  it('handles Edit with file path', () => {
    expect(inlineLabel('Edit', { file_path: '/a/b/c.ts' }, true)).toBe('Edited  …/a/b/c.ts')
  })

  it('handles Grep with pattern', () => {
    expect(inlineLabel('Grep', { pattern: 'TODO' }, true)).toBe('Search  /TODO/')
  })

  it('handles TodoWrite with no detail', () => {
    expect(inlineLabel('TodoWrite', {}, true)).toBe('Updated todos')
  })

  it('shortens long paths to last 3 segments', () => {
    const label = inlineLabel('Read', { file_path: '/Users/victor/Projects/coide/src/main/index.ts' }, true)
    expect(label).toContain('…/')
    expect(label).toContain('src/main/index.ts')
  })
})

describe('buildGroupSummary', () => {
  it('returns single tool label for one message', () => {
    const msgs = [makeTool('Read', { file_path: '/src/index.ts' }, 'content')]
    expect(buildGroupSummary(msgs)).toBe('Read  /src/index.ts')
  })

  it('groups multiple same-type tools', () => {
    const msgs = [
      makeTool('Read', { file_path: '/a.ts' }, 'ok'),
      makeTool('Read', { file_path: '/b.ts' }, 'ok'),
      makeTool('Read', { file_path: '/c.ts' }, 'ok')
    ]
    expect(buildGroupSummary(msgs)).toBe('Read 3 files')
  })

  it('groups mixed tool types', () => {
    const msgs = [
      makeTool('Read', { file_path: '/a.ts' }, 'ok'),
      makeTool('Edit', { file_path: '/b.ts' }, 'ok'),
      makeTool('Edit', { file_path: '/c.ts' }, 'ok'),
      makeTool('Bash', { command: 'npm test' }, 'ok')
    ]
    const summary = buildGroupSummary(msgs)
    expect(summary).toContain('Read 1 file')
    expect(summary).toContain('Edited 2 files')
    expect(summary).toContain('Ran 1 command')
  })

  it('handles todo tools', () => {
    const msgs = [
      makeTool('TodoWrite', {}, 'ok'),
      makeTool('TodoWrite', {}, 'ok')
    ]
    expect(buildGroupSummary(msgs)).toContain('updated todo list')
  })
})
