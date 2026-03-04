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

**Ambitious: Visual Agent Builder**
- Drag and drop agent types into a workflow
- Define tools, conditions, and triggers per agent
- Save as reusable agent templates per project type
- Think n8n/Zapier but for Claude agents on your codebase

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

### Later
- [x] Agent tree panel (live sub-agent hierarchy)
- [x] Todo / task panel (live updates from Claude)
- [x] Context / token usage tracker
- [x] Desktop notifications
- [x] Image / screenshot drag-and-drop
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
- [x] Hook configuration UI — visualize and edit hooks visually
- [x] Copy conversation as ChatGPT format — export messages as shareable markdown
- [x] Jump to bottom button — floating pill when scrolled up, smart auto-scroll that doesn't interrupt reading
- [x] In-session search — find text in current session with match highlighting
- [x] MCP servers panel — read-only view of active MCP servers (global + project) in right panel
