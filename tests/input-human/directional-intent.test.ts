import { describe, expect, test } from 'vitest';
import {
  LEGACY_DIRECTIONAL_INTENT_ASSISTED_TURN_LIMIT,
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

  test('assists only the single non-reversing continuation at an unambiguous corner', () => {
    const maze = createMaze(5, [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);
    resolver.step(maze, { x: 1, y: 1 });

    expect(resolver.step(maze, { x: 2, y: 1 })).toMatchObject({
      decision: 'assisted-corner',
      direction: 'down',
      target: { x: 2, y: 2 }
    });
  });

  test('stops at a genuine intersection instead of choosing an arbitrary branch', () => {
    const maze = createMaze(5, [
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 1 },
      { x: 2, y: 3 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);
    resolver.step(maze, { x: 1, y: 2 });

    expect(resolver.step(maze, { x: 2, y: 2 })).toMatchObject({
      decision: 'stopped-at-intersection',
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

  test('bounds automatic zigzag assistance and then requires fresh intent', () => {
    const maze = createMaze(8, [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 4, y: 4 }
    ]);
    const resolver = new LegacyDirectionalIntentResolver();
    resolver.request(['right']);
    const points = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 3 }
    ];
    const steps = points.map((point) => resolver.step(maze, point));

    expect(steps.filter((step) => step.decision === 'assisted-corner')).toHaveLength(
      LEGACY_DIRECTIONAL_INTENT_ASSISTED_TURN_LIMIT
    );
    expect(steps.at(-1)).toMatchObject({
      decision: 'stopped-at-assist-limit',
      moved: false
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
