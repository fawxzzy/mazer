# Mazer Legacy Menu Demo Lifecycle Module Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: menu demo bootstrap / advance

## Why this packet exists

`MenuScene.ts` was still directly owning demo bootstrap, preroll, trail projection, and per-frame demo advance. That mixed attract-mode lifecycle work into the same scene surface already carrying menu shell, play loop, overlays, HUD, and reset behavior.

## Landed scope

- add `src/legacy-runtime/legacyMenuDemoLifecycle.ts`
- extract:
  - fixed-snapshot detection
  - menu demo bootstrap
  - deterministic preroll application
  - trail/player projection for bootstrap and per-frame advance
- keep scene ownership of draw timing and regeneration routing in `MenuScene.ts`
- add proof in `tests/reset/legacy-menu-demo-lifecycle.test.ts`

## Boundaries preserved

- no visual shell rewrite
- no demo walker decision rewrite
- no gameplay movement rewrite
- no production deploy

## Proof plan

- `npm run test -- tests/reset/legacy-menu-demo-lifecycle.test.ts`
- `npm run verify`

## Next honest slice

If this packet lands cleanly, the next bounded demo lane should be:

- exact demo AI parity work, or
- further extraction of demo-only timing/readback seams without touching play-mode runtime
