# Mazer Legacy Menu Material Contrast Packet

Date: 2026-07-01
Lane: legacy Unreal truth -> web app reset/port
Segment: Menu screenshot composition and board presentation
Marker result: `80%` -> `81%`

## Boundary

This packet tightens the menu-board material contrast only.

It does not change:

- maze topology
- maze generation
- active play movement
- menu demo AI
- button placement
- overlays
- production deploy state
- Supabase, Vercel, or GitHub app-resource identity

## Change

The menu-only board material now uses darker wall/slab mass and stronger path-edge contrast:

- darker board fill
- darker wall fill
- darker path edge
- slightly less washed-out path core
- stronger path-edge alpha

The owner path is:

`src/legacy-runtime/legacyMenuRender.ts` -> `src/scenes/MenuScene.ts#drawStaticBoard()`

## Proof

Code proof:

- `tests/scenes/menu-render-frame.test.ts`
- `tests/reset/legacy-marker.test.ts`

Browser proof:

- `tmp/captures/mazer-menu-material-contrast-2026-07-01/menu-material-contrast-desktop-complete-1366x900.png`
- `tmp/captures/mazer-menu-material-contrast-2026-07-01/menu-material-contrast-mobile-complete-390x844.png`

Validation run set:

- `npm exec vitest -- run tests/scenes/menu-render-frame.test.ts tests/reset/legacy-marker.test.ts`
- `npm run build`

## Marker Re-Evaluation

The touched weighted row is:

`Menu screenshot composition and board presentation`

The row moves from `11 / 14` to `12 / 14`.

Reason: this is a visible runtime material improvement backed by completed desktop and mobile captures. The current board now reads closer to the restored screenshots' hard charcoal/light-gray maze material rather than the earlier cleaner, flatter browser slab.

It does not earn more than one point because exact maze silhouette, final title overlap, button placement, and legacy trail/player sprite treatment remain open.
