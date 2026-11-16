import { describe, expect, test } from 'vitest';
import { resolveMazerCanvasResolution } from '../../src/boot/canvasResolution';
import { EDGE_DIAMOND_REST_SCALE } from '../../src/render/edgeBeamTimeline';
import {
  EDGE_CORNER_DISPLAY_RADIUS_PX,
  EDGE_CORNER_ROUNDED_BOTTOM_TIP_INSET_PX,
  EDGE_CORNER_ROUNDED_TIP_INSET_PX,
  hasRoundedBottomCorners,
  resolveEdgeCornerBottomTipInset,
  resolveEdgeCornerTipInset,
  type EdgeCornerViewport
} from '../../src/render/edgeCornerAnchor';
import {
  resolveCircularCornerHiddenDepth,
  resolveContinuousCornerDiagonalInset,
  resolveContinuousCornerHiddenDepth,
  toCornerLocal,
  type ScreenCorner
} from '../../src/render/displayCornerMask';
import {
  anchorStationToOuterTip,
  drawEdgeMarker,
  resolveEdgeMarkerPaintedPolygon,
  resolveEdgeStations,
  resolveOrbitingEdgeStations,
  type EdgeGraphics,
  type EdgeMarkerState,
  type EdgeStation
} from '../../src/render/edgeMarkers';
import { RasterContext } from './support/rasterContext';

/**
 * MAZER-VIS-054: owner, 2026-11-15: "the diamonds [...] are like half off screen". A physical display corner of radius R hides the
 * part of the corner outside the quarter circle centred (R, R) from the corner. This models R = 55 css px (iPhone 15 Pro class; 13/14
 * are ~48) and asserts the WHOLE painted corner diamond (outline plus the stroke's miter join) is visible, at 50/75/100%, in all four
 * corners of every tall phone viewport; desktop and square-cornered phones keep the tip on the corner (inset 0). Tolerance: the tip
 * may sit 0.25 css px outside the arc (16 px inset vs the exact 16.1 px at R55 is the other way).
 *
 * MAZER-VIS-056: owner, 2026-11-16: "the current stars that end up in the bottom left and right on phone screen view are off the
 * screen". Measured (scripts/analysis/measure-edge-corner-visibility.mjs): the BOTTOM corners of the home-screen app are the display's
 * rounded corners (the status bar sits above the canvas, the home indicator does not), and (1) the size band missed the 375 x 812
 * class there (canvas about 762 tall: tip inset 0, star 23 to 27 px deep in the hidden corner) and (2) iPhone corners are continuous
 * curves up to about R62 to R66, which hid 2.9 to 4.6 px of the star at the 16 px inset. The bottom corners now clear a continuous
 * R66 corner whenever the page reports a bottom safe area or falls in the size band.
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
/**
 * MAZER-VIS-056 phones: full screen (Safari full-screen / emulators) and the home-screen app canvas (screen height minus the status
 * bar: 375x812 -> 762, 390x844 -> 797, 393x852 -> 798, 402x874 -> 812, 430x932 -> 878, 440x956 -> 894, 412x915 -> 891).
 */
const VIS_056_PHONES = [
  { name: 'mini/X 375x812', width: 375, height: 812 },
  { name: 'mini/X home screen 375x762', width: 375, height: 762 },
  { name: '14 390x844', width: 390, height: 844 },
  { name: '14 home screen 390x797', width: 390, height: 797 },
  { name: '15 393x852', width: 393, height: 852 },
  { name: '15 home screen 393x798', width: 393, height: 798 },
  { name: '16 Pro 402x874', width: 402, height: 874 },
  { name: '16 Pro home screen 402x812', width: 402, height: 812 },
  { name: '15 Pro Max 430x932', width: 430, height: 932 },
  { name: '15 Pro Max home screen 430x878', width: 430, height: 878 },
  { name: '16 Pro Max 440x956', width: 440, height: 956 },
  { name: '16 Pro Max home screen 440x894', width: 440, height: 894 },
  { name: 'Pixel 412x915', width: 412, height: 915 },
  { name: 'Pixel standalone 412x891', width: 412, height: 891 }
] as const;
/** env(safe-area-inset-bottom) values: none (browser tab, Android, desktop), the iPhone home indicator, and an oversized inset. */
const BOTTOM_INSETS = [0, 34, 83] as const;
const CONTINUOUS_RADII = [48, 55, 62, 66] as const;
const SCALES = [EDGE_DIAMOND_REST_SCALE, 0.75, 1] as const;
const CORNER_NAMES = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;
const BOTTOM_CORNERS: ReadonlyArray<ScreenCorner> = ['bottom-right', 'bottom-left'];

type Point = { readonly x: number; readonly y: number };
type Viewport = { readonly width: number; readonly height: number };

/** Distance from a point to the centre of the quarter circle of the corner it is in, minus the radius (> 0: hidden by the rounding). */
const hiddenDepth = (point: Point, viewport: Viewport, radius: number): number => {
  const dx = Math.min(point.x, viewport.width - point.x);
  const dy = Math.min(point.y, viewport.height - point.y);
  if (dx >= radius || dy >= radius) {
    return Number.NEGATIVE_INFINITY;
  }
  return Math.hypot(radius - dx, radius - dy) - radius;
};

/** Deepest point (css px) of `points` inside the part a continuous corner of `radius` hides in either BOTTOM corner. */
const bottomContinuousDepth = (points: ReadonlyArray<Point>, viewport: Viewport, radius: number): number => Math.max(
  ...BOTTOM_CORNERS.flatMap((corner) => points.map((point) => (
    resolveContinuousCornerHiddenDepth(toCornerLocal(point, corner, viewport.width, viewport.height), radius)
  )))
);

const bottomCircularDepth = (points: ReadonlyArray<Point>, viewport: Viewport, radius: number): number => Math.max(
  ...BOTTOM_CORNERS.flatMap((corner) => points.map((point) => (
    resolveCircularCornerHiddenDepth(toCornerLocal(point, corner, viewport.width, viewport.height), radius)
  )))
);

const polygonSamples = (polygon: ReadonlyArray<Point>, step = 0.02): Point[] => {
  const samples: Point[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    for (let t = 0; t <= 1; t += step) {
      samples.push({ x: a.x + ((b.x - a.x) * t), y: a.y + ((b.y - a.y) * t) });
    }
  }
  return samples;
};

const expectInsideCanvas = (points: ReadonlyArray<Point>, viewport: Viewport, label: string): void => {
  expect(Math.min(...points.map((point) => point.x)), `${label} x`).toBeGreaterThanOrEqual(-1e-9);
  expect(Math.min(...points.map((point) => point.y)), `${label} y`).toBeGreaterThanOrEqual(-1e-9);
  expect(Math.max(...points.map((point) => point.x)), `${label} x max`).toBeLessThanOrEqual(viewport.width + 1e-9);
  expect(Math.max(...points.map((point) => point.y)), `${label} y max`).toBeLessThanOrEqual(viewport.height + 1e-9);
};

/** True when a star centred at `station` (half extent about 12 px at full size) can reach a bottom corner box of a R66 corner. */
const nearBottomCorner = (station: Point, viewport: Viewport): boolean => {
  const box = (EDGE_CORNER_DISPLAY_RADIUS_PX * 1.53) + 16;
  const nearBottom = viewport.height - station.y < box;
  const nearSide = station.x < box || viewport.width - station.x < box;
  return nearBottom && nearSide;
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

/** Centres (css px) of every lit device pixel of one star drawn at DPR `resolution`, in an 80 css px window around it. */
const litPixelCentres = (station: EdgeStation, scale: number, resolution: number): Point[] => {
  const WINDOW = 80;
  const originX = Math.floor((station.x - (WINDOW / 2)) * resolution);
  const originY = Math.floor((station.y - (WINDOW / 2)) * resolution);
  const size = Math.ceil(WINDOW * resolution);
  const ctx = new RasterContext(size, size);
  ctx.miterJoins = true;
  ctx.setTransform(resolution, 0, 0, resolution, -originX, -originY);
  drawEdgeMarker(new Graphics(ctx), station, stateAt(station, scale));
  const lit: Point[] = [];
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      if ((ctx.data[(((py * size) + px) * 4) + 3] ?? 0) === 0) continue;
      lit.push({ x: (originX + px + 0.5) / resolution, y: (originY + py + 0.5) / resolution });
    }
  }
  return lit;
};

describe('corner diamonds stay fully visible on a rounded display (MAZER-VIS-054)', () => {
  test.each(TALL_PHONES)('$name: the whole painted diamond is outside the hidden R=55 quarter disc in all 4 corners at 50%, 75%, 100% (top tips on the arc)', (viewport) => {
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
        if (corner.startsWith('top')) {
          // ...and a TOP tip is ON the arc, not far inside it (so the diamond is still in the corner). The bottom tips sit further
          // in (MAZER-VIS-056, checked below against the continuous corner they are built for).
          expect(worst, `${text} tip distance from the arc`).toBeGreaterThanOrEqual(-ARC_TOLERANCE_PX);
        }
        // R48 (iPhone 13/14): fully visible with room to spare.
        expect(Math.max(...painted.map((point) => hiddenDepth(point, viewport, RADIUS_ROUNDED_SMALL))), `${text} R48`).toBeLessThanOrEqual(0);
        expectInsideCanvas(painted, viewport, text);
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
    CORNER_NAMES.forEach((corner, index) => {
      const station = stations[index * 2]!;
      for (const scale of [EDGE_DIAMOND_REST_SCALE, 1]) {
        const lit = litPixelCentres(station, scale, resolution);
        expect(lit.length, `${corner}@${scale} lit`).toBeGreaterThan(20);
        expect(lit.filter((centre) => hiddenDepth(centre, viewport, RADIUS) > 0.5).length, `${corner}@${scale} lit pixels in the hidden corner`).toBe(0);
      }
    });
  });

  test.each(SQUARE_VIEWPORTS)('$name keeps the tip inset 0: corner diamonds stay ON the corner (square display corners)', (viewport) => {
    expect(resolveEdgeCornerTipInset(viewport)).toBe(0);
    expect(resolveEdgeCornerBottomTipInset(viewport)).toBe(0);
    expect(resolveEdgeCornerBottomTipInset({ ...viewport, safeAreaBottom: 0 })).toBe(0);
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

describe('bottom corner stars clear the real (continuous, up to R66) display corner (MAZER-VIS-056)', () => {
  test('root cause, reproduced: the old 16 px tip sits inside a continuous R62/R66 corner, and the size band gave the 375 x 812 home-screen canvas no inset', () => {
    // (2) the old model: a R55 circle crosses the diagonal 16.1 px in, so a 16 px tip looked safe (within VIS-054's quarter pixel)...
    expect(resolveCircularCornerHiddenDepth({ along: 16, across: 16 }, 55)).toBeLessThan(ARC_TOLERANCE_PX);
    // ...but the continuous corner of a 16 Pro class phone (R62) or the R66 margin hides the tip by 2.9 / 4.6 px.
    expect(resolveContinuousCornerHiddenDepth({ along: 16, across: 16 }, 62)).toBeCloseTo((resolveContinuousCornerDiagonalInset(62) - 16) * Math.SQRT2, 6);
    expect(resolveContinuousCornerHiddenDepth({ along: 16, across: 16 }, 62)).toBeGreaterThan(2.5);
    expect(resolveContinuousCornerHiddenDepth({ along: 16, across: 16 }, 66)).toBeGreaterThan(4.5);
    // (1) the home-screen canvas of the 375 x 812 class is 762 tall: below the 780 band, so the band alone says "square corners".
    expect(resolveEdgeCornerTipInset({ width: 375, height: 762 })).toBe(0);
    const bandOnly = resolveEdgeStations({ width: 375, height: 762 })[4]!;
    const bandOnlyPaint = resolveEdgeMarkerPaintedPolygon(anchorStationToOuterTip(bandOnly, EDGE_DIAMOND_REST_SCALE), EDGE_DIAMOND_REST_SCALE);
    // Measured on the page: 22.7 px deep at R55 (the tip is ON the corner, 0.2915 x 55 x sqrt2 from the display edge).
    expect(bottomContinuousDepth(bandOnlyPaint, { width: 375, height: 762 }, 55)).toBeGreaterThan(20);
  });

  test('the bottom inset is derived from the display model: ceil(continuous R66 diagonal crossing + 0.5 px) = 20, and top corners keep VIS-054', () => {
    expect(resolveContinuousCornerDiagonalInset(EDGE_CORNER_DISPLAY_RADIUS_PX)).toBeCloseTo(19.24, 2);
    expect(EDGE_CORNER_ROUNDED_BOTTOM_TIP_INSET_PX).toBe(20);
    expect(EDGE_CORNER_ROUNDED_TIP_INSET_PX).toBe(16);
    // The measured signal wins at any size; the size band stays the fallback; no signal and no band = square corners.
    const cases: ReadonlyArray<readonly [EdgeCornerViewport, boolean]> = [
      [{ width: 375, height: 762, safeAreaBottom: 34 }, true],
      [{ width: 375, height: 762 }, false],
      [{ width: 375, height: 762, safeAreaBottom: 0 }, false],
      [{ width: 390, height: 844 }, true],
      [{ width: 390, height: 797, safeAreaBottom: 0 }, true],
      [{ width: 375, height: 667, safeAreaBottom: 0 }, false],
      [{ width: 1280, height: 720 }, false],
      [{ width: 1280, height: 720, safeAreaBottom: Number.NaN }, false]
    ];
    for (const [viewport, rounded] of cases) {
      expect(hasRoundedBottomCorners(viewport), JSON.stringify(viewport)).toBe(rounded);
      expect(resolveEdgeCornerBottomTipInset(viewport), JSON.stringify(viewport)).toBe(rounded ? 20 : 0);
      // The safe area never moves the TOP corners (header layout and the status-bar-covered top are unchanged).
      expect(resolveEdgeCornerTipInset(viewport)).toBe(resolveEdgeCornerTipInset({ width: viewport.width, height: viewport.height }));
    }
  });

  const restCases = VIS_056_PHONES.flatMap((phone) => BOTTOM_INSETS.map((safeAreaBottom) => ({ ...phone, safeAreaBottom })));

  test.each(restCases)('$name, bottom inset $safeAreaBottom: at rest, 75% and 100% no painted point of a bottom corner star is hidden by a continuous R48-R66 (or circular R48/R55) corner, and the star is still in its corner', (phone) => {
    const viewport = { width: phone.width, height: phone.height, safeAreaBottom: phone.safeAreaBottom };
    const rounded = hasRoundedBottomCorners(viewport);
    // Every phone in the list is rounded once it reports the home-indicator inset; only the 762 tall canvas with no inset is not.
    expect(rounded).toBe(phone.safeAreaBottom > 0 || phone.height >= 780);
    const stations = resolveEdgeStations(viewport);
    for (const id of [4, 6]) {
      const station = stations[id]!;
      for (const scale of SCALES) {
        const painted = resolveEdgeMarkerPaintedPolygon(anchorStationToOuterTip(station, scale), scale);
        const samples = polygonSamples(painted);
        const label = `station ${id}@${scale}`;
        expectInsideCanvas(painted, viewport, label);
        if (!rounded) {
          continue;
        }
        for (const radius of CONTINUOUS_RADII) {
          expect(bottomContinuousDepth(samples, viewport, radius), `${label} continuous R${radius}`).toBeLessThanOrEqual(0);
        }
        expect(bottomCircularDepth(samples, viewport, 55), `${label} circular R55`).toBeLessThanOrEqual(0);
        expect(bottomCircularDepth(samples, viewport, 48), `${label} circular R48`).toBeLessThanOrEqual(0);
        // Still in the corner: the outer tip is within 1.5 css px of the R66 display edge (it does not drift inward).
        expect(bottomContinuousDepth(samples, viewport, EDGE_CORNER_DISPLAY_RADIUS_PX), `${label} distance from the R66 edge`).toBeGreaterThanOrEqual(-1.5);
      }
    }
  });

  const orbitCases = VIS_056_PHONES.flatMap((phone) => [0, 34].map((safeAreaBottom) => ({ ...phone, safeAreaBottom })));

  test.each(orbitCases)('$name, bottom inset $safeAreaBottom: across the whole orbit lap no painted point of any star near a bottom corner is hidden by a continuous R66 corner or leaves the canvas', (phone) => {
    const viewport = { width: phone.width, height: phone.height, safeAreaBottom: phone.safeAreaBottom };
    const rounded = hasRoundedBottomCorners(viewport);
    let nearCornerChecks = 0;
    for (let index = 0; index <= 720; index += 1) {
      const phase = (index / 720) * Math.PI * 2;
      for (const station of resolveOrbitingEdgeStations(viewport, phase)) {
        if (!nearBottomCorner(station, viewport)) {
          continue;
        }
        for (const scale of SCALES) {
          const painted = resolveEdgeMarkerPaintedPolygon(anchorStationToOuterTip(station, scale), scale);
          const label = `phase ${phase.toFixed(4)} id ${station.id}@${scale}`;
          expectInsideCanvas(painted, viewport, label);
          if (rounded) {
            // The visible region (the canvas with convex rounded corners) is convex, so a polygon whose vertices are all visible is
            // visible everywhere: the vertices suffice (the rest test above samples the edges too, and agrees).
            expect(bottomContinuousDepth(painted, viewport, EDGE_CORNER_DISPLAY_RADIUS_PX), label).toBeLessThanOrEqual(0);
          }
          nearCornerChecks += 1;
        }
      }
    }
    expect(nearCornerChecks).toBeGreaterThan(100);
  }, 60_000);

  test.each(VIS_056_PHONES)('$name with the home-indicator inset: real pixels at DPR 3: no lit pixel of a bottom star (rest, full size, orbit) lies in the hidden R66 corner', (phone) => {
    const viewport = { width: phone.width, height: phone.height, safeAreaBottom: 34 };
    const resolution = resolveMazerCanvasResolution(3);
    const rest = resolveEdgeStations(viewport, resolution);
    const placements: EdgeStation[] = [rest[4]!, rest[6]!];
    for (let index = 1; index < 48; index += 1) {
      for (const station of resolveOrbitingEdgeStations(viewport, (index / 48) * Math.PI * 2)) {
        if (nearBottomCorner(station, viewport)) placements.push(station);
      }
    }
    expect(placements.length).toBeGreaterThan(4);
    for (const station of placements) {
      for (const scale of [EDGE_DIAMOND_REST_SCALE, 1]) {
        const lit = litPixelCentres(station, scale, resolution);
        expect(lit.length, `id ${station.id}@${scale} lit`).toBeGreaterThan(20);
        const hidden = lit.filter((centre) => (
          bottomContinuousDepth([centre], viewport, EDGE_CORNER_DISPLAY_RADIUS_PX) > 0
          || centre.x < 0 || centre.y < 0 || centre.x > viewport.width || centre.y > viewport.height
        ));
        expect(hidden.length, `id ${station.id} at (${station.x.toFixed(1)}, ${station.y.toFixed(1)})@${scale}: lit pixels outside the visible region`).toBe(0);
      }
    }
  }, 60_000);
});
