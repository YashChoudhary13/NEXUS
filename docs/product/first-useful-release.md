# Definition of the First Useful NEXUS Release

**Status:** `[DECIDED]` — from the canonical plan
([`nexus-master-plan-2026-07-13.md`](./nexus-master-plan-2026-07-13.md)). None of these
criteria are met yet; this is the target, not the current state.

The first useful release is complete when the user can:

1. Open NEXUS into the familiar Craft-style Chat interface.
2. Authenticate one Claude subscription and two different Codex subscriptions.
3. See which real account is attached to every connection.
4. Select an account and then select one of that account's available models.
5. Detect accidental duplicate-account logins.
6. Work on a project with one agent.
7. Continue the task with another agent **without re-explaining the project**.
8. See the generated handoff and the durable project context used for the transfer.
9. Restart the application without losing sessions, accounts, or project memory.

This release does **not** require the full visual Swarm or graph. It proves the essential
NEXUS promise: **multiple AI subscriptions can work on the same project with shared, durable
context.**

## Mapping to phases

| Criteria | Delivered by |
|----------|--------------|
| 1 | `[UPSTREAM]` today (Chat shell) + [PR #1 branding](../plans/pr-01-identity-and-packaging.md) for the NEXUS identity |
| 2–5 | [Phase 1 — multi-account chat](../plans/phase-1-multi-account-chat.md) |
| 6 | `[UPSTREAM]` today |
| 7–8 | [Phase 1 handoffs](../plans/phase-1-multi-account-chat.md) + [Memory foundation](../plans/memory-foundation.md) |
| 9 | `[UPSTREAM]` sessions/connections persist today; project memory persistence lands with the [Memory foundation](../plans/memory-foundation.md) |
