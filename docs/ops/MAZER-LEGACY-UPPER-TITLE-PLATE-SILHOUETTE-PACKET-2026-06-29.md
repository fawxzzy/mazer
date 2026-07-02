# Mazer Legacy Upper Title Plate Silhouette Packet

Date: 2026-06-29
Lane: Mazer pass 2 menu parity
Module: board silhouette
Slice: upper title plate only

## Why this packet exists

After the title and button passes, the live menu still diverged most obviously in the upper board mass behind and around the wordmark. The phone and narrow-browser views still read too open and too flat compared with the legacy screenshot truth.

## Landed scope

- tighten the upper title plate silhouette only
- keep the change inside `src/legacy-runtime/legacyMenuSnapshot.ts`
- increase top/title branch density without reopening layout math, button chrome, or board material

## Touched branch families

- `top-spine`
- `upper-left-lattice`
- `title-trench`
- `title-underlay-band`

## Boundaries preserved

- no menu layout change
- no title presentation math change
- no button chrome change
- no play-maze mutation
- no demo-route pacing mutation

## Proof plan

- `npm run test -- tests/reset/legacy-reset.test.ts`
- live localhost inspection in the in-app browser
- if stable, follow with repo verify before closure

## Next honest slice

If this packet lands cleanly, the next bounded menu-silhouette slice should stay in the board family and move either:

- upper-left frame density, or
- right-side goal mass
