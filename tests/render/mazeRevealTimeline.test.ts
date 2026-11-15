import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  computeParentDirections,
  computeRevealMaskExtent,
  MazeRevealMaskBuilder,
  WALL_OPEN_FROM
} from '../../src/render/boardRevealMask';
import {
  composeBoardTileRevealSoft,
  buildRankGrid,
  type BoardSoftRevealContext2D
} from '../../src/render/boardTileLayer';
import { computeBoardTileLayout } from '../../src/render/boardTileBake';
import {
  INTRO_BUILD_START_MS,
  INTRO_LASER_MS,
  OUTRO_EDGE_PATHS_OFF_MS,
  OUTRO_TILES_START_MS,
  resolveIntro,
  resolveIntroDeconstruct,
  resolveIntroRevealEndMs,
  resolveIntroRevealMs,
  resolveOutroRemoveMs,
  resolveOutroTilesEndMs,
  INTRO_REDUCED_MOTION_MS,
  OUTRO_REDUCED_MOTION_MS
} from '../../src/render/introTimeline';
import {
  MazeRevealDriver,
  resolveMazeMarkerAlpha,
  type MazeRevealClock
} from '../../src/render/mazeRevealDriver';
import {
  MAZE_DOCK_FADE_MS,
  MAZE_MARKER_FADE_MS,
  fillMazeRevealCellExtent,
  resolveCellRevealExtent,
  resolveDockRevealExtent,
  resolveMarkerRevealAlpha,
  resolveMazeRevealFrame,
  resolveMazeRevealWindow,
  resolveReducedBoardFade
} from '../../src/render/mazeRevealTimeline';
import { MOTION_DURATION_MS } from '../../src/render/motionScale';
import { inputFor, wrapDockMaze } from './support/boardTileFixtures';

const COUNTS = [1, 2, 30, 373, 1000, 4000];
const FRAME_MS = 1000 / 60;

describe('maze build / tear-down timeline: windows ride the shipped intro / outro timeline', () => {
  test('the dock slide and marker fade are steps of the motion scale', () => {
    expect(MAZE_DOCK_FADE_MS).toBe(MOTION_DURATION_MS.base);
    expect(MAZE_MARKER_FADE_MS).toBe(INTRO_LASER_MS);
  });

  test.each(COUNTS)('N=%i: the build window is exactly the shipped one (start, end, so unlock and totals are unchanged)', (count) => {
    const window = resolveMazeRevealWindow('build', count);
    expect(window.startMs).toBe(INTRO_BUILD_START_MS);
    expect(window.endMs).toBe(resolveIntroRevealEndMs(count));
    expect(window.endMs - window.startMs).toBe(resolveIntroRevealMs(count));
    // One cell wipes for exactly one rank step: the next cell starts as it finishes.
    expect(window.rampMs).toBeCloseTo((window.endMs - window.startMs) / count, 9);
  });

  test.each(COUNTS)('N=%i: the deconstruct window is exactly the shipped one', (count) => {
    const window = resolveMazeRevealWindow('deconstruct', count);
    expect(window.startMs).toBe(OUTRO_TILES_START_MS);
    expect(window.endMs).toBe(resolveOutroTilesEndMs(count));
    expect(window.endMs - window.startMs).toBe(resolveOutroRemoveMs(count));
  });
});

describe('maze build / tear-down timeline: per-cell extent', () => {
  test.each([30, 373, 1000])('N=%i build: every cell is 0 at the start, 1 at the build end, never shrinks, first cell starts at the window start', (count) => {
    const window = resolveMazeRevealWindow('build', count);
    for (const rank of [0, 1, Math.floor(count / 2), count - 2, count - 1].filter((r) => r >= 0 && r < count)) {
      expect(resolveCellRevealExtent('build', window, rank, count, 0)).toBe(0);
      expect(resolveCellRevealExtent('build', window, rank, count, window.endMs)).toBe(1);
      let previous = 0;
      for (let ms = 0; ms <= window.endMs + 50; ms += 7) {
        const extent = resolveCellRevealExtent('build', window, rank, count, ms);
        expect(extent).toBeGreaterThanOrEqual(previous - 1e-12);
        expect(extent).toBeGreaterThanOrEqual(0);
        expect(extent).toBeLessThanOrEqual(1);
        previous = extent;
      }
    }
    expect(resolveCellRevealExtent('build', window, 0, count, window.startMs)).toBe(0);
    expect(resolveCellRevealExtent('build', window, 0, count, window.startMs + 1)).toBeGreaterThan(0);
  });

  test.each([30, 373, 1000])('N=%i deconstruct: every cell is 1 at the window start, 0 at the end, never grows; the far end goes first', (count) => {
    const window = resolveMazeRevealWindow('deconstruct', count);
    for (const rank of [0, Math.floor(count / 2), count - 1]) {
      expect(resolveCellRevealExtent('deconstruct', window, rank, count, window.startMs)).toBe(1);
      expect(resolveCellRevealExtent('deconstruct', window, rank, count, window.endMs)).toBe(0);
      let previous = 1;
      for (let ms = window.startMs; ms <= window.endMs; ms += 7) {
        const extent = resolveCellRevealExtent('deconstruct', window, rank, count, ms);
        expect(extent).toBeLessThanOrEqual(previous + 1e-12);
        previous = extent;
      }
    }
    const mid = (window.startMs + window.endMs) / 2;
    expect(resolveCellRevealExtent('deconstruct', window, count - 1, count, mid))
      .toBeLessThanOrEqual(resolveCellRevealExtent('deconstruct', window, 0, count, mid));
  });

  test('the tear-down is the build run backwards in time (same rank, same wipe, same easing: the far end leaves first)', () => {
    const count = 373;
    const span = 2000;
    const window = { startMs: 0, endMs: span, rampMs: span / count };
    for (const rank of [0, 100, 250, 372]) {
      for (const fraction of [0.05, 0.3, 0.5, 0.77, 0.95]) {
        const torn = resolveCellRevealExtent('deconstruct', window, rank, count, span * fraction);
        const built = resolveCellRevealExtent('build', window, rank, count, span * (1 - fraction));
        expect(torn).toBeCloseTo(built, 9);
      }
    }
  });

  test('build: a lower rank is never less shown than a higher rank at the same instant (the front moves outward)', () => {
    const count = 500;
    const window = resolveMazeRevealWindow('build', count);
    for (let ms = 0; ms <= window.endMs; ms += 31) {
      let previous = 1;
      for (let rank = 0; rank < count; rank += 17) {
        const extent = resolveCellRevealExtent('build', window, rank, count, ms);
        expect(extent).toBeLessThanOrEqual(previous + 1e-12);
        previous = extent;
      }
    }
  });

  test.each([30, 373, 1000, 4000])('N=%i: the line has no gap at any instant: a cell has started only once every lower rank is whole (so its parent is)', (count) => {
    for (const direction of ['build', 'deconstruct'] as const) {
      const window = resolveMazeRevealWindow(direction, count);
      for (let ms = window.startMs; ms <= window.endMs; ms += 13) {
        for (let rank = 1; rank < count; rank += Math.max(1, Math.floor(count / 40))) {
          const here = resolveCellRevealExtent(direction, window, rank, count, ms);
          const below = resolveCellRevealExtent(direction, window, rank - 1, count, ms);
          if (direction === 'build' && here > 1e-9) expect(below).toBeGreaterThanOrEqual(1 - 1e-9);
          // Deconstruct runs the same line backwards: a lower rank only starts to shrink once every higher rank is gone.
          if (direction === 'deconstruct' && below < 1 - 1e-9) expect(here).toBeLessThanOrEqual(1e-9);
        }
      }
    }
  });

  test('the tip advances at a constant speed: the total shown length grows linearly with time (no easing, no stutter)', () => {
    const count = 400;
    const window = resolveMazeRevealWindow('build', count);
    const total = (ms: number): number => {
      let sum = 0;
      for (let rank = 0; rank < count; rank += 1) sum += resolveCellRevealExtent('build', window, rank, count, ms);
      return sum;
    };
    const t0 = window.startMs + ((window.endMs - window.startMs) * 0.2);
    const t1 = window.startMs + ((window.endMs - window.startMs) * 0.4);
    const t2 = window.startMs + ((window.endMs - window.startMs) * 0.6);
    expect(total(t1) - total(t0)).toBeCloseTo(total(t2) - total(t1), 6);
    expect(total(t1)).toBeCloseTo(count * 0.4, 6);
  });

  test('the front is a point, not a whole-board fade: at any instant at most one cell is mid-wipe', () => {
    const count = 1000;
    const window = resolveMazeRevealWindow('build', count);
    for (const fraction of [0.1, 0.33, 0.5, 0.9]) {
      const ms = window.startMs + ((window.endMs - window.startMs) * fraction);
      let partial = 0;
      for (let rank = 0; rank < count; rank += 1) {
        const extent = resolveCellRevealExtent('build', window, rank, count, ms);
        if (extent > 1e-9 && extent < 1 - 1e-9) partial += 1;
      }
      expect(partial).toBeLessThanOrEqual(1);
    }
  });

  test('the timeline is closed form: the same instant always gives the same extent, in any order', () => {
    const window = resolveMazeRevealWindow('build', 373);
    const a = resolveCellRevealExtent('build', window, 120, 373, 1234.5);
    resolveCellRevealExtent('build', window, 5, 373, 99);
    expect(resolveCellRevealExtent('build', window, 120, 373, 1234.5)).toBe(a);
  });

  test('non-finite inputs never throw and never leave 0..1', () => {
    const window = resolveMazeRevealWindow('build', 100);
    for (const ms of [Number.NaN, -5, Number.POSITIVE_INFINITY]) {
      const extent = resolveCellRevealExtent('build', window, 10, 100, ms);
      expect(extent).toBeGreaterThanOrEqual(0);
      expect(extent).toBeLessThanOrEqual(1);
    }
    expect(resolveCellRevealExtent('build', resolveMazeRevealWindow('build', 1), 0, 1, 5000)).toBe(1);
  });

  test('fillMazeRevealCellExtent writes floors only and leaves walls at 0', () => {
    const ranks = Int32Array.from([0, -1, 1, 2, -1, -1]);
    const out = new Float32Array(6).fill(9);
    fillMazeRevealCellExtent(out, ranks, 3, 'build', resolveMazeRevealWindow('build', 3), 1e9);
    expect(Array.from(out)).toEqual([1, 0, 1, 1, 0, 0]);
  });
});

describe('maze build / tear-down timeline: docks and markers', () => {
  test('docks: build is 0 until the build ends then slides out over the dock slide; deconstruct is 1, then slides back to exactly 0 at the edge-path switch', () => {
    const count = 373;
    const end = resolveIntroRevealEndMs(count);
    expect(resolveDockRevealExtent('build', count, end)).toBe(0);
    expect(resolveDockRevealExtent('build', count, end + MAZE_DOCK_FADE_MS)).toBe(1);
    expect(resolveDockRevealExtent('build', count, end + MAZE_DOCK_FADE_MS / 2)).toBeCloseTo(0.875, 5);
    expect(resolveDockRevealExtent('deconstruct', count, 0)).toBe(1);
    expect(resolveDockRevealExtent('deconstruct', count, OUTRO_EDGE_PATHS_OFF_MS - MAZE_DOCK_FADE_MS)).toBe(1);
    expect(resolveDockRevealExtent('deconstruct', count, OUTRO_EDGE_PATHS_OFF_MS)).toBe(0);
  });

  test('dock slide is inside the existing windows: it never starts before the build ends or ends after the edge paths switch', () => {
    // The strict 0/1 edge-path switch of introTimeline.ts is untouched.
    const count = 373;
    const end = resolveIntroRevealEndMs(count);
    expect(resolveIntro(end - 1, { reducedMotion: false, tileCount: count }).bleedProgress).toBe(0);
    expect(resolveIntro(end, { reducedMotion: false, tileCount: count }).bleedProgress).toBe(1);
    expect(resolveIntroDeconstruct(OUTRO_EDGE_PATHS_OFF_MS - 1, { reducedMotion: false, tileCount: count }).bleedProgress).toBe(1);
    expect(resolveIntroDeconstruct(OUTRO_EDGE_PATHS_OFF_MS, { reducedMotion: false, tileCount: count }).bleedProgress).toBe(0);
  });

  test('markers fade in over the beam flight and never step by more than a few percent per frame', () => {
    const count = 373;
    const end = resolveIntroRevealEndMs(count);
    expect(resolveMarkerRevealAlpha(count, end - 1)).toBe(0);
    expect(resolveMarkerRevealAlpha(count, end + INTRO_LASER_MS)).toBe(1);
    let previous = 0;
    let maxStep = 0;
    for (let ms = end; ms <= end + INTRO_LASER_MS + 50; ms += FRAME_MS) {
      const alpha = resolveMarkerRevealAlpha(count, ms);
      expect(alpha).toBeGreaterThanOrEqual(previous);
      maxStep = Math.max(maxStep, alpha - previous);
      previous = alpha;
    }
    expect(maxStep).toBeLessThan(0.07);
  });
});

describe('maze build / tear-down timeline: frames', () => {
  test('reduced motion has no soft reveal at all (the 200 ms crossfade is the whole effect)', () => {
    expect(resolveMazeRevealFrame('build', 500, 373, true)).toBeNull();
    expect(resolveMazeRevealFrame('deconstruct', 800, 373, true)).toBeNull();
  });

  test('nothing to reveal, or already finished: null (the hard / all path takes over)', () => {
    expect(resolveMazeRevealFrame('build', 500, 0, false)).toBeNull();
    const end = resolveIntroRevealEndMs(373);
    expect(resolveMazeRevealFrame('build', end + MAZE_DOCK_FADE_MS, 373, false)).toBeNull();
    expect(resolveMazeRevealFrame('deconstruct', resolveOutroTilesEndMs(373), 373, false)).toBeNull();
  });

  test('a frame exists for the whole build (including before the first cell) and the dock fade, and keys differ while anything moves', () => {
    const end = resolveIntroRevealEndMs(373);
    expect(resolveMazeRevealFrame('build', 0, 373, false)).not.toBeNull();
    expect(resolveMazeRevealFrame('build', end + MAZE_DOCK_FADE_MS - 1, 373, false)).not.toBeNull();
    const keys = new Set<string>();
    for (let ms = 0; ms < end; ms += FRAME_MS) {
      keys.add(resolveMazeRevealFrame('build', ms, 373, false)!.key);
    }
    expect(keys.size).toBeGreaterThan(100);
    // After the content stopped changing the key stops changing too (no recompose of an identical board).
    const a = resolveMazeRevealFrame('build', end + MAZE_DOCK_FADE_MS - 1, 373, false)!.key;
    const b = resolveMazeRevealFrame('build', end + MAZE_DOCK_FADE_MS - 0.1, 373, false)!.key;
    expect(a.split('|')[0]).toBe(b.split('|')[0]);
  });
});

describe('reduced motion: the 200 ms crossfade is the whole effect', () => {
  test('the board layer fades 0 to 1 on the build and 1 to 0 on the deconstruct over the shipped crossfade length, linearly, no front', () => {
    expect(INTRO_REDUCED_MOTION_MS).toBe(MOTION_DURATION_MS.base);
    expect(resolveReducedBoardFade('build', 0, 373, true)).toBe(0);
    expect(resolveReducedBoardFade('build', INTRO_REDUCED_MOTION_MS / 2, 373, true)).toBeCloseTo(0.5, 6);
    expect(resolveReducedBoardFade('build', INTRO_REDUCED_MOTION_MS, 373, true)).toBeNull();
    expect(resolveReducedBoardFade('deconstruct', 0, 373, true)).toBe(1);
    expect(resolveReducedBoardFade('deconstruct', OUTRO_REDUCED_MOTION_MS / 4, 373, true)).toBeCloseTo(0.75, 6);
    expect(resolveReducedBoardFade('deconstruct', OUTRO_REDUCED_MOTION_MS, 373, true)).toBeNull();
  });

  test('full motion has no board fade (the growing front is used instead)', () => {
    expect(resolveReducedBoardFade('build', 50, 373, false)).toBeNull();
    expect(resolveReducedBoardFade('deconstruct', 50, 373, false)).toBeNull();
    expect(resolveReducedBoardFade('build', 50, 0, true)).toBeNull();
  });

  test('the driver shows the full board at the crossfade alpha, then hands back to the hard state', () => {
    const driver = new MazeRevealDriver();
    const base = { phase: 'deconstructing', introStartedAtMs: null, deconstructStartedAtMs: 1000, tileCount: 373, reducedMotion: true } as const;
    expect(driver.update({ ...base, time: 1100 })).toBe(true);
    expect(driver.current).toBeNull();
    expect(driver.crossfading).toBe(true);
    expect(driver.boardAlpha).toBeCloseTo(0.5, 6);
    expect(driver.resolveBoardReveal(new Int32Array(4), null, 2, 2)).toBeNull();
    expect(driver.update({ ...base, time: 1200 })).toBe(true);
    expect(driver.crossfading).toBe(false);
    expect(driver.boardAlpha).toBe(1);
  });
});

describe('board reveal mask', () => {
  // 5 x 3 grid:  F F W F F / W W W W F / F F F W F  (cols x rows)
  const cols = 5;
  const rows = 3;
  const floor = Uint8Array.from([1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1]);

  test('floor cells keep their own extent; walls and the pad ring open only once the LEAST built floor around them is past 60 %', () => {
    const extent = new Float32Array(cols * rows).fill(1);
    extent[3] = 0.8;
    extent[14] = 0;
    const out = new Uint8ClampedArray((cols + 2) * (rows + 2));
    computeRevealMaskExtent(out, cols, rows, extent, floor);
    const at = (x: number, y: number): number => out[((y + 1) * (cols + 2)) + x + 1]!;
    expect(at(0, 0)).toBe(255);
    expect(at(3, 0)).toBe(204);
    expect(at(4, 2)).toBe(0);
    // wall (2,0): its floor neighbours are (1,0) at 1 and (3,0) at 0.8 -> the least is 0.8 -> (0.8 - 0.6) / 0.4 = half open
    expect(Math.abs(at(2, 0) - 127.5)).toBeLessThanOrEqual(1);
    // wall (0,1): every floor around it is whole -> fully open
    expect(at(0, 1)).toBe(255);
    // pad ring corner (-1,-1) borders only (0,0)
    expect(at(-1, -1)).toBe(255);
    // pad ring far corner borders (4,2), which is not built yet -> closed
    expect(at(cols, rows)).toBe(0);
    // wall (3,2) touches (4,2) (not built): closed, although its other floor neighbours are whole
    expect(at(3, 2)).toBe(0);
  });

  test('a wall never opens in front of a corridor that is still drawing: at or below the gate it is 0', () => {
    const extent = new Float32Array(cols * rows).fill(1);
    extent[3] = WALL_OPEN_FROM;
    const out = new Uint8ClampedArray((cols + 2) * (rows + 2));
    computeRevealMaskExtent(out, cols, rows, extent, floor);
    expect(out[(1 * (cols + 2)) + 3 + 1]).toBe(Math.round(WALL_OPEN_FROM * 255));
    expect(out[(1 * (cols + 2)) + 2 + 1]).toBe(0);
    extent[3] = WALL_OPEN_FROM + 0.01;
    computeRevealMaskExtent(out, cols, rows, extent, floor);
    expect(out[(1 * (cols + 2)) + 2 + 1]).toBeGreaterThan(0);
  });

  test('a floor cell is not lifted by a fuller neighbour (hidden floors stay hidden until their own turn)', () => {
    const extent = new Float32Array(cols * rows);
    extent[1] = 1;
    const out = new Uint8ClampedArray((cols + 2) * (rows + 2));
    computeRevealMaskExtent(out, cols, rows, extent, floor);
    expect(out[(1 * (cols + 2)) + 1]).toBe(0);
    expect(out[(1 * (cols + 2)) + 2]).toBe(255);
  });

  test('the builder follows the timeline and scales dock-owning cells by the dock extent', () => {
    const ranks = buildRankGrid([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], 2, 2);
    const builder = new MazeRevealMaskBuilder();
    const frame = resolveMazeRevealFrame('build', resolveIntroRevealEndMs(4) + MAZE_DOCK_FADE_MS / 2, 4, false)!;
    const out = new Uint8ClampedArray(4 * 4);
    builder.fill(out, frame, ranks, Uint8Array.from([1, 0, 0, 0]), 2, 2);
    expect(out[(1 * 4) + 1]).toBe(Math.round(frame.dockExtent * 255));
    expect(out[(1 * 4) + 2]).toBe(255);
  });
});

describe('parent sides: which edge of a cell its corridor grows in from', () => {
  // 3 x 3, a snake from the top-left, walls in the middle of the bottom row:  0 1 2 / 5 4 3 / 6 -1 7
  const ranks = Int32Array.from([0, 1, 2, 5, 4, 3, 6, -1, 7]);

  test('every floor cell points at an adjacent floor cell of lower rank; the spawn cell, walls and the pad ring point nowhere', () => {
    const sides = computeParentDirections(ranks, 3, 3);
    const stride = 5;
    const step: Record<number, [number, number]> = { 1: [-1, 0], 2: [1, 0], 3: [0, -1], 4: [0, 1] };
    for (let y = -1; y <= 3; y += 1) {
      for (let x = -1; x <= 3; x += 1) {
        const side = sides[((y + 1) * stride) + x + 1]!;
        const inside = x >= 0 && x < 3 && y >= 0 && y < 3;
        const rank = inside ? ranks[(y * 3) + x]! : -1;
        if (!inside || rank <= 0) {
          expect(side).toBe(0);
          continue;
        }
        const [dx, dy] = step[side]!;
        expect(ranks[((y + dy) * 3) + x + dx]!).toBeGreaterThanOrEqual(0);
        expect(ranks[((y + dy) * 3) + x + dx]!).toBeLessThan(rank);
      }
    }
  });

  test('the builder caches the grid per rank grid and recomputes for a new maze', () => {
    const builder = new MazeRevealMaskBuilder();
    const first = builder.directions(ranks, 3, 3);
    expect(builder.directions(ranks, 3, 3)).toBe(first);
    expect(builder.directions(Int32Array.from(ranks), 3, 3)).not.toBe(first);
  });
});

describe('board composite: one clipped draw, never per tile, never a fade', () => {
  const { grid, docks } = wrapDockMaze();
  const layout = computeBoardTileLayout(inputFor(grid, { docks }));
  const stride = layout.cols + 2;

  interface Rect { x: number; y: number; w: number; h: number }
  const record = (cellExtent: Uint8ClampedArray, dockExtent: number, withDocks: boolean, parentSide?: Uint8Array) => {
    const events: string[] = [];
    const rects: Rect[] = [];
    const strips: number[][] = [];
    const ctx = {
      // Any write of globalAlpha is a fade: the composite must never do one.
      set globalAlpha(_value: number) { events.push('alpha'); },
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      save() { events.push('save'); },
      restore() { events.push('restore'); },
      setTransform() { events.push('setTransform'); },
      clearRect() { events.push('clearRect'); },
      beginPath() { events.push('beginPath'); },
      rect(x: number, y: number, w: number, h: number) { events.push('rect'); rects.push({ x, y, w, h }); },
      clip() { events.push('clip'); },
      fill() { events.push('fill'); },
      drawImage(_image: unknown, ...rest: number[]) {
        events.push(rest.length === 8 ? 'drawImage:strip' : 'drawImage:full');
        if (rest.length === 8) strips.push(rest);
      }
    } as unknown as BoardSoftRevealContext2D;
    const stats = composeBoardTileRevealSoft(ctx, {}, {
      layout: withDocks ? layout : { ...layout, docks: [] },
      cellExtent,
      parentSide,
      dockExtent
    });
    return { events, rects, strips, stats };
  };
  const filled = (value: number): Uint8ClampedArray => new Uint8ClampedArray(stride * (layout.rows + 2)).fill(value);
  const cellBox = (px: number, py: number): Rect => {
    // Padded grid index (px, py) -> layout px; inner cells are board cell (px - 1, py - 1).
    const x0 = layout.originX + layout.xs[px - 1]!;
    const y0 = layout.originY + layout.ys[py - 1]!;
    return { x: x0, y: y0, w: layout.xs[px]! - layout.xs[px - 1]!, h: layout.ys[py]! - layout.ys[py - 1]! };
  };

  test('a fully shown board is one clipped bake draw: row runs merge, no alpha anywhere', () => {
    const { events, rects, stats } = record(filled(255), 1, false);
    expect(stats.bakeDraws).toBe(1);
    expect(events.filter((e) => e.startsWith('drawImage'))).toEqual(['drawImage:full']);
    expect(events.indexOf('clip')).toBeLessThan(events.indexOf('drawImage:full'));
    expect(events).not.toContain('alpha');
    // One rect per padded row, whatever the width.
    expect(rects).toHaveLength(layout.rows + 2);
    expect(stats.clipRects).toBe(layout.rows + 2);
  });

  test('an empty board draws nothing from the bake', () => {
    const { events, stats } = record(filled(0), 0, false);
    expect(stats.bakeDraws).toBe(0);
    expect(stats.clipRects).toBe(0);
    expect(events.filter((e) => e.startsWith('drawImage'))).toHaveLength(0);
  });

  test('any mix of extents still costs ONE bake draw (the cost is bounded by the draw, not by tiles or levels)', () => {
    const extent = filled(0);
    for (let index = 0; index < extent.length; index += 1) extent[index] = (index * 37) % 256;
    const sides = new Uint8Array(extent.length);
    for (let index = 0; index < sides.length; index += 1) sides[index] = index % 5;
    const { events, stats } = record(extent, 1, false, sides);
    expect(stats.bakeDraws).toBe(1);
    expect(events.filter((e) => e === 'drawImage:full')).toHaveLength(1);
    expect(events.filter((e) => e === 'clip')).toHaveLength(1);
    expect(events).not.toContain('alpha');
  });

  test('runs of fully shown cells merge into one rect; a partial cell between two runs is its own rect', () => {
    const extent = filled(0);
    for (let x = 2; x < 7; x += 1) extent[(3 * stride) + x] = 255;
    extent[(3 * stride) + 7] = 100;
    for (let x = 9; x < 11; x += 1) extent[(3 * stride) + x] = 255;
    const { stats } = record(extent, 1, false);
    expect(stats.bakeDraws).toBe(1);
    expect(stats.clipRects).toBe(3);
  });

  // The rim rule (MAZER-MOTION-020): a growing cell shows a slice of itself at FULL strength that starts at the side
  // its parent is on, so its pale rim and its dark fill arrive together instead of the rim leading as a faint line.
  test.each([
    [1, 'left'],
    [2, 'right'],
    [3, 'top'],
    [4, 'bottom']
  ] as const)('a growing cell with its parent on side code %i (%s) draws only a slice flush with that side', (side, name) => {
    void name;
    const px = 6;
    const py = 7;
    for (const value of [40, 90, 128, 200, 254]) {
      const extent = filled(0);
      const sides = new Uint8Array(extent.length);
      extent[(py * stride) + px] = value;
      sides[(py * stride) + px] = side;
      const { rects, events, stats } = record(extent, 1, false, sides);
      expect(rects).toHaveLength(1);
      expect(stats.bakeDraws).toBe(1);
      expect(events).not.toContain('alpha');
      const cell = cellBox(px, py);
      const r = rects[0]!;
      const eps = 1e-9;
      // Inside the cell, never spilling into a neighbour.
      expect(r.x).toBeGreaterThanOrEqual(cell.x - eps);
      expect(r.y).toBeGreaterThanOrEqual(cell.y - eps);
      expect(r.x + r.w).toBeLessThanOrEqual(cell.x + cell.w + eps);
      expect(r.y + r.h).toBeLessThanOrEqual(cell.y + cell.h + eps);
      // Flush with the parent side, full length along the corridor, shortened across it by the extent.
      if (side === 1) { expect(r.x).toBeCloseTo(cell.x, 9); expect(r.h).toBeCloseTo(cell.h, 9); }
      if (side === 2) { expect(r.x + r.w).toBeCloseTo(cell.x + cell.w, 9); expect(r.h).toBeCloseTo(cell.h, 9); }
      if (side === 3) { expect(r.y).toBeCloseTo(cell.y, 9); expect(r.w).toBeCloseTo(cell.w, 9); }
      if (side === 4) { expect(r.y + r.h).toBeCloseTo(cell.y + cell.h, 9); expect(r.w).toBeCloseTo(cell.w, 9); }
      const length = side <= 2 ? r.w / cell.w : r.h / cell.h;
      // Device-snapped, so within half a device pixel of the exact fraction.
      expect(Math.abs(length - (value / 255)) * (side <= 2 ? cell.w : cell.h) * layout.scale).toBeLessThanOrEqual(0.5 + 1e-6);
    }
  });

  test('a cell with no parent side (the spawn tile, walls, the pad ring) opens from its centre', () => {
    const px = 6;
    const py = 7;
    const extent = filled(0);
    extent[(py * stride) + px] = 128;
    const { rects } = record(extent, 1, false);
    const cell = cellBox(px, py);
    const r = rects[0]!;
    expect(r.x + (r.w / 2)).toBeCloseTo(cell.x + (cell.w / 2), 1);
    expect(r.y + (r.h / 2)).toBeCloseTo(cell.y + (cell.h / 2), 1);
    expect(r.w).toBeLessThan(cell.w);
    expect(r.h).toBeLessThan(cell.h);
  });

  test('the rect edges are device-snapped, so neighbouring slices never leave an antialiasing seam', () => {
    const extent = filled(0);
    const sides = new Uint8Array(extent.length);
    for (let x = 3; x < 12; x += 1) { extent[(5 * stride) + x] = 90 + (x * 11); sides[(5 * stride) + x] = 1; }
    const { rects } = record(extent, 1, false, sides);
    for (const r of rects) {
      for (const edge of [r.x, r.y, r.x + r.w, r.y + r.h]) {
        expect(Math.abs((edge * layout.scale) - Math.round(edge * layout.scale))).toBeLessThan(1e-6);
      }
    }
  });

  test('docks: four strips cleared and redrawn flush with the board edge, only the slid-out part; hidden docks are cleared but not drawn', () => {
    const shown = record(filled(255), 0.5, true);
    expect(shown.strips).toHaveLength(4);
    expect(shown.stats.stripDraws).toBe(4);
    expect(shown.events.filter((e) => e === 'clearRect')).toHaveLength(5);
    expect(shown.events).not.toContain('alpha');
    const boardRight = layout.originX + layout.boardWidth;
    const boardBottom = layout.originY + layout.boardHeight;
    const [left, right, top, bottom] = shown.strips as [number[], number[], number[], number[]];
    // [sx, sy, sw, sh, dx, dy, dw, dh] in device px (source) and layout px (destination).
    expect((left[0]! + left[2]!) / layout.scale).toBeCloseTo(layout.originX, 6);
    expect(left[2]! / layout.scale).toBeCloseTo(layout.originX / 2, 1);
    expect(right[0]! / layout.scale).toBeCloseTo(boardRight, 6);
    expect(right[2]! / layout.scale).toBeCloseTo((layout.width - boardRight) / 2, 1);
    expect((top[1]! + top[3]!) / layout.scale).toBeCloseTo(layout.originY, 6);
    expect(top[3]! / layout.scale).toBeCloseTo(layout.originY / 2, 1);
    expect(bottom[1]! / layout.scale).toBeCloseTo(boardBottom, 6);
    expect(bottom[3]! / layout.scale).toBeCloseTo((layout.height - boardBottom) / 2, 1);
    const hidden = record(filled(255), 0, true);
    expect(hidden.strips).toHaveLength(0);
    expect(hidden.events.filter((e) => e === 'clearRect')).toHaveLength(5);
    const full = record(filled(255), 1, true);
    expect(full.strips).toHaveLength(4);
    expect((full.strips[0]![0]!) / layout.scale).toBeCloseTo(0, 6);
  });

  test('no docks: no strip work at all', () => {
    const { events } = record(filled(255), 1, false);
    expect(events.filter((e) => e === 'drawImage:strip')).toHaveLength(0);
    expect(events.filter((e) => e === 'clearRect')).toHaveLength(1);
  });
});

describe('driver and scene wiring', () => {
  const clock = (over: Partial<MazeRevealClock>): MazeRevealClock => ({
    phase: 'building', introStartedAtMs: 1000, deconstructStartedAtMs: null, time: 1000, tileCount: 373, reducedMotion: false, ...over
  });

  test('building and deconstructing map onto their own clocks; idle / settled have no soft frame', () => {
    const driver = new MazeRevealDriver();
    expect(driver.update(clock({ time: 1500 }))).toBe(true);
    expect(driver.current?.direction).toBe('build');
    expect(driver.current?.elapsedMs).toBe(500);
    driver.update(clock({ phase: 'deconstructing', introStartedAtMs: null, deconstructStartedAtMs: 2000, time: 2900 }));
    expect(driver.current?.direction).toBe('deconstruct');
    expect(driver.current?.elapsedMs).toBe(900);
    driver.update(clock({ phase: 'settled' }));
    expect(driver.current).toBeNull();
    driver.update(clock({ phase: 'idle', introStartedAtMs: null }));
    expect(driver.current).toBeNull();
  });

  test('reduced motion never produces a soft frame or a soft board reveal', () => {
    const driver = new MazeRevealDriver();
    driver.update(clock({ time: 1500, reducedMotion: true }));
    expect(driver.current).toBeNull();
    expect(driver.resolveBoardReveal(new Int32Array(4), null, 2, 2)).toBeNull();
  });

  test('update reports a change only when something changed (identical frames skip the recompose)', () => {
    const driver = new MazeRevealDriver();
    expect(driver.update(clock({ time: 1500 }))).toBe(true);
    expect(driver.update(clock({ time: 1500 }))).toBe(false);
    expect(driver.update(clock({ time: 1516 }))).toBe(true);
    // The markers fading in (after the build end) keep the dynamic layer redrawing even once the board is static.
    const markerMid = 1000 + resolveIntroRevealEndMs(373) + (INTRO_LASER_MS * 0.75);
    driver.update(clock({ time: markerMid }));
    expect(driver.update(clock({ time: markerMid }))).toBe(true);
  });

  test('markers: 1 outside the build, 0 in reduced-motion building, otherwise the closed-form fade', () => {
    expect(resolveMazeMarkerAlpha(clock({ phase: 'settled' }))).toBe(1);
    expect(resolveMazeMarkerAlpha(clock({ phase: 'deconstructing' }))).toBe(1);
    expect(resolveMazeMarkerAlpha(clock({ reducedMotion: true, time: 5000 }))).toBe(0);
    expect(resolveMazeMarkerAlpha(clock({ introStartedAtMs: null }))).toBe(0);
    const end = resolveIntroRevealEndMs(373);
    expect(resolveMazeMarkerAlpha(clock({ time: 1000 + end + (INTRO_LASER_MS / 2) }))).toBeCloseTo(0.5, 5);
  });

  test('MenuScene calls the driver through thin hooks: one update, the board reveal and the marker alpha', () => {
    const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n?/g, '\n');
    expect(scene).toContain('this.mazeReveal.update(this.resolveLegacyMazeRevealClock(time))');
    expect(scene).toContain('this.mazeReveal.resolveBoardReveal(');
    expect(scene).toContain('resolveMazeMarkerAlpha(this.resolveLegacyMazeRevealClock(time))');
    // The edge diamond / beam art and timelines are another lane: nothing of theirs is touched here.
    expect(scene.match(/mazeReveal/g)?.length).toBeLessThan(8);
  });
});
