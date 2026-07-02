# Mazer Legacy Stage Transition Graph Contract Packet

Date: 2026-06-30
Status: landed
Lane: legacy Unreal truth -> web app reset/port
Segment: Generation lifecycle exactness

## Why this packet exists

The repo already carried:

- stage ids
- menu-vs-play execution cadence
- scheduler entry gates
- reset branch entry truth

But the actual old process graph was still too implicit.

The restored Unreal `Logic()` switch in `Source/Mazer/MazerGameModeBase.cpp` makes the progression order explicit:

- `0 -> 3`
- `3 -> 4`
- `4 -> 5`
- `5 -> 6`
- `6 -> 7`
- `7 -> initialized`
- `8 -> menu rearm` or `8 -> template return`

There is also a concrete branch in stage `5`:

- if `_Scale <= 35`, shortcut creation is skipped and `_ProcessCount = 6`

That is legacy-owned runtime truth, so the web contract should name it directly.

## Landed contract

`src/legacy-runtime/legacyGenerationLifecycle.ts` now publishes stage-transition metadata inside each generation stage contract:

- `completionSignal`
- `advancesToStageId`
- `skipToStageIdWhenDisabled`

The contract now makes these exact stage outcomes explicit:

- stage `0`
  - completes on `grid-spawn-complete`
  - advances to `3`
- stage `3`
  - completes on `checkpoint-budget-exhausted`
  - advances to `4`
- stage `4`
  - completes on `path-array-exhausted`
  - advances to `5`
- stage `5`
  - completes on `shortcut-budget-exhausted`
  - advances to `6`
  - skips directly to `6` when shortcuts are disabled by scale
- stage `6`
  - completes on `draw-iteration-complete`
  - advances to `7`
- stage `7`
  - completes on `player-finalized`
  - does not advance to another staged generation step because initialization is complete
- stage `8`
  - menu branch completes on `menu-reset-delay-rearmed`
  - play branch completes on `play-reset-template-return`

`src/scenes/MenuScene.ts` now carries that same stage-transition graph through runtime diagnostics for:

- live maze generation metadata
- pending generation request metadata

## Proof surface

- `tests/reset/legacy-generation-lifecycle.test.ts`
- `tests/reset/legacy-generation-diagnostics.test.ts`
- `tests/reset/legacy-reset.test.ts`
- `npm run verify`

## Marker decision

No marker move.

Reason:

- this packet improves owner clarity and restart safety
- it makes the old process graph explicit in repo-owned proof
- but it does not by itself port an additional staged runtime behavior

The repo-wide marker remains:

- `83%`

## Exact remaining gap after this packet

The process graph is clearer, but the runtime still does not execute the full staged Unreal generator exactly.

Still open:

- recovery of the exact `_LevelBuildingLogicDelayDuration` value if it becomes available
- any still-missing stage-local state or side effects inside the old staged generator
- additional behavior-port work beyond explicit transition mapping
