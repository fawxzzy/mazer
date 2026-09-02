// MazeV2EngineAdapter for src/domain/maze -- the OTHER existing generator in
// this repository (presentation/demo-only today, not production gameplay;
// see this module's own doc comment in generator.ts).
//
// Wave 1.5 correction (PR D): the original version of this adapter only
// ever called the low-level buildMaze() directly, which exercises none of
// this engine's own higher-level family/difficulty/candidate-search
// surface (generateMaze, generateMazeForDifficulty, MazeFamily resolution,
// FAMILY_TUNING) -- the finding that "domain/maze is inherently too dense"
// was really only ever a finding about one specific low-level buildMaze
// configuration, not about this engine's real, tunable capability. Lane B
// (production-pipeline) below now goes through generateMazeForDifficulty,
// this engine's own real candidate-search/difficulty-targeting entry
// point, exactly analogous to legacy-runtime's bounded candidate search.
// Lane A (raw-carving) keeps the original direct buildMaze() call with an
// explicit one-attempt ceiling, which is the correct choice for that lane's
// own purpose (isolate one raw carve, with no candidate search on either side).
//
// spec.requireWrap (the wrap-demand recipe) is explicitly classified as
// unsupported here -- this engine has no wrap/bleed topology concept
// anywhere in its type contract (see wrapPressure: 'unsupported' below),
// so reporting a successful wrap measurement would be false.

import { buildMaze, classifyMazeDifficulty, generateMazeForDifficulty } from '../../maze/generator';
import type { MazeConfig, MazeDifficulty } from '../../maze/types';
import { deriveMazeV2CanonicalMazeFromDomainMazeRaster } from './canonicalMazeFromDomainMaze';
import type { MazeV2CapabilityAssessment, MazeV2ComparisonSampleResult, MazeV2ComparisonSampleSpec, MazeV2ComparisonSampleSupport, MazeV2EngineAdapter } from './types';

const DOMAIN_MAZE_CAPABILITIES: readonly MazeV2CapabilityAssessment[] = [
  { axis: 'spatialLoad', status: 'adaptable', note: 'Square width/height requests and braidRatio are direct inputs, but the engine quantizes the requested size through an internal logical-carving lattice (normalizeLogicalSize) before rendering the playable raster -- the real output size is only approximately what was requested, not exact. Rectangular requests are unsupported because the engine carves a square core and only pads it to the requested footprint.' },
  { axis: 'routeBurden', status: 'adaptable', note: 'minSolutionLength is a direct floor, not a precise target -- the generator accepts any solution at or above it. generateMazeForDifficulty (production-pipeline lane) searches multiple seeds for a target MazeDifficulty band, which is a real search but over difficulty classification, not route length directly.' },
  { axis: 'decisionBurden', status: 'indirect', note: 'Junction count is an emergent effect of family/braid tuning (MazeFamily presets), not a direct dial.' },
  { axis: 'deadEndDeception', status: 'unsupported', note: 'No deceptive-branch placement concept found in generator.ts/core.ts\'s public surface.' },
  { axis: 'turningLoad', status: 'native', note: 'Has an explicit anti-straightness generation phase (MazeGenerationPhase includes \'anti-straightness\') directly targeting turn frequency.' },
  { axis: 'routeAmbiguity', status: 'adaptable', note: 'braidRatio adds loops/cycles, which raises ambiguity, but is not itself an ambiguity target.' },
  { axis: 'shortcutRelief', status: 'native', note: 'MazeEpisode.shortcutsCreated and shortcutCountModifier are first-class generator concepts -- legacy-runtime has an equivalent (shortcutCountMultiplier, PR D correction), so this is no longer a unique differentiator, just a genuinely native capability on both sides.' },
  { axis: 'wrapPressure', status: 'unsupported', note: 'No wrap/bleed topology concept anywhere in this engine\'s type contract.' }
];

// Heuristic braid-ratio curve for Lane A (raw-carving) only -- Lane B goes
// through generateMazeForDifficulty's own real shortcutCountModifier/
// checkPointModifier inputs instead of this heuristic. 0 complexity -> a
// tight perfect maze (no loops); 100 -> 0.16, scaled linearly. batch.ts's
// own default run uses 0.08 as a reference midpoint, not a documented
// ceiling -- this engine's own valid braidRatio range isn't otherwise
// specified in types.ts.
const resolveBraidRatioForTargetComplexity = (targetComplexity: number): number => (
  (Math.min(100, Math.max(0, targetComplexity)) / 100) * 0.16
);

// Mirrors batch.ts's own default minSolutionLength heuristic
// (Math.min(width,height)**2 / 5), scaled by the complexity dial. Lane A only.
const resolveMinSolutionLengthForTargetComplexity = (
  targetComplexity: number,
  width: number,
  height: number
): number => (
  Math.floor(((Math.min(width, height) ** 2) / 5) * (Math.min(100, Math.max(0, targetComplexity)) / 100))
);

const RAW_CARVING_MAX_ATTEMPTS = 1;

const resolveRouteLengthReduction = (shortcutsCreated: number): number | null => (
  shortcutsCreated === 0 ? 0 : null
);

// Maps the neutral 0-100 targetComplexity dial onto this engine's own
// MazeDifficulty band for Lane B's generateMazeForDifficulty call --
// documented as a real, if coarse, mapping (4 bands over 100 points),
// distinct from legacy-runtime's continuous targetComplexity axis.
const resolveMazeDifficultyForTargetComplexity = (targetComplexity: number): MazeDifficulty => {
  const clamped = Math.min(100, Math.max(0, targetComplexity));
  if (clamped < 25) return 'chill';
  if (clamped < 50) return 'standard';
  if (clamped < 75) return 'spicy';
  return 'brutal';
};

const resolveDomainMazeSampleSupport = (spec: MazeV2ComparisonSampleSpec): MazeV2ComparisonSampleSupport => {
  if (spec.requireWrap === true) {
    return {
      status: 'unsupported',
      reason: 'src/domain/maze has no wrap/bleed topology contract; an explicit requireWrap sample cannot be represented in either comparison lane.'
    };
  }
  if (spec.width !== spec.height) {
    return {
      status: 'unsupported',
      reason: `src/domain/maze carves a square core in the ${spec.lane} lane; rectangular recipes would only pad that core and cannot be represented without extending the engine contract.`
    };
  }
  return { status: 'supported', reason: null };
};

export const createMazeV2DomainMazeAdapter = (): MazeV2EngineAdapter => ({
  engineId: 'domain-maze',
  engineLabel: 'src/domain/maze (presentation/demo generator)',
  capabilities: DOMAIN_MAZE_CAPABILITIES,
  assessSupport: resolveDomainMazeSampleSupport,
  generateSample(spec: MazeV2ComparisonSampleSpec): MazeV2ComparisonSampleResult {
    const support = resolveDomainMazeSampleSupport(spec);
    if (support.status === 'unsupported') {
      throw new Error(`Unsupported domain-maze sample reached generation: ${support.reason}`);
    }
    if (spec.lane === 'production-pipeline') {
      const clamped = Math.min(100, Math.max(0, spec.targetComplexity)) / 100;
      const config: MazeConfig = {
        scale: Math.max(spec.width, spec.height),
        seed: spec.seed,
        checkPointModifier: clamped,
        shortcutCountModifier: clamped
      };
      const targetDifficulty = resolveMazeDifficultyForTargetComplexity(spec.targetComplexity);
      const generationStartedAtMs = performance.now();
      const resolved = generateMazeForDifficulty(config, targetDifficulty);
      const generationDurationMs = performance.now() - generationStartedAtMs;
      const episode = resolved.episode;
      const achievedDifficulty = classifyMazeDifficulty(
        episode.metrics,
        episode.raster.width,
        episode.raster.height,
        episode.shortcutsCreated,
        episode.routeMotifs
      );

      return {
        spec,
        support,
        canonicalMaze: deriveMazeV2CanonicalMazeFromDomainMazeRaster(episode.raster),
        generationDurationMs,
        shortcutProvenance: {
          shortcutCount: episode.shortcutsCreated,
          routeLengthReduction: resolveRouteLengthReduction(episode.shortcutsCreated)
        },
        realizedWidth: episode.raster.width,
        realizedHeight: episode.raster.height,
        engineNotes: {
          lane: spec.lane,
          requestedSeed: spec.seed,
          selectedSeed: resolved.seed,
          targetDifficulty,
          achievedDifficulty: achievedDifficulty.difficulty,
          difficultyScore: achievedDifficulty.score,
          reportedCanonicalDifficulty: episode.difficulty,
          accepted: episode.accepted,
          family: episode.family
        }
      };
    }

    const braidRatio = resolveBraidRatioForTargetComplexity(spec.targetComplexity);
    const minSolutionLength = resolveMinSolutionLengthForTargetComplexity(spec.targetComplexity, spec.width, spec.height);
    const generationStartedAtMs = performance.now();
    const episode = buildMaze({
      width: spec.width,
      height: spec.height,
      seed: spec.seed,
      braidRatio,
      minSolutionLength,
      maxAttempts: RAW_CARVING_MAX_ATTEMPTS
    });
    const generationDurationMs = performance.now() - generationStartedAtMs;

    return {
      spec,
      support,
      canonicalMaze: deriveMazeV2CanonicalMazeFromDomainMazeRaster(episode.raster),
      generationDurationMs,
      shortcutProvenance: {
        shortcutCount: episode.shortcutsCreated,
        routeLengthReduction: resolveRouteLengthReduction(episode.shortcutsCreated)
      },
      realizedWidth: episode.raster.width,
      realizedHeight: episode.raster.height,
      engineNotes: {
        lane: spec.lane,
        requestedSeed: spec.seed,
        selectedSeed: episode.seed,
        braidRatio,
        minSolutionLength,
        maxAttempts: RAW_CARVING_MAX_ATTEMPTS,
        candidateSearch: 'disabled',
        accepted: episode.accepted,
        family: episode.family,
        difficulty: episode.difficulty,
        difficultyScore: episode.difficultyScore
      }
    };
  }
});
