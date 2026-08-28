// MazeV2EngineAdapter for legacy-runtime -- today's real production
// generator. Reuses the exact bridge/profile machinery PR A and the offline
// lab (scripts/analysis/mazev2-lab.ts) already built and proved out; this
// adapter is deliberately thin, since legacy-runtime already has everything
// the comparison needs (createLegacyRuntimeMazeForMode, the canonical-maze
// bridge, the topology/recipe identity functions).

import { createLegacyRuntimeMazeForMode } from '../../../legacy-runtime/legacyGenerationLifecycle';
import {
  createEmptyLegacyProgressionState,
  resolveLegacyMazeGenerationProfileForProgression
} from '../../../legacy-runtime/legacyProgression';
import { deriveMazeV2CanonicalMazeFromLegacySnapshot } from '../canonicalMaze';
import type { MazeV2CapabilityAssessment, MazeV2ComparisonSampleResult, MazeV2ComparisonSampleSpec, MazeV2EngineAdapter } from './types';

const LEGACY_RUNTIME_CAPABILITIES: readonly MazeV2CapabilityAssessment[] = [
  { axis: 'spatialLoad', status: 'adaptable', note: 'Board scale and floor density are direct, tuned generator inputs, but the generator takes one device-relative "scale" number, not literal width/height -- this adapter holds scale fixed (COMPARISON_BOARD_SCALE) rather than routing the neutral spec\'s width/height through, since there is no direct mapping.' },
  { axis: 'routeBurden', status: 'native', note: 'targetComplexity directly drives the bounded-candidate-search route-length target.' },
  { axis: 'decisionBurden', status: 'adaptable', note: 'Junction frequency is an emergent effect of carving parameters, not a direct dial.' },
  { axis: 'deadEndDeception', status: 'indirect', note: 'No explicit deceptive-branch placement; happens incidentally from carving + braid ratio.' },
  { axis: 'turningLoad', status: 'indirect', note: 'No explicit turn-shaping; a byproduct of the carving algorithm and anti-straightness passes, if any.' },
  { axis: 'routeAmbiguity', status: 'adaptable', note: 'Braid ratio adds cycles/loops, which raises ambiguity, but is not itself an ambiguity target.' },
  { axis: 'shortcutRelief', status: 'unsupported', note: 'No shortcut-carving concept found in legacy-runtime\'s own generation lifecycle.' },
  { axis: 'wrapPressure', status: 'native', note: 'Wrap/bleed topology is a first-class, tuned legacy-runtime feature (aggregate counts only -- see canonicalMaze.ts bridge-fidelity note on per-pair wrap data).' }
];

// Fixed board scale, matching the offline lab's own isolation choice
// (measure the generator's response to level/complexity, holding the
// device/viewport-relative scale resolver out of the comparison).
const COMPARISON_BOARD_SCALE = 50;

export const createMazeV2LegacyRuntimeAdapter = (): MazeV2EngineAdapter => ({
  engineId: 'legacy-runtime',
  engineLabel: 'Legacy Runtime (production generator)',
  capabilities: LEGACY_RUNTIME_CAPABILITIES,
  generateSample(spec: MazeV2ComparisonSampleSpec): MazeV2ComparisonSampleResult {
    const baseline = createEmptyLegacyProgressionState();
    const track = { ...baseline.tracks.player, level: String(spec.level), targetComplexity: spec.targetComplexity };
    const profile = resolveLegacyMazeGenerationProfileForProgression(track);
    const generationStartedAtMs = performance.now();
    const maze = createLegacyRuntimeMazeForMode('play', COMPARISON_BOARD_SCALE, spec.seed, profile, {
      targetComplexity: spec.targetComplexity
    });
    const generationDurationMs = performance.now() - generationStartedAtMs;

    return {
      spec,
      canonicalMaze: deriveMazeV2CanonicalMazeFromLegacySnapshot(maze),
      generationDurationMs,
      engineNotes: {
        requestedSeed: spec.seed,
        selectedSeed: maze.seed,
        boardScale: COMPARISON_BOARD_SCALE
      }
    };
  }
});
