# Mazer Legacy Menu Snapshot Branch Map + Density Packet

## Scope

- push the fixed menu snapshot a little closer to the legacy screenshot massing
- make the snapshot's named branch groups explicit in the durable system map
- keep play-mode runtime truth, layout math, and menu shell work separated from menu-only geometry

## Why

After the plate/palette realignment pass, the menu front door was reading closer to the old board material, but the geometry still had a weak point:

- some top-center and mid-left areas still read too hollow
- the lower-right approach still needed a slightly heavier trench family
- future edits to `legacyMenuSnapshot.ts` were still easy to make blindly because the branch ids were not durably mapped

The next highest-value move was therefore not broad shell polish again. It was:

- add a few bounded branch groups to the fixed menu snapshot
- document exactly which named branch owns which visible silhouette area

## Landed

- `src/legacy-runtime/legacyMenuSnapshot.ts`
  - added `title-trench`
  - added `left-interior-drop`
  - added `lower-floor-trench`
  - added `right-inner-pocket`

- `tests/reset/legacy-reset.test.ts`
  - added direct tile assertions for the new fixed-snapshot branch coverage

- `docs/system-map.md`
  - added a branch-id-to-role map for the fixed menu snapshot
  - recorded the rule that screenshot density edits should target the matching named branch before touching `solutionPath`

## Boundaries Preserved

- `solutionPath` is unchanged in this packet
- menu-only snapshot geometry remains separate from generated play mazes
- menu screenshot parity work still routes through `legacyMenuSnapshot.ts` first
- no play-mode behavior, overlay routing, or infra surface changed

## Validation

- `npm run test -- tests/reset/legacy-reset.test.ts tests/reset/legacy-menu-layout.test.ts`
- `npm run lint`
- `npm run visual:matrix -- --preset core --skip-build true`

Latest layout proof:

- `tmp/captures/mazer-layout-matrix/2026-06-29T09-18-56-201Z`

## Current Truth After This Pass

- the fixed menu snapshot carries a little more top-center, mid-left, and lower-right density
- the repo now has a durable branch-level owner map for menu geometry work
- future 1:1 geometry tweaks should be faster and less error-prone because the branch ids are no longer opaque

## Still Open

- exact menu board silhouette still is not fully 1:1 with `menu-03.png` and `menu-04.png`
- title overlap and some inner trench spacing still need screenshot-directed judgment
- legacy-exact attract-route semantics remain a separate lane from this density pass

## Next Honest Slice

- if the next visible miss is still raw board shape, continue in `src/legacy-runtime/legacyMenuSnapshot.ts`
- if the next visible miss is title overlap or outer frame balance, return to `src/legacy-runtime/legacyMenuLayout.ts` and `src/scenes/MenuScene.ts`
- if the next visible miss is attract-route timing/behavior, move to `src/legacy-runtime/legacyDemoWalker.ts`
