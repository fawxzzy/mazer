# Mazer Legacy Menu Narrow Trench Inset Packet

Date: 2026-07-01
Status: landed

## Segment

Weighted marker segment:

- `Menu screenshot composition and board presentation`

Marker result:

- held at `70%`
- no ratchet

## Purpose

Reduce the chunky filled-cell read in the current web menu board by tightening the legacy menu trench render frame.

The restored screenshots show a dark slab with thinner light-gray corridor bands and heavier dark recesses. The previous web render used a shallow path inset, which made many walkable tiles read as broad square blocks instead of carved corridors.

## Changes

- `src/legacy-runtime/legacyMenuRender.ts`
  - added named trench inset ratios
  - increased the closed-edge trench inset from the prior shallow ratio to `0.2`
  - increased the inner light-core inset to `0.16`

- `tests/scenes/menu-render-frame.test.ts`
  - updated expected render frames for the narrower menu trench
  - added coverage for connected intersections
  - pinned the named trench ratio constants as part of the board/material proof

## Proof

Focused proof:

```bash
npm run test -- tests/scenes/menu-render-frame.test.ts tests/reset/legacy-marker.test.ts
```

Result:

```text
19 test files passed
94 tests passed
```

## Marker Re-evaluation

The percent marker was re-evaluated as required by the every-pass rule.

Decision:

- hold at `70%`

Reason:

- this pass improves one board/material submodule
- it does not close screenshot-grade board geometry
- it does not close full visual composition parity
- it does not affect HUD, topology internals, or demo AI stack parity

Next honest visual slice:

- compare current localhost render against `legacy/screenshots/menu-01..04`
- choose one remaining silhouette or material miss
- keep the owner chain restricted to the menu visual renderer unless proof shows a different blocker

