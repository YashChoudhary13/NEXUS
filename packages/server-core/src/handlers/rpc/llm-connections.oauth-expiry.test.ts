import { describe, expect, it } from 'bun:test'
import { captureLlmCredentialRefreshEpoch } from '@craft-agent/shared/credentials'
import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { registerLlmConnectionsHandlers } from './llm-connections'

describe('ChatGPT OAuth flow expiry', () => {
  it('restores background refresh when an abandoned START expires', async () => {
    const previousTtl = process.env.CRAFT_TEST_CHATGPT_OAUTH_TTL_MS
    process.env.CRAFT_TEST_CHATGPT_OAUTH_TTL_MS = '20'
    const slug = 'chatgpt-plus-987'
    try {
      const handlers = new Map<string, (...args: any[]) => any>()
      const server = {
        handle(channel: string, handler: (...args: any[]) => any) { handlers.set(channel, handler) },
        push() {},
        async invokeClient() { return undefined },
        hasClientCapability() { return false },
        findClientsWithCapability() { return [] },
      }
      const deps = {
        sessionManager: {
          reinitializeAuth: async () => {},
          refreshConnectionRuntime: async () => {},
          invalidateConnectionAuth: async () => {},
        },
        oauthFlowStore: {},
        platform: {
          logger: { debug() {}, error() {}, info() {}, warn() {} },
        },
      }
      registerLlmConnectionsHandlers(server as never, deps as never)

      const start = handlers.get(RPC_CHANNELS.chatgpt.START_OAUTH)
      expect(start).toBeDefined()
      await start!({ clientId: 'expiry-client' }, slug)
      expect(captureLlmCredentialRefreshEpoch(slug)).toBeUndefined()

      let restoredEpoch: number | undefined
      for (let attempt = 0; attempt < 20; attempt++) {
        await Bun.sleep(10)
        restoredEpoch = captureLlmCredentialRefreshEpoch(slug)
        if (restoredEpoch !== undefined) break
      }
      expect(restoredEpoch).toBeNumber()
    } finally {
      if (previousTtl === undefined) delete process.env.CRAFT_TEST_CHATGPT_OAUTH_TTL_MS
      else process.env.CRAFT_TEST_CHATGPT_OAUTH_TTL_MS = previousTtl
    }
  })
})
