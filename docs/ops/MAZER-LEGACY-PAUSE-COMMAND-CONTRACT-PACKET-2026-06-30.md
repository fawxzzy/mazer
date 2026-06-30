# Mazer Legacy Pause Command Contract Packet

Date: 2026-06-30
Lane: Mazer pass 2 parity
Module: overlay family and pause routing

## Why this packet exists

The restored Unreal pause menu carries three distinct command paths:

- `Back` resumes play
- `Reset` marks player-position reset state, then resumes
- `Main Menu` leaves play and returns to the menu shell

The web runtime already had the right buttons, but those behaviors still lived as inline scene callbacks instead of one explicit repo-owned legacy contract.

## Landed scope

- add `src/legacy-runtime/legacyPauseLifecycle.ts`
- encode explicit pause commands:
  - `resume`
  - `reset-player`
  - `return-menu`
- route pause buttons in `src/scenes/MenuScene.ts` through `applyLegacyPauseCommand(...)`
- preserve the legacy distinction between:
  - overlay close only
  - player/trail reset + overlay close
  - menu return
- add proof in:
  - `tests/reset/legacy-pause-lifecycle.test.ts`
  - `tests/reset/legacy-reset.test.ts`
- resync current truth, parity matrix, completion marker, and system map docs

## Boundaries preserved

- no broad overlay redesign
- no features/game-modes rewrite
- no staged generation rewrite
- no HUD rewrite
- no deploy

## Proof plan

- `npm run test -- tests/reset/legacy-pause-lifecycle.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`

## Ratchet result

This packet earns the next bounded overlay-family ratchet.

- `77% -> 78%`

Reason:

- one named completion-marker segment changed with proof
- pause command routing is now explicit and repo-owned instead of remaining implicit scene wiring
- the web runtime now carries the legacy distinction between resume, player-reset resume, and menu return more honestly
- the packet stayed inside the overlay/pause owner chain without overstating the remaining field-responsibility work

## Next honest slice

The next bounded overlay lane should be one of:

- features/game-modes field-responsibility exactness
- pause field-responsibility exactness beyond command routing
- switch back to staged generation implementation if that becomes the cleaner bounded seam
