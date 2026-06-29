# Mazer Legacy Menu Demo Walker Bridge Packet

Date: 2026-06-28
Lane: legacy Unreal truth -> web app reset/port
Status: landed locally and verified

## Purpose

Replace the reset-lane menu demo's simple `solutionPath` autoplay with the recovered demo walker that already exists in the repo, while keeping the legacy snapshot maze shell and active play path intact.

## What changed

- Added `src/legacy-runtime/legacyDemoWalker.ts` as the bounded adapter from `LegacyMazeSnapshot` into the recovered demo walker runtime.
- Updated `src/scenes/MenuScene.ts` so menu mode now:
  - creates a legacy demo-walker episode from the current legacy maze snapshot
  - uses the recovered demo walker cadence/config instead of raw `solutionPath` stepping
  - prerolls a bounded number of demo steps from tuning instead of jumping deep into the solved route
  - preserves active play as the current legacy-shell runtime
- Updated `tests/reset/legacy-reset.test.ts` to guard:
  - adapter truth for start/end/path mapping
  - menu demo config uses the humanized runner lane
  - MenuScene is wired to `advanceDemoWalker(...)` instead of plain `solutionPath` autoplay

## Boundaries preserved

- No app identity duplication
- No infra mutation
- No deploy
- No Supabase/Vercel/GitHub app-resource mutation
- No ATLAS root packet reopened
- Active play HUD remains minimal and legacy-shaped
- Menu demo uses the recovered walker additively inside the current legacy shell

## Verification

Commands run:

- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`
- `npm run visual:matrix -- --preset core --skip-build true`

Result:

- reset-lane tests passed
- production build passed
- visual matrix capture completed cleanly

Visual artifact:

- `tmp/captures/mazer-layout-matrix/2026-06-29T02-58-35-333Z`

## Live browser proof

Reloaded the local in-app browser surface and captured:

- `tmp/mazer-live-menu-demo-check.png`
- `tmp/mazer-live-menu-demo-check-late.png`

Observed truth:

- app loads at the live localhost surface without browser console warnings/errors
- the attract-mode menu demo advances on-screen after reload
- the menu board/front-door remains intact while the recovered walker drives the route instead of the old static `solutionPath` advance loop

## Remaining truth

This does not claim full legacy-exact demo parity yet.

Still open:

- exact legacy trail color-revert semantics
- full legacy reset-flow split between AI-only reset and goal-driven regeneration
- final screenshot-grade visual parity
