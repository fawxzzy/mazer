# Mazer Legacy Generation Entry Gate Contract Packet

Date: 2026-06-30
Lane: Mazer pass 2 parity
Module: generation lifecycle exactness

## Why this packet exists

The repo already carried:

- stage ids
- menu-vs-play cadence
- stage-7 finalize responsibilities
- process-8 reset branches
- checkpoint/shortcut budget metadata

What was still missing was the actual GameState/Logic entry gate truth:

- uninitialized generation enters through a delay-gated process `0` path
- initialized reset enters through a process `8` path after `_ResetGame` is consumed

Without that contract, the reset lane still described stage ownership more clearly than entry ownership.

## Landed scope

- add explicit generation tick-gate contract in `src/legacy-runtime/legacyGenerationLifecycle.ts`
- add explicit reset entry contract in `src/legacy-runtime/legacyPlayLifecycle.ts`
- attach generation gate metadata to:
  - runtime-created mazes
  - queued generation requests
  - scene diagnostics
- attach reset entry metadata to:
  - reset requests
  - scene diagnostics
- extend proof in:
  - `tests/reset/legacy-generation-lifecycle.test.ts`
  - `tests/reset/legacy-generation-diagnostics.test.ts`
  - `tests/reset/legacy-play-lifecycle.test.ts`
  - `tests/reset/legacy-reset.test.ts`

## Contracts now explicit

Generation entry:

- `entryStageId = 0`
- waits for level-building delay
- arms delay start on queue
- consumes while uninitialized
- does not consume while initialized
- restarts the level-building timer after consume

Reset entry:

- `entryStageId = 8`
- consumes while initialized
- clears the reset flag on consume
- rearms delay start only for menu/demo regeneration
- returns to template level only for active play

## Boundaries preserved

- no staged generator rewrite
- no topology rewrite
- no menu shell rewrite
- no deploy
- no root packet

## Proof run

- `npm run test -- tests/reset/legacy-generation-lifecycle.test.ts`
- `npm run test -- tests/reset/legacy-generation-diagnostics.test.ts`
- `npm run test -- tests/reset/legacy-play-lifecycle.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`

## Ratchet

This packet supports a bounded generation-row ratchet:

- generation lifecycle exactness: `11 -> 12`
- repo marker: `81 -> 82`

Reason:
the runtime now carries the legacy GameState/Logic entry semantics for process `0` and process `8`, not just stage lists and budget metadata.

## Next honest slice

Stay inside the same owner chain and move from explicit entry contracts toward real staged-process progression and wait-state behavior, without broad scene churn.
