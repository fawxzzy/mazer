# Mazer Legacy Menu Static Segment Material Packet

Date: 2026-07-01
Status: landed

## Segment

Weighted marker segment:

- `Menu screenshot composition and board presentation`

Marker result:

- held at `70%`
- no ratchet

## Purpose

The latest side-browser comparison against `legacy/screenshots/menu-03.png` showed the front-door board still drifting in the board-material lane:

- the current web board had too many broad filled cells
- connected junction clusters read as large solid blocks instead of carved maze runs
- the visual role hierarchy still needed to read more like gray slab mass with dark carved routes

## Changes

- `src/legacy-runtime/legacyMenuRender.ts`
  - added `resolveLegacyMenuPathRenderSegments()`
  - kept the older frame resolver available
  - renders connected menu paths as bounded corridor stroke segments instead of one broad bounding rectangle

- `src/scenes/MenuScene.ts`
  - switched the menu static-board draw path to the segment resolver
  - adjusted menu-only board colors toward gray slab mass with darker route cores
  - kept play-mode rendering unchanged

- `tests/scenes/menu-render-frame.test.ts`
  - added direct proof that four-way menu joins resolve into stroke segments
  - updated source guards for the static-board material role hierarchy

## Proof

Focused proof:

```bash
npm run test -- tests/scenes/menu-render-frame.test.ts tests/reset/legacy-marker.test.ts
npm run build
```

Result:

```text
19 test files passed
96 tests passed
build passed
```

Side-browser proof:

```text
ATLAS local-only tmp artifact: tmp/mazer-current-desktop-segment-dark-route-1920x1080.png
```

Runtime diagnostics on the maintained `4173` browser tab:

```text
fps 111 avg 9.0ms worst 10.4ms spikes 0
trail 46/46 listeners 4 vis 0/0 low off
ai wrong 1 back 2 recover 1
gen stage consumed-finalized:7 signal player-finalized complete yes
draw rows 25/25 remaining 0 progress 100% batch 1 rows staged yes
```

## Marker Re-evaluation

The percent marker was re-evaluated as required by the every-pass rule.

Decision:

- hold at `70%`

Reason:

- this pass improves one board/material submodule
- it does not close screenshot-grade board composition
- visual proof still shows tiny-grid/checker drift compared with the restored legacy screenshot
- HUD, topology internals, and exact demo sprite/trail treatment are unchanged

## Next Honest Slice

Continue in the same modular sequence:

1. If the board remains the top visible miss, choose either one exact static-board material miss or one exact `legacyMenuSnapshot.ts` silhouette miss.
2. Do not ratchet the marker unless the next proof closes a weighted segment gap, not just another incremental material improvement.
