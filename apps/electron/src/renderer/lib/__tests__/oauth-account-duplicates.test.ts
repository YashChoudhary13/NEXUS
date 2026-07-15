import { describe, expect, it } from 'bun:test'
import { findDuplicateAnthropicOAuthAccountUuids } from '../oauth-account-duplicates'

describe('findDuplicateAnthropicOAuthAccountUuids', () => {
  it('flags only duplicate Anthropic OAuth principals', () => {
    const duplicates = findDuplicateAnthropicOAuthAccountUuids([
      { providerType: 'anthropic', authType: 'oauth', oauthAccountUuid: 'claude-user' },
      { providerType: 'anthropic', authType: 'oauth', oauthAccountUuid: 'claude-user' },
      { providerType: 'anthropic', authType: 'api_key', oauthAccountUuid: 'claude-user' },
      { providerType: 'pi', authType: 'oauth', oauthAccountUuid: 'codex-user' },
      { providerType: 'pi', authType: 'oauth', oauthAccountUuid: 'codex-user' },
    ])

    expect([...duplicates]).toEqual(['claude-user'])
  })

  it('does not mix a Codex principal into the Claude duplicate count', () => {
    const duplicates = findDuplicateAnthropicOAuthAccountUuids([
      { providerType: 'anthropic', authType: 'oauth', oauthAccountUuid: 'shared-string' },
      { providerType: 'pi', authType: 'oauth', oauthAccountUuid: 'shared-string' },
    ])

    expect(duplicates.size).toBe(0)
  })
})
