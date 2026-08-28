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

export interface MazeV2ComparisonSampleSpec {
  label: string;
  level: number;
  // 0-100 neutral difficulty dial. Meaning is engine-specific: legacy-runtime
  // maps it directly onto its own targetComplexity axis (see
  // legacyRuntimeAdapter.ts); src/domain/maze has no such axis at all, so
  // domainMazeAdapter.ts derives a braidRatio/minSolutionLength heuristic from
  // it instead (an 'adaptable', not 'native', capability -- see below).
  targetComplexity: number;
  width: number;
  height: number;
  seed: number;
}

export interface MazeV2ComparisonSampleResult {
  spec: MazeV2ComparisonSampleSpec;
  canonicalMaze: MazeV2CanonicalMaze;
  generationDurationMs: number;
  // Free-form, engine-specific extra facts worth keeping in the raw report
  // (selected seed, candidate count, accepted/rejected, etc) that don't
  // belong in the neutral canonical shape.
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
