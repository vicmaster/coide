export type CoideSettings = {
  model: string // '' = default, or model ID like 'sonnet', 'opus', 'haiku'
  skipPermissions: boolean
  notifications: boolean
  systemPrompt: string
  claudeBinaryPath: string
  defaultCwd: string
  fontSize: 'small' | 'medium' | 'large'
  effort: '' | 'low' | 'medium' | 'high' | 'max'
  planMode: boolean
  compactMode: boolean
  autoCompact: boolean
  autoCompactThreshold: number
  onboardingComplete: boolean
}

export const DEFAULT_SETTINGS: CoideSettings = {
  model: '',
  skipPermissions: false,
  notifications: true,
  systemPrompt: '',
  claudeBinaryPath: 'claude',
  defaultCwd: '',
  fontSize: 'medium',
  effort: '',
  planMode: false,
  compactMode: false,
  autoCompact: true,
  autoCompactThreshold: 90,
  onboardingComplete: false
}
