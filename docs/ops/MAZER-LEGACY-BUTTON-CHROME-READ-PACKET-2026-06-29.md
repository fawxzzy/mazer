# Mazer Legacy Button Chrome Read Packet

## Scope

- tighten front-door button chrome only
- keep the change inside:
  - `src/legacy-runtime/legacyMenuButtonChrome.ts`
  - `src/scenes/MenuScene.ts#createButton()`
  - `tests/reset/legacy-menu-button-chrome.test.ts`
- preserve layout math, title placement, board geometry, and play behavior

## Why

After the title and diagonal silhouette packets, the next visible miss in the live side browser was the button family:

- `Exit` and `Options` were still too faint
- the `Start` plate still disappeared too easily against the board
- the legacy screenshots keep the buttons restrained, but they still read more decisively than the current pane

This was a button-chrome problem, not a layout or snapshot problem.

## Landed

- `src/legacy-runtime/legacyMenuButtonChrome.ts`
  - increased front-door button alpha and stroke strength
  - increased button type size slightly
  - restored a stronger `Start` emphasis while keeping side buttons subordinate
  - widened the stroke width from the prior ultra-thin chrome

- `tests/reset/legacy-menu-button-chrome.test.ts`
  - now guards the stronger live-read chrome floor directly

## Boundaries Preserved

- no button positions changed
- no title placement changed
- no board geometry changed
- no play-mode, overlay, deploy, or infra surface changed

## Validation

- `npm run test -- tests/reset/legacy-menu-button-chrome.test.ts`
- `npm run verify`
- `npm run visual:matrix -- --preset core --skip-build true`

## Current Truth After This Pass

- the front-door buttons survive the narrow side-browser pane more honestly
- `Start` still reads as the primary action
- exact screenshot-grade menu parity is still open, but button legibility is no longer the weakest front-door surface

## Next Honest Slice

- if the next miss is still board mass or trench geometry, return to `src/legacy-runtime/legacyMenuSnapshot.ts`
- if the next miss is shell plate/background balance, move to `src/scenes/MenuScene.ts`
- if the next miss is attract-route timing, move to `src/legacy-runtime/legacyDemoWalker.ts`
