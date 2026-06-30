# Mazer Legacy Front-Door Demo Recovery Lane Packet

Date: 2026-06-30
Lane: Mazer pass 2 menu parity
Segment: `Demo route, backtracking, and pacing`
Module: `demo route / pacing`
Status: landed
Marker: `87% -> 88%`

## Why this packet exists

The strongest remaining non-visual front-door gap was in the fixed menu snapshot itself:

- the canonical menu demo still suppressed runner mistakes
- that meant the front-door attract loop was closer to a solver-only showcase than the legacy AI lane
- legacy truth says menu demo behavior should include branch choice, backtracking, and AI-only reset semantics

This packet restores that missing behavior only for the fixed front-door snapshot lane.

## Landed scope

- stop overriding `enableRunnerMistakes` to `false` in `src/legacy-runtime/legacyDemoWalker.ts`
- keep the deterministic snapshot cadence and deep preroll contract
- add snapshot-lane proof in `tests/reset/legacy-menu-demo-lifecycle.test.ts` that the fixed menu maze now surfaces:
  - `dead-end`
  - `backtrack`
  - `reacquire`
- update the reset-lane snapshot-config guard in `tests/reset/legacy-reset.test.ts`

## Boundaries preserved

- no menu layout math change
- no board material or backdrop change
- no button/title change
- no menu snapshot geometry rewrite
- no active-play behavior change
- no deploy

## Proof

- `npm run test -- tests/reset/legacy-menu-demo-lifecycle.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run test -- tests/ai/demo-walker.test.ts`
- localhost inspection on the maintained `http://127.0.0.1:4173/` preview surface

## Ratchet result

This packet earns a bounded marker ratchet:

- `87% -> 88%`

Reason:

- one named completion-marker segment changed with proof
- the active front-door demo no longer suppresses a real legacy-owned behavior class
- the change is in the actual owner chain for demo route/parity, not adjacent polish

## Remaining truth

This does not close demo parity completely:

- final front-door attract-route exactness is still open
- final backtrack/reset timing exactness is still open
- the menu still does not claim full screenshot-grade or behavior-grade 1:1 closure

## Next honest slice

If parity work continues from here, the next bounded packet should be either:

- one final `demo route / pacing` exactness pass aimed at reset/backtrack timing, or
- stand down from demo behavior and reopen a different segment only when a new exact miss is named
