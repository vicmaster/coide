export type ReleaseNote = {
  version: string
  date: string
  notes: string[]
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: 'next',
    date: '',
    notes: []
  },
  {
    version: '0.24.0',
    date: '2026-04-29',
    notes: [
      'Available Agents in right panel — see your subagents with personality icons, click to @-mention or jump to edit'
    ]
  },
  {
    version: '0.23.0',
    date: '2026-04-28',
    notes: [
      'Memory tab — view/edit auto-memories and CLAUDE.md files from the right panel'
    ]
  },
  {
    version: '0.22.0',
    date: '2026-04-27',
    notes: [
      'Light theme — pick Light, Dark, or System in Settings. Code blocks and diffs follow the theme.'
    ]
  },
  // The 'next' entry accumulates notes from ship-feature during the current dev cycle.
  // On release (npm version), scripts/add-release-note.js renames it to the actual
  // version + date, and prepends a fresh empty 'next' entry. The modal filters this
  // entry out so users only see released versions.
  {
    version: '0.21.0',
    date: '2026-04-26',
    notes: [
      'Release notes show full version history — rebuilt v0.16–v0.19 entries and fixed the release script so each version archives correctly going forward',
      '/permissions dialog — per-tool auto-approve toggles and an "Always allow" button on prompts so you stop seeing the same one twice'
    ]
  },
  {
    version: '0.20.0',
    date: '2026-04-25',
    notes: [
      'Tool trace polish — compact MCP names, no more text overlap on long tool names',
      'Permission dialog polish — Enter/Esc/⌘⏎ shortcuts, plan markdown preview, viewport-sized diff'
    ]
  },
  {
    version: '0.19.0',
    date: '2026-04-25',
    notes: [
      'Workflow marketplace — browse, install, and share workflows from the coide-flows-marketplace repo'
    ]
  },
  {
    version: '0.18.0',
    date: '2026-04-24',
    notes: [
      'Workflows Phase 3 — sub-workflows, multi-project run targets, metrics dashboard, and cron/file-watcher/webhook triggers',
      'Auto-recover when Claude CLI can\'t resume a stale conversation — retry transparently without --resume'
    ]
  },
  {
    version: '0.17.0',
    date: '2026-04-21',
    notes: [
      'Workflows Phase 2 — parallel fork/join, loops, human review, variables, per-node allowed tools, execution history, import/export'
    ]
  },
  {
    version: '0.16.0',
    date: '2026-04-12',
    notes: [
      'Visual Agent Workflows — React Flow canvas for orchestrating Claude agents',
      '/release-notes modal with version history',
      'Live-ticking rate limit countdown (every second)'
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
