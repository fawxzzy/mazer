# Mazer Menu Dense Slab Material Hold Packet

Date: 2026-07-02

## Scope

This packet tightens one menu visual module: static board material and tile read.

The legacy screenshots show a dense gray slab/corridor maze with hard relief, not a thin wireframe over a near-black panel. The current browser surface was closer than the early reset shell, but the maintained side-browser view still read too dark and thin at small tile sizes.

## Landed Change

- Increased menu-only wall/slab mass brightness.
- Increased menu-only path edge contrast and path core brightness.
- Increased the residual wall-grid material texture.
- Reduced menu trench insets for medium/large tiles.
- Made tiny live-browser menu tiles render dense instead of hairline-thin.

This does not change:

- maze topology,
- menu AI route planning,
- active play movement,
- active play rendering,
- overlay behavior,
- deploy or live resources.

## Proof

- `tests/scenes/menu-render-frame.test.ts` now covers the denser render ratios and tiny-tile density behavior.
- The maintained in-app browser was reloaded on the single `4173` preview tab and checked in desktop and mobile viewport overrides.

## Marker Decision

The legacy 1:1 marker remains at `93%`.

This improves the visible board-material direction, but it does not close the final screenshot-grade visual composition gap. Exact legacy silhouette, title-over-board overlap, final relief, button composition, and player/trail treatment remain open.

## Boundaries

- No key rotation.
- No deploy.
- No live resource mutation.
- No Supabase or Vercel app-resource mutation.
