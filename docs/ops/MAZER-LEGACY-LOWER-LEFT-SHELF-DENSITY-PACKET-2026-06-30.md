# Mazer Legacy Lower-Left Shelf Density Packet

Date: 2026-06-30
Lane: legacy Unreal truth -> web app reset/port
Module: board silhouette
Slice: lower-left shelf density
Marker: held at `89%`

## Why this packet exists

The maintained desktop proof frame still showed a large lower-left black block in the fixed front-door board.

Compared with `legacy/screenshots/menu-03.png` and `legacy/screenshots/menu-04.png`, that area should read more like layered maze shelf density instead of a single oversized void.

This was a fixed menu snapshot problem, not a layout, title, button, or demo timing problem.

## Landed scope

- added a `lower-left-shelves` branch family in `src/legacy-runtime/legacyMenuSnapshot.ts`
- added direct tile proof in `tests/reset/legacy-reset.test.ts`
- resynced:
  - `docs/current-truth.md`
  - `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
  - `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`
  - `docs/system-map.md`

## Boundaries preserved

- no solution-path rewrite
- no board material mutation
- no title lockup mutation
- no button chrome mutation
- no demo pacing mutation
- no play-maze mutation

## Proof

Ran clean:

- `npm run test -- tests/reset/legacy-reset.test.ts tests/reset/legacy-menu-demo-lifecycle.test.ts tests/ai/demo-walker.test.ts`
- `npm run lint`
- `npm run build`

Live proof:

- reloaded the maintained `http://127.0.0.1:4173/?runtimeDiagnostics=1` browser tab
- temporarily widened that same tab to desktop proof size
- confirmed the lower-left interior has more shelf density while the demo still boots into an `explore` state
- reset the browser back to its normal side-pane viewport and confirmed the canvas rendered

## Marker decision

No marker ratchet.

Reason:

- this is a real proof-backed board-silhouette improvement
- it does not close final screenshot-grade menu composition by itself
- the repo-wide marker remains `89%`

## Next honest slice

- if the visible miss remains fixed-board silhouette, continue in `src/legacy-runtime/legacyMenuSnapshot.ts`
- if behavior becomes the bigger miss, switch to demo reset/backtrack exactness in `src/legacy-runtime/legacyMenuDemoLifecycle.ts` and `src/domain/ai/demoWalker.ts`
