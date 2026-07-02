# Mazer Legacy Desktop Button Support Chrome Packet

Date: 2026-06-30
Status: landed
Segment: `Menu screenshot composition and board presentation`
Marker move: `86% -> 87%`

## Goal

Reduce the remaining front-door support-chrome miss by making the desktop `Exit` / `Start` / `Options` button boxes more compact, less dominant, and more inward, closer to the restored legacy screenshots.

## Legacy truth

- Visual owner: `legacy/screenshots/menu-01.png` .. `menu-04.png`
- Art-direction rule: `compact rectangular button outlines, sparse typography, no dense chrome`
- Repeated visual read:
  - menu buttons sit low outside the board frame
  - support boxes are visible but restrained
  - the center `Start` box does not dominate the lower composition

## Current web owner chain

1. `src/legacy-runtime/legacyMenuLayout.ts`
2. `src/legacy-runtime/legacyMenuButtonChrome.ts`
3. `tests/reset/legacy-menu-layout.test.ts`
4. `tests/reset/legacy-menu-button-chrome.test.ts`
5. `src/scenes/MenuScene.ts`
6. localhost on the single maintained `4173` preview server

## Landed contract

- Desktop side buttons now sit slightly more inward.
- Desktop side and center button boxes are narrower.
- Front-door button chrome now reads lighter and sparser:
  - lower base fill alpha
  - lower stroke emphasis
  - slightly smaller, less heavy typography
- Portrait layout rules remain unchanged.

## Why this counts

- After the board-dominance and title-lockup packets, the next visible miss was button-owned rather than board-owned or backdrop-owned.
- The prior desktop support chrome still read too wide and slightly too loud compared with the legacy screenshots.
- This packet closes one bounded screenshot-composition miss without claiming final backdrop/material exactness.

## Proof

Ran clean:

- `npm run test -- tests/reset/legacy-menu-button-chrome.test.ts`
- `npm run test -- tests/reset/legacy-menu-layout.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`

Visual check completed:

- reloaded the maintained in-app browser tab on `http://127.0.0.1:4173/`
- recaptured the desktop menu surface
- compared the new support-chrome read against the prior local capture and `legacy/screenshots/menu-04.png`

## Boundaries preserved

- No gameplay mutation
- No overlay contract change
- No title-owner rewrite
- No maze-shape rewrite
- No backdrop-owner rewrite
- No broad menu-wide polish sweep

## Result

- Desktop button support chrome is closer to the restored legacy screenshot treatment.
- The menu screenshot composition segment ratchets by one additional bounded point.
- The repo-wide legacy 1:1 completion marker moves from `86%` to `87%`.
