# Mazer Legacy Generated Play Topology Quality Packet

Date: 2026-07-01

## Scope

Owner-repo only: `repos/mazer`.

Touched owner chain:

- `src/legacy-runtime/legacyMaze.ts`
- `src/scenes/MenuScene.ts`
- `tests/reset/legacy-reset.test.ts`
- `tests/scenes/menu-render-frame.test.ts`
- `docs/current-truth.md`
- `docs/system-map.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`

## Problem

The generated play maze could look worse even while passing the existing proof spine because the active reset-lane play generator only proved start-to-goal solvability and shortcut statistics.

The missing guard was whole-floor topology quality:

- generated play mazes could leave disconnected playable-looking floor components
- some seeds could keep a trivially weak source-selected goal even though the carved maze had a much stronger reachable route
- those detached floors and short routes made the play maze look noisy, regressed, or lower quality in the live browser

The fixed menu snapshot was not the same topology owner and did not show this component defect.

The first browser proof after the topology fix also showed a separate presentation issue: active play still rendered walkable cells through the old square debug-cell fill path, making the generated maze read as a fine white grid even after the topology was cleaned.

## Evidence Before Fix

Current branch before this packet, seed `3749`:

- solution length: `65`
- floor components: `40`
- detached floor tiles: `251`

Current branch before this packet, seed `777`:

- solution length: `5`
- floor components: `51`
- detached floor tiles: `212`

## Change

`createLegacyMaze()` now runs generated-play topology normalization after shortcut bridge creation:

- flood-fill from the generated start tile
- prune every disconnected floor component outside the start-reachable component
- measure the original goal distance
- rebase only trivially weak or unreachable goals to the farthest reachable floor
- publish `playableTopologyStats` for diagnostics and tests

This keeps shortcut creation additive while preventing unreachable floor noise and degenerate play routes.

`MenuScene.drawStaticBoard()` now also renders active-play walkable paths with connected corridor segments:

- preserve generated maze topology
- preserve player movement and shortcut behavior
- replace square debug-cell path fills with a darker edge/core corridor hierarchy
- keep the fixed menu snapshot on its existing menu material path

## Evidence After Fix

Seed `3749`:

- solution length: `110`
- floor components: `1`
- detached floor tiles: `0`
- `playableTopologyStats.disconnectedFloorTilesPruned`: `251`
- `playableTopologyStats.goalRebasedToFarthestReachableFloor`: `true`

Seed `777`:

- solution length: `163`
- floor components: `1`
- detached floor tiles: `0`
- `playableTopologyStats.disconnectedFloorTilesPruned`: `212`
- `playableTopologyStats.goalRebasedToFarthestReachableFloor`: `true`

Default seed `0x5a17f00d`:

- solution length: `109`
- floor components: `1`
- detached floor tiles: `0`
- `playableTopologyStats.goalRebasedToFarthestReachableFloor`: `false`

## Marker Reevaluation

Touched segment:

- `Generation lifecycle exactness`

Marker result:

- held at `86%`
- segment remains `15 / 16`

Reason:

This packet fixes a real generated-play quality regression and adds proof against detached floor components and weak goals, but it does not recover exact Unreal RNG/time seeding or line-for-line process-yield timing. It is a browser-port quality guard inside the already-awarded generation segment, not the final generation exactness closure.

The active-play connected-corridor render tightening also does not earn a point. It reduces a visible play-board regression, but it does not close final active-play feel/HUD exactness or screenshot-grade play-board styling.

## Validation

Focused validation:

```bash
npm exec vitest -- run tests/reset/legacy-reset.test.ts --reporter=dot
npm exec vitest -- run tests/scenes/menu-render-frame.test.ts tests/reset/legacy-reset.test.ts --reporter=dot
```

Broader validation should be run before merge closeout:

```bash
npm exec vitest -- run tests/reset/legacy-reset.test.ts tests/reset/legacy-generation-lifecycle.test.ts tests/maze/maze-domain.test.ts --reporter=dot
npm run lint
npm run verify
```
