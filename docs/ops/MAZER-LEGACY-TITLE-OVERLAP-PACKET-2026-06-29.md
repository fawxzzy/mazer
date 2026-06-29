# Mazer Legacy Title Overlap Packet

## Scope

- tighten the front-door title lockup only
- keep the change inside the title owner chain:
  - `src/legacy-runtime/legacyMenuLayout.ts`
  - `src/legacy-runtime/legacyMenuTitle.ts`
  - `src/scenes/MenuScene.ts`
- do not reopen button chrome, snapshot geometry, play-mode logic, or overlay work

## Why

Fresh menu proof still showed one obvious legacy miss:

- the `Mazer` wordmark was sitting too high
- the wordmark was too small and too faint
- the live menu still read like a small label above the board instead of the deeper board-overlap lockup from `legacy/screenshots/menu-03.png`

This was a title-contract problem, not a maze-shape problem.

## Landed

- `src/legacy-runtime/legacyMenuLayout.ts`
  - lowered the menu title anchor deeper into the board

- `src/legacy-runtime/legacyMenuTitle.ts`
  - increased the title scale
  - strengthened the shadow offset
  - raised the title/shadow alpha so the lockup reads closer to the archived screen

- `tests/reset/legacy-menu-layout.test.ts`
  - now guards the deeper title-overlap band

- `tests/reset/legacy-menu-title.test.ts`
  - now guards the larger, more legible title treatment

## Boundaries Preserved

- no button spacing math changed
- no menu snapshot geometry changed
- no demo route or play-mode behavior changed
- no infra or deploy surface changed
- no ATLAS-root packet reopened from this owner-side pass

## Validation

- `npm run test -- tests/reset/legacy-menu-layout.test.ts tests/reset/legacy-menu-title.test.ts`
- `npm run verify`
- `npm run visual:matrix -- --preset core --skip-build true`

## Current Truth After This Pass

- the menu title now sits materially deeper over the board
- the title lockup reads closer to the larger screenshot-era overlay instead of a thin shell label
- exact screenshot-grade menu parity is still open, but the next visible miss should now be judged after this stronger overlap baseline

## Next Honest Slice

- if the next miss is still board silhouette or trench mass, return to `src/legacy-runtime/legacyMenuSnapshot.ts`
- if the next miss is still plate/background balance, stay in `src/scenes/MenuScene.ts`
- if the next miss is attract-route timing rather than composition, move to `src/legacy-runtime/legacyDemoWalker.ts`
