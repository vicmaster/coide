import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useSessionsStore, type Message, type TextMessage, type ToolCallMessage, type ImageAttachment, type FileAttachment, type TaskStatus, type AgentStatus } from '../store/sessions'
import { useSettingsStore } from '../store/settings'
import MarkdownRenderer from './MarkdownRenderer'
import ToolCallCard from './ToolCallCard'
import PermissionDialog, { type PermissionRequest } from './PermissionDialog'
import SlashAutocomplete, { useSlashItems, type AutocompleteItem } from './SlashAutocomplete'
import SettingsModal from './SettingsModal'
import InSessionSearchBar from './InSessionSearchBar'
import { findMatches } from '../utils/inSessionSearch'
import { useHighlightMatches } from '../hooks/useHighlightMatches'
import type { Message } from '../store/sessions'

const EMPTY_MESSAGES: Message[] = []

type ClaudeEventBase = { coideSessionId?: string }

type ClaudeEvent = ClaudeEventBase & (
  | { type: 'tool_start'; tool_id: string; tool_name: string }
  | { type: 'tool_input'; tool_id: string; tool_name?: string; input: Record<string, unknown>; originalContent?: string | null }
  | { type: 'tool_result'; tool_id: string; content: string }
  | { type: 'tool_denied'; tool_id: string; tool_name: string; input: Record<string, unknown>; originalContent?: string | null }
  | { type: 'usage'; input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number }
  | { type: 'result'; result: string; session_id: string; is_error: boolean }
  | { type: 'error'; result: string }
  | { type: 'stream_end' }
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
  const [input, setInput] = useState('')
  const [loadingSessions, setLoadingSessions] = useState<Set<string>>(new Set())
  const [permissionQueue, setPermissionQueue] = useState<(PermissionRequest & { coideSessionId?: string })[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const [showJumpBottom, setShowJumpBottom] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)
  const permCleanupRef = useRef<(() => void) | null>(null)
  // Tracks tool_start before tool_input arrives (contains name before input is parsed)
  const pendingToolsRef = useRef<Map<string, string>>(new Map())
  const [acSelectedIndex, setAcSelectedIndex] = useState(0)
  const [stagedImages, setStagedImages] = useState<ImageAttachment[]>([])
  const [stagedFiles, setStagedFiles] = useState<FileAttachment[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const dragCounterRef = useRef(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const skipPermissions = useSettingsStore((s) => s.skipPermissions)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const defaultCwd = useSettingsStore((s) => s.defaultCwd)
  const [homedir, setHomedir] = useState('')

  useEffect(() => {
    window.api.system.homedir().then(setHomedir)
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
  const CONTEXT_LIMIT = 200_000
  const usagePct = usage ? Math.min(((usage.inputTokens + usage.outputTokens) / CONTEXT_LIMIT) * 100, 100) : 0

  // Scroll to bottom instantly on session switch or initial load
  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [activeSessionId])

  // Only auto-scroll when user is near the bottom (not reading history)
  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 150) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

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

  // Reset textarea height when input is cleared
  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input])

  const searchMatches = searchOpen ? findMatches(messages, searchQuery) : []
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
      const { addMessage, updateClaudeSessionId, updateToolResult, addTask, updateTask, setTasks, removeTask, setTaskId, addAgent, updateAgent, addUsage } =
        useSessionsStore.getState()
      // Route events to the session identified by coideSessionId tag
      const sid = event.coideSessionId ?? useSessionsStore.getState().activeSessionId
      if (!sid) return

      if (event.type === 'usage') {
        addUsage(sid, {
          inputTokens: event.input_tokens,
          outputTokens: event.output_tokens,
          cacheCreationTokens: event.cache_creation_input_tokens,
          cacheReadTokens: event.cache_read_input_tokens
        })
        return
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


  const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

  const processImageFile = useCallback(async (file: File): Promise<void> => {
    if (!SUPPORTED_TYPES.includes(file.type)) return
    // Read as data URL for rendering (handles any file size)
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    })
    // Extract raw base64 from data URL to send to main process for saving to disk
    const base64 = dataUrl.split(',')[1]
    const path = await window.api.claude.saveImage(base64, file.type)
    setStagedImages((prev) => [...prev, { path, mediaType: file.type, dataUrl }])
  }, [])

  const processAttachedFile = useCallback(async (file: File) => {
    setFileError(null)
    try {
      // For images, use the existing image pipeline
      if (SUPPORTED_TYPES.includes(file.type)) {
        await processImageFile(file)
        return
      }
      // Electron exposes file.path on dropped files (requires sandbox: false)
      let filePath = (file as File & { path?: string }).path
      if (!filePath) {
        // Fallback: save the file to a temp location via main process
        const buffer = await file.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        // Convert in chunks to avoid "Maximum call stack size exceeded" for large files
        let binary = ''
        const chunkSize = 8192
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
        }
        const base64 = btoa(binary)
        const tempPath = await window.api.claude.saveTempFile(base64, file.name)
        if (!tempPath) {
          setFileError('Could not read file path')
          return
        }
        filePath = tempPath
      }
      const result = await window.api.claude.processFile(filePath)
      if (result.error) {
        setFileError(result.error)
        setTimeout(() => setFileError(null), 5000)
        return
      }
      if (result.category === 'image') {
        // Process as image for preview
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
        const base64 = dataUrl.split(',')[1]
        const path = await window.api.claude.saveImage(base64, file.type)
        setStagedImages((prev) => [...prev, { path, mediaType: file.type, dataUrl }])
      } else {
        setStagedFiles((prev) => [...prev, result as FileAttachment])
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to attach file'
      setFileError(message)
      setTimeout(() => setFileError(null), 5000)
    }
  }, [processImageFile])

  const pickFiles = useCallback(async () => {
    setFileError(null)
    const paths = await window.api.dialog.pickFiles()
    if (!paths) return
    for (const filePath of paths) {
      const result = await window.api.claude.processFile(filePath)
      if (result.error) {
        setFileError(result.error)
        setTimeout(() => setFileError(null), 5000)
        return
      }
      // Images from the file picker get the path — Claude CLI can read them directly
      // All files (including images) go into stagedFiles with their extracted info
      setStagedFiles((prev) => [...prev, result as FileAttachment])
    }
  }, [])

  const removeFile = useCallback((id: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id))
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

  // Paste handler for images
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const handlePaste = async (e: ClipboardEvent): Promise<void> => {
      const items = Array.from(e.clipboardData?.items ?? [])
      for (const item of items) {
        if (item.kind === 'file' && SUPPORTED_TYPES.includes(item.type)) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) await processImageFile(file)
        }
      }
    }
    textarea.addEventListener('paste', handlePaste)
    return () => textarea.removeEventListener('paste', handlePaste)
  }, [processImageFile])

  const removeImage = useCallback((index: number) => {
    setStagedImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handlePermissionRespond = (approved: boolean): void => {
    const current = permissionQueue[0]
    setPermissionQueue((q) => q.slice(1))
    window.api.claude.respondPermission(approved, current?.coideSessionId)
  }

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    const currentActiveId = useSessionsStore.getState().activeSessionId
    if ((!text.trim() && stagedImages.length === 0 && stagedFiles.length === 0) || (currentActiveId && loadingSessions.has(currentActiveId))) return

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

    // Capture staged attachments before clearing
    const images = [...stagedImages]
    const files = [...stagedFiles]

    setInput('')
    setStagedImages([])
    setStagedFiles([])
    pendingToolsRef.current.clear()

    let sid = useSessionsStore.getState().activeSessionId
    if (!sid) {
      const defaultCwd = localStorage.getItem('cwd') ?? defaultCwd
      sid = useSessionsStore.getState().createSession(defaultCwd)
    }

    setLoadingSessions((prev) => new Set(prev).add(sid!))

    // Append image paths to prompt so Claude CLI picks them up
    if (images.length > 0) {
      const imagePaths = images.map((img) => `[Image: ${img.path}]`).join('\n')
      prompt = `${prompt}\n\n${imagePaths}`
    }

    // Append file contents wrapped in tags (or as image paths for image files)
    if (files.length > 0) {
      const imageFiles = files.filter((f) => f.category === 'image')
      if (imageFiles.length > 0) {
        const imgPaths = imageFiles.map((f) => `[Image: ${f.path}]`).join('\n')
        prompt = `${prompt}\n\n${imgPaths}`
      }
      const fileParts = files
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
      ...(images.length > 0 ? { images } : {}),
      ...(files.length > 0 ? { files: files.map(({ extractedText: _, ...f }) => f) } : {})
    }
    useSessionsStore.getState().addMessage(sid, userMessage)

    const session = useSessionsStore.getState().sessions.find((s) => s.id === sid)!

    try {
      await window.api.claude.query(prompt, session.cwd, session.claudeSessionId, sid)
    } catch (err) {
      useSessionsStore
        .getState()
        .addMessage(sid, { id: Date.now().toString(), role: 'error', text: String(err) })
      setLoadingSessions((prev) => { const next = new Set(prev); next.delete(sid!); return next })
    }
  }, [loadingSessions, stagedImages, stagedFiles])

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

  const handleSend = async (): Promise<void> => {
    await sendMessage(input)
  }

  // Consume pending actions from Sidebar (skills run / command insert)
  const pendingAction = useSessionsStore((state) => state.pendingAction)
  useEffect(() => {
    if (!pendingAction) return
    useSessionsStore.getState().clearPendingAction()
    if (pendingAction.type === 'send') {
      sendMessage(pendingAction.text)
    } else if (pendingAction.type === 'insert') {
      setInput(pendingAction.text)
    }
  }, [pendingAction, sendMessage])

  // Slash autocomplete
  const slashQuery = input.startsWith('/') && !input.includes(' ') ? input.slice(1) : null
  const acItems = useSlashItems(slashQuery ?? '', cwd)
  const autocompleteVisible = slashQuery !== null && !isLoading && acItems.length > 0

  // Reset selection when query changes
  useEffect(() => {
    setAcSelectedIndex(0)
  }, [slashQuery])

  const executeCommand = useCallback((name: string): void => {
    setInput('')
    const store = useSessionsStore.getState()
    let sid = store.activeSessionId
    if (!sid) {
      sid = store.createSession(localStorage.getItem('cwd') ?? defaultCwd)
    }
    const session = useSessionsStore.getState().sessions.find((s) => s.id === sid)!
    const addInfo = (text: string): void => {
      useSessionsStore.getState().addMessage(sid!, {
        id: Date.now().toString(),
        role: 'assistant',
        text
      })
    }

    switch (name) {
      case 'clear':
        useSessionsStore.getState().clearMessages(sid)
        break
      case 'help':
        addInfo(
          `**Available commands:**\n\n` +
          `| Command | Description |\n|---|---|\n` +
          `| /clear | Clear conversation history |\n` +
          `| /status | Show session status |\n` +
          `| /cost | Show token usage |\n` +
          `| /help | Show this help |\n` +
          `| /compact | Compact conversation context |\n` +
          `| /init | Initialize project with CLAUDE.md |\n` +
          `| /review | Review recent changes |\n` +
          `| /pr-review | Review a pull request |\n` +
          `| /doctor | Check Claude Code health |\n` +
          `| /memory | Edit CLAUDE.md memory |\n\n` +
          `Skills are also available — type \`/\` to see them.`
        )
        break
      case 'status':
        addInfo(
          `**Session status**\n\n` +
          `- **CWD:** \`${session.cwd}\`\n` +
          `- **Session ID:** \`${session.claudeSessionId ?? 'not started'}\`\n` +
          `- **Messages:** ${session.messages.length}\n` +
          `- **Created:** ${new Date(session.createdAt).toLocaleString()}`
        )
        break
      case 'cost':
        addInfo(`**Token usage** — Cost tracking is not yet available in coide.`)
        break
      default:
        // Commands like /compact, /review, /init etc. — send as a prompt to Claude.
        // Claude understands the intent even without the / prefix.
        sendMessage(name)
        break
    }
  }, [sendMessage])

  const handleAutocompleteSelect = useCallback((item: AutocompleteItem): void => {
    if (item.type === 'skill') {
      sendMessage('/' + item.name)
    } else {
      executeCommand(item.name)
    }
  }, [sendMessage, executeCommand])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (autocompleteVisible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAcSelectedIndex((i) => (i + 1) % acItems.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAcSelectedIndex((i) => (i - 1 + acItems.length) % acItems.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        handleAutocompleteSelect(acItems[acSelectedIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setInput('')
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

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
        </div>
        <div className="flex items-center gap-2">
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

      {/* Messages */}
      <div ref={messagesRef} className={`flex-1 overflow-y-auto px-6 py-4 space-y-4 relative ${fontSize === 'small' ? 'text-[13px]' : fontSize === 'large' ? 'text-[17px]' : 'text-[15px]'}`}>
        {messages.length === 0 && !isLoading && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-[32px] font-semibold tracking-tight text-white/[0.07]">coide</p>
            <p className="text-xs text-white/20">Start typing or pick a skill from the sidebar</p>
          </div>
        )}

        {messages.map((msg) => {
          if (editingMessageId === msg.id && msg.role === 'user') {
            const textMsg = msg as TextMessage
            return (
              <div key={msg.id} data-message-id={msg.id} className="flex justify-end">
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
                      if (e.key === 'Escape') {
                        setEditingMessageId(null)
                        setEditText('')
                      }
                    }}
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => { setEditingMessageId(null); setEditText('') }}
                      className="rounded-lg px-3 py-1 text-xs text-white/50 hover:text-white/80 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!editText.trim()}
                      onClick={() => {
                        const mid = editingMessageId!
                        const text = editText
                        setEditingMessageId(null)
                        setEditText('')
                        editAndResend(mid, text)
                      }}
                      className="rounded-lg bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-400 disabled:opacity-25 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )
          }
          return (
            <div key={msg.id} data-message-id={msg.id}>
              <MessageRow
                message={msg}
                isLoading={isLoading}
                onEdit={msg.role === 'user' && !isLoading ? (id, text) => { setEditingMessageId(id); setEditText(text) } : undefined}
              />
            </div>
          )
        })}

        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-2 w-2 rounded-full bg-white/40 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Jump to bottom */}
      {showJumpBottom && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute left-1/2 -translate-x-1/2 bottom-[90px] z-10 rounded-full bg-white/[0.1] border border-white/[0.1] px-3 py-1.5 text-[11px] text-white/50 hover:text-white/80 hover:bg-white/[0.15] transition-all backdrop-blur-sm shadow-lg flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          Jump to bottom
        </button>
      )}

      {/* Input */}
      <div className="border-t border-white/[0.06] p-3 relative">
        {autocompleteVisible && (
          <SlashAutocomplete
            items={acItems}
            selectedIndex={acSelectedIndex}
            onSelect={handleAutocompleteSelect}
            onHover={setAcSelectedIndex}
          />
        )}
        {/* File error toast */}
        {fileError && (
          <div className="mb-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-400 flex items-center justify-between">
            <span>{fileError}</span>
            <button onClick={() => setFileError(null)} className="text-red-400/50 hover:text-red-400 ml-2">×</button>
          </div>
        )}
        {/* Staged attachments */}
        {(stagedImages.length > 0 || stagedFiles.length > 0) && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {stagedImages.map((img, i) => (
              <div key={`img-${i}`} className="relative group">
                <img
                  src={img.dataUrl}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover border border-white/10"
                />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
            {stagedFiles.map((file) => (
              <div key={file.id} className="relative group flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
                <span className="text-[10px] text-white/30 font-mono uppercase">{file.name.split('.').pop()}</span>
                <span className="text-[12px] text-white/60 max-w-[120px] truncate">{file.name}</span>
                <span className="text-[10px] text-white/20">{file.size < 1024 ? `${file.size}B` : file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(0)}KB` : `${(file.size / 1024 / 1024).toFixed(1)}MB`}</span>
                <button
                  onClick={() => removeFile(file.id)}
                  className="text-white/20 hover:text-red-400 transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 focus-within:border-white/[0.15] transition-colors">
          <button
            onClick={pickFiles}
            disabled={isLoading}
            title="Attach files"
            className="flex-shrink-0 text-white/25 hover:text-white/50 transition-colors disabled:opacity-25 pb-0.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              // Auto-resize: reset height to measure scrollHeight, then clamp
              const el = e.target
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 300) + 'px'
            }}
            onKeyDown={handleKeyDown}
            placeholder="Message Claude…"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent text-sm text-white/90 placeholder-white/20 outline-none disabled:opacity-40 leading-relaxed"
            style={{ maxHeight: '300px', overflow: 'auto' }}
          />
          <button
            onClick={handleSend}
            disabled={(!input.trim() && stagedImages.length === 0 && stagedFiles.length === 0) || isLoading}
            className="flex-shrink-0 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-25"
          >
            Send
          </button>
        </div>
        {claudeSessionId && (
          <p className="mt-1.5 text-center text-[10px] text-white/15 font-mono">
            {claudeSessionId.slice(0, 8)}…
          </p>
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
    </div>
  )
}

const MessageRow = React.memo(function MessageRow({ message, isLoading, onEdit }: { message: Message; isLoading?: boolean; onEdit?: (id: string, text: string) => void }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  if (message.role === 'tool_call') {
    return <ToolCallCard message={message as ToolCallMessage} isLoading={isLoading} />
  }

  if (message.role === 'user') {
    const textMsg = message as TextMessage
    return (
      <div className="flex justify-end group/msg">
        <div className="relative max-w-[75%] rounded-2xl bg-blue-600 px-4 py-3 text-white">
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
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-red-400 whitespace-pre-wrap">
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
    <div className="group/msg relative max-w-[85%] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white/90">
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
