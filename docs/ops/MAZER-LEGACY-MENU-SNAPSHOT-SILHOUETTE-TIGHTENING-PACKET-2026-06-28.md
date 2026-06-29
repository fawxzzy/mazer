# Mazer Legacy Menu Snapshot Silhouette Tightening Packet

Date: 2026-06-28
Lane: legacy Unreal truth -> web app reset/port
Status: landed locally and verified

## Purpose

Tighten the fixed menu snapshot toward the screenshot-era diagonal/stair-step silhouette without reopening play mode, generation logic, or overlay work.

## What changed

- Updated `src/legacy-runtime/legacyMaze.ts`:
  - added staircase branch helpers for the fixed menu snapshot
  - increased diagonal/stair-step structure through the menu-only board
  - tightened the right-side silhouette so the menu snapshot reads less like a generic generated maze

## Boundaries preserved

- No play-maze generator change
- No demo walker contract change
- No overlay contract change
- No deploy
- No infra/resource mutation

## Verification

Commands run:

- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`
- `npm run visual:matrix -- --preset core --skip-build true`

Results:

- reset-lane tests passed
- repo verify passed
- fresh visual matrix capture completed

Visual artifact:

- `tmp/captures/mazer-layout-matrix/2026-06-29T03-53-54-202Z`

Live browser proof:

- reloaded local in-app browser surface
- no browser `warn` / `error` logs
- screenshot: `tmp/mazer-live-menu-silhouette-check.png`

## Truthful result

The fixed menu snapshot now carries more of the staircase/diagonal legacy silhouette and less of a generic box-maze read. It is still not final 1:1 screenshot closure, but it is a narrower and more truthful menu target than the previous fixed snapshot baseline.
