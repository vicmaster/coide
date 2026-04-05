import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useSessionsStore, type Message, type TextMessage, type ToolCallMessage, type ImageAttachment, type FileAttachment, type TaskStatus, type AgentStatus } from '../store/sessions'
import { useSettingsStore } from '../store/settings'
import MarkdownRenderer from './MarkdownRenderer'
import ToolCallCard from './ToolCallCard'
import PermissionDialog, { type PermissionRequest } from './PermissionDialog'
import ChatInput from './ChatInput'
import SettingsModal from './SettingsModal'
import StatsModal from './StatsModal'
import CopyBlocksModal from './CopyBlocksModal'
import InSessionSearchBar from './InSessionSearchBar'
import { findMatches } from '../utils/inSessionSearch'
import { useHighlightMatches } from '../hooks/useHighlightMatches'
import { parseMcpFromInit } from '../utils/mcpParsing'
import { useRateLimitStore } from '../store/rateLimit'
import { useLoopsStore } from '../store/loops'

const EMPTY_MESSAGES: Message[] = []
const BOUNCE_DOTS = [0, 1, 2]
const MODELS = ['opus', 'sonnet', 'haiku'] as const
const EFFORT_LEVELS = ['low', 'med', 'high', 'max'] as const

type ClaudeEventBase = { coideSessionId?: string }

type ClaudeEvent = ClaudeEventBase & (
  | { type: 'tool_start'; tool_id: string; tool_name: string }
  | { type: 'tool_input'; tool_id: string; tool_name?: string; input: Record<string, unknown>; originalContent?: string | null }
  | { type: 'tool_result'; tool_id: string; content: string }
  | { type: 'tool_denied'; tool_id: string; tool_name: string; input: Record<string, unknown>; originalContent?: string | null }
  | { type: 'usage'; input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number }
  | { type: 'result'; result: string; session_id: string; is_error: boolean }
  | { type: 'error'; result: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'stream_end' }
  | { type: 'system'; subtype: string; mcp_servers?: { name: string; status: string }[]; tools?: string[] }
  | { type: 'rate_limit'; status: string; resetsAt: number; rateLimitType: string }
)

export default function Chat({
  onToggleRightPanel,
  rightPanelOpen,
  onToggleTerminal,
  terminalOpen
}: {
  onToggleRightPanel: () => void
  rightPanelOpen: boolean
  onToggleTerminal?: () => void
  terminalOpen?: boolean
}): React.JSX.Element {
  const [loadingSessions, setLoadingSessions] = useState<Set<string>>(new Set())
  const loadingSessionsRef = useRef<Set<string>>(new Set())
  loadingSessionsRef.current = loadingSessions
  const [permissionQueue, setPermissionQueue] = useState<(PermissionRequest & { coideSessionId?: string })[]>([])
  const messagesRef = useRef<HTMLDivElement>(null)
  const [showJumpBottom, setShowJumpBottom] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)
  const permCleanupRef = useRef<(() => void) | null>(null)
  // Tracks tool_start before tool_input arrives (contains name before input is parsed)
  const pendingToolsRef = useRef<Map<string, string>>(new Map())
  const [isDragging, setIsDragging] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [copyBlocksOpen, setCopyBlocksOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const dragCounterRef = useRef(0)
  const sendMessageRef = useRef<((text: string, images?: ImageAttachment[], files?: FileAttachment[]) => Promise<void>) | null>(null)
  // Extended thinking state: tracks when Claude is actively reasoning
  const [thinkingSessions, setThinkingSessions] = useState<Map<string, number>>(new Map()) // sessionId → startTime

  const skipPermissions = useSettingsStore((s) => s.skipPermissions)
  const planMode = useSettingsStore((s) => s.planMode)
  const compactMode = useSettingsStore((s) => s.compactMode)
  const effort = useSettingsStore((s) => s.effort)
  const model = useSettingsStore((s) => s.model)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const defaultCwd = useSettingsStore((s) => s.defaultCwd)
  const [homedir, setHomedir] = useState('')

  useEffect(() => {
    window.api.system.homedir().then(setHomedir)
  }, [])

  useEffect(() => {
    const handler = (): void => setStatsOpen(true)
    window.addEventListener('coide:open-stats', handler)
    return () => window.removeEventListener('coide:open-stats', handler)
  }, [])

  useEffect(() => {
    const handler = (): void => setCopyBlocksOpen(true)
    window.addEventListener('coide:open-copy', handler)
    return () => window.removeEventListener('coide:open-copy', handler)
  }, [])

  useEffect(() => {
    const handleStart = (e: Event): void => {
      const { prompt, intervalMs } = (e as CustomEvent).detail
      const sid = useSessionsStore.getState().activeSessionId
      if (!sid) return

      // Stop existing loop for this session
      useLoopsStore.getState().removeLoop(sid)

      // Info message
      const fmt = intervalMs < 60_000 ? `${intervalMs / 1000}s` : intervalMs < 3_600_000 ? `${intervalMs / 60_000}m` : `${intervalMs / 3_600_000}h`
      useSessionsStore.getState().addMessage(sid, {
        id: Date.now().toString(), role: 'assistant',
        text: `Loop started: **"${prompt}"** every ${fmt}. Type \`/loop stop\` to cancel.`
      })

      // Fire first iteration immediately
      sendMessageRef.current?.(prompt)

      const intervalId = setInterval(() => {
        if (loadingSessionsRef.current.has(sid)) {
          useLoopsStore.getState().skipLoop(sid)
          return
        }
        useLoopsStore.getState().tickLoop(sid)
        sendMessageRef.current?.(prompt)
      }, intervalMs)

      useLoopsStore.getState().addLoop({
        sessionId: sid, prompt, intervalMs, intervalId,
        runCount: 1, skippedCount: 0, startedAt: Date.now()
      })
    }

    const handleStop = (): void => {
      const sid = useSessionsStore.getState().activeSessionId
      if (!sid) return
      const loops = useLoopsStore.getState()
      if (loops.loops.has(sid)) {
        loops.removeLoop(sid)
        useSessionsStore.getState().addMessage(sid, {
          id: Date.now().toString(), role: 'assistant', text: 'Loop stopped.'
        })
      }
    }

    window.addEventListener('coide:start-loop', handleStart)
    window.addEventListener('coide:stop-loop', handleStop)
    return () => {
      window.removeEventListener('coide:start-loop', handleStart)
      window.removeEventListener('coide:stop-loop', handleStop)
    }
  }, [])

  // Clean up loops when sessions are deleted
  useEffect(() => {
    return useSessionsStore.subscribe((state, prev) => {
      const removed = prev.sessions.filter((s) => !state.sessions.find((ns) => ns.id === s.id))
      for (const s of removed) {
        useLoopsStore.getState().removeLoop(s.id)
      }
    })
  }, [])

  // Sync all settings to main process on mount and whenever any setting changes
  useEffect(() => {
    const sync = (): void => {
      const { updateSettings: _, resetSettings: __, ...data } = useSettingsStore.getState()
      window.api.settings.sync(data)
    }
    sync()
    const unsub = useSettingsStore.subscribe(sync)
    return unsub
  }, [])

  const activeSessionId = useSessionsStore((state) => state.activeSessionId)
  const activeSession = useSessionsStore((state) =>
    state.sessions.find((s) => s.id === state.activeSessionId) ?? null
  )
  const messages = activeSession?.messages ?? EMPTY_MESSAGES
  const cwd = activeSession?.cwd ?? localStorage.getItem('cwd') ?? (defaultCwd || homedir)
  const claudeSessionId = activeSession?.claudeSessionId ?? null
  const usage = activeSession?.usage ?? null

  const isLoading = activeSessionId ? loadingSessions.has(activeSessionId) : false
  const CONTEXT_LIMIT = 1_000_000
  const usagePct = usage ? Math.min(((usage.inputTokens + usage.outputTokens) / CONTEXT_LIMIT) * 100, 100) : 0

  // Build virtual items: interleave date separators with messages, plus loading indicator
  type VirtualItem = { kind: 'separator'; label: string } | { kind: 'message'; msg: Message; idx: number } | { kind: 'loading' }
  const virtualItems = useMemo((): VirtualItem[] => {
    const items: VirtualItem[] = []
    for (let idx = 0; idx < messages.length; idx++) {
      const msg = messages[idx]
      if (msg.timestamp) {
        const msgDate = new Date(msg.timestamp)
        const prevMsg = idx > 0 ? messages[idx - 1] : null
        const prevDate = prevMsg?.timestamp ? new Date(prevMsg.timestamp) : null
        if (!prevDate || msgDate.toDateString() !== prevDate.toDateString()) {
          const today = new Date()
          const yesterday = new Date(today)
          yesterday.setDate(yesterday.getDate() - 1)
          let label: string
          if (msgDate.toDateString() === today.toDateString()) label = 'Today'
          else if (msgDate.toDateString() === yesterday.toDateString()) label = 'Yesterday'
          else label = msgDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
          items.push({ kind: 'separator', label })
        }
      }
      items.push({ kind: 'message', msg, idx })
    }
    if (isLoading) items.push({ kind: 'loading' })
    return items
  }, [messages, isLoading])

  // Virtualizer setup
  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => messagesRef.current,
    estimateSize: () => 80,
    overscan: 5,
    getItemKey: (index) => {
      const item = virtualItems[index]
      if (item.kind === 'separator') return `sep-${index}`
      if (item.kind === 'loading') return 'loading'
      return item.msg.id
    },
  })

  // Scroll to bottom on session switch
  useEffect(() => {
    if (virtualItems.length > 0) {
      virtualizer.scrollToIndex(virtualItems.length - 1, { align: 'end' })
    }
  }, [activeSessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll when new messages arrive (only if near bottom)
  const prevCountRef = useRef(virtualItems.length)
  useEffect(() => {
    if (virtualItems.length > prevCountRef.current) {
      const el = messagesRef.current
      if (el) {
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        if (distanceFromBottom < 200) {
          virtualizer.scrollToIndex(virtualItems.length - 1, { align: 'end', behavior: 'smooth' })
        }
      }
    }
    prevCountRef.current = virtualItems.length
  }, [virtualItems.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track scroll position to show/hide "jump to bottom" button
  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    const onScroll = (): void => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      setShowJumpBottom(distanceFromBottom > 300)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // In-session search: toggle, close on session switch, highlight matches
  useEffect(() => {
    const toggle = (): void => setSearchOpen((o) => !o)
    window.addEventListener('coide:toggle-insession-search', toggle)
    return () => window.removeEventListener('coide:toggle-insession-search', toggle)
  }, [])

  useEffect(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setActiveMatchIndex(0)
  }, [activeSessionId])

  const searchMatches = useMemo(() => searchOpen ? findMatches(messages, searchQuery) : [], [searchOpen, messages, searchQuery])
  const searchMatchCount = searchMatches.length

  useEffect(() => {
    setActiveMatchIndex(0)
  }, [searchQuery])

  const handleSearchNext = useCallback(() => {
    if (searchMatchCount === 0) return
    setActiveMatchIndex((i) => (i + 1) % searchMatchCount)
  }, [searchMatchCount])

  const handleSearchPrev = useCallback(() => {
    if (searchMatchCount === 0) return
    setActiveMatchIndex((i) => (i - 1 + searchMatchCount) % searchMatchCount)
  }, [searchMatchCount])

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setActiveMatchIndex(0)
  }, [])

  useHighlightMatches(messagesRef, searchOpen ? searchQuery : '', activeMatchIndex)

  const handlePickFolder = async (): Promise<void> => {
    const folder = await window.api.dialog.pickFolder()
    if (folder) {
      localStorage.setItem('cwd', folder)
      useSessionsStore.getState().createSession(folder)
    }
  }

  const subscribeToEvents = useCallback(() => {
    if (cleanupRef.current) cleanupRef.current()
    if (permCleanupRef.current) permCleanupRef.current()

    const cleanup = window.api.claude.onEvent((raw: unknown) => {
      const event = raw as ClaudeEvent
      const { addMessage, updateClaudeSessionId, updateToolResult, addTask, updateTask, setTasks, removeTask, setTaskId, addAgent, updateAgent, addUsage, setMcpServers } =
        useSessionsStore.getState()
      // Route events to the session identified by coideSessionId tag
      const sid = event.coideSessionId ?? useSessionsStore.getState().activeSessionId
      if (!sid) return

      if (event.type === 'system' && event.subtype === 'init') {
        if (event.mcp_servers) {
          setMcpServers(sid, parseMcpFromInit(event.mcp_servers, event.tools ?? []))
        }
        return
      }

      if (event.type === 'usage') {
        addUsage(sid, {
          inputTokens: event.input_tokens,
          outputTokens: event.output_tokens,
          cacheCreationTokens: event.cache_creation_input_tokens,
          cacheReadTokens: event.cache_read_input_tokens
        })

        // Auto-compaction check
        const { autoCompact, autoCompactThreshold } = useSettingsStore.getState()
        if (autoCompact) {
          const sess = useSessionsStore.getState().sessions.find((s) => s.id === sid)
          if (sess && sess.claudeSessionId && !sess.autoCompacted) {
            const total = sess.usage.inputTokens + sess.usage.outputTokens
            const pct = (total / 1_000_000) * 100
            if (pct >= autoCompactThreshold) {
              const isBusy = loadingSessionsRef.current.has(sid)
              if (isBusy) {
                useSessionsStore.getState().setPendingAutoCompact(sid, true)
              } else {
                useSessionsStore.getState().setAutoCompacted(sid, true)
                addMessage(sid, { id: Date.now().toString(), role: 'assistant', text: 'Context approaching limit — auto-compacting…' })
                setTimeout(() => sendMessageRef.current?.('/compact'), 150)
              }
            }
          }
        }
        return
      }

      if (event.type === 'rate_limit') {
        useRateLimitStore.getState().setWindow({
          status: event.status,
          resetsAt: event.resetsAt,
          rateLimitType: event.rateLimitType
        })
        return
      }

      if (event.type === 'thinking') {
        setThinkingSessions((prev) => {
          if (prev.has(sid)) return prev
          const next = new Map(prev)
          next.set(sid, Date.now())
          return next
        })
      }

      // Clear thinking state when Claude starts doing something (tool use, result, etc.)
      if (event.type === 'tool_start' || event.type === 'result' || event.type === 'stream_end') {
        setThinkingSessions((prev) => {
          if (!prev.has(sid)) return prev
          const next = new Map(prev)
          next.delete(sid)
          return next
        })
      }

      if (event.type === 'tool_start') {
        pendingToolsRef.current.set(event.tool_id, event.tool_name)
      }

      if (event.type === 'tool_input') {
        const tool_name = event.tool_name ?? pendingToolsRef.current.get(event.tool_id) ?? 'Unknown'
        pendingToolsRef.current.delete(event.tool_id)
        addMessage(sid, {
          id: event.tool_id,
          role: 'tool_call',
          tool_id: event.tool_id,
          tool_name,
          input: event.input,
          originalContent: event.originalContent
        })

        // Intercept task tool events
        if (tool_name === 'TaskCreate') {
          const inp = event.input as Record<string, unknown>
          addTask(sid, {
            taskId: event.tool_id, // temporary, replaced when tool_result arrives
            subject: String(inp.subject ?? ''),
            description: String(inp.description ?? ''),
            activeForm: inp.activeForm ? String(inp.activeForm) : undefined,
            status: 'pending',
            createdByToolId: event.tool_id
          })
        }

        if (tool_name === 'TaskUpdate') {
          const inp = event.input as Record<string, unknown>
          const taskId = String(inp.taskId ?? '')
          if (inp.status === 'deleted') {
            removeTask(sid, taskId)
          } else {
            const updates: Record<string, unknown> = {}
            if (inp.status) updates.status = inp.status as TaskStatus
            if (inp.subject) updates.subject = String(inp.subject)
            if (inp.description) updates.description = String(inp.description)
            if (inp.activeForm) updates.activeForm = String(inp.activeForm)
            updateTask(sid, taskId, updates)
          }
        }

        // TodoWrite sends the entire list at once: { todos: [{ content, status, activeForm }] }
        if (tool_name === 'TodoWrite') {
          const inp = event.input as Record<string, unknown>
          const todos = inp.todos as Array<Record<string, unknown>> | undefined
          if (Array.isArray(todos)) {
            const tasks = todos.map((t, i) => ({
              taskId: `todo-${i}`,
              subject: String(t.content ?? t.subject ?? ''),
              description: '',
              activeForm: t.activeForm ? String(t.activeForm) : undefined,
              status: (t.status as TaskStatus) ?? 'pending',
              createdByToolId: event.tool_id
            }))
            setTasks(sid, tasks)
          }
        }

        // Sub-agent spawned via Task tool
        if (tool_name === 'Agent' || tool_name === 'Task') {
          const inp = event.input as Record<string, unknown>
          addAgent(sid, {
            toolId: event.tool_id,
            name: String(inp.description ?? 'Sub-agent'),
            subagentType: String(inp.subagent_type ?? 'general'),
            status: 'running',
            startedAt: Date.now()
          })
        }
      }

      if (event.type === 'tool_result') {
        updateToolResult(sid, event.tool_id, event.content)

        // Extract real task ID from result like "Task #3 created successfully"
        const taskMatch = event.content?.match(/Task #(\d+)/)
        if (taskMatch) {
          setTaskId(sid, event.tool_id, taskMatch[1])
        }

        // Update agent status on completion
        const session = useSessionsStore.getState().sessions.find((s) => s.id === sid)
        const agent = session?.agents?.find((a) => a.toolId === event.tool_id)
        if (agent) {
          const updates: Partial<{ status: AgentStatus; durationMs: number; totalTokens: number }> = {
            status: 'done',
            durationMs: Date.now() - agent.startedAt
          }
          try {
            const parsed = JSON.parse(event.content)
            if (typeof parsed.totalTokens === 'number') updates.totalTokens = parsed.totalTokens
            if (typeof parsed.totalDurationMs === 'number') updates.durationMs = parsed.totalDurationMs
          } catch { /* result may not be JSON */ }
          updateAgent(sid, event.tool_id, updates)
        }
      }

      if (event.type === 'tool_denied') {
        addMessage(sid, {
          id: event.tool_id,
          role: 'tool_call',
          tool_id: event.tool_id,
          tool_name: event.tool_name,
          input: event.input,
          denied: true,
          originalContent: event.originalContent
        })
      }

      if (event.type === 'result') {
        if (event.session_id) updateClaudeSessionId(sid, event.session_id)
        const role = event.is_error ? 'error' : 'assistant'
        if (event.result) {
          addMessage(sid, { id: Date.now().toString(), role, text: event.result })
        }
        setLoadingSessions((prev) => { const next = new Set(prev); next.delete(sid); return next })
        setPermissionQueue((q) => q.filter((p) => p.coideSessionId !== sid))

        // Auto-send queued message
        const queued = useSessionsStore.getState().clearQueuedMessage(sid)
        if (queued && !event.is_error && sendMessageRef.current) {
          setTimeout(() => sendMessageRef.current?.(queued.text, queued.images, queued.files), 100)
        }

        // Deferred auto-compaction (was busy when threshold was hit)
        const resultSess = useSessionsStore.getState().sessions.find((s) => s.id === sid)
        if (resultSess?.pendingAutoCompact && !event.is_error && sendMessageRef.current) {
          useSessionsStore.getState().setPendingAutoCompact(sid, false)
          useSessionsStore.getState().setAutoCompacted(sid, true)
          addMessage(sid, { id: Date.now().toString(), role: 'assistant', text: 'Context approaching limit — auto-compacting…' })
          setTimeout(() => sendMessageRef.current?.('/compact'), 150)
        }
      }

      if (event.type === 'error' && event.result) {
        addMessage(sid, { id: Date.now().toString(), role: 'error', text: event.result })
        setLoadingSessions((prev) => { const next = new Set(prev); next.delete(sid); return next })
        setPermissionQueue((q) => q.filter((p) => p.coideSessionId !== sid))
        // Mark any still-running agents as failed
        const errSession = useSessionsStore.getState().sessions.find((s) => s.id === sid)
        errSession?.agents?.filter((a) => a.status === 'running').forEach((a) => {
          updateAgent(sid, a.toolId, { status: 'failed' })
        })
      }

      if (event.type === 'stream_end') {
        setLoadingSessions((prev) => { const next = new Set(prev); next.delete(sid); return next })
        setPermissionQueue((q) => q.filter((p) => p.coideSessionId !== sid))
        // Mark any still-running agents as failed
        const endSession = useSessionsStore.getState().sessions.find((s) => s.id === sid)
        endSession?.agents?.filter((a) => a.status === 'running').forEach((a) => {
          updateAgent(sid, a.toolId, { status: 'failed' })
        })
      }
    })

    const permCleanup = window.api.claude.onPermission((raw: unknown) => {
      const perm = raw as PermissionRequest & { coideSessionId?: string }
      // Safety net: if skip-permissions is on, auto-approve instead of showing dialog
      if (useSettingsStore.getState().skipPermissions) {
        window.api.claude.respondPermission(true, perm.coideSessionId)
        return
      }
      setPermissionQueue((q) => [...q, perm])
    })

    cleanupRef.current = cleanup
    permCleanupRef.current = permCleanup
  }, [])

  useEffect(() => {
    subscribeToEvents()
    return () => {
      cleanupRef.current?.()
      permCleanupRef.current?.()
    }
  }, [subscribeToEvents])


  const processAttachedFile = useCallback((_file: File) => {
    // Drag-and-drop on the chat area dispatches a custom event for ChatInput to handle
    window.dispatchEvent(new CustomEvent('coide:drop-file', { detail: _file }))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      await processAttachedFile(file)
    }
  }, [processAttachedFile])

  const handlePermissionRespond = (approved: boolean): void => {
    const current = permissionQueue[0]
    setPermissionQueue((q) => q.slice(1))
    window.api.claude.respondPermission(approved, current?.coideSessionId)
  }

  const sendMessage = useCallback(async (text: string, images?: ImageAttachment[], files?: FileAttachment[]): Promise<void> => {
    const currentActiveId = useSessionsStore.getState().activeSessionId
    if (!text.trim() || (currentActiveId && loadingSessions.has(currentActiveId))) return

    let prompt = text.trim()

    // Claude CLI treats /foo as a skill invocation. If it's not a real skill,
    // strip the leading / so it becomes a normal prompt instead of "Unknown skill" error.
    if (prompt.startsWith('/')) {
      const slashName = prompt.slice(1).split(/\s/)[0]
      const session = useSessionsStore.getState().sessions.find(
        (s) => s.id === useSessionsStore.getState().activeSessionId
      )
      const skillCwd = session?.cwd ?? localStorage.getItem('cwd') ?? defaultCwd
      try {
        const skills = await window.api.skills.list(skillCwd)
        const allNames = [...skills.global, ...skills.project].map((s) => s.name)
        if (!allNames.includes(slashName)) {
          prompt = prompt.slice(1) // strip leading /
        }
      } catch {
        prompt = prompt.slice(1) // on error, be safe and strip
      }
    }

    pendingToolsRef.current.clear()

    let sid = useSessionsStore.getState().activeSessionId
    if (!sid) {
      sid = useSessionsStore.getState().createSession(localStorage.getItem('cwd') ?? defaultCwd)
    }

    setLoadingSessions((prev) => new Set(prev).add(sid!))

    const imgs = images ?? []
    const fls = files ?? []

    // Build the full prompt with attachment data for Claude CLI
    if (imgs.length > 0) {
      const imagePaths = imgs.map((img) => `[Image: ${img.path}]`).join('\n')
      prompt = `${prompt}\n\n${imagePaths}`
    }
    if (fls.length > 0) {
      const imageFiles = fls.filter((f) => f.category === 'image')
      if (imageFiles.length > 0) {
        const imgPaths = imageFiles.map((f) => `[Image: ${f.path}]`).join('\n')
        prompt = `${prompt}\n\n${imgPaths}`
      }
      const fileParts = fls
        .filter((f) => f.category !== 'image' && f.extractedText)
        .map((f) => `<attached_file name="${f.name}">\n${f.extractedText}\n</attached_file>`)
      if (fileParts.length > 0) {
        prompt = `${prompt}\n\n${fileParts.join('\n\n')}`
      }
    }

    const userMessage: TextMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: text.trim(),
      ...(imgs.length > 0 ? { images: imgs } : {}),
      ...(fls.length > 0 ? { files: fls.map(({ extractedText: _, ...f }) => f) } : {})
    }
    useSessionsStore.getState().addMessage(sid, userMessage)

    const session = useSessionsStore.getState().sessions.find((s) => s.id === sid)!

    try {
      await window.api.claude.query(prompt, session.cwd, session.claudeSessionId, sid, session.worktree?.name)
    } catch (err) {
      useSessionsStore
        .getState()
        .addMessage(sid, { id: Date.now().toString(), role: 'error', text: String(err) })
      setLoadingSessions((prev) => { const next = new Set(prev); next.delete(sid!); return next })
    }
  }, [loadingSessions])

  sendMessageRef.current = sendMessage

  const editAndResend = useCallback(async (messageId: string, newText: string): Promise<void> => {
    const sid = useSessionsStore.getState().activeSessionId
    if (!sid) return

    const session = useSessionsStore.getState().sessions.find((s) => s.id === sid)
    if (!session) return

    // Collect prior conversation context (messages before the edited one)
    const msgIndex = session.messages.findIndex((m) => m.id === messageId)
    const priorMessages = session.messages.slice(0, msgIndex)

    let contextPrefix = ''
    const contextParts: string[] = []
    for (const m of priorMessages) {
      if (m.role === 'user') {
        contextParts.push(`User: ${(m as TextMessage).text}`)
      } else if (m.role === 'assistant') {
        contextParts.push(`Assistant: ${(m as TextMessage).text}`)
      }
    }
    if (contextParts.length > 0) {
      contextPrefix = `[Previous conversation]\n${contextParts.join('\n')}\n\n`
    }

    // Preserve images from the original message
    const originalMsg = session.messages[msgIndex] as TextMessage
    const images = originalMsg.images ?? []

    // Truncate messages from the edited one onward
    useSessionsStore.getState().truncateAtMessage(sid, messageId)

    // Build prompt with context + edited text + images
    let prompt = contextPrefix + newText
    if (images.length > 0) {
      const imagePaths = images.map((img) => `[Image: ${img.path}]`).join('\n')
      prompt = `${prompt}\n\n${imagePaths}`
    }

    // Add user message and send
    setLoadingSessions((prev) => new Set(prev).add(sid))
    pendingToolsRef.current.clear()

    const userMessage: TextMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: newText,
      ...(images.length > 0 ? { images } : {})
    }
    useSessionsStore.getState().addMessage(sid, userMessage)

    const updatedSession = useSessionsStore.getState().sessions.find((s) => s.id === sid)!
    try {
      await window.api.claude.query(prompt, updatedSession.cwd, updatedSession.claudeSessionId, sid)
    } catch (err) {
      useSessionsStore.getState().addMessage(sid, { id: Date.now().toString(), role: 'error', text: String(err) })
      setLoadingSessions((prev) => { const next = new Set(prev); next.delete(sid); return next })
    }
  }, [])

  const copyConversation = useCallback(() => {
    const parts: string[] = []
    for (const msg of messages) {
      if (msg.role === 'user') parts.push(`**User:** ${(msg as TextMessage).text}`)
      else if (msg.role === 'assistant') parts.push(`**Assistant:** ${(msg as TextMessage).text}`)
      else if (msg.role === 'tool_call') {
        const tc = msg as ToolCallMessage
        const inp = tc.input as Record<string, unknown>
        const summary = inp.command ?? inp.file_path ?? inp.pattern ?? ''
        parts.push(`> **Tool:** \`${tc.tool_name}\`${summary ? ` — ${summary}` : ''}`)
      }
    }
    navigator.clipboard.writeText(parts.join('\n\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [messages])

  const handleStartEdit = useCallback((id: string, text: string) => {
    setEditingMessageId(id)
    setEditText(text)
  }, [])

  // Only show permission dialogs for the currently viewed session
  const currentPermission = permissionQueue.find((p) => p.coideSessionId === activeSessionId) ?? null

  return (
    <div
      className="flex h-full flex-col relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-blue-400/50 bg-blue-500/10 px-12 py-10">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="12" y2="12" />
              <line x1="15" y1="15" x2="12" y2="12" />
            </svg>
            <p className="text-sm font-medium text-blue-300">Drop files here</p>
            <p className="text-[11px] text-blue-400/50">Images, PDFs, documents, code files, and more</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 pt-[46px] pb-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${isLoading ? 'bg-yellow-400 animate-pulse' : 'bg-green-500/70'}`}
          />
          <button
            onClick={handlePickFolder}
            className="text-xs text-white/40 font-mono truncate max-w-[260px] hover:text-white/70 transition-colors text-left"
            title="Click to change project folder"
          >
            {cwd}
          </button>
          {activeSession?.branch && (
            <span className={`flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${
              activeSession.worktree
                ? 'bg-green-500/15 text-green-400/70'
                : 'bg-white/[0.06] text-white/30'
            }`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
              {activeSession.branch}
            </span>
          )}
          {activeSession?.worktree && (
            <span className="text-[9px] font-semibold text-purple-400/50 bg-purple-500/10 px-1.5 py-0.5 rounded flex-shrink-0">
              worktree
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeSession?.worktree && !isLoading && (
            <>
              <button
                onClick={async () => {
                  const wt = activeSession.worktree!
                  const mainCwd = activeSession.cwd.replace(wt.path, '').replace(/\/$/, '') || activeSession.cwd
                  const result = await window.api.git.worktreeMerge(mainCwd, wt.branch)
                  const store = useSessionsStore.getState()
                  if (result.success) {
                    store.addMessage(activeSession.id, { id: Date.now().toString(), role: 'assistant', text: `Merged **${wt.branch}** into main branch.` })
                  } else {
                    store.addMessage(activeSession.id, { id: Date.now().toString(), role: 'error', text: `Merge failed: ${result.error}` })
                  }
                }}
                className="flex items-center gap-1 rounded-md border border-green-500/20 px-2 py-0.5 text-[11px] text-green-400/70 hover:bg-green-500/10 transition-colors"
                title="Merge worktree branch into main"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M6 21V9a9 9 0 0 0 9 9" />
                </svg>
                Merge
              </button>
              <button
                onClick={async () => {
                  const wt = activeSession.worktree!
                  const parentCwd = activeSession.cwd.replace(wt.path, '').replace(/\/$/, '') || activeSession.cwd
                  await window.api.git.worktreeRemove(parentCwd, wt.path)
                  useSessionsStore.getState().deleteSession(activeSession.id)
                }}
                className="rounded-md border border-red-500/20 px-1.5 py-0.5 text-red-400/50 hover:text-red-400/80 hover:bg-red-500/10 transition-colors"
                title="Remove worktree and delete session"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </>
          )}
          {isLoading && (
            <button
              onClick={() => { window.api.claude.abort(activeSessionId ?? undefined); setPermissionQueue((q) => q.filter((p) => p.coideSessionId !== activeSessionId)) }}
              className="rounded-md border border-red-500/20 px-2 py-0.5 text-[11px] text-red-400/80 hover:bg-red-500/10 transition-colors"
            >
              Stop
            </button>
          )}
          {usagePct >= 70 && (() => {
            const total = usage!.inputTokens + usage!.outputTokens
            const fmt = (n: number): string => n >= 1000 ? Math.round(n / 1000) + 'k' : String(n)
            const isRed = usagePct >= 90
            return (
              <button
                onClick={() => { if (!rightPanelOpen) onToggleRightPanel() }}
                title={`Context usage: ${Math.round(usagePct)}%`}
                className={`rounded-md border px-2 py-0.5 text-[11px] font-mono transition-colors flex items-center gap-1 ${
                  isRed
                    ? 'border-red-500/40 bg-red-500/10 text-red-400 animate-pulse'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                }`}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                {fmt(total)}/{fmt(CONTEXT_LIMIT)}
              </button>
            )
          })()}
          <div className="flex items-center rounded-md border border-white/[0.06] overflow-hidden" title="Model — click to switch, click active to reset to default (opus).">
            {MODELS.map((m) => {
              const isActive = model === m
              const isDefault = !model && m === 'opus'
              return (
                <button
                  key={m}
                  onClick={() => updateSettings({ model: isActive ? '' : m })}
                  className={`px-1.5 py-0.5 text-[10px] transition-colors ${
                    isActive || isDefault
                      ? 'bg-violet-500/20 text-violet-400 font-medium'
                      : 'text-white/25 hover:text-white/50 hover:bg-white/[0.04]'
                  }`}
                >
                  {m}
                </button>
              )
            })}
          </div>
          <div className="flex items-center rounded-md border border-white/[0.06] overflow-hidden" title="Effort level — controls reasoning depth. Click active level to reset to default.">
            {EFFORT_LEVELS.map((level) => {
              const value = level === 'med' ? 'medium' : level
              const isActive = effort === value
              const isDefault = !effort && value === 'high'
              return (
                <button
                  key={level}
                  onClick={() => updateSettings({ effort: isActive ? '' : value })}
                  className={`px-1.5 py-0.5 text-[10px] transition-colors ${
                    isActive
                      ? 'bg-violet-500/20 text-violet-400 font-medium'
                      : isDefault
                        ? 'text-white/40 border-b border-b-white/10'
                        : 'text-white/25 hover:text-white/50 hover:bg-white/[0.04]'
                  }`}
                >
                  {level}
                </button>
              )
            })}
          </div>
          <button
            onClick={() => updateSettings({ planMode: !planMode })}
            title={planMode ? 'Plan mode ON — Claude will plan before executing. Click to disable.' : 'Click to enable plan mode (plan before executing)'}
            className={`rounded-md px-2 py-0.5 text-[11px] transition-colors flex items-center gap-1 ${
              planMode
                ? 'border border-blue-500/40 bg-blue-500/10 text-blue-400'
                : 'text-white/25 hover:text-white/50'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            {planMode && <span>Plan</span>}
          </button>
          <button
            onClick={() => updateSettings({ compactMode: !compactMode })}
            title={compactMode ? 'Compact mode ON — denser layout. Click to disable.' : 'Click to enable compact mode (denser layout)'}
            className={`rounded-md px-2 py-0.5 text-[11px] transition-colors flex items-center gap-1 ${
              compactMode
                ? 'border border-teal-500/40 bg-teal-500/10 text-teal-400'
                : 'text-white/25 hover:text-white/50'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="3" y1="14" x2="21" y2="14" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            {compactMode && <span>Compact</span>}
          </button>
          <button
            onClick={() => updateSettings({ skipPermissions: !skipPermissions })}
            title={skipPermissions ? 'Auto-approve enabled — click to require approval' : 'Click to auto-approve all tools'}
            className={`rounded-md px-2 py-0.5 text-[11px] transition-colors flex items-center gap-1 ${
              skipPermissions
                ? 'border border-amber-500/40 bg-amber-500/10 text-amber-400'
                : 'text-white/25 hover:text-white/50'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            {skipPermissions && <span>Auto</span>}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="rounded-md px-2 py-0.5 text-white/25 hover:text-white/50 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {messages.length > 0 && (
            <button
              onClick={() => setSearchOpen((o) => !o)}
              title="Find in conversation (⌘F)"
              className={`rounded-md px-2 py-0.5 transition-colors ${searchOpen ? 'text-white/50' : 'text-white/25 hover:text-white/50'}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={copyConversation}
              title="Copy conversation as markdown"
              className={`rounded-md px-2 py-0.5 transition-colors ${copied ? 'text-green-400' : 'text-white/25 hover:text-white/50'}`}
            >
              {copied ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          )}
          {onToggleTerminal && (
            <button
              onClick={onToggleTerminal}
              title="Toggle terminal (⌘J)"
              className={`rounded-md px-2 py-0.5 transition-colors ${
                terminalOpen ? 'text-white/50 hover:text-white/70' : 'text-white/25 hover:text-white/50'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
            </button>
          )}
          <button
            onClick={onToggleRightPanel}
            className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
              rightPanelOpen ? 'text-white/50 hover:text-white/70' : 'text-white/25 hover:text-white/50'
            }`}
          >
            ⊞
          </button>
        </div>
      </div>


      {/* In-session search bar */}
      {searchOpen && (
        <InSessionSearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          matchCount={searchMatchCount}
          activeIndex={activeMatchIndex}
          onNext={handleSearchNext}
          onPrev={handleSearchPrev}
          onClose={handleSearchClose}
        />
      )}

      {/* Messages — virtualized */}
      <div ref={messagesRef} className={`flex-1 overflow-y-auto relative ${compactMode ? 'px-4 py-2' : 'px-6 py-4'} ${compactMode ? (fontSize === 'small' ? 'text-[12px]' : fontSize === 'large' ? 'text-[14px]' : 'text-[13px]') : (fontSize === 'small' ? 'text-[13px]' : fontSize === 'large' ? 'text-[17px]' : 'text-[15px]')}`}>
        {activeSession?.worktree && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-purple-500/15 bg-purple-500/[0.06] px-3 py-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400/50 flex-shrink-0">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <p className="text-[11px] text-purple-400/50">
              Worktree session — changes are isolated in <span className="font-mono font-medium">{activeSession.worktree.branch}</span>
            </p>
          </div>
        )}
        {messages.length === 0 && !isLoading && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-[32px] font-semibold tracking-tight text-white/[0.07]">coide</p>
            <p className="text-xs text-white/20">Start typing or pick a skill from the sidebar</p>
          </div>
        )}

        {virtualItems.length > 0 && (
          <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vItem) => {
              const item = virtualItems[vItem.index]

              if (item.kind === 'separator') {
                return (
                  <div
                    key={vItem.key}
                    data-index={vItem.index}
                    ref={virtualizer.measureElement}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vItem.start}px)` }}
                  >
                    <div className={`flex items-center gap-3 ${compactMode ? 'py-1' : 'py-2'}`}>
                      <div className="flex-1 h-px bg-white/[0.06]" />
                      <span className="text-[10px] font-medium text-white/25 uppercase tracking-wider">{item.label}</span>
                      <div className="flex-1 h-px bg-white/[0.06]" />
                    </div>
                  </div>
                )
              }

              if (item.kind === 'loading') {
                return (
                  <div
                    key={vItem.key}
                    data-index={vItem.index}
                    ref={virtualizer.measureElement}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vItem.start}px)` }}
                  >
                    <div className={`flex justify-start ${compactMode ? 'py-1' : 'py-2'}`}>
                      {activeSessionId && thinkingSessions.has(activeSessionId) ? (
                        <ThinkingIndicator startTime={thinkingSessions.get(activeSessionId)!} compact={compactMode} />
                      ) : (
                        <div className={`rounded-2xl border border-white/10 bg-white/5 ${compactMode ? 'px-3 py-2' : 'px-4 py-3'}`}>
                          <div className="flex gap-1">
                            {BOUNCE_DOTS.map((i) => (
                              <span key={i} className="h-2 w-2 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              }

              const msg = item.msg
              const gap = compactMode ? 'py-1' : 'py-2'

              if (editingMessageId === msg.id && msg.role === 'user') {
                const textMsg = msg as TextMessage
                return (
                  <div
                    key={vItem.key}
                    data-index={vItem.index}
                    ref={virtualizer.measureElement}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vItem.start}px)` }}
                  >
                    <div data-message-id={msg.id} className={`flex justify-end ${gap}`}>
                      <div className="max-w-[75%] w-full">
                        {textMsg.images && textMsg.images.length > 0 && (
                          <div className="flex gap-2 flex-wrap mb-2 justify-end">
                            {textMsg.images.map((img, i) => (
                              <img key={i} src={img.dataUrl} alt="" className="h-20 rounded-lg object-cover max-w-[200px]" />
                            ))}
                          </div>
                        )}
                        <textarea
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full resize-none rounded-2xl bg-blue-600 px-4 py-3 text-white outline-none text-sm leading-relaxed"
                          rows={Math.max(2, editText.split('\n').length)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') { setEditingMessageId(null); setEditText('') }
                          }}
                        />
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={() => { setEditingMessageId(null); setEditText('') }} className="rounded-lg px-3 py-1 text-xs text-white/50 hover:text-white/80 transition-colors">Cancel</button>
                          <button
                            disabled={!editText.trim()}
                            onClick={() => { const mid = editingMessageId!; const text = editText; setEditingMessageId(null); setEditText(''); editAndResend(mid, text) }}
                            className="rounded-lg bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-400 disabled:opacity-25 transition-colors"
                          >Save</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={vItem.key}
                  data-index={vItem.index}
                  ref={virtualizer.measureElement}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vItem.start}px)` }}
                >
                  <div data-message-id={msg.id} className={gap}>
                    <MessageRow
                      message={msg}
                      isLoading={isLoading}
                      onEdit={msg.role === 'user' && !isLoading ? handleStartEdit : undefined}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Jump to bottom */}
      {showJumpBottom && (
        <button
          onClick={() => virtualizer.scrollToIndex(virtualItems.length - 1, { align: 'end', behavior: 'smooth' })}
          className="absolute left-1/2 -translate-x-1/2 bottom-[90px] z-10 rounded-full bg-white/[0.1] border border-white/[0.1] px-3 py-1.5 text-[11px] text-white/50 hover:text-white/80 hover:bg-white/[0.15] transition-all backdrop-blur-sm shadow-lg flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          Jump to bottom
        </button>
      )}

      {/* Input */}
      <ChatInput cwd={cwd} isLoading={isLoading} sendMessage={sendMessage} />

      {/* Status line */}
      <div className="flex items-center justify-center gap-3 px-4 py-1 text-[10px] font-mono text-white/25 border-t border-white/[0.04]">
        <span className="text-white/35">{model || 'opus'}</span>
        {effort && <span className="text-violet-400/50">{effort}</span>}
        {usage && (() => {
          const total = usage.inputTokens + usage.outputTokens
          const fmt = (n: number): string => n >= 1_000_000 ? (n / 1_000_000).toFixed(2) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n)
          return <span>{fmt(total)} tokens · {Math.round(usagePct)}%</span>
        })()}
        {usage && (() => {
          const costPerMInput = model === 'haiku' ? 0.8 : model === 'sonnet' ? 3 : 5
          const costPerMOutput = model === 'haiku' ? 4 : model === 'sonnet' ? 15 : 25
          const cost = (usage.inputTokens * costPerMInput + usage.outputTokens * costPerMOutput) / 1_000_000
          return <span className="text-green-400/40">${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}</span>
        })()}
        <RateLimitPill />
        {claudeSessionId && (
          <span className="text-white/15">{claudeSessionId.slice(0, 8)}</span>
        )}
      </div>

      {currentPermission && (
        <PermissionDialog
          permission={currentPermission}
          queueLength={permissionQueue.length}
          onAllow={() => handlePermissionRespond(true)}
          onDeny={() => handlePermissionRespond(false)}
        />
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {statsOpen && <StatsModal onClose={() => setStatsOpen(false)} />}
      {copyBlocksOpen && <CopyBlocksModal onClose={() => setCopyBlocksOpen(false)} />}
    </div>
  )
}

function RateLimitPill(): React.JSX.Element | null {
  const fiveHour = useRateLimitStore((s) => s.windows['five_hour'])
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!fiveHour) return
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [fiveHour])

  if (!fiveHour) return null

  const isThrottled = fiveHour.status !== 'allowed'
  const resetsInMs = fiveHour.resetsAt * 1000 - now
  const resetsInMin = Math.max(0, Math.ceil(resetsInMs / 60_000))
  const hours = Math.floor(resetsInMin / 60)
  const mins = resetsInMin % 60
  const resetStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`

  if (isThrottled) {
    return <span className="text-red-400/80 animate-pulse">5h: LIMIT · resets {resetStr}</span>
  }

  // Show reset countdown when we have a valid resetsAt (always useful for 5h window)
  if (resetsInMs > 0) {
    // Color based on how close to reset (closer = more used)
    const totalWindowMs = 5 * 60 * 60 * 1000
    const elapsed = totalWindowMs - resetsInMs
    const pct = Math.min((elapsed / totalWindowMs) * 100, 100)
    const color = pct > 90 ? 'text-red-400/80' : pct > 70 ? 'text-amber-400/70' : 'text-blue-400/50'
    return <span className={color}>5h: resets {resetStr}</span>
  }

  return null
}

function ThinkingIndicator({ startTime, compact }: { startTime: number; compact: boolean }): React.JSX.Element {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startTime), 100)
    return () => clearInterval(id)
  }, [startTime])

  const secs = (elapsed / 1000).toFixed(1)

  return (
    <div className={`rounded-2xl border border-violet-500/15 bg-violet-500/5 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
      <div className="flex items-center gap-2">
        <div className="flex items-end gap-[3px]">
          {[10, 14, 8, 12].map((h, i) => (
            <span
              key={i}
              className="w-[2px] rounded-sm bg-violet-400 animate-pulse"
              style={{ height: `${h}px`, animationDelay: `${i * 200}ms`, animationDuration: `${800 + i * 150}ms` }}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-violet-400 font-mono">Thinking</span>
        <span className="text-[11px] text-violet-400/40 font-mono">{secs}s</span>
      </div>
    </div>
  )
}

const MessageRow = React.memo(function MessageRow({ message, isLoading, onEdit }: { message: Message; isLoading?: boolean; onEdit?: (id: string, text: string) => void }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const compact = useSettingsStore((s) => s.compactMode)

  if (message.role === 'tool_call') {
    return <ToolCallCard message={message as ToolCallMessage} isLoading={isLoading} />
  }

  if (message.role === 'user') {
    const textMsg = message as TextMessage
    return (
      <div className="flex justify-end group/msg">
        <div className={`relative max-w-[75%] rounded-2xl bg-blue-600 text-white ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
          {onEdit && (
            <button
              onClick={() => onEdit(textMsg.id, textMsg.text)}
              className="absolute -left-8 top-2 rounded-md p-1 text-white/0 group-hover/msg:text-white/40 hover:!text-white/70 transition-colors"
              title="Edit message"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
          {textMsg.images && textMsg.images.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {textMsg.images.map((img, i) => (
                <img
                  key={i}
                  src={img.dataUrl}
                  alt=""
                  className="h-20 rounded-lg object-cover max-w-[200px]"
                />
              ))}
            </div>
          )}
          {textMsg.files && textMsg.files.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-2">
              {textMsg.files.map((file) => (
                <span key={file.id} className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-0.5 text-[11px]">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  {file.name}
                </span>
              ))}
            </div>
          )}
          <div className="whitespace-pre-wrap">{textMsg.text}</div>
        </div>
      </div>
    )
  }

  if (message.role === 'error') {
    return (
      <div className={`rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 whitespace-pre-wrap ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
        {message.text}
      </div>
    )
  }

  const copyText = (): void => {
    const el = contentRef.current
    const plain = el?.innerText ?? message.text
    const html = el?.innerHTML ?? message.text
    navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([plain], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' })
      })
    ])
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`group/msg relative max-w-[85%] rounded-2xl border border-white/10 bg-white/5 text-white/90 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
      <button
        onClick={copyText}
        className={`absolute -right-8 top-2 rounded-md p-1 transition-colors ${copied ? 'text-green-400' : 'text-white/0 group-hover/msg:text-white/40 hover:!text-white/70'}`}
        title="Copy response"
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
      <div ref={contentRef}>
        <MarkdownRenderer>{message.text}</MarkdownRenderer>
      </div>
    </div>
  )
})
