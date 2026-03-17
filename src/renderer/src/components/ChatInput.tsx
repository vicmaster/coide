import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useSessionsStore, type ImageAttachment, type FileAttachment, type TextMessage } from '../store/sessions'
import { useSettingsStore } from '../store/settings'
import SlashAutocomplete, { useSlashItems, type AutocompleteItem } from './SlashAutocomplete'
import AtMentionAutocomplete, { useAtMentionItems, type MentionItem } from './AtMentionAutocomplete'
import HistorySearch, { type HistoryItem } from './HistorySearch'

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
      sendMessage('/' + item.name)
    } else {
      executeCommand(item.name)
    }
  }, [sendMessage, executeCommand])

  // Send handler: captures staged attachments, clears input, delegates to parent
  const handleSend = useCallback(async (): Promise<void> => {
    const text = input
    const images = [...stagedImages]
    const files = [...stagedFiles]

    if (!text.trim() && images.length === 0 && files.length === 0) return

    setInput('')
    setStagedImages([])
    setStagedFiles([])

    await sendMessage(text.trim(), images.length > 0 ? images : undefined, files.length > 0 ? files : undefined)
  }, [input, stagedImages, stagedFiles, sendMessage])

  const handleHistorySelect = useCallback((item: HistoryItem): void => {
    setInput(item.text)
    setHistoryOpen(false)
    setHistoryQuery('')
    setHistorySelectedIndex(0)
    textareaRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
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
            const el = e.target
            requestAnimationFrame(() => {
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 300) + 'px'
            })
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
    </div>
  )
}
