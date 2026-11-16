# Mazer World Turn Contract

## Ownership

`WorldTurnHost` is the scene-consumable gameplay-mutation boundary and owns one
`WorldTurnSystem`. Player movement, enemy movement, projectiles, pickups, item
effects, duration expiry, and collisions must enter through one admitted turn
command before those systems are wired into the shipping scene.

## Admission

- A `player-move` command advances the world only when the player-movement
  handler accepts the move.
- A `timed-mode-tick` advances only when the host explicitly enables that
  capability. Timed mode is disabled by default.
- Paused and stopped host states reject both command kinds without consuming the
  command ID or turn number.
- Command IDs are idempotent and `expectedTurn` rejects stale multiplayer or
  replay input before mutation.

## Deterministic Order

1. Player movement
2. Enemy movement
3. Projectile movement
4. Pickups
5. Item effects
6. Duration expiry
7. Collisions

Each admitted turn returns an ordered receipt with phase and event sequencing.
Rejected movement cannot run downstream phases or consume a turn number.
Handlers are registered once at host construction, and bounded diagnostics list
the registered phases in this same canonical order.

## Phase Status

Which canonical phases are live in the shipping scene. `LIVE` means the legacy
`MenuScene` registers a handler for the phase. `DEFERRED` means no handler is
registered, and none may be registered until the gating contract is signed.

| Order | Phase | Status | Gate |
| --- | --- | --- | --- |
| 1 | `player-movement` | LIVE | Registered by `MenuScene` at host construction. |
| 2 | `enemy-movement` | DEFERRED | Held for its hazard packet; MAZER-HAZ-002 signed 2026-11-14 (phase 1), see the signed contract. |
| 3 | `projectile-movement` | DEFERRED | Held for its hazard packet (MAZER-HAZ-002 signed 2026-11-14). |
| 4 | `pickups` | DEFERRED | Held for its hazard packet (MAZER-HAZ-002 signed 2026-11-14). |
| 5 | `item-effects` | DEFERRED | Held for its hazard packet (MAZER-HAZ-002 signed 2026-11-14). |
| 6 | `duration-expiry` | DEFERRED | Held for its hazard packet (MAZER-HAZ-002 signed 2026-11-14). |
| 7 | `collisions` | DEFERRED | Held for its hazard packet (MAZER-HAZ-002 signed 2026-11-14). |

Only `player-movement` is live: 1 of 7 phases. The six deferred phases are an
explicit decision, not an oversight. Phase 2 hazards stay held until
its hazard packet lands under the signed contract (MAZER-HAZ-002, 2026-11-14), and the board stays free of hazards, enemies, and
obstacles until then (signing enabled no code). `tests/architecture/world-turn-contract.test.ts` keeps this
table equal to `WORLD_TURN_PHASES` and fails if `MenuScene` registers any phase
other than `player-movement`. Wiring a deferred phase requires changing this
table, that test, and the signed contract in the same change.

## Cosmetic Clock

Backdrop stars, HUD pulses, compass presentation, menu animation, and other
non-gameplay visuals remain on render time. They must not mutate collision,
position, inventory, duration, score, progression, or receipt truth. Pausing
gameplay may leave these cosmetic animations visible without advancing a world
turn.

## Current Boundary

The legacy `MenuScene` player-movement path now enters `WorldTurnHost` after the
shared directional-intent resolver selects one legal cardinal step. The scene
maps non-play mode to stopped, overlays and lifecycle locks to paused, and active
play to running. Timed mode remains disabled. Future enemy, projectile, item,
duration, and collision handlers remain unintegrated. Those integrations must
be incremental and preserve existing movement, completion, progression, and
telemetry behavior.

## Amendment pointer (2026-11-15)

The signed hazard product contract (`docs/architecture/MAZER-HAZARD-PRODUCT-CONTRACT.md`, section 2.1) makes the world clock real time on the player's step clock: one tick per `repeatIntervalMs`, started by the first input of the level and stopped on pause, overlay, `visibilitychange` and blur with no catch-up. That enters through the `timed-mode-tick` capability above in slice H1 of its roadmap; until then timed mode stays disabled, the phase table above stays exact, and no deferred phase is wired.

## Slice H1 landed (2026-11-15)

The world clock exists as `src/legacy-runtime/legacyWorldClock.ts`, created by the scene only while the hazard layer flag is on (`resolveHazardLayerEnabled()` in `legacyHazardLayerFlag.ts`: build constant default false, plus the `?lab=hazards` lab switch). It starts on the first input of a level, stops on pause, overlay, lifecycle hold, `visibilitychange` (hidden) and blur, restarts on the next input with no catch-up, and its hazard schedule is empty. It does NOT go through `WorldTurnHost` yet: `timedModeEnabled` stays false, the phase table above stays exact, and no deferred phase is wired. Slice H3 is where a tick starts to enter the host as a `timed-mode-tick`. With the flag off none of it runs.
