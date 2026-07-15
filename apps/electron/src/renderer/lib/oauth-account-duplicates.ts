interface OAuthIdentityConnection {
  providerType: string
  authType: string
  oauthAccountUuid?: string
}

/**
 * Preserve the existing duplicate-quota warning semantics for Claude only.
 * Codex principal/workspace identity is stored in the same neutral fields but
 * has different quota semantics that Phase 1C will model explicitly.
 */
export function findDuplicateAnthropicOAuthAccountUuids(
  connections: readonly OAuthIdentityConnection[],
): Set<string> {
  const counts = new Map<string, number>()
  for (const connection of connections) {
    if (connection.providerType !== 'anthropic' || connection.authType !== 'oauth') continue
    const uuid = connection.oauthAccountUuid
    if (uuid) counts.set(uuid, (counts.get(uuid) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([uuid]) => uuid))
}
