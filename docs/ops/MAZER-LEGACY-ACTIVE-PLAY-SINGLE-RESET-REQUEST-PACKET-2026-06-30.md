# Mazer Legacy Active-Play Single Reset Request Packet

Date: 2026-06-30

## Scope

This packet tightens the active-play goal reset-return path against restored Unreal process-8 behavior.

Owner chain:

- `legacy/old-project.zip`
- `tmp/legacy-source/Source/Mazer/Private/Player/MazerPlayer.cpp`
- `tmp/legacy-source/Source/Mazer/Private/MazerGameState.cpp`
- `tmp/legacy-source/Source/Mazer/MazerGameModeBase.cpp`
- `src/legacy-runtime/legacyPlayLifecycle.ts`
- `src/scenes/MenuScene.ts`
- `tests/reset/legacy-play-lifecycle.test.ts`
- `tests/reset/legacy-reset.test.ts`
- `docs/current-truth.md`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`
- `docs/system-map.md`

## Legacy Evidence

The restored Unreal active-play goal path is a single reset branch:

- `AMazerPlayer::HandleStartOverlap()` sets `_ResetGame = true` on the end tile
- `AMazerGameState::Tick()` consumes `_ResetGame`, clears it, sets `_ProcessCount = 8`, and calls `Logic()`
- `AMazerGameModeBase::Logic()` process `8` runs `Initialize()`
- if `_Playing == true`, process `8` flips `_Playing = false` and travels back to `Game/Level/Template`

## Runtime Change

The web scene no longer carries a second `playResetReturnAtMs` timer.

`LegacyResetRequest` is now the sole active-play reset-return authority:

- goal movement schedules one process-8 reset request
- input and movement gates check only the pending reset request
- scene update consumes the request once when due
- `return-menu` reset requests call `enterMenuMode()`
- tests now reject reintroducing `playResetReturnAtMs`, `hasPendingLegacyPlayResetReturn()`, `shouldConsumeLegacyPlayResetReturn()`, or `scheduleLegacyPlayResetReturnAtMs()`

## Proof

Focused proof:

```bash
npm run test -- tests/reset/legacy-play-lifecycle.test.ts tests/reset/legacy-reset.test.ts tests/reset/legacy-play-step.test.ts
npm run lint
```

Result:

- reset/play focused tests passed: `17 files / 85 tests`
- TypeScript lint passed

## Marker

The Mazer legacy 1:1 completion marker moves from `94%` to `95%`.

Reason:

- simultaneous-key buffering is restored
- axis-gated active-play collision is restored
- active-play goal reset now has a single process-8 request authority instead of a duplicate scene-local shadow timer

## Next Packet

Next bounded Mazer packet:

`legacy menu-demo backtrack and reset exactness packet`

Do not widen into:

- new product features
- production deploy
- Supabase/Vercel/app-resource mutation
- duplicate app identity
- unrelated visual polish
