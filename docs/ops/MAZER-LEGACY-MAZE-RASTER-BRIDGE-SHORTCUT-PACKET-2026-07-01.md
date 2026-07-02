# Mazer Legacy Maze Raster Bridge Shortcut Packet - 2026-07-01

## Scope

Owner repo only: `repos/mazer`.

This packet ports the restored legacy shortcut bridge condition into the browser maze raster layer without claiming the full Unreal generator is line-for-line complete.

Touched owner chain:

- `legacy/old-project.zip`
- `docs/legacy/gameplay-spec.md`
- `src/domain/maze/core.ts`
- `src/domain/maze/generator.ts`
- `tests/maze/maze-domain.test.ts`
- `docs/current-truth.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
- `docs/system-map.md`

## Legacy Source Finding

The restored Unreal `CreateShortCuts()` logic selects candidate wall tiles, verifies all four cardinal neighbors exist, then opens the candidate when one axis has opposite path corridors and the perpendicular axis remains walled.

Browser `TILE_PATH` means canonical solution path, not the old Unreal path-network flag. The correct web equivalent for this packet is therefore `TILE_FLOOR` on the rasterized walkable network.

## Change

Generated play mazes now run an additive raster shortcut bridge pass after canonical path marking:

- collects closed raster wall tiles with complete four-neighbor context
- requires opposite walkable floor neighbors on one axis
- requires blocked wall neighbors on the perpendicular axis
- opens the selected candidate as floor only
- appends accepted openings to the generation trace as `braid` steps
- counts accepted raster bridge openings in `shortcutsCreated` and difficulty classification

The existing browser-native core bypass pass remains in place for family-aware route alternatives. This packet adds the legacy wall-bridge rule on top of that instead of replacing the full browser builder.

## Proof

Focused proof passed:

```bash
npx vitest run tests/maze/maze-domain.test.ts --maxWorkers 1
```

The focused maze-domain test now verifies:

- route-affecting bypasses remain present
- more than one canonical path edge can be bypassed
- bypassable edges span at least two route bands
- at least one non-canonical raster floor bridge matches the restored legacy shortcut wall-neighbor shape

## Marker Review

The legacy 1:1 completion marker ratchets from `70%` to `71%`.

Reason:

- this is a runtime behavior change, not only a docs/proof change
- it is anchored to the restored Unreal `CreateShortCuts()` wall-neighbor condition
- it closes one concrete generation exactness gap at the raster shortcut layer

Remaining gap:

- the browser generator still does not execute the full Unreal `CreateGrid` / `MapPath` / `CreatePath` / `CreateShortCuts` stage sequence line-for-line
- the old wall-array lifecycle, random-removal loop, process-yield behavior, and staged builder internals remain open

## Boundaries

No deploy.

No live resource mutation.

No Supabase, Vercel, or GitHub app-resource creation.

No duplicate Mazer identity.

No menu visual module mutation in this packet.
