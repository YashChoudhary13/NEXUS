import { RPC_CHANNELS, type ChatGptOAuthResult, type LlmConnectionSetup, type OAuthIdentityDto } from '@craft-agent/shared/protocol'
import { getLlmConnections, getLlmConnection, addLlmConnection, updateLlmConnection, deleteLlmConnection, getDefaultLlmConnection, setDefaultLlmConnection, touchLlmConnection, isCompatProvider, isAnthropicProvider, getDefaultModelsForConnection, getDefaultModelForConnection, type LlmConnection, type LlmConnectionWithStatus, toBedrockNativeId, deriveBedrockRegionPrefix } from '@craft-agent/shared/config'
import {
  activateLlmOAuthCredentials,
  beginLlmOAuthCredentialFlow,
  cancelLlmOAuthCredentialFlow,
  getCredentialManager,
  isLlmCredentialEpochCurrent,
  isLlmOAuthCredentialFlowCurrent,
  revokeLlmCredentials,
  withLlmCredentialCommit,
} from '@craft-agent/shared/credentials'
import { setSetupDeferred } from '@craft-agent/shared/config/storage'
import { clearOAuthState } from '@craft-agent/shared/auth'
import {
  resolveSetupTestConnectionHint,
  testBackendConnection,
  validateStoredBackendConnection,
} from '@craft-agent/shared/agent/backend'
import { getModelRefreshService } from '@craft-agent/server-core/model-fetchers'
import { parseTestConnectionError, createBuiltInConnection, validateModelList, piAuthProviderDisplayName, validateSetupTestInput, setupTestRequiresApiKey, resolveCustomEndpointSetup, getServerOwnedOAuthBuiltInKind, isChatGptOAuthConnectionTarget, isClaudeOAuthConnectionTarget, isGitHubCopilotOAuthConnectionTarget, isServerOwnedOAuthBuiltInSlug } from '@craft-agent/server-core/domain'
import { getWorkspaceOrThrow, buildBackendHostRuntimeContext } from '@craft-agent/server-core/handlers'
import {
  bumpLlmConnectionBindingVersion,
  cancelClaudeOAuthFlow,
  captureLlmConnectionBindingVersion,
  isClaudeOAuthFlowForConnection,
  isLlmConnectionBindingVersionCurrent,
  withClaudeOAuthFlowMutation,
  withLlmConnectionMutation,
} from '@craft-agent/server-core/services'
import { pushTyped, type RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { randomUUID } from 'node:crypto'
import { CLIENT_OPEN_EXTERNAL } from '@craft-agent/server-core/transport'

interface PendingCopilotOAuthFlow {
  controller: AbortController
  bindingVersion: number
  oauthEpoch: number
  generation: number
  slugGeneration: number
}

// Local OAuth state. Keep the flow keyed by credential slug so logout can
// abort and generation-fence exactly the credential it invalidates.
const copilotOAuthAborts = new Map<string, PendingCopilotOAuthFlow>()
let copilotOAuthGeneration = 0
const copilotOAuthStartGenerationBySlug = new Map<string, number>()

function advanceCopilotOAuthStartGeneration(connectionSlug: string): number {
  const generation = (copilotOAuthStartGenerationBySlug.get(connectionSlug) ?? 0) + 1
  copilotOAuthStartGenerationBySlug.set(connectionSlug, generation)
  return generation
}

function isCopilotOAuthStartGenerationCurrent(connectionSlug: string, generation: number): boolean {
  return copilotOAuthStartGenerationBySlug.get(connectionSlug) === generation
}

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.llmConnections.LIST,
  RPC_CHANNELS.llmConnections.LIST_WITH_STATUS,
  RPC_CHANNELS.llmConnections.GET,
  RPC_CHANNELS.llmConnections.GET_API_KEY,
  RPC_CHANNELS.llmConnections.SAVE,
  RPC_CHANNELS.llmConnections.DELETE,
  RPC_CHANNELS.llmConnections.TEST,
  RPC_CHANNELS.llmConnections.SET_DEFAULT,
  RPC_CHANNELS.llmConnections.SET_WORKSPACE_DEFAULT,
  RPC_CHANNELS.llmConnections.REFRESH_MODELS,
  RPC_CHANNELS.chatgpt.START_OAUTH,
  RPC_CHANNELS.chatgpt.COMPLETE_OAUTH,
  RPC_CHANNELS.chatgpt.CANCEL_OAUTH,
  RPC_CHANNELS.chatgpt.GET_AUTH_STATUS,
  RPC_CHANNELS.chatgpt.LOGOUT,
  RPC_CHANNELS.copilot.START_OAUTH,
  RPC_CHANNELS.copilot.CANCEL_OAUTH,
  RPC_CHANNELS.copilot.GET_AUTH_STATUS,
  RPC_CHANNELS.copilot.LOGOUT,
  RPC_CHANNELS.settings.SETUP_LLM_CONNECTION,
  RPC_CHANNELS.settings.TEST_LLM_CONNECTION_SETUP,
  RPC_CHANNELS.pi.GET_API_KEY_PROVIDERS,
  RPC_CHANNELS.pi.GET_PROVIDER_BASE_URL,
  RPC_CHANNELS.pi.GET_PROVIDER_MODELS,
] as const

export function registerLlmConnectionsHandlers(server: RpcServer, deps: HandlerDeps): void {
  const { sessionManager } = deps

  interface PendingChatGptIdentity {
    identity?: OAuthIdentityDto
    ownerClientId: string
    oauthEpoch: number
    startGeneration: number
    createdAt: number
  }

  const configuredChatGptOAuthTtl = Number(process.env.CRAFT_TEST_CHATGPT_OAUTH_TTL_MS)
  const CHATGPT_OAUTH_TTL_MS = Number.isFinite(configuredChatGptOAuthTtl) && configuredChatGptOAuthTtl > 0
    ? configuredChatGptOAuthTtl
    : 5 * 60 * 1000
  // Credentials are global per connection slug, so there can be only one
  // current pending identity receipt for a slug across all RPC clients.
  const pendingChatGptIdentities = new Map<string, PendingChatGptIdentity>()
  const chatGptOAuthStartGenerationBySlug = new Map<string, number>()
  const pendingConnectionCreationBySlug = new Map<string, symbol>()

  function advanceChatGptOAuthStartGeneration(connectionSlug: string): number {
    const generation = (chatGptOAuthStartGenerationBySlug.get(connectionSlug) ?? 0) + 1
    chatGptOAuthStartGenerationBySlug.set(connectionSlug, generation)
    return generation
  }

  function isChatGptOAuthStartGenerationCurrent(connectionSlug: string, generation: number): boolean {
    return chatGptOAuthStartGenerationBySlug.get(connectionSlug) === generation
  }

  function isServerOwnedChatGptOAuthConnection(
    connectionSlug: string,
    connection: LlmConnection | null | undefined = getLlmConnection(connectionSlug),
  ): boolean {
    // Canonical slugs are server-owned even before their config row exists.
    // Existing reserved-provider rows also cover the legacy `codex` migration
    // slug and fail closed for partially-poisoned historical config.
    return isChatGptOAuthConnectionTarget(connectionSlug, connection)
  }

  type ServerOwnedOAuthKind = 'chatgpt' | 'claude' | 'copilot'

  function getServerOwnedOAuthKind(
    connectionSlug: string,
    connection: LlmConnection | null | undefined = getLlmConnection(connectionSlug),
  ): ServerOwnedOAuthKind | undefined {
    if (isChatGptOAuthConnectionTarget(connectionSlug, connection)) return 'chatgpt'
    if (isClaudeOAuthConnectionTarget(connectionSlug, connection)) return 'claude'
    if (isGitHubCopilotOAuthConnectionTarget(connectionSlug, connection)) return 'copilot'
    return undefined
  }

  function getStoredServerOwnedOAuthKind(
    connection: LlmConnection | null | undefined,
  ): ServerOwnedOAuthKind | undefined {
    if (!connection || connection.authType !== 'oauth') return undefined
    if (connection.providerType === 'pi' && connection.piAuthProvider === 'openai-codex') return 'chatgpt'
    if (connection.providerType === 'anthropic' && !connection.piAuthProvider) return 'claude'
    if (connection.providerType === 'pi' && connection.piAuthProvider === 'github-copilot') return 'copilot'
    return undefined
  }

  function hasSameConnectionBinding(
    left: LlmConnection | null | undefined,
    right: LlmConnection | null | undefined,
  ): boolean {
    if (!left || !right) return left === right
    return left.slug === right.slug
      && left.providerType === right.providerType
      && left.authType === right.authType
      && left.piAuthProvider === right.piAuthProvider
      && left.baseUrl === right.baseUrl
      && left.customEndpoint?.api === right.customEndpoint?.api
  }

  function cleanupExpiredChatGptIdentities(): void {
    const now = Date.now()
    for (const [key, pending] of pendingChatGptIdentities) {
      if (now - pending.createdAt > CHATGPT_OAUTH_TTL_MS) {
        pendingChatGptIdentities.delete(key)
      }
    }
  }

  // Unified handler for LLM connection setup
  server.handle(RPC_CHANNELS.settings.SETUP_LLM_CONNECTION, async (ctx, setup: LlmConnectionSetup): Promise<{ success: boolean; error?: string }> => {
    let pendingConnectionCreationToken: symbol | undefined
    try {
      const manager = getCredentialManager()
      let missingUpdateOnlyOAuthKind: ServerOwnedOAuthKind | undefined
      const captureInitialBinding = () => withLlmConnectionMutation(setup.slug, async () => {
        const connection = getLlmConnection(setup.slug)
        const creationPending = !connection && pendingConnectionCreationBySlug.has(setup.slug)
        if (!connection && !creationPending && !setup.updateOnly) {
          pendingConnectionCreationToken = Symbol(setup.slug)
          pendingConnectionCreationBySlug.set(setup.slug, pendingConnectionCreationToken)
        }
        missingUpdateOnlyOAuthKind = setup.updateOnly && !connection && !creationPending
          ? getServerOwnedOAuthKind(setup.slug, connection)
          : undefined

        // Decide that an update-only target is missing while holding the same
        // slug lock used by row creation/deletion. Otherwise a concurrent first
        // setup could create the row between this decision and the snapshot,
        // leaving a valid new row paired with a lifecycle we just revoked.
        if (missingUpdateOnlyOAuthKind === 'chatgpt') {
          advanceChatGptOAuthStartGeneration(setup.slug)
          revokeLlmCredentials(setup.slug)
          clearChatGptOAuthStateForSlug(setup.slug)
        } else if (missingUpdateOnlyOAuthKind === 'copilot') {
          advanceCopilotOAuthStartGeneration(setup.slug)
          revokeLlmCredentials(setup.slug)
          copilotOAuthAborts.get(setup.slug)?.controller.abort()
          copilotOAuthAborts.delete(setup.slug)
        } else if (missingUpdateOnlyOAuthKind === 'claude') {
          revokeLlmCredentials(setup.slug)
          if (isClaudeOAuthFlowForConnection(setup.slug)) {
            cancelClaudeOAuthFlow()
            clearOAuthState()
          }
        }

        return {
          connection,
          creationPending,
          version: captureLlmConnectionBindingVersion(setup.slug),
        }
      })
      const initialBinding = setup.updateOnly && isClaudeOAuthConnectionTarget(setup.slug)
        ? await withClaudeOAuthFlowMutation(captureInitialBinding)
        : await captureInitialBinding()
      if (initialBinding.creationPending) {
        return { success: false, error: 'Connection setup is already in progress. Please try again.' }
      }

      // Ensure connection exists in config
      let connection = initialBinding.connection
      let isNewConnection = false
      if (!connection) {
        // Reauth guard: if updateOnly is set, the connection must already exist.
        // Clean up any orphaned credentials from a preceding OAuth flow.
        if (setup.updateOnly) {
          const cleanupMissingConnection = () => withLlmConnectionMutation(setup.slug, async () => {
            if (
              !isLlmConnectionBindingVersionCurrent(setup.slug, initialBinding.version)
              || getLlmConnection(setup.slug)
            ) {
              return { success: false, error: 'Connection changed during setup. Please try again.' }
            }

            if (missingUpdateOnlyOAuthKind) {
              revokeLlmCredentials(setup.slug)
              clearChatGptOAuthStateForSlug(setup.slug)
              copilotOAuthAborts.get(setup.slug)?.controller.abort()
              copilotOAuthAborts.delete(setup.slug)
              const affectedRuntimeSlugs = [
                setup.slug,
                ...(missingUpdateOnlyOAuthKind === 'claude'
                  ? getLlmConnections()
                      .filter(candidate => getStoredServerOwnedOAuthKind(candidate) === 'claude')
                      .map(candidate => candidate.slug)
                  : []),
              ]
              const runtimeInvalidations = affectedRuntimeSlugs.map(connectionSlug => (
                sessionManager.invalidateConnectionAuth(connectionSlug)
              ))
              try {
                await withLlmCredentialCommit(setup.slug, async () => {
                  revokeLlmCredentials(setup.slug)
                  clearChatGptOAuthStateForSlug(setup.slug)
                  await manager.deleteLlmCredentials(setup.slug)
                  if (missingUpdateOnlyOAuthKind === 'claude') {
                    let survivingCredential = null
                    for (const survivor of getLlmConnections()) {
                      if (getStoredServerOwnedOAuthKind(survivor) !== 'claude') continue
                      survivingCredential = await manager.getLlmOAuth(survivor.slug)
                      if (survivingCredential?.accessToken) break
                    }
                    if (survivingCredential?.accessToken) {
                      await manager.setClaudeOAuthCredentials({
                        ...survivingCredential,
                        source: 'native',
                      })
                    } else {
                      await manager.deleteClaudeOAuthCredentials()
                    }
                  }
                })
              } finally {
                await Promise.all(runtimeInvalidations)
                await Promise.all(affectedRuntimeSlugs.map(connectionSlug => (
                  sessionManager.invalidateConnectionAuth(connectionSlug)
                )))
              }
            } else {
              await manager.deleteLlmCredentials(setup.slug)
            }
            deps.platform.logger?.warn(`[SETUP_LLM_CONNECTION] updateOnly rejected for missing slug: ${setup.slug}`)
            return { success: false, error: 'Connection not found. Cannot re-authenticate a non-existent connection.' }
          })
          return missingUpdateOnlyOAuthKind === 'claude'
            ? await withClaudeOAuthFlowMutation(cleanupMissingConnection)
            : await cleanupMissingConnection()
        }
        // Create connection with appropriate defaults based on slug
        connection = createBuiltInConnection(setup.slug, setup.baseUrl)
        isNewConnection = true
      }

      // Resolve the trust boundary from the immutable server-side row (or a
      // canonical built-in slug) before considering any client-authored setup
      // fields. This includes the legacy `codex` migration connection.
      const serverOwnedOAuthKind = getServerOwnedOAuthKind(setup.slug, connection)
      const usesServerOwnedChatGptOAuth = serverOwnedOAuthKind === 'chatgpt'
      const usesServerOwnedClaudeOAuth = serverOwnedOAuthKind === 'claude'
      const usesServerOwnedCopilotOAuth = serverOwnedOAuthKind === 'copilot'
      const usesServerOwnedOAuth = serverOwnedOAuthKind !== undefined
      if (isServerOwnedOAuthBuiltInSlug(setup.slug) && !usesServerOwnedOAuth) {
        return {
          success: false,
          error: 'This OAuth connection has conflicting provider metadata. Delete and recreate it.',
        }
      }
      if (
        !usesServerOwnedChatGptOAuth
        && (connection.piAuthProvider === 'openai-codex' || setup.piAuthProvider === 'openai-codex')
      ) {
        return {
          success: false,
          error: 'The openai-codex provider is reserved for the server ChatGPT OAuth flow.',
        }
      }
      if (usesServerOwnedChatGptOAuth && setup.credential) {
        return {
          success: false,
          error: 'ChatGPT OAuth credentials must be established by the server OAuth flow.',
        }
      }
      if (usesServerOwnedCopilotOAuth && setup.credential) {
        return {
          success: false,
          error: 'GitHub Copilot OAuth credentials must be established by the server OAuth flow.',
        }
      }
      if (usesServerOwnedClaudeOAuth && setup.credential) {
        return {
          success: false,
          error: 'Claude OAuth credentials must be established by the server OAuth flow.',
        }
      }

      const updates: Partial<LlmConnection> = {}
      const hasConfiguredBaseUrl = !usesServerOwnedOAuth && !!setup.baseUrl?.trim()
      if (!usesServerOwnedOAuth && setup.baseUrl !== undefined) {
        updates.baseUrl = setup.baseUrl?.trim() || undefined

        // Only mutate providerType for API key connections (not OAuth connections)
        if (isAnthropicProvider(connection.providerType) && connection.authType !== 'oauth') {
          if (hasConfiguredBaseUrl) {
            updates.providerType = 'pi_compat'
            updates.authType = 'api_key_with_endpoint'
            updates.customEndpoint = { api: 'anthropic-messages' }
          } else {
            updates.providerType = 'anthropic'
            updates.authType = 'api_key'
            updates.models = getDefaultModelsForConnection('anthropic')
            updates.defaultModel = getDefaultModelForConnection('anthropic')
          }
        }

        // Pi API key flow: store baseUrl on the connection (Pi SDK doesn't use it yet,
        // but it's persisted for future backend support)

      }

      if (setup.defaultModel !== undefined) {
        updates.defaultModel = setup.defaultModel ?? undefined
      }
      if (setup.models !== undefined) {
        updates.models = setup.models ?? undefined
      }
      if (setup.modelSelectionMode !== undefined) {
        updates.modelSelectionMode = setup.modelSelectionMode
      }

      const customEndpoint = hasConfiguredBaseUrl ? setup.customEndpoint : undefined
      const isCustomEndpointCompat = !!customEndpoint
      if (customEndpoint) {
        updates.customEndpoint = customEndpoint
        updates.providerType = 'pi_compat'
        const branch = resolveCustomEndpointSetup({
          baseUrl: setup.baseUrl ?? undefined,
          credential: setup.credential ?? undefined,
          customEndpointApi: customEndpoint.api,
        })
        updates.authType = branch.authType
        if (branch.name !== undefined) updates.name = branch.name
        if (branch.piAuthProvider !== undefined) updates.piAuthProvider = branch.piAuthProvider

        // Brand-name override on first setup only (user-renamed connections aren't clobbered on re-save).
        if (isNewConnection && !updates.name && setup.baseUrl?.toLowerCase().includes('manifest.build')) {
          updates.name = 'Manifest'
        }
      } else if (!usesServerOwnedOAuth && setup.baseUrl !== undefined) {
        // Base URL was explicitly updated without custom protocol config.
        // Treat this as non-custom mode and clear stale custom endpoint metadata.
        // Only downgrade existing connections — new ones already have the correct
        // providerType from createBuiltInConnection().
        updates.customEndpoint = undefined
        if (connection.providerType === 'pi_compat' && connection.authType !== 'oauth' && !isNewConnection) {
          updates.providerType = 'pi'
          updates.authType = 'api_key'
        }
      }

      // Pi API key flow: set piAuthProvider from setup data (e.g. 'anthropic', 'google', 'openai').
      // Skip when custom endpoint protocol is driving routing.
      if (!usesServerOwnedOAuth && setup.piAuthProvider && !isCustomEndpointCompat) {
        updates.piAuthProvider = setup.piAuthProvider
        // Update connection name to show the actual provider (e.g. "Craft Agents Backend (Google AI Studio)")
        const providerName = piAuthProviderDisplayName(setup.piAuthProvider)
        if (providerName) {
          updates.name = `Craft Agents Backend (${providerName})`
        }
        // Only set default models when using standard Pi provider AND user didn't pick explicit models
        if (!hasConfiguredBaseUrl && !setup.models?.length) {
          updates.models = getDefaultModelsForConnection('pi', setup.piAuthProvider)
          updates.defaultModel = getDefaultModelForConnection('pi', setup.piAuthProvider)
          updates.modelSelectionMode ??= 'automaticallySyncedFromProvider'
        }
      }

      // Pi+Bedrock auth method override — set authType for IAM or environment auth.
      // providerType stays 'pi' (Bedrock routes through Pi SDK).
      if (!usesServerOwnedOAuth && setup.bedrockAuthMethod) {
        updates.authType = setup.bedrockAuthMethod
      }

      if (usesServerOwnedChatGptOAuth) {
        // Provider/auth provenance and endpoint routing are server-owned. This
        // also repairs canonical rows poisoned by an older vulnerable client.
        updates.providerType = 'pi'
        updates.authType = 'oauth'
        updates.piAuthProvider = 'openai-codex'
        updates.baseUrl = undefined
        updates.customEndpoint = undefined
      } else if (usesServerOwnedClaudeOAuth) {
        updates.providerType = 'anthropic'
        updates.authType = 'oauth'
        updates.piAuthProvider = undefined
        updates.baseUrl = undefined
        updates.customEndpoint = undefined
      } else if (usesServerOwnedCopilotOAuth) {
        updates.providerType = 'pi'
        updates.authType = 'oauth'
        updates.piAuthProvider = 'github-copilot'
        updates.baseUrl = undefined
        updates.customEndpoint = undefined
      }

      // ChatGPT identity is server-owned: COMPLETE records one generation-bound
      // receipt for the slug, and only the completing client may consume it here.
      // Canonical slug provenance means mutable provider metadata cannot switch a
      // Codex connection into the legacy client-authored Claude identity branch.
      cleanupExpiredChatGptIdentities()
      const pendingChatGptIdentity = usesServerOwnedChatGptOAuth
        ? pendingChatGptIdentities.get(setup.slug)
        : undefined
      const canConsumePendingChatGptIdentity = !!(
        pendingChatGptIdentity
        && pendingChatGptIdentity.ownerClientId === ctx.clientId
        && isChatGptOAuthStartGenerationCurrent(setup.slug, pendingChatGptIdentity.startGeneration)
        && isLlmCredentialEpochCurrent(setup.slug, pendingChatGptIdentity.oauthEpoch)
      )
      const hasConflictingStoredChatGptBinding = usesServerOwnedChatGptOAuth
        && !isNewConnection
        && getStoredServerOwnedOAuthKind(connection) !== 'chatgpt'
      if (hasConflictingStoredChatGptBinding && !canConsumePendingChatGptIdentity) {
        return {
          success: false,
          error: 'Complete the server ChatGPT OAuth flow before repairing this connection.',
        }
      }
      if (usesServerOwnedChatGptOAuth && isNewConnection && !canConsumePendingChatGptIdentity) {
        return {
          success: false,
          error: 'Complete the server ChatGPT OAuth flow before creating this connection.',
        }
      }
      const oauthIdentity = usesServerOwnedChatGptOAuth
        ? (canConsumePendingChatGptIdentity ? pendingChatGptIdentity?.identity : undefined)
        : setup.oauthIdentity
      const hasUsableOAuthIdentity = !!(
        oauthIdentity?.account?.uuid
        || oauthIdentity?.account?.emailAddress
        || oauthIdentity?.organization?.uuid
        || oauthIdentity?.organization?.name
      )
      const shouldReplaceOAuthIdentity = usesServerOwnedChatGptOAuth
        ? canConsumePendingChatGptIdentity
        : hasUsableOAuthIdentity
      if (shouldReplaceOAuthIdentity) {
        updates.oauthAccountUuid = oauthIdentity?.account?.uuid
        updates.oauthAccountEmail = oauthIdentity?.account?.emailAddress
        updates.oauthOrganizationUuid = oauthIdentity?.organization?.uuid
        updates.oauthOrganizationName = oauthIdentity?.organization?.name
        updates.oauthProfileVerifiedAt = hasUsableOAuthIdentity ? Date.now() : undefined
      }

      const effectiveProviderType = updates.providerType ?? connection.providerType
      if (effectiveProviderType === 'pi') {
        const isBedrockPi = (updates.piAuthProvider ?? connection.piAuthProvider) === 'amazon-bedrock'
        // For Pi+Bedrock, normalize bare Anthropic IDs to Bedrock-native before adding pi/ prefix
        // so that resolvePiModel() can find them in the amazon-bedrock registry.
        // Use the configured AWS region to select the correct inference profile prefix (us/eu).
        const regionPrefix = isBedrockPi ? deriveBedrockRegionPrefix(setup.awsRegion) : undefined
        const toPiModelId = (id: string) => {
          const bare = id.startsWith('pi/') ? id.slice(3) : id
          const normalized = isBedrockPi ? toBedrockNativeId(bare, regionPrefix) : bare
          return `pi/${normalized}`
        }
        if (updates.models) {
          updates.models = updates.models.map(m => typeof m === 'string' ? toPiModelId(m) : { ...m, id: toPiModelId(m.id) })
        }
        if (updates.defaultModel) {
          updates.defaultModel = toPiModelId(updates.defaultModel)
        }
      }

      const pendingConnection: LlmConnection = {
        ...connection,
        ...updates,
      }

      if (pendingConnection.providerType === 'pi') {
        const modelIds = (pendingConnection.models ?? []).map(m => typeof m === 'string' ? m : m.id)
        deps.platform.logger?.info('Pi setup pending connection snapshot', {
          slug: pendingConnection.slug,
          piAuthProvider: pendingConnection.piAuthProvider,
          modelSelectionMode: pendingConnection.modelSelectionMode,
          defaultModel: pendingConnection.defaultModel,
          modelCount: modelIds.length,
          modelsFirst5: modelIds.slice(0, 5),
          setupModelCount: setup.models?.length,
          setupDefaultModel: setup.defaultModel,
        })
      }

      if (pendingConnection.providerType === 'pi' && pendingConnection.piAuthProvider && !pendingConnection.modelSelectionMode) {
        const inferredMode = setup.models?.length
          ? 'userDefined3Tier'
          : 'automaticallySyncedFromProvider'
        pendingConnection.modelSelectionMode = inferredMode
        updates.modelSelectionMode = inferredMode
      }

      if (updates.models && updates.models.length > 0) {
        const validation = validateModelList(updates.models, pendingConnection.defaultModel)
        if (!validation.valid) {
          return { success: false, error: validation.error }
        }
        if (validation.resolvedDefaultModel) {
          pendingConnection.defaultModel = validation.resolvedDefaultModel
          updates.defaultModel = validation.resolvedDefaultModel
        }
      }

      if (isCompatProvider(pendingConnection.providerType) && !pendingConnection.defaultModel) {
        return { success: false, error: 'Default model is required for compatible endpoints.' }
      }

      const persistSetup = () => withLlmConnectionMutation(setup.slug, async () => {
        const currentConnection = getLlmConnection(setup.slug)
        if (
          !isLlmConnectionBindingVersionCurrent(setup.slug, initialBinding.version)
          || (isNewConnection ? !!currentConnection : !hasSameConnectionBinding(connection, currentConnection))
        ) {
          return { success: false, error: 'Connection changed during setup. Please try again.' }
        }

        if (canConsumePendingChatGptIdentity && pendingChatGptIdentity && (
          pendingChatGptIdentities.get(setup.slug) !== pendingChatGptIdentity
          || !isChatGptOAuthStartGenerationCurrent(setup.slug, pendingChatGptIdentity.startGeneration)
          || !isLlmCredentialEpochCurrent(setup.slug, pendingChatGptIdentity.oauthEpoch)
        )) {
          return { success: false, error: 'ChatGPT OAuth changed during setup. Please try again.' }
        }

        if (usesServerOwnedClaudeOAuth) {
          const restoredGlobalCredential = await withLlmCredentialCommit(setup.slug, async () => {
            const scoped = await manager.getLlmOAuth(setup.slug)
            if (!scoped?.accessToken) return !isNewConnection
            await manager.setClaudeOAuthCredentials({ ...scoped, source: 'native' })
            return true
          })
          if (!restoredGlobalCredential) {
            return { success: false, error: 'Complete the server Claude OAuth flow before setup.' }
          }
        }

        if (isNewConnection) {
          const added = addLlmConnection(pendingConnection)
          if (!added) {
            deps.platform.logger?.error(`Failed to persist LLM connection: ${setup.slug} (config may be inaccessible)`)
            return { success: false, error: 'Failed to save connection. Check server logs for details.' }
          }
          bumpLlmConnectionBindingVersion(setup.slug)
          deps.platform.logger?.info(`Created LLM connection: ${setup.slug}`)
        } else if (Object.keys(updates).length > 0) {
          const bindingChanged = !hasSameConnectionBinding(currentConnection, pendingConnection)
          const updated = updateLlmConnection(setup.slug, updates)
          if (!updated) {
            deps.platform.logger?.error(`Failed to update LLM connection: ${setup.slug}`)
            return { success: false, error: 'Failed to update connection. Check server logs for details.' }
          }
          if (bindingChanged) bumpLlmConnectionBindingVersion(setup.slug)
          deps.platform.logger?.info(`Updated LLM connection settings: ${setup.slug}`)
        }

        // Store credentials in the same slug-mutation boundary as the row.
        const isMasked = setup.credential?.includes('••')
        if (!usesServerOwnedOAuth && setup.credential && !isMasked) {
          const authType = pendingConnection.authType
          if (authType === 'oauth') {
            await manager.setLlmOAuth(setup.slug, { accessToken: setup.credential })
            deps.platform.logger?.info('Saved OAuth access token to LLM connection')
          } else {
            await manager.setLlmApiKey(setup.slug, setup.credential)
            deps.platform.logger?.info('Saved API key to LLM connection')
          }
        }

        if (setup.iamCredentials) {
          await manager.setLlmIamCredentials(setup.slug, {
            ...setup.iamCredentials,
            region: setup.awsRegion,
          })
          deps.platform.logger?.info('Saved IAM credentials to LLM connection')
        }
        return { success: true }
      })
      const persisted = usesServerOwnedClaudeOAuth
        ? await withClaudeOAuthFlowMutation(persistSetup)
        : await persistSetup()
      if (!persisted.success) return persisted

      // Set as default only if no default exists yet (first connection)
      if (!getDefaultLlmConnection()) {
        setDefaultLlmConnection(setup.slug)
        deps.platform.logger?.info(`Set default LLM connection: ${setup.slug}`)
      }

      // Fetch available models before returning to the UI.
      // Always refresh for auto-synced connections (e.g. Copilot, Bedrock) — the static
      // catalog from setup is just a seed that needs replacing with live API data
      // filtered by the user's policy. For user-defined connections, only refresh
      // when no models were populated during setup.
      // Awaited so the model selector shows real available models immediately.
      const pendingModels = Array.isArray(pendingConnection.models) ? pendingConnection.models : []
      const isAutoSynced = pendingConnection.modelSelectionMode === 'automaticallySyncedFromProvider'
      if (!pendingModels.length || isAutoSynced) {
        try {
          await getModelRefreshService().refreshNow(setup.slug)
        } catch (err) {
          deps.platform.logger?.warn(`Model refresh after setup failed for ${setup.slug}: ${err instanceof Error ? err.message : err}`)
        }
      }

      // Reinitialize auth for the connection that was just created/updated,
      // not the global default (which may be a different connection).
      await sessionManager.reinitializeAuth(setup.slug)
      deps.platform.logger?.info('Reinitialized auth after LLM connection setup')

      // Clear "Setup later" flag now that user has configured a provider
      setSetupDeferred(false)

      // Consume only after the complete setup transaction succeeds. A failed
      // setup can retry with the same server-owned identity until the short TTL.
      if (
        canConsumePendingChatGptIdentity
        && pendingChatGptIdentity
        && pendingChatGptIdentities.get(setup.slug) === pendingChatGptIdentity
        && isChatGptOAuthStartGenerationCurrent(setup.slug, pendingChatGptIdentity.startGeneration)
        && isLlmCredentialEpochCurrent(setup.slug, pendingChatGptIdentity.oauthEpoch)
      ) {
        pendingChatGptIdentities.delete(setup.slug)
      }

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      deps.platform.logger?.error('Failed to setup LLM connection:', message)
      return { success: false, error: message }
    } finally {
      if (
        pendingConnectionCreationToken
        && pendingConnectionCreationBySlug.get(setup.slug) === pendingConnectionCreationToken
      ) {
        pendingConnectionCreationBySlug.delete(setup.slug)
      }
    }
  })

  // Unified connection test — uses the agent factory to spawn a real agent subprocess
  // and validate credentials via runMiniCompletion(). Same code path as actual chat.
  server.handle(RPC_CHANNELS.settings.TEST_LLM_CONNECTION_SETUP, async (_ctx, params: import('@craft-agent/shared/protocol').TestLlmConnectionParams): Promise<import('@craft-agent/shared/protocol').TestLlmConnectionResult> => {
    const { provider, apiKey, baseUrl, model, piAuthProvider, customEndpoint } = params
    const trimmedKey = apiKey?.trim() ?? ''
    const allowEmptyApiKey = !setupTestRequiresApiKey(baseUrl)

    if (!trimmedKey && !allowEmptyApiKey) {
      return { success: false, error: 'API key is required' }
    }

    const setupValidation = validateSetupTestInput({ provider, baseUrl, piAuthProvider })
    if (!setupValidation.valid) {
      return { success: false, error: setupValidation.error }
    }

    const hint = resolveSetupTestConnectionHint({ provider, baseUrl, piAuthProvider, customEndpoint })
    deps.platform.logger?.info(`[testLlmConnectionSetup] Testing: provider=${provider}${piAuthProvider ? ` piAuth=${piAuthProvider}` : ''}${baseUrl ? ` baseUrl=${baseUrl}` : ''} hasCustomEndpoint=${!!customEndpoint} hintProvider=${hint.providerType}`)

    const startedAt = Date.now()
    try {
      const testModel = model || getDefaultModelForConnection(provider, piAuthProvider)
      deps.platform.logger?.info(`[testLlmConnectionSetup] Resolved model: ${testModel}`)
      const result = await testBackendConnection({
        provider,
        apiKey: trimmedKey,
        allowEmptyApiKey,
        model: testModel,
        baseUrl,
        timeoutMs: 45000,
        hostRuntime: buildBackendHostRuntimeContext(deps.platform),
        connection: hint,
      })
      const elapsed = Date.now() - startedAt

      if (!result.success) {
        deps.platform.logger?.info(`[testLlmConnectionSetup] Elapsed: ${elapsed}ms, success=false`)
        deps.platform.logger?.info(`[testLlmConnectionSetup] Raw error: ${(result.error || '').slice(0, 1000)}`)
        return { success: false, error: parseTestConnectionError(result.error || 'Unknown error') }
      }
      deps.platform.logger?.info(`[testLlmConnectionSetup] Elapsed: ${elapsed}ms, success=true`)
      return { success: true }
    } catch (error) {
      const elapsed = Date.now() - startedAt
      const msg = error instanceof Error ? error.message : String(error)
      deps.platform.logger?.info(`[testLlmConnectionSetup] Elapsed: ${elapsed}ms, threw: ${msg.slice(0, 1000)}`)
      return { success: false, error: parseTestConnectionError(msg) }
    }
  })

  // ============================================================
  // Pi Provider Discovery (main process only — Pi SDK can't run in renderer)
  // ============================================================

  server.handle(RPC_CHANNELS.pi.GET_API_KEY_PROVIDERS, async () => {
    const { getPiApiKeyProviders } = await import('@craft-agent/shared/config')
    return getPiApiKeyProviders()
  })

  server.handle(RPC_CHANNELS.pi.GET_PROVIDER_BASE_URL, async (_ctx, provider: string) => {
    const { getPiProviderBaseUrl } = await import('@craft-agent/shared/config')
    return getPiProviderBaseUrl(provider)
  })

  server.handle(RPC_CHANNELS.pi.GET_PROVIDER_MODELS, async (_ctx, provider: string) => {
    const { getModels } = await import('@earendil-works/pi-ai/compat')
    try {
      const models = getModels(provider as Parameters<typeof getModels>[0])
      const sorted = [...models].sort((a, b) => b.cost.output - a.cost.output || b.cost.input - a.cost.input)
      return {
        models: sorted.map(m => ({
          id: m.id.startsWith('pi/') ? m.id : `pi/${m.id}`,
          name: m.name,
          costInput: m.cost.input,
          costOutput: m.cost.output,
          contextWindow: m.contextWindow,
          reasoning: m.reasoning,
        })),
        totalCount: models.length,
      }
    } catch {
      return { models: [], totalCount: 0 }
    }
  })

  // ============================================================
  // LLM Connections (provider configurations)
  // ============================================================

  // List all LLM connections (includes built-in and custom)
  server.handle(RPC_CHANNELS.llmConnections.LIST, async (): Promise<LlmConnection[]> => {
    return getLlmConnections()
  })

  // List all LLM connections with authentication status
  server.handle(RPC_CHANNELS.llmConnections.LIST_WITH_STATUS, async (): Promise<LlmConnectionWithStatus[]> => {
    const connections = getLlmConnections()
    const credentialManager = getCredentialManager()
    const defaultSlug = getDefaultLlmConnection()

    return Promise.all(connections.map(async (conn): Promise<LlmConnectionWithStatus> => {
      // Check if credentials exist for this connection
      const hasCredentials = await credentialManager.hasLlmCredentials(conn.slug, conn.authType)
      return {
        ...conn,
        isAuthenticated: conn.authType === 'none' || hasCredentials,
        isDefault: conn.slug === defaultSlug,
      }
    }))
  })

  // Get a specific LLM connection by slug
  server.handle(RPC_CHANNELS.llmConnections.GET, async (_ctx, slug: string): Promise<LlmConnection | null> => {
    return getLlmConnection(slug)
  })

  // Get stored API key for an LLM connection (masked — for edit form display only)
  server.handle(RPC_CHANNELS.llmConnections.GET_API_KEY, async (_ctx, slug: string): Promise<string | null> => {
    const manager = getCredentialManager()
    const key = await manager.getLlmApiKey(slug)
    if (!key) return null
    // Show provider prefix (first 7 chars) + last 4 chars, mask the middle
    if (key.length > 15) {
      return key.slice(0, 7) + '••••••••' + key.slice(-4)
    }
    return '••••••••'
  })

  // Save (create or update) an LLM connection
  // If connection.slug exists and is found, updates it; otherwise creates new
  server.handle(RPC_CHANNELS.llmConnections.SAVE, async (_ctx, connection: LlmConnection): Promise<{ success: boolean; error?: string }> => {
    try {
      // Identity is derived from provider-issued OAuth claims, never from a
      // generic client-authored connection object (remote clients use SAVE too).
      const {
        oauthAccountUuid: _oauthAccountUuid,
        oauthAccountEmail: _oauthAccountEmail,
        oauthOrganizationUuid: _oauthOrganizationUuid,
        oauthOrganizationName: _oauthOrganizationName,
        oauthProfileVerifiedAt: _oauthProfileVerifiedAt,
        ...safeConnection
      } = connection
      const saved = await withLlmConnectionMutation(safeConnection.slug, async () => {
        const existing = getLlmConnection(safeConnection.slug)
        if (existing) {
          // Generic saves can edit presentation/runtime settings, but cannot
          // rewrite the connection's provider/auth provenance. Those fields are
          // established by server-owned setup flows and the immutable slug.
          const {
            slug: _slug,
            providerType: _providerType,
            authType: _authType,
            piAuthProvider: _piAuthProvider,
            createdAt: _createdAt,
            ...updates
          } = safeConnection
          const storedOAuthKind = getStoredServerOwnedOAuthKind(existing)
          const builtInOAuthKind = getServerOwnedOAuthBuiltInKind(safeConnection.slug)
          const hasCanonicalConflict = builtInOAuthKind !== undefined
            && storedOAuthKind !== builtInOAuthKind
          const oauthKind = hasCanonicalConflict ? undefined : storedOAuthKind
          const endpointProtected = oauthKind !== undefined || builtInOAuthKind !== undefined
          const protectedUpdates = hasCanonicalConflict
            ? {
                ...updates,
                authType: 'none' as const,
                baseUrl: undefined,
                customEndpoint: undefined,
              }
            : oauthKind === 'chatgpt'
            ? {
                ...updates,
                providerType: 'pi' as const,
                authType: 'oauth' as const,
                piAuthProvider: 'openai-codex',
                baseUrl: undefined,
                customEndpoint: undefined,
              }
            : oauthKind === 'claude'
              ? {
                  ...updates,
                  providerType: 'anthropic' as const,
                  authType: 'oauth' as const,
                  piAuthProvider: undefined,
                  baseUrl: undefined,
                  customEndpoint: undefined,
                }
              : oauthKind === 'copilot'
                ? {
                    ...updates,
                    providerType: 'pi' as const,
                    authType: 'oauth' as const,
                    piAuthProvider: 'github-copilot',
                    baseUrl: undefined,
                    customEndpoint: undefined,
                  }
                : endpointProtected
                  ? { ...updates, baseUrl: undefined, customEndpoint: undefined }
                  : updates
          const bindingChanged = !hasSameConnectionBinding(existing, { ...existing, ...protectedUpdates })
          const success = updateLlmConnection(safeConnection.slug, protectedUpdates)
          if (!success) return { success: false, error: 'Failed to update connection' }
          if (bindingChanged) bumpLlmConnectionBindingVersion(safeConnection.slug)
        } else {
          // Provider OAuth provenance is established only by the matching
          // server-owned flow. Generic SAVE cannot create an OAuth row, reserve
          // a built-in namespace, or adopt an orphan encrypted credential.
          if (
            safeConnection.authType === 'oauth'
            || isServerOwnedOAuthBuiltInSlug(safeConnection.slug)
            || safeConnection.piAuthProvider === 'openai-codex'
            || safeConnection.piAuthProvider === 'github-copilot'
          ) {
            return {
              success: false,
              error: 'OAuth connections must be created through the matching server OAuth flow.',
            }
          }
          const success = addLlmConnection(safeConnection)
          if (!success) return { success: false, error: 'Connection with this slug already exists' }
          bumpLlmConnectionBindingVersion(safeConnection.slug)
        }
        return { success: true }
      })
      if (!saved.success) return saved
      deps.platform.logger?.info(`LLM connection saved: ${safeConnection.slug}`)
      // Push runtime updates (e.g. supportsImages toggle) to live sessions on
      // this connection. Detached so SAVE doesn't block on the per-session
      // 15s `update_runtime_config` timeout when subprocesses are slow or
      // wedged. SessionManager serializes the refresh with the next send via
      // its per-session mutex, and the lazy `getOrCreateAgent` refresh remains
      // the correctness backstop if the detached push fails.
      sessionManager.refreshConnectionRuntime(safeConnection.slug).catch(error => {
        deps.platform.logger?.warn(
          `Detached runtime push failed for ${safeConnection.slug}: ${error instanceof Error ? error.message : error}`,
        )
      })
      // Reinitialize auth if the saved connection is the current default
      // (updates env vars and summarization model override)
      const defaultSlug = getDefaultLlmConnection()
      if (defaultSlug === safeConnection.slug) {
        await sessionManager.reinitializeAuth()
      }
      return { success: true }
    } catch (error) {
      deps.platform.logger?.error('Failed to save LLM connection:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // Delete an LLM connection.
  server.handle(RPC_CHANNELS.llmConnections.DELETE, async (_ctx, slug: string): Promise<{ success: boolean; error?: string }> => {
    // Fence OAuth work at request entry, before DELETE yields on the slug
    // mutation queue. This also covers canonical first-login flows whose row
    // has not been created yet.
    const requestedOAuthKind = getServerOwnedOAuthKind(slug)
    if (requestedOAuthKind === 'chatgpt') {
      advanceChatGptOAuthStartGeneration(slug)
      revokeLlmCredentials(slug)
      clearChatGptOAuthStateForSlug(slug)
    } else if (requestedOAuthKind === 'copilot') {
      advanceCopilotOAuthStartGeneration(slug)
      revokeLlmCredentials(slug)
      copilotOAuthAborts.get(slug)?.controller.abort()
      copilotOAuthAborts.delete(slug)
    } else if (requestedOAuthKind === 'claude') {
      revokeLlmCredentials(slug)
      if (isClaudeOAuthFlowForConnection(slug)) {
        cancelClaudeOAuthFlow()
        clearOAuthState()
      }
    }

    const runtimeInvalidations = new Map<string, Promise<void>>()
    const beginRuntimeInvalidation = (connectionSlug: string) => {
      if (!runtimeInvalidations.has(connectionSlug)) {
        runtimeInvalidations.set(
          connectionSlug,
          sessionManager.invalidateConnectionAuth(connectionSlug),
        )
      }
    }
    try {
      const deleteConnection = () => withLlmConnectionMutation(slug, async () => {
        const connection = getLlmConnection(slug)
        const oauthKind = connection
          ? getServerOwnedOAuthKind(slug, connection)
          : requestedOAuthKind
        if (!connection && !oauthKind) return { success: false, error: 'Connection not found' }
        const usesOAuthCredentialLifecycle = oauthKind !== undefined
        const survivingClaudeOAuthConnections = oauthKind === 'claude'
          ? getLlmConnections().filter(candidate => (
              candidate.slug !== slug && getStoredServerOwnedOAuthKind(candidate) === 'claude'
            ))
          : []
        const credentialManager = getCredentialManager()
        if (usesOAuthCredentialLifecycle) revokeLlmCredentials(slug)
        clearChatGptOAuthStateForSlug(slug)
        copilotOAuthAborts.get(slug)?.controller.abort()
        copilotOAuthAborts.delete(slug)
        beginRuntimeInvalidation(slug)
        for (const survivor of survivingClaudeOAuthConnections) {
          // Every live Claude subprocess may have inherited the process-global
          // compatibility token that is about to be cleared/rebound.
          beginRuntimeInvalidation(survivor.slug)
        }
        if (usesOAuthCredentialLifecycle) {
          await withLlmCredentialCommit(slug, async () => {
            revokeLlmCredentials(slug)
            clearChatGptOAuthStateForSlug(slug)
            const previousScoped = oauthKind === 'claude'
              ? await credentialManager.getLlmOAuth(slug)
              : null
            try {
              await credentialManager.deleteLlmCredentials(slug)
              if (oauthKind === 'claude') {
                let survivingCredential = null
                for (const survivor of survivingClaudeOAuthConnections) {
                  survivingCredential = await credentialManager.getLlmOAuth(survivor.slug)
                  if (survivingCredential?.accessToken) break
                }
                if (survivingCredential?.accessToken) {
                  await credentialManager.setClaudeOAuthCredentials({
                    ...survivingCredential,
                    source: 'native',
                  })
                } else {
                  await credentialManager.deleteClaudeOAuthCredentials()
                }
              }
            } catch (error) {
              if (previousScoped) await credentialManager.setLlmOAuth(slug, previousScoped)
              throw error
            }
          })
        } else {
          await credentialManager.deleteLlmCredentials(slug)
        }

        if (!connection) {
          return { success: false, error: 'Connection not found' }
        }

        const success = deleteLlmConnection(slug)
        if (!success) return { success: false, error: 'Failed to delete connection' }
        bumpLlmConnectionBindingVersion(slug)
        getModelRefreshService().stopConnection(slug)
        deps.platform.logger?.info(`LLM connection deleted: ${slug}`)
        return { success: true }
      })
      const result = requestedOAuthKind === 'claude'
        ? await withClaudeOAuthFlowMutation(deleteConnection)
        : await deleteConnection()
      return result
    } catch (error) {
      deps.platform.logger?.error('Failed to delete LLM connection:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    } finally {
      if (runtimeInvalidations.size > 0) {
        await Promise.all(runtimeInvalidations.values())
        await Promise.all(
          [...runtimeInvalidations.keys()].map(connectionSlug => (
            sessionManager.invalidateConnectionAuth(connectionSlug)
          )),
        )
      }
    }
  })

  // Test an LLM connection (validate credentials and connectivity with actual API call)
  server.handle(RPC_CHANNELS.llmConnections.TEST, async (_ctx, slug: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await validateStoredBackendConnection({
        slug,
        hostRuntime: buildBackendHostRuntimeContext(deps.platform),
      })

      if (!result.success) {
        return { success: false, error: result.error }
      }

      touchLlmConnection(slug)

      if (result.shouldRefreshModels) {
        getModelRefreshService().refreshNow(slug).catch(err => {
          deps.platform.logger?.warn(`Model refresh failed during validation: ${err instanceof Error ? err.message : err}`)
        })
      }

      deps.platform.logger?.info(`LLM connection validated: ${slug}`)
      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      deps.platform.logger?.info(`[LLM_CONNECTION_TEST] Error for ${slug}: ${msg.slice(0, 500)}`)
      const { parseValidationError } = await import('@craft-agent/shared/config')
      return { success: false, error: parseValidationError(msg) }
    }
  })

  // Set global default LLM connection
  server.handle(RPC_CHANNELS.llmConnections.SET_DEFAULT, async (_ctx, slug: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const success = setDefaultLlmConnection(slug)
      if (success) {
        deps.platform.logger?.info(`Global default LLM connection set to: ${slug}`)
        // Reinitialize auth so env vars and summarization model override match the new default
        await sessionManager.reinitializeAuth()
      }
      return { success, error: success ? undefined : 'Connection not found' }
    } catch (error) {
      deps.platform.logger?.error('Failed to set default LLM connection:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // Set workspace default LLM connection
  server.handle(RPC_CHANNELS.llmConnections.SET_WORKSPACE_DEFAULT, async (_ctx, workspaceId: string, slug: string | null): Promise<{ success: boolean; error?: string }> => {
    try {
      const workspace = getWorkspaceOrThrow(workspaceId)

      // Validate connection exists if setting (not clearing)
      if (slug) {
        const connection = getLlmConnection(slug)
        if (!connection) {
          return { success: false, error: 'Connection not found' }
        }
      }

      const { loadWorkspaceConfig, saveWorkspaceConfig } = await import('@craft-agent/shared/workspaces')
      const config = loadWorkspaceConfig(workspace.rootPath)
      if (!config) {
        return { success: false, error: 'Failed to load workspace config' }
      }

      // Update workspace defaults
      config.defaults = config.defaults || {}
      if (slug) {
        config.defaults.defaultLlmConnection = slug
      } else {
        delete config.defaults.defaultLlmConnection
      }

      saveWorkspaceConfig(workspace.rootPath, config)
      deps.platform.logger?.info(`Workspace ${workspaceId} default LLM connection set to: ${slug}`)
      return { success: true }
    } catch (error) {
      deps.platform.logger?.error('Failed to set workspace default LLM connection:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // Refresh available models for a connection (dynamic model discovery)
  server.handle(RPC_CHANNELS.llmConnections.REFRESH_MODELS, async (_ctx, slug: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const connection = getLlmConnection(slug)
      if (!connection) {
        return { success: false, error: 'Connection not found' }
      }

      await getModelRefreshService().refreshNow(slug)
      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      deps.platform.logger?.error(`Failed to refresh models for ${slug}: ${msg}`)
      return { success: false, error: msg }
    }
  })

  // ============================================================
  // ChatGPT OAuth (for Codex chatgptAuthTokens mode)
  // Server-owned: prepare + exchange happen here, browser + callback on client.
  // ============================================================

  interface PendingChatGptFlow {
    flowId: string
    state: string
    codeVerifier: string
    connectionSlug: string
    ownerClientId: string
    oauthEpoch: number
    bindingVersion: number
    startGeneration: number
    createdAt: number
    expiryTimer?: ReturnType<typeof setTimeout>
  }
  const pendingChatGptFlows = new Map<string, PendingChatGptFlow>()

  function removePendingChatGptFlow(state: string): PendingChatGptFlow | undefined {
    const flow = pendingChatGptFlows.get(state)
    if (!flow) return undefined
    pendingChatGptFlows.delete(state)
    if (flow.expiryTimer) clearTimeout(flow.expiryTimer)
    return flow
  }

  async function cleanupExpiredChatGptFlows(): Promise<void> {
    const now = Date.now()
    const cancellations: Array<Promise<void>> = []
    for (const [state, flow] of pendingChatGptFlows) {
      if (now - flow.createdAt > CHATGPT_OAUTH_TTL_MS) {
        removePendingChatGptFlow(state)
        cancellations.push(withLlmCredentialCommit(flow.connectionSlug, async () => {
          cancelLlmOAuthCredentialFlow(flow.connectionSlug, flow.oauthEpoch)
        }))
      }
    }
    await Promise.all(cancellations)
  }

  function clearChatGptOAuthStateForSlug(connectionSlug: string): void {
    pendingChatGptIdentities.delete(connectionSlug)
    for (const [state, flow] of pendingChatGptFlows) {
      if (flow.connectionSlug === connectionSlug) {
        removePendingChatGptFlow(state)
      }
    }
  }

  // chatgpt:startOAuth — prepare PKCE + auth URL, store flow, return to client
  server.handle(RPC_CHANNELS.chatgpt.START_OAUTH, async (ctx, connectionSlug: string): Promise<{
    authUrl: string
    state: string
    flowId: string
  }> => {
    // Reserve request order before the first await. LOGOUT, DELETE, or a newer
    // START can invalidate this request even before its PKCE flow is mapped.
    const startGeneration = advanceChatGptOAuthStartGeneration(connectionSlug)
    await cleanupExpiredChatGptFlows()
    if (!isChatGptOAuthStartGenerationCurrent(connectionSlug, startGeneration)) {
      throw new Error('ChatGPT OAuth flow was superseded or logged out')
    }
    cleanupExpiredChatGptIdentities()
    const { prepareChatGptOAuth } = await import('@craft-agent/shared/auth')
    if (!isChatGptOAuthStartGenerationCurrent(connectionSlug, startGeneration)) {
      throw new Error('ChatGPT OAuth flow was superseded or logged out')
    }

    const prepared = prepareChatGptOAuth()
    const flowId = randomUUID()
    // Credentials are slug-global: one newly-started login supersedes every
    // older client flow and unconsumed identity receipt for this exact slug.
    const flowBinding = await withLlmConnectionMutation(connectionSlug, async () => {
      if (!isChatGptOAuthStartGenerationCurrent(connectionSlug, startGeneration)) {
        throw new Error('ChatGPT OAuth flow was superseded or logged out')
      }
      if (!isServerOwnedChatGptOAuthConnection(connectionSlug)) {
        throw new Error(`Invalid ChatGPT OAuth connection slug: ${connectionSlug}`)
      }
      const bindingVersion = captureLlmConnectionBindingVersion(connectionSlug)
      const oauthEpoch = await withLlmCredentialCommit(connectionSlug, async () => {
        if (!isChatGptOAuthStartGenerationCurrent(connectionSlug, startGeneration)) {
          throw new Error('ChatGPT OAuth flow was superseded or logged out')
        }
        pendingChatGptIdentities.delete(connectionSlug)
        return beginLlmOAuthCredentialFlow(connectionSlug)
      })
      return { bindingVersion, oauthEpoch }
    })

    if (!isChatGptOAuthStartGenerationCurrent(connectionSlug, startGeneration)) {
      await withLlmCredentialCommit(connectionSlug, async () => {
        cancelLlmOAuthCredentialFlow(connectionSlug, flowBinding.oauthEpoch)
      })
      throw new Error('ChatGPT OAuth flow was superseded or logged out')
    }

    const pendingFlow: PendingChatGptFlow = {
      flowId,
      state: prepared.state,
      codeVerifier: prepared.codeVerifier,
      connectionSlug,
      ownerClientId: ctx.clientId,
      oauthEpoch: flowBinding.oauthEpoch,
      bindingVersion: flowBinding.bindingVersion,
      startGeneration,
      createdAt: Date.now(),
    }
    pendingChatGptFlows.set(prepared.state, pendingFlow)
    pendingFlow.expiryTimer = setTimeout(() => {
      if (pendingChatGptFlows.get(prepared.state) !== pendingFlow) return
      removePendingChatGptFlow(prepared.state)
      void withLlmCredentialCommit(connectionSlug, async () => {
        cancelLlmOAuthCredentialFlow(connectionSlug, flowBinding.oauthEpoch)
      }).catch(error => {
        deps.platform.logger?.warn(
          `[ChatGPT OAuth] Failed to expire flow for ${connectionSlug}: ${error instanceof Error ? error.message : error}`,
        )
      })
    }, CHATGPT_OAUTH_TTL_MS)
    pendingFlow.expiryTimer.unref?.()

    deps.platform.logger?.info(`[ChatGPT OAuth] Flow started for ${connectionSlug} (flow=${flowId})`)
    return { authUrl: prepared.authUrl, state: prepared.state, flowId }
  })

  // chatgpt:completeOAuth — exchange code for tokens and store credentials
  server.handle(RPC_CHANNELS.chatgpt.COMPLETE_OAUTH, async (ctx, args: {
    flowId: string
    code: string
    state: string
  }): Promise<ChatGptOAuthResult> => {
    const { flowId, code, state } = args
    const flow = pendingChatGptFlows.get(state)

    if (!flow) throw new Error('Unknown or expired ChatGPT OAuth flow')
    if (flow.flowId !== flowId) throw new Error('Flow ID mismatch')
    if (flow.ownerClientId !== ctx.clientId) throw new Error('OAuth flow owned by different client')
    if (Date.now() - flow.createdAt > CHATGPT_OAUTH_TTL_MS) {
      removePendingChatGptFlow(state)
      await withLlmCredentialCommit(flow.connectionSlug, async () => {
        cancelLlmOAuthCredentialFlow(flow.connectionSlug, flow.oauthEpoch)
      })
      throw new Error('ChatGPT OAuth flow expired')
    }
    if (!isLlmOAuthCredentialFlowCurrent(flow.connectionSlug, flow.oauthEpoch)) {
      removePendingChatGptFlow(state)
      return { success: false, error: 'ChatGPT OAuth flow was superseded or logged out' }
    }

    try {
      const { exchangeChatGptTokens, parseChatGptIdToken } = await import('@craft-agent/shared/auth')
      const credentialManager = getCredentialManager()

      const tokens = await exchangeChatGptTokens(code, flow.codeVerifier)
      const identity = parseChatGptIdToken(tokens.idToken)
      const hasUsableIdentity = !!(
        identity?.account?.uuid
        || identity?.account?.emailAddress
        || identity?.organization?.uuid
        || identity?.organization?.name
      )
      let replacedExistingConnection = false
      const committed = await withLlmConnectionMutation(flow.connectionSlug, async () => (
        withLlmCredentialCommit(flow.connectionSlug, async () => {
          if (
            !isLlmConnectionBindingVersionCurrent(flow.connectionSlug, flow.bindingVersion)
            || !isLlmOAuthCredentialFlowCurrent(flow.connectionSlug, flow.oauthEpoch)
          ) return false

          const connection = getLlmConnection(flow.connectionSlug)
          replacedExistingConnection = !!connection
          const requiresRoutingRepair = !!connection && (
            connection.providerType !== 'pi'
            || connection.authType !== 'oauth'
            || connection.piAuthProvider !== 'openai-codex'
            || connection.baseUrl !== undefined
            || connection.customEndpoint !== undefined
          )
          if (requiresRoutingRepair) {
            const repaired = updateLlmConnection(flow.connectionSlug, {
              providerType: 'pi',
              authType: 'oauth',
              piAuthProvider: 'openai-codex',
              baseUrl: undefined,
              customEndpoint: undefined,
            })
            if (!repaired) throw new Error(`Failed to repair ChatGPT OAuth routing for ${flow.connectionSlug}`)
            bumpLlmConnectionBindingVersion(flow.connectionSlug)
          }

          // A credential is persisted only after any conflicting canonical row
          // has been repaired while other row mutations are excluded.
          const previousCredential = await credentialManager.getLlmOAuth(flow.connectionSlug)
          if (!isLlmOAuthCredentialFlowCurrent(flow.connectionSlug, flow.oauthEpoch)) return false
          const restorePreviousCredential = async () => {
            if (previousCredential) {
              await credentialManager.setLlmOAuth(flow.connectionSlug, previousCredential)
            } else {
              await credentialManager.deleteLlmCredentials(flow.connectionSlug)
            }
          }
          try {
            await credentialManager.setLlmOAuth(flow.connectionSlug, {
              accessToken: tokens.accessToken,
              idToken: tokens.idToken,
              refreshToken: tokens.refreshToken,
              expiresAt: tokens.expiresAt,
            })
            if (!isLlmOAuthCredentialFlowCurrent(flow.connectionSlug, flow.oauthEpoch)) {
              await restorePreviousCredential()
              return false
            }
            if (!activateLlmOAuthCredentials(flow.connectionSlug, flow.oauthEpoch)) {
              await restorePreviousCredential()
              return false
            }
          } catch (error) {
            await restorePreviousCredential()
            throw error
          }

          const identityUpdates: Partial<LlmConnection> = {
            oauthAccountUuid: identity?.account?.uuid,
            oauthAccountEmail: identity?.account?.emailAddress,
            oauthOrganizationUuid: identity?.organization?.uuid,
            oauthOrganizationName: identity?.organization?.name,
            oauthProfileVerifiedAt: hasUsableIdentity ? Date.now() : undefined,
          }
          try {
            const updatedExisting = connection
              ? updateLlmConnection(flow.connectionSlug, identityUpdates)
              : false
            if (updatedExisting) {
              pendingChatGptIdentities.delete(flow.connectionSlug)
            } else {
              pendingChatGptIdentities.set(flow.connectionSlug, {
                identity,
                ownerClientId: ctx.clientId,
                oauthEpoch: flow.oauthEpoch,
                startGeneration: flow.startGeneration,
                createdAt: Date.now(),
              })
            }
          } catch (identityError) {
            // Identity is metadata, never an authentication precondition. Keep
            // the successfully activated credential and report OAuth success.
            deps.platform.logger?.warn(
              `[ChatGPT OAuth] Identity persistence failed for ${flow.connectionSlug}: ${identityError instanceof Error ? identityError.message : identityError}`,
            )
          }
          return true
        })
      ))
      removePendingChatGptFlow(state)
      if (!committed) {
        return { success: false, error: 'ChatGPT OAuth flow was superseded or logged out' }
      }
      if (replacedExistingConnection) {
        // A live Pi subprocess retains its prior access token in memory. Dispose
        // exact-slug runtimes before exposing identity for the replacement.
        await sessionManager.invalidateConnectionAuth(flow.connectionSlug)
      }
      deps.platform.logger?.info(`[ChatGPT OAuth] Flow complete for ${flow.connectionSlug}`)
      return { success: true }
    } catch (error) {
      removePendingChatGptFlow(state)
      await withLlmCredentialCommit(flow.connectionSlug, async () => {
        cancelLlmOAuthCredentialFlow(flow.connectionSlug, flow.oauthEpoch)
      })
      deps.platform.logger?.error('[ChatGPT OAuth] Token exchange failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token exchange failed',
      }
    }
  })

  // Cancel ongoing ChatGPT OAuth flow
  server.handle(RPC_CHANNELS.chatgpt.CANCEL_OAUTH, async (ctx, args?: { state?: string }): Promise<{ success: boolean }> => {
    if (args?.state) {
      const flow = pendingChatGptFlows.get(args.state)
      if (flow && flow.ownerClientId === ctx.clientId) {
        removePendingChatGptFlow(args.state)
        await withLlmCredentialCommit(flow.connectionSlug, async () => {
          cancelLlmOAuthCredentialFlow(flow.connectionSlug, flow.oauthEpoch)
        })
        deps.platform.logger?.info(`[ChatGPT OAuth] Flow cancelled for ${flow.connectionSlug}`)
      }
    }
    return { success: true }
  })

  // Get ChatGPT authentication status
  server.handle(RPC_CHANNELS.chatgpt.GET_AUTH_STATUS, async (_ctx, connectionSlug: string): Promise<{
    authenticated: boolean
    expiresAt?: number
    hasRefreshToken?: boolean
  }> => {
    try {
      if (!isServerOwnedChatGptOAuthConnection(connectionSlug, getLlmConnection(connectionSlug))) {
        return { authenticated: false }
      }
      const credentialManager = getCredentialManager()
      const creds = await credentialManager.getLlmOAuth(connectionSlug)

      if (!creds) {
        return { authenticated: false }
      }

      // Check if expired (with 5-minute buffer)
      const isExpired = creds.expiresAt && Date.now() > creds.expiresAt - 5 * 60 * 1000

      return {
        authenticated: !isExpired || !!creds.refreshToken, // Can refresh if has refresh token
        expiresAt: creds.expiresAt,
        hasRefreshToken: !!creds.refreshToken,
      }
    } catch (error) {
      deps.platform.logger?.error('Failed to get ChatGPT auth status:', error)
      return { authenticated: false }
    }
  })

  // Logout from ChatGPT (clear stored tokens)
  server.handle(RPC_CHANNELS.chatgpt.LOGOUT, async (_ctx, connectionSlug: string): Promise<{ success: boolean }> => {
    if (!isServerOwnedChatGptOAuthConnection(connectionSlug, getLlmConnection(connectionSlug))) {
      deps.platform.logger?.warn(`Rejected ChatGPT logout target: ${connectionSlug}`)
      return { success: false }
    }
    // Linearize before yielding so a START that has not registered its flow
    // cannot begin a fresh credential epoch after logout.
    advanceChatGptOAuthStartGeneration(connectionSlug)
    revokeLlmCredentials(connectionSlug)
    clearChatGptOAuthStateForSlug(connectionSlug)
    let runtimeInvalidation: Promise<void> | undefined
    try {
      const result = await withLlmConnectionMutation(connectionSlug, async () => {
        const connection = getLlmConnection(connectionSlug)
        if (!isServerOwnedChatGptOAuthConnection(connectionSlug, connection)) {
          return { success: false }
        }
        const credentialManager = getCredentialManager()
        revokeLlmCredentials(connectionSlug)
        clearChatGptOAuthStateForSlug(connectionSlug)
        runtimeInvalidation = sessionManager.invalidateConnectionAuth(connectionSlug)
        await withLlmCredentialCommit(connectionSlug, async () => {
          revokeLlmCredentials(connectionSlug)
          clearChatGptOAuthStateForSlug(connectionSlug)
          await credentialManager.deleteLlmCredentials(connectionSlug)
          const identityCleared = updateLlmConnection(connectionSlug, {
            oauthAccountUuid: undefined,
            oauthAccountEmail: undefined,
            oauthOrganizationUuid: undefined,
            oauthOrganizationName: undefined,
            oauthProfileVerifiedAt: undefined,
          })
          if (connection && !identityCleared) {
            throw new Error(`Failed to clear OAuth identity for ${connectionSlug}`)
          }
        })
        deps.platform.logger?.info('ChatGPT credentials cleared')
        return { success: true }
      })
      return result
    } catch (error) {
      deps.platform.logger?.error('Failed to clear ChatGPT credentials:', error)
      return { success: false }
    } finally {
      if (runtimeInvalidation) {
        await runtimeInvalidation
        await sessionManager.invalidateConnectionAuth(connectionSlug)
      }
    }
  })

  // ============================================================
  // GitHub Copilot OAuth
  // ============================================================

  async function supersedeCopilotOAuthFlows(
    generation = ++copilotOAuthGeneration,
  ): Promise<number> {
    if (generation !== copilotOAuthGeneration) return generation
    const superseded = [...copilotOAuthAborts.entries()]
    for (const [, flow] of superseded) flow.controller.abort()
    copilotOAuthAborts.clear()
    await Promise.all(superseded.map(([connectionSlug, flow]) => (
      withLlmConnectionMutation(connectionSlug, async () => {
        bumpLlmConnectionBindingVersion(connectionSlug)
        await withLlmCredentialCommit(connectionSlug, async () => {
          cancelLlmOAuthCredentialFlow(connectionSlug, flow.oauthEpoch)
        })
      })
    )))
    return generation
  }

  // Start GitHub Copilot OAuth flow (device flow via Pi SDK)
  server.handle(RPC_CHANNELS.copilot.START_OAUTH, async (ctx, connectionSlug: string): Promise<{
    success: boolean
    error?: string
  }> => {
    if (!isGitHubCopilotOAuthConnectionTarget(connectionSlug, getLlmConnection(connectionSlug))) {
      deps.platform.logger?.warn(`Rejected GitHub Copilot OAuth target: ${connectionSlug}`)
      return {
        success: false,
        error: 'GitHub Copilot OAuth can only target a GitHub Copilot connection.',
      }
    }
    // Reserve request order before dynamic import yields. Logout/delete/cancel
    // can now fence a device flow that has not reached map registration.
    const generation = ++copilotOAuthGeneration
    const slugGeneration = advanceCopilotOAuthStartGeneration(connectionSlug)
    let pendingFlow: PendingCopilotOAuthFlow | undefined
    let activated = false
    try {
      const { loginGitHubCopilot } = await import('@earendil-works/pi-ai/oauth')
      const credentialManager = getCredentialManager()
      if (
        generation !== copilotOAuthGeneration
        || !isCopilotOAuthStartGenerationCurrent(connectionSlug, slugGeneration)
      ) {
        return { success: false, error: 'GitHub Copilot OAuth was superseded. Please start again.' }
      }
      await supersedeCopilotOAuthFlows(generation)
      if (
        generation !== copilotOAuthGeneration
        || !isCopilotOAuthStartGenerationCurrent(connectionSlug, slugGeneration)
      ) {
        return { success: false, error: 'GitHub Copilot OAuth was superseded. Please start again.' }
      }

      const flowBinding = await withLlmConnectionMutation(connectionSlug, async () => {
        if (
          generation !== copilotOAuthGeneration
          || !isCopilotOAuthStartGenerationCurrent(connectionSlug, slugGeneration)
        ) return undefined
        const connection = getLlmConnection(connectionSlug)
        if (!isGitHubCopilotOAuthConnectionTarget(connectionSlug, connection)) return undefined
        const bindingVersion = bumpLlmConnectionBindingVersion(connectionSlug)
        const oauthEpoch = await withLlmCredentialCommit(connectionSlug, async () => (
          beginLlmOAuthCredentialFlow(connectionSlug)
        ))
        return { bindingVersion, oauthEpoch }
      })
      if (!flowBinding) {
        if (
          generation !== copilotOAuthGeneration
          || !isCopilotOAuthStartGenerationCurrent(connectionSlug, slugGeneration)
        ) {
          return { success: false, error: 'GitHub Copilot OAuth was superseded. Please start again.' }
        }
        deps.platform.logger?.warn(`Rejected GitHub Copilot OAuth target: ${connectionSlug}`)
        return {
          success: false,
          error: 'GitHub Copilot OAuth can only target a GitHub Copilot connection.',
        }
      }

      if (
        generation !== copilotOAuthGeneration
        || !isCopilotOAuthStartGenerationCurrent(connectionSlug, slugGeneration)
      ) {
        await withLlmCredentialCommit(connectionSlug, async () => {
          cancelLlmOAuthCredentialFlow(connectionSlug, flowBinding.oauthEpoch)
        })
        return { success: false, error: 'GitHub Copilot OAuth was superseded. Please start again.' }
      }
      const flow: PendingCopilotOAuthFlow = {
        controller: new AbortController(),
        bindingVersion: flowBinding.bindingVersion,
        oauthEpoch: flowBinding.oauthEpoch,
        generation,
        slugGeneration,
      }
      pendingFlow = flow
      copilotOAuthAborts.set(connectionSlug, flow)

      deps.platform.logger?.info(`Starting GitHub Copilot OAuth device flow for connection: ${connectionSlug}`)

      // Use Pi SDK's login flow — this handles the device code flow AND
      // the critical Copilot token exchange that determines the correct
      // API endpoint for the user's subscription tier (individual/business/enterprise).
      const credentials = await loginGitHubCopilot({
        onDeviceCode: ({ userCode, verificationUri }) => {
          deps.platform.logger?.info(`[GitHub OAuth] Device code: ${userCode}`)
          pushTyped(server, RPC_CHANNELS.copilot.DEVICE_CODE, { to: 'client', clientId: ctx.clientId }, {
            userCode,
            verificationUri,
          })
          // Open GitHub device code page on the client's machine
          server.invokeClient(ctx.clientId, CLIENT_OPEN_EXTERNAL, verificationUri).catch(err => {
            deps.platform.logger?.warn(`Failed to open browser for GitHub OAuth: ${err}`)
          })
        },
        onPrompt: async () => {
          // Pi SDK asks for GitHub Enterprise domain — return empty for github.com
          return ''
        },
        onProgress: (message) => {
          deps.platform.logger?.info(`[GitHub OAuth] ${message}`)
        },
        signal: flow.controller.signal,
      })

      // Store the full OAuth credential:
      // - accessToken = Copilot API token (contains proxy-ep for correct endpoint)
      // - refreshToken = GitHub access token (used to refresh the Copilot token)
      // - expiresAt = Copilot token expiry (short-lived, ~1 hour)
      const committed = await withLlmConnectionMutation(connectionSlug, async () => {
        const connection = getLlmConnection(connectionSlug)
        if (
          copilotOAuthAborts.get(connectionSlug) !== flow
          || flow.generation !== copilotOAuthGeneration
          || !isCopilotOAuthStartGenerationCurrent(connectionSlug, flow.slugGeneration)
          || !isLlmConnectionBindingVersionCurrent(connectionSlug, flow.bindingVersion)
          || !isGitHubCopilotOAuthConnectionTarget(connectionSlug, connection)
        ) {
          return false
        }

        return withLlmCredentialCommit(connectionSlug, async () => {
          if (
            copilotOAuthAborts.get(connectionSlug) !== flow
            || flow.generation !== copilotOAuthGeneration
            || !isCopilotOAuthStartGenerationCurrent(connectionSlug, flow.slugGeneration)
            || !isLlmOAuthCredentialFlowCurrent(connectionSlug, flow.oauthEpoch)
          ) return false
          const previousCredential = await credentialManager.getLlmOAuth(connectionSlug)
          if (
            copilotOAuthAborts.get(connectionSlug) !== flow
            || flow.generation !== copilotOAuthGeneration
            || !isCopilotOAuthStartGenerationCurrent(connectionSlug, flow.slugGeneration)
            || !isLlmOAuthCredentialFlowCurrent(connectionSlug, flow.oauthEpoch)
          ) return false
          const restorePreviousCredential = async () => {
            if (previousCredential) {
              await credentialManager.setLlmOAuth(connectionSlug, previousCredential)
            } else {
              await credentialManager.deleteLlmCredentials(connectionSlug)
            }
          }
          try {
            await credentialManager.setLlmOAuth(connectionSlug, {
              accessToken: credentials.access,
              refreshToken: credentials.refresh,
              expiresAt: credentials.expires,
            })
            if (
              copilotOAuthAborts.get(connectionSlug) !== flow
              || flow.generation !== copilotOAuthGeneration
              || !isCopilotOAuthStartGenerationCurrent(connectionSlug, flow.slugGeneration)
              || !isLlmOAuthCredentialFlowCurrent(connectionSlug, flow.oauthEpoch)
            ) {
              await restorePreviousCredential()
              cancelLlmOAuthCredentialFlow(connectionSlug, flow.oauthEpoch)
              return false
            }
            activated = activateLlmOAuthCredentials(connectionSlug, flow.oauthEpoch)
            if (!activated) {
              await restorePreviousCredential()
              return false
            }
          } catch (error) {
            await restorePreviousCredential()
            throw error
          }
          return activated
        })
      })
      if (copilotOAuthAborts.get(connectionSlug) === flow) {
        copilotOAuthAborts.delete(connectionSlug)
      }
      if (!committed) {
        return { success: false, error: 'GitHub Copilot connection changed. Please start again.' }
      }

      await sessionManager.invalidateConnectionAuth(connectionSlug)
      deps.platform.logger?.info('GitHub Copilot OAuth completed successfully')
      return { success: true }
    } catch (error) {
      if (pendingFlow && copilotOAuthAborts.get(connectionSlug) === pendingFlow) {
        copilotOAuthAborts.delete(connectionSlug)
      }
      if (pendingFlow && !activated) {
        await withLlmCredentialCommit(connectionSlug, async () => {
          cancelLlmOAuthCredentialFlow(connectionSlug, pendingFlow!.oauthEpoch)
        })
      }
      deps.platform.logger?.error('GitHub Copilot OAuth failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth authentication failed',
      }
    }
  })

  // Cancel ongoing GitHub OAuth flow
  server.handle(RPC_CHANNELS.copilot.CANCEL_OAUTH, async (): Promise<{ success: boolean }> => {
    const hadPendingFlow = copilotOAuthAborts.size > 0
    // Always advance the global generation so CANCEL also wins the narrow
    // pre-registration window of a concurrently starting device flow.
    await supersedeCopilotOAuthFlows()
    if (hadPendingFlow) deps.platform.logger?.info('GitHub Copilot OAuth cancelled')
    return { success: true }
  })

  // Get GitHub Copilot authentication status
  server.handle(RPC_CHANNELS.copilot.GET_AUTH_STATUS, async (_ctx, connectionSlug: string): Promise<{
    authenticated: boolean
  }> => {
    try {
      return await withLlmConnectionMutation(connectionSlug, async () => {
        const connection = getLlmConnection(connectionSlug)
        if (!isGitHubCopilotOAuthConnectionTarget(connectionSlug, connection)) {
          return { authenticated: false }
        }

        const credentialManager = getCredentialManager()
        const creds = await credentialManager.getLlmOAuth(connectionSlug)
        return { authenticated: !!creds?.accessToken }
      })
    } catch (error) {
      deps.platform.logger?.error('Failed to get GitHub auth status:', error)
      return { authenticated: false }
    }
  })

  // Logout from Copilot (clear stored tokens)
  server.handle(RPC_CHANNELS.copilot.LOGOUT, async (_ctx, connectionSlug: string): Promise<{ success: boolean }> => {
    if (!isGitHubCopilotOAuthConnectionTarget(connectionSlug, getLlmConnection(connectionSlug))) {
      deps.platform.logger?.warn(`Rejected GitHub Copilot logout target: ${connectionSlug}`)
      return { success: false }
    }
    advanceCopilotOAuthStartGeneration(connectionSlug)
    revokeLlmCredentials(connectionSlug)
    const pending = copilotOAuthAborts.get(connectionSlug)
    pending?.controller.abort()
    copilotOAuthAborts.delete(connectionSlug)
    let runtimeInvalidation: Promise<void> | undefined
    try {
      const result = await withLlmConnectionMutation(connectionSlug, async () => {
        const connection = getLlmConnection(connectionSlug)
        if (!isGitHubCopilotOAuthConnectionTarget(connectionSlug, connection)) {
          deps.platform.logger?.warn(`Rejected GitHub Copilot logout target: ${connectionSlug}`)
          return { success: false }
        }

        const credentialManager = getCredentialManager()
        revokeLlmCredentials(connectionSlug)
        runtimeInvalidation = sessionManager.invalidateConnectionAuth(connectionSlug)
        await withLlmCredentialCommit(connectionSlug, async () => {
          revokeLlmCredentials(connectionSlug)
          await credentialManager.deleteLlmCredentials(connectionSlug)
        })
        // Invalidate a START that already returned from the provider even if
        // the SDK ignored AbortSignal while logout was committing.
        bumpLlmConnectionBindingVersion(connectionSlug)
        deps.platform.logger?.info('Copilot credentials cleared')
        return { success: true }
      })
      return result
    } catch (error) {
      deps.platform.logger?.error('Failed to clear Copilot credentials:', error)
      return { success: false }
    } finally {
      if (runtimeInvalidation) {
        await runtimeInvalidation
        await sessionManager.invalidateConnectionAuth(connectionSlug)
      }
    }
  })
}
