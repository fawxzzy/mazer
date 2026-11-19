import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';

const setTransformCalls: unknown[][] = [];
let setTransformResult = true;
vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)), Linear: (a: number, b: number, t: number) => a + ((b - a) * t) },
    Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' },
    Scene: class {},
    Renderer: {
      Canvas: {
        SetTransform: (...args: unknown[]) => {
          setTransformCalls.push(args);
          return setTransformResult;
        }
      }
    }
  }
}));

import {
  BACKDROP_STAR_STYLE_CACHE_LIMIT,
  BackdropStarDrawList,
  installBackdropStarCanvasRenderer,
  paintBackdropStarDrawList,
  resolveBackdropStarFillStyle,
  type BackdropStarCanvasContext
} from '../../src/render/backdropStarBatch';
import {
  createBackdropStarRandom,
  resolveBackdropStarDraw,
  resolveBackdropTwinkleAlpha,
  resolveBackdropTwinkleSize
} from '../../src/render/backdropStars';
import { capBackdropStarAlpha, isBackdropRainbowStar, resolveBackdropRainbowColor } from '../../src/render/backdropStarHue';
import {
  createLegacyMenuBackdropStars,
  resolveLegacyMenuBackdropPalette,
  type LegacyMenuBackdropStar
} from '../../src/legacy-runtime/legacyMenuBackdrop';
import { MenuScene } from '../../src/scenes/MenuScene';

type Op = [string, ...unknown[]];

/** A canvas context that records every call and every style/alpha assignment, in order. */
const recordingContext = (globalAlpha = 1): BackdropStarCanvasContext & { ops: Op[] } => {
  const ops: Op[] = [];
  let fillStyle: string = '#000000';
  let alpha = globalAlpha;
  return {
    ops,
    get fillStyle() { return fillStyle; },
    set fillStyle(value: string) { fillStyle = value; ops.push(['fillStyle', value]); },
    get globalAlpha() { return alpha; },
    set globalAlpha(value: number) { alpha = value; ops.push(['globalAlpha', value]); },
    beginPath: () => { ops.push(['beginPath']); },
    arc: (...args: unknown[]) => { ops.push(['arc', ...args]); },
    fill: () => { ops.push(['fill']); },
    restore: () => { ops.push(['restore']); }
  } as BackdropStarCanvasContext & { ops: Op[] };
};

describe('backdrop star draw list (MAZER-PERF-014)', () => {
  test('stores circles in order, grows past its starting room and resets without losing storage', () => {
    const list = new BackdropStarDrawList();
    for (let i = 0; i < 3000; i += 1) {
      list.fillCircle(0x102030 + i, i / 3000, i, i * 2, 1 + (i % 7));
    }
    expect(list.count).toBe(3000);
    expect(list.circleAt(0)).toEqual({ color: 0x102030, alpha: 0, x: 0, y: 0, radius: 1 });
    expect(list.circleAt(2999)).toEqual({ color: 0x102030 + 2999, alpha: 2999 / 3000, x: 2999, y: 5998, radius: 1 + (2999 % 7) });
    list.reset();
    expect(list.count).toBe(0);
    list.fillCircle(0xffffff, 0.5, 1, 2, 3);
    expect(list.circleAt(0)).toEqual({ color: 0xffffff, alpha: 0.5, x: 1, y: 2, radius: 3 });
  });

  test('colour strings are #rrggbb, zero padded, cached, and the cache is bounded', () => {
    expect(resolveBackdropStarFillStyle(0xffffff)).toBe('#ffffff');
    expect(resolveBackdropStarFillStyle(0x0a0b0c)).toBe('#0a0b0c');
    expect(resolveBackdropStarFillStyle(0)).toBe('#000000');
    expect(resolveBackdropStarFillStyle(0xbfe3ff)).toBe(resolveBackdropStarFillStyle(0xbfe3ff));
    for (let i = 0; i < BACKDROP_STAR_STYLE_CACHE_LIMIT + 10; i += 1) {
      expect(resolveBackdropStarFillStyle(i)).toBe(`#${i.toString(16).padStart(6, '0')}`);
    }
  });

  test('paints every circle in order with one beginPath/arc/fill, colour set only when it changes, alpha via globalAlpha', () => {
    const list = new BackdropStarDrawList();
    list.fillCircle(0xffffff, 0.1, 10, 20, 6);
    list.fillCircle(0xffffff, 0.24, 10, 20, 2.5);
    list.fillCircle(0xffffff, 0.5, 10, 20, 1);
    list.fillCircle(0xbfe3ff, 0.3, 40, 50, 0.6);
    const ctx = recordingContext(0.8);
    paintBackdropStarDrawList(ctx, list);
    const full = Math.PI * 2;
    expect(ctx.ops).toEqual([
      ['fillStyle', '#ffffff'], ['globalAlpha', 0.8 * 0.1], ['beginPath'], ['arc', 10, 20, 6, 0, full, false], ['fill'],
      ['globalAlpha', 0.8 * 0.24], ['beginPath'], ['arc', 10, 20, 2.5, 0, full, false], ['fill'],
      ['globalAlpha', 0.8 * 0.5], ['beginPath'], ['arc', 10, 20, 1, 0, full, false], ['fill'],
      ['fillStyle', '#bfe3ff'], ['globalAlpha', 0.8 * 0.3], ['beginPath'], ['arc', 40, 50, 0.6, 0, full, false], ['fill'],
      ['globalAlpha', 0.8]
    ]);
  });

  test('alpha is clamped like an rgba() alpha (an out-of-range globalAlpha would be ignored by the canvas)', () => {
    const list = new BackdropStarDrawList();
    list.fillCircle(0xffffff, 1.08, 0, 0, 1);
    list.fillCircle(0xffffff, -0.2, 0, 0, 1);
    list.fillCircle(0xffffff, Number.NaN, 0, 0, 1);
    const ctx = recordingContext(1);
    paintBackdropStarDrawList(ctx, list);
    expect(ctx.ops.filter((op) => op[0] === 'globalAlpha').map((op) => op[1])).toEqual([1, 0, 0, 1]);
  });

  test('an empty list touches nothing', () => {
    const ctx = recordingContext();
    paintBackdropStarDrawList(ctx, new BackdropStarDrawList());
    expect(ctx.ops).toEqual([]);
  });
});

describe('backdrop Graphics paints the list in its own display-list slot', () => {
  const setup = (commandBuffer: unknown[] = []) => {
    const phaserRenderCalls: unknown[][] = [];
    const graphics = {
      commandBuffer,
      renderCanvas: (...args: unknown[]) => { phaserRenderCalls.push(args); }
    };
    const list = new BackdropStarDrawList();
    installBackdropStarCanvasRenderer(graphics as never, list);
    const ctx = recordingContext();
    const renderer = { currentContext: ctx };
    const rendered: unknown[] = [];
    const camera = { addToRenderList: (src: unknown) => { rendered.push(src); } };
    const render = (renderTargetCtx?: unknown, allowClip?: boolean) => (
      (graphics.renderCanvas as (...args: unknown[]) => void)(renderer, graphics, camera, undefined, renderTargetCtx, allowClip)
    );
    return { graphics, list, ctx, rendered, render, phaserRenderCalls };
  };

  test('uses Phaser SetTransform, paints, then restores the context SetTransform saved', () => {
    setTransformCalls.length = 0;
    setTransformResult = true;
    const { list, ctx, rendered, render, phaserRenderCalls, graphics } = setup();
    list.fillCircle(0xffffff, 0.5, 1, 2, 3);
    render();
    expect(setTransformCalls).toHaveLength(1);
    expect(setTransformCalls[0][2]).toBe(graphics);
    expect(rendered).toEqual([graphics]);
    expect(ctx.ops.map((op) => op[0])).toEqual(['fillStyle', 'globalAlpha', 'beginPath', 'arc', 'fill', 'globalAlpha', 'restore']);
    expect(phaserRenderCalls).toHaveLength(0);
  });

  test('nothing to paint, a hidden object (SetTransform false) or a mask pass paints nothing', () => {
    setTransformCalls.length = 0;
    const empty = setup();
    empty.render();
    expect(empty.ctx.ops).toEqual([]);
    expect(setTransformCalls).toHaveLength(0);

    setTransformResult = false;
    const hidden = setup();
    hidden.list.fillCircle(0xffffff, 0.5, 1, 2, 3);
    hidden.render();
    expect(hidden.ctx.ops).toEqual([]);
    expect(hidden.rendered).toEqual([]);
    setTransformResult = true;

    const mask = setup();
    mask.list.fillCircle(0xffffff, 0.5, 1, 2, 3);
    mask.render(undefined, true);
    expect(mask.ctx.ops).toEqual([]);
  });

  test('anything still in the Graphics command buffer goes through Phaser first; a render target context is honoured', () => {
    const { list, render, phaserRenderCalls } = setup([7, 0xffffff, 1]);
    list.fillCircle(0xffffff, 0.5, 1, 2, 3);
    const target = recordingContext();
    render(target, false);
    expect(phaserRenderCalls).toHaveLength(1);
    expect(target.ops.some((op) => op[0] === 'arc')).toBe(true);
  });
});

/**
 * The old drawBackdrop body (before MAZER-PERF-014), as Graphics fillStyle/fillCircle pairs. The list must hold exactly
 * these circles, so the picture is unchanged: same twinkle, size breath, rainbow colour, alpha cap and halos.
 */
const legacyCircles = (
  stars: LegacyMenuBackdropStar[],
  width: number,
  height: number,
  timeNow: number,
  motion: boolean,
  darkMode: boolean
) => {
  const out: Array<{ color: number; alpha: number; x: number; y: number; radius: number }> = [];
  const palette = resolveLegacyMenuBackdropPalette(darkMode);
  const animationTime = motion ? timeNow : 0;
  for (const star of stars) {
    const pixelX = Math.round(star.x * width);
    const pixelY = Math.round(star.y * height);
    const coreSize = Math.max(1, Math.round(star.radius));
    const starSeed = star.seed;
    const twinklePeriodMs = 2200 * (0.75 + (starSeed * 0.5));
    const twinkleRaw = motion ? (Math.sin(((animationTime / twinklePeriodMs) + starSeed) * Math.PI * 2) + 1) / 2 : 0.5;
    const twinklePhase = twinkleRaw * twinkleRaw * (3 - (2 * twinkleRaw));
    const twinkleAlpha = star.alpha * resolveBackdropTwinkleAlpha(twinklePhase);
    const sizeMultiplier = resolveBackdropTwinkleSize(twinklePhase);
    const rainbowStar = isBackdropRainbowStar(starSeed);
    const starColor = rainbowStar
      ? resolveBackdropRainbowColor(starSeed, timeNow)
      : (starSeed > 0.82 ? 0xbfe3ff : (starSeed < 0.16 ? 0xffe9c2 : 0xffffff));
    const starAlpha = capBackdropStarAlpha(twinkleAlpha * palette.starAlphaScale, rainbowStar);
    const starRadius = (coreSize / 2) * sizeMultiplier;
    const push = (alpha: number, radius: number) => out.push({ color: starColor, alpha, x: pixelX, y: pixelY, radius });
    if (resolveBackdropStarDraw(coreSize) === 'hero') {
      push(starAlpha * 0.1, starRadius + 5);
      push(starAlpha * 0.16, starRadius + 3);
      push(starAlpha * 0.24, starRadius + 1.5);
    } else if (coreSize > 1) {
      push(starAlpha * 0.18, starRadius + 1.5);
    }
    push(starAlpha, Math.max(0.6, starRadius));
  }
  return out;
};

describe('MenuScene.drawBackdrop fills the list with exactly the circles it used to draw', () => {
  test.each([
    { motion: true, darkMode: true, now: 1234 },
    { motion: true, darkMode: false, now: 98765.4 },
    { motion: false, darkMode: true, now: 40000 }
  ])('motion $motion, dark $darkMode, t=$now', ({ motion, darkMode, now }) => {
    const stars = createLegacyMenuBackdropStars(createBackdropStarRandom());
    const graphicsCalls: string[] = [];
    const fakeScene = {
      layout: { width: 390, height: 844 },
      cameras: { main: { backgroundColor: { color: -1, alpha: 0 }, setBackgroundColor() {} } },
      backdropGraphics: new Proxy({}, { get: (_t, name: string) => () => { graphicsCalls.push(name); } }),
      backdropStarList: new BackdropStarDrawList(),
      settings: { darkMode, toggleAnimatedBackdrop: motion },
      prefersLegacyReducedMotion: () => !motion,
      time: { now },
      stars,
      backdropDirty: true
    };
    // Leftovers from a previous frame must be dropped.
    fakeScene.backdropStarList.fillCircle(0x123456, 1, 0, 0, 99);
    (MenuScene.prototype as unknown as { drawBackdrop(): void }).drawBackdrop.call(fakeScene);

    const expected = legacyCircles(stars, 390, 844, now, motion, darkMode);
    const list = fakeScene.backdropStarList;
    expect(list.count).toBe(expected.length);
    expect(Array.from({ length: list.count }, (_, i) => list.circleAt(i))).toEqual(expected);
    expect(graphicsCalls).toEqual(['clear']);
  });

  test('the scene installs the painter on the backdrop Graphics and no longer pushes star fill commands', () => {
    const source = readFileSync('src/scenes/MenuScene.ts', 'utf8');
    expect(source).toContain('installBackdropStarCanvasRenderer(this.backdropGraphics, this.backdropStarList);');
    expect(source).not.toContain('this.backdropGraphics.fillCircle(');
    expect(source).not.toContain('this.backdropGraphics.fillStyle(');
  });
});
