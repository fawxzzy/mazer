# Mazer Runtime Diagnostics DOM Surface Packet

Date: 2026-06-30
Lane: Mazer pass 2 parity
Module: runtime diagnostics / localhost proof readback

## Why this packet exists

The prior runtime-diagnostics bridge packet made `MenuScene` publish runtime diagnostics truthfully.

What still remained open was the localhost proof seam:

- the live page rendered
- the canvas updated
- browser console stayed clean
- browser automation still could not read the `window.__MAZER_*` globals directly

That meant the scene-owned data existed, but the right-pane browser and repo proof tooling still lacked a stable readback path.

## Landed scope

- add a proof-only DOM runtime diagnostics attribute:
  - `data-mazer-runtime-diagnostics`
- add a proof-only visible DOM diagnostics surface:
  - `#mazer-runtime-diagnostics`
- format a compact live summary for the side browser
- clear both DOM surfaces when runtime diagnostics are cleared
- fix visibility metrics so suspend/change counters are event-driven instead of publish-loop inflated
- update proof tooling fallbacks in:
  - `scripts/visual/edge-live-check.mjs`
  - `scripts/analysis/capture-runtime-observe.mjs`
  - `scripts/analysis/capture-runtime-soak.mjs`
- extend proof in:
  - `tests/scenes/menu-runtime-diagnostics.test.ts`
  - `tests/visual/edge-live-check.test.ts`

## Contract now explicit

Runtime diagnostics can now be read from three surfaces:

1. `window.__MAZER_RUNTIME_DIAGNOSTICS__`
2. `document.documentElement.getAttribute('data-mazer-runtime-diagnostics')`
3. `#mazer-runtime-diagnostics`

Meaning:

- the live browser can show a proof-only diagnostics panel when `runtimeDiagnostics=1`
- browser automation can recover runtime diagnostics through the DOM attribute even if the `window` globals stay hidden
- repo proof tooling no longer depends on only one browser-owned readback surface

## Live localhost truth after this packet

Single maintained preview server:

- `http://127.0.0.1:4173/`

Verified live on:

- `http://127.0.0.1:4173/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1`

Observed:

- canvas rendered
- no browser `warn` / `error` logs
- `window.__MAZER_RUNTIME_DIAGNOSTICS__` still read as `null` in browser automation
- `data-mazer-runtime-diagnostics` was present and populated
- `#mazer-runtime-diagnostics` was visible in the right-pane browser with current frame/listener/trail state

## Boundaries preserved

- no 1:1 parity ratchet
- no gameplay behavior rewrite
- no staged-generation port
- no deploy
- no root packet

## Proof run

- `npm run test -- tests/scenes/menu-runtime-diagnostics.test.ts`
- `npm run test -- tests/visual/edge-live-check.test.ts`
- `npm run test -- tests/analysis/capture-runtime-observe.test.ts`
- `npm run lint`
- `npm run verify`

## Ratchet

No percent ratchet.

Reason:

- this closes a proof/readback seam, not a weighted legacy parity gap
- it improves correctness and future momentum for localhost inspection
- it does not change the held legacy-completion truth

## Next honest slice

Best next bounded work after this packet:

- generation staged-lifecycle exactness
- demo/reset exactness
- optional boot-status DOM fallback if live localhost investigation needs that same seam closed too
