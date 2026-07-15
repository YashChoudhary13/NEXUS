import { describe, expect, it } from 'bun:test'
import type { CredentialBackend } from '../backends/types.ts'
import { CredentialManager } from '../manager.ts'
import { credentialIdToAccount, type CredentialId, type StoredCredential } from '../types.ts'

class MemoryCredentialBackend implements CredentialBackend {
  readonly name = 'memory-test'
  readonly priority = 1
  readonly entries = new Map<string, StoredCredential>()
  failDelete = false

  async isAvailable(): Promise<boolean> {
    return true
  }

  async get(id: CredentialId): Promise<StoredCredential | null> {
    return this.entries.get(credentialIdToAccount(id)) ?? null
  }

  async set(id: CredentialId, credential: StoredCredential): Promise<void> {
    this.entries.set(credentialIdToAccount(id), credential)
  }

  async delete(id: CredentialId): Promise<boolean> {
    if (this.failDelete) throw new Error('fabricated delete failure')
    return this.entries.delete(credentialIdToAccount(id))
  }

  deleteSync(id: CredentialId): boolean {
    if (this.failDelete) throw new Error('fabricated sync delete failure')
    return this.entries.delete(credentialIdToAccount(id))
  }

  async list(): Promise<CredentialId[]> {
    return []
  }
}

function createManager(backend: MemoryCredentialBackend): CredentialManager {
  const manager = new CredentialManager()
  Object.assign(manager, {
    initialized: true,
    backends: [backend],
    writeBackend: backend,
  })
  return manager
}

describe('CredentialManager scoped deletion', () => {
  it('deletes only the OAuth credential for a shared LLM slug', async () => {
    const backend = new MemoryCredentialBackend()
    const manager = createManager(backend)
    const connectionSlug = 'claude-max-2'

    await manager.setLlmApiKey(connectionSlug, 'fabricated-api-key')
    await manager.setLlmOAuth(connectionSlug, { accessToken: 'fabricated-oauth-token' })
    await manager.setLlmIamCredentials(connectionSlug, {
      accessKeyId: 'fabricated-access-key-id',
      secretAccessKey: 'fabricated-secret-access-key',
    })
    await manager.setLlmServiceAccount(connectionSlug, {
      serviceAccountJson: '{"type":"service_account"}',
      email: 'service@example.test',
    })

    expect(await manager.deleteLlmOAuth(connectionSlug)).toBe(true)
    expect(await manager.getLlmOAuth(connectionSlug)).toBeNull()
    expect(await manager.getLlmApiKey(connectionSlug)).toBe('fabricated-api-key')
    expect((await manager.getLlmIamCredentials(connectionSlug))?.accessKeyId)
      .toBe('fabricated-access-key-id')
    expect((await manager.getLlmServiceAccount(connectionSlug))?.email)
      .toBe('service@example.test')
  })

  it('includes the exact credential account in async and sync deletion failures', async () => {
    const backend = new MemoryCredentialBackend()
    const manager = createManager(backend)
    const id: CredentialId = { type: 'llm_oauth', connectionSlug: 'claude-max-2' }
    backend.failDelete = true

    await expect(manager.delete(id)).rejects.toThrow(
      'Failed to persist credential deletion for llm_oauth::claude-max-2',
    )
    expect(() => manager.deleteSync(id)).toThrow(
      'Failed to persist credential deletion for llm_oauth::claude-max-2',
    )
  })
})
