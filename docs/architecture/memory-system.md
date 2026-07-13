# Memory System

**Status:** design `[DECIDED]` (master plan); implementation `[PLANNED]`
([`../plans/memory-foundation.md`](../plans/memory-foundation.md), after Phase 1, before
Phase 2). "Upstream today" is `[UPSTREAM]` fact.

## Principle

**Markdown is the durable memory source of truth** (D-015). SQLite and embeddings support
indexing and retrieval — they never silently replace explicit project records. Memory is
explicit and inspectable: decisions cannot exist only inside chat history (principle 5). The
vault must remain **valid Obsidian-readable Markdown**.

## Source-of-truth structure `[PLANNED]`

```text
workspace/
└── .nexus/
    ├── projects/
    │   └── project-name/
    │       ├── project.md
    │       ├── goals.md
    │       ├── architecture.md
    │       ├── requirements/
    │       ├── decisions/
    │       ├── tasks/
    │       ├── handoffs/
    │       └── sessions/
    └── index/
        └── memory.sqlite
```

## Responsibility split `[DECIDED]`

| Store | Holds |
|-------|-------|
| **Markdown** (authoritative) | Human-readable project context; accepted decisions; goals & requirements; tasks + acceptance criteria; agent handoffs; session summaries; explicit links/relationships |
| **SQLite** (index) | Search indexes; normalized metadata; relationship indexes; fast task/status queries; graph projection data |
| **Embeddings** (support) | Semantic retrieval; similarity search; context recommendation — **not authoritative records** |

## Context packets `[DECIDED]`

Agents receive **focused context packets**, not raw full-session histories (principle 6 —
minimal context, maximum relevance). A packet contains:

```text
Project identity · Current objective · Assigned task · Relevant accepted decisions ·
Relevant architecture · Relevant files · Current branch and worktree · Recent changes and
commits · Previous handoff · Acceptance criteria · Constraints and prohibited actions ·
Open questions
```

Packets must be traceable to durable memory records, and the user can preview a packet before
dispatch (risk mitigation). Handoff notes are Markdown with YAML frontmatter — worked example
in [`../plans/memory-foundation.md`](../plans/memory-foundation.md).

## Upstream today `[UPSTREAM]`

What already exists, and how the vault relates to it:

- **Per-project `MEMORY.md`** (`packages/shared/src/projects/`) — workspace projects hold a
  memory file injected into the system prompt (~5k-token cap); sessions bind via `projectId`.
- **`preferences.json`** — durable user facts injected every prompt.
- **Session JSONL + bundles** — the raw history/transfer layer; transfer handoffs already
  inject one-shot summaries.
- **Skills' 3-tier `.agents/` lookup** — the established idiom for layered file-based config.

The `.nexus/` vault **supersedes none of these initially** — it adds the structured,
Obsidian-compatible project layer. `[OPEN]` Whether project `MEMORY.md` eventually merges into
the vault (e.g., `project.md`) is a Memory-foundation design decision; don't pre-empt it.

## Non-goals (for the foundation milestone)

No knowledge graph yet (that's [Phase 3](../plans/phase-3-brain.md) —
[`graph-model.md`](./graph-model.md)); no vector DB requirement in v1; no replacement of the
upstream session persistence.
