# Coide Performance Audit Log

**Audit performed:** 2026-03-18

---

## Critical — Memory Leaks & Hard Hangs

- [x] ~~2026-03-18~~ Unbounded `lineBuffer` string accumulation — added 1 MB cap with truncation (`src/main/claude.ts`)
- [x] ~~2026-03-18~~ Unbounded `pendingEventBuffer` array — added 500-event cap (`src/main/claude.ts`)
- [x] ~~2026-03-18~~ Blocking `readFileSync` / `writeFileSync` / `unlinkSync` on main thread — replaced with async `fs/promises` (`src/main/claude.ts`)
- [x] ~~2026-03-18~~ Synchronous `appendFileSync` debug logging in hot loop — replaced with buffered async logger that flushes every 200ms (`src/main/claude.ts`)
- [x] ~~2026-03-18~~ Recursive `readdir` without timeout/limit — replaced with shallow `readdir` (no recursive), added 5s timeout to git ls-files (`src/main/index.ts`)
- [x] ~~2026-03-18~~ Messages list rendered without virtualization — replaced with `@tanstack/react-virtual` virtualizer with dynamic measurement (`Chat.tsx`)

## High — Bundle Size & Initial Load

- [ ] xterm eagerly imported (~6.1 MB), only used when terminal is open (`TerminalPanel.tsx:1-5`)
- [ ] Shiki preloaded with 28 languages (~3.8 MB) at module load (`MarkdownRenderer.tsx:9-23`)
- [ ] `import * as monaco` in 3 components prevents tree-shaking (~412 KB each) (`DiffViewer.tsx:3`, `FilePreviewModal.tsx:2`, `SkillEditorModal.tsx:2`)
- [ ] `reactflow` and `react-arborist` in dependencies but never imported (~1.3 MB unused) (`package.json`)
- [ ] No `React.lazy()` / code-splitting — all modals hydrated on mount (`App.tsx`, `electron.vite.config.ts`)
- [ ] No `rollupOptions.output` chunk splitting configured — 9.3 MB single JS bundle (`electron.vite.config.ts`)

## High — Unnecessary Re-renders

- [ ] Zustand selectors return new object references on every call — no `useShallow` (`Chat.tsx:87`, `Sidebar.tsx:13`, `RightPanel.tsx:75`)
- [ ] Sessions stored as array — every selector does O(n) `.find()` lookups (`store/sessions.ts:169,177,204,212...`)
- [ ] `components` object passed to ReactMarkdown created inline every render (`MarkdownRenderer.tsx:85-207`)
- [ ] `buildDiffFromToolInput()` called every render without `useMemo` (`ToolCallCard.tsx:88`)
- [ ] `findMatches()` for in-session search computed every render without `useMemo` (`Chat.tsx:139`)
- [ ] `allHistoryItems` recomputed on any session change, not just messages (`ChatInput.tsx:33-53`)
- [ ] No `React.memo` on frequently-rendered children: `ChatInput`, `CodeBlock`, `AgentNodeRow`, `SkillRow` (various)
- [ ] Inline arrays recreated every render (`Chat.tsx:657,677,940`)

## Medium — IPC & Subprocess

- [x] ~~2026-03-18~~ Dynamic `await import('child_process')` in hot IPC paths — moved to top-level import (`src/main/index.ts`)
- [ ] `mcp:list` reads 3 JSON files sequentially instead of `Promise.all` (`src/main/index.ts:342-398`)
- [ ] Terminal PTY sends every data chunk as separate IPC message — no batching (`src/main/terminal.ts:44-47`)
- [ ] `mkdir(recursive: true)` called on every image save, not cached (`src/main/index.ts:157,301`)
- [ ] PTY Map entries may not be deleted on error paths (`src/main/claude.ts:336,346`)
- [ ] XLSX/PPTX read entirely into memory synchronously up to 10 MB (`src/main/fileExtractor.ts:84,104`)

## Low — Minor Inefficiencies

- [ ] xterm CSS imported twice — component import and global styles (`TerminalPanel.tsx:5` + `index.css`)
- [ ] Status color/border class conditionals computed inline instead of memoized (`ToolCallCard.tsx:101-117`)
- [ ] Sidebar skill list handlers created inline per-item in `.map()` (`Sidebar.tsx:272-312`)
- [ ] Timeline interval cleanup race condition on unmount (`RightPanel.tsx:200-203`)
