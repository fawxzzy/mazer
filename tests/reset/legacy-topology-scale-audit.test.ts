import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { createLegacyGeneratedMenuMaze, createLegacyMaze } from '../../src/legacy-runtime/legacyMaze';
import {
  createEmptyLegacyProgressionState,
  resolveLegacyMazeComplexity,
  resolveLegacyMazeGenerationProfileForProgression,
  resolveLegacyProgressionGenerationScale
} from '../../src/legacy-runtime/legacyProgression';

const resolveMedian = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const center = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[center - 1] ?? 0) + (sorted[center] ?? 0)) / 2
    : (sorted[center] ?? 0);
};

const countDetachedFloorTiles = (maze: ReturnType<typeof createLegacyMaze>): number => {
  const queue = [maze.start];
  const visited = new Set<string>([`${maze.start.x},${maze.start.y}`]);
  const directions = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 }
  ];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) {
      continue;
    }

    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = `${next.x},${next.y}`;
      if (maze.grid[next.y]?.[next.x] !== true || visited.has(key)) {
        continue;
      }

      visited.add(key);
      queue.push(next);
    }
  }

  let detached = 0;
  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
      if (maze.grid[y]?.[x] === true && !visited.has(`${x},${y}`)) {
        detached += 1;
      }
    }
  }

  return detached;
};

const countWalkableFloorTiles = (maze: ReturnType<typeof createLegacyMaze>): number => (
  maze.grid.reduce((total, row) => total + row.filter(Boolean).length, 0)
);

const isBorderPoint = (
  maze: ReturnType<typeof createLegacyMaze>,
  point: { x: number; y: number }
): boolean => (
  point.x === 0 || point.y === 0 || point.x === maze.width - 1 || point.y === maze.height - 1
);

const isCornerBorderPoint = (
  maze: ReturnType<typeof createLegacyMaze>,
  point: { x: number; y: number }
): boolean => (
  (point.x === 0 || point.x === maze.width - 1) && (point.y === 0 || point.y === maze.height - 1)
);

const isNonCornerBorderFloor = (
  maze: ReturnType<typeof createLegacyMaze>,
  point: { x: number; y: number }
): boolean => (
  maze.grid[point.y]?.[point.x] === true
  && isBorderPoint(maze, point)
  && !isCornerBorderPoint(maze, point)
);

const resolveOppositeBorderPoint = (
  maze: ReturnType<typeof createLegacyMaze>,
  point: { x: number; y: number }
): { x: number; y: number } | null => {
  if (!isNonCornerBorderFloor(maze, point)) {
    return null;
  }

  if (point.x === 0) {
    return { x: maze.width - 1, y: point.y };
  }
  if (point.x === maze.width - 1) {
    return { x: 0, y: point.y };
  }
  if (point.y === 0) {
    return { x: point.x, y: maze.height - 1 };
  }
  return { x: point.x, y: 0 };
};

const resolveInwardBorderNeighbor = (
  maze: ReturnType<typeof createLegacyMaze>,
  point: { x: number; y: number }
): { x: number; y: number } | null => {
  if (!isNonCornerBorderFloor(maze, point)) {
    return null;
  }

  if (point.x === 0) {
    return { x: 1, y: point.y };
  }
  if (point.x === maze.width - 1) {
    return { x: maze.width - 2, y: point.y };
  }
  if (point.y === 0) {
    return { x: point.x, y: 1 };
  }
  return { x: point.x, y: maze.height - 2 };
};

const auditBorderFloorContinuity = (
  maze: ReturnType<typeof createLegacyMaze>
): {
  borderFloorCount: number;
  floorRatio: number;
  unpairedBorderBleeds: Array<{ opposite: { x: number; y: number } | null; point: { x: number; y: number } }>;
  borderFloorsWithoutInwardConnection: Array<{ inward: { x: number; y: number } | null; point: { x: number; y: number } }>;
} => {
  const unpairedBorderBleeds: Array<{ opposite: { x: number; y: number } | null; point: { x: number; y: number } }> = [];
  const borderFloorsWithoutInwardConnection: Array<{ inward: { x: number; y: number } | null; point: { x: number; y: number } }> = [];
  let borderFloorCount = 0;
  const walkableFloorTiles = countWalkableFloorTiles(maze);

  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
      const point = { x, y };
      if (!isNonCornerBorderFloor(maze, point)) {
        continue;
      }

      borderFloorCount += 1;
      const opposite = resolveOppositeBorderPoint(maze, point);
      if (!opposite || maze.grid[opposite.y]?.[opposite.x] !== true) {
        unpairedBorderBleeds.push({ point, opposite });
      }

      const inward = resolveInwardBorderNeighbor(maze, point);
      if (!inward || maze.grid[inward.y]?.[inward.x] !== true) {
        borderFloorsWithoutInwardConnection.push({ point, inward });
      }
    }
  }

  return {
    borderFloorCount,
    floorRatio: walkableFloorTiles / Math.max(1, maze.width * maze.height),
    unpairedBorderBleeds,
    borderFloorsWithoutInwardConnection
  };
};

const auditOppositeBorderAxes = (
  maze: ReturnType<typeof createLegacyMaze>
): {
  horizontal: number;
  vertical: number;
} => {
  let horizontal = 0;
  let vertical = 0;

  for (let y = 1; y < maze.height - 1; y += 1) {
    if (maze.grid[y]?.[0] === true && maze.grid[y]?.[maze.width - 1] === true) {
      horizontal += 1;
    }
  }

  for (let x = 1; x < maze.width - 1; x += 1) {
    if (maze.grid[0]?.[x] === true && maze.grid[maze.height - 1]?.[x] === true) {
      vertical += 1;
    }
  }

  return {
    horizontal,
    vertical
  };
};

const isReservedCutoutLine = (axisLength: number, line: number): boolean => {
  const center = Math.floor(axisLength / 2);
  const centerReserve = Math.max(2, Math.ceil(axisLength * 0.045));
  return line <= 1
    || line >= axisLength - 2
    || Math.abs(line - center) <= centerReserve;
};

const auditBorderFeederSides = (
  maze: ReturnType<typeof createLegacyMaze>
): {
  adjacentBorderFloors: Array<{ first: number; second: number; side: 'bottom' | 'left' | 'right' | 'top' }>;
  bottom: number;
  left: number;
  reservedBorderFloors: Array<{ x: number; y: number }>;
  right: number;
  top: number;
} => {
  const result = {
    adjacentBorderFloors: [] as Array<{ first: number; second: number; side: 'bottom' | 'left' | 'right' | 'top' }>,
    bottom: 0,
    left: 0,
    reservedBorderFloors: [] as Array<{ x: number; y: number }>,
    right: 0,
    top: 0
  };

  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
      const point = { x, y };
      if (!isNonCornerBorderFloor(maze, point)) {
        continue;
      }

      if (point.x === 0) {
        result.left += 1;
        if (isReservedCutoutLine(maze.height, point.y)) {
          result.reservedBorderFloors.push(point);
        }
      } else if (point.x === maze.width - 1) {
        result.right += 1;
        if (isReservedCutoutLine(maze.height, point.y)) {
          result.reservedBorderFloors.push(point);
        }
      } else if (point.y === 0) {
        result.top += 1;
        if (isReservedCutoutLine(maze.width, point.x)) {
          result.reservedBorderFloors.push(point);
        }
      } else if (point.y === maze.height - 1) {
        result.bottom += 1;
        if (isReservedCutoutLine(maze.width, point.x)) {
          result.reservedBorderFloors.push(point);
        }
      }
    }
  }

  const sideLines: Record<'bottom' | 'left' | 'right' | 'top', number[]> = {
    bottom: [],
    left: [],
    right: [],
    top: []
  };
  for (let y = 1; y < maze.height - 1; y += 1) {
    if (maze.grid[y]?.[0] === true) {
      sideLines.left.push(y);
    }
    if (maze.grid[y]?.[maze.width - 1] === true) {
      sideLines.right.push(y);
    }
  }
  for (let x = 1; x < maze.width - 1; x += 1) {
    if (maze.grid[0]?.[x] === true) {
      sideLines.top.push(x);
    }
    if (maze.grid[maze.height - 1]?.[x] === true) {
      sideLines.bottom.push(x);
    }
  }
  for (const [side, lines] of Object.entries(sideLines) as Array<[
    keyof typeof sideLines,
    number[]
  ]>) {
    for (let index = 1; index < lines.length; index += 1) {
      const first = lines[index - 1];
      const second = lines[index];
      if (first !== undefined && second !== undefined && second - first < 2) {
        result.adjacentBorderFloors.push({ first, second, side });
      }
    }
  }

  return result;
};

const LEGACY_WRAPPED_ROUTE_MINIMUM_SCALE = 1.4;

describe('legacy topology scale audit', () => {
  test('keeps the fixed-seed early curve nondecreasing with a measurable level-one to level-two step', () => {
    const seeds = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233];
    const targets = [8, 12, 16, 20, 24];
    const baseline = createEmptyLegacyProgressionState();
    const surfaceResults = (['menu', 'play'] as const).map((mode) => {
      const trackId = mode === 'play' ? 'player' : 'ai-runner';
      return targets.map((targetComplexity, index) => {
        const track = {
          ...baseline.tracks[trackId],
          level: String(index + 1),
          targetComplexity
        };
        const generationProfile = resolveLegacyMazeGenerationProfileForProgression(track);
        const scale = resolveLegacyProgressionGenerationScale(50, track, {
          surface: mode === 'play' ? 'play' : 'menu-demo'
        });
        const complexities = seeds.map((seed) => resolveLegacyMazeComplexity(
          createLegacyRuntimeMazeForMode(
            mode,
            scale,
            seed,
            generationProfile,
            { targetComplexity }
          )
        ).total);
        return {
          mean: complexities.reduce((total, value) => total + value, 0) / complexities.length,
          median: resolveMedian(complexities)
        };
      });
    });

    for (const results of surfaceResults) {
      expect(results[1]?.mean).toBeGreaterThan(results[0]?.mean ?? Number.POSITIVE_INFINITY);
      expect(results[1]?.median).toBeGreaterThan(results[0]?.median ?? Number.POSITIVE_INFINITY);
      for (let index = 1; index < results.length; index += 1) {
        expect(results[index]?.mean).toBeGreaterThanOrEqual(results[index - 1]?.mean ?? Number.POSITIVE_INFINITY);
        expect(results[index]?.median).toBeGreaterThanOrEqual(results[index - 1]?.median ?? Number.POSITIVE_INFINITY);
      }
    }
  }, 20_000);

  test('keeps supplemental border feeders separated from every existing opening', () => {
    const reportedCases = [
      { scale: 39, seed: 1 },
      { scale: 37, seed: 4 },
      { scale: 37, seed: 10 },
      { scale: 39, seed: 12 },
      { scale: 37, seed: 13 }
    ];

    for (const { scale, seed } of reportedCases) {
      for (const [kind, buildMaze] of [
        ['play', createLegacyMaze],
        ['menu', createLegacyGeneratedMenuMaze]
      ] as const) {
        const maze = buildMaze(scale, scale, seed);
        expect(
          auditBorderFeederSides(maze).adjacentBorderFloors,
          `${kind} scale ${scale} seed ${seed}`
        ).toEqual([]);
      }
    }
  }, 20_000);

  test('keeps play and generated-menu topology meaningful across shortcut-enabled scale bands', () => {
    const scales = [37, 50, 75];
    const seeds = [1, 2, 3, 4, 5, 8, 10, 12, 13, 21, 34, 55, 89, 144, 233];
    const failures: unknown[] = [];

    for (const scale of scales) {
      for (const seed of seeds) {
        for (const [kind, buildMaze] of [
          ['play', createLegacyMaze],
          ['menu', createLegacyGeneratedMenuMaze]
        ] as const) {
          const maze = buildMaze(scale, scale, seed);
          const routeQualityStats = maze.routeQualityStats;
          const minimumSolutionPathLength = Math.floor(((maze.width + maze.height) / 2) * LEGACY_WRAPPED_ROUTE_MINIMUM_SCALE);
          const detachedFloorTiles = countDetachedFloorTiles(maze);
          const borderContinuity = auditBorderFloorContinuity(maze);
          const oppositeBorderAxes = auditOppositeBorderAxes(maze);
          const borderFeederSides = auditBorderFeederSides(maze);

          if (
            detachedFloorTiles !== 0
            || oppositeBorderAxes.horizontal < 1
            || oppositeBorderAxes.vertical < 1
            || borderFeederSides.left < 2
            || borderFeederSides.right < 2
            || borderFeederSides.top < 2
            || borderFeederSides.bottom < 2
            || borderFeederSides.adjacentBorderFloors.length > 0
            || borderFeederSides.reservedBorderFloors.length > 0
            || borderContinuity.borderFloorCount < 2
            || borderContinuity.floorRatio < 0.28
            || borderContinuity.floorRatio > 0.62
            || borderContinuity.unpairedBorderBleeds.length > 0
            || borderContinuity.borderFloorsWithoutInwardConnection.length > 0
            || maze.solutionPath.length < minimumSolutionPathLength
            || routeQualityStats?.routeQuality !== 'multi-route'
            || routeQualityStats.meaningfulBypassableSolutionEdges <= 1
            || routeQualityStats.meaningfulBypassableRouteBands <= 1
          ) {
            failures.push({
              borderFeederSides,
              borderContinuity,
              detachedFloorTiles,
              oppositeBorderAxes,
              kind,
              minimumSolutionPathLength,
              playableTopologyStats: maze.playableTopologyStats,
              routeQualityStats,
              scale,
              seed,
              shortcutStats: maze.shortcutStats,
              width: maze.width,
              height: maze.height,
              solutionPathLength: maze.solutionPath.length
            });
          }
        }
      }
    }

    expect(failures).toEqual([]);
  }, 30_000);

  test('keeps large generated topology meaningful without requiring extreme-scale verify cost', () => {
    const seeds = [1, 55, 233];
    const failures: unknown[] = [];

    for (const seed of seeds) {
      for (const [kind, buildMaze] of [
        ['play', createLegacyMaze],
        ['menu', createLegacyGeneratedMenuMaze]
      ] as const) {
        const maze = buildMaze(99, 99, seed);
        const routeQualityStats = maze.routeQualityStats;
        const minimumSolutionPathLength = Math.floor(((maze.width + maze.height) / 2) * LEGACY_WRAPPED_ROUTE_MINIMUM_SCALE);
        const detachedFloorTiles = countDetachedFloorTiles(maze);
        const borderContinuity = auditBorderFloorContinuity(maze);
        const oppositeBorderAxes = auditOppositeBorderAxes(maze);
        const borderFeederSides = auditBorderFeederSides(maze);

        if (
          detachedFloorTiles !== 0
          || oppositeBorderAxes.horizontal < 1
          || oppositeBorderAxes.vertical < 1
          || borderFeederSides.left < 2
          || borderFeederSides.right < 2
          || borderFeederSides.top < 2
          || borderFeederSides.bottom < 2
          || borderFeederSides.adjacentBorderFloors.length > 0
          || borderFeederSides.reservedBorderFloors.length > 0
          || borderContinuity.borderFloorCount < 2
          || borderContinuity.floorRatio < 0.28
          || borderContinuity.floorRatio > 0.62
          || borderContinuity.unpairedBorderBleeds.length > 0
          || borderContinuity.borderFloorsWithoutInwardConnection.length > 0
          || maze.solutionPath.length < minimumSolutionPathLength
          || routeQualityStats?.routeQuality !== 'multi-route'
          || routeQualityStats.meaningfulBypassableSolutionEdges <= 1
          || routeQualityStats.meaningfulBypassableRouteBands <= 1
        ) {
          failures.push({
            borderFeederSides,
            borderContinuity,
            detachedFloorTiles,
            oppositeBorderAxes,
            kind,
            minimumSolutionPathLength,
            playableTopologyStats: maze.playableTopologyStats,
            routeQualityStats,
            scale: 99,
            seed,
            shortcutStats: maze.shortcutStats,
            width: maze.width,
              height: maze.height,
            solutionPathLength: maze.solutionPath.length
          });
        }
      }
    }

    expect(failures).toEqual([]);
  }, 45_000);

  test('keeps one bounded extreme generated topology smoke in the proof spine', () => {
    const failures: unknown[] = [];

    for (const [kind, buildMaze] of [
      ['play', createLegacyMaze],
      ['menu', createLegacyGeneratedMenuMaze]
    ] as const) {
      const maze = buildMaze(149, 149, 55);
      const routeQualityStats = maze.routeQualityStats;
      const minimumSolutionPathLength = Math.floor(((maze.width + maze.height) / 2) * LEGACY_WRAPPED_ROUTE_MINIMUM_SCALE);
      const detachedFloorTiles = countDetachedFloorTiles(maze);
      const borderContinuity = auditBorderFloorContinuity(maze);
      const oppositeBorderAxes = auditOppositeBorderAxes(maze);
      const borderFeederSides = auditBorderFeederSides(maze);

      if (
        detachedFloorTiles !== 0
        || oppositeBorderAxes.horizontal < 1
        || oppositeBorderAxes.vertical < 1
        || borderFeederSides.left < 2
        || borderFeederSides.right < 2
        || borderFeederSides.top < 2
        || borderFeederSides.bottom < 2
        || borderFeederSides.adjacentBorderFloors.length > 0
        || borderFeederSides.reservedBorderFloors.length > 0
        || borderContinuity.borderFloorCount < 2
        || borderContinuity.floorRatio < 0.28
        || borderContinuity.floorRatio > 0.62
        || borderContinuity.unpairedBorderBleeds.length > 0
        || borderContinuity.borderFloorsWithoutInwardConnection.length > 0
        || maze.solutionPath.length < minimumSolutionPathLength
        || routeQualityStats?.routeQuality !== 'multi-route'
        || routeQualityStats.meaningfulBypassableSolutionEdges <= 1
        || routeQualityStats.meaningfulBypassableRouteBands <= 1
      ) {
        failures.push({
          borderFeederSides,
          borderContinuity,
          detachedFloorTiles,
          oppositeBorderAxes,
          kind,
          minimumSolutionPathLength,
          playableTopologyStats: maze.playableTopologyStats,
          routeQualityStats,
          scale: 149,
          seed: 55,
          shortcutStats: maze.shortcutStats,
          width: maze.width,
              height: maze.height,
          solutionPathLength: maze.solutionPath.length
        });
      }
    }

    expect(failures).toEqual([]);
  }, 60_000);
});
