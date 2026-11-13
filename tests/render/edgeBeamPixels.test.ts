import { describe, expect, test } from 'vitest';
import {
  EDGE_MARKER_HALF_HEIGHT,
  drawEdgeBeams,
  drawEdgeMarker,
  resolveEdgeMarkerVertices,
  resolveEdgeStations,
  type EdgeGraphics,
  type EdgeMarkerState
} from '../../src/render/edgeMarkers';
import { DIAMOND_FILL_ALPHA, resolveDiamondFillShape, resolveOutlineExitPoint, snapToDevice } from '../../src/render/edgeBeamArt';
import { resolveBeamTimes } from '../../src/render/edgeBeamTimeline';
import { PLAYER_COLOR } from '../../src/render/trailPalette';
import { RasterContext } from './support/rasterContext';

/**
 * Pixel proof of the diamond interior fill and the beam, on real pixels (the real draw code over the software
 * rasteriser, pixel-centre sampling) at the device pixel ratios the owner compared. The kite is the hero here:
 *  - the filled share of the diamond follows the fill fraction at every DPR (area share within a pixel of the exact);
 *  - fill grows from the inner tip and drain retreats to the outer tip;
 *  - the fill never paints outside the outline;
 *  - the beam, at its contact instant, ends ON the outline (no pixel of the beam body past the diamond centre).
 */
class Graphics implements EdgeGraphics {
  constructor(private readonly ctx: RasterContext) {
    ctx.paintStrokes = true;
  }

  private static rgb(color: number): string {
    return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},1)`;
  }

  fillStyle(color: number, alpha = 1): void { this.ctx.fillStyle = Graphics.rgb(color); this.ctx.globalAlpha = alpha; }
  lineStyle(width: number, color: number, alpha = 1): void { this.ctx.lineWidth = width; this.ctx.strokeStyle = Graphics.rgb(color); this.ctx.globalAlpha = alpha; }
  beginPath(): void { this.ctx.beginPath(); }
  moveTo(x: number, y: number): void { this.ctx.moveTo(x, y); }
  lineTo(x: number, y: number): void { this.ctx.lineTo(x, y); }
  closePath(): void { this.ctx.closePath(); }
  fillPath(): void { this.ctx.fill(); }
  strokePath(): void { this.ctx.stroke(); }
  fillCircle(x: number, y: number, radius: number): void { this.ctx.beginPath(); this.ctx.arc(x, y, radius, 0, Math.PI * 2); this.ctx.fill(); }
  lineBetween(x1: number, y1: number, x2: number, y2: number): void { this.ctx.beginPath(); this.ctx.moveTo(x1, y1); this.ctx.lineTo(x2, y2); this.ctx.stroke(); }
}

const DPRS = [1, 2, 2.625, 3];
const SIZE = 40;
const CENTER = { x: 20.3, y: 20.7 };

const stateFor = (fill: number, mode: 'grow' | 'drain'): EdgeMarkerState => ({
  alpha: 0, energized: false, energy: 0, fill, fillMode: mode, flash: 0, hidden: false, id: 1, spinRad: 0
});

/** Rasterise ONE diamond with only its interior fill (the stroke alpha is 0) at `dpr`; returns the lit pixel centres in css px. */
const rasteriseFill = (fill: number, mode: 'grow' | 'drain', dpr: number, inwardAngle = Math.PI / 2): Array<{ x: number; y: number }> => {
  const width = Math.ceil(SIZE * dpr);
  const ctx = new RasterContext(width, width);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const graphics = new Graphics(ctx);
  drawEdgeMarker(graphics, { id: 1, inwardAngle, isCorner: false, side: 'top', x: CENTER.x, y: CENTER.y }, stateFor(fill, mode));
  const lit: Array<{ x: number; y: number }> = [];
  for (let py = 0; py < width; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const index = ((py * width) + px) * 4;
      if ((ctx.data[index + 3] ?? 0) > 0) {
        lit.push({ x: (px + 0.5) / dpr, y: (py + 0.5) / dpr });
      }
    }
  }
  return lit;
};

const polygonArea = (vertices: ReadonlyArray<{ x: number; y: number }>): number => (
  Math.abs(vertices.reduce((sum, a, index) => {
    const b = vertices[(index + 1) % vertices.length]!;
    return sum + ((a.x * b.y) - (b.x * a.y));
  }, 0)) / 2
);

const insideConvex = (vertices: ReadonlyArray<{ x: number; y: number }>, point: { x: number; y: number }, slack: number): boolean => {
  let sign = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const a = vertices[index]!;
    const b = vertices[(index + 1) % vertices.length]!;
    const cross = (((b.x - a.x) * (point.y - a.y)) - ((b.y - a.y) * (point.x - a.x))) / Math.hypot(b.x - a.x, b.y - a.y);
    if (Math.abs(cross) <= slack) continue;
    const current = Math.sign(cross);
    if (sign === 0) sign = current;
    else if (current !== sign) return false;
  }
  return true;
};

describe('diamond interior fill on real pixels', () => {
  const outline = resolveEdgeMarkerVertices({ x: CENTER.x, y: CENTER.y, inwardAngle: Math.PI / 2 }, 1);
  const outlineArea = polygonArea(outline);

  test.each(DPRS)('at DPR %s the lit share follows the fill fraction (0, 25, 50, 75, 100 %%) for both grow and drain', (dpr) => {
    const pixelArea = 1 / (dpr * dpr);
    // The 1 px front line adds up to ~chord x 1 px of paint on the cut; edge pixels may be included or dropped.
    const tolerance = 18;
    for (const mode of ['grow', 'drain'] as const) {
      let previous = -1;
      for (const fill of [0, 0.25, 0.5, 0.75, 1]) {
        const lit = rasteriseFill(fill, mode, dpr);
        const expected = fill === 0 ? 0 : polygonArea(resolveDiamondFillShape(outline, CENTER, Math.PI / 2, EDGE_MARKER_HALF_HEIGHT, fill, mode).polygon);
        expect(lit.length * pixelArea, `${mode} ${fill} dpr ${dpr}`).toBeGreaterThanOrEqual(expected - tolerance);
        expect(lit.length * pixelArea, `${mode} ${fill} dpr ${dpr}`).toBeLessThanOrEqual(expected + tolerance);
        expect(lit.length, `${mode} ${fill} monotonic`).toBeGreaterThanOrEqual(previous);
        previous = lit.length;
      }
      // full == the whole diamond
      expect(previous * pixelArea).toBeGreaterThan(outlineArea - tolerance);
    }
  });

  test.each(DPRS)('at DPR %s the fill never paints outside the diamond outline', (dpr) => {
    for (const fill of [0.1, 0.25, 0.5, 0.9, 1]) {
      for (const mode of ['grow', 'drain'] as const) {
        for (const point of rasteriseFill(fill, mode, dpr)) {
          expect(insideConvex(outline, point, 0.75 + (1 / dpr)), `${mode} ${fill} dpr ${dpr} at ${point.x},${point.y}`).toBe(true);
        }
      }
    }
  });

  test.each(DPRS)('at DPR %s grow starts at the inner tip and drain retreats to the outer tip', (dpr) => {
    // inwardAngle pi/2 points +y: the inner tip is the larger y.
    const grow = rasteriseFill(0.3, 'grow', dpr);
    const drain = rasteriseFill(0.3, 'drain', dpr);
    const growMinY = Math.min(...grow.map((point) => point.y));
    const drainMaxY = Math.max(...drain.map((point) => point.y));
    // grow region: [inner tip (y = c + 10) up to y = c + 10 - 0.3 * 20 = c + 4]
    expect(growMinY).toBeGreaterThanOrEqual(CENTER.y + 4 - 0.5 - (1 / dpr));
    expect(Math.max(...grow.map((point) => point.y))).toBeGreaterThan(CENTER.y + EDGE_MARKER_HALF_HEIGHT - 1.5);
    // drain region: [outer tip (y = c - 10) down to y = c - 10 + 6 = c - 4]
    expect(drainMaxY).toBeLessThanOrEqual(CENTER.y - 4 + 0.5 + (1 / dpr));
    expect(Math.min(...drain.map((point) => point.y))).toBeLessThan(CENTER.y - EDGE_MARKER_HALF_HEIGHT + 1.5);
  });

  test('the interior is the player colour at the fill alpha', () => {
    const dpr = 2;
    const width = SIZE * dpr;
    const ctx = new RasterContext(width, width);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawEdgeMarker(new Graphics(ctx), { id: 1, inwardAngle: Math.PI / 2, isCorner: false, side: 'top', x: CENTER.x, y: CENTER.y }, stateFor(1, 'grow'));
    const px = Math.round(CENTER.x * dpr);
    const py = Math.round(CENTER.y * dpr);
    const index = ((py * width) + px) * 4;
    expect([ctx.data[index], ctx.data[index + 1], ctx.data[index + 2]]).toEqual([(PLAYER_COLOR >> 16) & 255, (PLAYER_COLOR >> 8) & 255, PLAYER_COLOR & 255]);
    expect((ctx.data[index + 3] ?? 0) / 255).toBeCloseTo(DIAMOND_FILL_ALPHA, 1);
  });
});

describe('beam contact on real pixels', () => {
  const viewport = { width: 390, height: 844 };
  const stations = resolveEdgeStations(viewport);
  const focus = { x: 195, y: 422 };

  test.each(DPRS)('at DPR %s the contact point is on the outline and the head dot touches it at the contact instant', (dpr) => {
    for (const index of [1, 3, 5, 7, 0, 4]) {
      const station = stations[index]!;
      const vertices = resolveEdgeMarkerVertices(station, 1);
      const contact = resolveOutlineExitPoint(vertices, { x: station.x, y: station.y }, focus);
      expect(insideConvex(vertices, contact, 1e-6)).toBe(true);
      // contact lies between the diamond centre and the focus
      const toFocus = Math.hypot(focus.x - station.x, focus.y - station.y);
      const toContact = Math.hypot(contact.x - station.x, contact.y - station.y);
      expect(toContact).toBeLessThan(11);
      expect(toContact).toBeLessThan(toFocus);
      // Rasterise the player -> diamond beam at its contact instant in a 60 x 60 css px window around the diamond:
      // the pixel under the contact point is painted (the head touches the outline), whatever the DPR.
      const window = 60;
      const ctx = new RasterContext(Math.ceil(window * dpr), Math.ceil(window * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, -(station.x - (window / 2)) * dpr, -(station.y - (window / 2)) * dpr);
      drawEdgeBeams(new Graphics(ctx), {
        clockMs: resolveBeamTimes(index).contactMs, devicePixelRatio: dpr, direction: 'outward', focus, laserProgress: 0, spawnPop: 0, stations
      });
      const px = Math.floor((contact.x - (station.x - (window / 2))) * dpr);
      const py = Math.floor((contact.y - (station.y - (window / 2))) * dpr);
      expect((ctx.data[(((py * ctx.width) + px) * 4) + 3] ?? 0), `beam ${index} dpr ${dpr} contact pixel`).toBeGreaterThan(0);
      expect(snapToDevice(contact.x, dpr) * dpr % 1).toBeCloseTo(0.5, 6);
    }
  });
});
