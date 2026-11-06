# Mazer Hazard Placement and Loadout

## Status

DRAFT (packets P4 and P5, pure parts). Builds on `docs/architecture/MAZER-HAZARD-GRAPH-CONTRACT.md` (P3). The hazard contract is still unsigned. Nothing here is wired into `MenuScene`, any scene, or the `src/mazer-core` barrel; the code is dormant, pure, and test-proven only. Every item tagged **[DEFAULT, pending owner]** is a recommendation, not a decision. Nothing here authorizes rendering a hazard, changing generation output, or changing progression.

## Files

| Concern | Location |
| --- | --- |
| Deterministic placement, capacity, screening | `src/mazer-core/hazards/placement.ts` |
| Level to hazard requirement schedule (the hazard layer of the ladder) | `src/mazer-core/hazards/loadout.ts` |
| Tests | `tests/core/hazards/placement.test.ts`, `tests/core/hazards/loadout.test.ts` |

Both modules are pure: no clock, no unseeded randomness, no scene, no `legacy-runtime` import (tests project production mazes through the P3 adapter). They are intentionally not re-exported from `src/mazer-core/hazards/index.ts` or the `mazer-core` barrel; the integrator wires that. `loadout.ts` knows only a level number and returns a requirement; `placement.ts` imports only the tier tables from it and accepts any structurally matching loadout. The geometry layer of the ladder (structure) is a separate lane and does not appear here.

## Loadout schedule

`resolveHazardLoadout(level, {capacity?})` returns counts per kind, tiers and first-encounter flags. It never sees a maze.

### Unlock constants **[DEFAULT, pending owner]**

| Constant | Value |
| --- | --- |
| No hazard of any kind | levels 1-5 |
| `HAZARD_UNLOCK_LEVELS.blocker` | 6 |
| `HAZARD_UNLOCK_LEVELS.timedGate` | 11 |
| `HAZARD_UNLOCK_LEVELS.patrol` | 16 |
| `HAZARD_UNLOCK_SPACING` (K) | 5 |

On its unlock level a kind has count 1 and `firstEncounter[kind] = true`. A level can flag at most one kind (the unlock levels are distinct).

### Nested tape

Level `L >= 6` owns `L - 5` hazard points. `allocation(L + 1) = allocation(L) + exactly one unit`, where a unit is one more hazard of a kind (count unit) or one tier upgrade (tier unit). The unlock levels force the unit (the first blocker, gate, patrol). Every other unit is the cheapest next unit on the menu; ties go to menu order (blocker, gate, patrol, gate tier, patrol tier). All prices are integers, so the tape is exact.

- Count unit for the k-th (0-based) hazard of a kind: `base * (1 + k^2)`, bases blocker 2, gate 4, patrol 6.
- Tier unit for raising a kind from tier j to j + 1: `base * (1 + j)^2`, bases gate 6, patrol 9. A tier leaves the menu when the last defined tier is reached. Blockers have no tiers.
- Tiers: gate tiers are (open/period) 3/4, 2/3, 3/5, 2/4, 3/6 (open fraction at least 50%, period 3 to 6, tier 0 waits at most one turn); patrol tiers are straight route lengths 3, 4, 5, 6, 7 (shuttle period 4 to 12). A patrol still moves one cell per turn (contract), so "faster" is not a tier.

### Schedule, levels 1..40 (no capacity)

Gate tier shows `tier (open/period)`; patrol tier shows `tier (route cells)`.

| Level | Points | Blockers | Gates | Patrols | Gate tier | Patrol tier | Unit added |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1-5 | 0 | 0 | 0 | 0 | - | - | - |
| 6 | 1 | 1 | 0 | 0 | - | - | blocker |
| 7 | 2 | 2 | 0 | 0 | - | - | blocker |
| 8 | 3 | 3 | 0 | 0 | - | - | blocker |
| 9 | 4 | 4 | 0 | 0 | - | - | blocker |
| 10 | 5 | 5 | 0 | 0 | - | - | blocker |
| 11 | 6 | 5 | 1 | 0 | 0 (3/4) | - | timedGate |
| 12 | 7 | 5 | 1 | 0 | 1 (2/3) | - | gateTier |
| 13 | 8 | 5 | 2 | 0 | 1 (2/3) | - | timedGate |
| 14 | 9 | 5 | 3 | 0 | 1 (2/3) | - | timedGate |
| 15 | 10 | 5 | 3 | 0 | 2 (3/5) | - | gateTier |
| 16 | 11 | 5 | 3 | 1 | 2 (3/5) | 0 (3) | patrol |
| 17 | 12 | 5 | 3 | 1 | 2 (3/5) | 1 (4) | patrolTier |
| 18 | 13 | 5 | 3 | 2 | 2 (3/5) | 1 (4) | patrol |
| 19 | 14 | 5 | 3 | 3 | 2 (3/5) | 1 (4) | patrol |
| 20 | 15 | 5 | 3 | 3 | 2 (3/5) | 2 (5) | patrolTier |
| 21 | 16 | 5 | 4 | 3 | 2 (3/5) | 2 (5) | timedGate |
| 22 | 17 | 6 | 4 | 3 | 2 (3/5) | 2 (5) | blocker |
| 23 | 18 | 6 | 4 | 3 | 3 (2/4) | 2 (5) | gateTier |
| 24 | 19 | 6 | 4 | 4 | 3 (2/4) | 2 (5) | patrol |
| 25 | 20 | 6 | 5 | 4 | 3 (2/4) | 2 (5) | timedGate |
| 26 | 21 | 7 | 5 | 4 | 3 (2/4) | 2 (5) | blocker |
| 27 | 22 | 7 | 5 | 4 | 3 (2/4) | 3 (6) | patrolTier |
| 28 | 23 | 7 | 5 | 4 | 4 (3/6) | 3 (6) | gateTier |
| 29 | 24 | 8 | 5 | 4 | 4 (3/6) | 3 (6) | blocker |
| 30 | 25 | 8 | 5 | 5 | 4 (3/6) | 3 (6) | patrol |
| 31 | 26 | 8 | 6 | 5 | 4 (3/6) | 3 (6) | timedGate |
| 32 | 27 | 9 | 6 | 5 | 4 (3/6) | 3 (6) | blocker |
| 33 | 28 | 9 | 6 | 5 | 4 (3/6) | 4 (7) | patrolTier |
| 34 | 29 | 9 | 7 | 5 | 4 (3/6) | 4 (7) | timedGate |
| 35 | 30 | 9 | 7 | 6 | 4 (3/6) | 4 (7) | patrol |
| 36 | 31 | 10 | 7 | 6 | 4 (3/6) | 4 (7) | blocker |
| 37 | 32 | 10 | 8 | 6 | 4 (3/6) | 4 (7) | timedGate |
| 38 | 33 | 11 | 8 | 6 | 4 (3/6) | 4 (7) | blocker |
| 39 | 34 | 11 | 8 | 7 | 4 (3/6) | 4 (7) | patrol |
| 40 | 35 | 12 | 8 | 7 | 4 (3/6) | 4 (7) | blocker |

Goldens (pinned in `loadout.test.ts`): level 100 is 38 blockers, 27 gates, 22 patrols at tiers 4/4; level 1000 is 432, 305, 250 at tiers 4/4. Hazard points are strictly monotone over levels 1..1000 (test), and without a capacity every level changes the effective requirement.

### Deviation from the packet text (flag)

The packet asked for "counts roughly sqrt-like" and "points grow by exactly 1 per level". Those two cannot both hold when a point is a unit and the menu is finite: every unit is either a count or a tier, tiers are finite, so once tiers are spent counts absorb every point and grow linearly in the level number (convex prices only change the split between kinds). The alternative, an unbounded cheap sink of tier units whose effective parameters saturate, was built and measured: with it 62 of the 95 levels in 6..100 added a point but changed nothing (idle). This draft chose strict effective progress up to the ceiling over sqrt counts. **[DEFAULT, owner decides]** if sqrt counts or idle levels are preferred, only the price constants and the tier menu change.

### Capacity and the feasibility ceiling

`resolveHazardLoadout(level, {capacity})` removes count units from the menu once the three counts reach `capacity`; remaining tier units are bought; when nothing is left the level is `idle` (`unit: 'none'`): it adds a point and no requirement. `findLoadoutCeilingLevel(capacity)` returns the first such level. Forced unlock units ignore the capacity (placement clamps them).

| Capacity | First idle level |
| --- | --- |
| 1 | 7 |
| 12 | 26 |
| 22 | 36 |
| 23 | 37 |
| 24 | 38 |

Production mazes at the three product shapes have capacity 21 to 24 (measured below), so the loadout ceiling is level 35 to 38. Past it "strictly harder" is only nominal. This is the deferral expiry already flagged in the P0 contract: the owner must choose variants from a bounded grammar, a declared plateau, or handing off to the deferred board-size/zoom levers.

## Placement

`placeLevelHazards(graph, {start, goal, seed, loadout, invulnerableTurns?, capacity?})` returns `{specs, verdict, attempts, requested, target, placed, capacity, capped, degraded, firstEncounter}`. `serializePlacement` is canonical JSON (the P3 `stableStringify`). Same input gives byte-identical output (test).

### Determinism

Every choice is `mix32(seed, kindCode, index, salt, candidate)` (integer murmur-style mixing, `Math.imul`, no floats), used only to order an already deterministically enumerated candidate list. `salt` is the attempt number. Candidates come from BFS in the graph's neighbour order. Nothing reads a clock or iterates an unordered collection into output.

### Algorithm

1. Clamp the request: the first-encounter kind (blocker, then gate, then patrol among flagged kinds) becomes count 1 and any other flagged kind is dropped; then, while the total exceeds `capacity` (default `maxHazardsForMaze`), reduce the kind with the largest count (ties drop the later kind).
2. Place the first-encounter kind first, then the rest in order blocker, gate, patrol. Protected cells (start, goal, their neighbours), cells touching an existing hazard, and a radius-2 clearance around the first-encounter hazard are never used.
3. Blockers: cells of the current shortest start-to-goal route that are not separators of the graph minus placed blockers and have a detour costing at least 2 extra steps. Ranked by hash (first encounter: smallest detour first). Each blocker changes the route, so the next blocker targets the new route.
4. Timed gates: route cells that are not junctions (a junction can be the pushback cell and would fail the post-contact rule). Tier parameters from the loadout (first encounter: tier 0, wait at most one turn); `openFrom` from the seed. Gates may sit on separator cells: waiting suffices.
5. Patrols: straight in-bounds segments of the tier's route length (3 to 7) with a safe pocket, meaning at least one segment cell has an off-segment hazard-free neighbour to dodge into. Segments touching the shortest route rank first (they matter); order and phase come from the hash. Each candidate is screened with `findWitnessRoute` before it is accepted (up to 8 tries per patrol).
6. Acceptance is `screenHazardPlacement`: protected cells, density, the first-encounter rule, and the P3 `validateLevelHazards` with the default 2 invulnerable turns. The first accepted attempt wins. Up to 3 rebuilds with a different salt, then hazards are dropped from the end of the placement sequence one at a time. An empty placement always passes, so the result is never unsolvable; `degraded` reports a shortfall.

### First-encounter rule

For the flagged kind: exactly one hazard; no other hazard within 2 graph steps; and either a guaranteed hazard-free detour (blocker, patrol: a start-to-goal path avoiding the hazard and every blocker, which later blockers are also placed to preserve) or an obvious wait (gate: tier 0, wait at most one turn, `period - openFor <= 1`). The screen re-checks all of it on the finished set. If a maze cannot host a safe configuration the kind is not placed and `firstEncounter.placed` is false.

### Density cap and feasibility

`maxHazardsForMaze(graph, endpoints?)` is `min(floor(W / 24), max(J, floor(W / 48)))`, with `W` the walkable cells and `J` the junctions (every blocker or patrol needs a junction to detour or dodge at; the `W / 48` floor lets a corridor host one gate). With `endpoints` it is also bounded by `max(1, floor((W - 2 - separators) / 12))`. Measured on the production generator with wrap axes required: 25x51 gives 22 to 24, 45x27 gives 21 to 22, 51x25 gives 22 to 23, a 60-cell corridor gives 1. The cap is a ceiling on requests, not a promise: placement reports `placed` against `target`.

Measured shortfalls: at levels up to 25 every corpus maze hosted the full loadout except isolated cases; at levels 35 to 60 most mazes could not host the full patrol and blocker count (on the 11-maze test corpus 10 degrade at the uncapped level-60 loadout). The binding constraints are non-separator route cells for blockers and pocketed straight segments for patrols.

### Performance

Measured on a 51x25 production maze (seed 20261105, capacity-clamped loadouts): median 46 ms at level 25 and 53 ms at level 40 over 5 runs; a 63-case sweep (3 shapes x 3 seeds x levels 6, 11, 16, 25, 35, 40, 60, capacity-clamped) measured median 100 ms, p90 148 ms, max 198 ms, always one validator attempt. The bound asserted in the test is 500 ms.

## Decisions taken (all owner-pending)

1. Unlock levels 6, 11, 16 and spacing K = 5; each kind introduced alone with a safe configuration.
2. Nested tape with integer convex prices; counts linear in the level after the tiers are spent (deviation above).
3. Gate tiers keep open fraction at least 50% and period 3 to 6; patrol tiers are route length 3 to 7. No patrol speed tier (contract fixes one cell per turn).
4. Blockers must have a detour (non-separator); gates and patrols may sit on mandatory cells, as the P3 contract only reports chokepoints by default. `rejectChokepointHazards` is not used.
5. Capacity formula and the 24-cells-per-hazard constant.
6. Validation always uses the P3 default pushback model and 2 invulnerable turns.
7. Placement degrades (fewer hazards) rather than fails; the shortfall is reported, never hidden.

## What P5/P6 runtime wiring needs (not built here)

- Telegraph: gates and patrols must show their next-turn state (contract telegraph rule); placement already produces specs whose `blockedAt`/`enemyCellsAt` at tick `t + 1` are what a renderer shows. Presentation (shape, glyph, reduced-motion form) is undefined and needs a design pass.
- Pushback runtime: the validator assumes "nearest junction strictly behind on the witness route, else route start, same tick, 2 contact-free turns". The runtime must implement exactly that, and placement keeps gates off junction cells so the pushback cell is not a closed gate. The runtime needs a route history (trail) to find the junction; the owner still has to define the contact cost surface and "checkpoint".
- Level pipeline: call `resolveHazardLoadout(level, {capacity: maxHazardsForMaze(graph, endpoints)})`, then `placeLevelHazards` with a level seed derived from (global seed, level) via `mix32`; persist specs, verdict and witness with the level. Level 1-5 must stay hazard-free on every save.
- Time: `placeLevelHazards` is well under a frame budget per level but builds large tables inside the validator; call it at level generation, not per frame.
- Barrel/index: add `loadout` and `placement` to `src/mazer-core/hazards/index.ts` when the integrator merges the sibling lanes, and extend the source-boundary test's expected module list.
- P6 chasers/interceptors: out of scope; they extend the validator's state space, and `maxHazardsForMaze` will need their weight.
