# Navigation Core v2 - Board Tile Amendment (DRAFT)

```
NAVIGATION CORE V2
Amendment to: Navigation Core v1 (APPROVED - FROZEN 2026-09-03)
Scope: board tiles (floor, rim, junction/dead-end details, docks) and the start/goal/player marker treatment
STATUS: DRAFT - not frozen, not applied to the live renderer
Owner approval: PENDING
```

This document drafts the amendment that the owner's request for a mobile-readable board
redesign requires. Navigation Core v1 is frozen and its "Prohibited regressions" list
forbids a bleached floor and per-cell trail rendering; a redesign cannot ship under v1
without a new explicitly approved revision. This draft is that revision's proposal.

Nothing in this document changes runtime behavior. The implementation delivered with it
is a pure, unwired module (`src/render/boardTileBake.ts`, `src/render/boardTileStyle.ts`).
Scene wiring is a separate packet: `docs/ui/MAZER-BOARD-TILE-BAKE-WIRING-PLAN-2026-11-05.md`.

## Facts, assumptions, decisions

Facts (measured from the live renderer constants and the prototype page, WCAG 2.x contrast):

- The corridor is a near-white slab. Its pixel value (215,238,235) against the board
  background is **16.7:1** (glare on a dark phone screen). The dimmed `path.core` is 11.4:1.
- Markers sit on that slab with almost no separation: player green 1.19:1, start gold
  1.31:1, goal red 2.82:1, trail cyan 2.36:1.
- The lit rim is about 1 px of `line.normal` (3.15:1 against the background) over a
  texture-derived seam pattern inside the slab.
- The goal star is a hollow 1 px outline; the start marker is a faint 26%-alpha ring.

Assumptions: the redesign is for mobile first (25x51 portrait board at about 14 px tiles
on a 390x844 phone); the trail's real colours remain the Navigation Core energy stops.

Decision (Claude, owner-delegated, reversible): ship option B "Chip" as the default style
and implement option C "Trace" as an alternate selectable by a parameter. Option A
(refined slab) is not shipped because it keeps the bright slab. The owner flips the style
after seeing it in the real game.

## What changes versus frozen v1

| Area | v1 (frozen) | v2 (this draft) |
|---|---|---|
| Floor | Ivory/mint checker slab with textured floor tile, 22% dimmed `path.core` | Calm mid-tone chip fill, `path.chip` = `mix(line.normal, bg.canvas, 0.35)` (derived, documented, not a new token). No floor texture on the board. |
| Rim | One strengthened outer rail, about 1 px, square corners | One thin lit edge (`line.active`, about 1.4 css px snapped to whole device pixels), convex corners rounded at about 0.3 tile, concave corners patched, dead ends fully round |
| Joins | Flat tiles abutting | Joins merged into one continuous ribbon: no inset across a join, one path fill per layer, geometry snapped to device pixels so there is no seam at any DPR |
| Details | Connector seam pads | Junction pads/nodes, faint pad dots, capped faint "socket" dots on wall cells near the path (at most 480, only for tiles of 10 css px and up) |
| Docks (wrap/bleed) | Textured image strip | Four diminishing chip slices (alpha 0.9/0.55/0.28/0.14) plus a lintel bar at the board edge; trace style uses a dotted stub with a threshold node |
| Start | Faint ring | Gold corner brackets with a centre dot |
| Goal | Hollow 1 px star, rotating rainbow ring | Star in a dark disc badge (`bg.canvas`) with a lit ring; badge 3.3:1 against the chip, star 5.9:1 against the badge. One-cell footprint kept. |
| Player | Green rounded square | Same green rounded square (`semantic.energy`), now with a mint (`brand.mint`) edge and a dark keyline outside it |
| Trail | 16% width continuous spectral path | Rules unchanged (see below); one contrast gap is recorded under "Open items" |

Style `trace` (alternate): the corridor is one stroked circuit trace in a dark channel
(`bg.shell` body, `line.subtle` border) with three soft glow passes (`rail.cyan` at alpha
0.07 / 0.12 / 0.22) and a bright core, junction rings, dead-end pads and dotted docks.

## What stays from v1

- One-cell green rounded-square player (chip: 60% of the tile, inside the 58-64% rule).
- One continuous trail, 16% of tile width, spectral energy palette, never per-cell, ending
  `tile * 0.3` short of the player centre. The trail modules are not touched.
- One-cell end star with the same footprint and the same semantics (reaching it ends the
  maze). No outer white frame, no permanent decorative dots.
- Reduced-motion contract: every state is understandable without motion. The bake is static
  by construction; marker animation is limited to an optional goal-ring alpha phase that is
  forced to zero under reduced motion.
- No detached/black gaps between adjacent floor cells.
- Scale rules: all geometry is tile-relative ratios (named constants in
  `BOARD_TILE_GEOMETRY`), exercised at 14 px and 26 px tiles in tests.

## v1 prohibited-regression list: what this amendment changes

- "A bleached, featureless floor": v1 forbids washing out texture to hide seams. v2 removes
  the bright slab altogether; the floor is a deliberate calm mid-tone and seam-freeness is
  shown by geometry (adjacent tiles share exact device-pixel edges), not by washing out.
  This entry is rewritten for v2, not silently dropped.
- "Per-cell trail rendering": unchanged and still prohibited. The prototype's trail
  turn-node dots were not carried into this module.
- All other prohibited regressions remain in force.

## Acceptance matrix (draft)

| # | Criterion | Evidence | Status |
|---|---|---|---|
| A1 | Marker contrast vs the chip fill >= 3:1 for player, start, trail reference colour, goal badge | `tests/render/boardTileStyle.test.ts`, `tests/render/boardTileBake.test.ts` (WCAG function in the test). Measured: player 4.22, start 3.81, trail (`rail.cyan`) 4.12, goal badge 3.33, goal star on badge 5.91, goal ring 4.35 | Unit-proven |
| A2 | Seam-free joins at DPR 1/2/3 and fractional tile sizes | geometry tests: exact shared edges, zero inset across joins, device-grid coordinates | Unit-proven |
| A3 | Every stroked or ruled line is a whole number of device pixels, at least 1 device px | style and bake tests at DPR 1/2/3 | Unit-proven |
| A4 | Bake is deterministic and rebuild-skipping | identical draw list and hash for identical input; cache test | Unit-proven |
| A5 | Bounded draw cost | 25x51 braided maze, chip: 7 raster ops; trace: 12; with 4 docks: 43 / 36 (path-construction ops about 5.5k chip / 3.8k trace, one time per bake) | Unit-proven |
| A6 | Hazard slots reserved, draw nothing | `slotBlocker/slotGate/slotPatrol` tests | Unit-proven |
| A7 | Real-game visual proof at 390x844 DPR 2 and 3, 1280x720 DPR 1 | wiring plan, "Visual proof plan" | NOT RUN (unwired) |
| A8 | Trail readable on the chip | needs a trail underlay or lift, see Open items | OPEN |
| A9 | Colour-vision check (protan/deutan/tritan) of player vs goal vs start | prototype filters were used on the options; must be re-run on the real game | NOT RUN |
| A10 | Frame time and memory on a real phone | bake runs once per hash; one blit per frame | NOT RUN |
| A11 | Owner approval | owner picks a style after seeing the real game | PENDING |

A localhost browser render of the bake output (chip and trace, 25x51 maze and a four-dock
maze at DPR 2) was inspected during implementation; it is not committed evidence.

## Open items (recorded, not hidden)

- Trail contrast: the Navigation Core energy stops are not all >= 3:1 against the chip
  (violet, blue, magenta and red fall below; a unit test documents this). The wiring packet
  must add a dark underlay (the prototype used `bg.canvas` at about 0.6 alpha, about 1.25
  css px wider on each side than the trail) or lift the stops toward white, and re-measure.
- Raw goal red is only 1.77:1 on the chip; the dark badge carries it. Do not remove the badge.
- `NAVIGATION_CORE_TRAIL_ENERGY_STOPS` is not changed by this draft.

## Style switch

`bakeBoardTiles({ ..., style: 'chip' | 'trace' })` and `drawBoardMarkers(ctx, { style })`.
`DEFAULT_BOARD_TILE_STYLE` is `'chip'`. `resolveBoardTileStyleId(value)` parses an untrusted
value (setting or URL parameter) and falls back to the default. The bake hash includes the
style, so flipping it rebuilds exactly once. The owner-facing control (a settings entry or a
URL parameter) belongs to the wiring packet.

## Visual proof plan (to run when wired)

Before/after pairs, same seed and progress, at 390x844 DPR 2 and 3 and 1280x720 DPR 1:
level 1 straight corridor with saved progress reset and the progression label checked;
braided 25x51 maze; wrap-dock maze with all four docks; chip and trace each. Include the
colour-vision simulations and a 100% crop of a junction and a dead end. Capture details are
in the wiring plan.

## Owner approval

```
Owner approval: PENDING
Trigger: owner request for a mobile-readable board redesign (2026-11-05)
Final approval is recorded here when the owner picks a style after seeing the real game.
Until then v1 remains the frozen authority for the live renderer.
```

## Decision-registry amendment (DRAFT TEXT, NOT APPLIED)

Enforcement, read from the repo at base `1670c8af`:

- `docs/contracts/mazer-ui-rework-decision-registry.v1.json`, key `integratorWaveOwnership`,
  holds single-active-owner path claims. `scripts/check-decision-registry.mjs` enforces:
  no path may be `status: "active"` in two waves; `REQUIRED_INTEGRATOR_WAVE_BY_PATH` pins
  specific paths to specific waves; `dependsOn` must reference registered waves and be
  acyclic; `collectIntegratorWaveMixViolations` fails a change set that touches paths owned
  by two or more different active waves.
- `tests/architecture/decision-registry-contract.test.ts` runs those checks against the
  registry and against the live git diff (`readGitChangedFiles`: committed plus working tree).
- `src/render/boardRenderer.ts`, `cyberArcadeMaterial.ts`, `palette.ts`, `tuning.ts` and
  `legacyIridescentMaterial.ts` are claimed by no wave. The two new files are likewise unclaimed.

Draft entry (append to `integratorWaveOwnership.assignments`):

```json
{
  "wave": "4D-C",
  "status": "active",
  "dependsOn": ["4D-A"],
  "owner": "board-tile-integrator",
  "paths": [
    "src/render/boardTileBake.ts",
    "src/render/boardTileStyle.ts"
  ],
  "note": "Baked board tile renderer for the Navigation Core v2 tile amendment (docs/assets/reference/navigation-core-v2/README.md). Pure drawing modules; the scene wiring in src/scenes/MenuScene.ts stays with its own active owner."
}
```

**Not applied, deliberately.** The checker passes without it (verified by calling
`checkDecisionRegistry()` through an import on the unmodified registry: it returned `true`).
Claiming the two files would turn the later wiring PR, which must edit `MenuScene.ts`
(Wave 5C) and use these modules, into a change set spanning two active waves, which
`collectIntegratorWaveMixViolations` rejects in the live-diff architecture test. The claim
should be added only together with a packet-level decision on how the wiring lands (for
example a registry-only PR first with the wiring edit handed to the `MenuScene.ts` owner,
or a split so the claimed files and `MenuScene.ts` never share a change set). Unclaimed
paths carry no mix risk and are covered by `tests/render/boardTile*.test.ts`.
