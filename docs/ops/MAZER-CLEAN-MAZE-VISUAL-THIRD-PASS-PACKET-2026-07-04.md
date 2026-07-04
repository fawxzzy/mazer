# Mazer Clean Maze Visual Third Pass Packet

Date: 2026-07-04
Branch: `codex/mazer-clean-maze-visual-third-pass`

## Reason

The active mechanics/mobile lane reached `100%`, but the maintained phone play view still read too chunky:

- normal phone play tiles at about `7px` were rendered with zero trench inset, so adjacent floor cells merged into blocky floor masses
- the active-play player locator was larger than the corridor width and visually competed with the maze
- the old reference screenshots read cleaner because dark wall gaps stay dominant and the player signal is small relative to the route

## Decision

This pass changes rendering only. It does not wipe old copies, delete attempts, or rewrite maze topology.

Deleting or archiving prior copies is intentionally deferred until the operator explicitly approves the exact paths. The safe move is to preserve evidence while extracting the useful lesson:

- keep the procedural maze/mechanics work from the current branch
- restore thinner visual corridors for phone-size tiles
- shrink active-play player/trail overlays so navigation reads first
- keep screenshot-grade 1:1 parity out of scope unless explicitly reopened

## Implementation

- `src/legacy-runtime/legacyMenuRender.ts`
  - phone-size tiles above `4px` now keep a nonzero trench inset instead of filling the full cell
  - player marker and locator metric caps are smaller, preventing oversized rings on mobile tiles
- `src/scenes/MenuScene.ts`
  - active-play trail edge/core ratios are slimmer
  - active-play player uses smaller marker ratios than the menu/demo player
- `tests/scenes/menu-render-frame.test.ts`
  - guard changed from preserving dense tiny tiles to preserving visible phone-size lane separation
  - active-play player marker expectations now lock the smaller ratios

## Proof

- `npx vitest run tests/scenes/menu-render-frame.test.ts --reporter=dot`
- `npm run lint`
- `npm run build`
- `npm run edge:live -- --skip-build true --headless true --run mobile-touch-smoke`
- `npm run edge:live -- --skip-build true --headless true --run core-only-watch`

## Remaining Visual Risk

This pass makes the current top-down board cleaner, but it is not a full fresh rebuild and does not claim exact old screenshot material, exact old player sprite, or exact old menu composition.
