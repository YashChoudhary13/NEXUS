import { describe, expect, it } from 'bun:test'
import {
  decodeJwtClaims,
  parseChatGptIdentity,
  parseChatGptIdToken,
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
