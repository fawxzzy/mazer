import { describe, expect, test } from 'vitest';
import { createDemoSpectatorPlan, type DemoSpectatorPlan } from '../../src/domain/ai';
import { generateMaze, type MazeEpisode } from '../../src/domain/maze';

// Minimal synthetic episode builder mirroring the one used in
// tests/ai/demo-walker.test.ts: a straight-line path where the path index
// equals the raster tile index, so a cursor collision is exactly a tile
// collision. This isolates the pure cursor arithmetic in
// createDemoSpectatorPlan from maze-generation shape, letting us scan every
// path length cheaply and deterministically.
const buildStraightPathEpisode = (pathLength: number): MazeEpisode => {
  const canonicalPath = Array.from({ length: pathLength }, (_, index) => index);
  const tiles = new Uint8Array(Math.max(pathLength, 1));

  return {
    accepted: true,
    difficulty: 'standard',
    difficultyScore: 0,
    family: 'classic',
    generationTrace: {
      rootTileIndex: 0,
      uniqueTileCount: pathLength,
      steps: [{ phase: 'seed', tileIndices: [0] }]
    },
    metrics: {
      solutionLength: pathLength,
      deadEnds: 0,
      junctions: 0,
      branchDensity: 0,
      straightness: 1,
      coverage: 1
    },
    placementStrategy: 'farthest-pair',
    presentationPreset: 'classic',
    raster: {
      width: pathLength,
      height: 1,
      scale: 1,
      tiles,
      startIndex: canonicalPath[0] ?? 0,
      endIndex: canonicalPath.at(-1) ?? 0,
      pathIndices: Uint32Array.from(canonicalPath)
    },
    routeMotifs: {
      falseShortcutBranches: 0,
      nearGoalBranches: 0,
      hubJunctions: 0,
      chokeCorridors: 0,
      loopDetours: 0
    },
    seed: 1,
    shortcutsCreated: 0,
    size: 'small'
  } as unknown as MazeEpisode;
};

// Every tile a populated full-profile plan claims for a mechanic, tagged
// with which mechanic claims it. The patrol lane contributes every tile in
// its multi-tile range, not just its endpoints.
const collectMechanicTileOwners = (plan: DemoSpectatorPlan): Array<[string, number]> => {
  if (!plan.keyItem) {
    return [];
  }

  return [
    ['key', plan.keyItem.tileIndex],
    ['plate', plan.pressurePlate!.tileIndex],
    ['door', plan.pressureDoor!.fromTileIndex],
    ['door', plan.pressureDoor!.toTileIndex],
    ...plan.patrolLane!.tileIndices.map((tileIndex): [string, number] => ['patrol', tileIndex]),
    ['hazard', plan.hazardTile!.tileIndex],
    ['gate', plan.timedGate!.fromTileIndex],
    ['gate', plan.timedGate!.toTileIndex]
  ];
};

// Asserts no two distinct mechanic kinds ever share a tile index. Two
// segments of the same mechanic (e.g. a door's from/to tiles, or the
// patrol lane's own multi-tile range) are expected to be adjacent/overlap
// with themselves and are not a violation.
const expectNoCrossMechanicTileCollisions = (plan: DemoSpectatorPlan): void => {
  const owners = collectMechanicTileOwners(plan);
  const byTile = new Map<number, Set<string>>();
  for (const [mechanic, tileIndex] of owners) {
    const set = byTile.get(tileIndex) ?? new Set<string>();
    set.add(mechanic);
    byTile.set(tileIndex, set);
  }
  for (const [tileIndex, mechanics] of byTile.entries()) {
    expect(mechanics.size, `tile ${tileIndex} is claimed by multiple mechanics: ${[...mechanics].join(', ')}`).toBe(1);
  }
};

describe('demo spectator mechanic tile placement', () => {
  test('never places two distinct mechanics on the same tile, across every populated segmentCount from the floor through a wide range', () => {
    // segmentCount 17 (pathLength 18) is the first full-profile-populated
    // case; scan a wide range past it to guard against any resurfacing
    // collision as the proportional cursor spacing grows.
    for (let pathLength = 18; pathLength <= 260; pathLength += 1) {
      const episode = buildStraightPathEpisode(pathLength);
      const plan = createDemoSpectatorPlan(episode, 'full');
      expect(plan.keyItem, `pathLength ${pathLength} unexpectedly fell back to core-only`).not.toBeNull();
      expectNoCrossMechanicTileCollisions(plan);
    }
  });

  test('falls back to the core-only (unpopulated) shape for every segmentCount from 6 through 16, where mechanics cannot fit without overlapping', () => {
    for (let pathLength = 7; pathLength <= 17; pathLength += 1) {
      const episode = buildStraightPathEpisode(pathLength);
      const plan = createDemoSpectatorPlan(episode, 'full');
      expect(plan.keyItem).toBeNull();
      expect(plan.patrolLane).toBeNull();
      expect(plan.riskWindows).toEqual([]);
    }
  });

  test('real generated mazes at small scale never produce a full-profile plan with a mechanic tile collision', () => {
    // These exact (scale, seed) pairs were empirically confirmed (via a
    // throwaway probe script) to produce a colliding plan under the prior
    // 6-segment floor: door and the patrol lane's leading tile landed on
    // the same maze tile, and in some cases hazard did too. They now must
    // either populate collision-free or safely fall back to core-only.
    const knownShortRouteCases: ReadonlyArray<{ scale: number; seed: number }> = [
      { scale: 15, seed: 29 },
      { scale: 20, seed: 7 },
      { scale: 20, seed: 9 },
      { scale: 20, seed: 11 },
      { scale: 20, seed: 21 },
      { scale: 20, seed: 35 },
      { scale: 20, seed: 37 }
    ];

    for (const { scale, seed } of knownShortRouteCases) {
      const episode = generateMaze({ scale, seed });
      const plan = createDemoSpectatorPlan(episode, 'full');
      if (plan.keyItem) {
        expectNoCrossMechanicTileCollisions(plan);
      } else {
        expect(plan.failureReasonTitle).toBe('Route clipped');
      }
    }
  });

  test('the specific real small-maze seed that used to collide now safely falls back to core-only', () => {
    // size "small" (legacyScale 25), seed 185 produces a 17-tile solution
    // path (segmentCount 16) -- one below the corrected 17-segment floor.
    // Under the old (buggy) 6-segment floor this populated a full plan
    // with the door and patrol-lane mechanics sharing a tile.
    const episode = generateMaze({ size: 'small', seed: 185 });
    expect(episode.raster.pathIndices.length - 1).toBe(16);

    const plan = createDemoSpectatorPlan(episode, 'full');
    expect(plan.keyItem).toBeNull();
    expect(plan.patrolLane).toBeNull();
    expect(plan.pressureDoor).toBeNull();
    expect(plan.failureReasonTitle).toBe('Route clipped');
  });
});
