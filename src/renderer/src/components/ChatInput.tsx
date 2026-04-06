import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useSessionsStore, type ImageAttachment, type FileAttachment, type TextMessage, type QueuedMessage } from '../store/sessions'
import { useSettingsStore } from '../store/settings'
import SlashAutocomplete, { useSlashItems, type AutocompleteItem } from './SlashAutocomplete'
import AtMentionAutocomplete, { useAtMentionItems, type MentionItem } from './AtMentionAutocomplete'
import HistorySearch, { type HistoryItem } from './HistorySearch'
import { useLoopsStore } from '../store/loops'

const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

type ChatInputProps = {
  cwd: string
  isLoading: boolean
  sendMessage: (text: string, images?: ImageAttachment[], files?: FileAttachment[]) => Promise<void>
}

export default function ChatInput({ cwd, isLoading, sendMessage }: ChatInputProps): React.JSX.Element {
  const [input, setInput] = useState('')
  const [stagedImages, setStagedImages] = useState<ImageAttachment[]>([])
  const [stagedFiles, setStagedFiles] = useState<FileAttachment[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [acSelectedIndex, setAcSelectedIndex] = useState(0)
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const defaultCwd = useSettingsStore((s) => s.defaultCwd)
  const compact = useSettingsStore((s) => s.compactMode)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historySelectedIndex, setHistorySelectedIndex] = useState(0)
  const [mentionAnchorLeft, setMentionAnchorLeft] = useState(0)
  const stashRef = useRef<string>('')
  const [hasStash, setHasStash] = useState(false)

  // Collect all past user prompts across sessions
  const sessions = useSessionsStore((s) => s.sessions)
  const allHistoryItems = useMemo((): HistoryItem[] => {
    const items: HistoryItem[] = []
    for (const session of sessions) {
      for (const msg of session.messages) {
        if (msg.role === 'user') {
          const text = (msg as TextMessage).text
          if (text.trim()) {
            items.push({ text, timestamp: msg.timestamp ?? session.createdAt, cwd: session.cwd })
          }
        }
      }
    }
    // Most recent first, deduplicate by text
    items.sort((a, b) => b.timestamp - a.timestamp)
    const seen = new Set<string>()
    return items.filter((item) => {
      if (seen.has(item.text)) return false
      seen.add(item.text)
      return true
    })
  }, [sessions])

  const filteredHistory = useMemo((): HistoryItem[] => {
    if (!historyQuery) return allHistoryItems.slice(0, 20)
    const q = historyQuery.toLowerCase()
    return allHistoryItems.filter((item) => item.text.toLowerCase().includes(q)).slice(0, 20)
  }, [allHistoryItems, historyQuery])

  // Reset textarea height when input is cleared
  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input])

  // Focus textarea on session switch
  const activeSessionId = useSessionsStore((s) => s.activeSessionId)
  useEffect(() => {
    textareaRef.current?.focus()
  }, [activeSessionId])

  // Consume pending actions from Sidebar (skills run / command insert)
  const pendingAction = useSessionsStore((state) => state.pendingAction)
  useEffect(() => {
    if (!pendingAction) return
    useSessionsStore.getState().clearPendingAction()
    if (pendingAction.type === 'send') {
      sendMessage(pendingAction.text)
    } else {
      setInput(pendingAction.text)
      textareaRef.current?.focus()
    }
  }, [pendingAction, sendMessage])

  // Slash autocomplete
  const slashQuery = input.startsWith('/') && !input.includes(' ') ? input.slice(1) : null
  const acItems = useSlashItems(slashQuery ?? '', cwd)
  const autocompleteVisible = slashQuery !== null && !isLoading && acItems.length > 0

  useEffect(() => {
    setAcSelectedIndex(0)
  }, [slashQuery])

  // @-mention autocomplete: detect @query at cursor position
  const [mentionQuery, mentionStart] = useMemo((): [string | null, number] => {
    const textarea = textareaRef.current
    if (!textarea || autocompleteVisible) return [null, -1]
    const cursor = textarea.selectionStart ?? input.length
    // Walk backward from cursor to find unescaped @
    const before = input.slice(0, cursor)
    const atIdx = before.lastIndexOf('@')
    if (atIdx < 0) return [null, -1]
    // @ must be at start or preceded by whitespace
    if (atIdx > 0 && !/\s/.test(before[atIdx - 1])) return [null, -1]
    const query = before.slice(atIdx + 1)
    // No spaces in the query (simple heuristic)
    if (/\s/.test(query)) return [null, -1]
    return [query, atIdx]
  }, [input, autocompleteVisible])

  const mentionItems = useAtMentionItems(mentionQuery, cwd)
  const mentionVisible = mentionQuery !== null && mentionQuery.length > 0 && !isLoading && mentionItems.length > 0

  useEffect(() => {
    setMentionSelectedIndex(0)
  }, [mentionQuery])

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
      case 'restart':
        window.api.claude.abort(sid)
        useSessionsStore.getState().restartSession(sid)
        addInfo('Session restarted. MCP servers will reconnect on the next message.')
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
          `| /restart | Restart Claude session (reconnects MCP servers) |\n` +
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
        addInfo(`**Token usage** — Cost tracking is not yet available in coide. Use \`/stats\` for a detailed overview.`)
        break
      case 'stats':
        window.dispatchEvent(new CustomEvent('coide:open-stats'))
        break
      case 'compact':
        if (!session.claudeSessionId) {
          addInfo('No active session to compact. Send a message first.')
          break
        }
        addInfo('Compacting context…')
        sendMessage('/compact')
        break
      case 'context':
        if (!session.claudeSessionId) {
          addInfo('No active session. Send a message first.')
          break
        }
        sendMessage('/context')
        break
      case 'copy':
        window.dispatchEvent(new CustomEvent('coide:open-copy'))
        break
      case 'loop stop':
        window.dispatchEvent(new CustomEvent('coide:stop-loop'))
        break
      case 'fork': {
        const store = useSessionsStore.getState()
        const currentSid = store.activeSessionId
        if (!currentSid) {
          addInfo('No active session to fork.')
          break
        }
        const newId = store.forkSession(currentSid)
        if (newId) {
          const forkInfo = useSessionsStore.getState().sessions.find((s) => s.id === newId)?.forkOf
          useSessionsStore.getState().addMessage(newId, {
            id: Date.now().toString(),
            role: 'assistant',
            text: `⑂ Forked from **"${forkInfo?.title ?? 'previous session'}"**. History copied up to this point.\n\nOriginal session is unchanged. The next message starts a fresh Claude session.`
          })
        }
        break
      }
      default:
        sendMessage(name)
        break
    }
  }, [sendMessage, defaultCwd])

  const handleMentionSelect = useCallback((item: MentionItem): void => {
    if (mentionStart < 0) return
    const textarea = textareaRef.current
    const cursor = textarea?.selectionStart ?? input.length
    const before = input.slice(0, mentionStart)
    const after = input.slice(cursor)
    const newInput = `${before}@${item.path} ${after}`
    setInput(newInput)
    // Place cursor after the inserted mention
    const newCursor = mentionStart + 1 + item.path.length + 1
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(newCursor, newCursor)
    })
  }, [input, mentionStart])

  const handleAutocompleteSelect = useCallback((item: AutocompleteItem): void => {
    if (item.type === 'skill') {
      // Insert into input so user can add arguments before sending
      setInput('/' + item.name + ' ')
      textareaRef.current?.focus()
    } else {
      executeCommand(item.name)
    }
  }, [executeCommand])

  // Read queued message for current session
  const queuedMessage = useSessionsStore((s) => {
    const session = s.sessions.find((sess) => sess.id === s.activeSessionId)
    return session?.queuedMessage ?? null
  })

  const activeLoop = useLoopsStore((s) => activeSessionId ? s.loops.get(activeSessionId) ?? null : null)

  // Send handler: if loading, queue the message; otherwise send immediately
  const handleSend = useCallback(async (): Promise<void> => {
    const text = input
    const images = [...stagedImages]
    const files = [...stagedFiles]

    if (!text.trim() && images.length === 0 && files.length === 0) return

    // Intercept /loop <interval> <prompt>
    const loopMatch = text.trim().match(/^\/loop\s+(\d+(?:\.\d+)?)(s|m|h)\s+(.+)$/i)
    if (loopMatch) {
      const value = parseFloat(loopMatch[1])
      const unit = loopMatch[2].toLowerCase()
      const loopPrompt = loopMatch[3].trim()
      const multiplier = unit === 's' ? 1000 : unit === 'm' ? 60_000 : 3_600_000
      const intervalMs = Math.round(value * multiplier)
      setInput('')
      window.dispatchEvent(new CustomEvent('coide:start-loop', { detail: { prompt: loopPrompt, intervalMs } }))
      return
    }

    // Intercept /loop stop
    if (text.trim().toLowerCase() === '/loop stop') {
      setInput('')
      window.dispatchEvent(new CustomEvent('coide:stop-loop'))
      return
    }

    // Intercept /rename <title> before sending to CLI
    if (text.trim().startsWith('/rename ')) {
      const newTitle = text.trim().slice('/rename '.length).trim()
      if (newTitle) {
        const sid = useSessionsStore.getState().activeSessionId
        if (sid) useSessionsStore.getState().renameSession(sid, newTitle)
      }
      setInput('')
      return
    }

    setInput('')
    setStagedImages([])
    setStagedFiles([])

    if (isLoading) {
      const sid = useSessionsStore.getState().activeSessionId
      if (sid) {
        const queued: QueuedMessage = {
          text: text.trim(),
          ...(images.length > 0 ? { images } : {}),
          ...(files.length > 0 ? { files } : {})
        }
        useSessionsStore.getState().setQueuedMessage(sid, queued)
      }
      return
    }

    await sendMessage(text.trim(), images.length > 0 ? images : undefined, files.length > 0 ? files : undefined)
  }, [input, stagedImages, stagedFiles, sendMessage, isLoading])

  const handleHistorySelect = useCallback((item: HistoryItem): void => {
    setInput(item.text)
    setHistoryOpen(false)
    setHistoryQuery('')
    setHistorySelectedIndex(0)
    textareaRef.current?.focus()
  }, [])

  const handleStash = useCallback((): void => {
    if (hasStash) {
      setInput(stashRef.current)
      stashRef.current = ''
      setHasStash(false)
      requestAnimationFrame(() => textareaRef.current?.focus())
    } else {
      if (!input.trim()) return
      stashRef.current = input
      setHasStash(true)
      setInput('')
    }
  }, [hasStash, input])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Ctrl+S to stash/restore draft
    if (e.key === 's' && e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault()
      handleStash()
      return
    }
    // Ctrl+R to open history search
    if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      setHistoryOpen((v) => !v)
      setHistoryQuery('')
      setHistorySelectedIndex(0)
      return
    }

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
    if (mentionVisible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionSelectedIndex((i) => (i + 1) % mentionItems.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionSelectedIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        handleMentionSelect(mentionItems[mentionSelectedIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        // Remove the @ trigger to dismiss
        const before = input.slice(0, mentionStart)
        const cursor = textareaRef.current?.selectionStart ?? input.length
        const after = input.slice(cursor)
        setInput(before + after)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Image processing
  const processImageFile = useCallback(async (file: File): Promise<void> => {
    if (!SUPPORTED_TYPES.includes(file.type)) return
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    })
    const base64 = dataUrl.split(',')[1]
    const path = await window.api.claude.saveImage(base64, file.type)
    setStagedImages((prev) => [...prev, { path, mediaType: file.type, dataUrl }])
  }, [])

  // File processing
  const processAttachedFile = useCallback(async (file: File) => {
    setFileError(null)
    try {
      if (SUPPORTED_TYPES.includes(file.type)) {
        await processImageFile(file)
        return
      }
      let filePath = (file as File & { path?: string }).path
      if (!filePath) {
        const buffer = await file.arrayBuffer()
        const bytes = new Uint8Array(buffer)
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
      setStagedFiles((prev) => [...prev, result as FileAttachment])
    }
  }, [])

  const removeImage = useCallback((index: number) => {
    setStagedImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const removeFile = useCallback((id: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  // Handle files dropped on chat area (dispatched from parent)
  useEffect(() => {
    const handler = (e: Event): void => {
      const file = (e as CustomEvent).detail as File
      processAttachedFile(file)
    }
    window.addEventListener('coide:drop-file', handler)
    return () => window.removeEventListener('coide:drop-file', handler)
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

  return (
    <div className="border-t border-white/[0.06] p-3 relative">
      {autocompleteVisible && (
        <SlashAutocomplete
          items={acItems}
          selectedIndex={acSelectedIndex}
          onSelect={handleAutocompleteSelect}
          onHover={setAcSelectedIndex}
        />
      )}
      {mentionVisible && (
        <AtMentionAutocomplete
          items={mentionItems}
          selectedIndex={mentionSelectedIndex}
          onSelect={handleMentionSelect}
          onHover={setMentionSelectedIndex}
          anchorLeft={mentionAnchorLeft}
        />
      )}
      {historyOpen && (
        <HistorySearch
          query={historyQuery}
          onQueryChange={(q) => { setHistoryQuery(q); setHistorySelectedIndex(0) }}
          items={filteredHistory}
          selectedIndex={historySelectedIndex}
          onSelect={handleHistorySelect}
          onHover={setHistorySelectedIndex}
          onClose={() => { setHistoryOpen(false); setHistoryQuery(''); textareaRef.current?.focus() }}
        />
      )}
      {hasStash && (
        <div className="mb-2 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-[12px] text-indigo-400/80 flex items-center justify-between">
          <span>
            <span className="font-medium">Draft stashed</span>
            <span className="text-indigo-400/50 ml-1">— Ctrl+S to restore</span>
          </span>
          <button
            onClick={() => { stashRef.current = ''; setHasStash(false) }}
            className="text-indigo-400/40 hover:text-indigo-400 ml-2 flex-shrink-0"
          >
            ×
          </button>
        </div>
      )}
      {activeLoop && (
        <div className="mb-2 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-[12px] text-green-400/80 flex items-center justify-between">
          <span className="truncate">
            <span className="font-medium">Loop active:</span>{' '}
            {activeLoop.prompt.slice(0, 40)}{activeLoop.prompt.length > 40 ? '…' : ''}{' '}
            <span className="text-green-400/50">
              every {activeLoop.intervalMs < 60_000 ? `${activeLoop.intervalMs / 1000}s` : activeLoop.intervalMs < 3_600_000 ? `${activeLoop.intervalMs / 60_000}m` : `${activeLoop.intervalMs / 3_600_000}h`}
              {' '}— run #{activeLoop.runCount}
              {activeLoop.skippedCount > 0 && ` (${activeLoop.skippedCount} skipped)`}
            </span>
          </span>
          <button
            onClick={() => { if (activeSessionId) useLoopsStore.getState().removeLoop(activeSessionId) }}
            className="text-green-400/40 hover:text-green-400 ml-2 flex-shrink-0 text-[11px] font-medium"
          >
            Stop
          </button>
        </div>
      )}
      {queuedMessage && (
        <div className="mb-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-[12px] text-yellow-400/80 flex items-center justify-between">
          <span className="truncate">
            <span className="font-medium">Queued:</span> {queuedMessage.text}
          </span>
          <button
            onClick={() => {
              const sid = useSessionsStore.getState().activeSessionId
              if (sid) useSessionsStore.getState().clearQueuedMessage(sid)
            }}
            className="text-yellow-400/40 hover:text-yellow-400 ml-2 flex-shrink-0"
          >
            ×
          </button>
        </div>
      )}
      {fileError && (
        <div className="mb-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-400 flex items-center justify-between">
          <span>{fileError}</span>
          <button onClick={() => setFileError(null)} className="text-red-400/50 hover:text-red-400 ml-2">×</button>
        </div>
      )}
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
      <div className={`flex items-end gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] focus-within:border-white/[0.15] transition-colors ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'}`}>
        <button
          onClick={pickFiles}
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
            const el = e.target
            requestAnimationFrame(() => {
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 300) + 'px'
            })
          }}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? 'Type to queue next message…' : 'Message Claude…'}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-white/90 placeholder-white/20 outline-none leading-relaxed"
          style={{ maxHeight: '300px', overflow: 'auto' }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() && stagedImages.length === 0 && stagedFiles.length === 0}
          className={`flex-shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-25 ${
            isLoading ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-blue-600 hover:bg-blue-500'
          }`}
        >
          {isLoading ? 'Queue' : 'Send'}
        </button>
      </div>
    </div>
  )
}
