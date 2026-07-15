# Project State — the living handoff

> **The single most important file for an agent starting cold.** Keep it truthful and current.
> Update after every task (ritual in [`README.md`](./README.md)).

- **Last updated:** 2026-07-16
- **Repo:** NEXUS — fork of Craft Agents. Baseline: upstream commit `4289b16` (v0.11.1).
- **Branch:** `feature/linked-handoff` in an isolated worktree, published as
  [GitHub PR #6](https://github.com/YashChoudhary13/NEXUS/pull/6) and stacked on PR-1D because
  PR-1E consumes its account/model picker. The draft targets PR-1D for a clean one-concern
  review and must be retargeted to `develop` after PR-1D lands. A complete local integration
  candidate exists on `codex/phase-1-integration`. The
  preceding `spike/s1-multi-codex` branch remains throwaway and will never be merged.
  `upstream` push URL is **DISABLED** (safety).
- **Phase:** ✅ Phase 0 COMPLETE → **Phase 1 plan signed off 2026-07-14 (D-020…D-023) —
  implementation authorized, but the Phase 1 implementation is NOT complete**, delegated via the
  [Codex kickoff prompt](../plans/phase-1-kickoff-prompt-codex.md); S1 passed the PR-1A
  engineering gate and **PR-1A is implemented + locally verified and open as
  [GitHub PR #1](https://github.com/YashChoudhary13/NEXUS/pull/1); review/merge is pending**.
  All five PR-1A review threads are addressed on the feature branch (four repairs plus one
  documented concurrency rationale) and the result is verified. **PR-1B, PR-1C, and PR-1D
  are published as draft PRs [#2](https://github.com/YashChoudhary13/NEXUS/pull/2),
  [#3](https://github.com/YashChoudhary13/NEXUS/pull/3), and
  [#4](https://github.com/YashChoudhary13/NEXUS/pull/4). PR-1F is published as stacked draft
  [#5](https://github.com/YashChoudhary13/NEXUS/pull/5), and PR-1E as stacked draft
  [#6](https://github.com/YashChoudhary13/NEXUS/pull/6).** A semantic integration candidate
  combining PRs #1–#6 passes the complete automated regression/build matrix. Owner acceptance,
  review/retarget/merge, and the billing criterion remain before Phase 1 can close.
  Roadmap: [`../product/roadmap.md`](../product/roadmap.md).

---

## Where we are right now

The master product plan (**NEXUS = Chat + Swarm + Brain**) was adopted 2026-07-13 —
canonical snapshot at
[`../product/nexus-master-plan-2026-07-13.md`](../product/nexus-master-plan-2026-07-13.md).
Phase 0 is complete. Phase 1 S1 passed its PR-1A engineering gate: both OAuth logins,
built-in validations, per-principal chats, and clean-restart restoration of both slug-bound
connections/sessions passed. The observed users share one selected runtime workspace, so the
overall “two different subscriptions” billing criterion remains `[OPEN]` for the phase gate.
**PR-1A provider-neutral identity capture is complete on its feature branch and open as
[GitHub PR #1](https://github.com/YashChoudhary13/NEXUS/pull/1) against `develop`. PR-1B,
PR-1C, and PR-1D are draft PRs #2–#4; PR-1F and PR-1E are stacked drafts #5 and #6. A local
`codex/phase-1-integration` candidate combines all six slices, including the one cross-slice
OAuth-target reconciliation in `useOnboarding`, and passes the complete automated matrix.
The overall Phase 1 is not formally complete: review/retarget/merge, the final real-account
owner matrix, and the open billing acceptance criterion remain.**

## Done ✅

- Fork verified: `origin` → `YashChoudhary13/NEXUS`, `upstream` → `craft-ai-agents/craft-agents-oss`.
- Full read-only architecture audit → [`../architecture/craft-baseline.md`](../architecture/craft-baseline.md).
- Verified environment + baseline validation (Bun 1.3.10; builds ✅, shared tests ✅, failures
  categorized) → [`../development/testing-and-quality-gates.md`](../development/testing-and-quality-gates.md).
- Craft-coupling map (retained identifiers vs. later decoupling) → [`../development/upstream-sync.md`](../development/upstream-sync.md).
- Branding/compliance **PR #1 plan finalized** (owner-scoped, not yet implemented) →
  [`../plans/pr-01-identity-and-packaging.md`](../plans/pr-01-identity-and-packaging.md).
- Decisions D-001…D-023 recorded → [`../decisions/initial-product-decisions.md`](../decisions/initial-product-decisions.md).
- **2026-07-13:** master plan adopted; entire `docs/` system rebuilt to the canonical NEXUS
  structure (this documentation set). Root `AGENTS.md`/`CLAUDE.md` rewritten as thin shared
  bootstraps.
- **2026-07-13:** docs committed and pushed directly to `origin/main` (owner-authorized
  one-off exception to D-010; upstream untouched). Upstream root `README.md` removed until
  the publish phase (D-019).
- **2026-07-14:** `upstream` push URL disabled; launch smoke-test **PASS** (Phase 0 criterion
  closed, `CRAFT_CONFIG_DIR` caveat documented); **detailed Phase 1 implementation plan
  produced** → [`../plans/phase-1-multi-account-chat.md`](../plans/phase-1-multi-account-chat.md).
  **Phase 0 = COMPLETE.**
- **2026-07-15:** PR-1A implemented on `feature/account-identity`: provider-neutral ChatGPT
  JWT identity, server-owned first-login/reauth persistence, exact-slug runtime invalidation,
  credential lifecycle epochs, durable atomic whole-store replacement, retry-safe logout/delete,
  provider-specific OAuth target fences, and ChatGPT/Copilot/Claude OAuth race hardening.
  Verification: account suite 94 pass + exact-runtime filter 1 pass (**418 assertions total**),
  full shared **3,015 pass / 12 skip / 0 fail**, four relevant typechecks clean, complete Electron
  build clean apart from inherited warnings. Full server-core adds ten passing tests over clean
  `develop` and retains the same one inherited order-dependent runtime-config failure. No
  stored-schema or credential-format migration.
- **2026-07-15:** PR-1A review repair narrows failed-refresh/rollback cleanup to the exact
  slug's OAuth credential, so an API key, IAM credential, or service-account credential sharing
  that slug cannot be erased. Credential deletion errors now identify the exact scoped account,
  and the intentional two-phase runtime invalidation fence is documented. Verification: **98
  focused tests / 427 assertions**, full shared **3,017 pass / 12 skip / 0 fail / 5,715
  assertions**, shared/server-core/Electron typechecks, changed-file shared lint, and the complete
  Electron build all pass; only the documented inherited build warnings remain.
- **2026-07-15:** PR-1F implemented on `feature/copilot-identity`: GitHub Copilot OAuth now
  resolves the stable GitHub user id, public email or verified `@login`, and first public
  organization without requesting broader scopes. Existing-row reauth persists the identity
  directly; first login uses a short-lived client/slug/generation-bound server receipt until
  setup creates the row. GitHub lookup failure, malformed data, timeout, or missing email can
  never fail authentication, and token refresh re-stamps the exact slug while preserving the
  last verified profile on lookup failure. Verification: focused **40 pass / 93 assertions**;
  full account gate **110 pass / 469 assertions** across its three commands; full shared
  **108 pass / 227 assertions**; changed-file lint, relevant typechecks, diff hygiene, and the
  complete Electron production build pass. An isolated built-app smoke rendered
  `Copilot Builder · @copilot-builder · nexus-labs` in Settings → AI without real credentials.
- **2026-07-15:** PR-1E implemented on `feature/linked-handoff`: a session can continue into
  a same-workspace child bound to a selected authenticated account and model before its first
  send. A dedicated fail-safe handoff summary records the objective, completed work, recent
  decisions and rationale, remaining tasks, files, commands/results, blockers, and git state;
  it is injected once as hidden context and shown as a visible child note. Durable parent/child
  metadata supports repeated continuations, restart restoration, rollback, deletion cleanup,
  and bidirectional header navigation. Focused handoff tests pass **24 / 1,660 assertions**;
  the PR-1D picker dependency passes **37 / 46**; the sessions atom suite passes **10 / 39**;
  relevant typechecks, locale parity/sorting, changed-file lint, diff hygiene, and the complete
  Electron production build pass. A disposable credential-free built-app smoke generated a
  real handoff through a localhost model stub, exposed and verified fixes for the child-route
  lifecycle race and nested interactive header links, and confirmed repeated continuations,
  automatic child navigation, visible context, and both directions of linked navigation.
- **2026-07-16:** all implementation slices are published: PR-1A
  [#1](https://github.com/YashChoudhary13/NEXUS/pull/1) targets `develop`; PR-1B/1C/1D are
  drafts [#2](https://github.com/YashChoudhary13/NEXUS/pull/2)–[#4](https://github.com/YashChoudhary13/NEXUS/pull/4)
  against `develop`; PR-1F [#5](https://github.com/YashChoudhary13/NEXUS/pull/5) is stacked
  on PR-1A; and PR-1E [#6](https://github.com/YashChoudhary13/NEXUS/pull/6) is stacked on
  PR-1D. The integrated candidate passes 120 account-identity tests, 23 multi-account UX,
  6 duplicate-account, 37 picker, 24 handoff, 10 sessions-atom, 492 complete renderer, and
  108 shared tests; all relevant typechecks, locale parity/sorting, changed-file lint, diff
  hygiene, and the complete Electron production build also pass.

## Next up ⏭️ (in order)

1. Review/merge PR-1A [#1](https://github.com/YashChoudhary13/NEXUS/pull/1), then retarget
   stacked PR-1F [#5](https://github.com/YashChoudhary13/NEXUS/pull/5) to `develop`.
2. Review/merge PR-1D [#4](https://github.com/YashChoudhary13/NEXUS/pull/4), then retarget
   stacked PR-1E [#6](https://github.com/YashChoudhary13/NEXUS/pull/6) to `develop`.
3. Review/merge the remaining Phase 1 PRs into `develop` (D-023), preserving one concern per PR.
4. **Run the final owner acceptance matrix** with real Claude, two real Codex identities,
   and Copilot, including restart and linked-handoff coverage.
5. Resolve or explicitly redefine the independently billed subscription acceptance criterion.
6. **PR #1 (branding/compliance)** — plan approved, **blocked on owner artwork** (D-008) and
   explicit go-ahead. Runs on its own branch, parallel to Phase 1.
7. Then: memory foundation → Phase 2 Swarm → Phase 3 Brain, per the roadmap.

## Blockers / owner input needed

- ❓ **Phase 1 billing acceptance wording** — S1 proved two distinct user principals in one
  selected runtime workspace, not two independently routed subscription workspaces. Resolve
  or rerun that criterion before Phase 1 closes; it does not block PR-1A.
- ⏳ **PR #1 artwork** (app icon master + wordmark) — owner is providing (D-008).
- ⏳ **PR #1 implementation go-ahead.**
- ❓ Open questions listed in [`../product/roadmap.md`](../product/roadmap.md) §Open questions.

## Fast facts

- Runtime **Bun 1.3.10**; `bun install --frozen-lockfile` fails (stale lockfile — inherited).
- Storage is filesystem (JSONL sessions, JSON config, one AES-256-GCM credentials file). No SQL DB.
- Two agent backends today `[UPSTREAM]`: Claude Agent SDK (`anthropic`) + Pi SDK (`pi`, ~20 providers).
- Renderer ↔ logic is **WebSocket RPC**, not Electron IPC.
- Trademark requires rename/re-icon/re-bundle-ID before distribution → PR #1.

---

## Changelog / handoff log (newest first — append, never rewrite)

- **2026-07-16 — Phase 1 implementation published and combined candidate regression-gated.**
  PR-1E commit `542b564` is stacked draft
  [#6](https://github.com/YashChoudhary13/NEXUS/pull/6) on PR-1D. A local
  `codex/phase-1-integration` candidate merged PRs #1–#6 in dependency order and resolved the
  only source conflict semantically: the multi-account exact-slug/reauth target is combined
  with PR-1A's server-owned Claude identity path without returning OAuth tokens to the renderer.
  Pinned-Bun verification: 120 account-identity tests / 486 assertions; 23 multi-account UX /
  41; 6 duplicate-account / 9; 37 picker / 46; 24 handoff / 1,660; 10 sessions-atom / 39;
  complete renderer 492 / 833; shared 108 / 227; all relevant package/Electron/UI typechecks;
  six translated locales at 1,664 keys; changed-file lint with zero errors; diff hygiene; and
  the complete Electron production build. Phase 1 awaits review/retarget/merge, the owner
  real-account matrix, and resolution of the billing criterion; `main` remains untouched.
- **2026-07-16 — GitHub publication resumed; PR-1B/1C/1D/1F opened as drafts.** Authenticated
  GitHub CLI is available. Commits `e55c9e5`, `5c017c7`, and `9ea7d0a` are draft PRs #2–#4
  against `develop`; Copilot commit `930d33f` is stacked draft #5 on PR-1A for a clean review.
  Root `main` stayed untouched. PR-1E is being rebased onto PR-1D and is the final unpublished
  implementation slice.
- **2026-07-16 — Phase 1 publication goal marked blocked after the third identical tooling
  failure.** `command -v gh`, `gh --version`, and `gh auth status` still cannot find GitHub CLI.
  The required publishing workflow therefore cannot safely begin its scope-audit/stage/commit/
  push/PR sequence. No branch was mutated and `main` remains clean. Resume after the owner runs
  `brew install gh`, `gh auth login`, and verifies `gh auth status`.
- **2026-07-16 — Phase 1 publication gate rechecked; GitHub CLI still absent.** Root `main`
  remains clean at `30eca67`; all five isolated implementation worktrees and PR-1A remain
  present. The required publish workflow stops before staging or committing when `gh` is
  unavailable, so no branch was mutated. Owner action remains `brew install gh`, then
  `gh auth login`; resume by auditing each worktree diff, committing one concern per branch,
  pushing, and opening draft PRs against `develop` in dependency order.
- **2026-07-15 — PR-1E linked handoff implemented, regression-gated, and desktop-smoked
  locally.** The same-workspace RPC validates the exact target, flushes the parent, creates the
  child with account/model binding before any send, persists both links before notification,
  and rolls back partial work. The transfer summary is hidden one-shot context plus a visible
  child note. Native header controls avoid nested interactive elements and navigate in both
  directions. A real built-app smoke using a disposable localhost model uncovered a renderer
  lifecycle race: RPC success could navigate before the child event was registered. The dialog
  now hydrates the child idempotently before navigation; the rebuilt app then navigated to the
  child automatically and supported two continuations from one parent. Pinned-Bun gates: 24
  handoff tests / 1,660 assertions, 37 picker tests / 46 assertions, 10 sessions-atom tests /
  39 assertions, relevant typechecks, changed-file lint, locale parity/sorting, complete
  Electron build, and final renderer rebuild all pass. All Phase 1 implementation slices are
  now locally complete; publication/integration, owner real-account acceptance, and the billing
  criterion remain before Phase 1 can close.
- **2026-07-15 — PR-1F Copilot identity implemented and regression-gated locally.** The Pi
  device flow's durable GitHub token now drives fail-soft `/user` and public-organization
  lookup. Private email falls back to the provider-verified `@login`; no broader OAuth scope,
  stored field, or credential format was added. Identity is server-owned across first setup,
  reauth, refresh, logout, delete, stale-flow races, and renderer forgery attempts. Pinned-Bun
  gates: 40 focused tests / 93 assertions, 110 account-gate tests / 469 assertions, 108 shared
  tests / 227 assertions, relevant typechecks, changed-file lint, complete Electron build, and
  isolated built-app row smoke all pass. Root-wide `typecheck:all` retains only the reproduced
  stripped-OSS `tsconfig.base.json` failures. Publication is paused because `gh` is absent;
  PR-1E is the remaining implementation slice.
- **2026-07-15 — PR-1A review findings repaired and regression-gated.** OAuth refresh
  rollback and invalid-token cleanup now delete only `llm_oauth::{connectionSlug}` rather than
  every credential type for that slug. A manager-level regression preserves API-key, IAM, and
  service-account entries, while an isolated auth-state regression drives the real
  `invalid_grant` path. Aggregate deletion failures report the complete scoped credential
  account. The second exact-slug runtime invalidation remains intentionally present: it fences
  a runtime created during credential deletion, including non-OAuth connections without a
  credential lifecycle epoch. Pinned-Bun gates: 98 focused tests / 427 assertions, full shared
  3,017 pass / 12 skip / 0 fail / 5,715 assertions, relevant typechecks and complete Electron
  build pass. PR-1A remains open; PR-1B is next.
- **2026-07-15 — PR-1A implemented, verified, pushed, and opened for review.**
  [GitHub PR #1](https://github.com/YashChoudhary13/NEXUS/pull/1) targets `develop`. ChatGPT OAuth now
  derives the human principal from provider JWT claims without confusing it with the runtime
  workspace; credentials and identity share one server-owned per-slug generation. Logout,
  delete, refresh, reauth, and runtime disposal are race-tested, encrypted-store writes are
  globally serialized, atomically replaced, and retry-safe across restart, and Claude/Copilot
  handlers cannot target a ChatGPT slug or install stale OAuth results. Pinned-Bun gates: 95
  focused tests / 418 assertions total, full shared suite 3,015 pass / 12 skip / 0 fail, relevant
  typechecks and full Electron build pass. A clean-`develop` comparison proves the one full
  server-suite failure is inherited and unchanged. No Phase 1 branch has merged to `develop`;
  PR-1B through PR-1F and the independent-billing acceptance nuance remain `[OPEN]`.
- **2026-07-14 — S1 passed the PR-1A gate; implementation started.** Clean restart restored
  both connection rows and both original sessions with exact, locked slugs; safe credential
  inspection still found both slug-scoped entries. OpenAI's own Codex parser confirms the
  distinct `chatgpt_user_id` values are user principals while their shared
  `chatgpt_account_id` is the selected organization/workspace. Recorded the unresolved
  billing-criterion nuance honestly, created `feature/account-identity` from `develop`, and
  began PR-1A. The throwaway spike branch remains unmerged.
- **2026-07-14 — S1 account #2 and pre-restart chats passed; restart verdict pending.** The
  provider accepted simultaneous OAuth for `chatgpt-plus` and `chatgpt-plus-2`; both built-in
  validations and one slug-locked chat per connection passed. Redacted comparison found
  distinct subjects, emails, ChatGPT user/account-user IDs, and non-overlapping organization
  sets, but the same `chatgpt_account_id` routing value across both logins. The unchanged app
  was shut down cleanly and relaunched with the same config. S1 still awaits both restored
  chats and owner confirmation whether these are separate subscriptions or seats/users in a
  shared workspace; PR-1A remains gated.
- **2026-07-14 — S1 multi-Codex spike started; account #1 passed, account #2 pending.** Created
  isolated throwaway worktree/branch `spike/s1-multi-codex`, installed and used Bun 1.3.10,
  and launched the unchanged app with scratch global config. Owner completed real OAuth for
  `chatgpt-plus`; exchange, encrypted persistence, model refresh, auth reinitialization, and
  built-in validation passed. A keys-only inspection recorded the real ID-token claim shape
  without logging token/identity values: `email`, `sub`, and the namespaced OpenAI auth object
  with ChatGPT account/user IDs plus organization `id`/`title`/`role`/`is_default`. Two plan
  assumptions were corrected: the existing UI already mints suffixed OAuth slugs and exposes
  Rename; `CRAFT_CONFIG_DIR` does not isolate `~/.craft-agent/credentials.enc`. **Not a spike
  pass yet:** account #2, different-identity comparison, two chats, and restart remain; do not
  begin PR-1A until they pass.
- **2026-07-14 — Phase 1 signed off; execution delegated to Codex.** Owner answered the plan's
  §8 questions → decisions **D-020** (Copilot identity in Phase 1 as new PR-1F), **D-021**
  ("Craft Agents Backend" picker label replaced in PR-1D, ×6 locales), **D-022** (wording
  "Continue with another agent" confirmed), **D-023** (`develop` branch created from `main`;
  feature branches off `develop`, PRs → `develop`; `develop` → `main` at phase gates). Plan
  amended accordingly (status `[DECIDED]`, PR-1F added, §8 resolved); Codex kickoff prompt
  authored → [`../plans/phase-1-kickoff-prompt-codex.md`](../plans/phase-1-kickoff-prompt-codex.md).
  Docs-maintenance commit pushed to `origin/main` (established owner-authorized pattern);
  `develop` pushed to `origin`. **Next agent (Codex): follow the kickoff prompt — S1 spike
  first; owner performs the logins; stop if a second Codex login fails at the provider.**
- **2026-07-14 — Phase 0 closed: upstream push disabled, launch smoke PASS, Phase 1 plan
  produced.** (1) `git remote set-url --push upstream DISABLED` — accidental upstream pushes
  now impossible. (2) Launch smoke-test of the unmodified app passed (`bun run electron:dev`,
  isolated-ish config, clean shutdown); discovered and documented that `CRAFT_CONFIG_DIR`
  isolation is **partial** — default workspace data still lands in `~/.craft-agent`
  (pre-existing dir on this machine; smoke run added a skeleton `workspaces/my-workspace` +
  2 scheduler-tick lines — benign, left in place). See testing-and-quality-gates.md.
  (3) Produced the detailed Phase 1 implementation plan from real code investigation — key
  findings: identity fields + storage allowlist + Claude duplicate-detection UI + suffixed
  multi-account slugs + fork dispatch **all already exist upstream**; Codex `id_token` is
  persisted but never decoded (the core gap). Phase 1 = generalization, sequenced S1 spike →
  PR-1A…1E with no stored-schema changes. Docs updated (roadmap milestone complete, phase-0
  ✅). Next agent: do NOT start Phase 1 without owner sign-off; start with the S1 spike.
- **2026-07-13 — README removal + first push to the fork.** Owner approved committing the
  documentation set and instructed a direct push to their fork — pushed to `origin/main`
  only (explicit one-off exception to D-010; `upstream` untouched). Removed the upstream
  root `README.md` per D-019 (a NEXUS README will be written at the publish phase); updated
  roadmap, phase-0 status, upstream notes, and the decision log accordingly. Future upstream
  syncs will hit a modify/delete conflict on `README.md` — resolve as deleted.
- **2026-07-13 — Docs system v2 (canonical NEXUS structure).** Adopted the master plan
  (Chat/Swarm/Brain) as authoritative; rebuilt `docs/` into the required structure
  (product/architecture/decisions/development/research/plans/upstream/agents); recorded
  decisions D-011…D-018 from the plan; rewrote root `AGENTS.md`/`CLAUDE.md` as thin
  bootstraps. **Note:** the previous `docs/` folder (including tracked `docs/cli.md`) had been
  deleted from the working tree before this rebuild; `cli.md` content was restored from git
  HEAD to [`../upstream/cli.md`](../upstream/cli.md). Everything remains uncommitted pending
  owner direction.
- **2026-07-13 — PR #1 plan finalized.** Owner approved incremental-evolution strategy and
  scoped PR #1 (product-name-only copy D-007; owner-supplied artwork D-008). Implementation
  not started.
- **2026-07-13 — Verified baseline.** Bun 1.3.10 installed; `bun install` (plain) works;
  builds + shared tests green; failures categorized (stripped OSS files vs. real lint debt vs.
  env). `bun.lock` was transiently modified and restored — tree left clean.
- **2026-07-13 — Orientation audit.** Full repo audit (architecture, security, frontend,
  coupling) completed read-only; no code changed.
