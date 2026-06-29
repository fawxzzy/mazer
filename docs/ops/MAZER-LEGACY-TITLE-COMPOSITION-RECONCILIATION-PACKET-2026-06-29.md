# Mazer Legacy Title Composition Reconciliation Packet

Date: 2026-06-29
Lane: Mazer pass 2 menu parity
Module: title lockup

## Why this packet exists

After the board, backdrop, and shell passes, the strongest remaining menu drift was still the wordmark composition. The title was closer than before, but the live front door still read slightly too faint and slightly too detached from the board compared with the legacy screenshot truth.

## Landed scope

- enlarge the wordmark one more step
- raise title/shadow opacity modestly
- pull the title anchor slightly deeper into the board overlap band
- keep the work inside the title owner chain only

## Touched surfaces

- `src/legacy-runtime/legacyMenuTitle.ts`
- `src/legacy-runtime/legacyMenuLayout.ts`
- `tests/reset/legacy-menu-title.test.ts`
- `tests/reset/legacy-menu-layout.test.ts`

## Boundaries preserved

- no button chrome mutation
- no board silhouette mutation
- no slab/frame material mutation
- no demo-route or play-state mutation

## Proof plan

- `npm run test -- tests/reset/legacy-menu-layout.test.ts tests/reset/legacy-menu-title.test.ts`
- `npm run verify`
- live localhost inspection in the in-app browser

## Next honest slice

If this packet lands cleanly, the next truthful move is likely no longer menu shell polish by default. The next lane should be chosen explicitly between:

- demo route / pacing exactness
- active play HUD parity
- final screenshot-grade menu review
