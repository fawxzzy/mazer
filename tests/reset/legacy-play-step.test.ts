import { describe, expect, test } from 'vitest';
import { advanceLegacyPlayStep, LEGACY_PLAY_TRAIL_FADE_TAIL } from '../../src/legacy-runtime/legacyPlayStep';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';

const createTestMaze = (): LegacyMazeSnapshot => ({
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
