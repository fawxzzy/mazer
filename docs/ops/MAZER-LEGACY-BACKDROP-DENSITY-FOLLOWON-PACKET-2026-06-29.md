# Mazer Legacy Backdrop Density Follow-On Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: backdrop field

## Why this packet exists

After the button, title, and board-mass passes, the strongest remaining menu drift was atmospheric. The current web backdrop still looked cleaner and emptier than the archived screenshot field, especially around the off-center violet glow and the larger white star flecks.

## Landed scope

- densify the menu starfield in `src/scenes/MenuScene.ts`
- increase star size variance and streak weight
- strengthen the violet haze and off-center atmospheric pockets
- add a small source-guard proof in `tests/reset/legacy-reset.test.ts`

## Boundaries preserved

- no menu snapshot geometry mutation
- no title/button/layout mutation
- no play-state mutation
- no deploy

## Proof plan

- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run visual:matrix -- --preset core --skip-build true`
- `npm run verify`

## Next honest slice

- if proof still says the board surround is too flat, move to slab/frame balance
- if proof says the menu front door is close enough, switch to a non-menu parity lane instead of forcing more shell work
