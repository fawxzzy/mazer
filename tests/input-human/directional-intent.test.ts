import { describe, expect, test } from 'vitest';
import {
  LEGACY_DIRECTIONAL_INTENT_LANE_SHIFT_TILE_LIMIT,
  LegacyDirectionalIntentResolver,
  resolveLegacyAnalogCardinalDirectionsFromVector
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
  test('ranks every continuous analog vector by its actual axis projection without sectors', () => {
    expect(resolveLegacyAnalogCardinalDirectionsFromVector(0.18, 0.96)).toEqual(['down', 'right']);
    expect(resolveLegacyAnalogCardinalDirectionsFromVector(-0.2, -0.94)).toEqual(['up', 'left']);
    expect(resolveLegacyAnalogCardinalDirectionsFromVector(0.98, -0.16)).toEqual(['right', 'up']);
    expect(resolveLegacyAnalogCardinalDirectionsFromVector(-0.92, 0.22)).toEqual(['left', 'down']);
    expect(resolveLegacyAnalogCardinalDirectionsFromVector(0.65, 0.85)).toEqual(['down', 'right']);
    expect(resolveLegacyAnalogCardinalDirectionsFromVector(0.72, 0.7)).toEqual(['right', 'down']);
  });

  test('uses continuous vertical stick intent to follow a one-tile horizontal corridor jog', () => {
    const maze = createMaze(6, [
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 2, y: 4 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.requestAnalog(-0.19, 0.97);
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

  test('turns directly up at a T as soon as the live vector favors up over the current lane', () => {
    const maze = createMaze(6, [
      { x: 1, y: 3 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 2, y: 2 },
      { x: 2, y: 1 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.requestAnalog(1, 0);
    resolver.step(maze, { x: 1, y: 3 });
    resolver.requestAnalog(0.18, -0.98);

    expect(resolver.step(maze, { x: 2, y: 3 })).toMatchObject({
      decision: 'steered-turn',
      direction: 'up',
      target: { x: 2, y: 2 }
    });
    expect(resolver.getDiagnostics()).toMatchObject({
      activeDirection: 'up',
      inputMode: 'analog',
      queuedDirection: null,
      requestedDirections: ['up', 'right']
    });
  });

  test('retains the full live vector when the ranked axes stay in the same order', () => {
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.requestAnalog(0.18, -0.98);
    const first = resolver.getDiagnostics().analogVector;
    resolver.requestAnalog(0.52, -0.85);
    const second = resolver.getDiagnostics().analogVector;

    expect(first).not.toEqual(second);
    expect(second?.x).toBeGreaterThan(first?.x ?? 0);
    expect(resolver.getDiagnostics()).toMatchObject({
      inputMode: 'analog',
      requestedDirections: ['up', 'right']
    });
  });

  test('uses the best legal projection through a corner instead of sticking to the blocked axis', () => {
    const maze = createMaze(6, [
      { x: 2, y: 4 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.requestAnalog(0.38, -0.92);
    resolver.step(maze, { x: 2, y: 4 });

    expect(resolver.step(maze, { x: 2, y: 3 })).toMatchObject({
      decision: 'steered-turn',
      direction: 'right',
      target: { x: 3, y: 3 }
    });
  });

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

  test('keeps the dominant direction through a T opening until the player decisively retargets', () => {
    const maze = createMaze(6, [
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 3 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);
    resolver.step(maze, { x: 1, y: 2 });
    resolver.request(['right', 'down']);

    expect(resolver.step(maze, { x: 2, y: 2 })).toMatchObject({
      decision: 'continued',
      direction: 'right',
      target: { x: 3, y: 2 }
    });
  });

  test('uses a secondary pull only for a one-tile jog and then resumes the dominant direction', () => {
    const maze = createMaze(6, [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);
    resolver.step(maze, { x: 1, y: 1 });
    resolver.request(['right', 'down']);

    expect(resolver.step(maze, { x: 2, y: 1 })).toMatchObject({
      decision: 'assisted-lane-shift',
      direction: 'down',
      target: { x: 2, y: 2 }
    });
    expect(resolver.step(maze, { x: 2, y: 2 })).toMatchObject({
      decision: 'continued',
      direction: 'right',
      target: { x: 3, y: 2 }
    });
  });

  test('takes a decisively retargeted branch immediately at a T opening', () => {
    const maze = createMaze(6, [
      { x: 2, y: 3 },
      { x: 2, y: 2 },
      { x: 2, y: 1 },
      { x: 3, y: 2 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['up']);
    resolver.step(maze, { x: 2, y: 3 });
    resolver.request(['right', 'up']);

    expect(resolver.step(maze, { x: 2, y: 2 })).toMatchObject({
      decision: 'queued-turn',
      direction: 'right',
      target: { x: 3, y: 2 }
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

  test('chooses one stable one-tile shift when both sides can resume the held direction', () => {
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
      decision: 'assisted-lane-shift',
      direction: 'up',
      moved: true,
      target: { x: 2, y: 1 }
    });
    expect(resolver.step(maze, { x: 2, y: 1 })).toMatchObject({
      decision: 'continued',
      direction: 'right',
      target: { x: 3, y: 1 }
    });
  });

  test('can disable one-tile assistance without changing direct movement', () => {
    const maze = createMaze(5, [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);
    resolver.step(maze, { x: 1, y: 1 });

    expect(resolver.step(maze, { x: 2, y: 1 }, { assistedLaneShiftEnabled: false })).toMatchObject({
      decision: 'stopped-assistance-disabled',
      moved: false
    });
  });

  test('cannot chain another assisted side-step before the held lane resumes', () => {
    const maze = createMaze(5, [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);
    resolver.step(maze, { x: 1, y: 1 });
    resolver.step(maze, { x: 2, y: 1 });

    expect(resolver.step(maze, { x: 2, y: 1 })).toMatchObject({
      decision: 'stopped-at-assist-limit',
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
