// Geometry budget ladder for progression levels 2..LAST_BUDGET_LEVEL.
//
// Level 1 is the straight corridor (see legacyMaze.ts, `layout: 'corridor'`).
// Every later level in the budget range is defined NOT by a hand-tuned band
// but by a nested "tape" of purchasable structure rungs: level N owns exactly
// the first N-1 rungs of one fixed, ordered tape, so level N+1 always owns
// level N's rungs plus exactly one more. The profile is therefore distinct and
// strictly richer at every level by construction, on a frozen board.
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

// The last progression level whose geometry comes from this ladder. Levels
// above it keep the legacy band path byte-for-byte. This is the ONE place the
// range is declared; every consumer imports it.
export const LAST_BUDGET_LEVEL = 30;

// Unlock spacing K = 5, in tape "spending" units: the first rung of type i is
// priced at 2 + K * i. Because the three types interleave on one tape, the
// realized first appearance is level 2 (branches), level 4 (dead ends) and
// level 6 (edge wraps); the spacing is in spending space, not in levels.
export const GEOMETRY_BUDGET_UNLOCK_SPACING = 5;

// Candidate-gate size used by the runtime selection (see
// legacyGenerationLifecycle.ts). Chosen empirically as the floor of the 16..32
// range: generating a candidate costs ~12-25 ms, so no K in the range keeps the
// gate's p95 under ~250 ms on a loaded dev machine. Larger K lowers the
// adjacent-level inversion rate (K=16: ~3.5% per pair, K=32: ~0.3%) at
// proportionally higher goal-reset cost. The baked targets do not depend on K.
export const GEOMETRY_BUDGET_GATE_CANDIDATES = 16;

// A candidate whose proxy is within this distance of T(N) is accepted without
// scanning the rest of the gate. Strictly less than half of
// GEOMETRY_BUDGET_TARGET_MIN_STEP, so two accepted candidates on adjacent
// levels can never invert or tie.
export const GEOMETRY_BUDGET_ACCEPT_HALF_WIDTH = 2.9;

// Minimum increase of T(N) between adjacent levels.
export const GEOMETRY_BUDGET_TARGET_MIN_STEP = 6;

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
  2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40,
  { multiplier: 0.8 }, { multiplier: 1.0 }, { multiplier: 1.2 }, { multiplier: 1.4 }, { multiplier: 1.6 }
];
// Dead-end caps (maxDeadEndCount); null = uncapped.
const DEAD_RUNGS: readonly (number | null)[] = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, null];
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

// Number of rungs level N owns: N - 1, capped at the tape length.
export const resolveGeometryBudgetRungCount = (level: number): number => (
  Math.min(RUNG_SPECS.length, Math.max(0, Math.trunc(level) - 1))
);

// The first level at which the tape has nothing left to buy.
export const GEOMETRY_BUDGET_TAPE_CEILING_LEVEL = RUNG_SPECS.length + 1;

// The generation profile for budget level N. Level 1 (no rungs) is the bare
// base profile and is NOT used by the game: level 1 is the corridor layout,
// owned by the progression module. The returned profile never carries a
// `layout` key and always carries `geometryBudgetLevel` (the gate key).
export const resolveGeometryBudgetProfile = (level: number): LegacyMazeGenerationProfile => {
  const normalizedLevel = Math.max(1, Math.trunc(level));
  const profile: MutableBudgetProfile = {
    ...BASE_PROFILE,
    requiredOppositeBorderConnections: { ...BASE_PROFILE.requiredOppositeBorderConnections }
  };
  const owned = resolveGeometryBudgetRungCount(normalizedLevel);
  for (let index = 0; index < owned; index += 1) {
    RUNG_SPECS[index]!.apply(profile);
  }
  profile.geometryBudgetLevel = normalizedLevel;
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
// Baked proxy targets T(N), levels 2..LAST_BUDGET_LEVEL.
//
// GENERATED by scripts/analysis/generate-geometry-budget-targets.ts -- do not
// edit by hand. tests/reset/legacy-geometry-budget.test.ts recomputes the
// table from the script's calibration and fails on drift.
// ---------------------------------------------------------------------------

// GENERATED:GEOMETRY_BUDGET_TARGETS:BEGIN
export const GEOMETRY_BUDGET_TARGETS: Readonly<Record<number, number>> = {
  2: 49.75,
  3: 55.75,
  4: 61.75,
  5: 67.75,
  6: 73.75,
  7: 80.25,
  8: 90.5,
  9: 96.5,
  10: 102.5,
  11: 131.5,
  12: 137.5,
  13: 143.5,
  14: 149.5,
  15: 189.75,
  16: 195.75,
  17: 201.75,
  18: 207.75,
  19: 236.25,
  20: 242.25,
  21: 248.25,
  22: 254.25,
  23: 260.25,
  24: 266.25,
  25: 272.25,
  26: 278.25,
  27: 284.25,
  28: 290.25,
  29: 296.25,
  30: 302.25
};
// GENERATED:GEOMETRY_BUDGET_TARGETS:END

export const resolveGeometryBudgetTarget = (level: number): number | null => {
  const target = GEOMETRY_BUDGET_TARGETS[Math.trunc(level)];
  return target === undefined ? null : target;
};
