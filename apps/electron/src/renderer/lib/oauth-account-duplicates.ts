import type { LlmConnection } from '@config/llm-connections'

type OAuthIdentityConnection = Pick<
  LlmConnection,
  | 'slug'
  | 'authType'
  | 'providerType'
  | 'type'
  | 'piAuthProvider'
  | 'oauthAccountUuid'
  | 'oauthAccountEmail'
>

export interface DuplicateAccountGroup {
  providerFamily: string
  accountKey: string
  connectionSlugs: string[]
}

/**
 * Keep quota warnings within one credential/provider family.
 *
 * The generic fallback makes future Pi OAuth adapters safe by default without
 * ever grouping them with Codex or Copilot identities.
 */
export function getOAuthProviderFamily(
  connection: OAuthIdentityConnection,
): string | null {
  if (connection.authType !== 'oauth') return null

  const provider = connection.providerType || connection.type
  if (provider === 'anthropic') return 'anthropic'
  if (provider === 'pi') {
    if (connection.piAuthProvider === 'openai-codex') return 'openai-codex'
    if (connection.piAuthProvider === 'github-copilot') return 'github-copilot'
    return connection.piAuthProvider ? `pi:${connection.piAuthProvider}` : null
  }

  return provider ? `provider:${provider}` : null
}

function getAccountKey(connection: OAuthIdentityConnection): string | null {
  const uuid = connection.oauthAccountUuid?.trim()
  if (uuid) return `uuid:${uuid}`

  const email = connection.oauthAccountEmail?.trim().toLowerCase()
  return email ? `email:${email}` : null
}

/**
 * Find OAuth connections that resolve to the same identity within the same
 * provider family. Missing identities are fail-soft and never flagged.
 */
export function findDuplicateAccountGroups(
  connections: readonly OAuthIdentityConnection[],
): DuplicateAccountGroup[] {
  const groups = new Map<string, DuplicateAccountGroup>()

  for (const connection of connections) {
    const providerFamily = getOAuthProviderFamily(connection)
    const accountKey = getAccountKey(connection)
    if (!providerFamily || !accountKey) continue

    const groupKey = `${providerFamily}\0${accountKey}`
    const existing = groups.get(groupKey)
    if (existing) {
      existing.connectionSlugs.push(connection.slug)
    } else {
      groups.set(groupKey, {
        providerFamily,
        accountKey,
        connectionSlugs: [connection.slug],
      })
    }
  }

  return [...groups.values()].filter(group => group.connectionSlugs.length > 1)
}

export function findDuplicateAccountSlugs(
  connections: readonly OAuthIdentityConnection[],
): Set<string> {
  return new Set(
    findDuplicateAccountGroups(connections).flatMap(group => group.connectionSlugs),
  )
}
