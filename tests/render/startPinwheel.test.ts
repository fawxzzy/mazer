import { describe, expect, test } from 'vitest';
import {
  computeChipTileAt,
  type BoardCell,
  type BoardTileBakeInput
} from '../../src/render/boardTileBake';
import { boardMaterial } from '../../src/render/boardTileStyle';
import type { EndpointSkinPainter } from '../../src/render/endpointTileSkins';
import {
  START_PINWHEEL,
  START_PINWHEEL_CYCLE_MS,
  drawStartPinwheel,
  resolveStartPinwheelClock,
  resolveStartPinwheelExtent,
  resolveStartPinwheelFadeAlphas,
  resolveStartPinwheelFrameRotation,
  resolveStartPinwheelShape,
  resolveStartPinwheelTile,
  scaleStartPinwheelSpec
} from '../../src/render/startPinwheel';
import {
  resolveStartPinwheelAlignedOffset,
  resolveStartPinwheelPlacement,
  usesStartPinwheelLayer
} from '../../src/render/startPinwheelLayer';
import { RasterContext } from './support/rasterContext';

/**
 * MAZER-VIS-065: the Pinwheel start mark (startPinwheel.ts) and the placement of its baked strip (startPinwheelLayer.ts).
 * The real-pixel fit inside the tile at every size, DPR and time is pinned in endpointTileSkins.test.ts (default skins).
 */

const TAU = Math.PI * 2;

const ROWS = [
  '#########',
  '#...#...#',
  '#.#.#.#.#',
  '#.#...#.#',
  '#########'
];
const GRID = ROWS.map((row) => [...row].map((c) => c !== '#'));
const tileAt = (tileSize: number, dpr: number, cell: BoardCell) => {
  const input: BoardTileBakeInput = { grid: GRID, width: GRID[0]!.length, height: GRID.length, tileSize, devicePixelRatio: dpr, goal: { x: 7, y: 3 } };
  return computeChipTileAt(input, cell)!;
};
const CELLS: BoardCell[] = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 3 }, { x: 5, y: 1 }];

const rasterPainter = (ctx: RasterContext): EndpointSkinPainter => ({
  fillStyle: (v) => { ctx.fillStyle = v; },
  strokeStyle: (v) => { ctx.strokeStyle = v; },
  lineWidth: (v) => { ctx.lineWidth = v; },
  begin: () => ctx.beginPath(),
  move: (x, y) => ctx.moveTo(x, y),
  line: (x, y) => ctx.lineTo(x, y),
  close: () => ctx.closePath(),
  circle: (x, y, r) => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); },
  fill: () => ctx.fill(),
  stroke: () => ctx.stroke()
});

describe('clock', () => {
  test('Reduce Motion and a broken clock: frame 0, no turn, alpha 1 (movement stops, colour never changes)', () => {
    for (const t of [0, 333, 1e7, Number.NaN]) {
      expect(resolveStartPinwheelClock(t, true)).toEqual({ frame: 0, rotation: 0, alpha: 1 });
    }
    expect(resolveStartPinwheelClock(Number.NaN, false)).toEqual({ frame: 0, rotation: 0, alpha: 1 });
    expect(resolveStartPinwheelClock(Number.POSITIVE_INFINITY, false)).toEqual({ frame: 0, rotation: 0, alpha: 1 });
  });

  test('scene time 0 is the Reduce Motion frame (the Guide icon equals the first live frame)', () => {
    expect(resolveStartPinwheelClock(0, false)).toEqual(resolveStartPinwheelClock(0, true));
  });

  test('one clockwise turn per 2170 ms, quantised into 72 frames of the quarter turn', () => {
    const k = START_PINWHEEL;
    expect(START_PINWHEEL_CYCLE_MS).toBeCloseTo(k.spinPeriodMs / 4, 9);
    const frameMs = START_PINWHEEL_CYCLE_MS / k.frames;
    expect(resolveStartPinwheelClock(frameMs * 10.5, false).frame).toBe(10);
    expect(resolveStartPinwheelClock(frameMs * 10.5, false).rotation).toBeCloseTo((10 / 72) * (TAU / 4), 12);
    expect(resolveStartPinwheelClock(START_PINWHEEL_CYCLE_MS * 3 + (frameMs * 0.5), false).frame).toBe(0);
    // negative clocks wrap the same way
    expect(resolveStartPinwheelClock(-frameMs * 0.5, false).frame).toBe(k.frames - 1);
    const seen = new Set<number>();
    for (let t = 0; t < 20000; t += 3.1) {
      const c = resolveStartPinwheelClock(t, false);
      expect(Number.isInteger(c.frame)).toBe(true);
      expect(c.frame).toBeGreaterThanOrEqual(0);
      expect(c.frame).toBeLessThan(k.frames);
      expect(c.rotation).toBe(resolveStartPinwheelFrameRotation(c.frame));
      expect(c.alpha).toBeGreaterThanOrEqual(k.breathAlphaMin - 1e-12);
      expect(c.alpha).toBeLessThanOrEqual(1 + 1e-12);
      seen.add(c.frame);
    }
    expect(seen.size).toBe(k.frames);
    // the breath bottoms out half a period in
    expect(resolveStartPinwheelClock(k.breathPeriodMs / 2, false).alpha).toBeCloseTo(k.breathAlphaMin, 9);
  });

  test('the last frame plus one step lands on frame 0 seamlessly (4-fold symmetry)', () => {
    const shape = (rotation: number) => resolveStartPinwheelShape(0, 0, 10, 0.5, rotation);
    const wrapped = shape(resolveStartPinwheelFrameRotation(START_PINWHEEL.frames));
    const first = shape(0);
    // a quarter turn maps blade b onto blade b + 1
    for (let b = 0; b < 4; b += 1) {
      const a = wrapped.blades[b]!;
      const c = first.blades[(b + 1) % 4]!;
      a.forEach((v, i) => expect(v).toBeCloseTo(c[i]!, 9));
    }
  });
});

describe('shape and fade', () => {
  test('the stacked fade fills equal the options-page gradient (1 at the axis to 0.55 at R) at each band middle', () => {
    const k = START_PINWHEEL;
    const layers = resolveStartPinwheelFadeAlphas();
    expect(layers).toHaveLength(k.fadeBands);
    for (const a of layers) {
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(1);
    }
    // layer j covers bands 0 .. n-1-j; band i sees layers 0 .. n-1-i
    for (let band = 0; band < k.fadeBands; band += 1) {
      let clear = 1;
      for (let j = 0; j <= k.fadeBands - 1 - band; j += 1) clear *= 1 - layers[j]!;
      const r = k.rootOfReach + ((1 - k.rootOfReach) * ((band + 0.5) / k.fadeBands));
      expect(1 - clear).toBeCloseTo(1 - ((1 - k.fadeRimAlpha) * r), 9);
    }
  });

  test('four blades, a diamond hub; the keyline outlines sit one device px outside what they ring', () => {
    const s = resolveStartPinwheelShape(50, 50, 20, 1, 0.3);
    expect(s.blades).toHaveLength(4);
    expect(s.bladeInk).toHaveLength(4);
    expect(s.core).toHaveLength(8);
    const r = (pts: readonly number[], i: number) => Math.hypot(pts[i]! - 50, pts[i + 1]! - 50);
    expect(r(s.core, 0)).toBeCloseTo(20 * START_PINWHEEL.coreOfReach, 9);
    expect(r(s.coreInk, 0) - r(s.core, 0)).toBeCloseTo(Math.SQRT2, 9);
    // the tip reaches R minus the tip inset; its keyline one more device px
    const ext = resolveStartPinwheelExtent(20, 1);
    expect(ext).toBeGreaterThan(20 - START_PINWHEEL.tipInsetDevicePx);
    expect(ext).toBeLessThan(20 + 1.5);
  });

  test('the farthest painted point does not depend on the rotation', () => {
    for (const rot of [0, 0.4, 1.1, 2.9]) {
      const s = resolveStartPinwheelShape(0, 0, 12, 0.4, rot);
      let far = 0;
      for (const pts of [...s.bladeInk, s.coreInk]) {
        for (let i = 0; i < pts.length; i += 2) far = Math.max(far, Math.hypot(pts[i]!, pts[i + 1]!));
      }
      expect(far).toBeCloseTo(resolveStartPinwheelExtent(12, 0.4), 9);
    }
  });

  test('fit: the farthest painted point stays max(0.07 half-tile, 0.5 device px) inside the cell edge, any tile and DPR', () => {
    for (const size of [6.4, 10, 14.72, 15.6, 25.44, 40]) {
      for (const dpr of [1, 2, 2.625, 3]) {
        for (const cell of CELLS) {
          const tile = tileAt(size, dpr, cell);
          const spec = resolveStartPinwheelTile(tile, dpr);
          const radius = Math.min(tile.width, tile.height) / 2;
          const room = Math.min(spec.cx - tile.left, tile.left + tile.width - spec.cx, spec.cy - tile.top, tile.top + tile.height - spec.cy);
          expect(spec.extent, `${size}@${dpr} ${cell.x},${cell.y}`).toBeLessThanOrEqual(room - Math.max(radius * 0.07, 0.5 / dpr) + 1e-9);
          expect(spec.reach).toBeGreaterThan(0);
          expect(spec.reach).toBeLessThanOrEqual(radius * START_PINWHEEL.maxReachOfRadius + 1e-9);
          expect(spec.dp).toBeCloseTo(1 / dpr, 12);
        }
      }
    }
  });
});

describe('one draw for the Guide (css units) and the baked strip (device units)', () => {
  test('the device-px bake of a frame is the css-px draw under the scale transform, pixel for pixel', () => {
    for (const dpr of [2, 2.625, 3]) {
      const tile = tileAt(15.6, dpr, { x: 3, y: 3 });
      const spec = resolveStartPinwheelTile(tile, dpr);
      const size = Math.ceil((tile.left + tile.width + 2) * dpr);
      const css = new RasterContext(size, size);
      css.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawStartPinwheel(rasterPainter(css), boardMaterial.void, spec, resolveStartPinwheelFrameRotation(17));
      const dev = new RasterContext(size, size);
      drawStartPinwheel(rasterPainter(dev), boardMaterial.void, scaleStartPinwheelSpec(spec, spec.cx * dpr, spec.cy * dpr, dpr), resolveStartPinwheelFrameRotation(17));
      let differ = 0;
      let painted = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const a = css.pixel(x, y);
          const b = dev.pixel(x, y);
          if (b[3] > 0) painted += 1;
          if (a.some((v, i) => Math.abs(v - b[i]!) > 1)) differ += 1;
        }
      }
      expect(painted, `dpr ${dpr}`).toBeGreaterThan(20);
      expect(differ, `dpr ${dpr}`).toBe(0);
    }
  });

  test('deterministic: the same frame paints the same pixels', () => {
    const tile = tileAt(15.6, 3, { x: 1, y: 1 });
    const paint = () => {
      const ctx = new RasterContext(80, 80);
      ctx.setTransform(3, 0, 0, 3, 0, 0);
      drawStartPinwheel(rasterPainter(ctx), boardMaterial.void, resolveStartPinwheelTile(tile, 3), resolveStartPinwheelFrameRotation(40));
      return ctx;
    };
    const a = paint();
    const b = paint();
    for (let y = 0; y < 80; y += 1) for (let x = 0; x < 80; x += 1) expect(a.pixel(x, y)).toEqual(b.pixel(x, y));
  });
});

describe('strip placement (startPinwheelLayer.ts)', () => {
  test('the strip sits on a whole css px whose device offset from the board image is whole', () => {
    for (const [scale, imageX] of [[3, 7], [2.625, 4], [2.625, -13], [2, 0], [1, 5]] as const) {
      for (const cell of CELLS) {
        const tile = tileAt(15.6, scale, cell);
        const p = resolveStartPinwheelPlacement(tile, imageX + 3.4285714, 11.2380952, imageX, 9, scale);
        expect(Number.isInteger(p.x), `x ${scale}`).toBe(true);
        expect(Number.isInteger(p.y), `y ${scale}`).toBe(true);
        const dx = (p.x - imageX) * scale;
        const dy = (p.y - 9) * scale;
        expect(Math.abs(dx - Math.round(dx)), `dx ${scale}`).toBeLessThan(1e-4);
        expect(Math.abs(dy - Math.round(dy)), `dy ${scale}`).toBeLessThan(1e-4);
        // the mark (with its keyline) fits its frame with room to spare
        const extentPx = p.extent * scale;
        expect(p.fx - extentPx).toBeGreaterThanOrEqual(0);
        expect(p.fy - extentPx).toBeGreaterThanOrEqual(0);
        expect(p.frameWidth - (p.fx + extentPx)).toBeGreaterThanOrEqual(0);
        expect(p.frameHeight - (p.fy + extentPx)).toBeGreaterThanOrEqual(0);
        // the centre inside the frame is the board's exact centre
        const spec = resolveStartPinwheelTile(tile, scale);
        expect(p.x + (p.fx / scale)).toBeCloseTo(imageX + 3.4285714 + spec.cx, 9);
      }
    }
  });

  test('aligned offset: whole css, whole device, at or left of the start; plain floor when no such offset is near', () => {
    expect(resolveStartPinwheelAlignedOffset(17.3, 3)).toBe(17);
    expect(resolveStartPinwheelAlignedOffset(17.3, 2.625)).toBe(16);
    expect(resolveStartPinwheelAlignedOffset(-0.5, 2.625)).toBe(-8);
    expect(resolveStartPinwheelAlignedOffset(40.9, Math.PI)).toBe(40);
  });

  test('the layer draws only for the Chip board with the Pinwheel start skin', () => {
    expect(usesStartPinwheelLayer('chip')).toBe(true);
    expect(usesStartPinwheelLayer(undefined)).toBe(true);
    expect(usesStartPinwheelLayer('trace')).toBe(false);
    expect(usesStartPinwheelLayer('chip', 'seed-spiral')).toBe(false);
    expect(usesStartPinwheelLayer('chip', 'blade-pinwheel')).toBe(true);
  });
});
