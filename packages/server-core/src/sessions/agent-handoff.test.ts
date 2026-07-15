import { describe, expect, it } from 'bun:test'
import type { LlmConnection } from '@craft-agent/shared/config'
import type { ContinueWithAgentRequest, CreateSessionOptions, Session } from '@craft-agent/shared/protocol'
import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { SessionManager, createManagedSession, validateAgentHandoffTarget } from './SessionManager.ts'

function connection(overrides: Partial<LlmConnection> = {}): LlmConnection {
  return {
    slug: 'codex-two',
    name: 'Codex 2',
    providerType: 'pi',
    authType: 'oauth',
    piAuthProvider: 'openai-codex',
    models: ['gpt-5.3-codex', 'gpt-5.2-codex'],
    defaultModel: 'gpt-5.3-codex',
    createdAt: 1,
    ...overrides,
  }
}

describe('validateAgentHandoffTarget', () => {
  it('returns the exact connection when the selected model belongs to it', () => {
    const target = connection()
    expect(validateAgentHandoffTarget([target], {
      llmConnection: target.slug,
      model: 'gpt-5.2-codex',
    })).toBe(target)
  })

  it('rejects missing connections and models from another account', () => {
    expect(() => validateAgentHandoffTarget([connection()], {
      llmConnection: 'missing-account',
      model: 'gpt-5.3-codex',
    })).toThrow('LLM connection not found')

    expect(() => validateAgentHandoffTarget([connection()], {
      llmConnection: 'codex-two',
      model: 'claude-opus-4-6',
    })).toThrow('is not available for LLM connection codex-two')
  })
})

describe('continueSessionWithAgent', () => {
  it('binds the child before first send, persists a visible/hidden handoff, and leaves parent chat/provider state untouched', async () => {
    const sm = new SessionManager()
    const workspace = {
      id: 'ws-1',
      name: 'Workspace',
      rootPath: '/tmp/nexus-agent-handoff-test',
      createdAt: 1,
    } as never
    const parent = createManagedSession({
      id: 'parent-1',
      name: 'Phase 1 build',
      model: 'claude-opus-4-6',
      llmConnection: 'claude-primary',
      permissionMode: 'ask',
      workingDirectory: '/tmp/project',
      enabledSourceSlugs: ['github'],
      projectId: 'project-1',
    }, workspace, { messagesLoaded: true })
    parent.messages.push({
      id: 'user-1',
      role: 'user',
      content: 'Finish Phase 1',
      timestamp: 1,
    })
    ;(sm as any).sessions.set(parent.id, parent)

    const selectedConnection = connection()
    ;(sm as any).getAgentHandoffConnections = () => [selectedConnection]
    ;(sm as any).generateRemoteTransferSummary = async () => (
      '- Objective: finish Phase 1\n- Touched: SessionManager.ts\n- Git: feature/linked-handoff'
    )

    const persisted: string[] = []
    const flushed: string[] = []
    ;(sm as any).persistSession = (managed: { id: string }) => persisted.push(managed.id)
    sm.flushSession = async (sessionId: string) => { flushed.push(sessionId) }

    let createOptions: CreateSessionOptions | undefined
    let createInternal: { emitCreatedEvent?: boolean } | undefined
    sm.createSession = async (_workspaceId, options, internal) => {
      createOptions = options
      createInternal = internal
      const child = createManagedSession({
        id: 'child-1',
        name: options?.name,
        model: options?.model,
        llmConnection: options?.llmConnection,
        permissionMode: options?.permissionMode,
        thinkingLevel: options?.thinkingLevel,
        workingDirectory: options?.workingDirectory === 'none' ? undefined : options?.workingDirectory,
        enabledSourceSlugs: options?.enabledSourceSlugs,
        projectId: options?.projectId,
      }, workspace, { messagesLoaded: true })
      ;(sm as any).sessions.set(child.id, child)
      return {
        id: child.id,
        workspaceId: 'ws-1',
        workspaceName: 'Workspace',
        lastMessageAt: 1,
        messages: [],
        isProcessing: false,
      } as Session
    }

    const events: Array<{ channel: string; target: unknown; event: unknown }> = []
    sm.setEventSink((channel, target, event) => events.push({ channel, target, event }))

    const request: ContinueWithAgentRequest = {
      llmConnection: 'codex-two',
      model: 'gpt-5.2-codex',
      thinkingLevel: 'high',
    }
    const result = await sm.continueSessionWithAgent(parent.id, 'ws-1', request)

    expect(result).toEqual({
      sessionId: 'child-1',
      summary: '- Objective: finish Phase 1\n- Touched: SessionManager.ts\n- Git: feature/linked-handoff',
    })
    expect(createInternal).toEqual({ emitCreatedEvent: false })
    expect(createOptions).toMatchObject({
      model: 'gpt-5.2-codex',
      llmConnection: 'codex-two',
      thinkingLevel: 'high',
      permissionMode: 'ask',
      workingDirectory: '/tmp/project',
      enabledSourceSlugs: ['github'],
      projectId: 'project-1',
    })

    // The parent gains only the reverse link; its provider and transcript stay intact.
    expect(parent.model).toBe('claude-opus-4-6')
    expect(parent.llmConnection).toBe('claude-primary')
    expect(parent.messages).toHaveLength(1)
    expect(parent.messages[0]?.content).toBe('Finish Phase 1')
    expect(parent.continuedToSessionIds).toEqual(['child-1'])

    const child = (sm as any).sessions.get('child-1')
    expect(child.model).toBe('gpt-5.2-codex')
    expect(child.llmConnection).toBe('codex-two')
    expect(child.connectionLocked).not.toBe(true)
    expect(child.continuedFromSessionId).toBe(parent.id)
    expect(child.transferredSessionSummaryApplied).toBe(false)
    expect(child.transferredSessionSummary).toBe(result.summary)
    expect(child.messages).toHaveLength(1)
    expect(child.messages[0]).toMatchObject({
      role: 'info',
      infoLevel: 'info',
    })
    expect(child.messages[0].content).toStartWith('Continued from Phase 1 build · handoff:')
    expect(child.messages[0].content).toContain('SessionManager.ts')

    expect(persisted).toContain('parent-1')
    expect(persisted).toContain('child-1')
    expect(flushed).toContain('parent-1')
    expect(flushed).toContain('child-1')
    expect(events).toContainEqual({
      channel: RPC_CHANNELS.sessions.EVENT,
      target: { to: 'workspace', workspaceId: 'ws-1' },
      event: {
        type: 'session_metadata_changed',
        sessionId: 'parent-1',
        changes: { continuedToSessionIds: ['child-1'] },
      },
    })
    expect(events).toContainEqual({
      channel: RPC_CHANNELS.sessions.EVENT,
      target: { to: 'workspace', workspaceId: 'ws-1' },
      event: { type: 'session_created', sessionId: 'child-1' },
    })
  })

  it('rejects a busy parent before generating a summary or creating a child', async () => {
    const sm = new SessionManager()
    const workspace = { id: 'ws-1', name: 'Workspace', rootPath: '/tmp/test', createdAt: 1 } as never
    const parent = createManagedSession({ id: 'busy-parent' }, workspace, { messagesLoaded: true })
    parent.isProcessing = true
    ;(sm as any).sessions.set(parent.id, parent)

    let summaryCalled = false
    ;(sm as any).generateRemoteTransferSummary = async () => { summaryCalled = true; return 'summary' }

    await expect(sm.continueSessionWithAgent(parent.id, 'ws-1', {
      llmConnection: 'codex-two',
      model: 'gpt-5.3-codex',
    })).rejects.toThrow('Stop the current response')
    expect(summaryCalled).toBe(false)
    expect((sm as any).sessions.size).toBe(1)
  })

  it('clears the surviving parent link when a continued child is deleted', async () => {
    const sm = new SessionManager()
    const workspace = { id: 'ws-1', name: 'Workspace', rootPath: '/tmp/nexus-link-delete-test', createdAt: 1 } as never
    const parent = createManagedSession({
      id: 'parent-delete',
      continuedToSessionIds: ['child-delete'],
    }, workspace, { messagesLoaded: true })
    const child = createManagedSession({
      id: 'child-delete',
      continuedFromSessionId: 'parent-delete',
    }, workspace, { messagesLoaded: true })
    ;(sm as any).sessions.set(parent.id, parent)
    ;(sm as any).sessions.set(child.id, child)
    ;(sm as any).persistSession = () => {}
    sm.flushSession = async () => {}

    const events: unknown[] = []
    sm.setEventSink((_channel, _target, event) => events.push(event))

    await sm.deleteSession(child.id)

    expect(parent.continuedToSessionIds).toBeUndefined()
    expect((sm as any).sessions.has(child.id)).toBe(false)
    expect(events).toContainEqual({
      type: 'session_metadata_changed',
      sessionId: parent.id,
      changes: { continuedToSessionIds: null },
    })
  })
})
