# Mazer Runtime Diagnostics Demo Proof Surface Packet

Date: 2026-06-30
Lane: Mazer pass 2 proof-surface tightening
Module: `runtime diagnostics visible surface`
Status: landed
Marker: held at `88%`

## Why this packet exists

The repo already published front-door demo state into scene diagnostics, but the maintained browser proof surface still did not expose the exact fields needed for fast parity work:

- active menu-demo cue
- whether the fixed front-door snapshot was using the mistake-enabled legacy lane
- the live path cursor

That forced proof work back onto hidden browser globals or test-only reasoning.

## Landed scope

- bridge `menuDemo` state into `MenuSceneRuntimeDiagnostics`
- extend the visible `#mazer-runtime-diagnostics` panel text with:
  - demo phase
  - cue
  - runner-mistakes lane state
  - path cursor
- add/refresh repo-owned proof in `tests/scenes/menu-runtime-diagnostics.test.ts`

## Boundaries preserved

- no gameplay behavior change
- no menu layout or rendering change
- no deploy
- no marker ratchet by adjacency

## Proof

- `npm run test -- tests/scenes/menu-runtime-diagnostics.test.ts`
- `npm run test -- tests/reset/legacy-menu-demo-lifecycle.test.ts`
- localhost inspection on `http://127.0.0.1:4173/?runtimeDiagnostics=1`

## Result

The visible diagnostics panel now serves as a truthful browser-side proof surface for front-door demo packets without relying on the flaky `window.__MAZER_*` readback seam.

This does not earn a marker move because it improves proof clarity and workflow rather than closing a new legacy-owned parity gap by itself.
