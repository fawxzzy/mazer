# Mazer Legacy Play Step Module Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: active play movement

## Why this packet exists

The active-play movement rules were still embedded directly inside `MenuScene.ts`. For a 1:1 port, the next useful seam is the exact result of one movement input: whether the move is blocked, whether trail state changes, and whether the goal step was reached.

## Landed scope

- extract one-step active-play movement into `src/legacy-runtime/legacyPlayStep.ts`
- keep scene ownership of timers, overlays, and redraw flags in `src/scenes/MenuScene.ts`
- add proof in `tests/reset/legacy-play-step.test.ts`
- update `docs/system-map.md` so movement is a named owner seam before deeper gameplay tuning

## Boundaries preserved

- no maze generation rewrite
- no overlay routing rewrite
- no HUD redesign
- no menu demo AI mutation

## Proof plan

- `npm run test -- tests/reset/legacy-play-step.test.ts`
- `npm run verify`

## Next honest slice

If this packet lands cleanly, the next bounded gameplay lane should be either:

- deeper generation/reset lifecycle parity, or
- active-play transition polish around spawn/reset sequencing
