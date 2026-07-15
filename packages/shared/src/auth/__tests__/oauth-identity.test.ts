import { describe, expect, it } from 'bun:test'
import {
  decodeJwtClaims,
  parseChatGptIdentity,
  parseChatGptIdToken,
  parseGitHubIdentity,
  resolveGitHubOAuthIdentity,
} from '../oauth-identity.ts'

const AUTH_CLAIM = 'https://api.openai.com/auth'
const PROFILE_CLAIM = 'https://api.openai.com/profile'

function fabricatedJwt(payload: unknown): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.fabricated-signature`
}

describe('decodeJwtClaims', () => {
  it('decodes an object payload, including unpadded base64url and Unicode', () => {
    const claims = { sub: 'user-1', label: 'Tést 👋' }
    expect(decodeJwtClaims(fabricatedJwt(claims))).toEqual(claims)
  })

  it.each([
    undefined,
    null,
    '',
    'one-part',
    'two.parts',
    'too.many.jwt.parts',
    'header.%%%.signature',
    `header.${Buffer.from('not json').toString('base64url')}.signature`,
    fabricatedJwt(null),
    fabricatedJwt(['not', 'an', 'object']),
  ])('returns undefined for malformed input without throwing: %p', value => {
    expect(() => decodeJwtClaims(value)).not.toThrow()
    expect(decodeJwtClaims(value)).toBeUndefined()
  })
})

describe('parseChatGptIdentity', () => {
  it('uses the ChatGPT user principal and keeps workspace identity separate', () => {
    expect(parseChatGptIdentity({
      sub: 'subject-fallback',
      email: 'person@example.test',
      [AUTH_CLAIM]: {
        chatgpt_user_id: 'chatgpt-user',
        user_id: 'legacy-user',
        chatgpt_account_id: 'workspace-1',
      },
    })).toEqual({
      account: {
        uuid: 'chatgpt-user',
        emailAddress: 'person@example.test',
      },
      organization: { uuid: 'workspace-1' },
    })
  })

  it('falls back from chatgpt_user_id to user_id, then top-level sub', () => {
    expect(parseChatGptIdentity({
      sub: 'subject-fallback',
      [AUTH_CLAIM]: { user_id: 'legacy-user' },
    })?.account?.uuid).toBe('legacy-user')

    expect(parseChatGptIdentity({ sub: 'subject-fallback' })?.account?.uuid)
      .toBe('subject-fallback')
  })

  it('uses the profile email only when the top-level email is absent', () => {
    expect(parseChatGptIdentity({
      email: 'top-level@example.test',
      [PROFILE_CLAIM]: { email: 'profile@example.test' },
    })?.account?.emailAddress).toBe('top-level@example.test')

    expect(parseChatGptIdentity({
      [PROFILE_CLAIM]: { email: 'profile@example.test' },
    })?.account?.emailAddress).toBe('profile@example.test')
  })

  it('does not collapse two user principals that share one runtime workspace', () => {
    const first = parseChatGptIdentity({
      [AUTH_CLAIM]: {
        chatgpt_user_id: 'user-a',
        chatgpt_account_id: 'shared-workspace',
      },
    })
    const second = parseChatGptIdentity({
      [AUTH_CLAIM]: {
        chatgpt_user_id: 'user-b',
        chatgpt_account_id: 'shared-workspace',
      },
    })

    expect(first?.account?.uuid).not.toBe(second?.account?.uuid)
    expect(first?.organization?.uuid).toBe(second?.organization?.uuid)
  })

  it('ignores the uncorrelated organizations array', () => {
    expect(parseChatGptIdentity({
      [AUTH_CLAIM]: {
        chatgpt_user_id: 'user-a',
        organizations: [{ id: 'unverified-org', title: 'Unverified' }],
      },
    })).toEqual({ account: { uuid: 'user-a', emailAddress: undefined } })
  })

  it.each([
    [undefined],
    [null],
    [[]],
    [{}],
    [{ email: 42, sub: false, [AUTH_CLAIM]: [] }],
  ])('returns undefined for missing or malformed identity claims: %p', claims => {
    expect(() => parseChatGptIdentity(claims)).not.toThrow()
    expect(parseChatGptIdentity(claims)).toBeUndefined()
  })

  it('decodes and normalizes a fabricated ID token in one step', () => {
    expect(parseChatGptIdToken(fabricatedJwt({
      email: 'person@example.test',
      [AUTH_CLAIM]: { chatgpt_user_id: 'user-a' },
    }))).toEqual({
      account: { uuid: 'user-a', emailAddress: 'person@example.test' },
    })
  })
})

describe('parseGitHubIdentity', () => {
  it('keeps the stable GitHub user id, public email, and first public organization', () => {
    expect(parseGitHubIdentity(
      {
        id: 123456,
        node_id: 'user-node-fallback',
        login: 'octocat',
        email: 'octocat@example.test',
      },
      [null, {}, { id: 987, login: 'github', node_id: 'org-node-fallback' }],
    )).toEqual({
      account: {
        uuid: '123456',
        emailAddress: 'octocat@example.test',
      },
      organization: {
        uuid: '987',
        name: 'github',
      },
    })
  })

  it('uses the verified GitHub handle when the profile email is private', () => {
    expect(parseGitHubIdentity({ id: 123456, login: 'private-octocat', email: null }))
      .toEqual({
        account: {
          uuid: '123456',
          emailAddress: '@private-octocat',
        },
      })
  })

  it.each([
    [undefined],
    [null],
    [[]],
    [{}],
    [{ id: -1, login: '', email: 42 }],
  ])('returns undefined for malformed or absent identity without throwing: %p', user => {
    expect(() => parseGitHubIdentity(user)).not.toThrow()
    expect(parseGitHubIdentity(user)).toBeUndefined()
  })
})

describe('resolveGitHubOAuthIdentity', () => {
  it('looks up the authenticated user and first public organization with scoped headers', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const responses = [
      { id: 123456, login: 'octocat', email: 'octocat@example.test' },
      [{ id: 987, login: 'github' }],
    ]
    const identity = await resolveGitHubOAuthIdentity('github-access-token', {
      fetchFn: async (input, init) => {
        requests.push({ url: String(input), init })
        return Response.json(responses.shift())
      },
    })

    expect(identity).toEqual({
      account: { uuid: '123456', emailAddress: 'octocat@example.test' },
      organization: { uuid: '987', name: 'github' },
    })
    expect(requests.map(request => request.url)).toEqual([
      'https://api.github.com/user',
      'https://api.github.com/users/octocat/orgs?per_page=1',
    ])
    for (const request of requests) {
      const headers = new Headers(request.init?.headers)
      expect(headers.get('accept')).toBe('application/vnd.github+json')
      expect(headers.get('authorization')).toBe('Bearer github-access-token')
      expect(headers.get('user-agent')).toBe('NEXUS')
      expect(headers.get('x-github-api-version')).toBe('2022-11-28')
      expect(request.init?.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it('keeps the verified user when the optional organization lookup fails', async () => {
    let requestCount = 0
    const identity = await resolveGitHubOAuthIdentity('github-access-token', {
      fetchFn: async () => {
        requestCount++
        if (requestCount === 1) {
          return Response.json({ id: 123456, login: 'private-octocat', email: null })
        }
        return new Response('scope unavailable', { status: 403 })
      },
    })

    expect(identity).toEqual({
      account: { uuid: '123456', emailAddress: '@private-octocat' },
    })
  })

  it('returns undefined for an authenticated-user API error', async () => {
    expect(await resolveGitHubOAuthIdentity('github-access-token', {
      fetchFn: async () => new Response('unauthorized', { status: 401 }),
    })).toBeUndefined()
  })

  it('never throws when the lookup rejects or receives malformed data', async () => {
    await expect(resolveGitHubOAuthIdentity('github-access-token', {
      fetchFn: async () => { throw new Error('network unavailable') },
    })).resolves.toBeUndefined()

    await expect(resolveGitHubOAuthIdentity('github-access-token', {
      fetchFn: async () => Response.json([]),
    })).resolves.toBeUndefined()

    await expect(resolveGitHubOAuthIdentity(undefined, {
      fetchFn: async () => { throw new Error('must not be called') },
    })).resolves.toBeUndefined()
  })
})
