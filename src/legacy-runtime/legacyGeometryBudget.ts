// Felt difficulty ladder D(level) for progression levels 2..LAST_BUDGET_LEVEL.
//
// Level 1 is the straight corridor (see legacyMaze.ts, `layout: 'corridor'`).
// Every later bounded level is defined by ONE monotone target function on ONE
// frozen board -- not by hand-tuned bands:
//
//   T(N) = schedule(min(N, SATURATION))                (resolveGeometryBudgetTarget)
//
// T is the FELT difficulty: the exact step count of a deterministic pull-to-goal
// explorer on the finished maze (legacyMazeFeltDifficulty.ts). The first ladder
// (PR #395's first pass) steered on the H1 structure proxy instead, which turned
// out to be moved mostly by 1-tile dead-end nubs; its independent measures (route
// length, decoy depth, deceptiveness, solver effort) went flat after level ~25.
// The explorer pays for exactly what a player pays for: route length, and deep
// dead-end branches that point at the goal. The H1 proxy stays below as a
// secondary guard.
//
// How each level lands on T(N): ONE base maze is built from the level's style
// profile and then FELT TUNED (legacyMazeFeltTuning.ts): the route is stretched
// with switchback bumps toward a rising route-length target, then deep deceptive
// dead-end branches are added (or trimmed) until the realized felt value is in
// [T(N), T(N) + 1]. Because schedule(N+1) - schedule(N) >= 2 > the window width,
// the realized felt value of level N+1 is strictly greater than that of level N
// for ANY two seeds, by construction, up to the hard ceiling (not statistically).
// A build costs one maze plus a few hundred cheap explorer runs (no candidate
// search).
//
// HARD CEILING. A frozen board has finite capacity for deceptive structure.
// CEILING is the largest target the tuner reaches on at least CAPACITY_SHARE of
// base mazes on the sampled boards (measured by the calibration script, see the
// GENERATED block); the selection simply tries the next base maze when one falls
// short, so a build still lands. GEOMETRY_BUDGET_SATURATION_LEVEL is the last level
// whose scheduled target fits under it (the FELT saturation level). Past it the felt number
// cannot rise, but the board still has room for structure that costs the explorer nothing: the
// FRINGE (below) keeps the ladder rising, strictly, for GEOMETRY_BUDGET_FRINGE_CAP more levels.
// From the SATURATION level (felt saturation + fringe cap) the ladder is a declared plateau:
// levels beyond keep the top maze class, stay valid and deterministic (the play seed still
// advances every level, so the mazes differ), and the hazard budget (Phase 2, unsigned
// contract, dormant) is what must take over. See `resolveContinuousDifficulty` and the hazard
// hand-off module.
//
// This module is pure: it imports only TYPES, so legacyMaze.ts (profile
// normalization) and legacyProgression.ts (the hook) can both depend on it
// without an import cycle. It deliberately does not know about the 8..400
// target-complexity track, ranks, palettes, bands or the server-owned level
// ordinal -- the progression module owns the single seam that turns a track
// into a budget level (`resolveGeometryBudgetLevel`).

import type { LegacyMazeGenerationProfile } from './legacyMaze';
import { LEGACY_EMPTY_LOOP_PLAN, type LegacyLoopPlan } from './legacyMazeLoops';

// Width of the accept window above the target: the realized felt value of a level
// is in [T, T + WINDOW]. The schedule's per-level step must stay >= WINDOW + 1.
export const GEOMETRY_BUDGET_WINDOW = 1;
export const GEOMETRY_BUDGET_MIN_STEP = GEOMETRY_BUDGET_WINDOW + 1;

// Cap on base mazes tried per level (the loop stops at the first one that tunes
// into the window, which is usually the first or second).
export const GEOMETRY_BUDGET_BASE_CANDIDATES = 24;

// Target schedule (felt units = explorer steps), piecewise linear through these
// control points, then +GEOMETRY_BUDGET_TAIL_STEP per level. The points dominate
// the felt difficulty the shipped (pre-ladder) levels deliver on the frozen board,
// measured with the same explorer (40 seeds, the larger of phone and desktop per
// level: 87 at levels 2-3, 122 at 4, 152 at 6, 210 at 9, 257 at 12, 278 at 15,
// then the band plateaus 369 for 16-35 and 432 for 36-57, then 345 from 58 on),
// so no level is easier than today on either board (one measured exception: level 9
// on phone, -10), and the ladder then keeps
// rising where the shipped one falls back and goes flat. The one steep stretch
// (levels 10..16, +27 per level at most) replaces the shipped ladder's +91 band jump at 16.
const SCHEDULE_CONTROL_POINTS: readonly (readonly [number, number])[] = [
  [2, 89], [4, 123], [6, 153], [10, 215], [16, 372], [36, 435]
];
export const GEOMETRY_BUDGET_TAIL_STEP = 2;

export const resolveGeometryBudgetSchedule = (level: number): number => {
  const points = SCHEDULE_CONTROL_POINTS;
  const last = points[points.length - 1]!;
  if (level >= last[0]) {
    return last[1] + (GEOMETRY_BUDGET_TAIL_STEP * (level - last[0]));
  }
  for (let index = 1; index < points.length; index += 1) {
    const [toLevel, toValue] = points[index]!;
    if (level <= toLevel) {
      const [fromLevel, fromValue] = points[index - 1]!;
      return fromValue + Math.floor(((toValue - fromValue) * (level - fromLevel)) / (toLevel - fromLevel));
    }
  }
  return last[1];
};

// Style bands: the MOST wrap-corridor rungs the base profile of a level owns.
// Rung 1 = vertical wrap corridor, rung 2 = horizontal as well. A wrap corridor is a
// free shortcut for a player who knows the map, so it costs felt headroom (measured: at
// the top of the ladder a base with both wraps reaches a given target on roughly 0.3
// fewer of the base mazes than a plain one) and, since the wrap saving is priced like a
// loop saving (legacyMazeFeltTuning.ts, FELT_WRAP_PRICE_PERCENT), the raw explorer target
// rises by the saving. Wraps are therefore confined to the mid ladder, where T is far
// below capacity, and the top of the ladder uses plain bases. They do not retire at a
// level: from GEOMETRY_BUDGET_WRAP_FADE_FROM_LEVEL the number of wrap rungs a maze owns
// falls by a seeded roll (resolveGeometryBudgetWrapRungs) to none at
// GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL, so no held-out gauge steps. Feeders and extra
// checkpoint branches are not used: they only consume floor that deceptive branches need.
//
// The band of the fade is measured, not guessed (docs/research/MAZER_PROGRESSION_GAUGES_2026-11-10.md,
// fade candidates 100->130/140/150/160 dumped at 40 seeds per level and board). It starts at
// 100: the owner's start, and the last level where every maze still carries its band's wraps.
// Removing a wrap hands its saving (about 85 steps of shortest route for both wraps) back to
// the held-out gauges, and that cost is paid per level over the fade: the shortest route
// gains 3.4, 2.7, 2.3 and 2.0 steps per level for an end at 130, 140, 150 and 160 (the plain
// trend is 0.2 to 0.5), and the random walk 26, 22, 20 and 17 (plain 4 to 6), against ONE
// level of +88 and +790 at the old level-120 cliff (94 to 182, 919 to 1709). Every candidate is a ramp (its largest
// 7-level-smoothed step is 2 to 5 times the band's median step and within noise), so the end
// is chosen on cost: past 140 each 10 more levels lower the slope by 0.3 to 0.7 steps while a
// wrap keeps getting dearer (priced, a wrap maze needs T(N) + its saving explorer steps: the
// share of bases that land with one wrap on the first try is 69 percent at level 140, 64 at
// 150 and 50 at 160, for two wraps 33, 25 and 19). 140 is also the owner's "about 140".
export const GEOMETRY_BUDGET_WRAP_FADE_FROM_LEVEL = 100;
export const GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL = 140;
export const GEOMETRY_BUDGET_STYLE_BANDS: readonly { readonly fromLevel: number; readonly rungs: number }[] = [
  { fromLevel: 2, rungs: 0 },
  { fromLevel: 10, rungs: 1 },
  { fromLevel: 30, rungs: 2 },
  { fromLevel: GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL, rungs: 0 }
];
export const GEOMETRY_BUDGET_TAPE: readonly string[] = ['wrap:v', 'wrap:h'];

const BASE_PROFILE: Readonly<LegacyMazeGenerationProfile> = {
  borderFeederTargetPerSide: 0,
  checkpointCountMultiplier: 0.42,
  checkpointCountOverride: 1,
  maxDeadEndCount: 0,
  minCheckpoints: 1,
  requiredOppositeBorderConnections: { horizontal: false, vertical: false },
  routeQualityReinforcementMultiplier: 0,
  shortcutCountMultiplier: 0,
  // 0.8, not the 0.95 the first ladder used: a base maze whose route is short and
  // cheap to build (about 2 ms instead of 4.4 ms, and 71% instead of 30% of bases
  // fit under the level-2 target), because the tuner stretches the route to each
  // level's route target itself. Measured capacity at the top of the ladder is the
  // same or better (p10 763 vs 691).
  straightnessBias: 0.8
};

// The profile for a number of wrap rungs. `level` becomes the gate key; omit it
// for an UNGATED profile (calibration and tests).
export const resolveGeometryBudgetProfileForRungs = (
  rungs: number,
  level?: number
): LegacyMazeGenerationProfile => {
  const owned = Math.min(GEOMETRY_BUDGET_TAPE.length, Math.max(0, Math.trunc(rungs)));
  const profile: LegacyMazeGenerationProfile = {
    ...BASE_PROFILE,
    requiredOppositeBorderConnections: {
      horizontal: owned >= 2,
      vertical: owned >= 1
    }
  };
  return level !== undefined ? { ...profile, geometryBudgetLevel: level } : profile;
};

// ---------------------------------------------------------------------------
// Proxy for "harder": H1 = turns + len/4 + 3*splits + 2*max(0, dead-2) + 6*wraps
//
// The weights are a modelling choice, not a measured player-difficulty law.
// The proxy is kept as a SECONDARY guard (the ladder tests require its window means
// to follow the felt target); it is no longer steered. It does not saturate or
// depend on board size the way the 400-capped complexity does.
// ---------------------------------------------------------------------------

export interface GeometryBudgetProxyMaze {
  readonly width: number;
  readonly height: number;
  readonly solutionPath: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

export interface GeometryBudgetProxyComplexity {
  readonly deadEndCount: number;
  readonly splitCount: number;
  readonly edgeWrapCount: number;
}

export interface GeometryBudgetProxyBreakdown {
  readonly turns: number;
  readonly length: number;
  readonly splits: number;
  readonly deadEnds: number;
  readonly wraps: number;
  readonly total: number;
}

const wrapAwareStep = (from: { x: number; y: number }, to: { x: number; y: number }): string => {
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  if (dx > 1) { dx = -1; } else if (dx < -1) { dx = 1; }
  if (dy > 1) { dy = -1; } else if (dy < -1) { dy = 1; }
  return `${dx},${dy}`;
};

export const measureGeometryBudgetProxy = (
  maze: GeometryBudgetProxyMaze,
  complexity: GeometryBudgetProxyComplexity
): GeometryBudgetProxyBreakdown => {
  const path = maze.solutionPath;
  let turns = 0;
  for (let index = 2; index < path.length; index += 1) {
    if (wrapAwareStep(path[index - 2]!, path[index - 1]!) !== wrapAwareStep(path[index - 1]!, path[index]!)) {
      turns += 1;
    }
  }
  const length = Math.max(0, path.length - 1);
  const total = turns
    + (length / 4)
    + (3 * complexity.splitCount)
    + (2 * Math.max(0, complexity.deadEndCount - 2))
    + (6 * complexity.edgeWrapCount);
  return {
    turns,
    length,
    splits: complexity.splitCount,
    deadEnds: complexity.deadEndCount,
    wraps: complexity.edgeWrapCount,
    total
  };
};

// ---------------------------------------------------------------------------
// Candidate seeds. Candidate j for a play seed and budget level is a mixed
// hash, NOT seed + j: consecutive levels step the play seed by one, so seed + j
// would hand adjacent levels near-identical candidate sets.
// ---------------------------------------------------------------------------

const mix32 = (a: number, b: number): number => {
  let h = (a ^ Math.imul((b + 0x9e3779b9) | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};

export const resolveGeometryBudgetCandidateSeed = (
  playSeed: number,
  level: number,
  candidateIndex: number
): number => mix32(mix32(playSeed >>> 0, level), candidateIndex);

// ---------------------------------------------------------------------------
// Baked calibration.
//
// GENERATED by scripts/analysis/generate-geometry-budget-targets.ts -- do not
// edit by hand. It runs the felt tuner on the frozen board (phone, desktop) with
// an unreachable target from the base profile the TOP of the ladder uses, with the
// route target and branch cap of the ceiling levels, and records the felt value
// each seed reached. CEILING = the pooled CAPACITY_SHARE quantile, rounded down
// to a multiple of 10, i.e. a target that at least that share of base mazes can
// reach (the rest fall through to the next base maze in the selection).
// tests/reset/legacy-geometry-budget.test.ts checks the schedule's structure and
// samples levels against fresh generation; `--check` on the script recomputes
// the capacity pass.
// ---------------------------------------------------------------------------

// GENERATED:GEOMETRY_BUDGET_CALIBRATION:BEGIN
export const GEOMETRY_BUDGET_CEILING = 760;
export const GEOMETRY_BUDGET_FRINGE_CAP = 70;
// GENERATED:GEOMETRY_BUDGET_CALIBRATION:END

// The last level whose scheduled target does not exceed the ceiling: the HARD
// CEILING of felt difficulty on the frozen board. Levels at or beyond it share
// the top target (the schedule value there, at most CEILING and never clipped, so
// the last ramp step is a full step too).
export const GEOMETRY_BUDGET_FELT_SATURATION_LEVEL = ((): number => {
  let level = 2;
  while (resolveGeometryBudgetSchedule(level + 1) <= GEOMETRY_BUDGET_CEILING) { level += 1; }
  return level;
})();

// The felt target every level at or past the felt saturation steers to.
export const GEOMETRY_BUDGET_TOP_TARGET = resolveGeometryBudgetSchedule(GEOMETRY_BUDGET_FELT_SATURATION_LEVEL);

// THE FRINGE (levels past the felt saturation). The felt number is route + 2 * (wrong cells the
// explorer enters), and the frozen board holds at most about half of its interior as floor, so
// at the felt saturation the generator is out of room for anything the explorer pays for
// (docs/research/MAZER_PROGRESSION_GAUGES_2026-11-10.md, "Past level 198"). But the felt
// explorer does not enter a side stub of at most FELT_VISION_CELLS cells at a junction (a person
// sees a stub for what it is), so such a stub costs it nothing and the remaining wall pockets
// (about 100 cells on a finished top maze) can be filled with them WITHOUT moving the felt value
// at all. They are not free for anyone else: every stub is a junction and a dead end, and the
// held-out walkers (human-like explorer, random walk) pay for them (measured: decision points
// 12 -> 39-51, dead ends 30 -> 96-110, random walk 2000 -> 8000-10600 for 88-113 stub cells).
// So past the felt saturation the ladder is a PAIR, compared lexicographically: the felt value
// (held at the top target, window [T, T + 1]) and the number of fringe cells, which is exactly
// GEOMETRY_BUDGET_FRINGE_STEP more per level for GEOMETRY_BUDGET_FRINGE_CAP levels. Level N + 1
// is therefore still strictly harder than level N for any two seeds, by construction: the cell
// count is exact (a base that cannot hold the count is replaced by the next base, like a base
// that cannot reach the felt target). The cap is the calibration's (GENERATED block above):
// the fringe capacity at the felt saturation, as the CAPACITY_SHARE quantile over base mazes.
export const GEOMETRY_BUDGET_FRINGE_STEP = 1;

// The last level of the fringe: the FELT saturation level plus the levels the fringe carries.
export const GEOMETRY_BUDGET_FRINGE_END_LEVEL = GEOMETRY_BUDGET_FELT_SATURATION_LEVEL
  + Math.floor(GEOMETRY_BUDGET_FRINGE_CAP / GEOMETRY_BUDGET_FRINGE_STEP);

// THE MASTERY TIER (levels past the fringe). The felt number is the explorer pulled from the
// START toward the goal. The board is fully visible, so a player can as well work back from the
// goal, and the ladder's mazes are about half as hard that way: measured on levels 198 to 268
// (24 to 240 seeds per board), the same explorer run goal to start pays 430-475 steps on the
// phone board and 415-445 on desktop against 759 (and a tenth of the mazes pay under 200),
// because every deceptive fork the tuner carves points toward the goal only. The tuner's lever
// 4 (`doubleLure`, legacyMazeFeltTuning.ts) makes the route forks of a maze point toward the
// start as well, with no more floor and no change to the forward number: the reverse number
// rises to at least 740 on every such maze (the floor below; the mean is about 760 on both boards).
//
// The lever is all or nothing per maze (a fork's whole subtree is entered or skipped as a unit,
// so a half-lured maze barely moves: measured mean reverse steps 444 / 445 / 461 / 498 / 582 /
// 697 for a lure on 0 / 25 / 50 / 75 / 90 / 100 percent of the forks), so the ramp is made of
// MAZES, like the wrap fade: from the first level past the fringe, a seeded roll on (level, play
// seed) decides whether a maze is a mastery maze, with a share that rises by
// 1 / GEOMETRY_BUDGET_MASTERY_SPAN per level from zero (level 268) to all (level 268 + SPAN).
// The mean reverse felt then rises linearly with the level, and a mastery maze is held to a
// floor of GEOMETRY_BUDGET_MASTERY_REVERSE_FLOOR reverse steps (a base that cannot land it is
// retried, like a base that cannot hold the fringe). This is a statistical ramp, not the
// strict by-construction ordering of the felt ladder: two single mazes of adjacent levels can
// still invert.
export const GEOMETRY_BUDGET_MASTERY_SPAN = 120;
export const GEOMETRY_BUDGET_MASTERY_REVERSE_FLOOR = 740;

// The last level whose geometry rises: the end of the mastery tier. From here the ladder is a
// declared plateau (the hazard budget takes over).
export const GEOMETRY_BUDGET_SATURATION_LEVEL = GEOMETRY_BUDGET_FRINGE_END_LEVEL + GEOMETRY_BUDGET_MASTERY_SPAN;

// The last BOUNDED progression level whose geometry comes from this function:
// the saturation level. Every level >= 2 up to it has its own target (and fringe);
// completion ordinals above it map to this level for geometry (plateau) and keep counting in
// `resolveContinuousDifficulty`. Also the upper bound of the profile's
// `geometryBudgetLevel` field.
export const LAST_BUDGET_LEVEL = GEOMETRY_BUDGET_SATURATION_LEVEL;

const clampBudgetLevel = (level: number): number => Math.min(
  LAST_BUDGET_LEVEL,
  Math.max(2, Math.trunc(Number.isFinite(level) ? level : 2))
);

// The level whose felt-ladder rules (target, route target, branch caps, loop plan, wrap rolls)
// apply: the felt ladder stops at the felt saturation, the levels past it add only the fringe.
export const resolveGeometryBudgetFeltLevel = (level: number): number => Math.min(
  GEOMETRY_BUDGET_FELT_SATURATION_LEVEL,
  clampBudgetLevel(level)
);

// Fringe cells (zero-felt-cost side stubs) a maze of level N carries: nothing up to the felt
// saturation, then GEOMETRY_BUDGET_FRINGE_STEP more per level up to the cap.
export const resolveGeometryBudgetFringeCells = (level: number): number => {
  const past = clampBudgetLevel(level) - GEOMETRY_BUDGET_FELT_SATURATION_LEVEL;
  return past <= 0 ? 0 : Math.min(GEOMETRY_BUDGET_FRINGE_CAP, past * GEOMETRY_BUDGET_FRINGE_STEP);
};

// Share (permille) of the mazes of level N that are mastery mazes: nothing up to the end of the
// fringe, then 1000 / GEOMETRY_BUDGET_MASTERY_SPAN more per level, all of them from the last level.
export const resolveGeometryBudgetMasteryPermille = (level: number): number => {
  const past = clampBudgetLevel(level) - GEOMETRY_BUDGET_FRINGE_END_LEVEL;
  return past <= 0 ? 0 : Math.min(1000, Math.floor((1000 * past) / GEOMETRY_BUDGET_MASTERY_SPAN));
};

// Whether the maze of level N and play seed S is a mastery maze: a seeded roll on (level, seed)
// against the level's share, so the same level and seed always give the same maze.
export const resolveGeometryBudgetMastery = (level: number, seed: number): boolean => {
  const permille = resolveGeometryBudgetMasteryPermille(level);
  if (permille <= 0) { return false; }
  if (permille >= 1000) { return true; }
  return (mix32(seed >>> 0, Math.imul(clampBudgetLevel(level), 53) + 29) % 1000) < permille;
};

// T(N): the felt target for budget level N (2..LAST_BUDGET_LEVEL); null outside.
export const resolveGeometryBudgetTarget = (level: number): number | null => {
  const normalized = Math.trunc(level);
  if (!Number.isFinite(normalized) || normalized < 2 || normalized > LAST_BUDGET_LEVEL) {
    return null;
  }
  return resolveGeometryBudgetSchedule(Math.min(normalized, GEOMETRY_BUDGET_FELT_SATURATION_LEVEL));
};

// Wrap rungs level N's base profile owns (see GEOMETRY_BUDGET_STYLE_BANDS).
export const resolveGeometryBudgetRungCount = (level: number): number => {
  const normalized = resolveGeometryBudgetFeltLevel(level);
  let rungs = 0;
  for (const band of GEOMETRY_BUDGET_STYLE_BANDS) {
    if (normalized >= band.fromLevel) { rungs = band.rungs; }
  }
  return rungs;
};

// Wrap rungs a maze of level N and play seed S actually owns (0..resolveGeometryBudgetRungCount).
// Up to the fade start it is the band's count; from the fade end it is none; in between the
// EXPECTED count falls linearly from the band's count to zero and a roll on (seed, level)
// decides which side of the fraction this maze lands on, so level 120 owns exactly one
// rung (the vertical corridor, which is also the last to go), level 110 one or two with
// equal chances, level 130 none or one. Integer arithmetic, a pure function of
// (level, seed): the same level and seed always give the same maze.
export const resolveGeometryBudgetWrapRungs = (level: number, seed: number): number => {
  const bounded = resolveGeometryBudgetFeltLevel(level);
  const owned = resolveGeometryBudgetRungCount(bounded);
  if (owned === 0 || bounded <= GEOMETRY_BUDGET_WRAP_FADE_FROM_LEVEL) { return owned; }
  if (bounded >= GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL) { return 0; }
  const span = GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL - GEOMETRY_BUDGET_WRAP_FADE_FROM_LEVEL;
  const expectedPermille = Math.floor((owned * 1000 * (GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL - bounded)) / span);
  const whole = Math.floor(expectedPermille / 1000);
  const roll = mix32(seed >>> 0, Math.imul(bounded, 37) + 11) % 1000;
  return Math.min(owned, whole + (roll < (expectedPermille % 1000) ? 1 : 0));
};

// Base mazes tried (at most) with the wrap corridors of the roll before a level falls back to
// plain bases: the wrap saving is priced into the target, so a base whose wraps leave the
// tuner too little capacity is retried, and the ladder's ordering guarantee outranks the wrap
// (the same rule as GEOMETRY_BUDGET_LOOP_BASE_ATTEMPTS for loops).
export const GEOMETRY_BUDGET_WRAP_BASE_ATTEMPTS = 6;

// Route-length target of level N: the explorer's final path is stretched with
// switchback bumps toward 38% of the felt target (a base maze whose route is
// already longer is left alone), so the route rises with the level while the
// deceptive branches keep the room to pay for the rest.
export const GEOMETRY_BUDGET_ROUTE_SHARE_PERCENT = 38;
export const resolveGeometryBudgetRouteTarget = (level: number): number => {
  const target = resolveGeometryBudgetTarget(resolveGeometryBudgetFeltLevel(level)) ?? GEOMETRY_BUDGET_TOP_TARGET;
  return Math.floor((target * GEOMETRY_BUDGET_ROUTE_SHARE_PERCENT) / 100);
};

// Longest deceptive branch the tuner carves in one move at level N: depth rises
// with the level (8 cells at level 2 up to 40).
export const resolveGeometryBudgetMaxBranch = (level: number): number => (
  Math.min(40, 8 + Math.floor(resolveGeometryBudgetFeltLevel(level) / 6))
);

// Longest fork carved straight off the route at level N (a wrong turn the player
// meets on the way); deeper wrong ground grows from those forks up to the branch
// cap. Kept short so a level has many forks to choose between, not a few long ones.
export const resolveGeometryBudgetRouteBranch = (level: number): number => (
  Math.min(16, 6 + Math.floor(resolveGeometryBudgetFeltLevel(level) / 10))
);

// Forks the tuner puts on the route first at level N (route-hosted lure branches of
// 4..routeBranch cells, as many as the felt budget affords): more choices for the
// player on the way as the ladder climbs.
export const resolveGeometryBudgetForks = (level: number): number => (
  Math.min(30, 2 + Math.floor(resolveGeometryBudgetFeltLevel(level) / 5))
);

// ---------------------------------------------------------------------------
// Multiple routes (loops). Deterministic per (play seed, level) and scaled by the
// maze's cell count, so some levels stay a single route even late and a bigger
// board would carry proportionally more loops.
//
//  * Levels below GEOMETRY_BUDGET_LOOP_FIRST_LEVEL are always a single route
//    (level 1 is the corridor; 2..11 teach the plain maze and the wrap corridor).
//  * Above it a per-seed roll decides whether the maze is a single route: the
//    chance falls from 100 percent at the first level to
//    GEOMETRY_BUDGET_LOOP_PURE_FLOOR_PERCENT at level GEOMETRY_BUDGET_LOOP_FULL_LEVEL
//    and stays there, so even at the top about a third of the mazes have one way.
//  * A looped maze carries 1 loop at the first level, one more every 36 levels
//    (scaled by cells / reference cells, +-1 by seed, at most 8).
//  * Each loop's kind is rolled: decoys (false ways on: loops inside dead-end ground)
//    arrive at level 30 and grow to 40 percent, alternates (equal-length second
//    routes) grow from 10 to 45 percent, the rest are shortcuts, so shortcuts are the
//    mid-ladder feature (they cost priced headroom, see legacyMazeFeltTuning.ts) and the
//    top of the ladder is alternates and decoys.
//  * Connectors lengthen with the level (10 + level / 6 cells, at most 36) and the
//    whole set is capped at a share of the board so deceptive branches keep room.
// ---------------------------------------------------------------------------
export const GEOMETRY_BUDGET_LOOP_FIRST_LEVEL = 12;
export const GEOMETRY_BUDGET_LOOP_FULL_LEVEL = 120;
export const GEOMETRY_BUDGET_LOOP_PURE_FLOOR_PERCENT = 30;
export const GEOMETRY_BUDGET_LOOP_REFERENCE_CELLS = 1275;
export const GEOMETRY_BUDGET_LOOP_MAX_COUNT = 8;
// Tries on the looped plan before a level falls back to a single-route maze (the
// ladder's ordering guarantee outranks the loop: a base that cannot land with loops
// is retried without them).
export const GEOMETRY_BUDGET_LOOP_BASE_ATTEMPTS = 6;
// Base mazes tried (at most) to find a landing whose felt number is not a coin flip for
// the explorer before a biased landing is accepted (legacyMazeFeltTuning.ts, tie pricing).
export const GEOMETRY_BUDGET_TIE_RETRY_BASES = 5;

export const resolveGeometryBudgetLoopPurePercent = (level: number): number => {
  const bounded = resolveGeometryBudgetFeltLevel(level);
  if (bounded < GEOMETRY_BUDGET_LOOP_FIRST_LEVEL) { return 100; }
  const span = GEOMETRY_BUDGET_LOOP_FULL_LEVEL - (GEOMETRY_BUDGET_LOOP_FIRST_LEVEL - 1);
  const drop = Math.floor(((bounded - (GEOMETRY_BUDGET_LOOP_FIRST_LEVEL - 1)) * (100 - GEOMETRY_BUDGET_LOOP_PURE_FLOOR_PERCENT)) / span);
  return 100 - Math.min(100 - GEOMETRY_BUDGET_LOOP_PURE_FLOOR_PERCENT, drop);
};

export const resolveGeometryBudgetLoopPlan = (level: number, seed: number, cells: number): LegacyLoopPlan => {
  const bounded = resolveGeometryBudgetFeltLevel(level);
  if (bounded < GEOMETRY_BUDGET_LOOP_FIRST_LEVEL) { return LEGACY_EMPTY_LOOP_PLAN; }
  const salt = Math.imul(bounded, 31) >>> 0;
  if ((mix32(seed >>> 0, salt + 1) % 100) < resolveGeometryBudgetLoopPurePercent(bounded)) {
    return LEGACY_EMPTY_LOOP_PLAN;
  }
  const areaScale = Math.max(1, cells) / GEOMETRY_BUDGET_LOOP_REFERENCE_CELLS;
  const base = 1 + Math.floor((bounded - GEOMETRY_BUDGET_LOOP_FIRST_LEVEL) / 36);
  const jitter = (mix32(seed >>> 0, salt + 2) % 3) - 1;
  const count = Math.min(GEOMETRY_BUDGET_LOOP_MAX_COUNT, Math.max(1, Math.round(base * areaScale) + jitter));
  const decoyPercent = Math.min(40, Math.max(0, Math.floor((bounded - 30) / 2)));
  const alternatePercent = Math.min(45, 10 + Math.floor((bounded - GEOMETRY_BUDGET_LOOP_FIRST_LEVEL) / 2));
  let shortcuts = 0;
  let alternates = 0;
  let decoys = 0;
  for (let index = 0; index < count; index += 1) {
    const roll = mix32(seed >>> 0, salt + 3 + index) % 100;
    if (roll < decoyPercent) { decoys += 1; } else if (roll < decoyPercent + alternatePercent) { alternates += 1; } else { shortcuts += 1; }
  }
  return {
    shortcuts,
    alternates,
    decoys,
    maxConnector: Math.min(36, 10 + Math.floor(bounded / 6)),
    cellBudget: Math.round(Math.max(1, cells) * 0.06)
  };
};

// The generation profile for budget level N. Level 1 is NOT served by this
// module: it is the corridor layout, owned by the progression module. The
// returned profile never carries a `layout` key and always carries
// `geometryBudgetLevel` (the tuning key).
export const resolveGeometryBudgetProfile = (level: number): LegacyMazeGenerationProfile => (
  resolveGeometryBudgetProfileForRungs(resolveGeometryBudgetRungCount(level), clampBudgetLevel(level))
);

// 'ramp': the felt target still rises; 'fringe': the felt target is at its top and the fringe
// rises (past GEOMETRY_BUDGET_FELT_SATURATION_LEVEL); 'mastery': the fringe is full and the share
// of reverse-solve resistant mazes rises (past GEOMETRY_BUDGET_FRINGE_END_LEVEL); 'plateau':
// geometry can no longer rise.
export type ContinuousDifficultyRegime = 'corridor' | 'ramp' | 'fringe' | 'mastery' | 'plateau';

export interface ContinuousDifficulty {
  readonly level: number;
  readonly regime: ContinuousDifficultyRegime;
  // Geometry proxy target; null for the corridor level (not tuned on the proxy).
  readonly geometryTarget: number | null;
  readonly geometryRungs: number;
  // Zero-felt-cost side-stub cells the maze carries (GEOMETRY_BUDGET_FRINGE_CAP at most).
  readonly fringeCells: number;
  // Share (permille) of the level's mazes that are mastery mazes (reverse-solve resistant);
  // 0 up to GEOMETRY_BUDGET_FRINGE_END_LEVEL, 1000 from GEOMETRY_BUDGET_SATURATION_LEVEL.
  readonly masteryPermille: number;
  // True from GEOMETRY_BUDGET_SATURATION_LEVEL on: geometry difficulty can no
  // longer rise on the frozen board.
  readonly geometrySaturated: boolean;
  // Levels of difficulty owed to the hazard budget (Phase 2: unsigned product
  // contract, NOT wired, dormant): level - SATURATION_LEVEL once saturated, else
  // 0. Rises by exactly 1 per level, without bound, so difficulty past the ceiling
  // is never silently flat. See the hazard hand-off module.
  readonly hazardBudgetLevels: number;
}

// The single definition of D(level) for geometry plus the declared hand-off.
// `level` is the completion ordinal (>= 1, unbounded); only the geometry target
// is capped (at CEILING) -- the hazard share keeps growing. Pure and total.
export const resolveContinuousDifficulty = (level: number): ContinuousDifficulty => {
  const normalized = Math.max(1, Math.trunc(Number.isFinite(level) ? level : 1));
  if (normalized <= 1) {
    return { level: 1, regime: 'corridor', geometryTarget: null, geometryRungs: 0, fringeCells: 0, masteryPermille: 0, geometrySaturated: false, hazardBudgetLevels: 0 };
  }
  const bounded = Math.min(LAST_BUDGET_LEVEL, normalized);
  const saturated = normalized >= GEOMETRY_BUDGET_SATURATION_LEVEL;
  return {
    level: normalized,
    regime: saturated
      ? 'plateau'
      : (normalized > GEOMETRY_BUDGET_FRINGE_END_LEVEL
        ? 'mastery'
        : (normalized > GEOMETRY_BUDGET_FELT_SATURATION_LEVEL ? 'fringe' : 'ramp')),
    geometryTarget: resolveGeometryBudgetTarget(bounded),
    geometryRungs: resolveGeometryBudgetRungCount(bounded),
    fringeCells: resolveGeometryBudgetFringeCells(bounded),
    masteryPermille: resolveGeometryBudgetMasteryPermille(bounded),
    geometrySaturated: saturated,
    hazardBudgetLevels: saturated ? normalized - GEOMETRY_BUDGET_SATURATION_LEVEL : 0
  };
};
