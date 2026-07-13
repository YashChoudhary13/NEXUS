# Phase 1 — Chat and Multi-Account Foundation

**Objective:** make the existing Craft Agents chat experience work naturally with multiple
Claude and Codex subscription identities.
**Status:** `[PLANNED]` — scope confirmed in the
[master plan](../product/nexus-master-plan-2026-07-13.md). ⚠️ **The detailed implementation
plan has not been produced yet** — that is the gating deliverable of
[Phase 0](./phase-0-foundation.md). Nothing below is implemented.

> `[OPEN]` The master plan locates the detailed plan at
> `docs/superpowers/plans/2026-07-13-multi-account-chat-foundation.md`; this repo standardizes
> on `docs/plans/`. Proposed: extend **this** file into the detailed plan. See
> [roadmap open questions](../product/roadmap.md#open-questions-open).

## Scope (confirmed)

Target model, UX, and constraints live in
[`../architecture/account-and-connection-model.md`](../architecture/account-and-connection-model.md):

- `AgentAccount` / provider-neutral `AuthIdentity` domain model (D-012).
- Multiple Claude + multiple ChatGPT/Codex subscription logins as independent named
  connections; real identity (email/org) displayed; internal slugs hidden (D-013).
- Account-aware model picker: provider → account → models; interaction model
  Provider/Account/Model/Effort.
- Duplicate-account detection with a shared-quota warning (D-013).
- Safe agent switching: connection locked after first message; **"Continue with another
  agent"** creates a linked child session + compact handoff package (D-014).
- Also supported: Anthropic API, OpenAI API, OpenRouter & compatibles, GitHub Copilot, local
  models, custom endpoints.

## Completion criteria (from the master plan — all unmet)

- [ ] One Claude subscription can be authenticated.
- [ ] Two different Codex subscriptions can be authenticated simultaneously.
- [ ] The real identity of each account is visible.
- [ ] Duplicate underlying accounts are detected.
- [ ] A new session can choose any account/model combination.
- [ ] An active task can continue through a linked handoff to another agent.
- [ ] Restarting the app restores accounts and sessions correctly.
- [ ] Credentials never cross connection boundaries.

## Upstream foundations to build on `[UPSTREAM]`

The detailed plan should start from these verified facts
([`craft-baseline.md`](../architecture/craft-baseline.md) §3–4, §7):

1. `LlmConnection` already persists **Anthropic** OAuth identity
   (`oauthAccountUuid/Email`, `oauthOrganizationUuid/Name`, `oauthProfileVerifiedAt`) — the
   pattern to generalize into `AuthIdentity` across Codex/Copilot.
2. ⚠️ **#838 gotcha:** `updateLlmConnection` rebuilds from a hardcoded field allowlist — every
   new persisted identity field must be added there or it's silently dropped.
3. Sessions already lock to a connection at first message; live Pi subprocesses cannot re-route
   auth (restart-required signature) — upstream mechanics already enforce D-014's constraint.
4. `SessionBundle` fork/branch + branch-seed injection + transfer handoff summaries exist —
   the substrate for linked "Continue with another agent" sessions.
5. ChatGPT/Codex OAuth is implemented; connection slugs structurally allow multiple
   same-provider connections — ⚠️ simultaneous multi-Codex login is **unverified end-to-end**;
   verify first, it de-risks the whole phase.
6. Credential storage is already isolated per connection slug.
7. Model picker code: `apps/electron/src/renderer/components/app-shell/input/model-picker-helpers.ts`
   (currently groups by connection; brands Pi as "Craft Agents Backend").

## What the detailed implementation plan must contain

Per [working agreements](../agents/working-agreements.md) and the Phase 0 gate: exact file
list; migration story for existing single-account users (**no data loss** — see the master
plan's handoff example acceptance criteria); test plan incl. the #838 allowlist regression;
UX for identity display + duplicate warning; handoff-package format v0 (pre-Memory-foundation
— packets get durable backing later); validation gates; rollback.
