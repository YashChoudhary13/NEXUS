# Phase 0 — Foundation and Repository Stabilization

**Objective:** establish a clean, reproducible NEXUS fork before implementing product changes.
**Status:** ✅ **COMPLETE** (2026-07-14). The gate is open: Phase 1 implementation may begin
once the owner approves the
[detailed Phase 1 plan](./phase-1-multi-account-chat.md).

## Scope (from the [master plan](../product/nexus-master-plan-2026-07-13.md))

Fork → clone → `upstream` remote → build and run the unmodified app → run the test suite →
record the baseline commit → preserve Apache-2.0 notices → document the architecture →
identify merge-conflict hot spots → establish branch/worktree/test/review/commit conventions.

## Completion criteria — current status

| Criterion | Status | Evidence |
|-----------|--------|----------|
| The untouched upstream app runs locally | ✅ | Launch smoke-test 2026-07-14: `bun run electron:dev` — builds, launches, renderer loads, ConfigWatcher/Automations/Scheduler initialize, runs steadily ~2 min, clean SIGTERM shutdown (exit 0). One benign fresh-state error line ("No LLM connection found for slug: null"). ⚠️ Caveat discovered: `CRAFT_CONFIG_DIR` isolation is **partial** — see [`testing-and-quality-gates.md`](../development/testing-and-quality-gates.md#launch-smoke-test-2026-07-14) |
| Tests pass or all pre-existing failures are documented | ✅ | 108 shared tests pass; every failure categorized in [`../development/testing-and-quality-gates.md`](../development/testing-and-quality-gates.md) |
| The exact baseline commit is recorded | ✅ | `4289b16` (v0.11.1) — [`../development/repository-strategy.md`](../development/repository-strategy.md) |
| The architecture audit is reviewed | ✅ | [`../architecture/craft-baseline.md`](../architecture/craft-baseline.md); owner reviewed the audit report 2026-07-13 and approved strategy from it (D-001) |
| Development conventions are committed | ✅ | [`../development/`](../development/repository-strategy.md) — committed to `main` on the fork 2026-07-13 (owner-authorized direct push) |
| Apache-2.0 notices preserved | ✅ | `LICENSE`, `NOTICE`, `TRADEMARK.md`, `SECURITY.md` untouched ([`../upstream/README.md`](../upstream/README.md)) |
| Merge-conflict hot spots identified | ✅ | [`craft-baseline.md`](../architecture/craft-baseline.md) §8 + [`upstream-sync.md`](../development/upstream-sync.md) |
| `docs/research/repository-register.md` created | ✅ | [Register](../research/repository-register.md) (reference entries pending inspection) |
| Detailed Phase 1 implementation plan produced | ✅ | [`phase-1-multi-account-chat.md`](./phase-1-multi-account-chat.md) (2026-07-14) — grounded in verified code investigation; awaiting owner review |

## Remaining work to close Phase 0

None — all criteria met 2026-07-14. Follow-on work lives in the
[roadmap](../product/roadmap.md) (Phase 1 go-ahead, PR #1 artwork).

## Related but separate: PR #1 (branding/compliance)

The trademark-required identity work ([`pr-01-identity-and-packaging.md`](./pr-01-identity-and-packaging.md))
is **not** a Phase 0 criterion — it's a parallel compliance workstream, already planned and
owner-scoped, blocked on artwork (D-008). It does not gate Phase 1 planning.
