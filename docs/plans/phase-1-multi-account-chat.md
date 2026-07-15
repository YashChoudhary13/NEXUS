# Phase 1 — Chat and Multi-Account Foundation (detailed implementation plan)

**Objective:** make the existing Craft Agents chat experience work naturally with multiple
Claude and Codex subscription identities.
**Status:** `[DECIDED]` — **the plan was signed off by the owner 2026-07-14; Phase 1 itself is
not complete**. §8 questions were answered (D-020…D-023), implementation was authorized and delegated via the
[Codex kickoff prompt](./phase-1-kickoff-prompt-codex.md). Implementation begins with the
S1 spike, which **passed its PR-1A engineering gate on 2026-07-14**. PR-1A is implemented and
locally verified on `feature/account-identity`; review/merge into `develop` is still pending.
PR-1B through PR-1F remain unimplemented, no Phase 1 feature branch has merged, and the overall
phase acceptance criterion for independently billed subscriptions remains `[OPEN]`. Baseline
references were verified against `4289b16`.

> Path note: the master plan referenced `docs/superpowers/plans/…`; per the roadmap decision
> this repo keeps phase plans here in `docs/plans/`.

---

## 1. Verified upstream foundation (why this phase is low-risk)

Investigation (2026-07-14) found that upstream already ships **most of the machinery**, built
for Claude only. Phase 1 is a *generalization*, not greenfield:

| Master-plan requirement | What already exists `[UPSTREAM]` | Gap |
|---|---|---|
| Identity fields on connections | `LlmConnection.oauthAccountUuid/Email`, `oauthOrganizationUuid/Name`, `oauthProfileVerifiedAt` (`packages/shared/src/config/llm-connections.ts:192-200`, added for upstream issue #838) | None — reuse as-is |
| Identity persisted safely | `updateLlmConnection` allowlist already includes all five fields (`packages/shared/src/config/storage.ts:2704-2708`) | None |
| Identity captured at login | **Claude only**: `parseClaudeOAuthIdentity` (`packages/shared/src/auth/claude-oauth.ts:59-67,272`) → threaded through `SETUP_LLM_CONNECTION` (`packages/server-core/src/handlers/rpc/llm-connections.ts:159-174`) | **Codex/Copilot don't populate it** |
| Codex identity data available | ChatGPT OAuth already requests `id_token_add_organizations: 'true'` (`packages/shared/src/auth/chatgpt-oauth.ts:82`) and **persists the identity-bearing JWT `idToken`** in the credential store (`rpc/llm-connections.ts:683-688`) | JWT is never decoded/displayed |
| Identity shown in UI | `AiSettingsPage.tsx:287-288` renders `email · org` line for OAuth connections | Works for any connection once fields are stamped |
| **Duplicate-account warning** | **Already implemented for Claude**: `duplicateAccountUuids` computed at `AiSettingsPage.tsx:953`, row-flagged via `isDuplicateAccount` at `:1138` | Generalize key + copy for Codex |
| Multiple same-provider connections | `createBuiltInConnection` **already supports suffixed slugs**: `'chatgpt-plus-2'` → base template + display name "… 2" (`packages/server-core/src/domain/connection-setup-logic.ts:208-236`). The generic Add Connection UI already calls `resolveSlugForMethod`, which mints the next free suffix (`apps/electron/src/renderer/hooks/useOnboarding.ts:93-121`), and credentials are slug-scoped (`llm_oauth::{connectionSlug}`). | End-to-end two-account login/chat/restart remains the S1 validation; the earlier claim that the UI hardcoded one slug was incorrect. |
| Account display names / roles | `LlmConnection.name` is free text and the Settings connection-row menu already exposes Rename (`apps/electron/src/renderer/pages/settings/AiSettingsPage.tsx:770-804`) — "Codex Builder" is just a renamed connection | `[OPEN]` Decide after S1 whether PR-1B needs only clearer provider-specific wording/placement or can be reduced further. |
| Connection locked per session | `resolveEffectiveConnectionSlug` + session lock after first message (`llm-connections.ts:670-693`); Pi subprocess auth can't be hot-swapped (restart-required signature) | None — matches D-014 by construction |
| Session forking for handoffs | Dispatch `mode: 'move' | 'fork'` exists (`packages/server-core/src/handlers/rpc/sessions.ts:557`); `SessionBundle` carries `BundleBranchInfo` (`sdkSessionId` + `sdkTurnId` branch point, `packages/shared/src/sessions/bundle.ts:44-73`); transfer already injects one-shot hidden **handoff summaries** on the destination's first turn | Wire into an in-workspace "Continue with another agent" action with account/model rebinding |
| Account-aware picker | Picker groups by provider only: Anthropic / Local / "Craft Agents Backend" (`model-picker-helpers.ts:36-55`) | Add the account tier |

**Design consequence (proposed):** the master plan's `AgentAccount` / `AuthIdentity`
interfaces become **derived view-models in the renderer**, not new stored schemas. Stored
state stays exactly the existing five `oauth*` fields + `name` — zero config migration and
zero upstream-merge friction. (`AuthIdentity.accountId` ⇢ `oauthAccountUuid` (Claude uuid /
Codex namespaced `chatgpt_user_id`, then `user_id`, then JWT `sub`), `email` ⇢
`oauthAccountEmail`, `organization*` ⇢ `oauthOrganization*`, `verifiedAt` ⇢
`oauthProfileVerifiedAt`, `roleLabel`/`displayName` ⇢ `name`.)

## 2. Sequencing

```text
S1 spike (1 day)  →  PR-1A identity capture  →  PR-1B multi-account UX
                                              →  PR-1C duplicate detection   (after 1A)
                                              →  PR-1D account-aware picker  (parallel w/ 1C)
                                              →  PR-1F Copilot identity      (after 1A, parallel w/ 1B–1D)
                                              →  PR-1E continue-with-another-agent (last)
```

One concern per PR (working agreement 6). Each lands independently useful.

### S1 — De-risking spike (no merge; throwaway branch)

The single unverified assumption: **two simultaneous Codex logins end-to-end**.

1. Use Settings → AI → Add Connection → ChatGPT. The existing unique-slug resolver creates
   `chatgpt-plus-2`; the owner logs in with account #2 through the normal OAuth UI. Raw
   one-shot CLI `invoke` calls are not used because OAuth completion is bound to the same
   persistent RPC client that started the flow.
2. Verify: both connections listed with independent auth status; sessions run on each;
   restart restores both; decode the stored `idToken` by hand and confirm claim shape
   (`email`, `sub`, org claims) matches expectations.
3. Record findings (claim names!) in this doc before PR-1A review.

Exit criterion: both accounts chat successfully in one app run. If OpenAI's flow breaks a
second login (e.g., token endpoint quirks), Phase 1 scope is re-planned before any code.

#### S1 findings — PASS for the PR-1A engineering gate `[UPSTREAM]` (2026-07-14)

- Environment: throwaway branch `spike/s1-multi-codex`, Bun 1.3.10, app launched with a
  scratch `CRAFT_CONFIG_DIR`. Source tree remains unchanged.
- Both normal UI flows (`chatgpt-plus` and `chatgpt-plus-2`) passed OAuth exchange,
  credential persistence, model refresh, auth reinitialization, and built-in validation.
  The provider accepted both simultaneous logins. Before restart, one session locked to each
  slug also completed a real assistant response.
- Redacted real `id_token` shape for both logins (claim names and equality/presence facts
  only; no token or identity values were logged): top-level identity claims include `email`
  and `sub`. The namespaced `https://api.openai.com/auth` object exposes
  `chatgpt_account_id`, `chatgpt_plan_type`, `chatgpt_subscription_active_start`,
  `chatgpt_subscription_active_until`, `chatgpt_subscription_last_checked`,
  `chatgpt_user_id`, `groups`, `localhost`, `organizations`, and `user_id`. Organization
  entries expose `id`, `is_default`, `role`, and `title`.
- Supporting access-token shape: the same auth namespace exposes `chatgpt_account_id`,
  `chatgpt_account_user_id`, `chatgpt_compute_residency`, `chatgpt_plan_type`,
  `chatgpt_user_id`, `localhost`, `poid`, and `user_id`. The runtime sends
  `chatgpt_account_id` as its routing header.
- Different-identity comparison: the two tokens, top-level subjects/emails,
  `chatgpt_user_id`, access-token `chatgpt_account_user_id`, and namespaced `user_id` values
  are distinct, and the organization-id sets do not overlap. Within each login, ID- and
  access-token `chatgpt_account_id` agree; across the two logins that routing-level ID is the
  same. OpenAI's Codex token parser identifies `chatgpt_user_id` as the user identifier and
  `chatgpt_account_id` as the organization/workspace identifier. The observed result is
  therefore two distinct user principals in one selected runtime workspace, not a duplicate
  human account. `[OPEN]` Owner confirmation is still required on whether the logins are
  separately billed subscriptions or separate seats/users in that shared workspace.
- Isolation caveat: `CRAFT_CONFIG_DIR` does **not** relocate the inherited encrypted
  credential file; `SecureStorageBackend` still uses `~/.craft-agent/credentials.enc`.
  Connection config is scratch-scoped, credentials are not. Cleanup is owner-confirmed only.
- Restart verdict: after a clean shutdown and relaunch with the same config, both connection
  rows and both original session records were restored with their exact slug bindings and
  `connectionLocked: true`; the encrypted-copy check still found both slug-scoped
  credentials. The two live chats had already passed in the pre-restart run, satisfying S1's
  stated provider/chat exit criterion. A second post-restart inference was not required to
  start provider-neutral identity capture.
- **S1 verdict: PASS for PR-1A.** OpenAI accepted two simultaneous OAuth logins, credentials
  remained slug-scoped, two distinct user principals chatted successfully, and restart
  restored both connections/sessions. `[OPEN]` The master Phase 1 criterion saying “two
  different Codex subscriptions” is not yet proven as a billing fact because both principals
  selected the same runtime workspace; resolve that acceptance wording or rerun with two
  independently routed subscriptions before Phase 1 closes. This caveat does not block the
  provider-neutral identity parser that is needed to expose the distinction correctly.

## 3. Work packages

### PR-1A — Provider-neutral identity capture (Codex first)

**Change:** decode the ChatGPT `id_token` JWT at OAuth completion and stamp the existing
connection identity fields through the provider-neutral setup pipeline.

- **New** `packages/shared/src/auth/oauth-identity.ts`:
  `decodeJwtClaims(idToken)` (base64url payload decode — no signature verification needed;
  the token arrives directly from the provider's token endpoint over TLS) +
  `parseChatGptIdentity(claims)` → account principal UUID from namespaced
  `chatgpt_user_id`, then namespaced `user_id`, then top-level `sub`; email from top-level
  `email`, then the namespaced profile email; workspace UUID from namespaced
  `chatgpt_account_id`. Do not use the workspace ID as the human account UUID and do not
  infer organization data from the uncorrelated `organizations` array. Mirror
  `parseClaudeOAuthIdentity`'s fail-soft contract: never throw, never block login.
- Generalize the existing `ClaudeOAuthIdentityDto` shape to `OAuthIdentityDto` (keep a
  compatibility alias), but keep **ChatGPT identity server-side**. `COMPLETE_OAUTH` never
  returns identity/claims to the renderer. For a first-time slug it stores one short-lived,
  generation-bound receipt keyed by the slug and completing client; SETUP consumes that
  receipt. For an existing slug COMPLETE updates identity directly. Credentials and identity
  therefore share one per-slug OAuth generation across all RPC clients.
- Canonical ChatGPT slug provenance controls this server-owned path; mutable connection
  metadata cannot switch it into the legacy client-authored Claude branch. Generic SAVE
  strips all identity fields and cannot rewrite provider/auth provenance on an existing
  connection.
- Fresh identity atomically replaces all five stored fields, so reauth cannot combine a new
  principal with stale optional workspace/email fields. A successful explicit reauth whose
  ID token is missing/malformed stays authentication-successful but **clears** the old display
  identity rather than claiming the previous account. By contrast, a background refresh that
  simply omits a new `id_token` preserves the last profile and stored ID token.
- Re-stamp the matching connection when the ChatGPT refresh path receives a new `id_token`
  (`packages/shared/src/agent/pi-agent.ts`); a missing/malformed refreshed identity never
  turns a successful token refresh into an auth failure.
- Fence OAuth completion, refresh, logout, and deletion with a per-slug credential epoch plus
  serialized credential-store commits. Logout revokes the epoch first, purges every client's
  pending flow/receipt for the slug, disposes exact-slug live runtimes, then deletes credentials;
  an older flow or in-flight refresh cannot recreate them afterward.
- Serialize encrypted-store mutations across the **whole credential file**, not only one slug.
  Each mutation reloads the latest durable snapshot before replacing the AES-GCM file, so a
  concurrent write for slug B cannot resurrect a deleted slug A. Persistence failures propagate
  to the RPC boundary without poisoning the in-memory cache; logout keeps identity attached and
  generic DELETE keeps the connection row as a retry handle until credential deletion is durable.
- Reserve canonical `chatgpt-plus[-N]` rows and the `openai-codex` provider for the server OAuth
  flow. Generic SAVE cannot create them, and SETUP cannot transition a generic OAuth row into
  them. Claude and GitHub Copilot OAuth handlers independently validate their own canonical or
  stored provider provenance before reading or mutating a slug, closing cross-provider account
  binding/deletion paths.
- Keep the inherited duplicate-account warning restricted to Anthropic OAuth until PR-1C
  defines Codex principal/workspace quota semantics; shared provider-neutral fields alone are
  not a safe duplicate key.
- **Out of scope for this PR:** Copilot identity — in Phase 1 per D-020, but as its own
  package ([PR-1F](#pr-1f--copilot-identity-capture-d-020), different mechanism). Claude's
  existing identity semantics remain unchanged; shared OAuth target, endpoint-ownership,
  credential-isolation, and stale-flow race boundaries are hardened for Claude and Copilot too.

**Tests:** `bun run test:account-identity` is CI-invoked through `validate:dev`. It covers
fabricated JWT parsing and precedence; two principals sharing one workspace; first-time and
reauth persistence; atomic field clearing; cross-client/cross-slug spoof attempts; immutable
provider provenance; rejected generic-to-reserved transitions; rejected Claude/Copilot targeting
of a ChatGPT slug; controlled COMPLETE/SETUP interleaving; queued first-time setup versus
`updateOnly`; logout of pending and in-flight flows;
exact-slug runtime disposal; deferred refresh-vs-logout and credential-read-vs-revoke races;
whole-store cross-slug mutation ordering; atomic replacement and unreadable-snapshot handling;
durable failure/retry behavior across process restart;
renderer refusal to transport ChatGPT identity; and Anthropic-only duplicate-warning semantics.

**Verified 2026-07-15 with Bun 1.3.10:** the account suite passed **94 tests / 413 assertions**,
then the exact-slug invalidation filter passed **1 test / 5 assertions** (95 tests and 418
assertions total, zero failures). Full shared tests passed **3,015 / 0 failed / 12 skipped**;
shared, server-core, Electron, and web UI typechecks passed; and the complete Electron build
(main, preload, renderer, resources, assets) passed. The inherited missing
`tsconfig.base.json` warning remains unchanged. Full server-core adds ten passing tests and
retains the same one inherited order-dependent test failure reproduced on clean `develop`.
Exact commands and inherited gate failures are recorded in
[`testing-and-quality-gates.md`](../development/testing-and-quality-gates.md).
**DoD:** after a Codex login, `AiSettingsPage` shows the account email with **zero UI code
changes to visible components** (the `:287` identity line just lights up; renderer/preload
data plumbing is required).

### PR-1B — Multi-account connections UX

**Change:** make the already-working second/third same-provider login and connection naming
behavior explicit and discoverable in Settings.

- Reuse and harden the existing `resolveSlugForMethod` suffix resolver
  (`chatgpt-plus` → `chatgpt-plus-2` → `-3`; same for `claude-max`/Copilot slugs). S1 proved
  that generic Add Connection already calls it and that the server resolves suffixed
  built-in templates correctly; this PR does not reinvent that path.
- `AiSettingsPage.tsx`: "Add another account" action on OAuth provider rows → runs the
  existing OAuth setup flow against the minted slug (the flow is already slug-parameterized
  end-to-end). Keep the existing row-menu Rename behavior, adjusting placement/copy only if
  needed to make per-account connection names understandable.
- Onboarding behavior is unchanged except any extraction needed to unit-test the existing
  resolver thoroughly; there is no hardcoded one-account ChatGPT slug to replace.
- i18n: new keys in **all 6 locales** (`settings.ai.addAnotherAccount`, etc.), parity+sorted
  lints enforce.

**Tests:** slug-minting unit tests (gaps, deletions, double-digit); manual matrix from S1
rerun on the real UI.
**DoD:** master-plan criteria "two different Codex subscriptions authenticated
simultaneously" + "restart restores accounts" pass through the UI alone.

### PR-1C — Duplicate-account detection, generalized

**Change:** extend the existing Claude-only duplicate computation to all OAuth connections.

- Extract the `:953` logic into a shared helper
  `findDuplicateAccountGroups(connections)` keyed by
  provider family + user principal (`oauthAccountUuid || oauthAccountEmail`) + runtime
  workspace (`oauthOrganizationUuid` where available), so two users in one workspace and one
  user in two distinct workspaces are not conflated. Provider family distinguishes Anthropic
  vs OpenAI/Codex vs Copilot (never cross-family). Unit-test the helper (same principal and
  workspace under two slugs → flagged; different principals → not; distinct workspaces →
  not; missing identity → never flagged).
- Warning UI: reuse the existing `isDuplicateAccount` row treatment; add the master plan's
  explanatory copy as a tooltip/banner: the connections authenticate the same signed-in user
  and runtime workspace and **may** share usage limits (claim equality alone does not prove a
  billing/quota boundary). Also surface it once at setup completion when a new login resolves
  to the same principal and workspace.
- i18n keys ×6 locales.

**DoD:** logging into the same OpenAI account under two connection names produces the
warning; two genuinely different accounts do not.

### PR-1D — Account-aware model picker

**Change:** picker hierarchy provider → **account** → models.

- `model-picker-helpers.ts`: replace flat `groupConnectionsByProvider` output with
  `provider → [{ connection, identityLine }]`; each connection contributes its own model
  list (already per-connection via `connection.models`). Identity line = `name` +
  `oauthAccountEmail` when present.
- Update the two consumers (desktop dropdown + compact drawer picker — locate via existing
  imports of the helper) and the session-new flow so selecting account then model matches
  the master plan's interaction model (Provider / Account / Model / Effort — effort selector
  already exists as thinking-level).
- **D-021:** the "Craft Agents Backend" group label does **not** survive this PR — the
  account-tier rework replaces it (most plausibly dissolving into per-provider account groups;
  exact replacement copy approved at PR-1D review) ×6 locales. Deliberate bounded carve-out
  from the otherwise-deferred UI-copy workstream (D-007).

**Tests:** helper unit tests (multi-account grouping, single-account unchanged rendering);
`ipc-channels` and typecheck gates.
**DoD:** with 1 Claude + 2 Codex connections, the picker shows three account entries under
two providers, each with its own models; "a new session can choose any account/model
combination".

### PR-1F — Copilot identity capture (D-020)

**Change:** populate the same connection identity fields for GitHub Copilot connections.

- Mechanism differs from PR-1A: Copilot OAuth yields a GitHub token, not an identity JWT —
  resolve identity via a GitHub user lookup (`/user`, plus org where available) at OAuth
  completion. ⚠️ Exact token audience/scopes unverified — the PR starts with its own
  mini-verification against a real Copilot login before code review. Fail-soft like the other
  parsers: identity absent must never break login.
- Same persistence path as PR-1A (`updateLlmConnection` guarded assignments); **no new stored
  fields**. Re-stamp on token refresh where applicable.
- Duplicate detection needs no extra work: PR-1C's family-scoped key already covers Copilot.

**Tests:** lookup/parse unit tests with fabricated API responses (happy path, missing email,
API error → `undefined`, never-throws); no live GitHub calls in CI.
**DoD:** a Copilot connection row shows its GitHub identity on the `AiSettingsPage` identity
line; duplicate Copilot logins are flagged by the PR-1C machinery.
**Sequencing:** any time after PR-1A (parallel with 1B–1D); required before Phase 1 closes.

### PR-1E — "Continue with another agent" (linked handoff)

**Change:** session action that forks the current session to a chosen account/model with a
compact handoff.

- Reuse the existing dispatch pipeline (`rpc/sessions.ts:557` `mode:'fork'`) targeting the
  **same workspace**: new thin RPC or a parameter extension on the existing dispatch channel
  (decide during implementation; if a new channel, classify `REMOTE_ELIGIBLE` — CI enforces).
- Child binding: set the child session's `llmConnection` + model to the user's pick **before
  first send** (the lock-at-first-message rule then applies naturally; no credential
  hot-swap anywhere — D-014).
- Handoff package v0: reuse the transfer pipeline's existing hidden one-shot handoff-summary
  injection; content = current objective + recent decisions + touched files + git state
  (from the existing conversation-summary machinery), rendered also as a **visible** system
  note in the child ("Continued from <parent> · handoff: …") so criterion 8 ("see the
  generated handoff") holds. Durable vault-backed packets arrive later with the
  [Memory foundation](./memory-foundation.md) — v0 is explicitly session-scoped.
- Parent/child linkage: bundle metadata already carries source refs; surface "continued as →"
  / "continued from ←" chips in both sessions' headers.
- UI: session menu action + a small account/model picker dialog (reuses PR-1D components).

**Tests:** fork-dispatch handler test (child gets connection/model, parent untouched);
handoff-injection presence test; manual: run a task on Claude, continue on Codex-2, verify
the child answers with full context and no re-explanation.
**DoD:** master-plan criteria 6–8 of the [first useful release](../product/first-useful-release.md).

## 4. Verification matrix (every PR)

`bun run typecheck:electron` · `bun run test:shared:all` · `bun run test:account-identity` ·
`lint:i18n:parity` + `sorted` when locales touched · `electron:build:*` · manual smoke of the
touched flow. Known inherited failures stay untouched
([`../development/testing-and-quality-gates.md`](../development/testing-and-quality-gates.md)).

## 5. Migration & backward compatibility

- **No stored-schema changes.** Existing single-account users see identical behavior; new
  UI affordances are additive. No config migration, no credential-format change (D-009), no
  new `#838` allowlist entries required (identity fields already listed). Existing Codex
  connections remain identity-empty until reauthentication or a refresh returns a new
  `id_token`; immediate backfill would be a separate migration and is not hidden in PR-1A.
- Upstream-merge posture: hot-spot edits are confined to `AiSettingsPage.tsx`,
  `model-picker-helpers.ts` (+ consumers), focused auth/protocol/refresh plumbing,
  `rpc/llm-connections.ts`, preload, and `useOnboarding.ts` — all bounded and
  conflict-tolerable ([`upstream-sync.md`](../development/upstream-sync.md)).

## 6. Risks

| Risk | Mitigation |
|---|---|
| Second Codex login breaks at the provider | S1 proved both OAuth flows, pre-restart chats, and clean-restart restoration before PR-1A |
| `id_token` claim shape differs from assumptions | S1 records real claims; parser is fail-soft (identity absent ≠ login broken) |
| Duplicate detection false-positives across families | Family-scoped keys + negative unit tests |
| Picker refactor destabilizes session-new flow | Helper is pure + unit-tested; consumers changed mechanically; manual matrix |
| Handoff context too thin/too heavy in v0 | Visible handoff note (user sees what transferred); iterate; durable packets come with Memory foundation |
| Quota surprises (two connections, one principal/workspace) | PR-1C warns about the duplicate login context without claiming an unverified billing boundary |
| Copilot identity mechanism assumptions wrong (token audience/scopes) | PR-1F opens with its own mini-verification; parser fail-soft; scope contained to one PR |

## 7. Completion criteria (master plan — verbatim checklist)

- [ ] One Claude subscription can be authenticated.
- [ ] Two different Codex subscriptions can be authenticated simultaneously.
- [ ] The real identity of each account is visible.
- [ ] Duplicate underlying accounts are detected.
- [ ] A new session can choose any account/model combination.
- [ ] An active task can continue through a linked handoff to another agent.
- [ ] Restarting the app restores accounts and sessions correctly.
- [x] Credentials never cross connection boundaries. *(PR-1A adds lifecycle, encrypted-store,
  restart, and cross-provider RPC regression coverage; Phase 1 review still gates the release.)*
- [ ] A Copilot connection shows its real GitHub identity. *(added by D-020)*

## 8. Owner decisions `[DECIDED]` (questions resolved 2026-07-14)

Answered at sign-off; recorded in the
[decision log](../decisions/initial-product-decisions.md) §D:

1. **Copilot identity → in Phase 1** as its own work package → PR-1F (**D-020**).
2. **"Craft Agents Backend" picker label → replaced in PR-1D** (×6 locales); exact copy
   approved at PR-1D review (**D-021**).
3. **PR-1E wording confirmed: "Continue with another agent"** — i18n baseline (**D-022**).

Also settled at sign-off: **git flow** — `develop` branch created 2026-07-14; feature
branches cut from `develop`, PRs target `develop` on `origin`; `develop` → `main` at the
phase gate (**D-023**).
