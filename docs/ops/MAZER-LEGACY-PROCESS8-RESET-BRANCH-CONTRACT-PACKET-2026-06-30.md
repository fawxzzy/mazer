# Mazer Legacy Process-8 Reset Branch Contract Packet

Date: 2026-06-30
Lane: Mazer pass 2 parity
Module: generation / reset contract

## Why this packet exists

After queued generation requests and explicit stage-7 finalize state landed, legacy process `8` was still only half-portable:

- active play still carried its return branch as a scene-local timestamp
- menu demo goal regeneration still bypassed a named reset-branch contract
- the repo knew reset timing, but not the full branch split that legacy truth assigns to `_ResetGame`

## Landed scope

- extend `src/legacy-runtime/legacyPlayLifecycle.ts` with:
  - `LegacyResetRequest`
  - reset action resolution
  - pending/consume helpers
- route `src/scenes/MenuScene.ts` through explicit pending reset requests for:
  - active-play goal -> held return to menu
  - menu-demo goal -> held regenerate-in-place branch
- publish pending reset metadata in visual diagnostics
- add proof in:
  - `tests/reset/legacy-play-lifecycle.test.ts`
  - `tests/reset/legacy-reset.test.ts`
- resync `docs/current-truth.md`, the parity matrix, and `docs/system-map.md`

## Boundaries preserved

- no movement-rule rewrite
- no topology generator rewrite
- no overlay rewrite
- no HUD rewrite
- no deploy

## Proof plan

- `npm run test -- tests/reset/legacy-play-lifecycle.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`

## Ratchet result

This packet earns the next bounded generation/reset ratchet.

- `74% -> 75%`

Reason:

- one named completion-marker segment changed with proof
- process `8` reset branches are now explicit runtime requests instead of split across unrelated scene-local flow
- play-vs-menu reset behavior is carried as a named contract before scene update consumes it
- the packet stayed inside the generation/reset owner chain without overstating the remaining staged-process gap

## Next honest slice

The next bounded generation/reset lane should be one of:

- deeper staged `0/3/4/5/6` lifecycle extraction
- exact process `8` generator reinitialize semantics beyond the branch split
- overlay field-by-field responsibility cleanup if generation exactness is paused
