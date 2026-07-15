const mutationBySlug = new Map<string, Promise<void>>()
const bindingVersionBySlug = new Map<string, number>()

/**
 * Serialize config-row and credential mutations for one connection slug.
 *
 * OAuth network exchanges intentionally happen outside this boundary. Their
 * completion path captures a binding version before the exchange, then checks
 * it again inside this boundary before touching credentials.
 */
export async function withLlmConnectionMutation<T>(
  connectionSlug: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = mutationBySlug.get(connectionSlug) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(operation)
  const tracked = run.then(() => undefined, () => undefined)
  mutationBySlug.set(connectionSlug, tracked)

  try {
    return await run
  } finally {
    if (mutationBySlug.get(connectionSlug) === tracked) {
      mutationBySlug.delete(connectionSlug)
    }
  }
}

/** Capture the current in-process identity of a slug's provider binding. */
export function captureLlmConnectionBindingVersion(connectionSlug: string): number {
  return bindingVersionBySlug.get(connectionSlug) ?? 0
}

export function isLlmConnectionBindingVersionCurrent(
  connectionSlug: string,
  version: number,
): boolean {
  return captureLlmConnectionBindingVersion(connectionSlug) === version
}

/** Call inside `withLlmConnectionMutation` after create/delete/provider rebinding. */
export function bumpLlmConnectionBindingVersion(connectionSlug: string): number {
  const next = captureLlmConnectionBindingVersion(connectionSlug) + 1
  bindingVersionBySlug.set(connectionSlug, next)
  return next
}
