<!-- Coide - Desktop GUI for Claude Code -->
# Coide — Claude Code GUI Client Vision

A desktop/web client that wraps the existing Claude Code CLI using your existing account and subscription (no separate API key), with a dramatically better UX than the terminal.

---

## Core Concept

- Uses `@anthropic-ai/claude-code` SDK under the hood
- Spawns local `claude` CLI — same account, same subscription
- Adds a rich UI layer on top of the same agentic loop

---

## Features

### 1. Diffs & File Edits
- Split-pane diff viewer (like GitHub) instead of inline `+/-` text
- Visual accept / reject / edit per change
- Session changelog: summary of every file touched

### 2. Tool Call Visualization
- Collapsible cards for bash runs, file reads, writes
- Clear separation from Claude's actual response text
- Expand to see full output, collapse when done

### 3. Approval UX
- Modal with context instead of raw `[y/n]` prompt
- Shows: what will this do, what files are affected, risk level
- Skip-permissions toggle: auto-approve all tools (like `--dangerously-skip-permissions`)

### 4. Context & State Panel
- Live indicator of what files Claude has read this session
- Token usage display (current context size)
- Warning when approaching context limit

### 5. Todo / Task List Panel
- Persistent panel that updates live as Claude works through tasks
- Visual checklist, not just printed text that scrolls away
- Progress indicator for long multi-step tasks

### 6. Commands & Skills Browser
- Searchable, categorized list of all `/commands`
- Each with description, example, keyboard shortcut
- Click to insert or run directly
- Visual skill cards with "Run" button and args input
- Skill editor UI — create/edit skills without touching files
- Custom prompt snippets / macros with parameters
- Import/export skills for team sharing
- "Suggested for this context" based on project type
- Usage frequency tracking

### 7. Agent & Sub-Agent Panel
- Live agent tree showing parent → child hierarchy
- Per-agent status: running / waiting / done / failed
- Click any node to see that agent's isolated output (no interleaved streams)
- Timeline view showing parallelism and duration
- Token usage per agent
- Pause / cancel / re-run individual sub-agents
- Per-agent file change diff

**Example tree view:**
```
Claude Code (orchestrator)
├── Explore Agent ✓ done
├── Plan Agent ⟳ running
│   └── Bash Agent ⟳ running
└── Test Runner Agent ○ pending
```

**Visual Agent Workflows** *(flagship feature — differentiator from Claude App and CLI)*

A visual workflow builder (like n8n/Zapier) for orchestrating Claude agents on your codebase. Design multi-step AI pipelines, watch them execute in real-time, save as reusable templates.

**Why this is unique:** Claude CLI runs agents but they're invisible — you can't design flows, reuse patterns, or pause/adjust mid-execution. Claude App doesn't have agents at all. Coide becomes a platform for AI automation, not just a GUI wrapper.

***Architecture:***
```
Workflow Definition (JSON)
  ↓
Workflow Engine (main process — src/main/workflow.ts)
  ├── Spawns Claude CLI per node (reuses existing PTY runner)
  ├── Captures structured output → passes to next node as context
  ├── Evaluates conditions (exit code, regex match, JSON path)
  ├── Manages parallel branches (fork/join)
  └── Handles loops, retry, timeout
  ↓
React Flow Canvas (renderer — src/renderer/src/components/WorkflowCanvas.tsx)
  └── Visualizes execution in real-time (node states, data flow, logs)
```

***Node Types:***
| Node | What it does | Claude CLI flags |
|------|-------------|------------------|
| `Prompt` | Run Claude with a prompt + system prompt | `-p`, `--append-system-prompt` |
| `Condition` | Branch based on previous output | N/A (JS eval in engine) |
| `Loop` | Repeat until condition met or max iterations | Re-spawns with `--resume` |
| `Parallel` | Fork into N branches, join when all complete | Multiple PTY sessions |
| `Tool Filter` | Restrict which tools Claude can use | `--allowedTools` |
| `Model Switch` | Use different model for this step | `--model` |
| `Script` | Run a shell command (no Claude) | Direct `child_process` |
| `Human Review` | Pause and wait for user approval | Permission system |

***Data Flow Between Nodes:***
- Each node produces an output (Claude's final `result` text or script stdout)
- Output injected into next node's prompt via template: `"Previous step output:\n{{prev.output}}"`
- Variables system: nodes can write to `workflow.vars` (e.g., `{{vars.planText}}`)
- Special extractors: `json:path.to.field`, `regex:pattern`, `lines:5-10`

***Workflow Definition Format (JSON):***
```json
{
  "id": "pr-review-pipeline",
  "name": "PR Review Pipeline",
  "nodes": [
    { "id": "explore", "type": "prompt", "prompt": "Read the git diff and list all changed files", "model": "haiku", "position": { "x": 100, "y": 200 } },
    { "id": "analyze", "type": "prompt", "prompt": "Review these changes for bugs, security issues, and style:\n{{explore.output}}", "model": "sonnet", "systemPrompt": "You are a senior code reviewer.", "position": { "x": 400, "y": 200 } },
    { "id": "has_issues", "type": "condition", "expression": "output.includes('issue') || output.includes('bug')", "position": { "x": 700, "y": 200 } },
    { "id": "fix", "type": "prompt", "prompt": "Fix the issues found:\n{{analyze.output}}", "allowedTools": ["Edit", "Write", "Bash"], "position": { "x": 900, "y": 100 } },
    { "id": "approve", "type": "script", "command": "echo 'No issues found — PR approved'", "position": { "x": 900, "y": 300 } }
  ],
  "edges": [
    { "from": "explore", "to": "analyze" },
    { "from": "analyze", "to": "has_issues" },
    { "from": "has_issues", "to": "fix", "label": "yes" },
    { "from": "has_issues", "to": "approve", "label": "no" }
  ]
}
```

***UI Components:***
- `WorkflowCanvas.tsx` — React Flow canvas with custom node renderers
- `WorkflowNodeConfig.tsx` — Side panel to edit node properties (prompt, model, tools, etc.)
- `WorkflowRunner.tsx` — Execution controls (run, pause, stop, step-through)
- `WorkflowTemplates.tsx` — Gallery of built-in and saved templates
- `WorkflowHistory.tsx` — Past executions with replay capability

***Built-in Templates:***
- **PR Review** — explore diff → analyze → fix if needed → summarize
- **Bug Fix** — reproduce → diagnose → implement fix → verify with tests
- **Refactor + Test** — identify targets → refactor → run tests → retry on failure
- **Onboard to Repo** — scan structure → read key files → generate architecture summary
- **Feature Implementation** — plan → implement → test → review → iterate

***Key Files (to be created):***
```
src/main/workflow.ts           — Workflow execution engine (spawns Claude CLI per node)
src/main/workflowStore.ts      — Persist workflows to disk (~/.coide/workflows/)
src/renderer/src/components/WorkflowCanvas.tsx    — React Flow canvas
src/renderer/src/components/WorkflowNodeConfig.tsx — Node property editor
src/renderer/src/components/WorkflowRunner.tsx    — Execution UI (run/pause/stop)
src/renderer/src/components/WorkflowTemplates.tsx — Template gallery
src/renderer/src/store/workflow.ts               — Zustand store for workflow state
```

***Dependencies:***
- `reactflow` (previously removed — reinstall when building this feature)
- Existing: `node-pty` (PTY runner), `zustand` (state), Electron IPC

***Implementation Phases:***

**Phase 1 — MVP (1-2 weeks)**
- [ ] React Flow canvas with Prompt, Condition, and Script node types
- [ ] Sequential execution only (no parallel/loops yet)
- [ ] Each Prompt node spawns Claude CLI via existing `runClaude()` with configurable prompt + system prompt
- [ ] Output of node N injected as context into node N+1
- [ ] Real-time node state visualization (pending → running → done/failed)
- [ ] Node click to see full output in side panel
- [ ] Save/load workflows as JSON files
- [ ] 2-3 built-in templates (PR Review, Bug Fix)
- [ ] New tab in Sidebar: "Workflows" alongside Sessions/Skills/Commands
- [ ] Keyboard shortcut: Cmd+W to open workflow canvas

**Phase 2 — Powerful (2-3 weeks)**
- [ ] Parallel branches (fork/join nodes)
- [ ] Loop nodes with max iterations and exit condition
- [ ] Variables system (`{{vars.name}}` templates in prompts)
- [ ] Tool filter per node (`--allowedTools`)
- [ ] Model selection per node
- [ ] Human Review node (pause and show approval dialog)
- [ ] Execution history with replay
- [ ] Import/export workflow JSON files

**Phase 3 — Platform (ongoing)**
- [ ] Triggers: file watcher, git hooks, cron schedule, manual
- [ ] Template marketplace — community-shared workflows
- [ ] Sub-workflows (a node can reference another workflow)
- [ ] Metrics dashboard: success rate, avg duration, token cost per workflow
- [ ] Multi-project: same workflow across different CWDs
- [ ] Webhook triggers for CI/CD integration

### 8. Navigation & History
- Conversation history sidebar with search
- Multi-session tabs (one per project or task)
- Click any previous message to re-run or edit

### 9. Code & Content Display
- Full rendered markdown (no raw `**text**`)
- Syntax highlighted code blocks with one-click copy
- Inline file preview — click a filename to open a preview pane

### 10. Workflow & Productivity
- Desktop notifications when Claude finishes or needs input
- Image / screenshot drag-and-drop in chat input
- Settings UI (no more editing JSON files manually)
- Hook configuration UI — visualize and edit hooks visually

### 11. Mobile / Accessibility
- Web-based option for reviewing sessions on tablet/mobile
- Font size, contrast, screen reader support

---

## Layout Concept

```
┌─────────────┬──────────────────────┬─────────────────────┐
│  Sessions   │    Chat / Output     │   Agent Tree        │
│  Skills     │                      │   ┌ Orchestrator    │
│  Commands   │  [rendered output]   │   ├ Explore ✓       │
│             │                      │   ├ Plan ⟳          │
│             │  [tool call cards]   │   │  └ Bash ⟳       │
│             │                      │   └ Tests ○         │
│             │  [diff viewer]       ├─────────────────────┤
│             │                      │   Todo List         │
│             │                      │   Context Tracker   │
└─────────────┴──────────────────────┴─────────────────────┘
```

---

## Priority Features (Biggest UX Impact First)

1. Visual diff viewer with accept / reject
2. Persistent todo / task panel
3. Tool call cards (collapsible, not raw text)
4. Context / token usage sidebar
5. Rendered markdown + copy buttons
6. Multi-session tabs
7. Commands & skills browser
8. Agent tree panel
9. Desktop notifications

---

---

## Tech Stack

### Shell
- **Electron 35** + `electron-vite` — main process is Node.js, spawns Claude CLI as subprocess
- No SDK used directly — subprocess approach avoids auth complexity

### UI
- **React 19 + TypeScript**
- **Tailwind CSS v3** + PostCSS (v4 dropped — utility class generation broken with electron-vite)

### Specialized Libraries

| Need | Library |
|------|---------|
| Code display + diffs | Monaco Editor (same as VS Code) |
| Agent tree / visual builder | React Flow |
| Markdown rendering | react-markdown + shiki |
| State management | Zustand (with persist middleware) |
| File tree | react-arborist |

### Architecture

```
Electron Main Process (Node.js)
├── claude CLI subprocess (spawn with -p --output-format json)
├── File system access
├── Process management (abort via SIGTERM)
└── IPC bridge → Renderer (ipcMain/ipcRenderer + webContents.send)

Electron Renderer Process (React)
├── Chat UI
├── Sidebar (sessions, skills, commands)
├── Right Panel (agents, todo/tasks, context)
└── Zustand stores (sessions, settings — persisted to localStorage)
```

### Key Implementation Notes
- Claude CLI spawned with `stdio: ['ignore', 'pipe', 'pipe']` — prevents stdin hang
- `CLAUDECODE` and `CLAUDE_CODE_SESSION_ID` env vars stripped before spawn — prevents nested session error
- `--output-format json` used (not `stream-json` — hangs without TTY)
- Multi-turn via `--resume <session_id>` flag
- Sessions persisted via Zustand `persist` middleware under key `coide-sessions`

---

## What's Built

### Infrastructure
- [x] Electron + electron-vite + React + TypeScript scaffold
- [x] Tailwind CSS v3 + PostCSS configured
- [x] IPC bridge (preload `contextBridge` → `window.api`)
- [x] Claude CLI subprocess runner (`src/main/claude.ts`)
- [x] Abort/stop support
- [x] macOS `titleBarStyle: 'hiddenInset'` + drag region

### UI
- [x] 3-panel layout: Sidebar (224px) | Chat (flex) | Right Panel (256px, collapsible)
- [x] macOS traffic light clearance (`pt-[46px]`) on all panels
- [x] Dark theme (`#0d0d0d` background)

### Chat
- [x] Send messages, receive streamed responses (via event-based IPC)
- [x] User / assistant / error message bubbles
- [x] Loading indicator (bouncing dots)
- [x] Stop button while Claude is running
- [x] Skip-permissions toggle — auto-approve all tools, amber indicator when active
- [x] CWD picker — click path to open native folder picker
- [x] Markdown rendering for assistant messages (react-markdown + shiki, JS regex engine)

### Session Management
- [x] Zustand store with localStorage persistence
- [x] Create new sessions (inherit CWD from current session)
- [x] Switch between sessions in sidebar
- [x] Delete sessions (hover × button)
- [x] Auto-title sessions from first user message
- [x] Multi-turn conversations via `--resume` (claudeSessionId tracked per session)
- [x] Session list in sidebar with title + project folder name

### Sidebar
- [x] Tabs: Sessions | Skills | Commands
- [x] Skills panel (hardcoded list with Run button on hover)
- [x] Commands panel (hardcoded list)

### Right Panel
- [x] Tabs: Agents | Todo | Context
- [x] Toggle open/close from Chat header
- [x] Live Todo/Task panel — intercepts TodoWrite, TaskCreate, TaskUpdate events
- [x] Progress bar with completion counter (e.g. 3/7 done)
- [x] Task items with status dots (gray=pending, blue pulse=in_progress, green=completed)
- [x] Strikethrough on completed tasks, italic activeForm on in-progress
- [x] Collapsible task descriptions on click
- [x] Tasks cleared on `/clear`, persisted with session via Zustand
- [x] Live Agent Tree panel — intercepts Task tool events for sub-agent hierarchy
- [x] Orchestrator root node with derived status (idle/running/done)
- [x] Child agent nodes with blue pulse (running), green (done), red (failed)
- [x] Duration and token count metadata after agent completion
- [x] Progress counter header (e.g. 2/3 done)
- [x] Agents cleared on `/clear`, persisted with session via Zustand
- [x] Live Context & Token Usage tracker
- [x] Token usage accumulated from `assistant` event `usage` field (input, output, cache read/write)
- [x] Progress bar with color coding: blue → yellow (>70%) → red (>90%)
- [x] Breakdown: input tokens, output tokens, cache stats (shown when > 0)
- [x] Files in Context: derived from Read/Edit/Write/Glob/Grep tool calls, deduplicated
- [x] Usage and files cleared on `/clear`, persisted with session via Zustand
- [x] MCP Servers tab — reads global `~/.claude/settings.json` and project `.mcp.json`, shows server cards with scope badges

---

## Roadmap

### Next Up
- [x] Markdown rendering for assistant messages (react-markdown + shiki)
- [x] Tool call cards (collapsible, shows bash runs / file reads / writes)
- [x] Skip-permissions toggle (auto-approve all tools, persisted setting)
- [x] Visual diff viewer with accept / reject
- [x] Error detection — Warp-style error highlighting for Bash failures with "Fix this" / "Explain error" actions

### Later
- [x] Agent tree panel (live sub-agent hierarchy)
- [x] Todo / task panel (live updates from Claude)
- [x] Context / token usage tracker
- [x] Desktop notifications
- [x] Image / screenshot drag-and-drop
- [x] File attachments — drag & drop or file picker for PDF, DOCX, XLSX, PPTX, CSV, and text files with automatic text extraction
- [x] Settings UI
- [x] Session search — full-text search across all past sessions to find old conversations
- [x] File changelog — per-session list of every file touched, cumulative diff, one-click revert
- [x] Keyboard shortcuts — Cmd+K clear, Cmd+N new session, Cmd+[/] switch sessions, Escape stop

### Future
- [x] Context limit warning — visual alert when approaching token limit
- [x] Click-to-edit past messages — re-run or edit any previous user message
- [x] Inline file preview — click a filename in chat to open a preview pane
- [x] Agent tree enhancements — timeline view, pause/cancel/re-run individual sub-agents
- [x] Skill editor UI — create/edit skills without touching files
- [x] Skill import/export — pick .md from disk or save skill to chosen location
- [x] Hook configuration UI — visualize and edit hooks visually
- [x] Copy conversation as ChatGPT format — export messages as shareable markdown
- [x] Jump to bottom button — floating pill when scrolled up, smart auto-scroll that doesn't interrupt reading
- [x] In-session search — find text in current session with match highlighting
- [x] MCP servers panel — read-only view of active MCP servers (global + project) in right panel
- [x] Integrated terminal — xterm.js-based terminal panel with multi-tab support, resizable, Cmd+J toggle
- [x] Inline chat date separators — Slack-style day dividers (Today/Yesterday/date) between messages from different days

### Copycat — Features from Claude Code CLI
- [x] Plan mode toggle — button to enter/exit plan mode (auto-accept edits, strategic planning before execution)
- [x] Effort level selector — segmented control (low/med/high/max) in chat header, click to toggle effort level
- [x] Model switching — dropdown to switch between Opus/Sonnet/Haiku mid-session via `--model` flag
- [x] Status line — bottom bar showing current model, effort level, token usage, estimated cost, and session ID
- [x] @-mentions — autocomplete for `@` in chat input to reference files, folders, and URLs inline
- [x] Message queuing — allow typing and sending the next message while Claude is still responding
- [ ] Light theme — add light color scheme and theme toggle in settings
- [x] Extended thinking indicator — show visual "thinking" state when Claude uses deep/ultrathink reasoning
- [x] Compact mode — toggle for denser chat layout with reduced spacing and smaller text
- [ ] Voice mode — speech-to-text input and text-to-speech responses via Web Speech API
- [x] History search — Ctrl+R style recall of past user prompts for quick re-use
- [x] Session forking — branch current conversation into a new session with shared history
- [x] Git worktrees — UI for `--worktree` flag to run isolated parallel sessions on separate branches
- [ ] Vim mode — vim keybindings for the chat input textarea
- [x] Vitest test suite — unit tests for store actions, utilities, and event parsing with `npm test`
- [x] Onboarding wizard — CLI detection, folder picker, and getting-started tips for first-time users
- [x] `/loop` recurring tasks — cron-like scheduled prompts on intervals (e.g. every 5m), reuses PTY runner on a timer
- [x] `/compact` context compression — send compact command to CLI to compress conversation context mid-session
- [x] Auto-compaction — detect context approaching token limit and auto-compress without user intervention
- [x] `/copy` code block picker — interactive UI to pick and copy specific code blocks from the conversation
- [x] Rate limit display — show rate limit usage percentage and reset countdown in status bar
- [x] Message stash (Ctrl+S) — save current input as draft, restore later with keyboard shortcut
- [x] `/context` optimization tips — forward to CLI and display actionable suggestions for reducing context usage
- [x] `/stats` usage statistics — token/cost stats view with detailed breakdown per session
- [x] `/rename` sessions — inline rename in sidebar to edit session title on demand
