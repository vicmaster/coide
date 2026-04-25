/**
 * Extracts a renderable plan body from an ExitPlanMode tool input.
 *
 * Claude's ExitPlanMode tool sends `{ plan: string }` today. If the shape
 * ever changes, fall back to a JSON code block of the whole input so the
 * user still sees something useful instead of an empty dialog.
 */
export function extractPlan(input: Record<string, unknown> | null | undefined): string {
  if (!input) return ''
  const plan = (input as { plan?: unknown }).plan
  if (typeof plan === 'string' && plan.trim().length > 0) return plan
  return '```json\n' + JSON.stringify(input, null, 2) + '\n```'
}

/**
 * Diff viewer height for the permission dialog, computed once at mount from
 * the current viewport. Min 240, max 600, with 280px reserved for header,
 * buttons, padding, and the OS chrome.
 */
export function computeDiffHeight(viewportHeight: number): number {
  return Math.max(240, Math.min(viewportHeight - 280, 600))
}
