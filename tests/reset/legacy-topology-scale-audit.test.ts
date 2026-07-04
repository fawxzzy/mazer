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

          if (
            detachedFloorTiles !== 0
            || maze.solutionPath.length < minimumSolutionPathLength
            || routeQualityStats?.routeQuality !== 'multi-route'
            || routeQualityStats.meaningfulBypassableSolutionEdges <= 1
            || routeQualityStats.meaningfulBypassableRouteBands <= 1
          ) {
            failures.push({
              detachedFloorTiles,
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

        if (
          detachedFloorTiles !== 0
          || maze.solutionPath.length < minimumSolutionPathLength
          || routeQualityStats?.routeQuality !== 'multi-route'
          || routeQualityStats.meaningfulBypassableSolutionEdges <= 1
          || routeQualityStats.meaningfulBypassableRouteBands <= 1
        ) {
          failures.push({
            detachedFloorTiles,
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

      if (
        detachedFloorTiles !== 0
        || maze.solutionPath.length < minimumSolutionPathLength
        || routeQualityStats?.routeQuality !== 'multi-route'
        || routeQualityStats.meaningfulBypassableSolutionEdges <= 1
        || routeQualityStats.meaningfulBypassableRouteBands <= 1
      ) {
        failures.push({
          detachedFloorTiles,
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
