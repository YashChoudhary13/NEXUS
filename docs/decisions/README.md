# Decisions

Append-only, ADR-lite decision log for NEXUS. **If it isn't recorded here (or in the
[master plan](../product/nexus-master-plan-2026-07-13.md) it mirrors), it is not a decision** —
agents must not invent or assume decisions.

## Rules

- **Append, never rewrite.** A changed decision gets a *new* entry that explicitly supersedes
  the old one (`Supersedes: D-0NN`); the old entry stays.
- Every entry records: **ID, date, decided-by, the decision, why, consequences.**
- Number sequentially (`D-001`, `D-002`, …). Next free ID is noted at the top of
  [`initial-product-decisions.md`](./initial-product-decisions.md).
- Owner (LAKHIRA STUDIO) confirms product-level decisions; agents may record *proposals* only
  when clearly labeled `[OPEN]` (proposals live in the roadmap's open questions, not here).
- When a decision is executed, link the implementing plan/PR from the entry — don't edit the
  decision text.

## Files

- [`initial-product-decisions.md`](./initial-product-decisions.md) — D-001 … D-018
  (foundation-session decisions + master-plan decisions, both dated 2026-07-13).
- Future batches: add new files per period or theme (e.g. `2026-Q3-decisions.md`) and index
  them here, or continue appending to the initial file until it grows unwieldy.
