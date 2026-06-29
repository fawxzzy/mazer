# Mazer Legacy Menu Snapshot Silhouette Fill Packet

Date: 2026-06-28
Lane: legacy Unreal truth -> web app reset/port
Status: landed locally and verified

## Purpose

Fill visible silhouette gaps in the fixed legacy menu snapshot after the earlier menu-snapshot split, without changing the active-play maze generator.

## What changed

- updated `src/legacy-runtime/legacyMaze.ts`
  - added staircase helper geometry for the fixed menu snapshot
  - added extra staircase and right-spine branches to better match the archived menu silhouette
- updated `tests/reset/legacy-reset.test.ts`
  - extended the fixed menu snapshot proof with direct tile assertions for the new branches
- updated `docs/current-truth.md`
  - recorded the silhouette-fill follow-on as current repo truth

## Boundaries preserved

- no play-mode generator rewrite
- no options/features/pause overlay contract change
- no deploy
- no infra/resource mutation

## Verification

Commands run:

- `npm run verify`

Results:

- repo verify passed

## Truthful result

The fixed menu snapshot now carries more of the archived silhouette inside the front-door board while keeping play-mode generation separate. This improves menu screenshot parity, but final screenshot-grade parity is still open.
