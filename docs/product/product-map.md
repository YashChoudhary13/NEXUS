# Product Map — Chat, Swarm, Brain

**Status:** `[DECIDED]` structure; individual sections labeled.
Source: [`nexus-master-plan-2026-07-13.md`](./nexus-master-plan-2026-07-13.md).

| Section | Primary purpose | Foundation | Status |
|---------|-----------------|------------|--------|
| **Chat** | Direct conversations, coding sessions, tools, sources, files, permissions, and model/account selection | Craft Agents fork | `[UPSTREAM]` core experience exists today; `[PLANNED]` multi-account identity ([Phase 1](../plans/phase-1-multi-account-chat.md)) |
| **Swarm** | Coordinate multiple agents, subscriptions, CLIs, APIs, tasks, branches, and worktrees | NEXUS orchestration engine + selected patterns from agent frameworks | `[PLANNED]` ([Phase 2](../plans/phase-2-swarm.md)) |
| **Brain** | Persistent project memory, second brain, decisions, tasks, handoffs, summaries, and graph navigation | Obsidian-compatible Markdown + SQLite index + Graphify | `[PLANNED]` ([Memory foundation](../plans/memory-foundation.md) → [Phase 3](../plans/phase-3-brain.md)) |

```text
NEXUS
├── Chat
│   └── Craft Agents experience + multi-account identity
├── Swarm
│   └── Claude Code, Codex CLIs, Craft sessions, APIs, and local agents
└── Brain
    └── Markdown vault, project memory, retrieval, and knowledge graph
```

## What exists today vs. what NEXUS adds

`[UPSTREAM]` **Chat is largely inherited.** Craft Agents already ships: multi-session inbox
with statuses/labels/flags, streaming responses with tool visualization, multiple LLM
connections (Anthropic API/OAuth, Google, ChatGPT/Codex OAuth, Copilot, OpenRouter, Ollama,
custom endpoints), sources (MCP/REST/local), skills, automations, permissions modes, file
attachments, theming, i18n, headless server + thin client + WebUI + CLI. Details:
[`../architecture/craft-baseline.md`](../architecture/craft-baseline.md).

`[DECIDED]` **Chat opens first.** NEXUS preserves the Craft Agents main chat experience as
the first screen the app opens to (decision D-011).

`[PLANNED]` **NEXUS adds, in order:** account-aware multi-subscription identity and safe
cross-agent handoffs (Phase 1) → the Markdown memory vault and context packets (Memory
foundation) → the Swarm orchestration engine + visual workspace (Phase 2) → the Brain UI and
knowledge graph (Phase 3). Build order rationale:
[`roadmap.md`](./roadmap.md).

## Architectural boundaries

`[DECIDED]` (master plan):

- **Craft Agents remains the shell and core interactive-session foundation.**
- **NEXUS orchestration remains our own layer.** External repositories are references or
  isolated component sources, not wholesale dependencies
  ([`../research/repository-register.md`](../research/repository-register.md)).
- **Markdown is the durable memory source of truth.** SQLite and embeddings support indexing
  and retrieval; they do not silently replace explicit project records.
- **Agent runtimes are adapters.** The orchestration engine must not depend on one provider,
  one CLI, or the user's current three subscriptions.
- **Every modifying agent works in an isolated Git worktree.** Two agents must never write
  concurrently to the same checkout.

Target architecture diagram: [`../architecture/overview.md`](../architecture/overview.md).
