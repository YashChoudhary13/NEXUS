# Phase 2 — Swarm and Multi-Agent Orchestration

**Objective:** coordinate multiple subscription-backed CLIs, Craft sessions, API models, and
local agents in one visual workspace.
**Status:** `[PLANNED]` — confirmed scope (master plan). Sequenced after the
[Memory foundation](./memory-foundation.md). Nothing below is implemented.

## Architecture inputs (confirmed)

- Adapter contract + initial runtime list:
  [`../architecture/runtime-adapters.md`](../architecture/runtime-adapters.md) (D-016).
- Orchestration modes (Council, Manager & Workers, Sequential Pipeline, Parallel Development,
  Adversarial Review, Solo with Escalation) + worktree safety model:
  [`../architecture/orchestration.md`](../architecture/orchestration.md) (D-017).
- Pattern sources: [`../research/orchestration-references.md`](../research/orchestration-references.md)
  — study before designing, register before adapting (D-018).

## Swarm interface (confirmed spec)

Each visual agent card shows: role · provider, account, and model · current task · run status ·
branch and worktree · context usage · changed files · latest output · current blocker or
permission request · last handoff · controls (open, pause, stop, inspect, vault).

```text
┌──────────────────────────────┐
│ Claude Architect             │
│ Planning                     │
│                              │
│ Task: Account identity       │
│ Branch: agent/identity-plan  │
│ Context: 31K                 │
│ Status: Working              │
│                              │
│ [Open] [Pause] [Vault]       │
└──────────────────────────────┘
```

Guardrail (named risk): Swarm must not become a visual terminal manager — tasks, artifacts,
review gates, and handoffs are first-class entities.

## Completion criteria (all unmet)

- [ ] All runtimes implement the common adapter contract.
- [ ] A user can assign roles and accounts visually.
- [ ] Council mode works end to end.
- [ ] Sequential pipeline mode works end to end.
- [ ] Parallel work creates isolated worktrees.
- [ ] Review gates can approve, reject, or request revision.
- [ ] Every task produces an auditable handoff.
- [ ] The user can inspect live output without losing the high-level workflow view.

## Notes for the detailed plan (when this phase starts)

- CLI adapters (Claude Code CLI, Codex CLI) are new territory — no upstream precedent; the
  open implementation questions are listed in
  [`runtime-adapters.md`](../architecture/runtime-adapters.md).
- Upstream building blocks to reuse: `spawn_session`, automations event bus, background
  `TaskRunner`, session statuses/labels, messaging gateway
  ([`craft-baseline.md`](../architecture/craft-baseline.md) §7).
- New UI surface mounts alongside the panel-stack navigation
  ([`craft-baseline.md`](../architecture/craft-baseline.md) §5).
