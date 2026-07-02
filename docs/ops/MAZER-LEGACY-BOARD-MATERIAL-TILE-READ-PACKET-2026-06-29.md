# Mazer Legacy Board Material Tile Read Packet

Date: 2026-06-29
Lane: Mazer pass 2 menu parity
Module: board material / tile read

## Why this packet exists

After the silhouette packets, the menu board still read too chunky and too bright compared with the legacy screenshots. Geometry alone was not enough; the path tiles still looked like filled blocks instead of thinner grayscale trench work.

## Landed scope

- tighten menu path edge insets in `src/legacy-runtime/legacyMenuRender.ts`
- darken the menu-only path grayscale in `src/scenes/MenuScene.ts`
- increase the inner path inset so connected runs read slimmer and less filled-in

## Boundaries preserved

- no maze geometry rewrite
- no title placement change
- no button chrome change
- no play-mode render rewrite
- no demo-route pacing change

## Proof plan

- `npm run test -- tests/scenes/menu-render-frame.test.ts`
- live localhost inspection in the in-app browser
- `npm run verify` before packet closure

## Next honest slice

If this packet lands cleanly, the next bounded menu-read slice should be one of:

- slab/frame material balance, or
- right-side goal mass silhouette
