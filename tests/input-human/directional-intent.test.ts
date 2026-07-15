import { describe, expect, test } from 'vitest';
import {
  LEGACY_DIRECTIONAL_INTENT_LANE_SHIFT_TILE_LIMIT,
  LegacyDirectionalIntentResolver
} from '../../src/legacy-runtime/legacyDirectionalIntent';
import type { LegacyMazeSnapshot, LegacyPoint } from '../../src/legacy-runtime/legacyMaze';

const createMaze = (
  size: number,
  walkable: readonly LegacyPoint[],
  start = walkable[0] ?? { x: 1, y: 1 },
  goal = walkable.at(-1) ?? start
): LegacyMazeSnapshot => {
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  for (const point of walkable) {
    grid[point.y]![point.x] = true;
  }
  return {
    source: 'play-generated',
    size,
    grid,
    start: { ...start },
    goal: { ...goal },
    solutionPath: walkable.map((point) => ({ ...point })),
    seed: 17
  };
};

describe('LegacyDirectionalIntentResolver', () => {
  test('turns immediately when the latest requested direction is legal', () => {
    const maze = createMaze(5, [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);
    expect(resolver.step(maze, { x: 1, y: 1 })).toMatchObject({
      decision: 'continued',
      direction: 'right',
      target: { x: 2, y: 1 }
    });

    resolver.request(['down']);
    expect(resolver.step(maze, { x: 2, y: 1 })).toMatchObject({
      decision: 'queued-turn',
      direction: 'down',
      target: { x: 2, y: 2 }
    });
    expect(resolver.getDiagnostics().queuedDirection).toBeNull();
  });

  test('runs forward while retaining one queued turn and consumes it at the first matching opening', () => {
    const maze = createMaze(6, [
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);
    resolver.request(['down']);

    expect(resolver.step(maze, { x: 1, y: 2 })).toMatchObject({
      decision: 'continued',
      target: { x: 2, y: 2 }
    });
    expect(resolver.getDiagnostics().queuedDirection).toBe('down');
    expect(resolver.step(maze, { x: 2, y: 2 })).toMatchObject({
      decision: 'continued',
      target: { x: 3, y: 2 }
    });
    expect(resolver.step(maze, { x: 3, y: 2 })).toMatchObject({
      decision: 'queued-turn',
      target: { x: 3, y: 3 }
    });
  });

  test('replaces the queued turn with the latest request and never builds a command queue', () => {
    const maze = createMaze(6, [
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);
    resolver.request(['down']);
    resolver.request(['up']);

    expect(resolver.getDiagnostics()).toMatchObject({
      activeDirection: 'right',
      queuedDirection: 'up',
      requestedDirections: ['up']
    });
    expect(resolver.step(maze, { x: 2, y: 2 })).toMatchObject({
      decision: 'continued',
      target: { x: 3, y: 2 }
    });
    expect(resolver.step(maze, { x: 3, y: 2 })).toMatchObject({
      decision: 'stopped-awaiting-queued-direction',
      moved: false
    });
  });

  test('sidesteps one tile at a horizontal wall and then resumes the held direction', () => {
    const maze = createMaze(5, [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);
    resolver.step(maze, { x: 1, y: 1 });

    expect(resolver.step(maze, { x: 2, y: 1 })).toMatchObject({
      decision: 'assisted-lane-shift',
      direction: 'down',
      target: { x: 2, y: 2 }
    });
    expect(resolver.getDiagnostics()).toMatchObject({
      activeDirection: 'right',
      assistedLaneShiftCount: 1,
      assistedLaneShiftTileLimit: LEGACY_DIRECTIONAL_INTENT_LANE_SHIFT_TILE_LIMIT
    });
    expect(resolver.step(maze, { x: 2, y: 2 })).toMatchObject({
      decision: 'continued',
      direction: 'right',
      target: { x: 3, y: 2 }
    });
  });

  test('sidesteps one tile at a vertical wall and then resumes the held direction', () => {
    const maze = createMaze(6, [
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 2, y: 4 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['down']);
    resolver.step(maze, { x: 3, y: 1 });

    expect(resolver.step(maze, { x: 3, y: 2 })).toMatchObject({
      decision: 'assisted-lane-shift',
      direction: 'left',
      target: { x: 2, y: 2 }
    });
    expect(resolver.step(maze, { x: 2, y: 2 })).toMatchObject({
      decision: 'continued',
      direction: 'down',
      target: { x: 2, y: 3 }
    });
  });

  test('mirrors one-tile lane shifts for left and up movement', () => {
    const horizontalMaze = createMaze(6, [
      { x: 4, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 2 },
      { x: 2, y: 2 }
    ]);
    const leftResolver = new LegacyDirectionalIntentResolver();
    leftResolver.request(['left']);
    leftResolver.step(horizontalMaze, { x: 4, y: 3 });
    expect(leftResolver.step(horizontalMaze, { x: 3, y: 3 })).toMatchObject({
      decision: 'assisted-lane-shift',
      direction: 'up',
      target: { x: 3, y: 2 }
    });
    expect(leftResolver.step(horizontalMaze, { x: 3, y: 2 })).toMatchObject({
      decision: 'continued',
      direction: 'left',
      target: { x: 2, y: 2 }
    });

    const verticalMaze = createMaze(6, [
      { x: 2, y: 4 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 2 }
    ]);
    const upResolver = new LegacyDirectionalIntentResolver();
    upResolver.request(['up']);
    upResolver.step(verticalMaze, { x: 2, y: 4 });
    expect(upResolver.step(verticalMaze, { x: 2, y: 3 })).toMatchObject({
      decision: 'assisted-lane-shift',
      direction: 'right',
      target: { x: 3, y: 3 }
    });
    expect(upResolver.step(verticalMaze, { x: 3, y: 3 })).toMatchObject({
      decision: 'continued',
      direction: 'up',
      target: { x: 3, y: 2 }
    });
  });

  test('stops when both one-tile lane shifts could resume the held direction', () => {
    const maze = createMaze(5, [
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 2, y: 3 },
      { x: 3, y: 3 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);
    resolver.step(maze, { x: 1, y: 2 });

    expect(resolver.step(maze, { x: 2, y: 2 })).toMatchObject({
      decision: 'stopped-at-ambiguous-lane-shift',
      moved: false
    });
  });

  test('refuses a detour that cannot resume the held lane after one side tile', () => {
    const maze = createMaze(6, [
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 2, y: 4 },
      { x: 3, y: 4 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);
    resolver.step(maze, { x: 1, y: 2 });

    expect(resolver.step(maze, { x: 2, y: 2 })).toMatchObject({
      decision: 'stopped-at-dead-end',
      moved: false
    });
  });

  test('stops at a dead end rather than reversing without explicit input', () => {
    const maze = createMaze(5, [
      { x: 1, y: 2 },
      { x: 2, y: 2 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);
    resolver.step(maze, { x: 1, y: 2 });

    expect(resolver.step(maze, { x: 2, y: 2 })).toMatchObject({
      decision: 'stopped-at-dead-end',
      moved: false
    });
  });

  test('admits an explicit reverse request at a dead end', () => {
    const maze = createMaze(5, [
      { x: 1, y: 2 },
      { x: 2, y: 2 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);
    resolver.step(maze, { x: 1, y: 2 });
    resolver.request(['left']);

    expect(resolver.step(maze, { x: 2, y: 2 })).toMatchObject({
      decision: 'queued-turn',
      direction: 'left',
      target: { x: 1, y: 2 }
    });
  });

  test('treats a legal paired wrap as the same directional continuation', () => {
    const maze = createMaze(5, [
      { x: 4, y: 2 },
      { x: 0, y: 2 }
    ], { x: 4, y: 2 }, { x: 0, y: 2 });
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);

    expect(resolver.step(maze, { x: 4, y: 2 })).toMatchObject({
      decision: 'continued',
      direction: 'right',
      target: { x: 0, y: 2 }
    });
  });

  test('release synchronization clears stale queued intent and prevents phantom movement', () => {
    const maze = createMaze(5, [
      { x: 1, y: 2 },
      { x: 2, y: 2 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right', 'down']);
    resolver.synchronize([]);

    expect(resolver.getDiagnostics()).toMatchObject({
      activeDirection: null,
      queuedDirection: null,
      requestedDirections: [],
      lastDecision: 'idle'
    });
    expect(resolver.step(maze, { x: 1, y: 2 })).toMatchObject({
      decision: 'idle',
      moved: false
    });
  });
});
