# Repository Strategy

**Status:** facts `[UPSTREAM]`/verified; branch structure `[DECIDED]` (master plan), branches
not yet created.

## Repository facts (verified 2026-07-13)

| Item | Value |
|------|-------|
| Fork (`origin`) | `https://github.com/YashChoudhary13/NEXUS` |
| Upstream | `https://github.com/craft-ai-agents/craft-agents-oss` (remote `upstream`, fetch+push configured) |
| **Baseline commit** | `4289b16` — upstream tag **v0.11.1** (the exact upstream state NEXUS builds on) |
| License | Apache-2.0 (`LICENSE`, `NOTICE` at repo root — never delete; see [`../upstream/README.md`](../upstream/README.md)) |
| Default branch | `main` |

We keep tracking upstream (D-002) and sync deliberately —
[`upstream-sync.md`](./upstream-sync.md).

## Branch structure `[DECIDED]`, creation pending

From the master plan (branches are created as their work begins, not pre-emptively):

```text
main                         Stable NEXUS releases
develop                      Integrated development
feature/account-identity     Account identity and duplicate detection
feature/multi-codex-auth     Multiple ChatGPT/Codex OAuth connections
feature/memory-core          Vault, indexing, and context packets
feature/swarm-engine         Orchestrator and runtime adapters
feature/swarm-ui             Visual agent workspace
feature/brain-ui             Notes and graph interface
```

Plus the already-planned compliance branch: `feature/nexus-identity-and-packaging`
([PR #1](../plans/pr-01-identity-and-packaging.md)).

`[OPEN]` Timing of `develop` creation — see
[roadmap open questions](../product/roadmap.md#open-questions-open).

## Rules

- **No direct commits to `main`** (D-010). Branch → PR → review.
- Upstream naming convention (`CONTRIBUTING.md`): `feature/…`, `fix/…`, `refactor/…`,
  `docs/…` — we keep it.
- One concern per branch/PR (working agreement 6).
- Modifying agents work in **isolated worktrees** — [`git-worktrees.md`](./git-worktrees.md).
- Never rewrite published history; upstream syncs use merges, not rebases of shared branches.

## Attribution

Do not reuse Craft's commit trailer (`Co-Authored-By: Craft Agent <agents-noreply@craft.do>`).
Agents use the attribution their tool/owner specifies. Preserve upstream copyright headers and
`NOTICE` content in derived files.
