# Mazer Legacy Overlay Field Commit Contract Packet

Date: 2026-06-30
Lane: Mazer pass 2 parity
Module: overlay family and field responsibilities

## Why this packet exists

The restored Unreal `PauseMenuWidget` does not treat every field commit the same way:

- `Scale` marks a deferred reload-on-back path
- path and wall channels mark a deferred material-change reload-on-back path
- `CamScale` always flips the camera-flag path on commit, even if the value is rejected and restored

The web runtime already handled most of this behavior, but the meaning of those field commits still lived as generic scene-local wiring instead of one explicit legacy-owned contract.

## Landed scope

- add `src/legacy-runtime/legacyOverlayFieldCommit.ts`
- encode explicit field-commit classes for:
  - `scale-change`
  - `material-change`
  - `camera-flag`
- route `MenuScene.commitOverlayField(...)` through the explicit field-commit contract
- preserve:
  - deferred reload-on-back for scale/material commits
  - immediate camera-layout path for valid `camScale`
  - explicit camera-flag semantics for `camScale` commit intent even when the value is invalid
- add proof in:
  - `tests/reset/legacy-overlay-field-commit.test.ts`
  - `tests/reset/legacy-reset.test.ts`
- resync current truth, parity matrix, completion marker, and system map docs

## Boundaries preserved

- no generation rewrite
- no overlay layout rewrite
- no pause command rewrite
- no HUD rewrite
- no deploy

## Proof plan

- `npm run test -- tests/reset/legacy-overlay-field-commit.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`

## Ratchet result

This packet earns the next bounded overlay-family ratchet.

- `79% -> 80%`

Reason:

- one named completion-marker segment changed with proof
- menu-time and pause-time field responsibilities are now repo-owned legacy contracts instead of remaining implicit generic scene wiring
- the repo now distinguishes deferred reload-on-back fields from the immediate camera-flag path more honestly
- the packet stayed inside the overlay-field owner chain without overstating the remaining nested-overlay verification work

## Next honest slice

The next bounded overlay lane should be:

- final nested-overlay verification from menu/pause parents

If that stops being the cleanest seam, switch back to staged generation implementation.
