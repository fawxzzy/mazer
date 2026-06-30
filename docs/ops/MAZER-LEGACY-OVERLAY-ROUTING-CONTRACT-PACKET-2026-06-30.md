# Mazer Legacy Overlay Routing Contract Packet

Date: 2026-06-30
Lane: Mazer pass 2 parity
Module: overlay family proof hardening

## Why this packet exists

The restored Unreal overlay widgets do not replace their parents when nested surfaces open.

Instead:

- `Options` can open `Features` or `Game Modes`
- `Pause` can open `Features`
- nested widgets remove themselves on `Back`
- the parent surface remains the truthful return target

The web runtime already behaved this way, but the return routing still lived as scene-local branching instead of one explicit legacy-owned contract.

## Landed scope

- add `src/legacy-runtime/legacyOverlayRouting.ts`
- encode explicit nested overlay open/return routing
- route `MenuScene.openNestedOverlay(...)` and `MenuScene.handleBackAction()` through the explicit contract
- add proof in:
  - `tests/reset/legacy-overlay-routing.test.ts`
  - `tests/reset/legacy-reset.test.ts`
- resync current truth, parity matrix, and system map docs

## Boundaries preserved

- no marker ratchet
- no generation rewrite
- no overlay layout rewrite
- no HUD rewrite
- no deploy

## Proof result

This packet closes the remaining nested-overlay verification seam inside the already-maxed overlay family.

It does not move the repo-wide marker because the overlay segment was already fully awarded at `14 / 14`.

## Next honest slice

The next bounded execution-ready seam is back outside the overlay family:

- staged generation implementation
- demo backtracking/reset exactness
- final menu material/composition review
