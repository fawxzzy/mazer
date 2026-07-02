# Mazer Tile Color Revert Delay Source Bound Packet

Date: 2026-07-02

## Scope

This packet records the source-backed recovery attempt for the legacy menu/play tile material-revert timer.

The goal was to recover the numeric Blueprint default for `_TileColorRevertDelay` without guessing, because that value controls the old `AGridSquare::StartDelay()` timer that eventually restores tile material state through `SetOriginal()`.

## Source Evidence

Confirmed from the extracted Unreal source under the restored legacy workspace:

- `Source/Mazer/Public/MazerGameInstance.h` declares `_TileColorRevertDelay` as a Blueprint-editable `float`.
- `Source/Mazer/Private/Level/GridSquare.cpp` implements `StartDelay()` by clearing `ColorRevertTimer` and scheduling `SetOriginal()` with `TileColorRevertDelay`.
- `Source/Mazer/MazerGameModeBase.cpp` copies `MazerGameInstance->_TileColorRevertDelay` into each spawned tile.
- `Source/Mazer/Private/Player/MazerPlayer.cpp` calls `StartDelay()` from the menu/demo backtrack-undo path and the active-play trail-fade path.

## Asset Recovery Attempt

The only restored Blueprint asset found for this seam was:

- `Content/Game/GI_MazerGameInstance.uasset`

Binary inspection found the property names `_TileColorRevertDelay`, `_PlayerAiDelayDuration`, and `FloatProperty`, but did not expose a reliable serialized default value for `_TileColorRevertDelay`.

The asset scan produced many arbitrary little-endian float interpretations around the name-table bytes. Those values are not trustworthy Blueprint property defaults without a proper Unreal asset decode/export, so this pass does not promote any candidate number into runtime truth.

## Marker Decision

The legacy 1:1 marker remains at `93%`.

This packet bounds an evidence gap and improves restart safety, but it does not change runtime behavior and does not recover exact Unreal numeric timing.

## What Would Unblock This

One of these would be needed before claiming exact material-revert timing:

- a successful Unreal Editor or commandlet export of `GI_MazerGameInstance` defaults,
- a reliable Unreal asset parser that decodes the Blueprint-generated class defaults for this project version,
- or an independently preserved screenshot/video/spec showing the exact color-revert duration.

## Boundaries

- No runtime behavior change.
- No deploy.
- No live resource mutation.
- No Supabase or Vercel app-resource mutation.
- No key rotation.
