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

- [x] ~~2026-03-18~~ xterm eagerly imported (~6.1 MB) — lazy-loaded via `React.lazy`, split into 426 KB chunk (`TerminalPanel.tsx`, `App.tsx`)
- [x] ~~2026-03-18~~ Shiki preloaded with 28 languages — reduced to 9 initial langs, remaining 16 loaded on demand (`MarkdownRenderer.tsx`)
- [ ] `import * as monaco` in 3 components prevents tree-shaking (~412 KB each) (`DiffViewer.tsx:3`, `FilePreviewModal.tsx:2`, `SkillEditorModal.tsx:2`)
- [x] ~~2026-03-18~~ `reactflow` and `react-arborist` in dependencies but never imported — removed from package.json
- [x] ~~2026-03-18~~ No `React.lazy()` / code-splitting — added React.lazy for TerminalPanel + 4 modals (`App.tsx`)
- [x] ~~2026-03-18~~ No `rollupOptions.output` chunk splitting — added manualChunks for monaco, xterm, shiki; main bundle 9.3 MB → 8.9 MB (`electron-vite.config.ts`)

## High — Unnecessary Re-renders

- [ ] Zustand selectors return new object references on every call — no `useShallow` (`Chat.tsx:87`, `Sidebar.tsx:13`, `RightPanel.tsx:75`)
- [ ] Sessions stored as array — every selector does O(n) `.find()` lookups (`store/sessions.ts:169,177,204,212...`)
- [x] ~~2026-03-18~~ `components` object passed to ReactMarkdown created inline every render — memoized with `useMemo` (`MarkdownRenderer.tsx`)
- [x] ~~2026-03-18~~ `buildDiffFromToolInput()` called every render without `useMemo` — wrapped in `useMemo` (`ToolCallCard.tsx`)
- [x] ~~2026-03-18~~ `findMatches()` for in-session search computed every render — wrapped in `useMemo` (`Chat.tsx`)
- [ ] `allHistoryItems` recomputed on any session change, not just messages (`ChatInput.tsx:33-53`)
- [x] ~~2026-03-18~~ No `React.memo` on frequently-rendered children — added `React.memo` to `CodeBlock`, `SkillRow` (`MarkdownRenderer.tsx`, `Sidebar.tsx`)
- [x] ~~2026-03-18~~ Inline arrays recreated every render — extracted to module-level `MODELS`, `EFFORT_LEVELS`, `BOUNCE_DOTS` constants (`Chat.tsx`)

## Medium — IPC & Subprocess

- [x] ~~2026-03-18~~ Dynamic `await import('child_process')` in hot IPC paths — moved to top-level import (`src/main/index.ts`)
- [x] ~~2026-03-18~~ `mcp:list` reads 3 JSON files sequentially — replaced with `Promise.all` (`src/main/index.ts`)
- [x] ~~2026-03-18~~ Terminal PTY sends every data chunk as separate IPC message — added 16ms batching buffer (`src/main/terminal.ts`)
- [x] ~~2026-03-18~~ `mkdir(recursive: true)` called on every image save — cached with `ensureDir()` set (`src/main/index.ts`)
- [x] ~~2026-03-18~~ PTY Map entries may not be deleted on error paths — added `.catch()` to async processToolBlocks (`src/main/claude.ts`)
- [ ] XLSX/PPTX read entirely into memory synchronously up to 10 MB (`src/main/fileExtractor.ts:84,104`)

## Low — Minor Inefficiencies

- [x] ~~2026-03-18~~ xterm CSS imported twice — verified: global CSS is only custom overrides (scrollbar), not a duplicate. Non-issue.
- [ ] Status color/border class conditionals computed inline instead of memoized (`ToolCallCard.tsx:101-117`)
- [x] ~~2026-03-18~~ Sidebar skill list handlers created inline per-item — extracted to `useCallback` handlers, added `React.memo` to `SkillRow` (`Sidebar.tsx`)
- [x] ~~2026-03-18~~ Timeline interval cleanup race condition on unmount — fixed explicit `return undefined` path (`RightPanel.tsx`)
