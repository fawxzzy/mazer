# Mazer Legacy Menu Connected Trench Core Packet

Date: 2026-07-01
Lane: legacy Unreal truth -> web app reset/port
Module: board material / tile read
Marker: held at `97%`

## Why this packet existed

The live menu board still read too much like separated square cells in the maintained side-browser proof surface.

The restored legacy screenshots show carved corridor runs with continuous gray material and connected cyan trail segments. The current web app still uses the fixed browser menu snapshot, so the bounded move was not a topology rewrite. It was a render-owner pass inside:

- `src/legacy-runtime/legacyMenuRender.ts`
- `src/scenes/MenuScene.ts`
- `tests/scenes/menu-render-frame.test.ts`

## What changed

- added `resolveLegacyMenuPathRenderFrames()` as the menu-only edge/core frame helper
- kept the heavier outer trench frame from `resolveLegacyMenuPathRenderFrame()`
- allowed the lighter core frame to bridge across connected neighboring walkable tiles
- switched `drawStaticBoard()` to draw both the edge frame and connected core frame from the helper
- added focused proof that connected horizontal menu corridors bridge their light core without widening isolated blocked edges

## Proof

Commands run:

- `npm run test -- tests/scenes/menu-render-frame.test.ts`
- `npm run lint`
- `npm run build`

Localhost proof:

- kept the single maintained preview surface on `http://127.0.0.1:4173/?runtimeDiagnostics=1`
- captured `tmp/current-menu-before-material-pass.png`
- captured `tmp/current-menu-after-material-pass.png`
- captured `tmp/current-menu-after-material-pass-desktop.png` with a temporary desktop viewport on the same browser tab

Visual result:

- the board now reads less checkerboarded at the current web snapshot scale
- the cyan active trail connects more like a continuous trench run
- the dense thin-corridor geometry from `legacy/screenshots/menu-03.png` is still not matched 1:1

## Marker decision

No marker ratchet.

Reason:

- this is a real bounded improvement in the board material/tile-read owner chain
- it improves the current fixed web snapshot without changing gameplay, demo, or generation behavior
- it does not close the final screenshot-grade menu material/composition gap
- the honest repo-wide completion marker remains `97%`

## Contract preserved

- shipping/reset lane stays canonical
- one maintained localhost preview stays on `4173`
- no duplicate repo/app/infrastructure surface
- no menu snapshot topology rewrite in this packet
- no play-mode behavior change
- no demo-route or generation lifecycle claim widened by adjacency

## Next honest slice

The next bounded Mazer slice should be one of:

- final screenshot-grade play HUD polish, if the next visible miss is active-play HUD exactness
- fixed menu snapshot density/topology review, if the next visible miss remains the coarse current menu-board geometry against `legacy/screenshots/menu-03.png`
