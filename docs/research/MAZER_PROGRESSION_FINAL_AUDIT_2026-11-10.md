# Mazer progression engine: final audit and the mastery tier (2026-11-10)

> Update 2026-11-11 (ladder v2, owner decision on MAZER-PROG-015): the double lure now applies to every maze of levels 2 to 268 and the mastery tier (levels 269 to 388, the seeded share, `GEOMETRY_BUDGET_MASTERY_*`, `masteryStats`, the `mastery` regime) is removed; the saturation level and the hazard hand-off are back at 268. Read the section "Ladder v2" below first. The rest of this document is the 2026-11-10 audit as it stood and is kept as history: where it says the mastery tier, level 388 or "not applied", ladder v2 supersedes it.

Scope: audit the progression engine (generation and ladder modules only) on the frozen boards (phone 25 x 51, desktop 45 x 27, scale 35), without hazards (Phase 2, held until MAZER-HAZ-002 is signed) and without any board-size or tile-size change. Everything here is modelled difficulty (deterministic and seeded walkers), not player-tested, and nothing was checked on a device. Machine-readable before/after profile: `docs/research/MAZER_PROGRESSION_FINAL_AUDIT_2026-11-10.json`.

## Summary

- Facts. The ladder is monotone and flat-free in the number it steers on (priced felt, 89 at level 2 to 759 at level 198), the fringe raises junctions and dead ends to level 268, and then every maze of every level is the same class (level 268 geometry, identical gauge to the digit). No integer overflow, NaN, clamp or seed bug was found at levels 300 to 100000 (the geometry level clamps at the last bounded level, the play seed is a random 32-bit value, so mazes differ). Fallback or retry: 0 of 200 mazes per cell left its window at any level from 198 to 1000 (see "Generation").
- New finding. The felt number is the pull-to-goal explorer run from the START. The board is fully visible, so a player can as well work back from the goal, and the same explorer run goal to start pays about 0.3 to 0.6 of the forward number on every level (phone: 120 against 215 at level 10, 168 against 464 at level 50, 190 against 564 at level 100, 475 against 759 at level 198; 10 percent of the level-268 mazes pay under 200). The tuner's deceptive forks point toward the goal only.
- Change. A mastery tier, levels 269 to 388 (`GEOMETRY_BUDGET_MASTERY_SPAN = 120`): the share of mazes whose route forks also point toward the start rises by 1/120 per level (seeded roll on level and play seed), and every such maze is held to a reverse felt value of at least `GEOMETRY_BUDGET_MASTERY_REVERSE_FLOOR = 740`. Levels 1 to 268 are byte-identical (golden fixture: 10 hashes changed, levels 281, 282, 288, 289 and 299 on both boards, none at or below 268). The saturation level (end of the geometry ramp) moves from 268 to 388; `hazardBudgetLevels = level - 388`.
- Ceiling. Level 388. From there every maze is: forward felt 759-760, reverse felt at least 740, 70 fringe cells, about 48 percent of the board floor. Nothing on this board makes a level measurably harder after that without hazards (next lever) or a bigger board (last lever, the zoom lever the owner ruled out).

## Audit: where the ladder was flat or not monotone (before, main d93045b3)

Per-band means from a 3872-maze dump (levels 1 to 100000, 16 seeds per level and board; both boards agree unless stated).

| Zone | What is flat or falls | Evidence |
|---|---|---|
| Levels 17 to 100 | The steered number rises only +2 to +3 per level (0.4 percent per level), and route junctions barely move: decision points on the route 6.9 (levels 10-24), 6.7 (25-49), 6.5 (50-99); human-like explorer 562, 715, 816; shortest route 103, 100, 95. Reverse felt 177, 177, 191. | `progression-gauges.ts analyze`, bands L10-24 / L25-49 / L50-99 |
| Level 30 | Shortest route falls to 61 (phone) from 110-134 at levels 26-29 (both wrap corridors from level 30). Decision points 4.6 against 7-8. A known, priced effect of the wrap rungs (not a regression of the steered number). | per-level table |
| Levels 100 to 140 | Fade of the wrap corridors (already smoothed by the wrap-fade change); shortest route doubles from about 100 to about 210 over the fade. | PR #404 evidence |
| Levels 198 to 268 | Steered number flat by design (759); junctions 12 to 40, dead ends 27 to 87 (fringe). | fringe section of the gauges doc |
| Levels 268 and above | Every gauge is exactly equal (the same seed gives the same maze at level 268 and level 100000). The ladder is a plateau. | all gauges |
| Branching factor | 2.0 at every level (structural: a path through tree cells). Never a lever. | gauge table |

Noise, not regressions: the human-like and random-walk walkers move 20 to 40 percent between neighbouring levels at 16 seeds (rank correlation with level 0.5 to 0.6); judge them over bands. The shortest route is non-monotone in levels 10 to 99 by design (wrap shortcuts).

Not a bug: levels from 268 reuse one geometry, but the play seed is `createLegacyRuntimeRandomSeed` (random per maze), so two clears at level 18000 are different mazes (existing test: ordinals 268 to 1000000 at different seeds hash to six different mazes).

### Bug hunt at high level numbers

| Check | Result |
|---|---|
| Ordinal `'9' x 60` and 1e12 | clamps to the last bounded level, never throws (existing test, still passes) |
| Levels 300, 1000, 5000, 18000, 100000 | same maze for the same seed (clamp), no NaN, all solvable, golden hashes stable |
| `resolveContinuousDifficulty(NaN / negative)` | corridor regime (test) |
| Mastery roll | pure function of (level, seed); share within 6 points of the level's share over 2000 seeds (test) |
| Menu AI | 1644 of 1644 runs cleared, levels 266 to 400 plus 1000 and 18000, ranks E and S, both boards, 3 seeds |
| Desktop against phone | no divergence of kind (fringe room: desktop p5 73, phone 87; reverse felt at the plateau 760 / 767) |

### Generation (time, retries, fallbacks)

| Cell | First base lands | Bases 2 | 3 | 4+ | Left the window | Node 1x mean / p95 / max (ms) |
|---|---:|---:|---:|---:|---:|---|
| 198 phone | 195 / 200 | 5 | 0 | 0 | 0 | 13 / 36 / 89 |
| 268 desktop | 177 / 200 | 18 | 5 | 0 | 0 | 19 / 49 / 76 |
| 388 phone (all mastery) | 167 / 200 | 28 | 3 | 2 | 0 | 20 / 49 / 129 |
| 388 desktop (all mastery) | 137 / 200 | 36 | 13 | 14 | 0 | 31 / 89 / 138 |

Real Chromium, dev-server modules, 40 seeds, CPU throttle 4x (one run; the machine was noisier than the earlier runs of this lane: level 198 itself read 63 / 350 ms mean / worst, against 39 / 248 recorded earlier): level 268 mean 78-106, worst single 256-333 ms; mastery levels 300-1000 mean 80-156, p95 264-467, worst single 266-529 ms. Honest reading: the mastery tier costs about 1.5 times the plateau class, the 95th percentile of desktop mastery builds reached 336-467 ms and the worst single build 450-529 ms at a 4x throttle (level 268 desktop in the same run: p95 316, worst 333), so about one desktop mastery build in twenty passes the 400 ms worst-build target; the cause is measured (below), not fixed.

## Levers evaluated past level 268

| Lever | Verdict | Evidence |
|---|---|---|
| Double lure on route forks (a fork also points toward the start) | Adopted | reverse felt 430-475 to 700-760 at the same floor and the same forward number; held-out two-way human-like +31 to +45 percent |
| Rewire a finished maze (move wrong-ground cells to reverse-only ground) | Rejected | hill climb of 20000 moves on 8 finished level-268 mazes: reverse felt 384 to 405 (phone), 331 to 356 (desktop); the board is full, so a cell-neutral move almost never finds a pocket |
| Partial lure (a share of the forks) | Rejected as a ramp | measured mean reverse felt for a lure on 0 / 25 / 50 / 75 / 90 / 100 percent of the forks: 444 / 445 / 461 / 498 / 582 / 697. A fork's whole subtree is entered or skipped as one unit, so only the full lure moves it; the ramp is made of mazes instead (like the wrap fade) |
| Raise tuner caps, longer branches, more forks, more loops, shrink the route, lower the capacity share | Rejected earlier | `MAZER_PROGRESSION_GAUGES_2026-11-10.md` (capacity unchanged within noise; taper makes the other walkers 40 to 57 percent easier). Not re-measured |
| Wrap-aware decoys, more wrap corridors | Not adopted | a wrap is a free shortcut and was priced and faded out over 100-140 (PR #404); not re-measured |
| Start / goal placement (the Manhattan distance between them is 21 to 29 cells of 74 on the phone board at every level) | Not evaluated | observed only |
| Reverse floor 600 against 740 | 740 | share of lured mazes under the floor on the first landing: 0 to 1 percent at 400 to 600, 1 to 3 percent at 700, 2 to 5 percent at 740 (phone and desktop); a floor of 740 costs 1 to 2 more tuner restarts |
| More probes per lured fork (270 against 90) and an earlier tuner give-up | Rejected | no change in the landing share (desktop 75 percent first-base with the lure against 88 without), so the cost is capacity, not search |

### Why the lure works and what it costs

The explorer enters a side branch at a route cell when the branch's first cell is closer to the goal than the next route cell (a lure). Run backward, the same branch is entered only when its first cell is closer to the start than the previous route cell. The tuner only checked the first. Requiring both costs no floor (the same cells), keeps the forward number in its window, and the reverse explorer then pays for the whole subtree. Cost: fewer route sites qualify, so a base runs out of room more often (landing on the first base 75-77 against 88 percent on desktop at the top class), which is the 1.5 times generation cost above.

### Result, levels 268 to 388 (48 seeds per level and board)

| Level | Mastery share | Reverse felt phone / desktop | Two-way human-like phone / desktop | Forward felt |
|---:|---:|---|---|---:|
| 268 (before) | 0 | 475 / 439 | 1496 / 1487 | 759 |
| 328 | 50 percent | 602 / 598 | 1621 / 1743 | 759 |
| 360 | 77 percent | 713 / 703 | 1816 / 2076 | 759-760 |
| 388 and above | 100 percent | 767 / 760 | 1959 / 2162 | 759-760 |

Held-out gauges at the plateau, after against before (phone / desktop): route junctions 39.8 to 36.8 / 40.7 to 39.7, dead ends 86.9 to 81.5 / 88.3 to 84.5, board fill 0.47 / 0.49 unchanged, A* expansions 516 to 504 / 512 to 551, greedy cells 557 to 560 / 548 to 561, human-like forward 2816 to 3006 / 2547 to 3001, random walk 7174 to 5457 / 6754 to 7389. The one gauge that falls is the phone random walk (-24 percent; the desktop one rises 9 percent; 48 seeds, the walker's standard error is about 10 percent), and the structure counts fall 2 to 8 percent (a lured fork takes the room of some stubs). Decision: accepted, because the gauge that the lure targets (what a goal-end solver pays) rises 1.6 to 1.7 times.

Guarantees and their limits. By construction: forward felt in `[759, 760]`, exactly 70 fringe cells, every mastery maze at least 740 reverse steps (the selection tries the next base otherwise), levels 1 to 268 unchanged. Statistical only: the share of mastery mazes (so the mean reverse felt) rises with the level; two single mazes of adjacent levels can invert, unlike the felt ladder up to 268.

### What if the lure covered levels 2 to 268 (was not applied on 2026-11-10; applied by ladder v2, see below)

Forced on for 40 seeds per level and board, reverse felt before to after: level 30 118 to 232 / 157 to 259; level 100 188 to 352 / 195 to 290; level 150 372 to 614 / 394 to 601; level 198 461 to 748 / 437 to 684 (phone / desktop), forward felt unchanged. It would roughly double what a backwards solver pays across the mid ladder, but it reshuffles all 188 non-trivial regression hashes and was not applied; it is a decision for the owner (a ladder v2), and it adds no levels.

## Ladder v2 (2026-11-11): the double lure on every level from 2, the mastery tier removed

Owner decision: "apply the double lure to levels 2-268" (card MAZER-PROG-015). Modelled difficulty (deterministic walkers), same two frozen boards, no hazards, no board or tile change, not player-tested, not checked on a device. Machine-readable before/after profile: `docs/research/MAZER_PROGRESSION_LADDER_V2_2026-11-11.json`.

### What changed

- **The lure is on for every maze of every level from 2** (`tuneMazeFeltToTarget(..., { doubleLure: true })` in `selectLegacyGeometryBudgetMaze`). Level 1 is the straight corridor and does not go through the tuner (golden hash identical on both boards).
- **A reverse floor replaces the mastery share.** Every maze must pay at least `GEOMETRY_BUDGET_REVERSE_FLOOR_PERMILLE = 975` of its level's forward target when the felt explorer runs goal to start (priced like the forward number), or the selection tries the next base. 975 permille is exactly 740 at the top class (the floor the tier shipped with) and 86 at level 2. A maze that owns a wrap corridor is held to `GEOMETRY_BUDGET_REVERSE_FLOOR_WRAP_PERMILLE = 400` instead (`resolveGeometryBudgetReverseFloor(level, wrapRungs)`), see "Why a lower floor with a wrap". `maze.reverseStats = { reverseFelt, floor }` records both on every ladder maze.
- **Decision on the mastery tier (levels 269 to 388): removed, not reduced.** The tier existed to phase the lever in (a seeded share of lured mazes rising 1/120 per level, floor 740 on the lured ones). With the lure on every level there is no share to ramp: it would be 100 percent from level 2 and `masteryPermille` would read 1000 everywhere, a meaningless counter. The reverse number cannot rise past 268 either: at the plateau it is 759 to 767 against a forward 760 (reverse is 99 to 100 percent of forward, the board's capacity), so a reverse-floor ramp over 269 to 388 would be a floor at the ceiling from the first level. So the tier is gone with everything that carried it: `GEOMETRY_BUDGET_MASTERY_SPAN`, `GEOMETRY_BUDGET_MASTERY_REVERSE_FLOOR`, `resolveGeometryBudgetMasteryPermille`, `resolveGeometryBudgetMastery`, `masteryStats`, the `mastery` regime and `masteryPermille`. `GEOMETRY_BUDGET_SATURATION_LEVEL` and `LAST_BUDGET_LEVEL` are 268 again, `hazardBudgetLevels = level - 268`, and `resolveContinuousDifficulty` reports `reverseFloor` (steps; 0 for the corridor) in place of `masteryPermille`. Levels 269 to 388 now generate the level-268 class (same target, 70 fringe cells, floor 740, mazes differ by seed), exactly like every level past 268 did before the tier; the level-preview jump list loses 330 and 388 and gains 300. What the tier bought (a reverse floor of 740 on every maze at the top) is now the plateau's own guarantee, from level 198.
- **Generator cost fixes that came with it** (all byte-neutral: same mazes, fewer steps): the explorer rebuilds its goal-distance table only when the goal changes; a base that is not selected is no longer assembled (route search and wrap diagnostics are run only for the maze that becomes the selection); the tuner takes an `attempts` option and the ladder passes `GEOMETRY_BUDGET_TUNE_ATTEMPTS = 2` (measured: a restart of a base that missed its window or floor rescues it about one time in seven, a new base costs the same and lands more often; 6 restarts at level 100 cost 56 ms mean, 2 cost 31 ms before the other fixes); and `GEOMETRY_BUDGET_WRAP_BASE_ATTEMPTS` goes from 6 to 12 so the lure does not push mazes of the wrap bands onto plain bases (see "Wrap rules").

### Why a lower floor with a wrap

Measured at level 100 (desktop, forced lure, no floor): plain maze reverse felt 565 against a forward 564 (the lure mirrors it), a maze with a wrap corridor 290. The wrap saving (about 60 to 85 steps of shortest route) is priced out of both numbers, but the reverse explorer takes the corridor more directly than the forward one, so a wrapped maze cannot be made to mirror. A 97.5 percent floor on wrapped mazes cost a wrapped base 4 to 5 builds on average at levels 30 to 140 and a worst build of 1087 ms at a 4x throttle (before: 410); 40 percent costs about 1.3 to 1.6 times the old cost and still lifts the wrapped reverse felt from 118 to about 365 at level 30 and from 188 to about 490 at level 100. The floor is a guarantee, not the mean: the mean reverse felt is higher (table below).

### Before / after (48 seeds per level and board, forward felt, reverse felt, two-way human-like, random walk)

Before = main with the mastery tier (PR #415, `dbb563aa`), after = this tree; same seeds. Means of the gauges in `scripts/analysis/progression-gauges.ts`.

| Level | Board | Forward felt | Reverse felt | Two-way human-like | Random walk |
|---:|---|---|---|---|---|
| 1 | phone / desktop | 48 / 42 -> 48 / 42 | 48 / 42 -> 48 / 42 | 48 / 42 -> 48 / 42 | 48 / 42 -> 48 / 42 |
| 10 | phone | 215 -> 216 | 120 -> 219 | 162 -> 200 | 365 -> 303 |
| 10 | desktop | 215 -> 216 | 112 -> 199 | 164 -> 160 | 341 -> 295 |
| 30 | phone | 416 -> 416 | 124 -> 374 | 314 -> 432 | 644 -> 619 |
| 30 | desktop | 417 -> 417 | 148 -> 383 | 312 -> 395 | 802 -> 651 |
| 50 | phone | 464 -> 464 | 168 -> 421 | 367 -> 461 | 963 -> 714 |
| 50 | desktop | 463 -> 464 | 202 -> 426 | 415 -> 376 | 825 -> 713 |
| 100 | phone | 564 -> 564 | 190 -> 484 | 406 -> 545 | 1304 -> 1116 |
| 100 | desktop | 564 -> 564 | 209 -> 493 | 474 -> 448 | 930 -> 939 |
| 198 | phone | 759 -> 760 | 475 -> 767 | 900 -> 881 | 2088 -> 1370 |
| 198 | desktop | 759 -> 760 | 451 -> 759 | 791 -> 1143 | 1865 -> 1560 |
| 268 | phone | 759 -> 760 | 475 -> 767 | 1496 -> 1681 | 7174 -> 6019 |
| 268 | desktop | 759 -> 760 | 439 -> 759 | 1487 -> 2146 | 6754 -> 7444 |
| 388 | phone | 760 -> 760 | 767 -> 767 | 1959 -> 1681 | 5457 -> 6019 |
| 388 | desktop | 760 -> 759 | 760 -> 759 | 2162 -> 2146 | 7389 -> 7444 |

Reading. The forward felt is the same number to within the window (the means differ by the 0 or 1 of `[T, T + 1]`; 759 to 760 is the level-198 window). The reverse felt (what a solver pays who works from the goal end) rises 1.8 to 3.0 times from level 10 to 100 and 1.6 to 1.7 times at 198 and 268; it is now 99 to 100 percent of forward at the plateau. Level 388 before and after are the plateau class in both trees: before, the mastery tier had to produce it, now level 268 has it. Honest costs: the held-out walkers are not the target of the lure and they move both ways. The random walk falls at 10 of the 12 cells of levels 10 to 268 (phone -17 percent at level 10, -4 at 30, -26 at 50, -14 at 100, -34 at 198, -16 at 268; desktop -13, -19, -14 and -16 percent at 10, 30, 50 and 198; the desktop cells of 100 and 268 rise 1 and 10 percent; 48 seeds, the walker's standard error is about 10 percent; level 388 repeats level 268 now). The two-way human-like explorer falls at 4 of those 12 (desktop levels 10, 50 and 100 by 2 to 9 percent, phone level 198 by 2 percent, all within noise at 48 seeds) and rises at the others by 12 to 44 percent. The structure counts fall: route junctions 12.4 to 8.0 (phone) and 11.9 to 8.1 (desktop) at level 198, 7.5 to 6.5 and 7.1 to 6.1 at level 100, 39.8 to 35.3 and 40.7 to 39.9 at level 268, dead ends 2 to 10 percent lower: a lured fork takes the room of some stubs. Accepted for the same reason as in the tier: the gauge the lure targets (what a goal-end solver pays) rises 1.6 to 3 times while the forward number is untouched.

### Wrap rules, loops

Wrap bands unchanged (no wrap below level 10 or from level 140, one corridor from 10, two from 30, fade 100 to 140). The lure makes a wrapped base land about one try in four (it was about three in five), so the number of base mazes tried with the rolled wraps before the fallback to a plain base went from 6 to 12 (`GEOMETRY_BUDGET_WRAP_BASE_ATTEMPTS`). Measured (100 to 200 seeds per board): 99.5 to 100 percent of the mazes of levels 10 to 60 own their band's wraps, 97 to 99 percent at level 99 and 94 to 97 percent at level 100, where both wraps and the most loops of the band meet (main: 100 percent everywhere; with the old 6 tries the lure alone left 95 to 99 percent at level 30 and 70 to 79 percent at level 100). The few that fall back are held to the plain floor. So the wrap rule is kept for the band but is not 100 percent at its last levels; raising the tries to 16 gives 96 to 98.5 percent at level 100 for a node worst build of about 115 ms (12: 75 ms). Loop plans are unchanged but fewer looped mazes land at the end of the band, because a looped base that cannot land is retried plain after 6 bases by the existing rule (`GEOMETRY_BUDGET_LOOP_BASE_ATTEMPTS`, not changed; wraps take the priority): looped share level 100 phone 44 of 100 against 56, desktop 36 against 55; levels 198 and 268 44 to 46 against 45 to 48. With the loop tries at 12 as well the level-100 shares read 52 and 50 and the wraps 92 and 90 percent.

### Generation time (budget: worst build 400 ms at a 4x CPU throttle)

Node 1x (100 seeds per cell, this machine, `progression-maze-dump.ts`; mean / p95 / worst, ms):

| Level | Board | Before | After |
|---:|---|---|---|
| 30 | phone | 9.8 / 25.7 / 42.2 | 12.6 / 28.4 / 80.5 |
| 30 | desktop | 8.3 / 26.5 / 32.3 | 12.8 / 29.5 / 54.9 |
| 100 | phone | 15.2 / 41.0 / 82.7 | 22.1 / 60.8 / 83.9 |
| 100 | desktop | 21.9 / 61.5 / 98.7 | 27.4 / 66.2 / 82.6 |
| 198 | phone | 8.2 / 16.7 / 21.2 | 9.4 / 29.0 / 38.9 |
| 198 | desktop | 12.3 / 32.1 / 52.4 | 14.9 / 39.6 / 51.5 |
| 268 | phone | 11.6 / 20.2 / 26.0 | 12.1 / 36.9 / 43.6 |
| 268 | desktop | 20.2 / 60.1 / 109.5 | 19.0 / 44.9 / 70.9 |

Headless Chromium 4x CPU throttle (`progression-generation-timing.mjs`, dev-server modules, 100 seeds per cell, mean / p95 / worst single, ms; two runs each, before on a checkout of `dbb563aa`, after on this tree, same machine, interleaved):

| Level | Board | Before (run 1; run 2) | After (run 1; run 2) |
|---:|---|---|---|
| 30 | phone | 38 / 88 / 124; 32 / 69 / 108 | 57 / 135 / 191; 58 / 144 / 185 |
| 30 | desktop | 47 / 132 / 587; 37 / 112 / 161 | 57 / 140 / 174; 57 / 147 / 173 |
| 100 | phone | 88 / 275 / 437; 66 / 178 / 340 | 108 / 313 / 357; 107 / 315 / 355 |
| 100 | desktop | 100 / 231 / 1727; 80 / 213 / 341 | 135 / 328 / 393; 137 / 328 / 365 |
| 198 | phone | 41 / 97 / 172; 39 / 88 / 167 | 50 / 158 / 208; 50 / 164 / 235 |
| 198 | desktop | 51 / 136 / 256; 49 / 134 / 223 | 70 / 182 / 250; 71 / 175 / 247 |
| 268 | phone | 55 / 105 / 202; 54 / 104 / 194 | 63 / 187 / 241; 63 / 174 / 263 |
| 268 | desktop | 77 / 229 / 369; 77 / 228 / 369 | 89 / 220 / 337; 89 / 208 / 344 |

Reading. Means rise 1.2 to 1.8 times and the 95th percentile 1.0 to 1.8 times (level 198 phone 97 to 160, level 268 phone 105 to 180). The worst single build is higher than the best before run in 5 of 8 cells, by at most 70 ms (level 30 phone 124 to 191, level 198 phone 172 to 235, level 268 phone 202 to 263, level 30 desktop 161 to 174, level 100 desktop 341 to 393), lower at level 268 desktop (369 to 344), and no cell exceeds 393 ms; the before runs had one 587 ms and one 1727 ms outlier that are machine noise (the same cells read 161 and 341 in the other run). Before the generator fixes above the same code measured level 100 desktop at a mean 422 / worst 1087 ms and level 268 desktop at a worst 633 ms, so the fixes are what keeps it under the target. The mastery tier's own cost (levels 269 to 388, p95 336 to 467 ms) is gone with the tier: those levels are the level-268 class.

### Hash review (golden fixture `tests/fixtures/progression-ladder-golden.v1.json`)

Regenerated with `npx vite-node scripts/analysis/progression-ladder-golden.ts --write`. Level 1 is identical on both boards. Of the 598 non-level-1 hashes (299 levels, two boards), 592 changed: phone 295 of 299, desktop 297 of 299. The six that did not change are levels that were already lured mazes on main (the tier's seeded roll) and are the same maze in the new recipe (the level-268 class with the lure, floor 740 and 70 fringe cells): phone 281, 282, 289 and 299; desktop 281 and 299. The seed, scale and level count of the fixture are unchanged. (The card text spoke of "188 non-level-1 hashes": that was a count of the non-trivial maze levels, not of the fixture's entries.)

### Not verified

No human play-test; no device (headless Chromium and node only); the timing is two interleaved runs on one noisy machine; gauges are 48 seeds per cell (the walkers' noise is about 10 percent); the lure's cost to the random walk and the structure counts is measured, not judged by a player; the calibration script (`generate-geometry-budget-targets.ts`) is unchanged and still measures a lure-free base (ceiling 760 and fringe cap 70 stay valid for the forward number, which is what the ladder steers on); with the lure the same capacity pass reads a 25th percentile of 753 (so about one base in four misses 760 and the next base is tried, as the first-landing rate above shows).

## The honest ceiling (as of 2026-11-10; the ceiling is level 268 since ladder v2)

After level 388 the geometry cannot rise on this board: forward felt at the board's capacity ceiling (760), reverse felt equal to it, fringe at its capacity (70 cells, calibrated), floor about 48 percent of 50. Levels past 388 keep their seeds (every clear is a different maze) but not a harder class. Next levers, in order: (1) hazards (obstacles, then enemies): `hazardBudgetLevels = level - 388` is the budget they owe and starts at 0 at level 388; needs MAZER-HAZ-002; (2) the "ladder v2" option above (reverse-solve resistance for levels 2 to 268, an owner decision about reshuffled mazes); (3) a bigger board past a level, only if hazards are rejected (the zoom lever the owner ruled out).

## Reproduce

```
npx vite-node --script scripts/analysis/progression-maze-dump.ts --out=tmp/audit.json --levels=1,2,10,30,50,100,150,198,268,300,328,360,388,400,1000,5000,18000,100000 --seeds=48
npx vite-node --script scripts/analysis/progression-gauges.ts compute --dump=tmp/audit.json --out=tmp/audit.gauges.json
node scripts/analysis/progression-audit-report.mjs --gauges=tmp/audit.gauges.json --out=docs/research/MAZER_PROGRESSION_FINAL_AUDIT_2026-11-10.json
npx vite-node scripts/analysis/progression-ladder-report.ts --levels=2..420 --seeds=8 --assert
npx vite-node scripts/analysis/progression-ai-solvability.ts --levels=266..400,1000,18000 --seeds=3
node scripts/analysis/progression-generation-timing.mjs --levels=198,268,300,330,360,388,1000 --seeds=40 --throttle=1,4
```

## Limits

Modelled walkers; the reverse explorer is the same pull-to-goal model run backward, not a person; 48 to 200 mazes per cell; the 4x timing is one run on a noisy machine; no player and no device. A player who never solves backwards gains nothing from the mastery tier except a lower chance that a wrong first guess looks promising from both ends.
