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
`~/.craft-agent`. A smoke run therefore writes a skeleton workspace (+ scheduler-tick lines in
`events.jsonl`) into the real home config dir even when `CRAFT_CONFIG_DIR` points elsewhere.
Treat `CRAFT_CONFIG_DIR` as isolating *global config*, not *workspace data*. (Upstream
behavior — documented, not fixed; candidate note for the repo-health workstream.)

## Phase 1 PR-1D validation (2026-07-15)

`feature/account-aware-picker` was tested from its isolated worktree with the exact Bun
1.3.10 binary and a dependency proxy whose `@craft-agent/*` links resolve back into that
worktree.

| Gate | Result |
|------|--------|
| `bun run test:account-aware-picker` | ✅ 33 pass / 0 fail |
| `bun test apps/electron/src/renderer` | ✅ 473 pass / 0 fail / 804 assertions |
| `bun run test:shared:all` | ✅ 108 pass / 0 fail |
| `bun run typecheck:electron` | ✅ |
| `bun run typecheck:shared` | ✅ |
| i18n parity + sorted | ✅ 6 translated locales + English, 1,645 keys each |
| ESLint on the four changed Electron files | ✅ 0 errors; 16 inherited hook warnings |
| main/preload/toolbar/interceptor/renderer bundles + asset copy | ✅ |
| built desktop app, isolated synthetic profile | ✅ Provider → Account → Model hierarchy and exact connection/model persistence |

The Vite renderer needed `NODE_OPTIONS=--max-old-space-size=8192` after the host Node process
hit its default 2 GB heap while rendering chunks; the retry completed normally. The full
Electron `build` wrapper remains non-green because its first step finds nine inherited lint
errors in untouched files. The wrapper's final `build:validate` step also references the
missing stripped-OSS file `apps/electron/scripts/validate-assets.ts`. Direct compilation and
asset-copy stages were run so those baseline blockers could not hide a PR-1D build defect.

The UI smoke used both `HOME` and `CRAFT_CONFIG_DIR` under `/tmp`, an explicit scratch
workspace root, and an isolated Electron `--user-data-dir`; it did not read or alter real
credentials. One synthetic Claude account and two synthetic Codex accounts rendered under
two provider headings with distinct email/organization identity lines. Selecting Codex
Reviewer → GPT-5.4 mini before any send wrote `llmConnection: chatgpt-plus-2` and
`model: pi/gpt-5.4-mini` to the scratch session.

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
