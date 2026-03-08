export type DetectedError = {
  summary: string
  severity: 'error' | 'warning'
  matchedLines: string[]
}

type Pattern = {
  regex: RegExp
  summary: string | ((match: RegExpMatchArray) => string)
  severity: 'error' | 'warning'
}

const ERROR_PATTERNS: Pattern[] = [
  // Exit codes
  { regex: /Exit code:? ([1-9]\d*)/i, summary: (m) => `Exit code ${m[1]}`, severity: 'error' },
  { regex: /exited with code ([1-9]\d*)/i, summary: (m) => `Exit code ${m[1]}`, severity: 'error' },
  { regex: /Command failed/i, summary: 'Command failed', severity: 'error' },

  // TypeScript
  { regex: /error TS\d+:/m, summary: 'TypeScript error', severity: 'error' },

  // Build/compile
  { regex: /BUILD FAILED/i, summary: 'Build failed', severity: 'error' },
  { regex: /compilation failed/i, summary: 'Compilation failed', severity: 'error' },
  { regex: /SyntaxError:/m, summary: 'Syntax error', severity: 'error' },

  // Python
  { regex: /Traceback \(most recent call last\):/m, summary: 'Python traceback', severity: 'error' },
  { regex: /ModuleNotFoundError:/m, summary: 'Module not found', severity: 'error' },
  { regex: /ImportError:/m, summary: 'Import error', severity: 'error' },
  { regex: /IndentationError:/m, summary: 'Indentation error', severity: 'error' },

  // Node/JS runtime
  { regex: /^TypeError:/m, summary: 'TypeError', severity: 'error' },
  { regex: /^ReferenceError:/m, summary: 'ReferenceError', severity: 'error' },
  { regex: /Cannot find module/m, summary: 'Module not found', severity: 'error' },

  // Test failures
  { regex: /Tests:\s+\d+ failed/i, summary: 'Tests failed', severity: 'error' },
  { regex: /^FAIL\s/m, summary: 'Test failed', severity: 'error' },
  { regex: /Test suite failed/i, summary: 'Test suite failed', severity: 'error' },
  { regex: /(\d+) failed/i, summary: (m) => `${m[1]} failed`, severity: 'error' },

  // System errors
  { regex: /Segmentation fault/i, summary: 'Segfault', severity: 'error' },
  { regex: /Permission denied/i, summary: 'Permission denied', severity: 'error' },
  { regex: /EACCES/m, summary: 'Permission denied', severity: 'error' },
  { regex: /ENOENT/m, summary: 'File not found', severity: 'error' },

  // Rust
  { regex: /error\[E\d+\]/m, summary: 'Rust compiler error', severity: 'error' },

  // Go
  { regex: /^\.\/.*:\d+:\d+:.*cannot/m, summary: 'Go compiler error', severity: 'error' },

  // Warnings (lower priority)
  { regex: /warning:/im, summary: 'Warnings', severity: 'warning' },
  { regex: /deprecated/im, summary: 'Deprecation warning', severity: 'warning' }
]

// Lines matching these patterns are noise, not real errors/warnings
const FALSE_POSITIVE_PATTERNS: RegExp[] = [
  /^Ignoring\s+\S+\s+because its extensions are not built/i,
  /^Source locally installed gems is ignoring/i,
  /gem pristine/i,
  /^WARNING:\s+You don't have .* in your PATH/i,
  /^rbenv: .* is not installed/i,
  /^nvm: .* is not yet installed/i
]

// Patterns indicating the command succeeded overall — suppress warnings when these match
const SUCCESS_PATTERNS: RegExp[] = [
  /0 failures/i,
  /0 failed/i,
  /Tests:\s+\d+ passed,\s+\d+ total/i,
  /All \d+ tests? passed/i,
  /BUILD SUCCESSFUL/i,
  /Build succeeded/i,
  /Compiled successfully/i,
  /Exit code:?\s*0\b/i,
  /\bpassed\b.*\b0 failed\b/i
]

function stripFalsePositives(text: string): string {
  return text
    .split('\n')
    .filter((line) => !FALSE_POSITIVE_PATTERNS.some((p) => p.test(line.trim())))
    .join('\n')
}

export function detectError(toolName: string, result: string): DetectedError | null {
  if (toolName !== 'Bash') return null
  if (!result || result.length < 5) return null

  const cleaned = stripFalsePositives(result)
  if (cleaned.trim().length < 5) return null

  // Check if the output indicates overall success
  const isOverallSuccess = SUCCESS_PATTERNS.some((p) => p.test(cleaned))

  for (const pattern of ERROR_PATTERNS) {
    const match = cleaned.match(pattern.regex)
    if (match) {
      // Skip warnings when the command succeeded overall
      if (pattern.severity === 'warning' && isOverallSuccess) continue

      const summary = typeof pattern.summary === 'function' ? pattern.summary(match) : pattern.summary

      // Extract the matched line and surrounding context
      const lines = cleaned.split('\n')
      const matchIdx = lines.findIndex((l) => pattern.regex.test(l))
      const matchedLines =
        matchIdx >= 0 ? lines.slice(Math.max(0, matchIdx), matchIdx + 3).filter(Boolean) : []

      return { summary, severity: pattern.severity, matchedLines }
    }
  }

  return null
}
