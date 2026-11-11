# Mazer progression engine: final audit and the mastery tier (2026-11-10)

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

### What if the lure covered levels 2 to 268 (not applied)

Forced on for 40 seeds per level and board, reverse felt before to after: level 30 118 to 232 / 157 to 259; level 100 188 to 352 / 195 to 290; level 150 372 to 614 / 394 to 601; level 198 461 to 748 / 437 to 684 (phone / desktop), forward felt unchanged. It would roughly double what a backwards solver pays across the mid ladder, but it reshuffles all 188 non-trivial regression hashes and was not applied; it is a decision for the owner (a ladder v2), and it adds no levels.

## The honest ceiling

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
