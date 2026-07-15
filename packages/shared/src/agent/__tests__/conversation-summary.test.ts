import { describe, expect, it, mock } from 'bun:test'

import {
  buildAgentHandoffSummaryPrompt,
  buildConversationSummaryPrompt,
  buildConversationSummaryTranscript,
  buildTransferredSessionContext,
  generateAgentHandoffSummary,
  generateConversationSummary,
} from '../conversation-summary.ts'

describe('conversation-summary helpers', () => {
  it('bounds individual messages and total transcript length', () => {
    const transcript = buildConversationSummaryTranscript(
      Array.from({ length: 40 }, (_, index) => ({
        type: index % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: String(index).repeat(700),
      }))
    )

    expect(transcript).toStartWith(`User: ${'0'.repeat(500)}`)
    expect(transcript).toContain(`Assistant: ${'1'.repeat(500)}`)
    expect(transcript.length).toBe(12_000)
  })

  it('builds the same reusable summary prompt used by branch fallback', () => {
    const prompt = buildConversationSummaryPrompt([
      { type: 'user', content: 'Need to ship the mobile fix.' },
      { type: 'assistant', content: 'Working through the remaining edge cases.' },
    ])

    expect(prompt).toContain('Summarize this conversation concisely. Preserve: key decisions, ongoing tasks, technical context, and the user\'s current goal. Be specific, not generic.')
    expect(prompt).toContain('User: Need to ship the mobile fix.')
    expect(prompt).toContain('Assistant: Working through the remaining edge cases.')
  })

  it('delegates summary generation to the provided mini completion callback', async () => {
    const runMiniCompletion = mock(async (prompt: string) => {
      expect(prompt).toContain('User: First message')
      return 'condensed summary'
    })

    const result = await generateConversationSummary([
      { type: 'user', content: 'First message' },
    ], runMiniCompletion)

    expect(result).toBe('condensed summary')
    expect(runMiniCompletion).toHaveBeenCalledTimes(1)
  })

  it('asks handoff summaries to preserve implementation and git state without invention', () => {
    const prompt = buildAgentHandoffSummaryPrompt([
      { type: 'user', content: 'Finish Phase 1 and keep the parent session unchanged.' },
      { type: 'assistant', content: 'Updated SessionManager.ts and ran the focused tests.' },
    ])

    expect(prompt).toContain("the user's current objective")
    expect(prompt).toContain('recent decisions and their rationale')
    expect(prompt).toContain('touched files')
    expect(prompt).toContain('commands/tests and results')
    expect(prompt).toContain('current git/worktree state')
    expect(prompt).toContain('Do not invent missing details')
  })

  it('delegates agent handoff generation to the provided mini completion callback', async () => {
    const runMiniCompletion = mock(async (prompt: string) => {
      expect(prompt).toContain('Create a concise agent handoff')
      return 'Objective: finish Phase 1'
    })

    const result = await generateAgentHandoffSummary([
      { type: 'user', content: 'Finish Phase 1' },
    ], runMiniCompletion)

    expect(result).toBe('Objective: finish Phase 1')
    expect(runMiniCompletion).toHaveBeenCalledTimes(1)
  })

  it('formats transferred-session context as a hidden one-shot block', () => {
    expect(buildTransferredSessionContext('Keep the remote workspace aligned.')).toBe(`<session_transfer_summary>
This session continues from another session. The prior conversation was summarized before handoff.
Use the summary below as prior context for the next turn.

Keep the remote workspace aligned.
</session_transfer_summary>`)
  })
})
