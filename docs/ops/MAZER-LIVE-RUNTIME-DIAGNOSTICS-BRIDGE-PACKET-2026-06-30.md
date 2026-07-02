# Mazer Live Runtime Diagnostics Bridge Packet

Date: 2026-06-30
Lane: Mazer pass 2 parity
Module: runtime diagnostics / proof observability

## Why this packet exists

The repo already had:

- `src/scenes/menuRuntimeDiagnostics.ts`
- query parsing for `runtimeDiagnostics=1`
- runtime-diagnostics unit coverage for config parsing, performance-mode hysteresis, and feed summaries

But the actual scene never imported or published that surface.

Truth before this packet:

- `runtimeDiagnostics=1` could be parsed
- tests could prove the helper module in isolation
- the live `MenuScene` still never wrote `window.__MAZER_RUNTIME_DIAGNOSTICS__`

That made the diagnostics lane misleading for localhost proof and weakened the repo-owned map of the running app.

## Landed scope

- wire `src/scenes/MenuScene.ts` into `src/scenes/menuRuntimeDiagnostics.ts`
- initialize runtime-diagnostics config from the live query string and navigator hints
- record rolling frame-window samples from the active scene update loop
- publish runtime-diagnostics snapshots on create and at the configured interval during update
- clear the runtime-diagnostics surface on scene shutdown
- extend repo proof with:
  - direct window publish/clear coverage in `tests/scenes/menu-runtime-diagnostics.test.ts`
  - scene source-guard coverage in `tests/reset/legacy-reset.test.ts`

## Contract now explicit

The live owner chain is now:

- `window.location.search`
- `src/scenes/menuRuntimeDiagnostics.ts`
- `src/scenes/MenuScene.ts`
- `window.__MAZER_RUNTIME_DIAGNOSTICS__`

`MenuScene` now owns:

- runtime-diagnostics enablement from `runtimeDiagnostics=1`, `runtime=1`, or `soak=1`
- low-power detection/forcing inputs
- rolling frame-window summaries
- performance-mode classification
- periodic runtime publish cadence
- scene shutdown cleanup for the runtime diagnostics surface

## What this packet does not claim

- no 1:1 legacy parity ratchet by itself
- no claim that runtime diagnostics are now visually complete or semantically exhaustive
- no claim that browser automation can always read the published globals directly
- no staged-generation port
- no deploy
- no root packet

## Live localhost truth after the bridge

Single maintained preview server:

- `http://127.0.0.1:4173/`

Live right-pane browser check showed:

- the current app still renders cleanly on the single preview server
- the active play surface is visible after reload
- browser console `warn` / `error` logs stayed empty
- browser automation evaluation still did not surface `window.__MAZER_BOOT_STATUS__`, `window.__MAZER_GAME__`, `window.__MAZER_VISUAL_DIAGNOSTICS__`, or `window.__MAZER_RUNTIME_DIAGNOSTICS__` even while the canvas rendered

Treat that as a current observability seam in the browser automation surface, not as proof that the scene bridge is absent.

## Proof run

- `npm run test -- tests/scenes/menu-runtime-diagnostics.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`

## Ratchet

No percent ratchet.

Reason:

- this packet makes diagnostics truthful and repo-owned
- it improves mapping, proof, and debugging value
- it does not by itself close a legacy parity gap large enough to move the 1:1 completion marker

## Next honest slice

Stay modular.

Best next slices from here are:

- generation staged-lifecycle exactness
- demo/reset exactness
- browser-observability explanation packet if direct localhost diagnostics readback becomes critical again
