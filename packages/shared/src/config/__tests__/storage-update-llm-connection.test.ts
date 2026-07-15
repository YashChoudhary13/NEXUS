import { describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { pathToFileURL } from 'url'

const STORAGE_MODULE_PATH = pathToFileURL(join(import.meta.dir, '..', 'storage.ts')).href

/**
 * Create isolated config dir with a root config containing the given connections.
 * Returns paths needed by tests plus a runner to call updateLlmConnection in a subprocess.
 */
function setup(llmConnections: any[]) {
  const configDir = mkdtempSync(join(tmpdir(), 'craft-agent-config-'))
  const workspaceRoot = join(configDir, 'workspaces', 'my-workspace')
  mkdirSync(workspaceRoot, { recursive: true })

  writeFileSync(
    join(workspaceRoot, 'config.json'),
    JSON.stringify({
      id: 'ws-config-1',
      name: 'My Workspace',
      slug: 'my-workspace',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }, null, 2),
    'utf-8',
  )

  const configPath = join(configDir, 'config.json')
  writeFileSync(
    configPath,
    JSON.stringify({
      workspaces: [{ id: 'ws-1', name: 'My Workspace', rootPath: workspaceRoot, createdAt: Date.now() }],
      activeWorkspaceId: 'ws-1',
      activeSessionId: null,
      defaultLlmConnection: llmConnections[0]?.slug ?? null,
      llmConnections,
    }, null, 2),
    'utf-8',
  )

  function runUpdate(
    slug: string,
    updates: Record<string, unknown>,
    explicitUndefinedKeys: string[] = [],
  ): boolean {
    const updatesJson = JSON.stringify(updates)
    const undefinedAssignments = explicitUndefinedKeys
      .map(key => `${JSON.stringify(key)}: undefined`)
      .join(',')
    const run = Bun.spawnSync([
      process.execPath,
      '--eval',
      `import { updateLlmConnection } from '${STORAGE_MODULE_PATH}'; const updates = { ...${updatesJson}, ${undefinedAssignments} }; const ok = updateLlmConnection(${JSON.stringify(slug)}, updates); process.exit(ok ? 0 : 1);`,
    ], {
      env: { ...process.env, CRAFT_CONFIG_DIR: configDir },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    if (run.exitCode !== 0 && run.stderr.toString().trim()) {
      throw new Error(`update subprocess failed:\n${run.stderr.toString()}`)
    }
    return run.exitCode === 0
  }

  function readConnection(slug: string): any {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    return config.llmConnections.find((c: any) => c.slug === slug)
  }

  function readResolvedConnection(slug: string): any {
    const run = Bun.spawnSync([
      process.execPath,
      '--eval',
      `import { getLlmConnection } from '${STORAGE_MODULE_PATH}'; console.log(JSON.stringify(getLlmConnection(${JSON.stringify(slug)})));`,
    ], {
      env: { ...process.env, CRAFT_CONFIG_DIR: configDir },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    if (run.exitCode !== 0) throw new Error(`read subprocess failed:\n${run.stderr.toString()}`)
    return JSON.parse(run.stdout.toString())
  }

  return { configDir, configPath, runUpdate, readConnection, readResolvedConnection }
}

describe('server-owned OAuth routing normalization', () => {
  it('quarantines a conflicting ChatGPT row before any consumer can observe its OAuth routing', () => {
    const { readResolvedConnection } = setup([makeConnection({
      slug: 'chatgpt-plus-2',
      providerType: 'anthropic',
      authType: 'oauth',
      piAuthProvider: 'github-copilot',
      baseUrl: 'https://attacker.example.test/v1',
      customEndpoint: { api: 'openai-completions' },
    })])

    const resolved = readResolvedConnection('chatgpt-plus-2')
    expect(resolved.providerType).toBe('anthropic')
    expect(resolved.authType).toBe('none')
    expect(resolved.piAuthProvider).toBe('github-copilot')
    expect(resolved.baseUrl).toBeUndefined()
    expect(resolved.customEndpoint).toBeUndefined()
  })

  it('keeps canonical provider precedence and quarantines conflicting Claude/Copilot rows', () => {
    const { readResolvedConnection } = setup([
      makeConnection({
        slug: 'claude-max',
        providerType: 'pi',
        authType: 'oauth',
        piAuthProvider: 'openai-codex',
        baseUrl: 'https://attacker.example.test/claude',
      }),
      makeConnection({
        slug: 'github-copilot',
        providerType: 'anthropic',
        authType: 'oauth',
        piAuthProvider: undefined,
        baseUrl: 'https://attacker.example.test/copilot',
      }),
    ])

    const claude = readResolvedConnection('claude-max')
    expect(claude.providerType).toBe('pi')
    expect(claude.piAuthProvider).toBe('openai-codex')
    expect(claude.authType).toBe('none')
    expect(claude.baseUrl).toBeUndefined()

    const copilot = readResolvedConnection('github-copilot')
    expect(copilot.providerType).toBe('anthropic')
    expect(copilot.authType).toBe('none')
    expect(copilot.baseUrl).toBeUndefined()
  })

  it('forces valid legacy Claude OAuth onto the official endpoint and quarantines conflicting Pi provenance', () => {
    const { readResolvedConnection } = setup([
      makeConnection({
        slug: 'legacy-claude-oauth',
        providerType: 'anthropic',
        authType: 'oauth',
        piAuthProvider: undefined,
        baseUrl: 'https://attacker.example.test/v1',
        customEndpoint: { api: 'anthropic-messages' },
      }),
      makeConnection({
        slug: 'legacy-conflicting-oauth',
        providerType: 'anthropic',
        authType: 'oauth',
        piAuthProvider: 'openai-codex',
        baseUrl: 'https://attacker.example.test/v1',
        customEndpoint: { api: 'anthropic-messages' },
      }),
    ])

    const resolved = readResolvedConnection('legacy-claude-oauth')
    expect(resolved.providerType).toBe('anthropic')
    expect(resolved.authType).toBe('oauth')
    expect(resolved.piAuthProvider).toBeUndefined()
    expect(resolved.baseUrl).toBeUndefined()
    expect(resolved.customEndpoint).toBeUndefined()

    const conflicting = readResolvedConnection('legacy-conflicting-oauth')
    expect(conflicting.providerType).toBe('anthropic')
    expect(conflicting.authType).toBe('none')
    expect(conflicting.piAuthProvider).toBe('openai-codex')
    expect(conflicting.baseUrl).toBeUndefined()
    expect(conflicting.customEndpoint).toBeUndefined()
  })
})

function makeConnection(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'custom-compat',
    name: 'My Custom Endpoint',
    providerType: 'pi_compat',
    authType: 'api_key_with_endpoint',
    createdAt: Date.now(),
    baseUrl: 'http://localhost:8085',
    piAuthProvider: 'anthropic',
    ...overrides,
  }
}

describe('updateLlmConnection – customEndpoint', () => {
  it('preserves customEndpoint when provided in updates', () => {
    const { runUpdate, readConnection } = setup([makeConnection()])
    const customEndpoint = { api: 'anthropic-messages' }

    const ok = runUpdate('custom-compat', { customEndpoint })
    expect(ok).toBe(true)

    const conn = readConnection('custom-compat')
    expect(conn.customEndpoint).toEqual(customEndpoint)
  })

  it('preserves existing customEndpoint when updates do not include it', () => {
    const customEndpoint = { api: 'openai-completions' }
    const { runUpdate, readConnection } = setup([makeConnection({ customEndpoint })])

    // Update an unrelated field
    const ok = runUpdate('custom-compat', { name: 'Renamed Endpoint' })
    expect(ok).toBe(true)

    const conn = readConnection('custom-compat')
    expect(conn.customEndpoint).toEqual(customEndpoint)
    expect(conn.name).toBe('Renamed Endpoint')
  })

  it('overwrites customEndpoint protocol when updated', () => {
    const { runUpdate, readConnection } = setup([
      makeConnection({ customEndpoint: { api: 'openai-completions' } }),
    ])

    const ok = runUpdate('custom-compat', { customEndpoint: { api: 'anthropic-messages' } })
    expect(ok).toBe(true)

    const conn = readConnection('custom-compat')
    expect(conn.customEndpoint).toEqual({ api: 'anthropic-messages' })
  })

  it('clears endpoint routing fields only when explicitly requested', () => {
    const { runUpdate, readConnection } = setup([
      makeConnection({ customEndpoint: { api: 'openai-completions' } }),
    ])

    expect(runUpdate('custom-compat', {}, ['baseUrl', 'customEndpoint'])).toBe(true)

    const conn = readConnection('custom-compat')
    expect(conn.baseUrl).toBeUndefined()
    expect(conn.customEndpoint).toBeUndefined()
  })
})

describe('updateLlmConnection – provider-neutral OAuth identity', () => {
  const identity = {
    oauthAccountUuid: 'acct-uuid-123',
    oauthAccountEmail: 'person@example.test',
    oauthOrganizationUuid: 'org-uuid-456',
    oauthOrganizationName: 'Craft',
    oauthProfileVerifiedAt: 1_700_000_000_000,
  }

  it('persists identity fields when provided in updates', () => {
    const { runUpdate, readConnection } = setup([
      makeConnection({ slug: 'claude-max', authType: 'oauth' }),
    ])

    const ok = runUpdate('claude-max', identity)
    expect(ok).toBe(true)

    const conn = readConnection('claude-max')
    expect(conn.oauthAccountUuid).toBe(identity.oauthAccountUuid)
    expect(conn.oauthAccountEmail).toBe(identity.oauthAccountEmail)
    expect(conn.oauthOrganizationUuid).toBe(identity.oauthOrganizationUuid)
    expect(conn.oauthOrganizationName).toBe(identity.oauthOrganizationName)
    expect(conn.oauthProfileVerifiedAt).toBe(identity.oauthProfileVerifiedAt)
  })

  it('preserves identity across an unrelated update (the allowlist-rebuild bug guard)', () => {
    const { runUpdate, readConnection } = setup([
      makeConnection({ slug: 'claude-max', authType: 'oauth', ...identity }),
    ])

    // An update that touches none of the identity fields must not drop them.
    const ok = runUpdate('claude-max', { name: 'Renamed Claude Max' })
    expect(ok).toBe(true)

    const conn = readConnection('claude-max')
    expect(conn.name).toBe('Renamed Claude Max')
    expect(conn.oauthAccountUuid).toBe(identity.oauthAccountUuid)
    expect(conn.oauthAccountEmail).toBe(identity.oauthAccountEmail)
    expect(conn.oauthOrganizationUuid).toBe(identity.oauthOrganizationUuid)
    expect(conn.oauthOrganizationName).toBe(identity.oauthOrganizationName)
    expect(conn.oauthProfileVerifiedAt).toBe(identity.oauthProfileVerifiedAt)
  })

  it('atomically replaces identity and clears absent fields on reauth', () => {
    const { runUpdate, readConnection } = setup([
      makeConnection({ slug: 'chatgpt-plus', authType: 'oauth', ...identity }),
    ])

    const ok = runUpdate(
      'chatgpt-plus',
      {
        oauthAccountUuid: 'new-user',
        oauthAccountEmail: 'new-person@example.test',
        oauthOrganizationUuid: 'new-workspace',
        oauthProfileVerifiedAt: 1_800_000_000_000,
      },
      ['oauthOrganizationName'],
    )
    expect(ok).toBe(true)

    const conn = readConnection('chatgpt-plus')
    expect(conn.oauthAccountUuid).toBe('new-user')
    expect(conn.oauthAccountEmail).toBe('new-person@example.test')
    expect(conn.oauthOrganizationUuid).toBe('new-workspace')
    expect(conn.oauthOrganizationName).toBeUndefined()
    expect(conn.oauthProfileVerifiedAt).toBe(1_800_000_000_000)
  })

  it('clears every identity field when explicitly requested', () => {
    const { runUpdate, readConnection } = setup([
      makeConnection({ slug: 'chatgpt-plus', authType: 'oauth', ...identity }),
    ])

    const fields = [
      'oauthAccountUuid',
      'oauthAccountEmail',
      'oauthOrganizationUuid',
      'oauthOrganizationName',
      'oauthProfileVerifiedAt',
    ]
    expect(runUpdate('chatgpt-plus', {}, fields)).toBe(true)

    const conn = readConnection('chatgpt-plus')
    for (const field of fields) {
      expect(conn[field]).toBeUndefined()
    }
  })
})
