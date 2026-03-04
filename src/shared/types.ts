export type CoideSettings = {
  model: string // '' = default, or model ID like 'sonnet', 'opus', 'haiku'
  skipPermissions: boolean
  notifications: boolean
  systemPrompt: string
  claudeBinaryPath: string
  defaultCwd: string
  fontSize: 'small' | 'medium' | 'large'
  effort: string // '' = default, or 'low' | 'medium' | 'high'
}

export const DEFAULT_SETTINGS: CoideSettings = {
  model: '',
  skipPermissions: false,
  notifications: true,
  systemPrompt: '',
  claudeBinaryPath: 'claude',
  defaultCwd: '',
  fontSize: 'medium',
  effort: ''
}
