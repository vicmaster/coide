import { describe, it, expect } from 'vitest'
import { homedir } from 'os'
import { join } from 'path'
import { parseFrontmatter, projectMemoryDir } from '../../main/memory'

describe('parseFrontmatter', () => {
  it('returns empty description when no frontmatter', () => {
    expect(parseFrontmatter('# Just a heading\n')).toEqual({ description: '' })
  })

  it('extracts description from frontmatter', () => {
    const md = `---\nname: foo\ndescription: A test memory\ntype: feedback\n---\n\nbody`
    expect(parseFrontmatter(md)).toEqual({
      description: 'A test memory',
      memoryType: 'feedback'
    })
  })

  it('recognizes all four memory types', () => {
    for (const t of ['user', 'feedback', 'project', 'reference'] as const) {
      const md = `---\ntype: ${t}\n---\n`
      expect(parseFrontmatter(md).memoryType).toBe(t)
    }
  })

  it('ignores unknown memory types', () => {
    const md = `---\ntype: unknown\n---\n`
    expect(parseFrontmatter(md).memoryType).toBeUndefined()
  })

  it('matches type case-insensitively', () => {
    expect(parseFrontmatter(`---\ntype: Feedback\n---`).memoryType).toBe('feedback')
  })
})

describe('projectMemoryDir', () => {
  it('encodes cwd by replacing slashes with dashes', () => {
    const result = projectMemoryDir('/Users/victor/Projects/coide')
    expect(result).toBe(
      join(homedir(), '.claude', 'projects', '-Users-victor-Projects-coide', 'memory')
    )
  })

  it('handles paths with no leading slash', () => {
    expect(projectMemoryDir('relative/path')).toBe(
      join(homedir(), '.claude', 'projects', 'relative-path', 'memory')
    )
  })
})
