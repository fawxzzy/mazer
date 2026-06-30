# Mazer Legacy Active-Play Axis-Gated Collision Packet

Date: 2026-06-30

## Scope

This packet tightens one active-play movement/collision parity gap against the restored Unreal player source.

Owner chain:

- `legacy/old-project.zip`
- `tmp/legacy-source/Source/Mazer/Private/Player/MazerPlayer.cpp`
- `src/legacy-runtime/legacyPlayStep.ts`
- `tests/reset/legacy-play-step.test.ts`
- `docs/current-truth.md`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`
- `docs/system-map.md`

## Legacy Evidence

The restored Unreal `AMazerPlayer::MovePlayer()` path gates each axis independently through `CheckMoveR`, `CheckMoveL`, `CheckMoveU`, and `CheckMoveD` before applying the movement vector.

That means simultaneous movement cannot be modeled only as "check the final combined target":

- if one held axis is blocked and the other axis is open, the player can still move along the open axis
- if both adjacent side gates are open but the final diagonal target is a wall, the move is a diagonal corner collision and must not cut through the wall

## Runtime Change

`legacyPlayStep.ts` now owns `resolveLegacyPlayCollisionDelta()`.

The resolver:

- normalizes movement to one tile-step per axis
- checks horizontal and vertical side gates independently
- allows blocked-axis slide onto the open axis
- blocks a true diagonal corner target when the final diagonal tile is not walkable
- keeps trail append, trail trimming, and goal detection downstream of the resolved collision delta

## Proof

Focused proof:

```bash
npm run test -- tests/reset/legacy-play-step.test.ts tests/reset/legacy-play-lifecycle.test.ts tests/reset/legacy-reset.test.ts
npm run lint
```

Result:

- reset/play focused tests passed: `17 files / 87 tests`
- TypeScript lint passed

## Marker

The Mazer legacy 1:1 completion marker moves from `93%` to `94%`.

Reason:

- active-play simultaneous-key buffering was already restored
- active-play collision now matches the legacy axis-gated movement shape more closely
- active-play reset-return timing remains open, so the active-play segment is still partial rather than complete

## Next Packet

Next bounded Mazer packet:

`legacy active-play reset-return edge-case packet`

Do not widen into:

- new product features
- production deploy
- Supabase/Vercel/app-resource mutation
- duplicate app identity
- unrelated visual polish
