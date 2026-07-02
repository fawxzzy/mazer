# Mazer Active-Play Input Buffer Diagnostics Packet

- Date: `2026-07-02`
- Branch: `codex/mazer-active-play-input-diagnostics`
- Segment: active-play movement and win/reset loop
- Owner chain: `src/legacy-runtime/legacyPlayStep.ts` -> `src/scenes/MenuScene.ts` -> `src/scenes/menuRuntimeDiagnostics.ts`
- Mode: data-only proof surface

## Objective

Make the active-play input feel seam inspectable from the single maintained localhost browser without changing movement behavior.

## What changed

- Runtime diagnostics now publish `play.inputBuffer`.
- The block includes held direction flags, resolved vector, pending simultaneous-key timer state, pointer-start state, and `simultaneousDelayMs`.
- Diagnostics remain data-only through the existing `data-mazer-runtime-diagnostics` attribute and `window.__MAZER_RUNTIME_DIAGNOSTICS__`.

## What did not change

- No maze generation change.
- No menu visual change.
- No movement/collision rule change.
- No player marker change.
- No deploy or live-resource mutation.

## Marker Decision

Marker stays `93%`.

Reason: this improves proof and debugging for active-play feel, but it does not close final active-play feel, exact old-game input cadence, exact play-board material, Unreal RNG/time seeding, or process-yield timing.

## Proof

- `npm run test -- tests/scenes/menu-runtime-diagnostics.test.ts tests/reset/legacy-play-step.test.ts`
- `npm run build`
- Maintained browser route:
  - `http://127.0.0.1:4173/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1&v=active-input-buffer`
  - DOM diagnostics reported `surface.mode=play`, `generation.maze.source=play-generated`, and `play.inputBuffer.simultaneousDelayMs=50`.

## Next Exact Slice

Use the exposed input-buffer state while testing active-play keyboard/mobile feel. Only mutate movement behavior if the diagnostics show a concrete mismatch against the restored `MazerPlayer.cpp` input/timer contract.
