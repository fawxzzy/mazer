# Mazer Player Input And Movement Correctness Packet

Date: 2026-07-11
Branch: `codex/player-input-movement-correctness`
Status: implementation and local proof complete; production unchanged

## Scope

- ensure one accepted arrow-key tap produces one visible movement step
- keep diagonal commands on the existing one-cardinal-step planner
- prevent simultaneous held directions from multiplying keyboard repeat cadence
- publish repeat-gate diagnostics for live browser proof

## Root Cause

The scene delayed first movement for `50ms` so near-simultaneous directions could combine. A normal browser keyboard press sends keydown and keyup immediately. Keyup cleared the held flag before the delayed resolver ran, so a valid tap could produce zero steps. Held repeat events also bypassed the shared input gate and could run at browser-specific frequency; alternating held axes could multiply that rate.

## Implementation

- Keyup flushes one accepted pending movement before clearing the released direction.
- `HumanInputRepeatGate` now shares one timestamp across movement directions while retaining independent control-action behavior.
- The scene applies the active movement-speed repeat interval at runtime instead of rebuilding the gate.
- Pause, menu, reset, touch takeover, and focus-loss cleanup reset the keyboard repeat gate with the existing input buffer.
- Runtime diagnostics expose keyboard accepted, dropped, merged, last-action, and active repeat-interval fields.

## Proof

- Focused keyboard, play-step, reset, and render tests: `102` passed.
- TypeScript: `npm run lint` passed.
- Before fix: `player-input-keyboard-gate` failed at planned move `0`; expected `(2,15)`, actual `(1,15)`, consumed moves `0`.
- After fix: `player-input-keyboard-gate-fixed` completed `174/174` planned legal keyboard moves, reached the goal, had no failed step or overshoot, and reported approximately `60 FPS` with zero recent spikes.
- Unit proof covers alternating held directions sharing one repeat cadence and runtime movement-speed interval overrides.
- Full closure verification: `npm run verify` passed `42` test files / `325` tests and produced the production bundle successfully.

## Safety

- No maze topology, collision, progression, auth, Supabase, or receipt behavior changed.
- No production deployment or Vercel promotion.
- `tests/ai/demo-walker.test.ts` remained untouched.
