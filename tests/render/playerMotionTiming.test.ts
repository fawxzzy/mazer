import { describe, expect, it } from 'vitest';
import {
  PLAYER_GLIDE_DURATION_MAX_MS,
  WALL_BUMP_DURATION_MS,
  WALL_BUMP_MAX_OFFSET_PX,
  resolvePlayerGlideDurationMs,
  resolveWallBumpNudge,
  shouldBuzzWallBump
} from '../../src/render/playerMotionTiming';

describe('resolvePlayerGlideDurationMs', () => {
  it('never exceeds the repeat interval, at any speed', () => {
    for (let repeat = 1; repeat <= 400; repeat += 1) {
      const glide = resolvePlayerGlideDurationMs({ repeatIntervalMs: repeat });
      expect(glide).toBeLessThanOrEqual(repeat);
      expect(glide).toBeLessThanOrEqual(PLAYER_GLIDE_DURATION_MAX_MS);
      expect(glide).toBeGreaterThan(0);
    }
  });

  it('is below the old 90 ms floor at max speed (78 ms repeat)', () => {
    expect(resolvePlayerGlideDurationMs({ repeatIntervalMs: 78 })).toBe(66);
  });

  it('caps by the stick repeat interval only while the stick is held', () => {
    const base = { repeatIntervalMs: 160, stickRepeatIntervalMaxMs: 104 };
    expect(resolvePlayerGlideDurationMs({ ...base, stickActive: true })).toBe(88);
    expect(resolvePlayerGlideDurationMs({ ...base, stickActive: false })).toBe(136);
  });

  it('falls back safely on bad input', () => {
    expect(resolvePlayerGlideDurationMs({ repeatIntervalMs: Number.NaN })).toBeLessThanOrEqual(PLAYER_GLIDE_DURATION_MAX_MS);
  });
});

describe('resolveWallBumpNudge', () => {
  it('peaks at the max offset toward the wall and returns to zero', () => {
    expect(resolveWallBumpNudge(0, 1, 0, false)).toEqual({ x: 0, y: 0 });
    expect(resolveWallBumpNudge(WALL_BUMP_DURATION_MS / 2, 1, 0, false)).toEqual({ x: WALL_BUMP_MAX_OFFSET_PX, y: 0 });
    expect(resolveWallBumpNudge(WALL_BUMP_DURATION_MS / 2, 0, -1, false)).toEqual({ x: 0, y: -WALL_BUMP_MAX_OFFSET_PX });
    expect(resolveWallBumpNudge(WALL_BUMP_DURATION_MS, 1, 0, false)).toEqual({ x: 0, y: 0 });
  });

  it('is whole pixels throughout', () => {
    for (let t = 0; t < WALL_BUMP_DURATION_MS; t += 3) {
      const n = resolveWallBumpNudge(t, -1, 0, false);
      expect(Number.isInteger(n.x)).toBe(true);
      expect(Math.abs(n.x)).toBeLessThanOrEqual(WALL_BUMP_MAX_OFFSET_PX);
    }
  });

  it('does nothing in reduced motion', () => {
    expect(resolveWallBumpNudge(WALL_BUMP_DURATION_MS / 2, 1, 0, true)).toEqual({ x: 0, y: 0 });
  });
});

describe('shouldBuzzWallBump', () => {
  it('throttles repeats and is silent in reduced motion', () => {
    expect(shouldBuzzWallBump(1000, null, false)).toBe(true);
    expect(shouldBuzzWallBump(1050, 1000, false)).toBe(false);
    expect(shouldBuzzWallBump(1200, 1000, false)).toBe(true);
    expect(shouldBuzzWallBump(1000, null, true)).toBe(false);
  });
});
