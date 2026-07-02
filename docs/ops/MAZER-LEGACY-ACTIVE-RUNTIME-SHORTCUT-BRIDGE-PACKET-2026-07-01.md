# Mazer Legacy Active Runtime Shortcut Bridge Packet - 2026-07-01

## Scope

Owner repo only: `repos/mazer`.

This packet moves the restored shortcut bridge behavior into the active reset-lane maze owner used by `MenuScene`.

Touched owner chain:

- `legacy/old-project.zip`
- `docs/legacy/gameplay-spec.md`
- `src/legacy-runtime/legacyMaze.ts`
- `src/legacy-runtime/legacyGenerationLifecycle.ts`
- `src/legacy-runtime/legacyDemoWalker.ts`
- `tests/reset/legacy-reset.test.ts`
- `docs/current-truth.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
- `docs/system-map.md`

## Change

Generated active-play legacy maze snapshots now apply shortcut bridges after the base DFS walkable grid is carved and after start/goal are selected.

The shortcut pass:

- uses the explicit generation budget passed from `resolveLegacyGenerationBudgetContract()`
- skips shortcut opening when the legacy shortcut stage is disabled by scale
- selects only closed wall cells with a full four-neighbor context
- opens a wall only when one axis has opposite walkable path corridors and the perpendicular axis remains walled
- records `shortcutsCreated` on the legacy maze snapshot
- propagates that count into the demo walker `MazeEpisode`
- recomputes the shortest start-goal solution path after shortcut bridges are opened

## Why This Was Needed

The previous raster bridge packet added the restored shortcut bridge shape to the domain maze raster path. That was useful for the repo's domain/proof lane, but the active reset-lane shell uses `createLegacyMaze()` through `createLegacyRuntimeMazeForMode()`.

This packet puts the shortcut bridge behavior on the actual active play/menu runtime owner surface.

## Proof

Focused proof passed:

```bash
npm run test -- tests/reset/legacy-reset.test.ts tests/reset/legacy-generation-lifecycle.test.ts tests/reset/legacy-generation-diagnostics.test.ts
npm run lint
```

The reset-lane tests now verify:

- generated active-play legacy mazes create shortcut bridge openings
- shortcut-disabled small mazes create zero shortcuts
- converted demo walker episodes preserve the active maze shortcut count

## Marker Review

The legacy 1:1 completion marker ratchets from `71%` to `72%`.

Reason:

- this changes the actual active runtime maze owner, not just a secondary proof/domain generator
- it uses the explicit legacy shortcut budget already published by generation diagnostics
- it applies the restored `CreateShortCuts` opposite-corridor wall-bridge rule to generated play mazes

Remaining gap:

- the browser generator still does not execute the full Unreal `CreateGrid` / `MapPath` / `CreatePath` / `CreateShortCuts` stage sequence line-for-line
- the exact old `_WallArray` duplicate/stale-entry lifecycle, `std::srand(time(0))` randomness, per-attempt process yield in menu mode, and checkpoint path builder internals remain open

## Boundaries

No deploy.

No live resource mutation.

No Supabase, Vercel, or GitHub app-resource creation.

No duplicate Mazer identity.

No menu visual module mutation in this packet.
