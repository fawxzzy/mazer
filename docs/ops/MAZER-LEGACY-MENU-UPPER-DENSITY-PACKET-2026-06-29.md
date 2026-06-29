# Mazer Legacy Menu Upper Density Packet - 2026-06-29

## Scope

- tighten the fixed legacy menu snapshot where the current web board still reads too open compared to the legacy screenshots
- keep the change board-first inside `src/legacy-runtime/legacyMenuSnapshot.ts`
- extend the durable system map so the new silhouette branches stay editable by name

## Why

The current pass-2 menu snapshot still leaves the upper-left and upper-mid board plate too hollow compared with `legacy/screenshots/menu-03.png` and `legacy/screenshots/menu-04.png`.

The biggest visible miss is not shell polish. It is maze-mass density:

- the legacy board has a more carved upper-left corner
- the title sits over more trench mass beneath and around the wordmark
- the mid-left interior shelf is still thinner than the legacy front door

## Landed change

Added three fixed-snapshot branch groups:

- `upper-left-lattice`
- `title-underlay-band`
- `mid-left-shelf`

These stay additive:

- no solution-path rewrite
- no active-play generator rewrite
- no overlay or shell contract change

## Proof updates

- `tests/reset/legacy-reset.test.ts` now asserts direct tile coverage for the three new branch groups
- `docs/system-map.md` now maps the new branch ids to their visible board roles

## Verification

Run after landing:

- `npm run test -- tests/reset/legacy-reset.test.ts tests/reset/legacy-menu-layout.test.ts`
- `npm run visual:matrix -- --preset core --skip-build true`
- `npm run edge:live -- --skip-build true --headless true --run core-only-watch`

## Current truth

This is still a bounded density pass, not a 1:1 completion claim.

What it improves:

- upper-left carved mass
- under-title trench density
- left-middle interior shelf weight

What remains open:

- further board silhouette parity if visual proof still shows specific misses against `menu-03.png` and `menu-04.png`
- any later shell/title/frame adjustments that are separate from board geometry
