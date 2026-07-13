# Upstream — Craft Agents

**Status:** `[UPSTREAM]` reference + binding legal obligations.

NEXUS is a derivative work of **Craft Agents** by Craft Docs Ltd. —
`https://github.com/craft-ai-agents/craft-agents-oss`, Apache-2.0, forked at commit `4289b16`
(v0.11.1). We continue to track and merge from upstream (D-002;
[`../development/upstream-sync.md`](../development/upstream-sync.md)).

## What Craft Agents is

An open-source Electron desktop AI-agent workspace: multi-session inbox, two agent backends
(Claude Agent SDK + Pi SDK, ~20 providers), MCP/REST/local **sources**, skills, automations,
permission modes, encrypted credentials, headless server + thin client + WebUI + CLI. The
audited technical baseline lives in
[`../architecture/craft-baseline.md`](../architecture/craft-baseline.md).

## Legal obligations (binding — never delete these root files)

| File (repo root) | Obligation |
|------------------|-----------|
| `LICENSE` | Apache-2.0 — free to use/modify/distribute; keep the license text |
| `NOTICE` | Attribution to Craft Docs Ltd. + Claude Agent SDK terms note — **preserve in distributions** |
| `TRADEMARK.md` | "Craft"/"Craft Agents" are Craft Docs Ltd. trademarks. A fork **must**: use a name without "Craft", replace logos/icons, change the bundle ID (`com.lukilabs.craft-agent`), and drop `craft.do` domains unless connecting to official Craft services. → Discharged by [PR #1](../plans/pr-01-identity-and-packaging.md); factual statements like "fork of Craft Agents" remain allowed. |
| `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md` | Keep; upstream contribution/security process references |

No CLA exists — upstream contributions are plain Apache-2.0 (clean fork rights). The Claude
Agent SDK dependency is subject to Anthropic's Commercial Terms of Service (see `NOTICE`).

## Where upstream technical documentation lives

| Location | Content |
|----------|---------|
| Root `README.md` | Upstream's full product/feature/setup documentation (still Craft-branded — see `[OPEN]` in the [roadmap](../product/roadmap.md)) |
| `packages/shared/CLAUDE.md` | **Deep, binding conventions** for the core package — read before editing `shared` |
| `packages/core/CLAUDE.md` | Core-types package notes |
| `apps/electron/resources/AGENTS.md` | How bundled resources sync to `~/.craft-agent/` on launch |
| [`cli.md`](./cli.md) | CLI client reference (restored here from upstream `docs/cli.md`) |
| `https://agents.craft.do/docs` | Upstream's hosted docs (external; also exposed to agents via the always-on docs MCP — becomes optional later, D-006) |

## Relationship rules

Distinguish **Craft Agents** (upstream product, their branding, their hosted services) from
**NEXUS** (this fork). Upstream docs describe `[UPSTREAM]` capability; NEXUS direction lives
under [`../product/`](../product/vision.md). When upstream and NEXUS docs conflict about
*intent*, NEXUS docs win; when they conflict about *how the inherited code works*, verify
against source and fix our baseline doc.
