# Mazer Legacy Active Runtime Checkpoint Path-Builder Packet - 2026-07-01

## Scope

This packet replaces the active reset-lane play maze's DFS perfect-maze topology owner with a source-shaped checkpoint path-builder in `src/legacy-runtime/legacyMaze.ts`.

The change is intentionally bounded to the active play snapshot builder and its proof/docs surfaces. It does not change app identity, deploy configuration, Supabase/Vercel resources, or the fixed front-door menu snapshot.

## Legacy truth

The restored Unreal source builds mazes through staged generation responsibilities:

- `CreateGrid`
- `MapPath`
- `CreatePath`
- `CreateShortCuts`
- `Draw`
- finalization/reset branches

Earlier web play generation had already restored budget/stage contracts and shortcut bridge semantics, but active `createLegacyMaze()` still started from a browser-native DFS perfect-maze topology. That was a real 1:1 gap.

## Runtime change

`createLegacyMaze()` now:

- creates a legacy-shaped floor grid with non-floor borders
- chooses a deterministic browser-safe start tile
- resolves checkpoint budget from `_Scale + (_Scale * _CheckPointModifier)`
- selects valid checkpoints with the restored adjacency constraints
- extends paths using closest, random, and preferred candidate strategies
- applies local path-neighbor validation
- backtracks through prior path tiles when blocked
- records longest-path end selection
- builds a duplicate-preserving path-neighbor wall array during the `CreatePath` equivalent
- feeds that wall array into the existing restored `CreateShortCuts` opposite-corridor bridge pass
- reports checkpoint/path/wall-array stats on `LegacyMazeSnapshot.pathBuilderStats`

## Proof

Validated:

```bash
npm run test -- tests/reset/legacy-reset.test.ts
npm run test -- tests/reset/legacy-generation-diagnostics.test.ts
npm run test -- tests/reset/legacy-marker.test.ts
npm run lint
npm run build
npm run verify
npm run edge:live -- --skip-build true --headless true --run core-only-play
```

Browser captures:

```text
tmp/captures/mazer-checkpoint-path-builder-2026-07-01/play-desktop-1366x900.png
tmp/captures/mazer-checkpoint-path-builder-2026-07-01/play-mobile-390x844.png
```

## Marker reevaluation

Touched segment:

- Generation lifecycle exactness

Marker change:

- `73% -> 75%`
- Generation lifecycle exactness: `12/16 -> 14/16`

Why it moved:

- active play topology no longer starts from the previous DFS perfect-maze builder
- the active reset-lane owner now follows the restored `CreateGrid` / `MapPath` / `CreatePath` / `CreateShortCuts` responsibility split
- shortcut creation now consumes the wall array produced by the path-builder's `CreatePath` equivalent

Why it did not move further:

- exact Unreal RNG remains browser-safe deterministic approximation
- exact per-tick process-yield timing is still represented by lifecycle contracts rather than pausing the one-shot browser build internally
- `MapPath()` / `Backtrack()` are source-shaped, not byte-for-byte line-for-line ports
- visual board/material/HUD parity remains separate open marker work

## Current next seam

The next highest-value 1:1 work remains outside this packet:

- final screenshot-grade board/material review
- final screenshot-grade play HUD polish
- active-play/HUD edge-case exactness review

