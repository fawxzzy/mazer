import { describe, expect, test } from 'vitest';
import { resolveMazerCanvasResolution } from '../../src/boot/canvasResolution';
import { EDGE_DIAMOND_REST_SCALE } from '../../src/render/edgeBeamTimeline';
import {
  EDGE_CORNER_DISPLAY_RADIUS_PX,
  EDGE_CORNER_ROUNDED_BOTTOM_TIP_INSET_PX,
  EDGE_CORNER_ROUNDED_TIP_INSET_PX,
  hasRoundedBottomCorners,
  isRoundedLandscapePhoneViewport,
  resolveEdgeCornerBottomHiddenBand,
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
  EDGE_MARKER_MAX_EXTENT_PX,
  resolveEdgeBottomCornerInset,
  resolveEdgeBottomCornerRise,
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
        const band = resolveEdgeCornerBottomHiddenBand(viewport);
        if (band > 0) {
          // MAZER-VIS-068: with a reported bottom safe area the star's painted bounds stay above it, and it does not drift further up
          // than its own largest reach (it still reads as the corner star).
          const lowestPaint = Math.max(...painted.map((point) => point.y));
          expect(lowestPaint, `${label} above the bottom safe area`).toBeLessThanOrEqual(viewport.height - band);
          expect(viewport.height - band - lowestPaint, `${label} gap above the safe area`).toBeLessThanOrEqual(EDGE_MARKER_MAX_EXTENT_PX * 2);
          continue;
        }
        // Still in the corner: the outer tip is within 1.5 css px of the R66 display edge (it does not drift inward).
        expect(bottomContinuousDepth(samples, viewport, EDGE_CORNER_DISPLAY_RADIUS_PX), `${label} distance from the R66 edge`).toBeGreaterThanOrEqual(-1.5);
      }
    }
  });

  test.each([
    { name: 'iPhone 14 390x844', width: 390, height: 844, safeAreaBottom: 34 },
    { name: 'iPhone 16 393x852', width: 393, height: 852, safeAreaBottom: 34 },
    { name: 'iPhone 16 home screen 393x798', width: 393, height: 798, safeAreaBottom: 34 }
  ])('MAZER-VIS-068 $name portrait: both bottom corner stars stay above the bottom safe area at every spin up to full size, inside the canvas', (phone) => {
    const viewport = { width: phone.width, height: phone.height, safeAreaBottom: phone.safeAreaBottom };
    const stations = resolveEdgeStations(viewport);
    const safeBottom = phone.height - phone.safeAreaBottom;
    for (const id of [4, 6] as const) {
      const station = stations[id]!;
      // Same side inset as VIS-056; only the height moved.
      expect(Math.min(station.x, phone.width - station.x), `station ${id} side inset`).toBeCloseTo(Math.min(stations[id === 4 ? 6 : 4]!.x, phone.width - stations[id === 4 ? 6 : 4]!.x), 6);
      for (let step = 0; step < 72; step += 1) {
        const inwardAngle = (step / 72) * Math.PI * 2;
        // Full size (1) is the largest reach; the scaled-down states are covered by the rest test above.
        const painted = resolveEdgeMarkerPaintedPolygon({ x: station.x, y: station.y, inwardAngle }, 1);
        const label = `station ${id} angle ${step * 5}`;
        expectInsideCanvas(painted, viewport, label);
        expect(Math.max(...painted.map((point) => point.y)), label).toBeLessThanOrEqual(safeBottom + 1e-9);
      }
    }
    // Without a reported safe area the VIS-056 placement is unchanged.
    const plain = resolveEdgeStations({ width: phone.width, height: phone.height });
    expect(phone.height - plain[4]!.y).toBeCloseTo(resolveEdgeBottomCornerInset({ width: phone.width, height: phone.height }), 6);
    expect(resolveEdgeBottomCornerRise({ width: phone.width, height: phone.height, safeAreaBottom: 0 })).toBeCloseTo(resolveEdgeBottomCornerInset({ width: phone.width, height: phone.height }), 6);
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

/**
 * MAZER-VIS-057: corner stars on landscape phones and iPads. A landscape iPhone hides the status bar, so all four canvas corners are
 * rounded display corners (portrait only has the bottom two); the page reports that as a safe area (home indicator at the bottom,
 * the notch side left or right). The top stars used the square-corner rule (inset 0) while the bottom pair cleared R66, so on a
 * landscape phone the top pair was cut off and the pair placement disagreed. iPads keep the square top corners (their status bar stays
 * on screen) but report a bottom safe area, so their bottom pair already clears it (VIS-068).
 */
const LANDSCAPE_PHONES = [
  { name: 'iPhone 14 landscape 844x390', width: 844, height: 390, safeAreaBottom: 21, safeAreaLeft: 47, safeAreaRight: 47 },
  { name: 'iPhone 16 landscape 852x393', width: 852, height: 393, safeAreaBottom: 21, safeAreaLeft: 59, safeAreaRight: 59 },
  { name: 'iPhone 16 Pro Max landscape 932x430', width: 932, height: 430, safeAreaBottom: 21, safeAreaLeft: 59, safeAreaRight: 59 },
  { name: 'iPhone SE-class notch side only 812x375', width: 812, height: 375, safeAreaBottom: 0, safeAreaLeft: 44, safeAreaRight: 0 },
  { name: 'home indicator only 844x390', width: 844, height: 390, safeAreaBottom: 21, safeAreaLeft: 0, safeAreaRight: 0 }
] as const;
const IPADS = [
  { name: 'iPad portrait 820x1180', width: 820, height: 1180, safeAreaBottom: 20 },
  { name: 'iPad landscape 1180x820', width: 1180, height: 820, safeAreaBottom: 20 },
  { name: 'iPad Pro 13 landscape 1366x1024', width: 1366, height: 1024, safeAreaBottom: 20 },
  { name: 'iPad mini portrait 744x1133', width: 744, height: 1133, safeAreaBottom: 20 }
] as const;
const ALL_CORNERS: ReadonlyArray<ScreenCorner> = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

const cornerDepth = (points: ReadonlyArray<Point>, viewport: Viewport, radius: number, corners: ReadonlyArray<ScreenCorner>): number => Math.max(
  ...corners.flatMap((corner) => points.map((point) => (
    resolveContinuousCornerHiddenDepth(toCornerLocal(point, corner, viewport.width, viewport.height), radius)
  )))
);

const isCornerStation = (station: EdgeStation): boolean => station.isCorner;

describe('MAZER-VIS-057 landscape phones and iPads', () => {
  test.each(LANDSCAPE_PHONES)('$name: a landscape phone with a safe area has rounded top corners too, with the same tip inset as the bottom', (phone) => {
    const viewport = { ...phone };
    expect(isRoundedLandscapePhoneViewport(viewport)).toBe(true);
    expect(resolveEdgeCornerTipInset(viewport)).toBe(EDGE_CORNER_ROUNDED_BOTTOM_TIP_INSET_PX);
    const stations = resolveEdgeStations(viewport);
    const top = stations.filter((station) => isCornerStation(station) && station.side === 'top');
    const bottom = stations.filter((station) => isCornerStation(station) && station.side === 'bottom');
    expect(top).toHaveLength(2);
    expect(bottom).toHaveLength(2);
    for (const station of [...top, ...bottom]) {
      // Whole-screen symmetry of the side inset: every corner star sits the same distance from its side edge.
      expect(Math.min(station.x, phone.width - station.x), `station ${station.id} side inset`).toBeCloseTo(top[0]!.x, 6);
    }
    // The top stars sit the shared tip inset from the top edge (the bottom stars rise further for the home indicator, VIS-068).
    const polygon = resolveEdgeMarkerPaintedPolygon(anchorStationToOuterTip(top[0]!, 1), 1);
    expect(Math.min(...polygon.map((point) => point.y)), 'top star tip distance from the top edge').toBeGreaterThanOrEqual(EDGE_CORNER_ROUNDED_BOTTOM_TIP_INSET_PX - 1.5);
  });

  test.each(LANDSCAPE_PHONES)('$name: at rest, 75% and 100% no painted point of any corner star is hidden by a continuous R48-R66 corner, inside the canvas', (phone) => {
    const viewport = { ...phone };
    const stations = resolveEdgeStations(viewport).filter(isCornerStation);
    expect(stations).toHaveLength(4);
    for (const station of stations) {
      for (const scale of SCALES) {
        const painted = resolveEdgeMarkerPaintedPolygon(anchorStationToOuterTip(station, scale), scale);
        const samples = polygonSamples(painted);
        const label = `station ${station.id}@${scale}`;
        expectInsideCanvas(painted, viewport, label);
        for (const radius of CONTINUOUS_RADII) {
          expect(cornerDepth(samples, viewport, radius, ALL_CORNERS), `${label} continuous R${radius}`).toBeLessThanOrEqual(0);
        }
        if (phone.safeAreaBottom > 0 && station.side === 'bottom') {
          expect(Math.max(...painted.map((point) => point.y)), `${label} above the bottom safe area`).toBeLessThanOrEqual(phone.height - phone.safeAreaBottom);
        }
      }
    }
  });

  test.each(LANDSCAPE_PHONES)('$name: across the whole orbit lap no corner-area star is hidden by a continuous R66 corner or leaves the canvas', (phone) => {
    const viewport = { ...phone };
    let checks = 0;
    for (let index = 0; index <= 360; index += 1) {
      const phase = (index / 360) * Math.PI * 2;
      for (const station of resolveOrbitingEdgeStations(viewport, phase)) {
        const box = (EDGE_CORNER_DISPLAY_RADIUS_PX * 1.53) + 16;
        const nearSide = station.x < box || phone.width - station.x < box;
        const nearTopOrBottom = station.y < box || phone.height - station.y < box;
        if (!nearSide || !nearTopOrBottom) {
          continue;
        }
        for (const scale of SCALES) {
          const painted = resolveEdgeMarkerPaintedPolygon(anchorStationToOuterTip(station, scale), scale);
          const label = `phase ${phase.toFixed(4)} id ${station.id}@${scale}`;
          expectInsideCanvas(painted, viewport, label);
          expect(cornerDepth(painted, viewport, EDGE_CORNER_DISPLAY_RADIUS_PX, ALL_CORNERS), label).toBeLessThanOrEqual(0);
          checks += 1;
        }
      }
    }
    expect(checks).toBeGreaterThan(200);
  }, 60_000);

  test.each(LANDSCAPE_PHONES)('$name: real pixels at DPR 3: no lit pixel of a corner star (rest and full size) lies in a hidden R66 corner', (phone) => {
    const viewport = { ...phone };
    const resolution = resolveMazerCanvasResolution(3);
    const stations = resolveEdgeStations(viewport, resolution).filter(isCornerStation);
    for (const station of stations) {
      for (const scale of [EDGE_DIAMOND_REST_SCALE, 1]) {
        const lit = litPixelCentres(station, scale, resolution);
        expect(lit.length, `id ${station.id}@${scale} lit`).toBeGreaterThan(20);
        const hidden = lit.filter((centre) => (
          cornerDepth([centre], viewport, EDGE_CORNER_DISPLAY_RADIUS_PX, ALL_CORNERS) > 0
          || centre.x < 0 || centre.y < 0 || centre.x > phone.width || centre.y > phone.height
        ));
        expect(hidden.length, `id ${station.id}@${scale}`).toBe(0);
      }
    }
  }, 60_000);

  test('a landscape window that reports no safe area, desktop, small phones and tablets keep the square top corners', () => {
    for (const viewport of [
      { width: 844, height: 390 },
      { width: 844, height: 390, safeAreaBottom: 0, safeAreaLeft: 0, safeAreaRight: 0 },
      { width: 844, height: 390, safeAreaBottom: Number.NaN },
      { width: 1280, height: 720 },
      { width: 1280, height: 720, safeAreaBottom: 0 },
      { width: 1920, height: 1080, safeAreaLeft: 0, safeAreaRight: 0 }
    ]) {
      expect(isRoundedLandscapePhoneViewport(viewport), JSON.stringify(viewport)).toBe(false);
      expect(resolveEdgeCornerTipInset(viewport), JSON.stringify(viewport)).toBe(0);
    }
    // A portrait phone with a bottom safe area is not a landscape phone: its top corners keep the VIS-054 rule.
    expect(isRoundedLandscapePhoneViewport({ width: 390, height: 844, safeAreaBottom: 34 })).toBe(false);
    expect(resolveEdgeCornerTipInset({ width: 390, height: 844, safeAreaBottom: 34 })).toBe(EDGE_CORNER_ROUNDED_TIP_INSET_PX);
    // A tablet reports a bottom safe area in landscape but is not a phone: the top stars stay on the corner.
    for (const ipad of IPADS) {
      expect(isRoundedLandscapePhoneViewport(ipad), ipad.name).toBe(false);
    }
  });

  test.each(IPADS)('$name: the top stars stay on the square corner, the bottom stars clear the home-indicator band, nothing leaves the canvas', (ipad) => {
    const viewport = { width: ipad.width, height: ipad.height, safeAreaBottom: ipad.safeAreaBottom };
    expect(resolveEdgeCornerTipInset(viewport)).toBe(0);
    const stations = resolveEdgeStations(viewport);
    for (const station of stations.filter(isCornerStation)) {
      for (const scale of SCALES) {
        const painted = resolveEdgeMarkerPaintedPolygon(anchorStationToOuterTip(station, scale), scale);
        const label = `${ipad.name} station ${station.id}@${scale}`;
        expectInsideCanvas(painted, viewport, label);
        if (station.side === 'bottom') {
          expect(Math.max(...painted.map((point) => point.y)), `${label} above the bottom safe area`).toBeLessThanOrEqual(ipad.height - ipad.safeAreaBottom);
          expect(cornerDepth(painted, viewport, EDGE_CORNER_DISPLAY_RADIUS_PX, BOTTOM_CORNERS), `${label} R66`).toBeLessThanOrEqual(0);
        } else {
          // Square top corners: the tip is on the corner, as before.
          expect(Math.min(...painted.map((point) => point.y)), `${label} top`).toBeGreaterThanOrEqual(-1e-9);
        }
      }
    }
    // Left and right pairs mirror each other.
    const [left, right] = [stations[4]!, stations[6]!].sort((a, b) => a.x - b.x) as [EdgeStation, EdgeStation];
    expect(left.x).toBeCloseTo(ipad.width - right.x, 6);
    expect(left.y).toBeCloseTo(right.y, 6);
  });
});
