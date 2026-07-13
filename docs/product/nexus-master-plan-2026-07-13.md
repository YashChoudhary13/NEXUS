<!--
  ARCHIVED CANONICAL SNAPSHOT — do not edit.
  This is the authoritative NEXUS product plan as provided by the owner on 2026-07-13
  (source file: NEXUS-Agent-Operating-System.md). The live documentation under docs/
  decomposes this plan into focused documents; when day-to-day docs and this snapshot
  diverge, the live docs + decision log govern, and a new dated snapshot should be archived.
-->

# NEXUS — Agent Operating System

> **North Star:** One operating system for working with AI agents — chat with them, coordinate them, and give them a shared memory that becomes smarter over time.

**Status:** Planning → Foundation
**Owner:** LAKHIRA STUDIO
**Last updated:** July 13, 2026
**Current priority:** Fork, run, audit, and extend Craft Agents safely

---

## Executive Summary

NEXUS is a desktop **Agent Operating System** built around three connected experiences:

1. **Chat** — a polished, Craft Agents–style interface for working directly with Claude, Codex, API models, local models, tools, sources, and files.
2. **Swarm** — a visual orchestration environment where multiple subscription-backed CLIs and API agents can collaborate through councils, manager-worker structures, pipelines, parallel worktrees, and review loops.
3. **Brain** — an Obsidian-compatible knowledge and memory layer with explicit project context, decisions, tasks, handoffs, session summaries, and a Graphify-powered knowledge graph.

The goal is not to merge several unrelated agent frameworks into one fragile codebase. NEXUS will use **Craft Agents as the desktop shell and session foundation**, then add a provider-neutral orchestration engine and a durable Markdown-first memory layer behind clean interfaces.

> **Product principle:** The user should never need to repeatedly explain the same project to Claude, Codex Account 1, and Codex Account 2. NEXUS should package and transfer only the context each agent needs.

---

## Product Map

| Section | Primary purpose | Foundation |
|---|---|---|
| **Chat** | Direct conversations, coding sessions, tools, sources, files, permissions, and model/account selection | Craft Agents fork |
| **Swarm** | Coordinate multiple agents, subscriptions, CLIs, APIs, tasks, branches, and worktrees | NEXUS orchestration engine + selected patterns from agent frameworks |
| **Brain** | Persistent project memory, second brain, decisions, tasks, handoffs, summaries, and graph navigation | Obsidian-compatible Markdown + SQLite index + Graphify |

```text
NEXUS
├── Chat
│   └── Craft Agents experience + multi-account identity
├── Swarm
│   └── Claude Code, Codex CLIs, Craft sessions, APIs, and local agents
└── Brain
    └── Markdown vault, project memory, retrieval, and knowledge graph
```

---

## Canonical Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                        NEXUS Desktop                         │
│                                                              │
│   Chat                    Swarm                    Brain       │
│   ────                    ─────                    ─────       │
│   Sessions                Agent cards              Notes       │
│   Accounts                Tasks & pipelines        Projects    │
│   Models                  Worktrees                Decisions   │
│   Tools                   Live outputs             Handoffs    │
│   Sources                 Reviews                  Graph       │
└───────────────┬─────────────────────┬────────────────────────┘
                │                     │
                ▼                     ▼
      ┌─────────────────┐   ┌────────────────────────┐
      │ Agent Runtimes  │   │ NEXUS Memory Service   │
      │                 │   │                        │
      │ Claude Code CLI │   │ Markdown source truth  │
      │ Codex CLI #1    │   │ SQLite metadata/index  │
      │ Codex CLI #2    │   │ Context packet builder │
      │ Craft sessions  │   │ Graph extraction       │
      │ API agents      │   │ Retrieval & summaries  │
      │ Local models    │   │                        │
      └────────┬────────┘   └───────────┬────────────┘
               │                        │
               └──────── Git / Files ───┘
```

### Architectural boundaries

- **Craft Agents remains the shell and core interactive-session foundation.**
- **NEXUS orchestration remains our own layer.** External repositories are references or isolated component sources, not wholesale dependencies.
- **Markdown is the durable memory source of truth.** SQLite and embeddings support indexing and retrieval, but do not silently replace explicit project records.
- **Agent runtimes are adapters.** The orchestration engine should not depend on one provider, one CLI, or the user's current three subscriptions.
- **Every modifying agent works in an isolated Git worktree.** Two agents must never write concurrently to the same checkout.

---

## Core Product Decisions

- [x] Start from a fork of `craft-ai-agents/craft-agents-oss` rather than building the desktop application from zero.
- [x] Preserve the Craft Agents main chat experience as the first screen NEXUS opens to.
- [x] Separate **provider**, **account identity**, **model**, and **thinking/effort level** in the product model.
- [x] Support multiple Codex/ChatGPT subscription logins as independent named connections.
- [x] Display the real provider identity — such as account email and organization — when available.
- [x] Warn when two saved connections resolve to the same underlying provider account and therefore share quota.
- [x] Do not hot-swap credentials inside an active provider session.
- [x] Use **Continue with another agent** to create a linked branch with a compact handoff package.
- [x] Build a minimal memory foundation before full Swarm orchestration.
- [x] Use Obsidian-compatible Markdown for durable project memory.
- [x] Use runtime adapters for Claude Code CLI, multiple Codex CLIs, Craft-native sessions, API agents, and local models.
- [x] Keep NEXUS's orchestration engine provider-neutral and owned by us.
- [x] Use other repositories selectively for patterns, isolated components, and inspiration with license and attribution tracking.

---

## Build Order and Roadmap

```text
Phase 0  →  Fork, run, test, and document Craft Agents
Phase 1  →  Multi-account Chat and safe agent handoffs
Memory   →  Markdown vault, project context, and context packets
Phase 2  →  Runtime adapters, orchestration engine, and Swarm UI
Phase 3  →  Brain UI, Obsidian workflows, and Graphify graph
```

### Phase 0 — Foundation and Repository Stabilization

**Objective:** Establish a clean, reproducible NEXUS fork before implementing product changes.

#### Scope

- Fork `craft-ai-agents/craft-agents-oss` into the NEXUS organization or owner account.
- Clone the fork locally.
- Add the original repository as the `upstream` remote.
- Build and run the unmodified application.
- Run the repository's complete test suite.
- Record the exact upstream commit used as the NEXUS baseline.
- Preserve Apache 2.0 notices, attribution, and required license files.
- Document the Electron renderer, main process, server-core, connection system, credential storage, sessions, and navigation.
- Identify files likely to create merge conflicts during future upstream syncs.
- Establish branch, worktree, test, review, and commit conventions.

#### Recommended Git structure

```text
main                         Stable NEXUS releases
develop                      Integrated development
feature/account-identity     Account identity and duplicate detection
feature/multi-codex-auth     Multiple ChatGPT/Codex OAuth connections
feature/memory-core          Vault, indexing, and context packets
feature/swarm-engine         Orchestrator and runtime adapters
feature/swarm-ui             Visual agent workspace
feature/brain-ui             Notes and graph interface
```

#### First AI-agent assignment

The first agent must perform a **read-only architecture audit**. It should not implement features.

Deliverable:

```text
docs/architecture/craft-baseline.md
```

The audit must document:

1. Monorepo package map.
2. Electron renderer/main/server process boundaries.
3. LLM connection and credential lifecycle.
4. Session creation, persistence, branching, and recovery.
5. Navigation and page registration.
6. Test commands and CI structure.
7. Extension points for account identity, orchestration, and memory.
8. High-conflict files that should be modified minimally.

#### Completion criteria

- [ ] The untouched upstream app runs locally.
- [ ] Tests pass or all pre-existing failures are documented.
- [ ] The exact baseline commit is recorded.
- [ ] The architecture audit is reviewed.
- [ ] Development conventions are committed.
- [ ] No feature implementation begins before this gate.

---

### Phase 1 — Chat and Multi-Account Foundation

**Objective:** Make the existing Craft Agents experience work naturally with multiple Claude and Codex subscription identities.

#### Intended account model

```ts
interface AgentAccount {
  id: string
  connectionSlug: string
  provider: 'anthropic' | 'openai-codex' | 'api' | 'local'
  displayName: string
  email?: string
  providerAccountId?: string
  organizationId?: string
  roleLabel?: string
  authenticated: boolean
  lastValidatedAt?: number
}
```

#### Supported connections

- Multiple Claude subscription accounts.
- Multiple ChatGPT/Codex subscription accounts.
- Anthropic API.
- OpenAI API.
- OpenRouter and compatible providers.
- GitHub Copilot.
- Local models.
- Custom compatible endpoints.

#### Multi-Codex account experience

Each Codex login becomes a separate named connection:

```text
chatgpt-plus
chatgpt-plus-2
chatgpt-plus-3
```

The user-facing UI should avoid exposing these internal slugs. It should show meaningful identities and roles:

```text
Codex Builder
lakhira.studio@gmail.com
Connected

Codex Reviewer
second-account@example.com
Connected
```

#### Account-aware model picker

The picker should make the hierarchy unambiguous:

```text
OpenAI / Codex

  Codex Builder
  lakhira.studio@gmail.com
    GPT Codex Model A
    GPT Codex Model B

  Codex Reviewer
  second-account@example.com
    GPT Codex Model A
    GPT Codex Model B
```

The interaction model is:

```text
Provider: OpenAI / Codex
Account:  Codex Builder
Model:    Selected Codex model
Effort:   High
```

#### Provider-neutral identity metadata

OAuth-backed connections should persist normalized identity metadata when available:

```ts
interface AuthIdentity {
  provider: string
  accountId?: string
  email?: string
  organizationId?: string
  organizationName?: string
  verifiedAt: number
}
```

This should work across Claude, Codex, Copilot, and future OAuth providers rather than being implemented as provider-specific UI logic.

#### Duplicate-account protection

NEXUS must detect and warn when two connections resolve to the same account:

> ⚠️ **Shared subscription detected**
> "Codex Builder" and "Codex Reviewer" authenticate the same OpenAI account and therefore share the same quota.

#### Safe agent switching

The selected connection remains locked after the first message. NEXUS will not silently replace credentials under an active provider-native session.

Instead, the user chooses **Continue with another agent**.

The system then:

1. Preserves the original session.
2. Creates a linked child session.
3. Binds the child to the selected account and model.
4. Generates a compact handoff package.
5. Carries forward the current objective, decisions, files, Git state, pending work, and constraints.
6. Links the child back to the source session.

#### Phase 1 completion criteria

- [ ] One Claude subscription can be authenticated.
- [ ] Two different Codex subscriptions can be authenticated simultaneously.
- [ ] The real identity of each account is visible.
- [ ] Duplicate underlying accounts are detected.
- [ ] A new session can choose any account/model combination.
- [ ] An active task can continue through a linked handoff to another agent.
- [ ] Restarting the app restores accounts and sessions correctly.
- [ ] Credentials never cross connection boundaries.

---

### Memory Foundation — Shared Project Context

**Objective:** Create the shared context layer required for reliable handoffs and orchestration.

This milestone occurs after Phase 1 and before full Swarm development.

#### Source-of-truth structure

```text
workspace/
└── .nexus/
    ├── projects/
    │   └── project-name/
    │       ├── project.md
    │       ├── goals.md
    │       ├── architecture.md
    │       ├── requirements/
    │       ├── decisions/
    │       ├── tasks/
    │       ├── handoffs/
    │       └── sessions/
    └── index/
        └── memory.sqlite
```

#### Responsibility split

**Markdown stores:**

- Human-readable project context.
- Accepted decisions.
- Goals and requirements.
- Tasks and acceptance criteria.
- Agent handoffs.
- Session summaries.
- Explicit links and relationships.

**SQLite stores:**

- Search indexes.
- Normalized metadata.
- Relationship indexes.
- Fast task and status queries.
- Graph projection data.

**Embeddings support:**

- Semantic retrieval.
- Similarity search.
- Context recommendation.

Embeddings are not authoritative records.

#### Context packets

Agents receive focused context packets rather than raw full-session histories.

A packet should contain:

```text
Project identity
Current objective
Assigned task
Relevant accepted decisions
Relevant architecture
Relevant files
Current branch and worktree
Recent changes and commits
Previous handoff
Acceptance criteria
Constraints and prohibited actions
Open questions
```

Example handoff note:

```markdown
---
type: handoff
project: nexus
from_agent: claude-architect
to_agent: codex-builder
related_task: implement-account-identity
---

# Goal
Implement provider-neutral OAuth account identity.

# Decisions
- Keep the existing connection-slug credential boundary.
- Do not allow mid-session credential hot-swapping.

# Relevant files
- packages/shared/src/credentials/types.ts
- packages/server-core/src/handlers/rpc/llm-connections.ts
- apps/electron/src/renderer/pages/settings/AiSettingsPage.tsx

# Acceptance criteria
- Two Codex accounts display different identities.
- Duplicate accounts produce a warning.
- Existing single-account users migrate without data loss.
```

#### Memory foundation completion criteria

- [ ] Every project has a durable project record.
- [ ] Decisions can be stored and retrieved explicitly.
- [ ] Tasks and handoffs have structured metadata.
- [ ] A context packet can be generated for a selected task and agent.
- [ ] Chat handoffs use the context packet instead of full repeated explanations.
- [ ] The files are valid Obsidian-readable Markdown.

---

### Phase 2 — Swarm and Multi-Agent Orchestration

**Objective:** Coordinate multiple subscription-backed CLIs, Craft sessions, API models, and local agents in one visual workspace.

#### Runtime adapter contract

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

The orchestration engine should not special-case "one Claude and two Codex accounts." That is the first user configuration, not the architectural limit.

#### Initial runtime support

- Claude Code CLI.
- Codex CLI Account 1.
- Codex CLI Account 2.
- Craft-native agent sessions.
- Anthropic API agents.
- OpenAI API agents.
- Other compatible API providers.
- Local models.
- Remote workers in a later iteration.

#### Orchestration modes

**Council** — Multiple agents independently propose answers. A chair agent compares, critiques, and synthesizes the final output.

```text
Question
├── Claude proposal
├── Codex 1 proposal
└── Codex 2 proposal
        ↓
Chair synthesis
```

**Manager and Workers** — One lead decomposes a goal, creates tasks, delegates work, tracks blockers, and consolidates results.

```text
Claude Manager
├── Codex Builder — backend
├── Codex Reviewer — tests and review
└── Research Agent — documentation
```

**Sequential Pipeline** — Each stage produces an explicit artifact and handoff for the next stage.

```text
Claude plans
    ↓
Codex 1 implements
    ↓
Codex 2 reviews
    ↓
Claude accepts or requests revision
```

**Parallel Development** — Agents work simultaneously on independent modules in separate Git worktrees and branches.

```text
Codex 1 → backend worktree
Codex 2 → frontend worktree
Claude  → architecture and documentation worktree
```

**Adversarial Review** — One agent builds, another actively searches for failures, and a verifier runs tests and quality gates.

**Solo with Escalation** — A primary agent works normally and invokes another runtime only when uncertainty, review, or specialized work requires it.

#### Worktree safety model

```text
project/
worktrees/
├── claude-architecture/
├── codex-backend/
└── codex-review/
```

Rules:

- One modifying agent owns one worktree at a time.
- Two agents never write to the same checkout concurrently.
- Every task has an assigned branch and worktree.
- Handoffs include the branch, commit, diff summary, tests, and known risks.
- Integration occurs only after review and quality gates.

#### Swarm interface

Each visual agent card should show:

- Role.
- Provider, account, and model.
- Current task.
- Run status.
- Branch and worktree.
- Context usage.
- Changed files.
- Latest output.
- Current blocker or permission request.
- Last handoff.
- Controls for open, pause, stop, inspect, and vault.

Example:

```text
┌──────────────────────────────┐
│ Claude Architect             │
│ Planning                     │
│                              │
│ Task: Account identity       │
│ Branch: agent/identity-plan  │
│ Context: 31K                 │
│ Status: Working              │
│                              │
│ [Open] [Pause] [Vault]       │
└──────────────────────────────┘
```

#### Phase 2 completion criteria

- [ ] All runtimes implement the common adapter contract.
- [ ] A user can assign roles and accounts visually.
- [ ] Council mode works end to end.
- [ ] Sequential pipeline mode works end to end.
- [ ] Parallel work creates isolated worktrees.
- [ ] Review gates can approve, reject, or request revision.
- [ ] Every task produces an auditable handoff.
- [ ] The user can inspect live output without losing the high-level workflow view.

---

### Phase 3 — Brain, Obsidian, and Graphify

**Objective:** Turn NEXUS memory into a navigable second brain for both the user and agents.

#### Brain sections

- Projects.
- Notes.
- Goals.
- Requirements.
- Architecture.
- Decisions.
- Tasks.
- Agent handoffs.
- Session summaries.
- Files and commits.
- Sources.
- Knowledge graph.

#### Graph entities

```text
Project
Goal
Requirement
Decision
Task
Agent
Session
Handoff
File
Commit
Test
Source
Note
```

#### Graph relationships

```text
Project HAS_GOAL Goal
Goal PRODUCES Task
Task ASSIGNED_TO Agent
Agent CREATED Commit
Commit MODIFIES File
Commit VERIFIED_BY Test
Decision AFFECTS File
Session PRODUCED Handoff
Handoff CONTINUES_AS Session
```

#### Graph principles

- Explicit Markdown metadata and links define important relationships.
- Graphify extracts and enriches relationships but does not become the only source of truth.
- Every graph node should trace back to a readable record.
- Users must be able to correct or reject inferred relationships.
- Retrieval should combine explicit links, structured metadata, recency, task relevance, and semantic similarity.

#### Phase 3 completion criteria

- [ ] The user can browse and edit the vault within NEXUS.
- [ ] The same vault opens cleanly in Obsidian.
- [ ] Projects, decisions, tasks, sessions, and code artifacts appear in the graph.
- [ ] Every graph edge is traceable to evidence or marked as inferred.
- [ ] Agents can query the Brain through controlled retrieval rather than reading the whole vault.
- [ ] New sessions automatically contribute reviewed summaries and relationships.

---

## Repository Reference Strategy

NEXUS will study many repositories attempting multi-agent coordination, but it will not combine their complete architectures blindly.

| Repository / ecosystem | Primary value to NEXUS |
|---|---|
| **Craft Agents** | Desktop shell, sessions, providers, workspaces, chat, permissions, tools, and sources |
| **AgentTeams** | Persistent agent teams, messaging, worker lifecycle, and harness concepts |
| **Agent Council** | Council mode and chair synthesis pattern |
| **Metaswarm** | Handoffs, worktrees, quality gates, and Git-native knowledge |
| **Maestro-Flow** | Mixed CLI runtimes, pipelines, and parallel delegation |
| **Ruflo / Claude Flow** | Swarm routing, shared memory, hooks, and background-worker concepts |
| **Obsidian ecosystem** | Portable Markdown vault conventions and human editing workflows |
| **Graphify** | Knowledge extraction, entity relationships, and graph generation |

### Reference register

Create and maintain:

```text
docs/research/repository-register.md
```

Each entry must record:

```text
Repository URL
License
Commit inspected
Feature studied
Files or components considered
Decision: reference / adapt / copy with attribution / reject
Reason
Compatibility risks
Upstream update strategy
```

### Reuse rules

- Prefer concepts and clean-room interfaces over copying large subsystems.
- Copy code only when its license is compatible and attribution requirements are documented.
- Keep borrowed components isolated behind NEXUS-owned interfaces.
- Record the exact upstream commit for adapted components.
- Avoid modifying large Craft core files when an extension point or wrapper is possible.

---

## Engineering Principles

1. **Stable foundation before features.** Run and understand upstream first.
2. **Provider-neutral contracts.** Claude and Codex are adapters, not the architecture.
3. **Account identity is not model identity.** Store and display both separately.
4. **No unsafe mid-session credential swapping.** Use linked handoffs.
5. **Memory is explicit and inspectable.** Decisions cannot exist only inside chat history.
6. **Minimal context, maximum relevance.** Generate task-specific context packets.
7. **One agent, one worktree.** Prevent concurrent modification collisions.
8. **Every handoff is auditable.** Include task, files, branch, commit, tests, blockers, and risks.
9. **Human control remains central.** The user can inspect, pause, approve, redirect, or stop agents.
10. **Upstream-friendly changes.** Extend Craft through focused modules and interfaces where possible.
11. **Testable milestones.** Every phase must produce useful working software independently.
12. **No hidden graph truth.** Inferred memory relationships remain reviewable.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Craft upstream changes create large merge conflicts | Minimize invasive core edits, track baseline commit, isolate NEXUS features, and sync upstream deliberately |
| Multiple agents overwrite one another | Mandatory worktree ownership and branch assignment |
| Context packages omit a critical decision | Trace each packet to durable memory records and allow preview before dispatch |
| Duplicate OAuth connections are mistaken for separate quota | Resolve and display provider account identity; warn on duplicates |
| CLI sessions and Craft-native sessions behave differently | Normalize through runtime capabilities and explicit adapter metadata |
| Swarm becomes a visual terminal manager without real coordination | Make tasks, artifacts, gates, and handoffs first-class entities |
| Graph contains hallucinated relationships | Mark inferred edges, attach evidence, and support user correction |
| Product scope grows too fast | Complete each phase as a useful standalone product before expanding |

---

## Current Milestone

### Milestone: Craft Foundation Ready

**Goal:** Reach a point where NEXUS can begin Phase 1 implementation safely.

- [ ] Create the official NEXUS repository fork.
- [ ] Clone it locally.
- [ ] Add the Craft repository as `upstream`.
- [ ] Build the unchanged desktop application.
- [ ] Run the test suite.
- [ ] Record the upstream commit.
- [ ] Create `docs/architecture/craft-baseline.md`.
- [ ] Create `docs/research/repository-register.md`.
- [ ] Establish branch and worktree conventions.
- [ ] Produce the detailed Phase 1 implementation plan.

### Phase 1 plan location

```text
docs/superpowers/plans/2026-07-13-multi-account-chat-foundation.md
```

*(Note: this repository standardizes plan documents under `docs/plans/` — see the
[roadmap open questions](./roadmap.md).)*

---

## Definition of the First Useful NEXUS Release

The first useful release is complete when the user can:

1. Open NEXUS into the familiar Craft-style Chat interface.
2. Authenticate one Claude subscription and two different Codex subscriptions.
3. See which real account is attached to every connection.
4. Select an account and then select one of that account's available models.
5. Detect accidental duplicate-account logins.
6. Work on a project with one agent.
7. Continue the task with another agent without re-explaining the project.
8. See the generated handoff and the durable project context used for the transfer.
9. Restart the application without losing sessions, accounts, or project memory.

This release does not require the full visual Swarm or graph. It proves the essential NEXUS promise: **multiple AI subscriptions can work on the same project with shared, durable context.**

---

## Immediate Next Actions

1. Fork Craft Agents.
2. Run the untouched application locally.
3. Assign a read-only architecture audit to the first coding agent.
4. Review the audit manually.
5. Create the Phase 1 implementation plan.
6. Implement provider-neutral account identity before changing the Swarm UI.
7. Build the minimal Markdown memory foundation immediately after the multi-account chat flow.

> **Do not start with the full Swarm UI or graph.** First prove that multiple accounts can be authenticated, identified, selected, and handed off safely inside the Chat experience.

---

## Decision Log

### July 13, 2026

- Adopted **NEXUS** as the Agent OS project name.
- Confirmed the three-part product structure: **Chat, Swarm, Brain**.
- Selected Craft Agents as the main application foundation.
- Decided to support multiple Codex subscription identities as separate named connections.
- Decided to separate account selection from model selection in the UI and domain model.
- Rejected unsafe account hot-swapping inside active sessions.
- Selected linked session branching and compact handoffs for cross-agent continuation.
- Selected Obsidian-compatible Markdown as the durable memory source of truth.
- Selected Git worktrees as the safety mechanism for parallel modifying agents.
- Decided to study and selectively reuse patterns from multiple repositories while keeping the orchestration engine NEXUS-owned.
