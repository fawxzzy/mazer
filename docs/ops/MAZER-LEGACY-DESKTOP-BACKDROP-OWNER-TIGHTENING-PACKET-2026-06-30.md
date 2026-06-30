# Mazer Legacy Desktop Backdrop Owner Tightening Packet

Date: 2026-06-30
Lane: Mazer pass 2 menu parity
Segment: `Menu screenshot composition and board presentation`
Module: `backdrop field`
Status: landed
Marker: held at `87%`

## Why this packet exists

After the bounded desktop board-dominance, title-lockup, and button-support passes, the next visible menu miss was still the backdrop field:

- the web field still read too procedural and too evenly radiating
- backdrop ownership still lived mostly as inline scene code
- the last visual gap was better described as backdrop/material exactness than layout

This packet tightens only the desktop backdrop field and maps it into an explicit owner chain.

## Landed scope

- add `src/legacy-runtime/legacyMenuBackdrop.ts` as the explicit owner for:
  - backdrop palette
  - haze-orb layout
  - star creation
  - star advance drift
  - short tail direction/length
- move `MenuScene` backdrop work onto that owner contract
- tune the live field toward a denser cloudy purple backdrop with less radial/procedural read
- add repo-owned proof in `tests/reset/legacy-menu-backdrop.test.ts`
- keep the packet out of board geometry, title layout, button layout, and gameplay logic

## Boundaries preserved

- no menu snapshot geometry change
- no board/title/button layout change
- no board material/tile-read change
- no play-state or overlay behavior change
- no deploy

## Proof

- `npm run test -- tests/reset/legacy-menu-backdrop.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- live localhost inspection on the maintained `http://127.0.0.1:4173/` browser surface

## Visual result

- the desktop backdrop now reads less like a center-radiating procedural starburst
- the field carries more cloudy violet mass behind and around the board
- the owner chain is explicit enough that later backdrop or material work can stay modular

The marker stays held at `87%` because this pass improves the backdrop field and the system map, but it does not honestly close the final screenshot-grade backdrop/material/composition gap by itself.

## Next honest slice

If menu parity work continues from here, the next bounded visual module should be:

- `board material / tile read`

If proof later shows the remaining drift is mostly atmosphere rather than board material, open one more bounded `backdrop field` packet only with a newly identified miss and fresh screenshot proof.
