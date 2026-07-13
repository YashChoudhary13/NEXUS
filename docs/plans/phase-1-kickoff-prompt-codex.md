# Phase 1 Kickoff Prompt (Codex)

**Status:** `[DECIDED]` — issued by the owner 2026-07-14 to start Phase 1 implementation.
This is the verbatim cold-start prompt handed to the implementing agent (Codex), kept on
record so the delegation is documented and the prompt can be re-issued if the session is
lost. Task spec it points to: [`phase-1-multi-account-chat.md`](./phase-1-multi-account-chat.md).
Decisions embedded: D-020…D-023
([decision log](../decisions/initial-product-decisions.md) §D).

---

```text
You are starting cold on NEXUS — a desktop Agent Operating System (Chat · Swarm · Brain)
being built on a fork of Craft Agents, an Electron AI-agent desktop app.

Repo: https://github.com/YashChoudhary13/NEXUS
- `origin` = that fork — the only remote you ever push to.
- `upstream` = craft-ai-agents/craft-agents-oss — fetch-only; its push URL is disabled.
Work in the existing local checkout if you are in one; otherwise clone origin.

The repository has a documentation system built specifically so an agent with zero context
can continue the work. Do not skip the bootstrap. Do not rely on this prompt alone.

STEP 1 — BOOTSTRAP. Read, in this order, before touching any code:
1. AGENTS.md (repo root — thin pointer)
2. docs/agents/README.md            (read order + the mandatory doc-update ritual)
3. docs/agents/project-state.md     (living handoff — exactly where work stands)
4. docs/agents/working-agreements.md (14 binding rules + environment quickstart)
5. docs/plans/phase-1-multi-account-chat.md  ← YOUR TASK SPEC (file:line refs verified)
Consult as needed: docs/architecture/account-and-connection-model.md,
docs/development/testing-and-quality-gates.md (known inherited failures you must NOT fix),
docs/development/repository-strategy.md (git flow),
docs/decisions/initial-product-decisions.md (D-001…D-023).

STEP 2 — YOUR ASSIGNMENT. Implement Phase 1 (multi-account Chat) exactly per the task spec.
The owner signed it off on 2026-07-14; its previously open §8 questions are now decisions:
- D-020: Copilot identity IS in Phase 1 scope — as its own PR (PR-1F), after PR-1A.
- D-021: the "Craft Agents Backend" model-picker label does NOT survive PR-1D; replacement
  copy is approved at PR-1D review.
- D-022: the PR-1E session action is worded "Continue with another agent".
- D-023: git flow — the `develop` branch exists; cut feature branches from `develop`, open
  PRs against `develop` on origin. Never commit to `main`. Never push to `upstream`.

Execution order (from the spec — do not reorder):
1. S1 SPIKE FIRST, on a throwaway branch (e.g. spike/s1-multi-codex) that is never merged:
   prove two simultaneous ChatGPT/Codex OAuth logins end-to-end (second connection under
   slug `chatgpt-plus-2`). You cannot complete the logins yourself — the OWNER must perform
   them with real accounts. Prepare everything, give the owner exact steps, wait for the
   results. Record the REAL id_token claim names in the spec's §S1 before writing PR-1A
   code. If the provider rejects a second simultaneous login, STOP — the spec says Phase 1
   is re-planned before any PR.
2. Then PR-1A → PR-1B → PR-1C / PR-1D / PR-1F (parallelizable) → PR-1E, one concern per PR,
   each passing the spec's §4 verification matrix before the PR is opened.

STEP 3 — THE RULES YOU ARE MOST LIKELY TO BREAK (the full binding list is
docs/agents/working-agreements.md; these are the critical ones):
- Never commit to `main`. Never push to `upstream`. All PRs → `develop` on origin.
- NO global "Craft"→"NEXUS" renames. `@craft-agent/*`, `CRAFT_*`, `~/.craft-agent/`,
  `CRAFT01` markers, `__craftRpcType`, `craftagents://` all stay (D-003).
- Do NOT "fix" the documented inherited failures (stale bun.lock / failing frozen install,
  missing tsconfig.base.json, stripped lint scripts, eslint debt) — separate workstream.
  Use plain `bun install`; if it modifies bun.lock, restore it: git checkout -- bun.lock.
- Environment: Bun 1.3.10 exactly (install command in working-agreements.md).
- You will handle OAuth tokens and identity JWTs. NEVER print, log, commit, or write into
  docs any real token, refresh token, or raw JWT/claims payload. Unit tests use fabricated
  JWTs only. Redact identity values to shape (e.g. "email: present") when documenting.
- Any new user-facing string ships in ALL 6 locales; lint:i18n:parity and lint:i18n:sorted
  must pass.
- After EVERY final output, update docs/agents/project-state.md (status + changelog) and
  any doc your work made stale — work that leaves docs stale is unfinished. Label claims
  honestly: [UPSTREAM]/[DECIDED]/[PLANNED]/[OPEN]; never present planned work as done.
- Confirm with the owner before destructive or outward-facing actions beyond the agreed
  branch→PR flow. Blocked on an owner-level decision? Ask, don't guess.
- Use your own commit attribution; never Craft's agents-noreply@craft.do trailer.
- If other agents may be active in this checkout, work in your own git worktree
  (docs/development/git-worktrees.md — one writer per checkout).

STEP 4 — DEFINITION OF DONE for your first session:
(a) S1 spike executed with the owner; findings (claim names, both-accounts verdict) written
    into docs/plans/phase-1-multi-account-chat.md §S1;
(b) docs/agents/project-state.md updated;
(c) if the spike passed: PR-1A implemented on feature/account-identity off develop, gates
    green, PR opened against develop.
If your environment cannot launch the Electron app or a browser for OAuth (sandboxed/cloud),
say so immediately and instead deliver the owner a precise manual spike runbook; start
PR-1A only after the owner reports the spike results back to you.

Begin with STEP 1 and reply first with a short summary of what you read (current state, your
task, the rules) so the owner can confirm you bootstrapped correctly — then start S1.
```
