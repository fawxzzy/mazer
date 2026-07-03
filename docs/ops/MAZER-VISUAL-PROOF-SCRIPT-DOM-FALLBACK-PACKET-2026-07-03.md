# Mazer Visual Proof Script DOM Fallback Packet

Date: 2026-07-03

Branch:
`codex/mazer-visual-diagnostics-script-fallback`

## Goal

Use the new `data-mazer-visual-diagnostics` fallback inside repo-owned visual proof scripts.

## Why This Was Needed

The scene now mirrors visual diagnostics into a data-only DOM attribute, but the main proof scripts still read `window.__MAZER_VISUAL_DIAGNOSTICS__` directly.

That left visual matrix, capture, and edge-live checks exposed to the same browser-global visibility issue that caused maintained-browser proof drift.

## Changes

- `scripts/visual/edge-live-check.mjs` now reads visual diagnostics from the window global first, then `data-mazer-visual-diagnostics`.
- `scripts/visual/capture.mjs` now uses the same visual diagnostics fallback.
- `scripts/visual/capture-layout-matrix.mjs` now uses the same visual diagnostics fallback.
- `tests/visual/edge-live-check.test.ts` proves DOM fallback readback for both runtime and visual diagnostics and guards the three proof scripts against returning to window-only reads.

## Marker Decision

Marker remains `93%`.

Reason: this is proof reliability. It does not change gameplay, rendering, menu composition, active-play feel, generated play-board material, or exact Unreal RNG/process timing.

## Validation

```txt
npm run test -- tests/visual/edge-live-check.test.ts
npm run verify
npm run edge:live -- --skip-build true --headless true --run core-only-play
```

Edge-live output:

```json
{
  "runDir": "C:\\ATLAS\\tmp\\captures\\mazer-edge-live\\core-only-play",
  "summaryPath": "C:\\ATLAS\\tmp\\captures\\mazer-edge-live\\core-only-play\\summary.json",
  "markdownPath": "C:\\ATLAS\\tmp\\captures\\mazer-edge-live\\core-only-play\\summary.md",
  "captureCount": 2
}
```

## Follow-Up

The next visual/play-feel packet can use `data-mazer-visual-diagnostics` through the repo proof scripts instead of relying on hidden globals or manual guesswork.
