import { describe, expect, test } from 'vitest';
import {
  resolveLegacyPlayableShortestPath,
  resolveLegacyShortestPath,
  resolveLegacyWalkableGridNeighbors
} from '../../src/legacy-runtime/legacyMaze';
import { advanceLegacyPlayStep } from '../../src/legacy-runtime/legacyPlayStep';
import type { LegacyMazeSnapshot, LegacyPoint } from '../../src/legacy-runtime/legacyMaze';

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

// resolveLegacyPlayPerfectPathTrail (MenuScene.ts, private, real-browser-only
// like the rest of the Scene) builds a "visited" mask from this.trail and
// searches for a shortest path from an origin to this.player through only
// that mask. This block reproduces its exact algorithm as a plain function
// here so the origin-connectivity fix can be verified against REAL,
// production movement semantics (advanceLegacyPlayStep, driven move-by-move
// down a real corridor with Trail Fade on -- not a hand-built visited set,
// and not a direct scene.trail assignment) rather than only asserting on
// MenuScene.ts's source text.
describe('play trail origin connectivity under Trail Fade truncation', () => {
  // Padded with a literal 1-cell wall border on every side: the
  // 'playable-wrap-aware' policy resolveLegacyPlayableShortestPath actually
  // runs under (the real production policy) treats a maze's literal
  // opposite grid edges as wrap-adjacent when both are floor -- an
  // unpadded single-row corridor would let start (at the left edge) and the
  // retained trail's far end (at the right edge) "wrap-connect" directly,
  // masking the very disconnection this test means to reproduce. A real
  // generated maze's own outer wall border already prevents this; padding
  // here mirrors that.
  const buildLongCorridor = (length: number): LegacyMazeSnapshot => {
    const innerWidth = length;
    const paddedWidth = innerWidth + 2;
    const wallRow = Array.from({ length: paddedWidth }, () => false);
    const floorRow = [false, ...Array.from({ length: innerWidth }, () => true), false];
    return {
      source: 'play-generated',
      width: paddedWidth,
      height: 3,
      grid: [wallRow, floorRow, wallRow],
      start: { x: 1, y: 1 },
      goal: { x: innerWidth, y: 1 },
      solutionPath: [],
      seed: 1
    };
  };

  const resolvePerfectPathTrail = (
    grid: boolean[][],
    trail: readonly LegacyPoint[],
    mazeStart: LegacyPoint,
    player: LegacyPoint,
    origin: LegacyPoint
  ) => {
    const visitedGrid = grid.map((row) => row.map(() => false));
    const markVisited = (point: LegacyPoint): void => {
      if (visitedGrid[point.y]?.[point.x] !== undefined) {
        visitedGrid[point.y]![point.x] = true;
      }
    };
    for (const point of trail) {
      markVisited(point);
    }
    markVisited(mazeStart);
    markVisited(player);
    return resolveLegacyPlayableShortestPath(visitedGrid, origin, player);
  };

  test('walking further than the Trail Fade tail down a real corridor disconnects maze.start from the retained trail', () => {
    const trailFadeTail = 16;
    const corridorLength = 40;
    const maze = buildLongCorridor(corridorLength);
    const { grid, start, goal } = maze;

    let player = start;
    let trail: LegacyPoint[] = [start];
    // Real production movement, one accepted step at a time, exactly like
    // the real game commits a move -- not a hand-built array.
    for (let i = 0; i < corridorLength - 1; i += 1) {
      const step = advanceLegacyPlayStep({
        deltaX: 1,
        deltaY: 0,
        maze,
        player,
        toggleTrailFade: true,
        trail,
        trailFadeTail
      });
      expect(step.moved).toBe(true);
      player = step.player;
      trail = step.trail;
    }

    // Trail Fade has bounded the retained trail to its most recent 16
    // points -- maze.start (x:0) is long gone.
    expect(trail.length).toBe(trailFadeTail);
    expect(trail.some((point) => point.x === start.x && point.y === start.y)).toBe(false);

    // The bug: searching from maze.start (no longer in the visited set)
    // fails to find any path to the player at all.
    const buggyResult = resolvePerfectPathTrail(grid, trail, start, player, start);
    expect(buggyResult.found).toBe(false);

    // The fix: searching from the trail's own oldest retained point (what
    // resolveLegacyPlayPerfectPathTrail now uses as its origin) always
    // succeeds, because every consecutive pair in a real movement trail is
    // grid-adjacent by construction.
    const fixedResult = resolvePerfectPathTrail(grid, trail, start, player, trail[0]!);
    expect(fixedResult.found).toBe(true);
    expect(fixedResult.path.length).toBeGreaterThan(0);
    expect(fixedResult.path[0]).toEqual(trail[0]);
    expect(fixedResult.path[fixedResult.path.length - 1]).toEqual(player);
  });

  test('Trail Fade OFF keeps the full history, so maze.start stays connected and the origin is unchanged', () => {
    const corridorLength = 40;
    const maze = buildLongCorridor(corridorLength);
    const { grid, start, goal } = maze;

    let player = start;
    let trail: LegacyPoint[] = [start];
    for (let i = 0; i < corridorLength - 1; i += 1) {
      const step = advanceLegacyPlayStep({
        deltaX: 1,
        deltaY: 0,
        maze,
        player,
        toggleTrailFade: false,
        trail
      });
      player = step.player;
      trail = step.trail;
    }

    // Untruncated -- every tile walked is still retained, including start.
    expect(trail.length).toBe(corridorLength);
    expect(trail[0]).toEqual(start);

    const result = resolvePerfectPathTrail(grid, trail, start, player, trail[0]!);
    expect(result.found).toBe(true);
    expect(result.path[0]).toEqual(start);
  });

  test('backtracking after Trail Fade truncation still resolves a connected, non-empty path from the new origin', () => {
    const trailFadeTail = 16;
    const corridorLength = 40;
    const maze = buildLongCorridor(corridorLength);
    const { grid, start, goal } = maze;

    let player = start;
    let trail: LegacyPoint[] = [start];
    const move = (deltaX: number): void => {
      const step = advanceLegacyPlayStep({
        deltaX,
        deltaY: 0,
        maze,
        player,
        toggleTrailFade: true,
        trail,
        trailFadeTail
      });
      expect(step.moved).toBe(true);
      player = step.player;
      trail = step.trail;
    };

    for (let i = 0; i < 30; i += 1) {
      move(1);
    }
    // Backtrack a few steps -- the perfect-path search (shortest path
    // through visited cells) should shrink accordingly, but must still find
    // SOME connected path from the current origin, never collapse to empty.
    for (let i = 0; i < 5; i += 1) {
      move(-1);
    }

    const result = resolvePerfectPathTrail(grid, trail, start, player, trail[0]!);
    expect(result.found).toBe(true);
    expect(result.path[result.path.length - 1]).toEqual(player);
  });
});
