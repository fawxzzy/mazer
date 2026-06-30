# Mazer Legacy Active-Play Simultaneous-Key Buffer Packet

Date: 2026-06-30
Repo: `fawxzzy/mazer`
Branch: `codex/mazer-pass2-menu-parity`
Mode: owner-repo only

## Packet

Segment:

- `Active play movement and win/reset loop`

Owner chain:

- `legacy/old-project.zip`
- `Source/Mazer/Private/Player/MazerPlayer.cpp`
- `src/legacy-runtime/legacyPlayStep.ts`
- `src/scenes/MenuScene.ts`
- `tests/reset/legacy-play-step.test.ts`
- `tests/reset/legacy-reset.test.ts`

## Legacy Truth

The restored Unreal player source does not move immediately on the first key press.

It sets held direction flags, clears/restarts `SimultaneousKeyPressTimer`, and resolves `MovePlayer()` after `SimultaneousKeyPressDelay = 0.05f`. Repeated movement actions call `MovePlayer()` directly against the currently held direction flags.

## Change

Active play now carries the same input-resolution shape:

- first movement keydown sets the held direction flag and schedules a 50ms resolve
- key repeat resolves the current held vector immediately
- opposing directions cancel before movement
- simultaneous axes can resolve as one composite step
- keyup clears the held direction flag
- pause, menu return, play start, and goal-reset scheduling clear stale movement state

The movement step itself still routes through `advanceLegacyPlayStep()` and the existing walkability/goal/trail contract.

## Boundary

This packet does not claim final active-play movement parity.

Remaining active-play gaps are collision edge cases and reset-return exactness. This packet only ports the input buffering and held-vector resolution seam from the restored player source.

## Marker

Marker ratchets:

- from `92%`
- to `93%`

Reason:

- this changes runtime-visible active-play behavior
- the change is backed by restored Unreal source truth
- the active-play owner chain and reset-lane tests now protect the input-buffer contract

## Validation

Focused validation:

```bash
npm run test -- tests/reset/legacy-play-step.test.ts tests/reset/legacy-play-lifecycle.test.ts tests/reset/legacy-reset.test.ts
npm run lint
npm run verify
```

Result:

- passed
- reset lane and demo walker suite passed as part of the configured test target
- TypeScript no-emit lint passed
- repo verify passed, including the serialized reset/demo test lane and production build

## Next Honest Slice

Move to `legacy active-play collision and reset-return edge-case packet` or `legacy demo route backtracking and reset exactness`.

Do not keep ratcheting active-play movement unless a new behavior-backed edge is closed.
