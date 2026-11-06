// Continuous geometry difficulty D(level) for progression levels 2..LAST_BUDGET_LEVEL.
//
// Level 1 is the straight corridor (see legacyMaze.ts, `layout: 'corridor'`).
// Every later bounded level is defined by ONE monotone target function on ONE
// frozen board -- not by hand-tuned bands:
//
//   T(N) = min(CEILING, START + STEP * (N - 2))        (resolveGeometryBudgetTarget)
//
// T is the H1 geometry proxy (see measureGeometryBudgetProxy). Two things make
// each generated maze land on T(N):
//
//  1. CONTENT STYLE. A nested "tape" of purchasable structure rungs (checkpoint
//     branches, dead-end caps, wraps, border feeders). Level N owns the first R(N) rungs, where R(N) is the prefix whose
//     measured mean proxy is closest to T(N). R is non-decreasing; the board
//     never changes. This sets the maze's character (more rungs, more mazeish).
//  2. EXACT LANDING. One base maze is built from that profile and then DECOY
//     TUNED (legacyMazeDecoyTuning.ts): dead-end decoy branches are added or
//     pruned until the proxy is within +-TOLERANCE of T(N). Because STEP is
//     greater than 2 * TOLERANCE, the realized proxy of level N+1 is strictly
//     greater than that of level N for ANY two seeds, by construction, up to the
//     hard ceiling (not statistically). The build costs one maze plus a few grid
//     edits (no candidate search).
//
// HARD CEILING. A frozen board has finite decoy capacity. CEILING is the
// largest grid target every sampled seed on every sampled board shape can still
// reach (measured by the calibration script's capacity pass, see the GENERATED
// block); GEOMETRY_BUDGET_SATURATION_LEVEL is the level at which T reaches it. From
// there geometry is a declared plateau: levels beyond keep the ceiling target,
// stay valid and deterministic (the play seed still advances every level, so the
// mazes differ) but are the same difficulty class, and the hazard budget
// (Phase 2, unsigned contract, dormant) is what must take over. See
// `resolveContinuousDifficulty` and the hazard hand-off module.
//
// This module is pure: it imports only TYPES, so legacyMaze.ts (profile
// normalization) and legacyProgression.ts (the hook) can both depend on it
// without an import cycle. It deliberately does not know about the 8..400
// target-complexity track, ranks, palettes, bands or the server-owned level
// ordinal -- the progression module owns the single seam that turns a track
// into a budget level (`resolveGeometryBudgetLevel`).
//
// What is NOT on the tape (measured, see the P2 design record): the shortcut /
// route-reinforcement multipliers (inert on a frozen 35-scale board because the
// shortcut stage needs scale > 35). Those stay at the base value.

import type { LegacyMazeGenerationProfile } from './legacyMaze';

// Unlock spacing K = 5, in tape "spending" units: the first rung of type i is
// priced at 2 + K * i. The three original types interleave on one tape; the
// spacing is in spending space, not in levels.
export const GEOMETRY_BUDGET_UNLOCK_SPACING = 5;

// Exact increase of T(N) between adjacent levels below the ceiling: the hard
// per-level step bound of the target function. (The previous ladder's largest
// target step was ~40; the band switch at 31 stepped the realized proxy by ~73.)
export const GEOMETRY_BUDGET_TARGET_STEP = 3;

// Decoy tuning lands every maze within this distance of T(N). STEP must stay
// strictly greater than twice this, so two tuned mazes of adjacent ascending
// levels can never tie or invert (realized difference >= STEP - 2 * TOLERANCE = 1).
// The tuner's +5 / +2 moves reach every integer offset except 1 and 3, so
// 1.0 is the tightest tolerance they can honour.
export const GEOMETRY_BUDGET_TUNING_TOLERANCE = 1;

// Style offset: level N's rung prefix is the one whose mean proxy is closest to
// T(N) - OFFSET, i.e. the base maze usually starts a little BELOW the target so
// the tuner mostly adds decoys (adding is unlimited in practice; pruning is
// limited to the few off-route dead-end branches a base maze happens to have).
export const GEOMETRY_BUDGET_BASE_OFFSET = 15;

// Cap on base mazes tried per level (the loop stops at the first one that tunes
// onto the target, which is almost always the first). Only the lowest levels, where T(N)
// can sit below an unlucky base maze's untunable part, ever need more than one.
export const GEOMETRY_BUDGET_BASE_CANDIDATES = 24;

type GeometryBudgetRungType = 'branch' | 'dead' | 'wrap';

interface GeometryBudgetRungSpec {
  readonly type: GeometryBudgetRungType;
  readonly label: string;
  readonly apply: (profile: MutableBudgetProfile) => void;
}

export interface GeometryBudgetRung {
  readonly type: GeometryBudgetRungType;
  readonly label: string;
}

type MutableBudgetProfile = {
  -readonly [K in keyof LegacyMazeGenerationProfile]: LegacyMazeGenerationProfile[K];
} & {
  requiredOppositeBorderConnections: { horizontal: boolean; vertical: boolean };
};

// Structure types in unlock order (type index i is first priced at 2 + K * i).
const TYPE_ORDER: readonly GeometryBudgetRungType[] = ['branch', 'dead', 'wrap'];

// Per-type price growth: the k-th rung of a type costs
// K * (1 + k / m) "levels of spending" (convex, so each type slows down and the
// next type's first rung becomes the cheapest purchase). Integer-scaled by
// TICKS_PER_LEVEL (= lcm of every m) so ordering never depends on float
// rounding.
const PRICE_GROWTH_DENOMINATOR: Readonly<Record<GeometryBudgetRungType, number>> = {
  branch: 8,
  dead: 6,
  wrap: 3
};
const TICKS_PER_LEVEL = 24;

// Branch rungs: explicit checkpoint counts, then the checkpoint multiplier
// (override released) for the dense tail.
const BRANCH_RUNGS: readonly (number | { multiplier: number })[] = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40,
  { multiplier: 0.8 }, { multiplier: 1.0 }, { multiplier: 1.2 }, { multiplier: 1.4 }, { multiplier: 1.6 }
];
// Dead-end caps (maxDeadEndCount); null = uncapped.
const DEAD_RUNGS: readonly (number | null)[] = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 32, null];
// Wrap rungs: horizontal wrap, vertical wrap, then feeders per side (feeders
// require both wraps).
const WRAP_RUNGS: readonly ('h' | 'v' | 2 | 3 | 4)[] = ['h', 'v', 2, 3, 4];

// Extension segment, appended AFTER the priced tape (never interleaved, so the
// original 44 rungs keep their order): border feeders beyond 4 per side (the
// profile clamps at 8). Measured on the frozen board: feeders 4 -> 8 lift the
// ungated mean proxy from ~302 to ~400 and keep the route length and the
// solver-effort metrics at the tape's level. A straightness descent (bias 0.95
// -> 0.5) was tried as further rungs and REJECTED: it lifts the proxy and the
// decoy capacity but shortens the route (~126 -> ~94 cells) and halves the A*
// search effort, so late levels would score higher on the proxy and be easier
// to solve.
const EXTENSION_FEEDERS: readonly (5 | 6 | 7 | 8)[] = [5, 6, 7, 8];

const BASE_PROFILE: Readonly<LegacyMazeGenerationProfile> = {
  borderFeederTargetPerSide: 0,
  checkpointCountMultiplier: 0.42,
  checkpointCountOverride: 1,
  maxDeadEndCount: 0,
  minCheckpoints: 1,
  requiredOppositeBorderConnections: { horizontal: false, vertical: false },
  routeQualityReinforcementMultiplier: 0,
  shortcutCountMultiplier: 0,
  straightnessBias: 0.95
};

const buildRungSpecs = (): GeometryBudgetRungSpec[] => {
  const ranked: { spec: GeometryBudgetRungSpec; key: number; typeIndex: number; index: number }[] = [];
  const push = (
    type: GeometryBudgetRungType,
    count: number,
    make: (index: number) => Omit<GeometryBudgetRungSpec, 'type'>
  ): void => {
    const typeIndex = TYPE_ORDER.indexOf(type);
    const growth = PRICE_GROWTH_DENOMINATOR[type];
    let key = (2 + (GEOMETRY_BUDGET_UNLOCK_SPACING * typeIndex)) * TICKS_PER_LEVEL;
    for (let index = 0; index < count; index += 1) {
      ranked.push({ spec: { type, ...make(index) }, key, typeIndex, index });
      // Price of the next rung of this type: K * (1 + index / m), in ticks.
      key += (GEOMETRY_BUDGET_UNLOCK_SPACING * (growth + index) * TICKS_PER_LEVEL) / growth;
    }
  };

  push('branch', BRANCH_RUNGS.length, (index) => {
    const value = BRANCH_RUNGS[index]!;
    return typeof value === 'number'
      ? { label: `branch:${value}`, apply: (profile) => { profile.checkpointCountOverride = value; } }
      : {
        label: `branch:m${value.multiplier}`,
        apply: (profile) => {
          profile.checkpointCountOverride = null;
          profile.checkpointCountMultiplier = value.multiplier;
        }
      };
  });
  push('dead', DEAD_RUNGS.length, (index) => {
    const value = DEAD_RUNGS[index]!;
    return { label: `dead:${value}`, apply: (profile) => { profile.maxDeadEndCount = value; } };
  });
  push('wrap', WRAP_RUNGS.length, (index) => {
    const value = WRAP_RUNGS[index]!;
    return {
      label: `wrap:${value}`,
      apply: (profile) => {
        if (value === 'h') {
          profile.requiredOppositeBorderConnections.horizontal = true;
        } else if (value === 'v') {
          profile.requiredOppositeBorderConnections.vertical = true;
        } else {
          profile.requiredOppositeBorderConnections.horizontal = true;
          profile.requiredOppositeBorderConnections.vertical = true;
          profile.borderFeederTargetPerSide = value;
        }
      }
    };
  });

  const priced = ranked
    .sort((a, b) => (a.key - b.key) || (a.typeIndex - b.typeIndex) || (a.index - b.index))
    .map((entry) => entry.spec);
  const extension: GeometryBudgetRungSpec[] = EXTENSION_FEEDERS.map((feeders) => ({
    type: 'wrap' as const,
    label: `wrap:${feeders}`,
    apply: (profile: MutableBudgetProfile) => {
      profile.requiredOppositeBorderConnections.horizontal = true;
      profile.requiredOppositeBorderConnections.vertical = true;
      profile.borderFeederTargetPerSide = feeders;
    }
  }));
  return [...priced, ...extension];
};

const RUNG_SPECS: readonly GeometryBudgetRungSpec[] = buildRungSpecs();

export const GEOMETRY_BUDGET_TAPE: readonly GeometryBudgetRung[] = RUNG_SPECS.map(({ type, label }) => ({ type, label }));

// Total rungs on the tape.
export const GEOMETRY_BUDGET_TAPE_LENGTH = RUNG_SPECS.length;

// The profile that owns the first `rungs` rungs of the tape (clamped to the
// tape). `level` becomes the gate key; omit it for an UNGATED profile (used by
// calibration to sample the raw distribution of a rung prefix).
export const resolveGeometryBudgetProfileForRungs = (
  rungs: number,
  level?: number
): LegacyMazeGenerationProfile => {
  const profile: MutableBudgetProfile = {
    ...BASE_PROFILE,
    requiredOppositeBorderConnections: { ...BASE_PROFILE.requiredOppositeBorderConnections }
  };
  const owned = Math.min(RUNG_SPECS.length, Math.max(0, Math.trunc(rungs)));
  for (let index = 0; index < owned; index += 1) {
    RUNG_SPECS[index]!.apply(profile);
  }
  if (level !== undefined) {
    profile.geometryBudgetLevel = level;
  }
  return profile;
};

// ---------------------------------------------------------------------------
// Proxy for "harder": H1 = turns + len/4 + 3*splits + 2*max(0, dead-2) + 6*wraps
//
// The weights are a modelling choice, not a measured player-difficulty law.
// They are chosen so every tape rung raises the mean H1 and so the proxy does
// not saturate or depend on board size the way the 400-capped complexity does.
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
// edit by hand. Two passes on the frozen board (phone, desktop, square):
//  1. For every tape prefix it samples an UNGATED maze population, takes the
//     pooled mean proxy and makes it monotone in the prefix length
//     (pool-adjacent-violators). START = the base profile's mean (rounded);
//     RUNGS[N] = the prefix length whose monotone mean is closest to
//     T(N) - BASE_OFFSET
//     (clamped to the full tape once T exceeds the tape's mean).
//  2. Decoy capacity: from the full-tape base it adds decoys until none fit and
//     records the proxy reached per seed. CEILING = the grid value
//     START + k * STEP at or below the pooled sample MINIMUM minus a safety
//     margin, i.e. a target every sampled seed on every sampled board could
//     still hit.
// tests/reset/legacy-geometry-budget.test.ts checks the table's structure and
// samples levels against fresh generation; `--check` on the script recomputes
// both passes.
// ---------------------------------------------------------------------------

// GENERATED:GEOMETRY_BUDGET_CALIBRATION:BEGIN
export const GEOMETRY_BUDGET_START = 39;
export const GEOMETRY_BUDGET_CEILING = 588;
export const GEOMETRY_BUDGET_RUNGS_BY_LEVEL: Readonly<Record<number, number>> = {
  2: 0,
  3: 0,
  4: 0,
  5: 0,
  6: 0,
  7: 0,
  8: 0,
  9: 1,
  10: 1,
  11: 2,
  12: 2,
  13: 3,
  14: 4,
  15: 4,
  16: 5,
  17: 5,
  18: 5,
  19: 6,
  20: 6,
  21: 6,
  22: 7,
  23: 7,
  24: 8,
  25: 9,
  26: 9,
  27: 9,
  28: 9,
  29: 9,
  30: 9,
  31: 9,
  32: 10,
  33: 10,
  34: 10,
  35: 10,
  36: 10,
  37: 10,
  38: 10,
  39: 10,
  40: 11,
  41: 13,
  42: 13,
  43: 13,
  44: 13,
  45: 13,
  46: 13,
  47: 13,
  48: 13,
  49: 14,
  50: 14,
  51: 14,
  52: 14,
  53: 14,
  54: 14,
  55: 14,
  56: 15,
  57: 15,
  58: 17,
  59: 17,
  60: 17,
  61: 17,
  62: 17,
  63: 17,
  64: 17,
  65: 18,
  66: 18,
  67: 18,
  68: 18,
  69: 18,
  70: 18,
  71: 18,
  72: 18,
  73: 19,
  74: 19,
  75: 22,
  76: 24,
  77: 24,
  78: 25,
  79: 25,
  80: 25,
  81: 26,
  82: 26,
  83: 28,
  84: 30,
  85: 30,
  86: 31,
  87: 31,
  88: 34,
  89: 36,
  90: 37,
  91: 37,
  92: 39,
  93: 41,
  94: 41,
  95: 42,
  96: 42,
  97: 42,
  98: 42,
  99: 42,
  100: 42,
  101: 45,
  102: 45,
  103: 45,
  104: 45,
  105: 45,
  106: 45,
  107: 45,
  108: 45,
  109: 45,
  110: 45,
  111: 46,
  112: 46,
  113: 46,
  114: 46,
  115: 46,
  116: 46,
  117: 46,
  118: 47,
  119: 47,
  120: 47,
  121: 47,
  122: 47,
  123: 48,
  124: 48,
  125: 48,
  126: 48,
  127: 48,
  128: 48,
  129: 48,
  130: 48,
  131: 48,
  132: 48,
  133: 48,
  134: 48,
  135: 48,
  136: 48,
  137: 48,
  138: 48,
  139: 48,
  140: 48,
  141: 48,
  142: 48,
  143: 48,
  144: 48,
  145: 48,
  146: 48,
  147: 48,
  148: 48,
  149: 48,
  150: 48,
  151: 48,
  152: 48,
  153: 48,
  154: 48,
  155: 48,
  156: 48,
  157: 48,
  158: 48,
  159: 48,
  160: 48,
  161: 48,
  162: 48,
  163: 48,
  164: 48,
  165: 48,
  166: 48,
  167: 48,
  168: 48,
  169: 48,
  170: 48,
  171: 48,
  172: 48,
  173: 48,
  174: 48,
  175: 48,
  176: 48,
  177: 48,
  178: 48,
  179: 48,
  180: 48,
  181: 48,
  182: 48,
  183: 48,
  184: 48,
  185: 48
};
// GENERATED:GEOMETRY_BUDGET_CALIBRATION:END

// The first level whose target has reached the ceiling: the HARD CEILING of
// geometry difficulty on the frozen board. Levels at or beyond it share the
// ceiling difficulty class.
export const GEOMETRY_BUDGET_SATURATION_LEVEL = 2 + Math.ceil(
  (GEOMETRY_BUDGET_CEILING - GEOMETRY_BUDGET_START) / GEOMETRY_BUDGET_TARGET_STEP
);

// The last BOUNDED progression level whose geometry comes from this function:
// the saturation level. Every level >= 2 up to it has its own target; completion
// ordinals above it map to this level for geometry (plateau) and keep counting in
// `resolveContinuousDifficulty`. Also the upper bound of the profile's
// `geometryBudgetLevel` field.
export const LAST_BUDGET_LEVEL = GEOMETRY_BUDGET_SATURATION_LEVEL;

// T(N): the proxy target for budget level N (2..LAST_BUDGET_LEVEL); null outside.
export const resolveGeometryBudgetTarget = (level: number): number | null => {
  const normalized = Math.trunc(level);
  if (!Number.isFinite(normalized) || normalized < 2 || normalized > LAST_BUDGET_LEVEL) {
    return null;
  }
  return Math.min(
    GEOMETRY_BUDGET_CEILING,
    GEOMETRY_BUDGET_START + (GEOMETRY_BUDGET_TARGET_STEP * (normalized - 2))
  );
};

// R(N): how many tape rungs level N owns (non-decreasing; constant from the
// last tabulated level on).
export const resolveGeometryBudgetRungCount = (level: number): number => {
  const normalized = Math.min(
    GEOMETRY_BUDGET_SATURATION_LEVEL,
    Math.max(2, Math.trunc(Number.isFinite(level) ? level : 2))
  );
  return GEOMETRY_BUDGET_RUNGS_BY_LEVEL[normalized] ?? GEOMETRY_BUDGET_TAPE_LENGTH;
};

// The generation profile for budget level N. Level 1 is NOT served by this
// module: it is the corridor layout, owned by the progression module. The
// returned profile never carries a `layout` key and always carries
// `geometryBudgetLevel` (the tuning key).
export const resolveGeometryBudgetProfile = (level: number): LegacyMazeGenerationProfile => (
  resolveGeometryBudgetProfileForRungs(
    resolveGeometryBudgetRungCount(level),
    Math.min(LAST_BUDGET_LEVEL, Math.max(2, Math.trunc(level)))
  )
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
