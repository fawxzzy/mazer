import { describe, expect, test } from 'vitest';
import { createLegacyGeneratedMenuMaze, createLegacyMaze } from '../../src/legacy-runtime/legacyMaze';

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
  for (let y = 0; y < maze.size; y += 1) {
    for (let x = 0; x < maze.size; x += 1) {
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
  point.x === 0 || point.y === 0 || point.x === maze.size - 1 || point.y === maze.size - 1
);

const isCornerBorderPoint = (
  maze: ReturnType<typeof createLegacyMaze>,
  point: { x: number; y: number }
): boolean => (
  (point.x === 0 || point.x === maze.size - 1) && (point.y === 0 || point.y === maze.size - 1)
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
    return { x: maze.size - 1, y: point.y };
  }
  if (point.x === maze.size - 1) {
    return { x: 0, y: point.y };
  }
  if (point.y === 0) {
    return { x: point.x, y: maze.size - 1 };
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
  if (point.x === maze.size - 1) {
    return { x: maze.size - 2, y: point.y };
  }
  if (point.y === 0) {
    return { x: point.x, y: 1 };
  }
  return { x: point.x, y: maze.size - 2 };
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

  for (let y = 0; y < maze.size; y += 1) {
    for (let x = 0; x < maze.size; x += 1) {
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
    floorRatio: walkableFloorTiles / Math.max(1, maze.size * maze.size),
    unpairedBorderBleeds,
    borderFloorsWithoutInwardConnection
  };
};

const auditEndpointLayering = (
  maze: ReturnType<typeof createLegacyMaze>
): {
  borderEndpointCount: number;
  interiorEndpointCount: number;
  startOnBorder: boolean;
  goalOnBorder: boolean;
} => {
  const startOnBorder = isBorderPoint(maze, maze.start);
  const goalOnBorder = isBorderPoint(maze, maze.goal);

  return {
    borderEndpointCount: Number(startOnBorder) + Number(goalOnBorder),
    interiorEndpointCount: Number(!startOnBorder) + Number(!goalOnBorder),
    startOnBorder,
    goalOnBorder
  };
};

describe('legacy topology scale audit', () => {
  test('keeps play and generated-menu topology meaningful across shortcut-enabled scale bands', () => {
    const scales = [37, 50, 75];
    const seeds = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233];
    const failures: unknown[] = [];

    for (const scale of scales) {
      for (const seed of seeds) {
        for (const [kind, buildMaze] of [
          ['play', createLegacyMaze],
          ['menu', createLegacyGeneratedMenuMaze]
        ] as const) {
          const maze = buildMaze(scale, seed);
          const routeQualityStats = maze.routeQualityStats;
          const minimumSolutionPathLength = Math.floor(maze.size * 1.5);
          const detachedFloorTiles = countDetachedFloorTiles(maze);
          const borderContinuity = auditBorderFloorContinuity(maze);
          const endpointLayering = auditEndpointLayering(maze);

          if (
            detachedFloorTiles !== 0
            || endpointLayering.borderEndpointCount !== 1
            || endpointLayering.interiorEndpointCount !== 1
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
              borderContinuity,
              detachedFloorTiles,
              endpointLayering,
              kind,
              minimumSolutionPathLength,
              playableTopologyStats: maze.playableTopologyStats,
              routeQualityStats,
              scale,
              seed,
              shortcutStats: maze.shortcutStats,
              size: maze.size,
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
        const maze = buildMaze(99, seed);
        const routeQualityStats = maze.routeQualityStats;
        const minimumSolutionPathLength = Math.floor(maze.size * 1.5);
        const detachedFloorTiles = countDetachedFloorTiles(maze);
        const borderContinuity = auditBorderFloorContinuity(maze);
        const endpointLayering = auditEndpointLayering(maze);

        if (
          detachedFloorTiles !== 0
          || endpointLayering.borderEndpointCount !== 1
          || endpointLayering.interiorEndpointCount !== 1
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
            borderContinuity,
            detachedFloorTiles,
            endpointLayering,
            kind,
            minimumSolutionPathLength,
            playableTopologyStats: maze.playableTopologyStats,
            routeQualityStats,
            scale: 99,
            seed,
            shortcutStats: maze.shortcutStats,
            size: maze.size,
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
      const maze = buildMaze(149, 55);
      const routeQualityStats = maze.routeQualityStats;
      const minimumSolutionPathLength = Math.floor(maze.size * 1.5);
      const detachedFloorTiles = countDetachedFloorTiles(maze);
      const borderContinuity = auditBorderFloorContinuity(maze);
      const endpointLayering = auditEndpointLayering(maze);

      if (
        detachedFloorTiles !== 0
        || endpointLayering.borderEndpointCount !== 1
        || endpointLayering.interiorEndpointCount !== 1
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
          borderContinuity,
          detachedFloorTiles,
          endpointLayering,
          kind,
          minimumSolutionPathLength,
          playableTopologyStats: maze.playableTopologyStats,
          routeQualityStats,
          scale: 149,
          seed: 55,
          shortcutStats: maze.shortcutStats,
          size: maze.size,
          solutionPathLength: maze.solutionPath.length
        });
      }
    }

    expect(failures).toEqual([]);
  }, 60_000);
});
