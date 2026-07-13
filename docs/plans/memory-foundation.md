# Memory Foundation — Shared Project Context

**Objective:** create the shared context layer required for reliable handoffs and
orchestration.
**Status:** `[PLANNED]` — confirmed scope (master plan; D-015). **Sequenced after Phase 1 and
before Phase 2.** Nothing below is implemented.

## Design (confirmed)

Authoritative design in
[`../architecture/memory-system.md`](../architecture/memory-system.md): the `.nexus/`
Obsidian-compatible Markdown vault (projects / goals / architecture / requirements /
decisions / tasks / handoffs / sessions) + `index/memory.sqlite`; Markdown authoritative,
SQLite for indexing, embeddings non-authoritative; **context packets** instead of raw session
histories.

## Handoff note format (from the master plan)

```markdown
---
type: handoff
project: nexus
from_agent: claude-architect
to_agent: codex-builder
related_task: implement-account-identity
---

# Goal
Implement provider-neutral OAuth account identity.

# Decisions
- Keep the existing connection-slug credential boundary.
- Do not allow mid-session credential hot-swapping.

# Relevant files
- packages/shared/src/credentials/types.ts
- packages/server-core/src/handlers/rpc/llm-connections.ts
- apps/electron/src/renderer/pages/settings/AiSettingsPage.tsx

# Acceptance criteria
- Two Codex accounts display different identities.
- Duplicate accounts produce a warning.
- Existing single-account users migrate without data loss.
```

*(Illustrative example from the master plan — file paths in a real handoff must be verified
against the codebase at write time.)*

## Completion criteria (all unmet)

- [ ] Every project has a durable project record.
- [ ] Decisions can be stored and retrieved explicitly.
- [ ] Tasks and handoffs have structured metadata.
- [ ] A context packet can be generated for a selected task and agent.
- [ ] Chat handoffs use the context packet instead of full repeated explanations.
- [ ] The files are valid Obsidian-readable Markdown.

## Notes for the detailed plan (when this milestone starts)

- Relationship to upstream `projects/` + `MEMORY.md` is an explicit design decision to make —
  don't silently duplicate ([`memory-system.md`](../architecture/memory-system.md) `[OPEN]`).
- Phase 1 ships a handoff-package **v0** without the vault; this milestone gives packets
  durable backing — plan the upgrade path.
- Packets must be previewable before dispatch and traceable to records (risk mitigations).
