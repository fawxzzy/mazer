import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createLegacyMaze, resolveLegacyPlayableShortestPath, type LegacyMazeGenerationProfile } from '../../src/legacy-runtime/legacyMaze';
import { resolveEndpointTile } from '../../src/render/endpointTiles';
import {
  DEFAULT_START_DIRECTION,
  START_DIRECTIONS,
  resolveStartDirection,
  resolveStepDirection,
  type StartDirection
} from '../../src/render/startDirection';

/**
 * The start tile's play arrow points the way the player will first move, so it reads as the player emerging from it.
 * Derived from the maze: the first step of the real (wrap-aware) solution path, which for a start with one open side is
 * that open side. Level 1 is the corridor: portrait = down, landscape = right.
 */
const CORRIDOR_PROFILE: Partial<LegacyMazeGenerationProfile> = { layout: 'corridor' };
const grid = (rows: string[]): boolean[][] => rows.map((row) => [...row].map((c) => c !== '#'));
const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n?/g, '\n');

describe('resolveStartDirection: all four directions, from the start cell to its open neighbour', () => {
  // one open side each; the goal is at the far end of the corridor
  const cases: Array<[StartDirection, string[], { x: number; y: number }, { x: number; y: number }]> = [
    ['right', ['#####', '#S..G', '#####'], { x: 1, y: 1 }, { x: 4, y: 1 }],
    ['left', ['#####', 'G..S#', '#####'], { x: 3, y: 1 }, { x: 0, y: 1 }],
    ['down', ['###', '#S#', '#.#', '#.#', '#G#'], { x: 1, y: 1 }, { x: 1, y: 4 }],
    ['up', ['#G#', '#.#', '#.#', '#S#', '###'], { x: 1, y: 3 }, { x: 1, y: 0 }]
  ];

  test.each(cases)('%s', (direction, rows, start, goal) => {
    const g = grid(rows.map((row) => row.replace(/[SG]/g, '.')));
    expect(resolveStartDirection(g, start, goal)).toBe(direction);
    // with no goal it falls back to the single open side, so the answer is the same
    expect(resolveStartDirection(g, start, null)).toBe(direction);
    expect(resolveStartDirection(g, start)).toBe(direction);
  });

  test('with several open sides it follows the FIRST STEP OF THE SOLUTION PATH, not the first open side', () => {
    // from (1,1) both right and down are open; the goal is down the left column, so the path starts down
    const g = grid([
      '#####',
      '#...#',
      '#.#.#',
      '#.#.#',
      '#...#',
      '#####'
    ]);
    expect(resolveStartDirection(g, { x: 1, y: 1 }, { x: 1, y: 4 })).toBe('down');
    // and from the same cell to a goal reached around the right column it goes right
    const g2 = grid([
      '#####',
      '#...#',
      '###.#',
      '###.#',
      '#...#',
      '#####'
    ]);
    expect(resolveStartDirection(g2, { x: 1, y: 1 }, { x: 1, y: 4 })).toBe('right');
  });

  test('the answer is the first step of the real playable shortest path for every floor cell of a generated maze', () => {
    const maze = createLegacyMaze(25, 51, 1337);
    let checked = 0;
    for (let y = 0; y < maze.grid.length && checked < 120; y += 1) {
      for (let x = 0; x < maze.grid[0]!.length && checked < 120; x += 1) {
        if (!maze.grid[y]![x] || (x === maze.goal.x && y === maze.goal.y)) continue;
        const route = resolveLegacyPlayableShortestPath(maze.grid, { x, y }, maze.goal);
        if (!route.found || route.path.length < 2) continue;
        expect(resolveStartDirection(maze.grid, { x, y }, maze.goal), `${x},${y}`).toBe(resolveStepDirection({ x, y }, route.path[1]!));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  test('a wrapped first step is travel in that direction, not the jump across the board', () => {
    expect(resolveStepDirection({ x: 0, y: 3 }, { x: 24, y: 3 })).toBe('left');
    expect(resolveStepDirection({ x: 24, y: 3 }, { x: 0, y: 3 })).toBe('right');
    expect(resolveStepDirection({ x: 5, y: 0 }, { x: 5, y: 50 })).toBe('up');
    expect(resolveStepDirection({ x: 5, y: 50 }, { x: 5, y: 0 })).toBe('down');
    expect(resolveStepDirection({ x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
  });

  test('a start with nothing around it is the default direction (right), deterministically', () => {
    expect(resolveStartDirection(grid(['###', '#.#', '###']), { x: 1, y: 1 }, { x: 1, y: 1 })).toBe(DEFAULT_START_DIRECTION);
    expect(DEFAULT_START_DIRECTION).toBe('right');
    expect(START_DIRECTIONS).toEqual(['up', 'right', 'down', 'left']);
  });
});

describe('Level 1 corridor: the arrow points the way the player walks', () => {
  test.each([
    ['portrait 25x51', 25, 51, 'down'],
    ['portrait 27x45', 27, 45, 'down'],
    ['landscape 51x25', 51, 25, 'right'],
    ['landscape 43x29', 43, 29, 'right']
  ] as const)('%s: %s', (_label, width, height, expected) => {
    for (const seed of [1, 7, 1337, 99999]) {
      const maze = createLegacyMaze(width, height, seed, undefined, CORRIDOR_PROFILE);
      expect(resolveStartDirection(maze.grid, maze.start, maze.goal), `seed ${seed}`).toBe(expected);
      // and it is the open side: the neighbour in that direction is floor
      const delta = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }[expected];
      expect(maze.grid[maze.start.y + delta[1]]?.[maze.start.x + delta[0]]).toBe(true);
    }
  });
});

describe('the marker geometry follows the direction', () => {
  const tile = { left: 100, top: 100, width: 40, height: 40, radii: [8, 8, 8, 8] as const, fill: { left: 101, top: 101, width: 38, height: 38 }, fillRadii: [7, 7, 7, 7] as const };

  test.each(START_DIRECTIONS)('%s: the apex is on the %s side of the centre and the flat side is behind it', (direction) => {
    const spec = resolveEndpointTile('start', { ...tile, direction }, 3);
    const play = spec.play!;
    expect(play.direction).toBe(direction);
    const cx = 120; const cy = 120;
    const along = (x: number, y: number): number => ({ right: x - cx, left: cx - x, down: y - cy, up: cy - y })[direction];
    const across = (x: number, y: number): number => ({ right: y - cy, left: cy - y, down: cx - x, up: x - cx })[direction];
    // apex ahead of the centre, the two base corners behind it and level with each other
    expect(along(play.cx, play.cy)).toBeGreaterThan(0);
    expect(along(play.ax, play.ay)).toBeLessThan(0);
    expect(along(play.bx, play.by)).toBeCloseTo(along(play.ax, play.ay), 9);
    expect(across(play.cx, play.cy)).toBeCloseTo(0, 9);
    expect(across(play.ax, play.ay) + across(play.bx, play.by)).toBeCloseTo(0, 9);
    // the same triangle in every direction: a pure rotation (side lengths are equal)
    const right = resolveEndpointTile('start', { ...tile, direction: 'right' }, 3).play!;
    const side = (p: typeof play): number[] => [
      Math.hypot(p.ax - p.bx, p.ay - p.by), Math.hypot(p.bx - p.cx, p.by - p.cy), Math.hypot(p.cx - p.ax, p.cy - p.ay)
    ];
    side(play).forEach((len, i) => expect(len).toBeCloseTo(side(right)[i]!, 9));
  });

  test('no direction given: the arrow points right (the Guide icon and the Trace-free standalone cell)', () => {
    expect(resolveEndpointTile('start', tile, 3).play!.direction).toBe('right');
  });

  test('the goal ignores the direction', () => {
    expect(resolveEndpointTile('goal', { ...tile, direction: 'down' }, 3).play).toBeNull();
  });
});

describe('wiring: the layer resolves the direction from the maze and the scene paints from it', () => {
  test('BoardTileLayer sets start.direction from the grid, start and goal on every rebake', () => {
    const layer = read('src/render/boardTileLayer.ts');
    expect(layer).toContain("from './startDirection'");
    expect(layer).toContain('direction: resolveStartDirection(frame.grid, frame.start, frame.goal)');
  });

  test('the Guide start icon is the same draw with no direction (right)', () => {
    const scene = read('src/scenes/MenuScene.ts');
    const fn = scene.slice(scene.indexOf('private drawLegacyGuideBoardMarker('), scene.indexOf('private drawLegacyGuideChipCells('));
    expect(fn).not.toContain('startTile');
    expect(fn).not.toContain('direction');
  });
});
