# Mazer Legacy Desktop Title Lockup Tightening Packet

Date: 2026-06-30
Status: landed
Segment: `Menu screenshot composition and board presentation`
Marker move: `85% -> 86%`

## Goal

Reduce the remaining desktop title-lockup miss by making the front-door wordmark read smaller, higher, and less heavy over the board, closer to the restored legacy screenshots.

## Legacy truth

- Visual owner: `legacy/screenshots/menu-01.png` .. `menu-04.png`
- Repeated visual read:
  - the desktop `Mazer` wordmark overlaps the board deeply
  - but it does not dominate the board as heavily as the previous web title lockup
  - the wordmark sits slightly higher and reads cleaner against the tile field

## Current web owner chain

1. `src/legacy-runtime/legacyMenuLayout.ts`
2. `src/legacy-runtime/legacyMenuTitle.ts`
3. `tests/reset/legacy-menu-layout.test.ts`
4. `tests/reset/legacy-menu-title.test.ts`
5. `src/scenes/MenuScene.ts`
6. localhost on the single maintained `4173` preview server

## Landed contract

- Desktop title vertical placement is slightly higher.
- Desktop title presentation is slightly slimmer and less heavy:
  - reduced font scaling
  - reduced shadow depth
  - slightly lighter desktop alpha treatment
- Portrait title rules remain unchanged.

## Why this counts

- After the board-dominance packet, the next visible miss was title-owned, not board-geometry-owned.
- The previous desktop wordmark still read too oversized and low relative to the legacy screenshots.
- This packet closes one bounded screenshot-composition miss without claiming final title/button/backdrop exactness.

## Proof

Ran clean:

- `npm run test -- tests/reset/legacy-menu-title.test.ts`
- `npm run test -- tests/reset/legacy-menu-layout.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`

Visual check completed:

- reloaded the maintained in-app browser tab on `http://127.0.0.1:4173/`
- recaptured the desktop menu surface
- compared the new title lockup against the prior local capture and `legacy/screenshots/menu-04.png`

## Boundaries preserved

- No gameplay mutation
- No overlay contract change
- No button-chrome rewrite
- No maze-shape rewrite
- No broad menu-wide polish sweep

## Result

- Desktop title lockup is closer to the restored legacy screenshot treatment.
- The menu screenshot composition segment ratchets by one additional bounded point.
- The repo-wide legacy 1:1 completion marker moves from `85%` to `86%`.
