# Mazer Legacy Title Scale And Overlap Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: title lockup

## Why this packet exists

After the refreshed shipping matrix and button-anchor pass, the front door still diverged most visibly in the wordmark itself. Compared with `legacy/screenshots/menu-03.png`, the current title still read a little too small, too faint, and slightly too detached from the board overlap band.

## Landed scope

- enlarge the menu wordmark in `src/legacy-runtime/legacyMenuTitle.ts`
- raise title and shadow opacity
- deepen the title anchor slightly in `src/legacy-runtime/legacyMenuLayout.ts`
- tighten proof in:
  - `tests/reset/legacy-menu-title.test.ts`
  - `tests/reset/legacy-menu-layout.test.ts`

## Boundaries preserved

- no button chrome mutation
- no menu snapshot geometry mutation
- no play-mode mutation
- no deploy

## Proof plan

- `npm run test -- tests/reset/legacy-menu-layout.test.ts tests/reset/legacy-menu-title.test.ts`
- `npm run visual:matrix -- --preset core --skip-build true`
- `npm run verify`

## Next honest slice

- if proof still says the board silhouette is the visible miss, return to the menu snapshot owner chain
- if proof still says title/button/menu geometry are close enough, switch out of menu shell polish and choose the next runtime parity lane explicitly
