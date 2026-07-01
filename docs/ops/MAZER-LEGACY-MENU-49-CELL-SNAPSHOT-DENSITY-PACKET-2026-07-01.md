# Mazer Legacy Menu 49-Cell Snapshot Density Packet

Date: 2026-07-01
Status: landed

## Segment

Weighted marker segment:

- `Menu screenshot composition and board presentation`

Marker result:

- `75%` -> `77%`
- menu screenshot composition and board presentation: `6/14` -> `8/14`

## Purpose

The restored legacy screenshots and old source show a much denser front-door board than the current web menu. The old source initializes `_Scale` to `50`, while the current fixed web menu snapshot was still a coarse `25` cell board. That made the right-pane browser look visibly less like the old Mazer menu even after prior material and branch-density passes.

This packet keeps the existing fixed menu blueprint and named branch map, but projects that blueprint into a 49-cell browser grid for screenshot-facing density.

## Changes

- `src/legacy-runtime/legacyMenuSnapshot.ts`
  - changed the fixed menu snapshot runtime size from `25` to `49`
  - kept the named 25-space branch blueprint as the editing surface
  - projects solution path and branch polylines into contiguous 49-cell paths

- `src/legacy-runtime/legacyMaze.ts`
  - added explicit snapshot source identity:
    - `menu-snapshot`
    - `play-generated`

- `src/legacy-runtime/legacyMenuDemoLifecycle.ts`
  - changed fixed-snapshot detection from size guessing to explicit source identity
  - prevents generated 49-cell play mazes from being misclassified as fixed menu snapshots

- Tests
  - updated fixed menu snapshot proof to assert the scaled branch coordinates
  - updated generation lifecycle proof for the 49-cell menu snapshot
  - updated play-step fixtures for explicit snapshot source identity

## Proof

Focused proof:

```bash
npm exec vitest -- run tests/reset/legacy-reset.test.ts tests/reset/legacy-generation-lifecycle.test.ts tests/reset/legacy-menu-demo-lifecycle.test.ts tests/reset/legacy-play-step.test.ts
npm exec vitest -- run tests/scenes/menu-render-frame.test.ts tests/reset/legacy-generation-diagnostics.test.ts tests/reset/legacy-marker.test.ts
npm run lint
npm run build
npm run verify
npm run edge:live -- --skip-build true --headless true --run core-only-watch
npm run edge:live -- --skip-build true --headless true --run core-only-play
```

Result:

```text
47 tests passed
10 tests passed
lint passed
build passed
npm run verify passed
edge live watch passed
edge live play passed
```

Browser proof:

```text
C:\ATLAS\tmp\captures\mazer-menu-49-density-2026-07-01\menu-after-desktop-1366x900-built.png
C:\ATLAS\tmp\captures\mazer-menu-49-density-2026-07-01\menu-after-mobile-390x844-built.png
```

Visible desktop diagnostics:

```text
draw rows 42/49 remaining 7 progress 85.7%
```

Visible mobile diagnostics:

```text
draw rows 49/49 remaining 0 progress 100%
```

## Marker Re-evaluation

The percent marker was re-evaluated as required by the every-pass rule.

Decision:

- ratchet to `77%`

Reason:

- this changes the actual fixed menu runtime topology from a coarse 25-cell approximation to a denser 49-cell screenshot-facing projection
- the solution path remains contiguous after projection, so demo traversal and recovery cues stay valid
- fixed menu snapshot identity is now explicit instead of inferred from grid size
- desktop and mobile captures prove the denser board is live in the maintained `4173` browser

Why not higher:

- exact legacy screenshot silhouette still differs
- material relief and slab edge depth are not final
- wordmark/title overlap is still not exact
- button composition and trail/player sprite treatment still need visual tightening
- play HUD and exact generator RNG/timing gaps remain outside this packet

## Next Honest Slice

Stay in a modular menu pass:

- screenshot-grade board/material review against `legacy/screenshots/menu-02.png` and `legacy/screenshots/menu-03.png`
- focus on material relief / wall-vs-corridor thickness after the 49-cell density correction
- do not reopen generated play maze topology unless proof shows an active-play blocker
