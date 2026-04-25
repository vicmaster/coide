import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { transformReleaseNotes } = require('../../../scripts/add-release-note.js')

const SAMPLE = `export type ReleaseNote = {
  version: string
  date: string
  notes: string[]
}

export const RELEASE_NOTES: ReleaseNote[] = [
  // Sentinel entry — see scripts/add-release-note.js
  {
    version: 'next',
    date: '',
    notes: [
      'New shiny thing',
      'Another improvement'
    ]
  },
  {
    version: '0.20.0',
    date: '2026-04-25',
    notes: [
      'Old shipped feature'
    ]
  }
]
`

describe('transformReleaseNotes', () => {
  it("renames 'next' to the new version with today's date", () => {
    const { content, skipped } = transformReleaseNotes(SAMPLE, '0.21.0', '2026-05-01')
    expect(skipped).toBe(false)
    expect(content).toContain("version: '0.21.0'")
    expect(content).toContain("date: '2026-05-01'")
  })

  it("preserves the notes accumulated under 'next'", () => {
    const { content } = transformReleaseNotes(SAMPLE, '0.21.0', '2026-05-01')
    expect(content).toContain('New shiny thing')
    expect(content).toContain('Another improvement')
  })

  it("prepends a fresh empty 'next' entry above the new version", () => {
    const { content } = transformReleaseNotes(SAMPLE, '0.21.0', '2026-05-01')
    const nextIdx = content.indexOf("version: 'next'")
    const newVersionIdx = content.indexOf("version: '0.21.0'")
    expect(nextIdx).toBeGreaterThan(0)
    expect(nextIdx).toBeLessThan(newVersionIdx)
    // Fresh 'next' has empty notes
    const freshSlice = content.slice(nextIdx, newVersionIdx)
    expect(freshSlice).toContain('notes: []')
  })

  it('keeps previously released entries intact', () => {
    const { content } = transformReleaseNotes(SAMPLE, '0.21.0', '2026-05-01')
    expect(content).toContain("version: '0.20.0'")
    expect(content).toContain('Old shipped feature')
  })

  it('is idempotent when the target version already exists', () => {
    const { content, skipped } = transformReleaseNotes(SAMPLE, '0.20.0', '2026-05-01')
    expect(skipped).toBe(true)
    expect(content).toBe(SAMPLE)
  })

  it("throws when no 'next' entry is present", () => {
    const malformed = SAMPLE.replace("version: 'next'", "version: '0.99.0'")
    expect(() => transformReleaseNotes(malformed, '1.0.0', '2026-05-01')).toThrow(/'next' entry/)
  })

  it('a second pass after a release still finds the new sentinel', () => {
    // Simulates two releases in a row: 'next' → 0.21.0 then 'next' → 0.22.0
    const first = transformReleaseNotes(SAMPLE, '0.21.0', '2026-05-01').content
    const second = transformReleaseNotes(first, '0.22.0', '2026-05-08')
    expect(second.skipped).toBe(false)
    expect(second.content).toContain("version: '0.22.0'")
    expect(second.content).toContain("date: '2026-05-08'")
    expect(second.content).toContain("version: '0.21.0'")
    expect(second.content).toContain("date: '2026-05-01'")
  })
})
