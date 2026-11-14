import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { computeRevealMaskAlpha, MazeRevealMaskBuilder } from '../../src/render/boardRevealMask';
import {
  composeBoardTileRevealSoft,
  buildRankGrid,
  SOFT_REVEAL_LEVELS,
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
  MAZE_REVEAL_RAMP_MS,
  fillMazeRevealCellAlpha,
  resolveCellRevealAlpha,
  resolveDockRevealAlpha,
  resolveMarkerRevealAlpha,
  resolveMazeRevealFrame,
  resolveMazeRevealWindow,
  resolveReducedBoardFade
} from '../../src/render/mazeRevealTimeline';
import { MOTION_DURATION_MS } from '../../src/render/motionScale';
import { inputFor, wrapDockMaze } from './support/boardTileFixtures';

const COUNTS = [1, 2, 30, 373, 1000, 4000];
const FRAME_MS = 1000 / 60;

describe('soft maze reveal timeline: windows ride the shipped intro / outro timeline', () => {
  test('the ramp, dock fade and marker fade are steps of the motion scale', () => {
    expect(MAZE_REVEAL_RAMP_MS).toBe(MOTION_DURATION_MS.reveal);
    expect(MAZE_DOCK_FADE_MS).toBe(MOTION_DURATION_MS.base);
    expect(MAZE_MARKER_FADE_MS).toBe(INTRO_LASER_MS);
  });

  test.each(COUNTS)('N=%i: the build window is exactly the shipped one (start, end, so unlock and totals are unchanged)', (count) => {
    const window = resolveMazeRevealWindow('build', count);
    expect(window.startMs).toBe(INTRO_BUILD_START_MS);
    expect(window.endMs).toBe(resolveIntroRevealEndMs(count));
    expect(window.endMs - window.startMs).toBe(resolveIntroRevealMs(count));
    expect(window.rampMs).toBeLessThanOrEqual(MAZE_REVEAL_RAMP_MS);
    expect(window.rampMs).toBeLessThanOrEqual((window.endMs - window.startMs) / 2);
  });

  test.each(COUNTS)('N=%i: the deconstruct window is exactly the shipped one', (count) => {
    const window = resolveMazeRevealWindow('deconstruct', count);
    expect(window.startMs).toBe(OUTRO_TILES_START_MS);
    expect(window.endMs).toBe(resolveOutroTilesEndMs(count));
    expect(window.endMs - window.startMs).toBe(resolveOutroRemoveMs(count));
  });
});

describe('soft maze reveal timeline: per-cell alpha', () => {
  test.each([30, 373, 1000])('N=%i build: every cell is 0 at the start, 1 at the build end, never decreases, first cell starts at the window start', (count) => {
    const window = resolveMazeRevealWindow('build', count);
    for (const rank of [0, 1, Math.floor(count / 2), count - 2, count - 1].filter((r) => r >= 0 && r < count)) {
      expect(resolveCellRevealAlpha('build', window, rank, count, 0)).toBe(0);
      expect(resolveCellRevealAlpha('build', window, rank, count, window.endMs)).toBe(1);
      let previous = 0;
      for (let ms = 0; ms <= window.endMs + 50; ms += 7) {
        const alpha = resolveCellRevealAlpha('build', window, rank, count, ms);
        expect(alpha).toBeGreaterThanOrEqual(previous - 1e-12);
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
        previous = alpha;
      }
    }
    expect(resolveCellRevealAlpha('build', window, 0, count, window.startMs)).toBe(0);
    expect(resolveCellRevealAlpha('build', window, 0, count, window.startMs + 1)).toBeGreaterThan(0);
  });

  test.each([30, 373, 1000])('N=%i deconstruct: every cell is 1 at the window start, 0 at the end, never increases; the far end goes first', (count) => {
    const window = resolveMazeRevealWindow('deconstruct', count);
    for (const rank of [0, Math.floor(count / 2), count - 1]) {
      expect(resolveCellRevealAlpha('deconstruct', window, rank, count, window.startMs)).toBe(1);
      expect(resolveCellRevealAlpha('deconstruct', window, rank, count, window.endMs)).toBe(0);
      let previous = 1;
      for (let ms = window.startMs; ms <= window.endMs; ms += 7) {
        const alpha = resolveCellRevealAlpha('deconstruct', window, rank, count, ms);
        expect(alpha).toBeLessThanOrEqual(previous + 1e-12);
        previous = alpha;
      }
    }
    const mid = (window.startMs + window.endMs) / 2;
    expect(resolveCellRevealAlpha('deconstruct', window, count - 1, count, mid))
      .toBeLessThanOrEqual(resolveCellRevealAlpha('deconstruct', window, 0, count, mid));
  });

  test('build: a lower rank is never less visible than a higher rank at the same instant (the front moves outward)', () => {
    const count = 500;
    const window = resolveMazeRevealWindow('build', count);
    for (let ms = 0; ms <= window.endMs; ms += 31) {
      let previous = 1;
      for (let rank = 0; rank < count; rank += 17) {
        const alpha = resolveCellRevealAlpha('build', window, rank, count, ms);
        expect(alpha).toBeLessThanOrEqual(previous + 1e-12);
        previous = alpha;
      }
    }
  });

  test.each([30, 373, 1000, 4000])('N=%i: no cell changes by more than a small step per 60 fps frame (the old reveal jumped 1.0 in one frame)', (count) => {
    for (const direction of ['build', 'deconstruct'] as const) {
      const window = resolveMazeRevealWindow(direction, count);
      let maxStep = 0;
      for (const rank of [0, Math.floor(count / 3), count - 1]) {
        let previous = resolveCellRevealAlpha(direction, window, rank, count, 0);
        for (let ms = FRAME_MS; ms <= window.endMs + 50; ms += FRAME_MS) {
          const alpha = resolveCellRevealAlpha(direction, window, rank, count, ms);
          maxStep = Math.max(maxStep, Math.abs(alpha - previous));
          previous = alpha;
        }
      }
      // smoothstep peaks at 1.5 / ramp; at 700 ms and 60 fps that is 3.6 % of full alpha per frame.
      expect(maxStep).toBeLessThan(0.05);
    }
  });

  test('the soft front is wider than a tile: at any instant many cells are partially revealed at once', () => {
    const count = 1000;
    const window = resolveMazeRevealWindow('build', count);
    const mid = (window.startMs + window.endMs) / 2;
    let partial = 0;
    for (let rank = 0; rank < count; rank += 1) {
      const alpha = resolveCellRevealAlpha('build', window, rank, count, mid);
      if (alpha > 0.02 && alpha < 0.98) partial += 1;
    }
    expect(partial).toBeGreaterThan(count * 0.1);
  });

  test('the timeline is closed form: the same instant always gives the same alpha, in any order', () => {
    const window = resolveMazeRevealWindow('build', 373);
    const a = resolveCellRevealAlpha('build', window, 120, 373, 1234.5);
    resolveCellRevealAlpha('build', window, 5, 373, 99);
    expect(resolveCellRevealAlpha('build', window, 120, 373, 1234.5)).toBe(a);
  });

  test('non-finite inputs never throw and never leave 0..1', () => {
    const window = resolveMazeRevealWindow('build', 100);
    for (const ms of [Number.NaN, -5, Number.POSITIVE_INFINITY]) {
      const alpha = resolveCellRevealAlpha('build', window, 10, 100, ms);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
    expect(resolveCellRevealAlpha('build', resolveMazeRevealWindow('build', 1), 0, 1, 5000)).toBe(1);
  });

  test('fillMazeRevealCellAlpha writes floors only and leaves walls at 0', () => {
    const ranks = Int32Array.from([0, -1, 1, 2, -1, -1]);
    const out = new Float32Array(6).fill(9);
    fillMazeRevealCellAlpha(out, ranks, 3, 'build', resolveMazeRevealWindow('build', 3), 1e9);
    expect(Array.from(out)).toEqual([1, 0, 1, 1, 0, 0]);
  });
});

describe('soft maze reveal timeline: docks and markers', () => {
  test('docks: build is 0 until the build ends then fades over the dock fade; deconstruct is 1, then fades to exactly 0 at the edge-path switch', () => {
    const count = 373;
    const end = resolveIntroRevealEndMs(count);
    expect(resolveDockRevealAlpha('build', count, end)).toBe(0);
    expect(resolveDockRevealAlpha('build', count, end + MAZE_DOCK_FADE_MS)).toBe(1);
    expect(resolveDockRevealAlpha('build', count, end + MAZE_DOCK_FADE_MS / 2)).toBeCloseTo(0.5, 5);
    expect(resolveDockRevealAlpha('deconstruct', count, 0)).toBe(1);
    expect(resolveDockRevealAlpha('deconstruct', count, OUTRO_EDGE_PATHS_OFF_MS - MAZE_DOCK_FADE_MS)).toBe(1);
    expect(resolveDockRevealAlpha('deconstruct', count, OUTRO_EDGE_PATHS_OFF_MS)).toBe(0);
  });

  test('dock fade is inside the existing windows: it never starts before the build ends or ends after the edge paths switch', () => {
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

describe('soft maze reveal timeline: frames', () => {
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

  test('full motion has no board fade (the soft front is used instead)', () => {
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

  test('floor cells keep their own alpha; walls and the pad ring take the max of the floor cells around them', () => {
    const alpha = new Float32Array(cols * rows);
    alpha[0] = 1;
    alpha[3] = 0.5;
    const out = new Uint8ClampedArray((cols + 2) * (rows + 2));
    computeRevealMaskAlpha(out, cols, rows, alpha, floor);
    const at = (x: number, y: number): number => out[((y + 1) * (cols + 2)) + x + 1]!;
    expect(at(0, 0)).toBe(255);
    expect(at(3, 0)).toBe(128);
    expect(at(1, 0)).toBe(0);
    // wall (2,0): neighbours (1,0)=0 floor alpha 0, (3,0)=0.5 -> 128
    expect(at(2, 0)).toBe(128);
    // wall (0,1): 8-neighbourhood includes (0,0)=1
    expect(at(0, 1)).toBe(255);
    // pad ring corner (-1,-1) borders only (0,0)
    expect(at(-1, -1)).toBe(255);
    // pad ring far corner borders nothing revealed
    expect(at(cols, rows)).toBe(0);
  });

  test('a floor cell is not lifted by a brighter neighbour (hidden floors stay hidden until their own turn)', () => {
    const alpha = new Float32Array(cols * rows);
    alpha[1] = 1;
    const out = new Uint8ClampedArray((cols + 2) * (rows + 2));
    computeRevealMaskAlpha(out, cols, rows, alpha, floor);
    expect(out[(1 * (cols + 2)) + 1]).toBe(0);
    expect(out[(1 * (cols + 2)) + 2]).toBe(255);
  });

  test('the builder follows the timeline and dims dock-owning cells with the dock alpha', () => {
    const grid = [[true, true], [true, true]];
    const ranks = buildRankGrid([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], 2, 2);
    const builder = new MazeRevealMaskBuilder();
    const frame = resolveMazeRevealFrame('build', resolveIntroRevealEndMs(4) + MAZE_DOCK_FADE_MS / 2, 4, false)!;
    const out = new Uint8ClampedArray(4 * 4);
    builder.fill(out, frame, ranks, Uint8Array.from([1, 0, 0, 0]), 2, 2);
    expect(grid).toHaveLength(2);
    expect(out[(1 * 4) + 1]).toBe(Math.round(frame.dockAlpha * 255));
    expect(out[(1 * 4) + 2]).toBe(255);
  });
});

describe('soft board composite: at most 16 draws, never per tile', () => {
  const { grid, docks } = wrapDockMaze();
  const layout = computeBoardTileLayout(inputFor(grid, { docks }));
  const stride = layout.cols + 2;

  const record = (cellAlpha: Uint8ClampedArray, dockAlpha: number, withDocks: boolean) => {
    const events: string[] = [];
    let alpha = 1;
    const ctx = {
      get globalAlpha() { return alpha; },
      set globalAlpha(value: number) { alpha = value; },
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      save() { events.push('save'); },
      restore() { events.push('restore'); alpha = 1; },
      setTransform() { events.push('setTransform'); },
      clearRect() { events.push('clearRect'); },
      beginPath() { events.push('beginPath'); },
      rect() { events.push('rect'); },
      clip() { events.push('clip'); },
      fill() { events.push('fill'); },
      drawImage(_image: unknown, ...rest: number[]) {
        events.push(`drawImage:${rest.length === 8 ? 'strip' : 'full'}:${alpha}`);
      }
    } as unknown as BoardSoftRevealContext2D;
    const stats = composeBoardTileRevealSoft(ctx, {}, {
      layout: withDocks ? layout : { ...layout, docks: [] },
      cellAlpha,
      dockAlpha
    });
    return { events, stats };
  };
  const filled = (value: number): Uint8ClampedArray => new Uint8ClampedArray(stride * (layout.rows + 2)).fill(value);

  test('a fully revealed board is one clipped bake draw at alpha 1', () => {
    const { events, stats } = record(filled(255), 1, false);
    expect(stats.levelDraws).toBe(1);
    expect(events.filter((e) => e.startsWith('drawImage'))).toEqual(['drawImage:full:1']);
    expect(events.indexOf('clip')).toBeLessThan(events.indexOf('drawImage:full:1'));
  });

  test('an empty board draws nothing from the bake', () => {
    const { events, stats } = record(filled(0), 0, false);
    expect(stats.levelDraws).toBe(0);
    expect(events.filter((e) => e.startsWith('drawImage'))).toHaveLength(0);
  });

  test('every cell in a different alpha still costs at most 16 bake draws (the draw count is bounded by levels, not tiles)', () => {
    const alpha = filled(0);
    for (let index = 0; index < alpha.length; index += 1) alpha[index] = (index * 37) % 256;
    const { events, stats } = record(alpha, 1, false);
    expect(stats.levelDraws).toBeLessThanOrEqual(SOFT_REVEAL_LEVELS);
    expect(events.filter((e) => e.startsWith('drawImage:full'))).toHaveLength(stats.levelDraws);
    // each level draws at its own alpha, ascending
    const levels = events.filter((e) => e.startsWith('drawImage:full')).map((e) => Number(e.split(':')[2]));
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    expect(levels.every((l) => l > 0 && l <= 1)).toBe(true);
  });

  test('the cells of one level are covered exactly once: row runs of equal level merge into one rect', () => {
    const alpha = filled(0);
    // row 3: five cells in a run at half alpha, then a gap, then two more
    for (let x = 2; x < 7; x += 1) alpha[(3 * stride) + x] = 128;
    for (let x = 9; x < 11; x += 1) alpha[(3 * stride) + x] = 128;
    const { stats } = record(alpha, 1, false);
    expect(stats.levelDraws).toBe(1);
    expect(stats.clipRects).toBe(2);
  });

  test('docks: four strips cleared and redrawn at the dock alpha; hidden docks are cleared but not drawn', () => {
    const shown = record(filled(255), 0.4, true);
    const strips = shown.events.filter((e) => e.includes(':strip:'));
    expect(strips).toHaveLength(4);
    expect(strips.every((e) => e === 'drawImage:strip:0.4')).toBe(true);
    expect(shown.events.filter((e) => e === 'clearRect')).toHaveLength(5);
    const hidden = record(filled(255), 0, true);
    expect(hidden.events.filter((e) => e.includes(':strip:'))).toHaveLength(0);
    expect(hidden.events.filter((e) => e === 'clearRect')).toHaveLength(5);
  });

  test('no docks: no strip work at all', () => {
    const { events } = record(filled(255), 1, false);
    expect(events.filter((e) => e.includes(':strip:'))).toHaveLength(0);
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
