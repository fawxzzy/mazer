// Mazer Generation V2 -- Wave 1 domain model.
//
// This module defines the versioned contracts for the eventual "one
// procedural system" that owns progression, topology, difficulty,
// generation, and persistence from level 1 through arbitrarily large level
// ordinals. It does NOT generate mazes yet -- see the Wave 1 scope note
// below. It exists purely so a deterministic, richly-measured domain model
// can be validated offline (scripts/analysis/mazev2-lab.mjs) before any
// runtime code depends on it.
//
// Wave 1 scope (this file + hashing.ts + metrics.ts + the offline lab
// script): domain contracts, deterministic hashing, and a metrics analyzer
// that can measure the CURRENT (legacy-runtime) generator's output against
// this new richer contract. This validates the metric formulas and gives a
// real baseline before Wave 2 (a new constrained generator) ever needs to
// satisfy them. Nothing in src/scenes or src/legacy-runtime imports from
// this module yet, and nothing here should be imported into production
// gameplay code until a later wave explicitly wires it up.
//
// Considered reusing src/domain/maze's existing generator (family/
// difficulty/preset system used by the presentation/demo surfaces) instead
// of a new module. Decided against extending it directly: it has no
// checkpoint/waypoint concept, no wrap/bleed border topology, and no
// continuous level-driven recipe -- exactly the gameplay-critical pieces
// this system needs, and retrofitting them onto a module the presentation
// surfaces already depend on risks destabilizing something unrelated to
// this effort. Its grid/solve primitives (src/domain/maze/grid.ts) use a
// flat Uint8Array bitmask representation and don't carry the wrap-topology
// or checkpoint diagnostics this module's metrics need, so metrics.ts
// bridges directly from legacy-runtime's own LegacyMazeSnapshot shape
// instead of forcing an awkward conversion. A future V2 generator (Wave 2)
// may still adopt domain/maze's flat-array grid representation for its own
// internal generation -- that's a genuine fit -- just not for this
// measurement bridge.

export const MAZE_V2_GENERATOR_VERSION = 'mazev2-generator-v1-unimplemented' as const;
export const MAZE_V2_PROGRESSION_VERSION = 'mazev2-progression-v1-unimplemented' as const;
export const MAZE_V2_CONTRACT_VERSION = 'mazev2-contract-v1' as const;

export type MazeV2GeneratorVersion = typeof MAZE_V2_GENERATOR_VERSION;
export type MazeV2ProgressionVersion = typeof MAZE_V2_PROGRESSION_VERSION;

// Decimal-string level ordinal, matching legacyProgression.ts's own
// LegacyProgressionOrdinal exactly (and for the same reason): JSON.stringify
// throws on a native bigint, and this contract needs to serialize cleanly
// for hashing, telemetry, and Supabase payloads. Use BigInt(value) at any
// call site that needs actual arithmetic.
export type MazeV2LevelOrdinal = string;

// A normalized 0..1 control on one axis of challenge. Normalized so the
// same target vector shape works at any level -- the recipe resolver is
// what converts a normalized fraction into exact absolute values (route
// length in tiles, junction count, etc.) against the current canonical
// capacity.
export type MazeV2NormalizedAxis = number;

// ---------------------------------------------------------------------
// 1. Target challenge vector -- what the progression compiler wants.
// ---------------------------------------------------------------------

export interface MazeV2TargetVector {
  // How much raw spatial/visual information the board itself presents:
  // dimensions and corridor density, independent of route shape.
  spatialLoad: MazeV2NormalizedAxis;
  // How long the correct route is, relative to canonical capacity.
  routeBurden: MazeV2NormalizedAxis;
  // How often and how broadly the player must choose (junction frequency
  // and branching factor along the route).
  decisionBurden: MazeV2NormalizedAxis;
  // How costly and how convincing wrong branches are (depth, and how
  // plausible they look as "the real route").
  deadEndDeception: MazeV2NormalizedAxis;
  // Cognitive/motor turning load: turn frequency, clustering, and
  // straight-run variance.
  turningLoad: MazeV2NormalizedAxis;
  // How many plausible alternate/near-optimal routes exist.
  routeAmbiguity: MazeV2NormalizedAxis;
  // How much loops/shortcuts reduce the effective route burden.
  shortcutRelief: MazeV2NormalizedAxis;
  // Disorientation from border wrap/bleed connections.
  wrapPressure: MazeV2NormalizedAxis;
}

export const MAZE_V2_TARGET_VECTOR_AXES: readonly (keyof MazeV2TargetVector)[] = [
  'spatialLoad',
  'routeBurden',
  'decisionBurden',
  'deadEndDeception',
  'turningLoad',
  'routeAmbiguity',
  'shortcutRelief',
  'wrapPressure'
];

// ---------------------------------------------------------------------
// 2. Resolved generation contract -- absolute values a generator can
//    actually build against, plus provenance for exact reproduction.
// ---------------------------------------------------------------------

export interface MazeV2CanonicalCapacity {
  // The largest square-equivalent board a generator is allowed to build
  // toward for this contract -- device-relative in the eventual runtime
  // wiring (see legacyProgression.ts's resolveLegacyProgressionScaleDetail
  // for the existing, already-shipped device-relative scale precedent this
  // should extend, not replace), but expressed here as a plain bound so
  // this module has no runtime/DOM dependency.
  maxLinearSize: number;
  // The largest route length this capacity can support before the maze
  // reads as noise rather than difficulty.
  maxRouteLength: number;
}

export interface MazeV2ResolvedContract {
  contractVersion: typeof MAZE_V2_CONTRACT_VERSION;
  generatorVersion: MazeV2GeneratorVersion;
  progressionVersion: MazeV2ProgressionVersion;
  // The unbounded level ordinal, as a decimal string -- see
  // MazeV2LevelOrdinal's own comment for why not a plain number or bigint.
  level: MazeV2LevelOrdinal;
  seed: number;
  target: MazeV2TargetVector;
  capacity: MazeV2CanonicalCapacity;
  width: number;
  height: number;
  // Absolute resolved values a generator should aim to satisfy, derived
  // from target + capacity. Populated by the (not-yet-built) recipe
  // resolver in a later wave; left optional here so this contract shape is
  // stable before that resolver exists.
  resolvedRouteLength?: number;
  resolvedJunctionCount?: number;
  resolvedBranchDepthTarget?: number;
  resolvedTurnCount?: number;
  resolvedShortcutCount?: number;
  resolvedWrapPairCount?: number;
}

// ---------------------------------------------------------------------
// 3. Measured metrics -- computed from an ACTUAL generated maze, after
//    every shortcut/wrap/branch/normalization step.
// ---------------------------------------------------------------------

export interface MazeV2SpatialMetrics {
  width: number;
  height: number;
  walkableTileCount: number;
  floorRatio: number;
}

export interface MazeV2RouteMetrics {
  shortestPathLength: number;
  manhattanDistance: number;
  detourRatio: number;
  routeCoverage: number;
}

export interface MazeV2DecisionMetrics {
  junctionCount: number;
  junctionDensity: number;
  routeJunctionCount: number;
  meanJunctionDegree: number;
  maxJunctionDegree: number;
}

export interface MazeV2DeadEndMetrics {
  deadEndCount: number;
  meanDeadEndDepth: number;
  maxDeadEndDepth: number;
  // Fraction of dead-end branch roots whose first step moves closer to the
  // goal (Manhattan distance) than the route tile they branch from --
  // "looks like the real route at a glance."
  deceptiveBranchFraction: number;
}

export interface MazeV2TurningMetrics {
  turnCount: number;
  turnRatio: number;
  meanStraightRunLength: number;
  maxStraightRunLength: number;
  straightRunLengthVariance: number;
}

export interface MazeV2AmbiguityMetrics {
  // First Betti number of the walkable graph (edges - nodes + components) --
  // the standard graph cycle-rank measure of "how many independent loops."
  cycleRank: number;
  alternateRouteCount: number;
}

export interface MazeV2ShortcutMetrics {
  shortcutCount: number;
  // Total route-length reduction shortcuts are responsible for, i.e.
  // (naive spanning-tree route length) - (actual shortest path length).
  routeLengthReduction: number;
}

export interface MazeV2WrapMetrics {
  wrapPairCount: number;
  wrapPairsOnRoute: number;
  // Route steps saved by the shortest wrap-aware path versus the shortest
  // non-wrap path, when both exist.
  wrapRouteImpact: number | null;
}

export interface MazeV2MeasuredMetrics {
  contractVersion: typeof MAZE_V2_CONTRACT_VERSION;
  spatial: MazeV2SpatialMetrics;
  route: MazeV2RouteMetrics;
  decision: MazeV2DecisionMetrics;
  deadEnd: MazeV2DeadEndMetrics;
  turning: MazeV2TurningMetrics;
  ambiguity: MazeV2AmbiguityMetrics;
  shortcut: MazeV2ShortcutMetrics;
  wrap: MazeV2WrapMetrics;
  // Deterministic fingerprint of the axes above, rounded to a fixed
  // precision so near-identical floats hash identically -- see
  // hashing.ts. Used for the "no identical adjacent recipe fingerprints"
  // acceptance criterion in later waves.
  structuralFingerprint: string;
}

// ---------------------------------------------------------------------
// 4. Difficulty prediction -- effort estimate derived from measured
//    metrics. Deliberately separate from MazeV2MeasuredMetrics: metrics
//    describe the topology, difficulty estimates the human cost of it.
// ---------------------------------------------------------------------

export interface MazeV2DifficultyPrediction {
  contractVersion: typeof MAZE_V2_CONTRACT_VERSION;
  // 0..1 against the current canonical capacity -- NOT comparable across
  // different capacities (e.g. two different device classes), only within
  // one.
  predictedEffort: number;
  // Per-axis contribution to predictedEffort, for calibration/debugging --
  // see legacyProgression.ts's own resolveLegacyProgressionPerformanceScore
  // family for the existing precedent of exposing a breakdown alongside a
  // total.
  breakdown: Record<keyof MazeV2TargetVector, number>;
  // Which model produced this prediction -- unversioned string rather than
  // a union so calibration can iterate without a type change; consumers
  // should treat unrecognized values as "prediction present, provenance
  // unknown" rather than erroring.
  modelId: string;
}

// ---------------------------------------------------------------------
// 5. Saturation -- what happened when a target couldn't be met exactly.
// ---------------------------------------------------------------------

export interface MazeV2GenerationSaturation {
  saturated: boolean;
  // Which target axes had to be relaxed, in the order they were relaxed --
  // see the design doc's "generation relaxation policy" for the intended
  // ordering (exact straight-run distribution first, connectivity/
  // determinism/capacity never relaxed).
  relaxedAxes: readonly (keyof MazeV2TargetVector)[];
  // Per-axis distance between what was requested and what was delivered,
  // only present for axes that appear in relaxedAxes.
  relaxationDistance: Partial<Record<keyof MazeV2TargetVector, number>>;
}

// ---------------------------------------------------------------------
// 6. Candidate review -- how one generated candidate was scored during
//    selection among several.
// ---------------------------------------------------------------------

export interface MazeV2CandidateReview {
  candidateIndex: number;
  seed: number;
  targetFitDistance: number;
  noveltyDistance: number | null;
  generationDurationMs: number;
  invariantFailures: readonly string[];
  selected: boolean;
}

// ---------------------------------------------------------------------
// 7. Run provenance -- the immutable record that should travel with a
//    generated maze through gameplay, telemetry, save state, and sync.
// ---------------------------------------------------------------------

export interface MazeV2RunProvenance {
  contractVersion: typeof MAZE_V2_CONTRACT_VERSION;
  generatorVersion: MazeV2GeneratorVersion;
  progressionVersion: MazeV2ProgressionVersion;
  level: MazeV2LevelOrdinal;
  seed: number;
  target: MazeV2TargetVector;
  measured: MazeV2MeasuredMetrics;
  difficulty: MazeV2DifficultyPrediction;
  saturation: MazeV2GenerationSaturation;
  recipeHash: string;
}
