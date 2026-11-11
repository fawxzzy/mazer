import { describe, expect, test, vi } from 'vitest';
import {
  BACKDROP_HERO_STAR_CORE_PX,
  BACKDROP_STAR_FIELD_SEED,
  BACKDROP_STAR_SIZE_MAX,
  BACKDROP_STAR_SIZE_MIN,
  BACKDROP_STAR_TWINKLE_FLOOR,
  createBackdropStarRandom,
  resolveBackdropStarDraw,
  resolveBackdropTwinkleAlpha,
  resolveBackdropTwinkleSize
} from '../../src/render/backdropStars';
import { createLegacyMenuBackdropStars } from '../../src/legacy-runtime/legacyMenuBackdrop';
import { MenuScene } from '../../src/scenes/MenuScene';

vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)), Linear: (a: number, b: number, t: number) => a + ((b - a) * t) },
    Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' },
    Scene: class {}
  }
}));

/**
 * Owner, 2026-11-10 (live phone board): "no more stagnant stars in the background" (the coloured four-point sparkles
 * are retired) and, after PR #411 drew too few: "why are there no more background stars? all i said was no more
 * stagnant ones". Also "there's weird symbols in the background that need removed".
 */
describe('backdrop stars: every star is drawn as a round point of light, nothing glyph-like is', () => {
  test('no star is ever hidden: small ones are dots, the nearest ones are hero dots', () => {
    for (let core = 1; core <= 12; core += 1) {
      const draw = resolveBackdropStarDraw(core);
      expect(draw, `core ${core}`).toBe(core >= BACKDROP_HERO_STAR_CORE_PX ? 'hero' : 'dot');
    }
  });

  test('the real star field has both kinds, so both paths are exercised', () => {
    const cores = createLegacyMenuBackdropStars().map((star) => Math.max(1, Math.round(star.radius)));
    expect(cores.some((core) => core >= BACKDROP_HERO_STAR_CORE_PX)).toBe(true);
    expect(cores.some((core) => core < BACKDROP_HERO_STAR_CORE_PX)).toBe(true);
  });

  test('a twinkling star never vanishes and never leaves its size band', () => {
    for (let phase = 0; phase <= 1.0001; phase += 0.05) {
      const alpha = resolveBackdropTwinkleAlpha(phase);
      const size = resolveBackdropTwinkleSize(phase);
      expect(alpha).toBeGreaterThanOrEqual(BACKDROP_STAR_TWINKLE_FLOOR);
      expect(alpha).toBeLessThanOrEqual(1);
      expect(size).toBeGreaterThanOrEqual(BACKDROP_STAR_SIZE_MIN);
      expect(size).toBeLessThanOrEqual(BACKDROP_STAR_SIZE_MAX);
    }
    expect(resolveBackdropTwinkleAlpha(-3)).toBe(BACKDROP_STAR_TWINKLE_FLOOR);
    expect(resolveBackdropTwinkleAlpha(7)).toBe(1);
  });

  test('the initial star layout is deterministic (so pixel gates are not flaky) and well spread', () => {
    const a = createLegacyMenuBackdropStars(createBackdropStarRandom());
    const b = createLegacyMenuBackdropStars(createBackdropStarRandom());
    expect(a).toEqual(b);
    expect(createBackdropStarRandom(BACKDROP_STAR_FIELD_SEED + 1)()).not.toBe(createBackdropStarRandom()());
    for (const star of a) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThan(1);
    }
  });

  test.each([true, false])('MenuScene.drawBackdrop draws only the field, round dots and hero halos (motion %s)', (motion) => {
    const calls: string[] = [];
    const graphics = new Proxy({}, {
      get: (_target, name: string) => (...args: unknown[]) => {
        calls.push(name);
        return args[0];
      }
    });
    const fakeScene = {
      layout: { width: 390, height: 844 },
      backdropGraphics: graphics,
      settings: { darkMode: true, toggleAnimatedBackdrop: motion },
      prefersLegacyReducedMotion: () => false,
      time: { now: 1234 },
      stars: createLegacyMenuBackdropStars(createBackdropStarRandom()),
      backdropDirty: true
    };

    (MenuScene.prototype as unknown as { drawBackdrop(): void }).drawBackdrop.call(fakeScene);

    const allowed = new Set(['clear', 'fillStyle', 'fillRect', 'fillCircle']);
    expect(calls.filter((name) => !allowed.has(name))).toEqual([]);
    // One field rect only: no tail pixels, no shard/rune/sigil strokes (those were lineStyle + paths).
    expect(calls.filter((name) => name === 'fillRect')).toHaveLength(1);
    expect(calls.filter((name) => name === 'fillCircle').length).toBeGreaterThanOrEqual(fakeScene.stars.length);
    expect(fakeScene.backdropDirty).toBe(false);
  });
});
