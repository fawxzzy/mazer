# Mazer Legacy Generation Budget Contract Packet

Date: 2026-06-30
Lane: Mazer pass 2 parity
Module: generation lifecycle exactness

## Why this packet exists

The repo already carried explicit generation stage ids, queued request reasons, and menu-vs-play execution cadence.
What was still missing was the legacy checkpoint/shortcut budget contract as a first-class runtime surface.

That left one-to-one review weaker than it needed to be:

- the Unreal formula existed in docs and tuning comments
- the live runtime did not expose those budgets in maze metadata
- runtime diagnostics could not show which generation budget the current surface was actually claiming

## Landed scope

- add an explicit generation budget contract in `src/legacy-runtime/legacyGenerationLifecycle.ts`
- attach that budget metadata to runtime-created mazes in `src/legacy-runtime/legacyMaze.ts`
- publish the budget contract into `window.__MAZER_VISUAL_DIAGNOSTICS__` from `src/scenes/MenuScene.ts`
- add proof in:
  - `tests/reset/legacy-generation-lifecycle.test.ts`
  - `tests/reset/legacy-generation-diagnostics.test.ts`
  - `tests/reset/legacy-reset.test.ts`

## Contract now explicit

- checkpoint formula:
  - `_CheckPointCount = _Scale + (_Scale * _CheckPointModifier)`
- shortcut formula:
  - `_ShortcutCount = _Scale * _ShortcutCountModifier`
- current runtime metadata now reports:
  - normalized scale
  - checkpoint modifier
  - checkpoint count
  - shortcut modifier
  - shortcut count
  - whether shortcut stage `5` is active for the current scale

## Boundaries preserved

- no full staged generator rewrite
- no maze topology rewrite
- no menu shell rewrite
- no deploy
- no root packet

## Proof run

- `npm run test -- tests/reset/legacy-generation-lifecycle.test.ts`
- `npm run test -- tests/reset/legacy-generation-diagnostics.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`

## Ratchet

This packet supports a bounded generation-row ratchet:

- generation lifecycle exactness: `10 -> 11`
- repo marker: `80 -> 81`

Reason:
the runtime now exposes another legacy-owned contract directly in repo-owned proof and live diagnostics, even though the full staged process pipeline remains open.

## Next honest slice

The next bounded generation slice should stay inside the same owner chain:

- either explicit process-stage state progression beyond metadata, or
- the first real staged runtime extraction needed to port `0/3/4/5/6/7/8` behavior without collapsing it back into broad scene logic
