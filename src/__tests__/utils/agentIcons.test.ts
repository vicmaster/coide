import { describe, it, expect } from 'vitest'
import { pickAgentIcon } from '../../renderer/src/utils/agentIcons'

describe('pickAgentIcon', () => {
  it('matches by name keyword', () => {
    expect(pickAgentIcon('code-reviewer', '').tone).toMatch(/blue/)
    expect(pickAgentIcon('product-designer', '').tone).toMatch(/pink/)
    expect(pickAgentIcon('senior-architect', '').tone).toMatch(/amber/)
  })

  it('matches by description keyword when name is generic', () => {
    expect(pickAgentIcon('helper', 'Pentest and vuln scanning specialist').tone).toMatch(/emerald/)
    expect(pickAgentIcon('helper', 'Investigates and analyzes existing patterns').tone).toMatch(/purple/)
  })

  it('falls back to default for unknown agents', () => {
    const icon = pickAgentIcon('xyz-frobnicator', 'does some thing')
    expect(icon.tone).toBe('text-fg-muted')
  })

  it('is case-insensitive', () => {
    expect(pickAgentIcon('SECURITY-AUDITOR', '').tone).toBe(
      pickAgentIcon('security-auditor', '').tone
    )
  })
})
