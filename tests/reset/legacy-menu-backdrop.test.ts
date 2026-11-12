import { describe, expect, test } from 'vitest';
import {
  LEGACY_MENU_BACKDROP_MOTION_PROFILE,
  LEGACY_MENU_BACKDROP_STAR_MOTION,
  LEGACY_MENU_STAR_COUNT,
  advanceLegacyMenuBackdropStars,
  createLegacyMenuBackdropStars,
  resolveLegacyMenuBackdropPalette,
  resolveLegacyMenuBackdropStreakLength,
  resolveLegacyMenuBackdropTailStep,
  resolveLegacyMenuBackdropWarpDistance
} from '../../src/legacy-runtime/legacyMenuBackdrop';
import * as backdropModule from '../../src/legacy-runtime/legacyMenuBackdrop';
import { cyberArcadeMaterial } from '../../src/render/cyberArcadeMaterial';

describe('legacyMenuBackdrop', () => {
  test('creates the denser legacy-directed backdrop starfield with bounded motion data', () => {
    const stars = createLegacyMenuBackdropStars(() => 0.5);

    expect(stars).toHaveLength(LEGACY_MENU_STAR_COUNT);
    expect(stars[0]).toEqual({
      x: 0.5,
      y: 0.5,
      radius: 1.45,
      speed: 0.024999999999999998,
      alpha: 0.39499999999999996,
      drift: 0,
      seed: 0.5
    });
  });

  test('advances stars outward from center and recycles them near the warp origin', () => {
    const stars = [{
      x: 1.09,
      y: 0.5,
      radius: 1.4,
      speed: 0.03,
      alpha: 0.5,
      drift: 0,
      seed: 0.2
    }];

    advanceLegacyMenuBackdropStars(stars, 1000, false, () => 0.25);

    expect(stars[0].x).toBeCloseTo(0.5, 5);
    expect(stars[0].y).toBeCloseTo(0.553, 3);
    expect(resolveLegacyMenuBackdropWarpDistance(stars[0])).toBeLessThan(0.06);
    expect(LEGACY_MENU_BACKDROP_STAR_MOTION).toBe('radial-warp');
    expect(LEGACY_MENU_BACKDROP_MOTION_PROFILE).toBe('visible-parallax-warp');
  });

  test('reassigns a star\'s seed only on genuine rebirth, never mid-life -- the real fix for the reported "colors switch like a strobe" defect', () => {
    // A star that has NOT recycled (still inside the wrap radius): its
    // seed must be byte-identical before and after advancing, no matter
    // how far it moved -- proving the twinkle period/color/sparkle hue it
    // feeds cannot silently re-randomize mid-life the way the old
    // position-hash derivation did (see legacyMenuBackdrop.ts's own field
    // doc for the measured live trace of that defect).
    const alive = [{ x: 0.3, y: 0.3, radius: 1.4, speed: 0.03, alpha: 0.5, drift: 0.02, seed: 0.732 }];
    const seedBefore = alive[0].seed;
    for (let i = 0; i < 50; i += 1) {
      advanceLegacyMenuBackdropStars(alive, 16, false, () => 0.9);
    }
    // 0.82 mirrors the module's own (unexported) wrap-recycle radius --
    // confirms this star genuinely stayed alive rather than recycling.
    expect(resolveLegacyMenuBackdropWarpDistance(alive[0])).toBeLessThan(0.82);
    expect(alive[0].seed).toBe(seedBefore);

    // A star that DOES recycle this call (starts past the wrap radius):
    // its seed must change to a value actually drawn from the supplied
    // random source -- a genuine new identity for the reborn point of
    // light, not a frozen stale one and not a silent re-derivation from
    // its new position either.
    const reborn = [{ x: 1.5, y: 0.5, radius: 1.4, speed: 0.03, alpha: 0.5, drift: 0, seed: 0.111 }];
    advanceLegacyMenuBackdropStars(reborn, 1000, false, () => 0.777);
    expect(reborn[0].seed).toBe(0.777);
    expect(reborn[0].seed).not.toBe(0.111);
  });

  test('publishes the canonical Precision Arcade substrate and bounded legacy shards', () => {
    expect(resolveLegacyMenuBackdropPalette(false)).toEqual({
      fieldColor: cyberArcadeMaterial.substrate.fieldRaised,
      starAlphaScale: 1.08,
      overlayAlpha: 0
    });

    expect(resolveLegacyMenuBackdropPalette(true)).toEqual({
      fieldColor: cyberArcadeMaterial.substrate.field,
      starAlphaScale: 0.74,
      overlayAlpha: 0.1
    });
  });

  // MAZER-VIS-027: the unused angular shard, glass shard and drift rune generators (and their counts and
  // pinned source strings) are deleted; the backdrop module is the round star field and its palette only.
  test('exposes only the star backdrop surface', () => {
    expect(Object.keys(backdropModule).sort()).toEqual([
      'LEGACY_MENU_BACKDROP_MOTION_PROFILE',
      'LEGACY_MENU_BACKDROP_STAR_MOTION',
      'LEGACY_MENU_STAR_COUNT',
      'advanceLegacyMenuBackdropStars',
      'createLegacyMenuBackdropStars',
      'resolveLegacyMenuBackdropPalette',
      'resolveLegacyMenuBackdropStreakLength',
      'resolveLegacyMenuBackdropTailStep',
      'resolveLegacyMenuBackdropWarpDistance',
      'resolveLegacyMenuBackdropWarpVector'
    ]);
  });

  test('keeps star streaks short with smooth inward radial tails', () => {
    const star = {
      x: 0.8,
      y: 0.8,
      radius: 2,
      speed: 0.03,
      alpha: 0.6,
      drift: 0.02
    };

    expect(resolveLegacyMenuBackdropStreakLength(star)).toBe(5);
    expect(resolveLegacyMenuBackdropTailStep(star).x).toBeCloseTo(-0.607, 3);
    expect(resolveLegacyMenuBackdropTailStep(star).y).toBeCloseTo(-0.607, 3);
    expect(resolveLegacyMenuBackdropTailStep({ ...star, x: 0.2, y: 0.3 }).x).toBeCloseTo(0.692, 3);
    expect(resolveLegacyMenuBackdropTailStep({ ...star, x: 0.2, y: 0.3 }).y).toBeCloseTo(0.461, 3);
    expect(resolveLegacyMenuBackdropTailStep({ ...star, x: 0.5, y: 0.08 }).x).toBeCloseTo(0, 3);
    expect(resolveLegacyMenuBackdropTailStep({ ...star, x: 0.5, y: 0.08 }).y).toBeCloseTo(0.856, 3);
  });
});
