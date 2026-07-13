# Agent Bootstrap — start here

> **Audience:** every AI agent working in this repository — **Claude Code**, **Codex CLI**, or
> any other. This folder is the single shared source of truth for agents. The root
> [`AGENTS.md`](../../AGENTS.md) (Codex entry) and [`CLAUDE.md`](../../CLAUDE.md) (Claude
> entry) are thin bootstrap files that point here — the full instructions live in these shared
> documents so the two tools can never drift apart.

## Read order (cold start)

1. **This file** — how to work here.
2. [`project-state.md`](./project-state.md) — **exactly where the last agent left off**, what's
   next, what's blocked. The living handoff.
3. [`working-agreements.md`](./working-agreements.md) — the non-negotiable rules + environment
   quickstart.
4. [`../product/roadmap.md`](../product/roadmap.md) — what we're building, in what order.
5. The doc for your specific task — find it in the [docs index](../README.md).

Deep package-level knowledge (upstream conventions, invariants, i18n rules) lives in
`packages/shared/CLAUDE.md` and `packages/core/CLAUDE.md` — **read the relevant one before
editing that package**, whichever agent you are.

## What NEXUS is (one paragraph)

NEXUS is a desktop **Agent Operating System** with three connected experiences — **Chat** (a
Craft Agents–style interface for working directly with models, tools, sources, and files),
**Swarm** (visual orchestration of multiple subscription-backed CLIs and API agents), and
**Brain** (an Obsidian-compatible knowledge/memory layer with a knowledge graph). It is built
on a fork of Craft Agents, which remains the shell and session foundation. Canonical plan:
[`../product/nexus-master-plan-2026-07-13.md`](../product/nexus-master-plan-2026-07-13.md).

## Content labels you must respect

`[UPSTREAM]` works today (inherited) · `[DECIDED]` confirmed decision · `[PLANNED]` designed,
**not implemented** · `[REFERENCE]` studied, not a dependency · `[OPEN]` needs owner input.

When you write or update docs, label your content. **Never present `[PLANNED]` work as
existing capability**, and never invent decisions — if it isn't in
[`../decisions/`](../decisions/initial-product-decisions.md) or the master plan, it is not
decided.

## 📝 The documentation ritual (mandatory)

After **every final output** — completed task, decision, plan, or code change — and **before
you consider yourself done**:

1. Update [`project-state.md`](./project-state.md): status sections + a dated entry in the
   changelog (what you did, what you learned, what the next agent must know).
2. New decision? Append it to [`../decisions/initial-product-decisions.md`](../decisions/initial-product-decisions.md).
3. Changed architecture, coupling, or baseline reality? Fix the affected doc in
   [`../architecture/`](../architecture/overview.md) / [`../development/`](../development/upstream-sync.md).
4. Finished or re-scoped a milestone? Update [`../product/roadmap.md`](../product/roadmap.md)
   and the relevant [`../plans/`](../plans/phase-0-foundation.md) doc.

Write handoff notes as if the next agent has **zero memory of your session** — because it does,
and it may not even be the same product (Claude ↔ Codex).

## Hard safety rules (summary — full list in working-agreements.md)

- No broad "Craft" → "NEXUS" search-and-replace — several identifiers are load-bearing
  ([`../development/upstream-sync.md`](../development/upstream-sync.md)).
- Preserve upstream-merge compatibility; internal Craft identifiers stay until a dedicated
  approved milestone.
- One concern per PR. No direct commits to `main`. Confirm destructive/outward-facing actions.
- Never expose secret values.
