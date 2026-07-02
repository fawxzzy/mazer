# Mazer Legacy Portrait Title And Button Gap Packet

## Scope

- tighten the portrait-only front-door composition shown in the side browser
- keep the change inside layout/title owners instead of widening board geometry or play behavior
- make the portrait fit contract explicit in repo-owned tests

## Why

After the under-title silhouette packet, the next visible miss moved from board mass to portrait composition:

- the portrait title was still too inflated and too low against the board
- the `Start` button still read too attached to the board edge
- the side-browser phone-tall preview needed a cleaner front-door gap without reopening desktop shell work

## Landed

- `src/legacy-runtime/legacyMenuLayout.ts`
  - increased the portrait board-to-`Start` gap
  - raised the portrait title anchor inside the board

- `src/legacy-runtime/legacyMenuTitle.ts`
  - reduced portrait wordmark scale so the mobile front door stays closer to the desktop legacy composition

- `tests/reset/legacy-menu-layout.test.ts`
  - now asserts a minimum portrait gap between board and `Start`
  - now asserts a stronger portrait title band

- `tests/reset/legacy-menu-title.test.ts`
  - now asserts the smaller portrait title envelope directly

## Boundaries Preserved

- no menu snapshot geometry changed in this packet
- no scene render/material constants changed in this packet
- no overlay, play-mode, deploy, or infra surfaces changed

## Validation

- `npm run test -- tests/reset/legacy-menu-layout.test.ts tests/reset/legacy-menu-title.test.ts tests/reset/legacy-reset.test.ts tests/reset/legacy-menu-button-chrome.test.ts`
- `npm run lint`
- `npm run build`
- `npm run visual:matrix -- --preset core --skip-build true`

Latest proof artifact:

- `tmp/captures/mazer-layout-matrix/2026-06-29T19-28-34-309Z`

## Current Truth After This Pass

- the side-browser portrait preview is cleaner and less cramped
- the portrait title no longer swells as far into the board mass
- `Start` now has a more deliberate board separation on narrow panes

## Next Honest Slice

- if the next visible miss is still menu geometry, return to `src/legacy-runtime/legacyMenuSnapshot.ts`
- if the next visible miss is shell plate/material/background balance, move to `src/scenes/MenuScene.ts`
- if the next visible miss is attract-route pacing, move to `src/legacy-runtime/legacyDemoWalker.ts`
