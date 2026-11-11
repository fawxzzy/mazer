# Mazer progression gauges (2026-11-10)

Scope: how difficulty scales across levels 1..300 on the two frozen boards (phone 25 x 51, desktop 45 x 27), measured before (main `8cf9bd67`) and after the multiple-routes change, with several independent gauges instead of the one number the generator steers on. Source of truth for the design is the "2026-11-10 Multiple routes" section of `docs/research/MAZER_LEVEL_RANK_COMPLEXITY_CONTRACT.md`. Everything here is modelled difficulty (walkers), not player-tested.

## Update: mastery tier (levels 269..388) and the reverse-solve audit

Superseded in part by `docs/research/MAZER_PROGRESSION_FINAL_AUDIT_2026-11-10.md`: the plateau described below as level 268 is now level 388, because the maze is also measured from the goal end (reverse felt) and the last 120 levels raise it; new gauges `reversePricedSteps`, `twoWayPricedSteps`, `reverseHumanSteps` and `twoWayHumanSteps` are in `lib/mazeGauges.ts`.

## Update: past level 198, the fringe (this change)

Owner report (from the installed app): the menu maze labelled level 18000 is not as complex as it should be. Cause, measured: every level from 198 on generated a maze of the same class (priced felt 759, about 530 floor cells of 1275, 30 junctions and 30 dead ends on both boards, the same numbers as level 30 to 40 in the shape of the maze), because the ladder is defined on one number, the pull-to-goal explorer's steps, and that number had reached what the frozen board holds. Everything below is modelled difficulty (walkers), not player-tested. Design and contract: "2026-11-10 Past level 198: the fringe" in `docs/research/MAZER_LEVEL_RANK_COMPLEXITY_CONTRACT.md`.

### Why the explorer number cannot rise further (the wall)

A finished top maze is route + wrong ground. The explorer pays one step per route cell and two per wrong cell, so a maze with F floor cells and a route of R cells reaches about 2F - R steps (checked on tuned mazes with an unreachable target: floor 546-584, route 222-301, steps 724-865 on 11 of 12, every visited floor cell). F is bounded: a maze of 1-wide corridors with 1-wide walls holds at most about half of the interior as floor (interior 1127 phone, 1075 desktop; the tuner is at 569 and 540, 50.5 and 50.2 percent). So the capacity is spent at level 198, and what is left is the route share: capacity pass over 320 base mazes, unreachable target, pooled quartile and median of the steps reached by route target 300 / 200 / 120: 781 / 807, 864 / 884, 935 / 956. Each 100 steps of route target costs 75-85 steps of capacity.

Levers evaluated with data:

| Lever | Result | Verdict |
|---|---|---|
| (a) raise the tuner caps (branch cap 40 to 80, forks 30 to 60, branch length) | capacity unchanged within noise (p25 827 to 830 phone, 773 to 778 desktop; median 838 to 839, 783 to 792): the floor is full, a longer branch only trades against a shorter one | no gain |
| (a) re-calibrate the ceiling at the old route target | pooled p25 781 against 760: +20 steps, ten levels | not worth a plateau move |
| (c) lower CAPACITY_SHARE | the first pass of this ladder already measured it: a pooled 780 ceiling made one in two desktop bases fail and the 4x worst case 645 ms; a higher share only moves the same wall by a few steps | rejected |
| (a) shrink the route to make room (taper) | works on the steered number: ceiling 930, saturation level 283, route target down to 117. But the held-out gauges fall: at level 283 against 198 the human-like explorer 1362 against 2275 (-40 percent), the random walk 888 against 2085 (-57), route junctions 7.7 against 13.4, shortest route 111 against 232, A* expansions 377 against 471 (6 seeds per level, both boards). It makes the maze easier by every walker except the steered one | rejected: it games the number |
| (b) more and shorter forks, denser junction growth in the tuner | at the level-198 target and route, dead ends 25-37 and route junctions 11-14 for every shape tried (forks 30 to 150, branch cap 40 to 8): the tuner's own sites do not make junction density | no gain |
| (b) more loops | loops compete for the same floor and are priced against the felt number; level 198 is already alternates and decoys, and the loop count is capped by the board share | no headroom |

### The lever that works: the fringe

The explorer does not enter a side stub of at most 3 cells at a junction (`FELT_VISION_CELLS`, "a person sees a stub for what it is"), so such a stub costs it nothing, and a finished top maze still has wall pockets in which one fits. Probe on finished level-198 ladder mazes (8 seeds per board), stubs of 1-3 cells added greedily and kept only when the re-run explorer's step count is exactly unchanged: 113 stub cells fit on the phone board and 88 on desktop, with the priced felt unchanged by construction and the shortest route untouched:

| Gauge (mean of 8 mazes) | Phone before | after | Desktop before | after |
|---|---:|---:|---:|---:|
| Route junctions (decision points) | 12.3 | 50.8 | 11.5 | 39.3 |
| Dead ends | 31.4 | 110.5 | 26.5 | 96.3 |
| Board fill | 0.415 | 0.504 | 0.433 | 0.506 |
| Random-walk steps | 1997 | 10661 | 1977 | 8066 |
| Human-like explorer steps | 1894 | 3984 | 2192 | 2384 |

So the fringe is real structure (a junction and a dead end per stub, the board filled to its 50 percent limit) that the steered number cannot see. Implemented as lever 3 of the felt tuner (`legacyMazeFeltTuning.ts`, option `fringeCells`) and wired to the ladder as a second, strictly ordered number: from the felt saturation level (198) on, level N carries exactly `N - 198` fringe cells (`GEOMETRY_BUDGET_FRINGE_STEP = 1`), the felt value stays in the top window `[759, 760]`, and the pair is compared lexicographically, so level N + 1 is strictly harder than level N for any two seeds (asserted). A base that cannot hold the count is replaced by the next base, like a base that cannot reach the felt number.

### The cap (calibration)

`scripts/analysis/generate-geometry-budget-targets.ts` now has a second pass: at the felt saturation level, with that level's loop plan and caps, land the top target and ask for more stub cells than any maze holds. Over 320 bases, 299 landed (93 percent); cells placed: min 70, median 99. The cap is the lowest per-board quantile at `fringeShare = 0.95`, rounded down to a multiple of 5: phone p5 87, desktop p5 73, so `GEOMETRY_BUDGET_FRINGE_CAP = 70` and `GEOMETRY_BUDGET_SATURATION_LEVEL = 198 + 70 = 268`. The share is tighter than the felt ceiling's 0.75 on purpose: at share 0.75 the cap was 80, and on desktop level 278 only 76 of 100 seeds landed on the first base (mean 23.6 ms, worst 120 ms in node at 1x, against 9 and 39 at level 198), which the 400 ms worst-build budget at 4x would not survive; at 0.95 it is 92 percent (200 seeds, mean 13.5, worst 74 ms). Ten levels were given up for that.

### Result: levels 198 to 268, before and after

40 seeds per level and board (80 mazes per level, `progression-maze-dump.ts --levels=190..290 --seeds=40`, gauged by `progression-gauges.ts compute`). Before = main (every level from 198 is the same class: priced 759, shortest 232, route junctions 13.4, dead ends 29.8, board fill 0.425, human-like 2275, random walk 2085, A* 471, greedy 517 in the 6-seed band means).

| Level | Priced felt | Shortest route | Route junctions | Dead ends | Board fill | Human-like | Random walk | A* expansions | Greedy cells |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 198 | 759.4 | 221 | 11.8 | 26.8 | 0.419 | 1723 | 1885 | 448 | 503 |
| 210 | 759.4 | 221 | 16.5 | 37.1 | 0.429 | 1848 | 2815 | 458 | 511 |
| 220 | 759.4 | 221 | 20.4 | 45.7 | 0.437 | 1987 | 3397 | 466 | 518 |
| 230 | 759.4 | 221 | 24.1 | 54.1 | 0.445 | 2533 | 3745 | 475 | 525 |
| 240 | 759.4 | 221 | 27.9 | 62.9 | 0.453 | 2493 | 4508 | 483 | 531 |
| 250 | 759.4 | 221 | 31.9 | 71.7 | 0.461 | 2490 | 5762 | 491 | 538 |
| 260 | 759.4 | 221 | 35.7 | 80.7 | 0.469 | 2684 | 6101 | 499 | 544 |
| 268 | 759.4 | 219 | 38.3 | 87.4 | 0.475 | 2591 | 6715 | 505 | 548 |

Per level over 199-268 (least-squares slope, rank correlation with level, share of adjacent levels that rise): route junctions +0.38 / 1.00 / 99 percent, dead ends +0.87 / 1.00 / 100, A* expansions +0.82 / 1.00 / 99, greedy cells +0.65 / 1.00 / 100, random walk +72 / 0.99 / 59, human-like +13.5 / 0.86 / 51 (the two walkers are noisy at 80 mazes per level, judge them over bands), priced felt and shortest route flat on purpose. Levels 268 and above are the same class again (level 300 equals level 268 in every gauge). Levels 1-198 are byte-identical: the gauges for levels 30, 100, 150 and 198 are equal to the digit on main and on this change, and the golden fixture changed only for levels 199-300.

Contact sheets (`progression-contact-sheets.ts`, seed index 0, levels 30, 198, 233, 268, 400, 600, both boards; local files, not committed): the level-30 maze fills half the board, the level-198 maze fills it with long corridors, and from 233 a comb of side stubs appears along the corridors and in the pockets, thicker at 268; 400 and 600 are the same class as 268 (the same maze at the same seed, since geometry is clamped).

### Checks

- Ladder (`progression-ladder-report.ts --levels=2..300 --seeds=8 --assert`): PASS. 390 consecutive-level pairs below the felt saturation with a minimum worst-seed gap of 1 (the worst maze of level N + 1 beats the best maze of level N for any two seeds), every maze landed in its window, and from 198 the felt value holds `[759, 760]`, every maze carries exactly its level's fringe and the worst seed of level N + 1 carries more fringe cells than the best seed of level N.
- Menu AI (`progression-ai-solvability.ts --levels=1..300 --seeds=2`, ranks E and S, both boards): 2400 of 2400 runs cleared.
- Golden fixture (`tests/fixtures/progression-ladder-golden.v1.json`): 204 hashes changed, 102 per board, exactly levels 199 to 300 on both boards; levels 1 to 198 are unchanged on both boards.
- Generation time (real Chromium, `progression-generation-timing.mjs`, 30 seeds, 18 levels (240 and 268 added), both boards; this change two runs, origin/main `ccb59428` one run): 4x throttle median 39 / 39 ms (main 39), worst per-level mean 66 / 64 (61), worst p95 176 / 184 (176), worst single build 246 / 242 (248); 1x median 7-8 (8), worst single 51-54 (47). Targets 150 and 400. The fringe costs about 4-8 ms more per build in node at 1x (level 268 mean 12-17 ms against 8-11 at level 198) and nothing in the browser worst case.

### Honest limit, and the next lever

The new plateau is level 268, and the reason is the board: the fringe fills the pockets the other levers left, and the finished maze is then at 47.5 percent floor against about 50 percent that corridors with walls allow (the cap stops at the 5th percentile of capacity, 70 cells, on purpose; the median base holds 99). One more cell per level is the finest strictly ordered step (a stub cell is the smallest unit; the felt number cannot step by less than 2 because its parity is fixed by the board), so 70 cells are 70 levels. The aim of a real rise to level 400-600 is not reachable on this board by generation alone: it would need 200-400 more cells of room, and a 25 x 51 board has none.

What is not claimed: the fringe makes the maze busier and costs the walkers that do not see through a stub (random walk x3, human-like +38 percent at level 268 on the 6-seed band means), but a stub of three cells or fewer is visible at a glance to a person, so it is a texture and a small decision tax, not a deep wrong turn; no player was tested. The steered number (felt 759) does not move for 70 levels by construction.

The next lever, after level 268, in order: (1) the hazard layer (obstacles, then enemies), which is what the saturation hand-off was built for; `hazardBudgetLevels = level - 268` from here (`legacyHazardHandoff.ts`, still dormant); it needs the unsigned contract (MAZER-HAZ-002). (2) A bigger board past a level: the only generation lever left, it scales the capacity with the area (and the ladder with the calibration run per board size), but it is the zoom lever the owner ruled out (tiles shrink on a phone), so it should come only if hazards are rejected. Recommendation: sign the hazard contract and let hazards start at level 268; do not spend more on this board's geometry (the three alternatives above were measured and none is a lever).

### Reproduce

```
npx vite-node scripts/analysis/generate-geometry-budget-targets.ts --check
npx vite-node --script scripts/analysis/progression-maze-dump.ts --out=tmp/new.json --levels=1..320 --seeds=6
npx vite-node --script scripts/analysis/progression-gauges.ts compute --dump=tmp/new.json --out=tmp/new.gauges.json
npx vite-node scripts/analysis/progression-ladder-report.ts --levels=2..300 --seeds=8 --assert
npx vite-node scripts/analysis/progression-ai-solvability.ts --levels=1..300 --seeds=2
npx vite-node --script scripts/analysis/progression-contact-sheets.ts --dump=tmp/sheet-levels.json --out=tmp/sheets --tag=after --levels=30,198,233,268,400,600 --seed=0 --tile=8
node scripts/analysis/progression-generation-timing.mjs --seeds=30 --throttle=1,4
```

### Limits

Modelled walkers only; 80 mazes per level for the table (6 seeds for the band means, 8 per board for the probe, 320 bases for the calibration, 100-200 seeds for the base-count checks); the human-like and random-walk means are noisy per level; the timing is two runs on one machine against one baseline run; no device was measured. The taper trial used 6 seeds per level and was run in a scratch tree before this design replaced it, so its numbers are not reproducible from this commit (the code is not kept).

---

## Update: wrap corridors are priced and fade out over levels 100-140 (PR #404, merged)

The suite below measured the multiple-routes change (PR #401) against the old main and found one cliff the steered number could not see: wrap corridors are in play at levels 10-29 (vertical) and 30-119 (both axes) and retired at level 120. This update closes it. Decision (owner delegated product judgement): retire the wraps gradually instead of at a level, and price them in the felt metric like a loop. Before = main `40cca7e9` (after #401), after = this change. Everything is modelled difficulty (walkers), not player-tested. Design and contract: "2026-11-10 Wrap corridors faded out and priced" in `docs/research/MAZER_LEVEL_RANK_COMPLEXITY_CONTRACT.md`.

### What the gauges saw (before)

200 mazes per level (100 seeds, both boards). Mean of levels 115-119 against 120-124: shortest route 91 to 191, route junctions 6.6 to 12.4, random walk 905 to 1748, human-like explorer 815 to 1384; the single step 119 to 120 is 94 to 182 for the shortest route. The steered number rose by exactly 2, as it should. The shortest-route gauge was also misleading in levels 10-99: it is flat or falling there (107, 90, 87 by band) because every wrap is a free shortcut.

### Paired experiment: how much does a wrap save, and what should it cost

`scripts/analysis/progression-wrap-pricing.ts`. Same level, board and seed, loops forced off, 8 levels (40, 60, 80, 100, 110, 120, 130, 139) x 2 boards x 30 seeds = 480 mazes per arm; the arm owns 0, 1 (vertical) or 2 wrap corridors and the generator adds a given percent of the wrap saving (shortest route with the wrap links severed minus shortest route with them) to its explorer target. At price 0 the explorer steps are equal by construction and the held-out gauges show what the wrap does on its own.

| Arm | Explorer steps | Shortest route | Human-like | Random walk | Greedy cells | A* expansions | Wrap saving kept |
|---|---:|---:|---:|---:|---:|---:|---:|
| plain | 558 | 211 | 1285 | 1600 | 392 | 382 | 0 |
| 1 wrap, price 0% | 558 | 146 | 1051 | 1161 | 391 | 320 | 53.6 |
| 1 wrap, price 50% | 584 | 147 | 1088 | 1208 | 404 | 328 | 52.4 |
| 1 wrap, price 100% | 600 | 156 | 1167 | 1312 | 412 | 349 | 41.8 |
| 1 wrap, price 150% | 602 | 165 | 1225 | 1381 | 413 | 367 | 29.4 |
| 2 wraps, price 0% | 558 | 96 | 807 | 849 | 388 | 261 | 84.6 |
| 2 wraps, price 50% | 597 | 99 | 854 | 898 | 407 | 273 | 77.6 |
| 2 wraps, price 100% | 617 | 108 | 960 | 994 | 416 | 300 | 59.0 |
| 2 wraps, price 150% | 618 | 117 | 922 | 1095 | 416 | 310 | 39.8 |

Paired change against the plain arm (percent of the plain mean, +-1 standard error), price 0: one wrap lowers the shortest route 30.6 +- 1.3, the human-like explorer 18.2 +- 4.2, the random walk 27.4 +- 3.4, A* expansions 16.2 +- 1.4 and leaves the greedy solver and the explorer's own route alone (-0.2 and -0.7); two wraps 54.6 +- 1.1, 37.2 +- 4.3, 46.9 +- 3.2, 31.6 +- 1.6 (greedy -1.1). A wrap is a much stronger easing than a loop (a forced plan of three shortcuts took the human-like explorer down 9.0 +- 4.5 percent and the random walk 8.0 +- 3.2).

Reading, honestly:

- Price 100 percent (the same rule as loops: each step the wrap saves is paid for by one more explorer step elsewhere) is what the data supports, not more. It closes a third to a half of the human-like gap (one wrap -18.2 to -9.1 percent, two wraps -37.2 to -25.3) and a fifth to a third of the random-walk gap (-27.4 to -18.0, -46.9 to -37.8). The explorer's steps rise by 7.5 and 10.6 percent.
- No price makes every held-out gauge equal to the plain maze. At 100 percent the greedy goal-first solver reads a wrap maze 5.1 and 6.2 percent HARDER than the plain one while A*, the human-like explorer and the random walk still read it easier (-8.5, -21.3 percent for A*). The break-even price for the human-like and random-walk pair is above the sampled range (150 percent leaves -9.1 and -29.9 percent); the greedy solver is already 3 to 4 percent harder at 50 percent.
- Pricing above 100 percent mostly changes WHICH wraps survive, not how hard the maze is: the mean wrap saving of the maze that is finally selected falls from 53.6 to 29.4 (one wrap) and 84.6 to 39.8 (two) between price 0 and 150, because a base whose wrap would push the raw target past what the tuner can build (ceiling 760) is rejected and the next base is tried. That filter is a feature: a wrap that is too good a shortcut is the first to go as a level nears the ceiling.
- Decision: 100 percent (`FELT_WRAP_PRICE_PERCENT`), the loop rule, with the residual stated above. The fade (below) is what shrinks the residual to nothing by level 140.

### The band of the fade, from data

The saving a wrap gives back (about 85 steps of shortest route for both wraps) has to be paid by the held-out gauges somewhere; a longer fade pays it at a lower rate per level. Four ends were dumped (levels 90-170, 40 seeds per level and board, fade start 100): slope of the shortest route and the random walk over levels 100 to the end, against the plain slope after it.

| Fade | Shortest route per level (plain 0.2-0.5) | Random walk per level (plain 4-6) | Largest 7-level-smoothed step / band median step (shortest, junctions, random walk, human-like) |
|---|---:|---:|---|
| 100 -> 130 | 3.4 | 26 | 2.2x, 2.8x, 4.0x, 3.9x |
| 100 -> 140 | 2.7 | 22 | 2.7x, 3.5x, 4.7x, 4.1x |
| 100 -> 150 | 2.3 | 20 | 2.5x, 2.7x, 2.8x, 4.9x |
| 100 -> 160 | 2.0 | 17 | 3.0x, 3.1x, 2.8x, 4.9x |
| old (cliff at 120) | one level of +88 (94 to 182) | one level of +790 (919 to 1709) | 10-19x |

Every candidate is a ramp; none has a step that stands out of the noise of 80 mazes per level. The end is chosen on cost. Past 140 each 10 more levels lower the slope by 0.3 to 0.7 steps while a wrap keeps getting dearer. The capacity probe (`progression-wrap-capacity.ts`, 40 seeds x 2 boards per cell, loops off, rungs forced) is the reason: a priced wrap maze needs T(N) plus its saving as raw explorer steps.

| Level | Wraps | T | First base lands | Fell back to plain | Mean saving kept | Raw steps needed | Bases tried | ms (node, 1x) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 1 | 563 | 93% | 0% | 51.0 | 614 | 1.09 | 11 |
| 100 | 2 | 563 | 71% | 0% | 84.5 | 648 | 1.52 | 16 |
| 120 | 1 | 603 | 79% | 0% | 41.8 | 645 | 1.25 | 11 |
| 120 | 2 | 603 | 46% | 1% | 55.4 | 658 | 1.88 | 21 |
| 140 | 1 | 643 | 69% | 0% | 27.2 | 670 | 1.46 | 14 |
| 140 | 2 | 643 | 33% | 5% | 30.9 | 674 | 2.71 | 31 |
| 160 | 1 | 683 | 50% | 0% | 17.6 | 701 | 1.88 | 19 |
| 160 | 2 | 683 | 19% | 19% | 13.8 | 697 | 3.73 | 40 |
| 180 | 1 | 723 | 36% | 8% | 5.0 | 728 | 2.73 | 31 |
| 198 | 2 | 759 | 4% | 66% | 0.0 | 759 | 5.79 | 50 |

(Forced rungs, so the 2-wrap rows are not what the ladder ships; they show the capacity.) The ceiling and saturation level do not move: the ceiling calibration is on plain bases and `generate-geometry-budget-targets.ts --check` still reports `baked calibration is current` (760, level 198). The fade ends at 140: the owner's "about 140", and the point where the first-try landing of a single wrap is still 69 percent and of two wraps a third.

### The fade itself

`resolveGeometryBudgetWrapRungs(level, seed)`: up to level 100 the band's count (vertical wrap in 10-29, both in 30-99), none from 140, and in between the EXPECTED count falls linearly from 2 to 0 and a seeded roll on (level, play seed) decides which of the two neighbouring integers a maze gets: level 110 owns one or two rungs with equal chances, level 120 exactly one (the vertical corridor, the last to go), level 130 none or one, level 139 one in twenty. Same level and seed always give the same maze. A maze whose base cannot land with its wraps (they raise the raw target) is retried plain after 6 bases, like loops: 6 of 14,200 mazes in levels 90-160 fell back. Levels 2-9 and levels 140 and up are byte-identical to before (golden fixture: the 190 changed hashes are all in levels 11-136, none outside 10-139).

### Result: levels 100-150, every level, before and after

200 mazes per level (100 seeds, both boards, `tmp` dumps of `progression-maze-dump.ts --levels=90..160 --seeds=100`, gauged by `progression-gauges.ts compute`, tabulated by `progression-band-smoothness.ts`). The shortest route and the route junctions climb steadily over the fade where they used to jump at 120; the random walk is noisy (the standard error of a level mean is about 70 steps), so read it over several levels.

| Level | Shortest route before | after | Route junctions before | after | Random walk before | after |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 92 | 98 | 6.6 | 7.0 | 913 | 984 |
| 101 | 91 | 95 | 6.2 | 6.7 | 872 | 976 |
| 102 | 85 | 93 | 6.2 | 6.9 | 819 | 925 |
| 103 | 88 | 100 | 6.2 | 6.9 | 908 | 998 |
| 104 | 90 | 104 | 6.7 | 7.6 | 939 | 1106 |
| 105 | 84 | 104 | 5.9 | 7.2 | 915 | 1000 |
| 106 | 84 | 109 | 6.0 | 7.8 | 878 | 1097 |
| 107 | 91 | 114 | 6.7 | 7.7 | 934 | 1120 |
| 108 | 87 | 111 | 6.2 | 7.5 | 825 | 1062 |
| 109 | 95 | 124 | 6.5 | 8.4 | 993 | 1238 |
| 110 | 93 | 125 | 6.5 | 8.5 | 972 | 1274 |
| 111 | 87 | 129 | 6.3 | 8.3 | 910 | 1249 |
| 112 | 91 | 123 | 6.4 | 8.2 | 898 | 1208 |
| 113 | 86 | 125 | 6.2 | 8.7 | 911 | 1176 |
| 114 | 85 | 130 | 6.2 | 8.5 | 858 | 1141 |
| 115 | 92 | 134 | 6.8 | 8.4 | 919 | 1222 |
| 116 | 90 | 136 | 6.1 | 8.9 | 836 | 1332 |
| 117 | 92 | 140 | 6.7 | 9.1 | 932 | 1304 |
| 118 | 89 | 139 | 6.6 | 9.9 | 918 | 1408 |
| 119 | 94 | 147 | 6.7 | 10.1 | 919 | 1434 |
| 120 | 182 | 140 | 12.1 | 9.4 | 1709 | 1308 |
| 121 | 191 | 151 | 12.7 | 10.6 | 1783 | 1541 |
| 122 | 185 | 147 | 12.2 | 10.3 | 1757 | 1465 |
| 123 | 193 | 157 | 12.3 | 10.2 | 1718 | 1435 |
| 124 | 203 | 165 | 12.5 | 10.5 | 1775 | 1665 |
| 125 | 199 | 159 | 13.1 | 11.0 | 1922 | 1531 |
| 126 | 195 | 166 | 12.4 | 10.9 | 1676 | 1596 |
| 127 | 198 | 159 | 12.6 | 10.4 | 1876 | 1613 |
| 128 | 202 | 166 | 13.1 | 11.0 | 1826 | 1644 |
| 129 | 196 | 171 | 12.5 | 11.4 | 1702 | 1616 |
| 130 | 203 | 166 | 12.4 | 10.5 | 1759 | 1550 |
| 131 | 207 | 180 | 12.7 | 11.4 | 1768 | 1636 |
| 132 | 198 | 180 | 11.8 | 10.7 | 1726 | 1587 |
| 133 | 206 | 200 | 12.6 | 12.7 | 1787 | 1822 |
| 134 | 194 | 183 | 12.3 | 11.7 | 1742 | 1633 |
| 135 | 208 | 199 | 12.4 | 12.2 | 1747 | 1685 |
| 136 | 208 | 200 | 12.9 | 12.4 | 1978 | 1878 |
| 137 | 216 | 209 | 12.8 | 12.6 | 1828 | 1831 |
| 138 | 200 | 197 | 12.9 | 12.8 | 1878 | 1875 |
| 139 | 211 | 203 | 12.9 | 12.4 | 1882 | 1890 |
| 140 | 202 | 202 | 13.0 | 13.0 | 1831 | 1832 |
| 141 | 210 | 210 | 13.4 | 13.4 | 2061 | 2059 |
| 142 | 207 | 207 | 12.6 | 12.6 | 1884 | 1884 |
| 143 | 213 | 213 | 12.6 | 12.6 | 1961 | 1963 |
| 144 | 210 | 210 | 12.9 | 12.9 | 2002 | 2004 |
| 145 | 211 | 211 | 12.9 | 12.9 | 2001 | 2001 |
| 146 | 207 | 207 | 12.6 | 12.6 | 1910 | 1913 |
| 147 | 207 | 207 | 12.4 | 12.4 | 1905 | 1905 |
| 148 | 214 | 214 | 13.0 | 13.0 | 1790 | 1791 |
| 149 | 209 | 209 | 13.1 | 13.1 | 2063 | 2066 |
| 150 | 213 | 213 | 13.1 | 13.1 | 1980 | 1973 |

Largest single-level change inside levels 100-150 (raw level means, 200 mazes): shortest route +87.7 at level 120 before, +19.5 after (level 133; the next two levels give -17.0 and +16.3: noise of 200 mazes); route junctions +5.4 before, +2.1 after (level 133); random walk +790 before, +275 after (level 149, in the unchanged levels past the fade); human-like explorer +441 before, +311 after (level 148, also unchanged levels).

The step statistic (`progression-band-smoothness.ts`): the largest single-level change of the 7-level smoothed mean in the band against the gauge's own median step, which separates a cliff from a ramp and from noise.

| Gauge | Before: largest step / median step | After (100-140, the fade) | Control (141-157, untouched plain levels) |
|---|---:|---:|---:|
| Shortest route | 19.4x | 2.3x | 2.9x |
| Route junctions | 16.8x | 2.2x | 2.6x |
| Random walk | 13.2x | 3.1x | 2.7x |
| Human-like explorer | 10.1x | 3.5x | 3.3x |

The fade is as smooth as levels the change does not touch (2.2-3.5x against 2.6-3.3x), and three to eight times smoother than the cliff it replaces. The shortest route still needs about 100 steps more at level 140 than at level 100 (98 at levels 100-104, 201 at 135-139, against 89 and 209 before); that is the wrap saving being handed back, spread over 40 levels at about 2.7 steps per level instead of 88 in one.

### Full suite, before and after (levels 1-300, 6 seeds, both boards)

| Gauge | Build | L1 | L2-9 | L10-24 | L25-49 | L50-99 | L100-149 | L150-197 | L198+ |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Priced felt (steered) | main | 45.0 | 145 | 343 | 434 | 512 | 612 | 710 | 759 |
|  | this change | 45.0 | 145 | 343 | 434 | 513 | 612 | 710 | 759 |
| Priced felt, wraps priced | main | 45.0 | 145 | 318 | 376 | 440 | 579 | 710 | 759 |
|  | this change | 45.0 | 145 | 343 | 434 | 514 | 614 | 710 | 759 |
| Pull-to-goal steps | main | 45.0 | 145 | 343 | 435 | 514 | 620 | 715 | 759 |
|  | this change | 45.0 | 145 | 369 | 490 | 580 | 648 | 715 | 759 |
| Shortest route (A*) | main | 45.0 | 75.4 | 106 | 90.0 | 87.5 | 156 | 219 | 232 |
|  | this change | 45.0 | 75.4 | 107 | 91.4 | 91.5 | 158 | 219 | 232 |
| Explorer route | main | 45.0 | 75.4 | 133 | 162 | 188 | 222 | 247 | 252 |
|  | this change | 45.0 | 75.4 | 132 | 161 | 187 | 222 | 247 | 252 |
| Human-like explorer steps | main | 45.0 | 142 | 543 | 670 | 746 | 1177 | 1706 | 2275 |
|  | this change | 45.0 | 142 | 566 | 688 | 810 | 1290 | 1705 | 2275 |
| Random-walk steps | main | 45.0 | 221 | 651 | 716 | 815 | 1434 | 2034 | 2085 |
|  | this change | 45.0 | 221 | 718 | 731 | 891 | 1516 | 2033 | 2085 |
| Decision points on route | main | 0.00 | 3.9 | 6.9 | 5.9 | 5.9 | 10.0 | 12.9 | 13.4 |
|  | this change | 0.00 | 3.9 | 7.0 | 6.1 | 6.3 | 10.4 | 12.9 | 13.4 |
| Misleading junctions | main | 0.00 | 3.8 | 5.7 | 4.4 | 4.0 | 8.1 | 11.3 | 12.5 |
|  | this change | 0.00 | 3.8 | 5.8 | 4.5 | 4.4 | 8.3 | 11.3 | 12.5 |
| Dead ends | main | 0.00 | 5.9 | 13.7 | 17.5 | 19.0 | 21.4 | 23.6 | 29.8 |
|  | this change | 0.00 | 5.9 | 15.3 | 20.3 | 21.9 | 22.6 | 23.6 | 29.8 |
| Wrap shortcut value | main | 0.00 | 0.00 | 25.3 | 58.5 | 72.7 | 33.5 | 0.00 | 0.00 |
|  | this change | 0.00 | 0.00 | 25.5 | 54.6 | 64.2 | 26.9 | 0.00 | 0.00 |
| Shortcut value (slack) | main | 0.00 | 0.00 | 26.1 | 71.9 | 101 | 66.1 | 27.8 | 20.3 |
|  | this change | 0.00 | 0.00 | 25.6 | 69.9 | 95.4 | 63.9 | 27.7 | 20.3 |
| Greedy-solver cells | main | 46.0 | 113 | 244 | 307 | 357 | 428 | 487 | 517 |
|  | this change | 46.0 | 113 | 258 | 336 | 390 | 441 | 487 | 517 |
| A* expansions | main | 46.0 | 111 | 224 | 225 | 235 | 350 | 448 | 471 |
|  | this change | 46.0 | 111 | 231 | 237 | 257 | 367 | 448 | 471 |
| Board fill | main | 0.04 | 0.10 | 0.22 | 0.28 | 0.33 | 0.37 | 0.41 | 0.42 |
|  | this change | 0.04 | 0.10 | 0.23 | 0.30 | 0.35 | 0.38 | 0.41 | 0.42 |

"Priced felt, wraps priced" is the same estimate for both trees: explorer steps minus the generator's loop saving minus the wrap saving measured from the grid. On main it falls 25 to 100 steps behind the schedule in levels 10-119 (318 against 343, 376 against 434, 440 against 512, 579 against 612) and jumps at 120; on this change it is the schedule (343, 434, 514, 614).

What the change costs, stated plainly:

- The raw explorer steps rise where wraps are priced: +7 percent in levels 10-24, +13 in 25-49, +13 in 50-99, +4.5 in 100-149 (369, 490, 580, 648 against 343, 435, 514, 620). Levels 10-139 are harder for the pull-to-goal explorer, the human-like explorer (+3 to +9 percent in 10-99, +10 in 100-149) and the random walk (+2 to +10, +6 in 100-149); the priced number, the one the ladder is defined on, is unchanged, and so are levels 2-9 and 140+ (the golden fixture proves it).
- Rank correlation with level of some held-out gauges falls because the raw target now differs from maze to maze by the wrap saving (0 to 150): greedy-solver cells 0.97 to 0.91 (25-apart ordering 92 to 79 percent), dead ends 0.66 to 0.44, board fill 0.91 to 0.82; the priced estimate with wraps priced rises from 0.95 to 1.00 (adjacent ordering 75 to 97 percent), and the explorer's raw steps are no longer ordered for adjacent levels (61 percent, was 83), as with loops.
- Generation is a little slower in the levels that carry wraps (below).

### Generation time and menu AI

Real Chromium, dev-server modules, 30 seeds per level, 17 levels, both boards (`progression-generation-timing.mjs`, two runs per tree, main in its own checkout). Per-level mean: median / worst; worst p95; worst single build. Targets: 4x median 150 ms, worst 400 ms.

| Throttle | main (`40cca7e9`) | this change |
|---|---|---|
| 1x | median 10 / worst mean 16-17; p95 51-56; single 77-79 ms | median 11 / worst mean 19; p95 60; single 84-91 ms |
| 4x | median 45-47 / worst mean 68-69; p95 213-216; single 335-362 ms | median 51 / worst mean 75-92; p95 226-255; single 300-373 ms |

The slowest builds are level 100 (both wraps, T up to 563 plus a wrap saving of up to 150) and level 80. An earlier build of this change allowed 12 wrapped bases per level and reached 402 ms for one build in one run; capping the wrapped bases at 6 (as for loops) brought the worst single build to 300 and 373 ms.

Menu AI (`progression-ai-solvability.ts`, levels 1..300, both boards, 2 seeds, ranks E and S): 2400 of 2400 runs cleared, 0 failures (PR #401 measured the same 2400 of 2400).

Ladder (`progression-ladder-report.ts --levels=2..300 --seeds=8 --assert`): PASS; consecutive-level pairs 390, minimum worst-seed gap 1 (the worst maze of level N+1 beats the best maze of level N for any two seeds), every tuned maze in [T, T + 1] priced.

### Reproduce

```
npx vite-node --script scripts/analysis/progression-wrap-pricing.ts --seeds=30
npx vite-node --script scripts/analysis/progression-wrap-capacity.ts --seeds=40
npx vite-node --script scripts/analysis/progression-maze-dump.ts --out=tmp/after-band.json --levels=90..160 --seeds=100
npx vite-node --script scripts/analysis/progression-gauges.ts compute --dump=tmp/after-band.json --out=tmp/after-band.gauges.json
npx vite-node --script scripts/analysis/progression-band-smoothness.ts --before=tmp/before-band.gauges.json --after=tmp/after-band.gauges.json --from=100 --to=150
```

The "before" dump is made in a checkout of the base commit (the dump script is the only tree-specific step).

### Limits

Modelled difficulty only: the human-like explorer is not calibrated against players. 100 seeds per level and board (200 mazes) make the shortest route and junction means tight but the random walk and human-like means noisy (standard error of a level mean about 70 and 90 steps), so those two are judged over bands. The fade candidates and the paired experiment use 30-40 seeds. The browser timing is two runs per tree on one machine; single-build maxima are a noisy tail (the baseline's own varied 335 to 362 ms). Not measured: real players on a wrap level, the touch feel of a maze whose wrap is rarer, a device (not a throttled desktop) generation time.

---

## Earlier measurement: multiple routes (PR #401), against the old main

The sections below are the measurement taken with PR #401. Where they say the wraps retire at level 120, that is superseded by the update above.


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
- **Shortest route (A*)** is flat or falling from level 10 to 99 (107, 90, 87 by band) and doubles at level 120 (86 at 119, 161 at 120) because the wrap corridors are free shortcuts. The one real cliff in the ladder; the steered number does not move there. (Closed by the update above: the wraps are priced and fade out over levels 100-140.)
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
- **L100-149.** (As measured with PR #401: the wraps retired at 120 and the ladder showed its cliff for held-out gauges, shortest route doubling, route junctions 4 to 10, random walk +67 percent, while the steered number did not move. Now the wraps fade out over 100-140 and are priced, see the update above.) About six mazes in ten carry loops from here.
- **L150-197.** Fuller board (41 percent), longer route, deeper dead ends; 61 percent looped, mostly alternates and decoys. Shortcuts thin out as pricing gives them back near the ceiling.
- **L198+.** One difficulty class by design (759 priced steps). 58 percent looped, 42 percent one way. Nothing past here gets harder until the hazard layer exists.

## What changed in the ladder, and what did not

Changed: levels 2-11 are guaranteed single route (accidental loops broken); loops from level 12 with variety, size scaling and three kinds; the landed number is priced for loop savings; the exact number is checked against its tie-averaged value; the plan falls back to a single route when a base cannot land with loops. Not changed: the target schedule, the ceiling (760) and saturation level (198), the board, hazards (dormant); the style bands were changed afterwards (wraps priced and faded out over 100-140, see the update at the top). Recommended next, in order: (done: price the wrap saving like a loop saving and fade the wraps, which smoothed the level-120 cliff and made 10-139 harder for the explorer by 4 to 13 percent); a steeper tail needs capacity, so hazards or a bigger board; keep the gauge suite in CI as an analysis-only job (it is not wired into `npm run test` to avoid a Wave 5B package.json change).

## Limits

Six seeds per level and board (3600 mazes per build); the walkers are models; the human-like gauge is not calibrated against real players; the dump script is tree-specific and was copied into a main checkout for the baseline.
