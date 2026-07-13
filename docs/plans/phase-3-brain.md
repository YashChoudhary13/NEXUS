# Phase 3 — Brain, Obsidian, and Graphify

**Objective:** turn NEXUS memory into a navigable second brain for both the user and agents.
**Status:** `[PLANNED]` — confirmed scope (master plan). Sequenced after
[Phase 2](./phase-2-swarm.md). Nothing below is implemented.

## Scope (confirmed)

- **Brain sections:** Projects · Notes · Goals · Requirements · Architecture · Decisions ·
  Tasks · Agent handoffs · Session summaries · Files and commits · Sources · Knowledge graph.
- **Graph model** (entities, relationships, principles):
  [`../architecture/graph-model.md`](../architecture/graph-model.md).
- **Substrate:** the Memory-foundation vault
  ([`../architecture/memory-system.md`](../architecture/memory-system.md)) — Markdown stays
  authoritative; Graphify (`[REFERENCE]`, register entry required before use) extracts and
  enriches, never replaces.

## Completion criteria (all unmet)

- [ ] The user can browse and edit the vault within NEXUS.
- [ ] The same vault opens cleanly in Obsidian.
- [ ] Projects, decisions, tasks, sessions, and code artifacts appear in the graph.
- [ ] Every graph edge is traceable to evidence or marked as inferred.
- [ ] Agents can query the Brain through controlled retrieval rather than reading the whole
      vault.
- [ ] New sessions automatically contribute reviewed summaries and relationships.

## Notes for the detailed plan (when this phase starts)

- "No hidden graph truth" (principle 12): inferred edges are marked, carry evidence, and are
  user-correctable — this is a hard requirement, not polish.
- Retrieval combines explicit links, structured metadata, recency, task relevance, and
  semantic similarity — embeddings remain non-authoritative (D-015).
- Complete the Graphify entry in the
  [repository register](../research/repository-register.md) (license/commit) before any
  adaptation.
