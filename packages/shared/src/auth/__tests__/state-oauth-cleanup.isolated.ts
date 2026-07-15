import { describe, expect, it, mock } from 'bun:test'

mock.module('../claude-token.ts', () => ({
  refreshClaudeToken: async () => {
    throw new Error('Token refresh failed: invalid_grant')
  },
  isTokenExpired: () => true,
}))

const { performTokenRefresh } = await import('../state.ts')

describe('performTokenRefresh OAuth cleanup', () => {
  it('does not delete non-OAuth credentials when a refresh token is invalid', async () => {
    const calls = {
      deleteGlobalOAuth: 0,
      deleteScopedOAuth: 0,
      deleteAllForSlug: 0,
    }
    const manager = {
      deleteClaudeOAuthCredentials: async () => {
        calls.deleteGlobalOAuth += 1
        return true
      },
      deleteLlmOAuth: async () => {
        calls.deleteScopedOAuth += 1
        return true
      },
      deleteLlmCredentials: async () => {
        calls.deleteAllForSlug += 1
        return true
      },
    }

    const result = await performTokenRefresh(
      manager as never,
      'invalid-refresh-token',
      'native',
      'claude-max-cleanup-test',
      0,
    )

    expect(result).toEqual({ accessToken: null, migrationRequired: undefined })
    expect(calls).toEqual({
      deleteGlobalOAuth: 1,
      deleteScopedOAuth: 1,
      deleteAllForSlug: 0,
    })
  })
})
