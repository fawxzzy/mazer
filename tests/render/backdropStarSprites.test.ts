import { describe, expect, test, vi } from 'vitest';

const setTransformCalls: unknown[][] = [];
let setTransformResult = true;
vi.mock('phaser', () => ({
  default: {
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
  BACKDROP_STAR_GLYPHS,
  BACKDROP_STAR_GLYPH_SPARKLE4,
  BACKDROP_STAR_GLYPH_STAR5,
  BACKDROP_STAR_HUE_STEPS,
  BackdropStarShapeList
} from '../../src/render/backdropStarShapes';
import {
  BACKDROP_STAR_MAX_RADIUS_DEV,
  BACKDROP_STAR_MIN_RADIUS_DEV,
  backdropStarCellSize,
  bakeBackdropStarAtlas,
  drawBackdropStarGlyph,
  installBackdropStarSpriteRenderer,
  paintBackdropStarShapeList,
  resolveBackdropStarAtlasLayout,
  resolveBackdropStarDeviceRadius,
  type BackdropStarAtlas,
  type BackdropStarAtlasCanvas,
  type BackdropStarPaintContext,
  type BackdropStarRasterContext
} from '../../src/render/backdropStarSprites';

type Op = [string, ...number[]] | ['fillStyle', string];

/** A raster context that records path points, rects and style changes. */
const rasterContext = (): BackdropStarRasterContext & { ops: Op[] } => {
  const ops: Op[] = [];
  let fillStyle = '';
  return {
    ops,
    globalAlpha: 1,
    get fillStyle() { return fillStyle; },
    set fillStyle(value: string) { fillStyle = value; ops.push(['fillStyle', value]); },
    beginPath: () => { ops.push(['beginPath']); },
    moveTo: (x, y) => { ops.push(['moveTo', x, y]); },
    lineTo: (x, y) => { ops.push(['lineTo', x, y]); },
    quadraticCurveTo: (cx, cy, x, y) => { ops.push(['quadraticCurveTo', cx, cy, x, y]); },
    closePath: () => { ops.push(['closePath']); },
    fill: () => { ops.push(['fill']); },
    fillRect: (x, y, w, h) => { ops.push(['fillRect', x, y, w, h]); },
    clearRect: (x, y, w, h) => { ops.push(['clearRect', x, y, w, h]); }
  };
};

const fakeCanvas = (ctx: BackdropStarRasterContext | null): BackdropStarAtlasCanvas => ({ width: 0, height: 0, getContext: () => ctx });

describe('MAZER-VIS-066 sprite atlas', () => {
  test('the layout stacks one row of 24 hue cells per (glyph, radius), with no overlap', () => {
    const layout = resolveBackdropStarAtlasLayout();
    expect(layout.width).toBe(BACKDROP_STAR_HUE_STEPS * backdropStarCellSize(BACKDROP_STAR_MAX_RADIUS_DEV));
    let expectedHeight = 0;
    for (let r = 1; r <= BACKDROP_STAR_MAX_RADIUS_DEV; r += 1) {
      expectedHeight += backdropStarCellSize(r);
    }
    expect(layout.height).toBe(expectedHeight * BACKDROP_STAR_GLYPHS.length);
    // Small enough to stay one cheap canvas.
    expect(layout.width).toBeLessThanOrEqual(1024);
    expect(layout.height).toBeLessThanOrEqual(1024);
    const rows = [...layout.rowY].sort((a, b) => a - b);
    expect(new Set(rows).size).toBe(rows.length);
  });

  test('bakes every sprite exactly once, up front, inside its own cell', () => {
    const ctx = rasterContext();
    const canvas = fakeCanvas(ctx);
    const atlas = bakeBackdropStarAtlas(() => canvas) as BackdropStarAtlas;
    expect(atlas).not.toBeNull();
    const layout = resolveBackdropStarAtlasLayout();
    expect(canvas.width).toBe(layout.width);
    expect(canvas.height).toBe(layout.height);
    // Every glyph draw starts with its base colour.
    const baseStyles = ctx.ops.filter((op) => op[0] === 'fillStyle');
    expect(baseStyles.length).toBeGreaterThanOrEqual(BACKDROP_STAR_GLYPHS.length * BACKDROP_STAR_MAX_RADIUS_DEV * BACKDROP_STAR_HUE_STEPS);
    // Cells: a radius 16 star at hue 23 sits at the right edge of its row.
    expect(atlas.cellX(16, 23)).toBe(23 * backdropStarCellSize(16));
    expect(atlas.cellY(BACKDROP_STAR_GLYPH_SPARKLE4, 1)).toBe(0);
    expect(atlas.cellY(BACKDROP_STAR_GLYPH_STAR5, 1)).toBe(layout.height / 2);
    // Owner rule "actual stars, never glowy lights or blurred glow": only flat rgb() fills of paths and single core
    // pixels; the raster context has no gradient, shadow or filter call to reach for, and no base fill is translucent.
    expect(new Set(ctx.ops.map((op) => op[0]))).toEqual(new Set(['clearRect', 'fillStyle', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'closePath', 'fill', 'fillRect']));
    for (const op of ctx.ops) {
      if (op[0] === 'fillStyle') {
        expect(op[1]).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
      }
      if (op[0] === 'fillRect') {
        expect([op[3], op[4]]).toEqual([1, 1]);
      }
    }
    // No path point or rect leaves the atlas.
    for (const op of ctx.ops) {
      if (op[0] === 'moveTo' || op[0] === 'lineTo') {
        expect(op[1]).toBeGreaterThanOrEqual(0);
        expect(op[1]).toBeLessThanOrEqual(layout.width);
        expect(op[2]).toBeGreaterThanOrEqual(0);
        expect(op[2]).toBeLessThanOrEqual(layout.height);
      }
    }
  });

  test('no 2D context: no atlas', () => {
    expect(bakeBackdropStarAtlas(() => fakeCanvas(null))).toBeNull();
  });

  test('glyphs: a sparkle has four curved sides, a star has ten corners; all inside the cell', () => {
    for (const glyph of BACKDROP_STAR_GLYPHS) {
      for (const r of [1, 2, 5, BACKDROP_STAR_MAX_RADIUS_DEV]) {
        const ctx = rasterContext();
        const centre = r + 1 + 0.5;
        drawBackdropStarGlyph(ctx, glyph, r, 0x336699, centre, centre);
        const cell = backdropStarCellSize(r);
        const points = ctx.ops.filter((op) => op[0] === 'moveTo' || op[0] === 'lineTo' || op[0] === 'quadraticCurveTo');
        expect(points.length).toBeGreaterThan(0);
        if (glyph === BACKDROP_STAR_GLYPH_SPARKLE4) {
          expect(ctx.ops.filter((op) => op[0] === 'quadraticCurveTo')).toHaveLength(4);
        } else {
          expect(glyph).toBe(BACKDROP_STAR_GLYPH_STAR5);
          expect(ctx.ops.filter((op) => op[0] === 'moveTo' || op[0] === 'lineTo')).toHaveLength(10);
        }
        for (const op of ctx.ops) {
          if (op[0] === 'moveTo' || op[0] === 'lineTo' || op[0] === 'fillRect') {
            expect(op[1] as number).toBeGreaterThanOrEqual(0);
            expect(op[1] as number).toBeLessThanOrEqual(cell);
            expect(op[2] as number).toBeGreaterThanOrEqual(0);
            expect(op[2] as number).toBeLessThanOrEqual(cell);
          }
        }
        expect(ctx.ops[0]).toEqual(['fillStyle', 'rgb(51,102,153)']);
      }
    }
  });

  test('device radius is whole, at least the minimum (1 by default) and at most the atlas maximum', () => {
    expect(resolveBackdropStarDeviceRadius(0.1, 1)).toBe(1);
    expect(resolveBackdropStarDeviceRadius(2, 2.625)).toBe(5);
    expect(resolveBackdropStarDeviceRadius(4.6, 3)).toBe(14);
    expect(resolveBackdropStarDeviceRadius(40, 3)).toBe(BACKDROP_STAR_MAX_RADIUS_DEV);
    expect(resolveBackdropStarDeviceRadius(Number.NaN, 3)).toBe(1);
    // A glyph is never shrunk below the size where its points still show.
    expect(BACKDROP_STAR_MIN_RADIUS_DEV[BACKDROP_STAR_GLYPH_SPARKLE4]).toBe(3);
    expect(BACKDROP_STAR_MIN_RADIUS_DEV[BACKDROP_STAR_GLYPH_STAR5]).toBe(5);
    expect(resolveBackdropStarDeviceRadius(0.3, 2.625, 3)).toBe(3);
    expect(resolveBackdropStarDeviceRadius(Number.NaN, 3, 5)).toBe(5);
    expect(resolveBackdropStarDeviceRadius(2, 3, 5)).toBe(6);
  });
});

/** A paint context that records transform resets and blits. */
const paintContext = (transform: { a: number; d: number; e: number; f: number }, globalAlpha = 1) => {
  const ops: Array<[string, ...unknown[]]> = [];
  let alpha = globalAlpha;
  const ctx: BackdropStarPaintContext & { setTransform: () => void; restore: () => void } = {
    get globalAlpha() { return alpha; },
    set globalAlpha(value: number) { alpha = value; ops.push(['globalAlpha', value]); },
    getTransform: () => { ops.push(['getTransform']); return transform; },
    resetTransform: () => { ops.push(['resetTransform']); },
    setTransform: () => { ops.push(['setTransform']); },
    restore: () => { ops.push(['restore']); },
    drawImage: (...args: unknown[]) => { ops.push(['drawImage', ...args]); }
  };
  return { ctx, ops };
};

const stubAtlas = (): BackdropStarAtlas => ({
  canvas: fakeCanvas(null),
  cellX: (r, hue) => hue * backdropStarCellSize(r),
  cellY: (glyph, r) => (glyph * 1000) + r
});

describe('MAZER-VIS-066 painter', () => {
  test.each([
    { name: '390x844@3', a: 3 },
    { name: '412x915@2.625', a: 2.625 },
    { name: '393x851@2.75', a: 2.75 }
  ])('blits 1:1 at whole device pixels after resetTransform, never setTransform ($name)', ({ a }) => {
    const list = new BackdropStarShapeList();
    list.push(BACKDROP_STAR_GLYPH_STAR5, 4.1, 5, 101, 333, 0.5);
    list.push(BACKDROP_STAR_GLYPH_SPARKLE4, 0.5, 23, 7, 9, 2);
    list.push(BACKDROP_STAR_GLYPH_SPARKLE4, 2.2, 0, 200, 600, Number.NaN);
    const { ctx, ops } = paintContext({ a, d: a, e: 0, f: 0 }, 0.8);
    paintBackdropStarShapeList(ctx, list, stubAtlas());

    const names = ops.map((op) => op[0]);
    expect(names).not.toContain('setTransform');
    expect(names.indexOf('resetTransform')).toBeGreaterThan(names.indexOf('getTransform'));
    expect(names.indexOf('resetTransform')).toBeLessThan(names.indexOf('drawImage'));
    const blits = ops.filter((op) => op[0] === 'drawImage');
    expect(blits).toHaveLength(3);
    const entries = [[BACKDROP_STAR_GLYPH_STAR5, 4.1, 5, 101, 333], [BACKDROP_STAR_GLYPH_SPARKLE4, 0.5, 23, 7, 9], [BACKDROP_STAR_GLYPH_SPARKLE4, 2.2, 0, 200, 600]];
    blits.forEach((blit, i) => {
      const [glyph, radiusCss, hue, x, y] = entries[i];
      const r = resolveBackdropStarDeviceRadius(radiusCss, a, BACKDROP_STAR_MIN_RADIUS_DEV[glyph]);
      expect(r).toBeGreaterThanOrEqual(BACKDROP_STAR_MIN_RADIUS_DEV[glyph]);
      const cell = backdropStarCellSize(r);
      const [, , sx, sy, sw, sh, dx, dy, dw, dh] = blit as [string, unknown, number, number, number, number, number, number, number, number];
      expect([sx, sy, sw, sh, dw, dh]).toEqual([hue * cell, (glyph * 1000) + r, cell, cell, cell, cell]);
      expect(Number.isInteger(dx)).toBe(true);
      expect(Number.isInteger(dy)).toBe(true);
      // The sprite centre (dx + r + 1 + 0.5) is within half a device pixel of the star's device position.
      expect(Math.abs((dx + r + 1) - (x * a))).toBeLessThanOrEqual(0.5);
      expect(Math.abs((dy + r + 1) - (y * a))).toBeLessThanOrEqual(0.5);
    });
    // Alpha multiplied by the object alpha, clamped (2 -> 1, NaN -> 0), then restored.
    const alphas = ops.filter((op) => op[0] === 'globalAlpha').map((op) => op[1]);
    expect(alphas).toEqual([0.8 * 0.5, 0.8, 0, 0.8]);
  });

  test('an empty list touches nothing', () => {
    const { ctx, ops } = paintContext({ a: 3, d: 3, e: 0, f: 0 });
    paintBackdropStarShapeList(ctx, new BackdropStarShapeList(), stubAtlas());
    expect(ops).toEqual([]);
  });
});

describe('MAZER-VIS-066 Phaser hook', () => {
  const setup = (atlas: BackdropStarAtlas | null, commands = 0) => {
    const phaserCalls: unknown[][] = [];
    const graphics = { renderCanvas: (...args: unknown[]) => { phaserCalls.push(args); } };
    const list = new BackdropStarShapeList();
    installBackdropStarSpriteRenderer(graphics as never, list, () => atlas);
    const { ctx, ops } = paintContext({ a: 3, d: 3, e: 0, f: 0 });
    const renderer = { currentContext: ctx };
    const src = { commandBuffer: new Array(commands) };
    const camera = { addToRenderList: vi.fn() };
    const render = (allowClip = false) => (graphics.renderCanvas as unknown as (...a: unknown[]) => void)(renderer, src, camera, undefined, undefined, allowClip);
    return { list, ops, phaserCalls, camera, render };
  };

  test('uses Phaser SetTransform, paints, then restores the context SetTransform saved', () => {
    setTransformCalls.length = 0;
    setTransformResult = true;
    const { list, ops, camera, render, phaserCalls } = setup(stubAtlas());
    list.push(BACKDROP_STAR_GLYPH_STAR5, 3, 1, 10, 10, 0.5);
    render();
    expect(setTransformCalls).toHaveLength(1);
    expect(camera.addToRenderList).toHaveBeenCalledTimes(1);
    expect(ops.map((op) => op[0])).toEqual(['getTransform', 'resetTransform', 'globalAlpha', 'drawImage', 'globalAlpha', 'restore']);
    expect(phaserCalls).toHaveLength(0);
  });

  test('nothing to paint, no atlas, a hidden object or a mask pass paints nothing; commands still go through Phaser', () => {
    setTransformResult = true;
    const empty = setup(stubAtlas());
    empty.render();
    expect(empty.ops).toEqual([]);

    const noAtlas = setup(null);
    noAtlas.list.push(BACKDROP_STAR_GLYPH_SPARKLE4, 1, 0, 1, 1, 1);
    noAtlas.render();
    expect(noAtlas.ops).toEqual([]);

    const mask = setup(stubAtlas(), 2);
    mask.list.push(BACKDROP_STAR_GLYPH_SPARKLE4, 1, 0, 1, 1, 1);
    mask.render(true);
    expect(mask.ops).toEqual([]);
    expect(mask.phaserCalls).toHaveLength(1);

    setTransformResult = false;
    const hidden = setup(stubAtlas());
    hidden.list.push(BACKDROP_STAR_GLYPH_SPARKLE4, 1, 0, 1, 1, 1);
    hidden.render();
    expect(hidden.ops).toEqual([]);
    setTransformResult = true;
  });
});
