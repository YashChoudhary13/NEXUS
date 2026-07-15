type LlmCredentialPhase = 'active' | 'oauth' | 'revoked'

interface LlmCredentialLifecycleState {
  epoch: number
  accessEpoch: number
  phase: LlmCredentialPhase
}

const lifecycleBySlug = new Map<string, LlmCredentialLifecycleState>()
const commitBySlug = new Map<string, Promise<void>>()

function currentState(connectionSlug: string): LlmCredentialLifecycleState {
  return lifecycleBySlug.get(connectionSlug) ?? { epoch: 0, accessEpoch: 0, phase: 'active' }
}

/** Start a new explicit OAuth login and invalidate every older flow/refresh. */
export function beginLlmOAuthCredentialFlow(connectionSlug: string): number {
  const current = currentState(connectionSlug)
  const epoch = current.epoch + 1
  // The old credential may continue serving already-authorized work while the
  // user is in the consent screen. Activation advances accessEpoch atomically.
  lifecycleBySlug.set(connectionSlug, { epoch, accessEpoch: current.accessEpoch, phase: 'oauth' })
  return epoch
}

export function isLlmOAuthCredentialFlowCurrent(connectionSlug: string, epoch: number): boolean {
  const state = currentState(connectionSlug)
  return state.epoch === epoch && state.phase === 'oauth'
}

/** Restore normal refresh behavior when a current OAuth attempt is cancelled/fails. */
export function cancelLlmOAuthCredentialFlow(connectionSlug: string, epoch: number): void {
  if (!isLlmOAuthCredentialFlowCurrent(connectionSlug, epoch)) return
  const current = currentState(connectionSlug)
  lifecycleBySlug.set(connectionSlug, { epoch, accessEpoch: current.accessEpoch, phase: 'active' })
}

/** Mark credentials from the current OAuth flow as the active slug credential. */
export function activateLlmOAuthCredentials(connectionSlug: string, epoch: number): boolean {
  if (!isLlmOAuthCredentialFlowCurrent(connectionSlug, epoch)) return false
  const current = currentState(connectionSlug)
  lifecycleBySlug.set(connectionSlug, {
    epoch,
    accessEpoch: current.accessEpoch + 1,
    phase: 'active',
  })
  return true
}

/** Invalidate all existing flows and refreshes before credential deletion. */
export function revokeLlmCredentials(connectionSlug: string): number {
  const current = currentState(connectionSlug)
  const epoch = current.epoch + 1
  lifecycleBySlug.set(connectionSlug, {
    epoch,
    accessEpoch: current.accessEpoch + 1,
    phase: 'revoked',
  })
  return epoch
}

/** Capture the generation a background refresh is allowed to update. */
export function captureLlmCredentialRefreshEpoch(connectionSlug: string): number | undefined {
  const state = currentState(connectionSlug)
  return state.phase === 'active' ? state.epoch : undefined
}

export function isLlmCredentialRefreshCurrent(connectionSlug: string, epoch: number): boolean {
  const state = currentState(connectionSlug)
  return state.epoch === epoch && state.phase === 'active'
}

/** Used by a pending identity receipt after its OAuth flow becomes active. */
export function isLlmCredentialEpochCurrent(connectionSlug: string, epoch: number): boolean {
  const state = currentState(connectionSlug)
  return state.epoch === epoch && state.phase === 'active'
}

/** Capture a generation allowed to load credentials into a new Codex runtime. */
export function captureLlmCredentialAccessEpoch(connectionSlug: string): number | undefined {
  const state = currentState(connectionSlug)
  return state.phase === 'revoked' ? undefined : state.accessEpoch
}

export function isLlmCredentialAccessCurrent(connectionSlug: string, epoch: number): boolean {
  const state = currentState(connectionSlug)
  return state.accessEpoch === epoch && state.phase !== 'revoked'
}

/**
 * Serialize credential-store commits per slug.
 *
 * Network exchanges happen before entering this gate. Every caller re-checks
 * its epoch inside the gate, so a logout or newer login can invalidate stale
 * work immediately while still guaranteeing deletion runs after an in-flight
 * encrypted-store write.
 */
export async function withLlmCredentialCommit<T>(
  connectionSlug: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = commitBySlug.get(connectionSlug) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(operation)
  const tracked = run.then(() => undefined, () => undefined)
  commitBySlug.set(connectionSlug, tracked)

  try {
    return await run
  } finally {
    if (commitBySlug.get(connectionSlug) === tracked) {
      commitBySlug.delete(connectionSlug)
    }
  }
}
