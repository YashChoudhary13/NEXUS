import { describe, expect, it } from 'bun:test'
import type { AgentEvent } from '@craft-agent/core/types'
import { BaseAgent } from '../base-agent.ts'
import { AbortReason, type BackendConfig, type ChatOptions } from '../backend/types.ts'
import type { FileAttachment } from '../../utils/files.ts'
import type { LLMQueryRequest, LLMQueryResult } from '../llm-tool.ts'

class CapturingAgent extends BaseAgent {
  protected backendName = 'Test'
  capturedMessages: string[] = []

  protected async *chatImpl(
    message: string,
    _attachments?: FileAttachment[],
    _options?: ChatOptions,
  ): AsyncGenerator<AgentEvent> {
    this.capturedMessages.push(message)
    yield { type: 'complete' }
  }

  async abort(_reason?: string): Promise<void> {}
  forceAbort(_reason: AbortReason): void {}
  isProcessing(): boolean { return false }
  respondToPermission(_requestId: string, _allowed: boolean, _alwaysAllow?: boolean): void {}
  async runMiniCompletion(_prompt: string): Promise<string | null> { return null }
  async queryLlm(_request: LLMQueryRequest): Promise<LLMQueryResult> { return { text: '' } }
}

describe('linked handoff hidden context', () => {
  it('prepends the generated summary exactly once before the child user message', async () => {
    let applied = false
    const config: BackendConfig = {
      provider: 'pi',
      workspace: {
        id: 'ws-1',
        slug: 'workspace',
        name: 'Workspace',
        rootPath: '/tmp/nexus-handoff-one-shot',
        createdAt: 1,
      },
      session: {
        id: 'child-1',
        workspaceRootPath: '/tmp/nexus-handoff-one-shot',
        createdAt: 1,
        lastUsedAt: 1,
      },
      skipConfigWatcher: true,
      getTransferredSessionSummary: () => applied ? null : 'Objective: finish Phase 1',
      markTransferredSessionSummaryApplied: () => { applied = true },
    }
    const agent = new CapturingAgent(config, 'test-model')

    for await (const _event of agent.chat('First child message')) {}
    for await (const _event of agent.chat('Second child message')) {}

    expect(applied).toBe(true)
    expect(agent.capturedMessages[0]).toContain('<session_transfer_summary>')
    expect(agent.capturedMessages[0]).toContain('Objective: finish Phase 1')
    expect(agent.capturedMessages[0]).toEndWith('First child message')
    expect(agent.capturedMessages[1]).toBe('Second child message')
    expect(agent.capturedMessages[1]).not.toContain('<session_transfer_summary>')

    agent.destroy()
  })
})
