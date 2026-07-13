# Upstream Sync — strategy, retained identifiers, coupling map

**Status:** strategy + retained identifiers `[DECIDED]` (D-002/D-003); coupling inventory is
audited fact (2026-07-13, baseline `4289b16`).

We keep merging from `craft-ai-agents/craft-agents-oss`. This document is what makes that
sustainable: what we deliberately do **not** rename, what is coupled to Craft and why, and
which files hurt most in merges.

> ⚠️ **Never do a blind global "Craft" → "NEXUS" replace.** Several identifiers below are
> load-bearing (wire protocol, file formats, config paths). ~599 of ~1,482 TS/TSX files
> mention "craft" — almost all are `@craft-agent/*` imports and `CRAFT_*` env vars that must
> stay.

## A. Retained internal identifiers `[DECIDED]` — do not rename

| Identifier | Where | Why retained |
|-----------|-------|--------------|
| `@craft-agent/*` package namespace | all packages | Renaming = permanent merge friction |
| `CRAFT_*` env vars (~90) | app, CLI, server, Docker | Load-bearing across surfaces; several already parameterize branding (`CRAFT_APP_NAME`, `CRAFT_DEEPLINK_SCHEME`, `CRAFT_CONFIG_DIR`) |
| `~/.craft-agent/` config dir | `packages/shared/src/config/paths.ts` | Changing orphans user data → needs a migration milestone |
| `CRAFT01\0` magic + `craft-agent-v2` KDF salt | `packages/shared/src/credentials/backends/secure-storage.ts` | Changing invalidates existing encrypted credential stores |
| `__craftRpcType` wire key | `packages/server-core/src/transport/codec.ts` | On-the-wire marker; must match across all clients/servers |
| `craftagents://` deep-link scheme | `apps/electron/src/main/{index.ts,deep-link.ts}` | Not trademark-required to change; OAuth callbacks route through it |
| `CraftAgent` class alias | `packages/shared/src/agent/` | Upstream backward-compat export |

Any future internal rename is its own owner-approved milestone with a data-migration plan —
never incidental work.

## B. Functional couplings to Craft-hosted services (decouple later; keep for now — D-005/D-006)

| Item | Where | Disposition |
|------|-------|-------------|
| Auto-update feed `agents.craft.do/electron/latest` | `apps/electron/electron-builder.yml`, `src/main/auto-update.ts`, `packages/shared/src/version/manifest.ts` | **Disable in [PR #1](../plans/pr-01-identity-and-packaging.md)** (D-004) — a built fork must not pull Craft binaries |
| Bundle ID `com.lukilabs.craft-agent` | `electron-builder.yml` | Change in PR #1 (trademark-required) |
| OAuth relay `agents.craft.do/auth/callback` (+ Slack variant) | `packages/shared/src/auth/oauth-relay.ts`, `slack-oauth.ts` | Keep for now; later decoupling workstream |
| Always-on docs MCP `agents.craft.do/docs/mcp` | `packages/shared/src/agent/claude-agent.ts` | Keep; becomes optional/off by default later (D-006) |
| Craft document MCP `mcp.craft.do` | `packages/shared/src/auth/oauth.ts` | Later decoupling |
| Session-share viewer `VIEWER_URL='https://agents.craft.do'` | `packages/shared/src/branding.ts`, `apps/viewer/` | Later decoupling |
| Anthropic first-party Claude Code OAuth client-ID reuse | `packages/shared/src/auth/claude-oauth-config.ts` | ToS consideration; review in the decoupling/security milestones |

## C. Cosmetic branding (rebrand when its workstream runs — see [roadmap](../product/roadmap.md))

| Item | Where | Workstream |
|------|-------|-----------|
| Agent identity "You are Craft Agent" + `agents-noreply@craft.do` co-author | `packages/shared/src/prompts/system.ts` | Agent-identity rebrand (after PR #1) |
| Product-name menu strings (About/Hide/Quit/menu) | `packages/shared/src/i18n/locales/*.json` (values only) | PR #1 (bounded set — D-007) |
| `app.setName(... || 'Craft Agents')` | `apps/electron/src/main/index.ts` | PR #1 |
| Descriptive "Craft Agents" copy (~20+ keys × 6 locales) | locales | UI-copy rebrand (deferred by D-007) |
| `CRAFT_LOGO` ASCII (OAuth pages) | `packages/shared/src/branding.ts` | PR #1 |
| Icons/logos | `apps/electron/resources/*`, `renderer/components/icons/Craft*.tsx` | PR #1 (artwork: D-008) |
| Copyright/author/homepage metadata | `electron-builder.yml`, `apps/electron/package.json` | PR #1 |

## High-conflict files (merge hot spots)

See the full list with sizes in
[`../architecture/craft-baseline.md`](../architecture/craft-baseline.md) §8: `system.ts`,
`claude-agent.ts`, `mode-manager.ts`, `App.tsx`, `main/index.ts`, `channel-map.ts`, the six
locale JSONs, `electron-builder.yml`, root `package.json`, `bun.lock`. **Minimize NEXUS edits
in these files**; prefer the extension points in `craft-baseline.md` §7.

## Sync procedure

1. `git fetch upstream` and review `upstream/main` changes since the recorded baseline
   ([`repository-strategy.md`](./repository-strategy.md)); pay attention to the hot-spot files.
2. Merge (not rebase) into an integration branch; resolve; run the verified validation set
   ([`testing-and-quality-gates.md`](./testing-and-quality-gates.md)); for locale conflicts,
   trust `bun run lint:i18n:parity` + `sorted` (+ `coverage` once the stripped script is
   restored) per upstream's own guidance.
3. Update the recorded baseline commit in `repository-strategy.md` and add a changelog line to
   [`../agents/project-state.md`](../agents/project-state.md).
4. Sync **deliberately** (when we need something or drift grows) — not on every upstream tag.
