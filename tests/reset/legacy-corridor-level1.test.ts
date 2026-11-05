import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  createLegacyMaze,
  resolveLegacyPlayableShortestPath,
  resolveLegacyShortestPath,
  type LegacyMazeGenerationProfile,
  type LegacyMazeSnapshot,
  type LegacyPoint
} from '../../src/legacy-runtime/legacyMaze';
import {
  createEmptyLegacyProgressionState,
  resolveLegacyMazeComplexity,
  resolveLegacyMazeGenerationProfileForProgression,
  resolveLegacyProgressionDifficultyProfile
} from '../../src/legacy-runtime/legacyProgression';

const CORRIDOR_PROFILE: Partial<LegacyMazeGenerationProfile> = { layout: 'corridor' };
const SEEDS = [1, 2, 3, 7, 42, 1337, 99999, 4294967295];
const BOARD_SIZES: ReadonlyArray<readonly [number, number]> = [[35, 35], [29, 29], [41, 25], [25, 41], [60, 60]];
const DIRECTIONS: readonly LegacyPoint[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 }
];

const resolveLevelTrack = (level: number) => ({
  ...createEmptyLegacyProgressionState().tracks.player,
  level: String(level),
  targetComplexity: 8 + (level - 1) * 4
});

const collectFloors = (maze: Pick<LegacyMazeSnapshot, 'grid'>): LegacyPoint[] => {
  const floors: LegacyPoint[] = [];
  maze.grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell) {
      floors.push({ x, y });
    }
  }));
  return floors;
};

const countFloorNeighbors = (maze: Pick<LegacyMazeSnapshot, 'grid'>, point: LegacyPoint): number => (
  DIRECTIONS.filter((direction) => maze.grid[point.y + direction.y]?.[point.x + direction.x] === true).length
);

const countConnectedFloors = (maze: LegacyMazeSnapshot): number => {
  const seen = new Set<string>([`${maze.start.x},${maze.start.y}`]);
  const queue = [maze.start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = `${next.x},${next.y}`;
      if (maze.grid[next.y]?.[next.x] === true && !seen.has(key)) {
        seen.add(key);
        queue.push(next);
      }
    }
  }
  return seen.size;
};

const hasTwoByTwoFloorBlock = (maze: Pick<LegacyMazeSnapshot, 'grid'>): boolean => (
  maze.grid.some((row, y) => row.some((_, x) => (
    row[x] === true
    && row[x + 1] === true
    && maze.grid[y + 1]?.[x] === true
    && maze.grid[y + 1]?.[x + 1] === true
  )))
);

describe('Level 1 straight corridor layout', () => {
  test.each(BOARD_SIZES)('is a single straight line along the longer axis with start and goal at the ends (%i x %i)', (width, height) => {
    for (const seed of SEEDS) {
      const maze = createLegacyMaze(width, height, seed, undefined, CORRIDOR_PROFILE);
      const floors = collectFloors(maze);
      const vertical = maze.height > maze.width;

      if (vertical) {
        const columns = new Set(floors.map((tile) => tile.x));
        expect(columns.size).toBe(1);
        const columnX = [...columns][0]!;
        expect(columnX).toBe((maze.width - 1) / 2);
        const ys = floors.map((tile) => tile.y).sort((a, b) => a - b);
        // Contiguous run, one tile in from each border row.
        expect(ys).toEqual(Array.from({ length: maze.height - 2 }, (_, index) => index + 1));
        expect(maze.start).toEqual({ x: columnX, y: 1 });
        expect(maze.goal).toEqual({ x: columnX, y: maze.height - 2 });
        // No turns: every step is +1 on y with x fixed.
        maze.solutionPath.forEach((tile, index) => {
          expect(tile).toEqual({ x: columnX, y: 1 + index });
        });
      } else {
        const rows = new Set(floors.map((tile) => tile.y));
        expect(rows.size).toBe(1);
        const rowY = [...rows][0]!;
        expect(rowY).toBe((maze.height - 1) / 2);
        const xs = floors.map((tile) => tile.x).sort((a, b) => a - b);
        // Contiguous run, one tile in from each border column.
        expect(xs).toEqual(Array.from({ length: maze.width - 2 }, (_, index) => index + 1));
        expect(maze.start).toEqual({ x: 1, y: rowY });
        expect(maze.goal).toEqual({ x: maze.width - 2, y: rowY });
        // No turns: every step is +1 on x with y fixed.
        maze.solutionPath.forEach((tile, index) => {
          expect(tile).toEqual({ x: 1 + index, y: rowY });
        });
      }
      // Path length equals floor count: every floor tile is on the one route.
      expect(maze.solutionPath).toHaveLength(floors.length);
    }
  });

  test('uses the longer axis: portrait boards are vertical, landscape and square are horizontal', () => {
    const portrait = createLegacyMaze(27, 45, 3, undefined, CORRIDOR_PROFILE);
    const landscape = createLegacyMaze(43, 29, 3, undefined, CORRIDOR_PROFILE);
    const square = createLegacyMaze(35, 35, 3, undefined, CORRIDOR_PROFILE);
    expect(portrait.goal.y - portrait.start.y).toBe(portrait.height - 3);
    expect(portrait.goal.x).toBe(portrait.start.x);
    expect(landscape.goal.x - landscape.start.x).toBe(landscape.width - 3);
    expect(landscape.goal.y).toBe(landscape.start.y);
    expect(square.goal.x - square.start.x).toBe(square.width - 3);
    expect(square.goal.y).toBe(square.start.y);
  });

  test('keeps the border ring fully wall so nothing can wrap', () => {
    for (const [width, height] of BOARD_SIZES) {
      const maze = createLegacyMaze(width, height, 5, undefined, CORRIDOR_PROFILE);
      for (let x = 0; x < maze.width; x += 1) {
        expect(maze.grid[0]![x]).toBe(false);
        expect(maze.grid[maze.height - 1]![x]).toBe(false);
      }
      for (let y = 0; y < maze.height; y += 1) {
        expect(maze.grid[y]![0]).toBe(false);
        expect(maze.grid[y]![maze.width - 1]).toBe(false);
      }
    }
  });

  test('has no 2x2 floor block, is one connected component and has exactly one route', () => {
    for (const seed of SEEDS) {
      const maze = createLegacyMaze(35, 35, seed, undefined, CORRIDOR_PROFILE);
      expect(hasTwoByTwoFloorBlock(maze)).toBe(false);
      expect(countConnectedFloors(maze)).toBe(collectFloors(maze).length);
      // Exactly one path: the direct-floor and wrap-aware shortest paths both
      // equal the solution path, and no interior tile has more than two
      // floor neighbours (no branch) while only the two ends have one (no
      // dead end other than start/goal).
      const direct = resolveLegacyShortestPath(maze.grid, maze.start, maze.goal);
      const playable = resolveLegacyPlayableShortestPath(maze.grid, maze.start, maze.goal);
      expect(direct.found).toBe(true);
      expect(direct.path).toEqual(maze.solutionPath);
      expect(playable.found).toBe(true);
      expect(playable.path).toEqual(maze.solutionPath);
      const floors = collectFloors(maze);
      const endpoints = floors.filter((tile) => countFloorNeighbors(maze, tile) === 1);
      expect(endpoints).toEqual([maze.start, maze.goal]);
      expect(floors.filter((tile) => countFloorNeighbors(maze, tile) > 2)).toEqual([]);
    }
  });

  test('has no wraps, feeders, shortcuts, dead-end pruning or route splits in its diagnostics', () => {
    const maze = createLegacyMaze(35, 35, 11, undefined, CORRIDOR_PROFILE);
    const wrap = maze.wrapTopologyDiagnostics!;
    expect(wrap.horizontal.endpointCount).toBe(0);
    expect(wrap.horizontal.pairCount).toBe(0);
    expect(wrap.vertical.endpointCount).toBe(0);
    expect(wrap.vertical.pairCount).toBe(0);
    expect(wrap.cornerBorderFloors).toEqual([]);
    expect(wrap.inwardDisconnectedEndpoints).toEqual([]);
    expect(wrap.graphTopologyValid).toBe(true);
    expect(wrap.playableShortcutDelta).toBe(0);
    expect(wrap.solutionRouteAudit.validCompletedRoute).toBe(true);
    expect(maze.shortcutsCreated).toBe(0);
    expect(maze.shortcutStats?.created).toBe(0);
    expect(maze.generationBuildTrace?.shortcutTiles).toEqual([]);
    expect(maze.generationBuildTrace?.reinforcementShortcutTiles).toEqual([]);
    expect(maze.generationBuildTrace?.deadEndPrunedTiles).toEqual([]);
    expect(maze.playableTopologyStats?.disconnectedFloorTilesPruned).toBe(0);
    expect(maze.playableTopologyStats?.goalRebasedToFarthestReachableFloor).toBe(false);
    expect(maze.playableTopologyStats?.reachableFloors).toBe(maze.solutionPath.length);
    expect(maze.routeQualityStats?.routeQuality).toBe('single-route');
    expect(maze.routeQualityStats?.bypassableRouteBands).toBe(0);
  });

  test('is deterministic and independent of the seed', () => {
    const reference = createLegacyMaze(35, 35, 1, undefined, CORRIDOR_PROFILE);
    for (const seed of SEEDS) {
      const maze = createLegacyMaze(35, 35, seed, undefined, CORRIDOR_PROFILE);
      expect(maze.grid).toEqual(reference.grid);
      expect(maze.start).toEqual(reference.start);
      expect(maze.goal).toEqual(reference.goal);
      expect(maze.solutionPath).toEqual(reference.solutionPath);
      expect(maze.seed).toBe(seed);
    }
    expect(createLegacyMaze(35, 35, 1, undefined, CORRIDOR_PROFILE)).toEqual(reference);
  });

  test('is not rewritten by the shortcut count or the minimum-solution-length rule', () => {
    // 35 wide gives a 33-tile corridor, below the max(25, floor(1.5 * 35))
    // minimum that rebases/extends ordinary mazes. The corridor must survive.
    const withShortcuts = createLegacyMaze(35, 35, 3, 40, CORRIDOR_PROFILE);
    const plain = createLegacyMaze(35, 35, 3, undefined, CORRIDOR_PROFILE);
    expect(withShortcuts.grid).toEqual(plain.grid);
    expect(plain.solutionPath).toHaveLength(33);
    expect(Math.floor(35 * 1.5)).toBeGreaterThan(plain.solutionPath.length);
    // Large boards (shortcut stage normally on) are untouched too.
    const large = createLegacyMaze(97, 97, 3, 70, CORRIDOR_PROFILE);
    expect(collectFloors(large)).toHaveLength(95);
    expect(large.shortcutsCreated).toBe(0);
  });

  test('the layout survives profile normalisation and the runtime selection path', () => {
    const maze = createLegacyRuntimeMazeForMode('play', 35, 9, CORRIDOR_PROFILE, { targetComplexity: 8 });
    expect(maze.generation?.profile?.layout).toBe('corridor');
    expect(collectFloors(maze)).toHaveLength(maze.width - 2);
    expect(maze.width).toBe(35);
    expect(maze.height).toBe(35);
    // High targets must not trigger under-target pressure/adaptive retries
    // (the adaptive retry would resize the board and drop the layout).
    const highTarget = createLegacyRuntimeMazeForMode('play', 35, 9, CORRIDOR_PROFILE, { targetComplexity: 120 });
    expect(highTarget.generation?.selection?.pressureRetryUsed).toBe(false);
    expect(highTarget.generation?.selection?.adaptiveRetryUsed).toBe(false);
    expect(highTarget.width).toBe(35);
    expect(collectFloors(highTarget)).toHaveLength(33);
    // The menu-generated build kind goes through the same layout.
    const menu = createLegacyRuntimeMazeForMode('menu', 35, 9, CORRIDOR_PROFILE, { targetComplexity: 8 });
    expect(collectFloors(menu)).toHaveLength(menu.width - 2);
  });

  test('Level 1 progression profile is the corridor and Level 2+ is not', () => {
    expect(resolveLegacyProgressionDifficultyProfile(8).band).toBe('tutorial');
    expect(resolveLegacyMazeGenerationProfileForProgression(resolveLevelTrack(1)).layout).toBe('corridor');
    expect(resolveLegacyMazeGenerationProfileForProgression(8).layout).toBe('corridor');
    for (const level of [2, 3, 4, 5, 8, 9, 10, 18, 19, 30, 42, 60, 99]) {
      const profile = resolveLegacyMazeGenerationProfileForProgression(resolveLevelTrack(level));
      expect(profile.layout, `level ${level}`).toBeUndefined();
      expect('layout' in profile, `level ${level}`).toBe(false);
    }
  });

  test('Level 1 runtime maze built from the progression profile is a corridor, Level 2 is not', () => {
    const level1 = createLegacyRuntimeMazeForMode(
      'play',
      35,
      21,
      resolveLegacyMazeGenerationProfileForProgression(resolveLevelTrack(1)),
      { targetComplexity: 8 }
    );
    expect(level1.generation?.profile?.layout).toBe('corridor');
    expect(new Set(collectFloors(level1).map((tile) => tile.y)).size).toBe(1);

    const level2 = createLegacyRuntimeMazeForMode(
      'play',
      35,
      21,
      resolveLegacyMazeGenerationProfileForProgression(resolveLevelTrack(2)),
      { targetComplexity: 12 }
    );
    expect(level2.generation?.profile?.layout).toBeUndefined();
    expect(new Set(collectFloors(level2).map((tile) => tile.y)).size).toBeGreaterThan(1);
  });

  test('exposes level 1 complexity and delivery numbers as a plain corridor', () => {
    const level1 = createLegacyRuntimeMazeForMode(
      'play',
      35,
      21,
      resolveLegacyMazeGenerationProfileForProgression(resolveLevelTrack(1)),
      { targetComplexity: 8 }
    );
    const selection = level1.generation?.selection;
    expect(selection?.targetComplexity).toBe(8);
    expect(selection?.measuredComplexity).toBe(resolveLegacyMazeComplexity(level1).total);
    // Every candidate is the identical corridor, so the window collapses.
    expect(selection?.candidateComplexityMin).toBe(selection?.candidateComplexityMax);
  });

  test('default-profile createLegacyMaze is unchanged (no layout key, still branching)', () => {
    const maze = createLegacyMaze(41, 41, 7);
    expect(maze.solutionPath.length).toBeGreaterThan(41);
    expect(new Set(collectFloors(maze).map((tile) => tile.y)).size).toBeGreaterThan(1);
    expect(createLegacyMaze(41, 41, 7)).toEqual(maze);
    expect(createLegacyMaze(41, 41, 7, undefined, null)).toEqual(maze);
    expect(createLegacyMaze(41, 41, 7, undefined, {})).toEqual(maze);
    expect(createLegacyMaze(41, 41, 7, undefined, { layout: undefined })).toEqual(maze);
  });
});
