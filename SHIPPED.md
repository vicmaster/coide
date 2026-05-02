# Shipped

Archive of completed features. User-facing changelog lives in `src/renderer/src/data/releaseNotes.ts`; this file is an internal "what's built" record matching the old VISION.md layout.

---

## Infrastructure
- Electron + electron-vite + React + TypeScript scaffold
- Tailwind CSS v3 + PostCSS configured
- IPC bridge (preload `contextBridge` → `window.api`)
- Claude CLI subprocess runner (`src/main/claude.ts`)
- Abort/stop support
- macOS `titleBarStyle: 'hiddenInset'` + drag region

## UI
- 3-panel layout: Sidebar (224px) | Chat (flex) | Right Panel (256px, collapsible)
- macOS traffic light clearance (`pt-[46px]`) on all panels
- Dark theme (`#0d0d0d` background)

## Chat
- Send messages, receive streamed responses (via event-based IPC)
- User / assistant / error message bubbles
- Loading indicator (bouncing dots)
- Stop button while Claude is running
- Skip-permissions toggle — auto-approve all tools, amber indicator when active
- CWD picker — click path to open native folder picker
- Markdown rendering for assistant messages (react-markdown + shiki, JS regex engine)

## Session Management
- Zustand store with localStorage persistence
- Create new sessions (inherit CWD from current session)
- Switch between sessions in sidebar
- Delete sessions (hover × button)
- Auto-title sessions from first user message
- Multi-turn conversations via `--resume` (claudeSessionId tracked per session)
- Session list in sidebar with title + project folder name

## Sidebar
- Tabs: Sessions | Skills | Commands
- Skills panel (hardcoded list with Run button on hover)
- Commands panel (hardcoded list)

## Right Panel
- Tabs: Agents | Todo | Context
- Toggle open/close from Chat header
- Live Todo/Task panel — intercepts TodoWrite, TaskCreate, TaskUpdate events
- Progress bar with completion counter (e.g. 3/7 done)
- Task items with status dots (gray=pending, blue pulse=in_progress, green=completed)
- Strikethrough on completed tasks, italic activeForm on in-progress
- Collapsible task descriptions on click
- Tasks cleared on `/clear`, persisted with session via Zustand
- Live Agent Tree panel — intercepts Task tool events for sub-agent hierarchy
- Orchestrator root node with derived status (idle/running/done)
- Child agent nodes with blue pulse (running), green (done), red (failed)
- Duration and token count metadata after agent completion
- Progress counter header (e.g. 2/3 done)
- Agents cleared on `/clear`, persisted with session via Zustand
- Live Context & Token Usage tracker
- Token usage accumulated from `assistant` event `usage` field (input, output, cache read/write)
- Progress bar with color coding: blue → yellow (>70%) → red (>90%)
- Breakdown: input tokens, output tokens, cache stats (shown when > 0)
- Files in Context: derived from Read/Edit/Write/Glob/Grep tool calls, deduplicated
- Usage and files cleared on `/clear`, persisted with session via Zustand
- MCP Servers tab — reads global `~/.claude/settings.json` and project `.mcp.json`, shows server cards with scope badges

## Visual Agent Workflows

**Phase 1 — MVP**
- React Flow canvas with Prompt, Condition, and Script node types
- Sequential execution only (no parallel/loops yet)
- Each Prompt node spawns Claude CLI via existing `runClaude()` with configurable prompt + system prompt
- Output of node N injected as context into node N+1
- Real-time node state visualization (pending → running → done/failed)
- Node click to see full output in side panel
- Save/load workflows as JSON files
- 2-3 built-in templates (PR Review, Bug Fix)
- New tab in Sidebar: "Workflows" alongside Sessions/Skills/Commands
- Keyboard shortcut: Cmd+W to open workflow canvas

**Phase 2 — Powerful**
- Parallel branches (fork/join nodes)
- Loop nodes with max iterations and exit condition
- Variables system (`{{vars.name}}` templates in prompts)
- Tool filter per node (`--allowedTools`)
- Model selection per node
- Human Review node (pause and show approval dialog)
- Execution history with replay
- Import/export workflow JSON files

**Phase 3 — Platform**
- Triggers: file watcher, cron schedule, manual (chokidar + node-cron scheduler in main process, refreshed on workflow save)
- Template marketplace — fetches `index.json` from public [`coide-flows-marketplace`](https://github.com/vicmaster/coide-flows-marketplace) GitHub repo, installs templates with one click, tracks installed/update-available state via `marketplaceId`/`marketplaceVersion`; "Share to marketplace" opens a pre-filled GitHub issue for PR submission
- Sub-workflows (new `subworkflow` node type; child `finalVars` bubble up into parent via `captureVars`)
- Metrics dashboard: success rate, avg duration, token cost, top failing nodes (per-workflow Metrics panel)
- Multi-project: same workflow across different CWDs (Run split-button with recent cwds + folder picker; `recentCwds` persisted in workflow)
- Webhook triggers for CI/CD integration (loopback HTTP server, per-trigger token-gated URL, POST body merged into inputs)

## Core Roadmap (shipped)
- Markdown rendering for assistant messages (react-markdown + shiki)
- Tool call cards (collapsible, shows bash runs / file reads / writes)
- Skip-permissions toggle (auto-approve all tools, persisted setting)
- Visual diff viewer with accept / reject
- Error detection — Warp-style error highlighting for Bash failures with "Fix this" / "Explain error" actions
- Agent tree panel (live sub-agent hierarchy)
- Todo / task panel (live updates from Claude)
- Context / token usage tracker
- Desktop notifications
- Image / screenshot drag-and-drop
- File attachments — drag & drop or file picker for PDF, DOCX, XLSX, PPTX, CSV, and text files with automatic text extraction
- Settings UI
- Session search — full-text search across all past sessions to find old conversations
- File changelog — per-session list of every file touched, cumulative diff, one-click revert
- Keyboard shortcuts — Cmd+K clear, Cmd+N new session, Cmd+[/] switch sessions, Escape stop
- Context limit warning — visual alert when approaching token limit
- Click-to-edit past messages — re-run or edit any previous user message
- Inline file preview — click a filename in chat to open a preview pane
- Agent tree enhancements — timeline view, pause/cancel/re-run individual sub-agents
- Skill editor UI — create/edit skills without touching files
- Skill import/export — pick .md from disk or save skill to chosen location
- Hook configuration UI — visualize and edit hooks visually
- Copy conversation as ChatGPT format — export messages as shareable markdown
- Jump to bottom button — floating pill when scrolled up, smart auto-scroll that doesn't interrupt reading
- In-session search — find text in current session with match highlighting
- MCP servers panel — read-only view of active MCP servers (global + project) in right panel
- Integrated terminal — xterm.js-based terminal panel with multi-tab support, resizable, Cmd+J toggle
- Inline chat date separators — Slack-style day dividers (Today/Yesterday/date) between messages from different days
- Light theme — full light color palette via CSS design tokens, with a Light/Dark/System toggle in Settings; Monaco diff/editor and Shiki code blocks swap to light themes when the resolved theme is light
- Memory tab — view/edit auto-memories and CLAUDE.md files (global, project, subagents) from the right panel; Monaco markdown editor with Edit/Preview toggle, type-badged entries, search, dirty indicator, save/delete
- `/tasks` background bash manager — unified bottom panel (Terminal tabs + Processes), status-bar chip, Kill button, live tail of Claude's task output files. Backed by a persistent Claude subprocess per session so backgrounded bashes survive across turns.

## Copycat — Features parity with Claude Code CLI (shipped)
- Plan mode toggle — button to enter/exit plan mode (auto-accept edits, strategic planning before execution)
- Effort level selector — segmented control (low/med/high/max) in chat header, click to toggle effort level
- Model switching — dropdown to switch between Opus/Sonnet/Haiku mid-session via `--model` flag
- Status line — bottom bar showing current model, effort level, token usage, estimated cost, and session ID
- @-mentions — autocomplete for `@` in chat input to reference files, folders, and URLs inline
- Message queuing — allow typing and sending the next message while Claude is still responding
- Extended thinking indicator — show visual "thinking" state when Claude uses deep/ultrathink reasoning
- Compact mode — toggle for denser chat layout with reduced spacing and smaller text
- History search — Ctrl+R style recall of past user prompts for quick re-use
- Session forking — branch current conversation into a new session with shared history
- Git worktrees — UI for `--worktree` flag to run isolated parallel sessions on separate branches
- Vitest test suite — unit tests for store actions, utilities, and event parsing with `npm test`
- Onboarding wizard — CLI detection, folder picker, and getting-started tips for first-time users
- `/loop` recurring tasks — cron-like scheduled prompts on intervals (e.g. every 5m), reuses PTY runner on a timer
- `/compact` context compression — send compact command to CLI to compress conversation context mid-session
- Auto-compaction — detect context approaching token limit and auto-compress without user intervention
- `/copy` code block picker — interactive UI to pick and copy specific code blocks from the conversation
- Rate limit display — show rate limit usage percentage and reset countdown in status bar
- Message stash (Ctrl+S) — save current input as draft, restore later with keyboard shortcut
- `/context` optimization tips — forward to CLI and display actionable suggestions for reducing context usage
- `/stats` usage statistics — token/cost stats view with detailed breakdown per session
- `/rename` sessions — inline rename in sidebar to edit session title on demand
- Image compression — resize large images before sending to reduce token usage
- Refreshing status line — tick rate limit countdown and stats live every second
- `/release-notes` — show changelog/what's new per coide version in a modal
- Named subagents in @-mention — autocomplete shows running agents by name in chat input
- `/permissions` dialog — per-tool auto-approve toggles plus "Always allow" button on prompts, replacing the binary skipPermissions toggle
- In-app `/login` — typing `/login` (or hitting a 401 mid-turn) opens a modal that runs `claude /login` in an embedded xterm.js terminal; on success the failed prompt is automatically retried
