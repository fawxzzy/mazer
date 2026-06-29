# Mazer Legacy Play HUD Compactness Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: active play HUD

## Why this packet exists

The active-play HUD was already bounded to timer + goal arrow, but it still read more like modern rounded chrome than a compact legacy overlay. The next highest-value move was to keep the same information and simplify the presentation.

## Landed scope

- compact the timer chip
- remove rounded panel styling
- tighten the goal-arrow footprint and position
- keep the work inside `src/scenes/MenuScene.ts`

## Boundaries preserved

- no menu shell change
- no overlay routing change
- no play-state rule change
- no maze or demo walker mutation

## Proof plan

- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`
- live localhost play-route inspection in the in-app browser

## Next honest slice

If this packet lands cleanly, the next explicit lane should be chosen between:

- deeper active-play HUD parity
- final repo-owned front-door review
- broader gameplay/reset-flow exactness
