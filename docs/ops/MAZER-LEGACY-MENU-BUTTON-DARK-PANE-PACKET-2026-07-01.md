# Mazer Legacy Menu Button Dark-Pane Packet

Date: 2026-07-01
Lane: legacy Unreal truth -> web app reset/port
Segment: Menu screenshot composition and board presentation
Marker result: `79%` -> `80%`

## Boundary

This packet tightens the front-door menu button chrome only.

It does not change:

- maze generation
- active play movement
- menu demo AI
- overlays
- production deploy state
- Supabase, Vercel, or GitHub app-resource identity

## Change

The front-door `Exit`, `Start`, and `Options` buttons now use a legacy-facing dark pane fill and darker hover fill instead of the previous translucent white rectangle.

The new owner path is:

`src/legacy-runtime/legacyMenuButtonChrome.ts` -> `src/scenes/MenuScene.ts#createButton()`

The chrome remains menu-only. Overlay and pause buttons continue to use the existing generic button fallback path.

## Proof

Code proof:

- `tests/reset/legacy-menu-button-chrome.test.ts`
- `tests/scenes/menu-render-frame.test.ts`

Browser proof:

- `tmp/captures/mazer-menu-button-dark-pane-2026-07-01/menu-button-dark-pane-desktop-1366x900.png`
- `tmp/captures/mazer-menu-button-dark-pane-2026-07-01/menu-button-dark-pane-mobile-390x844.png`

Validation run set:

- `npm exec vitest -- run tests/reset/legacy-menu-button-chrome.test.ts tests/scenes/menu-render-frame.test.ts tests/reset/legacy-marker.test.ts`
- `npm run build`

## Marker Re-Evaluation

The touched weighted row is:

`Menu screenshot composition and board presentation`

The row moves from `10 / 14` to `11 / 14`.

Reason: this is a visible runtime menu-composition improvement backed by desktop and mobile captures. The old white-fill button boxes read too modern and too separate from the restored dark board/backdrop composition. The new dark pane-fill treatment is closer to the archived menu support chrome while preserving existing control behavior.

It does not earn more than one point because exact button placement, title-over-board overlap, board silhouette, final material relief, and legacy trail/sprite treatment remain open.
