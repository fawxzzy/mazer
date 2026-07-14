# Mazer World Turn Contract

## Ownership

`WorldTurnSystem` is the future gameplay-mutation coordinator. Player movement,
enemy movement, projectiles, pickups, item effects, duration expiry, and
collisions must enter through one admitted turn command before those systems are
wired into the shipping scene.

## Admission

- A `player-move` command advances the world only when the player-movement
  handler accepts the move.
- A `timed-mode-tick` explicitly advances modes whose rules continue without a
  player move.
- Paused simulation rejects both command kinds.
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

## Cosmetic Clock

Backdrop stars, HUD pulses, compass presentation, menu animation, and other
non-gameplay visuals remain on render time. They must not mutate collision,
position, inventory, duration, score, progression, or receipt truth. Pausing
gameplay may leave these cosmetic animations visible without advancing a world
turn.

## Current Boundary

The legacy `MenuScene` player-movement path now enters this coordinator after
the shared directional-intent resolver selects one legal cardinal step. Future
enemy, projectile, item, duration, collision, and timed-mode handlers remain
unintegrated. Those integrations must be incremental and preserve existing
movement, completion, progression, and telemetry behavior.
