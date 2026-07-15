import { describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const HANDLER_MODULE = pathToFileURL(join(import.meta.dir, 'llm-connections.ts')).href

function createIsolatedConfig() {
  const root = mkdtempSync(join(tmpdir(), 'nexus-copilot-identity-handler-'))
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

describe('GitHub Copilot OAuth identity handler flow', () => {
  it('persists provider identity for reauth and first setup while remaining fail-soft', () => {
    const isolated = createIsolatedConfig()
    try {
      const runner = `
        import { mock } from 'bun:test'

        mock.module('@craft-agent/server-core/model-fetchers', () => ({
          getModelRefreshService: () => ({
            stopConnection() {},
            refreshNow: async () => {},
          }),
        }))
        let loginCount = 0
        mock.module('@earendil-works/pi-ai/oauth', () => ({
          loginGitHubCopilot: async () => {
            loginCount++
            return {
              access: 'copilot-access-' + loginCount,
              refresh: 'github-access-' + loginCount,
              expires: Date.now() + 3600000,
            }
          },
        }))

        let identityMode = 'verified'
        const identityRequests = []
        globalThis.fetch = async (url, init) => {
          identityRequests.push({
            url: String(url),
            authorization: new Headers(init?.headers).get('authorization'),
          })
          if (identityMode === 'unavailable') {
            return new Response('GitHub unavailable', { status: 503 })
          }
          if (String(url) === 'https://api.github.com/user') {
            return Response.json({ id: 4242, login: 'copilot-builder', email: null })
          }
          if (String(url) === 'https://api.github.com/users/copilot-builder/orgs?per_page=1') {
            return Response.json([{ id: 7171, login: 'nexus-labs' }])
          }
          throw new Error('Unexpected GitHub identity URL: ' + url)
        }

        const { RPC_CHANNELS } = await import('@craft-agent/shared/protocol')
        const { addLlmConnection, getLlmConnection } = await import('@craft-agent/shared/config')
        const { getCredentialManager } = await import('@craft-agent/shared/credentials')
        const { registerLlmConnectionsHandlers } = await import(${JSON.stringify(HANDLER_MODULE)})

        const handlers = new Map()
        const server = {
          handle(channel, handler) { handlers.set(channel, handler) },
          push() {},
          async invokeClient() { return undefined },
          hasClientCapability() { return false },
          findClientsWithCapability() { return [] },
        }
        const invalidatedSlugs = []
        const deps = {
          sessionManager: {
            reinitializeAuth: async () => {},
            refreshConnectionRuntime: async () => {},
            invalidateConnectionAuth: async slug => { invalidatedSlugs.push(slug) },
          },
          oauthFlowStore: {},
          platform: {
            appRootPath: '/',
            resourcesPath: '/',
            isPackaged: false,
            appVersion: '0.0.0-test',
            isDebugMode: false,
            logger: { info() {}, warn() {}, error() {}, debug() {} },
            imageProcessor: {
              getMetadata: async () => null,
              process: async () => Buffer.from(''),
            },
          },
        }
        registerLlmConnectionsHandlers(server, deps)

        const start = handlers.get(RPC_CHANNELS.copilot.START_OAUTH)
        const setup = handlers.get(RPC_CHANNELS.settings.SETUP_LLM_CONNECTION)
        const ownerCtx = { clientId: 'owner', workspaceId: 'workspace-1', webContentsId: 1 }
        const attackerCtx = { clientId: 'attacker', workspaceId: 'workspace-1', webContentsId: 2 }
        const manager = getCredentialManager()

        addLlmConnection({
          slug: 'legacy-copilot-existing',
          name: 'Existing Copilot',
          providerType: 'pi',
          authType: 'oauth',
          piAuthProvider: 'github-copilot',
          createdAt: 1,
          oauthAccountUuid: 'old-user',
          oauthAccountEmail: '@old-login',
          oauthOrganizationUuid: 'old-org',
          oauthOrganizationName: 'Old Org',
          oauthProfileVerifiedAt: 1,
        })
        const existingResult = await start(ownerCtx, 'legacy-copilot-existing')
        const existing = getLlmConnection('legacy-copilot-existing')
        const existingCredential = await manager.getLlmOAuth('legacy-copilot-existing')

        const firstResult = await start(ownerCtx, 'github-copilot-2')
        const forgedSetup = await setup(attackerCtx, {
          slug: 'github-copilot-2',
          oauthIdentity: {
            account: { uuid: 'forged-user', emailAddress: 'forged@example.test' },
          },
        })
        const absentAfterForgery = getLlmConnection('github-copilot-2') === null
        const ownerSetup = await setup(ownerCtx, { slug: 'github-copilot-2' })
        const firstConnection = getLlmConnection('github-copilot-2')

        addLlmConnection({
          slug: 'legacy-copilot-fail-soft',
          name: 'Fail-soft Copilot',
          providerType: 'pi',
          authType: 'oauth',
          piAuthProvider: 'github-copilot',
          createdAt: 1,
          oauthAccountUuid: 'preserved-user',
          oauthAccountEmail: '@preserved-login',
          oauthOrganizationUuid: 'preserved-org',
          oauthOrganizationName: 'Preserved Org',
          oauthProfileVerifiedAt: 9,
        })
        identityMode = 'unavailable'
        const failSoftResult = await start(ownerCtx, 'legacy-copilot-fail-soft')
        const failSoftConnection = getLlmConnection('legacy-copilot-fail-soft')
        const failSoftCredential = await manager.getLlmOAuth('legacy-copilot-fail-soft')

        console.log(JSON.stringify({
          existingResult,
          existingIdentity: {
            accountUuid: existing.oauthAccountUuid,
            accountLabel: existing.oauthAccountEmail,
            organizationUuid: existing.oauthOrganizationUuid,
            organizationName: existing.oauthOrganizationName,
            timestampAdvanced: existing.oauthProfileVerifiedAt > 1,
          },
          existingCredentialStored: existingCredential?.refreshToken === 'github-access-1',
          firstResult,
          forgedSetup,
          absentAfterForgery,
          ownerSetup,
          firstIdentity: {
            accountUuid: firstConnection.oauthAccountUuid,
            accountLabel: firstConnection.oauthAccountEmail,
            organizationUuid: firstConnection.oauthOrganizationUuid,
            organizationName: firstConnection.oauthOrganizationName,
            timestampPresent: firstConnection.oauthProfileVerifiedAt > 0,
          },
          failSoftResult,
          failSoftIdentity: {
            accountUuid: failSoftConnection.oauthAccountUuid,
            accountLabel: failSoftConnection.oauthAccountEmail,
            organizationUuid: failSoftConnection.oauthOrganizationUuid,
            organizationName: failSoftConnection.oauthOrganizationName,
            timestamp: failSoftConnection.oauthProfileVerifiedAt,
          },
          failSoftCredentialStored: failSoftCredential?.refreshToken === 'github-access-3',
          identityRequests,
          invalidatedSlugs,
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
        throw new Error(`Copilot identity handler subprocess failed:\n${run.stderr.toString()}`)
      }

      const output = JSON.parse(run.stdout.toString().trim())
      expect(output.existingResult).toEqual({ success: true })
      expect(output.existingIdentity).toEqual({
        accountUuid: '4242',
        accountLabel: '@copilot-builder',
        organizationUuid: '7171',
        organizationName: 'nexus-labs',
        timestampAdvanced: true,
      })
      expect(output.existingCredentialStored).toBe(true)
      expect(output.firstResult).toEqual({ success: true })
      expect(output.forgedSetup).toEqual({
        success: false,
        error: 'Complete the server GitHub Copilot OAuth flow before creating this connection.',
      })
      expect(output.absentAfterForgery).toBe(true)
      expect(output.ownerSetup).toEqual({ success: true })
      expect(output.firstIdentity).toEqual({
        accountUuid: '4242',
        accountLabel: '@copilot-builder',
        organizationUuid: '7171',
        organizationName: 'nexus-labs',
        timestampPresent: true,
      })
      expect(output.failSoftResult).toEqual({ success: true })
      expect(output.failSoftIdentity).toEqual({
        accountUuid: 'preserved-user',
        accountLabel: '@preserved-login',
        organizationUuid: 'preserved-org',
        organizationName: 'Preserved Org',
        timestamp: 9,
      })
      expect(output.failSoftCredentialStored).toBe(true)
      expect(output.identityRequests).toEqual([
        { url: 'https://api.github.com/user', authorization: 'Bearer github-access-1' },
        {
          url: 'https://api.github.com/users/copilot-builder/orgs?per_page=1',
          authorization: 'Bearer github-access-1',
        },
        { url: 'https://api.github.com/user', authorization: 'Bearer github-access-2' },
        {
          url: 'https://api.github.com/users/copilot-builder/orgs?per_page=1',
          authorization: 'Bearer github-access-2',
        },
        { url: 'https://api.github.com/user', authorization: 'Bearer github-access-3' },
      ])
      expect(output.invalidatedSlugs).toEqual([
        'legacy-copilot-existing',
        'github-copilot-2',
        'legacy-copilot-fail-soft',
      ])
    } finally {
      rmSync(isolated.root, { recursive: true, force: true })
    }
  })
})
