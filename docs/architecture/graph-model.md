# Graph Model — Brain knowledge graph

**Status:** model `[DECIDED]` (master plan); implementation `[PLANNED]` (Phase 3,
[`../plans/phase-3-brain.md`](../plans/phase-3-brain.md)). Nothing graph-related exists in the
codebase today. Graphify is `[REFERENCE]` — see
[`../research/repository-register.md`](../research/repository-register.md).

## Entities

```text
Project · Goal · Requirement · Decision · Task · Agent · Session · Handoff ·
File · Commit · Test · Source · Note
```

## Relationships

```text
Project HAS_GOAL Goal
Goal PRODUCES Task
Task ASSIGNED_TO Agent
Agent CREATED Commit
Commit MODIFIES File
Commit VERIFIED_BY Test
Decision AFFECTS File
Session PRODUCED Handoff
Handoff CONTINUES_AS Session
```

## Principles `[DECIDED]`

- Explicit Markdown metadata and links define the important relationships
  ([`memory-system.md`](./memory-system.md) is the substrate).
- Graphify **extracts and enriches** relationships but does not become the only source of
  truth ("no hidden graph truth" — principle 12).
- Every graph node traces back to a readable record.
- Users can correct or reject inferred relationships; **inferred edges are marked as inferred
  and carry evidence**.
- Retrieval combines explicit links, structured metadata, recency, task relevance, and
  semantic similarity.

## Completion criteria (Phase 3)

See [`../plans/phase-3-brain.md`](../plans/phase-3-brain.md) — including: the vault opens
cleanly in Obsidian; agents query the Brain through **controlled retrieval** rather than
reading the whole vault; new sessions automatically contribute *reviewed* summaries and
relationships.
