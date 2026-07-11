import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, MAIN_MENU_BUTTONS, linearColorToHex } from '../../src/legacy-runtime/legacyDefaults';
import {
  createLegacyGeneratedMenuMaze,
  createLegacyMaze,
  createLegacyMenuMaze,
  isLegacyWrappedStepTransition
} from '../../src/legacy-runtime/legacyMaze';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig,
  LEGACY_MENU_SNAPSHOT_CADENCE,
  createLegacyMenuSnapshotDemoWalkerConfig,
  resolveLegacyPointFromDemoIndex,
  resolveLegacyTrailFromDemoSteps
} from '../../src/legacy-runtime/legacyDemoWalker';
import { collectDemoWalkerTelemetry, createDemoWalkerState } from '../../src/domain/ai';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const resolveLegacyUnrealSource = (...segments: string[]): string => {
  const legacyRoot = [
    resolve(process.cwd(), '..', '..', 'tmp', 'mazer-legacy-unreal-restore'),
    resolve(process.cwd(), '..', '..', '..', 'tmp', 'mazer-legacy-unreal-restore')
  ].find((candidate) => existsSync(candidate));

  if (!legacyRoot) {
    throw new Error('Missing local mazer-legacy-unreal-restore fixture.');
  }

  return resolve(legacyRoot, ...segments);
};

const countLegacyShortcutBridgeFloors = (maze: ReturnType<typeof createLegacyMaze>): number => {
  let bridges = 0;

  for (let y = 1; y < maze.size - 1; y += 1) {
    for (let x = 1; x < maze.size - 1; x += 1) {
      if (maze.grid[y]?.[x] !== true) {
        continue;
      }

      const top = maze.grid[y - 1]?.[x];
      const bottom = maze.grid[y + 1]?.[x];
      const left = maze.grid[y]?.[x - 1];
      const right = maze.grid[y]?.[x + 1];
      const verticalWalls = top === false && bottom === false;
      const horizontalWalls = left === false && right === false;
      const horizontalPaths = left === true && right === true;
      const verticalPaths = top === true && bottom === true;
      if ((verticalWalls && horizontalPaths) || (horizontalWalls && verticalPaths)) {
        bridges += 1;
      }
    }
  }

  return bridges;
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
  for (let y = 0; y < maze.size; y += 1) {
    for (let x = 0; x < maze.size; x += 1) {
      if (maze.grid[y]?.[x] === true && !visited.has(`${x},${y}`)) {
        detached += 1;
      }
    }
  }

  return detached;
};

const isEndpointOnMazeBorder = (
  maze: ReturnType<typeof createLegacyMaze>,
  point: { x: number; y: number }
): boolean => (
  point.x === 0 || point.y === 0 || point.x === maze.size - 1 || point.y === maze.size - 1
);

const isNonCornerBorderFloor = (
  maze: ReturnType<typeof createLegacyMaze>,
  point: { x: number; y: number }
): boolean => (
  maze.grid[point.y]?.[point.x] === true
  && isEndpointOnMazeBorder(maze, point)
  && !((point.x === 0 || point.x === maze.size - 1) && (point.y === 0 || point.y === maze.size - 1))
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

const collectUnpairedBorderFloorBleeds = (
  maze: ReturnType<typeof createLegacyMaze>
): Array<{ point: { x: number; y: number }; opposite: { x: number; y: number } | null }> => {
  const failures: Array<{ point: { x: number; y: number }; opposite: { x: number; y: number } | null }> = [];

  for (let y = 0; y < maze.size; y += 1) {
    for (let x = 0; x < maze.size; x += 1) {
      const point = { x, y };
      if (!isNonCornerBorderFloor(maze, point)) {
        continue;
      }

      const opposite = resolveOppositeBorderPoint(maze, point);
      if (!opposite || maze.grid[opposite.y]?.[opposite.x] !== true) {
        failures.push({ point, opposite });
      }
    }
  }

  return failures;
};

const collectOppositeBorderAxisConnections = (
  maze: ReturnType<typeof createLegacyMaze>
): { horizontal: number; vertical: number } => {
  let horizontal = 0;
  let vertical = 0;

  for (let y = 1; y < maze.size - 1; y += 1) {
    if (maze.grid[y]?.[0] === true && maze.grid[y]?.[maze.size - 1] === true) {
      horizontal += 1;
    }
  }

  for (let x = 1; x < maze.size - 1; x += 1) {
    if (maze.grid[0]?.[x] === true && maze.grid[maze.size - 1]?.[x] === true) {
      vertical += 1;
    }
  }

  return { horizontal, vertical };
};

const DEFAULT_ROUTE_QUALITY_AUDIT_SEEDS = [
  ...Array.from({ length: 64 }, (_, index) => index + 1),
  89,
  144,
  233,
  3749,
  777,
  1001,
  0x5a17f00d
];

const LEGACY_WRAPPED_ROUTE_MINIMUM_SCALE = 1.4;

const expectScaledMenuTile = (
  maze: ReturnType<typeof createLegacyMenuMaze>,
  sourceX: number,
  sourceY: number
): void => {
  expect(maze.grid[sourceY * 2]?.[sourceX * 2]).toBe(true);
};

describe('legacy reset lane', () => {
  test('keeps the active front-door button set focused on play and options', () => {
    expect(MAIN_MENU_BUTTONS).toEqual(['Start', 'Options']);
  });

  test('removes the front-door Exit button and browser quit equivalence path', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const legacyOverlayRoutingSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayRouting.ts'), 'utf8');

    expect(menuSceneSource).not.toContain("() => this.performLegacyExit()");
    expect(menuSceneSource).not.toContain('private performLegacyExit(): void {');
    expect(menuSceneSource).not.toContain('performLegacyBrowserSafeExit');
    expect(menuSceneSource).not.toContain("case 'message':");
    expect(legacyOverlayRoutingSource).not.toContain("'message'");
  });

  test('preserves legacy default settings', () => {
    expect(LEGACY_DEFAULTS.scale).toBe(50);
    expect(LEGACY_DEFAULTS.camScale).toBe(0);
    expect(LEGACY_DEFAULTS.movementSpeed).toBe(0.3);
    expect(linearColorToHex(LEGACY_DEFAULTS.pathColor)).toBe('#797978');
    expect(linearColorToHex(LEGACY_DEFAULTS.wallColor)).toBe('#4a4a4a');
    expect(LEGACY_DEFAULTS.toggleTrailPulse).toBe(true);
    expect(LEGACY_DEFAULTS.darkMode).toBe(true);
    expect(LEGACY_DEFAULTS.toggleAnimatedBackdrop).toBe(true);
  });

  test('builds a solvable legacy maze snapshot', () => {
    const maze = createLegacyMaze(50, 0x5a17f00d);

    expect(maze.size).toBeGreaterThanOrEqual(25);
    expect(maze.solutionPath.length).toBeGreaterThan(2);
    expect(maze.start).not.toEqual(maze.goal);
    expect(maze.pathBuilderStats).toMatchObject({
      topology: 'legacy-checkpoint-path-builder',
      requestedCheckpoints: Math.trunc(maze.size + (maze.size * 0.35)),
      exhaustedCheckpoints: true
    });
    expect(maze.pathBuilderStats?.acceptedCheckpoints).toBeGreaterThan(0);
    expect(maze.pathBuilderStats?.pathTiles).toBeGreaterThan(maze.solutionPath.length);
    expect(maze.pathBuilderStats?.wallArrayEntries).toBeGreaterThan(0);

    const firstStep = maze.solutionPath[0];
    const lastStep = maze.solutionPath.at(-1);

    expect(firstStep).toEqual(maze.start);
    expect(lastStep).toEqual(maze.goal);
  });

  test('classifies opposite-edge neighbor transitions as wrapped steps for visual snapping', () => {
    expect(isLegacyWrappedStepTransition({ x: 0, y: 12 }, { x: 49, y: 12 })).toBe(true);
    expect(isLegacyWrappedStepTransition({ x: 27, y: 49 }, { x: 27, y: 0 })).toBe(true);
    expect(isLegacyWrappedStepTransition({ x: 12, y: 12 }, { x: 13, y: 12 })).toBe(false);
    expect(isLegacyWrappedStepTransition({ x: 12, y: 12 }, { x: 12, y: 13 })).toBe(false);
  });

  test('normalizes generated play mazes into one playable floor component', () => {
    for (const seed of [3749, 0x5a17f00d, 2, 777, 1001]) {
      const maze = createLegacyMaze(50, seed);
      const borderAxisConnections = collectOppositeBorderAxisConnections(maze);

      expect(countDetachedFloorTiles(maze)).toBe(0);
      expect(collectUnpairedBorderFloorBleeds(maze)).toEqual([]);
      expect(borderAxisConnections.horizontal).toBeGreaterThanOrEqual(1);
      expect(borderAxisConnections.vertical).toBeGreaterThanOrEqual(1);
      expect(maze.solutionPath.length).toBeGreaterThanOrEqual(Math.floor(maze.size * 1.5));
      expect(maze.playableTopologyStats?.reachableFloors).toBeGreaterThan(maze.solutionPath.length);
      expect(maze.playableTopologyStats?.disconnectedFloorTilesPruned).toBeGreaterThan(0);
      expect(maze.playableTopologyStats?.disconnectedComponentsPruned).toBeGreaterThan(0);
      expect(maze.routeQualityStats?.sampledSolutionEdges).toBe(maze.solutionPath.length - 1);
    }
  });

  test('rebases weak generated goals without replacing already playable routes', () => {
    const weakGoalMaze = createLegacyMaze(50, 777);
    const playableGoalMaze = createLegacyMaze(50, 0x5a17f00d);

    expect(weakGoalMaze.playableTopologyStats?.goalRebasedToFarthestReachableFloor).toBe(true);
    expect(weakGoalMaze.playableTopologyStats?.originalGoalDistance).toBeLessThan(weakGoalMaze.playableTopologyStats?.resolvedGoalDistance ?? 0);
    expect(playableGoalMaze.playableTopologyStats?.goalRebasedToFarthestReachableFloor).toBe(false);
  });

  test('applies legacy shortcut bridge openings to generated play mazes', () => {
    const maze = createLegacyMaze(50, 0x5a17f00d, 9);

    expect(maze.shortcutsCreated).toBeGreaterThan(0);
    expect(maze.shortcutsCreated).toBeLessThanOrEqual(9);
    expect(maze.shortcutStats?.requested).toBe(9);
    expect(maze.shortcutStats?.created).toBe(maze.shortcutsCreated);
    expect(maze.shortcutStats?.attempts).toBeGreaterThanOrEqual(maze.shortcutsCreated ?? 0);
    expect(maze.shortcutStats?.wallArrayEntries).toBeGreaterThan(maze.shortcutStats?.uniqueWallCandidates ?? 0);
    expect(countLegacyShortcutBridgeFloors(maze)).toBeGreaterThan(0);
    expect(maze.routeQualityStats).toMatchObject({
      routeQuality: 'multi-route',
      sampledSolutionEdges: maze.solutionPath.length - 1
    });
    expect(maze.routeQualityStats?.bypassableSolutionEdges).toBeGreaterThan(0);
    expect(maze.routeQualityStats?.bypassableRouteBands).toBeGreaterThan(0);
    expect(maze.routeQualityStats?.meaningfulBypassableSolutionEdges).toBeGreaterThan(1);
    expect(maze.routeQualityStats?.meaningfulBypassableRouteBands).toBeGreaterThan(1);
    expect(maze.routeQualityStats?.minimumMeaningfulDetour).toBeGreaterThanOrEqual(2);
  });

  test('keeps default generated play mazes connected with meaningful alternate routes across seed families', () => {
    const failures: unknown[] = [];

    for (const seed of DEFAULT_ROUTE_QUALITY_AUDIT_SEEDS) {
      const maze = createLegacyMaze(50, seed);

      expect(maze.source).toBe('play-generated');
      expect(countDetachedFloorTiles(maze)).toBe(0);
      const unpairedBorderBleeds = collectUnpairedBorderFloorBleeds(maze);
      const borderAxisConnections = collectOppositeBorderAxisConnections(maze);
      const minimumSolutionPathLength = Math.floor(maze.size * LEGACY_WRAPPED_ROUTE_MINIMUM_SCALE);
      if (
        borderAxisConnections.horizontal < 1
        || borderAxisConnections.vertical < 1
        || unpairedBorderBleeds.length > 0
        || maze.solutionPath[0]?.x !== maze.start.x
        || maze.solutionPath[0]?.y !== maze.start.y
        || maze.solutionPath.at(-1)?.x !== maze.goal.x
        || maze.solutionPath.at(-1)?.y !== maze.goal.y
        || maze.grid[maze.start.y]?.[maze.start.x] !== true
        || maze.grid[maze.goal.y]?.[maze.goal.x] !== true
        || maze.playableTopologyStats?.resolvedGoalDistance !== maze.solutionPath.length - 1
        || (maze.playableTopologyStats?.reachableFloors ?? 0) <= maze.solutionPath.length
        || maze.solutionPath.length < minimumSolutionPathLength
        || maze.routeQualityStats?.routeQuality !== 'multi-route'
        || maze.routeQualityStats.meaningfulBypassableSolutionEdges <= 1
        || maze.routeQualityStats.meaningfulBypassableRouteBands <= 1
      ) {
        failures.push({
          seed,
          minimumSolutionPathLength,
          playableTopologyStats: maze.playableTopologyStats,
          routeQualityStats: maze.routeQualityStats,
          shortcutStats: maze.shortcutStats,
          unpairedBorderBleeds,
          borderAxisConnections,
          solutionPathLength: maze.solutionPath.length
        });
      }
    }

    expect(failures).toEqual([]);
  }, 20_000);

  test('keeps default generated menu mazes connected with meaningful alternate routes across seed families', () => {
    const failures: unknown[] = [];

    for (const seed of DEFAULT_ROUTE_QUALITY_AUDIT_SEEDS) {
      const maze = createLegacyGeneratedMenuMaze(50, seed);

      expect(maze.source).toBe('menu-generated');
      expect(countDetachedFloorTiles(maze)).toBe(0);
      const unpairedBorderBleeds = collectUnpairedBorderFloorBleeds(maze);
      const borderAxisConnections = collectOppositeBorderAxisConnections(maze);
      const minimumSolutionPathLength = Math.floor(maze.size * LEGACY_WRAPPED_ROUTE_MINIMUM_SCALE);
      if (
        borderAxisConnections.horizontal < 1
        || borderAxisConnections.vertical < 1
        || unpairedBorderBleeds.length > 0
        || maze.solutionPath[0]?.x !== maze.start.x
        || maze.solutionPath[0]?.y !== maze.start.y
        || maze.solutionPath.at(-1)?.x !== maze.goal.x
        || maze.solutionPath.at(-1)?.y !== maze.goal.y
        || maze.grid[maze.start.y]?.[maze.start.x] !== true
        || maze.grid[maze.goal.y]?.[maze.goal.x] !== true
        || maze.playableTopologyStats?.resolvedGoalDistance !== maze.solutionPath.length - 1
        || (maze.playableTopologyStats?.reachableFloors ?? 0) <= maze.solutionPath.length
        || maze.solutionPath.length < minimumSolutionPathLength
        || maze.routeQualityStats?.routeQuality !== 'multi-route'
        || maze.routeQualityStats.meaningfulBypassableSolutionEdges <= 1
        || maze.routeQualityStats.meaningfulBypassableRouteBands <= 1
      ) {
        failures.push({
          seed,
          minimumSolutionPathLength,
          playableTopologyStats: maze.playableTopologyStats,
          routeQualityStats: maze.routeQualityStats,
          shortcutStats: maze.shortcutStats,
          unpairedBorderBleeds,
          borderAxisConnections,
          solutionPathLength: maze.solutionPath.length
        });
      }
    }

    expect(failures).toEqual([]);
  }, 20_000);

  test('pairs generated edge-dock paths with exact opposite border continuations on both axes', () => {
    const factories = [
      { label: 'play', create: createLegacyMaze },
      { label: 'menu', create: createLegacyGeneratedMenuMaze }
    ] as const;

    for (const factory of factories) {
      for (const seed of [3749, 0x5a17f00d, 2, 777, 1001, 1, 3, 4, 5, 6]) {
        const maze = factory.create(50, seed);
        const borderAxisConnections = collectOppositeBorderAxisConnections(maze);

        expect(collectUnpairedBorderFloorBleeds(maze), `${factory.label}:${seed}`).toEqual([]);
        expect(borderAxisConnections.horizontal, `${factory.label}:${seed}`).toBeGreaterThanOrEqual(1);
        expect(borderAxisConnections.vertical, `${factory.label}:${seed}`).toBeGreaterThanOrEqual(1);
        expect(countDetachedFloorTiles(maze), `${factory.label}:${seed}`).toBe(0);
      }
    }
  });

  test('reinforces weak shortcut outcomes without disconnecting generated play mazes', () => {
    let reinforcedMaze: ReturnType<typeof createLegacyMaze> | null = null;

    for (let seed = 1; seed <= 128; seed += 1) {
      const maze = createLegacyMaze(50, seed, 3);
      if ((maze.shortcutStats?.qualityReinforcementCreated ?? 0) > 0) {
        reinforcedMaze = maze;
        break;
      }
    }

    expect(reinforcedMaze).not.toBeNull();
    expect(reinforcedMaze?.routeQualityStats?.routeQuality).toBe('multi-route');
    expect(reinforcedMaze?.routeQualityStats?.meaningfulBypassableSolutionEdges).toBeGreaterThan(1);
    expect(reinforcedMaze?.routeQualityStats?.meaningfulBypassableRouteBands).toBeGreaterThan(1);
    expect(reinforcedMaze?.shortcutStats?.qualityReinforcementCreated).toBeGreaterThan(0);
    expect(countDetachedFloorTiles(reinforcedMaze!)).toBe(0);
  });

  test('resumes from the next tile selected during legacy backtracking', () => {
    const legacyMazeSource = readFileSync(
      resolveLegacyUnrealSource('Source', 'Mazer', 'MazerGameModeBase.cpp'),
      'utf8'
    );
    const webMazeSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMaze.ts'), 'utf8');

    expect(legacyMazeSource).toContain('PotentialTile = FindNextTile(PotentialPathArray[randTile], MazerGameInstance->_Checkpoint.GridTileInfo.GridTile);');
    expect(legacyMazeSource).toContain('PotentialTile = FindNextTile(PotentialPathArray[i], MazerGameInstance->_Checkpoint.GridTileInfo.GridTile);');
    expect(webMazeSource).toContain('return findLegacyNextTile(size, pathMask, candidate, checkpoint, start, true, rng);');
    expect(webMazeSource).toContain('const next = findLegacyNextTile(size, pathMask, candidate, checkpoint, start, true, rng);');
    expect(webMazeSource).toContain('return next;');
    expect(webMazeSource).toContain('pathLengths.get(keyForPoint(current)) ?? 0');
  });

  test('keeps shortcut-disabled generated mazes free of shortcut openings', () => {
    const maze = createLegacyMaze(25, 0x5a17f00d, 9);

    expect(maze.shortcutsCreated).toBe(0);
    expect(maze.shortcutStats).toEqual({
      requested: 0,
      attempts: 0,
      wallArrayEntries: 0,
      uniqueWallCandidates: 0,
      created: 0,
      exhaustedWallArray: false
    });
  });

  test('uses a fixed legacy-shaped menu maze snapshot for the front door', () => {
    const menuMaze = createLegacyMenuMaze(3749);

    expect(menuMaze.size).toBe(49);
    expect(menuMaze.start).toEqual({ x: 6, y: 8 });
    expect(menuMaze.goal).toEqual({ x: 44, y: 44 });
    expect(menuMaze.solutionPath[0]).toEqual(menuMaze.start);
    expect(menuMaze.solutionPath.at(-1)).toEqual(menuMaze.goal);
    expectScaledMenuTile(menuMaze, 22, 13);
    expectScaledMenuTile(menuMaze, 20, 21);
    expectScaledMenuTile(menuMaze, 12, 11);
    expectScaledMenuTile(menuMaze, 13, 19);
    expectScaledMenuTile(menuMaze, 23, 20);
    expectScaledMenuTile(menuMaze, 19, 3);
    expectScaledMenuTile(menuMaze, 4, 9);
    expectScaledMenuTile(menuMaze, 17, 14);
    expectScaledMenuTile(menuMaze, 12, 20);
    expectScaledMenuTile(menuMaze, 22, 19);
    expectScaledMenuTile(menuMaze, 18, 4);
    expectScaledMenuTile(menuMaze, 6, 16);
    expectScaledMenuTile(menuMaze, 18, 22);
    expectScaledMenuTile(menuMaze, 21, 11);
    expectScaledMenuTile(menuMaze, 23, 11);
    expectScaledMenuTile(menuMaze, 7, 4);
    expectScaledMenuTile(menuMaze, 5, 8);
    expectScaledMenuTile(menuMaze, 19, 7);
    expectScaledMenuTile(menuMaze, 17, 11);
    expectScaledMenuTile(menuMaze, 14, 11);
    expectScaledMenuTile(menuMaze, 11, 12);
    expectScaledMenuTile(menuMaze, 18, 13);
    expectScaledMenuTile(menuMaze, 13, 8);
    expectScaledMenuTile(menuMaze, 15, 8);
    expectScaledMenuTile(menuMaze, 4, 13);
    expectScaledMenuTile(menuMaze, 8, 15);
    expectScaledMenuTile(menuMaze, 13, 12);
    expectScaledMenuTile(menuMaze, 15, 21);
    expectScaledMenuTile(menuMaze, 23, 15);
    expectScaledMenuTile(menuMaze, 10, 8);
    expectScaledMenuTile(menuMaze, 8, 10);
    expectScaledMenuTile(menuMaze, 8, 5);
    expectScaledMenuTile(menuMaze, 9, 6);
    expectScaledMenuTile(menuMaze, 10, 6);
    expectScaledMenuTile(menuMaze, 17, 6);
    expectScaledMenuTile(menuMaze, 9, 7);
    expectScaledMenuTile(menuMaze, 13, 11);
    expectScaledMenuTile(menuMaze, 2, 3);
    expectScaledMenuTile(menuMaze, 24, 6);
    expectScaledMenuTile(menuMaze, 24, 12);
    expectScaledMenuTile(menuMaze, 20, 18);
    expectScaledMenuTile(menuMaze, 19, 20);
    expectScaledMenuTile(menuMaze, 23, 16);
    expectScaledMenuTile(menuMaze, 22, 11);
    expectScaledMenuTile(menuMaze, 3, 16);
    expectScaledMenuTile(menuMaze, 5, 18);
    expectScaledMenuTile(menuMaze, 8, 18);
    expectScaledMenuTile(menuMaze, 4, 20);
    expectScaledMenuTile(menuMaze, 8, 20);
    expectScaledMenuTile(menuMaze, 22, 4);
    expectScaledMenuTile(menuMaze, 23, 8);
    expectScaledMenuTile(menuMaze, 22, 10);
  });

  test('adapts generated legacy maze snapshots into the clean menu demo walker lane', () => {
    const maze = createLegacyMaze(50, 3749);
    const episode = createLegacyDemoWalkerEpisode(maze);
    const config = createLegacyMenuDemoWalkerConfig(maze.seed);
    const state = createDemoWalkerState(episode, config);
    const telemetry = collectDemoWalkerTelemetry(episode, config);

    expect(episode.raster.startIndex).toBe((maze.start.y * maze.size) + maze.start.x);
    expect(episode.raster.endIndex).toBe((maze.goal.y * maze.size) + maze.goal.x);
    expect(Array.from(episode.raster.pathIndices).at(0)).toBe(episode.raster.startIndex);
    expect(Array.from(episode.raster.pathIndices).at(-1)).toBe(episode.raster.endIndex);
    expect(config.behavior.enableRunnerMistakes).toBe(true);
    expect(config.behavior.runnerThinkingModel).toBe('human-local-memory');
    expect(config.behavior.emulateLogicSwitchPotentialCheckBug).toBe(false);
    expect(telemetry.backtrackCount).toBeGreaterThanOrEqual(0);
    expect(episode.shortcutsCreated).toBe(maze.shortcutsCreated);
    expect(resolveLegacyPointFromDemoIndex(state.currentIndex, episode.raster.width)).toEqual(maze.start);
    expect(resolveLegacyTrailFromDemoSteps(state.trailSteps, episode.raster.width)).toEqual([maze.start]);
  });

  test('uses human local-memory AI config for the fixed legacy menu snapshot', () => {
    const snapshotConfig = createLegacyMenuSnapshotDemoWalkerConfig(3749);
    const genericConfig = createLegacyMenuDemoWalkerConfig(3749);

    expect(snapshotConfig.behavior.enableRunnerMistakes).toBe(true);
    expect(snapshotConfig.behavior.runnerThinkingModel).toBe('human-local-memory');
    expect(snapshotConfig.behavior.prerollSteps).toBe(0);
    expect(snapshotConfig.cadence.exploreStepMs).toBe(LEGACY_MENU_SNAPSHOT_CADENCE.exploreStepMs);
    expect(snapshotConfig.cadence.backtrackStepMs).toBe(LEGACY_MENU_SNAPSHOT_CADENCE.backtrackStepMs);
    expect(snapshotConfig.cadence.goalHoldMs).toBe(0);
    expect(snapshotConfig.cadence.resetHoldMs).toBe(0);
    expect(genericConfig.behavior.enableRunnerMistakes).toBe(true);
    expect(genericConfig.behavior.runnerThinkingModel).toBe('human-local-memory');
    expect(genericConfig.behavior.emulateLogicSwitchPotentialCheckBug).toBe(false);
    expect(genericConfig.behavior.prerollSteps).toBe(0);
    expect(snapshotConfig.behavior.emulateLogicSwitchPotentialCheckBug).toBe(false);
    expect(genericConfig.cadence.exploreStepMs).not.toBe(snapshotConfig.cadence.exploreStepMs);
  });

  test('keeps the active-play HUD minimal and legacy-shaped', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const legacyPlayHudSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyPlayHud.ts'), 'utf8');
    const demoLifecycleSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMenuDemoLifecycle.ts'), 'utf8');

    expect(menuSceneSource).toContain('resolveLegacyPlayHudFrame({');
    expect(menuSceneSource).toContain('timerText: this.hudFrame?.timerText ?? null');
    expect(menuSceneSource).toContain('arrowAngleDegrees: this.hudFrame?.arrowAngleDegrees ?? null');
    expect(menuSceneSource).toContain('arrowAngleRadians: this.hudFrame?.arrowAngleRadians ?? null');
    expect(menuSceneSource).toContain('compassSpinActive: this.hudCompassSpinActive');
    expect(menuSceneSource).toContain('compassVisualAngleRadians: this.hudCompassVisualAngleRadians');
    expect(legacyPlayHudSource).toContain('const timerText = formatLegacyHudClock(input.elapsedMs);');
    expect(legacyPlayHudSource).toContain('Math.atan2(goalScreen.y - playerScreen.y, goalScreen.x - playerScreen.x)');
    expect(legacyPlayHudSource).toContain('resolveLegacyCompassSpinFrame');
    expect(legacyPlayHudSource).toContain('const minutes = Math.floor(totalSeconds / 60) % 10;');
    expect(legacyPlayHudSource).toContain('const arrowAngleDegrees = (arrowAngleRadians * 180) / Math.PI;');
    expect(menuSceneSource).not.toContain('WASD or arrows to move   P to pause');
    expect(legacyPlayHudSource).toContain('const compassBounds = input.compassBounds');
    expect(legacyPlayHudSource).toContain(': createLegacyHudRect(input.layoutWidth - 56, 8, 44, 44);');
    expect(legacyPlayHudSource).toContain('x: compassBounds.centerX');
    expect(legacyPlayHudSource).toContain('y: compassBounds.centerY');
    expect(legacyPlayHudSource).toContain('const length = 14;');
    expect(legacyPlayHudSource).toContain('const timerBounds = createLegacyHudRect(Math.round((input.layoutWidth - 112) / 2), 10, 112, 38);');
    expect(menuSceneSource).toContain('this.drawLegacyCyberPanel(this.hudGraphics, {');
    expect(menuSceneSource).toContain('timerText: this.hudFrame?.timerText ?? null');
    expect(menuSceneSource).not.toContain('hudFrame.timerBounds.centerX + 1');
    expect(menuSceneSource).not.toContain('timerShadow.setAlpha(0.7);');
    expect(menuSceneSource).toContain('this.hudTouchControlBounds = this.drawLegacyPlayTouchControls(touchControlLayout);');
    expect(menuSceneSource).toContain('this.startLegacyPlayCompassSpin(this.time.now);');
    expect(menuSceneSource).toContain('private resolveLegacyPlayCompassVisualFrame(');
    expect(menuSceneSource).toContain('this.hudBounds = touchCompassBounds');
    expect(menuSceneSource).toContain(': mergeVisualRects(this.hudTimerBounds, this.hudArrowBounds);');
    expect(menuSceneSource).toContain('private drawLegacyPlayCompass(hudFrame: LegacyPlayHudFrame, options: { showPane: boolean } = { showPane: true }): void');
    expect(menuSceneSource).toContain("showPane: touchControlLayout.controlMode !== 'stick'");
    expect(menuSceneSource).not.toContain('fillRoundedRect(20, 18, 184, 44, 8)');
    expect(menuSceneSource).toContain('this.schedulePlayResetReturn();');
    expect(menuSceneSource).toContain('private playMoveFlags: LegacyPlayMoveFlags = createLegacyPlayMoveFlags();');
    expect(menuSceneSource).toContain('private playMoveTimer: Phaser.Time.TimerEvent | null = null;');
    expect(menuSceneSource).toContain('LEGACY_SIMULTANEOUS_KEY_PRESS_DELAY_MS');
    expect(menuSceneSource).toContain('this.handleLegacyPlayMovementKeyDown(event)');
    expect(menuSceneSource).toContain("this.input.keyboard?.on('keyup'");
    expect(menuSceneSource).toContain('event.preventDefault();');
    expect(menuSceneSource).toContain('resolveLegacyPlayMoveVector(this.playMoveFlags)');
    expect(menuSceneSource).toContain('this.resetLegacyPlayInputBuffer();');
    expect(menuSceneSource).toContain('this.installLegacyPlayFocusGuards();');
    expect(menuSceneSource).toContain('this.detachLegacyPlayFocusGuards();');
    expect(menuSceneSource).toContain("window.addEventListener('blur', this.legacyPlayWindowBlurHandler);");
    expect(menuSceneSource).toContain("window.removeEventListener('blur', this.legacyPlayWindowBlurHandler);");
    expect(menuSceneSource).toContain("document.addEventListener('visibilitychange', this.legacyPlayVisibilityChangeHandler);");
    expect(menuSceneSource).toContain('private handleLegacyPlayInputFocusLoss(): void {');
    expect(menuSceneSource).toContain('createLegacyMenuDemoBootstrap(this.maze, this.settings.toggleTrailFade, TRAIL_FADE_TAIL)');
    expect(menuSceneSource).toContain('advanceLegacyMenuDemoFrame(');
    expect(demoLifecycleSource).toContain('createLegacyMenuSnapshotDemoWalkerConfig(maze.seed)');
    expect(demoLifecycleSource).toContain('createLegacyMenuDemoWalkerConfig(maze.seed)');
    expect(demoLifecycleSource).toContain('advanceDemoWalker(episode, state, config)');
  });

  test('routes legacy process-8 reset branches through explicit reset requests', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const playLifecycleSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyPlayLifecycle.ts'), 'utf8');

    expect(playLifecycleSource).toContain('type LegacyResetAction =');
    expect(playLifecycleSource).toContain('createLegacyResetRequest');
    expect(playLifecycleSource).toContain('shouldConsumeLegacyResetRequest');
    expect(playLifecycleSource).not.toContain('shouldConsumeLegacyPlayResetReturn');
    expect(playLifecycleSource).not.toContain('hasPendingLegacyPlayResetReturn');
    expect(playLifecycleSource).not.toContain('scheduleLegacyPlayResetReturnAtMs');
    expect(menuSceneSource).toContain('private pendingResetRequest: LegacyResetRequest | null = null;');
    expect(menuSceneSource).not.toContain('playResetReturnAtMs');
    expect(menuSceneSource).toContain('if (pendingReset !== null && shouldConsumeLegacyResetRequest(pendingReset, time)) {');
    expect(menuSceneSource).toContain("this.pendingResetRequest = createLegacyResetRequest({");
    expect(menuSceneSource).toContain("mode: 'play',");
    expect(menuSceneSource).toContain("mode: 'menu',");
    expect(menuSceneSource).toContain("if (request.action === 'return-menu') {");
    expect(menuSceneSource).toContain('pendingAction: this.pendingResetRequest?.action ?? null,');
    expect(menuSceneSource).toContain('bypassesLevelBuildingDelay: this.pendingResetRequest?.entry.bypassesLevelBuildingDelay ?? null,');
  });

  test('keeps the menu backdrop in the denser screenshot-directed field lane', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('LEGACY_MENU_STAR_COUNT');
    expect(menuSceneSource).toContain('createLegacyMenuBackdropStars');
    expect(menuSceneSource).toContain('advanceLegacyMenuBackdropStars');
    expect(menuSceneSource).toContain('if (!this.settings.toggleAnimatedBackdrop) {');
    expect(menuSceneSource).toContain('animatedBackdropEnabled: this.settings.toggleAnimatedBackdrop');
    expect(menuSceneSource).toContain('backdropDirty: this.backdropDirty');
    expect(menuSceneSource).toContain('resolveLegacyMenuBackdropPalette');
    expect(menuSceneSource).toContain('resolveLegacyMenuBackdropShards');
    expect(menuSceneSource).not.toContain('this.backdropGraphics.fillCircle');
  });

  test('cleans up localhost service workers before booting Phaser', () => {
    const bootSource = readFileSync(resolve(process.cwd(), 'src/boot/main.ts'), 'utf8');
    const viteConfigSource = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(bootSource).toContain("const LOCALHOST_SW_RESET_KEY = 'mazer:localhost-sw-reset:v1';");
    expect(bootSource).toContain("const PRODUCTION_SW_UPDATE_RELOAD_KEY = 'mazer:production-sw-update-reload-at:v1';");
    expect(bootSource).toContain('const PRODUCTION_SW_UPDATE_RELOAD_WINDOW_MS = 10_000;');
    expect(bootSource).toContain("['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)");
    expect(bootSource).toContain('navigator.serviceWorker.getRegistrations()');
    expect(bootSource).toContain("cacheKey.includes('mazer')");
    expect(bootSource).toContain('window.location.reload();');
    expect(bootSource).toContain('const shouldReloadForProductionServiceWorkerUpdate = (nowMs: number): boolean => {');
    expect(bootSource).toContain('const registerProductionServiceWorker = (): void => {');
    expect(bootSource).toContain("if (isLocalhostRuntime() || !('serviceWorker' in navigator)) {");
    expect(bootSource).toContain("navigator.serviceWorker.addEventListener('controllerchange'");
    expect(bootSource).toContain("navigator.serviceWorker.register('/sw.js')");
    expect(bootSource).toContain('.then((registration) => registration.update())');
    expect(bootSource).toContain("markMazerBootStatus('boot-start');");
    expect(bootSource).toContain("markMazerBootStatus('game-created');");
    expect(viteConfigSource).toContain('injectRegister: false');
    expect(viteConfigSource).not.toContain("injectRegister: 'auto'");
  });

  test('routes generation and reset through explicit queued request contracts', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const generationLifecycleSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyGenerationLifecycle.ts'), 'utf8');

    expect(generationLifecycleSource).toContain("type LegacyGenerationRequestReason =");
    expect(generationLifecycleSource).toContain('createLegacyGenerationRequest');
    expect(generationLifecycleSource).toContain('createLegacyMenuResetGenerationRequest');
    expect(generationLifecycleSource).toContain('shouldConsumeLegacyGenerationRequest');
    expect(generationLifecycleSource).toContain('consumeLegacyGenerationRequest');
    expect(generationLifecycleSource).toContain('consumeLegacyGenerationRequestState');
    expect(generationLifecycleSource).toContain('resolveLegacyGenerationExecutionPlan');
    expect(generationLifecycleSource).toContain('resolveLegacyGenerationBudgetContract');
    expect(generationLifecycleSource).toContain('resolveLegacyGenerationStageCursor');
    expect(generationLifecycleSource).toContain('resolveLegacyGenerationTickGateContract');
    expect(generationLifecycleSource).toContain("completionSignal: 'grid-spawn-complete'");
    expect(generationLifecycleSource).toContain("completionSignal: 'checkpoint-budget-exhausted'");
    expect(generationLifecycleSource).toContain("completionSignal: 'shortcut-budget-exhausted'");
    expect(generationLifecycleSource).toContain('skipToStageIdWhenDisabled: stageId === 5 ? 6 : null');
    expect(generationLifecycleSource).toContain("executionKind: 'row-slice'");
    expect(generationLifecycleSource).toContain("executionKind: 'checkpoint-pass'");
    expect(generationLifecycleSource).toContain("executionKind: 'path-batch'");
    expect(generationLifecycleSource).toContain("executionKind: 'shortcut-attempt'");
    expect(generationLifecycleSource).toContain('const baseCheckpointCount = Math.trunc(normalizedScale + (normalizedScale * checkpointModifier))');
    expect(generationLifecycleSource).toContain('Math.trunc(baseCheckpointCount * profile.checkpointCountMultiplier)');
    expect(generationLifecycleSource).toContain('const formulaCount = Math.trunc(normalizedScale * shortcutCountModifier)');
    expect(generationLifecycleSource).toContain('const shortcutCount = clampInteger(');
    expect(generationLifecycleSource).toContain('entryStageId: LEGACY_GENERATION_ENTRY_STAGE_ID');
    expect(generationLifecycleSource).toContain('waitsForLevelBuildingDelay: true');
    expect(generationLifecycleSource).toContain('consumesWhileUninitialized: true');
    expect(generationLifecycleSource).toContain('requiresLevelBuildingStartTime: true');
    expect(generationLifecycleSource).toContain('requiresLevelBuildingDelayStartedFlag: true');
    expect(generationLifecycleSource).toContain("levelBuildingDelayDurationSource: LEGACY_LEVEL_BUILDING_DELAY_DURATION_SOURCE");
    expect(generationLifecycleSource).toContain('initializedResetBypassesDelayGate: true');
    expect(menuSceneSource).toContain("this.pendingGenerationRequest: LegacyGenerationRequest | null = null;".replace('this.', 'private '));
    expect(menuSceneSource).toContain('const nextRequest = this.pendingGenerationRequest;');
    expect(menuSceneSource).toContain('&& shouldConsumeLegacyGenerationRequest(nextRequest, time)');
    expect(menuSceneSource).toContain('const generationState = consumeLegacyGenerationRequestState(request, request.budget.scale);');
    expect(menuSceneSource).toContain("scale: this.resolveLegacyProgressionScaleForMode('menu')");
    expect(menuSceneSource).toContain('scale: this.resolveLegacyProgressionScaleForMode(mode)');
    expect(menuSceneSource).toContain('if (generationState.startsPlayTimer) {');
    expect(menuSceneSource).toContain('this.playStartedAtMs = Math.max(this.time.now, this.resolveLegacyMenuStaticDrawDemoGateAtMs());');
    expect(menuSceneSource).toContain('private menuStaticDrawRowsVisible: number | null = null;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_STATIC_DRAW_ROW_STEP_MS = 64;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_STATIC_DRAW_TILE_STEP_MS = 44;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_STATIC_DECONSTRUCT_TILE_STEP_MS = 34;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_STATIC_DRAW_TARGET_TICKS = 96;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_STATIC_DRAW_SETTLE_MS = 420;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_STATIC_BUILD_PREROLL_BURST_MS = 500;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_STATIC_DECONSTRUCT_HOLD_MS = 0;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS = 1000;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DECONSTRUCT_PLAYER_REMOVE_MS = 220;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DECONSTRUCT_TRAIL_FADE_MS = 860;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DECONSTRUCT_BURST_COLOR = 0xb7f2ff;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DECONSTRUCT_BURST_ALT = 0x72e0bf;');
    expect(menuSceneSource).toContain("private menuStaticDrawLifecyclePhase: LegacyMenuStaticDrawLifecyclePhase = 'idle';");
    expect(menuSceneSource).toContain('private menuStaticDeconstructStartedAtMs: number | null = null;');
    expect(menuSceneSource).toContain('private menuStaticDeconstructZeroHoldStartedAtMs: number | null = null;');
    expect(menuSceneSource).toContain('private menuStaticBuildPrerollStartedAtMs: number | null = null;');
    expect(menuSceneSource).toContain('private menuStaticDrawNextRowAtMs = 0;');
    expect(menuSceneSource).toContain('private menuStaticDrawTileOrder: LegacyPoint[] = [];');
    expect(menuSceneSource).toContain('private menuStaticDrawVisibleTileKeys = new Set<string>();');
    expect(menuSceneSource).toContain('this.armLegacyMenuStaticDrawStage();');
    expect(menuSceneSource).toContain('this.nextDemoMoveAtMs = Math.max(this.nextDemoMoveAtMs, this.resolveLegacyMenuStaticDrawDemoGateAtMs());');
    expect(menuSceneSource).toContain('private releaseLegacyMenuDemoGateOnStaticDrawSettled(time: number): void');
    expect(menuSceneSource).toContain('this.nextDemoMoveAtMs = Math.min(this.nextDemoMoveAtMs, time);');
    expect(menuSceneSource).toContain('this.menuDemoCycleStartedAtMs = time;');
    expect(menuSceneSource).toContain('this.releaseLegacyMenuDemoGateOnStaticDrawSettled(time);');
    expect(menuSceneSource).toContain('private advanceLegacyMenuStaticDrawStage(time: number): void {');
    expect(menuSceneSource).toContain('this.menuStaticDrawTilesVisible = Math.min(');
    expect(menuSceneSource).toContain('this.menuStaticDrawRowsVisible = Math.min(this.maze.size, this.menuStaticDrawRowsVisible + batchSize);');
    expect(menuSceneSource).toContain('this.menuStaticDrawNextRowAtMs = time + LEGACY_MENU_STATIC_DRAW_ROW_STEP_MS;');
    expect(menuSceneSource).toContain('this.menuStaticDrawNextTileAtMs = time + LEGACY_MENU_STATIC_DRAW_TILE_STEP_MS;');
    expect(menuSceneSource).toContain('private boardPathGraphics!: Phaser.GameObjects.Graphics;');
    expect(menuSceneSource).toContain('private boardPathDirty = true;');
    expect(menuSceneSource).toContain('private drawBoardPaths(time: number): void');
    expect(menuSceneSource).toContain('const tileLimit = this.resolveLegacyMenuStaticDrawTileLimit();');
    expect(menuSceneSource).toContain('for (let index = 0; index < Math.min(tileLimit, this.menuStaticDrawTileOrder.length); index += 1)');
    expect(menuSceneSource).toContain('private resolveLegacyMenuStaticDrawRowLimit(): number | null');
    expect(menuSceneSource).toContain('private buildLegacyMenuStaticDrawTileOrder(): LegacyPoint[]');
    expect(menuSceneSource).toContain('this.maze.generationBuildTrace?.pathTiles');
    expect(menuSceneSource).toContain('this.maze.generationBuildTrace?.shortcutTiles');
    expect(menuSceneSource).toContain('this.maze.generationBuildTrace?.reinforcementShortcutTiles');
    expect(menuSceneSource).toContain('private refreshLegacyMenuStaticDrawVisibleTileKeys(): void');
    expect(menuSceneSource).toContain('private resolveLegacyMenuStaticDrawDemoGateAtMs(): number');
    expect(menuSceneSource).toContain('private resolveLegacyMenuStaticDeconstructDurationMs(): number');
    expect(menuSceneSource).toContain('private resolveLegacyMenuDeconstructTrailAlpha(time: number): number');
    expect(menuSceneSource).toContain('private resolveLegacyMenuDeconstructHandoffProgress(time: number): number');
    expect(menuSceneSource).toContain('private shouldDelayLegacyMenuDeconstructRebuild(request: LegacyGenerationRequest, time: number): boolean');
    expect(menuSceneSource).toContain('private isLegacyMenuDeconstructVisualHandoffReady(): boolean');
    expect(menuSceneSource).toContain('this.resolveLegacyMenuPathTitleVisiblePieceCount() === 0');
    expect(menuSceneSource).toContain('private deferLegacyMenuDeconstructRebuildUntil(dueAtMs: number): void');
    expect(menuSceneSource).toContain('private resolveLegacyMenuBuildPrerollProgress(time: number): number');
    expect(menuSceneSource).toContain('private isLegacyMenuBuildPrerollActive(time: number): boolean');
    expect(menuSceneSource).toContain('private drawLegacyMenuDeconstructHandoffBurst(');
    expect(menuSceneSource).toContain('private armLegacyMenuStaticDeconstructStage(time: number): void');
    expect(menuSceneSource).toContain('private shouldStartLegacyMenuDeconstructOnGoalArrival(nextFrame: LegacyMenuDemoAdvance): boolean');
    expect(menuSceneSource).toContain("this.menuStaticDrawLifecyclePhase = 'deconstructing';");
    expect(menuSceneSource).toContain('this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;');
    expect(menuSceneSource).toContain('this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;');
    expect(menuSceneSource).toContain("this.resolveLegacyMenuStaticDeconstructDurationMs() + LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS");
    expect(menuSceneSource).toContain('&& !this.shouldDelayLegacyMenuDeconstructRebuild(nextRequest, time)');
    expect(menuSceneSource).toContain('this.menuStaticDeconstructZeroHoldStartedAtMs + LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS');
    expect(menuSceneSource).toContain('this.titleGraphics.clear();');
    expect(menuSceneSource).toContain('const buildPrerollStartedAtMs = this.time.now - 1;');
    expect(menuSceneSource).toContain('this.menuStaticDrawNextRowAtMs = buildPrerollStartedAtMs + LEGACY_MENU_STATIC_BUILD_PREROLL_BURST_MS;');
    expect(menuSceneSource).toContain('this.menuStaticDrawNextTileAtMs = buildPrerollStartedAtMs + LEGACY_MENU_STATIC_BUILD_PREROLL_BURST_MS;');
    expect(menuSceneSource).toContain('time >= this.menuStaticBuildPrerollStartedAtMs + LEGACY_MENU_STATIC_BUILD_PREROLL_BURST_MS');
    expect(menuSceneSource).toContain('const tileTicks = Math.ceil(Math.max(1, this.menuStaticDrawTileOrder.length) / batchSize);');
    expect(menuSceneSource).toContain("this.menuStaticDrawLifecyclePhase !== 'settled'");
    expect(menuSceneSource).toContain('if (nextFrame.shouldRegenerateMaze) {');
    expect(menuSceneSource).toContain('if (this.shouldStartLegacyMenuDeconstructOnGoalArrival(nextFrame)) {');
    expect(menuSceneSource).toContain('this.armLegacyMenuStaticDeconstructStage(time);');
    expect(menuSceneSource).toContain("this.menuStaticDrawLifecyclePhase !== 'deconstructing'");
    expect(menuSceneSource).toContain('const resolvedTrailAlpha = trailAlpha * menuTrailAlphaMultiplier;');
    expect(menuSceneSource).toContain('const dynamicTrailPathSource = this.maze;');
    expect(menuSceneSource).toContain('private drawLegacyPathMaterialTile(');
    expect(menuSceneSource).toContain('handoffDurationMs: LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS');
    expect(menuSceneSource).toContain('handoffEndsAtMs: this.menuStaticDeconstructZeroHoldStartedAtMs === null');
    expect(menuSceneSource).toContain('zeroHoldStartedAtMs: this.menuStaticDeconstructZeroHoldStartedAtMs === null');
    expect(menuSceneSource).toContain('handoffProgress: this.resolveLegacyMenuDeconstructHandoffProgress(time)');
    expect(menuSceneSource).toContain('titleFullyDeconstructed: titleVisiblePieces === 0');
    expect(menuSceneSource).toContain("this.menuStaticDrawLifecyclePhase === 'deconstructing'");
    expect(menuSceneSource).toContain('titlePiecesRemaining,');
    expect(menuSceneSource).toContain('buildPrerollDurationMs: LEGACY_MENU_STATIC_BUILD_PREROLL_BURST_MS');
    expect(menuSceneSource).toContain('buildPrerollProgress: this.resolveLegacyMenuBuildPrerollProgress(time)');
    expect(menuSceneSource).toContain('trail.filter((point) => this.isLegacyMenuPointVisibleInStaticDraw(point))');
    expect(menuSceneSource).toContain('this.isLegacyMenuPointVisibleInStaticDraw(this.player)');
    expect(menuSceneSource).toContain("this.queueGenerationRequest('menu-demo-missing-episode', 0, { stepSeed: true });");
    expect(menuSceneSource).toContain("this.queueGenerationRequest('overlay-rebuild', 0, { stepSeed: true });");
    expect(menuSceneSource).toContain('createLegacyPlayResetGenerationRequest({');
    expect(menuSceneSource).toContain("scale: this.resolveLegacyProgressionScaleForMode('play')");
    expect(menuSceneSource).toContain("if (request.mode === 'play') {");
    expect(menuSceneSource).toContain('this.armLegacyMenuStaticDeconstructStage(time);');
    expect(menuSceneSource).toContain("reason === 'menu-demo-goal-reset' || reason === 'play-goal-reset'");
    expect(menuSceneSource).toContain('createLegacyMenuResetGenerationRequest({');
    expect(menuSceneSource).toContain('nowMs: time,');
    expect(menuSceneSource).toContain('pendingRequest: {');
    expect(menuSceneSource).toContain('budget: {');
    expect(menuSceneSource).toContain('checkpointCount: this.maze.generation?.budget.checkpointCount ?? null');
    expect(menuSceneSource).toContain('shortcutCountModifier: this.maze.generation?.budget.shortcutCountModifier ?? null');
    expect(menuSceneSource).toContain('entryStageId: this.maze.generation?.gate.entryStageId ?? null');
    expect(menuSceneSource).toContain('buildKind: this.pendingGenerationRequest?.buildKind ?? null');
    expect(menuSceneSource).toContain('checkpointCount: this.pendingGenerationRequest?.budget.checkpointCount ?? null');
    expect(menuSceneSource).toContain('entryStageId: this.pendingGenerationRequest?.gate.entryStageId ?? null');
    expect(menuSceneSource).toContain('queuedAtMs: this.pendingGenerationRequest?.queuedAtMs ?? null');
    expect(menuSceneSource).toContain('levelBuildingDelayDurationSource: this.pendingGenerationRequest?.gate.levelBuildingDelayDurationSource ?? null');
    expect(menuSceneSource).toContain('requiresLevelBuildingStartTime: this.pendingGenerationRequest?.gate.requiresLevelBuildingStartTime ?? null');
    expect(menuSceneSource).toContain('completionSignal: stage.completionSignal,');
    expect(menuSceneSource).toContain('advancesToStageId: stage.advancesToStageId,');
    expect(menuSceneSource).toContain('processStageIds: [...(this.pendingGenerationRequest?.processStageIds ?? [])]');
    expect(menuSceneSource).toContain('stageCursor: {');
    expect(menuSceneSource).toContain('currentStageId: this.maze.generation?.stageCursor.currentStageId ?? null');
    expect(menuSceneSource).toContain('currentStageId: this.pendingGenerationRequest?.stageCursor.currentStageId ?? null');
    expect(menuSceneSource).toContain('drawStage: {');
    expect(menuSceneSource).toContain('const drawRowsVisible = this.resolveLegacyMenuStaticDrawRowsVisibleForDiagnostics();');
    expect(menuSceneSource).toContain('rowsVisible: drawRowsVisible');
    expect(menuSceneSource).toContain('resolveMenuSceneGenerationDrawStageProgress({');
    expect(menuSceneSource).toContain('executionPlan: (this.maze.generation?.executionPlan ?? []).map((stage) => ({');
    expect(menuSceneSource).toContain('resolveMenuSceneRuntimeConfig(runtimeSearch, {');
    expect(menuSceneSource).toContain('publishMenuSceneRuntimeDiagnostics({');
    expect(menuSceneSource).toContain('clearMenuSceneRuntimeDiagnostics();');
  });

  test('defers overlay rebuild travel until closing the options surface', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const legacyPauseMenuSource = readFileSync(
      resolveLegacyUnrealSource('Source', 'Mazer', 'Private', 'UI', 'PauseMenuWidget.cpp'),
      'utf8'
    );

    expect(menuSceneSource).toContain('private pendingOverlayMazeRebuild = false;');
    expect(menuSceneSource).toContain('this.pendingOverlayMazeRebuild = true;');
    expect(menuSceneSource).toContain('if (this.pendingOverlayMazeRebuild) {');
    expect(menuSceneSource).toContain("this.queueGenerationRequest('overlay-rebuild', 0, { stepSeed: true });");
    expect(menuSceneSource).toContain('this.pendingOverlayMazeRebuild = false;');
    expect(legacyPauseMenuSource).toContain('if (ScaleNumChanged || MaterialChanged)');
    expect(legacyPauseMenuSource).toContain('GetWorld()->ServerTravel("Game/Level/Template");');
  });

  test('routes pause commands through an explicit legacy pause lifecycle contract', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const pauseLifecycleSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyPauseLifecycle.ts'), 'utf8');
    const playLifecycleSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyPlayLifecycle.ts'), 'utf8');
    const legacyGamePauseSource = readFileSync(
      resolveLegacyUnrealSource('Source', 'Mazer', 'Private', 'UI', 'GamePauseMenu.cpp'),
      'utf8'
    );

    expect(pauseLifecycleSource).toContain("export type LegacyPauseCommand = 'reset-player' | 'return-menu' | 'resume' | 'reset-progression';");
    expect(pauseLifecycleSource).toContain('resolveLegacyPauseCommand');
    expect(menuSceneSource).toContain("this.applyLegacyPauseCommand('resume')");
    expect(menuSceneSource).toContain("const resetAction = (): void => this.applyLegacyPauseCommand('reset-player');");
    expect(menuSceneSource).toContain("const mainMenuAction = (): void => this.applyLegacyPauseCommand('return-menu');");
    expect(menuSceneSource).toContain('private applyLegacyPauseCommand(command: LegacyPauseCommand): void {');
    expect(menuSceneSource).toContain('const result = resolveLegacyPauseCommand(command, this.maze.start, this.trail);');
    expect(menuSceneSource).toContain('this.playCyclePath = [copyPoint(result.nextPlayer)];');
    expect(menuSceneSource).toContain('this.playCycleResetUsed = true;');
    expect(playLifecycleSource).toContain('resolveLegacyResetEntryContract');
    expect(playLifecycleSource).toContain('entryStageId: LEGACY_RESET_ENTRY_STAGE_ID');
    expect(playLifecycleSource).toContain('bypassesLevelBuildingDelay: true');
    expect(playLifecycleSource).toContain('rearmsDelayStart: mode === \'menu\'');
    expect(legacyGamePauseSource).toContain('MazerGameInstance->_ResetPlayerPosition = true;');
    expect(legacyGamePauseSource).toContain('Back_Clicked();');
    expect(legacyGamePauseSource).toContain('MazerGameInstance->_Playing = false;');
  });

  test('routes flattened feature controls through an explicit overlay toggle contract', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const toggleFieldSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayToggleFields.ts'), 'utf8');

    expect(toggleFieldSource).toContain("| 'toggleAnimatedBackdrop'");
    expect(toggleFieldSource).toContain('resolveLegacyOverlayToggleStateText');
    expect(toggleFieldSource).toContain('resolveLegacyOverlayToggleSwitchIsOn');
    expect(toggleFieldSource).toContain('legacyDirectionalLightIntensity');
    expect(menuSceneSource).toContain('private createFeatureControlRows(');
    expect(menuSceneSource).toContain('private createToggleSwitchRow(');
    expect(menuSceneSource).toContain("label: 'Camera Follow'");
    expect(menuSceneSource).toContain("label: 'Trail Fade'");
    expect(menuSceneSource).toContain("label: 'Trail Pulse'");
    expect(menuSceneSource).toContain("label: 'Animated BG'");
    expect(menuSceneSource).toContain("label: 'Dark Mode'");
    expect(menuSceneSource).toContain("label: 'Controls'");
    expect(menuSceneSource).toContain("label: 'Move Speed'");
    expect(menuSceneSource).toContain('private createMovementSpeedSliderRow(');
    expect(menuSceneSource).toContain('private applyLegacyMovementSpeed(speed: number): void {');
    expect(menuSceneSource).toContain("stateText: resolveLegacyOverlayToggleStateText('toggleCameraFollow', this.settings.toggleCameraFollow) ?? 'Off'");
    expect(menuSceneSource).toContain("stateText: resolveLegacyOverlayToggleStateText('toggleTrailFade', this.settings.toggleTrailFade) ?? 'Off'");
    expect(menuSceneSource).toContain("stateText: resolveLegacyOverlayToggleStateText('toggleTrailPulse', this.settings.toggleTrailPulse) ?? 'Off'");
    expect(menuSceneSource).toContain("stateText: resolveLegacyOverlayToggleStateText('toggleAnimatedBackdrop', this.settings.toggleAnimatedBackdrop) ?? 'Stagnant'");
    expect(menuSceneSource).toContain("stateText: resolveLegacyOverlayToggleStateText('darkMode', this.settings.darkMode) ?? 'Off'");
    expect(menuSceneSource).toContain("stateText: resolveLegacyOverlayToggleStateText('controlMode', this.settings.controlMode === 'stick') ?? 'Arrows'");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('toggleCameraFollow', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailFade', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailPulse', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('toggleAnimatedBackdrop', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('darkMode', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('controlMode', this.settings)");
    expect(menuSceneSource).toContain('private fitLegacyUiTextToWidth<T extends Phaser.GameObjects.Text>');
    expect(menuSceneSource).toContain('const showStateLabel = input.width >= 320;');
    expect(menuSceneSource).toContain('const labelMaxWidth = Math.max(54, labelRight - labelX);');
    expect(menuSceneSource).toContain('controls.length * (rowHeight + rowGap)');
    expect(menuSceneSource).toContain("this.applyLegacyOverlayToggleField('toggleCameraFollow')");
    expect(menuSceneSource).toContain("this.applyLegacyOverlayToggleField('toggleTrailFade')");
    expect(menuSceneSource).toContain("this.applyLegacyOverlayToggleField('toggleTrailPulse')");
    expect(menuSceneSource).toContain("this.applyLegacyOverlayToggleField('toggleAnimatedBackdrop')");
    expect(menuSceneSource).toContain("this.applyLegacyOverlayToggleField('darkMode')");
    expect(menuSceneSource).toContain("this.applyLegacyOverlayToggleField('controlMode')");
    expect(menuSceneSource).toContain('this.applyLegacyMovementSpeed(nextSpeed);');
    expect(menuSceneSource).toContain('private applyLegacyOverlayToggleField(fieldId: LegacyOverlayToggleFieldId): void {');
    expect(menuSceneSource).not.toContain("this.openNestedOverlay('features'");
    expect(menuSceneSource).not.toContain("this.openNestedOverlay('gameModes'");
  });

  test('routes menu-time overlay field commits through an explicit legacy flag contract', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const overlayFieldCommitSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayFieldCommit.ts'), 'utf8');
    const legacyPauseMenuSource = readFileSync(
      resolveLegacyUnrealSource('Source', 'Mazer', 'Private', 'UI', 'PauseMenuWidget.cpp'),
      'utf8'
    );

    expect(overlayFieldCommitSource).toContain("type LegacyOverlayFieldCommitKind = 'camera-flag' | 'material-change' | 'scale-change';");
    expect(overlayFieldCommitSource).toContain('applyLegacyOverlayFieldCommit');
    expect(overlayFieldCommitSource).toContain('triggersReloadOnBack');
    expect(overlayFieldCommitSource).toContain('triggersCameraFlag');
    expect(menuSceneSource).toContain("const result = applyLegacyOverlayFieldCommit(this.settings, this.optionFieldDrafts, fieldId);");
    expect(menuSceneSource).toContain('resolveLegacyOverlayFieldCommitMessage(');
    expect(menuSceneSource).toContain('this.resolveLegacyOverlayFieldMessageLabel(fieldId)');
    expect(menuSceneSource).toContain('this.resolveLegacyOverlayFieldMessageState(fieldId)');
    expect(menuSceneSource).toContain("this.commitOverlayField(fieldId, { announce: false });");
    expect(menuSceneSource).toContain('if (result.triggersReloadOnBack) {');
    expect(menuSceneSource).toContain('if (result.refreshLayout) {');
    expect(legacyPauseMenuSource).toContain('ScaleNumChanged = true;');
    expect(legacyPauseMenuSource).toContain('MazerGameInstance->_PathMaterialChanged = MaterialChanged = true;');
    expect(legacyPauseMenuSource).toContain('MazerGameInstance->_WallMaterialChanged = MaterialChanged = true;');
    expect(legacyPauseMenuSource).toContain('MazerGameInstance->_CamScaleFlag = true;');
  });

  test('routes flattened overlay back navigation through an explicit overlay routing contract', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const overlayRoutingSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayRouting.ts'), 'utf8');

    expect(overlayRoutingSource).toContain("export type LegacyOverlayKind = 'none' | 'options' | 'pause' | 'auth' | 'confirm-progression-reset';");
    expect(overlayRoutingSource).toContain('resolveLegacyOverlayBackAction');
    expect(menuSceneSource).toContain('const action = resolveLegacyOverlayBackAction({');
    expect(menuSceneSource).toContain("case 'close-overlay':");
    expect(menuSceneSource).not.toContain('private openNestedOverlay(');
    expect(overlayRoutingSource).not.toContain('return-parent');
    expect(overlayRoutingSource).not.toContain('resolveLegacyNestedOverlayOpen');
  });
});
