# Mazer Legacy Menu Diagonal Silhouette Packet

## Scope

- keep the pass inside the fixed menu snapshot only
- strengthen the staircase diagonal mass that still reads weaker than the archived menu screenshots
- preserve layout, title, button, backdrop, and play-mode behavior

## Why

After the title-overlap pass, the next visible miss was no longer the wordmark.

The board itself still differed from `legacy/screenshots/menu-03.png`:

- the upper diagonal trench family still cut too short
- the lower diagonal staircase still read less dominant than the old menu
- the board silhouette still leaned too square compared with the stronger screenshot-era diagonal pull

This remained a snapshot geometry problem, not a shell or runtime problem.

## Landed

- `src/legacy-runtime/legacyMenuSnapshot.ts`
  - extended `diagonal-upper` by one more staircase step
  - extended `diagonal-lower` by one more staircase step

- `tests/reset/legacy-reset.test.ts`
  - added direct tile assertions for the extended diagonal coverage

## Boundaries Preserved

- `solutionPath` is unchanged
- no title/layout/button math changed
- no backdrop or material treatment changed
- no play-mode, overlay, deploy, or infra work changed

## Validation

- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`
- `npm run visual:matrix -- --preset core --skip-build true`

## Current Truth After This Pass

- the fixed menu snapshot now carries a stronger staircase pull from upper-left toward lower-right
- the menu board silhouette is slightly less square and closer to the archived diagonal read
- exact screenshot-grade menu parity is still open, but the next visible miss should now come from fresh proof rather than the previous diagonal baseline

## Next Honest Slice

- if the next miss is still raw board mass, continue in `src/legacy-runtime/legacyMenuSnapshot.ts`
- if the next miss is plate/background balance, move to `src/scenes/MenuScene.ts`
- if the next miss is attract-route timing or path behavior, move to `src/legacy-runtime/legacyDemoWalker.ts`
