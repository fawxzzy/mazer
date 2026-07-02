# Mazer Clean Top-Down Board Visibility Hold Packet

Date: 2026-07-02

## Scope

Repo: `mazer`

Branch: `codex/mazer-clean-topdown-board-visibility`

Goal: continue the clean 2D maze direction by removing remaining pseudo-depth cues from the maintained reset-lane renderer and making the 49-cell maze more readable in the narrow Codex side-browser viewport.

## Changes

- Ultra-narrow menu/play layout now uses fractional tile sizing and a `98%` width cap instead of snapping 49-cell boards down to integer `3px` tiles.
- Menu static-board rendering no longer draws the visible grid overlay, top-left bevel sheen, or thick extruded slab frame.
- The shared live player marker keeps its centered halo/core treatment but removes the offset drop-shadow read.
- Tests now guard the ultra-narrow wider-board contract and the no-grid/no-bevel clean-2D render lane.

## Proof

- `npm run test -- tests/reset/legacy-menu-layout.test.ts tests/scenes/menu-render-frame.test.ts`
- `npm run build`
- Maintained browser proof on `http://127.0.0.1:4173/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1&v=active-input-buffer`
  - before this packet: side-pane board was about `147px` wide with `3px` tiles
  - after this packet: side-pane board is about `169px` wide with `3.449px` tiles
  - route remains `mode=play`, `source=play-generated`, `mazeSize=49`
- Temporary viewport checks confirmed centered board bounds for portrait and desktop proof before resetting the browser viewport.

## Marker

Mazer legacy 1:1 marker remains `93%`.

Reason: this improves readability and removes confusing pseudo-3D depth cues, but it does not close exact screenshot-grade live procedural-menu silhouette, final material role, exact legacy player sprite treatment, final active-play feel, Unreal RNG/time seeding, or process-yield timing.

## Boundaries

- No generation topology changes.
- No movement logic changes.
- No deploy.
- No live-resource mutation.
- No key rotation.
