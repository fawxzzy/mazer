# Mazer Legacy Menu Path Relief Material Packet

Date: 2026-07-01
Mode: owner-repo visual parity packet
Repo lane: Mazer legacy 1:1 reset/port

## Scope

This packet tightens one bounded menu-board material gap:

- owner chain: `src/legacy-runtime/legacyMenuRender.ts` -> `src/scenes/MenuScene.ts#drawStaticBoard()`
- proof chain: `tests/scenes/menu-render-frame.test.ts` -> desktop/mobile localhost captures
- completion marker row: `Menu screenshot composition and board presentation`

## Change

Menu-mode connected corridor rendering now draws a dark offset relief shadow before the existing dark edge and light core passes.

The remaining wall-grid overlay was also quieted so the menu board reads less like a modern graph-paper raster and more like the restored legacy screenshot's shadowed slab/trench material.

This does not change:

- fixed menu snapshot topology
- generated play topology
- demo AI behavior
- active play movement
- HUD behavior
- title or button layout

## Proof

Focused proof:

```bash
npm exec vitest -- run tests/scenes/menu-render-frame.test.ts tests/reset/legacy-marker.test.ts
npm run lint
npm run build
```

Browser proof from the single maintained `4173` localhost tab:

- `tmp/captures/mazer-menu-material-relief-2026-07-01/menu-material-relief-desktop-1366x900-final.png`
- `tmp/captures/mazer-menu-material-relief-2026-07-01/menu-material-relief-mobile-390x844-final.png`

## Marker decision

The repo-wide marker moves from `77%` to `78%`.

Reason:

- the touched visual segment changed runtime output, not just documentation
- desktop and mobile captures show the completed board with the relief pass active
- the weighted row, current truth, parity matrix, system map, and proof surface now agree

Limit:

- exact old screenshot silhouette, final material relief, wordmark overlap, button composition, and legacy trail/sprite treatment still differ visibly
- this is one point only, not final screenshot-grade closure

