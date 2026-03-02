import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useSessionsStore, type Message, type ToolCallMessage, type TaskStatus, type AgentStatus } from '../store/sessions'
import { useSettingsStore } from '../store/settings'
import MarkdownRenderer from './MarkdownRenderer'
import ToolCallCard from './ToolCallCard'
import PermissionDialog, { type PermissionRequest } from './PermissionDialog'
import SlashAutocomplete, { useSlashItems, type AutocompleteItem } from './SlashAutocomplete'

type ClaudeEvent =
  | { type: 'tool_start'; tool_id: string; tool_name: string }
  | { type: 'tool_input'; tool_id: string; tool_name?: string; input: Record<string, unknown>; originalContent?: string | null }
  | { type: 'tool_result'; tool_id: string; content: string }
  | { type: 'tool_denied'; tool_id: string; tool_name: string; input: Record<string, unknown>; originalContent?: string | null }
  | { type: 'usage'; input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number }
  | { type: 'result'; result: string; session_id: string; is_error: boolean }
  | { type: 'error'; result: string }
  | { type: 'stream_end' }

export default function Chat({
  onToggleRightPanel,
  rightPanelOpen
}: {
  onToggleRightPanel: () => void
  rightPanelOpen: boolean
}): React.JSX.Element {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [permissionQueue, setPermissionQueue] = useState<PermissionRequest[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const permCleanupRef = useRef<(() => void) | null>(null)
  // Tracks tool_start before tool_input arrives (contains name before input is parsed)
  const pendingToolsRef = useRef<Map<string, string>>(new Map())
  const [acSelectedIndex, setAcSelectedIndex] = useState(0)

  const skipPermissions = useSettingsStore((s) => s.skipPermissions)
  const setSkipPermissions = useSettingsStore((s) => s.setSkipPermissions)

  // Sync persisted setting to main process on mount and when it changes
  useEffect(() => {
    window.api.settings.setSkipPermissions(skipPermissions)
  }, [skipPermissions])

  const activeSessionId = useSessionsStore((state) => state.activeSessionId)
  const messages = useSessionsStore((state) => {
    const s = state.sessions.find((s) => s.id === state.activeSessionId)
    return s?.messages ?? []
  })
  const cwd = useSessionsStore((state) => {
    const s = state.sessions.find((s) => s.id === state.activeSessionId)
    return s?.cwd ?? null
  }) ?? localStorage.getItem('cwd') ?? '/Users/victor/Projects'
  const claudeSessionId = useSessionsStore((state) => {
    const s = state.sessions.find((s) => s.id === state.activeSessionId)
    return s?.claudeSessionId ?? null
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
      const { activeSessionId: sid, addMessage, updateClaudeSessionId, updateToolResult, addTask, updateTask, setTasks, removeTask, setTaskId, addAgent, updateAgent, addUsage } =
        useSessionsStore.getState()
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
        if (tool_name === 'Task') {
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
        setIsLoading(false)
        setPermissionQueue([])
      }

      if (event.type === 'error' && event.result) {
        addMessage(sid, { id: Date.now().toString(), role: 'error', text: event.result })
        setIsLoading(false)
        setPermissionQueue([])
        // Mark any still-running agents as failed
        const errSession = useSessionsStore.getState().sessions.find((s) => s.id === sid)
        errSession?.agents?.filter((a) => a.status === 'running').forEach((a) => {
          updateAgent(sid, a.toolId, { status: 'failed' })
        })
      }

      if (event.type === 'stream_end') {
        setIsLoading(false)
        setPermissionQueue([])
        // Mark any still-running agents as failed
        const endSession = useSessionsStore.getState().sessions.find((s) => s.id === sid)
        endSession?.agents?.filter((a) => a.status === 'running').forEach((a) => {
          updateAgent(sid, a.toolId, { status: 'failed' })
        })
      }
    })

    const permCleanup = window.api.claude.onPermission((raw: unknown) => {
      const perm = raw as PermissionRequest
      // Safety net: if skip-permissions is on, auto-approve instead of showing dialog
      if (useSettingsStore.getState().skipPermissions) {
        window.api.claude.respondPermission(true)
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

  const handlePermissionRespond = (approved: boolean): void => {
    setPermissionQueue((q) => q.slice(1))
    window.api.claude.respondPermission(approved)
  }

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    if (!text.trim() || isLoading) return

    let prompt = text.trim()

    // Claude CLI treats /foo as a skill invocation. If it's not a real skill,
    // strip the leading / so it becomes a normal prompt instead of "Unknown skill" error.
    if (prompt.startsWith('/')) {
      const slashName = prompt.slice(1).split(/\s/)[0]
      const session = useSessionsStore.getState().sessions.find(
        (s) => s.id === useSessionsStore.getState().activeSessionId
      )
      const skillCwd = session?.cwd ?? localStorage.getItem('cwd') ?? '/Users/victor/Projects'
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

    setInput('')
    setIsLoading(true)
    pendingToolsRef.current.clear()
    setPermissionQueue([])

    let sid = useSessionsStore.getState().activeSessionId
    if (!sid) {
      const defaultCwd = localStorage.getItem('cwd') ?? '/Users/victor/Projects'
      sid = useSessionsStore.getState().createSession(defaultCwd)
    }

    useSessionsStore.getState().addMessage(sid, { id: Date.now().toString(), role: 'user', text: text.trim() })

    const session = useSessionsStore.getState().sessions.find((s) => s.id === sid)!

    try {
      await window.api.claude.query(prompt, session.cwd, session.claudeSessionId)
    } catch (err) {
      useSessionsStore
        .getState()
        .addMessage(sid, { id: Date.now().toString(), role: 'error', text: String(err) })
      setIsLoading(false)
    }
  }, [isLoading])

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
      sid = store.createSession(localStorage.getItem('cwd') ?? '/Users/victor/Projects')
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

  const currentPermission = permissionQueue[0] ?? null

  return (
    <div className="flex h-full flex-col">
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
              onClick={() => { window.api.claude.abort(); setPermissionQueue([]) }}
              className="rounded-md border border-red-500/20 px-2 py-0.5 text-[11px] text-red-400/80 hover:bg-red-500/10 transition-colors"
            >
              Stop
            </button>
          )}
          <button
            onClick={() => setSkipPermissions(!skipPermissions)}
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
            onClick={onToggleRightPanel}
            className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
              rightPanelOpen ? 'text-white/50 hover:text-white/70' : 'text-white/25 hover:text-white/50'
            }`}
          >
            ⊞
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-[32px] font-semibold tracking-tight text-white/[0.07]">coide</p>
            <p className="text-xs text-white/20">Start typing or pick a skill from the sidebar</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageRow key={msg.id} message={msg} />
        ))}

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
        <div className="flex items-end gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 focus-within:border-white/[0.15] transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Claude…"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent text-sm text-white/90 placeholder-white/20 outline-none disabled:opacity-40 leading-relaxed"
            style={{ maxHeight: '140px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
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
    </div>
  )
}

const MessageRow = React.memo(function MessageRow({ message }: { message: Message }): React.JSX.Element {
  if (message.role === 'tool_call') {
    return <ToolCallCard message={message as ToolCallMessage} />
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl bg-blue-600 px-4 py-3 text-sm text-white whitespace-pre-wrap">
          {message.text}
        </div>
      </div>
    )
  }

  if (message.role === 'error') {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400 whitespace-pre-wrap">
        {message.text}
      </div>
    )
  }

  return (
    <div className="max-w-[85%] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90">
      <MarkdownRenderer>{message.text}</MarkdownRenderer>
    </div>
  )
})
