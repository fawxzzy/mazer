# Mazer Legacy Desktop Board Dominance Layout Packet

Date: 2026-06-30
Status: landed
Segment: `Menu screenshot composition and board presentation`
Marker move: `84% -> 85%`

## Goal

Reduce the remaining "airy desktop menu" miss by making the front-door board occupy the desktop frame more like the restored legacy screenshots.

## Legacy truth

- Visual owner: `legacy/screenshots/menu-01.png` .. `menu-04.png`
- Repeated visual read:
  - the front-door board dominates the desktop frame
  - the board sits as the main composition mass
  - the buttons read as outside support chrome, not the main size anchor

## Current web owner chain

1. `src/legacy-runtime/legacyMenuLayout.ts`
2. `tests/reset/legacy-menu-layout.test.ts`
3. `src/scenes/MenuScene.ts`
4. localhost on the single maintained `4173` preview server

## Landed contract

- Desktop menu layout now gives the board more dominant space before the board-size snap resolves.
- Portrait layout rules remain unchanged.
- The change stays within layout ownership only:
  - no maze-shape rewrite
  - no material/tile-render rewrite
  - no button-chrome rewrite

## Why this counts

- The visible miss was layout-owned rather than render-owned.
- The previous desktop menu still left too much surrounding empty field compared with the legacy screenshots.
- Increasing desktop board dominance closes one bounded screenshot-composition gap without claiming final screenshot-grade parity.

## Proof

Ran clean:

- `npm run test -- tests/reset/legacy-menu-layout.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`

Visual check completed:

- reloaded the maintained in-app browser tab on `http://127.0.0.1:4173/`
- recaptured the desktop menu surface
- compared it against `legacy/screenshots/menu-04.png`

## Boundaries preserved

- No gameplay mutation
- No overlay contract change
- No new infrastructure
- No broad menu-wide polish sweep
- No claim of final screenshot-grade closure

## Result

- Desktop front-door composition is closer to the restored legacy board-first framing.
- The menu screenshot composition segment ratchets by one bounded point.
- The repo-wide legacy 1:1 completion marker moves from `84%` to `85%`.
