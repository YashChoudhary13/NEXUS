import { describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const HANDLER_MODULE = pathToFileURL(join(import.meta.dir, 'onboarding.ts')).href

describe('Claude OAuth flow generation', () => {
  it('prevents older or cancelled exchanges from installing credentials or clearing newer state', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexus-claude-oauth-generation-'))
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
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({
      workspaces: [{ id: 'workspace-1', name: 'Test Workspace', rootPath: workspaceRoot, createdAt: 1 }],
      activeWorkspaceId: 'workspace-1',
      activeSessionId: null,
      defaultLlmConnection: 'claude-max',
      llmConnections: [{
        slug: 'claude-max',
        name: 'Claude Max',
        providerType: 'anthropic',
        authType: 'oauth',
        createdAt: 1,
      }],
    }))

    try {
      const runner = `
        let fetchCount = 0
        let blockNextFetch = false
        let releaseFetch
        let signalFetchBlocked
        let fetchBlocked
        const prepareBlockedFetch = () => {
          blockNextFetch = true
          fetchBlocked = new Promise(resolve => { signalFetchBlocked = resolve })
        }

        globalThis.fetch = async () => {
          const call = ++fetchCount
          if (blockNextFetch) {
            blockNextFetch = false
            signalFetchBlocked()
            await new Promise(resolve => { releaseFetch = resolve })
          }
          return new Response(JSON.stringify({
            access_token: 'fabricated-claude-access-' + call,
            refresh_token: 'fabricated-claude-refresh-' + call,
            expires_in: 3600,
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }

        const { RPC_CHANNELS } = await import('@craft-agent/shared/protocol')
        const { captureLlmCredentialRefreshEpoch, getCredentialManager } = await import('@craft-agent/shared/credentials')
        const { registerOnboardingHandlers } = await import(${JSON.stringify(HANDLER_MODULE)})
        const handlers = new Map()
        const server = { handle(channel, handler) { handlers.set(channel, handler) } }
        const logger = { debug() {}, error() {}, info() {}, warn() {} }
        const invalidated = []
        registerOnboardingHandlers(server, {
          platform: { logger },
          sessionManager: { invalidateConnectionAuth: async slug => { invalidated.push(slug) } },
        })

        const start = handlers.get(RPC_CHANNELS.onboarding.START_CLAUDE_OAUTH)
        const exchange = handlers.get(RPC_CHANNELS.onboarding.EXCHANGE_CLAUDE_CODE)
        const hasState = handlers.get(RPC_CHANNELS.onboarding.HAS_CLAUDE_OAUTH_STATE)
        const clear = handlers.get(RPC_CHANNELS.onboarding.CLEAR_CLAUDE_OAUTH_STATE)
        const ctx = { clientId: 'owner' }

        await start(ctx, 'claude-max')
        prepareBlockedFetch()
        const oldExchangePromise = exchange(ctx, 'fabricated-old-code', 'claude-max')
        await fetchBlocked
        await start(ctx, 'claude-max')
        const lifecycleResumedAfterSupersedingStart =
          captureLlmCredentialRefreshEpoch('claude-max') !== undefined
        releaseFetch()
        const oldExchange = await oldExchangePromise
        const newerStateSurvived = await hasState(ctx)

        const newExchange = await exchange(ctx, 'fabricated-new-code', 'claude-max')
        const manager = getCredentialManager()
        const afterNewExchange = await manager.getLlmOAuth('claude-max')

        await start(ctx, 'claude-max')
        prepareBlockedFetch()
        const cancelledExchangePromise = exchange(ctx, 'fabricated-cancelled-code', 'claude-max')
        await fetchBlocked
        await clear(ctx)
        const lifecycleResumedAfterClear =
          captureLlmCredentialRefreshEpoch('claude-max') !== undefined
        releaseFetch()
        const cancelledExchange = await cancelledExchangePromise
        const afterCancelledExchange = await manager.getLlmOAuth('claude-max')

        console.log(JSON.stringify({
          oldExchange,
          newerStateSurvived,
          lifecycleResumedAfterSupersedingStart,
          newExchangeSucceeded: newExchange.success,
          newCredentialStored: afterNewExchange?.accessToken === 'fabricated-claude-access-2',
          cancelledExchange,
          cancelledStateCleared: !(await hasState(ctx)),
          lifecycleResumedAfterClear,
          cancelledExchangePreservedCredential:
            afterCancelledExchange?.accessToken === 'fabricated-claude-access-2',
          invalidated,
        }))
      `

      const run = Bun.spawnSync([process.execPath, '--eval', runner], {
        cwd: join(import.meta.dir, '..', '..', '..', '..', '..'),
        env: {
          ...process.env,
          HOME: homeDir,
          CRAFT_CONFIG_DIR: configDir,
          CRAFT_CLI_JSON_ONLY: '1',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      if (run.exitCode !== 0) {
        throw new Error(`Claude OAuth generation subprocess failed:\n${run.stderr.toString()}`)
      }

      const output = JSON.parse(run.stdout.toString().trim())
      expect(output.oldExchange).toEqual({
        success: false,
        error: 'Claude OAuth connection changed. Please start again.',
      })
      expect(output.newerStateSurvived).toBe(true)
      expect(output.lifecycleResumedAfterSupersedingStart).toBe(true)
      expect(output.newExchangeSucceeded).toBe(true)
      expect(output.newCredentialStored).toBe(true)
      expect(output.cancelledExchange).toEqual({
        success: false,
        error: 'Claude OAuth connection changed. Please start again.',
      })
      expect(output.cancelledStateCleared).toBe(true)
      expect(output.lifecycleResumedAfterClear).toBe(true)
      expect(output.cancelledExchangePreservedCredential).toBe(true)
      expect(output.invalidated).toEqual(['claude-max'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 30_000)
})
