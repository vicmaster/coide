export const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
  'SubagentStop',
  'SessionStart',
  'SessionEnd',
  'PreCompact',
  'Notification',
  'WorktreeCreate',
  'WorktreeRemove'
] as const

export type HookEvent = (typeof HOOK_EVENTS)[number]

export type HookHandler = {
  type: 'command' | 'prompt'
  command?: string
  prompt?: string
  timeout?: number
}

export type MatcherGroup = {
  matcher?: string
  hooks: HookHandler[]
}

export type HooksConfig = Partial<Record<HookEvent, MatcherGroup[]>>
