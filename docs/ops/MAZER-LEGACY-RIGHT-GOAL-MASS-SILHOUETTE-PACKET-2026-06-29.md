# Mazer Legacy Right Goal Mass Silhouette Packet

Date: 2026-06-29
Lane: Mazer pass 2 menu parity
Module: board silhouette
Slice: right-side goal mass only

## Why this packet exists

After the upper title plate and board-material packets, the most obvious remaining board-shape miss was still the goal-side silhouette. Compared with `legacy/screenshots/menu-03.png`, the current web board still read too narrow and too restrained on the right edge.

## Landed scope

- widen the goal-side outer pocket
- extend the right spine one tile farther outward
- give the lower-right notch and inner-right pocket a little more screenshot-style mass
- keep the work entirely inside `src/legacy-runtime/legacyMenuSnapshot.ts`

## Touched branch families

- `right-pocket`
- `right-spine`
- `right-lower-notch`
- `right-inner-pocket`

## Boundaries preserved

- no title placement change
- no button chrome change
- no board material/palette change
- no play-maze mutation
- no demo-route pacing mutation

## Proof plan

- `npm run test -- tests/reset/legacy-reset.test.ts`
- live localhost inspection in the in-app browser
- `npm run verify` before closure

## Next honest slice

If this packet lands cleanly, the next bounded menu parity slice should move to:

- slab/frame balance in `src/scenes/MenuScene.ts`, or
- backdrop field treatment in `src/scenes/MenuScene.ts`
