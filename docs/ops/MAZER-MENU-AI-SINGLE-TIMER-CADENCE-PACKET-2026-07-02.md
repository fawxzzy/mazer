# Mazer Menu AI Single Timer Cadence Packet

Date: 2026-07-02
Mode: owner-repo runtime behavior correction
Branch: `codex/mazer-pass2-menu-parity`

## Scope

This packet corrects the menu-demo AI timing shape against the freshly re-extracted legacy C++ source.

Source evidence:

- `Source/Mazer/Private/Player/MazerPlayer.cpp`
- `Source/Mazer/Public/MazerGameInstance.h`
- `Source/Mazer/Private/Level/GridSquare.cpp`

## Legacy Evidence

`AMazerPlayer::Tick()` starts AI by scheduling:

```cpp
GetWorldTimerManager().SetTimer(AiTimer, this, &AMazerPlayer::AiPlayerLogic, MazerGameInstance->_PlayerAiDelayDuration, false);
```

`AMazerPlayer::AiPlayerLogic()` reschedules the same timer after every AI tick.

The C++ does not define separate timers for branch commit, dead end, backtrack, or reacquire. Those are behavior/cue states in the rebuild, not separate legacy timer classes.

## Runtime Change

`src/domain/ai/demoWalker.ts` now resolves all non-goal AI movement/cue segment delays through one `config.cadence.exploreStepMs` timer.

The named cadence fields remain in the config shape as compatibility/presentation aliases, but default/snapshot values now collapse to the same AI step value.

## Marker Decision

The repo-wide legacy 1:1 marker remains `93%`.

This improves the `Demo route, backtracking, and pacing` segment, but does not earn the final segment point because:

- exact numeric Blueprint `_PlayerAiDelayDuration` is still not recovered
- exact tile material color-revert timing is still not ported
- full visited-flag side effects are still not complete

## Validation

Passed:

```bash
npm exec vitest -- run tests\ai\demo-walker.test.ts tests\reset\legacy-reset.test.ts --reporter=dot
```

Full verification must be rerun before final closeout if more edits land after this packet.

## Boundaries

- No deploy.
- No live resource mutation.
- No Supabase or Vercel app-resource mutation.
- No duplicate Mazer identity.
- No key rotation.
