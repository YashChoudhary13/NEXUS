# Roadmap

**Status:** build order `[DECIDED]` (master plan); per-item statuses labeled.
**Last updated:** 2026-07-14.

## Build order

```text
Phase 0  →  Fork, run, test, and document Craft Agents          ← nearly complete
Phase 1  →  Multi-account Chat and safe agent handoffs
Memory   →  Markdown vault, project context, and context packets
Phase 2  →  Runtime adapters, orchestration engine, and Swarm UI
Phase 3  →  Brain UI, Obsidian workflows, and Graphify graph
```

> `[DECIDED]` **Do not start with the full Swarm UI or graph.** First prove that multiple
> accounts can be authenticated, identified, selected, and handed off safely inside the Chat
> experience (D-015: memory foundation before full Swarm; Phase-gated build order).

## Product phases

| Phase | Plan | Status |
|-------|------|--------|
| **Phase 0 — Foundation & repository stabilization** | [`../plans/phase-0-foundation.md`](../plans/phase-0-foundation.md) | ✅ **Complete** (2026-07-14) |
| **Phase 1 — Multi-account Chat foundation** | [`../plans/phase-1-multi-account-chat.md`](../plans/phase-1-multi-account-chat.md) | `[DECIDED]` — **signed off 2026-07-14 (D-020…D-023); implementation authorized** and delegated ([kickoff prompt](../plans/phase-1-kickoff-prompt-codex.md)); first act = S1 multi-Codex spike. No Phase 1 code landed yet |
| **Memory foundation — shared project context** | [`../plans/memory-foundation.md`](../plans/memory-foundation.md) | `[PLANNED]` — after Phase 1, before Phase 2 |
| **Phase 2 — Swarm & multi-agent orchestration** | [`../plans/phase-2-swarm.md`](../plans/phase-2-swarm.md) | `[PLANNED]` |
| **Phase 3 — Brain, Obsidian & Graphify** | [`../plans/phase-3-brain.md`](../plans/phase-3-brain.md) | `[PLANNED]` |

The first useful release ships at the end of Phase 1 + Memory foundation — definition:
[`first-useful-release.md`](./first-useful-release.md).

## Supporting workstreams (compliance, health, hardening)

These run alongside the product phases; each is one scoped concern.

| Workstream | Plan / reference | Status |
|------------|------------------|--------|
| **PR #1 — NEXUS identity & packaging** (trademark-required rename, icons, bundle ID, disable Craft auto-update) | [`../plans/pr-01-identity-and-packaging.md`](../plans/pr-01-identity-and-packaging.md) | `[DECIDED]` plan approved & scoped (D-004, D-007, D-008) — **awaiting owner artwork + go-ahead** |
| Repo health (reconstruct missing `tsconfig.base.json`, refresh stale `bun.lock`, dead script refs, eslint debt) | [`../development/testing-and-quality-gates.md`](../development/testing-and-quality-gates.md) | `[PLANNED]` (proposed sequencing: after PR #1) |
| Agent-identity rebrand (system prompt "You are Craft Agent" → NEXUS; co-author trailer) | [`../development/upstream-sync.md`](../development/upstream-sync.md) §Cosmetic | `[PLANNED]` — deliberately excluded from PR #1 |
| UI copy rebrand (~20+ descriptive "Craft Agents" strings × 6 locales) | same | `[PLANNED]` — deferred by D-007 (one bounded carve-out: the "Craft Agents Backend" picker label is replaced in Phase 1 PR-1D, D-021) |
| Craft-hosted service decoupling (docs MCP, OAuth relay, session sharing, `agents.craft.do`) | same §Technically significant | `[DECIDED]` direction (D-005, D-006: keep for now; docs MCP becomes optional/off later); execution `[PLANNED]` |
| Security hardening (credential key model, env-strip allowlist, token compare, TLS enforcement) | [`../architecture/craft-baseline.md`](../architecture/craft-baseline.md) §9 | `[DECIDED]` as a later dedicated milestone (D-009); scope `[PLANNED]` |

## Milestone: **Craft Foundation Ready** — ✅ COMPLETE (2026-07-14)

- [x] Create the official NEXUS repository fork (`YashChoudhary13/NEXUS`)
- [x] Clone it locally
- [x] Add the Craft repository as `upstream` (push URL disabled 2026-07-14 — accidental
      upstream pushes now impossible)
- [x] Build the unchanged desktop application (main/preload/renderer builds pass)
- [x] Launch smoke-test of the unmodified app — **PASS** 2026-07-14 (with a
      `CRAFT_CONFIG_DIR` partial-isolation caveat, see
      [`../development/testing-and-quality-gates.md`](../development/testing-and-quality-gates.md))
- [x] Run the test suite (shared tests pass; all pre-existing failures documented)
- [x] Record the upstream baseline commit (`4289b16`, v0.11.1 — [`../development/repository-strategy.md`](../development/repository-strategy.md))
- [x] Create `docs/architecture/craft-baseline.md`
- [x] Create `docs/research/repository-register.md`
- [x] Establish branch and worktree conventions ([`../development/`](../development/repository-strategy.md)) — committed 2026-07-13
- [x] Produce the detailed Phase 1 implementation plan
      ([`../plans/phase-1-multi-account-chat.md`](../plans/phase-1-multi-account-chat.md), 2026-07-14)

**Current milestone → Phase 1 implementation.** Signed off 2026-07-14 (D-020…D-023);
execution delegated via the [kickoff prompt](../plans/phase-1-kickoff-prompt-codex.md);
first implementation act is the S1 multi-Codex spike (owner performs the two OAuth logins).
PR #1 branding runs in parallel once artwork arrives.

## Open questions `[OPEN]`

1. **PR #1 artwork + go-ahead** (carried over; D-008).

**Resolved:** docs committed and pushed to the fork (2026-07-13, owner-authorized direct
push to `origin/main`); upstream root `README.md` removed until the publish phase (D-019);
Phase 1 plan path = `docs/plans/phase-1-multi-account-chat.md` (2026-07-14, settled by the
owner's instruction to produce the plan); **Phase 1 sign-off + its three §8 questions**
(2026-07-14 → D-020 Copilot in scope, D-021 picker label replaced in PR-1D, D-022 wording
confirmed); **`develop` branch** (2026-07-14 → created, D-023).
