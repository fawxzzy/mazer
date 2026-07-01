# Mazer Legacy Generation Backtrack Next-Tile Packet

Date: 2026-07-01
Status: landed

## Scope

This packet tightens active reset-lane maze generation against restored Unreal `Backtrack()` behavior.

Touched segment:

- `Generation lifecycle exactness`

Marker result:

- `85% -> 86%`
- generation row: `14 / 16 -> 15 / 16`

## Restored Source Finding

The restored Unreal generation source does not resume from the already-carved path candidate when backtracking succeeds. It calls `FindNextTile()` from that candidate and returns the selected next tile:

- `Source/Mazer/MazerGameModeBase.cpp`
- `Backtrack()`
- `PotentialTile = FindNextTile(PotentialPathArray[randTile], MazerGameInstance->_Checkpoint.GridTileInfo.GridTile);`
- `PotentialTile = FindNextTile(PotentialPathArray[i], MazerGameInstance->_Checkpoint.GridTileInfo.GridTile);`
- `return PotentialTile;`

The previous web builder treated a successful backtrack candidate as the resume tile. That was cleaner, but less source-faithful.

## Runtime Change

Owner chain:

- `src/legacy-runtime/legacyMaze.ts`
- `createLegacyCheckpointPathMaze()`
- `backtrackLegacyPath()`

Changes:

- `backtrackLegacyPath()` now returns the next tile selected by `findLegacyNextTile(...)`.
- The ordered fallback branch now stores and returns that selected next tile instead of returning the candidate path tile.
- The path-length handoff resets unknown returned next-tile length to `0`, matching the source-shaped struct flow more closely than preserving the previous browser path length.
- Generic generated-maze demo bootstrap now preserves the last valid `explore` frame when preroll would cross into goal/reset hold after the source-shaped topology change.

## Proof

Commands:

```bash
npm exec vitest -- run tests/reset/legacy-reset.test.ts tests/reset/legacy-generation-lifecycle.test.ts tests/maze/maze-domain.test.ts --reporter=dot
npm exec vitest -- run tests/reset/legacy-reset.test.ts tests/reset/legacy-generation-lifecycle.test.ts tests/reset/legacy-marker.test.ts --reporter=dot
npm exec vitest -- run tests/reset/legacy-menu-demo-lifecycle.test.ts tests/reset/legacy-reset.test.ts tests/reset/legacy-marker.test.ts --reporter=dot
npm run verify
```

Focused proof:

- `tests/reset/legacy-reset.test.ts` now guards that restored source returns `FindNextTile(...)`.
- The same guard verifies the web owner returns `findLegacyNextTile(...)` and resets unknown backtracked path length through the source-shaped branch.
- Desktop/mobile play-route screenshots were captured from the single maintained `4173` browser route after rebuild.

Local-only visual proof artifacts:

- `tmp/captures/mazer-generation-backtrack-next-tile-2026-07-01/play-generation-backtrack-desktop-1366x900.png`
- `tmp/captures/mazer-generation-backtrack-next-tile-2026-07-01/play-generation-backtrack-desktop-diagnostics.json`
- `tmp/captures/mazer-generation-backtrack-next-tile-2026-07-01/play-generation-backtrack-mobile-390x844.png`
- `tmp/captures/mazer-generation-backtrack-next-tile-2026-07-01/play-generation-backtrack-mobile-diagnostics.json`

Observed diagnostics:

- `generation.stageCursor.currentStageId`: `7`
- `generation.stageCursor.completionSignal`: `player-finalized`
- `generation.stageCursor.processComplete`: `true`

## Non-Claims

This packet does not claim:

- exact Unreal RNG parity
- exact `std::srand(std::time(0))` time-seeded behavior
- exact per-tick process-yield timing
- a byte-for-byte port of all `MapPath()` selection behavior
- production deployment

No Supabase, Vercel, GitHub app-resource, or live infrastructure mutation was made.

## Next Honest Seam

The final generation point is blocked on deciding how literal to make Unreal randomness and process-yield timing in a browser-safe app. The highest-value remaining generation seam is an explicit RNG/time-seeding equivalence decision or a staged-yield generation prototype that proves the browser can show generation fluidly without compromising playability.
