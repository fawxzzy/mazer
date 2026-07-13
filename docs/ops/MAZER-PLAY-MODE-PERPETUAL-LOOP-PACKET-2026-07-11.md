# Mazer Play-Mode Perpetual Loop Packet

Date: 2026-07-11

## Scope

This pass closes the measurable polish and lifecycle-boundary proof gaps on the
`mazer-play-mode-perpetual-loop` board card. It does not change progression
formulas, maze generation semantics, Supabase data, or production deployment.

## Changes

- Play-mode staged draw and deconstruct use a 64-tick target instead of the
  menu presentation's 96-tick target. Menu cadence remains unchanged.
- Runtime-diagnostics QA movement now reports `lifecycle-locked` explicitly.
- Live play QA actively attempts a move during `goal-hold`, `deconstructing`,
  `handoff`, and `building`. Each phase must reject the move while leaving the
  player position unchanged.
- Play mode intentionally remains title-free. The cross-platform play contract
  reserves the top lane for the rank/timer HUD and Pause control, preserving
  maze and control space on phones.

## Evidence

Baseline keyboard proof on merged `main`:

- 141/141 planned route moves reached the goal.
- Explicit lifecycle sequence passed.
- Fresh seed settled.
- Post-goal lifecycle elapsed: 12069.82 ms.

Polished mobile stick proof on this branch:

- 73/73 planned route moves reached the goal.
- Sequence: `goal-hold -> deconstructing -> handoff -> building -> ready`.
- All four active movement-lock probes passed with unchanged player position.
- Fresh seed `3729110189` settled.
- Post-goal lifecycle elapsed: 9013.94 ms, 25.3% below baseline.
- Runtime remained at an estimated 60 FPS with zero recent spikes.

Side-tab proof at `http://127.0.0.1:4202`:

- Current branch loaded in authenticated mobile play mode.
- Viewport integrity reported zero overlap and zero offscreen violations.
- Lifecycle settled in `ready` with timer running and input unlocked.
- Browser console reported no warnings or errors.

## Remaining Risk

A longer multi-cycle held-stick/controller soak remains useful before closing
the broader input card at 100%. It is not a blocker for the perpetual-loop
contract because the maintained live proof now actively verifies every locked
transition boundary.

## Multi-Cycle Closeout Proof

The durable `npm run live:play-soak` harness now composes the real live-play QA
into a bounded stick/controller soak. Each cycle must reach the goal, pass the
explicit lifecycle sequence, reject movement without changing the player in
all four locked phases, settle a distinct fresh seed at world turn zero, return
to ready with input unlocked and the play timer running, keep stick controls
visible, and finish at 50 FPS or better with at most two recent spikes.

The 2026-07-13 phone run passed three cycles and 272/272 planned moves. All 12
lock probes passed, all initial and fresh seeds were distinct, every cycle
finished at 60 FPS with zero recent spikes, and average post-goal lifecycle
time was 8940.3 ms. Receipt:
`tmp/captures/mazer-live-play-soak/2026-07-13-play-loop-stick-soak/play-loop-stick-soak.summary.json`.

The maintained `npm run live:input-equivalence` matrix reuses the same live
movement and lifecycle contract for keyboard and on-screen stick input. It
compares accepted route/world-turn outcomes rather than requiring identical
gesture counts, so stick overshoot remains legal only when it lands on the
planned route and both methods still prove fresh-maze and lock invariants.
