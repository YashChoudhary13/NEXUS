# Working Agreements — rules every agent follows

**Status:** `[DECIDED]` — these are standing instructions from the owner (LAKHIRA STUDIO),
recorded across the 2026-07-13 planning sessions and the master plan's engineering principles.

## Non-negotiable rules

1. **Read before you write.** Read [`project-state.md`](./project-state.md) and the relevant
   reference doc before changing anything. Cite concrete file paths (`path/to/file.ts:line`).
2. **📝 Update the docs after every final output** (see the ritual in
   [`README.md`](./README.md)). Not optional. A task that leaves `docs/` stale is unfinished.
3. **No broad global search-and-replace**, especially "Craft" → "NEXUS". Load-bearing
   identifiers are catalogued in [`../development/upstream-sync.md`](../development/upstream-sync.md);
   sweeping them breaks the app or corrupts user data. Rename deliberately, per approved plan.
4. **Preserve upstream compatibility.** We keep merging from
   `craft-ai-agents/craft-agents-oss`. Do **not** rename `@craft-agent/*` packages, `CRAFT_*`
   env vars, `~/.craft-agent/`, the `CRAFT01` credential markers, the `__craftRpcType` RPC
   codec key, or the `craftagents://` scheme without a dedicated approved milestone (decision
   D-003).
5. **Don't rewrite working systems for aesthetics.** Craft Agents is the foundation — extend
   through focused modules, wrappers, and extension points
   ([`../architecture/craft-baseline.md`](../architecture/craft-baseline.md) §7) instead of
   invasive core edits.
6. **One concern per PR.** Never mix branding + architecture + features in one change.
7. **Provider-neutral contracts.** Claude and Codex are adapters, not the architecture
   (master-plan engineering principle 2). Don't special-case "one Claude and two Codex
   accounts" — that's the first configuration, not the limit.
8. **No unsafe mid-session credential swapping** (decision D-014). Cross-agent continuation
   goes through linked handoff sessions.
9. **One agent, one worktree** for modifying work
   ([`../development/git-worktrees.md`](../development/git-worktrees.md)). Two agents never
   write to the same checkout concurrently.
10. **Human control remains central.** Confirm destructive or outward-facing actions (push,
    PR, delete, remote changes, publishing) before acting; approval in one context does not
    extend to the next.
11. **Don't commit directly to `main`** (decision D-010). Branch first; commit/push only when
    the owner asks.
12. **Never expose secret values** in output, logs, commits, or docs.
13. **Don't claim planned features are implemented.** Label content honestly
    (`[UPSTREAM]` / `[DECIDED]` / `[PLANNED]` / `[REFERENCE]` / `[OPEN]`).
14. **Licensing hygiene.** Never delete `LICENSE`, `NOTICE`, `TRADEMARK.md`, `SECURITY.md`, or
    attribution content. External code reuse goes through
    [`../research/repository-register.md`](../research/repository-register.md) first
    (decision D-018).

## Environment quickstart (verified 2026-07-13, macOS arm64)

```bash
# Bun 1.3.10 — the exact version CI pins. Node 24.x and Python 3.13 also present.
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.10"
export PATH="$HOME/.bun/bin:$PATH"

bun install        # ⚠️ `--frozen-lockfile` currently FAILS (stale lockfile — inherited issue)

# Known-good validations (no credentials needed):
bun run typecheck:electron   # ✅
bun run test:shared:all      # ✅ 108 tests
bun run lint:i18n:parity && bun run lint:i18n:sorted   # ✅
bun run electron:build       # ✅ main + preload + renderer

# Run the app:
bun run electron:dev         # hot reload
```

Full command matrix, exit codes, and the categorized list of **known inherited failures you
must not "fix" as a side effect** (missing `tsconfig.base.json`, stripped scripts, stale
lockfile, non-CI-gated eslint debt):
[`../development/testing-and-quality-gates.md`](../development/testing-and-quality-gates.md).

## Communication conventions

- State assumptions explicitly; mark uncertainty (`⚠️ unverified`, `[OPEN]`).
- Use absolute dates (`2026-07-13`), never "today"/"yesterday".
- Prefer links between focused docs over duplicating content.
- When blocked on a genuinely owner-level decision, ask — don't guess on irreversible things.
- Do not reuse Craft's git co-author trailer (`agents-noreply@craft.do`); use the attribution
  your tool/owner specifies.
