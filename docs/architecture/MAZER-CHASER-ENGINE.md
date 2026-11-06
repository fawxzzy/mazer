# Mazer Chaser Engine

## Status

DRAFT (packet P6). Dormant: not wired into `MenuScene`, any scene, `WorldTurnHost`, or the `src/mazer-core` barrel, and not exported from `src/mazer-core/hazards/index.ts` (the integrator adds the exports). The code is pure and test-proven only. Every item tagged **[DEFAULT, pending owner]** is a recommendation, not a decision. Nothing here authorizes rendering an enemy, changing generation output, or changing progression.

Builds on `docs/architecture/MAZER-HAZARD-GRAPH-CONTRACT.md` (graph, tick semantics, contact definition, witness search) and `docs/architecture/MAZER-WORLD-TURN-CONTRACT.md` (the world advances only on player actions; phases player, enemy, collisions). It implements the "one junction-greedy engine, pluggable target rule" decision of the hazard product contract (P0 draft, section 5) and the solvability extension reserved by the graph contract ("P6").

## Files

| Concern | Location |
| --- | --- |
| Movement engine, target rules, tiering, wrap-aware distance | `src/mazer-core/hazards/chaserEngine.ts` |
| Joint search space, `findWitnessRouteWithChasers`, replay, `verifyChaserWitness` | `src/mazer-core/hazards/chaserSolvability.ts` |
| `validateLevelWithChasers`, fairness analytics | `src/mazer-core/hazards/chaserValidation.ts` |
| Test-only independent reference implementation and brute-force oracle | `tests/core/hazards/chaserReference.ts` |

The modules import only P3 files (`graphContract`, `solvability`, `validation`, `serialization`) and each other. No `Math.random`, no clock (`chaser-source-boundary.test.ts`).

## Movement rules (exact)

State is JSON data: `{contract, spec, cell, heading, reverseNext}`. `cell` is `-1` while the enemy has not spawned. `step(graph, state, player, tick)` is a pure function that returns the enemy state at tick `tick + 1`. `player` is the player AFTER the player phase of that turn: `{cell, heading}` where `heading` is the direction of the player's last move action (WAIT keeps it; `null` before the first move). World turn `n = tick + 1`.

Phase order inside one turn is the world-turn order: player moves, then every enemy steps against the player's NEW cell, then contact is evaluated by the P3 contact definition (occupancy after the enemy phase, plus head-on swap).

1. **Spawn.** The enemy is absent (no cell, no contact) while `n < spawnDelayTurns`. At turn `n = spawnDelayTurns` it appears on `spawnCell` without moving. With `spawnDelayTurns = 0` it exists at tick 0.
2. **Idle turns.** Let `movementStart = spawnDelayTurns + graceTurns`. The enemy moves in turn `n` iff `n > movementStart` and `(n - movementStart) mod speedDivisor = 0`. Otherwise it stays (present and contact-capable).
3. **Exits.** The exits of a cell are its distinct destinations from `graph.moveTarget`, in the order up, left, down, right (a destination reachable by two directions is listed once, with the first direction). A destination that is blocked on this turn (`blocked(cell, n)`, optional) is not an exit: enemies treat static blockers and closed gates as walls.
4. **No reversal.** The "back" cell is the cell opposite to the enemy's heading. It is excluded from the exits ("forward exits").
5. **Corridor and corner.** One forward exit: take it. The enemy does not decide.
6. **Dead end.** No forward exit but the back cell is open: reverse. (This is the only reversal except the global event below.) No exit at all: stay.
7. **Decision point.** Two or more forward exits (a junction, or the spawn cell before the enemy has a heading): choose by the target rule.
8. **Target rules.**
   - `chaser` (Pac-Man Blinky): target = the player's cell.
   - `interceptor` (Pac-Man Pinky): target = the cell `lookahead` steps ahead of the player along the player's last move direction (default 3, range 1 to 64), walking `moveTarget` and stopping at the last walkable cell before a wall ("clamped to walkable"). Across a wrap edge the walk continues on the other side. With no known player heading the target is the player's cell.
   - `wall-follower` (alternate, purely local): left-hand rule. Preference order is left of the heading, straight, right, back. Ignores the player. Default heading `up`.
9. **Choice.** The forward exit whose cell has the smallest straight-line distance to the target. Ties break up, left, down, right (the first in that order wins; `<` is strict).
10. **Heading.** After a move, `heading` is the direction used. Graph moves are reversible by the opposite direction (checked on random boards with wrap), so "opposite of the heading" is exactly the cell the enemy came from.
11. **Global event.** `reverseJunctionGreedyEnemy(state)` sets `reverseNext`; the enemy's next move goes back once (if the back cell is open), then normal rules resume. Nothing in the repo raises this event yet; the solver rejects states with a pending event.

### Distance

Straight-line Manhattan distance from the CANDIDATE cell (the cell the enemy would move into) to the target, as in the Pac-Man Dossier. On an axis where the graph actually has a wrap edge (some row links `x = 0` and `x = width - 1` through `moveTarget`, or some column links `y = 0` and `y = height - 1`) the axis is measured on a torus, `min(d, size - d)`; on other axes it is plain. This is a steering heuristic, not a path length, and it is computed from the one hazard graph, so wrap legality is never re-derived.

### Why Manhattan-target junction-greedy, not shortest path

A pursuer that always follows the shortest path to the player at the same speed cannot be outrun in a maze: every move the player makes, it closes or keeps the gap, so the only escape is a loop it fails to cut, and in a corridor start it is simply unfair. The product contract already replaced the board's "pathfinding toward the player" wording with junction-greedy for this reason. Straight-line targeting plus no-reversal makes the enemy learnable and exploitable (decoy branches, dead-end stubs it commits to, loops it has to circle), which is what the Pac-Man ghosts rely on. The golden fixture "decoy stub" pins the difference: the greedy chaser walks into the stub that is Manhattan-closer and has to reverse, while the shortest path goes the other way. The cost is that it can be beaten, which is the point, and that solvability can no longer be answered by a static graph.

## Tiering knobs **[DEFAULT, pending owner]**

| Knob | Effect | Intended use |
| --- | --- | --- |
| `spawnDelayTurns` | Absent until turn N, then appears in place | Keep the first corridor clear; introduce an enemy mid-level |
| `graceTurns` | Present but still for N turns after appearing | First-encounter safety: the player sees it before it moves |
| `speedDivisor` | Moves every k-th turn | A slow tier; the only way to make a chaser strictly easier without changing its rule |
| `lookahead` | Interceptor aim distance | Harder interceptors aim further ahead |
| `initialHeading` | Initial facing (greedy: forbids reversing out of it) | Authoring control of the first move |

A chaser at `speedDivisor = 1` is the full-speed tier. The fixtures show that the same board can flip between unsolvable and solvable by delay, by speed, or by switching the target rule between chaser and interceptor.

## Solvability with player-dependent enemies

`findWitnessRouteWithChasers(graph, timeline, enemies, {start, goal, startTick?, invulnerableTurns?, startHeading?, maxTicks?, stateCap?, maxCombinedPeriod?, useHeuristic?})`.

- Joint state: `(time key, player cell, player heading*, enemy states, invulnerability k)`, where an enemy state is `(cell, heading)` and the player heading is tracked only when an interceptor is present. The P3 `HazardTimeline` (blockers, gates, patrols) is composed in unchanged.
- Transition and legality are P3's, in the same order: actions up, left, down, right, WAIT; arrival-tick obstacle blocking is never suspended; contact is occupancy after the enemy phase or a head-on swap, both ignored while `k > 0`. The enemies advance on every action regardless of `k`. Enemies see the player's NEW cell, so the witness is a player action sequence that is valid against the deterministic response.
- Time key: absolute tick while `tick < E` (`E` = largest `spawnDelay + grace`), then `E + ((tick - E) mod Q)` with `Q = lcm(P, speed divisors)` (bounded by `maxCombinedPeriod`, default 720, and `E <= 4096`). This folds exactly onto both clocks (obstacles use `tick mod P`; tiering uses absolute turn counts).
- Search: A* with unit costs and the consistent heuristic "static distance to the goal" (static blockers removed), bucketed and FIFO within a bucket, so the witness is a shortest one and ties are deterministic. `useHeuristic: false` is plain BFS; with no chasers it returns a witness byte-identical to P3's `findWitnessRoute` (tested on random hazard boards, with and without invulnerability). Re-discovery with a lower cost updates the parent (lazy deletion).
- Result: `{status: 'solvable', witness}`, `{status: 'unsolvable', reason}` with `invalid-endpoint | start-blocked | start-contact | no-route | max-ticks-exceeded`, or `{status: 'unknown', reason}` with `state-cap-exceeded | period-too-large`. `unsolvable/no-route` is a proof (the reachable joint space was exhausted). `unknown` is never a pass and never a proof.
- Witness: P3 fields plus `startHeading` and `enemyCells[i][e]` (the enemy cells after `i` actions, `-1` = not spawned).
- `verifyChaserWitness(graph, timeline, enemies, witness)` replays the actions through the PUBLIC `stepJunctionGreedyEnemy` (not the solver's packed fast path), requires the recorded enemy trace to match, then builds a recorded `HazardTimeline` (patrols plus replayed chasers) and calls P3's `verifyWitness`. The contact definition is therefore evaluated by P3's code in the verifier and by a reviewed copy of the same two clauses in the search; tests pin them together (zero chasers equals P3; an immobile chaser equals a one-cell P3 patrol; a brute-force oracle written in the test, using an independent reference movement implementation, agrees on the shortest route length over hundreds of random boards with 1 to 2 enemies).

### Level verdict

`validateLevelWithChasers(graphOrInput, hazardSpecs, chaserSpecs, {start, goal, levelId?, invulnerableTurns?, stateCap?, postContactStateCap?, postContactStride?, includeFairness?})` returns a stable record (`mazer-chaser-verdict-draft-v0`, `serializeChaserVerdict`):

- (a) `hazardsPresent`: a witness exists with every hazard and chaser active and it re-verifies by replay (`replayVerified`). `status` is `solvable | unsolvable | unknown | invalid`.
- (b) `itemsAbsent`: by construction.
- (c) `postContact`: for every witness state at index `1..ticks-1` (optionally strided), assume a contact there. Pushback model is P3's `resolvePushbackCell` **[DEFAULT, pending owner]**: the player is placed on the nearest junction strictly behind the contact along the witness, else the start, at the same tick, with `N = 2` contact-free turns; the chasers keep the state they had at the contact. The level passes only if that state is not blocked, not an immediate re-contact when `N = 0`, and can still reach the goal. Each check is its own bounded search that stops early on any state already known to be solvable (the witness states, and the states of earlier successful checks; more invulnerability is never worse). Checks that hit `postContactStateCap` are counted as `unknownCount` and block the pass.
- Chokepoint hosting from P3 is not repeated here; it is a static-graph question P3 already answers.

## Fairness analytics

`analyzeChaserFairness(graph, timeline, enemies, witness)` (also embedded in the verdict with `includeFairness`). It feeds the bots lane. Definitions are DRAFT:

- `minDistanceSteps` per enemy and overall: the smallest static-graph shortest-path length between the player and the enemy over the witness states where the enemy is present (static blockers are walls). `minDistanceTurns = minDistanceSteps * speedDivisor`. It is a proxy for time-to-reach, not an exact catch time (the enemy cannot reverse and steers by straight-line distance). `atWitnessIndex` says where the closest approach happens.
- `waits`: WAIT actions in the witness. As in P3 a witness with zero waits does not mean no timing was needed (WAIT sorts last in the tie-break).
- `escapeSlack`: over the witness states, how many survive a forced one-turn hesitation. For each state the solver applies a WAIT (when legal) and checks that the level can still be finished contact-free. `ratio = survivable / (tested - unknown)`; `1.0` is forgiving (a mistimed turn costs nothing), values near `0` mean almost every step must be perfect. `firstFragileIndex` names the first witness step where a hesitation is fatal. Checks that hit the state cap are reported as `unknown`.

## Validator limits

- Exact, not sampled: the search is exhaustive over the joint state space, so `unsolvable/no-route` is a proof and `solvable` carries a replay-verified witness. The price is state growth.
- State growth: the joint space is roughly `timeKeys * walkable^(1 + chasers) * headings * (N + 1)` before pruning. For one chaser it is quadratic in the walkable area; every extra chaser multiplies it by about the walkable area. `estimateChaserStateSpace` reports the ceiling.
- The cap is hard: a search never creates more than `stateCap` states (default 1,500,000; the cap is counted in states, and memory at the default cap was not measured) and returns `unknown / state-cap-exceeded`. The packed key space must stay below 2^52, otherwise `unknown / period-too-large`. Treat `unknown` like a failed level in generation.
- Measured (this machine, Node, cold-start excluded; not a contract guarantee):

| Board (walkable) | Mode, one chaser | Median | Max | States explored (median) |
| --- | --- | --- | --- | --- |
| 51x25 (about 555) | witness search, A* | under 1 ms | 11 ms | 197 (max 1,960) |
| 51x25 | witness search, plain BFS | about 180 ms | about 440 ms | about 113,000 (max about 127,000) |
| 51x25 | full verdict incl. post-contact and fairness | about 7 ms | about 22 ms | n/a |
| 25x25 (285) | exhaustive proof of unsolvability | about 180 ms | n/a | about 113,000 |
| 31x25 (347) | exhaustive proof | about 430 ms | n/a | about 169,000 |
| 51x25 (555) | exhaustive proof | about 1.2 s | about 2.2 s | about 418,000 |
| 51x25, two chasers | exhaustive attempt with a 200,000 cap | n/a | 0.8 s | 200,000, result `unknown` |

  The A* figures are the common case (a solvable level, the chaser far from the route); the exhaustive rows are the worst case (a level that is unsolvable by the chaser, or a proof with the goal unreachable). Two or more chasers on a full-size board are expected to reach `unknown` whenever the level is hard; the generation lane should add chasers one at a time and keep enemy spawns spread so the heuristic search finishes.
- Pushback and slack checks are bounded per check and early-exit on known-solvable states; they are far cheaper than the main search when the level is easy and can reach their caps when it is tight.
- One shared timeline: the P3 timeline period still bounds at 720; the combined period `Q` is bounded by the same constant by default.
- Enemies treat obstacle cells as walls evaluated at the arrival turn; a gate that closes on a chaser's path changes which exits exist, deterministically. Whether enemies should respect gates at all is an owner decision (below).
- A chaser sitting on the goal cell blocks it while it is there (occupancy), exactly like a P3 patrol; the validator does not move spawns.
- Not modeled: enemy-enemy collision (they overlap freely), enemies in `reverseNext` mid-search, items, projectile phases.

## Open decisions for the owner

1. Pac-Man semantics vs this draft: the spawn cell is a decision point when the enemy has no heading, and `initialHeading` forbids reversing out of the initial facing. Confirm.
2. Whether enemies respect timed gates and blockers (this draft: yes, as walls at the arrival turn) or ignore obstacles.
3. Interceptor default lookahead 3 and a maximum of 64; whether the interceptor target may point at an unreachable cell (this draft clamps to walkable cells).
4. Whether a global reversal event exists at all (Pac-Man mode switches). The engine supports it; the solver does not search through it.
5. The meaning of "distance in turns" in fairness reports and the definition of escape slack (hesitation survival). Bots may need a different measure.
6. Pushback with chasers: the enemy state at the contact is kept (this draft). Alternatives: reset enemies to spawn, or freeze them for the invulnerability window.
7. Tier table: which `speedDivisor`, `graceTurns` and `spawnDelayTurns` map to which level bands, and the cap policy for generation (reject `unknown`, or retry with fewer chasers).
8. Whether two enemies may occupy one cell (this draft: yes) or must avoid each other.
9. Whether `findWitnessRouteWithChasers` should use a different cap in CI than at generation time.

## Packet handoff

- Integrator: re-export `chaserEngine`, `chaserSolvability`, `chaserValidation` from `hazards/index.ts` once the sibling lane's hazard placement files land, and update the module list in `tests/core/hazards/source-boundary.test.ts` (it pins the exact set of files in `src/mazer-core/hazards`).
- Generation: place chasers by seeded spawn, call `validateLevelWithChasers`, persist the verdict and the witness; reject `unknown`.
- Bots lane: consume `analyzeChaserFairness` (`minDistance*`, `waits`, `escapeSlack`).
- Wiring (blocked on the signed hazard contract): enemy phase of `WorldTurnHost` calls `stepJunctionGreedyEnemy` with the player's post-move state and `timeline.blockedAt` as the `blocked` predicate; the collision phase uses the P3 contact definition.
