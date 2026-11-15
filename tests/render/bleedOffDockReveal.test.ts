import { describe, expect, test } from 'vitest';
import {
  buildRankGrid,
  composeBoardTileRevealSoft,
  type BoardSoftRevealContext2D
} from '../../src/render/boardTileLayer';
import { computeBoardTileLayout } from '../../src/render/boardTileBake';
import { MazeRevealDriver, type MazeRevealClock } from '../../src/render/mazeRevealDriver';
import {
  MAZE_DOCK_FADE_MS,
  resolveCellRevealExtent,
  resolveCellStartMs,
  resolveDockGrowMs,
  resolveDockReachExtent,
  resolveMazeRevealFrame,
  resolveMazeRevealWindow,
  type MazeRevealDirection
} from '../../src/render/mazeRevealTimeline';
import { inputFor, wrapDockMaze } from './support/boardTileFixtures';

// A dock is three cells long (BOARD_TILE_GEOMETRY.dockDefaultLengthTiles).
const DOCK_CELLS = 3;
const COUNTS = [1, 2, 30, 373, 1000, 4000];
const sample = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  for (let ms = from; ms <= to; ms += step) out.push(ms);
  return out;
};

describe('bleed-off docks ride the build / tear-down sequence', () => {
  test('build: a dock starts the instant its border cell is whole and never before; it is whole one dock-growth later', () => {
    for (const count of COUNTS) {
      const window = resolveMazeRevealWindow('build', count);
      const growMs = resolveDockGrowMs(window, DOCK_CELLS);
      for (const rank of [0, Math.floor(count / 2), count - 1]) {
        const cellDone = resolveCellStartMs('build', window, rank, count) + window.rampMs;
        expect(resolveDockReachExtent('build', window, rank, count, DOCK_CELLS, cellDone - 0.01)).toBe(0);
        expect(resolveDockReachExtent('build', window, rank, count, DOCK_CELLS, cellDone)).toBe(0);
        expect(resolveDockReachExtent('build', window, rank, count, DOCK_CELLS, cellDone + (growMs / 2))).toBeCloseTo(0.5, 5);
        expect(resolveDockReachExtent('build', window, rank, count, DOCK_CELLS, cellDone + growMs)).toBe(1);
      }
    }
  });

  test('a dock only ever exists while the cell that owns it is whole (build and tear-down, every maze size)', () => {
    for (const direction of ['build', 'deconstruct'] as MazeRevealDirection[]) {
      for (const count of COUNTS) {
        const window = resolveMazeRevealWindow(direction, count);
        for (const rank of [0, 1, Math.floor(count / 3), count - 1]) {
          const r = Math.min(rank, count - 1);
          for (const ms of sample(0, window.endMs + MAZE_DOCK_FADE_MS, 7)) {
            const reach = resolveDockReachExtent(direction, window, r, count, DOCK_CELLS, ms);
            if (reach > 0) {
              expect(resolveCellRevealExtent(direction, window, r, count, ms)).toBe(1);
            }
          }
        }
      }
    }
  });

  test('docks are drawn out in rank order: an earlier cell never gets its dock after a later cell does (build), and the reverse on tear-down', () => {
    const count = 373;
    const ranks = [3, 40, 41, 150, 372];
    for (const direction of ['build', 'deconstruct'] as MazeRevealDirection[]) {
      const window = resolveMazeRevealWindow(direction, count);
      const firstSeen = ranks.map((rank) => {
        for (const ms of sample(0, window.endMs + MAZE_DOCK_FADE_MS, 1)) {
          const reach = resolveDockReachExtent(direction, window, rank, count, DOCK_CELLS, ms);
          if (direction === 'build' ? reach > 0 : reach < 1) return ms;
        }
        return Number.POSITIVE_INFINITY;
      });
      for (let index = 1; index < ranks.length; index += 1) {
        if (direction === 'build') {
          expect(firstSeen[index]!).toBeGreaterThan(firstSeen[index - 1]!);
        } else {
          expect(firstSeen[index]!).toBeLessThan(firstSeen[index - 1]!);
        }
      }
    }
  });

  test('growth is linear at the speed of the line (one cell length per rank step) and monotonic; the tear-down is the build run backwards', () => {
    const count = 373;
    const build = resolveMazeRevealWindow('build', count);
    const decon = resolveMazeRevealWindow('deconstruct', count);
    expect(resolveDockGrowMs(build, DOCK_CELLS)).toBeCloseTo(build.rampMs * DOCK_CELLS, 9);
    const rank = 200;
    const growMs = resolveDockGrowMs(build, DOCK_CELLS);
    let previous = 0;
    for (const ms of sample(0, build.endMs + MAZE_DOCK_FADE_MS, 3)) {
      const reach = resolveDockReachExtent('build', build, rank, count, DOCK_CELLS, ms);
      expect(reach).toBeGreaterThanOrEqual(previous);
      previous = reach;
    }
    const cellDone = resolveCellStartMs('build', build, rank, count) + build.rampMs;
    expect(resolveDockReachExtent('build', build, rank, count, DOCK_CELLS, cellDone + (growMs * 0.25))).toBeCloseTo(0.25, 5);
    expect(resolveDockReachExtent('build', build, rank, count, DOCK_CELLS, cellDone + (growMs * 0.75))).toBeCloseTo(0.75, 5);
    // Tear-down: gone exactly when the owner starts to shrink, whole a dock-growth before, and never grows back.
    const ownerGoes = resolveCellStartMs('deconstruct', decon, rank, count);
    const growBack = resolveDockGrowMs(decon, DOCK_CELLS);
    expect(resolveDockReachExtent('deconstruct', decon, rank, count, DOCK_CELLS, ownerGoes)).toBe(0);
    expect(resolveDockReachExtent('deconstruct', decon, rank, count, DOCK_CELLS, ownerGoes - growBack)).toBe(1);
    expect(resolveDockReachExtent('deconstruct', decon, rank, count, DOCK_CELLS, ownerGoes - (growBack * 0.25))).toBeCloseTo(0.25, 5);
    previous = 1;
    for (const ms of sample(0, decon.endMs, 3)) {
      const reach = resolveDockReachExtent('deconstruct', decon, rank, count, DOCK_CELLS, ms);
      expect(reach).toBeLessThanOrEqual(previous);
      previous = reach;
    }
  });

  test('the last dock is whole inside the build frame (end + dock fade), so nothing is cut when the frame ends; tear-down docks are gone by the window end', () => {
    for (const count of COUNTS) {
      const build = resolveMazeRevealWindow('build', count);
      expect(resolveDockGrowMs(build, DOCK_CELLS)).toBeLessThanOrEqual(MAZE_DOCK_FADE_MS);
      expect(resolveDockReachExtent('build', build, count - 1, count, DOCK_CELLS, build.endMs + MAZE_DOCK_FADE_MS)).toBe(1);
      expect(resolveMazeRevealFrame('build', build.endMs + MAZE_DOCK_FADE_MS - 1, count, false)).not.toBeNull();
      const decon = resolveMazeRevealWindow('deconstruct', count);
      for (const rank of [0, count - 1]) {
        expect(resolveDockReachExtent('deconstruct', decon, rank, count, DOCK_CELLS, decon.endMs)).toBe(0);
      }
    }
  });

  test('a cell outside the reveal order never shows a dock; bad inputs are safe and the result is deterministic', () => {
    const window = resolveMazeRevealWindow('build', 100);
    expect(resolveDockReachExtent('build', window, -1, 100, DOCK_CELLS, 99999)).toBe(0);
    expect(Number.isFinite(resolveDockReachExtent('build', window, 5, 100, Number.NaN, 700))).toBe(true);
    expect(resolveDockReachExtent('build', window, 5, 100, DOCK_CELLS, Number.NaN)).toBe(0);
    const again = resolveMazeRevealWindow('build', 100);
    for (const ms of sample(0, 4000, 11)) {
      expect(resolveDockReachExtent('build', again, 37, 100, DOCK_CELLS, ms)).toBe(resolveDockReachExtent('build', window, 37, 100, DOCK_CELLS, ms));
    }
  });
});

describe('driver: the soft reveal hands the layer one reach per dock, read from the rank grid', () => {
  const cols = 6;
  const rows = 1;
  const order = Array.from({ length: cols }, (_, x) => ({ x, y: 0 }));
  const ranks = buildRankGrid(order, cols, rows);
  const clock = (over: Partial<MazeRevealClock>): MazeRevealClock => ({
    phase: 'building', introStartedAtMs: 0, deconstructStartedAtMs: null, time: 0, tileCount: cols, reducedMotion: false, ...over
  });

  test('build: docks of low-rank cells come out first, one by one, never all at once', () => {
    const driver = new MazeRevealDriver();
    const window = resolveMazeRevealWindow('build', cols);
    const seen: number[] = [];
    for (const ms of sample(0, window.endMs + MAZE_DOCK_FADE_MS - 1, 5)) {
      driver.update(clock({ time: ms }));
      const reveal = driver.resolveBoardReveal(ranks, cols, rows);
      expect(reveal?.kind).toBe('soft');
      if (reveal?.kind !== 'soft') continue;
      const reaches = order.map((cell) => reveal.dockReach(cell.x, cell.y, DOCK_CELLS));
      for (let index = 1; index < reaches.length; index += 1) {
        // A later cell never has more of its dock out than an earlier one.
        expect(reaches[index]!).toBeLessThanOrEqual(reaches[index - 1]! + 1e-9);
      }
      seen.push(reaches.filter((reach) => reach > 0 && reach < 1).length);
    }
    expect(Math.max(...seen)).toBeGreaterThan(0);
  });

  test('tear-down: the last cells lose their docks first, and reduced motion has no soft reveal at all', () => {
    const driver = new MazeRevealDriver();
    const window = resolveMazeRevealWindow('deconstruct', cols);
    driver.update(clock({ phase: 'deconstructing', introStartedAtMs: null, deconstructStartedAtMs: 0, time: window.startMs + window.rampMs }));
    const reveal = driver.resolveBoardReveal(ranks, cols, rows);
    if (reveal?.kind !== 'soft') throw new Error('expected a soft reveal');
    expect(reveal.dockReach(cols - 1, 0, DOCK_CELLS)).toBe(0);
    expect(reveal.dockReach(0, 0, DOCK_CELLS)).toBe(1);
    const reduced = new MazeRevealDriver();
    reduced.update(clock({ time: 300, reducedMotion: true }));
    expect(reduced.resolveBoardReveal(ranks, cols, rows)).toBeNull();
  });
});

describe('board composite: each dock is drawn on its own, flush with the board edge', () => {
  const { grid, docks } = wrapDockMaze();
  const layout = computeBoardTileLayout(inputFor(grid, { docks }));
  const stride = layout.cols + 2;
  const leftDock = layout.docks.find((dock) => dock.side === 'left')!;
  // A second dock on the left edge, three cells below the first.
  const second = { ...leftDock, y: leftDock.y + 3 };
  const twoOnLeft = { ...layout, docks: [...layout.docks, second] };

  const draw = (use: typeof layout, reach: (x: number, y: number, lengthCells: number) => number) => {
    const clears: number[][] = [];
    const strips: number[][] = [];
    const calls: number[][] = [];
    const ctx = {
      set globalAlpha(_value: number) { throw new Error('the composite must never fade'); },
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      save() {},
      restore() {},
      setTransform() {},
      clearRect(...rect: number[]) { clears.push(rect); },
      beginPath() {},
      rect() {},
      clip() {},
      fill() {},
      drawImage(_image: unknown, ...rest: number[]) { if (rest.length === 8) strips.push(rest); }
    } as unknown as BoardSoftRevealContext2D;
    composeBoardTileRevealSoft(ctx, {}, {
      layout: use,
      cellExtent: new Uint8ClampedArray(stride * (use.rows + 2)).fill(255),
      dockReach: (x, y, cells) => { calls.push([x, y, cells]); return reach(x, y, cells); }
    });
    return { clears, strips, calls };
  };

  test('the reach is asked per dock cell, with the dock length in cells', () => {
    const { calls } = draw(layout, () => 1);
    expect(calls).toHaveLength(layout.docks.length);
    for (const dock of layout.docks) {
      const call = calls.find(([x, y]) => x === dock.x && y === dock.y)!;
      expect(call[2]).toBeCloseTo(dock.length / layout.tileSize, 9);
      expect(call[2]).toBeCloseTo(DOCK_CELLS, 6);
    }
  });

  test('docks grow independently: one fully out, one half way, one not started, one out', () => {
    const rightDock = layout.docks.find((dock) => dock.side === 'right')!;
    const topDock = layout.docks.find((dock) => dock.side === 'top')!;
    const { strips } = draw(layout, (x, y) => {
      if (x === leftDock.x && y === leftDock.y) return 1;
      if (x === rightDock.x && y === rightDock.y) return 0.5;
      if (x === topDock.x && y === topDock.y) return 0;
      return 1;
    });
    // 4 docks, one of them not started: 3 draws.
    expect(strips).toHaveLength(3);
    const boardRight = layout.originX + layout.boardWidth;
    const rightStrip = strips.find((strip) => Math.abs(strip[0]! / layout.scale - boardRight) < 1e-6)!;
    const leftStrip = strips.find((strip) => strip[0] === 0)!;
    // The half grown right dock is exactly half its length deep (width of the strip slice); the left one is the whole strip.
    expect(rightStrip[2]!).toBe(Math.round(rightDock.length * layout.scale * 0.5));
    expect(rightStrip[2]!).toBeLessThan(leftStrip[2]!);
  });

  test('two docks on one side split the strip at the line between them: disjoint, together covering the strip, nothing drawn twice', () => {
    const { strips, clears } = draw(twoOnLeft, () => 1);
    const left = strips.filter((strip) => strip[0] === 0);
    expect(left).toHaveLength(2);
    const [upper, lower] = left.sort((p, q) => p[1]! - q[1]!) as [number[], number[]];
    // Source rects are in device px: they touch exactly, from the strip top to the strip bottom.
    expect(upper[1]!).toBe(0);
    expect(upper[1]! + upper[3]!).toBe(lower[1]!);
    expect(lower[1]! + lower[3]!).toBe(Math.round(layout.height * layout.scale));
    // The line between the docks sits on a cell edge between the two dock rows.
    const edge = lower[1]! / layout.scale;
    expect(edge).toBeGreaterThan(layout.originY + layout.ys[leftDock.y]!);
    expect(edge).toBeLessThanOrEqual(layout.originY + layout.ys[second.y]!);
    // The whole strip was cleared once, before the dock draws.
    expect(clears.length).toBeGreaterThanOrEqual(2);
    // Destination rects mirror the source (1:1 device pixels, no stretch).
    for (const strip of left) {
      expect(strip[4]! * layout.scale).toBeCloseTo(strip[0]!, 6);
      expect(strip[5]! * layout.scale).toBeCloseTo(strip[1]!, 6);
      expect(strip[6]! * layout.scale).toBeCloseTo(strip[2]!, 6);
      expect(strip[7]! * layout.scale).toBeCloseTo(strip[3]!, 6);
    }
  });

  test('a dock that has not started is cleared but not drawn (nothing of it pops in)', () => {
    const { strips, clears } = draw(twoOnLeft, () => 0);
    expect(strips).toHaveLength(0);
    expect(clears.length).toBeGreaterThanOrEqual(5);
  });

  test('the shown part of a growing dock is anchored at the board edge on every side', () => {
    const { strips } = draw(layout, () => 0.5);
    expect(strips).toHaveLength(4);
    const boardRight = layout.originX + layout.boardWidth;
    const boardBottom = layout.originY + layout.boardHeight;
    const edges = strips.map((strip) => ({
      left: (strip[0]! + strip[2]!) / layout.scale,
      right: strip[0]! / layout.scale,
      top: (strip[1]! + strip[3]!) / layout.scale,
      bottom: strip[1]! / layout.scale
    }));
    expect(edges.some((edge) => Math.abs(edge.left - layout.originX) < 1e-6)).toBe(true);
    expect(edges.some((edge) => Math.abs(edge.right - boardRight) < 1e-6)).toBe(true);
    expect(edges.some((edge) => Math.abs(edge.top - layout.originY) < 1e-6)).toBe(true);
    expect(edges.some((edge) => Math.abs(edge.bottom - boardBottom) < 1e-6)).toBe(true);
  });
});
