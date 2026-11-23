import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)), Linear: (a: number, b: number, t: number) => a + ((b - a) * t) },
    Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' },
    Scene: class {},
    Renderer: { Canvas: { SetTransform: () => true } }
  }
}));

import {
  BACKDROP_STAR_GATE_GUARD,
  BACKDROP_STAR_GATE_HUE,
  BACKDROP_STAR_GLYPH_SPARKLE4,
  BACKDROP_STAR_GLYPH_STAR5,
  BACKDROP_STAR_GLYPHS,
  BACKDROP_STAR_HUE_LAP_MS,
  BACKDROP_STAR_HUE_STEPS,
  BACKDROP_STAR_PALETTE,
  BACKDROP_STAR_SHAPE_ALPHA_CAP,
  BackdropStarShapeList,
  fillBackdropStarShapeList,
  guardBackdropStarHue,
  resolveBackdropStarHueStep,
  resolveBackdropStarShape,
  resolveBackdropStarShapeAlpha
} from '../../src/render/backdropStarShapes';
import { createBackdropStarRandom } from '../../src/render/backdropStars';
import { resolveRainbowUiColor } from '../../src/render/rainbowUiPalette';
import {
  createLegacyMenuBackdropStars,
  resolveLegacyMenuBackdropPalette,
  type LegacyMenuBackdropStar
} from '../../src/legacy-runtime/legacyMenuBackdrop';
import { MenuScene } from '../../src/scenes/MenuScene';

const field = (): LegacyMenuBackdropStar[] => createLegacyMenuBackdropStars(createBackdropStarRandom());
const listStars = (list: BackdropStarShapeList) => Array.from({ length: list.count }, (_, i) => list.starAt(i));

describe('MAZER-VIS-066 star shapes: shape set "Mixed"', () => {
  test('near stars are five-point stars, every other star a four-point sparkle (no dots, no discs)', () => {
    expect(resolveBackdropStarShape(3.2).glyph).toBe(BACKDROP_STAR_GLYPH_STAR5);
    expect(resolveBackdropStarShape(2.6).glyph).toBe(BACKDROP_STAR_GLYPH_STAR5);
    expect(resolveBackdropStarShape(0.4).glyph).toBe(BACKDROP_STAR_GLYPH_SPARKLE4);
    expect(resolveBackdropStarShape(0.9).glyph).toBe(BACKDROP_STAR_GLYPH_SPARKLE4);
    expect(resolveBackdropStarShape(2.0).glyph).toBe(BACKDROP_STAR_GLYPH_SPARKLE4);
    // Bigger stars are bigger shapes.
    expect(resolveBackdropStarShape(3.2).radiusCss).toBeGreaterThan(resolveBackdropStarShape(2.0).radiusCss);
    expect(resolveBackdropStarShape(2.0).radiusCss).toBeGreaterThan(resolveBackdropStarShape(0.9).radiusCss);
  });

  test('owner rule "actual stars": the only glyphs are the two pointed ones, and the real field uses both', () => {
    expect([...BACKDROP_STAR_GLYPHS].sort()).toEqual([BACKDROP_STAR_GLYPH_SPARKLE4, BACKDROP_STAR_GLYPH_STAR5]);
    const glyphs = new Set(field().map((star) => resolveBackdropStarShape(star.radius).glyph));
    expect([...glyphs].sort()).toEqual([BACKDROP_STAR_GLYPH_SPARKLE4, BACKDROP_STAR_GLYPH_STAR5]);
  });
});

describe('MAZER-VIS-066 star colour: the lettering rainbow sweep', () => {
  test('24 hue steps from the shared rainbow UI material, none inside the gate-cyan guard band', () => {
    expect(BACKDROP_STAR_PALETTE).toHaveLength(BACKDROP_STAR_HUE_STEPS);
    for (let step = 0; step < BACKDROP_STAR_HUE_STEPS; step += 1) {
      const hue = guardBackdropStarHue(step / BACKDROP_STAR_HUE_STEPS);
      expect(Math.abs(hue - BACKDROP_STAR_GATE_HUE)).toBeGreaterThanOrEqual(BACKDROP_STAR_GATE_GUARD - 1e-9);
      expect(BACKDROP_STAR_PALETTE[step]).toBe(resolveRainbowUiColor(hue));
    }
    expect(new Set(BACKDROP_STAR_PALETTE).size).toBeGreaterThanOrEqual(BACKDROP_STAR_HUE_STEPS - 2);
  });

  test('the step sweeps one lap per 5.2 s and across the screen, and is safe on bad input', () => {
    expect(resolveBackdropStarHueStep(0, 0, 390)).toBe(0);
    expect(resolveBackdropStarHueStep(BACKDROP_STAR_HUE_LAP_MS, 0, 390)).toBe(0);
    expect(resolveBackdropStarHueStep(BACKDROP_STAR_HUE_LAP_MS / 4, 0, 390)).toBe(6);
    expect(resolveBackdropStarHueStep(0, 195, 390)).toBe(12);
    expect(resolveBackdropStarHueStep(BACKDROP_STAR_HUE_LAP_MS / 2, 195, 390)).toBe(0);
    expect(resolveBackdropStarHueStep(Number.NaN, 195, 390)).toBe(12);
    expect(resolveBackdropStarHueStep(0, 195, 0)).toBe(0);
    for (let t = 0; t < 20000; t += 137) {
      const step = resolveBackdropStarHueStep(t, 100, 390);
      expect(Number.isInteger(step)).toBe(true);
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThan(BACKDROP_STAR_HUE_STEPS);
    }
  });

  test('alpha stays under the cap, twinkles, and is visible even for the dimmest star', () => {
    const dark = resolveLegacyMenuBackdropPalette(true).starAlphaScale;
    const light = resolveLegacyMenuBackdropPalette(false).starAlphaScale;
    for (const scale of [dark, light]) {
      for (const starAlpha of [0, 0.2, 0.5, 1]) {
        for (let phase = 0; phase <= 1.0001; phase += 0.1) {
          const alpha = resolveBackdropStarShapeAlpha(starAlpha, phase, scale);
          expect(alpha).toBeLessThanOrEqual(BACKDROP_STAR_SHAPE_ALPHA_CAP);
          expect(alpha).toBeGreaterThan(0.15);
        }
      }
    }
    expect(resolveBackdropStarShapeAlpha(0.1, 0, dark)).toBeLessThan(resolveBackdropStarShapeAlpha(0.1, 1, dark));
  });
});

describe('MAZER-VIS-066 star list fill', () => {
  test('one entry per star at whole css px, leftovers dropped, nothing on an empty field', () => {
    const stars = field();
    const list = new BackdropStarShapeList();
    list.push(BACKDROP_STAR_GLYPH_STAR5, 99, 0, 0, 0, 1);
    fillBackdropStarShapeList(list, stars, 390, 844, 1234, true, 0.74);
    expect(list.count).toBe(stars.length);
    for (const [index, entry] of listStars(list).entries()) {
      expect(entry.x).toBe(Math.round(stars[index].x * 390));
      expect(entry.y).toBe(Math.round(stars[index].y * 844));
      expect(entry.glyph).toBe(resolveBackdropStarShape(stars[index].radius).glyph);
      expect(entry.hueStep).toBe(resolveBackdropStarHueStep(1234, entry.x, 390));
    }
    fillBackdropStarShapeList(list, stars, 0, 844, 1234, true, 0.74);
    expect(list.count).toBe(0);
  });

  test('the list grows past its starting room', () => {
    const list = new BackdropStarShapeList();
    for (let i = 0; i < 1500; i += 1) {
      list.push(BACKDROP_STAR_GLYPH_SPARKLE4, 2, i % 24, i, i, 0.5);
    }
    expect(list.count).toBe(1500);
    expect(list.starAt(1499)).toEqual({ glyph: BACKDROP_STAR_GLYPH_SPARKLE4, radiusCss: 2, hueStep: 1499 % 24, x: 1499, y: 1499, alpha: 0.5 });
  });

  test('with motion on, stars twinkle: alpha and size change over time', () => {
    const stars = field();
    const a = new BackdropStarShapeList();
    const b = new BackdropStarShapeList();
    fillBackdropStarShapeList(a, stars, 390, 844, 1000, true, 0.74);
    fillBackdropStarShapeList(b, stars, 390, 844, 1700, true, 0.74);
    const resized = listStars(a).filter((entry, i) => entry.radiusCss !== b.starAt(i).radiusCss);
    const refaded = listStars(a).filter((entry, i) => entry.alpha !== b.starAt(i).alpha);
    expect(resized.length).toBeGreaterThan(stars.length / 2);
    expect(refaded.length).toBeGreaterThan(0);
  });

  test('Reduce Motion: shape, size, alpha and position hold still while the colour keeps shifting', () => {
    const stars = field();
    const frames = [0, 400, 2600, 9100].map((now) => {
      const list = new BackdropStarShapeList();
      fillBackdropStarShapeList(list, stars, 390, 844, now, false, 0.74);
      return listStars(list);
    });
    const still = ({ glyph, radiusCss, x, y, alpha }: ReturnType<BackdropStarShapeList['starAt']>) => ({ glyph, radiusCss, x, y, alpha });
    for (const frame of frames.slice(1)) {
      expect(frame.map(still)).toEqual(frames[0].map(still));
      const recoloured = frame.filter((entry, i) => entry.hueStep !== frames[0][i].hueStep).length;
      expect(recoloured).toBe(stars.length);
    }
  });
});

describe('MenuScene wiring (Reduce Motion stops movement, never colour)', () => {
  const fakeScene = (reducedMotion: boolean, now: number) => ({
    layout: { width: 390, height: 844 },
    cameras: { main: { backgroundColor: { color: -1, alpha: 0 }, setBackgroundColor() {} } },
    backdropGraphics: { clear() {} },
    backdropStarShapes: new BackdropStarShapeList(),
    settings: { darkMode: true, toggleAnimatedBackdrop: true },
    prefersLegacyReducedMotion: () => reducedMotion,
    time: { now },
    stars: field(),
    backdropDirty: true,
    backdropAccumulatedDeltaMs: 0,
    backdropNextUpdateAtMs: 0,
    backdropColourNextDueAtMs: 0
  });
  const proto = MenuScene.prototype as unknown as {
    drawBackdrop(this: unknown): void;
    updateStars(this: unknown, time: number, delta: number): void;
  };

  test.each([true, false])('drawBackdrop fills the list exactly as fillBackdropStarShapeList (reduced motion %s)', (reduced) => {
    const scene = fakeScene(reduced, 4321);
    proto.drawBackdrop.call(scene);
    const expected = new BackdropStarShapeList();
    fillBackdropStarShapeList(expected, scene.stars, 390, 844, 4321, !reduced, resolveLegacyMenuBackdropPalette(true).starAlphaScale);
    expect(listStars(scene.backdropStarShapes)).toEqual(listStars(expected));
    expect(scene.backdropDirty).toBe(false);
  });

  test('under Reduce Motion updateStars never moves a star but the colour gate keeps redrawing', () => {
    const scene = fakeScene(true, 0);
    const before = JSON.stringify(scene.stars);
    const redraws: number[] = [];
    for (let time = 0; time <= 3000; time += 16) {
      scene.backdropDirty = false;
      proto.updateStars.call(scene, time, 16);
      if (scene.backdropDirty) {
        redraws.push(time);
        scene.time.now = time;
        proto.drawBackdrop.call(scene);
      }
    }
    expect(JSON.stringify(scene.stars)).toBe(before);
    // About one colour redraw per 150 ms, never every frame.
    expect(redraws.length).toBeGreaterThan(15);
    expect(redraws.length).toBeLessThan(25);
  });

  test('the scene installs the sprite painter and draws no star through Graphics commands', () => {
    const source = readFileSync('src/scenes/MenuScene.ts', 'utf8');
    expect(source).toContain('installBackdropStarSpriteRenderer(this.backdropGraphics, this.backdropStarShapes);');
    expect(source).not.toContain('this.backdropGraphics.fillCircle(');
    expect(source).not.toContain('this.backdropGraphics.fillStyle(');
    expect(source).not.toContain('backdropStarBatch');
  });
});
