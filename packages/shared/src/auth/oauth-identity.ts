/**
 * Provider-neutral identity resolved from an OAuth response.
 *
 * The shape mirrors the identity fields already persisted on LLM connections.
 * Every field is optional: identity capture must never make a successful login fail.
 */
export interface OAuthIdentity {
  account?: {
    uuid?: string
    emailAddress?: string
  }
  organization?: {
    uuid?: string
    name?: string
  }
}

export type JwtClaims = Record<string, unknown>

const OPENAI_AUTH_CLAIM = 'https://api.openai.com/auth'
const OPENAI_PROFILE_CLAIM = 'https://api.openai.com/profile'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

/**
 * Decode a JWT payload without verifying its signature.
 *
 * This is intentionally a shape decoder, not a token validator. Callers use it only for an
 * ID token received directly from the provider token endpoint over TLS. Authentication still
 * relies on the provider-issued token itself. Malformed input is always fail-soft.
 */
export function decodeJwtClaims(idToken: unknown): JwtClaims | undefined {
  try {
    if (typeof idToken !== 'string') return undefined

    const parts = idToken.split('.')
    if (parts.length !== 3 || parts.some(part => !part)) return undefined

    const payload = parts[1]!
    if (!/^[A-Za-z0-9_-]+$/.test(payload)) return undefined

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return isRecord(decoded) ? decoded : undefined
  } catch {
    return undefined
  }
}

/**
 * Resolve the human principal and selected ChatGPT runtime workspace from ID-token claims.
 *
 * OpenAI's Codex parser treats `chatgpt_user_id`/`user_id` as the user identifier and
 * `chatgpt_account_id` as the organization/workspace identifier. S1 confirmed that two
 * distinct users can share the latter, so it must never be used as the human account UUID.
 */
export function parseChatGptIdentity(claims: unknown): OAuthIdentity | undefined {
  try {
    if (!isRecord(claims)) return undefined

    const auth = isRecord(claims[OPENAI_AUTH_CLAIM])
      ? claims[OPENAI_AUTH_CLAIM]
      : undefined
    const profile = isRecord(claims[OPENAI_PROFILE_CLAIM])
      ? claims[OPENAI_PROFILE_CLAIM]
      : undefined

    const accountUuid = nonEmptyString(auth?.chatgpt_user_id)
      ?? nonEmptyString(auth?.user_id)
      ?? nonEmptyString(claims.sub)
    const accountEmail = nonEmptyString(claims.email)
      ?? nonEmptyString(profile?.email)
    const workspaceUuid = nonEmptyString(auth?.chatgpt_account_id)

    if (!accountUuid && !accountEmail && !workspaceUuid) return undefined

    const identity: OAuthIdentity = {}
    if (accountUuid || accountEmail) {
      identity.account = {
        uuid: accountUuid,
        emailAddress: accountEmail,
      }
    }
    if (workspaceUuid) {
      identity.organization = { uuid: workspaceUuid }
    }
    return identity
  } catch {
    return undefined
  }
}

/** Decode and normalize a ChatGPT ID token in one fail-soft step. */
export function parseChatGptIdToken(idToken: unknown): OAuthIdentity | undefined {
  const claims = decodeJwtClaims(idToken)
  return claims ? parseChatGptIdentity(claims) : undefined
}
