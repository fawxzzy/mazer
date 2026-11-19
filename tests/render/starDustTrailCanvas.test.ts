import { describe, expect, test } from 'vitest';
import {
  STAR_DUST_TRAIL,
  hashSparkleIndex,
  placeStarDustSparkles,
  readStarDustSparkle,
  resolveStarDustKeylineWidth,
  resolveStarDustReach,
  type StarDustSegment
} from '../../src/render/starDustTrailCanvas';

const TILE = 40;

/** A straight route along y = 0 from x = startPx, `tiles` tiles long, split per tile, distances from the route start. */
const route = (startPx: number, tiles: number): StarDustSegment[] => {
  const segments: StarDustSegment[] = [];
  for (let i = 0; i < tiles; i += 1) {
    segments.push({
      previous: { x: startPx + (i * TILE), y: 0, distance: i * TILE },
      current: { x: startPx + ((i + 1) * TILE), y: 0, distance: (i + 1) * TILE },
      glowColor: 0x336699,
      coreColor: 0x88ccff,
      alpha: 1
    });
  }
  return segments;
};

const placed = (count: number) => Array.from({ length: count }, (_, i) => readStarDustSparkle(i));

describe('star dust placement', () => {
  test('sparkles are spaced evenly along the route and sit on it', () => {
    const count = placeStarDustSparkles(route(0, 6), { tileSize: TILE, timeMs: 0, animated: false, originAdvancePx: 0 });
    const spacing = TILE * STAR_DUST_TRAIL.spacingTileRatio;
    expect(count).toBe(Math.floor((6 * TILE) / spacing) + 1);
    const sparkles = placed(count);
    sparkles.forEach((s, i) => {
      expect(s.y).toBe(0);
      expect(s.x).toBeCloseTo(i * spacing, 6);
    });
  });

  test('stay fixed on the floor when Trail Fade advances the route start', () => {
    const spacing = TILE * STAR_DUST_TRAIL.spacingTileRatio;
    const before = placed(placeStarDustSparkles(route(0, 8), { tileSize: TILE, timeMs: 0, animated: false, originAdvancePx: 0 }));
    // the oldest 2.5 tiles faded away: the route now starts 100 px further on, and its distances restart at 0
    const advance = 2.5 * TILE;
    const after = placed(placeStarDustSparkles(route(advance, 5), { tileSize: TILE, timeMs: 0, animated: false, originAdvancePx: advance }));
    expect(after.length).toBeGreaterThan(0);
    for (const s of after) {
      const match = before.find((b) => Math.abs(b.x - s.x) < 1e-6);
      expect(match, `sparkle at ${s.x}`).toBeDefined();
      // same sparkle index, same size hash: only the taper (route age) may differ
      expect(Math.abs(Math.round(s.x / spacing) * spacing - s.x)).toBeLessThan(1e-6);
    }
  });

  test('still when not animated: the clock does not move size or colour', () => {
    const opts = { tileSize: TILE, originAdvancePx: 0, animated: false } as const;
    const a = placed(placeStarDustSparkles(route(0, 4), { ...opts, timeMs: 0 }));
    const b = placed(placeStarDustSparkles(route(0, 4), { ...opts, timeMs: 3333 }));
    expect(b).toEqual(a);
  });

  test('animated sparkles twinkle with the clock', () => {
    const opts = { tileSize: TILE, originAdvancePx: 0, animated: true } as const;
    const a = placed(placeStarDustSparkles(route(0, 4), { ...opts, timeMs: 0 })).map((s) => s.radius);
    const b = placed(placeStarDustSparkles(route(0, 4), { ...opts, timeMs: 400 })).map((s) => s.radius);
    expect(b).not.toEqual(a);
  });

  test('the head is larger than the tail on average (taper), and every sparkle fits the reach padding', () => {
    const sparkles = placed(placeStarDustSparkles(route(0, 12), { tileSize: TILE, timeMs: 0, animated: true, originAdvancePx: 0 }));
    const half = Math.floor(sparkles.length / 2);
    const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
    expect(mean(sparkles.slice(half).map((s) => s.radius))).toBeGreaterThan(mean(sparkles.slice(0, half).map((s) => s.radius)));
    for (const s of sparkles) {
      expect(s.radius + resolveStarDustKeylineWidth(TILE)).toBeLessThanOrEqual(resolveStarDustReach(TILE) + 1e-9);
    }
  });

  test('empty routes and a zero tile place nothing', () => {
    expect(placeStarDustSparkles([], { tileSize: TILE, timeMs: 0, animated: true, originAdvancePx: 0 })).toBe(0);
    expect(placeStarDustSparkles(route(0, 3), { tileSize: 0, timeMs: 0, animated: true, originAdvancePx: 0 })).toBe(0);
  });

  test('long routes grow the scratch without losing earlier sparkles', () => {
    const count = placeStarDustSparkles(route(0, 120), { tileSize: TILE, timeMs: 0, animated: false, originAdvancePx: 0 });
    expect(count).toBeGreaterThan(64);
    const spacing = TILE * STAR_DUST_TRAIL.spacingTileRatio;
    expect(readStarDustSparkle(0).x).toBeCloseTo(0, 6);
    expect(readStarDustSparkle(count - 1).x).toBeCloseTo((count - 1) * spacing, 6);
  });
});

describe('sparkle hash', () => {
  test('is deterministic, in [0, 1), and differs by salt', () => {
    for (let i = 0; i < 200; i += 1) {
      const h = hashSparkleIndex(i, 1);
      expect(h).toBe(hashSparkleIndex(i, 1));
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
    expect(hashSparkleIndex(7, 1)).not.toBe(hashSparkleIndex(7, 2));
  });
});
