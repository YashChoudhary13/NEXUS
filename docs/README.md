# NEXUS Documentation

**NEXUS** is a desktop **Agent Operating System** — one place to chat with AI agents,
coordinate them, and give them a shared memory that becomes smarter over time. It is built as
a fork of [Craft Agents](https://github.com/craft-ai-agents/craft-agents-oss) (Apache-2.0),
which remains the desktop shell and session foundation.

- **Canonical product plan:** [`product/nexus-master-plan-2026-07-13.md`](./product/nexus-master-plan-2026-07-13.md)
  (authoritative snapshot; the focused documents below decompose it for day-to-day use).
- **AI agents start at:** [`agents/README.md`](./agents/README.md) — then
  [`agents/project-state.md`](./agents/project-state.md) for exactly where work stands.

## Content labels

Every document (and where needed, every section) carries one of these labels so readers never
confuse aspiration with reality:

| Label | Meaning |
|-------|---------|
| `[UPSTREAM]` | **Current upstream capability** — already works today, inherited from Craft Agents. |
| `[DECIDED]` | **Confirmed NEXUS decision** — recorded in [`decisions/`](./decisions/initial-product-decisions.md). |
| `[PLANNED]` | **Planned work** — designed but **not implemented**. Do not describe as existing. |
| `[REFERENCE]` | **Research / reference** — external material we study; not a dependency. |
| `[OPEN]` | **Open question** — needs an owner decision. |

## Map

### For AI agents (shared source of truth for Claude Code **and** Codex)
| Doc | Purpose |
|-----|---------|
| [`agents/README.md`](./agents/README.md) | Canonical bootstrap: read order, rules, doc-update ritual. |
| [`agents/project-state.md`](./agents/project-state.md) | **Living handoff** — status, next steps, changelog. Updated every task. |
| [`agents/working-agreements.md`](./agents/working-agreements.md) | Non-negotiable rules + environment quickstart. |

### Product
| Doc | Purpose |
|-----|---------|
| [`product/vision.md`](./product/vision.md) | North star, executive summary, product principle. |
| [`product/product-map.md`](./product/product-map.md) | The three experiences: Chat, Swarm, Brain. |
| [`product/roadmap.md`](./product/roadmap.md) | Build order, phases, current milestone, supporting workstreams. |
| [`product/first-useful-release.md`](./product/first-useful-release.md) | Definition of the first useful NEXUS release. |
| [`product/nexus-master-plan-2026-07-13.md`](./product/nexus-master-plan-2026-07-13.md) | Archived canonical plan snapshot. |

### Architecture
| Doc | Purpose |
|-----|---------|
| [`architecture/overview.md`](./architecture/overview.md) | Target NEXUS architecture and boundaries. |
| [`architecture/craft-baseline.md`](./architecture/craft-baseline.md) | **The audited upstream baseline** (packages, processes, lifecycles, extension points, high-conflict files). |
| [`architecture/account-and-connection-model.md`](./architecture/account-and-connection-model.md) | Provider / account / model / effort model; multi-account design. |
| [`architecture/runtime-adapters.md`](./architecture/runtime-adapters.md) | `AgentRuntime` adapter contract for CLIs, sessions, APIs, local models. |
| [`architecture/orchestration.md`](./architecture/orchestration.md) | Swarm orchestration modes and the worktree safety model. |
| [`architecture/memory-system.md`](./architecture/memory-system.md) | Markdown vault, SQLite index, context packets. |
| [`architecture/graph-model.md`](./architecture/graph-model.md) | Brain knowledge-graph entities, relationships, principles. |

### Decisions
| Doc | Purpose |
|-----|---------|
| [`decisions/README.md`](./decisions/README.md) | How decisions are recorded. |
| [`decisions/initial-product-decisions.md`](./decisions/initial-product-decisions.md) | Confirmed decisions D-001 … D-023. |

### Development
| Doc | Purpose |
|-----|---------|
| [`development/repository-strategy.md`](./development/repository-strategy.md) | Fork/remotes, baseline commit, branch structure. |
| [`development/git-worktrees.md`](./development/git-worktrees.md) | Worktree ownership rules for parallel agents. |
| [`development/upstream-sync.md`](./development/upstream-sync.md) | Upstream merge strategy, retained Craft identifiers, high-conflict files. |
| [`development/testing-and-quality-gates.md`](./development/testing-and-quality-gates.md) | Verified environment, exact commands + results, known inherited failures. |
| [`development/agent-development-guidelines.md`](./development/agent-development-guidelines.md) | Engineering conventions for agents (branches, commits, tests, PRs). |

### Research
| Doc | Purpose |
|-----|---------|
| [`research/repository-register.md`](./research/repository-register.md) | Register of external repositories studied (license/commit/decision). |
| [`research/orchestration-references.md`](./research/orchestration-references.md) | Where each orchestration pattern comes from. |

### Plans
| Doc | Purpose |
|-----|---------|
| [`plans/phase-0-foundation.md`](./plans/phase-0-foundation.md) | Foundation & repository stabilization (✅ complete 2026-07-14). |
| [`plans/pr-01-identity-and-packaging.md`](./plans/pr-01-identity-and-packaging.md) | Branding/compliance PR #1 (approved plan, awaiting artwork + go). |
| [`plans/phase-1-multi-account-chat.md`](./plans/phase-1-multi-account-chat.md) | Multi-account Chat and safe handoffs (signed off 2026-07-14; in implementation). |
| [`plans/phase-1-kickoff-prompt-codex.md`](./plans/phase-1-kickoff-prompt-codex.md) | Verbatim cold-start prompt issued to the implementing agent for Phase 1. |
| [`plans/memory-foundation.md`](./plans/memory-foundation.md) | Markdown vault + context packets milestone. |
| [`plans/phase-2-swarm.md`](./plans/phase-2-swarm.md) | Swarm orchestration and visual workspace. |
| [`plans/phase-3-brain.md`](./plans/phase-3-brain.md) | Brain UI, Obsidian workflows, knowledge graph. |

### Upstream (Craft Agents)
| Doc | Purpose |
|-----|---------|
| [`upstream/README.md`](./upstream/README.md) | What Craft Agents is; license/trademark/attribution obligations; where upstream docs live. |
| [`upstream/cli.md`](./upstream/cli.md) | Upstream CLI client reference (restored from upstream). |

## Maintenance rule

📝 **Documentation is updated after every final output.** At minimum
[`agents/project-state.md`](./agents/project-state.md); decisions go to
[`decisions/`](./decisions/initial-product-decisions.md). Stale docs are treated as bugs —
if a doc contradicts reality, fixing the doc is part of the task.
