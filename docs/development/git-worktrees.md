# Git Worktrees — parallel-agent safety

**Status:** rules `[DECIDED]` (D-017, master plan); tooling/automation around them
`[PLANNED]` (Phase 2). Nothing enforces this yet — until then it is **procedure**, followed by
every agent and every human.

## The rules (binding)

1. **One modifying agent owns one worktree at a time.**
2. **Two agents never write to the same checkout concurrently.** (Read-only
   inspection of another worktree is fine.)
3. **Every task has an assigned branch and worktree.**
4. **Handoffs include:** branch, commit, diff summary, tests run + results, known risks.
5. **Integration only after review and quality gates** — no direct merges from a worker
   branch into `main`/`develop` without the gate.

## Layout convention

```text
<repo>/                      main checkout (humans; agent coordination)
../nexus-worktrees/          sibling directory for agent worktrees
├── claude-architecture/     e.g. branch agent/claude-architecture
├── codex-backend/           e.g. branch agent/codex-backend
└── codex-review/            e.g. branch agent/codex-review
```

Keep worktrees **outside** the main checkout (a sibling directory) so tooling that walks the
repo (builds, ripgrep, the app's own context-file discovery) never sweeps other agents' trees.

## Commands (reference)

```bash
git worktree add ../nexus-worktrees/codex-backend -b agent/codex-backend
git worktree list
git worktree remove ../nexus-worktrees/codex-backend   # after merge; use --force only for abandoned work
git worktree prune
```

## Practical notes for this repo

- Each worktree needs its own `bun install` (`node_modules` is per-checkout; the hoisted
  linker config in `bunfig.toml` applies everywhere).
- ⚠️ Do not run two Electron dev instances against the same `~/.craft-agent/` config dir;
  upstream supports `CRAFT_CONFIG_DIR` / numbered-instance separation if parallel app runs are
  ever needed.
- The uncommitted-work protection rule applies per-worktree: an agent must not touch a
  worktree with uncommitted changes it does not own.
