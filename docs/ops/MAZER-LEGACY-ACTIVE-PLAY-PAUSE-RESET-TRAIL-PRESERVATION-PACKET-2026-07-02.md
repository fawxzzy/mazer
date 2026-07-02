# Mazer Legacy Active-Play Pause Reset Trail Preservation Packet

Date: 2026-07-02
Mode: owner-repo runtime behavior fix
Branch: `codex/mazer-pass2-menu-parity`

## Scope

This packet tightens one active-play pause reset edge case against restored Unreal source behavior.

Touched owner chain:

- `tmp/mazer-legacy-unreal-restore/Source/Mazer/Private/UI/GamePauseMenu.cpp`
- `tmp/mazer-legacy-unreal-restore/Source/Mazer/Private/Player/MazerPlayer.cpp`
- `src/legacy-runtime/legacyPauseLifecycle.ts`
- `src/scenes/MenuScene.ts`
- `tests/reset/legacy-pause-lifecycle.test.ts`
- `tests/reset/legacy-reset.test.ts`

## Legacy Evidence

The restored pause reset path sets the reset-position flag and returns through the normal pause-back path:

```cpp
MazerGameInstance->_ResetPlayerPosition = true;
Back_Clicked();
```

`AMazerPlayer::CheckPause()` then moves the player actor back to the start tile and clears `_ResetPlayerPosition`. It does not clear the already colored/visited path material state.

## Runtime Change

`resolveLegacyPauseCommand('reset-player', ...)` now accepts the current active-play trail and preserves it when moving the player back to the start tile. The reset appends the start tile unless the trail already ends there.

`MenuScene.applyLegacyPauseCommand()` now passes `this.trail` into the pause lifecycle helper instead of letting the helper collapse reset history to `[start]`.

## Proof Contract

Focused tests now prove:

- pause reset still returns the player to the start tile
- pause reset preserves prior trail history
- pause reset appends the start tile only when needed
- scene wiring passes the current trail into the pause lifecycle helper

## Marker Decision

The repo-wide legacy 1:1 marker remains held at `93%`.

Reason:

This packet closes a real active-play pause reset behavior gap, but the active-play segment still has final feel and play-board material parity open. It is not enough by itself to claim the final active-play point.

## Validation

Passed:

```bash
npm exec vitest -- run tests\reset\legacy-pause-lifecycle.test.ts tests\reset\legacy-reset.test.ts tests\reset\legacy-play-step.test.ts --reporter=dot
git diff --check
```

## Boundaries

- No deploy.
- No live resource mutation.
- No Supabase or Vercel app-resource mutation.
- No duplicate Mazer identity.
- No key rotation.
