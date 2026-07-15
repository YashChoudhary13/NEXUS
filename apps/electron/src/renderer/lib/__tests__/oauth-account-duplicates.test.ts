import { describe, expect, it } from 'bun:test'
import type { LlmConnection } from '@config/llm-connections'
import {
  findDuplicateAccountGroups,
  findDuplicateAccountSlugs,
  getOAuthProviderFamily,
} from '../oauth-account-duplicates'

function connection(
  overrides: Partial<LlmConnection> & Pick<LlmConnection, 'slug'>,
): LlmConnection {
  return {
    name: overrides.slug,
    providerType: 'pi',
    authType: 'oauth',
    piAuthProvider: 'openai-codex',
    createdAt: 1,
    ...overrides,
  }
}

describe('getOAuthProviderFamily', () => {
  it('separates Anthropic, Codex, and Copilot OAuth identities', () => {
    expect(getOAuthProviderFamily(connection({
      slug: 'claude-max',
      providerType: 'anthropic',
      piAuthProvider: undefined,
    }))).toBe('anthropic')
    expect(getOAuthProviderFamily(connection({ slug: 'chatgpt-plus' })))
      .toBe('openai-codex')
    expect(getOAuthProviderFamily(connection({
      slug: 'github-copilot',
      piAuthProvider: 'github-copilot',
    }))).toBe('github-copilot')
  })

  it('fails closed for non-OAuth connections', () => {
    expect(getOAuthProviderFamily(connection({
      slug: 'anthropic-api',
      providerType: 'anthropic',
      authType: 'api_key',
    }))).toBeNull()
  })
})

describe('findDuplicateAccountGroups', () => {
  it('flags every slug for the same UUID in one provider family', () => {
    const connections = [
      connection({ slug: 'chatgpt-plus', oauthAccountUuid: 'user-1' }),
      connection({ slug: 'chatgpt-plus-2', oauthAccountUuid: 'user-1' }),
      connection({ slug: 'chatgpt-plus-3', oauthAccountUuid: 'user-2' }),
    ]

    expect(findDuplicateAccountGroups(connections)).toEqual([{
      providerFamily: 'openai-codex',
      accountKey: 'uuid:user-1',
      connectionSlugs: ['chatgpt-plus', 'chatgpt-plus-2'],
    }])
    expect([...findDuplicateAccountSlugs(connections)])
      .toEqual(['chatgpt-plus', 'chatgpt-plus-2'])
  })

  it('falls back to normalized email when a UUID is unavailable', () => {
    const duplicates = findDuplicateAccountGroups([
      connection({ slug: 'claude-max', providerType: 'anthropic', piAuthProvider: undefined, oauthAccountEmail: ' Person@Example.com ' }),
      connection({ slug: 'claude-max-2', providerType: 'anthropic', piAuthProvider: undefined, oauthAccountEmail: 'person@example.com' }),
    ])

    expect(duplicates[0]?.connectionSlugs).toEqual(['claude-max', 'claude-max-2'])
  })

  it('never groups the same identity across provider families', () => {
    expect(findDuplicateAccountGroups([
      connection({ slug: 'chatgpt-plus', oauthAccountUuid: 'same-id' }),
      connection({ slug: 'github-copilot', piAuthProvider: 'github-copilot', oauthAccountUuid: 'same-id' }),
      connection({ slug: 'claude-max', providerType: 'anthropic', piAuthProvider: undefined, oauthAccountUuid: 'same-id' }),
    ])).toEqual([])
  })

  it('does not flag different accounts, missing identities, or API keys', () => {
    expect(findDuplicateAccountGroups([
      connection({ slug: 'chatgpt-plus', oauthAccountUuid: 'user-1' }),
      connection({ slug: 'chatgpt-plus-2', oauthAccountUuid: 'user-2' }),
      connection({ slug: 'chatgpt-plus-3' }),
      connection({ slug: 'anthropic-api', providerType: 'anthropic', authType: 'api_key', oauthAccountUuid: 'user-1' }),
    ])).toEqual([])
  })
})
