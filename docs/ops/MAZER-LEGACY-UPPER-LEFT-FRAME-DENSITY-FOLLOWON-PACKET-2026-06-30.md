# Mazer Legacy Upper-Left Frame Density Follow-On Packet

Date: 2026-06-30
Lane: legacy Unreal truth -> web app reset/port
Module: board silhouette
Slice: upper-left frame density follow-on
Marker: held at `88%`

## Why this packet existed

After the tile-read follow-on, the clearest remaining menu-board geometry miss still sat in the upper-left corner.

Compared with `legacy/screenshots/menu-03.png` and `legacy/screenshots/menu-04.png`, the current desktop board still read a little too open around:

- the upper-left pocket
- the title-adjacent upper-left lattice
- the top of the left outer frame

## Landed scope

- tightened only the fixed menu snapshot owner chain in `src/legacy-runtime/legacyMenuSnapshot.ts`
- extended:
  - `upper-left-pocket`
  - `upper-left-lattice`
  - `left-frame`
- added direct tile proof in `tests/reset/legacy-reset.test.ts`

## Boundaries preserved

- no solution-path rewrite
- no board-material/tile-read mutation
- no title presentation math mutation
- no button chrome mutation
- no play-maze mutation
- no demo-route pacing mutation

## Proof

Commands run:

- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run lint`

Visual proof note:

- no fresh localhost screenshot is attached to this packet
- visual closure remains intentionally unclaimed until the next route-aware screenshot pass

## Marker decision

No marker ratchet.

Reason:

- this is a real proof-backed board-silhouette improvement
- but it does not close the remaining screenshot-grade visual-composition gap by itself
- the honest repo-wide completion marker remains `88%`

## Next honest slice

- if the next visible miss is still raw menu-board geometry, continue in `src/legacy-runtime/legacyMenuSnapshot.ts`
- if the next visible miss becomes title overlap, board fit, or button spacing again, move back to `src/legacy-runtime/legacyMenuLayout.ts` and `src/scenes/MenuScene.ts`
