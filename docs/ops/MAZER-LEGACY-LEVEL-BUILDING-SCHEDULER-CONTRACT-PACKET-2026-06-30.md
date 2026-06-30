# Mazer Legacy Level-Building Scheduler Contract Packet

Date: 2026-06-30
Status: landed
Lane: legacy Unreal truth -> web app reset/port
Segment: Generation lifecycle exactness

## Why this packet exists

The repo already carried explicit process `0` and process `8` entry metadata, but the exact scheduler seam between them was still too blurry.

The restored Unreal source shows that:

- process `0` does not enter just because a request exists
- `AMazerGameState::Tick` waits for:
  - `_Initialized == false`
  - `_LevelBuildingLogicDelayStarted == true`
  - `ElapsedTime >= _LevelBuildingLogicDelayDuration`
- initialized reset does not wait on that delay gate
- instead, `_ResetGame == true` forces `_ProcessCount = 8` and calls `Logic()` immediately

That distinction is legacy-owned truth, so the runtime contract needed to say it directly.

## Legacy source evidence

Primary source files from the restored Unreal project:

- `../../tmp/mazer-legacy-unreal-restore/Source/Mazer/Private/MazerGameState.cpp`
- `../../tmp/mazer-legacy-unreal-restore/Source/Mazer/MazerGameModeBase.cpp`
- `../../tmp/mazer-legacy-unreal-restore/Source/Mazer/Public/MazerGameInstance.h`

Recovered scheduler truth:

- `MazerGameState.cpp`
  - tick compares world elapsed time against `_LevelBuildingLogicStartTime`
  - tick requires `_LevelBuildingLogicDelayStarted == true` before process `0` can advance
  - initialized reset sets `_ProcessCount = 8` and calls `Logic()` immediately
- `MazerGameModeBase.cpp`
  - begin-play initialization arms `_LevelBuildingLogicDelayStarted = true`
  - menu-side process `8` reset rearms delay start for the next generation cycle
- `MazerGameInstance.h`
  - `_LevelBuildingLogicDelayDuration` exists as a runtime variable

Important honesty rule:

- the numeric legacy `_LevelBuildingLogicDelayDuration` value is still not recovered from the restored source set
- this packet does not invent a fake exact millisecond value

## Landed contract

`src/legacy-runtime/legacyGenerationLifecycle.ts` now makes the level-building scheduler explicit:

- process `0` requires:
  - `requiresLevelBuildingStartTime = true`
  - `requiresLevelBuildingDelayStartedFlag = true`
  - `waitsForLevelBuildingDelay = true`
- the legacy duration seam is carried honestly as:
  - `levelBuildingDelayDurationMs = null`
  - `levelBuildingDelayDurationSource = 'legacy-variable-unrecovered'`
- initialized reset bypass is explicit:
  - `initializedResetBypassesDelayGate = true`

`src/legacy-runtime/legacyPlayLifecycle.ts` now makes process `8` reset bypass truth explicit:

- `bypassesLevelBuildingDelay = true`

`src/scenes/MenuScene.ts` now publishes the same scheduler semantics into runtime diagnostics for:

- live maze generation metadata
- pending generation request metadata
- pending reset request metadata

Pending generation diagnostics also now carry:

- `queuedAtMs`

That gives the repo one explicit surface for "when the current web runtime armed the legacy-shaped delay gate" without pretending the exact Unreal duration has been recovered.

## What did not change

- no staged generator rewrite landed here
- no numeric legacy delay duration was claimed
- no deploy or infra mutation happened
- shipping/reset behavior was not broadened beyond this bounded scheduler contract

## Proof surface

- `tests/reset/legacy-generation-lifecycle.test.ts`
- `tests/reset/legacy-generation-diagnostics.test.ts`
- `tests/reset/legacy-play-lifecycle.test.ts`
- `tests/reset/legacy-reset.test.ts`
- `npm run verify`

## Marker decision

This packet is a valid parity ratchet because it closes a bounded legacy-owned ambiguity inside the generation lifecycle segment:

- process `0` delay entry is now explicit beyond the generic "waits for delay" flag
- process `8` reset bypass is now explicit beyond the generic reset-entry contract
- the unrecovered duration remains honest instead of silently implied

Repo marker moved:

- `82% -> 83%`

## Exact remaining gap after this packet

The runtime still does not execute the full staged Unreal process graph.

Open generation work is still:

- staged execution beyond the explicit contract surfaces
- any still-missing process ownership inside the old `0/3/4/5/6/7/8` pipeline
- recovery of the actual legacy `_LevelBuildingLogicDelayDuration` value if it exists outside the restored source currently in hand
