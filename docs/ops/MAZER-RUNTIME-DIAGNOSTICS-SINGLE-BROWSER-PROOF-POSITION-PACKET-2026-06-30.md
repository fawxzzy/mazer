# Mazer Runtime Diagnostics Single-Browser Proof Position Packet

Date: 2026-06-30
Lane: Mazer pass 2 parity
Module: runtime diagnostics / maintained browser proof ergonomics

## Why this packet exists

The repo already had a truthful runtime-diagnostics DOM surface on the single maintained `4173` preview server.

What still remained awkward in live proof:

- the right-pane browser is often narrow by default
- temporary desktop parity checks still happen on that same tab
- on desktop-width proof, the diagnostics panel sat over the `Exit` button and made front-door inspection noisier than it needed to be

That was not a gameplay bug or a legacy-parity gap.
It was a proof-surface ergonomics miss inside the maintained single-browser workflow.

## Landed scope

- add viewport-aware runtime diagnostics panel placement in `src/scenes/menuRuntimeDiagnostics.ts`
- prefer upper-left gutter placement on desktop-sized proof
- keep a compact bottom fallback on narrow viewports
- refresh panel CSS on reuse so placement stays correct after viewport changes
- add direct placement proof in `tests/scenes/menu-runtime-diagnostics.test.ts`
- resync proof workflow notes in:
  - `docs/current-truth.md`
  - `docs/system-map.md`

## Contract now explicit

For `runtimeDiagnostics=1` on the single maintained `http://127.0.0.1:4173/` browser tab:

1. narrow/default side-pane proof may keep the diagnostics panel near the lower edge
2. temporary desktop-width proof should move the diagnostics panel into the upper-left gutter
3. viewport changes must update the panel placement without requiring a second proof browser

## Boundaries preserved

- no legacy 1:1 marker ratchet
- no gameplay mutation
- no demo-route rewrite
- no menu geometry rewrite
- no deploy
- no extra localhost server

## Proof

Ran clean:

- `npm run test -- tests/scenes/menu-runtime-diagnostics.test.ts`
- `npm run lint`
- `npm run build`

## Ratchet

No percent ratchet.

Reason:

- this improves correctness and usability of the maintained proof surface
- it does not close a weighted legacy behavior or screenshot-parity gap by itself

## Next honest slice

- return to one bounded parity owner surface:
  - `src/legacy-runtime/legacyMenuSnapshot.ts` if the next visible miss is still screenshot-grade board geometry
  - `src/legacy-runtime/legacyMenuDemoLifecycle.ts` / `src/domain/ai/demoWalker.ts` if the next visible miss is still demo reset/backtrack exactness
