# Mazer Iteration Loop Performance Pass - 2026-07-10

## Problem

Small Mazer changes were taking too long because ordinary implementation passes were repeatedly paying closure-proof costs.

Observed expensive lanes from recent local runs:

- TypeScript no-emit: roughly 8-12 seconds.
- AI/progression Vitest packets: roughly 22-37 seconds.
- Production build/PWA generation: roughly 34 seconds.
- Default single AI calibration summary: roughly 26 seconds.
- Full rank calibration sweep: roughly 94-112 seconds.
- Discord live sync/readback: roughly 12-26 seconds per operation.

The issue is not one slow edit path. The issue is proof escalation happening too early and too often.

## Change

Added `scripts/verify/run-fast-verify.mjs` and package scripts:

- `npm run verify:fast`
- `npm run verify:fast:tests`
- `npm run verify:fast:all`
- `npm run ai:calibrate:fast`
- `npm run ai:calibrate:ranks:fast`

`verify:fast` selects a bounded proof slice from changed files, runs TypeScript only when implementation files changed, and skips the production build unless `-- --build` is passed.

`verify:fast:tests` is a same-cluster rerun shortcut. It uses the same selector but skips TypeScript, so it should only be used after a TypeScript-backed `verify:fast` or `npm run lint` has already passed for the current edit cluster.

## Usage Rule

Use this order for normal game iteration:

1. `npm run verify:fast -- --list`
2. `npm run verify:fast`
3. `npm run verify:fast:tests -- --only=<test-file>` for same-cluster reruns after a TypeScript-backed pass already succeeded.
4. Optional focused live/browser proof only for touched visual or interaction surfaces.
5. `npm run verify` only for closure, release, marker ratchet, or prod push.

Use this order for AI tuning:

1. `npm run ai:calibrate:fast`
2. `npm run ai:calibrate:ranks:fast`
3. `npm run ai:calibrate:ranks` only when the fast sweep points to a stable candidate.

## Guardrail

Do not use the fast commands as release proof. They are iteration accelerators. Closure still requires the canonical proof spine documented in `docs/current-truth.md`.

## Validation

- `npm run verify:fast -- --list` passed and reported the selected changed-file proof slice.
- `npm run verify:fast -- --skip-lint --only=tests/reset/legacy-marker.test.ts` passed after fixing Windows `npm.cmd` child-process invocation in the fast verifier.
- `npm run verify:fast -- --only=tests/reset/legacy-marker.test.ts` passed with TypeScript plus the targeted marker packet in roughly 21.5 seconds.
- `npm run ai:calibrate:ranks:fast` passed in roughly 5.3 seconds and confirmed the existing AI rank tuning is still not monotonic, which is a gameplay-tuning issue rather than an iteration-infrastructure issue.
- Current AI/progression pass timing confirmed the cost model: `npm run ai:calibrate:ranks:fast` completed in roughly 5.9 seconds, `npm run verify:fast -- --only=tests/ai/demo-walker.test.ts,tests/reset/legacy-marker.test.ts` completed in roughly 30.1 seconds including TypeScript, and full `npm run ai:calibrate:ranks` completed in roughly 92.1 seconds. That means most normal AI tuning iterations should stay on the fast rank sweep and same-cluster no-lint targeted tests until a candidate is stable enough to justify the full sweep.
