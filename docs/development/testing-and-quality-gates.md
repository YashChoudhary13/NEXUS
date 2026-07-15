# Testing & Quality Gates

**Status:** verified fact (2026-07-13, macOS 24.6 Darwin arm64, baseline `4289b16` v0.11.1).
Reproduce this baseline before trusting your environment. **Do not "fix" the known failures as
a side effect of unrelated work** — they belong to the repo-health workstream
([roadmap](../product/roadmap.md)).

## Environment

| Tool | Version | Notes |
|------|---------|-------|
| **Bun** | **1.3.10** | The exact version CI pins (`oven-sh/setup-bun@v2` in both workflows). No `.bun-version`/`engines` pin exists — CI is authoritative. |
| Node | 24.x | Present for tooling |
| Python | 3.13 | Doc-tool smoke tests (needs `uv`/markitdown — not installed here) |

```bash
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.10"
export PATH="$HOME/.bun/bin:$PATH"
```

## Install

- `bun install --frozen-lockfile` → **FAILS (exit 1)** — *inherited*: committed `bun.lock` is
  stale (workspace versions `0.11.0` vs `package.json` `0.11.1`; still lists the stripped
  `apps/marketing` workspace).
- `bun install` (plain) → works (~1,663 packages); modifies **only `bun.lock`**. Either
  restore it afterward (`git checkout -- bun.lock`) or commit the refresh **only** in the
  dedicated repo-health change.

## Verified command matrix

| Command | Exit | Result | Category |
|---------|------|--------|----------|
| `bun run typecheck:electron` | 0 | ✅ clean | Healthy |
| `bun run test:shared:all` | 0 | ✅ 108 pass / 0 fail | Healthy |
| `bun run lint:i18n:parity` | 0 | ✅ 6 locales × 1,639 keys | Healthy |
| `bun run lint:i18n:sorted` | 0 | ✅ | Healthy |
| `bun run electron:build:main` | 0 | ✅ 43.5 MB bundle (warning: missing base tsconfig) | Healthy |
| `bun run electron:build:preload` | 0 | ✅ | Healthy |
| `bun run electron:build:renderer` | 0 | ✅ Vite ~27 s | Healthy |
| `bun run typecheck:all` | 2 | ❌ fails at `session-tools-core` (`core`/`shared`/`server-core`/`server` passed first) | **Stripped OSS file** |
| `bun run lint:i18n:coverage` | 1 | ❌ `scripts/check-i18n-coverage.ts` missing | Stripped OSS file |
| `bun run lint:ipc-sends` | 127 | ❌ `scripts/check-raw-sends.sh` missing | Stripped OSS file |
| `bun run lint:tool-name-checks` | 127 | ❌ `scripts/check-task-tool-checks.sh` missing | Stripped OSS file |
| `bun run lint:shared` | 1 | ❌ 5 real errors (`craft-shared/no-inline-source-auth-check`) + 12 warnings | **Genuine inherited lint debt** |
| `bun run lint:ui` | 1 | ❌ 3 real errors (`craft-styles/no-nonstandard-shadows`) | Genuine inherited lint debt |

**Not run (needs credentials/tools):** `--validate-server` CLI integration test (needs
`ANTHROPIC_API_KEY`); `test:doc-tools` (Python `uv`/markitdown).

## Launch smoke test (2026-07-14)

`bun run electron:dev` — **PASS.** Full dev build (MCP servers, WA worker, main/preloads,
Vite on 5173), Electron launched with all helper processes, renderer loaded, ConfigWatcher /
AutomationSystem / SchedulerService initialized, ran steadily ~2 minutes, clean SIGTERM
shutdown (exit 0). One benign fresh-state error line: `No LLM connection found for slug: null`
(no connections configured yet).

⚠️ **Isolation caveat (important for parallel/dev testing):** `CRAFT_CONFIG_DIR` is only
**partially honored**. With it set to a scratch dir, global config/preferences/themes/
tool-icons/permissions were created in the scratch dir — but the auto-created default
workspace's `rootPath` resolved to the literal `~/.craft-agent/workspaces/my-workspace`
(tilde path stored in config.json), and window-state/logs/docs syncs also touched
`~/.craft-agent`. The encrypted credential backend likewise hardcodes
`~/.craft-agent/credentials.enc` (`packages/shared/src/credentials/backends/secure-storage.ts`),
so OAuth/API credentials are **not isolated at all** by `CRAFT_CONFIG_DIR`; a scratch instance
using a production slug can overwrite that slug's real credential. A smoke run therefore
writes a skeleton workspace (+ scheduler-tick lines in `events.jsonl`) and credentialed flows
write the real encrypted store even when `CRAFT_CONFIG_DIR` points elsewhere. Treat
`CRAFT_CONFIG_DIR` as isolating *global config only*, not workspace data or credentials.
(Upstream behavior — documented, not fixed; candidate note for the repo-health workstream.)

## Phase 1 PR-1A verification (2026-07-15)

All commands below ran in the isolated `feature/account-identity` worktree with the CI-pinned
Bun 1.3.10 first on `PATH` (`PATH=/tmp/nexus-bun-1.3.10/bin:$PATH`).

| Command | Exit | Result |
|---------|------|--------|
| `bun run test:account-identity` | 0 | ✅ 96 pass / 0 fail / 420 assertions, isolated failed-refresh cleanup 1 pass / 0 fail / 2 assertions, then exact-slug runtime invalidation 1 pass / 0 fail / 5 assertions |
| `cd packages/shared && bun test` | 0 | ✅ 3,017 pass / 0 fail / 12 skip / 5,715 assertions |
| `bun test packages/server-core/src` | 1 | ⚠️ 206 pass / 1 inherited order-dependent failure; clean `develop` fails the same test with 196 pass / 1 fail |
| `bun run typecheck:shared` | 0 | ✅ clean |
| `cd packages/server-core && bun run typecheck` | 0 | ✅ clean |
| `bun run typecheck:electron` | 0 | ✅ clean |
| `bun run webui:typecheck` | 0 | ✅ clean |
| `bun run electron:build` | 0 | ✅ main + preload + renderer + resources + assets |
| changed-file `eslint` from `packages/shared` | 0 | ✅ clean |
| `bun run lint:i18n:parity` | 0 | ✅ 6 locales × 1,639 keys |
| `bun run lint:i18n:sorted` | 0 | ✅ clean |
| `git diff --check` | 0 | ✅ clean |

The focused suite covers provider-target helpers, ChatGPT/Copilot/Claude generation races,
rowless credential cleanup, queued first-time setup versus `updateOnly`, exact runtime
invalidation, and encrypted-store failure/restart behavior. The complete Electron build retains
only the known inherited missing-`tsconfig.base.json` warning and Vite chunk-size warnings.
`typecheck:all` still reaches and fails at the stripped `session-tools-core` `tsconfig.base.json`
dependency after the earlier package typechecks pass; `lint:i18n:coverage` still points to the
inherited missing `scripts/check-i18n-coverage.ts`. PR-1A does not mask or reclassify either
failure. No locale files changed; parity and sorted checks were still rerun and passed.

The full server-core suite's sole failure is also inherited, not introduced by PR-1A:
`refreshConnectionRuntime > records customModels with the per-model supportsImages flag in the
IPC payload` assumes a machine-global `slug-A` connection and therefore receives an undefined
runtime in full-suite order. It passes alone. A detached clean-`develop` worktree reproduced the
same failure (**196 pass / 1 fail / 417 assertions**); this branch reports **206 pass / 1 fail**
because PR-1A adds ten passing server tests. The deterministic PR-1A runtime test is run through
the focused gate.

The real-provider S1 smoke also passed two simultaneous ChatGPT OAuth connections, one locked
chat per slug, and clean-restart restoration. It proves separate user principals and slug-bound
credentials/sessions; because both principals selected the same runtime workspace, independently
billed subscription routing remains `[OPEN]` for the overall Phase 1 acceptance gate.

The 2026-07-15 PR review follow-up added two deletion regressions. The credential-manager test
proves OAuth-only deletion preserves API-key, IAM, and service-account credentials sharing the
same connection slug and that persistence failures name the complete credential account. The
isolated auth-state test drives an `invalid_grant` refresh failure and proves the real cleanup
path never calls whole-slug deletion. The exact runtime filter still expects both invalidation
passes: the pre-delete pass begins disposal, while the post-delete pass catches a runtime created
during credential mutation (required for non-OAuth rows without a credential lifecycle epoch).

## Failure categories explained

- **Stripped OSS files** (not code defects): `tsconfig.base.json` is missing — four tsconfigs
  extend it (`session-tools-core`, `pi-agent-server` ×2, `session-mcp-server`), so their `tsc`
  falls back to a pre-ES6 target and cascades errors; esbuild only warns, so **builds still
  succeed**. Also missing: three lint scripts (above) + release tooling
  (`scripts/{build,release,check-version,oss-sync}.ts`) and apps (`marketing`, `online-docs`)
  referenced by `package.json`.
- **Genuine inherited lint debt:** real violations of upstream's own custom eslint rules in
  `packages/shared/src/sources/token-refresh-manager.ts` (+2 test files) and
  `packages/ui/src/components/annotations/block-markers.ts`, `chat/TurnCard.tsx`. Not caught
  upstream because CI runs `validate:ci`, which does **not** include the eslint `lint` task.
- **Environment:** anything needing production credentials or `uv`.

## CI (upstream, kept)

- `.github/workflows/validate.yml` — on PR/push: Bun 1.3.10 → `bun install --frozen-lockfile`
  → `bun run validate:ci` (typechecks + shared tests + doc-tool smoke + i18n lints).
  ⚠️ Currently would fail at the frozen install / stripped-file steps — part of why the
  repo-health workstream exists.
- `.github/workflows/validate-server.yml` — manual, 3-OS matrix, 21-step CLI integration test
  (needs `ANTHROPIC_API_KEY` secret).

## Quality gates for NEXUS work (baseline expectations)

For any change today, green is required on: `typecheck:electron` (or the relevant package
typechecks), `test:shared:all`, `lint:i18n:parity` + `sorted` (if locales touched), and the
three `electron:build:*` steps (if app code touched) — plus new tests for new behavior.
Phase 2 adds formal review gates for agent-produced work
([`../architecture/orchestration.md`](../architecture/orchestration.md)).
