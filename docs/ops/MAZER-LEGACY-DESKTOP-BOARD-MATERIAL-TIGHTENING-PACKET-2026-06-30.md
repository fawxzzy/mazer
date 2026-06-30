# Mazer Legacy Desktop Board Material Tightening Packet

Date: 2026-06-30
Lane: Mazer pass 2 menu parity
Segment: `Menu screenshot composition and board presentation`
Module: `board material / tile read`
Status: landed
Marker: held at `87%`

## Why this packet exists

After the desktop backdrop-owner pass, the strongest remaining front-door miss was still material:

- the menu board still read too evenly tiled
- the trench mass still read too crisp and too bright
- the board surround had improved, but the maze body still lagged the screenshot truth

This packet tightens only the desktop menu board material lane.

## Landed scope

- darken the menu-only board fill, wall fill, path core, and path edge in `src/scenes/MenuScene.ts`
- reduce menu-only grid contrast
- increase the menu-only inner trench inset so the walkable mass reads more carved than evenly filled
- refresh the repo-owned board-material source guard in `tests/scenes/menu-render-frame.test.ts`

## Boundaries preserved

- no menu layout math change
- no title lockup change
- no button chrome change
- no menu snapshot geometry rewrite
- no play-mode behavior change
- no demo-route pacing change
- no deploy

## Proof

- `npm run test -- tests/scenes/menu-render-frame.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- live localhost inspection on the maintained `http://127.0.0.1:4173/` browser surface

## Visual result

- the desktop maze body now reads darker and less evenly tiled
- walkable trench cores read slightly more carved instead of bright flat blocks
- the packet reduces the current material miss without reopening layout or silhouette ownership

The marker stays held at `87%` because this pass narrows the material gap, but the menu still does not honestly reach final screenshot-grade board/material/composition closure.

## Next honest slice

If menu parity work continues from here, the next bounded module should be either:

- `demo route / pacing`, or
- one final screenshot-grade `composition reconciliation` packet only if a new exact visual miss is named first
