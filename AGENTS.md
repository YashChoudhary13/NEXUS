# AGENTS.md — NEXUS

Thin bootstrap for AI agents (Codex CLI entry point). **Do not add project instructions here —
the canonical, shared source of truth for all agents lives in
[`docs/agents/`](./docs/agents/README.md)**, so Claude Code and Codex can never drift apart.

## What this repository is

**NEXUS** — a desktop Agent Operating System (**Chat · Swarm · Brain**) built on a fork of
[Craft Agents](https://github.com/craft-ai-agents/craft-agents-oss) (Apache-2.0), which
remains the shell and session foundation. Canonical plan:
[`docs/product/nexus-master-plan-2026-07-13.md`](./docs/product/nexus-master-plan-2026-07-13.md).

## Read in this order

1. [`docs/agents/README.md`](./docs/agents/README.md) — how to work here (bootstrap).
2. [`docs/agents/project-state.md`](./docs/agents/project-state.md) — **exactly where the last
   agent left off.**
3. [`docs/agents/working-agreements.md`](./docs/agents/working-agreements.md) — binding rules
   + environment quickstart (Bun 1.3.10; known-good commands; known inherited failures).
4. The doc for your task — index: [`docs/README.md`](./docs/README.md).

Editing `packages/shared` or `packages/core`? Read that package's `CLAUDE.md` first — those
conventions bind every agent, not just Claude.

## Five rules you must not break (full list in working-agreements)

1. 📝 **Update `docs/` after every final output** — at minimum
   [`docs/agents/project-state.md`](./docs/agents/project-state.md). You are not done until
   the docs reflect reality.
2. **No broad "Craft" → "NEXUS" search-and-replace** — load-bearing identifiers are catalogued
   in [`docs/development/upstream-sync.md`](./docs/development/upstream-sync.md).
3. **Preserve upstream compatibility** — internal Craft identifiers stay (decision D-003).
4. **No direct commits to `main`**; one concern per PR; confirm destructive/outward actions.
5. **Label content honestly** — `[UPSTREAM]` / `[DECIDED]` / `[PLANNED]` / `[REFERENCE]` /
   `[OPEN]`; never present planned work as implemented, never invent decisions.
