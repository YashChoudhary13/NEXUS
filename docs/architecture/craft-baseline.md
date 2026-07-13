# Craft Baseline — audited upstream architecture

**Status:** `[UPSTREAM]` — this documents what the inherited code **actually does today**.
**Baseline:** upstream commit `4289b16` (tag v0.11.1), audited 2026-07-13 (read-only; three
parallel deep-dives: runtime, security, frontend/transport). Verify details against source
before relying on them in new work; line numbers may drift with upstream syncs.

This is the Phase 0 audit deliverable required by the
[master plan](../product/nexus-master-plan-2026-07-13.md) (§Phase 0 → First AI-agent assignment).

---

## 1. Monorepo package map

Bun workspaces (`package.json` root, name `craft-agent`): ~1,850 tracked files, ~1,480 TS/TSX,
360 test files.

| Workspace | Responsibility |
|-----------|----------------|
| `apps/electron` | **Primary desktop GUI** — `src/main` (main process), `src/preload` (context bridge), `src/renderer` (React UI), `src/transport` (client RPC routing) |
| `apps/webui` | Browser build of the **same renderer** (Vite alias `'@' → ../electron/src/renderer`; Node/Electron deps shimmed; cookie auth) |
| `apps/viewer` | Standalone read-only session-share viewer (`/s/{id}`) |
| `apps/cli` | Terminal client over the same WS-RPC protocol ([`../upstream/cli.md`](../upstream/cli.md)) |
| `packages/core` | Shared TS types (session, workspace, message) |
| `packages/shared` | **The business-logic heart**: `agent/` (backends, permissions), `sources/`, `sessions/`, `projects/`, `mcp/`, `config/`, `credentials/`, `auth/`, `automations/`, `scheduler/`, `prompts/`, `skills/`, `i18n/`, `protocol/` |
| `packages/server-core` | WS-RPC transport, RPC handlers (`src/handlers/rpc/`), `SessionManager`, headless bootstrap, model fetchers, webui server |
| `packages/server` | Headless server entrypoint (`src/index.ts`) |
| `packages/ui` | React components shared by electron renderer + viewer (chat transcript, markdown, code viewer, annotations) |
| `packages/session-tools-core` | Canonical session-tool registry (Zod-first) + OS sandbox runtime |
| `packages/session-mcp-server` | stdio MCP server exposing session tools to subprocess backends |
| `packages/pi-agent-server` | Out-of-process Pi agent (JSONL over stdio) |
| `packages/messaging-gateway`, `messaging-whatsapp-worker` | Telegram + WhatsApp (Baileys) integration |

Authoritative package-level conventions: `packages/shared/CLAUDE.md` (extensive — read before
editing `shared`), `packages/core/CLAUDE.md`.

## 2. Process boundaries (Electron renderer / main / server)

**Key fact: the renderer does not use classic Electron IPC for session logic.** Everything
rides a WebSocket RPC protocol; `contextBridge` exposes `window.electronAPI` as a proxy over a
WS client (`apps/electron/src/preload/bootstrap.ts`). Classic `ipcRenderer` remains only for a
handful of app-lifecycle calls.

```text
renderer (React + jotai) ── WS-RPC ──► WsRpcServer (embedded in main via
                                       @craft-agent/server-core bootstrap, 127.0.0.1)
                                         ├─ core RPC handlers (server-core/src/handlers/rpc/)
                                         ├─ GUI-only handlers registered by electron main
                                         └─ SessionManager ──► AgentBackend
                                                ├─ ClaudeAgent (Claude Agent SDK → native `claude` binary subprocess)
                                                └─ PiAgent (pi-agent-server subprocess, JSONL/stdio)
```

- Channel classification (`packages/shared/src/protocol/routing.ts`): every channel is
  `LOCAL_ONLY` (window mgmt, dialogs, auto-update, onboarding OAuth…) or `REMOTE_ELIGIBLE`
  (sessions, sources, skills, automations…). A CI exhaustiveness test enforces classification.
- `RoutedClient` (`apps/electron/src/transport/routed-client.ts`) multiplexes a local client +
  per-workspace remote client → thin-client/remote-server modes work from one codebase.
- Transport: `packages/server-core/src/transport/{server,client,codec,push}.ts`. JSON codec
  with `__craftRpcType` marker for binary. Bearer-token auth + optional TLS for remote;
  chunked transfer for >5 MB payloads (`apps/electron/src/main/chunked-rpc.ts`).
- Subprocess boundaries: Claude Agent SDK spawns a native `claude` binary; Pi runs
  `pi-agent-server` under Bun with a `--preload` network interceptor (Pi-only).

## 3. LLM connection and credential lifecycle

- **`LlmConnection`** (`packages/shared/src/config/llm-connections.ts`) is the user-facing
  routing unit. `providerType: 'anthropic' | 'pi' | 'pi_compat'`; auth types include api_key,
  oauth, bearer, IAM, service-account file. Connections are a list with slugs; defaults
  resolve session → workspace → global (`resolveSessionConnection`,
  `packages/shared/src/agent/backend/factory.ts`).
- **A session locks to its connection after the first message** — no mid-session credential
  swap exists upstream (aligns with NEXUS decision D-014). Live Pi subprocesses can refresh
  some runtime config in place, but `piAuthProvider`/`slug`/credential routing changes require
  dispose + recreate (`runtime-config.ts:buildRestartRequiredSignature`).
- **Identity capture exists partially:** Anthropic OAuth already persists
  `oauthAccountUuid/Email`, `oauthOrganizationUuid/Name`, `oauthProfileVerifiedAt` on the
  connection (`packages/shared/src/auth/claude-oauth.ts` → `parseClaudeOAuthIdentity`,
  threaded through the `SETUP_LLM_CONNECTION` payload). This is the seed of Phase 1's
  provider-neutral `AuthIdentity`.
- ⚠️ **Gotcha (#838):** `updateLlmConnection` rebuilds connections from a **hardcoded field
  allowlist** — any new persisted field must be added there or it is silently dropped on the
  next save. Critical for Phase 1 identity fields.
- **Credentials at rest:** one AES-256-GCM file `~/.craft-agent/credentials.enc`
  (`packages/shared/src/credentials/backends/secure-storage.ts`; header magic `CRAFT01\0`,
  0600 perms). Key is PBKDF2 over a **machine ID**, not a user secret — protects against
  off-host copying only (hardening = decision D-009, later milestone). OAuth flows use PKCE
  (`packages/shared/src/auth/pkce.ts`); token refresh via `TokenRefreshManager`. The
  connection **slug is the credential boundary** — credentials never cross connections.

## 4. Session creation, persistence, branching, recovery

- Create/send: renderer RPC → `server-core` handler → `SessionManager.sendMessage`
  (`packages/server-core/src/sessions/SessionManager.ts`) → backend agent.
- **Persistence:** `{workspace}/sessions/{id}/session.jsonl` — line 1 header, one message per
  line (`packages/shared/src/sessions/{storage,jsonl}.ts`), async write queue
  (`persistence-queue.ts`). Session folder also holds `attachments/`, `plans/`, `data/`,
  `long_responses/` (oversized tool output, auto-summarized), `downloads/`. Absolute paths are
  tokenized `{{SESSION_PATH}}` for cross-machine portability.
- **The LLM transcript is owned by the provider SDK** (keyed `sdkSessionId`/`sdkCwd`); the
  app JSONL is the app-side record. Resume passes SDK ids; `buildRecoveryContext()` +
  conversation summaries recover when SDK resume fails.
- **Branching/transfer already exist:** `SessionBundle` v1 envelope
  (`packages/shared/src/sessions/bundle.ts`) supports export/import/move/**fork** incl. SDK
  branch info; branch-seed context injection and one-shot hidden **handoff summaries** for
  remote-workspace transfers (`packages/shared/CLAUDE.md`). A `spawn_session` tool exists.
  → These are the natural substrate for Phase 1's "Continue with another agent".
- Long-term memory today: per-project `MEMORY.md` (`packages/shared/src/projects/`) injected
  into the system prompt (~5k-token cap) + `preferences.json`. No vector store.

## 5. Navigation and page registration

- **No react-router.** Custom panel-stack model: `renderer/contexts/NavigationContext.tsx` +
  `navigation-history.ts`/`navigation-reconcile.ts`; state in jotai atoms
  (`renderer/atoms/panel-stack.ts` and friends); rendering via
  `components/app-shell/PanelStackContainer.tsx`. Screens live in `renderer/pages/` +
  `components/app-shell/` (session list, chat, settings pages, sources, skills, automations,
  projects, kanban, onboarding).
- Keyboard/command surface: `renderer/actions/` registry (`registry.tsx`, `definitions.ts`).
- Deep links: `craftagents://` scheme parsed in `apps/electron/src/main/deep-link.ts`
  (routes: `allSessions`, session ids, `sources`, `settings`, `skills`, `workspace/{id}/…`,
  `action/{name}`), delivered via a push channel.
- New top-level surfaces (Swarm, Brain) will need: a pages/panel entry, atoms, navigation
  wiring, action definitions, and i18n keys — there is no single "page registry" file.

## 6. Test commands and CI structure

Summary — the **verified matrix with exit codes and failure categories** lives in
[`../development/testing-and-quality-gates.md`](../development/testing-and-quality-gates.md).

- CI (`.github/workflows/validate.yml`): Bun 1.3.10 → `bun install --frozen-lockfile` →
  `bun run validate:ci` (typechecks, shared tests, Python doc-tool smoke tests, i18n
  parity/sort/coverage). `validate-server.yml` (manual): 21-step CLI integration test, needs
  `ANTHROPIC_API_KEY`.
- Verified green locally: `typecheck:electron`, `test:shared:all` (108 tests), i18n
  parity/sorted, `electron:build:{main,preload,renderer}`.
- Known inherited failures (OSS-stripped `tsconfig.base.json` + scripts, stale `bun.lock`,
  non-CI-gated eslint debt) — documented, deliberately unfixed (repo-health workstream).

## 7. Extension points for account identity, orchestration, memory

| NEXUS need | Upstream extension point | Notes / warnings |
|------------|--------------------------|------------------|
| Account identity (Phase 1) | `LlmConnection` + existing `oauth*` identity fields; `parseClaudeOAuthIdentity` pattern; ChatGPT/Codex OAuth already implemented (`auth/chatgpt-oauth-config.ts`) | Add fields to the `updateLlmConnection` **allowlist** (#838). Slugs already support multiple same-provider connections structurally (⚠️ multi-login UX end-to-end unverified). |
| Account-aware model picker | `renderer/components/app-shell/input/model-picker-helpers.ts` groups by connection today | UI copy currently brands Pi as "Craft Agents Backend". |
| Safe handoffs (Phase 1) | `SessionBundle` fork/branch, branch-seed injection, transfer handoff summaries, `spawn_session` tool | Handoff summary injection is already "one-shot hidden context on first turn". |
| Orchestration (Phase 2) | `AgentBackend`/`BaseAgent` + backend factory; automations event system (`PreToolUse`, `SessionStart`…, cron `SchedulerTick`); background tasks (`server-core/src/tasks/TaskRunner.ts`); messaging gateway | External **CLI** runtimes (Claude Code CLI, Codex CLI) have no precedent upstream — new adapter layer required ([`runtime-adapters.md`](./runtime-adapters.md)). |
| Memory (vault) | `projects/` (config + assets + `MEMORY.md`, sessions bind via `projectId`); prompt injection via `formatProjectContextForPrompt` | Vault (`.nexus/`) is new; keep it beside, not inside, upstream config dirs. Skills' 3-tier `.agents/` pattern shows the layered-lookup idiom. |
| New tools for agents | `packages/session-tools-core/src/tool-defs.ts` canonical registry (Zod schema → both Claude SDK and MCP) | `executionMode: 'registry' | 'backend'`; safe-mode flags per tool. |
| New services/processes | `server-core` bootstrap + WS-RPC channel model; add channels with `LOCAL_ONLY`/`REMOTE_ELIGIBLE` classification | Exhaustiveness test fails CI if unclassified. |

## 8. High-conflict files (modify minimally; expect upstream churn)

| File | Size/why risky |
|------|----------------|
| `packages/shared/src/prompts/system.ts` | ~1,250-line system prompt; heavily edited upstream; also target of agent-identity rebrand |
| `packages/shared/src/agent/claude-agent.ts` | ~3,000+ lines, core backend |
| `packages/shared/src/agent/mode-manager.ts` | ~2,170 lines, permission engine |
| `apps/electron/src/renderer/App.tsx` | ~2,270 lines, app shell |
| `apps/electron/src/main/index.ts` | ~1,270 lines, main-process bootstrap |
| `apps/electron/src/transport/channel-map.ts` | 21 KB API↔channel map; every new channel touches it |
| `packages/shared/src/i18n/locales/*.json` | 6 locales × 1,639 keys; parity-linted; merge conflicts are frequent and mechanical |
| `apps/electron/electron-builder.yml`, root `package.json`, `bun.lock` | Packaging/scripts/lockfile churn on every upstream release |
| `packages/shared/src/config/llm-connections.ts` | Phase 1 will extend it; upstream also evolves it (allowlist!) |

Strategy for all of these: [`../development/upstream-sync.md`](../development/upstream-sync.md).

## 9. Security posture snapshot (audited 2026-07-13)

**Strong:** fail-closed safe-mode Bash AST validator (`agent/bash-validator.ts` — blocks
control flow, expansions, env-prefix hijacks, `find -exec`, symlink escapes); `script_sandbox`
refuses to run without OS isolation (macOS `sandbox-exec`, Linux bwrap/firejail); PKCE OAuth,
no committed secrets; server token entropy-checked, no default.

**Known weaknesses (hardening milestone D-009):** machine-derived credential key (not a user
secret); `ask`/`allow-all` modes are prompts, not enforcement boundaries; OS sandbox covers
only `script_sandbox` (and allows global reads); MCP subprocess env-strip is an 11-name
denylist (duplicated in two files); non-constant-time server-token compare
(`server-core/src/bootstrap/headless-start.ts`); TLS not enforced for non-loopback binds;
live dependency on Craft-operated endpoints (`agents.craft.do`, `mcp.craft.do`) and reuse of
Anthropic's first-party OAuth client ID.

## 10. End-to-end message flow (reference)

1. Launch: main sets app name, registers `craftagents://`, bootstraps embedded `WsRpcServer`;
   renderer builds `RoutedClient` with an IPC-fetched port/token.
2. `electronAPI.sessions.sendMessage(...)` → WS → RPC handler → `SessionManager`.
3. Connection resolved (session→workspace→global); `PromptBuilder` assembles system prompt +
   discovered `CLAUDE.md`/`AGENTS.md` files + project `MEMORY.md` + volatile/stable context
   blocks (prompt-cache-aware split — see `packages/shared/CLAUDE.md` before touching).
4. Backend streams via SDK; MCP servers attached (session tools + sources via `McpClientPool`
   + always-on Craft docs MCP).
5. Every tool call passes `runPreToolUseChecks` (mode gating; safe-mode AST validation).
6. Events append to JSONL via the persistence queue; oversized outputs spill + summarize;
   automations fire on lifecycle events.
