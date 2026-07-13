# Vision

**Status:** `[DECIDED]` — from the canonical plan
([`nexus-master-plan-2026-07-13.md`](./nexus-master-plan-2026-07-13.md)).
**Owner:** LAKHIRA STUDIO.

> **North Star:** One operating system for working with AI agents — chat with them, coordinate
> them, and give them a shared memory that becomes smarter over time.

## Executive summary

NEXUS is a desktop **Agent Operating System** built around three connected experiences:

1. **Chat** — a polished, Craft Agents–style interface for working directly with Claude,
   Codex, API models, local models, tools, sources, and files.
2. **Swarm** — a visual orchestration environment where multiple subscription-backed CLIs and
   API agents collaborate through councils, manager-worker structures, pipelines, parallel
   worktrees, and review loops.
3. **Brain** — an Obsidian-compatible knowledge and memory layer with explicit project
   context, decisions, tasks, handoffs, session summaries, and a Graphify-powered knowledge
   graph.

The goal is **not** to merge several unrelated agent frameworks into one fragile codebase.
NEXUS uses **Craft Agents as the desktop shell and session foundation**, then adds a
provider-neutral orchestration engine and a durable Markdown-first memory layer behind clean
interfaces.

> **Product principle:** The user should never need to repeatedly explain the same project to
> Claude, Codex Account 1, and Codex Account 2. NEXUS packages and transfers only the context
> each agent needs.

## Why this is credible on this codebase

`[UPSTREAM]` The inherited Craft Agents foundation already provides a multi-session desktop
workspace, two agent backends behind one interface, an MCP/REST/local sources system, skills,
per-project memory files, automations, session branching/export, and a WebSocket-RPC seam that
supports headless and remote operation — see
[`../architecture/craft-baseline.md`](../architecture/craft-baseline.md). NEXUS's differentiators
(multi-account identity, orchestration, durable shared memory) are additive layers, not
rewrites.

## Engineering principles

`[DECIDED]` (master plan, verbatim in spirit):

1. **Stable foundation before features.** Run and understand upstream first.
2. **Provider-neutral contracts.** Claude and Codex are adapters, not the architecture.
3. **Account identity is not model identity.** Store and display both separately.
4. **No unsafe mid-session credential swapping.** Use linked handoffs.
5. **Memory is explicit and inspectable.** Decisions cannot exist only inside chat history.
6. **Minimal context, maximum relevance.** Generate task-specific context packets.
7. **One agent, one worktree.** Prevent concurrent modification collisions.
8. **Every handoff is auditable.** Include task, files, branch, commit, tests, blockers, risks.
9. **Human control remains central.** The user can inspect, pause, approve, redirect, or stop.
10. **Upstream-friendly changes.** Extend Craft through focused modules and interfaces.
11. **Testable milestones.** Every phase produces useful working software independently.
12. **No hidden graph truth.** Inferred memory relationships remain reviewable.

## Risks and mitigations

`[DECIDED]` (master plan):

| Risk | Mitigation |
|------|------------|
| Craft upstream changes create large merge conflicts | Minimize invasive core edits, track baseline commit, isolate NEXUS features, sync deliberately ([`../development/upstream-sync.md`](../development/upstream-sync.md)) |
| Multiple agents overwrite one another | Mandatory worktree ownership and branch assignment ([`../development/git-worktrees.md`](../development/git-worktrees.md)) |
| Context packages omit a critical decision | Trace each packet to durable memory records; allow preview before dispatch |
| Duplicate OAuth connections mistaken for separate quota | Resolve and display provider account identity; warn on duplicates |
| CLI sessions and Craft-native sessions behave differently | Normalize through runtime capabilities and adapter metadata |
| Swarm becomes a visual terminal manager without real coordination | Make tasks, artifacts, gates, and handoffs first-class entities |
| Graph contains hallucinated relationships | Mark inferred edges, attach evidence, support user correction |
| Product scope grows too fast | Complete each phase as a useful standalone product before expanding |
