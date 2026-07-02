# Mazer Legacy Ultra-Narrow Side-Panel Title Scale Packet

Date: 2026-07-02

## Packet

Bounded owner-repo packet for the maintained in-app browser side panel.

## Trigger

The side-panel browser viewport was only about `172x407` CSS pixels. The previous ultra-narrow layout packet stacked the front-door buttons and fit the board, but the menu title still used the normal portrait minimum font size. Result: the title read as oversized inside the side panel and made the menu look zoomed/jumbled even though the board and buttons were now positioned correctly.

## Changed

- `src/legacy-runtime/legacyMenuTitle.ts`
  - added an optional viewport-width input to the title presentation resolver
  - preserves existing desktop and normal portrait title sizing
  - caps title font size and shadow offsets only for ultra-narrow portrait widths below `360px`
- `src/scenes/MenuScene.ts`
  - passes the live viewport width into the title presentation resolver
- `tests/reset/legacy-menu-title.test.ts`
  - adds an ultra-narrow side-panel regression check for the `172px` maintained browser case

## Verification

```bash
npm run test -- tests/reset/legacy-menu-title.test.ts tests/reset/legacy-menu-layout.test.ts tests/scenes/menu-render-frame.test.ts
npm run build
```

Browser proof:

- reloaded the existing maintained `http://127.0.0.1:4173/?runtimeDiagnostics=1&v=1782925533705-route-quality-bound` tab
- observed `172x407` viewport with one Phaser canvas
- captured immediate and settled side-panel screenshots
- no console warnings or errors

## Marker decision

The 1:1 marker remains held at `93%`.

Reason: this closes a clear side-browser title-scale defect and improves the maintained mobile-proof surface, but it does not close the final screenshot-grade menu composition segment. Exact title overlap, board silhouette, material relief, button composition, and legacy player/trail treatment remain open.
