# Phase 1 — Chat and Multi-Account Foundation (detailed implementation plan)

**Objective:** make the existing Craft Agents chat experience work naturally with multiple
Claude and Codex subscription identities.
**Status:** `[DECIDED]` — **signed off by the owner 2026-07-14**; §8 questions answered
(D-020…D-023), implementation authorized and delegated via the
[Codex kickoff prompt](./phase-1-kickoff-prompt-codex.md). Implementation begins with the
S1 spike; **no Phase 1 code has landed yet**. All code references verified against baseline
`4289b16` + fork docs commits.

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
| Multiple same-provider connections | `createBuiltInConnection` **already supports suffixed slugs**: `'chatgpt-plus-2'` → base template + display name "… 2" (`packages/server-core/src/domain/connection-setup-logic.ts:208-236`). Credentials are slug-scoped (`llm::{slug}::oauth_token`, `llm-connections.ts:361-363`) so accounts can't cross | **No UI mints a second OAuth connection** (onboarding hardcodes `pi_chatgpt_oauth: 'chatgpt-plus'`, `useOnboarding.ts:97`) |
| Account display names / roles | `LlmConnection.name` is free text and user-editable — "Codex Builder" is just a renamed connection | Surface rename affordance |
| Connection locked per session | `resolveEffectiveConnectionSlug` + session lock after first message (`llm-connections.ts:670-693`); Pi subprocess auth can't be hot-swapped (restart-required signature) | None — matches D-014 by construction |
| Session forking for handoffs | Dispatch `mode: 'move' | 'fork'` exists (`packages/server-core/src/handlers/rpc/sessions.ts:557`); `SessionBundle` carries `BundleBranchInfo` (`sdkSessionId` + `sdkTurnId` branch point, `packages/shared/src/sessions/bundle.ts:44-73`); transfer already injects one-shot hidden **handoff summaries** on the destination's first turn | Wire into an in-workspace "Continue with another agent" action with account/model rebinding |
| Account-aware picker | Picker groups by provider only: Anthropic / Local / "Craft Agents Backend" (`model-picker-helpers.ts:36-55`) | Add the account tier |

**Design consequence (proposed):** the master plan's `AgentAccount` / `AuthIdentity`
interfaces become **derived view-models in the renderer**, not new stored schemas. Stored
state stays exactly the existing five `oauth*` fields + `name` — zero config migration, zero
`#838` allowlist edits, zero upstream-merge friction. (`AuthIdentity.accountId` ⇢
`oauthAccountUuid` (Claude uuid / Codex JWT `sub` or ChatGPT account id), `email` ⇢
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

1. Manually create a second connection (`chatgpt-plus-2`) by invoking
   `SETUP_LLM_CONNECTION` + `chatgpt.START_OAUTH/COMPLETE_OAUTH` against slug
   `chatgpt-plus-2` (CLI `invoke` or a temporary dev button). Owner logs in with account #2.
2. Verify: both connections listed with independent auth status; sessions run on each;
   restart restores both; decode the stored `idToken` by hand and confirm claim shape
   (`email`, `sub`, org claims) matches expectations.
3. Record findings (claim names!) in this doc before PR-1A review.

Exit criterion: both accounts chat successfully in one app run. If OpenAI's flow breaks a
second login (e.g., token endpoint quirks), Phase 1 scope is re-planned before any code.

## 3. Work packages

### PR-1A — Provider-neutral identity capture (Codex first)

**Change:** decode the ChatGPT `id_token` JWT at OAuth completion and stamp the existing
connection identity fields, server-side.

- **New** `packages/shared/src/auth/oauth-identity.ts`:
  `decodeJwtClaims(idToken)` (base64url payload decode — no signature verification needed;
  the token arrives directly from the provider's token endpoint over TLS) +
  `parseChatGptIdentity(claims)` → `{ account: { uuid: sub|account_id, emailAddress: email },
  organization?: { uuid, name } }` (exact claim names fixed by S1). Mirror of
  `parseClaudeOAuthIdentity`'s fail-soft contract: never throw, never block login.
- `packages/server-core/src/handlers/rpc/llm-connections.ts` — in `COMPLETE_OAUTH`
  (after `:681`): parse identity from `tokens.idToken` and persist via
  `updateLlmConnection(flow.connectionSlug, identityUpdates)` (guarded assignments exactly
  like `:163-174`). Also re-stamp on token refresh where the refresh path receives a new
  `id_token` (`packages/shared/src/auth/chatgpt-oauth.ts:151-207` consumers).
- **Out of scope for this PR:** Copilot identity — in Phase 1 per D-020, but as its own
  package ([PR-1F](#pr-1f--copilot-identity-capture-d-020), different mechanism); Claude path
  untouched (already works).

**Tests:** unit tests for `decodeJwtClaims`/`parseChatGptIdentity` (fabricated JWTs: happy
path, missing claims, garbage token → `undefined`, never-throws); handler-level test that
COMPLETE_OAUTH stamps fields (mock exchange); regression: existing
`sendmessage-oauth-refresh.test.ts` stays green.
**DoD:** after a Codex login, `AiSettingsPage` shows the account email with **zero UI code
changes** (the `:287` identity line just lights up).

### PR-1B — Multi-account connections UX

**Change:** let the user add a second/third subscription login of the same provider and name
each connection.

- Slug minting helper (shared, tested): next free suffix among existing connections
  (`chatgpt-plus` → `chatgpt-plus-2` → `-3`; same for `claude-max`/Copilot slugs) — matches
  the already-supported `createBuiltInConnection` suffix convention
  (`connection-setup-logic.ts:209-211,228-232`).
- `AiSettingsPage.tsx`: "Add another account" action on OAuth provider rows → runs the
  existing OAuth setup flow against the minted slug (the flow is already slug-parameterized
  end-to-end). Rename affordance surfaced on each connection row (edits `name`).
- Onboarding untouched except reusing the helper instead of the hardcoded literal
  (`useOnboarding.ts:97`).
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
  `(providerFamily, oauthAccountUuid || oauthAccountEmail)` where providerFamily
  distinguishes Anthropic vs OpenAI/Codex vs Copilot (never cross-family). Unit-test the
  helper (same account two slugs → flagged; different accounts → not; missing identity →
  never flagged).
- Warning UI: reuse the existing `isDuplicateAccount` row treatment; add the master plan's
  explanatory copy ("…authenticate the same account and therefore share the same quota") as
  a tooltip/banner; also surface once at setup completion when the new login resolves to an
  existing account.
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

`bun run typecheck:electron` · `bun run test:shared:all` · new unit tests above ·
`lint:i18n:parity` + `sorted` when locales touched · `electron:build:*` · manual smoke of the
touched flow. Known inherited failures stay untouched
([`../development/testing-and-quality-gates.md`](../development/testing-and-quality-gates.md)).

## 5. Migration & backward compatibility

- **No stored-schema changes.** Existing single-account users see identical behavior; new
  UI affordances are additive. No config migration, no credential-format change (D-009), no
  new `#838` allowlist entries required (identity fields already listed).
- Upstream-merge posture: hot-spot edits are confined to `AiSettingsPage.tsx`,
  `model-picker-helpers.ts` (+ consumers), one handler block in `rpc/llm-connections.ts`,
  and `useOnboarding.ts:97` — all small, additive, and conflict-tolerable
  ([`upstream-sync.md`](../development/upstream-sync.md)).

## 6. Risks

| Risk | Mitigation |
|---|---|
| Second Codex login breaks at the provider (unverified) | **S1 spike before any PR**; re-plan if it fails |
| `id_token` claim shape differs from assumptions | S1 records real claims; parser is fail-soft (identity absent ≠ login broken) |
| Duplicate detection false-positives across families | Family-scoped keys + negative unit tests |
| Picker refactor destabilizes session-new flow | Helper is pure + unit-tested; consumers changed mechanically; manual matrix |
| Handoff context too thin/too heavy in v0 | Visible handoff note (user sees what transferred); iterate; durable packets come with Memory foundation |
| Quota surprises (two connections, one account) | That's exactly what PR-1C warns about |
| Copilot identity mechanism assumptions wrong (token audience/scopes) | PR-1F opens with its own mini-verification; parser fail-soft; scope contained to one PR |

## 7. Completion criteria (master plan — verbatim checklist)

- [ ] One Claude subscription can be authenticated.
- [ ] Two different Codex subscriptions can be authenticated simultaneously.
- [ ] The real identity of each account is visible.
- [ ] Duplicate underlying accounts are detected.
- [ ] A new session can choose any account/model combination.
- [ ] An active task can continue through a linked handoff to another agent.
- [ ] Restarting the app restores accounts and sessions correctly.
- [ ] Credentials never cross connection boundaries. *(structural today — regression-guarded by slug-scoped credential tests)*
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
