# Mazer Legacy Menu Button Scale And Anchor Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: front-door button shell

## Why this packet exists

Fresh preview proof still showed one obvious front-door miss against the archived menu screenshots: the `Exit / Start / Options` family read too small and too detached from the board, especially once the shipping matrix was regenerated on the stable preview host.

## Landed scope

- widen the front-door button width and height envelope in `src/legacy-runtime/legacyMenuLayout.ts`
- pull the `Start` button closer to the board edge without reopening title or maze geometry owners
- raise front-door button font/chrome strength in `src/legacy-runtime/legacyMenuButtonChrome.ts`
- tighten layout and chrome proof in:
  - `tests/reset/legacy-menu-layout.test.ts`
  - `tests/reset/legacy-menu-button-chrome.test.ts`

## Boundaries preserved

- no title-owner mutation
- no menu snapshot geometry mutation
- no play-mode mutation
- no deploy

## Proof plan

- `npm run test -- tests/reset/legacy-menu-layout.test.ts tests/reset/legacy-menu-button-chrome.test.ts`
- `npm run visual:matrix -- --preset core --skip-build true`

## Next honest slice

- if proof still shows the main miss in the wordmark, move to a title-only packet
- if proof still shows the main miss in the board silhouette, return to the menu snapshot owner chain
