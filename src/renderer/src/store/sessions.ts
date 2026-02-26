import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TextMessage = {
  id: string
  role: 'user' | 'assistant' | 'error'
  text: string
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
}

export type Message = TextMessage | ToolCallMessage

export type Session = {
  id: string
  claudeSessionId: string | null
  title: string
  cwd: string
  createdAt: number
  messages: Message[]
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
  updateClaudeSessionId: (sessionId: string, claudeSessionId: string) => void
  updateSessionCwd: (sessionId: string, cwd: string) => void
  clearMessages: (sessionId: string) => void
  deleteSession: (sessionId: string) => void
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
          messages: []
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
            const messages = [...s.messages, message]
            const title =
              s.title === 'New session' && message.role === 'user'
                ? (message as TextMessage).text.slice(0, 40)
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

      updateClaudeSessionId: (sessionId: string, claudeSessionId: string) => {
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
            s.id === sessionId ? { ...s, messages: [], title: 'New session' } : s
          )
        }))
      },

      deleteSession: (sessionId: string) => {
        set((state) => {
          const sessions = state.sessions.filter((s) => s.id !== sessionId)
          const activeSessionId =
            state.activeSessionId === sessionId
              ? (sessions[0]?.id ?? null)
              : state.activeSessionId
          return { sessions, activeSessionId }
        })
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
      })
    }
  )
)
