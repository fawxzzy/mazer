// Shard placement sweep harness (H8 follow-up): builds the maze a player really gets at a level and runs the
// play-side shard install on it, exactly as MenuScene does (generation request -> worker job -> Pulse Gate
// controller -> LegacyShardRun.install with the controller's live gate specs). No mocks: production modules only.
//
// The board inputs mirror MenuScene's private resolvers for the play surface (MenuScene.ts
// resolveLegacyProgressionScaleForMode / resolveLegacyBoardAspectRatioForMode /
// resolveLegacyMazeGenerationProfileForMode): board-scale setting 50, floating touch controls, no safe area,
// browser-mobile parity off (a node run has no window). Keep in sync if those resolvers change.
import { createLegacyGenerationRequest } from '../../../src/legacy-runtime/legacyGenerationLifecycle';
import { resolveLegacyFullHeightGrowth } from '../../../src/legacy-runtime/legacyBoardFullHeight';
import { GEOMETRY_BUDGET_SATURATION_LEVEL } from '../../../src/legacy-runtime/legacyGeometryBudget';
import { createLegacyHazardGateController } from '../../../src/legacy-runtime/legacyHazardGateController';
import type { LegacyMazeSnapshot } from '../../../src/legacy-runtime/legacyMaze';
import {
  createLegacyMazeGenerationJobInputFromRequest,
  runLegacyMazeGenerationJob
} from '../../../src/legacy-runtime/legacyMazeGenerationJob';
import { resolveLegacyMenuBoardAspectRatio, resolveLegacyMenuLayout } from '../../../src/legacy-runtime/legacyMenuLayout';
import {
  resolveLegacyMazeGenerationProfileForProgression,
  resolveLegacyProgressionScaleDetail
} from '../../../src/legacy-runtime/legacyProgression';
import { createLegacyShardRun } from '../../../src/legacy-runtime/legacyShardRun';
import { resolveShardFirstLevel } from '../../../src/legacy-runtime/legacyShardHint';
import { allocateHazardUnits } from '../../../src/mazer-core/hazards';
import { trackForLevel } from './progressionLadderSampling';

export interface ShardSweepViewport {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/** The two browser-check viewports of the project (phone portrait, desktop landscape). */
export const SHARD_SWEEP_VIEWPORTS: readonly ShardSweepViewport[] = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 720 }
];

const BOARD_SCALE_SETTING = 50;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** The play-start generation job MenuScene builds for `level` on `viewport` with `seed` (hazard layer on). */
export const createShippedPlayJobInput = (level: number, viewport: ShardSweepViewport, seed: number) => {
  const track = trackForLevel(level);
  const scaleOptions = {
    surface: 'play' as const,
    viewport: { width: viewport.width, height: viewport.height, useFloatingTouchControls: true }
  };
  const { scale, fraction, sizeRule } = resolveLegacyProgressionScaleDetail(BOARD_SCALE_SETTING, track, scaleOptions);
  const layoutOptions = {
    browserMobileParity: false,
    knownCellScale: scale,
    menuActionMode: 'guest' as const,
    useFloatingTouchControls: true
  };
  // MenuScene.resolveLegacyBoardAspectRatioForMode('play', scale).
  const seedAspect = resolveLegacyMenuBoardAspectRatio(viewport.width, viewport.height, BOARD_SCALE_SETTING, 'play', layoutOptions);
  const root = Math.sqrt(seedAspect);
  const probe = resolveLegacyMenuLayout(
    viewport.width,
    viewport.height,
    BOARD_SCALE_SETTING,
    Math.max(1, Math.round(scale * root)),
    Math.max(1, Math.round(scale / root)),
    'play',
    layoutOptions
  );
  const aspectRatio = probe.boardWidth <= 0 || probe.boardHeight <= 0 ? seedAspect : clamp(probe.boardWidth / probe.boardHeight, 0.45, 2.2);
  // MenuScene.resolveLegacyMazeGenerationProfileForMode('play').
  const profile = resolveLegacyMazeGenerationProfileForProgression(track, { fraction, sizeRule });
  const gridGrowth = resolveLegacyFullHeightGrowth({
    viewport: { width: viewport.width, height: viewport.height, browserMobileParity: false },
    scale,
    aspectRatio,
    minGridAxis: profile.minGridAxis,
    boardScaleSetting: BOARD_SCALE_SETTING
  });
  const generationProfile = gridGrowth.rows > 0 || gridGrowth.cols > 0 ? { ...profile, gridGrowth } : profile;
  const request = createLegacyGenerationRequest({
    aspectRatio,
    currentSeed: 1,
    dueAtMs: 0,
    generationProfile,
    mode: 'play',
    reason: 'play-start',
    scale,
    seedOverride: seed,
    targetComplexity: track.targetComplexity
  });
  return createLegacyMazeGenerationJobInputFromRequest(request, scale, { enabled: true, level });
};

export interface ShardSweepRow {
  readonly level: number;
  readonly board: string;
  readonly seed: number;
  readonly shards: number;
  readonly status: string;
  readonly placed: number;
  readonly rejections: readonly string[];
  readonly routeTicks: number | null;
  /** False for a nearest-route fallback (strict band missed on this base) or nothing placed. */
  readonly inBand: boolean;
  readonly gates: number;
  readonly bleedGates: number;
  readonly width: number;
  readonly height: number;
  readonly computeMs: number;
}

/** Gate controller + shard run install over a built maze, as MenuScene.installLegacyHazardGateLayer does in play. */
export const installShardsLikePlay = (maze: LegacyMazeSnapshot, level: number) => {
  const gates = createLegacyHazardGateController();
  gates.install(maze, { mode: 'play', level, playerLevel: level });
  const run = createLegacyShardRun();
  const startedAt = performance.now();
  const result = run.install(maze, {
    mode: 'play',
    level,
    saturationLevel: GEOMETRY_BUDGET_SATURATION_LEVEL,
    specs: gates.liveGateSpecs()
  }, () => performance.now());
  return { result, run, gates, ms: performance.now() - startedAt };
};

export const sweepShardLevel = (level: number, viewport: ShardSweepViewport, seed: number): ShardSweepRow => {
  const maze = runLegacyMazeGenerationJob(createShippedPlayJobInput(level, viewport, seed));
  const { result, run, gates, ms } = installShardsLikePlay(maze, level);
  const info = run.describe();
  return {
    level,
    board: viewport.name,
    seed,
    shards: allocateHazardUnits(level, { saturationLevel: GEOMETRY_BUDGET_SATURATION_LEVEL }).shards,
    status: result.status,
    placed: result.count,
    rejections: info.rejections,
    routeTicks: info.routeTicks,
    inBand: info.inBand,
    gates: gates.liveGateSpecs().length,
    bleedGates: maze.bleedGates?.length ?? 0,
    width: maze.grid[0]?.length ?? 0,
    height: maze.grid.length,
    computeMs: Math.round(ms)
  };
};

/** First level with shards (read from HAZARD_INTRO_SCHEDULE through the hint module, never hardcoded). */
export const shardSweepFirstLevel = (): number => {
  const first = resolveShardFirstLevel();
  if (first === null) throw new Error('HAZARD_INTRO_SCHEDULE has no shard entry');
  return first;
};

/** Seed for (level, board, index): fixed, so the sweep is reproducible. */
export const shardSweepSeed = (level: number, boardIndex: number, index: number): number => (
  (1_000_003 + (level * 7919) + (boardIndex * 104_729) + (index * 15_485_863)) >>> 0
);
