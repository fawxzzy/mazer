import { describe, expect, test } from 'vitest';
import {
  resolveLegacyPlayableShortestPath,
  resolveLegacyShortestPath,
  resolveLegacyWalkableGridNeighbors
} from '../../src/legacy-runtime/legacyMaze';

describe('legacy playable graph', () => {
  test('keeps direct-floor and playable-wrap-aware paths explicit', () => {
    const grid = [
      [true, true, true, true, true],
      [true, false, false, false, true],
      [true, true, true, true, true]
    ];
    const start = { x: 0, y: 1 };
    const goal = { x: 4, y: 1 };

    const direct = resolveLegacyShortestPath(grid, start, goal, 'direct-floor');
    const playable = resolveLegacyPlayableShortestPath(grid, start, goal);

    expect(direct).toMatchObject({ found: true, policy: 'direct-floor', stepCount: 6 });
    expect(playable).toMatchObject({ found: true, policy: 'playable-wrap-aware', stepCount: 1 });
    expect(playable.path).toEqual([start, goal]);
  });

  test('uses a legal wrap when it is the only playable route', () => {
    const grid = [[true, false, true]];
    const start = { x: 0, y: 0 };
    const goal = { x: 2, y: 0 };

    expect(resolveLegacyShortestPath(grid, start, goal, 'direct-floor')).toMatchObject({ found: false, path: [] });
    expect(resolveLegacyPlayableShortestPath(grid, start, goal)).toMatchObject({ found: true, path: [start, goal], stepCount: 1 });
  });

  test('does not invent a one-sided wrap', () => {
    const grid = [[true, false, false]];

    expect(resolveLegacyWalkableGridNeighbors(grid, { x: 0, y: 0 })).toEqual([]);
    expect(resolveLegacyPlayableShortestPath(grid, { x: 0, y: 0 }, { x: 2, y: 0 })).toMatchObject({ found: false, path: [], stepCount: null });
  });

  test('preserves deterministic cardinal tie-breaking and start-goal semantics', () => {
    const grid = [
      [true, true],
      [true, true]
    ];

    expect(resolveLegacyShortestPath(grid, { x: 0, y: 0 }, { x: 1, y: 1 }, 'direct-floor').path).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ]);
    expect(resolveLegacyPlayableShortestPath(grid, { x: 0, y: 0 }, { x: 0, y: 0 })).toMatchObject({
      found: true,
      path: [{ x: 0, y: 0 }],
      stepCount: 0
    });
  });
});
