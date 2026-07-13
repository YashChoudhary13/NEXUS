# Account & Connection Model

**Status:** target model `[DECIDED]` (master plan); implementation `[PLANNED]` (Phase 1).
The "Upstream today" section is `[UPSTREAM]` fact.

## The four separated concepts `[DECIDED]`

NEXUS separates — in both the domain model and the UI (decision D-012):

```text
Provider: OpenAI / Codex          (which service)
Account:  Codex Builder           (which subscription/identity)
Model:    Selected Codex model    (which model that account offers)
Effort:   High                    (thinking/effort level)
```

**Account identity is not model identity** (engineering principle 3).

## Target account model `[PLANNED]`

```ts
interface AgentAccount {
  id: string
  connectionSlug: string
  provider: 'anthropic' | 'openai-codex' | 'api' | 'local'
  displayName: string
  email?: string
  providerAccountId?: string
  organizationId?: string
  roleLabel?: string
  authenticated: boolean
  lastValidatedAt?: number
}

interface AuthIdentity {
  provider: string
  accountId?: string
  email?: string
  organizationId?: string
  organizationName?: string
  verifiedAt: number
}
```

`AuthIdentity` must be **provider-neutral** — one normalized shape across Claude, Codex,
Copilot, and future OAuth providers, not per-provider UI logic.

Supported connections (target): multiple Claude subscriptions; multiple ChatGPT/Codex
subscriptions; Anthropic API; OpenAI API; OpenRouter & compatibles; GitHub Copilot; local
models; custom endpoints.

## Multi-account UX `[DECIDED]` target

- Each Codex login is an independent **named connection** (internal slugs like
  `chatgpt-plus-2` exist but the UI shows identity + role: "Codex Builder ·
  lakhira.studio@gmail.com · Connected").
- The model picker groups **provider → account → models** so hierarchy is unambiguous.
- **Duplicate-account protection** (D-013): warn when two saved connections resolve to the
  same underlying provider account — they share quota.
- **Safe agent switching** (D-014): the connection locks at first message; no credential
  hot-swap under an active session. Cross-agent continuation = **"Continue with another
  agent"** → preserved original session, linked child session bound to the chosen
  account/model, compact handoff package, back-link. Details:
  [`../plans/phase-1-multi-account-chat.md`](../plans/phase-1-multi-account-chat.md).

## Upstream today `[UPSTREAM]`

What the inherited code already provides (full audit:
[`craft-baseline.md`](./craft-baseline.md) §3):

- `LlmConnection` list with slugs, per-workspace/global defaults, and provider routing
  (`anthropic` | `pi` | `pi_compat`) — the structural home for accounts.
- **Anthropic OAuth identity capture already exists**: `oauthAccountUuid/Email`,
  `oauthOrganizationUuid/Name`, `oauthProfileVerifiedAt` persisted on the connection
  (`packages/shared/src/auth/claude-oauth.ts`). This is the pattern to generalize into
  `AuthIdentity`.
- ChatGPT/Codex OAuth flow implemented (`packages/shared/src/auth/chatgpt-oauth-config.ts`);
  GitHub Copilot device-code OAuth; PKCE throughout.
- Sessions already lock to a connection after the first message; Pi subprocess auth cannot be
  re-routed live (restart-required signature) — upstream mechanics already match D-014.
- Session branching/fork/transfer with handoff-summary injection exists (`SessionBundle`,
  branch seeds) — substrate for linked handoffs.
- Credential isolation per connection slug (encrypted store) — "credentials never cross
  connection boundaries" is already the storage model.

## Gaps Phase 1 must close `[PLANNED]`

1. Generalize identity capture beyond Anthropic (Codex/Copilot → `AuthIdentity`).
2. Surface identity (email/org/role) in connection UI and the model picker
   (`model-picker-helpers.ts` currently groups by connection and brands Pi as
   "Craft Agents Backend").
3. Duplicate-account resolution + warning.
4. Multi-login UX for same provider (⚠️ structurally supported via slugs; end-to-end multiple
   simultaneous Codex logins unverified — verify early in Phase 1).
5. "Continue with another agent" UX on top of the existing bundle/branch machinery.
6. ⚠️ **Persistence gotcha:** any new `LlmConnection` field must be added to the
   `updateLlmConnection` allowlist or it is dropped on next save (#838).
