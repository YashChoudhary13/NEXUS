# Orchestration References

**Status:** `[REFERENCE]` — where each Swarm pattern draws inspiration from. None of these are
dependencies; the engine is NEXUS-owned (D-016). Anything adapted must first get a completed
entry in [`repository-register.md`](./repository-register.md) (D-018).

| NEXUS pattern ([`../architecture/orchestration.md`](../architecture/orchestration.md)) | Studied in | What we take |
|---|---|---|
| Council (independent proposals → chair synthesis) | Agent Council | The mode's shape: parallel proposals, critique, synthesis step |
| Manager & Workers | AgentTeams | Persistent team/worker lifecycle, delegation, blocker tracking |
| Sequential pipeline with explicit artifacts | Maestro-Flow, Metaswarm | Stage → artifact → handoff discipline; mixed CLI runtimes in one pipeline |
| Parallel development in isolated worktrees | Metaswarm | Worktree ownership, Git-native handoffs, quality gates |
| Swarm routing / shared memory / hooks / background workers | Ruflo (Claude Flow) | Routing and shared-memory concepts — evaluate carefully; memory authority stays with the NEXUS vault |
| Adversarial review, solo-with-escalation | General multi-agent literature + the above | Mode definitions only |
| Durable Markdown vault conventions | Obsidian ecosystem | File/link/frontmatter conventions; human editing workflows (conventions only, no code) |
| Knowledge-graph extraction | Graphify | Entity/relationship extraction feeding the Brain graph ([`../architecture/graph-model.md`](../architecture/graph-model.md)) |

## Ground rules when studying these

- Record findings as **patterns and interface sketches**, not copied code.
- Note explicitly where a studied pattern conflicts with NEXUS boundaries (e.g., a framework
  that owns memory truth conflicts with D-015 — Markdown vault is authoritative).
- The orchestration engine must never import a studied framework wholesale — isolation behind
  NEXUS-owned interfaces is mandatory (master-plan reuse rules).
