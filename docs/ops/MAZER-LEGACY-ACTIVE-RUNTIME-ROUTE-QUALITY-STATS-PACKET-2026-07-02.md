# Mazer Legacy Active Runtime Route Quality Stats Packet

Date: 2026-07-02
Mode: owner-repo generation proof guard
Branch: `codex/mazer-pass2-menu-parity`

## Scope

This packet tightens the active reset-lane generated play-maze proof surface around shortcuts and route quality.

Touched owner chain:

- `src/legacy-runtime/legacyMaze.ts`
- `tests/reset/legacy-reset.test.ts`
- `docs/current-truth.md`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`

## Problem

The restored shortcut stage already uses the legacy opposite-corridor wall-bridge rule and duplicate-preserving wall-array removal shape. The remaining proof gap was route quality: tests could prove that walls were opened, but they did not directly prove that generated play snapshots retained meaningful alternate start-goal route capacity after shortcut creation.

That made it possible for a future shortcut change to keep passing wall-count assertions while regressing into tiny, redundant, or non-route-affecting openings.

## Change

`createLegacyMaze()` now publishes `routeQualityStats` for generated play snapshots:

- `sampledSolutionEdges`
- `bypassableSolutionEdges`
- `bypassableRouteBands`
- `routeQuality`

The metric checks the solved start-goal route edge-by-edge and asks whether the maze still has an alternate start-goal path when each canonical solution edge is blocked. That gives the shortcut lane a direct proof that route alternatives exist, without changing the current generation behavior.

## Proof Contract

`tests/reset/legacy-reset.test.ts` now asserts:

- generated play mazes publish route-quality samples matching the solved route edge count
- shortcut-enabled generated play mazes report `multi-route`
- shortcut-enabled generated play mazes have at least one bypassable solution edge
- shortcut-enabled generated play mazes have at least one bypassable route band

## Marker Decision

The repo-wide legacy 1:1 marker remains held at `93%`.

Reason:

This packet improves the route-quality proof spine for the already-restored active runtime shortcut lane. It does not change runtime generation behavior, recover exact Unreal RNG/time seeding, or close line-for-line process-yield timing. It is a guard against future shortcut regression, not a new parity closure point.

## Validation

Passed:

```bash
npm exec vitest -- run tests\reset\legacy-reset.test.ts --reporter=dot
```

## Boundaries

- No deploy.
- No live resource mutation.
- No Supabase or Vercel app-resource mutation.
- No duplicate Mazer identity.
- No key rotation.
