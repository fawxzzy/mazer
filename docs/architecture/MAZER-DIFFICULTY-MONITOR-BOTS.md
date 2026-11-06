# Mazer Difficulty Monitor Bots

## Status

DRAFT (packet P7). Dormant and pure: nothing here is wired into `MenuScene`, any scene, the `src/mazer-core` barrel, or `src/mazer-core/eval/index.ts`. Every default tagged **[DEFAULT, pending owner]** is a recommendation, not a decision. The bots do not replace or change `src/domain/ai/demoWalker.ts`, which still drives the menu AI.

Builds on `docs/architecture/MAZER-HAZARD-GRAPH-CONTRACT.md` (graph, timeline, tick semantics, contact rule, pushback). The bots read that contract and never redefine it.

## Why

The menu AI solves every level perfectly (measured on main: E rank 99.7, D to S 100, perfect route at every rank), so it cannot show whether level N+1 is harder than level N. The research report ("Mazer endless progression design", demo-AI section) recommends a ladder of fallible bots as difficulty monitors, with an exact planner kept only as the solvability oracle. The bots need to track relative differences between levels, not play like a human.

## Files

| Concern | Location |
| --- | --- |
| Bots, seeded PRNG, `runBot` | `src/mazer-core/eval/bots.ts` |
| Per-level measurement, geometry proxy, monotonicity, plateau, ladder ceiling | `src/mazer-core/eval/difficultyReport.ts` |
| Example report over production mazes (vite-node) | `scripts/analysis/mazer-difficulty-report.ts` |
| Tests | `tests/core/eval/bots.test.ts`, `difficulty-report.test.ts`, `difficulty-performance.test.ts`, `difficulty-source-boundary.test.ts` |

`src/mazer-core/eval` imports only `../hazards/*` and its own siblings; it has no dependency on `legacy-runtime`, scenes, rendering, a clock, or ambient randomness (source-boundary test). Callers project a production maze with `createLegacyMazeHazardGraph` and pass the graph in.

## Turn model and contact

The bots use the P3 turn model unchanged: one action (step or WAIT) takes the world from tick `t` to `t + 1`, then contact is evaluated. Legality and contact come from `createHazardStateSpace(...).forEachSuccessor`, the single P3 transition definition: an action is obstacle-legal if it has a successor with invulnerability forced to at least 1, and contact-free if it has a successor under the bot's real invulnerability. Contact is the difference. The contact rule is not re-implemented in this packet.

On contact the run continues: the bot is placed at `resolvePushbackCell` (nearest junction strictly behind on its own path, else the path start), at the contact tick, with `N = 2` contact-free turns **[DEFAULT, pending owner, same as P3]**. A contact therefore costs progress and a turn, not the run. If that cell is blocked at the contact tick, the nearest earlier path cell that is not blocked is used (documented extension; P3 only covers witness routes where this cannot happen). If an obstacle leaves no legal action at all (crushed by a closing gate), it is counted as a contact on the current cell.

## Tiers

`runBot(spec, graph, timeline, { start, goal, maxTurns, seed, startTick?, invulnerableTurns? })` returns `{ reached, turns, waits, mistakes, contacts, contactEvents, minEnemyDistance, path }`. `path[0] = start`, one entry per turn; `contactEvents` lists `{ turn, contactCell, pushbackCell }`. `minEnemyDistance` is the smallest graph distance to any enemy over the run, capped at 32, or null without enemies.

| Tier | Kind | Behaviour | Draft parameters |
| --- | --- | --- | --- |
| 0 | `oracle` | Follows the P3 `findWitnessRoute` witness (contact-free, shortest). Solvability oracle only; never a difficulty datum for pass rate. Its witness waits do enter the index (timing a level forces). | none |
| 1 | `planner-limited` | Breadth-first lookahead of `horizon` turns over `(cell, tick, invulnerability)`. Scores every state in the horizon by `depth + h(cell)`, `h` = straight-line distance to the goal, raised online after each turn (LRTA*-style). Commits one action and replans each turn. Waiting is instrumental only: ending a lookahead back on the current cell is never chosen, so it waits for a gate or patrol but does not idle. | `horizon = 6` |
| 2 | `planner-noisy` | Tier 1 plus a per-turn mistake probability `p` that replaces the planned action with a uniformly random obstacle-legal action (this can step into an enemy), and a reaction delay `d`: the planner sees enemy positions from `d` turns ago (obstacles are telegraphed and exact). | `horizon = 4, p = 0.08, d = 1` |
| 3 | `myopic` | Greedy toward the goal by straight-line distance among contact-free moves (1-step hazard avoidance), no memory, never steps straight back unless it is the only move, ties broken by the seeded PRNG. It dead-ends on mazes with traps and is the floor. | none |

Why learned `h` for tier 1: pure hill-climbing on straight-line distance oscillates in any winding maze and fails everywhere, which carries no information. A learning heuristic makes the bot complete on a static maze while every dead end it explores costs real turns, and those turns are the difficulty signal (a monitor needs a graded response, not 0 or 1).

Randomness is a mulberry32 PRNG seeded per run; same inputs and seed give byte-identical results (`JSON.stringify` equal). Bots with no random draw (`oracle`, `planner-limited`, `planner-noisy` with `p = 0`) are reported as one run regardless of the seed list (`isDeterministicBot`).

## Measurement and indices

`measureLevelDifficulty(level, bots, seeds)`: `level = { graph, start, goal, hazards, maxTurns? }` with `graph` a `HazardGraph` or the structural input (a `LegacyMazeSnapshot` satisfies it). Per tier it reports pass rate, mean turns (failed runs count the full budget), mean turns when reached, mean waits, contacts, mistakes and min enemy distance. The default turn budget is `max(80, 8 * routeLength + 80)`.

Geometry proxy (`measureGeometry`): H1 from the P2 design, `H1 = turns + len/4 + 3*splits + 2*max(0, dead-2) + 6*wraps`, computed on the static shortest route (hazards ignored). Approximations versus the P2 measurement: `splits` is the junction count on the route, not the generator's `splitCount`; `wraps` counts wrap edges on the route. H1 weights are the P2 author's invention.

Combined index **[DEFAULT, pending owner]**: `index = H1 + mean over {planner-limited, planner-noisy} of (8*contacts + 1.5*waits + 40*(1 - passRate) + 0.25*max(0, meanTurns - len)) + 1.5*oracleWaits`. The myopic floor is reported but excluded because its outcome is chaotic per maze. All weights are invented and exposed as `DEFAULT_DIFFICULTY_WEIGHTS`.

## Reports, not gates

- `checkMonotoneDifficulty(indices)`: an adjacent pair is a violation when `next < previous - epsilon`. Returns the violation rate, positions and worst drop. It never asserts; a caller decides what rate is acceptable.
- `detectIndexPlateau(indices, { tolerance, minRun, smoothSpan })`: record-based. An entry that beats the running best by more than `tolerance` is a new record; the index has plateaued when at least `minRun` entries follow the last record. The ceiling is that last record. `smoothSpan` applies a centered moving mean first to damp single-level noise.
- `computeLadderCeiling(levelAt, { firstLevel, lastLevel, bots, seeds, tolerance, minRun, smoothSpan })`: measures every level (`levelAt(level)` supplies maze plus hazards), lists unsolvable levels (a generator defect, excluded from the sequence), and returns `ceilingLevel` (null when the index is still rising at `lastLevel`).

## Sample (stand-in, not a conclusion)

`npx vite-node ./scripts/analysis/mazer-difficulty-report.ts` (about 15 to 20 s, deterministic) runs levels 2 to 40 on a 35x35 board with a local STAND-IN geometry ladder (`replace with resolveGeometryBudgetProfile when integrated`) and hand-placed P3 gates and one patrol, each placement validated with `validateLevelHazards` (rejected placements are dropped and counted). With independent per-level seeds and no proxy-gated candidate selection the index is noisy: roughly half of adjacent pairs drop by more than epsilon 4. That is expected for ungated generation and is exactly what the P2 candidate gating is meant to remove; it is a measurement of the stand-in, not of the real ladder.

## How to use as CI monitors

Recommended **[DEFAULT, pending owner]**, not implemented as a gate:

1. Gate only on the oracle: every shipped level must have a witness (P3 validator). That is a hard check.
2. For fallible tiers, track aggregates over a fixed seed list and a fixed level range, with epsilon thresholds, not per-level assertions: for example "violation rate of the combined index below X% with epsilon E" and "tier-1 pass rate at level N within 0.1 of its recorded baseline". Seeds and maze seeds must be fixed so a regression is a code change, not noise.
3. Record the report as an artifact (`--json`) and diff it; fail on drift in the aggregate, warn on single levels.
4. Re-run the plateau detector when the ladder generator changes; fail only if the ceiling level moves earlier than the committed floor.

## Limits

- The bots are not humans. They are deterministic or seeded programs with hand-set parameters; absolute pass rates and turn counts mean nothing about player experience. They only need to move in the same direction as difficulty.
- Tier 1 uses perfect hazard knowledge inside its horizon; tier 2's delay models late enemy awareness only. No bot models fatigue, input latency, or touch control.
- The index weights, H1 weights, default horizons, mistake rate, delay and turn budget are untuned inventions. Per-seed spread of the geometry proxy is large relative to one-level steps (P2 measured about 22 H1 against about 7 per rung), so single-level monotonicity needs candidate gating or a loose epsilon.
- Chasers and interceptors (P6) depend on the player path and are not a `HazardTimeline`; the bots will need the P6 state-space extension, and the contact rule will not change.
- Items are not modeled (same as P3).
- Cost: a planner run is a bounded BFS per turn, measured in the packet report, not a guarantee.

## Open decisions (for the owner)

1. Whether fallible bots become CI monitors at all, and where the aggregate thresholds sit (this draft: reports only).
2. Tier parameters (horizon, mistake rate, delay) and the number of tiers; whether tier 1 should be allowed to wait on an unseen patrol.
3. Combined index definition and weights, and whether H1 stays the geometry proxy once P2 lands (its `splitCount` and wrap counts should then come from the generator, not be re-derived).
4. Whether the menu AI is ever replaced by, or shares code with, these bots (this packet does not touch it).
5. Turn budget policy: relative to route length (this draft) versus a fixed per-tier budget.
6. The published feasibility ceiling: what happens to the ladder at the detected `ceilingLevel` (plateau, size lever, or new hazard classes).
7. Pushback rule extension when the junction cell is blocked at the contact tick (this draft falls back to the nearest earlier unblocked path cell).
