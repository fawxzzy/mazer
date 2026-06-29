# Mazer Legacy Play Reset Hold Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: gameplay / reset-flow

## Why this packet exists

The active-play goal branch was still returning to the menu immediately on overlap. Legacy truth was slightly different: goal contact raised the reset flag first, then the reset branch consumed it and returned through the menu flow.

## Landed scope

- add a brief active-play reset hold before returning to menu
- freeze further play input once the goal-triggered reset hold starts
- keep the work inside `src/scenes/MenuScene.ts`

## Boundaries preserved

- no demo walker mutation
- no menu shell mutation
- no generation-pipeline rewrite
- no overlay model rewrite

## Proof plan

- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`
- live localhost play-route inspection to confirm play still enters cleanly after the HUD packet

## Next honest slice

If this packet lands cleanly, the next bounded gameplay lane should be either:

- deeper reset/generation lifecycle parity, or
- active-play movement and transition exactness
