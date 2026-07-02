# Mazer Legacy Demo Recovery Cue Pacing Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: demo route / pacing

## Why this packet exists

The demo walker already computed branch-recovery cue overrides and exposed cadence tiers for branch commit, dead-end, backtrack, and reacquire beats.

But the live walker state was still collapsing most recovery motion back to plain `explore`, and non-goal motion still defaulted to `exploreStepMs`.

That left the route semantically closer than before, but not truthfully paced or signaled.

## Landed scope

- keep the packet inside `src/domain/ai/demoWalker.ts`
- thread runner-plan cue overrides into live walker state emission
- use cue-specific segment delays for:
  - branch commit
  - dead-end reflection
  - backtrack motion
  - reacquire return
- update `resolveDemoWalkerViewFrame()` so presentation-facing playback surfaces expose the same recovery cues instead of flattening them
- add focused cue/delay tests in `tests/ai/demo-walker.test.ts`

## Boundaries preserved

- no maze generation rewrite
- no menu shell/layout mutation
- no play-mode movement mutation
- no HUD mutation

## Proof plan

- `npm run test -- tests/ai/demo-walker.test.ts`
- `npm run test -- tests/reset/legacy-menu-demo-lifecycle.test.ts`
- `npm run edge:live -- --skip-build true --headless true --run core-only-watch`
- `npm run verify`

## Ratchet intent

This packet qualifies for a bounded `+1` on the demo route / backtracking / pacing segment if recovery cues and cue-specific delays become live repo truth without widening the packet beyond the demo owner chain.

## Ratchet result

This packet earns the bounded demo-route ratchet.

- `70% -> 71%`

Reason:

- one named completion-marker segment changed with proof
- recovery cues no longer collapse back to plain `explore`
- branch commit, dead-end, backtrack, and reacquire now carry their own delay contracts
- the packet stayed inside the demo owner chain

## Next honest slice

The next truthful lane should move to either:

- active-play HUD final exactness, or
- generation/reset staged lifecycle exactness
