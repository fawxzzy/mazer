# Mazer Active-Play Centered Layout Packet

Date: 2026-07-03

## Scope

Owner-repo only: `C:\ATLAS\repos\mazer`

This packet fixes the maintained side-browser read where active play inherited the front-door menu layout and left the board pinned high in a `172x407` viewport. It does not change maze generation, AI routing, shortcuts, input semantics, or reset lifecycle.

## Changes

- `src/legacy-runtime/legacyMenuLayout.ts` now accepts a `menu` or `play` layout surface.
- Menu mode keeps the existing board/title/button composition and ultra-narrow stacked `Exit` / `Start` / `Options` behavior.
- Play mode gets a centered board-framing surface so the active maze reads as a cleaner top-down play field instead of a menu composition with unused button space.
- `src/scenes/MenuScene.ts` requests the play layout only in active play and publishes resolved layout/button diagnostics through `data-mazer-visual-diagnostics`.
- `tests/reset/legacy-menu-layout.test.ts` guards ultra-narrow play centering, preserved menu button stack fit, and larger desktop play-board framing.

## Browser Proof

Maintained in-app browser, `http://127.0.0.1:4173/`, existing `172x407` side panel:

- Play URL: `?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1&v=topdown-play-layout-pass`
- Play diagnostics:
  - `layout.surface = "play"`
  - `board.bounds = { left: 2, top: 119, right: 171.001, bottom: 288.001 }`
  - `board.tileSize = 3.449`
  - `hud.kind = "legacy-play-hud"`
  - `timerText = "0:00"`
- Menu URL: `?runtimeDiagnostics=1&v=topdown-menu-layout-pass`
- Menu diagnostics:
  - `layout.surface = "menu"`
  - `layout.buttonLayout = "stack"`
  - `leftButtonY = 250`
  - `centerButtonY = 300`
  - `rightButtonY = 350`
  - `board.bounds = { left: 2, top: 42, right: 171.001, bottom: 211.001 }`
- Edge live `core-only-play`:
  - phone portrait board: `{ left: 24, top: 251, right: 367, bottom: 594 }`
  - desktop board: `{ left: 353, top: 83, right: 1088, bottom: 818 }`
  - `boardOverflow.pass = true`
  - `hudOverlap.pass = true`
  - `hudClip.pass = true`

## Validation

- `npm run test -- tests/reset/legacy-menu-layout.test.ts tests/scenes/menu-render-frame.test.ts`
- `npm run lint`
- `npm run build`
- `npm run verify`
- `npm run edge:live -- --skip-build true --headless true --run core-only-play`

## Marker

The 1:1 marker remains `93%`.

Reason: this closes a maintained-browser layout/readability defect and improves proof diagnostics, but it does not close exact legacy camera behavior, final active-play feel, screenshot-grade menu composition, exact player sprite treatment, Unreal RNG/time seeding, or process-yield timing.
