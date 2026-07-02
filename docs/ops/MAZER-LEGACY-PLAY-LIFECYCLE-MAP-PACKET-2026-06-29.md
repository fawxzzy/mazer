# Mazer Legacy Play Lifecycle Map Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: active play reset-flow map

## Why this packet exists

The active-play reset loop was still owned implicitly inside `MenuScene.ts`. That made the next 1:1 gameplay work harder to reason about because the hold duration, pending-reset gate, and due-return timing all lived as scene-local details instead of one named module.

## Landed scope

- extract the active-play reset timing contract into `src/legacy-runtime/legacyPlayLifecycle.ts`
- keep `MenuScene.ts` as the caller and scene-state owner
- add repo-owned proof in `tests/reset/legacy-play-lifecycle.test.ts`
- update `docs/system-map.md` so the play-reset seam is explicit before deeper gameplay edits

## Boundaries preserved

- no overlay routing rewrite
- no maze generator rewrite
- no menu snapshot geometry edit
- no HUD redesign

## Proof plan

- `npm run test -- tests/reset/legacy-play-lifecycle.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`

## Next honest slice

If this packet lands cleanly, the next bounded gameplay lane should be one of:

- active-play movement and collision exactness, or
- deeper generation/reset lifecycle parity against `docs/legacy/gameplay-spec.md`
