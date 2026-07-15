import { describe, expect, it } from 'bun:test'
import { SESSION_PERSISTENT_FIELDS } from '../types.ts'
import { pickSessionFields } from '../utils.ts'

describe('linked handoff persistence fields', () => {
  it('round-trips both directions through the canonical persistent-field picker', () => {
    expect(SESSION_PERSISTENT_FIELDS).toContain('continuedFromSessionId')
    expect(SESSION_PERSISTENT_FIELDS).toContain('continuedToSessionIds')

    const picked = pickSessionFields({
      id: 'child-1',
      workspaceRootPath: '/tmp/workspace',
      continuedFromSessionId: 'parent-1',
      continuedToSessionIds: ['grandchild-1'],
      runtimeOnly: true,
    } as never)

    expect(picked.continuedFromSessionId).toBe('parent-1')
    expect(picked.continuedToSessionIds).toEqual(['grandchild-1'])
    expect(picked).not.toHaveProperty('runtimeOnly')
  })
})
