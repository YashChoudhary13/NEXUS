/**
 * Pure-helper coverage for the model-picker. The helpers are tiny but they
 * back both the desktop dropdown and the compact (drawer) selector — pinning
 * the behavior here so future refactors of the picker can't quietly diverge
 * the two surfaces.
 */

import { describe, test, expect } from 'bun:test'
import type { LlmConnection } from '@craft-agent/shared/config/llm-connections'
import {
  formatTokenCount,
  groupConnectionsByProviderAccount,
  stripPiPrefixForDisplay,
} from '../model-picker-helpers'

// -----------------------------------------------------------------------------
// stripPiPrefixForDisplay
// -----------------------------------------------------------------------------

describe('stripPiPrefixForDisplay', () => {
  test('strips the "pi/" prefix when present', () => {
    expect(stripPiPrefixForDisplay('pi/claude-opus-4-7')).toBe('claude-opus-4-7')
  })

  test('returns input unchanged when prefix is absent', () => {
    expect(stripPiPrefixForDisplay('claude-opus-4-7')).toBe('claude-opus-4-7')
  })

  test('does NOT strip "pi:" (legacy other-form prefix)', () => {
    // The prefix is "pi/" — the alternative "pi:" form is intentionally not
    // collapsed because some IDs use a colon for unrelated purposes.
    expect(stripPiPrefixForDisplay('pi:claude-opus-4-7')).toBe('pi:claude-opus-4-7')
  })

  test('only strips at the start, not mid-string', () => {
    expect(stripPiPrefixForDisplay('foo-pi/bar')).toBe('foo-pi/bar')
  })

  test('handles empty string', () => {
    expect(stripPiPrefixForDisplay('')).toBe('')
  })
})

// -----------------------------------------------------------------------------
// formatTokenCount
// -----------------------------------------------------------------------------

describe('formatTokenCount', () => {
  test('renders zero as "0"', () => {
    expect(formatTokenCount(0)).toBe('0')
  })

  test('renders < 1k literally', () => {
    expect(formatTokenCount(42)).toBe('42')
    expect(formatTokenCount(999)).toBe('999')
  })

  test('renders 1k..<10k with one decimal', () => {
    expect(formatTokenCount(1000)).toBe('1.0k')
    expect(formatTokenCount(1500)).toBe('1.5k')
    expect(formatTokenCount(9999)).toBe('10.0k')
  })

  test('renders ≥ 10k as whole-k', () => {
    expect(formatTokenCount(10_000)).toBe('10k')
    expect(formatTokenCount(200_000)).toBe('200k')
    expect(formatTokenCount(999_999)).toBe('1000k')
  })

  test('renders ≥ 1M with one decimal', () => {
    expect(formatTokenCount(1_000_000)).toBe('1.0M')
    expect(formatTokenCount(1_500_000)).toBe('1.5M')
    expect(formatTokenCount(12_345_678)).toBe('12.3M')
  })
})

// -----------------------------------------------------------------------------
// groupConnectionsByProviderAccount
// -----------------------------------------------------------------------------

function conn(
  slug: string,
  providerType: LlmConnection['providerType'],
  extras: Partial<LlmConnection> = {},
): LlmConnection {
  return {
    slug,
    name: slug,
    providerType,
    authType: 'api_key',
    createdAt: 0,
    ...extras,
  }
}

describe('groupConnectionsByProviderAccount', () => {
  test('returns empty array for empty input', () => {
    expect(groupConnectionsByProviderAccount([])).toEqual([])
  })

  test('keeps a single account and its model list unchanged', () => {
    const only = conn('claude-pro', 'anthropic', {
      models: ['claude-opus-4-8', 'claude-sonnet-4-6'],
      defaultModel: 'claude-opus-4-8',
    })

    expect(groupConnectionsByProviderAccount([only])).toEqual([{
      id: 'anthropic',
      labelKey: 'chat.modelPicker.provider.anthropic',
      accounts: [{ connection: only, identityLine: null }],
    }])
  })

  test('groups direct and Pi Anthropic connections under one provider', () => {
    const a = conn('a', 'anthropic')
    const b = conn('b', 'pi', { piAuthProvider: 'anthropic' })
    const result = groupConnectionsByProviderAccount([a, b])
    expect(result).toEqual([{
      id: 'anthropic',
      labelKey: 'chat.modelPicker.provider.anthropic',
      accounts: [
        { connection: a, identityLine: null },
        { connection: b, identityLine: null },
      ],
    }])
  })

  test('preserves intra-group order', () => {
    const a = conn('first', 'anthropic')
    const b = conn('second', 'anthropic')
    const c = conn('third', 'anthropic')
    const result = groupConnectionsByProviderAccount([a, b, c])
    expect(result[0].accounts.map(entry => entry.connection.slug))
      .toEqual(['first', 'second', 'third'])
  })

  test('places Anthropic before OpenAI regardless of input order', () => {
    const piConn = conn('pi-1', 'pi', { piAuthProvider: 'openai-codex' })
    const anth = conn('anthropic-1', 'anthropic')
    const result = groupConnectionsByProviderAccount([piConn, anth])
    expect(result.map(group => group.id)).toEqual(['anthropic', 'openai'])
  })

  test('adds account identity beneath the connection name when available', () => {
    const first = conn('chatgpt-plus', 'pi', {
      authType: 'oauth',
      name: 'Codex Builder',
      piAuthProvider: 'openai-codex',
      oauthAccountEmail: 'builder@example.com',
      oauthOrganizationName: 'Studio',
    })
    const second = conn('chatgpt-plus-2', 'pi', {
      authType: 'oauth',
      name: 'Codex Reviewer',
      piAuthProvider: 'openai-codex',
      oauthAccountEmail: 'reviewer@example.com',
    })

    const [openai] = groupConnectionsByProviderAccount([first, second])
    expect(openai.id).toBe('openai')
    expect(openai.accounts).toEqual([
      { connection: first, identityLine: 'builder@example.com · Studio' },
      { connection: second, identityLine: 'reviewer@example.com' },
    ])
  })

  test('keeps Copilot separate from OpenAI even when identities match', () => {
    const codex = conn('chatgpt-plus', 'pi', {
      piAuthProvider: 'openai-codex',
      oauthAccountEmail: 'same@example.com',
    })
    const copilot = conn('github-copilot', 'pi', {
      piAuthProvider: 'github-copilot',
      oauthAccountEmail: 'same@example.com',
    })
    expect(groupConnectionsByProviderAccount([copilot, codex]).map(group => group.id))
      .toEqual(['openai', 'github-copilot'])
  })

  test('pi_compat with localhost baseUrl goes to Local', () => {
    const local = conn('ollama', 'pi_compat', { baseUrl: 'http://localhost:11434' })
    const result = groupConnectionsByProviderAccount([local])
    expect(result[0]).toEqual({
      id: 'local',
      labelKey: 'chat.modelPicker.provider.local',
      accounts: [{ connection: local, identityLine: null }],
    })
  })

  test('pi_compat with remote baseUrl uses the translated Custom APIs group', () => {
    const remote = conn('openrouter', 'pi_compat', { baseUrl: 'https://openrouter.ai/api/v1' })
    const result = groupConnectionsByProviderAccount([remote])
    expect(result[0]).toEqual({
      id: 'custom-apis',
      labelKey: 'chat.modelPicker.provider.customApis',
      accounts: [{ connection: remote, identityLine: null }],
    })
  })

  test('uses provider metadata for other Pi providers', () => {
    const bedrock = conn('bedrock', 'pi', { piAuthProvider: 'amazon-bedrock' })
    const result = groupConnectionsByProviderAccount([bedrock])
    expect(result[0].id).toBe('pi:amazon-bedrock')
    expect(result[0].label).toBe('Amazon Bedrock')
  })

  test('one Claude and two Codex accounts produce two providers and three accounts', () => {
    const anth = conn('a', 'anthropic')
    const codex1 = conn('chatgpt-plus', 'pi', { piAuthProvider: 'openai-codex' })
    const codex2 = conn('chatgpt-plus-2', 'pi', { piAuthProvider: 'openai-codex' })
    const result = groupConnectionsByProviderAccount([codex1, anth, codex2])
    expect(result.map(group => [
      group.id,
      group.accounts.map(entry => entry.connection.slug),
    ])).toEqual([
      ['anthropic', ['a']],
      ['openai', ['chatgpt-plus', 'chatgpt-plus-2']],
    ])
  })
})
