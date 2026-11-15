import { describe, expect, test } from 'vitest';
import { resolveMazerCanvasResolution } from '../../src/boot/canvasResolution';
import { EDGE_DIAMOND_REST_SCALE } from '../../src/render/edgeBeamTimeline';
import { resolveEdgeCornerTipInset } from '../../src/render/edgeCornerAnchor';
import {
  anchorStationToOuterTip,
  drawEdgeMarker,
  resolveEdgeMarkerPaintedPolygon,
  resolveEdgeStations,
  type EdgeGraphics,
  type EdgeMarkerState,
  type EdgeStation
} from '../../src/render/edgeMarkers';
import { RasterContext } from './support/rasterContext';

/**
 * MAZER-VIS-054: owner, 2026-11-15: "the diamonds [...] are like half off screen". A physical display corner of radius R hides the
 * part of the corner outside the quarter circle centred (R, R) from the corner. This models R = 55 css px (iPhone 15 Pro class; 13/14
 * are ~48) and asserts the WHOLE painted corner diamond (outline plus the stroke's miter join) is visible, at 50/75/100%, in all four
 * corners of every tall phone viewport, with the outer tip touching the arc; desktop and square-cornered phones keep the tip on the
 * corner (inset 0). Tolerance: the tip may sit 0.25 css px outside the arc (16 px inset vs the exact 16.1 px at R55 is the other way).
 */
const RADIUS = 55;
const RADIUS_ROUNDED_SMALL = 48;
const ARC_TOLERANCE_PX = 0.25;
const TALL_PHONES = [
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
  { name: '393x852', width: 393, height: 852 },
  { name: '412x915', width: 412, height: 915 },
  { name: '430x932', width: 430, height: 932 },
  { name: '499x958', width: 499, height: 958 }
] as const;
const SQUARE_VIEWPORTS = [
  { name: 'desktop 1280x720', width: 1280, height: 720 },
  { name: 'desktop 1920x1080', width: 1920, height: 1080 },
  { name: 'SE 375x667', width: 375, height: 667 },
  { name: '360x740', width: 360, height: 740 },
  { name: 'landscape 844x390', width: 844, height: 390 }
] as const;
const SCALES = [EDGE_DIAMOND_REST_SCALE, 0.75, 1] as const;
const CORNER_NAMES = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;

type Point = { readonly x: number; readonly y: number };

/** Distance from a point to the centre of the quarter circle of the corner it is in, minus the radius (> 0: hidden by the rounding). */
const hiddenDepth = (point: Point, viewport: { width: number; height: number }, radius: number): number => {
  const dx = Math.min(point.x, viewport.width - point.x);
  const dy = Math.min(point.y, viewport.height - point.y);
  if (dx >= radius || dy >= radius) {
    return Number.NEGATIVE_INFINITY;
  }
  return Math.hypot(radius - dx, radius - dy) - radius;
};

const polygonSamples = (polygon: ReadonlyArray<Point>): Point[] => {
  const samples: Point[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    for (let t = 0; t <= 1; t += 0.02) {
      samples.push({ x: a.x + ((b.x - a.x) * t), y: a.y + ((b.y - a.y) * t) });
    }
  }
  return samples;
};

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

const stateAt = (station: EdgeStation, scale: number): EdgeMarkerState => ({
  alpha: 1, energized: false, energy: 0, fill: scale === 1 ? 0 : 0.5, flash: 0, hidden: false, id: station.id, scale, spinRad: 0
});

describe('corner diamonds stay fully visible on a rounded display (MAZER-VIS-054)', () => {
  test.each(TALL_PHONES)('$name: the whole painted diamond is outside the hidden R=55 quarter disc in all 4 corners at 50%, 75%, 100%, tip on the arc', (viewport) => {
    const stations = resolveEdgeStations(viewport);
    let checked = 0;
    CORNER_NAMES.forEach((corner, index) => {
      const station = stations[index * 2]!;
      expect(station.isCorner).toBe(true);
      for (const scale of SCALES) {
        const painted = resolveEdgeMarkerPaintedPolygon(anchorStationToOuterTip(station, scale), scale);
        const text = `${corner}@${scale}`;
        const worst = Math.max(...polygonSamples(painted).map((point) => hiddenDepth(point, viewport, RADIUS)));
        // Nothing hidden (the tip itself touches the arc within a quarter pixel)...
        expect(worst, `${text} deepest hidden point`).toBeLessThanOrEqual(ARC_TOLERANCE_PX);
        // ...and the tip is ON the arc, not far inside it (so the diamond is still in the corner).
        expect(worst, `${text} tip distance from the arc`).toBeGreaterThanOrEqual(-ARC_TOLERANCE_PX);
        // R48 (iPhone 13/14): fully visible with room to spare.
        expect(Math.max(...painted.map((point) => hiddenDepth(point, viewport, RADIUS_ROUNDED_SMALL))), `${text} R48`).toBeLessThanOrEqual(0);
        // Inside the canvas as well.
        for (const point of painted) {
          expect(point.x, `${text} x`).toBeGreaterThanOrEqual(0);
          expect(point.y, `${text} y`).toBeGreaterThanOrEqual(0);
          expect(point.x, `${text} x max`).toBeLessThanOrEqual(viewport.width);
          expect(point.y, `${text} y max`).toBeLessThanOrEqual(viewport.height);
        }
        checked += 1;
      }
    });
    expect(checked).toBe(12);
  });

  test('without the inset the owner\'s report reproduces: a tip ON the corner (VIS-044) is hidden by an R=55 display at every size', () => {
    const viewport = { width: 390, height: 844 };
    const station = { ...resolveEdgeStations(viewport)[0]!, x: 7.772742194165065, y: 7.772742194165065 };
    for (const scale of SCALES) {
      const painted = resolveEdgeMarkerPaintedPolygon(anchorStationToOuterTip(station, scale), scale);
      const depths = painted.map((point) => hiddenDepth(point, viewport, RADIUS));
      expect(Math.max(...depths), `scale ${scale}`).toBeGreaterThan(15);
    }
  });

  test.each(TALL_PHONES)('$name: real pixels at DPR 3: no lit pixel deeper than half a css px inside the R=55 hidden corner, at 50% and 100%', (viewport) => {
    const resolution = resolveMazerCanvasResolution(3);
    const stations = resolveEdgeStations(viewport, resolution);
    const WINDOW = 80; // css px square around the corner
    CORNER_NAMES.forEach((corner, index) => {
      const station = stations[index * 2]!;
      for (const scale of [EDGE_DIAMOND_REST_SCALE, 1]) {
        const originX = Math.floor((station.x - (WINDOW / 2)) * resolution);
        const originY = Math.floor((station.y - (WINDOW / 2)) * resolution);
        const size = Math.ceil(WINDOW * resolution);
        const ctx = new RasterContext(size, size);
        ctx.miterJoins = true;
        ctx.setTransform(resolution, 0, 0, resolution, -originX, -originY);
        drawEdgeMarker(new Graphics(ctx), station, stateAt(station, scale));
        let lit = 0;
        let hidden = 0;
        for (let py = 0; py < size; py += 1) {
          for (let px = 0; px < size; px += 1) {
            if ((ctx.data[(((py * size) + px) * 4) + 3] ?? 0) === 0) continue;
            lit += 1;
            const centre = { x: (originX + px + 0.5) / resolution, y: (originY + py + 0.5) / resolution };
            if (hiddenDepth(centre, viewport, RADIUS) > 0.5) hidden += 1;
          }
        }
        expect(lit, `${corner}@${scale} lit`).toBeGreaterThan(20);
        expect(hidden, `${corner}@${scale} lit pixels in the hidden corner`).toBe(0);
      }
    });
  });

  test.each(SQUARE_VIEWPORTS)('$name keeps the tip inset 0: corner diamonds stay ON the corner (square display corners)', (viewport) => {
    expect(resolveEdgeCornerTipInset(viewport)).toBe(0);
    const stations = resolveEdgeStations(viewport);
    CORNER_NAMES.forEach((corner, index) => {
      const painted = resolveEdgeMarkerPaintedPolygon(stations[index * 2]!);
      const gapX = corner.endsWith('left') ? Math.min(...painted.map((p) => p.x)) : viewport.width - Math.max(...painted.map((p) => p.x));
      const gapY = corner.startsWith('top') ? Math.min(...painted.map((p) => p.y)) : viewport.height - Math.max(...painted.map((p) => p.y));
      expect(gapX, `${corner} x`).toBeCloseTo(0, 9);
      expect(gapY, `${corner} y`).toBeCloseTo(0, 9);
    });
  });
});
