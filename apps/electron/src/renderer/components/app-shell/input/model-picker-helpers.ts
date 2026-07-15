import {
  isLocalConnection,
  type LlmConnection,
} from '@config/llm-connections'
import { getProviderMetadata } from '@config/provider-metadata'
import { ANTHROPIC_MODELS } from '@config/models'

/**
 * Format token count for display (e.g., 1500 -> "1.5k", 200000 -> "200k").
 * Shared by the desktop model dropdown and the compact (drawer) model picker.
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1)}k`
  }
  return tokens.toString()
}

/**
 * Strip the "pi/" prefix from model IDs/display names so the user sees a
 * provider-agnostic label in the picker (e.g., "pi/claude-opus" → "claude-opus").
 */
export function stripPiPrefixForDisplay(value: string): string {
  return value.startsWith('pi/') ? value.slice(3) : value
}

export type ProviderLabelKey =
  | 'chat.modelPicker.provider.anthropic'
  | 'chat.modelPicker.provider.customApis'
  | 'chat.modelPicker.provider.githubCopilot'
  | 'chat.modelPicker.provider.local'
  | 'chat.modelPicker.provider.openai'
  | 'chat.modelPicker.provider.other'

export interface AccountPickerEntry<T extends LlmConnection = LlmConnection> {
  connection: T
  identityLine: string | null
}

export interface ProviderAccountGroup<T extends LlmConnection = LlmConnection> {
  id: string
  label?: string
  labelKey?: ProviderLabelKey
  accounts: AccountPickerEntry<T>[]
}

interface ProviderDescriptor {
  id: string
  label?: string
  labelKey?: ProviderLabelKey
  order: number
}

function humanizeProviderId(provider: string): string {
  return provider
    .split(/[-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function describeProvider(connection: LlmConnection): ProviderDescriptor {
  const provider = connection.providerType || 'anthropic'
  if (provider === 'anthropic' || connection.piAuthProvider === 'anthropic') {
    return {
      id: 'anthropic',
      labelKey: 'chat.modelPicker.provider.anthropic',
      order: 10,
    }
  }

  if (provider === 'pi') {
    if (connection.piAuthProvider === 'openai-codex' || connection.piAuthProvider === 'openai') {
      return {
        id: 'openai',
        labelKey: 'chat.modelPicker.provider.openai',
        order: 20,
      }
    }
    if (connection.piAuthProvider === 'github-copilot') {
      return {
        id: 'github-copilot',
        labelKey: 'chat.modelPicker.provider.githubCopilot',
        order: 30,
      }
    }
    if (connection.piAuthProvider) {
      const metadata = getProviderMetadata(provider, connection.piAuthProvider)
      return {
        id: `pi:${connection.piAuthProvider}`,
        label: metadata?.name ?? humanizeProviderId(connection.piAuthProvider),
        order: 50,
      }
    }
    return {
      id: 'other',
      labelKey: 'chat.modelPicker.provider.other',
      order: 80,
    }
  }

  if (provider === 'pi_compat' && isLocalConnection(connection)) {
    return {
      id: 'local',
      labelKey: 'chat.modelPicker.provider.local',
      order: 40,
    }
  }

  return {
    id: 'custom-apis',
    labelKey: 'chat.modelPicker.provider.customApis',
    order: 70,
  }
}

function getIdentityLine(connection: LlmConnection): string | null {
  const parts = [connection.oauthAccountEmail, connection.oauthOrganizationName]
    .map(value => value?.trim())
    .filter((value): value is string => !!value)
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Build the picker hierarchy Provider → Account/connection → Models.
 *
 * Connections keep their input order within each provider. Provider order is
 * stable and user-facing backend implementation names never leak into labels.
 */
export function groupConnectionsByProviderAccount<T extends LlmConnection>(
  connections: readonly T[],
): ProviderAccountGroup<T>[] {
  const groups = new Map<string, ProviderAccountGroup<T> & { order: number }>()

  for (const conn of connections) {
    const descriptor = describeProvider(conn)
    const entry = {
      connection: conn,
      identityLine: getIdentityLine(conn),
    }
    const existing = groups.get(descriptor.id)
    if (existing) {
      existing.accounts.push(entry)
    } else {
      groups.set(descriptor.id, {
        id: descriptor.id,
        label: descriptor.label,
        labelKey: descriptor.labelKey,
        accounts: [entry],
        order: descriptor.order,
      })
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...group }) => group)
}

export interface ConnectionModelOption {
  id: string
  name: string
}

/** Prefer a different authenticated account for “continue with another agent”. */
export function chooseInitialHandoffConnection<
  T extends LlmConnection & { isAuthenticated: boolean; isDefault?: boolean },
>(connections: readonly T[], currentConnection?: string): T | undefined {
  const authenticated = connections.filter(connection => connection.isAuthenticated)
  return authenticated.find(connection => connection.slug !== currentConnection && connection.isDefault)
    ?? authenticated.find(connection => connection.slug !== currentConnection)
    ?? authenticated.find(connection => connection.slug === currentConnection)
    ?? authenticated[0]
}

/**
 * Normalize a connection's string/object model list for small account/model
 * pickers such as linked handoff. The persisted default remains selectable
 * even when a stale provider sync omitted it from `models`.
 */
export function getConnectionModelOptions(
  connection: LlmConnection,
): ConnectionModelOption[] {
  const source = connection.models?.length ? connection.models : ANTHROPIC_MODELS
  const byId = new Map<string, ConnectionModelOption>()

  for (const model of source) {
    const id = typeof model === 'string' ? model : model.id
    byId.set(id, {
      id,
      name: typeof model === 'string'
        ? stripPiPrefixForDisplay(model)
        : (model.name ?? stripPiPrefixForDisplay(model.id)),
    })
  }

  if (connection.defaultModel && !byId.has(connection.defaultModel)) {
    byId.set(connection.defaultModel, {
      id: connection.defaultModel,
      name: stripPiPrefixForDisplay(connection.defaultModel),
    })
  }

  const options = [...byId.values()]
  if (!connection.defaultModel) return options
  return options.sort((a, b) => {
    if (a.id === connection.defaultModel) return -1
    if (b.id === connection.defaultModel) return 1
    return 0
  })
}
