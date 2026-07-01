import { describe, expect, test } from 'vitest';
import {
  advanceLegacyPlayStep,
  createLegacyPlayMoveFlags,
  isPointInsideLegacyBoardBounds,
  LEGACY_PLAY_TRAIL_FADE_TAIL,
  LEGACY_SIMULTANEOUS_KEY_PRESS_DELAY_MS,
  resolveLegacyPointerMoveVector,
  resolveLegacyPlayCollisionDelta,
  resolveLegacyPlayMoveVector
} from '../../src/legacy-runtime/legacyPlayStep';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';

const createTestMaze = (): LegacyMazeSnapshot => ({
  source: 'play-generated',
  size: 5,
  grid: [
    [false, false, false, false, false],
    [false, true, true, true, false],
    [false, false, false, true, false],
    [false, false, false, true, false],
    [false, false, false, false, false]
  ],
  start: { x: 1, y: 1 },
  goal: { x: 3, y: 3 },
  solutionPath: [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 3, y: 2 },
    { x: 3, y: 3 }
  ],
  seed: 77
});

describe('legacy play step', () => {
  test('moves one tile-step on a walkable cardinal input', () => {
    const result = advanceLegacyPlayStep({
      maze: createTestMaze(),
      player: { x: 1, y: 1 },
      trail: [{ x: 1, y: 1 }],
      deltaX: 1,
      deltaY: 0,
      toggleTrailFade: false
    });

    expect(result.moved).toBe(true);
    expect(result.player).toEqual({ x: 2, y: 1 });
    expect(result.reachedGoal).toBe(false);
    expect(result.trail).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }]);
  });

  test('resolves held direction flags after the legacy simultaneous-key delay', () => {
    const flags = createLegacyPlayMoveFlags();
    flags.right = true;
    flags.down = true;

    expect(LEGACY_SIMULTANEOUS_KEY_PRESS_DELAY_MS).toBe(50);
    expect(resolveLegacyPlayMoveVector(flags)).toEqual({ deltaX: 1, deltaY: 1 });
  });

  test('opposing held directions cancel before movement resolves', () => {
    const flags = createLegacyPlayMoveFlags();
    flags.left = true;
    flags.right = true;
    flags.up = true;
    flags.down = true;

    expect(resolveLegacyPlayMoveVector(flags)).toEqual({ deltaX: 0, deltaY: 0 });
  });

  test('resolves mobile swipe direction into the same one-step vector contract', () => {
    expect(resolveLegacyPointerMoveVector({
      startX: 120,
      startY: 120,
      endX: 182,
      endY: 124,
      playerScreenX: 140,
      playerScreenY: 140,
      tileSize: 8
    })).toEqual({ deltaX: 1, deltaY: 0 });
  });

  test('preserves diagonal mobile swipe intent when both axes are significant', () => {
    expect(resolveLegacyPointerMoveVector({
      startX: 100,
      startY: 100,
      endX: 156,
      endY: 142,
      playerScreenX: 140,
      playerScreenY: 140,
      tileSize: 8
    })).toEqual({ deltaX: 1, deltaY: 1 });
  });

  test('resolves short mobile taps from the player screen center', () => {
    expect(resolveLegacyPointerMoveVector({
      startX: 158,
      startY: 140,
      endX: 160,
      endY: 140,
      playerScreenX: 140,
      playerScreenY: 140,
      tileSize: 8
    })).toEqual({ deltaX: 1, deltaY: 0 });
  });

  test('ignores mobile pointer starts outside the active board bounds', () => {
    const boardBounds = {
      left: 20,
      top: 80,
      right: 360,
      bottom: 420
    };

    expect(isPointInsideLegacyBoardBounds(160, 140, boardBounds)).toBe(true);
    expect(isPointInsideLegacyBoardBounds(160, 50, boardBounds)).toBe(false);
    expect(resolveLegacyPointerMoveVector({
      boardBounds,
      startX: 160,
      startY: 50,
      endX: 240,
      endY: 50,
      playerScreenX: 160,
      playerScreenY: 160,
      tileSize: 8
    })).toEqual({ deltaX: 0, deltaY: 0 });
  });

  test('keeps inside-board mobile swipes valid when the release leaves the board', () => {
    expect(resolveLegacyPointerMoveVector({
      boardBounds: {
        left: 20,
        top: 80,
        right: 360,
        bottom: 420
      },
      startX: 160,
      startY: 160,
      endX: 410,
      endY: 160,
      playerScreenX: 160,
      playerScreenY: 160,
      tileSize: 8
    })).toEqual({ deltaX: 1, deltaY: 0 });
  });

  test('ignores tiny mobile taps on the player center', () => {
    expect(resolveLegacyPointerMoveVector({
      startX: 140,
      startY: 140,
      endX: 140,
      endY: 140,
      playerScreenX: 140,
      playerScreenY: 140,
      tileSize: 8
    })).toEqual({ deltaX: 0, deltaY: 0 });
  });

  test('allows a simultaneous diagonal step when the resolved target is walkable', () => {
    const maze = createTestMaze();
    maze.grid[2][1] = true;
    maze.grid[2][2] = true;
    const result = advanceLegacyPlayStep({
      maze,
      player: { x: 1, y: 1 },
      trail: [{ x: 1, y: 1 }],
      deltaX: 1,
      deltaY: 1,
      toggleTrailFade: false
    });

    expect(result.moved).toBe(true);
    expect(result.player).toEqual({ x: 2, y: 2 });
    expect(result.trail).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
  });

  test('slides along the open axis when simultaneous input includes one blocked axis', () => {
    const maze = createTestMaze();

    expect(resolveLegacyPlayCollisionDelta(maze, { x: 1, y: 1 }, 1, 1)).toEqual({ deltaX: 1, deltaY: 0 });

    const result = advanceLegacyPlayStep({
      maze,
      player: { x: 1, y: 1 },
      trail: [{ x: 1, y: 1 }],
      deltaX: 1,
      deltaY: 1,
      toggleTrailFade: false
    });

    expect(result.moved).toBe(true);
    expect(result.player).toEqual({ x: 2, y: 1 });
    expect(result.trail).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }]);
  });

  test('blocks a simultaneous corner move when the final diagonal target is a wall', () => {
    const maze = createTestMaze();
    maze.grid[2][1] = true;
    maze.grid[1][2] = true;
    maze.grid[2][2] = false;

    expect(resolveLegacyPlayCollisionDelta(maze, { x: 1, y: 1 }, 1, 1)).toEqual({ deltaX: 0, deltaY: 0 });

    const result = advanceLegacyPlayStep({
      maze,
      player: { x: 1, y: 1 },
      trail: [{ x: 1, y: 1 }],
      deltaX: 1,
      deltaY: 1,
      toggleTrailFade: false
    });

    expect(result.moved).toBe(false);
    expect(result.player).toEqual({ x: 1, y: 1 });
    expect(result.trail).toEqual([{ x: 1, y: 1 }]);
  });

  test('blocks wall collisions without moving the player or trail', () => {
    const trail = [{ x: 1, y: 1 }];
    const result = advanceLegacyPlayStep({
      maze: createTestMaze(),
      player: { x: 1, y: 1 },
      trail,
      deltaX: 0,
      deltaY: 1,
      toggleTrailFade: false
    });

    expect(result.moved).toBe(false);
    expect(result.player).toEqual({ x: 1, y: 1 });
    expect(result.reachedGoal).toBe(false);
    expect(result.trail).toEqual(trail);
  });

  test('flags the goal step when the player reaches the end tile', () => {
    const result = advanceLegacyPlayStep({
      maze: createTestMaze(),
      player: { x: 3, y: 2 },
      trail: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 2 }
      ],
      deltaX: 0,
      deltaY: 1,
      toggleTrailFade: false
    });

    expect(result.moved).toBe(true);
    expect(result.player).toEqual({ x: 3, y: 3 });
    expect(result.reachedGoal).toBe(true);
    expect(result.trail.at(-1)).toEqual({ x: 3, y: 3 });
  });

  test('trims the trail to the legacy fade tail when trail fade is enabled', () => {
    const longTrail = Array.from({ length: LEGACY_PLAY_TRAIL_FADE_TAIL }, (_, index) => ({
      x: Math.min(3, 1 + index),
      y: 1
    }));
    const result = advanceLegacyPlayStep({
      maze: createTestMaze(),
      player: { x: 2, y: 1 },
      trail: longTrail,
      deltaX: 1,
      deltaY: 0,
      toggleTrailFade: true
    });

    expect(result.moved).toBe(true);
    expect(result.trail).toHaveLength(LEGACY_PLAY_TRAIL_FADE_TAIL);
    expect(result.trail.at(-1)).toEqual({ x: 3, y: 1 });
  });
});
