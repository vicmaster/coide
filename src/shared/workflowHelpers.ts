// Pure helpers used by the workflow engine. Kept in `shared/` so they can be
// unit-tested without pulling in Electron or Node-only deps.

/**
 * Interpolate `{{prev.output}}`, `{{input.key}}`, and `{{vars.name}}` placeholders
 * in a template string. Unknown keys resolve to empty string.
 */
export function interpolate(
  template: string,
  prevOutput: string,
  inputValues: Record<string, string>,
  vars: Record<string, string>
): string {
  let result = template.replace(/\{\{prev\.output\}\}/g, prevOutput)
  result = result.replace(/\{\{input\.(\w+)\}\}/g, (_, key) => inputValues[key] ?? '')
  result = result.replace(/\{\{vars\.(\w+)\}\}/g, (_, key) => vars[key] ?? '')
  return result
}

/**
 * Resolve an extractor string against node output.
 *
 * Supported forms:
 *   ""                     → raw output
 *   "json:path.to.field"   → JSON.parse, walk dotted path
 *   "regex:pattern"        → first capture group, or full match
 *   "lines:N" / "lines:N-M" → slice of lines (1-indexed, inclusive)
 *
 * Returns empty string on malformed input / no match.
 */
export function applyExtractor(extractor: string, output: string): string {
  const ext = (extractor ?? '').trim()
  if (!ext) return output

  if (ext.startsWith('json:')) {
    try {
      const path = ext.slice(5).trim()
      const parsed = JSON.parse(output)
      const parts = path.split('.').filter(Boolean)
      let cur: unknown = parsed
      for (const p of parts) {
        if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
          cur = (cur as Record<string, unknown>)[p]
        } else {
          return ''
        }
      }
      return typeof cur === 'string' ? cur : JSON.stringify(cur)
    } catch {
      return ''
    }
  }

  if (ext.startsWith('regex:')) {
    try {
      const pattern = ext.slice(6)
      const re = new RegExp(pattern)
      const m = output.match(re)
      if (!m) return ''
      return m[1] ?? m[0]
    } catch {
      return ''
    }
  }

  if (ext.startsWith('lines:')) {
    const range = ext.slice(6).trim()
    const lines = output.split(/\r?\n/)
    const [startStr, endStr] = range.split('-')
    const start = Math.max(1, parseInt(startStr, 10) || 1)
    const end = endStr ? Math.max(start, parseInt(endStr, 10) || start) : start
    return lines.slice(start - 1, end).join('\n')
  }

  return output
}

/**
 * Evaluate a workflow condition expression. Exposes `output`, `vars`, and
 * `iteration` to the expression. Returns false on eval failure (never throws).
 */
export function evaluateCondition(
  expression: string,
  output: string,
  vars: Record<string, string>,
  iteration: number
): boolean {
  try {
    const fn = new Function('output', 'vars', 'iteration', `return Boolean(${expression})`)
    return Boolean(fn(output, vars, iteration))
  } catch {
    return false
  }
}
