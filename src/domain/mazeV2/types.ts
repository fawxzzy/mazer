// Mazer Generation V2 -- Wave 1/1.5 domain model.
//
// This module defines the versioned contracts for the eventual "one
// procedural system" that owns progression, topology, difficulty,
// generation, and persistence from level 1 through arbitrarily large level
// ordinals. It does NOT generate mazes yet. It exists purely so a
// deterministic, richly-measured domain model can be validated offline
// (scripts/analysis/mazev2-lab.ts) before any runtime code depends on it.
// Nothing in src/scenes or src/legacy-runtime imports from this module, and
// nothing here should be imported into production gameplay code until a
// later wave explicitly wires it up.
//
// Wave 1.5 (this pass) restructures the contracts the Wave 1 metrics bridge
// (metrics.ts) and offline lab (scripts/analysis/mazev2-lab.ts) already
// validated, splitting concepts that were previously conflated:
//   - identity: a "structural fingerprint" used to mean three different
//     things (a cheap similarity bucket, exact topology identity, and
//     durable recipe provenance) -- now three distinct branded types
//     (MazeV2MetricFingerprint / MazeV2TopologyFingerprint /
//     MazeV2RecipeDigest), see hashing.ts for their constructors.
//   - capacity: "how big a maze the generator may build" (logical) and "how
//     much a device's screen can legibly render" (viewport) were one type
//     -- now MazeV2LogicalCapacity and MazeV2ViewportRenderEnvelope.
//     MazeV2ViewportRenderEnvelope is defined for Wave 2's runtime wiring;
//     this offline module has no viewport data source, so nothing here
//     populates it yet.
//   - resolution: MazeV2ResolvedGenerationContract now requires every field
//     the current legacy-runtime bridge can actually resolve (generator/
//     progression identity, level, seed, dimensions, logical capacity, work
//     budget) instead of leaving them optional. The absolute per-axis
//     targets a real recipe resolver would derive from a target vector
//     (resolved route length, resolved turn count, etc.) don't exist yet --
//     no code anywhere computes them -- so they live in the separate,
//     explicitly-not-yet-implemented MazeV2RecipeResolutionTargets rather
//     than as optional fields bolted onto the resolved contract.
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
// instead of forcing an awkward conversion. Wave 1.5's generator-convergence
// work (a later PR in this same wave) measures whether domain/maze's own
// primitives should become the shared foundation for both surfaces --
// MazeV2CanonicalMaze below is the neutral shape that comparison bridges
// both engines into.

export const MAZE_V2_GENERATOR_VERSION = 'mazev2-generator-v1-unimplemented' as const;
export const MAZE_V2_PROGRESSION_VERSION = 'mazev2-progression-v1-unimplemented' as const;
export const MAZE_V2_CONTRACT_VERSION = 'mazev2-contract-v2' as const;
export const MAZE_V2_LOGICAL_CAPACITY_VERSION = 'mazev2-logical-capacity-v1' as const;
export const MAZE_V2_WORK_BUDGET_VERSION = 'mazev2-work-budget-v1' as const;

export type MazeV2GeneratorVersion = typeof MAZE_V2_GENERATOR_VERSION;
export type MazeV2ProgressionVersion = typeof MAZE_V2_PROGRESSION_VERSION;

// ---------------------------------------------------------------------
// 0. Level ordinal -- canonical, lossless, and validated.
// ---------------------------------------------------------------------

// Decimal-string level ordinal, matching legacyProgression.ts's own
// LegacyProgressionOrdinal exactly (and for the same reason): JSON.stringify
// throws on a native bigint, and this contract needs to serialize cleanly
// for hashing, telemetry, and Supabase payloads. Use BigInt(value) at any
// call site that needs actual arithmetic.
export type MazeV2LevelOrdinal = string;

// Canonical: a positive integer, no leading sign, no leading zero (except
// the literal single digit "0", which isn't a valid level -- levels start
// at 1), no decimal point, no exponent, no surrounding whitespace. This is
// deliberately stricter than "parses as a positive number" -- two different
// strings that parse to the same value (e.g. "007" and "7") must not both
// be treated as canonical, or two provenance records for the same level
// could hash differently.
const MAZE_V2_LEVEL_ORDINAL_PATTERN = /^[1-9][0-9]*$/;

export const isMazeV2LevelOrdinal = (value: unknown): value is MazeV2LevelOrdinal => (
  typeof value === 'string' && MAZE_V2_LEVEL_ORDINAL_PATTERN.test(value)
);

export const assertMazeV2LevelOrdinal = (value: unknown): MazeV2LevelOrdinal => {
  if (!isMazeV2LevelOrdinal(value)) {
    throw new TypeError(`Invalid MazeV2LevelOrdinal: ${JSON.stringify(value)} (expected a canonical positive decimal string)`);
  }
  return value;
};

// A normalized 0..1 control on one axis of challenge. Normalized so the
// same target vector shape works at any level -- the recipe resolver is
// what converts a normalized fraction into exact absolute values (route
// length in tiles, junction count, etc.) against the current logical
// capacity.
export type MazeV2NormalizedAxis = number;

export const isMazeV2NormalizedAxis = (value: unknown): value is MazeV2NormalizedAxis => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
);

// ---------------------------------------------------------------------
// 1. Target challenge vector and recipe -- what the progression compiler
//    wants, before any capacity or work-budget constraint is applied.
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

export const isMazeV2TargetVector = (value: unknown): value is MazeV2TargetVector => (
  typeof value === 'object'
  && value !== null
  && MAZE_V2_TARGET_VECTOR_AXES.every((axis) => isMazeV2NormalizedAxis((value as Record<string, unknown>)[axis]))
);

export type MazeV2CapacityClass = 'compact' | 'standard' | 'expanded';

// The progression compiler's desired normalized challenge for one level --
// intent, not absolute generator inputs. A MazeV2ResolvedGenerationContract
// is what a generator actually builds against; this is what asked for it.
export interface MazeV2TargetRecipe {
  contractVersion: typeof MAZE_V2_CONTRACT_VERSION;
  level: MazeV2LevelOrdinal;
  progressionVersion: MazeV2ProgressionVersion;
  // Salts the seed derivation the same way legacyProgression.ts's own
  // per-track fields do today (level/completedCycles/targetComplexity/
  // paceScore) -- kept as one opaque already-mixed integer here rather than
  // re-exposing every contributing field, since this type only needs to
  // carry the salt forward, not recompute it.
  progressionSeed: number;
  target: MazeV2TargetVector;
  requestedCapacityClass: MazeV2CapacityClass;
  // Loop/shortcut/wrap features this recipe wants present at all -- distinct
  // from how MUCH of each (that's shortcutRelief/wrapPressure in the target
  // vector); a recipe can request zero wrap pressure while still requiring
  // the feature be structurally available for a later level to ramp into.
  requestedFeatures: {
    shortcuts: boolean;
    wrap: boolean;
  };
  // How different this run must read from recently-seen runs, as a
  // normalized floor on structural-fingerprint (or better, topology-
  // fingerprint) distance -- 0 means "no novelty requirement."
  requestedNoveltyFloor: MazeV2NormalizedAxis;
}

// ---------------------------------------------------------------------
// 2. Capacity -- logical generation feasibility, kept independent of
//    viewport rendering feasibility and of generation work cost.
// ---------------------------------------------------------------------

// What logical maze may be generated -- a property of the recipe/level, not
// of any one device. Device-relative scaling (see legacyProgression.ts's
// resolveLegacyProgressionScaleDetail for the existing, already-shipped
// precedent) is what MazeV2ViewportRenderEnvelope constrains instead; a
// generator should never learn about the viewport by way of this type.
export interface MazeV2LogicalCapacity {
  capacityVersion: typeof MAZE_V2_LOGICAL_CAPACITY_VERSION;
  capacityClass: MazeV2CapacityClass;
  maxWidth: number;
  maxHeight: number;
  maxLogicalCells: number;
  maxWalkableCells: number;
  maxRouteLength: number;
  maxBranchCount: number;
  maxDeadEndDepth: number;
  maxLoopCount: number;
  maxWrapPairCount: number;
}

// Rendering/camera feasibility for one specific viewport -- must never
// silently change the logical maze recipe (a phone and a desktop generating
// the same level/seed must resolve the same MazeV2LogicalCapacity; only how
// it's framed on screen differs). Wave 1.5 has no offline viewport data
// source -- this type exists for Wave 2's runtime wiring and is not yet
// populated or exercised by anything in this module.
export interface MazeV2ViewportRenderEnvelope {
  viewportWidth: number;
  viewportHeight: number;
  safeAreaInsets: { top: number; right: number; bottom: number; left: number };
  controlExclusionRegions: readonly { x: number; y: number; width: number; height: number }[];
  minOverviewTileSize: number;
  minFocusedTileSize: number;
  fitZoom: number;
  minZoom: number;
  maxZoom: number;
  semanticRenderTier: 'overview' | 'focused';
  overviewReadable: boolean;
}

// Generation computation cost, kept distinct from both capacities above --
// two runs can share identical logical capacity and viewport envelope while
// one is allowed a far more expensive candidate search (e.g. an offline lab
// pass versus a live frame budget).
export interface MazeV2GenerationWorkBudget {
  workBudgetVersion: typeof MAZE_V2_WORK_BUDGET_VERSION;
  maxCandidates: number;
  maxGenerationAttempts: number;
  maxGraphSearches: number;
  maxAnalyzedNodes: number;
  maxWallClockMs: number | null;
  cancellationPolicy: 'none' | 'cooperative' | 'worker-terminate';
}

// ---------------------------------------------------------------------
// 3. Resolved generation contract -- everything a generator needs to
//    reproduce one specific attempt, with no load-bearing optional field.
// ---------------------------------------------------------------------

export interface MazeV2StartGoalPlacementContract {
  policy: 'far-corners' | 'far-any' | 'fixed';
  minManhattanSeparation: number;
}

export interface MazeV2ResolvedGenerationContract {
  contractVersion: typeof MAZE_V2_CONTRACT_VERSION;
  generatorVersion: MazeV2GeneratorVersion;
  progressionVersion: MazeV2ProgressionVersion;
  level: MazeV2LevelOrdinal;
  // The seed originally requested of the generator -- NOT necessarily what
  // the generated maze ends up carrying as its own seed once a bounded
  // candidate search selects among several (see MazeV2CandidateReview).
  requestedSeed: number;
  width: number;
  height: number;
  placement: MazeV2StartGoalPlacementContract;
  occupancyTarget: MazeV2NormalizedAxis;
  target: MazeV2TargetVector;
  logicalCapacity: MazeV2LogicalCapacity;
  workBudget: MazeV2GenerationWorkBudget;
}

// Absolute per-axis values a real recipe resolver would derive from a
// target vector + logical capacity (e.g. routeBurden 0.6 against a capacity
// with maxRouteLength 400 resolves to an absolute route-length target).
// Deliberately NOT part of MazeV2ResolvedGenerationContract: nothing in
// this repository computes these yet -- the resolver itself is unbuilt --
// so folding them into the contract as optional fields would just be
// scattering "not implemented yet" across an otherwise-complete type. This
// type is a placeholder for Wave 2's resolver output, not consumed by
// anything in Wave 1.5.
export interface MazeV2RecipeResolutionTargets {
  resolvedRouteLength: number;
  resolvedJunctionCount: number;
  resolvedBranchDepthTarget: number;
  resolvedTurnCount: number;
  resolvedShortcutCount: number;
  resolvedWrapPairCount: number;
}

// ---------------------------------------------------------------------
// 4. Canonical maze -- the neutral shape both existing engines (and any
//    future one) bridge into, so one analyzer and one identity scheme can
//    measure either engine's output without engine-specific branching.
// ---------------------------------------------------------------------

export interface MazeV2WrapPair {
  from: { x: number; y: number };
  to: { x: number; y: number };
  axis: 'horizontal' | 'vertical';
}

export interface MazeV2CanonicalMaze {
  width: number;
  height: number;
  // Row-major, one boolean per cell, true = walkable. Deliberately a plain
  // boolean[][] rather than a packed bitmask: this is the neutral EXCHANGE
  // shape between engines and the analyzer, not a hot-path generation
  // representation -- either engine's own internal representation (flat
  // Uint8Array bitmask for domain/maze, boolean[][] for legacy-runtime)
  // converts into this once per generated maze, not per tile per frame.
  walkable: readonly (readonly boolean[])[];
  start: { x: number; y: number };
  goal: { x: number; y: number };
  // Explicit wrap/bleed connections beyond plain 4-directional adjacency.
  // Empty for an engine or maze with no wrap topology.
  wrapPairs: readonly MazeV2WrapPair[];
}

// ---------------------------------------------------------------------
// 5. Measured metrics -- computed from an ACTUAL generated maze, after
//    every shortcut/wrap/branch/normalization step.
// ---------------------------------------------------------------------

export interface MazeV2SpatialMetrics {
  width: number;
  height: number;
  walkableTileCount: number;
  floorRatio: number;
}

export interface MazeV2RouteMetrics {
  // Playable, wrap-aware shortest route -- the actual route available to
  // the player (legacyMaze.ts's resolveLegacyPlayableShortestPath, policy
  // 'playable-wrap-aware'). Difficulty should be measured against these
  // fields, not the direct-floor pair below.
  shortestPathLength: number;
  manhattanDistance: number;
  detourRatio: number;
  routeCoverage: number;
  // Direct-floor/non-wrap route -- legacy-runtime supplies its construction
  // route while the canonical analyzer removes wrap edges from the same
  // graph. Exposed only for comparison against the playable pair above. null
  // means no non-wrap start-to-goal route exists; substituting the playable
  // length would falsely claim a direct-floor route was measured.
  directFloorPathLength: number | null;
  directFloorDetourRatio: number | null;
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
  // Deliberately NOT exposed as an "alternate route count": cycle rank
  // counts independent loops in the whole graph, which is not generally an
  // upper bound on the number of simple start-to-goal paths (a loop that
  // doesn't touch the route contributes to cycle rank without adding any
  // alternate route at all). A true alternate-route count needs actual path
  // enumeration, which this bridge doesn't implement.
  cycleRank: number;
}

export interface MazeV2ShortcutMetrics {
  // null means "not measured for this sample" (the source engine/bridge
  // doesn't yet expose enough provenance to count shortcuts), distinct from
  // 0 ("measured, and there are none"). Wave 1.5 correction: the neutral
  // canonical-maze analyzer (canonicalAnalyzer.ts) used to hardcode this to
  // 0 for every sample regardless of whether shortcuts were actually
  // observable, which silently claimed "zero shortcuts" for engines whose
  // shortcut provenance simply wasn't wired through yet -- a real
  // measurement gap, not a real zero.
  shortcutCount: number | null;
  // Total route-length reduction shortcuts are responsible for, i.e.
  // (naive spanning-tree route length) - (actual shortest path length).
  // Same null-means-unmeasured convention as shortcutCount.
  routeLengthReduction: number | null;
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
  // Cheap similarity bucket over the axes above -- see
  // MazeV2MetricFingerprint's own doc comment (hashing.ts) for why this is
  // NOT the same concept as topology or recipe identity, and must never be
  // used for persistence or replay correctness.
  metricFingerprint: MazeV2MetricFingerprint;
}

// ---------------------------------------------------------------------
// 6. Difficulty prediction -- effort estimate derived from measured
//    metrics. Deliberately separate from MazeV2MeasuredMetrics: metrics
//    describe the topology, difficulty estimates the human cost of it.
// ---------------------------------------------------------------------

export interface MazeV2DifficultyPrediction {
  contractVersion: typeof MAZE_V2_CONTRACT_VERSION;
  // 0..1 against the current logical capacity -- NOT comparable across
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
// 7. Saturation -- what happened when a target couldn't be met exactly.
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
// 8. Candidate review -- how one generation attempt searched among several
//    candidates before selecting one.
// ---------------------------------------------------------------------

export interface MazeV2CandidateReview {
  requestedSeed: number;
  selectedSeed: number;
  // The actual candidate seeds inspected during selection, in search order
  // -- not merely an inferred count or range. Always includes selectedSeed.
  candidateSeeds: readonly number[];
  targetFitDistance: number;
  noveltyDistance: number | null;
  generationDurationMs: number;
  invariantFailures: readonly string[];
}

// ---------------------------------------------------------------------
// 9. Identity -- three deliberately distinct, non-interchangeable
//    fingerprint/digest concepts. See hashing.ts for their constructors;
//    branding them here (rather than leaving them as plain `string`) means
//    passing a metric fingerprint where a topology fingerprint is expected
//    is a type error, not just a documentation convention.
// ---------------------------------------------------------------------

declare const MAZE_V2_METRIC_FINGERPRINT_BRAND: unique symbol;
declare const MAZE_V2_TOPOLOGY_FINGERPRINT_BRAND: unique symbol;
declare const MAZE_V2_RECIPE_DIGEST_BRAND: unique symbol;

// Cheap similarity bucket over a quantized measured-metric vector. Used for
// novelty heuristics and report grouping only. Collisions are ACCEPTABLE --
// two structurally different mazes that happen to measure the same on every
// rounded axis share one of these on purpose. Never use this for
// persistence or replay correctness; use MazeV2TopologyFingerprint or
// MazeV2RecipeDigest instead.
export type MazeV2MetricFingerprint = string & { readonly [MAZE_V2_METRIC_FINGERPRINT_BRAND]: true };

// Exact graph/topology identity: dimensions, walkable layout, start, goal,
// and wrap pairs -- and NOTHING else. Deliberately excludes seed, level,
// generator name, runtime duration, and every measured/target field: two
// different seeds that happen to produce the identical graph must produce
// the identical topology fingerprint, because seed is generation
// provenance, not topology identity. Use this to detect "the generator
// handed back the literal same maze," independent of how it got there.
export type MazeV2TopologyFingerprint = string & { readonly [MAZE_V2_TOPOLOGY_FINGERPRINT_BRAND]: true };

// Durable generation provenance for persistence, replay, and eventual
// server-side verification: a collision-resistant digest over the complete
// resolved generation contract (generator/version, progression/version,
// level, seed, exact absolute generation inputs, capacity/work-budget
// versions, candidate/relaxation policy). Deliberately excludes measured
// outcome -- the digest identifies the RECIPE that was asked for, not what
// was measured after the fact.
export type MazeV2RecipeDigest = string & { readonly [MAZE_V2_RECIPE_DIGEST_BRAND]: true };

// ---------------------------------------------------------------------
// 10. Run provenance -- the immutable record that should travel with a
//     generated maze through gameplay, telemetry, save state, and sync.
// ---------------------------------------------------------------------

export interface MazeV2RunProvenance {
  contractVersion: typeof MAZE_V2_CONTRACT_VERSION;
  generatorVersion: MazeV2GeneratorVersion;
  progressionVersion: MazeV2ProgressionVersion;
  level: MazeV2LevelOrdinal;
  candidateReview: MazeV2CandidateReview;
  measured: MazeV2MeasuredMetrics;
  difficulty: MazeV2DifficultyPrediction;
  saturation: MazeV2GenerationSaturation;
  topologyFingerprint: MazeV2TopologyFingerprint;
  recipeDigest: MazeV2RecipeDigest;
}
