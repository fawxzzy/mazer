import { describe, expect, test } from 'vitest';
import {
  LEGACY_MENU_BACKDROP_SHARD_COUNT,
  LEGACY_MENU_BACKDROP_STAR_MOTION,
  LEGACY_MENU_DRIFT_RUNE_COUNT,
  LEGACY_MENU_GLASS_SHARD_COUNT,
  LEGACY_MENU_STAR_COUNT,
  advanceLegacyMenuBackdropStars,
  createLegacyMenuBackdropStars,
  resolveLegacyMenuBackdropDriftRunes,
  resolveLegacyMenuBackdropGlassShards,
  resolveLegacyMenuBackdropPalette,
  resolveLegacyMenuBackdropShards,
  resolveLegacyMenuBackdropStreakLength,
  resolveLegacyMenuBackdropTailStep,
  resolveLegacyMenuBackdropWarpDistance
} from '../../src/legacy-runtime/legacyMenuBackdrop';

describe('legacyMenuBackdrop', () => {
  test('creates the denser legacy-directed backdrop starfield with bounded motion data', () => {
    const stars = createLegacyMenuBackdropStars(() => 0.5);

    expect(stars).toHaveLength(LEGACY_MENU_STAR_COUNT);
    expect(stars[0]).toEqual({
      x: 0.5,
      y: 0.5,
      radius: 1.81,
      speed: 0.027000000000000003,
      alpha: 0.56,
      drift: 0
    });
  });

  test('advances stars outward from center and recycles them near the warp origin', () => {
    const stars = [{
      x: 1.09,
      y: 0.5,
      radius: 1.4,
      speed: 0.03,
      alpha: 0.5,
      drift: 0
    }];

    advanceLegacyMenuBackdropStars(stars, 1000, false, () => 0.25);

    expect(stars[0].x).toBeCloseTo(0.5, 5);
    expect(stars[0].y).toBeCloseTo(0.553, 3);
    expect(resolveLegacyMenuBackdropWarpDistance(stars[0])).toBeLessThan(0.06);
    expect(LEGACY_MENU_BACKDROP_STAR_MOTION).toBe('radial-warp');
  });

  test('publishes a deep blue-violet palette and bounded angular shards', () => {
    expect(resolveLegacyMenuBackdropPalette(false)).toEqual({
      fieldColor: 0x10172c,
      starAlphaScale: 1.08,
      overlayAlpha: 0
    });

    expect(resolveLegacyMenuBackdropPalette(true)).toEqual({
      fieldColor: 0x090d19,
      starAlphaScale: 0.74,
      overlayAlpha: 0.1
    });

    const shards = resolveLegacyMenuBackdropShards(1280, 720, false);
    expect(shards).toHaveLength(LEGACY_MENU_BACKDROP_SHARD_COUNT);
    expect(shards[0].x).toBeCloseTo(51.2, 1);
    expect(shards[0].length).toBeCloseTo(136.8, 1);
    expect(shards[0].thickness).toBeCloseTo(4.32, 2);
    expect(shards[1].x).toBeCloseTo(1228.8, 1);
    expect(shards[1].length).toBeCloseTo(144, 1);
    expect(shards[5].alpha).toBeGreaterThan(0.02);
  });

  test('resolves low-count glass shards and runes that animate only when requested', () => {
    const staticShards = resolveLegacyMenuBackdropGlassShards(390, 844, false, 0, false);
    const animatedShards = resolveLegacyMenuBackdropGlassShards(390, 844, false, 4000, true);
    const staticRunes = resolveLegacyMenuBackdropDriftRunes(390, 844, false, 0, false);
    const animatedRunes = resolveLegacyMenuBackdropDriftRunes(390, 844, false, 4000, true);

    expect(staticShards).toHaveLength(LEGACY_MENU_GLASS_SHARD_COUNT);
    expect(staticRunes).toHaveLength(LEGACY_MENU_DRIFT_RUNE_COUNT);
    expect(staticShards[0].length).toBeCloseTo(50.7, 1);
    expect(staticShards[0].thickness).toBeCloseTo(3, 1);
    expect(staticShards[0].alpha).toBeCloseTo(0.056, 3);
    expect(staticRunes[0].size).toBeGreaterThanOrEqual(3);
    expect(animatedShards[0].x).not.toBe(staticShards[0].x);
    expect(animatedRunes[1].x).not.toBe(staticRunes[1].x);

    const darkShards = resolveLegacyMenuBackdropGlassShards(390, 844, true, 0, false);
    const darkRunes = resolveLegacyMenuBackdropDriftRunes(390, 844, true, 0, false);
    expect(darkShards[0].alpha).toBeLessThan(staticShards[0].alpha);
    expect(darkRunes[0].alpha).toBeLessThan(staticRunes[0].alpha);
  });

  test('keeps star streaks short and biased inward against radial movement', () => {
    const star = {
      x: 0.8,
      y: 0.8,
      radius: 2,
      speed: 0.03,
      alpha: 0.6,
      drift: 0.02
    };

    expect(resolveLegacyMenuBackdropStreakLength(star)).toBe(5);
    expect(resolveLegacyMenuBackdropTailStep(star)).toEqual({ x: -1, y: -1 });
    expect(resolveLegacyMenuBackdropTailStep({ ...star, x: 0.2, y: 0.3 })).toEqual({ x: 1, y: 1 });
    expect(resolveLegacyMenuBackdropTailStep({ ...star, x: 0.5, y: 0.08 })).toEqual({ x: 0, y: 1 });
  });
});
