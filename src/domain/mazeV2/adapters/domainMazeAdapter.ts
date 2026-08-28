// MazeV2EngineAdapter for src/domain/maze -- the OTHER existing generator in
// this repository (presentation/demo-only today, not production gameplay;
// see this module's own doc comment in generator.ts). Investigated fresh for
// this PR: types.ts, grid.ts, generator.ts, core.ts's public exports, and
// batch.ts (its own comparison-batch runner, which this adapter deliberately
// does not reuse -- it evaluates via src/domain/maze's OWN MazeMetrics,
// whereas this harness needs the one shared canonicalAnalyzer.ts instead, so
// building a fresh sample per spec via buildMaze() directly is the correct
// integration point, not runBatch()).
//
// src/domain/maze has no targetComplexity axis, no wrap/bleed topology, and
// no recipe-resolver concept at all -- it takes width/height/seed/braidRatio/
// minSolutionLength directly. Translating a neutral 0-100 targetComplexity
// dial into those knobs is a heuristic this adapter owns and documents below,
// not something the engine itself defines -- exactly the kind of "adaptable"
// capability gap this comparison exists to surface honestly.

import { buildMaze } from '../../maze/generator';
import { deriveMazeV2CanonicalMazeFromDomainMazeRaster } from './canonicalMazeFromDomainMaze';
import type { MazeV2CapabilityAssessment, MazeV2ComparisonSampleResult, MazeV2ComparisonSampleSpec, MazeV2EngineAdapter } from './types';

const DOMAIN_MAZE_CAPABILITIES: readonly MazeV2CapabilityAssessment[] = [
  { axis: 'spatialLoad', status: 'adaptable', note: 'width/height/braidRatio are direct inputs, but the engine quantizes requested width/height through an internal logical-carving lattice (normalizeLogicalSize) before rendering the playable raster -- the real output size is only approximately what was requested, not exact.' },
  { axis: 'routeBurden', status: 'adaptable', note: 'minSolutionLength is a direct floor, not a precise target -- the generator accepts any solution at or above it.' },
  { axis: 'decisionBurden', status: 'indirect', note: 'Junction count is an emergent effect of family/braid tuning (MazeFamily presets), not a direct dial.' },
  { axis: 'deadEndDeception', status: 'unsupported', note: 'No deceptive-branch placement concept found in generator.ts/core.ts\'s public surface.' },
  { axis: 'turningLoad', status: 'native', note: 'Has an explicit anti-straightness generation phase (MazeGenerationPhase includes \'anti-straightness\') directly targeting turn frequency.' },
  { axis: 'routeAmbiguity', status: 'adaptable', note: 'braidRatio adds loops/cycles, which raises ambiguity, but is not itself an ambiguity target.' },
  { axis: 'shortcutRelief', status: 'native', note: 'MazeEpisode.shortcutsCreated and shortcutCountModifier are first-class generator concepts -- legacy-runtime has no equivalent at all.' },
  { axis: 'wrapPressure', status: 'unsupported', note: 'No wrap/bleed topology concept anywhere in this engine\'s type contract.' }
];

// Heuristic braid-ratio curve: 0 complexity -> tightly a perfect maze (no
// loops), 100 -> the same upper bound batch.ts's own default run uses
// (0.08) is treated as a MID-range reference point here rather than a
// ceiling, since braidRatio's own valid range in this engine is not
// otherwise documented in types.ts. Scaled linearly to 0.16 at the top of
// the dial so the curve has real range instead of only ever probing the low
// half of what the generator can do.
const resolveBraidRatioForTargetComplexity = (targetComplexity: number): number => (
  (Math.min(100, Math.max(0, targetComplexity)) / 100) * 0.16
);

// Mirrors batch.ts's own default minSolutionLength heuristic
// (Math.min(width,height)**2 / 5), scaled by the complexity dial so a low
// dial asks for a shorter floor and a high dial asks for closer to that
// same reference ceiling -- deliberately not exceeding it, since nothing in
// this investigation established that ceiling as anything other than
// batch.ts's own convention.
const resolveMinSolutionLengthForTargetComplexity = (
  targetComplexity: number,
  width: number,
  height: number
): number => (
  Math.floor(((Math.min(width, height) ** 2) / 5) * (Math.min(100, Math.max(0, targetComplexity)) / 100))
);

export const createMazeV2DomainMazeAdapter = (): MazeV2EngineAdapter => ({
  engineId: 'domain-maze',
  engineLabel: 'src/domain/maze (presentation/demo generator)',
  capabilities: DOMAIN_MAZE_CAPABILITIES,
  generateSample(spec: MazeV2ComparisonSampleSpec): MazeV2ComparisonSampleResult {
    const braidRatio = resolveBraidRatioForTargetComplexity(spec.targetComplexity);
    const minSolutionLength = resolveMinSolutionLengthForTargetComplexity(spec.targetComplexity, spec.width, spec.height);
    const generationStartedAtMs = performance.now();
    const episode = buildMaze({
      width: spec.width,
      height: spec.height,
      seed: spec.seed,
      braidRatio,
      minSolutionLength
    });
    const generationDurationMs = performance.now() - generationStartedAtMs;

    return {
      spec,
      canonicalMaze: deriveMazeV2CanonicalMazeFromDomainMazeRaster(episode.raster),
      generationDurationMs,
      engineNotes: {
        braidRatio,
        minSolutionLength,
        accepted: episode.accepted,
        shortcutsCreated: episode.shortcutsCreated,
        family: episode.family,
        difficulty: episode.difficulty,
        difficultyScore: episode.difficultyScore
      }
    };
  }
});
