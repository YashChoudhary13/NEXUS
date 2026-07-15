import { describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const HANDLER_MODULE = pathToFileURL(join(import.meta.dir, 'llm-connections.ts')).href

function createIsolatedConfig() {
  const root = mkdtempSync(join(tmpdir(), 'nexus-chatgpt-identity-handler-'))
  const configDir = join(root, 'config')
  const homeDir = join(root, 'home')
  const workspaceRoot = join(root, 'workspace')
  mkdirSync(configDir, { recursive: true })
  mkdirSync(homeDir, { recursive: true })
  mkdirSync(workspaceRoot, { recursive: true })

  writeFileSync(join(workspaceRoot, 'config.json'), JSON.stringify({
    id: 'workspace-config-1',
    name: 'Test Workspace',
    slug: 'test-workspace',
    createdAt: 1,
    updatedAt: 1,
  }))

  const configPath = join(configDir, 'config.json')
  writeFileSync(configPath, JSON.stringify({
    workspaces: [{
      id: 'workspace-1',
      name: 'Test Workspace',
      rootPath: workspaceRoot,
      createdAt: 1,
    }],
    activeWorkspaceId: 'workspace-1',
    activeSessionId: null,
    defaultLlmConnection: null,
    llmConnections: [],
  }))

  return { root, configDir, homeDir, configPath }
}

describe('ChatGPT OAuth identity handler flow', () => {
  it('keeps identity server-owned, replaces it atomically on reauth, and invalidates logout runtimes', () => {
    const isolated = createIsolatedConfig()
    try {
      const runner = `
        import { mock } from 'bun:test'
        import { chmodSync } from 'node:fs'

        let blockNextModelRefresh = false
        let releaseBlockedModelRefresh
        let signalModelRefreshBlocked
        const modelRefreshBlocked = new Promise(resolve => { signalModelRefreshBlocked = resolve })
        let blockNextCredentialWrite = false
        let releaseBlockedCredentialWrite
        let signalCredentialWriteBlocked
        const credentialWriteBlocked = new Promise(resolve => { signalCredentialWriteBlocked = resolve })
        let blockLogoutRaceCredentialWrite = false
        let releaseLogoutRaceCredentialWrite
        let signalLogoutRaceCredentialWriteBlocked
        const logoutRaceCredentialWriteBlocked = new Promise(resolve => { signalLogoutRaceCredentialWriteBlocked = resolve })
        let blockMissingGuardCredentialWrite = false
        let releaseMissingGuardCredentialWrite
        let signalMissingGuardCredentialWriteBlocked
        const missingGuardCredentialWriteBlocked = new Promise(resolve => { signalMissingGuardCredentialWriteBlocked = resolve })
        let blockCopilotCredentialWrite = false
        let releaseCopilotCredentialWrite
        let signalCopilotCredentialWriteBlocked
        let copilotCredentialWriteBlocked
        const prepareCopilotCredentialWriteBlock = () => {
          blockCopilotCredentialWrite = true
          copilotCredentialWriteBlocked = new Promise(resolve => { signalCopilotCredentialWriteBlocked = resolve })
        }
        let blockNextRuntimeInvalidation = false
        let releaseBlockedRuntimeInvalidation
        let signalRuntimeInvalidationBlocked
        const runtimeInvalidationBlocked = new Promise(resolve => { signalRuntimeInvalidationBlocked = resolve })
        mock.module('@craft-agent/server-core/model-fetchers', () => ({
          getModelRefreshService: () => ({
            stopConnection() {},
            refreshNow: async () => {
              if (!blockNextModelRefresh) return
              blockNextModelRefresh = false
              signalModelRefreshBlocked()
              await new Promise(resolve => { releaseBlockedModelRefresh = resolve })
            },
          }),
        }))
        let releaseCopilotLogin
        let signalCopilotLoginBlocked
        let copilotLoginBlocked
        const prepareCopilotLoginBlock = () => {
          copilotLoginBlocked = new Promise(resolve => { signalCopilotLoginBlocked = resolve })
        }
        mock.module('@earendil-works/pi-ai/oauth', () => ({
          loginGitHubCopilot: async () => {
            signalCopilotLoginBlocked()
            await new Promise(resolve => { releaseCopilotLogin = resolve })
            return {
              access: 'fabricated-copilot-access',
              refresh: 'fabricated-github-refresh',
              expires: Date.now() + 3600000,
            }
          },
        }))

        const authClaim = 'https://api.openai.com/auth'
        let tokenClaims = {
          sub: 'subject-fallback-a',
          email: 'person-a@example.test',
          [authClaim]: {
            chatgpt_user_id: 'chatgpt-user-a',
            user_id: 'legacy-user-a',
            chatgpt_account_id: 'workspace-a',
          },
        }
        const makeJwt = claims => [
          Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
          Buffer.from(JSON.stringify(claims)).toString('base64url'),
          'fabricated-signature',
        ].join('.')

        let blockNextChatGptExchange = false
        let releaseChatGptExchange
        let signalChatGptExchangeBlocked
        const chatGptExchangeBlocked = new Promise(resolve => { signalChatGptExchangeBlocked = resolve })

        globalThis.fetch = async () => {
          if (blockNextChatGptExchange) {
            blockNextChatGptExchange = false
            signalChatGptExchangeBlocked()
            await new Promise(resolve => { releaseChatGptExchange = resolve })
          }
          return new Response(JSON.stringify({
            id_token: makeJwt(tokenClaims),
            access_token: 'fabricated-access-token',
            refresh_token: 'fabricated-refresh-token',
            expires_in: 3600,
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }

        const { RPC_CHANNELS } = await import('@craft-agent/shared/protocol')
        const { getValidClaudeOAuthToken } = await import('@craft-agent/shared/auth')
        const { getCredentialManager } = await import('@craft-agent/shared/credentials')
        const { addLlmConnection, getLlmConnection, updateLlmConnection } = await import('@craft-agent/shared/config')
        const { withLlmConnectionMutation } = await import('@craft-agent/server-core/services')
        const { registerLlmConnectionsHandlers } = await import(${JSON.stringify(HANDLER_MODULE)})
        const credentialManager = getCredentialManager()
        const originalSetLlmOAuth = credentialManager.setLlmOAuth.bind(credentialManager)
        credentialManager.setLlmOAuth = async (...args) => {
          if (blockCopilotCredentialWrite) {
            blockCopilotCredentialWrite = false
            signalCopilotCredentialWriteBlocked()
            await new Promise(resolve => { releaseCopilotCredentialWrite = resolve })
          }
          if (blockMissingGuardCredentialWrite) {
            blockMissingGuardCredentialWrite = false
            signalMissingGuardCredentialWriteBlocked()
            await new Promise(resolve => { releaseMissingGuardCredentialWrite = resolve })
          }
          if (blockLogoutRaceCredentialWrite) {
            blockLogoutRaceCredentialWrite = false
            signalLogoutRaceCredentialWriteBlocked()
            await new Promise(resolve => { releaseLogoutRaceCredentialWrite = resolve })
          }
          if (blockNextCredentialWrite) {
            blockNextCredentialWrite = false
            signalCredentialWriteBlocked()
            await new Promise(resolve => { releaseBlockedCredentialWrite = resolve })
          }
          return originalSetLlmOAuth(...args)
        }

        const handlers = new Map()
        const server = {
          handle(channel, handler) { handlers.set(channel, handler) },
          push() {},
          async invokeClient() { return undefined },
          hasClientCapability() { return false },
          findClientsWithCapability() { return [] },
        }
        const invalidatedConnectionSlugs = []
        const liveRuntimeAccountBySlug = new Map()
        const warningMessages = []
        const deps = {
          sessionManager: {
            reinitializeAuth: async () => {},
            refreshConnectionRuntime: async () => {},
            invalidateConnectionAuth: async slug => {
              invalidatedConnectionSlugs.push(slug)
              liveRuntimeAccountBySlug.delete(slug)
              if (blockNextRuntimeInvalidation) {
                blockNextRuntimeInvalidation = false
                signalRuntimeInvalidationBlocked()
                await new Promise(resolve => { releaseBlockedRuntimeInvalidation = resolve })
              }
            },
          },
          oauthFlowStore: {},
          platform: {
            appRootPath: '/',
            resourcesPath: '/',
            isPackaged: false,
            appVersion: '0.0.0-test',
            isDebugMode: false,
            logger: { info() {}, warn(message) { warningMessages.push(String(message)) }, error() {}, debug() {} },
            imageProcessor: {
              getMetadata: async () => null,
              process: async () => Buffer.from(''),
            },
          },
        }
        registerLlmConnectionsHandlers(server, deps)

        const seedChatGptConnection = slug => addLlmConnection({
          slug,
          name: 'Seeded ChatGPT',
          providerType: 'pi',
          authType: 'oauth',
          piAuthProvider: 'openai-codex',
          createdAt: 1,
        })
        const seedCopilotConnection = slug => addLlmConnection({
          slug,
          name: 'Seeded Copilot',
          providerType: 'pi',
          authType: 'oauth',
          piAuthProvider: 'github-copilot',
          createdAt: 1,
        })
        const seedClaudeConnection = slug => addLlmConnection({
          slug,
          name: 'Seeded Claude',
          providerType: 'anthropic',
          authType: 'oauth',
          createdAt: 1,
        })

        const ownerCtx = { clientId: 'client-owner', workspaceId: 'workspace-1', webContentsId: 1 }
        const otherCtx = { clientId: 'client-other', workspaceId: 'workspace-1', webContentsId: 2 }
        const start = handlers.get(RPC_CHANNELS.chatgpt.START_OAUTH)
        const complete = handlers.get(RPC_CHANNELS.chatgpt.COMPLETE_OAUTH)
        const cancel = handlers.get(RPC_CHANNELS.chatgpt.CANCEL_OAUTH)
        const setup = handlers.get(RPC_CHANNELS.settings.SETUP_LLM_CONNECTION)
        const save = handlers.get(RPC_CHANNELS.llmConnections.SAVE)
        const remove = handlers.get(RPC_CHANNELS.llmConnections.DELETE)
        const logout = handlers.get(RPC_CHANNELS.chatgpt.LOGOUT)
        const copilotStart = handlers.get(RPC_CHANNELS.copilot.START_OAUTH)
        const copilotCancel = handlers.get(RPC_CHANNELS.copilot.CANCEL_OAUTH)
        const copilotStatus = handlers.get(RPC_CHANNELS.copilot.GET_AUTH_STATUS)
        const copilotLogout = handlers.get(RPC_CHANNELS.copilot.LOGOUT)

        const holdSlugMutation = connectionSlug => {
          let release
          let signalEntered
          const entered = new Promise(resolve => { signalEntered = resolve })
          const done = withLlmConnectionMutation(connectionSlug, async () => {
            signalEntered()
            await new Promise(resolve => { release = resolve })
          })
          return { entered, done, release: () => release() }
        }

        const credentialPresentAfterRestart = slug => {
          const source =
            "const { getCredentialManager } = await import('@craft-agent/shared/credentials');" +
            "const credential = await getCredentialManager().getLlmOAuth(" + JSON.stringify(slug) + ");" +
            "console.log(JSON.stringify({ present: credential !== null }));"
          const child = Bun.spawnSync([process.execPath, '--eval', source], {
            cwd: process.cwd(),
            env: process.env,
            stdout: 'pipe',
            stderr: 'pipe',
          })
          if (child.exitCode !== 0) throw new Error(child.stderr.toString())
          return JSON.parse(child.stdout.toString().trim()).present
        }

        const genericCreateResult = await save(otherCtx, {
          slug: 'chatgpt-plus-8',
          name: 'Client-authored spoof',
          providerType: 'anthropic',
          authType: 'oauth',
          createdAt: 1,
          oauthAccountUuid: 'create-spoofed-user',
          oauthAccountEmail: 'create-spoof@example.test',
        })
        let config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterGenericCreate = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-8')
        const genericClaudeCreateResult = await save(otherCtx, {
          slug: 'client-authored-claude-oauth',
          name: 'Client-authored Claude OAuth',
          providerType: 'anthropic',
          authType: 'oauth',
          baseUrl: 'https://attacker.example.test/v1',
          createdAt: 1,
        })

        const twoStepCreateResult = await save(otherCtx, {
          slug: 'two-step-codex-spoof',
          name: 'Generic OAuth first step',
          providerType: 'pi',
          authType: 'oauth',
          createdAt: 1,
        })
        const twoStepReservedSetup = await setup(otherCtx, {
          slug: 'two-step-codex-spoof',
          piAuthProvider: 'openai-codex',
          credential: 'two-step-client-authored-token',
          oauthIdentity: {
            account: { uuid: 'two-step-spoofed-user', emailAddress: 'two-step-spoof@example.test' },
          },
        })
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterTwoStepReservedSetup = config.llmConnections.find(connection => connection.slug === 'two-step-codex-spoof')
        const twoStepCredential = await credentialManager.getLlmOAuth('two-step-codex-spoof')

        const reservedCodexCreateResult = await save(otherCtx, {
          slug: 'codex',
          name: 'Client-authored Codex API key row',
          providerType: 'anthropic',
          authType: 'api_key',
          createdAt: 1,
        })

        addLlmConnection({
          slug: 'legacy-claude-endpoint-guard',
          name: 'Legacy Claude OAuth',
          providerType: 'anthropic',
          authType: 'oauth',
          baseUrl: 'https://old-attacker.example.test/v1',
          customEndpoint: { api: 'anthropic-messages' },
          createdAt: 1,
        })
        const claudeEndpointSave = await save(otherCtx, {
          ...getLlmConnection('legacy-claude-endpoint-guard'),
          baseUrl: 'https://new-attacker.example.test/v1',
          customEndpoint: { api: 'openai-completions' },
        })
        const claudeEndpointSetup = await setup(otherCtx, {
          slug: 'legacy-claude-endpoint-guard',
          updateOnly: true,
          baseUrl: 'https://setup-attacker.example.test/v1',
          customEndpoint: { api: 'anthropic-messages' },
        })
        addLlmConnection({
          slug: 'legacy-copilot-endpoint-guard',
          name: 'Legacy Copilot OAuth',
          providerType: 'pi',
          authType: 'oauth',
          piAuthProvider: 'github-copilot',
          baseUrl: 'https://old-attacker.example.test/v1',
          customEndpoint: { api: 'openai-completions' },
          createdAt: 1,
        })
        const copilotEndpointSave = await save(otherCtx, {
          ...getLlmConnection('legacy-copilot-endpoint-guard'),
          baseUrl: 'https://new-attacker.example.test/v1',
          customEndpoint: { api: 'anthropic-messages' },
        })
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterClaudeEndpointSave = config.llmConnections.find(connection => connection.slug === 'legacy-claude-endpoint-guard')
        const afterCopilotEndpointSave = config.llmConnections.find(connection => connection.slug === 'legacy-copilot-endpoint-guard')

        // Matching COMPLETE -> SETUP must persist identity when SETUP creates
        // the connection for the first time.
        const firstTimeStarted = await start(ownerCtx, 'chatgpt-plus-4')
        const firstTimeCompleted = await complete(ownerCtx, {
          flowId: firstTimeStarted.flowId,
          state: firstTimeStarted.state,
          code: 'fabricated-authorization-code-first-time',
        })
        const firstTimeSetup = await setup(ownerCtx, { slug: 'chatgpt-plus-4' })
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterFirstTimeSetup = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-4')

        // Historical canonical rows are normalized before any consumer can
        // route credentials, and COMPLETE opportunistically persists the repair.
        addLlmConnection({
          slug: 'chatgpt-plus-17',
          name: 'Historically poisoned ChatGPT',
          providerType: 'anthropic',
          authType: 'oauth',
          piAuthProvider: 'github-copilot',
          baseUrl: 'https://attacker.example.test/v1',
          customEndpoint: { api: 'openai-completions' },
          createdAt: 1,
        })
        const poisonedGenericSave = await save(otherCtx, {
          ...getLlmConnection('chatgpt-plus-17'),
          name: 'Attempted generic repair',
          baseUrl: 'https://second-attacker.example.test/v1',
        })
        const poisonedSetupWithoutFlow = await setup(otherCtx, {
          slug: 'chatgpt-plus-17',
          updateOnly: true,
        })
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterPoisonedGenericSave = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-17')
        const poisonedStarted = await start(ownerCtx, 'chatgpt-plus-17')
        const poisonedCompleted = await complete(ownerCtx, {
          flowId: poisonedStarted.flowId,
          state: poisonedStarted.state,
          code: 'fabricated-authorization-code-poisoned-row',
        })
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterPoisonedComplete = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-17')

        const started = await start(ownerCtx, 'chatgpt-plus-2')
        const completed = await complete(ownerCtx, {
          flowId: started.flowId,
          state: started.state,
          code: 'fabricated-authorization-code-a',
        })

        const spoofedIdentity = {
          account: { uuid: 'spoofed-user', emailAddress: 'spoof@example.test' },
          organization: { uuid: 'spoofed-workspace', name: 'Spoofed Workspace' },
        }

        // A different client cannot consume the owner's pending identity, even
        // when targeting the same exact slug and supplying a forged profile.
        const wrongClientSetup = await setup(otherCtx, {
          slug: 'chatgpt-plus-2',
          oauthIdentity: spoofedIdentity,
        })
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterWrongClient = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-2')

        // Nor can the owner redirect the pending identity to another slug.
        const wrongSlugSetup = await setup(ownerCtx, {
          slug: 'chatgpt-plus-3',
          oauthIdentity: spoofedIdentity,
        })
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterWrongSlug = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-3')

        // The matching client + slug consumes the server-owned identity.
        const ownerSetup = await setup(ownerCtx, {
          slug: 'chatgpt-plus-2',
          oauthIdentity: spoofedIdentity,
        })
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterOwnerSetup = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-2')

        const credentialBeforeClientInjection = await credentialManager.getLlmOAuth('chatgpt-plus-2')
        const clientCredentialSetup = await setup(otherCtx, {
          slug: 'chatgpt-plus-2',
          updateOnly: true,
          credential: 'client-authored-token-must-be-rejected',
        })
        const credentialAfterClientInjection = await credentialManager.getLlmOAuth('chatgpt-plus-2')

        // A different provider's RPC surface must not be able to read, replace,
        // or delete this ChatGPT account binding by reusing its exact slug.
        const credentialBeforeCopilotTargeting = await credentialManager.getLlmOAuth('chatgpt-plus-2')
        const copilotCrossProviderStart = await copilotStart(otherCtx, 'chatgpt-plus-2')
        const copilotCrossProviderStatus = await copilotStatus(otherCtx, 'chatgpt-plus-2')
        const copilotCrossProviderLogout = await copilotLogout(otherCtx, 'chatgpt-plus-2')
        const credentialAfterCopilotTargeting = await credentialManager.getLlmOAuth('chatgpt-plus-2')

        addLlmConnection({
          slug: 'github-copilot-19',
          name: 'Poisoned canonical Copilot',
          providerType: 'anthropic',
          authType: 'oauth',
          baseUrl: 'https://attacker.example.test/v1',
          createdAt: 1,
        })
        const poisonedCopilotStart = await copilotStart(otherCtx, 'github-copilot-19')
        const poisonedCopilotStatus = await copilotStatus(otherCtx, 'github-copilot-19')
        const poisonedCopilotLogout = await copilotLogout(otherCtx, 'github-copilot-19')

        // Repair routing fields that could have been persisted by an older,
        // vulnerable client, while rejecting new provenance mutation attempts.
        updateLlmConnection('chatgpt-plus-2', {
          baseUrl: 'https://attacker.example.test/v1',
          customEndpoint: { api: 'openai-completions' },
        })
        const maliciousProvenanceSetup = await setup(otherCtx, {
          slug: 'chatgpt-plus-2',
          updateOnly: true,
          baseUrl: 'https://other-attacker.example.test/v1',
          customEndpoint: { api: 'anthropic-messages' },
          piAuthProvider: 'github-copilot',
          bedrockAuthMethod: 'environment',
          oauthIdentity: spoofedIdentity,
        })
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterMaliciousProvenanceSetup = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-2')

        // Generic SAVE must not let a remote client mutate provider-derived identity.
        const saveResult = await save(otherCtx, {
          ...afterOwnerSetup,
          providerType: 'anthropic',
          authType: 'oauth',
          piAuthProvider: undefined,
          oauthAccountUuid: 'save-spoofed-user',
          oauthAccountEmail: 'save-spoof@example.test',
          oauthOrganizationUuid: 'save-spoofed-workspace',
          oauthOrganizationName: 'Save Spoof',
          oauthProfileVerifiedAt: 1,
        })
        const forgedSetupAfterMetadataSave = await setup(otherCtx, {
          slug: 'chatgpt-plus-2',
          updateOnly: true,
          oauthIdentity: spoofedIdentity,
        })
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterGenericSave = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-2')

        // The legacy migration slug is a real Codex OAuth connection even
        // though it does not match the modern chatgpt-plus[-N] naming scheme.
        const legacyCreateResult = seedChatGptConnection('codex')
        tokenClaims = {
          email: 'legacy-person@example.test',
          [authClaim]: {
            chatgpt_user_id: 'legacy-provider-user',
            chatgpt_account_id: 'legacy-provider-workspace',
          },
        }
        const legacyStarted = await start(ownerCtx, 'codex')
        const legacyCompleted = await complete(ownerCtx, {
          flowId: legacyStarted.flowId,
          state: legacyStarted.state,
          code: 'fabricated-authorization-code-legacy',
        })
        const legacyForgedIdentitySetup = await setup(otherCtx, {
          slug: 'codex',
          updateOnly: true,
          oauthIdentity: spoofedIdentity,
        })
        const legacyClientCredentialSetup = await setup(otherCtx, {
          slug: 'codex',
          updateOnly: true,
          credential: 'legacy-client-authored-token',
        })
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterLegacyProtection = config.llmConnections.find(connection => connection.slug === 'codex')
        const legacyCredential = await credentialManager.getLlmOAuth('codex')

        // Seed optional old-account fields, then prove a fresh partial profile
        // replaces the whole identity atomically instead of retaining stale data.
        updateLlmConnection('chatgpt-plus-2', {
          oauthAccountEmail: 'stale@example.test',
          oauthOrganizationName: 'Stale Workspace Name',
        })
        tokenClaims = {
          sub: 'subject-fallback-b',
          [authClaim]: {
            chatgpt_user_id: 'chatgpt-user-b',
            chatgpt_account_id: 'workspace-b',
          },
        }
        liveRuntimeAccountBySlug.set('chatgpt-plus-2', 'chatgpt-user-a')
        const supersededStarted = await start(ownerCtx, 'chatgpt-plus-2')
        const winningStarted = await start(otherCtx, 'chatgpt-plus-2')
        const supersededCompleted = await complete(ownerCtx, {
          flowId: supersededStarted.flowId,
          state: supersededStarted.state,
          code: 'fabricated-authorization-code-b',
        })
        const reauthCompleted = await complete(otherCtx, {
          flowId: winningStarted.flowId,
          state: winningStarted.state,
          code: 'fabricated-authorization-code-b-winning',
        })
        const oldRuntimePresentAfterReauthComplete = liveRuntimeAccountBySlug.has('chatgpt-plus-2')
        const reauthSetup = await setup(otherCtx, {
          slug: 'chatgpt-plus-2',
          updateOnly: true,
          oauthIdentity: spoofedIdentity,
        })
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterReauth = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-2')

        // A successful reauth whose ID token has no usable identity clears the
        // old display profile instead of leaving a false account label.
        tokenClaims = {}
        const identitylessStarted = await start(ownerCtx, 'chatgpt-plus-2')
        const identitylessCompleted = await complete(ownerCtx, {
          flowId: identitylessStarted.flowId,
          state: identitylessStarted.state,
          code: 'fabricated-authorization-code-identityless',
        })
        const identitylessSetup = await setup(ownerCtx, {
          slug: 'chatgpt-plus-2',
          updateOnly: true,
          oauthIdentity: spoofedIdentity,
        })
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterIdentitylessReauth = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-2')

        // Controlled interleaving: an older first-time SETUP pauses after
        // persisting identity A; a newer OAuth generation completes for the
        // now-existing slug and writes identity B; the older SETUP must neither
        // overwrite B nor consume B's generation receipt when it resumes.
        tokenClaims = {
          email: 'interleave-a@example.test',
          [authClaim]: { chatgpt_user_id: 'interleave-user-a', chatgpt_account_id: 'interleave-workspace-a' },
        }
        const interleaveAStarted = await start(ownerCtx, 'chatgpt-plus-7')
        const interleaveACompleted = await complete(ownerCtx, {
          flowId: interleaveAStarted.flowId,
          state: interleaveAStarted.state,
          code: 'fabricated-authorization-code-interleave-a',
        })
        blockNextModelRefresh = true
        const interleaveASetupPromise = setup(ownerCtx, { slug: 'chatgpt-plus-7' })
        await modelRefreshBlocked

        tokenClaims = {
          email: 'interleave-b@example.test',
          [authClaim]: { chatgpt_user_id: 'interleave-user-b', chatgpt_account_id: 'interleave-workspace-b' },
        }
        const interleaveBStarted = await start(otherCtx, 'chatgpt-plus-7')
        const interleaveBCompleted = await complete(otherCtx, {
          flowId: interleaveBStarted.flowId,
          state: interleaveBStarted.state,
          code: 'fabricated-authorization-code-interleave-b',
        })
        releaseBlockedModelRefresh()
        const interleaveASetup = await interleaveASetupPromise
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterInterleavedCompletion = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-7')

        // START and CANCEL use the same per-slug commit order as the encrypted
        // credential write. A newer START requested while A is mid-write must
        // linearize after A (A succeeds), and cancelling B must leave A's
        // credentials and identity paired.
        seedChatGptConnection('chatgpt-plus-9')
        tokenClaims = {
          email: 'serialized-a@example.test',
          [authClaim]: { chatgpt_user_id: 'serialized-user-a', chatgpt_account_id: 'serialized-workspace-a' },
        }
        const serializedAStarted = await start(ownerCtx, 'chatgpt-plus-9')
        blockNextCredentialWrite = true
        const serializedACompletionPromise = complete(ownerCtx, {
          flowId: serializedAStarted.flowId,
          state: serializedAStarted.state,
          code: 'fabricated-authorization-code-serialized-a',
        })
        await credentialWriteBlocked
        let serializedBStartResolved = false
        const serializedBStartPromise = start(otherCtx, 'chatgpt-plus-9').then(result => {
          serializedBStartResolved = true
          return result
        })
        await new Promise(resolve => setTimeout(resolve, 0))
        const serializedBResolvedBeforeRelease = serializedBStartResolved
        releaseBlockedCredentialWrite()
        const serializedACompleted = await serializedACompletionPromise
        const serializedBStarted = await serializedBStartPromise
        const serializedBCancelled = await cancel(otherCtx, { state: serializedBStarted.state })
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterSerializedStartCancel = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-9')

        // Identity persistence is fail-soft: a config write failure after the
        // credential commit must log a warning but still report OAuth success.
        seedChatGptConnection('chatgpt-plus-10')
        tokenClaims = {
          email: 'fail-soft@example.test',
          [authClaim]: { chatgpt_user_id: 'fail-soft-user', chatgpt_account_id: 'fail-soft-workspace' },
        }
        const failSoftStarted = await start(ownerCtx, 'chatgpt-plus-10')
        let failSoftCompleted
        try {
          chmodSync(${JSON.stringify(isolated.configPath)}, 0o444)
          chmodSync(${JSON.stringify(isolated.configDir)}, 0o555)
          failSoftCompleted = await complete(ownerCtx, {
            flowId: failSoftStarted.flowId,
            state: failSoftStarted.state,
            code: 'fabricated-authorization-code-fail-soft',
          })
        } finally {
          chmodSync(${JSON.stringify(isolated.configDir)}, 0o700)
          chmodSync(${JSON.stringify(isolated.configPath)}, 0o600)
        }
        const credentialsAfterIdentityWriteFailure = await credentialManager.getLlmOAuth('chatgpt-plus-10')
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterIdentityWriteFailure = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-10')
        const identityPersistenceWarningPresent = warningMessages.some(message =>
          message.includes('Identity persistence failed for chatgpt-plus-10')
        )

        // Logout revokes pending identity owned by another client for the slug.
        tokenClaims = {
          email: 'pending@example.test',
          [authClaim]: { chatgpt_user_id: 'pending-user', chatgpt_account_id: 'pending-workspace' },
        }
        const pendingStarted = await start(ownerCtx, 'chatgpt-plus-5')
        const pendingCompleted = await complete(ownerCtx, {
          flowId: pendingStarted.flowId,
          state: pendingStarted.state,
          code: 'fabricated-authorization-code-pending',
        })
        const pendingLogout = await logout(otherCtx, 'chatgpt-plus-5')
        const setupAfterPendingLogout = await setup(ownerCtx, {
          slug: 'chatgpt-plus-5',
          oauthIdentity: spoofedIdentity,
        })
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterPendingLogoutSetup = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-5')
        const credentialsAfterPendingLogout = await getCredentialManager().getLlmOAuth('chatgpt-plus-5')

        // A flow started before logout cannot complete and recreate credentials.
        const preLogoutStarted = await start(ownerCtx, 'chatgpt-plus-6')
        const preLogoutFlowLogout = await logout(otherCtx, 'chatgpt-plus-6')
        let preLogoutCompletionError
        try {
          await complete(ownerCtx, {
            flowId: preLogoutStarted.flowId,
            state: preLogoutStarted.state,
            code: 'fabricated-authorization-code-after-logout',
          })
        } catch (error) {
          preLogoutCompletionError = error instanceof Error ? error.message : String(error)
        }
        const credentialsAfterPreLogoutFlow = await getCredentialManager().getLlmOAuth('chatgpt-plus-6')

        // updateOnly on a missing canonical row is also a credential cleanup
        // boundary. COMPLETE may linearize first, but cleanup must finish last
        // and leave no credential behind.
        tokenClaims = {
          email: 'missing-guard@example.test',
          [authClaim]: { chatgpt_user_id: 'missing-guard-user', chatgpt_account_id: 'missing-guard-workspace' },
        }
        const missingGuardStarted = await start(ownerCtx, 'chatgpt-plus-13')
        blockMissingGuardCredentialWrite = true
        const missingGuardCompletionPromise = complete(ownerCtx, {
          flowId: missingGuardStarted.flowId,
          state: missingGuardStarted.state,
          code: 'fabricated-authorization-code-missing-guard',
        })
        await missingGuardCredentialWriteBlocked
        const missingGuardSetupPromise = setup(ownerCtx, {
          slug: 'chatgpt-plus-13',
          updateOnly: true,
        })
        releaseMissingGuardCredentialWrite()
        const missingGuardCompleted = await missingGuardCompletionPromise
        const missingGuardSetup = await missingGuardSetupPromise
        const credentialsAfterMissingGuard = await credentialManager.getLlmOAuth('chatgpt-plus-13')

        // If START is already queued behind a completing credential commit,
        // logout must linearize after both, revoke the new flow, and leave no
        // credential behind. The already-committing flow may report success.
        seedChatGptConnection('chatgpt-plus-11')
        tokenClaims = {
          email: 'queued-a@example.test',
          [authClaim]: { chatgpt_user_id: 'queued-user-a', chatgpt_account_id: 'queued-workspace-a' },
        }
        const queuedAStarted = await start(ownerCtx, 'chatgpt-plus-11')
        blockLogoutRaceCredentialWrite = true
        const queuedACompletionPromise = complete(ownerCtx, {
          flowId: queuedAStarted.flowId,
          state: queuedAStarted.state,
          code: 'fabricated-authorization-code-queued-a',
        })
        await logoutRaceCredentialWriteBlocked
        const queuedBStartPromise = start(otherCtx, 'chatgpt-plus-11')
        await new Promise(resolve => setTimeout(resolve, 0))
        const queuedLogoutPromise = logout(ownerCtx, 'chatgpt-plus-11')
        releaseLogoutRaceCredentialWrite()
        const queuedACompleted = await queuedACompletionPromise
        let queuedBStarted
        let queuedBStartError
        try {
          queuedBStarted = await queuedBStartPromise
        } catch (error) {
          queuedBStartError = error instanceof Error ? error.message : String(error)
        }
        const queuedLogout = await queuedLogoutPromise
        let queuedBCompletionSucceeded = false
        try {
          if (!queuedBStarted) throw new Error('START was fenced before registration')
          const queuedBCompleted = await complete(otherCtx, {
            flowId: queuedBStarted.flowId,
            state: queuedBStarted.state,
            code: 'fabricated-authorization-code-queued-b-after-logout',
          })
          queuedBCompletionSucceeded = queuedBCompleted.success === true
        } catch {
          queuedBCompletionSucceeded = false
        }
        const credentialsAfterQueuedLogout = await credentialManager.getLlmOAuth('chatgpt-plus-11')

        // An older logout may wait on runtime disposal while a later relogin
        // succeeds. Its identity clear must already be committed, so it cannot
        // erase the later provider-verified account.
        seedChatGptConnection('chatgpt-plus-12')
        tokenClaims = {
          email: 'runtime-old@example.test',
          [authClaim]: { chatgpt_user_id: 'runtime-old-user', chatgpt_account_id: 'runtime-old-workspace' },
        }
        const runtimeOldStarted = await start(ownerCtx, 'chatgpt-plus-12')
        await complete(ownerCtx, {
          flowId: runtimeOldStarted.flowId,
          state: runtimeOldStarted.state,
          code: 'fabricated-authorization-code-runtime-old',
        })
        blockNextRuntimeInvalidation = true
        const delayedLogoutPromise = logout(ownerCtx, 'chatgpt-plus-12')
        await runtimeInvalidationBlocked
        let delayedLogoutDeletionObserved = false
        for (let i = 0; i < 100; i++) {
          if ((await credentialManager.getLlmOAuth('chatgpt-plus-12')) === null) {
            delayedLogoutDeletionObserved = true
            break
          }
          await new Promise(resolve => setTimeout(resolve, 0))
        }
        tokenClaims = {
          email: 'runtime-new@example.test',
          [authClaim]: { chatgpt_user_id: 'runtime-new-user', chatgpt_account_id: 'runtime-new-workspace' },
        }
        const runtimeNewStarted = await start(otherCtx, 'chatgpt-plus-12')
        const runtimeNewCompleted = await complete(otherCtx, {
          flowId: runtimeNewStarted.flowId,
          state: runtimeNewStarted.state,
          code: 'fabricated-authorization-code-runtime-new',
        })
        releaseBlockedRuntimeInvalidation()
        const delayedLogout = await delayedLogoutPromise
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterDelayedLogoutRelogin = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-12')

        // A failed encrypted-file write must be observable and retryable across
        // process restart. Failed LOGOUT keeps the identity row; failed DELETE
        // keeps the whole connection row until a durable retry succeeds.
        seedChatGptConnection('chatgpt-plus-14')
        tokenClaims = {
          email: 'persistence-logout@example.test',
          [authClaim]: { chatgpt_user_id: 'persistence-logout-user', chatgpt_account_id: 'persistence-logout-workspace' },
        }
        const persistenceLogoutStarted = await start(ownerCtx, 'chatgpt-plus-14')
        await complete(ownerCtx, {
          flowId: persistenceLogoutStarted.flowId,
          state: persistenceLogoutStarted.state,
          code: 'fabricated-authorization-code-persistence-logout',
        })
        const credentialsDir = ${JSON.stringify(join(isolated.homeDir, '.craft-agent'))}
        let failedPersistenceLogout
        try {
          chmodSync(credentialsDir, 0o500)
          failedPersistenceLogout = await logout(ownerCtx, 'chatgpt-plus-14')
        } finally {
          chmodSync(credentialsDir, 0o700)
        }
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterFailedPersistenceLogout = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-14')
        const logoutCredentialPresentAfterFailedRestart = credentialPresentAfterRestart('chatgpt-plus-14')
        const retriedPersistenceLogout = await logout(ownerCtx, 'chatgpt-plus-14')
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const afterRetriedPersistenceLogout = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus-14')
        const logoutCredentialPresentAfterRetryRestart = credentialPresentAfterRestart('chatgpt-plus-14')

        seedChatGptConnection('chatgpt-plus-15')
        tokenClaims = {
          email: 'persistence-delete@example.test',
          [authClaim]: { chatgpt_user_id: 'persistence-delete-user', chatgpt_account_id: 'persistence-delete-workspace' },
        }
        const persistenceDeleteStarted = await start(ownerCtx, 'chatgpt-plus-15')
        await complete(ownerCtx, {
          flowId: persistenceDeleteStarted.flowId,
          state: persistenceDeleteStarted.state,
          code: 'fabricated-authorization-code-persistence-delete',
        })
        let failedPersistenceDelete
        try {
          chmodSync(credentialsDir, 0o500)
          failedPersistenceDelete = await remove(ownerCtx, 'chatgpt-plus-15')
        } finally {
          chmodSync(credentialsDir, 0o700)
        }
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const connectionPresentAfterFailedDelete = config.llmConnections.some(connection => connection.slug === 'chatgpt-plus-15')
        const deleteCredentialPresentAfterFailedRestart = credentialPresentAfterRestart('chatgpt-plus-15')
        const retriedPersistenceDelete = await remove(ownerCtx, 'chatgpt-plus-15')
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const connectionPresentAfterRetriedDelete = config.llmConnections.some(connection => connection.slug === 'chatgpt-plus-15')
        const deleteCredentialPresentAfterRetryRestart = credentialPresentAfterRestart('chatgpt-plus-15')

        await credentialManager.setLlmOAuth('chatgpt-plus-16', {
          accessToken: 'orphan-before-missing-update-only',
          refreshToken: 'orphan-refresh-before-missing-update-only',
        })
        let failedMissingCleanup
        try {
          chmodSync(credentialsDir, 0o500)
          failedMissingCleanup = await setup(ownerCtx, {
            slug: 'chatgpt-plus-16',
            updateOnly: true,
          })
        } finally {
          chmodSync(credentialsDir, 0o700)
        }
        const missingCleanupCredentialPresentAfterFailedRestart = credentialPresentAfterRestart('chatgpt-plus-16')
        const retriedMissingCleanup = await setup(ownerCtx, {
          slug: 'chatgpt-plus-16',
          updateOnly: true,
        })
        const missingCleanupCredentialPresentAfterRetryRestart = credentialPresentAfterRestart('chatgpt-plus-16')

        // SETUP snapshots a server receipt before computing its row update. A
        // newer START that lands before persistence makes that receipt stale.
        tokenClaims = {
          email: 'setup-race-old@example.test',
          [authClaim]: {
            chatgpt_user_id: 'setup-race-old-user',
            chatgpt_account_id: 'setup-race-old-workspace',
          },
        }
        const setupReceiptRaceStarted = await start(ownerCtx, 'chatgpt-plus-21')
        const setupReceiptRaceCompleted = await complete(ownerCtx, {
          flowId: setupReceiptRaceStarted.flowId,
          state: setupReceiptRaceStarted.state,
          code: 'fabricated-authorization-code-setup-receipt-race',
        })
        const setupReceiptRaceSetupPromise = setup(ownerCtx, { slug: 'chatgpt-plus-21' })
        await Promise.resolve()
        const setupReceiptRaceHold = holdSlugMutation('chatgpt-plus-21')
        await setupReceiptRaceHold.entered
        const setupReceiptRaceNewStartPromise = start(otherCtx, 'chatgpt-plus-21')
        setupReceiptRaceHold.release()
        await setupReceiptRaceHold.done
        const setupReceiptRaceSetup = await setupReceiptRaceSetupPromise
        const setupReceiptRaceNewStart = await setupReceiptRaceNewStartPromise
        await cancel(otherCtx, { state: setupReceiptRaceNewStart.state })
        const setupReceiptRaceConnection = getLlmConnection('chatgpt-plus-21')
        const setupReceiptRaceCleanupInvalidationStart = invalidatedConnectionSlugs.length
        await remove(ownerCtx, 'chatgpt-plus-21')
        const setupReceiptRaceCleanupInvalidations = invalidatedConnectionSlugs.splice(
          setupReceiptRaceCleanupInvalidationStart,
        )

        // A queued update-only request must decide whether the row is missing
        // after an earlier queued first-time setup gets its turn. Otherwise it
        // can revoke the valid receipt/credential before that setup creates the
        // row, merely because both calls observed the same pre-lock snapshot.
        tokenClaims = {
          email: 'queued-create@example.test',
          [authClaim]: {
            chatgpt_user_id: 'queued-create-user',
            chatgpt_account_id: 'queued-create-workspace',
          },
        }
        const queuedCreateStarted = await start(ownerCtx, 'chatgpt-plus-22')
        const queuedCreateCompleted = await complete(ownerCtx, {
          flowId: queuedCreateStarted.flowId,
          state: queuedCreateStarted.state,
          code: 'fabricated-authorization-code-queued-create',
        })
        const queuedCreateHold = holdSlugMutation('chatgpt-plus-22')
        await queuedCreateHold.entered
        const queuedCreateSetupPromise = setup(ownerCtx, { slug: 'chatgpt-plus-22' })
        const queuedCreateUpdateOnlyPromise = setup(ownerCtx, {
          slug: 'chatgpt-plus-22',
          updateOnly: true,
        })
        queuedCreateHold.release()
        await queuedCreateHold.done
        const queuedCreateSetup = await queuedCreateSetupPromise
        const queuedCreateUpdateOnly = await queuedCreateUpdateOnlyPromise
        const queuedCreateConnection = getLlmConnection('chatgpt-plus-22')
        const queuedCreateCredential = await credentialManager.getLlmOAuth('chatgpt-plus-22')

        // Rowless canonical OAuth cleanup is durable too: a successful OAuth
        // may have written credentials before first-time SETUP creates the row.
        const rowlessCleanupInvalidationStart = invalidatedConnectionSlugs.length
        await credentialManager.setLlmOAuth('chatgpt-plus-18', {
          accessToken: 'orphan-chatgpt-before-setup',
          refreshToken: 'orphan-chatgpt-refresh-before-setup',
        })
        const rowlessChatDelete = await remove(ownerCtx, 'chatgpt-plus-18')
        await credentialManager.setLlmOAuth('github-copilot-18', {
          accessToken: 'orphan-copilot-before-setup',
          refreshToken: 'orphan-copilot-refresh-before-setup',
        })
        const rowlessCopilotDelete = await remove(ownerCtx, 'github-copilot-18')
        await credentialManager.setLlmOAuth('claude-max-18', {
          accessToken: 'orphan-claude-before-setup',
          refreshToken: 'orphan-claude-refresh-before-setup',
        })
        await credentialManager.setClaudeOAuthCredentials({
          accessToken: 'orphan-claude-before-setup',
          refreshToken: 'orphan-claude-refresh-before-setup',
          source: 'native',
        })
        const rowlessClaudeDelete = await remove(ownerCtx, 'claude-max-18')
        const rowlessCredentialsAbsentAfterRestart = {
          chatgpt: !credentialPresentAfterRestart('chatgpt-plus-18'),
          copilot: !credentialPresentAfterRestart('github-copilot-18'),
          claude: !credentialPresentAfterRestart('claude-max-18'),
        }
        const rowlessClaudeGlobalAbsent = (await credentialManager.getClaudeOAuthCredentials()) === null

        await credentialManager.setLlmOAuth('claude-max-20', {
          accessToken: 'orphan-claude-update-only',
          refreshToken: 'orphan-claude-update-only-refresh',
        })
        await credentialManager.setClaudeOAuthCredentials({
          accessToken: 'orphan-claude-update-only',
          refreshToken: 'orphan-claude-update-only-refresh',
          source: 'native',
        })
        const rowlessClaudeUpdateOnly = await setup(ownerCtx, {
          slug: 'claude-max-20',
          updateOnly: true,
        })
        const rowlessClaudeUpdateOnlyScopedAbsent = !credentialPresentAfterRestart('claude-max-20')
        const rowlessClaudeUpdateOnlyGlobalAbsent = (await credentialManager.getClaudeOAuthCredentials()) === null
        const rowlessCleanupInvalidations = invalidatedConnectionSlugs.splice(
          rowlessCleanupInvalidationStart,
        )

        // LOGOUT/DELETE must fence START at request entry, including the window
        // before the provider flow has been registered in the handler map.
        seedChatGptConnection('legacy-chatgpt-pre-registration')
        await credentialManager.setLlmOAuth('legacy-chatgpt-pre-registration', {
          accessToken: 'old-chatgpt-pre-registration',
          refreshToken: 'old-chatgpt-pre-registration-refresh',
        })
        const chatPreRegistrationHold = holdSlugMutation('legacy-chatgpt-pre-registration')
        await chatPreRegistrationHold.entered
        const chatPreRegistrationStartPromise = start(ownerCtx, 'legacy-chatgpt-pre-registration')
          .then(value => ({ value }), error => ({ error: error instanceof Error ? error.message : String(error) }))
        await new Promise(resolve => setTimeout(resolve, 0))
        const chatPreRegistrationLogoutPromise = logout(otherCtx, 'legacy-chatgpt-pre-registration')
        chatPreRegistrationHold.release()
        await chatPreRegistrationHold.done
        const chatPreRegistrationStart = await chatPreRegistrationStartPromise
        const chatPreRegistrationLogout = await chatPreRegistrationLogoutPromise
        const chatPreRegistrationCredential = await credentialManager.getLlmOAuth('legacy-chatgpt-pre-registration')

        seedCopilotConnection('legacy-copilot-pre-registration')
        await credentialManager.setLlmOAuth('legacy-copilot-pre-registration', {
          accessToken: 'old-copilot-pre-registration',
          refreshToken: 'old-copilot-pre-registration-refresh',
        })
        const copilotPreRegistrationHold = holdSlugMutation('legacy-copilot-pre-registration')
        await copilotPreRegistrationHold.entered
        const copilotPreRegistrationStartPromise = copilotStart(ownerCtx, 'legacy-copilot-pre-registration')
        await new Promise(resolve => setTimeout(resolve, 0))
        const copilotPreRegistrationDeletePromise = remove(otherCtx, 'legacy-copilot-pre-registration')
        copilotPreRegistrationHold.release()
        await copilotPreRegistrationHold.done
        const copilotPreRegistrationStart = await copilotPreRegistrationStartPromise
        const copilotPreRegistrationDelete = await copilotPreRegistrationDeletePromise
        const copilotPreRegistrationCredential = await credentialManager.getLlmOAuth('legacy-copilot-pre-registration')

        // A provider completion that outlives logout must not recreate the
        // credential even when its SDK ignores AbortSignal.
        seedCopilotConnection('legacy-copilot-logout-race')
        await credentialManager.setLlmOAuth('legacy-copilot-logout-race', {
          accessToken: 'old-copilot-access',
          refreshToken: 'old-github-refresh',
        })
        prepareCopilotLoginBlock()
        const copilotLogoutRaceStartPromise = copilotStart(ownerCtx, 'legacy-copilot-logout-race')
        await copilotLoginBlocked
        const copilotLogoutRaceLogout = await copilotLogout(otherCtx, 'legacy-copilot-logout-race')
        releaseCopilotLogin()
        const copilotLogoutRaceStart = await copilotLogoutRaceStartPromise
        const copilotLogoutRaceCredential = await credentialManager.getLlmOAuth('legacy-copilot-logout-race')

        seedCopilotConnection('legacy-copilot-cancel-race')
        prepareCopilotLoginBlock()
        const copilotCancelRaceStartPromise = copilotStart(ownerCtx, 'legacy-copilot-cancel-race')
        await copilotLoginBlocked
        const copilotCancelRaceCancel = await copilotCancel(ownerCtx)
        releaseCopilotLogin()
        const copilotCancelRaceStart = await copilotCancelRaceStartPromise
        const copilotCancelRaceCredential = await credentialManager.getLlmOAuth('legacy-copilot-cancel-race')

        // Cancelling while the encrypted credential write yields restores the
        // previously-active token instead of deleting it as stale flow cleanup.
        seedCopilotConnection('legacy-copilot-cancel-write-race')
        await credentialManager.setLlmOAuth('legacy-copilot-cancel-write-race', {
          accessToken: 'old-copilot-before-cancelled-reauth',
          refreshToken: 'old-copilot-refresh-before-cancelled-reauth',
        })
        prepareCopilotLoginBlock()
        const copilotCancelWriteStartPromise = copilotStart(ownerCtx, 'legacy-copilot-cancel-write-race')
        await copilotLoginBlocked
        prepareCopilotCredentialWriteBlock()
        releaseCopilotLogin()
        await copilotCredentialWriteBlocked
        const copilotCancelWriteCancelPromise = copilotCancel(otherCtx)
        releaseCopilotCredentialWrite()
        const copilotCancelWriteStart = await copilotCancelWriteStartPromise
        const copilotCancelWriteCancel = await copilotCancelWriteCancelPromise
        const copilotCancelWriteCredential = await credentialManager.getLlmOAuth('legacy-copilot-cancel-write-race')

        seedCopilotConnection('legacy-copilot-new-start-write-race')
        await credentialManager.setLlmOAuth('legacy-copilot-new-start-write-race', {
          accessToken: 'old-copilot-before-new-start',
          refreshToken: 'old-copilot-refresh-before-new-start',
        })
        prepareCopilotLoginBlock()
        const copilotOldWriteStartPromise = copilotStart(ownerCtx, 'legacy-copilot-new-start-write-race')
        await copilotLoginBlocked
        prepareCopilotCredentialWriteBlock()
        releaseCopilotLogin()
        await copilotCredentialWriteBlocked
        prepareCopilotLoginBlock()
        const copilotNewStartPromise = copilotStart(otherCtx, 'legacy-copilot-new-start-write-race')
        releaseCopilotCredentialWrite()
        const copilotOldWriteStart = await copilotOldWriteStartPromise
        await copilotLoginBlocked
        const copilotCredentialWhileNewStartPending = await credentialManager.getLlmOAuth(
          'legacy-copilot-new-start-write-race',
        )
        const copilotNewStartCancel = await copilotCancel(ownerCtx)
        releaseCopilotLogin()
        const copilotNewStart = await copilotNewStartPromise
        const copilotCredentialAfterNewStartCancel = await credentialManager.getLlmOAuth(
          'legacy-copilot-new-start-write-race',
        )

        // Cross-provider or unrelated-missing requests cannot cancel a real
        // device flow. A successful reauth also invalidates its exact runtime.
        seedCopilotConnection('legacy-copilot-isolation')
        await credentialManager.setLlmOAuth('legacy-copilot-isolation', {
          accessToken: 'old-copilot-isolation',
          refreshToken: 'old-copilot-isolation-refresh',
        })
        prepareCopilotLoginBlock()
        const copilotIsolationStartPromise = copilotStart(ownerCtx, 'legacy-copilot-isolation')
        await copilotLoginBlocked
        const copilotIsolationInvalidStart = await copilotStart(otherCtx, 'chatgpt-plus-2')
        const copilotIsolationInvalidLogout = await copilotLogout(otherCtx, 'chatgpt-plus-2')
        const copilotIsolationMissingDelete = await remove(otherCtx, 'github-copilot-999')
        releaseCopilotLogin()
        const copilotIsolationStart = await copilotIsolationStartPromise
        const copilotIsolationCredential = await credentialManager.getLlmOAuth('legacy-copilot-isolation')

        // Deleting the account that owns the inherited global Claude key must
        // rebind it to a surviving scoped account and dispose both runtimes.
        seedClaudeConnection('legacy-claude-delete-a')
        seedClaudeConnection('legacy-claude-delete-b')
        await credentialManager.setLlmOAuth('legacy-claude-delete-a', {
          accessToken: 'claude-delete-a-access',
          refreshToken: 'claude-delete-a-refresh',
        })
        await credentialManager.setLlmOAuth('legacy-claude-delete-b', {
          accessToken: 'claude-delete-b-access',
          refreshToken: 'claude-delete-b-refresh',
        })
        await credentialManager.setClaudeOAuthCredentials({
          accessToken: 'claude-delete-a-access',
          refreshToken: 'claude-delete-a-refresh',
          source: 'native',
        })
        const claudeDeleteInvalidationStart = invalidatedConnectionSlugs.length
        const claudeSurvivorDelete = await remove(otherCtx, 'legacy-claude-delete-a')
        const claudeGlobalAfterSurvivorDelete = await credentialManager.getClaudeOAuthCredentials()
        const claudeDeletedToken = await getValidClaudeOAuthToken('legacy-claude-delete-a')
        const claudeSurvivorToken = await getValidClaudeOAuthToken('legacy-claude-delete-b')
        const claudeSurvivorDeleteInvalidations = invalidatedConnectionSlugs.splice(
          claudeDeleteInvalidationStart,
        )

        // The provider-global deletion decision is serialized, so two last-row
        // deletes cannot both observe the other and leave the bearer orphaned.
        seedClaudeConnection('legacy-claude-delete-c')
        await credentialManager.setLlmOAuth('legacy-claude-delete-c', {
          accessToken: 'claude-delete-c-access',
          refreshToken: 'claude-delete-c-refresh',
        })
        const concurrentClaudeDeleteInvalidationStart = invalidatedConnectionSlugs.length
        const [claudeConcurrentDeleteB, claudeConcurrentDeleteC] = await Promise.all([
          remove(ownerCtx, 'legacy-claude-delete-b'),
          remove(otherCtx, 'legacy-claude-delete-c'),
        ])
        const claudeGlobalAfterConcurrentDeletes = await credentialManager.getClaudeOAuthCredentials()
        const claudeConcurrentDeleteInvalidations = invalidatedConnectionSlugs.splice(
          concurrentClaudeDeleteInvalidationStart,
        )

        // The same mutation generation also rejects delete+recreate rebinding
        // while a device flow is waiting on the provider.
        seedCopilotConnection('legacy-copilot-rebind-race')
        prepareCopilotLoginBlock()
        const copilotRebindStartPromise = copilotStart(ownerCtx, 'legacy-copilot-rebind-race')
        await copilotLoginBlocked
        const copilotRebindDelete = await remove(otherCtx, 'legacy-copilot-rebind-race')
        const copilotRebindSave = await save(otherCtx, {
          slug: 'legacy-copilot-rebind-race',
          name: 'Replacement Anthropic connection',
          providerType: 'anthropic',
          authType: 'api_key',
          createdAt: 2,
        })
        releaseCopilotLogin()
        const copilotRebindStart = await copilotRebindStartPromise
        const copilotRebindCredential = await credentialManager.getLlmOAuth('legacy-copilot-rebind-race')
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const copilotRebindReplacement = config.llmConnections.find(connection => connection.slug === 'legacy-copilot-rebind-race')

        seedChatGptConnection('legacy-codex-rebind-race')
        const legacyRebindStarted = await start(ownerCtx, 'legacy-codex-rebind-race')
        blockNextChatGptExchange = true
        const legacyRebindCompletionPromise = complete(ownerCtx, {
          flowId: legacyRebindStarted.flowId,
          state: legacyRebindStarted.state,
          code: 'fabricated-authorization-code-legacy-rebind-race',
        })
        await chatGptExchangeBlocked
        const legacyRebindDelete = await remove(otherCtx, 'legacy-codex-rebind-race')
        const legacyRebindSave = await save(otherCtx, {
          slug: 'legacy-codex-rebind-race',
          name: 'Replacement API connection',
          providerType: 'anthropic',
          authType: 'api_key',
          createdAt: 2,
        })
        releaseChatGptExchange()
        const legacyRebindCompleted = await legacyRebindCompletionPromise
        const legacyRebindCredential = await credentialManager.getLlmOAuth('legacy-codex-rebind-race')
        config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const legacyRebindReplacement = config.llmConnections.find(connection => connection.slug === 'legacy-codex-rebind-race')

        const logoutResult = await logout(ownerCtx, 'chatgpt-plus-2')
        const configAfterLogout = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const connectionAfterLogout = configAfterLogout.llmConnections.find(connection => connection.slug === 'chatgpt-plus-2')
        const credentialsAfterLogout = await getCredentialManager().getLlmOAuth('chatgpt-plus-2')

        const identitySnapshot = connection => connection ? ({
          accountUuid: connection.oauthAccountUuid,
          accountEmail: connection.oauthAccountEmail,
          organizationUuid: connection.oauthOrganizationUuid,
          organizationName: connection.oauthOrganizationName,
          profileTimestampPresent: typeof connection.oauthProfileVerifiedAt === 'number',
        }) : null
        const routingSnapshot = connection => connection ? ({
          providerType: connection.providerType,
          authType: connection.authType,
          piAuthProvider: connection.piAuthProvider,
        }) : null
        const hasIdentity = connection => !!connection && [
          connection.oauthAccountUuid,
          connection.oauthAccountEmail,
          connection.oauthOrganizationUuid,
          connection.oauthOrganizationName,
          connection.oauthProfileVerifiedAt,
        ].some(value => value !== undefined)

        console.log(JSON.stringify({
          genericCreateResult,
          genericClaudeCreateResult,
          genericCreateIdentityPresent: hasIdentity(afterGenericCreate),
          genericCreateRouting: routingSnapshot(afterGenericCreate),
          twoStepCreateResult,
          twoStepReservedSetup,
          afterTwoStepReservedRouting: routingSnapshot(afterTwoStepReservedSetup),
          twoStepReservedIdentityPresent: hasIdentity(afterTwoStepReservedSetup),
          twoStepCredentialPresent: twoStepCredential !== null,
          reservedCodexCreateResult,
          claudeEndpointSave,
          claudeEndpointSetup,
          claudeEndpointFieldsCleared: afterClaudeEndpointSave.baseUrl === undefined
            && afterClaudeEndpointSave.customEndpoint === undefined,
          copilotEndpointSave,
          copilotEndpointFieldsCleared: afterCopilotEndpointSave.baseUrl === undefined
            && afterCopilotEndpointSave.customEndpoint === undefined,
          firstTimeCompleted,
          firstTimeSetup,
          afterFirstTimeSetup: identitySnapshot(afterFirstTimeSetup),
          poisonedCompleted,
          poisonedGenericSave,
          poisonedSetupWithoutFlow,
          poisonedGenericSaveQuarantined: afterPoisonedGenericSave.authType === 'none'
            && afterPoisonedGenericSave.baseUrl === undefined
            && afterPoisonedGenericSave.customEndpoint === undefined,
          afterPoisonedCompleteRouting: routingSnapshot(afterPoisonedComplete),
          poisonedEndpointFieldsCleared: afterPoisonedComplete.baseUrl === undefined
            && afterPoisonedComplete.customEndpoint === undefined,
          completed,
          supersededCompleted,
          reauthCompleted,
          identitylessCompleted,
          wrongClientSetup,
          wrongSlugSetup,
          ownerSetup,
          clientCredentialSetup,
          clientCredentialUnchanged: JSON.stringify(credentialBeforeClientInjection) === JSON.stringify(credentialAfterClientInjection),
          copilotCrossProviderStart,
          copilotCrossProviderStatus,
          copilotCrossProviderLogout,
          copilotTargetingCredentialUnchanged: JSON.stringify(credentialBeforeCopilotTargeting) === JSON.stringify(credentialAfterCopilotTargeting),
          poisonedCopilotStart,
          poisonedCopilotStatus,
          poisonedCopilotLogout,
          maliciousProvenanceSetup,
          afterMaliciousProvenanceRouting: routingSnapshot(afterMaliciousProvenanceSetup),
          maliciousEndpointFieldsCleared: afterMaliciousProvenanceSetup.baseUrl === undefined
            && afterMaliciousProvenanceSetup.customEndpoint === undefined,
          identityAfterMaliciousProvenanceSetup: identitySnapshot(afterMaliciousProvenanceSetup),
          saveResult,
          forgedSetupAfterMetadataSave,
          reauthSetup,
          identitylessSetup,
          identityPresentAfterWrongClient: hasIdentity(afterWrongClient),
          identityPresentAfterWrongSlug: hasIdentity(afterWrongSlug),
          afterOwnerSetup: identitySnapshot(afterOwnerSetup),
          afterGenericSave: identitySnapshot(afterGenericSave),
          afterGenericSaveRouting: routingSnapshot(afterGenericSave),
          legacyCreateResult,
          legacyCompleted,
          legacyForgedIdentitySetup,
          legacyClientCredentialSetup,
          afterLegacyProtection: identitySnapshot(afterLegacyProtection),
          legacyCredentialProviderIssued: legacyCredential?.accessToken === 'fabricated-access-token',
          afterReauth: identitySnapshot(afterReauth),
          oldRuntimePresentAfterReauthComplete,
          identityPresentAfterIdentitylessReauth: hasIdentity(afterIdentitylessReauth),
          interleaveACompleted,
          interleaveBCompleted,
          interleaveASetup,
          afterInterleavedCompletion: identitySnapshot(afterInterleavedCompletion),
          serializedBResolvedBeforeRelease,
          serializedACompleted,
          serializedBCancelled,
          afterSerializedStartCancel: identitySnapshot(afterSerializedStartCancel),
          failSoftCompleted,
          credentialsPresentAfterIdentityWriteFailure: credentialsAfterIdentityWriteFailure !== null,
          identityPresentAfterIdentityWriteFailure: hasIdentity(afterIdentityWriteFailure),
          identityPersistenceWarningPresent,
          pendingCompleted,
          pendingLogout,
          setupAfterPendingLogout,
          identityPresentAfterPendingLogout: hasIdentity(afterPendingLogoutSetup),
          credentialsPresentAfterPendingLogout: credentialsAfterPendingLogout !== null,
          preLogoutFlowLogout,
          preLogoutCompletionError,
          credentialsPresentAfterPreLogoutFlow: credentialsAfterPreLogoutFlow !== null,
          missingGuardCompleted,
          missingGuardSetup,
          credentialsPresentAfterMissingGuard: credentialsAfterMissingGuard !== null,
          queuedACompleted,
          queuedLogout,
          queuedBStartError,
          queuedBCompletionSucceeded,
          credentialsPresentAfterQueuedLogout: credentialsAfterQueuedLogout !== null,
          delayedLogoutDeletionObserved,
          runtimeNewCompleted,
          delayedLogout,
          afterDelayedLogoutRelogin: identitySnapshot(afterDelayedLogoutRelogin),
          failedPersistenceLogout,
          identityAfterFailedPersistenceLogout: identitySnapshot(afterFailedPersistenceLogout),
          logoutCredentialPresentAfterFailedRestart,
          retriedPersistenceLogout,
          identityPresentAfterRetriedPersistenceLogout: hasIdentity(afterRetriedPersistenceLogout),
          logoutCredentialPresentAfterRetryRestart,
          failedPersistenceDelete,
          connectionPresentAfterFailedDelete,
          deleteCredentialPresentAfterFailedRestart,
          retriedPersistenceDelete,
          connectionPresentAfterRetriedDelete,
          deleteCredentialPresentAfterRetryRestart,
          failedMissingCleanup,
          missingCleanupCredentialPresentAfterFailedRestart,
          retriedMissingCleanup,
          missingCleanupCredentialPresentAfterRetryRestart,
          setupReceiptRaceCompleted,
          setupReceiptRaceSetup,
          setupReceiptRaceConnectionAbsent: setupReceiptRaceConnection === null,
          setupReceiptRaceCleanupInvalidations,
          queuedCreateCompleted,
          queuedCreateSetup,
          queuedCreateUpdateOnly,
          queuedCreateIdentityPreserved:
            queuedCreateConnection?.oauthAccountUuid === 'queued-create-user',
          queuedCreateCredentialPresent: queuedCreateCredential !== null,
          rowlessChatDelete,
          rowlessCopilotDelete,
          rowlessClaudeDelete,
          rowlessCredentialsAbsentAfterRestart,
          rowlessClaudeGlobalAbsent,
          rowlessClaudeUpdateOnly,
          rowlessClaudeUpdateOnlyScopedAbsent,
          rowlessClaudeUpdateOnlyGlobalAbsent,
          rowlessCleanupInvalidations,
          chatPreRegistrationStart,
          chatPreRegistrationLogout,
          chatPreRegistrationCredentialPresent: chatPreRegistrationCredential !== null,
          copilotPreRegistrationStart,
          copilotPreRegistrationDelete,
          copilotPreRegistrationCredentialPresent: copilotPreRegistrationCredential !== null,
          copilotLogoutRaceLogout,
          copilotLogoutRaceStart,
          copilotLogoutRaceCredentialPresent: copilotLogoutRaceCredential !== null,
          copilotCancelRaceCancel,
          copilotCancelRaceStart,
          copilotCancelRaceCredentialPresent: copilotCancelRaceCredential !== null,
          copilotCancelWriteStart,
          copilotCancelWriteCancel,
          copilotCancelWriteCredentialPreserved:
            copilotCancelWriteCredential?.accessToken === 'old-copilot-before-cancelled-reauth',
          copilotOldWriteStart,
          copilotCredentialWhileNewStartPendingPreserved:
            copilotCredentialWhileNewStartPending?.accessToken === 'old-copilot-before-new-start',
          copilotNewStartCancel,
          copilotNewStart,
          copilotCredentialAfterNewStartCancelPreserved:
            copilotCredentialAfterNewStartCancel?.accessToken === 'old-copilot-before-new-start',
          copilotIsolationInvalidStart,
          copilotIsolationInvalidLogout,
          copilotIsolationMissingDelete,
          copilotIsolationStart,
          copilotIsolationCredentialReplaced:
            copilotIsolationCredential?.accessToken === 'fabricated-copilot-access',
          claudeSurvivorDelete,
          claudeGlobalReboundToSurvivor:
            claudeGlobalAfterSurvivorDelete?.accessToken === 'claude-delete-b-access',
          claudeDeletedTokenAbsent: claudeDeletedToken.accessToken === null,
          claudeSurvivorTokenScoped:
            claudeSurvivorToken.accessToken === 'claude-delete-b-access',
          claudeSurvivorDeleteInvalidations,
          claudeConcurrentDeleteB,
          claudeConcurrentDeleteC,
          claudeGlobalAbsentAfterConcurrentDeletes:
            claudeGlobalAfterConcurrentDeletes === null,
          claudeConcurrentDeleteInvalidations,
          copilotRebindDelete,
          copilotRebindSave,
          copilotRebindStart,
          copilotRebindCredentialPresent: copilotRebindCredential !== null,
          copilotRebindReplacementRouting: routingSnapshot(copilotRebindReplacement),
          legacyRebindDelete,
          legacyRebindSave,
          legacyRebindCompleted,
          legacyRebindCredentialPresent: legacyRebindCredential !== null,
          legacyRebindReplacementRouting: routingSnapshot(legacyRebindReplacement),
          logoutResult,
          identityPresentAfterLogout: hasIdentity(connectionAfterLogout),
          credentialsPresentAfterLogout: credentialsAfterLogout !== null,
          invalidatedConnectionSlugs,
        }))
      `

      const run = Bun.spawnSync([process.execPath, '--eval', runner], {
        cwd: join(import.meta.dir, '..', '..', '..', '..', '..'),
        env: {
          ...process.env,
          HOME: isolated.homeDir,
          CRAFT_CONFIG_DIR: isolated.configDir,
          CRAFT_CLI_JSON_ONLY: '1',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      if (run.exitCode !== 0) {
        throw new Error(`handler subprocess failed:\n${run.stderr.toString()}`)
      }

      const output = JSON.parse(run.stdout.toString().trim())
      expect(output.genericCreateResult).toEqual({
        success: false,
        error: 'OAuth connections must be created through the matching server OAuth flow.',
      })
      expect(output.genericClaudeCreateResult).toEqual({
        success: false,
        error: 'OAuth connections must be created through the matching server OAuth flow.',
      })
      expect(output.genericCreateIdentityPresent).toBe(false)
      expect(output.genericCreateRouting).toBeNull()
      expect(output.twoStepCreateResult).toEqual({
        success: false,
        error: 'OAuth connections must be created through the matching server OAuth flow.',
      })
      expect(output.twoStepReservedSetup).toEqual({
        success: false,
        error: 'Unknown built-in connection slug: two-step-codex-spoof. Custom connections should be created through settings.',
      })
      expect(output.afterTwoStepReservedRouting).toBeNull()
      expect(output.twoStepReservedIdentityPresent).toBe(false)
      expect(output.twoStepCredentialPresent).toBe(false)
      expect(output.reservedCodexCreateResult).toEqual({
        success: false,
        error: 'OAuth connections must be created through the matching server OAuth flow.',
      })
      expect(output.claudeEndpointSave).toEqual({ success: true })
      expect(output.claudeEndpointSetup).toEqual({ success: true })
      expect(output.claudeEndpointFieldsCleared).toBe(true)
      expect(output.copilotEndpointSave).toEqual({ success: true })
      expect(output.copilotEndpointFieldsCleared).toBe(true)
      expect(output.firstTimeCompleted).toEqual({ success: true })
      expect(output.firstTimeSetup).toEqual({ success: true })
      expect(output.afterFirstTimeSetup).toEqual({
        accountUuid: 'chatgpt-user-a',
        accountEmail: 'person-a@example.test',
        organizationUuid: 'workspace-a',
        profileTimestampPresent: true,
      })
      expect(output.poisonedCompleted).toEqual({ success: true })
      expect(output.poisonedGenericSave).toEqual({ success: true })
      expect(output.poisonedSetupWithoutFlow).toEqual({
        success: false,
        error: 'Complete the server ChatGPT OAuth flow before repairing this connection.',
      })
      expect(output.poisonedGenericSaveQuarantined).toBe(true)
      expect(output.afterPoisonedCompleteRouting).toEqual({
        providerType: 'pi',
        authType: 'oauth',
        piAuthProvider: 'openai-codex',
      })
      expect(output.poisonedEndpointFieldsCleared).toBe(true)
      expect(output.completed).toEqual({ success: true })
      expect(output.supersededCompleted).toEqual({
        success: false,
        error: 'ChatGPT OAuth flow was superseded or logged out',
      })
      expect(output.reauthCompleted).toEqual({ success: true })
      expect(output.identitylessCompleted).toEqual({ success: true })
      expect(JSON.stringify(output.completed)).not.toContain('fabricated-access-token')
      expect(JSON.stringify(output.completed)).not.toContain('fabricated-refresh-token')
      expect(JSON.stringify(output.completed)).not.toContain('fabricated-signature')
      expect(output.wrongClientSetup).toEqual({
        success: false,
        error: 'Complete the server ChatGPT OAuth flow before creating this connection.',
      })
      expect(output.wrongSlugSetup).toEqual({
        success: false,
        error: 'Complete the server ChatGPT OAuth flow before creating this connection.',
      })
      expect(output.ownerSetup).toEqual({ success: true })
      expect(output.identityPresentAfterWrongClient).toBe(false)
      expect(output.identityPresentAfterWrongSlug).toBe(false)
      expect(output.afterOwnerSetup).toEqual({
        accountUuid: 'chatgpt-user-a',
        accountEmail: 'person-a@example.test',
        organizationUuid: 'workspace-a',
        profileTimestampPresent: true,
      })
      expect(output.clientCredentialSetup).toEqual({
        success: false,
        error: 'ChatGPT OAuth credentials must be established by the server OAuth flow.',
      })
      expect(output.clientCredentialUnchanged).toBe(true)
      expect(output.copilotCrossProviderStart).toEqual({
        success: false,
        error: 'GitHub Copilot OAuth can only target a GitHub Copilot connection.',
      })
      expect(output.copilotCrossProviderStatus).toEqual({ authenticated: false })
      expect(output.copilotCrossProviderLogout).toEqual({ success: false })
      expect(output.copilotTargetingCredentialUnchanged).toBe(true)
      expect(output.poisonedCopilotStart).toEqual({
        success: false,
        error: 'GitHub Copilot OAuth can only target a GitHub Copilot connection.',
      })
      expect(output.poisonedCopilotStatus).toEqual({ authenticated: false })
      expect(output.poisonedCopilotLogout).toEqual({ success: false })
      expect(output.maliciousProvenanceSetup).toEqual({ success: true })
      expect(output.afterMaliciousProvenanceRouting).toEqual({
        providerType: 'pi',
        authType: 'oauth',
        piAuthProvider: 'openai-codex',
      })
      expect(output.maliciousEndpointFieldsCleared).toBe(true)
      expect(output.identityAfterMaliciousProvenanceSetup).toEqual(output.afterOwnerSetup)
      expect(output.saveResult).toEqual({ success: true })
      expect(output.forgedSetupAfterMetadataSave).toEqual({ success: true })
      expect(output.afterGenericSave).toEqual(output.afterOwnerSetup)
      expect(output.afterGenericSaveRouting).toEqual({
        providerType: 'pi',
        authType: 'oauth',
        piAuthProvider: 'openai-codex',
      })
      expect(output.legacyCreateResult).toBe(true)
      expect(output.legacyCompleted).toEqual({ success: true })
      expect(output.legacyForgedIdentitySetup).toEqual({ success: true })
      expect(output.legacyClientCredentialSetup).toEqual({
        success: false,
        error: 'ChatGPT OAuth credentials must be established by the server OAuth flow.',
      })
      expect(output.afterLegacyProtection).toEqual({
        accountUuid: 'legacy-provider-user',
        accountEmail: 'legacy-person@example.test',
        organizationUuid: 'legacy-provider-workspace',
        profileTimestampPresent: true,
      })
      expect(output.legacyCredentialProviderIssued).toBe(true)
      expect(output.reauthSetup).toEqual({ success: true })
      expect(output.afterReauth).toEqual({
        accountUuid: 'chatgpt-user-b',
        organizationUuid: 'workspace-b',
        profileTimestampPresent: true,
      })
      expect(output.oldRuntimePresentAfterReauthComplete).toBe(false)
      expect(output.identitylessSetup).toEqual({ success: true })
      expect(output.identityPresentAfterIdentitylessReauth).toBe(false)
      expect(output.interleaveACompleted).toEqual({ success: true })
      expect(output.interleaveBCompleted).toEqual({ success: true })
      expect(output.interleaveASetup).toEqual({ success: true })
      expect(output.afterInterleavedCompletion).toEqual({
        accountUuid: 'interleave-user-b',
        accountEmail: 'interleave-b@example.test',
        organizationUuid: 'interleave-workspace-b',
        profileTimestampPresent: true,
      })
      expect(output.serializedBResolvedBeforeRelease).toBe(false)
      expect(output.serializedACompleted).toEqual({ success: true })
      expect(output.serializedBCancelled).toEqual({ success: true })
      expect(output.afterSerializedStartCancel).toEqual({
        accountUuid: 'serialized-user-a',
        accountEmail: 'serialized-a@example.test',
        organizationUuid: 'serialized-workspace-a',
        profileTimestampPresent: true,
      })
      expect(output.failSoftCompleted).toEqual({ success: true })
      expect(output.credentialsPresentAfterIdentityWriteFailure).toBe(true)
      expect(output.identityPresentAfterIdentityWriteFailure).toBe(false)
      expect(output.identityPersistenceWarningPresent).toBe(true)
      expect(output.pendingCompleted).toEqual({ success: true })
      expect(output.pendingLogout).toEqual({ success: true })
      expect(output.setupAfterPendingLogout).toEqual({
        success: false,
        error: 'Complete the server ChatGPT OAuth flow before creating this connection.',
      })
      expect(output.identityPresentAfterPendingLogout).toBe(false)
      expect(output.credentialsPresentAfterPendingLogout).toBe(false)
      expect(output.preLogoutFlowLogout).toEqual({ success: true })
      expect(output.preLogoutCompletionError).toBe('Unknown or expired ChatGPT OAuth flow')
      expect(output.credentialsPresentAfterPreLogoutFlow).toBe(false)
      expect(
        output.missingGuardCompleted.success === true
        || (
          output.missingGuardCompleted.success === false
          && output.missingGuardCompleted.error === 'ChatGPT OAuth flow was superseded or logged out'
        ),
      ).toBe(true)
      expect(output.missingGuardSetup).toEqual({
        success: false,
        error: 'Connection not found. Cannot re-authenticate a non-existent connection.',
      })
      expect(output.credentialsPresentAfterMissingGuard).toBe(false)
      expect(output.queuedACompleted).toEqual({
        success: false,
        error: 'ChatGPT OAuth flow was superseded or logged out',
      })
      expect(output.queuedLogout).toEqual({ success: true })
      expect(output.queuedBStartError).toBe('ChatGPT OAuth flow was superseded or logged out')
      expect(output.queuedBCompletionSucceeded).toBe(false)
      expect(output.credentialsPresentAfterQueuedLogout).toBe(false)
      expect(output.delayedLogoutDeletionObserved).toBe(true)
      expect(output.runtimeNewCompleted).toEqual({ success: true })
      expect(output.delayedLogout).toEqual({ success: true })
      expect(output.afterDelayedLogoutRelogin).toEqual({
        accountUuid: 'runtime-new-user',
        accountEmail: 'runtime-new@example.test',
        organizationUuid: 'runtime-new-workspace',
        profileTimestampPresent: true,
      })
      expect(output.failedPersistenceLogout).toEqual({ success: false })
      expect(output.identityAfterFailedPersistenceLogout).toEqual({
        accountUuid: 'persistence-logout-user',
        accountEmail: 'persistence-logout@example.test',
        organizationUuid: 'persistence-logout-workspace',
        profileTimestampPresent: true,
      })
      expect(output.logoutCredentialPresentAfterFailedRestart).toBe(true)
      expect(output.retriedPersistenceLogout).toEqual({ success: true })
      expect(output.identityPresentAfterRetriedPersistenceLogout).toBe(false)
      expect(output.logoutCredentialPresentAfterRetryRestart).toBe(false)
      expect(output.failedPersistenceDelete.success).toBe(false)
      expect(output.failedPersistenceDelete.error).toContain('Failed to delete all credentials')
      expect(output.connectionPresentAfterFailedDelete).toBe(true)
      expect(output.deleteCredentialPresentAfterFailedRestart).toBe(true)
      expect(output.retriedPersistenceDelete).toEqual({ success: true })
      expect(output.connectionPresentAfterRetriedDelete).toBe(false)
      expect(output.deleteCredentialPresentAfterRetryRestart).toBe(false)
      expect(output.failedMissingCleanup.success).toBe(false)
      expect(output.failedMissingCleanup.error).toContain('Failed to delete all credentials')
      expect(output.missingCleanupCredentialPresentAfterFailedRestart).toBe(true)
      expect(output.retriedMissingCleanup).toEqual({
        success: false,
        error: 'Connection not found. Cannot re-authenticate a non-existent connection.',
      })
      expect(output.missingCleanupCredentialPresentAfterRetryRestart).toBe(false)
      expect(output.setupReceiptRaceCompleted).toEqual({ success: true })
      expect(output.setupReceiptRaceSetup).toEqual({
        success: false,
        error: 'ChatGPT OAuth changed during setup. Please try again.',
      })
      expect(output.setupReceiptRaceConnectionAbsent).toBe(true)
      expect(output.setupReceiptRaceCleanupInvalidations).toEqual([
        'chatgpt-plus-21',
        'chatgpt-plus-21',
      ])
      expect(output.queuedCreateCompleted).toEqual({ success: true })
      expect(output.queuedCreateSetup).toEqual({ success: true })
      expect(output.queuedCreateUpdateOnly).toEqual({
        success: false,
        error: 'Connection setup is already in progress. Please try again.',
      })
      expect(output.queuedCreateIdentityPreserved).toBe(true)
      expect(output.queuedCreateCredentialPresent).toBe(true)
      expect(output.rowlessChatDelete).toEqual({
        success: false,
        error: 'Connection not found',
      })
      expect(output.rowlessCopilotDelete).toEqual({
        success: false,
        error: 'Connection not found',
      })
      expect(output.rowlessClaudeDelete).toEqual({
        success: false,
        error: 'Connection not found',
      })
      expect(output.rowlessCredentialsAbsentAfterRestart).toEqual({
        chatgpt: true,
        copilot: true,
        claude: true,
      })
      expect(output.rowlessClaudeGlobalAbsent).toBe(true)
      expect(output.rowlessClaudeUpdateOnly).toEqual({
        success: false,
        error: 'Connection not found. Cannot re-authenticate a non-existent connection.',
      })
      expect(output.rowlessClaudeUpdateOnlyScopedAbsent).toBe(true)
      expect(output.rowlessClaudeUpdateOnlyGlobalAbsent).toBe(true)
      expect(output.rowlessCleanupInvalidations).toContain('chatgpt-plus-18')
      expect(output.rowlessCleanupInvalidations).toContain('github-copilot-18')
      expect(output.rowlessCleanupInvalidations).toContain('claude-max-18')
      expect(output.rowlessCleanupInvalidations).toContain('claude-max-20')
      expect(output.rowlessCleanupInvalidations).toContain('legacy-claude-endpoint-guard')
      expect(output.chatPreRegistrationStart).toEqual({
        error: 'ChatGPT OAuth flow was superseded or logged out',
      })
      expect(output.chatPreRegistrationLogout).toEqual({ success: true })
      expect(output.chatPreRegistrationCredentialPresent).toBe(false)
      expect(output.copilotPreRegistrationStart).toEqual({
        success: false,
        error: 'GitHub Copilot OAuth was superseded. Please start again.',
      })
      expect(output.copilotPreRegistrationDelete).toEqual({ success: true })
      expect(output.copilotPreRegistrationCredentialPresent).toBe(false)
      expect(output.copilotLogoutRaceLogout).toEqual({ success: true })
      expect(output.copilotLogoutRaceStart).toEqual({
        success: false,
        error: 'GitHub Copilot connection changed. Please start again.',
      })
      expect(output.copilotLogoutRaceCredentialPresent).toBe(false)
      expect(output.copilotCancelRaceCancel).toEqual({ success: true })
      expect(output.copilotCancelRaceStart).toEqual({
        success: false,
        error: 'GitHub Copilot connection changed. Please start again.',
      })
      expect(output.copilotCancelRaceCredentialPresent).toBe(false)
      expect(output.copilotCancelWriteStart).toEqual({
        success: false,
        error: 'GitHub Copilot connection changed. Please start again.',
      })
      expect(output.copilotCancelWriteCancel).toEqual({ success: true })
      expect(output.copilotCancelWriteCredentialPreserved).toBe(true)
      expect(output.copilotOldWriteStart).toEqual({
        success: false,
        error: 'GitHub Copilot connection changed. Please start again.',
      })
      expect(output.copilotCredentialWhileNewStartPendingPreserved).toBe(true)
      expect(output.copilotNewStartCancel).toEqual({ success: true })
      expect(output.copilotNewStart).toEqual({
        success: false,
        error: 'GitHub Copilot connection changed. Please start again.',
      })
      expect(output.copilotCredentialAfterNewStartCancelPreserved).toBe(true)
      expect(output.copilotIsolationInvalidStart).toEqual({
        success: false,
        error: 'GitHub Copilot OAuth can only target a GitHub Copilot connection.',
      })
      expect(output.copilotIsolationInvalidLogout).toEqual({ success: false })
      expect(output.copilotIsolationMissingDelete).toEqual({
        success: false,
        error: 'Connection not found',
      })
      expect(output.copilotIsolationStart).toEqual({ success: true })
      expect(output.copilotIsolationCredentialReplaced).toBe(true)
      expect(output.claudeSurvivorDelete).toEqual({ success: true })
      expect(output.claudeGlobalReboundToSurvivor).toBe(true)
      expect(output.claudeDeletedTokenAbsent).toBe(true)
      expect(output.claudeSurvivorTokenScoped).toBe(true)
      expect(output.claudeSurvivorDeleteInvalidations).toEqual([
        'legacy-claude-delete-a',
        'legacy-claude-endpoint-guard',
        'legacy-claude-delete-b',
        'legacy-claude-delete-a',
        'legacy-claude-endpoint-guard',
        'legacy-claude-delete-b',
      ])
      expect(output.claudeConcurrentDeleteB).toEqual({ success: true })
      expect(output.claudeConcurrentDeleteC).toEqual({ success: true })
      expect(output.claudeGlobalAbsentAfterConcurrentDeletes).toBe(true)
      expect([...output.claudeConcurrentDeleteInvalidations].sort()).toEqual([
        'legacy-claude-delete-b',
        'legacy-claude-delete-b',
        'legacy-claude-delete-c',
        'legacy-claude-delete-c',
        'legacy-claude-delete-c',
        'legacy-claude-delete-c',
        'legacy-claude-endpoint-guard',
        'legacy-claude-endpoint-guard',
        'legacy-claude-endpoint-guard',
        'legacy-claude-endpoint-guard',
      ])
      expect(output.copilotRebindDelete).toEqual({ success: true })
      expect(output.copilotRebindSave).toEqual({ success: true })
      expect(output.copilotRebindStart).toEqual({
        success: false,
        error: 'GitHub Copilot connection changed. Please start again.',
      })
      expect(output.copilotRebindCredentialPresent).toBe(false)
      expect(output.copilotRebindReplacementRouting).toEqual({
        providerType: 'anthropic',
        authType: 'api_key',
      })
      expect(output.legacyRebindDelete).toEqual({ success: true })
      expect(output.legacyRebindSave).toEqual({ success: true })
      expect(output.legacyRebindCompleted).toEqual({
        success: false,
        error: 'ChatGPT OAuth flow was superseded or logged out',
      })
      expect(output.legacyRebindCredentialPresent).toBe(false)
      expect(output.legacyRebindReplacementRouting).toEqual({
        providerType: 'anthropic',
        authType: 'api_key',
      })
      expect(output.logoutResult).toEqual({ success: true })
      expect(output.identityPresentAfterLogout).toBe(false)
      expect(output.credentialsPresentAfterLogout).toBe(false)
      expect(output.invalidatedConnectionSlugs).toEqual([
        'chatgpt-plus-17',
        'codex',
        'chatgpt-plus-2',
        'chatgpt-plus-2',
        'chatgpt-plus-7',
        'chatgpt-plus-9',
        'chatgpt-plus-10',
        'chatgpt-plus-5',
        'chatgpt-plus-5',
        'chatgpt-plus-6',
        'chatgpt-plus-6',
        'chatgpt-plus-13',
        'chatgpt-plus-13',
        'chatgpt-plus-11',
        'chatgpt-plus-11',
        'chatgpt-plus-12',
        'chatgpt-plus-12',
        'chatgpt-plus-12',
        'chatgpt-plus-12',
        'chatgpt-plus-14',
        'chatgpt-plus-14',
        'chatgpt-plus-14',
        'chatgpt-plus-14',
        'chatgpt-plus-14',
        'chatgpt-plus-15',
        'chatgpt-plus-15',
        'chatgpt-plus-15',
        'chatgpt-plus-15',
        'chatgpt-plus-15',
        'chatgpt-plus-16',
        'chatgpt-plus-16',
        'chatgpt-plus-16',
        'chatgpt-plus-16',
        'legacy-chatgpt-pre-registration',
        'legacy-chatgpt-pre-registration',
        'legacy-copilot-pre-registration',
        'legacy-copilot-pre-registration',
        'legacy-copilot-logout-race',
        'legacy-copilot-logout-race',
        'github-copilot-999',
        'github-copilot-999',
        'legacy-copilot-isolation',
        'legacy-copilot-rebind-race',
        'legacy-copilot-rebind-race',
        'legacy-codex-rebind-race',
        'legacy-codex-rebind-race',
        'chatgpt-plus-2',
        'chatgpt-plus-2',
      ])
    } finally {
      rmSync(isolated.root, { recursive: true, force: true })
    }
  })
})
