# Mazer Legacy Menu Wide Route Core Material Packet - 2026-07-01

## Scope

Owner-repo packet for the legacy 1:1 lane.

Touched module:

- board material / tile read

Owner chain:

- `src/legacy-runtime/legacyMenuRender.ts`
- `src/scenes/MenuScene.ts#drawStaticBoard()`
- `tests/scenes/menu-render-frame.test.ts`

## Change

The menu-only static board route material now uses:

- a wider dark route core inside the segment-based trench render path
- a softer static route-edge alpha for menu-mode walkable cells

This keeps the current segment-based gray-slab/dark-route hierarchy but reduces the tiny-grid/checker read in dense route areas.

## Proof

Local proof run:

- `npm run test -- tests/scenes/menu-render-frame.test.ts tests/reset/legacy-marker.test.ts`
- `npm run build`

Local visual proof artifact:

- `tmp/mazer-current-desktop-dim-edge-wide-core-1920x1080.png`

The visual proof moved in the intended direction: dense route areas read more continuous and less checker-heavy. It did not close screenshot-grade legacy parity.

## Marker reevaluation

Current repo-wide 1:1 marker:

- `70%`

Touched weighted segment:

- Menu screenshot composition and board presentation

Point change:

- none

Reason:

- the packet improves one board-material submodule, but restored screenshot parity still needs richer slab material, denser corridor geometry, and final menu composition exactness
- the change is not enough to move the `Menu screenshot composition and board presentation` row from partial to a higher scored state

## Boundaries

Preserved:

- shipping proof remains canonical
- recovery/legacy proof remains additive
- no deploy
- no Supabase or Vercel surface
- no duplicate app identity
- no runtime topology rewrite

Next honest seam:

- continue final screenshot-grade board/material review, or switch to final screenshot-grade play HUD polish if board material needs new reference judgment before another code pass
