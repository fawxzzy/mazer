# Mazer Legacy Menu Dynamic Trail Weight Packet

Date: 2026-07-01
Lane: legacy Unreal truth -> web app reset/port
Segment: Menu screenshot composition and board presentation
Marker result: `81%` -> `82%`

## Boundary

This packet tightens the menu-demo dynamic route and marker footprint only.

It does not change:

- maze topology
- maze generation
- demo AI path selection
- active play movement
- button placement
- overlays
- production deploy state
- Supabase, Vercel, or GitHub app-resource identity

## Change

The menu-only dynamic trail now uses a heavier corridor-style cyan edge/core footprint and larger inset marker footprint.

This keeps the route from reading as a hairline while still preserving the previous guardrail that dynamic overlays must not become full-square block cells.

The owner path is:

`src/scenes/MenuScene.ts#fillLegacyMenuDynamicPathTile()` -> `src/scenes/MenuScene.ts#fillMenuDynamicMarkerTile()`

## Proof

Code proof:

- `tests/scenes/menu-render-frame.test.ts`
- `tests/reset/legacy-marker.test.ts`

Browser proof:

- `tmp/captures/mazer-menu-dynamic-trail-2026-07-01/menu-dynamic-trail-desktop-1366x900.png`
- `tmp/captures/mazer-menu-dynamic-trail-2026-07-01/menu-dynamic-trail-mobile-390x844.png`

Validation run set:

- `npm exec vitest -- run tests/scenes/menu-render-frame.test.ts tests/reset/legacy-marker.test.ts`
- `npm run build`

## Marker Re-Evaluation

The touched weighted row is:

`Menu screenshot composition and board presentation`

The row moves from `12 / 14` to `13 / 14`.

Reason: this is a visible runtime improvement backed by completed desktop and mobile captures. The current cyan demo route now reads closer to the restored screenshots' heavier traversal path while remaining a corridor overlay rather than a full-square browser block.

It does not earn more than one point because exact player sprite treatment, final maze silhouette, title overlap, and button placement remain open.
