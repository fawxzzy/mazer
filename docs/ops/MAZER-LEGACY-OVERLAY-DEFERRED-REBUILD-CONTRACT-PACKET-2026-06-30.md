# Mazer Legacy Overlay Deferred Rebuild Contract Packet

Date: 2026-06-30
Lane: Mazer pass 2 parity
Module: overlay field responsibilities

## Why this packet exists

The restored Unreal options menu does not rebuild the level the moment a scale or material field commits.

Instead:

- field commits mutate stored values
- `Back` closes the overlay
- only then does the legacy menu travel/reload if scale or material changed

The current web runtime was closer than before, but it still queued maze rebuilds too early inside `commitOverlayField()`.

## Landed scope

- add deferred overlay rebuild state in `src/scenes/MenuScene.ts`
- make maze-affecting options/pause field commits:
  - update settings immediately
  - mark rebuild pending
  - wait until overlay close before queuing `overlay-rebuild`
- keep camera-only commits immediate
- add proof in:
  - `tests/reset/legacy-reset.test.ts`
- resync current truth, parity matrix, completion marker, and system map docs

## Boundaries preserved

- no overlay layout rewrite
- no features/game-modes rewrite
- no generation topology rewrite
- no HUD rewrite
- no deploy

## Proof plan

- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run test -- tests/reset/legacy-option-fields.test.ts`
- `npm run verify`

## Ratchet result

This packet earns the next bounded overlay-family ratchet.

- `76% -> 77%`

Reason:

- one named completion-marker segment changed with proof
- options/pause rebuild timing now matches the restored legacy contract more closely
- maze-affecting field commits no longer force premature rebuild queueing while the overlay is still open
- the packet stayed within the overlay-field owner chain without overstating the remaining exactness work

## Next honest slice

The next bounded overlay lane should be one of:

- broader field-by-field options/features/game-modes routing cleanup
- in-game pause command exactness
- switch back to staged generation implementation if that becomes the cleaner bounded seam
