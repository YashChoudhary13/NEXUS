import { cancelLlmOAuthCredentialFlow } from '@craft-agent/shared/credentials'

let mutation: Promise<void> = Promise.resolve()
let generation = 0
let claimedExchangeGeneration: number | undefined
let flowConnectionSlug: string | undefined
let claimedCredentialFlow: { generation: number; connectionSlug: string; oauthEpoch: number } | undefined

function cancelClaimedCredentialFlow(): void {
  if (!claimedCredentialFlow) return
  cancelLlmOAuthCredentialFlow(
    claimedCredentialFlow.connectionSlug,
    claimedCredentialFlow.oauthEpoch,
  )
  claimedCredentialFlow = undefined
}

/** Serialize the small in-memory Claude OAuth lifecycle transitions. */
export async function withClaudeOAuthFlowMutation<T>(operation: () => Promise<T> | T): Promise<T> {
  const run = mutation.catch(() => undefined).then(operation)
  mutation = run.then(() => undefined, () => undefined)
  return run
}

/** Install a new PKCE flow and supersede every older exchange. */
export function beginClaudeOAuthFlow(connectionSlug: string): number {
  cancelClaimedCredentialFlow()
  generation += 1
  claimedExchangeGeneration = undefined
  flowConnectionSlug = connectionSlug
  return generation
}

/** Atomically claim the current PKCE flow for one token exchange. */
export function claimClaudeOAuthExchange(connectionSlug: string): number | undefined {
  if (flowConnectionSlug !== connectionSlug) return undefined
  if (claimedExchangeGeneration === generation) return undefined
  claimedExchangeGeneration = generation
  return generation
}

export function isClaudeOAuthExchangeCurrent(flowGeneration: number): boolean {
  return generation === flowGeneration && claimedExchangeGeneration === flowGeneration
}

/** Bind a claimed provider exchange to the slug credential epoch it blocks. */
export function registerClaudeOAuthCredentialFlow(
  flowGeneration: number,
  connectionSlug: string,
  oauthEpoch: number,
): boolean {
  if (
    !isClaudeOAuthExchangeCurrent(flowGeneration)
    || flowConnectionSlug !== connectionSlug
  ) return false
  claimedCredentialFlow = { generation: flowGeneration, connectionSlug, oauthEpoch }
  return true
}

export function releaseClaudeOAuthExchange(flowGeneration: number): void {
  if (claimedCredentialFlow?.generation === flowGeneration) {
    claimedCredentialFlow = undefined
  }
  if (claimedExchangeGeneration === flowGeneration) {
    claimedExchangeGeneration = undefined
    flowConnectionSlug = undefined
  }
}

export function isClaudeOAuthFlowForConnection(connectionSlug: string): boolean {
  return flowConnectionSlug === connectionSlug
}

/** Cancel the current PKCE flow and invalidate an in-flight exchange. */
export function cancelClaudeOAuthFlow(): number {
  cancelClaimedCredentialFlow()
  generation += 1
  claimedExchangeGeneration = undefined
  flowConnectionSlug = undefined
  return generation
}
