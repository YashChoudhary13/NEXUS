# Initial Product Decisions (D-001 … D-019)

**Status:** all entries `[DECIDED]` · **Next free ID: D-020** · Conventions:
[`README.md`](./README.md).

Batches, all 2026-07-13: **A)** foundation/fork-strategy decisions from the owner's planning
sessions; **B)** product-direction decisions adopted with the
[master plan](../product/nexus-master-plan-2026-07-13.md); **C)** post-adoption owner
decisions.

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
