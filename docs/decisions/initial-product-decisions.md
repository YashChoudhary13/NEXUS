# Initial Product Decisions (D-001 … D-023)

**Status:** all entries `[DECIDED]` · **Next free ID: D-024** · Conventions:
[`README.md`](./README.md).

Batches: **A)** foundation/fork-strategy decisions from the owner's planning sessions
(2026-07-13); **B)** product-direction decisions adopted with the
[master plan](../product/nexus-master-plan-2026-07-13.md) (2026-07-13); **C)** post-adoption
owner decisions (2026-07-13); **D)** Phase 1 sign-off decisions (2026-07-14).

---

## A. Foundation & fork strategy (2026-07-13, owner)

### D-001 — Transformation strategy: incremental architectural evolution
Adopt incremental evolution of the Craft Agents fork — not conservative-only adaptation, not a
major redesign. **Why:** architecture is well-abstracted, branding largely parameterized;
honors "don't rewrite working systems." **Consequence:** small scoped PRs behind stable seams.

### D-002 — Keep tracking `upstream`
Continue merging from `craft-ai-agents/craft-agents-oss`. **Consequence:** preserve internal
identifiers (→ D-003); sync deliberately
([`../development/upstream-sync.md`](../development/upstream-sync.md)).

### D-003 — Preserve internal compat-sensitive identifiers
Keep `@craft-agent/*` package names, `CRAFT_*` env vars, `~/.craft-agent/` config dir,
`CRAFT01` credential markers, `__craftRpcType` codec key, `craftagents://` scheme for now.
**Why:** upstream-merge compatibility; invisible to end users. **Consequence:** rebrand only
user-visible/legally-required surfaces; internal renames need a dedicated future decision.

### D-004 — Disable auto-update; no placeholder feed
Disable NEXUS auto-update entirely (guarded, reversible); do **not** repoint to a
placeholder/nonexistent feed. **Why:** a built fork must not pull Craft's binaries; no NEXUS
update infra exists yet. **Executed via:** [PR #1 plan](../plans/pr-01-identity-and-packaging.md).

### D-005 — Keep Craft-hosted integrations for now
Do not remove/rewrite Craft-hosted OAuth relay, sharing, docs, or MCP in PR #1; recorded as
later decoupling work.

### D-006 — Craft docs MCP becomes optional/off by default — later
The always-on Craft documentation MCP should eventually be optional or disabled by default for
NEXUS; out of scope for PR #1.

### D-007 — PR #1 copy scope: product-name only
PR #1 changes only the bounded product-name strings (menu About/Hide/Quit, app name, window
title) — not the ~20+ descriptive "Craft Agents" strings. **Why:** avoid broad find-replace;
keep PR #1 minimal. Descriptive copy is a separate later workstream.

### D-008 — Artwork: owner provides before the icon swap
Owner supplies final NEXUS artwork (icon master + wordmark) before the icon/logo portion of
PR #1 lands; code/packaging/auto-update parts may be authored first.

### D-009 — Credential-storage hardening is a later dedicated milestone
No credential format/encryption changes in early PRs; the machine-derived-key weakness and
related findings ([`../architecture/craft-baseline.md`](../architecture/craft-baseline.md) §9)
get their own security milestone.

### D-010 — No direct commits to `main`
All work on branches; commit/push only when the owner asks.

---

## B. Product direction — master plan adoption (2026-07-13, owner)

### D-011 — NEXUS = Chat + Swarm + Brain on the Craft Agents foundation
Adopt the master plan as canonical: NEXUS is an Agent Operating System with three connected
experiences; Craft Agents remains the desktop shell and session foundation; the existing chat
experience stays the first screen the app opens to. Build from the fork, not from zero.

### D-012 — Separate provider, account identity, model, and thinking/effort
Distinct concepts in the domain model and UI; account-aware model picker (provider → account →
models). **Account identity is not model identity.**

### D-013 — Multiple subscription logins as independent named connections
Support multiple Codex/ChatGPT (and Claude) subscription logins as separate named connections;
display real provider identity (email/organization) when available; **warn when two saved
connections resolve to the same underlying account** (shared quota).

### D-014 — No credential hot-swapping; linked handoffs instead
Never hot-swap credentials inside an active provider session. Cross-agent continuation uses
**"Continue with another agent"**: preserve the original session, create a linked child bound
to the chosen account/model, transfer a compact handoff package, link back.

### D-015 — Memory foundation before full Swarm; Markdown is the source of truth
Build the minimal memory layer (Obsidian-compatible Markdown vault + SQLite index + context
packets) after Phase 1 and before Phase 2. SQLite/embeddings support retrieval; they are not
authoritative records.

### D-016 — Provider-neutral, NEXUS-owned orchestration engine with runtime adapters
Agent runtimes (Claude Code CLI, multiple Codex CLIs, Craft-native sessions, API agents, local
models) are adapters behind a common contract. The engine never special-cases the owner's
current subscription set.

### D-017 — Git worktrees are the parallel-agent safety mechanism
One modifying agent per worktree; never two writers in one checkout; every task has an
assigned branch/worktree; integration only after review and quality gates.

### D-018 — Selective external repository reuse with a maintained register
Study multi-agent frameworks for patterns; prefer concepts and clean-room interfaces over
copying subsystems; copy code only with compatible license + documented attribution; isolate
borrowed components behind NEXUS-owned interfaces; record everything in
[`../research/repository-register.md`](../research/repository-register.md).

---

## C. Post-adoption decisions (2026-07-13, owner)

### D-019 — Remove the upstream root `README.md` until the publish phase
Delete the Craft-branded root `README.md` from the fork; a NEXUS README will be written in
the final phase of the project, when it is published for others to use. The upstream text
stays available via the upstream repo and git history (`git show 4289b16:README.md`).
**Consequences:** the repo has no root README until publish; future upstream merges will
surface modify/delete conflicts on `README.md` — resolve by keeping it deleted
([`../development/upstream-sync.md`](../development/upstream-sync.md) §Deliberate deletions).

---

## D. Phase 1 sign-off (2026-07-14, owner)

Answers to the [Phase 1 plan](../plans/phase-1-multi-account-chat.md) §8 questions, given
when the owner authorized implementation.

### D-020 — Copilot identity is in Phase 1 scope
Capture GitHub Copilot account identity within Phase 1 (not a fast-follow), as its **own work
package (PR-1F)** after PR-1A. **Why:** the phase's promise is "the real identity of each
account is visible" — for every OAuth provider the app ships. **Consequence:** the plan gains
PR-1F (GitHub user lookup, fail-soft); the mechanism differs from the Codex JWT decode, so it
stays a separate PR (one concern per PR).

### D-021 — "Craft Agents Backend" picker label does not survive PR-1D
Rename/replace the model-picker group label "Craft Agents Backend" as part of PR-1D's picker
rework (×6 locales) rather than deferring to the UI-copy rebrand workstream. Exact replacement
copy (likely dissolving into per-provider account groups) is approved at PR-1D review.
**Why:** the picker is being rebuilt in that PR anyway; shipping a rebuilt picker that still
says "Craft" is avoidable churn. **Consequence:** a deliberate, bounded carve-out from D-007's
deferred descriptive-copy scope; the rest of the UI-copy rebrand stays deferred.

### D-022 — Handoff action wording: "Continue with another agent"
The PR-1E session action uses the master plan's wording, confirmed as the i18n baseline for
all 6 locales.

### D-023 — `develop` integration branch created; feature PRs target it
`develop` was created from `main` on 2026-07-14. Phase 1+ feature branches are cut from
`develop`; PRs target `develop` on the fork (`origin`); `develop` merges to `main` when a
phase gate passes. **Why:** matches the master plan's decided branch structure; keeps `main`
stable while a phase's multiple PRs integrate. **Consequence:** resolves the roadmap's open
"develop timing" question; docs-maintenance commits by the owner's direct instruction remain
the only exception to branch-first flow (D-010).
