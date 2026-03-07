import { useEffect } from 'react'
import { useSessionsStore } from '../store/sessions'

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.metaKey) {
        // Cmd+F — Toggle in-session search (find in conversation)
        if (e.key === 'f' && !e.shiftKey) {
          e.preventDefault()
          window.dispatchEvent(new Event('coide:toggle-insession-search'))
          return
        }

        // Cmd+Shift+F — Toggle session search (cross-session)
        if (e.key === 'f' && e.shiftKey) {
          e.preventDefault()
          window.dispatchEvent(new Event('coide:toggle-search'))
          return
        }

        // Cmd+K — Clear conversation
        if (e.key === 'k') {
          e.preventDefault()
          const { activeSessionId, clearMessages } = useSessionsStore.getState()
          if (activeSessionId) clearMessages(activeSessionId)
          return
        }

        // Cmd+N — New session
        if (e.key === 'n') {
          e.preventDefault()
          const store = useSessionsStore.getState()
          const currentSession = store.sessions.find((s) => s.id === store.activeSessionId)
          const cwd = currentSession?.cwd ?? localStorage.getItem('cwd') ?? ''
          store.createSession(cwd)
          return
        }

        // Cmd+[ — Previous session
        if (e.key === '[') {
          e.preventDefault()
          const { sessions, activeSessionId, setActiveSession } = useSessionsStore.getState()
          if (sessions.length < 2 || !activeSessionId) return
          const currentIndex = sessions.findIndex((s) => s.id === activeSessionId)
          if (currentIndex === -1) return
          const prevIndex = (currentIndex - 1 + sessions.length) % sessions.length
          setActiveSession(sessions[prevIndex].id)
          return
        }

        // Cmd+] — Next session
        if (e.key === ']') {
          e.preventDefault()
          const { sessions, activeSessionId, setActiveSession } = useSessionsStore.getState()
          if (sessions.length < 2 || !activeSessionId) return
          const currentIndex = sessions.findIndex((s) => s.id === activeSessionId)
          if (currentIndex === -1) return
          const nextIndex = (currentIndex + 1) % sessions.length
          setActiveSession(sessions[nextIndex].id)
          return
        }
      }

      // Escape — Abort running Claude process for the active session
      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        window.api.claude.abort(useSessionsStore.getState().activeSessionId ?? undefined)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
