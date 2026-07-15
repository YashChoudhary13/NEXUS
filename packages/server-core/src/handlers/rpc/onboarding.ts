/**
 * Onboarding IPC handlers for Electron main process
 *
 * Handles workspace setup and configuration persistence.
 */
import { getAuthState, getSetupNeeds } from '@craft-agent/shared/auth'
import {
  activateLlmOAuthCredentials,
  beginLlmOAuthCredentialFlow,
  cancelLlmOAuthCredentialFlow,
  getCredentialManager,
  isLlmOAuthCredentialFlowCurrent,
  withLlmCredentialCommit,
} from '@craft-agent/shared/credentials'
import { getLlmConnection, setSetupDeferred } from '@craft-agent/shared/config'
import { prepareClaudeOAuth, exchangeClaudeCode, hasValidOAuthState, clearOAuthState, prepareMcpOAuth } from '@craft-agent/shared/auth'
import { validateMcpConnection } from '@craft-agent/shared/mcp'
import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import type { RpcServer } from '@craft-agent/server-core/transport'
import { isClaudeOAuthConnectionTarget } from '@craft-agent/server-core/domain'
import {
  beginClaudeOAuthFlow,
  cancelClaudeOAuthFlow,
  captureLlmConnectionBindingVersion,
  claimClaudeOAuthExchange,
  isLlmConnectionBindingVersionCurrent,
  isClaudeOAuthExchangeCurrent,
  registerClaudeOAuthCredentialFlow,
  releaseClaudeOAuthExchange,
  withClaudeOAuthFlowMutation,
  withLlmConnectionMutation,
} from '@craft-agent/server-core/services'
import type { HandlerDeps } from '../handler-deps'

// ============================================
// IPC Handlers
// ============================================

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.onboarding.GET_AUTH_STATE,
  RPC_CHANNELS.onboarding.VALIDATE_MCP,
  RPC_CHANNELS.onboarding.START_MCP_OAUTH,
  RPC_CHANNELS.onboarding.START_CLAUDE_OAUTH,
  RPC_CHANNELS.onboarding.EXCHANGE_CLAUDE_CODE,
  RPC_CHANNELS.onboarding.HAS_CLAUDE_OAUTH_STATE,
  RPC_CHANNELS.onboarding.CLEAR_CLAUDE_OAUTH_STATE,
  RPC_CHANNELS.onboarding.DEFER_SETUP,
] as const

export function registerOnboardingHandlers(server: RpcServer, deps: HandlerDeps): void {
  const log = deps.platform.logger

  // Get current auth state
  server.handle(RPC_CHANNELS.onboarding.GET_AUTH_STATE, async () => {
    const authState = await getAuthState()
    const setupNeeds = getSetupNeeds(authState)
    // Redact raw credentials — renderer only needs boolean flags (hasCredentials, setupNeeds)
    return {
      authState: {
        ...authState,
        billing: {
          ...authState.billing,
          apiKey: authState.billing.apiKey ? '••••' : null,
          claudeOAuthToken: authState.billing.claudeOAuthToken ? '••••' : null,
        },
      },
      setupNeeds,
    }
  })

  // Validate MCP connection
  server.handle(RPC_CHANNELS.onboarding.VALIDATE_MCP, async (_ctx, mcpUrl: string, accessToken?: string) => {
    try {
      const result = await validateMcpConnection({
        mcpUrl,
        mcpAccessToken: accessToken,
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // Prepare MCP server OAuth (server-side only — no browser open).
  // Returns authUrl for the client to open locally.
  // NOTE: Currently unused in renderer. If re-enabled, needs client-side
  // orchestration (callback server + browser open) like performOAuth().
  server.handle(RPC_CHANNELS.onboarding.START_MCP_OAUTH, async (_ctx, mcpUrl: string, callbackPort?: number) => {
    log.info('[Onboarding:Main] ONBOARDING_START_MCP_OAUTH received')
    try {
      if (!callbackPort) {
        throw new Error('callbackPort is required — client must run a local callback server')
      }
      const prepared = await prepareMcpOAuth(mcpUrl, { callbackPort })
      log.info('[Onboarding:Main] MCP OAuth prepared, returning authUrl to client')

      return {
        success: true,
        authUrl: prepared.authUrl,
        state: prepared.state,
        codeVerifier: prepared.codeVerifier,
        tokenEndpoint: prepared.tokenEndpoint,
        clientId: prepared.clientId,
        redirectUri: prepared.redirectUri,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.error('[Onboarding:Main] MCP OAuth prepare failed:', message)
      return { success: false, error: message }
    }
  })

  // Prepare Claude OAuth flow (server-side only — no browser open).
  // Returns authUrl for the client to open locally via shell.openExternal.
  server.handle(RPC_CHANNELS.onboarding.START_CLAUDE_OAUTH, async (_ctx, connectionSlug: string) => {
    try {
      if (!isClaudeOAuthConnectionTarget(connectionSlug, getLlmConnection(connectionSlug))) {
        return {
          success: false,
          error: 'Claude OAuth can only target a Claude OAuth connection.',
        }
      }
      log.info('[Onboarding] Preparing Claude OAuth flow...')

      const authUrl = await withClaudeOAuthFlowMutation(() => {
        beginClaudeOAuthFlow(connectionSlug)
        return prepareClaudeOAuth()
      })

      log.info('[Onboarding] Claude OAuth URL generated (client will open browser)')
      return { success: true, authUrl }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.error('[Onboarding] Prepare Claude OAuth error:', message)
      return { success: false, error: message }
    }
  })

  // Exchange authorization code for tokens
  server.handle(RPC_CHANNELS.onboarding.EXCHANGE_CLAUDE_CODE, async (_ctx, authorizationCode: string, connectionSlug: string) => {
    // Reject cross-provider slugs before touching their shared credential
    // lifecycle. The target is checked again under its mutation boundary.
    if (!isClaudeOAuthConnectionTarget(connectionSlug, getLlmConnection(connectionSlug))) {
      log.warn(`[Onboarding] Rejected Claude OAuth target: ${connectionSlug}`)
      return {
        success: false,
        error: 'Claude OAuth can only target a Claude OAuth connection.',
      }
    }

    let flowGeneration: number | undefined
    // Linearize the request before its first await. DELETE can synchronously
    // revoke this epoch even while target lookup or token exchange is pending.
    const oauthEpoch = beginLlmOAuthCredentialFlow(connectionSlug)
    let activated = false
    try {
      const bindingVersion = await withLlmConnectionMutation(connectionSlug, async () => {
        const connection = getLlmConnection(connectionSlug)
        return isClaudeOAuthConnectionTarget(connectionSlug, connection)
          ? captureLlmConnectionBindingVersion(connectionSlug)
          : undefined
      })
      if (bindingVersion === undefined) {
        log.warn(`[Onboarding] Rejected Claude OAuth target: ${connectionSlug}`)
        return {
          success: false,
          error: 'Claude OAuth can only target a Claude OAuth connection.',
        }
      }

      log.info(`[Onboarding] Exchanging Claude authorization code for connection: ${connectionSlug}`)

      flowGeneration = await withClaudeOAuthFlowMutation(() => {
        if (!hasValidOAuthState()) return undefined
        const claimed = claimClaudeOAuthExchange(connectionSlug)
        if (claimed === undefined) return undefined
        return registerClaudeOAuthCredentialFlow(claimed, connectionSlug, oauthEpoch)
          ? claimed
          : undefined
      })
      if (flowGeneration === undefined) {
        log.error('[Onboarding] No valid OAuth state found')
        return { success: false, error: 'OAuth session expired. Please start again.' }
      }

      const tokens = await exchangeClaudeCode(authorizationCode, (status) => {
        log.info('[Onboarding] Claude code exchange status:', status)
      })

      // Save credentials with refresh token support
      const manager = getCredentialManager()

      const committed = await withClaudeOAuthFlowMutation(async () => {
        if (!isClaudeOAuthExchangeCurrent(flowGeneration!)) return false
        return withLlmConnectionMutation(connectionSlug, async () => {
          const connection = getLlmConnection(connectionSlug)
          if (
            !isLlmConnectionBindingVersionCurrent(connectionSlug, bindingVersion)
            || !isClaudeOAuthConnectionTarget(connectionSlug, connection)
          ) {
            return false
          }

          return withLlmCredentialCommit(connectionSlug, async () => {
            if (
              !isClaudeOAuthExchangeCurrent(flowGeneration!)
              || !isLlmOAuthCredentialFlowCurrent(connectionSlug, oauthEpoch)
            ) return false

            const previousScoped = await manager.getLlmOAuth(connectionSlug)
            const previousGlobal = await manager.getClaudeOAuthCredentials()
            const restorePrevious = async () => {
              if (previousScoped) await manager.setLlmOAuth(connectionSlug, previousScoped)
              else await manager.deleteLlmCredentials(connectionSlug)
              if (previousGlobal) await manager.setClaudeOAuthCredentials(previousGlobal)
              else await manager.deleteClaudeOAuthCredentials()
            }

            // Save to the scoped connection and the inherited global validation
            // key while START/CLEAR and row replacement are excluded.
            try {
              await manager.setLlmOAuth(connectionSlug, {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: tokens.expiresAt,
              })
              await manager.setClaudeOAuthCredentials({
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: tokens.expiresAt,
                source: 'native',
              })
              if (
                !isClaudeOAuthExchangeCurrent(flowGeneration!)
                || !isLlmOAuthCredentialFlowCurrent(connectionSlug, oauthEpoch)
              ) {
                await restorePrevious()
                return false
              }
              activated = activateLlmOAuthCredentials(connectionSlug, oauthEpoch)
              if (!activated) {
                await restorePrevious()
                return false
              }
              return true
            } catch (error) {
              await restorePrevious()
              throw error
            }
          })
        })
      })
      if (!committed) {
        return { success: false, error: 'Claude OAuth connection changed. Please start again.' }
      }

      const expiresAtDate = tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : 'never'
      log.info(`[Onboarding] Claude OAuth saved to LLM connection (expires: ${expiresAtDate})`)
      // Claude SDK subprocesses inherit their token at spawn time. Reauth must
      // dispose exact-slug runtimes before the new identity is exposed.
      await deps.sessionManager?.invalidateConnectionAuth(connectionSlug)
      // Forward resolved identity (issue #838) so the renderer can thread it into
      // the SETUP payload, which is where it actually gets persisted. Credentials
      // are stored above via setLlmOAuth; identity is not a credential.
      const identity = (tokens.account || tokens.organization)
        ? { account: tokens.account, organization: tokens.organization }
        : undefined
      return { success: true, identity }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.error('[Onboarding] Exchange Claude code error:', message)
      return { success: false, error: message }
    } finally {
      if (!activated) cancelLlmOAuthCredentialFlow(connectionSlug, oauthEpoch)
      if (flowGeneration !== undefined) {
        await withClaudeOAuthFlowMutation(() => {
          releaseClaudeOAuthExchange(flowGeneration!)
        })
      }
    }
  })

  // Check if there's a valid OAuth state in progress
  server.handle(RPC_CHANNELS.onboarding.HAS_CLAUDE_OAUTH_STATE, async () => {
    return withClaudeOAuthFlowMutation(() => hasValidOAuthState())
  })

  // Clear OAuth state (for cancel/reset)
  server.handle(RPC_CHANNELS.onboarding.CLEAR_CLAUDE_OAUTH_STATE, async () => {
    await withClaudeOAuthFlowMutation(() => {
      cancelClaudeOAuthFlow()
      clearOAuthState()
    })
    return { success: true }
  })

  // User chose "Setup later" — persist so onboarding doesn't re-show on next launch
  server.handle(RPC_CHANNELS.onboarding.DEFER_SETUP, async () => {
    setSetupDeferred(true)
    log?.info('[Onboarding] User deferred setup')
    return { success: true }
  })
}
