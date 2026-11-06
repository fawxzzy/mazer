// Continuous geometry difficulty D(level) for progression levels 2..LAST_BUDGET_LEVEL.
//
// Level 1 is the straight corridor (see legacyMaze.ts, `layout: 'corridor'`).
// Every later bounded level is defined by ONE monotone target function on ONE
// frozen board -- not by hand-tuned bands:
//
//   T(N) = min(CEILING, START + STEP * (N - 2))        (resolveGeometryBudgetTarget)
//
// T is the H1 geometry proxy (see measureGeometryBudgetProxy) the runtime gate
// steers each generated maze toward. The CONTENT that makes a maze reach T(N)
// comes from a nested "tape" of purchasable structure rungs: level N owns the
// first R(N) rungs of one fixed, ordered tape, where R(N) is the prefix whose
// measured mean proxy is closest to T(N). R is non-decreasing, so level N+1 owns
// level N's rungs and possibly more; the board never changes.
//
// SATURATION. A frozen board with a finite tape cannot get harder forever:
// the full tape's mean proxy flattens at CEILING (measured, see the GENERATED
// block). The first level at which T reaches CEILING is
// GEOMETRY_BUDGET_SATURATION_LEVEL; from there geometry is a declared plateau
// (levels vary only by seed) and the hazard budget (unsigned product contract,
// NOT wired) must take over. `resolveContinuousDifficulty` reports that hand-off
// explicitly so nothing past the ceiling pretends to be harder geometry.
//
// This module is pure: it imports only TYPES, so legacyMaze.ts (profile
// normalization) and legacyProgression.ts (the hook) can both depend on it
// without an import cycle. It deliberately does not know about the 8..400
// target-complexity track, ranks, palettes, bands or the server-owned level
// ordinal -- the progression module owns the single seam that turns a track
// into a budget level (`resolveGeometryBudgetLevel`).
//
// What is NOT on the tape (measured, see the P2 design record): the
// straightness bias (anti-monotone in length/splits/junctions), and the
// shortcut / route-reinforcement multipliers (inert on a frozen 35-scale board
// because the shortcut stage needs scale > 35). Those stay at the base value.

import type { LegacyMazeGenerationProfile } from './legacyMaze';

// The last BOUNDED progression level whose geometry comes from this function.
// Equal to the bounded level clamp (resolveLegacyProgressionLevel), so every
// bounded level >= 2 is covered: the legacy band geometry path is no longer
// reachable for levels >= 2. Completion ordinals above it map to this level for
// geometry (a plateau) and keep counting in `resolveContinuousDifficulty`.
export const LAST_BUDGET_LEVEL = 99;

// Unlock spacing K = 5, in tape "spending" units: the first rung of type i is
// priced at 2 + K * i. The three types interleave on one tape; the spacing is
// in spending space, not in levels.
export const GEOMETRY_BUDGET_UNLOCK_SPACING = 5;

// Candidate-gate size used by the runtime selection (see
// legacyGenerationLifecycle.ts): the HARD CAP on candidates scanned per level.
// The scan stops at the first candidate inside the accept window, so the mean
// cost is ~12 candidates (a candidate costs ~12-25 ms); only a miss scans to the
// cap. Raising the cap from 16 to 48 cuts the adjacent-level proxy inversion
// rate from ~8% (K=16 at this step) to ~0.4% at the price of a longer tail
// (p95 ~40 candidates). Measured on a dev machine only: slower phones scale the
// tail linearly. The baked rung schedule does not depend on K.
export const GEOMETRY_BUDGET_GATE_CANDIDATES = 48;

// Exact increase of T(N) between adjacent levels below the ceiling: the hard
// per-level step bound of the target function. (The previous ladder's largest
// target step was ~40; the band switch at 31 stepped the realized proxy by ~73.)
export const GEOMETRY_BUDGET_TARGET_STEP = 5;

// A candidate whose proxy is within this distance of T(N) is accepted without
// scanning the rest of the gate. Strictly less than half of
// GEOMETRY_BUDGET_TARGET_STEP, so two accepted candidates on adjacent
// ascending levels can never invert or tie.
export const GEOMETRY_BUDGET_ACCEPT_HALF_WIDTH = 2.4;

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

  return ranked
    .sort((a, b) => (a.key - b.key) || (a.typeIndex - b.typeIndex) || (a.index - b.index))
    .map((entry) => entry.spec);
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
// edit by hand. For every tape prefix it samples an UNGATED maze population on
// the frozen board (phone, desktop, square), takes the pooled mean proxy,
// makes it monotone in the prefix length (pool-adjacent-violators), then
//   START   = the base profile's mean proxy (rounded to the step grid),
//   CEILING = the full tape's monotone mean, rounded DOWN onto
//             START + k * GEOMETRY_BUDGET_TARGET_STEP (the last step is a full
//             step, never a short one),
//   RUNGS[N] = the prefix length whose monotone mean is closest to T(N).
// tests/reset/legacy-geometry-budget.test.ts checks the table's structure and
// samples a few levels against fresh generation; `--check` on the script
// recomputes the whole table.
// ---------------------------------------------------------------------------

// GENERATED:GEOMETRY_BUDGET_CALIBRATION:BEGIN
export const GEOMETRY_BUDGET_START = 39;
export const GEOMETRY_BUDGET_CEILING = 299;
export const GEOMETRY_BUDGET_RUNGS_BY_LEVEL: Readonly<Record<number, number>> = {
  2: 0,
  3: 1,
  4: 1,
  5: 2,
  6: 3,
  7: 4,
  8: 5,
  9: 5,
  10: 6,
  11: 7,
  12: 8,
  13: 9,
  14: 9,
  15: 9,
  16: 9,
  17: 10,
  18: 10,
  19: 10,
  20: 10,
  21: 10,
  22: 12,
  23: 13,
  24: 13,
  25: 13,
  26: 13,
  27: 14,
  28: 14,
  29: 14,
  30: 14,
  31: 14,
  32: 15,
  33: 17,
  34: 17,
  35: 17,
  36: 17,
  37: 18,
  38: 18,
  39: 18,
  40: 18,
  41: 18,
  42: 19,
  43: 23,
  44: 24,
  45: 25,
  46: 25,
  47: 26,
  48: 29,
  49: 31,
  50: 31,
  51: 36,
  52: 37,
  53: 39,
  54: 41
};
// GENERATED:GEOMETRY_BUDGET_CALIBRATION:END

// The first level whose target has reached the ceiling. From here the geometry
// content cannot rise on the frozen board (declared plateau).
export const GEOMETRY_BUDGET_SATURATION_LEVEL = 2 + Math.ceil(
  (GEOMETRY_BUDGET_CEILING - GEOMETRY_BUDGET_START) / GEOMETRY_BUDGET_TARGET_STEP
);

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
// saturation level on).
export const resolveGeometryBudgetRungCount = (level: number): number => {
  const normalized = Math.min(
    GEOMETRY_BUDGET_SATURATION_LEVEL,
    Math.max(2, Math.trunc(Number.isFinite(level) ? level : 2))
  );
  return GEOMETRY_BUDGET_RUNGS_BY_LEVEL[normalized] ?? 0;
};

// The generation profile for budget level N. Level 1 is NOT served by this
// module: it is the corridor layout, owned by the progression module. The
// returned profile never carries a `layout` key and always carries
// `geometryBudgetLevel` (the gate key).
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
  // Geometry proxy target; null for the corridor level (not gated on the proxy).
  readonly geometryTarget: number | null;
  readonly geometryRungs: number;
  // True from GEOMETRY_BUDGET_SATURATION_LEVEL on: geometry content can no
  // longer rise on the frozen board.
  readonly geometrySaturated: boolean;
  // Levels of difficulty owed to the hazard budget (unsigned product contract,
  // NOT wired): level - SATURATION_LEVEL once saturated, else 0. Rises by
  // exactly 1 per level, without bound, so difficulty past the ceiling is never
  // silently flat.
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
