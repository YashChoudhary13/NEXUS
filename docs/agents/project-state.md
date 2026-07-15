# Project State — the living handoff

> **The single most important file for an agent starting cold.** Keep it truthful and current.
> Update after every task (ritual in [`README.md`](./README.md)).

- **Last updated:** 2026-07-15
- **Repo:** NEXUS — fork of Craft Agents. Baseline: upstream commit `4289b16` (v0.11.1).
- **Branch:** `feature/multi-account-ux` in an isolated worktree, cut from `develop`;
  `upstream` push URL is **DISABLED** (safety).
- **Phase:** ✅ Phase 0 COMPLETE → **Phase 1 implementation in progress, not complete.**
  S1 passed its engineering gate; PR-1A is implemented, review-repaired, verified, and open
  as [GitHub PR #1](https://github.com/YashChoudhary13/NEXUS/pull/1). PR-1B is implemented
  and verified on this branch; publication/merge is pending. PR-1C, PR-1D, PR-1F, and PR-1E
  remain.
  Roadmap: [`../product/roadmap.md`](../product/roadmap.md).

---

## Where we are right now

The master product plan (**NEXUS = Chat + Swarm + Brain**) was adopted 2026-07-13 —
canonical snapshot at
[`../product/nexus-master-plan-2026-07-13.md`](../product/nexus-master-plan-2026-07-13.md).
Phase 0 is complete. S1 proved two simultaneous slug-scoped Codex logins, chats, and restart
restoration, with the independently billed-subscription wording still `[OPEN]`. PR-1A adds
provider-neutral OAuth identity and hardened credential lifecycle behavior. PR-1B adds an
explicit, provider-safe **Add another account** action while preserving Rename and
Re-authenticate. Both slices are implemented and locally verified; neither has merged to
`develop`, so the overall Phase 1 remains incomplete.

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
- **2026-07-15:** PR-1A implemented and review-repaired on `feature/account-identity`; scoped
  identity/credential/race regressions, full shared tests, relevant typechecks, and the full
  Electron build pass. [GitHub PR #1](https://github.com/YashChoudhary13/NEXUS/pull/1)
  targets `develop`.
- **2026-07-15:** PR-1B implemented on `feature/multi-account-ux`: the connection-row menu
  exposes an explicit Add another account action for Claude, ChatGPT, and Copilot OAuth;
  exact flow targets are fenced against stale edit state; first-free suffix allocation handles
  gaps, deletions, and double-digit accounts; unsupported Pi OAuth providers fail closed.
  Verification: focused **22 pass / 40 assertions**, renderer **476 pass / 810 assertions**,
  shared **108 pass**, shared/Electron typechecks, i18n parity+sorting (**1,640 keys per
  locale**), changed-file lint (0 errors; 3 inherited warnings), and the full Electron build.
  Built-app smoke verified Rename, Re-authenticate, and Add another account render together
  without invoking the new-account action.

## Next up ⏭️ (in order)

1. Publish/review PR-1B, then implement PR-1C → PR-1D → PR-1F → PR-1E per
   [`../plans/phase-1-multi-account-chat.md`](../plans/phase-1-multi-account-chat.md).
   Branches off `develop`, PRs → `develop` (D-023).
2. **PR #1 (branding/compliance)** — plan approved, **blocked on owner artwork** (D-008) and
   explicit go-ahead. Runs on its own branch, parallel to Phase 1.
3. Then: memory foundation → Phase 2 Swarm → Phase 3 Brain, per the roadmap.

## Blockers / owner input needed

- ❓ **Phase 1 billing acceptance wording** — S1 proved two distinct user principals in one
  selected runtime workspace, not two independently routed subscriptions. Resolve or rerun
  this criterion before Phase 1 closes; it does not block the implementation slices.
- ⚠️ **Local smoke profile cleanup is owner-controlled:** the PR-1B built-app smoke inherited
  the default Craft profile; onboarding resumed and the already signed-in browser completed
  one ChatGPT OAuth connection in `~/.craft-agent`. No secret was printed and the second-account
  action was not invoked. Do not delete that connection/credential without owner approval.
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

- **2026-07-15 — PR-1B implemented and fully regression-gated.** Added an explicit
  provider-safe Add another account action, exact OAuth-flow target fencing, robust first-free
  slug allocation, fail-closed provider mapping, and seven-locale copy. Pinned-Bun gates:
  focused 22/40, renderer 476/810, shared 108, relevant typechecks, i18n parity/sorting,
  changed-file lint, and complete Electron build all pass. Built-app accessibility smoke
  confirmed the menu action beside Rename/Re-authenticate and did not launch the action.
  The inherited default profile did resume one existing ChatGPT onboarding OAuth during
  launch; its resulting local connection is intentionally left untouched pending owner input.
- **2026-07-15 — PR-1A implemented, repaired after review, and open.**
  [GitHub PR #1](https://github.com/YashChoudhary13/NEXUS/pull/1) targets `develop`. The final
  repair suite passes 98 focused tests / 427 assertions, full shared 3,017 pass / 12 skip /
  0 fail / 5,715 assertions, relevant typechecks, changed-file lint, and the complete Electron
  build. Four code-review comments are outdated after fixes; the retained two-phase runtime
  invalidation is documented as an intentional race fence.
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
