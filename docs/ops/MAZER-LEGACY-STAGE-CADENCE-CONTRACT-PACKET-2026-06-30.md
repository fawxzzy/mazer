# Mazer Legacy Stage-Cadence Contract Packet

Date: 2026-06-30
Lane: Mazer pass 2 parity
Module: generation / reset contract

## Why this packet exists

After explicit queued requests, explicit stage-7 finalize state, and explicit process-8 reset branches landed, the repo still did not carry one important part of legacy staged truth:

- menu-time generation slices `0/3/4/5/6` differently than active play
- the current web runtime still builds mazes in one shot, but the exact old cadence was not encoded anywhere repo-owned
- that made the remaining staged-port gap harder to map and easier to regress silently

## Landed scope

- extend `src/legacy-runtime/legacyGenerationLifecycle.ts` with an explicit per-stage execution plan for:
  - `0` `CreateGrid`
  - `3` `MapPath`
  - `4` `CreatePath`
  - `5` `CreateShortCuts`
  - `6` `Draw`
  - `7` `Finalize`
  - `8` `Reset`
- carry the plan through:
  - generation requests
  - runtime maze metadata
  - scene diagnostics
- add proof in:
  - `tests/reset/legacy-generation-lifecycle.test.ts`
  - `tests/reset/legacy-generation-diagnostics.test.ts`
  - `tests/reset/legacy-reset.test.ts`
- resync the current-truth, parity matrix, completion marker, and system-map docs

## Boundaries preserved

- no claim that the browser now runs the full staged generator incrementally
- no topology rewrite
- no demo walker rewrite
- no overlay rewrite
- no deploy

## Proof plan

- `npm run test -- tests/reset/legacy-generation-lifecycle.test.ts`
- `npm run test -- tests/reset/legacy-generation-diagnostics.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`

## Ratchet result

This packet earns the next bounded generation ratchet.

- `75% -> 76%`

Reason:

- one named completion-marker segment changed with proof
- the repo now carries explicit menu-vs-play cadence truth for stage `0/3/4/5/6`, not just stage ids
- diagnostics and runtime metadata now expose the old staged execution shape without overstating a full implementation port
- the packet stayed inside the generation/reset owner chain and made the remaining staged gap narrower and more legible

## Next honest slice

The next bounded generation lane should be one of:

- actual staged implementation extraction for one or more of `0/3/4/5/6`
- exact process-8 generator reinitialize semantics beyond the branch split
- overlay field-by-field responsibility cleanup if generation exactness is paused
