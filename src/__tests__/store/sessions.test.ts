import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionsStore, type McpServerInfo } from '../../renderer/src/store/sessions'

function resetStore(): void {
  useSessionsStore.setState({ sessions: [], activeSessionId: null, pendingAction: null })
}

function createTestSession(): string {
  return useSessionsStore.getState().createSession('/tmp/test')
}

describe('Sessions Store', () => {
  beforeEach(resetStore)

  describe('createSession', () => {
    it('creates a session and sets it as active', () => {
      const id = createTestSession()
      const state = useSessionsStore.getState()
      expect(state.sessions).toHaveLength(1)
      expect(state.activeSessionId).toBe(id)
      expect(state.sessions[0].cwd).toBe('/tmp/test')
      expect(state.sessions[0].title).toBe('New session')
      expect(state.sessions[0].claudeSessionId).toBeNull()
    })

    it('prepends new sessions', () => {
      const id1 = createTestSession()
      const id2 = createTestSession()
      const state = useSessionsStore.getState()
      expect(state.sessions).toHaveLength(2)
      expect(state.sessions[0].id).toBe(id2)
      expect(state.sessions[1].id).toBe(id1)
    })
  })

  describe('addMessage', () => {
    it('adds a message to the correct session', () => {
      const id = createTestSession()
      useSessionsStore.getState().addMessage(id, {
        id: 'msg-1',
        role: 'user',
        text: 'Hello'
      })
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.messages).toHaveLength(1)
      expect(session.messages[0]).toMatchObject({ role: 'user', text: 'Hello' })
    })

    it('updates title on first user message', () => {
      const id = createTestSession()
      useSessionsStore.getState().addMessage(id, {
        id: 'msg-1',
        role: 'user',
        text: 'Fix the authentication bug in the login flow'
      })
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.title).toBe('Fix the authentication bug in the login ')
    })

    it('does not update title on assistant messages', () => {
      const id = createTestSession()
      useSessionsStore.getState().addMessage(id, {
        id: 'msg-1',
        role: 'assistant',
        text: 'I can help with that'
      })
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.title).toBe('New session')
    })

    it('adds timestamp if not provided', () => {
      const id = createTestSession()
      useSessionsStore.getState().addMessage(id, {
        id: 'msg-1',
        role: 'user',
        text: 'test'
      })
      const msg = useSessionsStore.getState().sessions.find((s) => s.id === id)!.messages[0]
      expect(msg.timestamp).toBeDefined()
      expect(typeof msg.timestamp).toBe('number')
    })
  })

  describe('updateToolResult', () => {
    it('updates the result of a tool call message', () => {
      const id = createTestSession()
      useSessionsStore.getState().addMessage(id, {
        id: 'tool-1',
        role: 'tool_call',
        tool_id: 'tool-1',
        tool_name: 'Read',
        input: { file_path: '/tmp/file.ts' }
      })
      useSessionsStore.getState().updateToolResult(id, 'tool-1', 'file contents here')
      const msg = useSessionsStore.getState().sessions.find((s) => s.id === id)!.messages[0]
      expect(msg.role).toBe('tool_call')
      expect((msg as { result?: string }).result).toBe('file contents here')
    })
  })

  describe('restartSession', () => {
    it('clears claudeSessionId but keeps messages', () => {
      const id = createTestSession()
      useSessionsStore.getState().updateClaudeSessionId(id, 'claude-123')
      useSessionsStore.getState().addMessage(id, {
        id: 'msg-1',
        role: 'user',
        text: 'hello'
      })
      useSessionsStore.getState().restartSession(id)
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.claudeSessionId).toBeNull()
      expect(session.messages).toHaveLength(1)
    })
  })

  describe('clearMessages', () => {
    it('clears messages, tasks, agents, usage, and resets title', () => {
      const id = createTestSession()
      const store = useSessionsStore.getState()
      store.addMessage(id, { id: 'msg-1', role: 'user', text: 'hello' })
      store.addTask(id, { taskId: 't1', subject: 'test', description: '', status: 'pending', createdByToolId: 'x' })
      store.addAgent(id, { toolId: 'a1', name: 'agent', subagentType: 'general', status: 'running', startedAt: Date.now() })
      store.addUsage(id, { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0 })

      useSessionsStore.getState().clearMessages(id)
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.messages).toHaveLength(0)
      expect(session.tasks).toHaveLength(0)
      expect(session.agents).toHaveLength(0)
      expect(session.usage.inputTokens).toBe(0)
      expect(session.title).toBe('New session')
    })
  })

  describe('renameSession', () => {
    it('renames the session title', () => {
      const id = createTestSession()
      useSessionsStore.getState().renameSession(id, 'My Custom Title')
      expect(useSessionsStore.getState().sessions[0].title).toBe('My Custom Title')
    })

    it('trims whitespace', () => {
      const id = createTestSession()
      useSessionsStore.getState().renameSession(id, '  Trimmed  ')
      expect(useSessionsStore.getState().sessions[0].title).toBe('Trimmed')
    })

    it('does not blank the title with empty string', () => {
      const id = createTestSession()
      useSessionsStore.getState().renameSession(id, 'Before')
      useSessionsStore.getState().renameSession(id, '   ')
      expect(useSessionsStore.getState().sessions[0].title).toBe('Before')
    })
  })

  describe('forkSession', () => {
    it('creates a forked session with copied messages and null claudeSessionId', () => {
      const id = createTestSession()
      useSessionsStore.getState().addMessage(id, { id: 'msg-1', role: 'user', text: 'Hello' })
      useSessionsStore.getState().addMessage(id, { id: 'msg-2', role: 'assistant', text: 'Hi!' })
      useSessionsStore.getState().updateClaudeSessionId(id, 'cli-123')

      const forkId = useSessionsStore.getState().forkSession(id)
      const state = useSessionsStore.getState()
      const forked = state.sessions.find((s) => s.id === forkId)!

      expect(forked).toBeDefined()
      expect(forked.claudeSessionId).toBeNull()
      expect(forked.messages).toHaveLength(2)
      expect(forked.messages[0].id).not.toBe('msg-1') // new IDs
      expect((forked.messages[0] as { text: string }).text).toBe('Hello')
      expect(forked.forkOf?.sessionId).toBe(id)
      expect(state.activeSessionId).toBe(forkId)
    })

    it('forks up to a specific message', () => {
      const id = createTestSession()
      useSessionsStore.getState().addMessage(id, { id: 'msg-1', role: 'user', text: 'First' })
      useSessionsStore.getState().addMessage(id, { id: 'msg-2', role: 'assistant', text: 'Response' })
      useSessionsStore.getState().addMessage(id, { id: 'msg-3', role: 'user', text: 'Second' })

      const forkId = useSessionsStore.getState().forkSession(id, 'msg-2')
      const forked = useSessionsStore.getState().sessions.find((s) => s.id === forkId)!

      // Should only have messages before msg-2 (index 1), so 1 message
      expect(forked.messages).toHaveLength(1)
      expect((forked.messages[0] as { text: string }).text).toBe('First')
    })
  })

  describe('deleteSession', () => {
    it('removes the session and switches active to first remaining', () => {
      const id1 = createTestSession()
      const id2 = createTestSession()
      useSessionsStore.getState().setActiveSession(id1)
      useSessionsStore.getState().deleteSession(id1)
      const state = useSessionsStore.getState()
      expect(state.sessions).toHaveLength(1)
      expect(state.activeSessionId).toBe(id2)
    })

    it('sets activeSessionId to null when last session is deleted', () => {
      const id = createTestSession()
      useSessionsStore.getState().deleteSession(id)
      expect(useSessionsStore.getState().activeSessionId).toBeNull()
    })
  })

  describe('setMcpServers', () => {
    it('stores MCP server info on the session', () => {
      const id = createTestSession()
      const servers: McpServerInfo[] = [
        { name: 'context7', status: 'connected', tools: ['resolve-library-id', 'query-docs'] },
        { name: 'canvas-mcp', status: 'failed', tools: [] }
      ]
      useSessionsStore.getState().setMcpServers(id, servers)
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.mcpServers).toHaveLength(2)
      expect(session.mcpServers![0].status).toBe('connected')
      expect(session.mcpServers![0].tools).toEqual(['resolve-library-id', 'query-docs'])
      expect(session.mcpServers![1].status).toBe('failed')
    })
  })

  describe('addUsage', () => {
    it('accumulates token usage', () => {
      const id = createTestSession()
      const store = useSessionsStore.getState()
      store.addUsage(id, { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 10, cacheReadTokens: 5 })
      store.addUsage(id, { inputTokens: 200, outputTokens: 100, cacheCreationTokens: 20, cacheReadTokens: 10 })
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.usage).toEqual({
        inputTokens: 300,
        outputTokens: 150,
        cacheCreationTokens: 30,
        cacheReadTokens: 15
      })
    })
  })

  describe('agents', () => {
    it('adds and updates agents', () => {
      const id = createTestSession()
      const store = useSessionsStore.getState()
      store.addAgent(id, {
        toolId: 'a1',
        name: 'Explore',
        subagentType: 'Explore',
        status: 'running',
        startedAt: 1000
      })
      store.updateAgent(id, 'a1', { status: 'done', durationMs: 5000 })
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.agents).toHaveLength(1)
      expect(session.agents[0].status).toBe('done')
      expect(session.agents[0].durationMs).toBe(5000)
    })
  })

  describe('queuedMessage', () => {
    it('sets a queued message on the session', () => {
      const id = createTestSession()
      useSessionsStore.getState().setQueuedMessage(id, { text: 'next question' })
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.queuedMessage).toEqual({ text: 'next question' })
    })

    it('clearQueuedMessage returns the queued message and clears it', () => {
      const id = createTestSession()
      useSessionsStore.getState().setQueuedMessage(id, { text: 'queued msg' })
      const queued = useSessionsStore.getState().clearQueuedMessage(id)
      expect(queued).toEqual({ text: 'queued msg' })
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.queuedMessage).toBeNull()
    })

    it('clearQueuedMessage returns null when nothing is queued', () => {
      const id = createTestSession()
      const queued = useSessionsStore.getState().clearQueuedMessage(id)
      expect(queued).toBeNull()
    })

    it('overwrites previous queued message', () => {
      const id = createTestSession()
      const store = useSessionsStore.getState()
      store.setQueuedMessage(id, { text: 'first' })
      store.setQueuedMessage(id, { text: 'second' })
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.queuedMessage?.text).toBe('second')
    })
  })

  describe('gitInfo and worktree', () => {
    it('sets git info on a session', () => {
      const id = createTestSession()
      useSessionsStore.getState().setGitInfo(id, { isGitRepo: true, branch: 'main' })
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.isGitRepo).toBe(true)
      expect(session.branch).toBe('main')
    })

    it('sets git info to non-repo', () => {
      const id = createTestSession()
      useSessionsStore.getState().setGitInfo(id, { isGitRepo: false })
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.isGitRepo).toBe(false)
      expect(session.branch).toBeUndefined()
    })

    it('sets worktree and updates branch', () => {
      const id = createTestSession()
      useSessionsStore.getState().setWorktree(id, { name: 'feat-pay', branch: 'feat/payments', path: '/tmp/wt' })
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.worktree).toEqual({ name: 'feat-pay', branch: 'feat/payments', path: '/tmp/wt' })
      expect(session.branch).toBe('feat/payments')
    })

    it('clears worktree when set to null', () => {
      const id = createTestSession()
      useSessionsStore.getState().setWorktree(id, { name: 'wt', branch: 'b', path: '/p' })
      useSessionsStore.getState().setWorktree(id, null)
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.worktree).toBeNull()
    })
  })

  describe('truncateAtMessage', () => {
    it('removes messages from the given ID onward and resets session state', () => {
      const id = createTestSession()
      const store = useSessionsStore.getState()
      store.addMessage(id, { id: 'msg-1', role: 'user', text: 'first' })
      store.addMessage(id, { id: 'msg-2', role: 'assistant', text: 'response' })
      store.addMessage(id, { id: 'msg-3', role: 'user', text: 'second' })
      store.updateClaudeSessionId(id, 'claude-abc')

      useSessionsStore.getState().truncateAtMessage(id, 'msg-2')
      const session = useSessionsStore.getState().sessions.find((s) => s.id === id)!
      expect(session.messages).toHaveLength(1)
      expect(session.messages[0].id).toBe('msg-1')
      expect(session.claudeSessionId).toBeNull()
    })
  })

  describe('pendingAction', () => {
    it('sets and clears pending actions', () => {
      const store = useSessionsStore.getState()
      store.setPendingAction({ type: 'send', text: '/help' })
      expect(useSessionsStore.getState().pendingAction).toEqual({ type: 'send', text: '/help' })
      useSessionsStore.getState().clearPendingAction()
      expect(useSessionsStore.getState().pendingAction).toBeNull()
    })
  })
})
