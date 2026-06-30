# Mazer Legacy Overlay Toggle Contract Packet

Date: 2026-06-30
Lane: Mazer pass 2 parity
Module: overlay family and field responsibilities

## Why this packet exists

The restored Unreal overlay widgets do not all own the same toggle responsibilities:

- `FeaturesWidget` owns inverted companion `On/Off` copy for camera-follow and trail-fade toggles
- `GameModesWidget` owns the dark-mode checkbox and light-intensity side effect
- `GameModesWidget` does not expose the same companion state-text surface

The web runtime still had these toggle behaviors embedded as inline scene lambdas, and it was still showing a made-up `On/Off` state label for game modes.

## Landed scope

- add `src/legacy-runtime/legacyOverlayToggleFields.ts`
- encode explicit toggle ownership for:
  - `toggleCameraFollow`
  - `toggleTrailFade`
  - `darkMode`
- keep inverted `On/Off` copy only for the legacy features toggles
- remove the made-up companion state label from game-modes dark-mode presentation
- route overlay toggle mutations in `src/scenes/MenuScene.ts` through `applyLegacyOverlayToggleField(...)`
- add proof in:
  - `tests/reset/legacy-overlay-toggle-fields.test.ts`
  - `tests/reset/legacy-reset.test.ts`
- resync current truth, parity matrix, completion marker, and system map docs

## Boundaries preserved

- no options field rewrite
- no pause command rewrite
- no generation rewrite
- no HUD rewrite
- no deploy

## Proof plan

- `npm run test -- tests/reset/legacy-overlay-toggle-fields.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`

## Ratchet result

This packet earns the next bounded overlay-family ratchet.

- `78% -> 79%`

Reason:

- one named completion-marker segment changed with proof
- features and game-modes toggle responsibilities are now repo-owned legacy contracts instead of remaining implicit scene wiring
- the web runtime no longer invents a game-modes state-text surface that the restored Unreal widget did not own
- the packet stayed inside the overlay-field owner chain without overstating the remaining pause-field or nested-overlay work

## Next honest slice

The next bounded overlay lane should be one of:

- pause field-responsibility cleanup beyond command routing
- final nested-overlay verification from pause/menu parents
- switch back to staged generation implementation if that becomes the cleaner bounded seam
