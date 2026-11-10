# Mazer Level, Rank, Complexity, And AI Progression Contract

Last updated: 2026-11-10

Status: implemented source contract; provider migration and server-owned cutover remain separately gated.

This document defines how Mazer should connect player performance, AI-runner performance, maze complexity, rank, level, and future Atlas/playbook learning. It is intentionally narrow: no enemies, traps, obstacles, items, Stripe licensing, or diagonal graph work are included in this contract yet.

## 2026-08-24 Room-subsystem retirement

- Room eligibility is removed from the difficulty profile and progression vocabulary. No level, rank, target-complexity, or recipe-cycle value activates a room contract.
- Naturally open floor geometry remains valid maze topology; this is not a no-`2x2` generation rule.
- Older room-off and future-room passages below are retained as design history and are superseded by this section.

## 2026-11-10 Multiple routes (loops), priced felt, no accidental loops (levels 12..198)

Owner direction (2026-11-10): the main-menu maze of a level-18000 player reads like a level 20-30 maze and always has exactly one way to the end; "short cuts placed around or multiple routes occasionally, sometimes only one way, maybe depending on the size of the maze", and "assess the levels and find ways to gauge the progression scaling". Product judgement was delegated, so every choice below is made and justified here. It is a source change; felt difficulty is modelled, not player-tested.

- **Diagnosis.** The menu label is the stored completion ordinal (`track.level`); the menu and play generate from the PLAYER track. Geometry level used to come from the stored target complexity (levels 1..99) and read the ordinal only at the 400 cap, so a saved track whose ordinal outran its target (older tapered per-clear gain, the 2026-08 ordinal closure) generated at the lower level while the label said 18000 (synthetic saves: ordinal 18000 with target 120 gave level 29, with target 8 the level-1 corridor). That seam is fixed in its own PR (#400: geometry level = max(target-earned level, ordinal clamped to 198)). For a coherent save the level-198 maze is correct, and it still reads like a level 20-30 maze because from level 30 up every ladder maze was a single route plus dead ends: the tuner raised the number by lengthening the route and adding deceptive branches, never by adding a different kind of structure. Measured on the frozen boards, floor 10 percent (levels 2-9), 22 percent (10-24), 28 percent (25-49), 42 percent (198+); interior loops 0.17 to 0.34 per maze across the bands, all of them accidental, and the only designed route variety was the wrap corridor in levels 10-119.
- **Loops.** `src/legacy-runtime/legacyMazeLoops.ts`. A loop is a connector corridor between two cells of the maze, carved on the base maze before the route stretch and the branches, so the tuner lands the exact target on the maze the player sees. Three kinds. *Shortcut*: both ends on the shortest route (BFS, wrap-aware), connector shorter than the stretch it bypasses by at least 6 steps and 5 percent of the route, at most 12 percent per loop and 18 percent of the original shortest route in total (the "distance requirement" stays). *Alternate*: both ends on the shortest route, the two ways within max(4, 12 percent) of each other (the connector may be the shorter by at most max(2, 4 percent)): a real choice with no winner. *Decoy* (the false way on the old note listed as "not built"): a connector joining two cells of the same dead-end region the explorer is lured into, so wrong ground becomes a tangle with a cycle; it costs the explorer about two steps per cell, exactly like a dead-end branch, so it spends the board as efficiently as one, and for a person it is a loop that looks like progress and returns to ground already crossed. Decoys are placed by the tuner (it needs the explorer's visited set) and kept only when the re-run explorer moves the number toward the target. Connectors search from a host to ANY route cell at least 8 route steps away (BFS through closed interior cells), every carved cell touches exactly one open cell when carved (its predecessor; the last also its far end), so no 2x2 block and no accidental adjacency appear; only interior cells are carved, so the border ring, wrap topology, start and goal are untouched; every carve is verified by re-running the explorer and rolled back unless the maze stays solvable and under the level's headroom.
- **Plan** (`resolveGeometryBudgetLoopPlan`, pure in (level, play seed, cells)). Levels 1-11: always one route (level 1 corridor, 2-11 plain). From level 12 a per-seed roll decides: P(single route) falls linearly from 100 percent at level 12 to 30 percent at level 120 and stays there, so about 30 percent of the mazes have one way even at level 198. A looped maze carries 1 + floor((level - 12) / 36) loops scaled by cells / 1275 (so a bigger board carries proportionally more), +-1 by seed, at most 8. Kinds: decoys 0 percent below level 30 rising to 40 percent, alternates 10 rising to 45 percent, the rest shortcuts. Connector length 10 + level / 6 cells (at most 36); the set is capped at 6 percent of the board's cells. Delivery is partial by design (the per-loop checks and the priced ceiling below reject placements): measured over levels 12-240 (10 seeds, both boards), a maze planned with loops delivered at least one 61 to 90 percent of the time, shortcuts 36 to 80 percent of those requested (none at level 198, by pricing), alternates 44 to 100 percent, decoys 32 to 38 percent from level 60 up.
- **No accidental loops.** The base generator closes a loop by accident in about one base in five (22 percent of levels 2-9 mazes had one), which made "single route" untrue and put a shortcut of unbounded size into levels whose loops are meant to be designed (observed: shortest route 45 against an explorer route of 195). `breakAccidentalCycles` runs first in the tuner and closes one two-neighbour cell on each interior cycle (wrap links across the board edge are never touched), so the cycle becomes two dead-end tails and no floor is lost; it prefers a cell off the base route and never closes the start, the goal or a border cell. Levels 2-11 are now single-route mazes on every sampled seed (0 of 96 in levels 2-9, 6 seeds, both boards; the test samples 2-11).
- **Pricing (the metric extension).** The explorer runs on the finished grid, so a loop it uses lowers the number, one it walks past costs nothing, and a lure costs its length. Two corrections keep that exact number honest. (1) *Saving.* A shortcut that the explorer walks past still makes the maze easier for anyone who finds it. In a paired experiment (same level, board and seed, one forced plan per arm, 600 mazes per arm, levels 40-198, +-1 standard error of the paired change) at equal explorer steps: 3 shortcuts lower the human-like explorer by 9.0 +- 4.5 percent and the random walk by 8.0 +- 3.2; 3 alternates by 15.4 +- 4.1 and 9.0 +- 3.7; 3 decoys by 2.0 +- 4.0 and 1.3 +- 3.3 (decoys leave the shortest route untouched, +0.1 +- 0.2, and shortcuts take it down 14.5 +- 1.1 percent). So the landed value is PRICED: explorer steps minus the steps the loops give back to a map-knower (shortest route with every loop connector closed minus shortest route as built), at FELT_LOOP_PRICE_PERCENT = 100, i.e. each step a loop saves must be paid for by one more explorer step elsewhere. The accept window is [T, T + 1] on the priced value (`measurePricedFeltSteps`, `maze.loopStats.saved`), so for ANY two seeds the priced felt of level N+1 still beats level N (every level 2..198, both boards, plus a denser sweep: green in `tests/reset/legacy-progression-ladder.test.ts` and `legacy-geometry-budget-ladder.test.ts`). The raw explorer steps are always at least T, and above it by the priced saving. Pricing also removes shortcuts from the top of the ladder on its own: a loop whose priced saving would push the target past the capacity ceiling is given back, last first, so level 198 is alternates and decoys. (2) *Ambiguity.* An alternate can be a coin flip for the explorer: the deterministic tie-break picks one way, and the number can sit far from the same walker's average over the other tie-breaks (the first loop pass, without the guard: p99 48 percent at levels 30-119, max 76 percent). A landed maze is preferred only while its deterministic number agrees with the mean of 6 other tie-breaks within 12 percent; otherwise another stream, then another base maze (up to 5) is tried before a biased landing is accepted. p99 of that gap, main against now: levels 2-9 21.4 against 10.7 percent, 10-29 30.4 against 6.1, 30-119 38.3 (max 68) against 12.5 (max 27), 120-197 2.2 (max 82) against 5.7 (max 12), 198+ 0 against 0. The guard also covers the wrap corridors, which main left tie-biased.
- **Wrap corridors and loops.** Decision: keep the wrap bands exactly as shipped (vertical wrap in 10-29, vertical and horizontal in 30-119, plain from 120) and layer loops on top; do not replace wraps below 120. A wrap is the taught edge mechanic (Guide row "Wrap") and a loop through the torus; the capacity cost that retired it at 120 is unchanged and the ceiling calibration (`generate-geometry-budget-targets.ts --check`) still passes with 760, so the saturation level stays 198. From 120 up loops are the route-variety feature. Wraps are not priced: a finding, below.
- **Ceiling.** Unchanged: `GEOMETRY_BUDGET_CEILING = 760`, saturation level 198, top target 759, past it one difficulty class. The ladder lands every one of 3588 sampled mazes (levels 2-300, 6 seeds, both boards) in [T, T + 1] priced. A looped plan that cannot land on one of the first 6 bases is retried without loops, so the guarantee always outranks the loop.
- **Findings and limits (not changed).** (a) The shortest route is flat or falling from level 10 to 99 (107 to 87) because the wrap corridors are free shortcuts the explorer does not pay for; at level 120 the wraps retire and the shortest route doubles (86 at 119, 161 at 120), decision points on the route go 4 to 10 and the random walk 795 to 1331, while the steered number does not move. Pricing the wrap saving like a loop saving would smooth that cliff at the cost of making levels 10-119 about 8 to 20 percent harder for the explorer (the wrap saving is 26 steps on a 343 band mean at 10-24, 72 on 435 at 25-49, 101 on 512 at 50-99); that is a product call left for a follow-up. (b) The tail is +2 per level (0.3 percent): the frozen board is full, so past level 36 a level is harder than the previous one only by the guarantee; the next lever is the hazard layer (dormant, `LEGACY_HAZARD_LAYER_ENABLED = false`, unchanged) or board size. (c) The generator steers one number; the human-like explorer and the random walk are held-out checks, noisy (rank correlation with level 0.51 and 0.57), and loops make mazes slightly easier for them at equal explorer steps (bounded by the caps above). The full suite and numbers: `docs/research/MAZER_PROGRESSION_GAUGES_2026-11-10.md`, `scripts/analysis/progression-gauges.ts`.
- **Guide.** The Levels row now reads "Each cleared maze raises your level. Harder mazes can have shortcuts and loops." (`legacyGuideContent.ts`; the drift test asserts that generation plans loops, never below level 12, for some seeds late and never for every seed).
- **Golden fingerprints.** `tests/fixtures/progression-ladder-golden.v1.json` was regenerated deliberately: every level 2+ changed (accidental-loop breaking changes the base mazes of the plain levels too); level 1, the corridor, is unchanged.
- **Hazards.** Still dormant and unwired (`tests/reset/legacy-hazard-handoff.test.ts` green): loops are plain floor corridors and no maze carries hazard data.

## 2026-11-06 Continuous felt-difficulty ladder D(level) (levels 2..198, supersedes the 2..30 ladder and the first decoy-proxy pass)

Owner direction: level 1 is a straight corridor, every later level is strictly harder, as far out as the board allows, difficulty comes from maze content and not board size (the board is frozen at 25x51 phone / 45x27 desktop), progression is gradual, and Phase 2 (hazards: obstacles and enemies) waits. This section supersedes the 2026-11-05 "levels 2..30" ladder text, the half-speed band pairing for every progression level 2 up to the hard ceiling, and this lane's first pass (a dead-end decoy tuner steering the H1 structure proxy, ceiling 185). It is a source change; felt difficulty is modelled, not player-tested, and needs the owner's sign-off before merge.

- **Primary measure: felt difficulty.** `measureFeltSteps` (`src/legacy-runtime/legacyMazeFeltDifficulty.ts`) is the exact step count of a deterministic pull-to-goal explorer on the finished maze: at every cell it tries the open neighbour nearest the goal first (torus Euclidean distance, an exact tie broken by a fixed hash of the cell), backtracks out of dead ends, never re-enters a cell, and at a junction does not enter a side branch whose whole dead end is at most 3 cells and holds no goal (a person sees a nub for what it is). Steps = moves until the goal, backtracks included. So route length counts one for one, a wrong branch that points at the goal costs 2 per cell, a branch the explorer reaches the goal before ever trying costs nothing, and 1-tile decoys cost nothing. In a maze whose wrong turns are pendant branches it equals `routeLength + sum P(tried first) * 2 * |B| * [|B| > 3]`; it is simulated (about 20 microseconds) so it stays exact on mazes with wrap loops. It is validated against the Monte-Carlo mean of the same explorer over other tie seeds (mean relative difference < 5 percent on generated mazes, `tests/reset/legacy-maze-felt-difficulty.test.ts`). `analyzeFeltStructure` reports the decomposition (forks, lure and trap branches, deep dead ends, decoy depth, cycles).
- **Target schedule.** `T(N) = schedule(min(N, SATURATION))` (`src/legacy-runtime/legacyGeometryBudget.ts`): piecewise linear through (2, 89), (4, 123), (6, 153), (10, 215), (16, 372), (36, 435), then exactly +2 per level. The control points dominate the felt difficulty the shipped (pre-ladder) levels deliver on the frozen board, measured with the same explorer (40 seeds, the larger of phone and desktop: 87 at levels 2-3, 122 at 4, 152 at 6, 210 at 9, 257 at 12, 278 at 15, 369 for 16-35, 432 for 36-57, then 345 from 58 on), so levels 2..57 are not easier than today on either board (one measured exception: level 9 on phone, -10). The per-level step is at least 2 and at most 27 (levels 10..16, replacing the shipped ladder's +91 jump at 16).
- **Exact landing, no candidate search.** Each level builds one base maze from a plain profile (straightness 0.8, one checkpoint, no dead-end cap, no feeders; wrap corridors only in the style bands below) and then felt-tunes it (`src/legacy-runtime/legacyMazeFeltTuning.ts`) into the window `[T(N), T(N) + 1]`. Levers, all inside the frozen board and all leaving the border ring, start and goal alone (so wrap topology and the edge-wrap count never change): (1) route stretch, switchback bumps on the explorer's path (wall off one plain corridor cell, carve a U-shaped detour of depth d on free wall space, +2d route, no shortcut possible because every carved cell touches exactly one open neighbour when carved) toward a route target of 38 percent of T; (2) forks, short lure branches (4..6-16 cells) hosted on the route with a first step that points at the goal, as many as the felt budget affords (up to 30); (3) deep deceptive branches (up to 40 cells) hosted on every cell the explorer visits, half of them clustered on the goal side, including sub-branches of wrong regions; (4) tip extension, trimming and depth-1 bumps for the fine +-2 control. Every move is verified by re-running the explorer on the edited grid and rolled back unless it brings the number closer, so the landing is exact on the real final grid. Because every scheduled step is at least 2 and the window is 1 wide, a maze of level N+1 has a strictly greater felt value than a maze of level N for ANY two seeds (realized difference >= 1), by construction. If a base maze cannot land (its explorer route is already longer than the target, or its capacity runs out) the next mixed-seed base is tried, up to `GEOMETRY_BUDGET_BASE_CANDIDATES = 24` (about 1.1-1.4 base builds on average); the caller's `candidateCount` is ignored. Lever 4 and the bump lever stay at +-2 granularity because the explorer's steps are `route + 2 * wrong cells`: a parity that no move changes, which is also why the step cannot be 1.
- **Style bands.** Level 2-9 plain base, 10-29 a vertical wrap corridor, 30-119 vertical and horizontal wrap corridors, 120 and above plain again. A wrap corridor is a shortcut the explorer can take, so it costs felt headroom (a base with both wraps reaches a given target on roughly 0.3 fewer of the base mazes), which is why the top of the ladder uses plain bases. Feeders and extra checkpoint branches are no longer used: they only consume floor that deceptive branches need.
- **Hard ceiling (measured).** From a plain base the tuner (with its 6 restarts) can add structure until none fits; over 320 base mazes (160 phone, 160 desktop; route target 300, branch cap 40, fork length 16, 30 forks) the felt value reached has median 812, and the board floor is about 48 percent full at that point (the physical limit for 1-cell corridors with 1-cell walls is about 50 percent). The weaker board is desktop: its 25th percentile is 768 (phone 820). `GEOMETRY_BUDGET_CEILING = 760` is the lowest per-board 25th percentile rounded down to 10, so at least 75 percent of base mazes can reach it on every board and the next-base fallback makes a miss astronomically rare (0.25^24); a higher ceiling costs more failed bases per build (measured: a pooled 780 ceiling made one in two desktop bases at the top fail, and the 4x-throttle worst case rose to 645 ms). The last level whose scheduled target fits under it is `GEOMETRY_BUDGET_SATURATION_LEVEL = LAST_BUDGET_LEVEL = 198` with `GEOMETRY_BUDGET_TOP_TARGET = 759`. `scripts/analysis/generate-geometry-budget-targets.ts --write` regenerates the ceiling; `--check` recomputes and fails on drift.
- **Past the ceiling.** Levels 198 and above are one difficulty class: the same target (759), the same profile, deterministic per (level, play seed), different mazes because the play seed still advances every level. Nothing crashes or regresses; nothing pretends to be harder. `resolveContinuousDifficulty(level)` reports `geometrySaturated` and `hazardBudgetLevels = level - 198`, +1 per level without bound; `resolveLegacyHazardHandoff` (`src/legacy-runtime/legacyHazardHandoff.ts`) exposes it with `LEGACY_HAZARD_LAYER_ENABLED = false`. Hazards are NOT implemented or wired; `tests/reset/legacy-hazard-handoff.test.ts` proves nothing reads the switch and no maze carries hazard data.
- **Seam (unchanged from the first pass).** `resolveGeometryBudgetLevel` derives the level from the bounded target complexity (levels 1..99, level 1 is the corridor); above that it reads the completion ordinal (`track.level`), only when the track already sits at the bounded top, clamped to `LAST_BUDGET_LEVEL`. The ordinal is never rewritten and the saved-state schema (`version: 1`) and fields are unchanged (`tests/reset/legacy-progression-ladder.test.ts`).
- **Frozen board.** The progression scale for every level is the tutorial scale, on every viewport.
- **Golden fingerprints.** `tests/fixtures/progression-ladder-golden.v1.json` pins a hash of the generated maze of every level 1..300 on both frozen boards at one seed (`scripts/analysis/progression-ladder-golden.ts --write`). It was regenerated deliberately for this change: the tuner, schedule, style bands and ceiling all changed, so every level 2+ is a different maze; level 1 (the corridor) is unchanged.
- **Secondary guards.** The H1 structure proxy (`measureGeometryBudgetProxy`) is no longer steered; its 40-level window means must not fall more than 10 percent from the previous window and the top of the ladder must be at least 1.5x the bottom (`tests/reset/legacy-geometry-budget-ladder.test.ts`). `scripts/analysis/progression-ladder-report.ts --assert` additionally requires the independent metrics (route length, A* effort, greedy-solver effort, decoy depth) to rise over 40-level windows.
- **Independent metrics (honest limits).** Measured on 10 seeds x phone/desktop per level; shipped ladder / first decoy-proxy pass / this ladder. Level 100: explorer steps 334 / 490 / 564, route length 100 / 114 / 192, A* expansions 357 / 456 / 276, dead ends 40 / 22 / 19, decisions on the route 13 / 14 / 12, deepest decoy 54 / 54 / 47. Level 198: steps 334 / 345 / 759, route 100 / 134 / 262, A* 357 / 510 / 501, dead ends 40 / 56 / 25, decisions 13 / 29 / 12, deepest decoy 54 / 54 / 57. Across this ladder (means of 8 seeds x 2 boards, levels 2-41 against 158-198) route length rises 125 to 254, A* effort 198 to 465, greedy-solver effort 241 to 499 and deepest decoy 30 to 50 (it flattens near 50 after level ~100); dead ends rise 13 to 24 and decisions 8 to 13. The menu AI demo walker clears every sampled level (360/360 across ranks E and S); its steps (rank E) rise from 55 at level 2 to 108 at level 100 and about 270 at level 198 (first pass: 84 at level 100, 88 at 190), because it follows near-shortest routes, so its effort is mostly route length. This ladder trades side branches for route length and branch depth: its dead ends (25 at the top) and decisions on the route (12) are BELOW the shipped mid ladder (33-40 dead ends, 12-13 decisions at levels 20-100) and the first pass at the top (56 and 29), its deepest decoy is below the shipped one between levels 20 and 100, and its A* effort is below the shipped ladder between levels 20 and about 110 (above from 125). The explorer value is the one measure steered, and it is higher than both earlier ladders from level 15 on (levels 2-10 are within sampling noise of the shipped ones). Whether that feels harder is the owner's call.
- **Not built.** (2026-11-10: false-shortcut loops are now built as decoy loops, priced through the explorer and the loop saving; see the section above.) Original text: False-shortcut loops (they let a greedy explorer skip route, so they cannot be priced by this measure and they break the unique-route guarantee), wrap-edge deception beyond the style bands (the explorer treats a wrap as a plain shortcut and cannot score a human's confusion at an edge), and bottleneck sections.
- **Diagnostics.** Budget levels report `on-target` in the generation review; the 400-capped complexity target does not gate them.

## 2026-08-23 Superseding Progression Contract

- `player.level` and `ai-runner.level` are independent positive completion ordinals. Each accepted completion advances its active track by exactly `+1`; neither ordinal has an application-level `99` ceiling.
- Persisted and transported completion ordinals use canonical unsigned decimal strings across local storage, JSON, remote/RPC payloads, diagnostics, leaderboard results, and UI formatting. Exact arithmetic, comparison, and the 23-step recipe modulo use `bigint` internally. Unsafe numeric inputs are rejected instead of rounded or clamped, and bounded render seeds are derived through exact modulo rather than `Number(ordinal)`.
- The completion receipt id is persisted on the track. Retrying the same receipt is idempotent and cannot advance twice.
- Local/account reconciliation takes the maximum independently for ordinal, completed-cycle history, target complexity, and peak complexity, so a stale device cannot lower visible progress or its bounded difficulty history.
- A persisted account-scoped completion outbox is proof that local progression is not yet synchronized, even when older sync metadata has the same timestamp as the local state. Cold bootstrap, reload, and sign-in hydration must merge monotonically while that proof exists; they must never replace a higher local ordinal with a lower cloud row.
- Pending or failed completion flushes clear the cached `progressionUpdatedAt` sync marker. The marker may equal the reconciled progression timestamp only after every queued receipt is accepted and removed, so unsynchronized local progress is never mislabeled as remote truth.
- Replay reads the current player and AI server cursors before it submits queued work. After every awaited remote operation it re-reads account-scoped local progression and the live outbox, monotonically merges remote, initial, and fresh-local state, and immediately before reconciliation UUID-unions recovered receipts with the live queue without another await between that read and write. A completion appended during refresh therefore cannot be overwritten or returned as regressed state.
- A provable telemetry chain is prepended in exact sequential order to repair a stale or gapped outbox, duplicate run UUIDs are deduplicated, and retry remains idempotent. A lower-level receipt may leave the durable queue only after an authenticated own-receipt lookup proves its exact `client_run_id`; a different device advancing the cursor is not acceptance proof. Missing or failed proof leaves that receipt pending with null sync metadata while later valid cursor entries continue. If local telemetry cannot prove every missing completion, the higher local state and pending receipt remain intact without a speculative server write.
- `targetComplexity` remains a separate bounded difficulty input (`8..400`). It still owns rank, palette tier, maze scale, topology pressure, and hazard eligibility; it no longer owns the displayed ordinal.
- Difficulty advances through the existing bounded complexity step and is interpreted at half speed. A very large displayed ordinal therefore does not make geometry grow without bound.
- The first bounded difficulty handoff is intentionally unique: target complexity `8` uses the Level-1 tutorial profile, while the first accepted completion at target complexity `12` uses the first starter profile. After that handoff, bounded difficulty resumes its slower two-level cadence (`2/3`, `4/5`, and so on). Player and menu-AI tracks use the same mapping; their state and procedural seed streams remain independent.
- Early-curve acceptance is corpus-based rather than a promise that every individual random seed is harder than the previous seed. Across the fixed player/menu seed corpus, Level 2 must have both a higher mean and a higher median measured complexity than Level 1, and Levels 3-5 must not regress in aggregate. This preserves procedural variety without allowing the tutorial and first completed level to be generation-identical.
- The deterministic `endless-v1` recipe cycle remains source-proven but non-load-bearing until the server-owned completion path can verify recipe provenance.
- The paired provider migration widens both ordinals to PostgreSQL `bigint` and removes both player and AI `99` constraints. The source-only RPC pair accepts and returns decimal text at the Data API boundary, records a mandatory per-account run UUID, serializes each owned progression row, advances the matching ordinal/cycle count once, and writes decimal strings into the JSON state under existing RLS. It must not be applied or made production-load-bearing without exact current-schema proof, migration-lock and rollback rehearsal, authenticated duplicate/concurrency replay, client cutover, and separately authorized retirement of direct writes.

The older implementation narrative below is retained as design history where useful. Any statement below that derives displayed level from target complexity, allows a completion to hold/ease the displayed ordinal, or caps either track at 99 is superseded by this section.

## Current Implemented Truth

- Mazer already stores two separate progression tracks: `player` and `ai-runner`.
- The active surface chooses the track:
  - `play` cycles update the `player` track.
  - menu-demo cycles update the `ai-runner` track.
- Each track owns:
  - `targetComplexity`
  - `level`
  - `rank`
  - `completedCycles`
  - `cleanCycles`
  - `struggleCycles`
  - `peakComplexity`
  - `lastSignal`
  - `recentSignals`
  - `lastMazeSeed`
- Level is derived from target complexity, not stored as a separate source of truth.
- Rank is derived from target complexity:
  - `E`: below 28
  - `D`: 28-45
  - `C`: 46-69
  - `B`: 70-95
  - `A`: 96-124
  - `S`: 125+
- The current complexity score is already based on:
  - maze size
  - solution path length
  - walkable floor ratio
  - route quality
  - meaningful bypass route bands
  - meaningful bypass solution edges
  - shortcut count
  - accepted checkpoint count
- The AI-runner baseline is versioned. Older local AI-runner state is reset to level 1/rank E once, while player progression is preserved.
- The current performance signal is driven by a numeric run-quality score with these terms:
  - timer pace versus expected route/complexity time
  - route efficiency versus the known shortest viable path
  - wrong-turn pressure
  - backtrack pressure
  - reset penalty
  - render/frame stability
- The resulting signal is:
  - `challenge`: clean/fast completion, few wrong turns, few backtracks
  - `ease`: reset used, many wrong turns, or many backtracks
  - `hold`: high frame cost or middle performance
- Route waste can force an `ease` signal even when the actor eventually reaches the end, because a path far longer than the shortest viable route means the maze/player combination was not cleanly solved.
- Unsafe frame timing forces `hold` instead of `ease`, because lag/readability problems should cap difficulty without punishing the player.
- Current target-complexity adjustment is bounded by a compact recent-signal window:
  - `challenge`: increase by 1 baseline, with a +1 measured-pressure bonus when the completed maze was at least 8 complexity above target.
  - `challenge` earns a +1 consistency bonus when recent receipts contain at least two challenge signals.
  - `challenge` also earns a +1 clean-streak bonus every third clean cycle.
  - `challenge` is capped to a maximum +3 target-complexity step.
  - `ease`: decrease by 1 baseline, or by 2 when measured pressure was far above target, repeated struggle is already recorded, or recent receipts contain at least two ease signals.
  - `hold`: no direct adjustment
- Measured maze complexity updates `peakComplexity`, but it no longer hard-jumps `targetComplexity`. This keeps level progression paced instead of letting one high-complexity menu demo jump the AI several ranks.
- This also means AI completed cycles can increase while visible level/rank do not move on every single cycle. The public menu badge stays focused on skill readability: AI Skill level/rank, run count, current time, and score. Target-complexity pressure and challenge/hold/ease signals remain available in runtime diagnostics and Atlas/playbook receipts instead of the player-facing badge.
- A completed player maze must publish one short, player-facing outcome before the existing goal handoff: a level unlock when the derived level advances, otherwise the remaining paced steps to the next maze level, a recalibration notice when the target eases, or a steady-progress confirmation. This feedback reports the already-recorded player track; it must not change progression scoring, timing, generation, or lifecycle behavior.
- AI-runner scoring now uses an AI-specific blended signal. Timer, shortest-route efficiency, wrong turns, backtracks, reset use, and frame stability still matter, but AI local-memory pressure also contributes through `aiDecisionSummary`: wrong branches, recovery count, optional retargets, visited undo, and decision count.
- A human-like AI run can now count as `challenge` even with some wrong branches or recovery, as long as its decision pressure is not chaotic, route waste is bounded, and the run-quality score clears the AI challenge band. This prevents the AI badge from showing changing scores while level/rank remain frozen forever.
- Chaotic AI runs still hold or ease progression when decision pressure is high, route waste is extreme, or frame timing is unsafe.
- Progression diagnostics now expose `levelProgressPercent`, `complexityUntilNextLevel`, `nextLevelTargetComplexity`, and `skillTrend`. These fields are diagnostics/playbook-facing, not normal player-facing badge text.
- Progression diagnostics now also expose `generationReview`, which compares active `targetComplexity` against measured maze complexity, reports the active difficulty `profileBand`, and classifies the result as `under-target`, `on-target`, or `over-target`. This is the next tuning hook for detecting when procedural generation fails to deliver the intended difficulty.
- Remote progression summaries preserve `recentSignals`, so local pacing context can flow into account-scoped AI/player state and Atlas/playbook reports.
- Cycle receipts now include `shortestViablePathLength`, `routeOverrunSteps`, `routeOverrunRatio`, and `routeEfficiencyPressureScore`, which compare actual actor path length against the known shortest solution length.
- Cycle receipts now include `renderSafetyPenaltyScore`, which turns unsafe average frame timing into a difficulty-safety pressure signal.
- Atlas-safe reports now have a first validator-gated consumer receipt, `mazer.cycle-learning.consumer.v1`, that blocks malformed reports, rejects raw path leakage, and selects a bounded tuning focus without applying automatic tuning.
- Current maze scale is blended from base scale and target complexity, then capped by viewport/tile-size safety so mobile rendering stays readable.
- Progression now exposes a concrete procedural difficulty profile for the active target complexity:
  - `tutorial`: level 1, small scale, shortcuts disabled, no required wraps, minimal branches/dead ends, rooms off.
  - `starter`: levels 2-8, slightly larger, rare shortcut pressure, one vertical edge-wrap target, light branches.
  - `explorer`: levels 9-18, balanced fill, light shortcut pressure, both horizontal and vertical wrap pressure.
  - `navigator`: levels 19-29, moderate branch/dead-end pressure and moderate shortcut ambiguity.
  - `architect`: levels 30-41, dense fill, high branch/dead-end pressure, stronger wrap pressure.
  - `mythic`: levels 42+, highest practical current band, extreme shortcut/branch pressure, dense topology, rooms still off.
- The level-1 AI/menu track now resolves to a small grid scale below the shortcut stage threshold, so the first maze is actually simple instead of being visually large but labeled level 1.
- The difficulty profile is now executable, not only descriptive. Runtime generation maps the active player/AI track into `checkpointCountMultiplier`, `shortcutCountMultiplier`, `routeQualityReinforcementMultiplier`, `requiredOppositeBorderConnections`, and `borderFeederTargetPerSide`.
- Level 1 sets those executable controls to tutorial-safe values: no shortcut count, no required wraps, no perimeter feeders, low checkpoint pressure, and no route-quality reinforcement. Higher bands gradually add those pressures instead of jumping straight to large dense mazes.
- Difficulty delivery is intentionally measured after generation. The profile decides what to request; `generationReview` decides whether the generated maze landed below, within, or above the target band, which can later drive generator retry/tuning without exposing noisy internals to players.
- Generation requests now carry the active player/AI target complexity into consumption. The consumer samples a small deterministic seed window and selects the candidate with the closest measured complexity to the target, then records the selected seed and delivery classification in `maze.generation.selection`. This is bounded by design so mobile play does not stall while still avoiding obviously off-target first-seed layouts.
- `maze.generation.selection` now also records selected distance from target, sampled candidate min/max complexity, and `allCandidatesUnderTarget` / `allCandidatesOverTarget` flags. These fields are diagnostics for the next retry/search pass: one off-target selected seed is a tuning sample, while every sampled candidate under-delivering means the generator profile or scale pressure needs a stronger adjustment.
- The bounded retry ladder is implemented. When the initial candidate window under-delivers a non-tutorial target, the selector samples three additional seeds using a boosted pressure profile: checkpoint count, shortcut pressure, route-quality reinforcement, required horizontal/vertical wraps, and perimeter feeder pressure all increase within the existing generation clamps. If the full searched set still under-delivers, the selector samples three more candidates with an adaptive scale/profile escalation. The selection review records `initialWindowUnderTarget`, `pressureRetryUsed`, `pressureRetryCandidateCount`, `adaptiveRetryUsed`, `adaptiveRetryCandidateCount`, `adaptiveRetryScale`, and `searchedCandidateCount`, so calibration can tell whether the profile retry or adaptive retry solved the miss.
- Atlas-safe cycle telemetry reports now preserve normalized generation delivery/retry review from runtime diagnostics. This lets future calibration group `under-target` / `on-target` / `over-target` delivery, retry usage, selected distance from target, and level/rank movement without exporting raw path history.
- Play-mode maze seeds are fresh per player run. An explicit `mazeSeed`/`seed` URL can pin the initial proof route, but play start and play goal-reset cycles must generate a new procedural seed mixed from runtime entropy plus the player track's target complexity, completed cycles, level, and score. The seed must not be treated as the difficulty source; it chooses the procedural layout inside the current player-skill/complexity envelope.
- The menu AI already uses a `human-local-memory` model with visited memory, dead-end memory, split records, wrapped compass-local scoring, deterministic hesitation/noise, optional split retargeting, and bounded shortest-known recovery only when local exploration needs a safe non-stall fallback.
- AI rank/level now resolve into an explicit perception profile. `aiSkillRank` plus `aiSkillLevel` control local lookahead depth, optional retarget budget, wrap mental cost, split uncertainty, confidence noise, and a diagnostics-only solve-preview budget. E-rank remains the current live baseline; D establishes the first improved local-memory scout profile; C/B/A/S currently inherit that D-grade level-1 controller floor so higher rank cannot degrade route quality while the future high-rank planner is still open. `aiSkillLevel` can extend bounded local lookahead, and shortest path still remains a post-run benchmark rather than the movement controller.
- AI distance currently uses wrapped-axis compass pressure for local choices, so off-border/wrapped paths influence heuristic direction without giving the AI the solved path to the end.

## Desired Source Of Truth

`targetComplexity` remains the only numeric source of truth for level and rank.

The next maze should be generated from the active progression track:

- In play mode, the player track determines the next player maze.
- In the main menu, the AI-runner track determines the next demo maze.
- Every new player maze should receive a fresh procedural seed, then apply scale, shortcut budget, fill/topology pressure, and future tuning from the player track's target complexity. Sequential `seed + 1` stepping is acceptable for deterministic menu/demo proof lanes, but not as the only player-run freshness rule.
- Player and AI progression are separate. The AI can learn and rank up without changing the player's rank, and the player can rank up without overwriting the AI track.
- If the app later has accounts, remote sync should store both tracks per user.

The game should not directly set `level`, `rank`, or color tier from UI state. It should set or adjust only `targetComplexity`, then derive all presentation from that.

## Player Progression Rule

For every completed player cycle:

1. Record a compact cycle receipt.
2. Score actual maze complexity.
3. Score player performance against that complexity.
4. Convert performance into a stability-adjusted signal.
5. Update `targetComplexity`.
6. Derive level, rank, color tier, and next-maze generation scale from the updated track.

Performance should increase maze level when the player is outperforming the current target:

- Fast completion versus expected time.
- Low wrong-turn count.
- Low backtrack count.
- No reset.
- Stable frame timing.
- Good route efficiency relative to known shortest path.

Performance should decrease or hold maze level when the player is struggling:

- Reset used.
- Slow completion relative to expected time.
- Repeated wrong turns.
- Repeated backtracking.
- Completion route much longer than shortest known route.
- High frame cost, because performance lag should cap difficulty instead of punishing the player.

Implemented first-pass adjustment formula:

```text
performanceScore =
  timeScore
  + routeEfficiencyScore
  + wrongTurnScore
  + backtrackScore
  + resetScore
  + stabilityScore

targetComplexityDelta =
  +3 when performanceScore is excellent for two recent cycles
  +2 when performanceScore is clean
  +1 when performanceScore is improving but not dominant
   0 when performanceScore is stable or frame cost is high
  -1 when performanceScore shows mild struggle
  -2 when performanceScore shows repeated struggle
```

The implemented first smoothing window records the last six signals and applies bounded consistency bonuses or penalties. The numeric performance score now selects the signal before that smoothing window runs. The next version should calibrate the term weights against longer real player and AI sample bands while preserving the same anti-jump principle.

Current diagnostics for tuning:

- `levelProgressPercent`: how far the active target complexity has moved through the current derived level band.
- `complexityUntilNextLevel`: remaining target-complexity points needed before the displayed level increases.
- `skillTrend`: `rising`, `falling`, `mixed`, or `steady` based on the recent signal window.
- `nextChallengeTargetComplexity` and `nextEaseTargetComplexity`: bounded preview of where the next clean or struggling cycle would push the track.

Current cycle-level performance pressure terms:

- `routeEfficiencyPressureScore`: `0` means the actor stayed close to the known shortest route; higher scores mean the actor path wasted more distance and the maze/control combination should be treated as harder.
- `routeOverrunRatio`: `0` means actor path length matched the generated shortest viable path; `1` means the actor traveled about twice the shortest route length.
- `routeOverrunSteps`: absolute extra steps beyond the generated shortest viable path.
- `renderSafetyPenaltyScore`: `0` means frame timing was safe; higher scores mean runtime performance may be distorting input, completion time, or readability and should cap difficulty increases.

## AI-Runner Progression Rule

The AI-runner should have its own track and should act as the maze tuning test dummy.

AI-runner performance acts as the tuning test dummy for complexity formulas before those formulas are trusted for player-facing adaptive difficulty.

The AI should not be a perfect solver. It should model a human with local memory:

- It knows its current position.
- It has a compass-like direction toward the goal.
- It estimates distance to the goal.
- It sees valid neighboring path options.
- It remembers visited tiles.
- It remembers dead-end tiles and should not intentionally re-enter proven dead-end branches.
- It records split points and which choices have already been tried.
- When blocked, it should route through the shortest known path to the best remaining split, not blindly replay every tile it walked before.
- It must treat wrapped/off-border path continuity as valid distance and pathing information.

The AI should rank up when it handles its current target cleanly:

- Low wrong-branch count.
- Low recovery count.
- Low backtrack distance.
- Low optional-retarget pressure. A retarget is valid human-like reasoning, but a high rate means the maze is creating repeated uncertainty.
- Fast completion versus expected AI cadence.
- Good route efficiency compared with shortest path.
- Repeated `searching but competent` receipts are allowed to raise target complexity. The AI should not need a perfect A* route to prove it handled the maze.

The AI should hold or rank down when the generated maze exposes poor decision quality:

- Many wrong branches.
- Long dead-end recovery.
- Repeatedly choosing branches that increase wrapped distance to goal.
- Falling back to canonical solver too often.
- Route length approaching the bounded route cap.

Current compact AI receipt scoring:

```text
routeNoiseScore =
  ((wrongBranchCount * 3)
  + (optionalRetargetCount * 1.5)
  + (visitedUndoCount * 4))
  / max(1, decisionCount)

recoveryPressureScore =
  ((backtrackCount * 1.2)
  + (recoveryCount * 3))
  / max(1, decisionCount)

retargetPressureScore =
  optionalRetargetCount / max(1, decisionCount)

pressureScore =
  routeNoiseScore * 0.45
  + recoveryPressureScore * 0.45
  + retargetPressureScore * 0.1

reliabilityScore = 100 - pressureScore
```

Signal bands:

- `clean`: pressure below 25.
- `searching`: pressure from 25 through 59.999.
- `chaotic`: pressure 60 or higher.

The retarget term is intentionally lighter than a wrong branch or visited-undo. It should reward the AI for reconsidering a better remembered split while still exposing mazes that force frequent second-guessing.

Implemented AI progression bands:

- `challenge`: blended score at least 58, decision pressure below 60, route-efficiency pressure no higher than 70, and frame timing safe.
- `hold`: middle score, safe but inconclusive decision pressure, or unsafe frame timing.
- `ease`: blended score 34 or lower, decision pressure at least 60, or extreme route-efficiency pressure.

AI progression should become an internal calibration tool:

- If AI performance is too clean for several cycles, increase AI target complexity.
- If AI performance is chaotic, reduce or hold AI target complexity and inspect which maze terms caused the chaos.
- If player and AI disagree sharply on difficulty, mark the maze as suspicious for tuning rather than immediately using it as a level-up signal.

## Maze Complexity Formula Contract

Maze complexity should be additive, explainable, and receipt-backed.

### Current Terms

- `sizeScore`: larger generated bounds allow more path possibilities.
- `solutionScore`: longer shortest solution paths are harder.
- `floorScore`: more walkable fill creates more possible decisions.
- `routeScore`: meaningful alternate routes add navigation pressure.
- `shortcutScore`: shortcuts increase ambiguity only when they produce meaningful route choices.
- `checkpointScore`: accepted generation checkpoints approximate path-building density.
- `edgeWrapScore`: counts vertical and horizontal off-border continuities that actually connect to opposite-side paths.
- `edgeWrapChoiceScore`: adds pressure when off-border continuities create meaningful local choices at their folded endpoints.
- `edgeWrapShortcutReliefScore`: subtracts pressure when wrapped paths make the shortest route unusually short for the maze size.
- `edgeWrapReliefScore`: compatibility alias for the current shortcut-relief value while existing receipts/reports migrate.
- `splitScore`: counts branch points and extra local choices, including wrapped neighbors.
- `deadEndPressureScore`: counts dead-end pressure as a first-pass proxy for plausible wrong branches.
- `weightedSplitPressureScore`: weights branch points by wrapped goal distance and number of locally plausible choices.
- `weightedDeadEndPressureScore`: weights dead ends by how plausible they look from local wrapped-distance heuristics.
- `fillQualityScore`: rewards clean interior fill while penalizing isolated sparse gaps.

### Required Next Terms

- `routeEfficiencyCalibration`: calibrates route-efficiency pressure against real player and AI cycles.
- `renderSafetyViewportPenalty`: extends render-safety pressure beyond average frame time to include viewport tile size/readability.

### Deferred Terms

These should be reserved in receipts but not activated until the features exist:

- `dangerScore`
- `enemyPressureScore`
- `trapPressureScore`
- `itemValueScore`
- `urgencyScore`

## Maze Level From Player Level

The displayed player level is derived from the player track. The generated player maze should use that same player track as its target.

Recommended contract:

```text
playerTargetComplexity -> playerLevel/playerRank -> nextPlayerMazeTarget
```

The maze itself can report an actual measured complexity that differs from the target. That difference is useful:

- actual complexity below target: generator under-delivered; retry or add generation pressure later.
- actual complexity close to target: accepted.
- actual complexity above target: accepted only if performance/framerate safety allows it.

The UI should distinguish:

- `Player Level`: player progression state.
- `Maze Complexity`: measured complexity of the current maze.
- `AI Level`: AI-runner progression state, visible in menu when the demo AI is the active runner.

The main menu can show the AI runner's level because the main menu runner is the active performer there. Play mode should show the player level.

## Complexity Change Meaning

Every small level increase should correspond to a limited set of measurable generation changes.

Recommended progression bands:

- Level 1: first-clear tutorial. Small grid, no active shortcut stage, no rooms, no required edge-wrap, minimal branches, minimal dead ends, obvious start/end readability.
- Levels 2-8: starter. Slightly larger bounds, rare shortcut pressure, light branches, light dead ends, at most one useful wrap expectation.
- Levels 9-18: explorer. More fill, both vertical and horizontal wrap pressure can appear, branch points become meaningful, route ambiguity starts to matter.
- Levels 19-29: navigator. Moderate branch and dead-end pressure, shortcut ambiguity matters, shortest-path efficiency becomes a stronger score term.
- Levels 30-41: architect. Dense fill, high branch pressure, high dead-end pressure, multiple wrap continuities expected, route bands need stronger scrutiny.
- Levels 42-99: mythic. The visible skill level can now continue beyond the old S/44 plateau because the target-complexity ceiling matches the level-99 formula. Extreme branch/shortcut pressure, dense topology, performance-gated; only increase if frame timing and route readability stay safe.

Rooms remain off for now. Without enemies, obstacles, items, or traps, rooms add visual noise and unclear purpose.

Perpetual loop contract:

1. Generate the next maze from the active track's target complexity and difficulty profile.
2. Measure actual maze complexity after generation.
3. Record the actor route against shortest viable path, timer, wrong turns, backtracks, reset state, and frame safety.
4. Convert the run into `challenge`, `hold`, or `ease`.
5. Adjust only `targetComplexity`, then derive level/rank/profile from that.
6. If generated complexity under-delivers the target, future generator passes should add pressure. If generated complexity overshoots and the actor struggles or frame timing is unsafe, progression should hold/ease instead of blindly climbing.

## Atlas And Playbook Contract

Each completed cycle should produce a compact receipt that can become an Atlas-safe report.

Minimum receipt:

```ts
{
  actorTrack: 'player' | 'ai-runner',
  mazeSeed,
  mazeSize,
  targetComplexity,
  measuredComplexity,
  level,
  rank,
  routeQuality,
  edgeWrapCount,
  splitCount,
  deadEndCount,
  shortestPathLength,
  actorPathLength,
  routeOverrunSteps,
  routeOverrunRatio,
  wrongTurns,
  backtracks,
  recoveryCount,
  optionalRetargetCount,
  aiDecisionPressureScore,
  aiDecisionReliabilityScore,
  resetUsed,
  completionTimeMs,
  averageFrameMs,
  signal,
  completedAt
}
```

Atlas/playbook should consume reports for decision support first, not silent auto-tuning. Automatic tuning should only happen once reports are stable and verified.

Current repo-local consumer contract:

- `validateMazeCycleTelemetryAtlasReport(report)` requires schema `mazer.cycle-learning.report.v1`, app/source identity, a valid learning signal, Atlas-safe data policy, raw path exclusion, and AI/complexity/performance/progression review blocks.
- Validation fails if `latestReceipt.playerPath` or any `recentReceipts[].playerPath` raw path array reaches the report.
- `canConsumeForTuning` is true only when validation passes and the report has at least three samples.
- `createMazeCycleTelemetryAtlasConsumerReceipt(report)` emits schema `mazer.cycle-learning.consumer.v1`.
- Consumer focus can be `collect-more-cycles`, `render-safety`, `route-efficiency`, `ai-chaos`, `increase-complexity`, `reduce-complexity`, `hold-and-observe`, or `blocked-validation`.
- The consumer always carries `noAutoTuningWithoutValidator = true`; it is a decision-support receipt, not an automatic maze mutator.
- `scripts/analysis/maze-cycle-telemetry-report.mjs` can write consumer receipts with `--consumer-output <file>` and timestamped/latest Atlas consumer receipts with `--atlas-consumer-root <dir>`.

## Implementation Phases

1. Formalize receipts.
   - Add AI decision receipts.
   - Add complexity breakdown receipts.
   - Add edge-wrap, split, dead-end, and fill-quality terms.
2. Stabilize level contracts.
   - Keep level/rank derived from target complexity.
   - Smooth target changes across recent receipts. First-pass recent-signal smoothing and weighted run-quality scoring are implemented; longer-sample calibration is next.
   - Keep player and AI tracks separate locally and remotely.
3. Use AI as test dummy.
   - Run AI across deterministic seed bands.
   - Compare predicted complexity with AI actual difficulty.
   - Flag mismatches for formula tuning.
4. Feed Atlas/playbook.
   - Validate `mazer.cycle-learning.report.v1`. First repo-local validator is implemented.
   - Add a report consumer that summarizes trend, rank pressure, and suspicious mazes. First bounded repo-local consumer receipt is implemented; Atlas-side process wiring is next.
5. Only then expand graph features.
   - Diagonal tiles, rooms, enemies, traps, and obstacles require one shared graph contract across generation, movement, AI distance, compass, trail, telemetry, and rendering.

## Verification Requirements

- Unit tests must prove level/rank are derived from target complexity.
- Unit tests must prove player and AI tracks update independently.
- Unit tests must prove maze generation scale is capped by viewport/readability.
- Unit tests must prove complexity breakdown includes route, shortcut, floor, solution, size, and checkpoint terms.
- AI tests must prove local-memory routes stay adjacent, bounded, and edge-wrap-aware.
- Atlas report tests must prove receipts omit full raw path history unless explicitly exported for local debug.
- Atlas consumer tests must prove invalid raw path reports are blocked before tuning and valid three-sample reports produce bounded consumer decisions.
- Browser QA must prove the visible level badge reflects the active surface: AI in menu, player in play, with no debug shorthand bleeding into the public skill box.

## Open Decisions

- Calibration weights for the first numeric performance-score formula after longer real player and AI sample bands.
- Exact formula weights for edge wrap, split pressure, dead-end pressure, and fill quality.
- Exact Atlas-side process that consumes `mazer.cycle-learning.consumer.v1` receipts and ratchets level/complexity markers without silent auto-tuning.
- Whether rank should use only target complexity or a blend of target complexity and consistency.
- Whether the main menu should display AI level only, or AI level plus player level after login.
- Whether player color/trail color should reflect level bands, rank bands, or both.
