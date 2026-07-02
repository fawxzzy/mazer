# Mazer Legacy Menu Demo Cadence Reconciliation Packet

Date: 2026-06-29
Lane: Mazer pass 2 menu parity
Module: demo route / pacing

## Why this packet exists

After the shell lane tightened, the strongest remaining front-door drift moved back to attract behavior. The fixed menu snapshot was still borrowing the slower rebuilt demo cadence instead of using the closer Unreal-derived timing values already documented in `docs/legacy/tuning.md`.

## Landed scope

- keep the change inside `src/legacy-runtime/legacyDemoWalker.ts`
- give the fixed menu snapshot its own cadence override based on the legacy timing notes
- push the deterministic preroll slightly deeper so the first visible route read stays biased toward the lower-right legacy composition

## Boundaries preserved

- no solver-path logic rewrite
- no generic generated-maze demo cadence rewrite
- no shell/title/button/layout mutation
- no play-mode mutation

## Proof plan

- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`
- live localhost inspection in the in-app browser

## Next honest slice

If this packet lands cleanly, the next truthful lane should be chosen between:

- active play HUD parity
- final screenshot-grade front-door review
- deeper demo-route semantic parity beyond cadence only
