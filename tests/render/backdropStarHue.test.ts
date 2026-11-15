import { describe, expect, test } from 'vitest';
import {
  BACKDROP_RAINBOW_ALPHA_CAP,
  BACKDROP_RAINBOW_COLOUR_REDRAW_INTERVAL_MS,
  BACKDROP_RAINBOW_HUE_PERIOD_MS,
  BACKDROP_RAINBOW_SATURATION,
  BACKDROP_RAINBOW_STAR_SHARE,
  BACKDROP_RAINBOW_VALUE,
  backdropHsvToRgb,
  capBackdropStarAlpha,
  isBackdropRainbowStar,
  resolveBackdropRainbowColor,
  resolveBackdropRainbowHue,
  resolveBackdropRainbowPhase,
  stepBackdropColourRedraw
} from '../../src/render/backdropStarHue';
import { RAINBOW_UI_SATURATION, RAINBOW_UI_VALUE, resolveRainbowUiColor } from '../../src/render/rainbowUiPalette';
import { SHARED_BACKDROP_HEX } from '../../src/render/sharedBackdrop';
import { BACKDROP_STAR_FIELD_SEED, createBackdropStarRandom } from '../../src/render/backdropStars';
import { createLegacyMenuBackdropStars } from '../../src/legacy-runtime/legacyMenuBackdrop';
import { resolveReducedMotion } from '../../src/render/reducedMotion';

const channels = (rgb: number) => ({ r: (rgb >> 16) & 255, g: (rgb >> 8) & 255, b: rgb & 255 });
const hsvSaturation = (rgb: number): number => {
  const { r, g, b } = channels(rgb);
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
};
const luma = (rgb: number): number => {
  const { r, g, b } = channels(rgb);
  return ((0.2126 * r) + (0.7152 * g) + (0.0722 * b)) / 255;
};

describe('backdrop rainbow stars: which stars (subset selection)', () => {
  const field = createLegacyMenuBackdropStars(createBackdropStarRandom());

  test('about one in five of the real seeded field is rainbow, and it is the same set on every load', () => {
    const picked = field.filter((star) => isBackdropRainbowStar(star.seed)).length;
    const share = picked / field.length;
    expect(share).toBeGreaterThanOrEqual(0.15);
    expect(share).toBeLessThanOrEqual(0.25);

    const again = createLegacyMenuBackdropStars(createBackdropStarRandom(BACKDROP_STAR_FIELD_SEED));
    expect(again.map((star) => isBackdropRainbowStar(star.seed))).toEqual(field.map((star) => isBackdropRainbowStar(star.seed)));
  });

  test('selection depends on the persisted seed only: repeated calls agree, and drifting a star does not change it', () => {
    const star = { ...field[0]! };
    const first = isBackdropRainbowStar(star.seed);
    for (let i = 0; i < 50; i += 1) {
      star.x += 0.013;
      star.y -= 0.007;
      expect(isBackdropRainbowStar(star.seed)).toBe(first);
    }
  });

  test('the share holds across many seeds (not an artefact of the one field)', () => {
    const random = createBackdropStarRandom(12345);
    let picked = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) {
      if (isBackdropRainbowStar(random())) {
        picked += 1;
      }
    }
    expect(Math.abs((picked / n) - BACKDROP_RAINBOW_STAR_SHARE)).toBeLessThan(0.015);
  });

  test('the subset is not correlated with the old white/blue/warm colour buckets', () => {
    const random = createBackdropStarRandom(777);
    const buckets = { cool: 0, warm: 0, white: 0 };
    const n = 20000;
    for (let i = 0; i < n; i += 1) {
      const seed = random();
      if (!isBackdropRainbowStar(seed)) continue;
      if (seed > 0.82) buckets.cool += 1;
      else if (seed < 0.16) buckets.warm += 1;
      else buckets.white += 1;
    }
    const total = buckets.cool + buckets.warm + buckets.white;
    expect(buckets.cool / total).toBeGreaterThan(0.1);
    expect(buckets.warm / total).toBeGreaterThan(0.1);
  });

  test('non-finite seeds are handled without throwing', () => {
    expect(() => isBackdropRainbowStar(Number.NaN)).not.toThrow();
    expect(() => resolveBackdropRainbowPhase(Number.POSITIVE_INFINITY)).not.toThrow();
  });
});

describe('backdrop rainbow stars: hue function', () => {
  test('hue is in [0, 1), advances one lap per period and is periodic', () => {
    for (const seed of [0, 0.1, 0.5, 0.93]) {
      for (let t = 0; t <= 3 * BACKDROP_RAINBOW_HUE_PERIOD_MS; t += 777) {
        const hue = resolveBackdropRainbowHue(seed, t);
        expect(hue).toBeGreaterThanOrEqual(0);
        expect(hue).toBeLessThan(1);
        expect(resolveBackdropRainbowHue(seed, t + BACKDROP_RAINBOW_HUE_PERIOD_MS)).toBeCloseTo(hue, 9);
      }
    }
  });

  test('over one lap a star visits the whole spectrum', () => {
    const hues = new Set<number>();
    for (let t = 0; t < BACKDROP_RAINBOW_HUE_PERIOD_MS; t += 250) {
      hues.add(Math.floor(resolveBackdropRainbowHue(0.42, t) * 6));
    }
    expect(hues.size).toBe(6);
  });

  test('different stars sit at different phases, so they are not in lockstep', () => {
    const random = createBackdropStarRandom(99);
    const phases = Array.from({ length: 40 }, () => resolveBackdropRainbowPhase(random()));
    expect(new Set(phases.map((p) => p.toFixed(3))).size).toBeGreaterThan(35);
    expect(Math.max(...phases) - Math.min(...phases)).toBeGreaterThan(0.8);
  });

  test('it is a pure function of seed and time (no hidden state)', () => {
    expect(resolveBackdropRainbowColor(0.31, 5000)).toBe(resolveBackdropRainbowColor(0.31, 5000));
    expect(resolveBackdropRainbowHue(0.31, 5000)).toBe(resolveBackdropRainbowHue(0.31, 5000));
    expect(resolveBackdropRainbowHue(0.31, Number.NaN)).toBe(resolveBackdropRainbowPhase(0.31));
  });

  test('slow: consecutive colour-redraw steps move a channel by no more than 8 units', () => {
    let worst = 0;
    for (const seed of [0.05, 0.37, 0.66, 0.9]) {
      let prev = channels(resolveBackdropRainbowColor(seed, 0));
      for (let t = BACKDROP_RAINBOW_COLOUR_REDRAW_INTERVAL_MS; t <= BACKDROP_RAINBOW_HUE_PERIOD_MS; t += BACKDROP_RAINBOW_COLOUR_REDRAW_INTERVAL_MS) {
        const next = channels(resolveBackdropRainbowColor(seed, t));
        worst = Math.max(worst, Math.abs(next.r - prev.r), Math.abs(next.g - prev.g), Math.abs(next.b - prev.b));
        prev = next;
      }
    }
    expect(worst).toBeLessThanOrEqual(8);
  });

  test('hsv conversion hits the primaries', () => {
    expect(backdropHsvToRgb(0, 1, 1)).toBe(0xff0000);
    expect(backdropHsvToRgb(1 / 3, 1, 1)).toBe(0x00ff00);
    expect(backdropHsvToRgb(2 / 3, 1, 1)).toBe(0x0000ff);
    expect(backdropHsvToRgb(0.5, 0, 1)).toBe(0xffffff);
  });
});

describe('backdrop rainbow stars: they stay dim, so the maze, trail and diamonds stay the focus', () => {
  test('saturation and brightness are the shared rainbow UI material, not a private tint', () => {
    expect(BACKDROP_RAINBOW_SATURATION).toBe(RAINBOW_UI_SATURATION);
    expect(BACKDROP_RAINBOW_VALUE).toBe(RAINBOW_UI_VALUE);
  });

  test('alpha is capped under a white star ceiling for rainbow stars only', () => {
    const whiteCeiling = 1 * 0.74; // star.alpha max 1 x twinkle max 1 x dark palette starAlphaScale 0.74
    expect(BACKDROP_RAINBOW_ALPHA_CAP).toBeLessThan(whiteCeiling);
    expect(capBackdropStarAlpha(0.74, true)).toBe(BACKDROP_RAINBOW_ALPHA_CAP);
    expect(capBackdropStarAlpha(0.3, true)).toBe(0.3);
    expect(capBackdropStarAlpha(0.74, false)).toBe(0.74);
    expect(capBackdropStarAlpha(1.08, false)).toBe(1.08);
  });

  test('worst-case rainbow star contribution (colour luma x capped alpha) is well under the bright maze path', () => {
    let worst = 0;
    for (let hue = 0; hue < 1; hue += 1 / 360) {
      worst = Math.max(worst, luma(backdropHsvToRgb(hue, BACKDROP_RAINBOW_SATURATION, BACKDROP_RAINBOW_VALUE)));
    }
    expect(worst * BACKDROP_RAINBOW_ALPHA_CAP).toBeLessThan(0.58);
  });
});

describe('backdrop rainbow stars: reduced motion keeps the colour moving, not the stars', () => {
  test('the hue reads only seed and scene time, never a motion flag, so colour is identical in every motion mode', () => {
    // Reduced motion (device or setting) is a flag the caller never passes to the hue: the function has no such input.
    expect(resolveBackdropRainbowColor.length).toBe(2);
    expect(resolveBackdropRainbowHue.length).toBe(2);
    expect(resolveReducedMotion(true, false)).toBe(true);
    const seed = 0.27;
    const colors = new Set<number>();
    for (let t = 0; t < BACKDROP_RAINBOW_HUE_PERIOD_MS; t += 1000) {
      colors.add(resolveBackdropRainbowColor(seed, t));
    }
    expect(colors.size).toBeGreaterThan(20);
  });

  test('the colour redraw gate fires every 150 ms (about 7 a second), never per frame, and never on a bad clock', () => {
    let nextDue = 0;
    let redraws = 0;
    const frameMs = 1000 / 120;
    for (let t = 1000; t < 1000 + 10000; t += frameMs) {
      const step = stepBackdropColourRedraw(t, nextDue);
      nextDue = step.nextDueAtMs;
      if (step.due) redraws += 1;
    }
    expect(redraws).toBeGreaterThanOrEqual(64);
    expect(redraws).toBeLessThanOrEqual(67);
    expect(stepBackdropColourRedraw(Number.NaN, 0)).toEqual({ due: false, nextDueAtMs: 0 });
    expect(stepBackdropColourRedraw(100, 400)).toEqual({ due: false, nextDueAtMs: 400 });
    expect(stepBackdropColourRedraw(400, 400)).toEqual({ due: true, nextDueAtMs: 400 + BACKDROP_RAINBOW_COLOUR_REDRAW_INTERVAL_MS });
  });
});

describe('backdrop rainbow stars take their colour from the shared rainbow UI palette (MAZER-VIS-035)', () => {
  test('every rainbow star colour equals the rainbow UI colour at the star hue, at any scene time', () => {
    for (let seed = 0.013; seed < 1; seed += 0.0371) {
      for (const timeMs of [0, 4000, 13370, 90000]) {
        expect(resolveBackdropRainbowColor(seed, timeMs)).toBe(resolveRainbowUiColor(resolveBackdropRainbowHue(seed, timeMs)));
      }
    }
  });

  test('the rainbow UI palette is the one the lettering draws from (HSV 0.8 / 1) and the stars carry no hsv literal of their own', async () => {
    const { readFileSync } = await import('node:fs');
    expect(RAINBOW_UI_SATURATION).toBe(0.8);
    expect(RAINBOW_UI_VALUE).toBe(1);
    expect(resolveRainbowUiColor(0)).toBe(0xff3333);
    const scene = readFileSync('src/scenes/MenuScene.ts', 'utf8');
    expect(scene).toContain('RAINBOW_UI_SATURATION,');
    expect(scene).toContain('RAINBOW_UI_VALUE');
    const stars = readFileSync('src/render/backdropStarHue.ts', 'utf8');
    expect(stars).not.toMatch(/0.5;|0.92;/);
  });

  test('a visible handful of the field is rainbow and the backdrop stays the shared near-black', () => {
    let picked = 0;
    const n = 100;
    for (let i = 0; i < n; i += 1) {
      if (isBackdropRainbowStar((i + 0.5) / n)) picked += 1;
    }
    expect(picked).toBeGreaterThanOrEqual(8);
    expect(picked).toBeLessThanOrEqual(35);
    expect(SHARED_BACKDROP_HEX).toBe('#02080f');
  });
});
