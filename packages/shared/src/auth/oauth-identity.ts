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
const GITHUB_API_BASE_URL = 'https://api.github.com'
const GITHUB_API_VERSION = '2022-11-28'
const GITHUB_IDENTITY_TIMEOUT_MS = 5_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function providerIdentifier(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value)
  }
  return nonEmptyString(value)
}

export type GitHubIdentityFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface GitHubIdentityLookupOptions {
  fetchFn?: GitHubIdentityFetch
  signal?: AbortSignal
  timeoutMs?: number
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

/**
 * Normalize GitHub's user response and an optional public-organization response.
 *
 * The Copilot device flow requests `read:user`, not `user:email`, so a private email is
 * normally returned as `null`. Keep the real public email when present and otherwise use
 * the verified `@login` handle as the visible account label. Organization membership is
 * deliberately optional because the available scope exposes only public memberships.
 */
export function parseGitHubIdentity(
  user: unknown,
  organizations?: unknown,
): OAuthIdentity | undefined {
  try {
    if (!isRecord(user)) return undefined

    const login = nonEmptyString(user.login)
    const accountUuid = providerIdentifier(user.id) ?? nonEmptyString(user.node_id)
    const accountLabel = nonEmptyString(user.email) ?? (login ? `@${login}` : undefined)

    let organization: OAuthIdentity['organization']
    if (Array.isArray(organizations)) {
      for (const publicOrganization of organizations) {
        if (!isRecord(publicOrganization)) continue
        const organizationUuid = providerIdentifier(publicOrganization.id)
          ?? nonEmptyString(publicOrganization.node_id)
        const organizationName = nonEmptyString(publicOrganization.name)
          ?? nonEmptyString(publicOrganization.login)
        if (organizationUuid || organizationName) {
          organization = {
            uuid: organizationUuid,
            name: organizationName,
          }
          break
        }
      }
    }

    if (!accountUuid && !accountLabel && !organization) return undefined

    const identity: OAuthIdentity = {}
    if (accountUuid || accountLabel) {
      identity.account = {
        uuid: accountUuid,
        emailAddress: accountLabel,
      }
    }
    if (organization) identity.organization = organization
    return identity
  } catch {
    return undefined
  }
}

/**
 * Resolve a GitHub identity from the durable GitHub token returned by Copilot OAuth.
 *
 * This helper is intentionally fail-soft: malformed responses, missing scopes, timeouts,
 * cancellation, and network failures all resolve to `undefined` (or the already verified
 * user when only the optional organization lookup fails). Identity enrichment must never
 * turn a successful Copilot login or token refresh into an authentication failure.
 */
export async function resolveGitHubOAuthIdentity(
  githubAccessToken: unknown,
  options: GitHubIdentityLookupOptions = {},
): Promise<OAuthIdentity | undefined> {
  const accessToken = nonEmptyString(githubAccessToken)
  if (!accessToken) return undefined

  const controller = new AbortController()
  const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) >= 0
    ? options.timeoutMs!
    : GITHUB_IDENTITY_TIMEOUT_MS
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const abortFromParent = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) {
    abortFromParent()
  } else {
    options.signal?.addEventListener('abort', abortFromParent, { once: true })
  }

  const fetchFn = options.fetchFn ?? fetch
  const requestInit: RequestInit = {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'NEXUS',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    signal: controller.signal,
  }

  try {
    let user: unknown
    try {
      const response = await fetchFn(`${GITHUB_API_BASE_URL}/user`, requestInit)
      if (!response.ok) return undefined
      user = await response.json()
    } catch {
      return undefined
    }

    const accountIdentity = parseGitHubIdentity(user)
    if (!accountIdentity || !isRecord(user)) return accountIdentity

    const login = nonEmptyString(user.login)
    if (!login) return accountIdentity

    try {
      const response = await fetchFn(
        `${GITHUB_API_BASE_URL}/users/${encodeURIComponent(login)}/orgs?per_page=1`,
        requestInit,
      )
      if (!response.ok) return accountIdentity
      const organizations = await response.json()
      return parseGitHubIdentity(user, organizations) ?? accountIdentity
    } catch {
      return accountIdentity
    }
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromParent)
  }
}
