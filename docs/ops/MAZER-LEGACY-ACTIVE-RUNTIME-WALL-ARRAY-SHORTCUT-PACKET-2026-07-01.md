# Mazer Legacy Active Runtime Wall-Array Shortcut Packet

Date: 2026-07-01
Lane: Mazer pass 2 parity
Repo: `fawxzzy/mazer`
Branch: `codex/mazer-pass2-menu-parity`

## Scope

This packet tightens the active reset-lane shortcut generator after the restored `CreateShortCuts` bridge condition was already moved into `src/legacy-runtime/legacyMaze.ts`.

The old Unreal source does not scan every wall on the board. It picks random entries from `_WallArray`, removes one entry per attempt, and only opens the selected wall if it still satisfies the shortcut bridge condition.

## Changed

- `src/legacy-runtime/legacyMaze.ts`
  - builds a duplicate-preserving `_WallArray`-style list from path-neighbor walls
  - removes one randomly selected wall-array entry per shortcut attempt
  - revalidates selected entries before opening, preserving stale-entry rejection behavior
  - reports `shortcutStats` for requested, attempted, created, wall-array entry count, unique wall candidates, and exhaustion
- `tests/reset/legacy-reset.test.ts`
  - asserts active shortcut stats match the created count
  - asserts wall-array duplication is visible
  - keeps shortcut-disabled small mazes at zero requested/attempted/created shortcuts
- docs
  - `docs/current-truth.md`
  - `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
  - `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`
  - `docs/system-map.md`
  - `docs/legacy/gameplay-spec.md`
  - `docs/legacy/tuning.md`

## Marker

Legacy 1:1 marker ratchets from `72%` to `73%`.

Reason:

- the active runtime shortcut stage now mirrors the old `_WallArray` selection lifecycle more closely
- this closes a real old-source gap beyond the prior bridge-condition packet

Limit:

- this is not a full generator port
- the web runtime still does not execute the full Unreal `CreateGrid` / `MapPath` / `CreatePath` / `CreateShortCuts` sequence line-for-line
- exact roll-for-roll randomness remains intentionally deterministic in the browser rebuild

## Validation

Focused proof:

```bash
npm run test -- tests/reset/legacy-reset.test.ts
```

Result:

```text
19 test files passed
98 tests passed
```

## Boundary

No deploy.
No live resource mutation.
No duplicate Mazer identity.
No Supabase or Vercel app-resource mutation.
Shipping proof remains canonical; legacy/recovery proof remains additive.

## Next Exact Gap

The next generator-facing 1:1 gap is the full checkpoint path-builder:

- legacy random start tile selection
- checkpoint validation
- closest/random/preferred next-tile selection
- local path-adjacency validation
- backtrack-to-path recovery
- longest-path end-tile selection

That should be opened as its own packet before replacing the current browser-native topology builder.
