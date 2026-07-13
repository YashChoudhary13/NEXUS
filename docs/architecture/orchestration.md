# Orchestration — Swarm engine

**Status:** modes & safety model `[DECIDED]` (master plan); engine implementation `[PLANNED]`
(Phase 2, [`../plans/phase-2-swarm.md`](../plans/phase-2-swarm.md)).

## Ownership

The orchestration engine is **NEXUS-owned and provider-neutral** (D-016). External frameworks
(AgentTeams, Metaswarm, Maestro-Flow, Ruflo/Claude Flow, Agent Council) are **patterns to
study, not dependencies** — see
[`../research/orchestration-references.md`](../research/orchestration-references.md) and the
reuse rules in [`../research/repository-register.md`](../research/repository-register.md).

Tasks, artifacts, review gates, and handoffs are **first-class entities** — otherwise Swarm
degenerates into a visual terminal manager (named risk in the master plan).

## Orchestration modes `[DECIDED]` (to be implemented)

| Mode | Shape |
|------|-------|
| **Council** | Agents independently propose; a chair agent compares, critiques, synthesizes. |
| **Manager & Workers** | One lead decomposes a goal, creates tasks, delegates, tracks blockers, consolidates. |
| **Sequential Pipeline** | Each stage produces an explicit artifact + handoff for the next (plan → implement → review → accept/revise). |
| **Parallel Development** | Agents work simultaneously on independent modules in separate Git worktrees/branches. |
| **Adversarial Review** | One builds, one hunts failures, a verifier runs tests/quality gates. |
| **Solo with Escalation** | A primary agent invokes another runtime only when uncertainty/review/special work requires it. |

```text
Council                      Pipeline                    Parallel
Question                     Claude plans                Codex 1 → backend worktree
├── Claude proposal              ↓                       Codex 2 → frontend worktree
├── Codex 1 proposal         Codex 1 implements          Claude  → architecture worktree
└── Codex 2 proposal             ↓
        ↓                    Codex 2 reviews
Chair synthesis                  ↓
                             Claude accepts / revises
```

## Worktree safety model `[DECIDED]`

Binding rules (D-017; full conventions in
[`../development/git-worktrees.md`](../development/git-worktrees.md)):

- One modifying agent owns one worktree at a time.
- Two agents never write to the same checkout concurrently.
- Every task has an assigned branch and worktree.
- Handoffs include branch, commit, diff summary, tests, known risks (auditable — principle 8).
- Integration happens only after review and quality gates.

## Building blocks upstream already provides `[UPSTREAM]`

- `spawn_session` tool + linked sessions/branching (`SessionBundle`).
- Automations event system (app + agent lifecycle events, cron ticks) — natural trigger bus.
- Background `TaskRunner` (`packages/server-core/src/tasks/`).
- Multi-session UI with statuses/labels — the raw material for task boards.
- Messaging gateway (Telegram/WhatsApp) for out-of-app notifications.

## Swarm UI expectations

Agent cards (role, provider/account/model, current task, status, branch/worktree, context
usage, changed files, latest output, blocker/permission, last handoff, controls) — spec lives
in [`../plans/phase-2-swarm.md`](../plans/phase-2-swarm.md).
