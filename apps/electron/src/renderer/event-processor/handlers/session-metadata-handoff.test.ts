import { describe, expect, it } from 'bun:test'
import { handleSessionMetadataChanged } from './session'
import type { SessionMetadataChangedEvent, SessionState } from '../types'

describe('linked handoff metadata events', () => {
  it('applies link arrays and normalizes wire nulls back to undefined', () => {
    const state = {
      session: {
        id: 'parent-1',
        continuedFromSessionId: 'older-parent',
        continuedToSessionIds: ['old-child'],
      },
      streaming: null,
    } as unknown as SessionState

    const linked = handleSessionMetadataChanged(state, {
      type: 'session_metadata_changed',
      sessionId: 'parent-1',
      changes: { continuedToSessionIds: ['new-child'] },
    })
    expect(linked.state.session.continuedToSessionIds).toEqual(['new-child'])

    const cleared = handleSessionMetadataChanged(linked.state, {
      type: 'session_metadata_changed',
      sessionId: 'parent-1',
      changes: {
        continuedFromSessionId: null,
        continuedToSessionIds: null,
      },
    } satisfies SessionMetadataChangedEvent)
    expect(cleared.state.session.continuedFromSessionId).toBeUndefined()
    expect(cleared.state.session.continuedToSessionIds).toBeUndefined()
  })
})
