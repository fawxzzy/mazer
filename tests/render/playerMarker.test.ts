import { describe, expect, test } from 'vitest';
import { centerOfCell, snappedCellCenter } from '../../src/render/boardTileBake';
import { BOARD_TILE_GEOMETRY, CHIP_CORNER_RATIO, PLAYER_SIZE_RATIO } from '../../src/render/boardTileStyle';
import type { LocatorGraphics } from '../../src/render/playerLocator';
import {
  PLAYER_MARKER,
  createPlayerMarkerFrame,
  drawPlayerMarker,
  resolvePlayerMarkerCenter,
  resolvePlayerMarkerFrame,
  resolvePlayerMarkerReach,
  resolvePlayerMarkerRestHalf,
  type PlayerMarkerFrameInput
} from '../../src/render/playerMarker';

const TILES = [8.32, 14.72, 25.44];
const DPRS = [1, 2, 2.625, 3];

const frameInput = (over: Partial<PlayerMarkerFrameInput> = {}): PlayerMarkerFrameInput => ({
  centerX: 40, centerY: 30, tileSize: 14.72, devicePixelRatio: 2, timeMs: 0, reducedMotion: false,
  motionAmount: 0, headingX: 0, headingY: 0, ...over
});

describe('player marker size (a share of the tile, like the end glyphs)', () => {
  test('the block is PLAYER_SIZE_RATIO of the tile and its corner is the Chip tile corner proportion of its width', () => {
    expect(PLAYER_MARKER.sizeRatio).toBe(PLAYER_SIZE_RATIO);
    expect(PLAYER_MARKER.cornerRatio).toBe(CHIP_CORNER_RATIO);
    expect(PLAYER_MARKER.cornerRatio).toBe(BOARD_TILE_GEOMETRY.chipCornerRatio);
    for (const tile of TILES) {
      const f = resolvePlayerMarkerFrame(frameInput({ tileSize: tile, reducedMotion: true }), createPlayerMarkerFrame());
      expect(f.coreHalfWidth * 2).toBeCloseTo(tile * PLAYER_SIZE_RATIO, 9);
      expect(f.coreHalfHeight * 2).toBeCloseTo(tile * PLAYER_SIZE_RATIO, 9);
      expect(f.coreCornerRadius / (f.coreHalfWidth * 2)).toBeCloseTo(CHIP_CORNER_RATIO, 9);
      expect(resolvePlayerMarkerRestHalf(tile)).toBeCloseTo(f.coreHalfWidth, 9);
    }
  });

  test('the same size from the same tile fraction on every surface: no surface or mode input exists', () => {
    const a = resolvePlayerMarkerFrame(frameInput({ timeMs: 321 }), createPlayerMarkerFrame());
    const b = resolvePlayerMarkerFrame(frameInput({ timeMs: 321 }), createPlayerMarkerFrame());
    expect(a).toEqual(b);
    expect(Object.keys(frameInput()).sort()).toEqual([
      'centerX', 'centerY', 'devicePixelRatio', 'headingX', 'headingY', 'motionAmount', 'reducedMotion', 'tileSize', 'timeMs'
    ]);
  });

  test('the accent stroke is whole device pixels, never below one, and a share of the tile', () => {
    for (const tile of TILES) {
      for (const dpr of DPRS) {
        const f = resolvePlayerMarkerFrame(frameInput({ tileSize: tile, devicePixelRatio: dpr }), createPlayerMarkerFrame());
        expect(f.accentStrokeCss * dpr).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(f.accentStrokeCss * dpr).toBeCloseTo(Math.round(f.accentStrokeCss * dpr), 9);
      }
    }
  });

  test('breathing scales the block by +/- breatheAmount and reduced motion freezes it at rest size', () => {
    const rest = resolvePlayerMarkerRestHalf(14.72);
    const quarter = PLAYER_MARKER.breathePeriodMs / 4;
    const top = resolvePlayerMarkerFrame(frameInput({ timeMs: quarter }), createPlayerMarkerFrame());
    const bottom = resolvePlayerMarkerFrame(frameInput({ timeMs: quarter * 3 }), createPlayerMarkerFrame());
    expect(top.coreHalfWidth).toBeCloseTo(rest * (1 + PLAYER_MARKER.breatheAmount), 9);
    expect(bottom.coreHalfWidth).toBeCloseTo(rest * (1 - PLAYER_MARKER.breatheAmount), 9);
    expect(top.coreHalfWidth).toBeCloseTo(resolvePlayerMarkerReach(14.72), 9);
    for (const t of [0, quarter, quarter * 3, 12345]) {
      const f = resolvePlayerMarkerFrame(frameInput({ timeMs: t, reducedMotion: true }), createPlayerMarkerFrame());
      expect(f.coreHalfWidth).toBeCloseTo(rest, 9);
    }
  });

  test('reuses the caller frame (no per-frame allocation)', () => {
    const out = createPlayerMarkerFrame();
    expect(resolvePlayerMarkerFrame(frameInput(), out)).toBe(out);
  });
});

describe('player marker centre (device-snapped, the same centre as the baked tile and the end glyphs)', () => {
  test('a whole cell is exactly centerOfCell, at every tile size and DPR', () => {
    for (const tile of TILES) {
      for (const dpr of DPRS) {
        for (const cell of [{ x: 0, y: 0 }, { x: 3, y: 7 }, { x: 24, y: 50 }]) {
          const [ex, ey] = centerOfCell(cell, tile, dpr, 11, 17);
          const c = resolvePlayerMarkerCenter(cell.x, cell.y, tile, dpr, 11, 17);
          expect(c.x).toBe(ex);
          expect(c.y).toBe(ey);
        }
      }
    }
  });

  test('the centre sits on a half device pixel at most (snapped), never a fraction of one', () => {
    for (const tile of TILES) {
      for (const dpr of DPRS) {
        const c = resolvePlayerMarkerCenter(5, 9, tile, dpr, 0, 0);
        expect(c.x * dpr * 2).toBeCloseTo(Math.round(c.x * dpr * 2), 6);
        expect(c.y * dpr * 2).toBeCloseTo(Math.round(c.y * dpr * 2), 6);
      }
    }
  });

  test('while gliding it moves linearly between the two snapped centres and lands exactly on the next one', () => {
    const tile = 14.72;
    const dpr = 2.625;
    const from = snappedCellCenter(4, tile, dpr);
    const to = snappedCellCenter(5, tile, dpr);
    const mid = resolvePlayerMarkerCenter(4.5, 0, tile, dpr, 0, 0);
    expect(mid.x).toBeCloseTo((from + to) / 2, 9);
    expect(resolvePlayerMarkerCenter(5, 0, tile, dpr, 0, 0).x).toBe(to);
    // monotonic across the step
    let last = -Infinity;
    for (let i = 0; i <= 10; i += 1) {
      const x = resolvePlayerMarkerCenter(4 + (i / 10), 0, tile, dpr, 0, 0).x;
      expect(x).toBeGreaterThanOrEqual(last);
      last = x;
    }
  });

  test('reuses the caller record', () => {
    const out = { x: 0, y: 0 };
    expect(resolvePlayerMarkerCenter(1, 1, 10, 2, 0, 0, out)).toBe(out);
  });
});

describe('drawPlayerMarker', () => {
  const recorder = (): { g: LocatorGraphics; calls: string[] } => {
    const calls: string[] = [];
    const rec = (fn: string) => (): void => { calls.push(fn); };
    return {
      calls,
      g: { fillStyle: rec('fillStyle'), fillRoundedRect: rec('fillRoundedRect'), lineStyle: rec('lineStyle'), strokeRoundedRect: rec('strokeRoundedRect') }
    };
  };

  test('paints locator first, then the block fill, then the accent stroke last; nothing at zero alpha', () => {
    const f = resolvePlayerMarkerFrame(frameInput({ reducedMotion: true }), createPlayerMarkerFrame());
    const { g, calls } = recorder();
    drawPlayerMarker(g, f, { tileSize: 14.72, devicePixelRatio: 2, alpha: 1, timeMs: 0, coreColor: 0x39e07a, pingStartMs: -1, reducedMotion: true });
    expect(calls.slice(-4)).toEqual(['fillStyle', 'fillRoundedRect', 'lineStyle', 'strokeRoundedRect']);
    const none = recorder();
    drawPlayerMarker(none.g, f, { tileSize: 14.72, devicePixelRatio: 2, alpha: 0, timeMs: 0, coreColor: 0x39e07a, pingStartMs: -1, reducedMotion: true });
    expect(none.calls).toHaveLength(0);
  });
});
