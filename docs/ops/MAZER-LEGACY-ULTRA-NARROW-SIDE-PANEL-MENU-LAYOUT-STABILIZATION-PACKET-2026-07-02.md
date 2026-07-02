# Mazer Legacy Ultra-Narrow Side-Panel Menu Layout Stabilization Packet

Date: 2026-07-02
Status: landed
Lane: Mazer legacy 1:1 parity

## Problem

The Codex in-app browser side panel was rendering the game at about `172x407` CSS pixels. The previous menu layout kept a hard `300px` minimum board size and always used a horizontal three-button front-door row.

Result:

- the board looked zoomed/cropped
- `Exit`, `Start`, and `Options` overlapped in the ultra-narrow panel
- the issue looked like camera zoom, but the root cause was menu layout math at an unsupported narrow width

## Change

Updated `src/legacy-runtime/legacyMenuLayout.ts` and `src/scenes/MenuScene.ts` so ultra-narrow portrait widths:

- fit the menu board inside the viewport
- allow `3px` tile size at side-panel scale
- switch the front-door controls to a vertical stack
- keep normal portrait and desktop widths on the existing row layout

## Proof

Passed:

```bash
npm run test -- tests/reset/legacy-menu-layout.test.ts tests/scenes/menu-render-frame.test.ts
npm run build
```

Browser check:

- in-app browser viewport observed at `172x407`
- reloaded `http://127.0.0.1:4173/?runtimeDiagnostics=1&v=1782925533705-route-quality-bound`
- no console warnings/errors observed
- visible board now fits the side panel
- front-door buttons are separated vertically

## Marker Decision

The Mazer legacy 1:1 marker remains held at `93%`.

Reason:

- this fixes a real responsive/browser-side layout defect
- it does not close exact legacy widget placement
- it does not close screenshot-grade menu composition
- it does not affect gameplay, maze topology, deploy state, or live resources

## Next Honest Slice

Continue with one bounded Mazer owner-repo slice:

- active-play feel / generated play-board material review, or
- demo/backtracking exactness if proof exposes a route behavior mismatch, or
- final screenshot-grade menu material/composition tightening.
