// Generation V2 Wave 1.5 PR B -- the generator-convergence harness.
//
// Neither engine has a real recipe resolver yet (MazeV2ResolvedGenerationContract
// and the target-vector -> absolute-axis resolution described in types.ts are
// explicitly unbuilt), so this harness deliberately does NOT route samples
// through MazeV2TargetRecipe. Instead it drives both engines from one small,
// concrete, engine-neutral spec and lets each adapter translate that into its
// own generator's native options -- how well an engine can even be driven from
// a neutral spec is itself part of what this comparison is measuring.
//
// Both adapters bridge their engine's real output into MazeV2CanonicalMaze,
// then canonicalAnalyzer.ts's ONE shared analyzer measures either identically
// -- see that module's header comment for why this is a separate entry point
// from metrics.ts's legacy-only analyzeLegacyMazeAsMazeV2Metrics.

import type { MazeV2CanonicalMaze } from '../types';
import type { MazeV2CanonicalShortcutProvenance } from '../canonicalAnalyzer';

// Wave 1.5 correction (PR D): two explicit lanes, not one blended behavior.
//
// 'raw-carving' asks the engine for exactly one attempt at the requested
// seed with no candidate search of any kind -- isolates the carving
// algorithm's own raw behavior from whichever selection/retry policy the
// production pipeline layers on top.
//
// 'production-pipeline' asks the engine to use its own real, native
// candidate-search/difficulty-targeting behavior (legacy-runtime's bounded
// candidate search; src/domain/maze's generateMazeForDifficulty), retaining
// the selected seed and the bounded search facts each engine currently
// exposes. This is what production gameplay actually experiences, as
// opposed to raw-carving's isolated single attempt.
//
// The original harness ran only one blended lane per engine and never
// disclosed which behavior a given number represented -- comparing lane A
// numbers from one engine against lane B numbers from the other silently
// mixed "raw carve" against "post-search" and called it a fair comparison.
export type MazeV2ComparisonLane = 'raw-carving' | 'production-pipeline';

export interface MazeV2ComparisonSampleSpec {
  label: string;
  level: number;
  lane: MazeV2ComparisonLane;
  // 0-100 neutral difficulty dial. Meaning is engine-specific: legacy-runtime
  // maps it directly onto its own targetComplexity axis (see
  // legacyRuntimeAdapter.ts); src/domain/maze has no such axis at all, so
  // domainMazeAdapter.ts derives engine-native knobs from it instead (an
  // 'adaptable', not 'native', capability -- see below).
  targetComplexity: number;
  width: number;
  height: number;
  seed: number;
  // Explicit wrap/bleed demand -- forces legacy-runtime's own
  // requiredOppositeBorderConnections profile flag on both axes so this
  // recipe genuinely exercises wrap topology instead of leaving it to
  // chance. src/domain/maze has no wrap concept at all (see its own
  // capability matrix, wrapPressure: 'unsupported'), so this flag is inert
  // there -- the domain adapter documents that rather than silently
  // ignoring it. Optional and false by default so every other recipe's
  // behavior is unchanged.
  requireWrap?: boolean;
}

export interface MazeV2ComparisonSampleResult {
  spec: MazeV2ComparisonSampleSpec;
  // Whether this engine/lane can honestly represent the requested sample.
  // Unsupported samples remain in the convergence corpus as explicit
  // evidence instead of being silently measured through a lossy mapping.
  support: {
    status: 'supported' | 'unsupported';
    reason: string | null;
  };
  canonicalMaze: MazeV2CanonicalMaze;
  generationDurationMs: number;
  // Real shortcut provenance the adapter could read off its own engine's
  // generation result, if any -- passed straight into
  // analyzeMazeV2CanonicalMaze's own shortcut-provenance parameter. null
  // when the adapter has no such provenance for this sample (analyzer then
  // correctly reports "unmeasured", not a fabricated 0 -- see
  // MazeV2ShortcutMetrics's own doc comment in types.ts).
  shortcutProvenance: MazeV2CanonicalShortcutProvenance | null;
  // Realized dimensions the engine actually produced for this sample --
  // distinct from spec.width/height (what was REQUESTED). Neither engine
  // guarantees an exact match (see each adapter's own spatialLoad
  // capability note), so callers that need real board size for normalizing
  // density metrics should read this, not the spec.
  realizedWidth: number;
  realizedHeight: number;
  // Free-form, engine-specific extra facts worth keeping in the raw report
  // (selected seed, inspected-candidate count where exposed,
  // accepted/rejected, etc) that don't belong in the neutral canonical
  // shape. This field does not promise a complete candidate-seed list.
  engineNotes: Record<string, unknown>;
}

export type MazeV2CapabilityStatus = 'native' | 'adaptable' | 'indirect' | 'unsupported';

export interface MazeV2CapabilityAssessment {
  // One of the eight MazeV2TargetVector axes, or a structural concern
  // (e.g. 'wrapTopology', 'checkpointWaypoints') outside that vector.
  axis: string;
  status: MazeV2CapabilityStatus;
  note: string;
}

export interface MazeV2EngineAdapter {
  readonly engineId: string;
  readonly engineLabel: string;
  readonly capabilities: readonly MazeV2CapabilityAssessment[];
  generateSample(spec: MazeV2ComparisonSampleSpec): MazeV2ComparisonSampleResult;
}
