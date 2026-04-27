<!-- Coide - Desktop GUI for Claude Code -->
# Coide — Claude Code GUI Client Vision

A desktop/web client that wraps the existing Claude Code CLI using your existing account and subscription (no separate API key), with a dramatically better UX than the terminal.

> Shipped features live in `SHIPPED.md`. User-facing changelog lives in `src/renderer/src/data/releaseNotes.ts`.

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

***Key Files:***
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
- `reactflow`
- Existing: `node-pty` (PTY runner), `zustand` (state), Electron IPC

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

## Roadmap

- [ ] Voice mode — speech-to-text input and text-to-speech responses via Web Speech API
- [ ] Vim mode — vim keybindings for the chat input textarea
- [ ] `/cost` per-model breakdown — enhance /stats with per-model cost and cache-hit breakdown
- [ ] Focus view — reader mode toggle that hides tool calls and shows only prompts + responses
- [ ] Monitor tool — stream events from background scripts and processes via IPC
- [ ] Checkpointing / `/rewind` — rewind conversation and code to a previous point, time-travel UI leveraging per-turn diffs
- [ ] Auto-memory + CLAUDE.md editor — persistent cross-session learnings panel plus in-app CLAUDE.md editor for global and project memory files
- [ ] `/diff` interactive viewer — dedicated per-turn diff browser with left/right navigation between Claude turns and the current git diff
- [ ] `/tasks` background bash manager — track and manage long-running bash processes spawned by Claude (tests, dev servers), inspect output and kill selectively
- [ ] `/insights` session analyzer — report on project areas touched, interaction patterns, and friction points across past sessions
