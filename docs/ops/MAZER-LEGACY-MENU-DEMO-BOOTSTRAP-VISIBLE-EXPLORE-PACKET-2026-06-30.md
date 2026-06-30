# Mazer Legacy Menu Demo Bootstrap Visible Explore Packet

Date: 2026-06-30
Lane: legacy Unreal truth -> web app reset/port
Module: demo route, backtracking, and pacing
Marker: `88% -> 89%`

## Why this packet existed

The fixed front-door menu demo could still boot into a weak first impression:

- `goal-hold`
- `reset-hold`
- or an under-informative spawn state

That was no longer a board-geometry problem.
It was a bounded menu-demo bootstrap problem inside the demo owner chain.

## Landed scope

- tightened `createLegacyMenuDemoBootstrap()` in `src/legacy-runtime/legacyMenuDemoLifecycle.ts`
- for the fixed snapshot lane, bootstrap now continues until it settles into a visible `explore` pose instead of stopping in `goal-hold`, `reset-hold`, or `spawn`
- extended `tests/reset/legacy-menu-demo-lifecycle.test.ts` to require that front-door bootstrap result

## Boundaries preserved

- no menu snapshot geometry mutation
- no board material mutation
- no title/layout/button mutation
- no play-maze mutation
- no infra/deploy mutation

## Proof

Commands run:

- `npm run test -- tests/reset/legacy-menu-demo-lifecycle.test.ts`
- `npm run lint`
- `npm run build`

Live localhost proof:

- reloaded the maintained preview tab at `http://127.0.0.1:4173/?runtimeDiagnostics=1`
- runtime diagnostics changed from a weak `reset-hold` first pose to:
  - `demo explore cue explore mistakes on cursor 51`

## Marker decision

Marker ratchet is valid here.

Reason:

- the fixed front-door demo bootstrap changed real visible behavior
- the new behavior is repo-tested and localhost-proven
- the change widens proof-backed adoption in the `Demo route, backtracking, and pacing` segment
- remaining legacy reset/backtrack exactness still keeps that segment partial

## Current truthful result

- repo-wide marker: `89%`
- demo route segment: `9 -> 10`
- front-door live preview now starts from a stronger visible explore state

## Next honest slice

- if the next visible miss is still demo behavior, continue in `src/legacy-runtime/legacyMenuDemoLifecycle.ts` / `src/domain/ai/demoWalker.ts`
- otherwise return to the next named menu-board screenshot mismatch instead of broad polish
