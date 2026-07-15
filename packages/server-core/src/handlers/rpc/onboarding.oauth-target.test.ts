import { describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { registerOnboardingHandlers } from './onboarding'

const HANDLER_MODULE = pathToFileURL(join(import.meta.dir, 'onboarding.ts')).href

describe('Claude OAuth target boundary', () => {
  it('rejects a ChatGPT slug before exchanging or writing credentials', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const warnings: string[] = []
    const server = {
      handle(channel: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(channel, handler)
      },
    }
    const deps = {
      platform: {
        logger: {
          debug() {},
          error() {},
          info() {},
          warn(message: unknown) { warnings.push(String(message)) },
        },
      },
    }

    registerOnboardingHandlers(server as never, deps as never)
    const exchange = handlers.get(RPC_CHANNELS.onboarding.EXCHANGE_CLAUDE_CODE)
    expect(exchange).toBeDefined()

    const result = await exchange!(
      { clientId: 'adversarial-client' },
      'fabricated-authorization-code',
      'chatgpt-plus-2',
    )

    expect(result).toEqual({
      success: false,
      error: 'Claude OAuth can only target a Claude OAuth connection.',
    })
    expect(warnings).toEqual(['[Onboarding] Rejected Claude OAuth target: chatgpt-plus-2'])
  })

  it('rejects a canonical Claude row whose stored provider provenance conflicts', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexus-claude-target-'))
    const configDir = join(root, 'config')
    const workspaceRoot = join(root, 'workspace')
    mkdirSync(configDir, { recursive: true })
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
        name: 'Poisoned Claude',
        providerType: 'pi',
        authType: 'oauth',
        piAuthProvider: 'github-copilot',
        baseUrl: 'https://attacker.example.test/v1',
        createdAt: 1,
      }],
    }))

    try {
      const runner = `
        const { RPC_CHANNELS } = await import('@craft-agent/shared/protocol')
        const { registerOnboardingHandlers } = await import(${JSON.stringify(HANDLER_MODULE)})
        const handlers = new Map()
        const server = { handle(channel, handler) { handlers.set(channel, handler) } }
        const warnings = []
        const logger = { debug() {}, error() {}, info() {}, warn(message) { warnings.push(String(message)) } }
        registerOnboardingHandlers(server, { platform: { logger } })
        const result = await handlers.get(RPC_CHANNELS.onboarding.EXCHANGE_CLAUDE_CODE)(
          { clientId: 'adversarial-client' },
          'fabricated-authorization-code',
          'claude-max',
        )
        console.log(JSON.stringify({ result, warnings }))
      `
      const run = Bun.spawnSync([process.execPath, '--eval', runner], {
        cwd: join(import.meta.dir, '..', '..', '..', '..', '..'),
        env: { ...process.env, CRAFT_CONFIG_DIR: configDir, CRAFT_CLI_JSON_ONLY: '1' },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      if (run.exitCode !== 0) throw new Error(run.stderr.toString())
      expect(JSON.parse(run.stdout.toString().trim())).toEqual({
        result: {
          success: false,
          error: 'Claude OAuth can only target a Claude OAuth connection.',
        },
        warnings: ['[Onboarding] Rejected Claude OAuth target: claude-max'],
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
