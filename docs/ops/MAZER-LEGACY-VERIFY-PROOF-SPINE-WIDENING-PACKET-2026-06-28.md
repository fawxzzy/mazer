# Mazer Legacy Verify Proof-Spine Widening Packet

Date: 2026-06-28
Lane: legacy Unreal truth -> web app reset/port
Status: landed locally and verified

## Purpose

Make the repo's default verification contract actually cover the demo-walker reset-flow truth that the lane now depends on.

Before this packet:

- `npm run verify` only ran `tests/reset/*` plus the production build
- the newly restored demo reset-flow branch could regress without failing the default repo proof spine

## What changed

- Updated `package.json`:
  - `npm run test` now includes `tests/ai/demo-walker.test.ts`
  - `npm run test:verify` now includes `tests/ai/demo-walker.test.ts`
- Updated `docs/COMMANDS.md` to describe the widened proof lane accurately
- Updated `docs/current-truth.md` so `verify` truth now includes demo-walker reset-flow proof tests

## Verification

Command run:

- `npm run verify`

Result:

- reset-lane tests passed
- demo walker reset-flow tests passed
- production build passed

## Effect

The default repo-local proof spine now guards:

- reset-lane shell truth
- demo walker reset/regeneration truth
- production build truth
