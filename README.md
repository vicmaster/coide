# Coide

A desktop GUI client for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that wraps the CLI you already use — same account, same subscription, no API key needed.

Built with Electron, React, and TypeScript. Talks to Claude through `node-pty`, giving it a real TTY so everything works exactly like the terminal, but with a proper UI on top.

## Features

**Chat & Sessions**
- Streamed responses with markdown rendering and syntax highlighting (shiki)
- Multi-turn conversations with session persistence
- Session management — create, switch, delete, auto-title, search across history
- Working directory picker per session
- Edit and re-run past messages
- Copy conversation or individual responses
- Keyboard shortcuts (Cmd+K clear, Cmd+N new session, Cmd+[/] switch, Esc stop)

**Tool Calls & Permissions**
- Collapsible tool call cards with real-time output
- Permission dialog with context — see what Claude wants to do before approving
- Visual diff viewer (Monaco Editor) for file edits with Accept/Reject
- File revert on rejection
- Skip-permissions toggle for auto-approve mode

**Right Panel**
- **Agent Tree** — live sub-agent hierarchy with status, duration, and token counts. Timeline view showing parallelism. Cancel running agents.
- **Todo List** — live task tracking with progress bar, status dots, collapsible descriptions
- **Context Tracker** — token usage with color-coded progress bar, input/output/cache breakdown, files touched
- **File Changelog** — every file modified in the session with cumulative diffs and one-click revert

**Sidebar**
- Session list with project folder labels
- Skills browser — run Claude Code skills directly
- Commands panel — built-in commands and slash autocomplete

**Integrated Terminal**
- Full terminal emulator (xterm.js) — run builds, tests, servers, interactive programs
- Multi-tab support with create/close
- Resizable panel with drag handle
- Toggle with Cmd+J or header button

**Other**
- Image/screenshot drag-and-drop
- File attachments — drag & drop or file picker for PDF, DOCX, XLSX, PPTX, CSV, and text files with automatic text extraction
- In-session search with match highlighting
- Jump-to-bottom with smart auto-scroll
- Desktop notifications
- Dark theme, macOS-native title bar

## Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Node.js 20+
- macOS (primary target — may work on Linux/Windows with adjustments)

## Setup

```bash
git clone https://github.com/vicmaster/coide.git
cd coide
npm install
npx electron-rebuild -f -w node-pty
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build      # compile TypeScript + bundle
npm run package    # build + create distributable
```

## Architecture

```
Electron Main Process (Node.js)
├── node-pty subprocess → Claude CLI (stream-json output)
├── Permission interception + file revert system
├── IPC bridge → Renderer
└── Process management (abort via SIGTERM)

Electron Renderer Process (React)
├── Chat UI with markdown + tool cards + diff viewer
├── Sidebar (sessions, skills, commands)
├── Right Panel (agents, todo, context, files)
└── Zustand stores (persisted to localStorage)
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Shell | Electron 35, electron-vite, node-pty |
| UI | React 19, TypeScript, Tailwind CSS v3 |
| Editor | Monaco Editor (diffs) |
| Terminal | xterm.js |
| Markdown | react-markdown, shiki |
| State | Zustand with persist middleware |

## Windows Support

Looking for Windows? Check out [coide-main](https://github.com/yexi-fun/coide-main) by [@yexi-fun](https://github.com/yexi-fun) — a Windows-adapted fork of coide with full Windows compatibility.

## License

MIT
