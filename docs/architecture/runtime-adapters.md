# Runtime Adapters

**Status:** contract `[DECIDED]` (master plan); implementation `[PLANNED]` (Phase 2).
"Upstream today" is `[UPSTREAM]` fact.

## Principle

**Agent runtimes are adapters.** The NEXUS orchestration engine is provider-neutral and
NEXUS-owned (D-016). It must not special-case "one Claude and two Codex accounts" — that is
the first user configuration, not the architectural limit.

## Adapter contract `[PLANNED]`

```ts
interface AgentRuntime {
  runtimeId: string
  kind:
    | 'claude-code-cli'
    | 'codex-cli'
    | 'craft-session'
    | 'openai-api'
    | 'anthropic-api'
    | 'local-model'

  start(request: AgentRunRequest): Promise<AgentRunHandle>
  send(runId: string, message: string): Promise<void>
  cancel(runId: string): Promise<void>
  getStatus(runId: string): Promise<AgentRunStatus>
  collectResult(runId: string): Promise<AgentRunResult>
}
```

Initial runtime support (target): Claude Code CLI; Codex CLI account 1; Codex CLI account 2;
Craft-native agent sessions; Anthropic API agents; OpenAI API agents; other compatible API
providers; local models; remote workers later.

Runtimes differ (interactive CLIs vs. Craft sessions vs. one-shot API calls) — normalize
through **declared runtime capabilities and adapter metadata**, not if/else provider checks
(master-plan risk table).

## Upstream today `[UPSTREAM]`

The inherited system has **two in-process backends behind one interface** — a strong precedent
for the adapter pattern, but *not* the same thing as external CLI runtimes:

- `AgentBackend` interface + abstract `BaseAgent`
  (`packages/shared/src/agent/backend/types.ts`, `base-agent.ts`): streaming chat as an event
  generator, abort/redirect lifecycle, permissions, model/thinking config, UI callbacks.
- Registered backends: `anthropic` → `ClaudeAgent` (Claude **Agent SDK**, native `claude`
  binary subprocess — *not* the interactive Claude Code CLI) and `pi` → `PiAgent`
  (subprocess, ~20 providers incl. OpenAI/Codex-OAuth/Copilot/local). Codex/Copilot standalone
  backends are vestigial branches folded into Pi.
- Orchestration primitives that adapters can reuse: `spawn_session` tool, background
  `TaskRunner`, automations event bus, messaging gateway.

## What Phase 2 adds `[PLANNED]`

1. The `AgentRuntime` layer **above/beside** `AgentBackend`: Craft-native sessions become one
   adapter (`craft-session`) wrapping the existing SessionManager; external CLI adapters
   (`claude-code-cli`, `codex-cli`) manage real subprocesses with their own auth, transcripts,
   and permission prompts — **new territory with no upstream precedent**.
2. Run lifecycle (start/send/cancel/status/collect) + normalized status/result types.
3. Account binding: each runtime instance is bound to an `AgentAccount`
   ([`account-and-connection-model.md`](./account-and-connection-model.md)) — quota and
   identity stay visible ([`orchestration.md`](./orchestration.md) agent cards).
4. Worktree assignment for modifying runtimes
   ([`../development/git-worktrees.md`](../development/git-worktrees.md)).

`[OPEN]` Implementation questions to settle in the Phase 2 detailed plan: where adapters live
(new package vs. `server-core`), how CLI permission prompts surface in the NEXUS UI, and how
CLI transcripts map into session records.
