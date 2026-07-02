# Mazer Menu AI Route Diagnostics Packet

Date: 2026-07-02
Mode: owner-repo Mazer legacy 1:1 pass
Marker decision: held at `92%`

## Scope

Module:

- menu-demo AI route shape and runtime readback

Owner chain:

- `src/domain/ai/demoWalker.ts`
- `src/scenes/MenuScene.ts`
- `src/scenes/menuRuntimeDiagnostics.ts`
- `tests/ai/demo-walker.test.ts`
- `tests/scenes/menu-runtime-diagnostics.test.ts`

## Problem

The menu AI lane already exposed wrong-branch, backtrack, and recovery telemetry, but it did not expose enough route-shape data to tune cadence or branch behavior safely from the maintained browser.

That made the next AI tuning pass too dependent on visual guessing.

## Change

`demoWalker.ts` now exposes `collectDemoWalkerRouteDiagnostics()`.

It reports:

- route length
- segment count
- canonical path length
- traverse duration
- AI reset path cursor
- cue counts
- trail-mode counts
- existing runner telemetry

`MenuScene` now publishes that route summary under `menuDemo.route` in runtime diagnostics. The DOM `data-mazer-runtime-diagnostics` surface carries the same shape for the maintained in-chat browser.

## Proof

Focused proof:

```bash
npm exec vitest -- run tests/ai/demo-walker.test.ts tests/scenes/menu-runtime-diagnostics.test.ts tests/reset/legacy-reset.test.ts --reporter=dot
npm run lint
```

Results:

- focused AI/runtime/reset proof passed: `3` files, `42` tests
- TypeScript lint passed

## Marker Decision

The marker remains `92%`.

Reason:

- this improves observability and future tuning safety
- it does not change route selection, generation timing, visible material, or recovered source behavior
- the open AI points still require stronger evidence for exact blueprint cadence, visited-color/material side effects, or another runtime behavior seam

## Boundaries

No deploy.
No live resource mutation.
No Supabase or Vercel mutation.
No duplicate Mazer identity.
No production claim.
