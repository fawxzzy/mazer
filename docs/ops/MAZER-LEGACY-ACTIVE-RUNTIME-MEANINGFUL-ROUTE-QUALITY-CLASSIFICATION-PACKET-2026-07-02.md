# Mazer Legacy Active Runtime Meaningful Route-Quality Classification Packet

Date: 2026-07-02
Status: landed
Lane: Mazer legacy 1:1 parity

## Scope

Bounded owner-repo slice for active reset-lane generated play maze route-quality proof.

Touched surfaces:

- `src/legacy-runtime/legacyMaze.ts`
- `tests/reset/legacy-reset.test.ts`
- `docs/current-truth.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`

## Change

`createLegacyMaze()` route-quality stats now distinguish:

- any bypassable solution edge
- meaningful bypassable solution edges
- bypassable route bands
- meaningful bypassable route bands
- minimum meaningful detour threshold

The `multi-route` classification now requires meaningful detour-bearing bypass coverage across more than one route band. A single shallow local loop can still be observed as bypassable, but it no longer proves the generated play maze has useful alternate start-goal route capacity.

## Why

The previous `routeQuality` classification was too permissive for the user-facing shortcut goal. It proved that at least one solution edge could be bypassed, but that could overclaim route quality if a shortcut only created a shallow local cycle.

This packet keeps the existing generation topology unchanged and hardens the proof/classification layer around it.

## Marker Decision

The Mazer legacy 1:1 marker remains held at `93%`.

Reason:

- this closes a proof/classification weakness for shortcut route quality
- it does not change runtime maze generation topology
- it does not recover exact Unreal RNG/time seeding
- it does not recover line-for-line process-yield timing

## Validation

Passed:

```bash
npm run test -- tests/reset/legacy-reset.test.ts
```

Observed result:

```md
20 test files passed
122 tests passed
```

## Next Honest Slice

Continue with one bounded Mazer owner-repo slice:

- active-play feel / generated play-board material review, or
- demo/backtracking exactness if proof exposes a route behavior mismatch, or
- final screenshot-grade menu material/composition tightening.

Do not ratchet the marker beyond `93%` without a weighted-table segment closing with proof.
