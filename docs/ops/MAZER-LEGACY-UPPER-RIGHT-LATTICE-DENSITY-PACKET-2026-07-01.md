# Mazer Legacy Upper-Right Lattice Density Packet

Date: 2026-07-01
Lane: legacy Unreal truth -> web app reset/port
Module: board silhouette
Marker: held at `97%`

## Why this packet existed

After the connected trench-core pass, the live front-door board still had a coarse upper-right/title-adjacent mass compared with `legacy/screenshots/menu-03.png`.

The bounded next move was a fixed menu snapshot density pass, not a renderer rewrite, because the visible miss was in the branch topology around the title plate.

Owner chain:

- `src/legacy-runtime/legacyMenuSnapshot.ts`
- `src/legacy-runtime/legacyMaze.ts`
- `src/scenes/MenuScene.ts`
- `tests/reset/legacy-reset.test.ts`

## What changed

- added the `upper-right-lattice` branch family to the fixed menu snapshot
- added a short nested upper-right run near the title/right pocket seam
- added direct tile assertions for the new snapshot density
- updated `docs/system-map.md` so future geometry edits can identify the new branch family

## Proof

Command run:

- `npm run test -- tests/reset/legacy-reset.test.ts`

Result:

- `17` files passed
- `88` tests passed

## Marker decision

No marker ratchet.

Reason:

- this is a real bounded screenshot-composition improvement
- it changes one named board-silhouette owner family
- it does not close the final screenshot-grade menu material/composition gap by itself
- the honest repo-wide completion marker remains `97%`

## Boundaries preserved

- no solution path change
- no active-play behavior change
- no demo-route behavior change
- no render material change
- no deploy
- no live resource mutation

## Next honest slice

The next bounded Mazer slice should stay one module at a time:

- final screenshot-grade play HUD polish, or
- another fixed snapshot branch-density pass only if visual proof identifies one exact board area
