# Mazer Legacy Menu Tile-Read Follow-On Packet

Date: 2026-06-30
Lane: legacy Unreal truth -> web app reset/port
Module: board material / tile read
Marker: held at `88%`

## Why this packet existed

The live menu board was still reading too checkerboarded compared with the restored legacy screenshots.

The next truthful bounded move was not another geometry rewrite.
It was a tile-read follow-on inside the existing render owner chain:

- `src/legacy-runtime/legacyMenuRender.ts`
- `src/scenes/MenuScene.ts`
- `tests/scenes/menu-render-frame.test.ts`

## What changed

- widened the menu-only trench light core in `drawStaticBoard()`
- reduced menu-only wall-grid noise in `drawStaticBoard()`
- kept the fixed menu snapshot geometry unchanged
- kept menu demo behavior unchanged
- kept play-mode runtime behavior unchanged

## Proof

Commands run:

- `npm run test -- tests/scenes/menu-render-frame.test.ts`
- `npm run lint`

Localhost proof:

- reloaded the single maintained preview tab at `http://127.0.0.1:4173/?runtimeDiagnostics=1`
- visually confirmed the menu board reads slightly thicker and less checkerboarded than the prior tile-read baseline

## Marker decision

No marker ratchet.

Reason:

- this is a real proof-backed improvement in the board material/tile-read lane
- but it does not close the remaining screenshot-grade board material/composition gap on its own
- the honest repo-wide completion marker remains `88%`

## Contract preserved

- shipping/reset lane stays canonical
- one maintained localhost preview stays on `4173`
- no duplicate repo/app/infrastructure surface
- no menu snapshot geometry rewrite in this packet
- no demo or generation lifecycle claim widened by adjacency
