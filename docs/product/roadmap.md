# Roadmap

**Status:** build order `[DECIDED]` (master plan); per-item statuses labeled.
**Last updated:** 2026-07-13.

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
| **Phase 0 — Foundation & repository stabilization** | [`../plans/phase-0-foundation.md`](../plans/phase-0-foundation.md) | 🟡 Nearly complete — remaining: launch smoke-test, commit docs/conventions, produce Phase 1 detailed plan |
| **Phase 1 — Multi-account Chat foundation** | [`../plans/phase-1-multi-account-chat.md`](../plans/phase-1-multi-account-chat.md) | `[PLANNED]` — scoped in master plan; detailed implementation plan **not yet produced** |
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
| UI copy rebrand (~20+ descriptive "Craft Agents" strings × 6 locales) | same | `[PLANNED]` — deferred by D-007 |
| Craft-hosted service decoupling (docs MCP, OAuth relay, session sharing, `agents.craft.do`) | same §Technically significant | `[DECIDED]` direction (D-005, D-006: keep for now; docs MCP becomes optional/off later); execution `[PLANNED]` |
| Security hardening (credential key model, env-strip allowlist, token compare, TLS enforcement) | [`../architecture/craft-baseline.md`](../architecture/craft-baseline.md) §9 | `[DECIDED]` as a later dedicated milestone (D-009); scope `[PLANNED]` |

## Current milestone: **Craft Foundation Ready**

Goal: reach the point where Phase 1 implementation can begin safely.

- [x] Create the official NEXUS repository fork (`YashChoudhary13/NEXUS`)
- [x] Clone it locally
- [x] Add the Craft repository as `upstream`
- [x] Build the unchanged desktop application (main/preload/renderer builds pass)
- [ ] Launch smoke-test of the unmodified app (interactive run not yet performed)
- [x] Run the test suite (shared tests pass; all pre-existing failures documented)
- [x] Record the upstream baseline commit (`4289b16`, v0.11.1 — [`../development/repository-strategy.md`](../development/repository-strategy.md))
- [x] Create `docs/architecture/craft-baseline.md`
- [x] Create `docs/research/repository-register.md`
- [x] Establish branch and worktree conventions ([`../development/`](../development/repository-strategy.md)) — *written; commit pending owner go-ahead*
- [ ] Produce the detailed Phase 1 implementation plan

## Open questions `[OPEN]`

1. **Phase 1 plan path.** The master plan references
   `docs/superpowers/plans/2026-07-13-multi-account-chat-foundation.md`; this repo
   standardizes on `docs/plans/`. Proposed: write the detailed plan at
   `docs/plans/phase-1-multi-account-chat.md` (extending the existing scope doc). Confirm.
2. **Committing the docs.** Everything in `docs/` (+ root `AGENTS.md`/`CLAUDE.md`) is
   uncommitted; D-010 forbids direct `main` commits. Approve a `docs/…` branch + PR?
3. **Root `README.md`.** Still fully Craft-branded (upstream text). A one-line pointer to
   `docs/README.md` requires owner permission (file is outside `docs/`).
4. **`develop` branch.** The master plan's recommended git structure includes `develop`;
   create it now or defer until Phase 1 implementation starts?
5. **PR #1 artwork + go-ahead** (carried over; D-008).
