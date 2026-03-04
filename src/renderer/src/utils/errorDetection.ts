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

export function detectError(toolName: string, result: string): DetectedError | null {
  if (toolName !== 'Bash') return null
  if (!result || result.length < 5) return null

  for (const pattern of ERROR_PATTERNS) {
    const match = result.match(pattern.regex)
    if (match) {
      const summary = typeof pattern.summary === 'function' ? pattern.summary(match) : pattern.summary

      // Extract the matched line and surrounding context
      const lines = result.split('\n')
      const matchIdx = lines.findIndex((l) => pattern.regex.test(l))
      const matchedLines =
        matchIdx >= 0 ? lines.slice(Math.max(0, matchIdx), matchIdx + 3).filter(Boolean) : []

      return { summary, severity: pattern.severity, matchedLines }
    }
  }

  return null
}
