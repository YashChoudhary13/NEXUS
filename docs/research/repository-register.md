# Repository Register

**Status:** `[REFERENCE]` — register required by D-018 and the master plan's reference
strategy. **Rule: no code is copied from any repository until its entry here is completed and
its license verified.** Prefer concepts and clean-room interfaces over copying subsystems;
isolate anything borrowed behind NEXUS-owned interfaces.

Each entry must record: URL · license · commit inspected · feature studied · files/components
considered · decision (reference / adapt / copy-with-attribution / reject) · reason ·
compatibility risks · upstream update strategy.

---

## Craft Agents (the foundation) — entry complete

| Field | Value |
|-------|-------|
| URL | `https://github.com/craft-ai-agents/craft-agents-oss` |
| License | Apache-2.0 (no CLA; `NOTICE` + `TRADEMARK.md` obligations — [`../upstream/README.md`](../upstream/README.md)) |
| Commit inspected | `4289b16` (v0.11.1) — full audit: [`../architecture/craft-baseline.md`](../architecture/craft-baseline.md) |
| Feature studied | Entire system (shell, sessions, providers, sources, permissions, tools, transport) |
| Decision | **Foundation** — forked wholesale; NEXUS is a derivative work |
| Compatibility risks | Upstream drift in hot-spot files ([`../development/upstream-sync.md`](../development/upstream-sync.md)) |
| Update strategy | Tracked `upstream` remote; deliberate merges (D-002) |

## Reference ecosystems — entries pending inspection ⚠️

The master plan names these for the value listed below. **URLs, licenses, and commits are
deliberately not filled in — they have not been inspected yet.** Do not guess them; complete
an entry (verified URL + license + commit) before adapting anything from that source.

| Ecosystem | Primary value to NEXUS (per master plan) | Status |
|-----------|------------------------------------------|--------|
| **AgentTeams** | Persistent agent teams, messaging, worker lifecycle, harness concepts | TBD — not yet inspected |
| **Agent Council** | Council mode and chair-synthesis pattern | TBD — not yet inspected |
| **Metaswarm** | Handoffs, worktrees, quality gates, Git-native knowledge | TBD — not yet inspected |
| **Maestro-Flow** | Mixed CLI runtimes, pipelines, parallel delegation | TBD — not yet inspected |
| **Ruflo / Claude Flow** | Swarm routing, shared memory, hooks, background workers | TBD — not yet inspected |
| **Obsidian ecosystem** | Portable Markdown vault conventions, human editing workflows | TBD — conventions reference only (no code planned) |
| **Graphify** | Knowledge extraction, entity relationships, graph generation | TBD — not yet inspected |

### Entry template (copy for each inspection)

```markdown
## <Name>
| Field | Value |
|-------|-------|
| URL | <verified URL> |
| License | <verified license> |
| Commit inspected | <sha> |
| Feature studied | … |
| Files/components considered | … |
| Decision | reference / adapt / copy with attribution / reject |
| Reason | … |
| Compatibility risks | … |
| Upstream update strategy | … |
```

Pattern-to-source mapping for orchestration ideas:
[`orchestration-references.md`](./orchestration-references.md).
