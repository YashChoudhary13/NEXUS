# PR #1 — NEXUS Identity & Packaging Foundation

**Status:** `[DECIDED]` plan (owner-scoped 2026-07-13; decisions D-004, D-007, D-008) —
**implementation not started.** Blocked on: owner-supplied artwork + explicit go-ahead.
**Branch:** `feature/nexus-identity-and-packaging` (off `main`; no direct `main` commits).

## Goal & guardrails

Establish the NEXUS fork identity per `TRADEMARK.md` **without touching runtime behavior,
protocol, or upstream-compat internals** ([`../development/upstream-sync.md`](../development/upstream-sync.md) §A).
One concern only: identity + packaging + safely disabling auto-update. This discharges the
trademark obligation and removes the one dangerous functional coupling — a built fork
auto-updating itself into **Craft's** binaries.

## In scope

- Product/display name → **NEXUS**; bundle ID → NEXUS identifier (e.g. `com.yashchoudhary.nexus`).
- Packaging metadata: copyright, artifact names (`NEXUS-${arch}…`), dmg title, maintainer,
  `NSLocalNetworkUsageDescription` text.
- User-visible icons/logos replaced (**needs artwork** — spec below, D-008).
- Craft auto-update feed **disabled safely** (guarded flag, reversible; no placeholder feed — D-004).
- Updater UI neutralized (no dead buttons, no error toasts, no misleading states).
- Product-name menu strings only, values not keys, all 6 locales (D-007).
- Fork notes documenting intentionally retained Craft identifiers.

## Explicitly excluded (deferred — [roadmap](../product/roadmap.md) workstreams)

Agent system-prompt identity ("You are Craft Agent") · descriptive UI copy · new features ·
internal renames (`@craft-agent/*`, `CRAFT_*`, `~/.craft-agent/`) · credential/RPC-codec
changes · `craftagents://` scheme · Craft-hosted service replacement · repo-health fixes
(`tsconfig.base.json`, lockfile, eslint debt) · broad find-replace · unrelated refactors.

## Files to modify

**A. Packaging identity**
- `apps/electron/electron-builder.yml` — `productName`, `appId`, `copyright`, all
  `artifactName`s, `dmg.title`, `linux.maintainer`, `NSLocalNetworkUsageDescription`.
- `apps/electron/package.json` — `description`, `author`, `homepage`.

**B. Runtime app name + OS menu (bounded)**
- `apps/electron/src/main/index.ts` — `app.setName(process.env.CRAFT_APP_NAME || 'NEXUS')`
  (env var **name** stays — D-003).
- `packages/shared/src/i18n/locales/*.json` (6 files) — **values only** for
  `menu.aboutCraftAgents`, `menu.hideCraftAgents`, `menu.quitCraftAgents`, `menu.craftMenu`;
  verify window-title/About strings.

**C. Icons / logos (needs artwork)**
- `apps/electron/resources/{icon.icns,icon.ico,icon.png,icon.svg,icon.icon/,Assets.car,source.png,dmg-background*.png,dmg-background.tiff}`
- `apps/electron/resources/craft-logos/` → NEXUS logos
- `apps/electron/src/renderer/components/icons/CraftAppIcon.tsx`, `CraftAgentsSymbol.tsx`
  (repoint art; keep component names for now)
- `packages/shared/src/branding.ts` — replace `CRAFT_LOGO` ASCII; **leave `VIEWER_URL`**
  (retained service).

**D. Auto-update disablement**
- `apps/electron/src/main/auto-update.ts` — `export const AUTO_UPDATE_ENABLED = false`; guard
  `checkForUpdates()` / `checkForUpdatesOnLaunch()` to a stable idle state, **zero network
  calls**; keep `electron-updater` + handlers intact (one-line re-enable).
- `apps/electron/src/main/index.ts` — skip the launch check when disabled.
- `apps/electron/src/renderer/hooks/useUpdateChecker.ts` — no-op when disabled.
- `apps/electron/src/shared/menu-schema.ts` (+ menus) — hide `checkForUpdates`/`installUpdate`.
- `apps/electron/src/renderer/pages/settings/AppSettingsPage.tsx` — hide/neutralize the
  update section.
- Note: `packages/shared/src/version/manifest.ts` serves the **install** flow, not the running
  updater — record as a retained endpoint; not this PR's target.

## Tests

**Existing coverage:** `apps/electron/src/shared/__tests__/ipc-channels.test.ts` (update
channels), `apps/electron/src/main/__tests__/browser-pane-manager.test.ts` (`craftagents://`
unchanged), i18n parity/sorted lints, `typecheck:electron`.

**New:** disabled-updater unit tests (no network call; launch check returns none/disabled);
menu items absent when disabled; app name resolves to `NEXUS` when `CRAFT_APP_NAME` unset.

## Manual checks

Build + launch shows NEXUS name/icon in menu/About/Dock; no request to
`agents.craft.do/electron/latest`; updater UI absent/neutral; `craftagents://allSessions`
still routes; `electron:dist:dev:mac` (unsigned) produces `NEXUS-arm64.dmg` with NEXUS icon
and volume title (signed/notarized dist deferred — needs Apple creds).

## Artwork required (owner provides — D-008)

| Asset | Spec |
|-------|------|
| `icon.svg` | Vector master |
| `icon.icns` | macOS multi-res (≤1024²) |
| `icon.ico` | Windows multi-res |
| `icon.png` | 1024×1024 |
| `icon.icon/` + `Assets.car` | macOS 26 "Liquid Glass" — regenerable from master via repo's `generate-icons.sh`/`afterPack.cjs` |
| `dmg-background.png` + `@2x` + `.tiff` | 540×380 base + retina |
| Wordmark | for `craft-logos/` replacement + the ASCII logo |

A single 1024×1024 master (PNG/SVG) suffices to derive the rest during implementation.

## Risks & rollback

Icon format errors → use `generate-icons.sh`; update-IPC breakage → guard don't delete +
existing test; locale parity → lints; bundle-ID change starts a fresh app-data dir
(`~/Library/Application Support/<appId>`) — acceptable, note in PR. **Rollback:** revert the
single branch; `AUTO_UPDATE_ENABLED=true` restores updates; no data migrations or protocol
changes.

## Definition of done

Builds/launches as NEXUS with NEXUS icons everywhere OS-visible; zero runtime/build reference
to Craft's update feed; trademark satisfied for name/icons/bundle-ID; agent behavior, RPC
protocol, `CRAFT_*` names, `~/.craft-agent/`, credential format, deep-link scheme all
unchanged; gates green (`typecheck:electron`, `test:shared:all`, i18n parity/sorted,
`electron:build`); known inherited failures untouched and called out; docs updated per the
[ritual](../agents/README.md).

## Commit breakdown

1. `chore(brand): add NEXUS icon/logo assets` (once artwork provided)
2. `feat(brand): NEXUS product name, bundle ID & packaging metadata`
3. `feat(update): disable auto-update feed + neutralize updater UI` (+ tests)
4. `docs(brand): NEXUS fork notes — retained Craft identifiers & deferred decoupling`
