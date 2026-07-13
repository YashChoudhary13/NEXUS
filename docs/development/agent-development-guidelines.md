# Agent Development Guidelines — engineering conventions

**Status:** `[DECIDED]` conventions. Behavioral rules (approvals, doc ritual, safety) live in
[`../agents/working-agreements.md`](../agents/working-agreements.md) — this file covers **how
to build**, for any agent (Claude Code, Codex) or human.

## Before writing code

1. Read [`../agents/project-state.md`](../agents/project-state.md) and the plan doc for your
   task ([`../plans/`](../plans/phase-0-foundation.md)).
2. Read [`../architecture/craft-baseline.md`](../architecture/craft-baseline.md) — especially
   §7 (extension points) and §8 (high-conflict files to avoid).
3. Editing `packages/shared`? Read `packages/shared/CLAUDE.md` first — it documents binding
   invariants (permission modes are fixed; source types are fixed; credential handling stays
   in `src/credentials/`; i18n rules; prompt-cache context split; the `updateLlmConnection`
   allowlist; and more). `packages/core/CLAUDE.md` likewise.
4. Check [`upstream-sync.md`](./upstream-sync.md) before touching anything named "craft".

## Branch / worktree / commit

- Branch from the integration branch per [`repository-strategy.md`](./repository-strategy.md);
  never commit to `main` (D-010).
- Modifying agents: claim a worktree per [`git-worktrees.md`](./git-worktrees.md).
- Commits: scoped, conventional prefixes as upstream uses (`feat:`, `fix:`, `chore:`,
  `docs:`…); one concern per commit; no drive-by refactors.
- Do not commit `bun.lock` changes outside the dedicated repo-health change.
- Never commit secrets; `.env` stays untracked.

## Code style

- TypeScript throughout; match the surrounding file's idiom, naming, and comment density.
- Follow existing patterns before inventing new ones (upstream `CONTRIBUTING.md` still
  applies).
- i18n: every user-facing string via `t()`/`i18n.t()`; keys in **all** locale files,
  alphabetized; details in `packages/shared/CLAUDE.md` §i18n.
- New RPC channels must be classified `LOCAL_ONLY` or `REMOTE_ELIGIBLE`
  (`packages/shared/src/protocol/routing.ts`) — a CI test enforces this.
- New session tools go in the canonical registry
  (`packages/session-tools-core/src/tool-defs.ts`), not ad-hoc per-backend.

## Validation before handing off

Run the applicable gates from
[`testing-and-quality-gates.md`](./testing-and-quality-gates.md) and report **actual exit
codes/results** — never "should pass". New behavior needs new tests. If you hit one of the
known inherited failures, say so and leave it alone.

## Handoff quality (principle 8)

Every handoff — PR description, task completion note, or agent-to-agent transfer — includes:
task/objective, branch + commit, diff summary, tests run + results, known risks/blockers, and
the doc updates you made ([ritual](../agents/README.md#-the-documentation-ritual-mandatory)).

## PR checklist

- One concern; accurate title/description; labels honest about `[PLANNED]` vs done.
- Validation results pasted (with the known-failure caveats noted).
- Docs updated (`project-state.md` at minimum; decisions/architecture if applicable).
- No edits to `LICENSE`, `NOTICE`, `TRADEMARK.md`, `SECURITY.md` unless the task is
  explicitly about them.
