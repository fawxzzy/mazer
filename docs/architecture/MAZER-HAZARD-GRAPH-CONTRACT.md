# Mazer Hazard Graph Contract

## Status

DRAFT (packet P3). The owner authorized local source work on the draft hazard contract defaults; that contract is still unsigned. Nothing here is wired into `MenuScene`, any scene, or the `src/mazer-core` barrel. The code is dormant, pure, and test-proven only. Every item tagged **[DEFAULT, pending owner]** is a recommendation, not a decision. Nothing here authorizes rendering a hazard, changing generation output, or changing progression.

Supersedes nothing. Builds on `docs/architecture/MAZER-WORLD-TURN-CONTRACT.md` (phase order), `docs/architecture/MAZER-EDGE-WRAP-TOPOLOGY-CONTRACT.md` (the playable wrap-aware graph), and the reopening gate in `docs/research/MAZER_PRESSURE_MECHANICS_PREP.md` (collision semantics, fairness and escape proof, lifecycle timing, diagnostics). Items (`docs/INTEGRATION_SCOPE.md`: trap, enemy, item, puzzle channels stay dormant advisory scoring) are out of scope and are not modeled.

## Ownership and files

| Concern | Location |
| --- | --- |
| Graph, junctions, separators, deterministic hazards, timeline | `src/mazer-core/hazards/graphContract.ts` |
| Witness search, reverse reachability, witness replay | `src/mazer-core/hazards/solvability.ts` |
| Level verdicts, pushback model, chokepoint report | `src/mazer-core/hazards/validation.ts` |
| Canonical JSON for witnesses and verdicts | `src/mazer-core/hazards/serialization.ts` |
| Production maze projection and parity check | `src/legacy-runtime/legacyHazardGraphAdapter.ts` |

`src/mazer-core/hazards` has no dependency on `legacy-runtime`, scenes, rendering, randomness, or a clock. The only bridge to production is the adapter in `legacy-runtime`.

## One graph

The hazard graph is the playable wrap-aware graph, nothing else. A step from a walkable cell goes to the in-bounds walkable neighbour; otherwise a step exactly one cell past an edge wraps to the opposite edge when that cell is walkable and is not the origin. This is identical to `resolveLegacyNavigationTarget` / `resolveLegacyWalkableGridNeighbors`, and `findHazardGraphLegacyMismatches` proves it per maze (tests run it over generated mazes with and without required wrap axes).

- Cell id: row-major `y * width + x`. Conversions: `graph.cellId/cellX/cellY`, adapter `legacyPointToHazardCell/hazardCellToLegacyPoint`.
- Neighbour order, everywhere a tie is broken: up, left, down, right, then WAIT.
- Neighbours are de-duplicated by cell (on a 2-wide board the wrapped and direct neighbour coincide).
- Junction: walkable cell with 3 or more distinct neighbours. Dead end: 1 or fewer.
- Chokepoint (`findSeparatorCells`): a cell, other than start and goal, that every start-to-goal route passes through on the static graph (static blockers removed).

## Hazard classes (draft class boundary)

- Obstacle: `{kind:'blocker', cell}` and `{kind:'timedGate', cell, period, openFrom, openFor}`. State is a pure function of the global tick. A gate is open at tick `t` iff `((t - openFrom) mod period) < openFor`.
- Deterministic enemy: `{kind:'patrol', route, period, phase?}`, a shuttle (ping-pong, no dwell) over a 4-connected route, one cell per world turn. `period` must equal `2 * (n - 1)` for `n` route cells (1 for a single cell). Its cell is a pure function of the tick, never of the player.
- Items are not modeled. Every verdict is therefore an items-absent verdict by construction (`itemsAbsent.basis = 'by-construction'`). If items ever enter the graph they must never be required by a witness.
- Out of scope here (P6): chasers and interceptors. They depend on the player path, so they cannot be a `HazardTimeline`. The validator extends by putting enemy state into the search state: `(player cell, enemy state, tick mod P)`, with the enemy phase as a deterministic update inside the successor function. The legality rules below do not change.

`HazardTimeline` is the read interface every consumer uses: `period` (bounded lcm of all hazard periods, default bound 720, `period-too-large` otherwise), `enemyCount`, `blockedAt(cell, tickMod)`, `enemyCellsAt(tickMod)` (positions indexed by enemy, stable order). Spec errors are `HazardSpecError` with a stable `code`.

## Tick semantics

The world advances only on player actions (WORLD-TURN contract). One action, a cardinal step or WAIT, takes the world from tick `t` to `t + 1`:

1. player-movement: the player steps to `dest` (or stays);
2. enemy-movement: every enemy moves to its tick `t + 1` position;
3. collisions: contact is evaluated.

Pause, resume, focus loss, and render time never advance the tick. Cosmetic clocks (stars, HUD pulses, compass animation) stay on render time and never read hazard state as truth. A rejected move consumes no turn, so a rejected move never changes a hazard.

An obstacle is evaluated at the arrival tick `t + 1`. A gate that is closed at `t + 1` makes `dest` illegal, including waiting in a gate cell that is about to close on the player. Telegraph rule **[DEFAULT, pending owner]**: every state change is shown one turn ahead, so the state the player sees for the next turn is exactly the arrival-tick state the rule consumes.

## Contact definition

Contact is evaluated in the collision phase of the turn from tick `t` to `t + 1`, after the enemy phase. The player moved from `cell` to `dest` (`dest = cell` for WAIT). Contact occurs iff either:

1. occupancy: `dest` is the cell of some enemy at tick `t + 1`; or
2. head-on swap: some enemy was on `dest` at tick `t` and is on `cell` at tick `t + 1` (`dest != cell`).

Cells are compared, so a swap across a wrap edge counts exactly like an in-bounds swap. An enemy that moves away in the same direction does not make contact. Several enemies may share a cell. Obstacle blocking is separate and never suspended.

Invulnerability: a counter `k` of contact-free turns. While `k > 0` contact is ignored for the current action and `k` decrements. Obstacles still block. The default window after a pushback is `N = 2` turns **[DEFAULT, pending owner]**.

A move that would make contact is not rejected by the rules; the player may choose it. The validator treats it as illegal in witness routes (a witness is contact-free by definition) and models the consequence separately as a pushback.

## Solvability

`findWitnessRoute(graph, timeline, {start, goal, startTick?, invulnerableTurns?, maxTicks?})` is a BFS over `(cell, tick mod P, k)` with actions in the order up, left, down, right, WAIT. The first-discovered parent wins, so the result is the shortest witness and deterministic. Because WAIT is last, an equal-length shuffle can precede a wait; a witness with `waits = 0` does not mean no timing was required. It returns `{solvable:true, witness}` or `{solvable:false, reason}` with `invalid-endpoint`, `start-blocked`, `start-contact`, `no-route`, or `max-ticks-exceeded`.

A witness is `{contract, width, height, start, goal, startTick, invulnerableTurns, period, ticks, waits, cells[], actions[]}`. `serializeWitness` / `parseWitness` persist it as canonical JSON (sorted keys, no whitespace, no trailing newline). `verifyWitness` re-checks a stored witness through the public `HazardTimeline` interface only, independently of the search tables, so stored witnesses can be re-verified after any generator or timeline change.

## Level verdicts

`validateLevelHazards(graphOrInput, specs, {start, goal, levelId?, invulnerableTurns?, maxPeriod?, rejectChokepointHazards?})` returns one stable record (`mazer-hazard-verdict-draft-v0`, `serializeLevelVerdict`):

- (a) `hazardsPresent`: a witness exists with every hazard active.
- (b) `itemsAbsent`: by construction.
- (c) `postContact`: for every witness state at index `1..ticks-1`, assume a contact there. Pushback model **[DEFAULT, pending owner]**: the player is placed on the nearest junction strictly behind the contact along the witness route, else the route start, at the same tick, with `N` contact-free turns. The level passes only if that state is not blocked, not an immediate re-contact when `N = 0`, and can still reach the goal (reverse reachability over the same transition relation). Failures are `pushback-cell-blocked`, `pushback-cell-contact`, `no-route-after-contact`. Because every post-contact state can finish contact-free, a stranded player is impossible under this model; further contacts remain avoidable, not forced.
- (d) `chokepoints`: mandatory cells (blockers removed) and the gates/patrols that sit on them. Report only unless `rejectChokepointHazards` is set. A witness with all hazards present is the requirement; a witness with each single blocker removed is not required.

Spec errors produce a failing verdict (`specError`) rather than an exception.

## Consumer rules

Every consumer takes cells and neighbours from one `HazardGraph` and hazard state from one `HazardTimeline`. No consumer re-derives wrap legality, junctions, or hazard positions.

| Consumer | Must use |
| --- | --- |
| Generation (level budget, hazard placement) | Build the graph with `createLegacyMazeHazardGraph(maze)`, place specs, then gate acceptance on `validateLevelHazards(...).pass`. Persist the witness and verdict with the level. Seeded placement only; no unseeded randomness. |
| Movement and `WorldTurnHost` handlers | Player step legality: `graph.moveTarget`, not hand-rolled deltas, plus `timeline.blockedAt(dest, turn + 1)`. Enemy phase: `timeline.enemyCellsAt(turn + 1)`. Collision phase: the contact definition above. Turn number is the world-turn number. |
| AI distance and demo walker | Static shortest path stays `resolveLegacyPlayableShortestPath`. Hazard-aware planning uses `findWitnessRoute` (offline oracle) over `(cell, tick mod P)`. A static distance must never be shown as time-to-goal once hazards exist. |
| Compass | Direction to the goal remains static-graph; it must not claim a route is passable. A hazard-aware hint, if ever shown, comes from the witness only. |
| Trail | Trail records player cells, not hazard state. Trail cells are `HazardCellId`s; pushback appends the pushback placement as a normal accepted transition so the trail cannot teleport silently. |
| Telemetry and diagnostics | Record the verdict record (stable JSON), seed, hazard specs, witness, contact events (`witnessIndex`, `tick`, cells), and invulnerability windows. Use only the stable field names above. |
| Rendering | Render only from `blockedAt` / `enemyCellsAt` for the displayed turn and the next turn (telegraph). Renderers own presentation (shape, glyph, reduced-motion form); they never own state. Decorative folded-corner and notch masks stay renderer-owned per the edge-wrap contract; a legal graph edge is never hidden by chrome. |

## Determinism and bounds

No `Math.random`, `Date.now`, or clock in `src/mazer-core/hazards` (source-boundary test). Same inputs give byte-identical witness and verdict JSON. The combined period is bounded (default 720). State space is `period * cells * (N + 1)`; measured cost on a 51x25 board at period 12 is in the packet report, not a contract guarantee.

## Open decisions (for the owner)

1. Sign the hazard contract; until then nothing is wired.
2. Arrival-tick vs departure-tick obstacle evaluation (this draft: arrival, with telegraph).
3. Pushback model (nearest junction behind, else start), invulnerability length `N`, and the cost surface of contact. "Checkpoint" is not defined here.
4. Whether post-contact validation should also cover contacts away from the witness route (this draft: witness states only; a stateless all-reachable variant needs a defined pushback that does not depend on route history).
5. Whether gates/patrols on chokepoints are rejected (`rejectChokepointHazards`) or only reported.
6. Wait-versus-shuffle: whether witnesses should prefer an explicit WAIT over an equal-length shuffle (this draft keeps the contract tie-break order up, left, down, right, wait).
7. Patrol phase offsets and dwell at route ends (this draft: optional integer phase, no dwell).
8. How P6 chasers/interceptors define contact when both parties are player-dependent (extends the state; the contact rule itself is unchanged).
9. Whether the combined-period bound (720) is the right ceiling.

## Packet handoff

- P4 (obstacles): construct `BlockerSpec` / `TimedGateSpec`, gate level acceptance on `validateLevelHazards`, persist witness and verdict.
- P5 (patroller): `PatrolSpec` plus `HazardTimeline.enemyCellsAt`; wire the enemy and collision phases through the contact definition; decide telegraph form.
- P6 (chaser/interceptor): extend the state space with enemy state; keep `forEachSuccessor` as the single transition definition and keep the contact rule.
