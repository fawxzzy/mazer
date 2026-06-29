# Mazer Legacy Menu Shell Parity Tightening Packet

## Scope

- tighten the menu-only front-door shell toward the legacy screenshots
- keep the fixed legacy snapshot route and reset-lane runtime intact
- widen the system map so future edits can target the right owner surfaces faster

## Why

After the fixed-snapshot preroll hardening landed, the main visible drift was no longer route truth. It was shell composition:

- the title lockup still read too heavy and too high
- the board slab/frame still read too flat and too modern
- the front-door buttons were still too bright and too wide for the archived look

This pass keeps the runtime truth stable and only tightens menu-only presentation.

## Landed

- `src/legacy-runtime/legacyMenuLayout.ts`
  - reduced the front-door center-button spread
  - pulled side buttons closer to the board
  - lowered the title anchor inside the board composition

- `src/scenes/MenuScene.ts`
  - made the title lockup smaller and more translucent
  - reshaped the menu board slab/frame toward the screenshot-style gray plate with darker side/bottom mass
  - softened front-door button alpha/stroke/text intensity while preserving the `Start` emphasis

- `docs/system-map.md`
  - records title/slab/button ownership more explicitly
  - records the fixed-snapshot deterministic menu demo policy

## Boundaries Preserved

- gameplay truth still comes from restored legacy sources
- menu mode and play mode stay split
- one active overlay at a time stays intact
- fixed menu snapshot route truth is unchanged
- play movement, HUD logic, and reset flow were not widened by this packet

## Validation

- `npm run test -- tests/reset/legacy-menu-layout.test.ts tests/reset/legacy-reset.test.ts`
- `npm run build`
- `npm run visual:matrix -- --preset core --skip-build true`

Latest visual matrix run:

- `tmp/captures/mazer-layout-matrix/2026-06-29T06-15-04-055Z`

## Current Truth After This Pass

- the menu shell is closer to the legacy screenshot lane on title translucency, frame massing, and button restraint
- the repo now has a clearer durable owner map for future front-door edits
- exact 1:1 parity is still not fully closed; the main remaining visible pressure is the final fine-grain balance between title overlap, board silhouette massing, and exact button plate proportions

## Next Honest Slice

- one more narrow `legacy menu screenshot parity` pass only if live proof still shows a specific visible miss against `menu-01..04`
- otherwise keep moving to the next bounded parity gap instead of endlessly re-polishing the same shell
