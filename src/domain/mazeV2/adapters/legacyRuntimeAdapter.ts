// MazeV2EngineAdapter for legacy-runtime -- today's real production
// generator. Reuses the exact bridge/profile machinery PR A and the offline
// lab (scripts/analysis/mazev2-lab.ts) already built and proved out.
//
// Wave 1.5 correction (PR D): this adapter previously (a) held board scale
// fixed at 50 regardless of the requested spec width/height, so every
// "small" and "large" recipe produced the identical board for this engine,
// and (b) mischaracterized this engine's own shortcut and turn-shaping
// capabilities based on an incomplete read of legacyMaze.ts. Both corrected
// below, against the actual source (LegacyMazeGenerationProfile in
// legacyMaze.ts: shortcutCountMultiplier, straightnessBias,
// generationBuildTrace.shortcutTiles/reinforcementShortcutTiles).

import { createLegacyRuntimeMazeForMode } from '../../../legacy-runtime/legacyGenerationLifecycle';
import {
  createEmptyLegacyProgressionState,
  resolveLegacyMazeGenerationProfileForProgression
} from '../../../legacy-runtime/legacyProgression';
import { deriveMazeV2CanonicalMazeFromLegacySnapshot } from '../canonicalMaze';
import type { MazeV2CapabilityAssessment, MazeV2ComparisonSampleResult, MazeV2ComparisonSampleSpec, MazeV2EngineAdapter } from './types';

const LEGACY_RUNTIME_CAPABILITIES: readonly MazeV2CapabilityAssessment[] = [
  {
    axis: 'spatialLoad',
    status: 'adaptable',
    note: 'Board scale and floor density are direct, tuned generator inputs, but the generator takes one device-relative "scale" plus an aspect ratio, not literal width/height -- this adapter maps requested width/height onto an area-preserving geometric-mean scale with aspectRatio=width/height (PR D; was previously held fixed at scale=50 regardless of the requested spec) rather than a direct pixel-exact mapping.'
  },
  { axis: 'routeBurden', status: 'native', note: 'targetComplexity directly drives the bounded-candidate-search route-length target.' },
  { axis: 'decisionBurden', status: 'adaptable', note: 'Junction frequency is an emergent effect of carving parameters, not a direct dial.' },
  { axis: 'deadEndDeception', status: 'indirect', note: 'No explicit deceptive-branch placement; happens incidentally from carving + shortcut/checkpoint tuning.' },
  {
    axis: 'turningLoad',
    status: 'native',
    note: 'PR D correction: LegacyMazeGenerationProfile.straightnessBias is a direct, documented control over straight-vs-zigzagging corridors (legacyMaze.ts) -- the original capability matrix incorrectly marked this "indirect", finding no turn-shaping control.'
  },
  { axis: 'routeAmbiguity', status: 'adaptable', note: 'Loop/cycle density rises with shortcut count, but is not itself a direct ambiguity target.' },
  {
    axis: 'shortcutRelief',
    status: 'native',
    note: 'PR D correction: the original capability matrix claimed "no shortcut-carving concept found", which was wrong -- LegacyMazeGenerationProfile.shortcutCountMultiplier is a first-class tuned input, and LegacyMazeSnapshot.generationBuildTrace exposes real shortcutTiles/reinforcementShortcutTiles construction provenance (legacyMaze.ts). generateSample below now threads a real shortcut count through to the shared analyzer instead of leaving it unmeasured.'
  },
  { axis: 'wrapPressure', status: 'native', note: 'Wrap/bleed topology is a first-class, tuned legacy-runtime feature. PR D correction: the canonical bridge (canonicalMaze.ts) now derives the real per-pair wrap list from the grid itself instead of always reporting wrap-free.' }
];

// PR D correction: was a fixed COMPARISON_BOARD_SCALE = 50 regardless of
// spec.width/height, so the "small-*"/"large-*" recipes silently produced
// the identical board for this engine (findings the original convergence
// report itself flagged as a known gap). Board "size" for legacy-runtime is
// one scale number plus an aspect ratio, not literal width/height. Because the
// generator derives dimensions as scale*sqrt(aspect) and scale/sqrt(aspect),
// the geometric mean preserves requested area while the aspect ratio preserves
// shape. Realized dimensions are always reported back in the result
// (realizedWidth/realizedHeight) rather than assumed to equal what was requested.
const resolveLegacyBoardGeometry = (width: number, height: number): { scale: number; aspectRatio: number } => {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1;
  return {
    scale: Math.max(9, Math.round(Math.sqrt(safeWidth * safeHeight))),
    aspectRatio: safeWidth / safeHeight
  };
};

export const createMazeV2LegacyRuntimeAdapter = (): MazeV2EngineAdapter => ({
  engineId: 'legacy-runtime',
  engineLabel: 'Legacy Runtime (production generator)',
  capabilities: LEGACY_RUNTIME_CAPABILITIES,
  generateSample(spec: MazeV2ComparisonSampleSpec): MazeV2ComparisonSampleResult {
    const baseline = createEmptyLegacyProgressionState();
    const track = { ...baseline.tracks.player, level: String(spec.level), targetComplexity: spec.targetComplexity };
    const resolvedProfile = resolveLegacyMazeGenerationProfileForProgression(track);
    // requireWrap forces real wrap topology onto both axes for recipes that
    // explicitly want to exercise it (PR D's own wrap-demand recipe),
    // instead of leaving it to whatever the progression-derived profile
    // happens to request at this targetComplexity.
    const profile = spec.requireWrap === true
      ? { ...resolvedProfile, requiredOppositeBorderConnections: { horizontal: true, vertical: true } }
      : resolvedProfile;
    const { scale, aspectRatio } = resolveLegacyBoardGeometry(spec.width, spec.height);
    // Lane A (raw-carving): omit targetComplexity from selectionOptions so
    // selectLegacyRuntimeMazeForMode bypasses its selection loop entirely
    // and builds exactly the requested seed once. Passing candidateCount: 1
    // is not sufficient because an under-target result can still trigger
    // pressure/adaptive retries. Lane B (production-pipeline): pass the
    // target with no candidate-count override, so the real production
    // default search plus any pressure/adaptive retry runs as it does in the
    // live game.
    const selectionOptions = spec.lane === 'raw-carving'
      ? {}
      : { targetComplexity: spec.targetComplexity };
    const generationStartedAtMs = performance.now();
    const maze = createLegacyRuntimeMazeForMode('play', scale, spec.seed, profile, selectionOptions, aspectRatio);
    const generationDurationMs = performance.now() - generationStartedAtMs;

    // Mirrors metrics.ts's own analyzeLegacyMazeAsMazeV2Metrics field
    // order exactly (maze.shortcutsCreated, falling back to
    // maze.shortcutStats?.created) -- these are the same two fields that
    // function already reads correctly; the canonical-bridge pipeline
    // (this adapter + canonicalAnalyzer.ts) just never threaded them
    // through until this correction.
    const shortcutCount = maze.shortcutsCreated ?? maze.shortcutStats?.created ?? null;

    return {
      spec,
      support: { status: 'supported', reason: null },
      canonicalMaze: deriveMazeV2CanonicalMazeFromLegacySnapshot(maze),
      generationDurationMs,
      shortcutProvenance: shortcutCount === null ? null : {
        shortcutCount,
        routeLengthReduction: maze.wrapTopologyDiagnostics?.playableShortcutDelta ?? null
      },
      realizedWidth: maze.width,
      realizedHeight: maze.height,
      engineNotes: {
        requestedSeed: spec.seed,
        selectedSeed: maze.seed,
        requestedScale: scale,
        requestedAspectRatio: aspectRatio,
        lane: spec.lane,
        searchedCandidateCount: maze.generation?.selection?.searchedCandidateCount ?? 1,
        reinforcementShortcutCount: maze.generationBuildTrace?.reinforcementShortcutTiles.length ?? null
      }
    };
  }
});
