# Architecture Overview — target NEXUS system

**Status:** target architecture `[DECIDED]` (master plan); most NEXUS-specific layers are
`[PLANNED]`. What exists **today** is documented in
[`craft-baseline.md`](./craft-baseline.md) — read that first when working on real code.

## Canonical target architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                        NEXUS Desktop                         │
│                                                              │
│   Chat                    Swarm                    Brain       │
│   ────                    ─────                    ─────       │
│   Sessions                Agent cards              Notes       │
│   Accounts                Tasks & pipelines        Projects    │
│   Models                  Worktrees                Decisions   │
│   Tools                   Live outputs             Handoffs    │
│   Sources                 Reviews                  Graph       │
└───────────────┬─────────────────────┬────────────────────────┘
                │                     │
                ▼                     ▼
      ┌─────────────────┐   ┌────────────────────────┐
      │ Agent Runtimes  │   │ NEXUS Memory Service   │
      │                 │   │                        │
      │ Claude Code CLI │   │ Markdown source truth  │
      │ Codex CLI #1    │   │ SQLite metadata/index  │
      │ Codex CLI #2    │   │ Context packet builder │
      │ Craft sessions  │   │ Graph extraction       │
      │ API agents      │   │ Retrieval & summaries  │
      │ Local models    │   │                        │
      └────────┬────────┘   └───────────┬────────────┘
               │                        │
               └──────── Git / Files ───┘
```

## Layer-by-layer status

| Layer | Today | Target |
|-------|-------|--------|
| Desktop shell (windows, panels, sessions UI) | `[UPSTREAM]` Craft Agents Electron app | Kept as foundation; Swarm/Brain surfaces added alongside Chat |
| Chat sessions | `[UPSTREAM]` `SessionManager` + two backends (Claude Agent SDK, Pi SDK) | Kept; gains account-aware selection ([`account-and-connection-model.md`](./account-and-connection-model.md)) |
| Accounts / identity | `[UPSTREAM]` `LlmConnection` list (partial identity capture) | `[PLANNED]` provider-neutral `AgentAccount`/`AuthIdentity` + duplicate detection |
| Agent runtimes | `[UPSTREAM]` in-process backends only (SDK/subprocess) | `[PLANNED]` `AgentRuntime` adapters incl. external CLIs ([`runtime-adapters.md`](./runtime-adapters.md)) |
| Orchestration | `[UPSTREAM]` primitives only (`spawn_session`, automations, background tasks) | `[PLANNED]` NEXUS-owned engine + modes ([`orchestration.md`](./orchestration.md)) |
| Memory | `[UPSTREAM]` per-project `MEMORY.md` + preferences + session JSONL | `[PLANNED]` `.nexus/` Markdown vault + SQLite index + context packets ([`memory-system.md`](./memory-system.md)) |
| Knowledge graph | — (nothing today) | `[PLANNED]` Phase 3 ([`graph-model.md`](./graph-model.md)) |
| Git / worktrees | `[UPSTREAM]` agents run shell/git like any tool | `[DECIDED]` one-agent-one-worktree safety model ([`../development/git-worktrees.md`](../development/git-worktrees.md)) |

## Architectural boundaries (binding)

`[DECIDED]` — see [`../product/product-map.md`](../product/product-map.md) §Architectural
boundaries: Craft Agents stays the shell; the orchestration engine is NEXUS-owned and
provider-neutral; Markdown is the durable memory source of truth; runtimes are adapters;
modifying agents are isolated in worktrees.

## Where new NEXUS code should live

`[PLANNED]` guidance, consistent with upstream conventions and the "upstream-friendly changes"
principle — confirm per-feature at implementation-plan time:

- Prefer **new packages** (e.g., a memory service or orchestration engine package) over
  edits inside `packages/shared` where feasible.
- When extending upstream systems (connections, sessions), use the documented extension
  points in [`craft-baseline.md`](./craft-baseline.md) §7 and heed its warnings (e.g., the
  `updateLlmConnection` allowlist).
- New UI surfaces (Swarm, Brain) mount alongside existing panel-stack navigation rather than
  replacing it.
- Avoid the high-conflict files list ([`craft-baseline.md`](./craft-baseline.md) §8) unless
  the change genuinely belongs there.
