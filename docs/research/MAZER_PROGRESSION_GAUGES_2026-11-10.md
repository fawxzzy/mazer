# Mazer progression gauges (2026-11-10)

Scope: how difficulty scales across levels 1..300 on the two frozen boards (phone 25 x 51, desktop 45 x 27), measured before (main `8cf9bd67`) and after the multiple-routes change, with several independent gauges instead of the one number the generator steers on. Source of truth for the design is the "2026-11-10 Multiple routes" section of `docs/research/MAZER_LEVEL_RANK_COMPLEXITY_CONTRACT.md`. Everything here is modelled difficulty (walkers), not player-tested.

## How to reproduce

Each build is dumped once (the only tree-specific step), then gauged and compared by tree-independent scripts.

```
npx vite-node --script scripts/analysis/progression-maze-dump.ts --out=tmp/after.json --levels=1..300 --seeds=6
npx vite-node --script scripts/analysis/progression-gauges.ts compute --dump=tmp/after.json --out=tmp/after.gauges.json
npx vite-node --script scripts/analysis/progression-gauges.ts analyze --after=tmp/after.gauges.json --before=tmp/baseline.gauges.json --out=tmp/report.json
npx vite-node --script scripts/analysis/progression-loop-pricing.ts --levels=40,80,120,160,198 --seeds=60
npx vite-node --script scripts/analysis/progression-contact-sheets.ts --dump=tmp/after.json --out=tmp/sheets --tag=after
```

(`vite-node --script` is what `npm run generation:delivery-report` already uses; no package.json script was added, which would be Wave 5B.) The baseline dump is made the same way from a checkout of `origin/main` with these scripts copied in. 3600 mazes per build (300 levels x 2 boards x 6 seeds); dump about 30 s, gauges about 10 s.

## The gauges

| Group | Gauge | Question it answers |
|---|---|---|
| route | Shortest route (A*) | How far is the goal for a solver who knows the map? |
| route | Explorer route | How long is the route a goal-pulled explorer finally walks? |
| walker | Pull-to-goal steps | How many moves does a goal-pulled explorer need, dead ends included? (the generator steers on this) |
| walker | Priced felt (steps - loop saving) | The ladder's steered number: explorer steps minus what loops give back to a player who knows the map |
| walker | Pull steps, tie-averaged | The same explorer averaged over 8 other tie-breaks (the unbiased price) |
| walker | Human-like explorer steps | Moves for an explorer that keeps straight, leans to the goal and forgets after 48 cells (median of 8) |
| walker | Random-walk steps | Moves for a non-backtracking random walk (median of 5) |
| structure | Decision points on route | Junctions the shortest route passes through |
| structure | Misleading junctions | Route junctions where the cell nearest the goal is the wrong way |
| structure | Ambiguous junctions | Route junctions with 2+ equally promising ways (within one cell of goal distance) |
| structure | Dead ends | Dead-end tips in the whole maze |
| structure | Deepest dead end | Cells in the longest dead-end branch (to its junction) |
| structure | Branching factor | Mean forward options at a route junction |
| structure | Board fill | Share of the board that is floor |
| loops | Independent cycles (all) | Independent cycles in the floor graph, wrap corridors included |
| loops | Interior loops | Independent cycles that do not need a wrap |
| loops | Loop stretches on route | Places on the shortest route with a real choice of ways |
| loops | Choice stakes | Steps a wrong pick costs, summed over route choices |
| loops | Tied alternates | Route choices whose two ways are within 12 percent of each other |
| loops | Shortcut value (slack) | Explorer route minus shortest route: what knowing the map saves |
| cost | A* expansions | Nodes an ideal solver expands |
| cost | Greedy-solver cells | Cells a greedy goal-first walker visits |

All gauges read the floor grid with torus adjacency (a floor cell on one border is adjacent to the floor cell on the opposite border, as the game's wrap corridors work). The stochastic walkers use a fixed seeded stream, so a dump always gauges the same. The generator steers on one gauge only (priced felt); every other column is a held-out check.

## Results: per-band means, before and after

| Gauge | Build | L1 | L2-9 | L10-24 | L25-49 | L50-99 | L100-149 | L150-197 | L198+ |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Priced felt (steps - loop saving) | main | 45.0 | 145 | 343 | 434 | 512 | 612 | 711 | 759 |
| | this PR | 45.0 | 145 | 343 | 434 | 512 | 612 | 711 | 759 |
| Pull-to-goal steps | main | 45.0 | 145 | 343 | 434 | 512 | 612 | 711 | 759 |
| | this PR | 45.0 | 145 | 343 | 435 | 514 | 620 | 715 | 759 |
| Shortest route (A*) | main | 45.0 | 74.0 | 105 | 87.2 | 89.3 | 174 | 251 | 268 |
| | this PR | 45.0 | 75.4 | 107 | 90.0 | 87.5 | 156 | 219 | 232 |
| Explorer route | main | 45.0 | 76.0 | 133 | 164 | 189 | 228 | 265 | 280 |
| | this PR | 45.0 | 75.4 | 133 | 162 | 188 | 222 | 247 | 252 |
| Human-like explorer steps | main | 45.0 | 138 | 522 | 617 | 715 | 1239 | 1767 | 1940 |
| | this PR | 45.0 | 142 | 543 | 670 | 746 | 1177 | 1706 | 2275 |
| Random-walk steps | main | 45.0 | 217 | 631 | 691 | 751 | 1437 | 2077 | 1498 |
| | this PR | 45.0 | 221 | 651 | 716 | 815 | 1434 | 2034 | 2085 |
| Greedy-solver cells | main | 46.0 | 114 | 244 | 304 | 354 | 425 | 493 | 527 |
| | this PR | 46.0 | 113 | 244 | 307 | 357 | 428 | 487 | 517 |
| A* expansions | main | 46.0 | 110 | 221 | 219 | 238 | 352 | 457 | 508 |
| | this PR | 46.0 | 111 | 224 | 225 | 235 | 350 | 448 | 471 |
| Decision points on route | main | 0.00 | 3.84 | 6.78 | 5.87 | 5.52 | 10.2 | 13.2 | 12.5 |
| | this PR | 0.00 | 3.90 | 6.86 | 5.91 | 5.91 | 10.0 | 12.9 | 13.4 |
| Misleading junctions | main | 0.00 | 3.74 | 5.57 | 4.28 | 3.94 | 9.47 | 13.0 | 12.3 |
| | this PR | 0.00 | 3.79 | 5.71 | 4.39 | 4.04 | 8.11 | 11.3 | 12.5 |
| Ambiguous junctions | main | 0.00 | 2.58 | 3.88 | 3.40 | 3.02 | 6.17 | 7.85 | 6.75 |
| | this PR | 0.00 | 2.59 | 3.93 | 3.38 | 3.16 | 5.64 | 7.47 | 7.58 |
| Dead ends | main | 0.00 | 5.70 | 13.4 | 17.0 | 18.7 | 21.6 | 24.0 | 25.1 |
| | this PR | 0.00 | 5.93 | 13.7 | 17.5 | 19.0 | 21.4 | 23.6 | 29.8 |
| Deepest dead end | main | 0.00 | 8.55 | 12.9 | 14.2 | 14.7 | 17.2 | 20.0 | 20.9 |
| | this PR | 0.00 | 10.8 | 13.9 | 14.5 | 14.9 | 17.6 | 20.2 | 17.6 |
| Board fill | main | 0.04 | 0.10 | 0.22 | 0.28 | 0.32 | 0.36 | 0.40 | 0.42 |
| | this PR | 0.04 | 0.10 | 0.22 | 0.28 | 0.33 | 0.37 | 0.41 | 0.42 |
| Interior loops | main | 0.00 | 0.22 | 0.25 | 0.34 | 0.26 | 0.27 | 0.29 | 0.17 |
| | this PR | 0.00 | 0.00 | 0.01 | 0.12 | 0.55 | 1.47 | 1.80 | 1.42 |
| Loop stretches on route | main | 0.00 | 0.21 | 1.07 | 1.07 | 1.02 | 0.56 | 0.25 | 0.17 |
| | this PR | 0.00 | 0.00 | 0.98 | 1.03 | 1.10 | 1.04 | 0.91 | 0.50 |
| Shortcut value (slack) | main | 0.00 | 2.02 | 28.1 | 76.4 | 99.8 | 54.2 | 14.0 | 11.2 |
| | this PR | 0.00 | 0.00 | 26.1 | 71.9 | 101 | 66.1 | 27.8 | 20.3 |

Share of mazes with at least one interior loop (a cycle that does not need a wrap), and of mazes that are exactly one route:

| Band | main | this PR | this PR, single route |
|---|---:|---:|---:|
| L1 | 0% | 0% | 100% |
| L2-9 | 22% | 0% | 100% |
| L10-24 | 23% | 1% | 0% |
| L25-49 | 30% | 10% | 0% |
| L50-99 | 24% | 33% | 0% |
| L100-149 | 24% | 59% | 23% |
| L150-197 | 26% | 61% | 39% |
| L198+ | 17% | 58% | 42% |

(Levels 10-119 also carry a wrap corridor, which is a loop through the board edge; "single route" there is 0 by definition. The 22 percent of levels 2-9 mazes that had a loop on main were accidental.)

## Trend, monotonicity, plateaus, jumps, saturation

Computed on the per-level means (12 mazes per level) of levels 2 to 197. A "significant fall" is a level-to-level drop of the mean larger than two standard errors; a "smoothed fall" is a drop of the 9-level smoothed mean by more than 3 percent of the gauge's range.

| Gauge | Group | Rank corr. with level (main) | Adjacent-level ordering | 25 apart | Significant falls | Smoothed falls | Saturates at |
|---|---|---:|---:|---:|---:|---:|---:|
| Shortest route (A*) | route | 0.59 (0.70) | 56% | 60% | 5 | 22 | 198 |
| Explorer route | route | 0.82 (0.95) | 69% | 87% | 3 | 6 | 197 |
| Pull-to-goal steps | walker | 1.00 (1.00) | 83% | 99% | 0 | 0 | 186 |
| Priced felt (steps - loop saving) | walker | 1.00 (1.00) | 100% | 100% | 0 | 0 | 187 |
| Pull steps, tie-averaged | walker | 0.99 (0.98) | 80% | 98% | 1 | 0 | 186 |
| Human-like explorer steps | walker | 0.51 (0.58) | 52% | 60% | 4 | 24 | 198 |
| Random-walk steps | walker | 0.57 (0.58) | 53% | 59% | 6 | 20 | 197 |
| Decision points on route | structure | 0.53 (0.52) | 52% | 58% | 7 | 29 | 198 |
| Misleading junctions | structure | 0.48 (0.55) | 52% | 56% | 10 | 28 | 198 |
| Ambiguous junctions | structure | 0.47 (0.49) | 53% | 57% | 3 | 26 | 198 |
| Dead ends | structure | 0.66 (0.73) | 52% | 64% | 10 | 1 | 198 |
| Deepest dead end | structure | 0.49 (0.54) | 50% | 58% | 5 | 6 | 198 |
| Branching factor | structure | 0.10 (0.09) | 50% | 51% | 5 | 23 | 109 |
| Board fill | structure | 0.91 (0.93) | 51% | 77% | 9 | 0 | 195 |
| Independent cycles (all) | loops | 0.08 (-0.52) | 48% | 57% | 19 | 36 | 198 |
| Interior loops | loops | 0.48 (-0.00) | 48% | 54% | 18 | 26 | 198 |
| Loop stretches on route | loops | -0.05 (-0.54) | 49% | 51% | 9 | 44 | 198 |
| Choice stakes | loops | -0.26 (-0.42) | 49% | 51% | 6 | 34 | 198 |
| Tied alternates | loops | 0.14 (-0.09) | 50% | 50% | 6 | 44 | 198 |
| Shortcut value (slack) | loops | -0.20 (-0.36) | 48% | 53% | 6 | 30 | 198 |
| A* expansions | cost | 0.67 (0.72) | 53% | 63% | 3 | 9 | 198 |
| Greedy-solver cells | cost | 0.97 (0.97) | 59% | 92% | 4 | 0 | 195 |

- **Priced felt** (the steered number) is monotone by construction: 0 falls, 100 percent ordering for adjacent levels, 3588 of 3588 mazes in [T, T + 1].
- **Raw explorer steps** are no longer strictly ordered between adjacent levels (83 percent) because a looped maze carries the saving on top of T; they stay at least T and rise 99 percent of the time over 25 levels.
- **Greedy-solver cells** (an independent goal-first solver) is the best held-out gauge: rank correlation 0.97, 92 percent at 25 levels apart, 0 smoothed falls.
- **Board fill** rises smoothly (0.91) and saturates near 187 to 195.
- **Shortest route (A*)** is flat or falling from level 10 to 99 (107, 90, 87 by band) and doubles at level 120 (86 at 119, 161 at 120) because the wrap corridors are free shortcuts. The one real cliff in the ladder; the steered number does not move there.
- **Human-like and random walkers** are too noisy to rank adjacent levels (rank correlation 0.51 and 0.57); trust them over bands of 100 or more mazes only. They are 8 to 15 percent lower at equal explorer steps when loops are shortcuts or alternates (table below), which is why the landed number is priced.
- **Saturation.** Every steered and most structural gauges reach their plateau at 186-198, consistent with the declared saturation level 198 (`GEOMETRY_BUDGET_SATURATION_LEVEL`); the ceiling calibration `--check` still passes at 760.
- **Per-level step of the schedule** (priced explorer steps): +16 per level from 2 to 9 (rounded), +26 from 10 to 16, about +3 from 17 to 36, then +2. Past level 36 a level is harder than the last by the guarantee but by less than 0.5 percent: the board is full, and the next lever is the hazard layer or board size, not generation.

## What a loop does to the other gauges (paired experiment)

Same level, board and seed (levels 40, 80, 120, 160, 198; 60 seeds; both boards = 600 mazes per arm), one forced loop plan per arm. Percent against the single-route arm in brackets. Standard errors of the paired change (percent of the single-route mean): shortcuts human-like 4.5, random walk 3.2; alternates 4.1 and 3.7; decoys 4.0 and 3.3.

| Arm | Loops delivered | Explorer steps | Shortest route | Human-like | Random walk | Dead ends |
|---|---:|---:|---:|---:|---:|---:|
| single route | 0.00 | 603 | 190 | 1337 | 1560 | 21.5 |
| 3 shortcuts | 1.07 | 613 (1.8%) | 163 (-14.5%) | 1217 (-9.0%) | 1436 (-8.0%) | 21.7 (0.7%) |
| 3 alternates | 2.10 | 607 (0.8%) | 148 (-22.4%) | 1131 (-15.4%) | 1419 (-9.0%) | 21.4 (-0.7%) |
| 3 decoys | 0.71 | 603 (0.0%) | 190 (0.1%) | 1311 (-2.0%) | 1539 (-1.3%) | 20.7 (-3.9%) |
| one of each | 1.68 | 610 (1.2%) | 160 (-16.0%) | 1200 (-10.2%) | 1392 (-10.8%) | 20.9 (-2.9%) |

Reading: at equal explorer steps, shortcuts and alternates make held-out walkers 8 to 15 percent faster (2 to 3 standard errors), decoys leave them where they were and leave the shortest route untouched; shortcuts cut the shortest route by about 14 percent and alternates by about 22 percent in this forced, heavy plan (real plans carry 1 to 6 loops and a third are one way). Decision (contract): price the saving one for one, cap shortcuts at 12 percent per loop and 18 percent in total, and give shortcuts back as the ceiling nears.

## Generation time and menu AI

Real Chromium, dev-server modules, 30 seeds per level, 17 levels, both boards (`progression-generation-timing.mjs`). Per-level mean: median / worst; worst p95; worst single build. Targets: 4x median 150 ms, worst 400 ms.

| Throttle | main | this PR |
|---|---|---|
| 1x | median 6 / worst mean 9; p95 28; single 38 ms | median 7 / worst mean 11; p95 38; single 54 ms |
| 4x | median 31 / worst mean 72; p95 221; single 337 ms | median 38 to 42 / worst mean 58 to 73; p95 183 to 234; single 277 to 318 ms (two runs) |

Menu AI (`progression-ai-solvability.ts`): 2400 of 2400 runs cleared on both builds (levels 1..300, both boards, 2 seeds, ranks E and S). Mean walker steps by band, main against now (rank E): levels 2-9 77 / 78, 10-29 106 / 106, 30-119 93 / 88, 120-197 254 / 217, 198-300 256 / 292; worst single run 353 / 338 steps.

## Per-band assessment

- **L1.** A 45-cell straight corridor. No choice. Unchanged.
- **L2-9.** One short winding route, 3 to 4 junctions, 6 dead ends, a tenth of the board. Explorer steps 89 at level 2 to about 200 at level 9. Gentle. Now truly single route (main had an accidental loop in 22 percent of these mazes).
- **L10-24.** The first wrap corridor, a fifth of the board. The steepest stretch of the ladder: +26 steps per level from 10 to 16; the human-like walker pays about four times what it paid in 2-9. Loops begin at 12 but reach only a few percent of mazes here.
- **L25-49.** The same kind of maze, bigger, with both wraps. Small per-level step (about +3), so neighbouring levels are hard to tell apart. Shortest route dips because the wraps are shortcuts.
- **L50-99.** The flattest to play: +2 per level (0.4 percent). Cumulatively +100 explorer steps, but no single level feels different. A third of mazes now carry a loop.
- **L100-149.** The wraps retire at 120 and the ladder shows its cliff for held-out gauges (shortest route doubles, route junctions 4 to 10, random walk +67 percent) while the steered number does not move. About six mazes in ten carry loops from here.
- **L150-197.** Fuller board (41 percent), longer route, deeper dead ends; 61 percent looped, mostly alternates and decoys. Shortcuts thin out as pricing gives them back near the ceiling.
- **L198+.** One difficulty class by design (759 priced steps). 58 percent looped, 42 percent one way. Nothing past here gets harder until the hazard layer exists.

## What changed in the ladder, and what did not

Changed: levels 2-11 are guaranteed single route (accidental loops broken); loops from level 12 with variety, size scaling and three kinds; the landed number is priced for loop savings; the exact number is checked against its tie-averaged value; the plan falls back to a single route when a base cannot land with loops. Not changed: the target schedule, the ceiling (760) and saturation level (198), the style bands (wraps in 10-119), the board, hazards (dormant). Recommended next, in order: price the wrap saving like a loop saving (smooths the level-120 cliff, makes 10-119 harder by 8 to 20 percent: a product call); a steeper tail needs capacity, so hazards or a bigger board; keep the gauge suite in CI as an analysis-only job (it is not wired into `npm run test` to avoid a Wave 5B package.json change).

## Limits

Six seeds per level and board (3600 mazes per build); the walkers are models; the human-like gauge is not calibrated against real players; the dump script is tree-specific and was copied into a main checkout for the baseline.
