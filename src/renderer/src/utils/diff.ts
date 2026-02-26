export type DiffData = {
  filePath: string
  original: string
  modified: string
  isNewFile: boolean
}

export function buildDiffFromToolInput(
  toolName: string,
  input: Record<string, unknown>,
  originalContent?: string | null
): DiffData | null {
  const filePath = String(input.file_path ?? input.path ?? '')
  if (!filePath) return null

  if (toolName === 'Edit') {
    const oldStr = String(input.old_string ?? '')
    const newStr = String(input.new_string ?? '')
    if (!oldStr && !newStr) return null
    return { filePath, original: oldStr, modified: newStr, isNewFile: false }
  }

  if (toolName === 'Write') {
    const content = String(input.content ?? '')
    const isNewFile = originalContent == null || originalContent === ''
    return {
      filePath,
      original: originalContent ?? '',
      modified: content,
      isNewFile
    }
  }

  return null
}

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  xml: 'xml',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  dockerfile: 'dockerfile',
  makefile: 'makefile'
}

export function detectLanguage(filePath: string): string {
  const name = filePath.split('/').pop()?.toLowerCase() ?? ''
  if (name === 'dockerfile') return 'dockerfile'
  if (name === 'makefile') return 'makefile'
  const ext = name.split('.').pop() ?? ''
  return EXT_TO_LANG[ext] ?? 'plaintext'
}
