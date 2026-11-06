# Mazer Maze Feature Registry — 2026-11-05

Board card: `mazer-maze-feature-progression-parity`. Base: `origin/main` `1670c8af`.

## Outcome

- New data-only registry `src/legacy-runtime/legacyMazeFeatureRegistry.ts` (version `legacy-maze-features.v1`) inventories the maze features the legacy generator can produce, with the generator stage, the controlling generation-profile fields, the applicable modes, and declarative activation rules.
- Pure resolver `resolveLegacyMazeActiveFeatureIds(profile, { mode?, registry? })` returns the active feature ids in registry order.
- The **local** telemetry receipt (`mazer.cycle-telemetry.v1`, storage version unchanged) now carries `featureRegistryVersion` and `activeFeatureIds`. Receipts stored before this change normalize to `featureRegistryVersion: 'pre-registry'`, `activeFeatureIds: null`.
- The remote receipt payload (`createRemoteCycleReceiptPayload` in `legacyRemoteProgression.ts`) is **not** changed. Whether the completion RPC tolerates unknown keys is UNKNOWN, so the era stamp is local-only until that is proven. Corpus consumers that read only remote receipts cannot see the stamp yet.
- `legacyProgression.ts` is not imported or modified by the registry.

## What "active" means

Active = **the generation profile requests the feature**. The registry does not evaluate non-profile gates (board size). Those are listed in `runtimeGates` and in the matrix notes below. A feature can therefore be "active" in the stamp yet produce nothing on a small board.

## Registry contents (v1)

| Feature id | Stage | Generator | Profile fields | Active when |
| --- | --- | --- | --- | --- |
| `corridor-layout` | checkpoint-path | `createLegacyCheckpointPathMaze` | `checkpointCountMultiplier`, `checkpointCountOverride`, `minCheckpoints` | always |
| `checkpoint-bends` | checkpoint-path | `createLegacyCheckpointPathMaze` | `checkpointCountOverride`, `minCheckpoints` | not (override = 1 and minCheckpoints = 1) |
| `straight-corridor-bias` | checkpoint-path | `createLegacyCheckpointPathMaze` | `straightnessBias` | bias > 0 |
| `playable-topology-normalization` | topology-normalization | `normalizeLegacyPlayableTopology` | none | always |
| `open-floor-block-normalization` | topology-normalization | `normalizeLegacyOpenTwoByTwoFloorBlocks` | none | always |
| `branch-dead-ends` | checkpoint-path | `createLegacyCheckpointPathMaze` | `maxDeadEndCount` | cap is null (emergent) or > 0 |
| `dead-end-cap` | dead-end-prune | `pruneLegacyDeadEnds` | `maxDeadEndCount` | cap is not null (including 0) |
| `shortcut-bridges` | shortcut-bridges | `applyLegacyShortcutBridges` | `shortcutCountMultiplier` | multiplier > 0 (gate: board linear size > 35) |
| `route-reinforcement` | route-reinforcement | `reinforceLegacyRouteQuality` | `shortcutCountMultiplier`, `routeQualityReinforcementMultiplier` | both > 0 (same size gate) |
| `edge-wrap-horizontal` | border-wrap-mandatory | `applyLegacyMandatoryOppositeBorderConnections` | `requiredOppositeBorderConnections.horizontal` | true |
| `edge-wrap-vertical` | border-wrap-mandatory | `applyLegacyMandatoryOppositeBorderConnections` | `requiredOppositeBorderConnections.vertical` | true |
| `edge-wrap-horizontal-feeder-pairing` | border-wrap-mandatory | `applyLegacyMandatoryOppositeBorderConnections` | `borderFeederTargetPerSide`, both wrap flags | feeders = 1, horizontal false, vertical true |
| `perimeter-feeders` | border-feeders | `applyLegacyPerimeterFeederConnections` | `borderFeederTargetPerSide`, both wrap flags | target is null (auto per side) or > 0 |
| `border-wrap-pairing` | border-wrap-pairing | `applyLegacyOppositeBorderConnections` | both wrap flags | horizontal or vertical true |

All 14 features list modes `play` and `menu`. A guard test asserts every field of the normalized profile is claimed by at least one feature, so a new profile field cannot change topology without an era label.

Decisions encoded:

- `edge-wrap-horizontal-feeder-pairing` records an existing hidden coupling in `legacyMaze.ts` (`feederPairingConnections`): with exactly one feeder per side and a vertical-only wrap profile, the mandatory stage still carves the horizontal wrap pairing. It is its own id so cohorts can be split on it. Whether this coupling is intended is UNKNOWN; the registry documents it rather than changing it.
- A `null` feeder target is active, not off: the generator derives a per-side target of 2..6 from board size.
- `dead-end-cap` with cap `0` is active while `branch-dead-ends` is not, so tutorial and capped mazes are distinguishable from uncapped ones.

## Feature matrix by level band, as on `main`

Source of values: `resolveLegacyMazeGenerationProfileForProgression` evaluated for target complexity `8 + 4 * (L - 1)` at bounded difficulty levels 1..99, then fed to the resolver. "Bounded difficulty level" `L` is the target-complexity index, not the unbounded completion ordinal. Pressure steps at half speed: step `= floor(L / 2) + 1` (see the level/rank contract). The device-relative feeder scaling in `resolveLegacyMazeGenerationProfileForProgression(track, { fraction })` clamps the count to at least 1 and so does not change which ids are active.

| Band | Difficulty levels (L) | Active ids beyond the always-on set | Notes |
| --- | --- | --- | --- |
| tutorial | 1 | `straight-corridor-bias`, `dead-end-cap` | Single checkpoint leg; no bends, branches, shortcuts, wraps or feeders. |
| starter A | 2-3 | `checkpoint-bends`, `straight-corridor-bias`, `dead-end-cap` | Cap 0; checkpoint override 2. L3 resolves to the same profile as L2. |
| starter B | 4-13 | adds `branch-dead-ends`, `shortcut-bridges`, `route-reinforcement` | Cap 1..10, shortcut and reinforcement multiplier 0.058..0.29. No wraps, no feeders. |
| starter C | 14-15 | adds `edge-wrap-vertical`, `edge-wrap-horizontal-feeder-pairing`, `perimeter-feeders`, `border-wrap-pairing` | Vertical-only wrap with one feeder per side; the forced horizontal pairing appears here. |
| explorer | 16-35 | `checkpoint-bends`, `branch-dead-ends` (uncapped), `shortcut-bridges`, `route-reinforcement`, `edge-wrap-horizontal`, `edge-wrap-vertical`, `perimeter-feeders`, `border-wrap-pairing` | Straight bias and dead-end cap removed. |
| navigator | 36-57 | same id set as explorer | Differs only in numeric multipliers (not ids). |
| architect | 58-81 | same id set as explorer | Feeders 2 per side. |
| mythic | 82-99 | same id set as explorer | Feeders 2 per side. |

Always-on in every band: `corridor-layout`, `playable-topology-normalization`, `open-floor-block-normalization`.

Consequence: from L16 up the id set is constant, so the stamp distinguishes eras and bands up to L16 but not the numeric ladder above it. A later geometry-budget ladder for levels 2..30 will need either new feature ids or a registry version bump to be distinguishable.

## Mode parity

| Build path | Entry point | Uses the registry's features |
| --- | --- | --- |
| `play-generated` | `createLegacyMaze` via `createLegacyRuntimeMazeForMode('play', ...)` | yes |
| `menu-generated` | `createLegacyGeneratedMenuMaze` via `createLegacyRuntimeMazeForMode('menu', ...)` | yes, same profile, same stages |
| `menu-snapshot` | `createLegacyMenuMaze` (hand-authored blueprint) | none; no generation profile, stamp has `activeFeatureIds: null` |

Verified in source: both generated modes call `createLegacyMaze` with the same normalized profile; `MenuScene.resolveLegacyMazeGenerationProfileForMode` reads the player track for both modes and only the scale options differ. Registry resolution is identical for `menu` and `play` for every profile tested.

Intentional mode differences that are NOT feature differences (not in the registry): the shortcut count modifier (`menu` 0.13, `game` 0.18) and a menu minimum of 6 shortcuts above size 35 (`resolveLegacyGeneratedMenuShortcutCount`, `resolveLegacyShortcutCount`).

## Bleed-off (border feeder / wrap) classification

- Feeders: absent for tutorial and starter levels 2-13; first appear at L14 (one per side); band-scaled 1 per side for explorer/navigator and 2 per side for architect/mythic; a null target is auto-sized.
- Vertical wrap: first at L14. Horizontal wrap: first as the forced pairing at L14, then explicit from L16.
- Menu and play share these rules. Retired/preview-only classifications: none found.

## Telemetry stamp

- Fields on `MazeCycleTelemetryReceipt` and on diagnostic receipts: `featureRegistryVersion: string`, `activeFeatureIds: string[] | null`.
- Mode used to resolve ids: `maze.generation.buildKind` (or `maze.source`), falling back to the receipt surface. Both modes currently resolve identically.
- Stability: ids come in registry declaration order, de-duplicated and capped on read (64 ids, 64-char version).
- `activeFeatureIds` is `null` for mazes without `generation.profile` (hand-authored snapshot, test fixtures), with the current version still stamped.

## UNKNOWN / not verified

- Remote RPC tolerance for extra receipt keys: not tested; remote payload deliberately unchanged.
- Retry profiles are not reflected. `createLegacyUnderTargetPressureProfile` (target complexity >= 46) and `createLegacyAdaptiveUnderTargetProfile` force both wraps true and raise feeders, shortcuts and reinforcement for retry candidates, but `maze.generation.profile` records the requested profile and `selection` does not say which candidate (initial window, pressure retry, adaptive retry) was chosen. The stamp can therefore under-report wraps and feeders on retried mazes. Fraction of affected mazes: UNKNOWN.
- Realized board size per device: starter-band `targetScale` is 30-35 and shortcuts need linear size > 35, so starter `shortcut-bridges` and `route-reinforcement` may be requested but not produced. Actual scale blends settings, target complexity and viewport; not measured here.
- Whether the forced horizontal pairing at one feeder / vertical-only is intended: undecided.
- Visual menu/play pairs and per-band topology generation tests (proof plan items 1 and 3 on the card) are not produced by this change; only the profile-to-feature mapping is tested.
- Dead-config audit beyond the profile fields (for example unused tuning constants) was not done.
- Rendering and presentation-order features (non-solution-revealing build order) are out of scope for this registry version.

## Extension contract

- Add features with `defineLegacyMazeFeatureRegistry(version, [...])`; ids are unique and never renamed or re-meant under an existing version string.
- Fields not yet on `LegacyMazeGenerationProfile` can be referenced by dotted path; the resolver preserves unknown input keys. Until the canonical registry adds them, the guard test (registry paths equal profile paths) is the signal to add or version.
- Bump `LEGACY_MAZE_FEATURE_REGISTRY_VERSION` when a feature is added, removed, or its activation rule changes, so cohorts stay separable.
