import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ImageAttachment = { path: string; mediaType: string; dataUrl: string }

export type FileAttachment = {
  id: string
  name: string
  path: string
  size: number
  category: 'image' | 'document' | 'text'
  extractedText?: string
  dataUrl?: string // only for images (preview)
}

export type TextMessage = {
  id: string
  role: 'user' | 'assistant' | 'error'
  text: string
  timestamp?: number
  images?: ImageAttachment[]
  files?: FileAttachment[]
}

export type ToolCallMessage = {
  id: string
  role: 'tool_call'
  tool_id: string
  tool_name: string
  input: Record<string, unknown>
  result?: string
  denied?: boolean
  originalContent?: string | null
  timestamp?: number
}

export type Message = TextMessage | ToolCallMessage

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type Task = {
  taskId: string
  subject: string
  description: string
  activeForm?: string
  status: TaskStatus
  createdByToolId: string
}

export type SessionUsage = {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type Agent = {
  toolId: string
  name: string
  subagentType: string
  status: AgentStatus
  startedAt: number
  durationMs?: number
  totalTokens?: number
}

export type McpServerInfo = {
  name: string
  status: 'connected' | 'failed' | 'pending'
  tools: string[]
  command?: string
  args?: string[]
  url?: string
  scope?: 'global' | 'project'
}

export type QueuedMessage = {
  text: string
  images?: ImageAttachment[]
  files?: FileAttachment[]
}

export type WorktreeInfo = {
  name: string
  branch: string
  path: string
}

export type Session = {
  id: string
  claudeSessionId: string | null
  title: string
  cwd: string
  createdAt: number
  messages: Message[]
  tasks: Task[]
  agents: Agent[]
  branch?: string
  isGitRepo?: boolean
  worktree?: WorktreeInfo | null
  usage: SessionUsage
  mcpServers?: McpServerInfo[]
  queuedMessage?: QueuedMessage | null
  autoCompacted?: boolean
  pendingAutoCompact?: boolean
  forkOf?: { sessionId: string; messageId: string; title: string }
}

export type PendingAction = { type: 'send' | 'insert'; text: string }

type SessionsStore = {
  sessions: Session[]
  activeSessionId: string | null
  pendingAction: PendingAction | null
  createSession: (cwd: string) => string
  setActiveSession: (id: string) => void
  addMessage: (sessionId: string, message: Message) => void
  updateToolResult: (sessionId: string, toolId: string, content: string) => void
  updateClaudeSessionId: (sessionId: string, claudeSessionId: string | null) => void
  updateSessionCwd: (sessionId: string, cwd: string) => void
  clearMessages: (sessionId: string) => void
  restartSession: (sessionId: string) => void
  renameSession: (sessionId: string, title: string) => void
  deleteSession: (sessionId: string) => void
  addTask: (sessionId: string, task: Task) => void
  updateTask: (sessionId: string, taskId: string, updates: Partial<Task>) => void
  setTasks: (sessionId: string, tasks: Task[]) => void
  setTaskId: (sessionId: string, toolId: string, realTaskId: string) => void
  removeTask: (sessionId: string, taskId: string) => void
  addUsage: (sessionId: string, delta: SessionUsage) => void
  addAgent: (sessionId: string, agent: Agent) => void
  updateAgent: (sessionId: string, toolId: string, updates: Partial<Agent>) => void
  setGitInfo: (sessionId: string, info: { isGitRepo: boolean; branch?: string }) => void
  setWorktree: (sessionId: string, worktree: WorktreeInfo | null) => void
  setMcpServers: (sessionId: string, servers: McpServerInfo[]) => void
  setQueuedMessage: (sessionId: string, msg: QueuedMessage) => void
  clearQueuedMessage: (sessionId: string) => QueuedMessage | null
  forkSession: (sourceSessionId: string, upToMessageId?: string) => string
  truncateAtMessage: (sessionId: string, messageId: string) => void
  setAutoCompacted: (sessionId: string, value: boolean) => void
  setPendingAutoCompact: (sessionId: string, value: boolean) => void
  setPendingAction: (action: PendingAction) => void
  clearPendingAction: () => void
}

export const useSessionsStore = create<SessionsStore>()(
  persist(
    (set) => ({
      sessions: [],
      activeSessionId: null,
      pendingAction: null,

      createSession: (cwd: string) => {
        const id = crypto.randomUUID()
        const session: Session = {
          id,
          claudeSessionId: null,
          title: 'New session',
          cwd,
          createdAt: Date.now(),
          messages: [],
          tasks: [],
          agents: [],
          usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }
        }
        set((state) => ({ sessions: [session, ...state.sessions], activeSessionId: id }))
        return id
      },

      setActiveSession: (id: string) => {
        set({ activeSessionId: id })
      },

      addMessage: (sessionId: string, message: Message) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            const stamped = message.timestamp ? message : { ...message, timestamp: Date.now() }
            const messages = [...s.messages, stamped]
            const title =
              s.title === 'New session' && stamped.role === 'user'
                ? (stamped as TextMessage).text.slice(0, 40)
                : s.title
            return { ...s, messages, title }
          })
        }))
      },

      updateToolResult: (sessionId: string, toolId: string, content: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            return {
              ...s,
              messages: s.messages.map((m) =>
                m.role === 'tool_call' && (m as ToolCallMessage).tool_id === toolId
                  ? { ...m, result: content }
                  : m
              )
            }
          })
        }))
      },

      updateClaudeSessionId: (sessionId: string, claudeSessionId: string | null) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, claudeSessionId } : s
          )
        }))
      },

      updateSessionCwd: (sessionId: string, cwd: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, cwd } : s
          )
        }))
      },

      clearMessages: (sessionId: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, messages: [], tasks: [], agents: [], usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }, title: 'New session', autoCompacted: false, pendingAutoCompact: false } : s
          )
        }))
      },

      restartSession: (sessionId: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, claudeSessionId: null, autoCompacted: false, pendingAutoCompact: false } : s
          )
        }))
      },

      renameSession: (sessionId: string, title: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, title: title.trim() || s.title } : s
          )
        }))
      },

      deleteSession: (sessionId: string) => {
        // Tear down the long-lived Claude PTY for this session before forgetting it
        try { window.api.claude.dispose(sessionId) } catch { /* ignore */ }
        set((state) => {
          const sessions = state.sessions.filter((s) => s.id !== sessionId)
          const activeSessionId =
            state.activeSessionId === sessionId
              ? (sessions[0]?.id ?? null)
              : state.activeSessionId
          return { sessions, activeSessionId }
        })
      },

      addTask: (sessionId: string, task: Task) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, tasks: [...(s.tasks ?? []), task] } : s
          )
        }))
      },

      setTasks: (sessionId: string, tasks: Task[]) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, tasks } : s
          )
        }))
      },

      updateTask: (sessionId: string, taskId: string, updates: Partial<Task>) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            return {
              ...s,
              tasks: (s.tasks ?? []).map((t) =>
                t.taskId === taskId ? { ...t, ...updates } : t
              )
            }
          })
        }))
      },

      setTaskId: (sessionId: string, toolId: string, realTaskId: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            return {
              ...s,
              tasks: (s.tasks ?? []).map((t) =>
                t.createdByToolId === toolId ? { ...t, taskId: realTaskId } : t
              )
            }
          })
        }))
      },

      removeTask: (sessionId: string, taskId: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            return { ...s, tasks: (s.tasks ?? []).filter((t) => t.taskId !== taskId) }
          })
        }))
      },

      addUsage: (sessionId: string, delta: SessionUsage) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            const u = s.usage
            return {
              ...s,
              usage: {
                inputTokens: u.inputTokens + delta.inputTokens,
                outputTokens: u.outputTokens + delta.outputTokens,
                cacheCreationTokens: u.cacheCreationTokens + delta.cacheCreationTokens,
                cacheReadTokens: u.cacheReadTokens + delta.cacheReadTokens
              }
            }
          })
        }))
      },

      addAgent: (sessionId: string, agent: Agent) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, agents: [...(s.agents ?? []), agent] } : s
          )
        }))
      },

      updateAgent: (sessionId: string, toolId: string, updates: Partial<Agent>) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            return {
              ...s,
              agents: (s.agents ?? []).map((a) =>
                a.toolId === toolId ? { ...a, ...updates } : a
              )
            }
          })
        }))
      },

      setGitInfo: (sessionId: string, info: { isGitRepo: boolean; branch?: string }) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, isGitRepo: info.isGitRepo, branch: info.branch } : s
          )
        }))
      },

      setWorktree: (sessionId: string, worktree: WorktreeInfo | null) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, worktree, ...(worktree ? { branch: worktree.branch } : {}) } : s
          )
        }))
      },

      setMcpServers: (sessionId: string, servers: McpServerInfo[]) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, mcpServers: servers } : s
          )
        }))
      },

      setQueuedMessage: (sessionId: string, msg: QueuedMessage) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, queuedMessage: msg } : s
          )
        }))
      },

      clearQueuedMessage: (sessionId: string) => {
        let queued: QueuedMessage | null = null
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            queued = s.queuedMessage ?? null
            return { ...s, queuedMessage: null }
          })
        }))
        return queued
      },

      forkSession: (sourceSessionId: string, upToMessageId?: string) => {
        let newId = ''
        set((state) => {
          const source = state.sessions.find((s) => s.id === sourceSessionId)
          if (!source) return state

          const cutIndex = upToMessageId
            ? source.messages.findIndex((m) => m.id === upToMessageId)
            : source.messages.length
          const sliceEnd = cutIndex === -1 ? source.messages.length : cutIndex

          const messages = source.messages.slice(0, sliceEnd).map((m) => ({
            ...m,
            id: crypto.randomUUID()
          }))

          const lastMsgId = messages.length > 0 ? source.messages[sliceEnd - 1]?.id ?? '' : ''

          newId = crypto.randomUUID()
          const forked: Session = {
            id: newId,
            claudeSessionId: null,
            title: `${source.title.slice(0, 30)} – fork`,
            cwd: source.cwd,
            createdAt: Date.now(),
            messages,
            tasks: [],
            agents: [],
            branch: source.branch,
            isGitRepo: source.isGitRepo,
            worktree: null,
            usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
            mcpServers: source.mcpServers ? [...source.mcpServers] : undefined,
            forkOf: { sessionId: sourceSessionId, messageId: lastMsgId, title: source.title }
          }
          return {
            sessions: [forked, ...state.sessions],
            activeSessionId: newId
          }
        })
        return newId
      },

      truncateAtMessage: (sessionId: string, messageId: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            const idx = s.messages.findIndex((m) => m.id === messageId)
            if (idx === -1) return s
            return {
              ...s,
              messages: s.messages.slice(0, idx),
              claudeSessionId: null,
              tasks: [],
              agents: [],
              usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }
            }
          })
        }))
      },

      setAutoCompacted: (sessionId: string, value: boolean) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, autoCompacted: value } : s
          )
        }))
      },

      setPendingAutoCompact: (sessionId: string, value: boolean) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, pendingAutoCompact: value } : s
          )
        }))
      },

      setPendingAction: (action: PendingAction) => {
        set({ pendingAction: action })
      },

      clearPendingAction: () => {
        set({ pendingAction: null })
      }
    }),
    {
      name: 'coide-sessions',
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId
      }),
      skipHydration: true,
      merge: (persisted, current) => {
        const stored = persisted as Partial<SessionsStore> | undefined
        const sessions = (stored?.sessions ?? current.sessions).map((s) => ({
          ...s,
          tasks: s.tasks ?? [],
          agents: s.agents ?? [],
          usage: s.usage ?? { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }
        }))
        return { ...current, ...stored, sessions }
      },
    }
  )
)
