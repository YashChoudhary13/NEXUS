# CLAUDE.md — NEXUS

Thin bootstrap for Claude Code. **Project instructions are NOT duplicated here** — the
canonical, shared source of truth for all agents (Claude Code **and** Codex) is
[`docs/agents/`](./docs/agents/README.md). This file and [`AGENTS.md`](./AGENTS.md) are
equivalent pointers so the two tools never receive contradictory instructions.

## What this repository is

**NEXUS** — a desktop Agent Operating System (**Chat · Swarm · Brain**) built on a fork of
Craft Agents (Apache-2.0), which remains the shell and session foundation. Canonical plan:
[`docs/product/nexus-master-plan-2026-07-13.md`](./docs/product/nexus-master-plan-2026-07-13.md).

## Read in this order

1. [`docs/agents/README.md`](./docs/agents/README.md) — bootstrap.
2. [`docs/agents/project-state.md`](./docs/agents/project-state.md) — the living handoff.
3. [`docs/agents/working-agreements.md`](./docs/agents/working-agreements.md) — binding rules
   + environment quickstart.
4. Task-specific docs via the index: [`docs/README.md`](./docs/README.md).

Package-scoped deep conventions: `packages/shared/CLAUDE.md` (binding invariants — read before
editing `shared`), `packages/core/CLAUDE.md`.

## Five rules you must not break (full list in working-agreements)

1. 📝 **Update `docs/` after every final output** — at minimum
   [`docs/agents/project-state.md`](./docs/agents/project-state.md).
2. **No broad "Craft" → "NEXUS" search-and-replace** —
   [`docs/development/upstream-sync.md`](./docs/development/upstream-sync.md) lists what must
   stay.
3. **Preserve upstream compatibility** — internal Craft identifiers stay (D-003).
4. **No direct commits to `main`**; one concern per PR; confirm destructive/outward actions.
5. **Label content honestly** — `[UPSTREAM]` / `[DECIDED]` / `[PLANNED]` / `[REFERENCE]` /
   `[OPEN]`; never present planned work as implemented, never invent decisions.
