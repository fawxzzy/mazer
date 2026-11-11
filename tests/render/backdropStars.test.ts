import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  BACKDROP_DECORATIVE_GLYPHS_ENABLED,
  BACKDROP_HERO_STAR_CORE_PX,
  BACKDROP_STAR_FIELD_SEED,
  BACKDROP_STAR_SIZE_MAX,
  BACKDROP_STAR_SIZE_MIN,
  BACKDROP_STAR_TAILS_ENABLED,
  BACKDROP_STAR_TWINKLE_FLOOR,
  createBackdropStarRandom,
  resolveBackdropStarDraw,
  resolveBackdropTwinkleAlpha,
  resolveBackdropTwinkleSize
} from '../../src/render/backdropStars';
import { createLegacyMenuBackdropStars } from '../../src/legacy-runtime/legacyMenuBackdrop';

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

  test('the glyph decorations and the one-pixel warp tails stay switched off', () => {
    expect(BACKDROP_DECORATIVE_GLYPHS_ENABLED).toBe(false);
    expect(BACKDROP_STAR_TAILS_ENABLED).toBe(false);
  });

  test('MenuScene.drawBackdrop gates every glyph decoration and routes every star through the policy', () => {
    const source = readFileSync('src/scenes/MenuScene.ts', 'utf8');
    const start = source.indexOf('private drawBackdrop(): void {');
    const end = source.indexOf('private installLegacyReducedMotionPreference', start);
    expect(start).toBeGreaterThan(0);
    const body = source.slice(start, end);
    const gate = body.indexOf('if (BACKDROP_DECORATIVE_GLYPHS_ENABLED) {');
    expect(gate).toBeGreaterThan(0);
    for (const call of ['drawLegacyBackdropShard(', 'drawLegacyBackdropRune(', 'drawLegacyBackdropSigils(']) {
      const at = body.indexOf(call);
      expect(at, call).toBeGreaterThan(gate);
      expect(at, call).toBeLessThan(body.indexOf('for (const star of this.stars)'));
    }
    expect(body).toContain('resolveBackdropStarDraw(coreSize)');
    expect(body).not.toContain("=== 'none'");
    const starLoop = body.slice(body.indexOf('for (const star of this.stars)'));
    expect(starLoop).not.toContain('drawLegacyFourPointSparkle');
    expect(starLoop).not.toContain('HSVToRGB');
    expect(starLoop).toContain('BACKDROP_STAR_TAILS_ENABLED &&');
  });
});
