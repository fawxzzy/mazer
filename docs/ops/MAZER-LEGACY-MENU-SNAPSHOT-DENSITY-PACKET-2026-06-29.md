# Mazer Legacy Menu Snapshot Density Packet

## Scope

- densify the fixed menu-only snapshot silhouette toward the archived screenshots
- keep play-mode generation, overlay behavior, and menu shell ownership stable
- extend the system map so future maze-shape edits follow the full render chain

## Why

The live menu shell pass improved title/frame/button composition, but the board itself still read too open compared with `legacy/screenshots/menu-02.png` through `menu-04.png`.

The highest-value remaining miss was inside the fixed menu snapshot:

- the top third still lacked enough horizontal mass
- the upper-left chamber still felt too empty
- the center and lower-right board areas still read more like a sparse generated maze than the archived menu silhouette

## Landed

- `src/legacy-runtime/legacyMenuSnapshot.ts`
  - added denser `upper-ridge`, `upper-left-pocket`, `center-pocket`, `lower-center-loop`, and `right-lower-notch` branches
  - kept the existing solution path intact while widening the grayscale maze mass around it

- `tests/reset/legacy-reset.test.ts`
  - added direct tile assertions for the new branch coverage so the fixed snapshot cannot thin out silently

- `docs/system-map.md`
  - records the full menu-board render chain from blueprint -> grid -> scene render -> direct proof

## Boundaries Preserved

- menu mode still uses the fixed legacy snapshot lane
- play mode still uses the generated solvable maze lane
- one active overlay at a time is unchanged
- the shell pass remains additive; this packet only widens the board silhouette owner
- no deploy, infra, or non-menu runtime widening happened here

## Validation

- `npm run test -- tests/reset/legacy-menu-layout.test.ts tests/reset/legacy-reset.test.ts`
- `npm run build`
- `npm run visual:matrix -- --preset core --skip-build true`

## Current Truth After This Pass

- the fixed menu snapshot now carries more of the dense screenshot-era board mass
- the repo's durable edit map now makes the front-door board pipeline explicit end to end
- exact 1:1 screenshot closure is still open, but the next remaining gaps should now be judged against live proof instead of inferred from code alone

## Next Honest Slice

- compare the refreshed live preview and matrix artifacts directly against `menu-01.png` .. `menu-04.png`
- if a specific miss remains, choose the next owner surface by type:
  - board geometry -> `legacyMenuSnapshot.ts`
  - shell/title/button composition -> `MenuScene.ts` / `legacyMenuLayout.ts`
