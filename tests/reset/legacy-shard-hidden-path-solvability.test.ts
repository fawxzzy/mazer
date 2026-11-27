import { describe, expect, test } from 'vitest';
import { installShardsLikePlay } from '../../scripts/analysis/lib/shardPlacementSweep';
import { isBleedGateLevel } from '../../src/legacy-runtime/legacyBleedGates';
import { resolveLegacyBleedGateBorderCells, type LegacyBleedGate } from '../../src/legacy-runtime/legacyBleedGateState';
import { GEOMETRY_BUDGET_SATURATION_LEVEL, resolveGeometryBudgetGateWrapFloor } from '../../src/legacy-runtime/legacyGeometryBudget';
import {
  createLegacyMazeHazardGraph,
  findHazardGraphLegacyMismatches,
  maskLegacyBleedGatedCells
} from '../../src/legacy-runtime/legacyHazardGraphAdapter';
import { resolveLegacyWalkableGridNeighbors, type LegacyMazeSnapshot, type LegacyPoint } from '../../src/legacy-runtime/legacyMaze';
import { runLegacyMazeGenerationJob } from '../../src/legacy-runtime/legacyMazeGenerationJob';
import { allocateHazardUnits, validateShardRoute, type HazardGraph, type HazardSpec } from '../../src/mazer-core/hazards';
import { createLadderJobInput, PHONE_ASPECT } from './legacy-hazard-gate-fixture';

/*
 * First-time cards spec D8 / K3 (slice 5): the wrap path behind an unlit Switch counts as BLOCKED for every
 * hazard placed through the adapter, so a locked-gate (shard) level is solvable without ever lighting the Switch.
 * Steps 1-6 of section 3, K3, over the 81 levels from 100 to 282 that carry both a Switch and a lock.
 */

// K3: the levels where the Switch roll says "gate", the level can place one (P(wrap) > 0) and curve A says "lock".
const SWITCH_AND_LOCK_LEVELS: readonly number[] = [
  106, 108, 110, 115, 129, 132, 135, 140, 142, 144, 146, 147, 151, 153, 160, 164, 166, 167, 168, 173, 179,
  180, 181, 182, 183, 186, 187, 190, 192, 195, 197, 199, 200, 207, 210, 212, 214, 215, 216, 217, 223, 224,
  225, 227, 229, 230, 232, 234, 235, 239, 240, 241, 242, 243, 246, 249, 250, 251, 252, 253, 255, 256, 261,
  262, 263, 264, 265, 266, 267, 269, 270, 271, 272, 273, 274, 276, 277, 278, 279, 280, 282
];

// Independent re-derivation of curve A (spec section 3, approved D4): the F1 hash with salt 0x4c4f434b ("LOCK"),
// chance 0 below 100, 30% at 100 rising linearly to 100% at 283. Written out here, not imported, so the pinned list,
// this copy and the production roll (schedule.ts, slice 6) all have to agree.
const curveALock = (level: number): boolean => {
  let value = (level ^ 0x4c4f434b) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  const chance = level < 100 ? 0 : Math.min(1, 0.3 + (0.7 * (level - 100)) / 183);
  return (value >>> 0) / 0x100000000 < chance;
};

// A gate level from the wrap fade start up to the felt ceiling keeps one wrap for its Switch (MAZER-GEN-031), so
// in 100..282 "Switch placeable" is the gate roll alone. Above 282 there are no wraps at all.
const isSwitchPlaceable = (level: number): boolean => isBleedGateLevel(level) && resolveGeometryBudgetGateWrapFloor(level, true) > 0;

/*
 * Step 2: one fixed ladder seed per level (phone ladder board, 25x51), chosen at build as the first seed whose
 * board carries a Switch (offline search over seeds 1..120, 2026-11-27). One board per level keeps the folder
 * inside the serial CI budget; step 5 fails, naming the level, if a pinned board ever stops carrying a Switch.
 */
const PINNED_SEEDS: Readonly<Record<number, number>> = {
  106: 1, 108: 1, 110: 1, 115: 1, 129: 1, 132: 1, 135: 2, 140: 1, 142: 1, 144: 2, 146: 1, 147: 1, 151: 2, 153: 2,
  160: 1, 164: 3, 166: 2, 167: 2, 168: 1, 173: 2, 179: 2, 180: 2, 181: 2, 182: 3, 183: 1, 186: 4, 187: 1, 190: 6,
  192: 1, 195: 2, 197: 1, 199: 2, 200: 2, 207: 2, 210: 2, 212: 1, 214: 2, 215: 1, 216: 1, 217: 1, 223: 8, 224: 6,
  225: 1, 227: 1, 229: 3, 230: 1, 232: 1, 234: 1, 235: 1, 239: 1, 240: 1, 241: 1, 242: 1, 243: 6, 246: 2, 249: 6,
  250: 3, 251: 3, 252: 1, 253: 6, 255: 12, 256: 3, 261: 14, 262: 16, 263: 1, 264: 3, 265: 4, 266: 3, 267: 3, 269: 4,
  270: 5, 271: 1, 272: 9, 273: 9, 274: 10, 276: 7, 277: 33, 278: 8, 279: 2, 280: 12, 282: 35
};

const key = (point: LegacyPoint): string => `${point.x},${point.y}`;

/** Independent BFS over `grid` with production movement (`resolveLegacyWalkableGridNeighbors`, wraps included). */
const gridReaches = (grid: boolean[][], from: LegacyPoint, to: LegacyPoint): boolean => {
  if (grid[from.y]?.[from.x] !== true || grid[to.y]?.[to.x] !== true) return false;
  const seen = new Set<string>([key(from)]);
  const queue: LegacyPoint[] = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const point = queue[head]!;
    if (point.x === to.x && point.y === to.y) return true;
    for (const next of resolveLegacyWalkableGridNeighbors(grid, point)) {
      if (!seen.has(key(next))) {
        seen.add(key(next));
        queue.push(next);
      }
    }
  }
  return false;
};

const specsOnGraph = (graph: HazardGraph, specs: readonly HazardSpec[]): readonly HazardSpec[] => (
  specs.filter((spec) => (spec.kind === 'patrol' ? spec.route.every((cell) => graph.isWalkable(cell)) : graph.isWalkable(spec.cell)))
);

/**
 * Step 3 for one board and one shard list: every problem found, as strings (empty = the board is fair). Takes the
 * shard cells as given, so the negative control can feed it a placement made on the open grid.
 */
const hiddenPathProblems = (
  maze: Pick<LegacyMazeSnapshot, 'grid' | 'start' | 'goal' | 'bleedGates'>,
  shards: readonly LegacyPoint[],
  specs: readonly HazardSpec[]
): string[] => {
  const problems: string[] = [];
  const width = maze.grid[0]!.length;
  const height = maze.grid.length;
  const masked = maskLegacyBleedGatedCells(maze.grid, maze.bleedGates);
  const hidden = new Set((maze.bleedGates ?? []).flatMap((gate) => resolveLegacyBleedGateBorderCells(gate, width, height)).map(key));
  for (const cell of shards) {
    if (hidden.has(key(cell))) problems.push(`shard on masked cell ${key(cell)}`);
  }
  const read = createLegacyMazeHazardGraph(maze);
  const verdict = validateShardRoute(read.graph, specsOnGraph(read.graph, specs), {
    start: read.start,
    goal: read.goal,
    shards: shards.map((cell) => read.graph.cellId(cell.x, cell.y))
  });
  if (!verdict.pass) problems.push(`validateShardRoute fails on the masked graph (${verdict.hazardsPresent.reason ?? 'post-contact or sentry rule'})`);
  const legs = [maze.start, ...shards, maze.goal];
  for (let index = 1; index < legs.length; index += 1) {
    if (!gridReaches(masked, legs[index - 1]!, legs[index]!)) problems.push(`BFS on the masked grid cannot reach leg ${index} (${key(legs[index]!)})`);
  }
  return problems;
};

describe('hidden-path solvability (first-time cards spec D8 / K3, slice 5)', () => {
  test('step 1: the 81 levels are exactly the Switch roll x curve A in 100..282', () => {
    const recomputed: number[] = [];
    for (let level = 100; level <= 282; level += 1) {
      if (isSwitchPlaceable(level) && curveALock(level)) recomputed.push(level);
    }
    expect(recomputed).toEqual([...SWITCH_AND_LOCK_LEVELS]);
    expect([SWITCH_AND_LOCK_LEVELS.length, SWITCH_AND_LOCK_LEVELS[0], SWITCH_AND_LOCK_LEVELS.at(-1)]).toEqual([81, 106, 282]);
    // From 283 no level can carry a Switch, so the clash ends there.
    for (let level = 283; level <= GEOMETRY_BUDGET_SATURATION_LEVEL; level += 1) expect(isSwitchPlaceable(level), `L${level}`).toBe(false);
    expect(Object.keys(PINNED_SEEDS).map(Number)).toEqual([...SWITCH_AND_LOCK_LEVELS]);
  });

  test('steps 2-5: every pinned board carries a Switch, places its shards off the hidden path and is solvable without it', () => {
    const noSwitch: number[] = [];
    const noShards: number[] = [];
    const problems: string[] = [];
    for (const level of SWITCH_AND_LOCK_LEVELS) {
      const maze = runLegacyMazeGenerationJob(createLadderJobInput(level, PHONE_ASPECT, PINNED_SEEDS[level]!));
      if ((maze.bleedGates?.length ?? 0) === 0) {
        noSwitch.push(level);
        continue;
      }
      // The adapter graph is the masked grid, and its neighbours still equal production movement on that grid.
      const read = createLegacyMazeHazardGraph(maze);
      for (const mismatch of findHazardGraphLegacyMismatches(read.graph, maze)) problems.push(`L${level}: ${mismatch}`);
      // Step 4: the star is reachable on the masked grid with no shards at all (a fail-open board ships like that).
      const masked = maskLegacyBleedGatedCells(maze.grid, maze.bleedGates);
      if (!gridReaches(masked, maze.start, maze.goal)) problems.push(`L${level}: goal unreachable on the masked grid`);
      // Step 2: shards are on at every one of these levels (the allocator, the same path play uses).
      expect(allocateHazardUnits(level, { saturationLevel: GEOMETRY_BUDGET_SATURATION_LEVEL }).shards, `L${level} shards`).toBeGreaterThan(0);
      const { result, run, gates } = installShardsLikePlay(maze, level);
      if (result.status !== 'placed' || result.count === 0) {
        noShards.push(level);
        continue;
      }
      for (const problem of hiddenPathProblems(maze, run.describe().cells, gates.liveGateSpecs())) problems.push(`L${level}: ${problem}`);
    }
    // Step 5: report the boards that did not exercise the clash; a level with no Switch is named.
    console.info(`[K3] ${SWITCH_AND_LOCK_LEVELS.length} levels: no Switch ${noSwitch.length} [${noSwitch.join(',')}], no shards ${noShards.length} [${noShards.join(',')}]`);
    expect(noSwitch, 'levels whose pinned board has no Switch (re-pin the seed)').toEqual([]);
    expect(noShards.length, 'boards that shipped without shards').toBeLessThan(SWITCH_AND_LOCK_LEVELS.length / 10);
    expect(problems).toEqual([]);
  });
});

/*
 * Step 6, negative control: a hand-built maze where the only way to the pocket runs through a gated wrap.
 *
 *   y=2:  [0] [1]goal [2] [3]start [4]wall [5] [6]pocket [7] [8]      (all other rows are wall)
 *
 * The Switch is the horizontal wrap on row 2, so its openings are (0,2) and (8,2).
 */
describe('hidden-path mask negative control (K3 step 6)', () => {
  const width = 9;
  const height = 5;
  const grid: boolean[][] = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => y === 2 && x !== 4));
  const gate: LegacyBleedGate = { axis: 'horizontal', line: 2, x: 2, y: 2, pathDistance: 2, ungatedSaving: 0, gatedSaving: 0 };
  const maze = { grid, start: { x: 3, y: 2 }, goal: { x: 1, y: 2 }, bleedGates: [gate] };
  const pocket = { x: 6, y: 2 };

  test('the mask walls exactly the two openings and never mutates the maze', () => {
    const before = JSON.stringify(grid);
    const masked = maskLegacyBleedGatedCells(grid, maze.bleedGates);
    expect(JSON.stringify(grid)).toBe(before);
    expect(masked).not.toBe(grid);
    const changed: string[] = [];
    masked.forEach((row, y) => row.forEach((open, x) => { if (open !== grid[y]![x]) changed.push(`${x},${y}`); }));
    expect(changed).toEqual(['0,2', '8,2']);
    expect(maskLegacyBleedGatedCells(grid, [])).toBe(grid);
    expect(maskLegacyBleedGatedCells(grid, undefined)).toBe(grid);
    // A gate whose openings are already wall changes nothing.
    expect(maskLegacyBleedGatedCells(grid, [{ axis: 'vertical', line: 4 }])).toEqual(grid);
  });

  test('without the mask the pocket is reachable through the wrap; with it, it is not', () => {
    expect(gridReaches(grid, maze.start, pocket)).toBe(true);
    expect(gridReaches(maskLegacyBleedGatedCells(grid, maze.bleedGates), maze.start, pocket)).toBe(false);
    const open = createLegacyMazeHazardGraph({ ...maze, bleedGates: [] });
    const walled = createLegacyMazeHazardGraph(maze);
    const pocketCell = open.graph.cellId(pocket.x, pocket.y);
    expect(validateShardRoute(open.graph, [], { start: open.start, goal: open.goal, shards: [pocketCell] }).pass).toBe(true);
    expect(validateShardRoute(walled.graph, [], { start: walled.start, goal: walled.goal, shards: [pocketCell] }).pass).toBe(false);
    // The star itself never needs the wrap.
    expect(validateShardRoute(walled.graph, [], { start: walled.start, goal: walled.goal, shards: [] }).pass).toBe(true);
  });

  test('the step 3 check fails a placement made on the open grid (the test can fail)', () => {
    expect(hiddenPathProblems(maze, [pocket], [])).not.toEqual([]);
    expect(hiddenPathProblems(maze, [{ x: 8, y: 2 }], []).some((problem) => problem.startsWith('shard on masked cell 8,2'))).toBe(true);
    expect(hiddenPathProblems(maze, [{ x: 2, y: 2 }], [])).toEqual([]);
  });

  test('the mismatch helper compares against the masked grid', () => {
    const walled = createLegacyMazeHazardGraph(maze);
    const open = createLegacyMazeHazardGraph({ ...maze, bleedGates: [] });
    expect(findHazardGraphLegacyMismatches(walled.graph, maze)).toEqual([]);
    expect(findHazardGraphLegacyMismatches(open.graph, { grid })).toEqual([]);
    // The open graph read against the masked maze (and the other way round) differs exactly at the openings.
    expect(findHazardGraphLegacyMismatches(open.graph, maze)).toEqual(['walkable mismatch at 0,2', 'neighbor mismatch at 1,2', 'neighbor mismatch at 7,2', 'walkable mismatch at 8,2']);
    expect(findHazardGraphLegacyMismatches(walled.graph, { grid })).toEqual(['walkable mismatch at 0,2', 'neighbor mismatch at 1,2', 'neighbor mismatch at 7,2', 'walkable mismatch at 8,2']);
  });
});
