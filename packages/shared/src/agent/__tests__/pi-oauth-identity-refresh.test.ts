import { describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PI_AGENT_MODULE = pathToFileURL(join(import.meta.dir, '..', 'pi-agent.ts')).href

function isolatedPaths() {
  const root = mkdtempSync(join(tmpdir(), 'nexus-pi-identity-refresh-'))
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
    browserToolEnabled: true,
    defaultLlmConnection: 'chatgpt-plus',
    llmConnections: [
      {
        slug: 'chatgpt-plus',
        name: 'ChatGPT Plus',
        providerType: 'pi',
        authType: 'oauth',
        piAuthProvider: 'openai-codex',
        createdAt: 1,
        oauthAccountUuid: 'old-user',
        oauthAccountEmail: 'old-person@example.test',
        oauthOrganizationUuid: 'old-workspace',
        oauthOrganizationName: 'Old Workspace Name',
        oauthProfileVerifiedAt: 1,
      },
      {
        slug: 'chatgpt-plus-2',
        name: 'ChatGPT Plus 2',
        providerType: 'pi',
        authType: 'oauth',
        piAuthProvider: 'openai-codex',
        createdAt: 1,
        oauthAccountUuid: 'sibling-user',
        oauthAccountEmail: 'sibling@example.test',
        oauthOrganizationUuid: 'sibling-workspace',
        oauthProfileVerifiedAt: 2,
      },
      {
        slug: 'github-copilot',
        name: 'GitHub Copilot',
        providerType: 'pi',
        authType: 'oauth',
        piAuthProvider: 'github-copilot',
        createdAt: 1,
        oauthAccountUuid: 'old-github-user',
        oauthAccountEmail: '@old-github-login',
        oauthOrganizationUuid: 'old-github-org',
        oauthOrganizationName: 'Old GitHub Org',
        oauthProfileVerifiedAt: 3,
      },
    ],
  }))

  return { root, configDir, homeDir, workspaceRoot, configPath }
}

describe('PiAgent OAuth identity refresh', () => {
  it('re-stamps only the bound slug and preserves identity when refresh omits id_token', () => {
    const isolated = isolatedPaths()
    try {
      const runner = `
        const authClaim = 'https://api.openai.com/auth'
        const refreshedClaims = {
          email: 'new-person@example.test',
          [authClaim]: {
            chatgpt_user_id: 'new-user',
            chatgpt_account_id: 'new-workspace',
          },
        }
        const refreshedIdToken = [
          Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
          Buffer.from(JSON.stringify(refreshedClaims)).toString('base64url'),
          'fabricated-signature',
        ].join('.')

        let refreshCount = 0
        globalThis.fetch = async () => {
          refreshCount++
          const body = refreshCount === 1
            ? {
                id_token: refreshedIdToken,
                access_token: 'refreshed-access-1',
                refresh_token: 'refreshed-refresh-1',
                expires_in: 3600,
              }
            : {
                access_token: 'refreshed-access-2',
                refresh_token: 'refreshed-refresh-2',
                expires_in: 3600,
              }
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }

        const { getCredentialManager } = await import('@craft-agent/shared/credentials')
        const { PiAgent } = await import(${JSON.stringify(PI_AGENT_MODULE)})
        const manager = getCredentialManager()
        await manager.setLlmOAuth('chatgpt-plus', {
          accessToken: 'initial-access',
          refreshToken: 'initial-refresh',
          idToken: 'initial-id-token',
        })
        await manager.setLlmOAuth('chatgpt-plus-2', {
          accessToken: 'sibling-access',
          refreshToken: 'sibling-refresh',
          idToken: 'sibling-id-token',
        })

        const agent = new PiAgent({
          provider: 'pi',
          providerType: 'pi',
          authType: 'oauth',
          connectionSlug: 'chatgpt-plus',
          runtime: { piAuthProvider: 'openai-codex' },
          workspace: {
            id: 'workspace-1',
            name: 'Test Workspace',
            rootPath: ${JSON.stringify(isolated.workspaceRoot)},
          },
          isHeadless: true,
        })

        await agent.refreshAndPushTokens()
        const firstConfig = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const firstTarget = firstConfig.llmConnections.find(connection => connection.slug === 'chatgpt-plus')
        const firstSibling = firstConfig.llmConnections.find(connection => connection.slug === 'chatgpt-plus-2')
        const firstCredential = await manager.getLlmOAuth('chatgpt-plus')

        await agent.refreshAndPushTokens()
        const secondConfig = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const secondTarget = secondConfig.llmConnections.find(connection => connection.slug === 'chatgpt-plus')
        const secondCredential = await manager.getLlmOAuth('chatgpt-plus')
        agent.destroy()

        console.log(JSON.stringify({
          firstTarget: {
            accountUuid: firstTarget.oauthAccountUuid,
            accountEmail: firstTarget.oauthAccountEmail,
            workspaceUuid: firstTarget.oauthOrganizationUuid,
            organizationNamePresent: firstTarget.oauthOrganizationName !== undefined,
            timestampAdvanced: firstTarget.oauthProfileVerifiedAt > 1,
          },
          siblingUntouched: {
            accountUuid: firstSibling.oauthAccountUuid,
            workspaceUuid: firstSibling.oauthOrganizationUuid,
            timestamp: firstSibling.oauthProfileVerifiedAt,
          },
          firstIdTokenUpdated: firstCredential.idToken === refreshedIdToken,
          secondIdentityPreserved: {
            accountUuid: secondTarget.oauthAccountUuid,
            accountEmail: secondTarget.oauthAccountEmail,
            workspaceUuid: secondTarget.oauthOrganizationUuid,
            timestamp: secondTarget.oauthProfileVerifiedAt,
          },
          missingIdTokenPreservedStoredToken: secondCredential.idToken === refreshedIdToken,
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
        throw new Error(`refresh subprocess failed:\n${run.stderr.toString()}`)
      }

      const output = JSON.parse(run.stdout.toString().trim())
      expect(output.firstTarget).toEqual({
        accountUuid: 'new-user',
        accountEmail: 'new-person@example.test',
        workspaceUuid: 'new-workspace',
        organizationNamePresent: false,
        timestampAdvanced: true,
      })
      expect(output.siblingUntouched).toEqual({
        accountUuid: 'sibling-user',
        workspaceUuid: 'sibling-workspace',
        timestamp: 2,
      })
      expect(output.firstIdTokenUpdated).toBe(true)
      expect(output.secondIdentityPreserved).toEqual({
        accountUuid: 'new-user',
        accountEmail: 'new-person@example.test',
        workspaceUuid: 'new-workspace',
        timestamp: expect.any(Number),
      })
      expect(output.missingIdTokenPreservedStoredToken).toBe(true)
    } finally {
      rmSync(isolated.root, { recursive: true, force: true })
    }
  })

  it('cannot resurrect credentials when logout wins an in-flight refresh race', () => {
    const isolated = isolatedPaths()
    try {
      const runner = `
        let releaseFetch
        let markFetchStarted
        const fetchStarted = new Promise(resolve => { markFetchStarted = resolve })
        globalThis.fetch = async () => {
          markFetchStarted()
          return new Promise(resolve => { releaseFetch = resolve })
        }

        const {
          getCredentialManager,
          revokeLlmCredentials,
          withLlmCredentialCommit,
        } = await import('@craft-agent/shared/credentials')
        const { PiAgent } = await import(${JSON.stringify(PI_AGENT_MODULE)})
        const manager = getCredentialManager()
        await manager.setLlmOAuth('chatgpt-plus', {
          accessToken: 'initial-access',
          refreshToken: 'initial-refresh',
          idToken: 'initial-id-token',
        })

        const agent = new PiAgent({
          provider: 'pi',
          providerType: 'pi',
          authType: 'oauth',
          connectionSlug: 'chatgpt-plus',
          runtime: { piAuthProvider: 'openai-codex' },
          workspace: {
            id: 'workspace-1',
            name: 'Test Workspace',
            rootPath: ${JSON.stringify(isolated.workspaceRoot)},
          },
          isHeadless: true,
        })

        const refresh = agent.refreshAndPushTokens()
        await fetchStarted

        revokeLlmCredentials('chatgpt-plus')
        const deletion = withLlmCredentialCommit(
          'chatgpt-plus',
          () => manager.deleteLlmCredentials('chatgpt-plus'),
        )
        await deletion

        releaseFetch(new Response(JSON.stringify({
          access_token: 'late-refreshed-access',
          refresh_token: 'late-refreshed-refresh',
          expires_in: 3600,
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }))
        await refresh

        const credentials = await manager.getLlmOAuth('chatgpt-plus')
        const config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const connection = config.llmConnections.find(connection => connection.slug === 'chatgpt-plus')
        agent.destroy()

        console.log(JSON.stringify({
          credentialsPresent: credentials !== null,
          identityUntouched: {
            accountUuid: connection.oauthAccountUuid,
            accountEmail: connection.oauthAccountEmail,
            workspaceUuid: connection.oauthOrganizationUuid,
            organizationName: connection.oauthOrganizationName,
            timestamp: connection.oauthProfileVerifiedAt,
          },
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
        throw new Error(`refresh/logout race subprocess failed:\n${run.stderr.toString()}`)
      }

      const output = JSON.parse(run.stdout.toString().trim())
      expect(output.credentialsPresent).toBe(false)
      expect(output.identityUntouched).toEqual({
        accountUuid: 'old-user',
        accountEmail: 'old-person@example.test',
        workspaceUuid: 'old-workspace',
        organizationName: 'Old Workspace Name',
        timestamp: 1,
      })
    } finally {
      rmSync(isolated.root, { recursive: true, force: true })
    }
  })

  it('reactivates Copilot and re-stamps its GitHub identity after refresh', () => {
    const isolated = isolatedPaths()
    try {
      const runner = `
        import { mock } from 'bun:test'
        mock.module('@earendil-works/pi-ai/oauth', () => ({
          refreshGitHubCopilotToken: async () => ({
            access: 'copilot-refreshed-access',
            refresh: 'copilot-refreshed-refresh',
            expires: Date.now() + 3600000,
          }),
        }))

        globalThis.fetch = async url => {
          if (String(url) === 'https://api.github.com/user') {
            return Response.json({
              id: 4242,
              login: 'copilot-builder',
              email: null,
            })
          }
          if (String(url) === 'https://api.github.com/users/copilot-builder/orgs?per_page=1') {
            return Response.json([{ id: 7171, login: 'nexus-labs' }])
          }
          throw new Error('Unexpected GitHub identity URL: ' + url)
        }

        const {
          activateLlmOAuthCredentials,
          beginLlmOAuthCredentialFlow,
          getCredentialManager,
          revokeLlmCredentials,
        } = await import('@craft-agent/shared/credentials')
        const { PiAgent } = await import(${JSON.stringify(PI_AGENT_MODULE)})
        const manager = getCredentialManager()

        // Simulate a prior delete, then the server-owned Copilot login lifecycle
        // recreating and activating the slug.
        revokeLlmCredentials('github-copilot')
        const oauthEpoch = beginLlmOAuthCredentialFlow('github-copilot')
        await manager.setLlmOAuth('github-copilot', {
          accessToken: 'copilot-login-access',
          refreshToken: 'copilot-login-refresh',
        })
        if (!activateLlmOAuthCredentials('github-copilot', oauthEpoch)) {
          throw new Error('failed to activate Copilot relogin')
        }

        const agent = new PiAgent({
          provider: 'pi',
          providerType: 'pi',
          authType: 'oauth',
          connectionSlug: 'github-copilot',
          runtime: { piAuthProvider: 'github-copilot' },
          workspace: {
            id: 'workspace-1',
            name: 'Test Workspace',
            rootPath: ${JSON.stringify(isolated.workspaceRoot)},
          },
          isHeadless: true,
        })

        await agent.refreshAndPushTokens()
        const credentials = await manager.getLlmOAuth('github-copilot')
        const config = JSON.parse(await Bun.file(${JSON.stringify(isolated.configPath)}).text())
        const connection = config.llmConnections.find(candidate => candidate.slug === 'github-copilot')
        agent.destroy()
        console.log(JSON.stringify({
          refreshedAccessStored: credentials?.accessToken === 'copilot-refreshed-access',
          refreshedRefreshStored: credentials?.refreshToken === 'copilot-refreshed-refresh',
          identity: {
            accountUuid: connection.oauthAccountUuid,
            accountLabel: connection.oauthAccountEmail,
            organizationUuid: connection.oauthOrganizationUuid,
            organizationName: connection.oauthOrganizationName,
            timestampAdvanced: connection.oauthProfileVerifiedAt > 3,
          },
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
        throw new Error(`Copilot relogin subprocess failed:\n${run.stderr.toString()}`)
      }

      expect(JSON.parse(run.stdout.toString().trim())).toEqual({
        refreshedAccessStored: true,
        refreshedRefreshStored: true,
        identity: {
          accountUuid: '4242',
          accountLabel: '@copilot-builder',
          organizationUuid: '7171',
          organizationName: 'nexus-labs',
          timestampAdvanced: true,
        },
      })
    } finally {
      rmSync(isolated.root, { recursive: true, force: true })
    }
  })

  it('cannot resurrect Copilot credentials when logout wins an in-flight refresh race', () => {
    const isolated = isolatedPaths()
    try {
      const runner = `
        import { mock } from 'bun:test'
        let releaseRefresh
        let markRefreshStarted
        const refreshStarted = new Promise(resolve => { markRefreshStarted = resolve })
        mock.module('@earendil-works/pi-ai/oauth', () => ({
          refreshGitHubCopilotToken: async () => {
            markRefreshStarted()
            await new Promise(resolve => { releaseRefresh = resolve })
            return {
              access: 'late-copilot-access',
              refresh: 'late-github-refresh',
              expires: Date.now() + 3600000,
            }
          },
        }))

        globalThis.fetch = async () => {
          throw new Error('stale Copilot refresh must not perform identity lookup')
        }

        const {
          getCredentialManager,
          revokeLlmCredentials,
          withLlmCredentialCommit,
        } = await import('@craft-agent/shared/credentials')
        const { PiAgent } = await import(${JSON.stringify(PI_AGENT_MODULE)})
        const manager = getCredentialManager()
        await manager.setLlmOAuth('github-copilot', {
          accessToken: 'initial-copilot-access',
          refreshToken: 'initial-github-refresh',
        })

        const agent = new PiAgent({
          provider: 'pi',
          providerType: 'pi',
          authType: 'oauth',
          connectionSlug: 'github-copilot',
          runtime: { piAuthProvider: 'github-copilot' },
          workspace: {
            id: 'workspace-1',
            name: 'Test Workspace',
            rootPath: ${JSON.stringify(isolated.workspaceRoot)},
          },
          isHeadless: true,
        })

        const refresh = agent.refreshAndPushTokens()
        await refreshStarted
        revokeLlmCredentials('github-copilot')
        await withLlmCredentialCommit(
          'github-copilot',
          () => manager.deleteLlmCredentials('github-copilot'),
        )
        releaseRefresh()
        await refresh

        const credentials = await manager.getLlmOAuth('github-copilot')
        agent.destroy()
        console.log(JSON.stringify({ credentialsPresent: credentials !== null }))
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
        throw new Error(`Copilot refresh/logout subprocess failed:\n${run.stderr.toString()}`)
      }
      expect(JSON.parse(run.stdout.toString().trim())).toEqual({ credentialsPresent: false })
    } finally {
      rmSync(isolated.root, { recursive: true, force: true })
    }
  })

  it('rejects a Codex credential read that races with revocation', () => {
    const isolated = isolatedPaths()
    try {
      const runner = `
        const { getCredentialManager, revokeLlmCredentials } = await import('@craft-agent/shared/credentials')
        const { PiAgent } = await import(${JSON.stringify(PI_AGENT_MODULE)})
        const manager = getCredentialManager()
        await manager.setLlmOAuth('chatgpt-plus', {
          accessToken: 'cached-before-logout',
          refreshToken: 'refresh-before-logout',
        })

        let releaseCredentialRead
        let signalCredentialRead
        const credentialReadStarted = new Promise(resolve => { signalCredentialRead = resolve })
        const originalGetLlmOAuth = manager.getLlmOAuth.bind(manager)
        manager.getLlmOAuth = async (...args) => {
          signalCredentialRead()
          await new Promise(resolve => { releaseCredentialRead = resolve })
          return originalGetLlmOAuth(...args)
        }

        const agent = new PiAgent({
          provider: 'pi',
          providerType: 'pi',
          authType: 'oauth',
          connectionSlug: 'chatgpt-plus',
          runtime: { piAuthProvider: 'openai-codex' },
          workspace: {
            id: 'workspace-1',
            name: 'Test Workspace',
            rootPath: ${JSON.stringify(isolated.workspaceRoot)},
          },
          isHeadless: true,
        })

        const racingRead = agent.getPiAuth()
        await credentialReadStarted
        revokeLlmCredentials('chatgpt-plus')
        releaseCredentialRead()
        const racingResult = await racingRead
        const postRevokeResult = await agent.getPiAuth()
        agent.destroy()

        console.log(JSON.stringify({
          racingReadRejected: racingResult === null,
          postRevokeReadRejected: postRevokeResult === null,
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
        throw new Error(`credential-read race subprocess failed:\n${run.stderr.toString()}`)
      }

      expect(JSON.parse(run.stdout.toString().trim())).toEqual({
        racingReadRejected: true,
        postRevokeReadRejected: true,
      })
    } finally {
      rmSync(isolated.root, { recursive: true, force: true })
    }
  })

  it('never injects a revoked Codex token through the legacy spawn fallback', () => {
    const isolated = isolatedPaths()
    const fakeServerPath = join(isolated.root, 'fake-pi-server.mjs')
    const capturedInitPath = join(isolated.root, 'captured-init.json')
    const capturedMissingProviderInitPath = join(isolated.root, 'captured-missing-provider-init.json')
    writeFileSync(fakeServerPath, `
      import { writeFileSync } from 'node:fs'
      import { createInterface } from 'node:readline'
      const input = createInterface({ input: process.stdin })
      input.on('line', line => {
        const message = JSON.parse(line)
        if (message.type === 'init') {
          writeFileSync(process.env.CAPTURED_INIT_PATH, JSON.stringify(message))
          process.stdout.write(JSON.stringify({ type: 'ready', sessionId: null, callbackPort: 0 }) + '\\n')
        } else if (message.type === 'set_auto_compaction') {
          process.stdout.write(JSON.stringify({
            type: 'set_auto_compaction_result',
            id: message.id,
            success: true,
            enabled: message.enabled,
          }) + '\\n')
        }
      })
    `)

    try {
      const runner = `
        const { getCredentialManager, revokeLlmCredentials } = await import('@craft-agent/shared/credentials')
        const { PiAgent } = await import(${JSON.stringify(PI_AGENT_MODULE)})
        const manager = getCredentialManager()
        await manager.setLlmOAuth('chatgpt-plus', {
          accessToken: 'must-never-reach-init',
          refreshToken: 'refresh-before-revoke',
        })

        let releaseCredentialRead
        let signalCredentialRead
        const credentialReadStarted = new Promise(resolve => { signalCredentialRead = resolve })
        const originalGetLlmOAuth = manager.getLlmOAuth.bind(manager)
        manager.getLlmOAuth = async (...args) => {
          const snapshot = await originalGetLlmOAuth(...args)
          signalCredentialRead()
          await new Promise(resolve => { releaseCredentialRead = resolve })
          return snapshot
        }

        const agent = new PiAgent({
          provider: 'pi',
          providerType: 'pi',
          authType: 'oauth',
          connectionSlug: 'chatgpt-plus',
          model: 'gpt-5',
          runtime: {
            piAuthProvider: 'openai-codex',
            paths: {
              node: process.execPath,
              piServer: ${JSON.stringify(fakeServerPath)},
            },
          },
          envOverrides: { CAPTURED_INIT_PATH: ${JSON.stringify(capturedInitPath)} },
          workspace: {
            id: 'workspace-1',
            name: 'Test Workspace',
            rootPath: ${JSON.stringify(isolated.workspaceRoot)},
          },
          isHeadless: true,
        })

        const spawning = agent.spawnSubprocess()
        await credentialReadStarted
        revokeLlmCredentials('chatgpt-plus')
        releaseCredentialRead()
        await spawning
        const init = JSON.parse(await Bun.file(${JSON.stringify(capturedInitPath)}).text())
        agent.destroy()

        manager.getLlmOAuth = originalGetLlmOAuth
        await manager.setLlmOAuth('chatgpt-plus-2', {
          accessToken: 'must-never-reach-init-with-missing-provider',
          refreshToken: 'missing-provider-refresh',
        })
        const missingProviderAgent = new PiAgent({
          provider: 'pi',
          providerType: 'pi',
          authType: 'oauth',
          connectionSlug: 'chatgpt-plus-2',
          model: 'gpt-5',
          runtime: {
            paths: {
              node: process.execPath,
              piServer: ${JSON.stringify(fakeServerPath)},
            },
          },
          envOverrides: { CAPTURED_INIT_PATH: ${JSON.stringify(capturedMissingProviderInitPath)} },
          workspace: {
            id: 'workspace-1',
            name: 'Test Workspace',
            rootPath: ${JSON.stringify(isolated.workspaceRoot)},
          },
          isHeadless: true,
        })
        await missingProviderAgent.spawnSubprocess()
        const missingProviderInit = JSON.parse(
          await Bun.file(${JSON.stringify(capturedMissingProviderInitPath)}).text()
        )
        missingProviderAgent.destroy()

        console.log(JSON.stringify({
          apiKeyEmpty: init.apiKey === '',
          piAuthAbsent: init.piAuth === null,
          serializedInitContainsRevokedToken: JSON.stringify(init).includes('must-never-reach-init'),
          missingProviderApiKeyEmpty: missingProviderInit.apiKey === '',
          missingProviderPiAuthAbsent: missingProviderInit.piAuth === null,
          missingProviderTokenAbsent: !JSON.stringify(missingProviderInit).includes('must-never-reach-init-with-missing-provider'),
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
        throw new Error(`spawn/revoke race subprocess failed:\n${run.stderr.toString()}`)
      }

      expect(JSON.parse(run.stdout.toString().trim())).toEqual({
        apiKeyEmpty: true,
        piAuthAbsent: true,
        serializedInitContainsRevokedToken: false,
        missingProviderApiKeyEmpty: true,
        missingProviderPiAuthAbsent: true,
        missingProviderTokenAbsent: true,
      })
    } finally {
      rmSync(isolated.root, { recursive: true, force: true })
    }
  })
})
