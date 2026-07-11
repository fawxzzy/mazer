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
