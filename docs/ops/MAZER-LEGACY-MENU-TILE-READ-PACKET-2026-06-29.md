# Mazer Legacy Menu Tile Read Packet

## Scope

- tighten the menu-only tile/trench read without reopening layout math or snapshot geometry
- keep the change inside the menu render helper and menu-only static board draw path
- preserve play-mode rendering behavior

## Why

After the silhouette and portrait packets, the board was closer to the legacy screenshots but still read too clean:

- menu trenches still felt a little too checkerboard-clean
- closed wall cells still showed a stronger modern grid than the older screenshot plate
- the board needed slightly thicker corridor continuity before another shell-only pass would be honest

## Landed

- `src/legacy-runtime/legacyMenuRender.ts`
  - reduced closed-edge inset size so menu trenches bridge more of each tile

- `src/scenes/MenuScene.ts`
  - softened the menu-only slab grid alpha
  - softened the menu-only wall interior texture

- `tests/scenes/menu-render-frame.test.ts`
  - updated the render-frame contract to match the thicker trench continuity

## Boundaries Preserved

- no menu snapshot geometry changed
- no title/button/layout math changed
- no play-mode runtime logic changed
- no deploy or infra work happened here

## Validation

- `npm run test -- tests/scenes/menu-render-frame.test.ts tests/reset/legacy-reset.test.ts`
- `npm run lint`
- `npm run build`
- `npm run visual:matrix -- --preset core --skip-build true`

Latest proof artifact:

- `tmp/captures/mazer-layout-matrix/2026-06-29T19-34-16-944Z`

## Current Truth After This Pass

- the menu board reads a little thicker and less like a modern grid overlay
- the side-browser preview is still clean on the single `4173` preview server
- exact screenshot-grade material parity is still open, but the tile/trench read is more truthful than the prior baseline

## Next Honest Slice

- if the next visible miss is still board material/background balance, continue in `src/scenes/MenuScene.ts`
- if the next visible miss is geometry, return to `src/legacy-runtime/legacyMenuSnapshot.ts`
- if the next visible miss is attract pacing, move to `src/legacy-runtime/legacyDemoWalker.ts`
