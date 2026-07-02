# Mazer Legacy Menu Silhouette Under-Title Density Packet

## Scope

- keep the active packet inside the fixed menu snapshot owner chain only
- tighten the under-title and center-left menu silhouette toward the archived screenshots
- preserve scene layout math, button chrome, and play-mode behavior

## Why

After the earlier title and button modules landed, the next visible miss was still raw board geometry:

- the title plate still read too hollow under the wordmark
- the center-left interior mass was still thinner than the legacy screenshots
- the inner-right pocket still read too sparse against the denser screenshot-era silhouette

This was still a snapshot problem, not a shell or runtime problem.

## Landed

- `src/legacy-runtime/legacyMenuSnapshot.ts`
  - widened `title-underlay-band` so the under-title plate carries more trench mass
  - extended `left-interior-drop` to keep the center-left from reading too hollow
  - extended `right-inner-pocket` to add a little more inner-right silhouette weight

- `tests/reset/legacy-reset.test.ts`
  - added direct tile assertions for the widened snapshot coverage

## Boundaries Preserved

- `solutionPath` is still unchanged
- menu-only snapshot work remains separate from generated play mazes
- no title/layout/button math was widened by this packet
- no overlay, deploy, or infra work happened here

## Validation

- `npm run test -- tests/reset/legacy-reset.test.ts tests/reset/legacy-menu-layout.test.ts tests/reset/legacy-menu-title.test.ts tests/reset/legacy-menu-button-chrome.test.ts`
- `npm run lint`
- `npm run build`
- `npm run visual:matrix -- --preset core --skip-build true`

Latest proof artifact:

- `tmp/captures/mazer-layout-matrix/2026-06-29T19-21-20-087Z`

## Current Truth After This Pass

- the live front door now carries more visible maze mass beneath the title and through the center-left plate
- the side-browser preview at `http://127.0.0.1:4173/` is aligned to the current branch build again
- exact 1:1 parity is still open, but the next honest choice can now be made from current proof instead of stale preview output

## Next Honest Slice

- if the next visible miss is still raw maze mass, continue in `src/legacy-runtime/legacyMenuSnapshot.ts`
- if the next visible miss is title overlap, board fit, or button spacing on portrait, move to `src/legacy-runtime/legacyMenuLayout.ts` and `src/scenes/MenuScene.ts`
