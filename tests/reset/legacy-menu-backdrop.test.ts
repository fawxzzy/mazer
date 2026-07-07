import { describe, expect, test } from 'vitest';
import {
  LEGACY_MENU_STAR_COUNT,
  advanceLegacyMenuBackdropStars,
  createLegacyMenuBackdropStars,
  resolveLegacyMenuBackdropOrbs,
  resolveLegacyMenuBackdropPalette,
  resolveLegacyMenuBackdropStreakLength,
  resolveLegacyMenuBackdropTailStep
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

  test('advances stars downward with wrap-safe x drift for the menu backdrop', () => {
    const stars = [{
      x: 1.02,
      y: 1.05,
      radius: 1.4,
      speed: 0.03,
      alpha: 0.5,
      drift: 0.03
    }];

    advanceLegacyMenuBackdropStars(stars, 1000, false, () => 0.25);

    expect(stars[0].y).toBe(-0.06);
    expect(stars[0].x).toBe(0.25);
  });

  test('publishes a deep blue-violet palette and bounded haze orbs', () => {
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

    const orbs = resolveLegacyMenuBackdropOrbs(1280, 720, false);
    expect(orbs).toHaveLength(8);
    expect(orbs[0].x).toBeCloseTo(665.6, 1);
    expect(orbs[0].radius).toBeCloseTo(273.6, 1);
    expect(orbs[5].alpha).toBeLessThan(0.02);
  });

  test('keeps star streaks short and biased upward against movement', () => {
    const star = {
      x: 0.5,
      y: 0.5,
      radius: 2,
      speed: 0.03,
      alpha: 0.6,
      drift: 0.02
    };

    expect(resolveLegacyMenuBackdropStreakLength(star)).toBe(2);
    expect(resolveLegacyMenuBackdropTailStep(star)).toEqual({ x: -1, y: -1 });
    expect(resolveLegacyMenuBackdropTailStep({ ...star, drift: -0.02 })).toEqual({ x: 1, y: -1 });
    expect(resolveLegacyMenuBackdropTailStep({ ...star, drift: 0 })).toEqual({ x: 0, y: -1 });
  });
});
