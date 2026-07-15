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
