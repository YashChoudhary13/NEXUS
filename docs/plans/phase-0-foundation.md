# Phase 0 — Foundation and Repository Stabilization

**Objective:** establish a clean, reproducible NEXUS fork before implementing product changes.
**Status:** 🟡 **nearly complete** (statuses verified 2026-07-13). **No feature implementation
begins before this gate.**

## Scope (from the [master plan](../product/nexus-master-plan-2026-07-13.md))

Fork → clone → `upstream` remote → build and run the unmodified app → run the test suite →
record the baseline commit → preserve Apache-2.0 notices → document the architecture →
identify merge-conflict hot spots → establish branch/worktree/test/review/commit conventions.

## Completion criteria — current status

| Criterion | Status | Evidence |
|-----------|--------|----------|
| The untouched upstream app runs locally | 🟡 **Partial** | `electron:build:{main,preload,renderer}` all pass (exit 0). **Interactive launch smoke-test not yet performed** (`bun run electron:dev`) — the one remaining verification. |
| Tests pass or all pre-existing failures are documented | ✅ | 108 shared tests pass; every failure categorized in [`../development/testing-and-quality-gates.md`](../development/testing-and-quality-gates.md) |
| The exact baseline commit is recorded | ✅ | `4289b16` (v0.11.1) — [`../development/repository-strategy.md`](../development/repository-strategy.md) |
| The architecture audit is reviewed | ✅ | [`../architecture/craft-baseline.md`](../architecture/craft-baseline.md); owner reviewed the audit report 2026-07-13 and approved strategy from it (D-001) |
| Development conventions are committed | 🟡 **Written, not committed** | [`../development/`](../development/repository-strategy.md) docs exist; the whole docs set is uncommitted pending owner go-ahead (D-010 — see [project-state blockers](../agents/project-state.md)) |
| Apache-2.0 notices preserved | ✅ | `LICENSE`, `NOTICE`, `TRADEMARK.md`, `SECURITY.md` untouched ([`../upstream/README.md`](../upstream/README.md)) |
| Merge-conflict hot spots identified | ✅ | [`craft-baseline.md`](../architecture/craft-baseline.md) §8 + [`upstream-sync.md`](../development/upstream-sync.md) |
| `docs/research/repository-register.md` created | ✅ | [Register](../research/repository-register.md) (reference entries pending inspection) |
| Detailed Phase 1 implementation plan produced | ❌ **Not started** | Scope doc exists ([`phase-1-multi-account-chat.md`](./phase-1-multi-account-chat.md)); the detailed plan is the next major deliverable |

## Remaining work to close Phase 0

1. **Launch smoke-test** the unmodified app (`bun run electron:dev`), record the result here.
2. **Owner:** approve a branch + commit for the documentation/conventions set (D-010).
3. **Produce the detailed Phase 1 implementation plan** (see `[OPEN]` path question in the
   [roadmap](../product/roadmap.md#open-questions-open)).

## Related but separate: PR #1 (branding/compliance)

The trademark-required identity work ([`pr-01-identity-and-packaging.md`](./pr-01-identity-and-packaging.md))
is **not** a Phase 0 criterion — it's a parallel compliance workstream, already planned and
owner-scoped, blocked on artwork (D-008). It does not gate Phase 1 planning.
