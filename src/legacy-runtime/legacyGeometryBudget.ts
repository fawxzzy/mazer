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
// whose scheduled target fits under it. From there the ladder is a declared plateau: levels beyond
// keep the ceiling target, stay valid and deterministic (the play seed still
// advances every level, so the mazes differ) but are the same difficulty class,
// and the hazard budget (Phase 2, unsigned contract, dormant) is what must take
// over. See `resolveContinuousDifficulty` and the hazard hand-off module.
//
// This module is pure: it imports only TYPES, so legacyMaze.ts (profile
// normalization) and legacyProgression.ts (the hook) can both depend on it
// without an import cycle. It deliberately does not know about the 8..400
// target-complexity track, ranks, palettes, bands or the server-owned level
// ordinal -- the progression module owns the single seam that turns a track
// into a budget level (`resolveGeometryBudgetLevel`).

import type { LegacyMazeGenerationProfile } from './legacyMaze';

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

// Style bands: the number of wrap-corridor rungs of the base profile by level.
// Rung 1 = vertical wrap corridor, rung 2 = horizontal as well. A wrap corridor
// is a shortcut the explorer can take, so each one costs felt headroom (measured:
// at the top of the ladder a base with both wraps reaches a given target on
// roughly 0.3 fewer of the base mazes than a plain one); they are therefore
// confined to the mid ladder, where T is far below capacity, and the top of the
// ladder uses plain bases. Feeders and extra checkpoint branches are not used:
// they only consume floor that deceptive branches need.
export const GEOMETRY_BUDGET_STYLE_BANDS: readonly { readonly fromLevel: number; readonly rungs: number }[] = [
  { fromLevel: 2, rungs: 0 },
  { fromLevel: 10, rungs: 1 },
  { fromLevel: 30, rungs: 2 },
  { fromLevel: 120, rungs: 0 }
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
// GENERATED:GEOMETRY_BUDGET_CALIBRATION:END

// The last level whose scheduled target does not exceed the ceiling: the HARD
// CEILING of felt difficulty on the frozen board. Levels at or beyond it share
// the top target (the schedule value there, at most CEILING and never clipped, so
// the last ramp step is a full step too).
export const GEOMETRY_BUDGET_SATURATION_LEVEL = ((): number => {
  let level = 2;
  while (resolveGeometryBudgetSchedule(level + 1) <= GEOMETRY_BUDGET_CEILING) { level += 1; }
  return level;
})();

// The felt target every level at or past saturation steers to.
export const GEOMETRY_BUDGET_TOP_TARGET = resolveGeometryBudgetSchedule(GEOMETRY_BUDGET_SATURATION_LEVEL);

// The last BOUNDED progression level whose geometry comes from this function:
// the saturation level. Every level >= 2 up to it has its own target; completion
// ordinals above it map to this level for geometry (plateau) and keep counting in
// `resolveContinuousDifficulty`. Also the upper bound of the profile's
// `geometryBudgetLevel` field.
export const LAST_BUDGET_LEVEL = GEOMETRY_BUDGET_SATURATION_LEVEL;

const clampBudgetLevel = (level: number): number => Math.min(
  LAST_BUDGET_LEVEL,
  Math.max(2, Math.trunc(Number.isFinite(level) ? level : 2))
);

// T(N): the felt target for budget level N (2..LAST_BUDGET_LEVEL); null outside.
export const resolveGeometryBudgetTarget = (level: number): number | null => {
  const normalized = Math.trunc(level);
  if (!Number.isFinite(normalized) || normalized < 2 || normalized > LAST_BUDGET_LEVEL) {
    return null;
  }
  return resolveGeometryBudgetSchedule(normalized);
};

// Wrap rungs level N's base profile owns (see GEOMETRY_BUDGET_STYLE_BANDS).
export const resolveGeometryBudgetRungCount = (level: number): number => {
  const normalized = clampBudgetLevel(level);
  let rungs = 0;
  for (const band of GEOMETRY_BUDGET_STYLE_BANDS) {
    if (normalized >= band.fromLevel) { rungs = band.rungs; }
  }
  return rungs;
};

// Route-length target of level N: the explorer's final path is stretched with
// switchback bumps toward 38% of the felt target (a base maze whose route is
// already longer is left alone), so the route rises with the level while the
// deceptive branches keep the room to pay for the rest.
export const GEOMETRY_BUDGET_ROUTE_SHARE_PERCENT = 38;
export const resolveGeometryBudgetRouteTarget = (level: number): number => {
  const target = resolveGeometryBudgetTarget(clampBudgetLevel(level)) ?? GEOMETRY_BUDGET_TOP_TARGET;
  return Math.floor((target * GEOMETRY_BUDGET_ROUTE_SHARE_PERCENT) / 100);
};

// Longest deceptive branch the tuner carves in one move at level N: depth rises
// with the level (8 cells at level 2 up to 40).
export const resolveGeometryBudgetMaxBranch = (level: number): number => (
  Math.min(40, 8 + Math.floor(clampBudgetLevel(level) / 6))
);

// Longest fork carved straight off the route at level N (a wrong turn the player
// meets on the way); deeper wrong ground grows from those forks up to the branch
// cap. Kept short so a level has many forks to choose between, not a few long ones.
export const resolveGeometryBudgetRouteBranch = (level: number): number => (
  Math.min(16, 6 + Math.floor(clampBudgetLevel(level) / 10))
);

// Forks the tuner puts on the route first at level N (route-hosted lure branches of
// 4..routeBranch cells, as many as the felt budget affords): more choices for the
// player on the way as the ladder climbs.
export const resolveGeometryBudgetForks = (level: number): number => (
  Math.min(30, 2 + Math.floor(clampBudgetLevel(level) / 5))
);

// The generation profile for budget level N. Level 1 is NOT served by this
// module: it is the corridor layout, owned by the progression module. The
// returned profile never carries a `layout` key and always carries
// `geometryBudgetLevel` (the tuning key).
export const resolveGeometryBudgetProfile = (level: number): LegacyMazeGenerationProfile => (
  resolveGeometryBudgetProfileForRungs(resolveGeometryBudgetRungCount(level), clampBudgetLevel(level))
);

export type ContinuousDifficultyRegime = 'corridor' | 'ramp' | 'plateau';

export interface ContinuousDifficulty {
  readonly level: number;
  readonly regime: ContinuousDifficultyRegime;
  // Geometry proxy target; null for the corridor level (not tuned on the proxy).
  readonly geometryTarget: number | null;
  readonly geometryRungs: number;
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
    return { level: 1, regime: 'corridor', geometryTarget: null, geometryRungs: 0, geometrySaturated: false, hazardBudgetLevels: 0 };
  }
  const bounded = Math.min(LAST_BUDGET_LEVEL, normalized);
  const saturated = normalized >= GEOMETRY_BUDGET_SATURATION_LEVEL;
  return {
    level: normalized,
    regime: saturated ? 'plateau' : 'ramp',
    geometryTarget: resolveGeometryBudgetTarget(bounded),
    geometryRungs: resolveGeometryBudgetRungCount(bounded),
    geometrySaturated: saturated,
    hazardBudgetLevels: saturated ? normalized - GEOMETRY_BUDGET_SATURATION_LEVEL : 0
  };
};
