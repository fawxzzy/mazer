# Mazer Legacy Board Material Tile Read Follow-on Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: board material / tile read

## Why this packet exists

The earlier board-material pass narrowed the miss, but the menu board still read too clean and too evenly tiled compared with the restored screenshot truth.

The remaining pressure was material, not geometry:

- wall mass still read too light
- grid noise still read too visible
- walkable trench cores still read too filled instead of carved

## Landed scope

- darken the menu-only wall and board fill palette in `src/scenes/MenuScene.ts`
- soften menu-only grid noise in `src/scenes/MenuScene.ts`
- increase the menu-only inner trench inset so connected runs read more carved than filled
- add a source guard in `tests/scenes/menu-render-frame.test.ts`

## Boundaries preserved

- no layout math change
- no title placement change
- no button chrome change
- no menu snapshot geometry rewrite
- no play-mode behavior change
- no demo-route pacing change

## Proof plan

- `npm run test -- tests/scenes/menu-render-frame.test.ts`
- `npm run visual:matrix -- --preset core --skip-build true`
- `npm run verify`

## Ratchet result

This packet earns a bounded marker ratchet.

- `68% -> 69%`

Reason:

- one named completion-marker segment changed with proof
- the board material/tile read is visibly closer to the legacy screenshot truth
- no unrelated lane was used to inflate the score

## Next honest slice

If this follow-on pass lands cleanly, the next bounded parity slice should be:

- demo route / pacing exactness, or
- active-play HUD exactness
