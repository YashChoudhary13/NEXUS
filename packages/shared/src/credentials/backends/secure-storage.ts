/**
 * Secure Storage Backend
 *
 * Stores credentials in an encrypted file at ~/.craft-agent/credentials.enc
 * Uses AES-256-GCM for authenticated encryption.
 *
 * Encryption key is derived from OS-native hardware UUID using PBKDF2:
 * - macOS: IOPlatformUUID (tied to logic board, never changes)
 * - Windows: MachineGuid from registry (set at OS install)
 * - Linux: /var/lib/dbus/machine-id (set at OS install)
 *
 * This is more stable than the previous hostname-based derivation, which could
 * change with network/DHCP. Legacy credentials are auto-migrated on first load.
 *
 * File format:
 *   [Header - 64 bytes]
 *   ├── Magic: "CRAFT01\0" (8 bytes)
 *   ├── Flags: uint32 LE (4 bytes) - reserved for future use
 *   ├── Salt: 32 bytes (PBKDF2 salt)
 *   ├── Reserved: 20 bytes
 *   [Encrypted Payload]
 *   ├── IV: 12 bytes (random per write)
 *   ├── Auth Tag: 16 bytes (GCM authentication)
 *   └── Ciphertext: variable (encrypted JSON)
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  pbkdf2Sync,
  createHash,
} from 'crypto';
import { execSync } from 'child_process';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { hostname, userInfo, homedir } from 'os';
import { join, dirname } from 'path';

import type { CredentialBackend } from './types.ts';
import type { CredentialId, StoredCredential } from '../types.ts';
import { credentialIdToAccount, accountToCredentialId } from '../types.ts';

// File location
const CREDENTIALS_DIR = join(homedir(), '.craft-agent');
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, 'credentials.enc');

// File format constants
const MAGIC_BYTES = Buffer.from('CRAFT01\0');
const HEADER_SIZE = 64;
const MAGIC_SIZE = 8;
const FLAGS_SIZE = 4;
const SALT_SIZE = 32;
const IV_SIZE = 12;
const AUTH_TAG_SIZE = 16;
const KEY_SIZE = 32;

// PBKDF2 iterations (balance security vs startup time)
const PBKDF2_ITERATIONS = 100000;

/**
 * Get stable machine identifier using OS-native hardware UUID.
 * This is far more stable than hostname which can change with network/DHCP.
 * Falls back to username + homedir if hardware UUID unavailable.
 */
function getStableMachineId(): string {
  try {
    if (process.platform === 'darwin') {
      // macOS: IOPlatformUUID - tied to logic board, never changes
      const output = execSync(
        'ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID',
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (match?.[1]) return match[1];
    } else if (process.platform === 'win32') {
      // Windows: MachineGuid from registry - set at OS install
      const output = execSync(
        'reg query HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid',
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const match = output.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
      if (match?.[1]) return match[1];
    } else {
      // Linux: dbus machine-id - set at OS install
      const machineIdPath = '/var/lib/dbus/machine-id';
      const altPath = '/etc/machine-id';
      if (existsSync(machineIdPath)) {
        return readFileSync(machineIdPath, 'utf-8').trim();
      } else if (existsSync(altPath)) {
        return readFileSync(altPath, 'utf-8').trim();
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: username + homedir (stable enough for most cases)
  return `${userInfo().username}:${homedir()}`;
}

/** Internal credential store structure */
interface CredentialStore {
  version: 1;
  credentials: Record<string, StoredCredential>;
  metadata: {
    createdAt: number;
    updatedAt: number;
  };
}

export class SecureStorageBackend implements CredentialBackend {
  readonly name = 'secure-storage';
  readonly priority = 100;

  // The encrypted file is one whole-store document shared by every slug. A
  // per-slug lock cannot prevent stale cross-slug snapshots from overwriting
  // each other, so all async mutations serialize process-wide.
  private static mutationQueue: Promise<void> = Promise.resolve();
  private static mutationVersion = 0;
  private static pendingAsyncMutations = 0;

  private cachedStore: CredentialStore | null = null;
  private encryptionKey: Buffer | null = null;
  private salt: Buffer | null = null;
  private loadedMutationVersion = -1;

  private static async withMutation<T>(operation: () => T): Promise<T> {
    SecureStorageBackend.pendingAsyncMutations += 1;
    const previous = SecureStorageBackend.mutationQueue;
    const run = previous.catch(() => undefined).then(operation);
    const tracked = run.then(() => undefined, () => undefined);
    SecureStorageBackend.mutationQueue = tracked;
    try {
      return await run;
    } finally {
      SecureStorageBackend.pendingAsyncMutations -= 1;
    }
  }

  async isAvailable(): Promise<boolean> {
    // File backend is always available - we can always write to filesystem
    return true;
  }

  async get(id: CredentialId): Promise<StoredCredential | null> {
    const store = await this.loadStore();
    if (!store) return null;

    const key = credentialIdToAccount(id);
    return store.credentials[key] || null;
  }

  async set(id: CredentialId, credential: StoredCredential): Promise<void> {
    await SecureStorageBackend.withMutation(() => {
      const store = this.loadStoreSync();
      const nextStore: CredentialStore = store
        ? {
            ...store,
            credentials: { ...store.credentials },
            metadata: { ...store.metadata },
          }
        : {
          version: 1,
          credentials: {},
          metadata: {
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        };

      const key = credentialIdToAccount(id);
      nextStore.credentials[key] = credential;
      nextStore.metadata.updatedAt = Date.now();

      // Mutate the in-memory cache only after the encrypted file write succeeds.
      this.saveStoreSync(nextStore);
    });
  }

  async delete(id: CredentialId): Promise<boolean> {
    return SecureStorageBackend.withMutation(() => this.deleteSyncUnlocked(id));
  }

  deleteSync(id: CredentialId): boolean {
    if (SecureStorageBackend.pendingAsyncMutations > 0) {
      throw new Error('Cannot synchronously delete credentials while an async store mutation is pending');
    }
    return this.deleteSyncUnlocked(id);
  }

  private deleteSyncUnlocked(id: CredentialId): boolean {
    const store = this.loadStoreSync();
    if (!store) return false;

    const key = credentialIdToAccount(id);
    if (!(key in store.credentials)) return false;

    const nextStore: CredentialStore = {
      ...store,
      credentials: { ...store.credentials },
      metadata: { ...store.metadata, updatedAt: Date.now() },
    };
    delete nextStore.credentials[key];

    // Keep the cached credential intact if persistence fails. Callers can then
    // surface a real logout failure and retry instead of claiming success while
    // the old encrypted token remains on disk.
    this.saveStoreSync(nextStore);
    return true;
  }

  async list(filter?: Partial<CredentialId>): Promise<CredentialId[]> {
    const store = await this.loadStore();
    if (!store) return [];

    const ids = Object.keys(store.credentials)
      .map(accountToCredentialId)
      .filter((id): id is CredentialId => id !== null);

    if (!filter) return ids;

    return ids.filter((id) => {
      if (filter.type && id.type !== filter.type) return false;
      if (filter.workspaceId && id.workspaceId !== filter.workspaceId) return false;
      if (filter.name && id.name !== filter.name) return false;
      return true;
    });
  }

  // ============================================================
  // Private Methods
  // ============================================================

  private async loadStore(): Promise<CredentialStore | null> {
    return this.loadStoreSync();
  }

  private loadStoreSync(): CredentialStore | null {
    // Return cached store if available
    if (
      this.cachedStore
      && this.loadedMutationVersion === SecureStorageBackend.mutationVersion
    ) return this.cachedStore;

    // Another backend instance may have committed the shared file.
    if (this.loadedMutationVersion !== SecureStorageBackend.mutationVersion) {
      this.cachedStore = null;
      this.salt = null;
      this.encryptionKey = null;
    }

    if (!existsSync(CREDENTIALS_FILE)) return null;

    let fileData: Buffer;
    try {
      fileData = readFileSync(CREDENTIALS_FILE);
    } catch (error) {
      // A missing file is an empty first-run store. Permission/I/O failures on
      // an existing whole-store snapshot must propagate; treating them as
      // empty would let the next mutation atomically erase every credential.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }

    // Validate minimum size
    if (fileData.length < HEADER_SIZE + IV_SIZE + AUTH_TAG_SIZE) {
      // File is corrupted, delete and return null
      this.handleCorruptedFile();
      return null;
    }

    // Validate magic bytes
    if (!fileData.subarray(0, MAGIC_SIZE).equals(MAGIC_BYTES)) {
      this.handleCorruptedFile();
      return null;
    }

    // Parse header
    // const flags = fileData.readUInt32LE(MAGIC_SIZE); // Reserved for future use
    const salt = fileData.subarray(MAGIC_SIZE + FLAGS_SIZE, MAGIC_SIZE + FLAGS_SIZE + SALT_SIZE);
    this.salt = salt;

    // Extract encrypted data
    const encryptedData = fileData.subarray(HEADER_SIZE);

    // Try new stable key first (v2 - hardware UUID based)
    const newKey = this.getEncryptionKey(salt);
    let store = this.tryDecrypt(encryptedData, newKey);

    if (store) {
      this.cachedStore = store;
      this.loadedMutationVersion = SecureStorageBackend.mutationVersion;
      return store;
    }

    // Try legacy key for migration (v1 - included hostname)
    // This handles credentials encrypted with old key derivation
    const legacyKey = this.getLegacyEncryptionKey(salt);
    store = this.tryDecrypt(encryptedData, legacyKey);

    if (store) {
      // Migration: re-save with new stable key so future loads use hardware UUID
      this.cachedStore = store;
      this.saveStoreSync(store);
      return store;
    }

    // Both keys failed - file is truly corrupted
    this.handleCorruptedFile();
    return null;
  }

  /**
   * Attempt to decrypt data with given key.
   * Returns parsed store on success, null on failure.
   */
  private tryDecrypt(encryptedData: Buffer, key: Buffer): CredentialStore | null {
    try {
      const iv = encryptedData.subarray(0, IV_SIZE);
      const authTag = encryptedData.subarray(IV_SIZE, IV_SIZE + AUTH_TAG_SIZE);
      const ciphertext = encryptedData.subarray(IV_SIZE + AUTH_TAG_SIZE);

      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(decrypted.toString('utf8'));
    } catch {
      return null;
    }
  }

  private async saveStore(store: CredentialStore): Promise<void> {
    this.saveStoreSync(store);
  }

  private saveStoreSync(store: CredentialStore): void {
    // Ensure directory exists
    if (!existsSync(CREDENTIALS_DIR)) {
      mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
    }

    // Use existing salt or generate new one
    const salt = this.salt || randomBytes(SALT_SIZE);
    this.salt = salt;

    // Get encryption key
    const key = this.getEncryptionKey(salt);

    // Serialize payload
    const plaintext = Buffer.from(JSON.stringify(store), 'utf8');

    // Generate new IV for each write (critical for GCM security)
    const iv = randomBytes(IV_SIZE);

    // Encrypt
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Build header
    const header = Buffer.alloc(HEADER_SIZE);
    MAGIC_BYTES.copy(header, 0);
    header.writeUInt32LE(0, MAGIC_SIZE); // Flags (reserved)
    salt.copy(header, MAGIC_SIZE + FLAGS_SIZE);

    // Combine all parts
    const fileData = Buffer.concat([header, iv, authTag, ciphertext]);

    // Never open the only durable snapshot with truncation semantics. Write a
    // same-directory 0600 temp file, flush it, then atomically replace the
    // target. A short write, ENOSPC, or process failure leaves the prior store
    // readable on restart.
    const tempFile = join(
      CREDENTIALS_DIR,
      `.credentials.enc.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
    );
    try {
      writeFileSync(tempFile, fileData, { mode: 0o600, flag: 'wx' });
      const tempFd = openSync(tempFile, 'r');
      try {
        fsyncSync(tempFd);
      } finally {
        closeSync(tempFd);
      }
      renameSync(tempFile, CREDENTIALS_FILE);

      // Best-effort directory flush makes the rename durable across power loss
      // where the platform permits fsync on directory descriptors.
      try {
        const directoryFd = openSync(CREDENTIALS_DIR, 'r');
        try {
          fsyncSync(directoryFd);
        } finally {
          closeSync(directoryFd);
        }
      } catch {
        // Some platforms (notably Windows) do not allow directory fsync.
      }
    } catch (error) {
      try {
        if (existsSync(tempFile)) unlinkSync(tempFile);
      } catch {
        // Preserve the original persistence failure.
      }
      throw error;
    }
    SecureStorageBackend.mutationVersion += 1;
    this.loadedMutationVersion = SecureStorageBackend.mutationVersion;
    this.cachedStore = store;
  }

  private getEncryptionKey(salt: Buffer): Buffer {
    if (this.encryptionKey) return this.encryptionKey;

    // New stable machine ID using hardware UUID (v2)
    // This is far more stable than hostname which can change with network/DHCP
    const stableMachineId = createHash('sha256')
      .update(getStableMachineId())
      .update('craft-agent-v2') // Bumped version for new key derivation
      .digest();

    // Derive key using PBKDF2
    this.encryptionKey = pbkdf2Sync(stableMachineId, salt, PBKDF2_ITERATIONS, KEY_SIZE, 'sha256');

    return this.encryptionKey;
  }

  /**
   * Legacy key derivation for migration from v1 (included hostname).
   * Used to decrypt credentials from older versions before re-encrypting with stable key.
   */
  private getLegacyEncryptionKey(salt: Buffer): Buffer {
    const legacyMachineId = createHash('sha256')
      .update(hostname())
      .update(userInfo().username)
      .update(homedir())
      .update('craft-agent-v1')
      .digest();

    return pbkdf2Sync(legacyMachineId, salt, PBKDF2_ITERATIONS, KEY_SIZE, 'sha256');
  }

  private handleCorruptedFile(): void {
    // Delete corrupted file - user will need to re-enter credentials
    try {
      if (existsSync(CREDENTIALS_FILE)) {
        unlinkSync(CREDENTIALS_FILE);
      }
    } catch {
      // Ignore deletion errors
    }
    this.cachedStore = null;
    this.encryptionKey = null;
    SecureStorageBackend.mutationVersion += 1;
    this.loadedMutationVersion = SecureStorageBackend.mutationVersion;
    this.salt = null;
  }

  /** Clear cached data (for testing or forced refresh) */
  clearCache(): void {
    this.cachedStore = null;
    this.encryptionKey = null;
    this.salt = null;
  }
}
