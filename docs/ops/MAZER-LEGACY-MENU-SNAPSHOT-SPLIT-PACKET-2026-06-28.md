# Mazer Legacy Menu Snapshot Split Packet

Date: 2026-06-28
Lane: legacy Unreal truth -> web app reset/port
Status: landed locally and verified

## Purpose

Split the menu front-door board away from the active-play maze generator so the menu can move toward the screenshot-shaped legacy snapshot without destabilizing play mode.

## What changed

- Updated `src/legacy-runtime/legacyMaze.ts`:
  - added a fixed `createLegacyMenuMaze()` snapshot for menu/front-door use
  - preserved `createLegacyMaze()` as the generated active-play lane
- Updated `src/scenes/MenuScene.ts`:
  - menu mode now rebuilds from the fixed legacy menu snapshot
  - play mode now rebuilds from the generated play maze when `Start` is selected
  - menu preroll is biased deeper into the fixed snapshot so the attract route is visible earlier
- Updated `tests/reset/legacy-reset.test.ts`:
  - added direct proof for the fixed legacy menu snapshot contract
- Updated `docs/current-truth.md`:
  - recorded the menu-snapshot / play-generator split as current repo truth

## Boundaries preserved

- No deploy
- No infra/resource mutation
- No duplicate app identity
- No options/features/pause overlay contract change
- No play movement contract rewrite
- No generation lifecycle rewrite

## Verification

Commands run:

- `npm run test -- tests/reset/legacy-reset.test.ts tests/reset/legacy-menu-layout.test.ts`
- `npm run verify`
- `npm run visual:matrix -- --preset core --skip-build true`

Results:

- reset-lane tests passed
- repo verify passed
- fresh visual matrix capture completed

Visual artifact:

- `tmp/captures/mazer-layout-matrix/2026-06-29T03-48-28-701Z`

Live browser proof:

- reloaded local in-app browser surface
- no browser `warn` / `error` logs
- screenshots:
  - `tmp/mazer-live-menu-snapshot-check.png`
  - `tmp/mazer-live-menu-snapshot-preroll-check.png`

## Truthful result

The menu front door now owns a fixed legacy-shaped snapshot lane instead of reusing the active-play generator. This materially improves screenshot-directed menu parity and gives the next visual pass a stable menu target, but it is not final 1:1 menu snapshot closure yet.
