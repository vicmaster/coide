export type ReleaseNote = {
  version: string
  date: string
  notes: string[]
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.19.0',
    date: '2026-04-25',
    notes: [
      'Visual Agent Workflows — React Flow canvas for orchestrating Claude agents',
      '/release-notes modal with version history',
      'Live-ticking rate limit countdown (every second)',
      'Workflows Phase 2 — parallel fork/join, loops, human review, variables, per-node allowed tools, execution history, import/export',
      'Workflows Phase 3 — sub-workflows, multi-project run targets, metrics dashboard, and cron/file-watcher/webhook triggers',
      'Auto-recover when Claude CLI can\'t resume a stale conversation — retry transparently without --resume',
      'Workflow marketplace — browse, install, and share workflows from the coide-flows-marketplace repo',
      'Tool trace polish — compact MCP names, no more text overlap on long tool names'
    ]
  },
  {
    version: '0.14.0',
    date: '2026-04-11',
    notes: [
      'Image compression before sending to reduce token usage',
      'Agent definitions in @-mention autocomplete',
      'Fix infinite re-render loop and dev mode black screen',
      'Named subagents in @-mention autocomplete',
      'Fix PDF drag-and-drop crash and image file picker'
    ]
  },
  {
    version: '0.13.0',
    date: '2026-04-11',
    notes: [
      'Redesign tool call cards as compact trace lines with grouping',
      'Windows support link in README (shoutout to yexi-fun)'
    ]
  },
  {
    version: '0.12.0',
    date: '2026-04-11',
    notes: [
      'Session forking with /fork command and message fork icon'
    ]
  },
  {
    version: '0.11.0',
    date: '2026-04-11',
    notes: [
      'Auto-compaction when context approaches token limit',
      '/loop recurring tasks — cron-like scheduled prompts'
    ]
  },
  {
    version: '0.10.0',
    date: '2026-04-11',
    notes: [
      '/context optimization tips',
      '/copy code block picker modal',
      'Message stash (Ctrl+S) — save and restore draft input'
    ]
  },
  {
    version: '0.9.0',
    date: '2026-04-11',
    notes: [
      '/rename sessions — inline rename in sidebar + slash command'
    ]
  },
  {
    version: '0.8.0',
    date: '2026-04-11',
    notes: [
      '/compact context compression',
      '/stats session statistics modal',
      'Rate limit display in status bar and right panel'
    ]
  },
  {
    version: '0.7.0',
    date: '2026-04-10',
    notes: [
      'GitHub Releases in release scripts',
      '/fast command in slash autocomplete'
    ]
  },
  {
    version: '0.6.0',
    date: '2026-04-10',
    notes: [
      'Onboarding wizard with CLI detection and getting-started tips'
    ]
  },
  {
    version: '0.5.0',
    date: '2026-04-10',
    notes: [
      'Git worktrees UI for isolated parallel sessions'
    ]
  },
  {
    version: '0.4.0',
    date: '2026-04-09',
    notes: [
      'Message queuing — type next message while Claude responds',
      'Live MCP panel with server status and tools',
      'Vitest test suite'
    ]
  }
]
