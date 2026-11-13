import { describe, expect, test } from 'vitest';
import {
  EDGE_MARKER_HALF_HEIGHT,
  drawEdgeBeams,
  anchorStationToInnerTip,
  drawEdgeMarker,
  resolveEdgeInnerTip,
  resolveEdgeMarkerVertices,
  resolveEdgeStations,
  type EdgeGraphics,
  type EdgeMarkerState
} from '../../src/render/edgeMarkers';
import { DIAMOND_FILL_ALPHA, resolveDiamondFillShape, snapToDevice } from '../../src/render/edgeBeamArt';
import { EDGE_DIAMOND_REST_SCALE, resolveBeamTimes } from '../../src/render/edgeBeamTimeline';
import { PLAYER_COLOR } from '../../src/render/trailPalette';
import { RasterContext } from './support/rasterContext';

/**
 * Pixel proof of the diamond interior fill and the beam, on real pixels (the real draw code over the software
 * rasteriser, pixel-centre sampling) at the device pixel ratios the owner compared. The kite is the hero here:
 *  - the filled share of the diamond follows the fill fraction at every DPR (area share within a pixel of the exact);
 *  - the colour is always anchored at the inner tip: it grows from there and drains back to it (the outer tip empties first);
 *  - one fill only: the wrap-end / wrap-flash cues never paint a second (core) shape inside the diamond;
 *  - the fill never paints outside the outline;
 *  - the beam, at its contact instant, ends exactly on the diamond's INNERMOST point (its inner tip), pixel-snapped, in both
 *    directions and at every DPR, at full size and at the 50% rest size (the tip does not move when the diamond scales);
 *  - at 50% the fill still lies inside the (smaller) outline.
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

const stateFor = (fill: number): EdgeMarkerState => ({
  alpha: 0, energized: false, energy: 0, fill, flash: 0, hidden: false, id: 1, spinRad: 0
});

/** Rasterise ONE diamond with only its interior fill (the stroke alpha is 0) at `dpr`; returns the lit pixel centres in css px. */
const rasteriseFill = (fill: number, dpr: number, inwardAngle = Math.PI / 2): Array<{ x: number; y: number }> => {
  const width = Math.ceil(SIZE * dpr);
  const ctx = new RasterContext(width, width);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const graphics = new Graphics(ctx);
  drawEdgeMarker(graphics, { id: 1, inwardAngle, isCorner: false, side: 'top', x: CENTER.x, y: CENTER.y }, stateFor(fill));
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

  test.each(DPRS)('at DPR %s the lit share follows the fill fraction (0, 25, 50, 75, 100 %%)', (dpr) => {
    const pixelArea = 1 / (dpr * dpr);
    // The 1 px front line adds up to ~chord x 1 px of paint on the cut; edge pixels may be included or dropped.
    const tolerance = 18;
    let previous = -1;
    for (const fill of [0, 0.25, 0.5, 0.75, 1]) {
      const lit = rasteriseFill(fill, dpr);
      const expected = fill === 0 ? 0 : polygonArea(resolveDiamondFillShape(outline, CENTER, Math.PI / 2, EDGE_MARKER_HALF_HEIGHT, fill).polygon);
      expect(lit.length * pixelArea, `${fill} dpr ${dpr}`).toBeGreaterThanOrEqual(expected - tolerance);
      expect(lit.length * pixelArea, `${fill} dpr ${dpr}`).toBeLessThanOrEqual(expected + tolerance);
      expect(lit.length, `${fill} monotonic`).toBeGreaterThanOrEqual(previous);
      previous = lit.length;
    }
    // full == the whole diamond
    expect(previous * pixelArea).toBeGreaterThan(outlineArea - tolerance);
  });

  test.each(DPRS)('at DPR %s the fill never paints outside the diamond outline', (dpr) => {
    for (const fill of [0.1, 0.25, 0.5, 0.9, 1]) {
      for (const point of rasteriseFill(fill, dpr)) {
        expect(insideConvex(outline, point, 0.75 + (1 / dpr)), `${fill} dpr ${dpr} at ${point.x},${point.y}`).toBe(true);
      }
    }
  });

  test.each(DPRS)('at DPR %s the colour is anchored at the inner tip: it grows from it and, as the fill falls, leaves the outer tip first and the inner tip last', (dpr) => {
    // inwardAngle pi/2 points +y: the inner tip is the larger y.
    const at = (fill: number) => rasteriseFill(fill, dpr);
    const span = (points: Array<{ x: number; y: number }>) => ({ min: Math.min(...points.map((p) => p.y)), max: Math.max(...points.map((p) => p.y)) });
    const grown = span(at(0.3));
    // region: [inner tip (y = c + 10) up to y = c + 10 - 0.3 * 20 = c + 4]
    expect(grown.min).toBeGreaterThanOrEqual(CENTER.y + 4 - 0.5 - (1 / dpr));
    expect(grown.max).toBeGreaterThan(CENTER.y + EDGE_MARKER_HALF_HEIGHT - 1.5);
    // A FALLING fill (1 -> 0.7 -> 0.4 -> 0.1) keeps the inner edge of the colour on the inner tip and pulls its outer edge toward it.
    let previous = span(at(1));
    for (const fill of [0.7, 0.4, 0.1]) {
      const now = span(at(fill));
      expect(now.max, `inner end stays on the inner tip at ${fill}`).toBeGreaterThan(CENTER.y + EDGE_MARKER_HALF_HEIGHT - 1.5);
      expect(now.min, `outer end retreats toward the inner tip at ${fill}`).toBeGreaterThan(previous.min);
      previous = now;
    }
    // Nested (exact geometry, the 1 px front line aside): the region at 0.4 lies inside the region at 0.7, so the colour only ever leaves.
    const wide = resolveDiamondFillShape(outline, CENTER, Math.PI / 2, EDGE_MARKER_HALF_HEIGHT, 0.7).polygon;
    const narrow = resolveDiamondFillShape(outline, CENTER, Math.PI / 2, EDGE_MARKER_HALF_HEIGHT, 0.4).polygon;
    expect(narrow.length).toBeGreaterThanOrEqual(3);
    expect(narrow.every((point) => insideConvex(wide, point, 1e-6))).toBe(true);
  });

  test.each(DPRS)('at DPR %s only ONE fill is ever drawn: energized / wrap-flash cues add no second shape inside the diamond', (dpr) => {
    const width = Math.ceil(SIZE * dpr);
    const centre = (state: EdgeMarkerState) => {
      const ctx = new RasterContext(width, width);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawEdgeMarker(new Graphics(ctx), { id: 1, inwardAngle: Math.PI / 2, isCorner: false, side: 'top', x: CENTER.x, y: CENTER.y }, state);
      const px = Math.floor(CENTER.x * dpr);
      const py = Math.floor(CENTER.y * dpr);
      return (ctx.data[(((py * width) + px) * 4) + 3] ?? 0) / 255;
    };
    const cues = { alpha: 0.95, energized: true, energy: 1, flash: 1, hidden: false, id: 1 as const, spinRad: 0 };
    // Empty diamond with every cue on: nothing in the interior (the old instant core is gone).
    expect(centre({ ...cues, fill: 0 })).toBe(0);
    expect(centre(cues)).toBe(0);
    // Filled diamond: the interior is exactly the one fill alpha, with or without the cues (no stacked second layer).
    expect(centre({ ...cues, fill: 1 })).toBeCloseTo(DIAMOND_FILL_ALPHA, 1);
    expect(centre({ ...cues, fill: 1, energized: false, energy: 0, flash: 0 })).toBeCloseTo(DIAMOND_FILL_ALPHA, 1);
  });

  test('the interior is the player colour at the fill alpha', () => {
    const dpr = 2;
    const width = SIZE * dpr;
    const ctx = new RasterContext(width, width);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawEdgeMarker(new Graphics(ctx), { id: 1, inwardAngle: Math.PI / 2, isCorner: false, side: 'top', x: CENTER.x, y: CENTER.y }, stateFor(1));
    const px = Math.round(CENTER.x * dpr);
    const py = Math.round(CENTER.y * dpr);
    const index = ((py * width) + px) * 4;
    expect([ctx.data[index], ctx.data[index + 1], ctx.data[index + 2]]).toEqual([(PLAYER_COLOR >> 16) & 255, (PLAYER_COLOR >> 8) & 255, PLAYER_COLOR & 255]);
    expect((ctx.data[index + 3] ?? 0) / 255).toBeCloseTo(DIAMOND_FILL_ALPHA, 1);
  });
});

describe('beam endpoints on the inner tip, on real pixels (MAZER-VIS-038)', () => {
  const viewport = { width: 390, height: 844 };
  const stations = resolveEdgeStations(viewport);
  const focus = { x: 195, y: 422 };
  const WINDOW = 60;

  /** Rasterise the beams of `direction` at `clockMs` into a WINDOW css px square around `station`. */
  const rasteriseBeam = (index: number, direction: 'inward' | 'outward', clockMs: number, dpr: number): RasterContext => {
    const station = stations[index]!;
    const ctx = new RasterContext(Math.ceil(WINDOW * dpr), Math.ceil(WINDOW * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, -(station.x - (WINDOW / 2)) * dpr, -(station.y - (WINDOW / 2)) * dpr);
    drawEdgeBeams(new Graphics(ctx), { clockMs, devicePixelRatio: dpr, direction, focus, laserProgress: 0, spawnPop: 0, stations });
    return ctx;
  };
  const pixelAt = (ctx: RasterContext, station: { x: number; y: number }, point: { x: number; y: number }, dpr: number): number => {
    const px = Math.floor((point.x - (station.x - (WINDOW / 2))) * dpr);
    const py = Math.floor((point.y - (station.y - (WINDOW / 2))) * dpr);
    return ctx.data[(((py * ctx.width) + px) * 4) + 3] ?? 0;
  };

  test.each(DPRS)('at DPR %s both directions end on the diamond inner tip: the tip pixel is lit at contact (departure) and at release (arrival), and the endpoint is snapped to it', (dpr) => {
    for (const index of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const station = stations[index]!;
      const tip = resolveEdgeInnerTip(station);
      const times = resolveBeamTimes(index);
      // Departure: the head is ON the tip at contact. Arrival: the tail is still ON the tip while it drains (halfway through the drain).
      expect(pixelAt(rasteriseBeam(index, 'outward', times.contactMs, dpr), station, tip, dpr), `departure ${index} dpr ${dpr}`).toBeGreaterThan(0);
      expect(pixelAt(rasteriseBeam(index, 'inward', times.launchMs + 100, dpr), station, tip, dpr), `arrival ${index} dpr ${dpr}`).toBeGreaterThan(0);
      // The snapped end is the centre of the device pixel that holds the tip: within half a device pixel on each axis.
      const snapped = { x: snapToDevice(tip.x, dpr), y: snapToDevice(tip.y, dpr) };
      expect(Math.abs(snapped.x - tip.x)).toBeLessThanOrEqual((0.5 / dpr) + 1e-9);
      expect(Math.abs(snapped.y - tip.y)).toBeLessThanOrEqual((0.5 / dpr) + 1e-9);
      expect(Math.floor(snapped.x * dpr)).toBe(Math.floor(tip.x * dpr));
      expect(Math.floor(snapped.y * dpr)).toBe(Math.floor(tip.y * dpr));
    }
  });

  test.each(DPRS)('at DPR %s the beam body is a line from the focus to the tip: the recorded strokes end exactly on the snapped tip (departure) / start on it (arrival)', (dpr) => {
    for (const index of [1, 3, 5, 7, 0, 4]) {
      const tip = resolveEdgeInnerTip(stations[index]!);
      const snapped = { x: snapToDevice(tip.x, dpr), y: snapToDevice(tip.y, dpr) };
      const times = resolveBeamTimes(index);
      for (const [direction, clock] of [['outward', times.contactMs + 50], ['inward', times.launchMs + 100]] as const) {
        const segments: Array<[number, number, number, number]> = [];
        const probe: EdgeGraphics = {
          fillStyle: () => undefined, lineStyle: () => undefined, beginPath: () => undefined, moveTo: () => undefined,
          lineTo: () => undefined, closePath: () => undefined, fillPath: () => undefined, strokePath: () => undefined,
          fillCircle: () => undefined,
          lineBetween: (x1, y1, x2, y2) => { segments.push([x1, y1, x2, y2]); }
        };
        drawEdgeBeams(probe, { clockMs: clock, devicePixelRatio: dpr, direction, focus, laserProgress: 0, spawnPop: 0, stations: [stations[index]!] });
        expect(segments.length).toBeGreaterThan(0);
        // Departure: head = tip. Arrival: tail = tip (held on the diamond while it drains), so the longest segments start on it.
        const longest = segments.reduce((best, segment) => (Math.hypot(segment[2] - segment[0], segment[3] - segment[1]) > Math.hypot(best[2] - best[0], best[3] - best[1]) ? segment : best));
        const end = direction === 'outward' ? { x: longest[2], y: longest[3] } : { x: longest[0], y: longest[1] };
        expect(end.x, `${direction} ${index} dpr ${dpr} x`).toBeCloseTo(snapped.x, 9);
        expect(end.y, `${direction} ${index} dpr ${dpr} y`).toBeCloseTo(snapped.y, 9);
      }
    }
  });

  test.each(DPRS)('at DPR %s the inner tip does not move when the diamond scales to 50% and the kite still reaches it', (dpr) => {
    for (const index of [1, 3, 5, 7, 0, 4]) {
      const station = stations[index]!;
      const tip = resolveEdgeInnerTip(station);
      const anchored = anchorStationToInnerTip(station, EDGE_DIAMOND_REST_SCALE);
      const scaledOutline = resolveEdgeMarkerVertices(anchored, EDGE_DIAMOND_REST_SCALE);
      // Exactly the same tip, half the length.
      expect(scaledOutline[0]!.x).toBeCloseTo(tip.x, 9);
      expect(scaledOutline[0]!.y).toBeCloseTo(tip.y, 9);
      const outer = scaledOutline[2]!;
      expect(Math.hypot(outer.x - tip.x, outer.y - tip.y)).toBeCloseTo(EDGE_MARKER_HALF_HEIGHT, 9);
      // Rasterise the 50% kite stroke and the beam at contact: both paint the pixel that holds the tip.
      const ctx = new RasterContext(Math.ceil(WINDOW * dpr), Math.ceil(WINDOW * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, -(station.x - (WINDOW / 2)) * dpr, -(station.y - (WINDOW / 2)) * dpr);
      drawEdgeMarker(new Graphics(ctx), station, { ...stateFor(0), alpha: 1, id: station.id, scale: EDGE_DIAMOND_REST_SCALE });
      const lit = (point: { x: number; y: number }): number => {
        // the stroke is a 1 css px line: a pixel within one device pixel of the tip is lit
        let best = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const px = Math.floor((point.x - (station.x - (WINDOW / 2))) * dpr) + dx;
            const py = Math.floor((point.y - (station.y - (WINDOW / 2))) * dpr) + dy;
            best = Math.max(best, ctx.data[(((py * ctx.width) + px) * 4) + 3] ?? 0);
          }
        }
        return best;
      };
      expect(lit(tip), `kite tip ${index} dpr ${dpr}`).toBeGreaterThan(0);
      const beam = rasteriseBeam(index, 'outward', resolveBeamTimes(index).contactMs, dpr);
      expect(pixelAt(beam, station, tip, dpr)).toBeGreaterThan(0);
    }
  });

  test.each(DPRS)('at DPR %s at 50%% size the fill (rising and falling) stays inside the smaller outline and anchors on the inner tip', (dpr) => {
    const station = { id: 1 as const, inwardAngle: Math.PI / 2, isCorner: false, side: 'top' as const, x: CENTER.x, y: CENTER.y };
    const anchored = anchorStationToInnerTip(station, EDGE_DIAMOND_REST_SCALE);
    const outline = resolveEdgeMarkerVertices(anchored, EDGE_DIAMOND_REST_SCALE);
    const tipY = CENTER.y + EDGE_MARKER_HALF_HEIGHT;
    for (const fill of [0.25, 0.5, 1]) {
      const width = Math.ceil(SIZE * dpr);
      const ctx = new RasterContext(width, width);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawEdgeMarker(new Graphics(ctx), station, { ...stateFor(fill), scale: EDGE_DIAMOND_REST_SCALE });
      const points: Array<{ x: number; y: number }> = [];
      for (let py = 0; py < width; py += 1) {
        for (let px = 0; px < width; px += 1) {
          if ((ctx.data[(((py * width) + px) * 4) + 3] ?? 0) > 0) points.push({ x: (px + 0.5) / dpr, y: (py + 0.5) / dpr });
        }
      }
      expect(points.length, `fill ${fill} dpr ${dpr}`).toBeGreaterThan(0);
      for (const point of points) {
        expect(insideConvex(outline, point, 0.75 + (1 / dpr)), `fill ${fill} dpr ${dpr} at ${point.x},${point.y}`).toBe(true);
      }
      // Anchored on the inner tip (the larger y), never beyond it.
      expect(Math.max(...points.map((point) => point.y))).toBeLessThanOrEqual(tipY + (1 / dpr) + 0.5);
      expect(Math.max(...points.map((point) => point.y))).toBeGreaterThan(tipY - 1.5);
    }
  });
});
