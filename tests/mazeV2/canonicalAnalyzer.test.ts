import { describe, expect, test } from 'vitest';
import { analyzeMazeV2CanonicalMaze } from '../../src/domain/mazeV2/canonicalAnalyzer';
import type { MazeV2CanonicalMaze } from '../../src/domain/mazeV2/types';

const canonicalMaze = (overrides: Partial<MazeV2CanonicalMaze>): MazeV2CanonicalMaze => ({
  width: 5,
  height: 1,
  walkable: [[true, true, true, true, true]],
  start: { x: 0, y: 0 },
  goal: { x: 4, y: 0 },
  wrapPairs: [],
  ...overrides
});

describe('analyzeMazeV2CanonicalMaze -- straight corridor', () => {
  test('reports the full length as the shortest path with zero turns, junctions, and dead ends', () => {
    const metrics = analyzeMazeV2CanonicalMaze(canonicalMaze({}));
    expect(metrics.route.shortestPathLength).toBe(4);
    expect(metrics.route.manhattanDistance).toBe(4);
    expect(metrics.route.detourRatio).toBe(1);
    expect(metrics.decision.junctionCount).toBe(0);
    expect(metrics.deadEnd.deadEndCount).toBe(0);
    expect(metrics.turning.turnCount).toBe(0);
    expect(metrics.ambiguity.cycleRank).toBe(0);
  });

  test('is deterministic and produces a stable metric fingerprint for the same input', () => {
    const a = analyzeMazeV2CanonicalMaze(canonicalMaze({}));
    const b = analyzeMazeV2CanonicalMaze(canonicalMaze({}));
    expect(a.metricFingerprint).toBe(b.metricFingerprint);
  });
});

describe('analyzeMazeV2CanonicalMaze -- a maze with dead-end branches', () => {
  // A plus-shaped floor: one central junction at (2,1) with four one-tile
  // arms -- left (0,1), right (3,1), top (2,0), bottom (2,2). Whichever two
  // arms are NOT start/goal are genuine one-tile-deep dead ends.
  const width = 4;
  const height = 3;
  const walkable = [
    [false, false, true, false],
    [true, true, true, true],
    [false, false, true, false]
  ];

  test('the two arms not used as start or goal are counted as one-tile-deep dead ends', () => {
    const metrics = analyzeMazeV2CanonicalMaze(canonicalMaze({
      width,
      height,
      walkable,
      start: { x: 0, y: 1 },
      goal: { x: 3, y: 1 }
    }));
    expect(metrics.deadEnd.deadEndCount).toBe(2);
    expect(metrics.deadEnd.meanDeadEndDepth).toBe(1);
    expect(metrics.decision.junctionCount).toBe(1);
    expect(metrics.decision.maxJunctionDegree).toBe(4);
  });

  test('using a different arm as goal still leaves exactly two dead ends', () => {
    const metrics = analyzeMazeV2CanonicalMaze(canonicalMaze({
      width,
      height,
      walkable,
      start: { x: 0, y: 1 },
      goal: { x: 2, y: 0 }
    }));
    expect(metrics.deadEnd.deadEndCount).toBe(2);
  });
});

describe('analyzeMazeV2CanonicalMaze -- a loop', () => {
  test('a 2x2 fully-open block has cycle rank 1', () => {
    const metrics = analyzeMazeV2CanonicalMaze(canonicalMaze({
      width: 2,
      height: 2,
      walkable: [[true, true], [true, true]],
      start: { x: 0, y: 0 },
      goal: { x: 1, y: 1 }
    }));
    expect(metrics.ambiguity.cycleRank).toBe(1);
  });
});

describe('analyzeMazeV2CanonicalMaze -- wrap pairs', () => {
  test('a wrap pair is the ONLY connection between two far-apart tiles', () => {
    const width = 5;
    const walkable = [[true, false, false, false, true]];
    const metrics = analyzeMazeV2CanonicalMaze(canonicalMaze({
      width,
      height: 1,
      walkable,
      start: { x: 0, y: 0 },
      goal: { x: 4, y: 0 },
      wrapPairs: [{ from: { x: 0, y: 0 }, to: { x: 4, y: 0 }, axis: 'horizontal' }]
    }));
    expect(metrics.route.shortestPathLength).toBe(1);
    expect(metrics.wrap.wrapPairCount).toBe(1);
    expect(metrics.wrap.wrapPairsOnRoute).toBe(1);
  });

  test('reports zero wrap pairs on route when the declared pair only connects two already-adjacent tiles', () => {
    // (0,0) and (1,0) are already plain 4-directional neighbors in this
    // corridor, so a step between them is indistinguishable from an ordinary
    // grid move (Manhattan distance 1) regardless of the wrap pair's
    // existence -- the route uses that step either way, but it never
    // registers as a WRAP-attributable step.
    const metrics = analyzeMazeV2CanonicalMaze(canonicalMaze({
      wrapPairs: [{ from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, axis: 'horizontal' }]
    }));
    expect(metrics.wrap.wrapPairCount).toBe(1);
    expect(metrics.wrap.wrapPairsOnRoute).toBe(0);
  });
});
