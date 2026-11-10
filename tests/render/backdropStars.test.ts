import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  RETIRED_BACKDROP_SPARKLE_CORE_PX,
  resolveBackdropStarDraw
} from '../../src/render/backdropStars';
import { createLegacyMenuBackdropStars } from '../../src/legacy-runtime/legacyMenuBackdrop';

/**
 * Owner, 2026-11-10 (live phone board): "no more stagnant stars in the background". The coloured four-point sparkle
 * stars are retired, and a star is only drawn while the backdrop animates.
 */
describe('backdrop stars: the coloured sparkles are gone and nothing stagnant is drawn', () => {
  test('no star is ever drawn when the backdrop is not animating (Still setting or reduced motion)', () => {
    for (let core = 1; core <= 12; core += 1) {
      expect(resolveBackdropStarDraw(core, false), `core ${core}`).toBe('none');
    }
  });

  test('stars that used to be coloured sparkles (core >= 3 px) are not drawn at all, even animating', () => {
    for (let core = RETIRED_BACKDROP_SPARKLE_CORE_PX; core <= 12; core += 1) {
      expect(resolveBackdropStarDraw(core, true), `core ${core}`).toBe('none');
    }
  });

  test('only the small, drifting, twinkling dots remain, and only while animating', () => {
    expect(resolveBackdropStarDraw(1, true)).toBe('dot');
    expect(resolveBackdropStarDraw(2, true)).toBe('dot');
  });

  test('the real star field has both kinds, so the retirement is not vacuous', () => {
    const cores = createLegacyMenuBackdropStars().map((star) => Math.max(1, Math.round(star.radius)));
    expect(cores.some((core) => core >= RETIRED_BACKDROP_SPARKLE_CORE_PX)).toBe(true);
    expect(cores.some((core) => core < RETIRED_BACKDROP_SPARKLE_CORE_PX)).toBe(true);
  });

  test('MenuScene.drawBackdrop routes every star through the policy and draws no sparkle in the star loop', () => {
    const source = readFileSync('src/scenes/MenuScene.ts', 'utf8');
    const start = source.indexOf('private drawBackdrop(): void {');
    const end = source.indexOf('private installLegacyReducedMotionPreference', start);
    expect(start).toBeGreaterThan(0);
    const body = source.slice(start, end);
    expect(body).toContain('resolveBackdropStarDraw(coreSize, backdropMotionEnabled)');
    const starLoop = body.slice(body.indexOf('for (const star of this.stars)'));
    expect(starLoop).not.toContain('drawLegacyFourPointSparkle');
    expect(starLoop).not.toContain('HSVToRGB');
  });
});
