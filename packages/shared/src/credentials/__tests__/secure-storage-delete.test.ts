import { describe, expect, it } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SECURE_STORAGE_MODULE = pathToFileURL(join(import.meta.dir, '..', 'backends', 'secure-storage.ts')).href

describe('secure LLM credential deletion', () => {
  it('serializes whole-store mutations across different connection slugs', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexus-credential-mutation-'))
    const homeDir = join(root, 'home')
    const configDir = join(root, 'config')
    mkdirSync(homeDir, { recursive: true })
    mkdirSync(configDir, { recursive: true })

    try {
      const runner = `
        const { SecureStorageBackend } = await import(${JSON.stringify(SECURE_STORAGE_MODULE)})
        const backend = new SecureStorageBackend()
        const accountA = { type: 'llm_oauth', connectionSlug: 'chatgpt-plus' }
        const accountB = { type: 'llm_oauth', connectionSlug: 'chatgpt-plus-2' }

        await backend.set(accountA, { value: 'account-a-token' })
        await Promise.all([
          backend.set(accountB, { value: 'account-b-token' }),
          backend.delete(accountA),
        ])

        const inProcessA = await backend.get(accountA)
        const inProcessB = await backend.get(accountB)
        const child = Bun.spawnSync([process.execPath, '--eval', \`
          const { SecureStorageBackend } = await import(${JSON.stringify(SECURE_STORAGE_MODULE)})
          const backend = new SecureStorageBackend()
          const a = await backend.get({ type: 'llm_oauth', connectionSlug: 'chatgpt-plus' })
          const b = await backend.get({ type: 'llm_oauth', connectionSlug: 'chatgpt-plus-2' })
          console.log(JSON.stringify({ aPresent: a !== null, bValue: b?.value }))
        \`], {
          cwd: process.cwd(),
          env: process.env,
          stdout: 'pipe',
          stderr: 'pipe',
        })
        if (child.exitCode !== 0) throw new Error(child.stderr.toString())

        console.log(JSON.stringify({
          inProcessAAbsent: inProcessA === null,
          inProcessBValue: inProcessB?.value,
          afterRestart: JSON.parse(child.stdout.toString().trim()),
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
        throw new Error(`credential mutation subprocess failed:\n${run.stderr.toString()}`)
      }

      expect(JSON.parse(run.stdout.toString().trim())).toEqual({
        inProcessAAbsent: true,
        inProcessBValue: 'account-b-token',
        afterRestart: { aPresent: false, bValue: 'account-b-token' },
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('surfaces persistence failure, preserves the cache, and stays deleted after restart on retry', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexus-credential-delete-'))
    const homeDir = join(root, 'home')
    const configDir = join(root, 'config')
    mkdirSync(homeDir, { recursive: true })
    mkdirSync(configDir, { recursive: true })
    const credentialsDir = join(homeDir, '.craft-agent')
    const credentialsFile = join(homeDir, '.craft-agent', 'credentials.enc')

    try {
      const runner = `
        import { chmodSync } from 'node:fs'
        const { getCredentialManager } = await import('@craft-agent/shared/credentials')
        const manager = getCredentialManager()
        await manager.setLlmOAuth('chatgpt-plus', {
          accessToken: 'persisted-before-failed-delete',
          refreshToken: 'persisted-refresh',
        })

        const readFromFreshProcess = () => {
          const child = Bun.spawnSync([process.execPath, '--eval', \`
            const { getCredentialManager } = await import('@craft-agent/shared/credentials')
            const credential = await getCredentialManager().getLlmOAuth('chatgpt-plus')
            console.log(JSON.stringify({ present: credential !== null }))
          \`], {
            cwd: process.cwd(),
            env: process.env,
            stdout: 'pipe',
            stderr: 'pipe',
          })
          if (child.exitCode !== 0) throw new Error(child.stderr.toString())
          return JSON.parse(child.stdout.toString().trim()).present
        }

        chmodSync(${JSON.stringify(credentialsDir)}, 0o500)
        let deletionFailureSurfaced = false
        try {
          await manager.deleteLlmCredentials('chatgpt-plus')
        } catch {
          deletionFailureSurfaced = true
        }
        const cachedCredentialAfterFailure = await manager.getLlmOAuth('chatgpt-plus')
        const persistedCredentialAfterFailure = readFromFreshProcess()

        chmodSync(${JSON.stringify(credentialsDir)}, 0o700)
        await manager.deleteLlmCredentials('chatgpt-plus')
        const cachedCredentialAfterRetry = await manager.getLlmOAuth('chatgpt-plus')
        const persistedCredentialAfterRetry = readFromFreshProcess()

        console.log(JSON.stringify({
          deletionFailureSurfaced,
          cachedCredentialPreservedAfterFailure:
            cachedCredentialAfterFailure?.accessToken === 'persisted-before-failed-delete',
          persistedCredentialAfterFailure,
          cachedCredentialAbsentAfterRetry: cachedCredentialAfterRetry === null,
          persistedCredentialAfterRetry,
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
        throw new Error(`credential delete subprocess failed:\n${run.stderr.toString()}`)
      }

      expect(JSON.parse(run.stdout.toString().trim())).toEqual({
        deletionFailureSurfaced: true,
        cachedCredentialPreservedAfterFailure: true,
        persistedCredentialAfterFailure: true,
        cachedCredentialAbsentAfterRetry: true,
        persistedCredentialAfterRetry: false,
      })
    } finally {
      try {
        chmodSync(credentialsDir, 0o700)
      } catch {
        // File may already be absent/corrupt if the test failed before setup.
      }
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('preserves the prior snapshot when a post-open temp-file write fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexus-credential-atomic-write-'))
    const homeDir = join(root, 'home')
    const configDir = join(root, 'config')
    mkdirSync(homeDir, { recursive: true })
    mkdirSync(configDir, { recursive: true })

    try {
      const runner = `
        import { readdirSync } from 'node:fs'
        import { join } from 'node:path'
        const { SecureStorageBackend } = await import(${JSON.stringify(SECURE_STORAGE_MODULE)})
        const backend = new SecureStorageBackend()
        const originalId = { type: 'llm_oauth', connectionSlug: 'chatgpt-plus' }
        await backend.set(originalId, {
          value: 'persisted-before-short-write-' + 'x'.repeat(6000),
        })

        const failingSource = \`
          const { SecureStorageBackend } = await import(${JSON.stringify(SECURE_STORAGE_MODULE)})
          const backend = new SecureStorageBackend()
          await backend.set(
            { type: 'llm_oauth', connectionSlug: 'chatgpt-plus-2' },
            { value: 'new-write-' + 'y'.repeat(6000) },
          )
        \`
        const failedWrite = Bun.spawnSync([
          '/bin/zsh',
          '-c',
          'ulimit -f 1; exec "$1" --eval "$2"',
          'atomic-write-test',
          process.execPath,
          failingSource,
        ], {
          cwd: process.cwd(),
          env: process.env,
          stdout: 'pipe',
          stderr: 'pipe',
        })

        const freshReadSource = \`
          const { SecureStorageBackend } = await import(${JSON.stringify(SECURE_STORAGE_MODULE)})
          const backend = new SecureStorageBackend()
          const original = await backend.get({ type: 'llm_oauth', connectionSlug: 'chatgpt-plus' })
          const rejected = await backend.get({ type: 'llm_oauth', connectionSlug: 'chatgpt-plus-2' })
          console.log(JSON.stringify({
            originalPresent: original?.value.startsWith('persisted-before-short-write-') === true,
            rejectedPresent: rejected !== null,
          }))
        \`
        const freshRead = Bun.spawnSync([process.execPath, '--eval', freshReadSource], {
          cwd: process.cwd(),
          env: process.env,
          stdout: 'pipe',
          stderr: 'pipe',
        })
        if (freshRead.exitCode !== 0) throw new Error(freshRead.stderr.toString())

        const tempFiles = readdirSync(join(process.env.HOME, '.craft-agent'))
          .filter(name => name.endsWith('.tmp'))
        console.log(JSON.stringify({
          failedWriteExitedNonZero: failedWrite.exitCode !== 0,
          fresh: JSON.parse(freshRead.stdout.toString().trim()),
          tempFiles,
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
        throw new Error(`atomic credential write subprocess failed:\n${run.stderr.toString()}`)
      }

      expect(JSON.parse(run.stdout.toString().trim())).toEqual({
        failedWriteExitedNonZero: true,
        fresh: { originalPresent: true, rejectedPresent: false },
        tempFiles: [],
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not replace an unreadable existing snapshot with an empty store', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexus-credential-unreadable-store-'))
    const homeDir = join(root, 'home')
    const configDir = join(root, 'config')
    const credentialsFile = join(homeDir, '.craft-agent', 'credentials.enc')
    mkdirSync(homeDir, { recursive: true })
    mkdirSync(configDir, { recursive: true })

    try {
      const runner = `
        import { chmodSync } from 'node:fs'
        const { SecureStorageBackend } = await import(${JSON.stringify(SECURE_STORAGE_MODULE)})
        const originalId = { type: 'llm_oauth', connectionSlug: 'chatgpt-plus' }
        const rejectedId = { type: 'llm_oauth', connectionSlug: 'chatgpt-plus-2' }
        await new SecureStorageBackend().set(originalId, { value: 'preserved-original' })

        chmodSync(${JSON.stringify(credentialsFile)}, 0o000)
        const rejectedWrite = Bun.spawnSync([process.execPath, '--eval', \`
          const { SecureStorageBackend } = await import(${JSON.stringify(SECURE_STORAGE_MODULE)})
          await new SecureStorageBackend().set(
            { type: 'llm_oauth', connectionSlug: 'chatgpt-plus-2' },
            { value: 'must-not-replace-store' },
          )
        \`], {
          cwd: process.cwd(),
          env: process.env,
          stdout: 'pipe',
          stderr: 'pipe',
        })
        chmodSync(${JSON.stringify(credentialsFile)}, 0o600)

        const fresh = new SecureStorageBackend()
        const original = await fresh.get(originalId)
        const rejected = await fresh.get(rejectedId)
        console.log(JSON.stringify({
          rejectedWriteExitedNonZero: rejectedWrite.exitCode !== 0,
          originalValue: original?.value,
          rejectedPresent: rejected !== null,
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
        throw new Error(`unreadable credential snapshot subprocess failed:\n${run.stderr.toString()}`)
      }
      expect(JSON.parse(run.stdout.toString().trim())).toEqual({
        rejectedWriteExitedNonZero: true,
        originalValue: 'preserved-original',
        rejectedPresent: false,
      })
    } finally {
      try {
        chmodSync(credentialsFile, 0o600)
      } catch {
        // File may not exist if setup failed.
      }
      rmSync(root, { recursive: true, force: true })
    }
  })
})
