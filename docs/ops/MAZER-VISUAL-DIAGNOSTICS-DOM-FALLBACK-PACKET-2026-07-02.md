# Mazer Visual Diagnostics DOM Fallback Packet

Date: 2026-07-02

Branch:
`codex/mazer-visual-diagnostics-dom-fallback`

## Goal

Make visual proof readable from the maintained in-app browser without depending on hidden `window.__MAZER_*` globals.

## Why This Was Needed

The active visual diagnostics already publish board, HUD, runtime, and camera-follow proof to `window.__MAZER_VISUAL_DIAGNOSTICS__`, but browser automation has repeatedly failed to read that hidden window global reliably.

Runtime diagnostics already solved the same issue with `data-mazer-runtime-diagnostics`. Visual proof needed the matching data-only fallback before final 1:1 visual passes could be trusted from the single maintained `4173` browser.

## Changes

- Added `MENU_SCENE_VISUAL_DIAGNOSTICS_ATTRIBUTE`.
- Mirrored `MenuScene` visual diagnostics into `data-mazer-visual-diagnostics`.
- Cleared the DOM fallback with the existing visual diagnostics window global.
- Added a source-level render-frame guard for the fallback contract.
- Updated the system map, current truth, and legacy 1:1 marker.

## Marker Decision

Marker remains `93%`.

Reason: this is a proof-surface improvement. It does not change gameplay behavior, menu composition, active-play feel, generated play-board material, or exact Unreal RNG/process timing.

## Validation

```txt
npm run test -- tests/scenes/menu-render-frame.test.ts
npm run build
localhost browser proof on http://127.0.0.1:4173/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1&v=active-input-buffer
```

Browser proof:

```json
{
  "runtimeMode": "play",
  "visualMode": "play",
  "visualOverlay": "none",
  "hudKind": "legacy-play-hud",
  "hudTimerText": "0:00",
  "visualAttrLength": 4691,
  "visualBoard": {
    "left": 2,
    "top": 42,
    "right": 171.001,
    "bottom": 211.001,
    "width": 169.001,
    "height": 169.001
  },
  "visualTileSize": 3.449,
  "hasWindowVisualDiagnostics": false
}
```

## Follow-Up

Use `data-mazer-visual-diagnostics` for the next bounded visual/play-feel packet instead of guessing from screenshots alone.
