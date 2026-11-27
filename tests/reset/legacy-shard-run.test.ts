import { describe, expect, test } from 'vitest';
import {
  SHARD_SWEEP_VIEWPORTS,
  createShippedPlayJobInput,
  installShardsLikePlay,
  shardSweepSeed
} from '../../scripts/analysis/lib/shardPlacementSweep';
import {
  resetLegacyBleedGates,
  resolveLegacyBleedGateBorderCells,
  triggerLegacyBleedGate
} from '../../src/legacy-runtime/legacyBleedGateState';
import { GEOMETRY_BUDGET_SATURATION_LEVEL } from '../../src/legacy-runtime/legacyGeometryBudget';
import { resolveLegacyHazardOverlay } from '../../src/legacy-runtime/legacyHazardOverlay';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import { runLegacyMazeGenerationJob } from '../../src/legacy-runtime/legacyMazeGenerationJob';
import { createLegacyShardRun, type LegacyShardInstallOptions } from '../../src/legacy-runtime/legacyShardRun';
import { resolveShardFirstLevel } from '../../src/legacy-runtime/legacyShardHint';
import { createLegacyMazeHazardGraph, maskLegacyBleedGatedCells } from '../../src/legacy-runtime/legacyHazardGraphAdapter';
import { SHARD_ROUTE_BASE, allocateHazardUnits, shardFloorDistances, validateShardRoute } from '../../src/mazer-core/hazards';
import { createLadderJobInput, PHONE_ASPECT } from './legacy-hazard-gate-fixture';

/*
 * H8 shards UI v1: the play-side run state. Real ladder mazes at the shard's first scheduled level, so the
 * placement, order and unlock checked here are the ones a player meets.
 */

const SHARD_LEVEL = resolveShardFirstLevel() ?? 60;

const optionsFor = (maze: LegacyMazeSnapshot, level: number, mode: 'play' | 'menu' = 'play'): LegacyShardInstallOptions => {
  const overlay = resolveLegacyHazardOverlay(maze, { enabled: true, level });
  return {
    mode,
    level,
    saturationLevel: GEOMETRY_BUDGET_SATURATION_LEVEL,
    specs: overlay?.specs.filter((spec) => spec.kind === 'timedGate') ?? []
  };
};

let cached: { maze: LegacyMazeSnapshot; options: LegacyShardInstallOptions } | null = null;
const placedFixture = (): { maze: LegacyMazeSnapshot; options: LegacyShardInstallOptions } => {
  if (cached !== null) return cached;
  for (let seed = 1; seed < 60; seed += 1) {
    const maze = runLegacyMazeGenerationJob(createLadderJobInput(SHARD_LEVEL, PHONE_ASPECT, seed));
    const options = optionsFor(maze, SHARD_LEVEL);
    if (createLegacyShardRun().install(maze, options).status === 'placed') {
      cached = { maze, options };
      return cached;
    }
  }
  throw new Error(`no placed shard fixture at level ${SHARD_LEVEL}`);
};

describe('legacy shard run (H8 UI v1)', () => {
  test('places shards in play at the first scheduled shard level and locks the star', () => {
    const { maze, options } = placedFixture();
    const run = createLegacyShardRun();
    const result = run.install(maze, options);
    expect(result.status).toBe('placed');
    expect(result.count).toBeGreaterThan(0);
    expect(run.active).toBe(true);
    expect(run.goalLocked).toBe(true);
    const info = run.describe();
    expect(info.cells).toHaveLength(result.count);
    expect(info.digest).not.toBe('');
    expect(info.rejections).toBeInstanceOf(Array);
    for (const cell of info.cells) {
      expect(maze.grid[cell.y]?.[cell.x]).toBe(true);
      expect(cell).not.toEqual(maze.goal);
    }
  });

  test('is deterministic for the same maze and options', () => {
    const { maze, options } = placedFixture();
    const a = createLegacyShardRun();
    const b = createLegacyShardRun();
    a.install(maze, options);
    b.install(maze, options);
    expect(a.describe().cells).toEqual(b.describe().cells);
    expect(a.describe().digest).toBe(b.describe().digest);
  });

  test('collects in order and unlocks on the last shard; the goal tile is not a shard', () => {
    const { maze, options } = placedFixture();
    const run = createLegacyShardRun();
    run.install(maze, options);
    const cells = run.describe().cells;
    expect(run.noteArrival(maze.goal)).toBeNull();
    if (cells.length > 1) {
      // Out of order: standing on a later shard first does nothing.
      expect(run.noteArrival(cells[cells.length - 1]!)).toBeNull();
      expect(run.collected).toBe(0);
    }
    cells.forEach((cell, index) => {
      const arrival = run.noteArrival(cell);
      expect(arrival).toBe(index === cells.length - 1 ? 'unlocked' : 'collected');
      expect(run.collected).toBe(index + 1);
    });
    expect(run.goalLocked).toBe(false);
    // After the unlock nothing more is collected.
    expect(run.noteArrival(cells[0]!)).toBeNull();
  });

  test('menu mode places nothing and leaves the star open', () => {
    const { maze, options } = placedFixture();
    const run = createLegacyShardRun();
    expect(run.install(maze, { ...options, mode: 'menu' })).toEqual({ status: 'off', count: 0 });
    expect(run.active).toBe(false);
    expect(run.goalLocked).toBe(false);
    expect(run.noteArrival(maze.goal)).toBeNull();
  });

  test('below the shard level no shard is placed (fail open: star open)', () => {
    const { maze, options } = placedFixture();
    const run = createLegacyShardRun();
    const result = run.install(maze, { ...options, level: Math.max(1, SHARD_LEVEL - 10) });
    expect(result.count).toBe(0);
    expect(run.goalLocked).toBe(false);
  });

  test('a maze the core cannot read fails open with no shards', () => {
    const { maze, options } = placedFixture();
    const run = createLegacyShardRun();
    const broken = { ...maze, grid: [] } as unknown as LegacyMazeSnapshot;
    const result = run.install(broken, options);
    expect(result.count).toBe(0);
    expect(run.goalLocked).toBe(false);
    expect(run.describe().cells).toEqual([]);
  });

  test('a new install drops the last run', () => {
    const { maze, options } = placedFixture();
    const run = createLegacyShardRun();
    run.install(maze, options);
    run.noteArrival(run.describe().cells[0]!);
    const before = run.version;
    run.install(maze, options);
    expect(run.collected).toBe(0);
    expect(run.version).toBeGreaterThan(before);
    run.clear();
    expect(run.describe()).toMatchObject({ status: 'off', count: 0, cells: [], rejections: [], digest: '', inBand: false });
  });
});

/*
 * The board a player really gets (rule-2 play board, scale 88 from L250: 59x131 phone, 117x65 desktop), built
 * and installed the way MenuScene does (scripts/analysis/lib/shardPlacementSweep.ts). Before 2026-11-27 every
 * one of these levels shipped without shards: the absolute route target sat below the maze's own route.
 */
describe('legacy shard run on the shipped play board', () => {
  test('levels past saturation place every scheduled shard (L340 phone, L400 desktop)', () => {
    for (const [level, boardIndex] of [[340, 0], [400, 1]] as const) {
      const viewport = SHARD_SWEEP_VIEWPORTS[boardIndex]!;
      const maze = runLegacyMazeGenerationJob(createShippedPlayJobInput(level, viewport, shardSweepSeed(level, boardIndex, 0)));
      const { result, run } = installShardsLikePlay(maze, level);
      const expected = allocateHazardUnits(level, { saturationLevel: GEOMETRY_BUDGET_SATURATION_LEVEL }).shards;
      expect(expected).toBeGreaterThan(1);
      expect(result).toEqual({ status: 'placed', count: expected });
      expect(run.goalLocked).toBe(true);
      // The shards add a real detour on top of the maze's own route (the band is anchored there).
      const read = createLegacyMazeHazardGraph(maze);
      const direct = shardFloorDistances(read.graph, read.start)[read.goal]!;
      expect(run.describe().routeTicks! - direct).toBeGreaterThanOrEqual(SHARD_ROUTE_BASE);
    }
  });

  test('a bleed-gated wrap counts as blocked: shards never need it, and lighting the gate changes nothing', () => {
    const level = 200;
    const maze = runLegacyMazeGenerationJob(createShippedPlayJobInput(level, SHARD_SWEEP_VIEWPORTS[0]!, shardSweepSeed(level, 0, 0)));
    const gates = maze.bleedGates ?? [];
    expect(gates.length).toBeGreaterThan(0);
    const width = maze.grid[0]!.length;
    const height = maze.grid.length;
    const openings = gates.flatMap((gate) => resolveLegacyBleedGateBorderCells(gate, width, height));
    expect(openings.some((cell) => maze.grid[cell.y]![cell.x] === true)).toBe(true);

    const before = JSON.stringify(maze.grid);
    const placementGrid = maskLegacyBleedGatedCells(maze.grid, maze.bleedGates);
    expect(JSON.stringify(maze.grid)).toBe(before);
    for (const cell of openings) expect(placementGrid[cell.y]![cell.x]).toBe(false);
    expect(placementGrid.flat().filter(Boolean).length)
      .toBe(maze.grid.flat().filter(Boolean).length - openings.filter((cell) => maze.grid[cell.y]![cell.x]).length);
    expect(maskLegacyBleedGatedCells(maze.grid, [])).toBe(maze.grid);

    const installed = installShardsLikePlay(maze, level);
    const unlit = installed.run.describe();
    expect(unlit.status).toBe('placed');
    for (const cell of unlit.cells) {
      expect(openings.some((opening) => opening.x === cell.x && opening.y === cell.y)).toBe(false);
    }
    // The shipped route is the one proved without the wrap; through the open wrap the same shards are shorter.
    const witnessTicks = (grid: boolean[][]): number | null => {
      // `bleedGates: []` reads `grid` as given (the adapter would wall the wrap again otherwise).
      const read = createLegacyMazeHazardGraph({ ...maze, grid, bleedGates: [] });
      const shards = unlit.cells.map((cell) => read.graph.cellId(cell.x, cell.y));
      const verdict = validateShardRoute(read.graph, installed.gates.liveGateSpecs(), { start: read.start, goal: read.goal, shards });
      return verdict.witness?.ticks ?? null;
    };
    expect(witnessTicks(placementGrid)).toBe(unlit.routeTicks);
    expect(witnessTicks(maze.grid)!).toBeLessThan(unlit.routeTicks!);
    for (const gate of gates) triggerLegacyBleedGate(maze, gate, 0);
    try {
      const lit = installShardsLikePlay(maze, level).run.describe();
      expect(lit.cells).toEqual(unlit.cells);
      expect(lit.digest).toBe(unlit.digest);
      expect(lit.routeTicks).toBe(unlit.routeTicks);
    } finally {
      resetLegacyBleedGates(maze);
    }
  });
});
