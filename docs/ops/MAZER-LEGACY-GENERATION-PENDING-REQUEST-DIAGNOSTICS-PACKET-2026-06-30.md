# Mazer Legacy Generation Pending-Request Diagnostics Packet

Date: 2026-06-30
Lane: Mazer pass 2 parity
Module: generation lifecycle mapping

## Why this packet exists

The previous generation-budget packet made the live maze contract explicit.
The next missing readback seam was the queued request itself.

Before this packet:

- the runtime could queue a named generation request with build kind, stage ids, execution plan, and budget
- the scene diagnostics only exposed `reason`, `dueAtMs`, `seed`, and `mode`

That made it harder to inspect what the runtime was about to build versus what it had already built.

## Landed scope

- add `budget` to `LegacyGenerationRequest`
- publish queued request:
  - `buildKind`
  - `executionPlan`
  - `processStageIds`
  - `budget`
- extend proof in:
  - `tests/reset/legacy-generation-lifecycle.test.ts`
  - `tests/reset/legacy-reset.test.ts`

## Boundaries preserved

- no gameplay behavior change
- no staged generator rewrite
- no marker ratchet
- no deploy

## Proof plan

- `npm run test -- tests/reset/legacy-generation-lifecycle.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`

## Next honest slice

Stay inside the generation owner chain and move from diagnostics-only mapping toward executable staged-process state, not broad scene churn.
