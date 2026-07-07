# Mazer Pressure Mechanics Prep

Date: 2026-07-07
Status: preparation

## Goal

Prepare the current mobile maze game for timed play with enemies, obstacles, room-like spaces, and fast control decisions without breaking the existing grid-movement proof spine.

## Current Decision

Keep movement grid-legal and predictable. The stick may resolve a richer intent wheel, but the player still commits to one-tile cardinal or ordered cardinal-diagonal steps. This matters because future enemies, hazards, and timed routes need deterministic collision and replayable proof.

## Safe Next Lanes

1. Control pressure lane
   - Add stick hysteresis so small thumb jitter near segment boundaries does not flip directions.
   - Keep ordered fallback candidates for branch selection.
   - Verify with live diagnostics: active controls, pull segment, release clearing, frame spikes.

2. Room topology lane
   - Add bounded room pockets as part of maze generation, not as post-render decoration.
   - Rooms must preserve a connected floor component, start-to-goal solvability, and route-quality scoring.
   - First room pass should be a generator metadata feature with tests before visual flair.

3. Hazard and obstacle lane
   - Start with static hazards or slow timed gates before mobile enemies.
   - Hazards should occupy legal floor tiles and expose diagnostics for position, active state, and collision effect.
   - Avoid random unavoidable damage; every hazard placement needs an escape or alternate route check.

4. Enemy lane
   - Start with one predictable patrol agent using the existing graph/floor topology.
   - Enemy movement should be slower than player held movement and publish route diagnostics.
   - Collision semantics should be explicit: reset, time penalty, stun, or trail cut. Do not mix these until one model is chosen.

5. Timing lane
   - Keep the current timer as the source of pressure.
   - Add objective timing only after controls and hazards are stable.
   - Any score/rank system should be derived from deterministic attempt state, not rendering frames.

## Risks

- Adding rooms by simply carving extra tiles can weaken maze identity or create trivial open fields.
- Adding enemies before control feel is stable will make input bugs feel like enemy unfairness.
- Adding 16/32-way movement to a grid maze would break collision clarity; use richer intent only to choose valid grid moves.
- More animated actors can reintroduce frame spikes unless runtime diagnostics track entity counts and update cadence.

## Next Best Build Packet

Implement and prove stick hysteresis first, then start a room-topology generator packet with a small seed audit. That order protects play feel before adding pressure mechanics that punish control mistakes.
