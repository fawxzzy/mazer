import { describe, expect, test } from 'vitest';
import { resolveMazerCanvasResolution } from '../../src/boot/canvasResolution';
import { EDGE_DIAMOND_REST_SCALE } from '../../src/render/edgeBeamTimeline';
import {
  EDGE_CORNER_ROUNDED_TIP_INSET_PX,
  measureEdgeCornerOffset,
  resolveEdgeCornerTipInset
} from '../../src/render/edgeCornerAnchor';
import {
  anchorStationToOuterTip,
  resolveEdgeMarkerPaintedPolygon,
  resolveEdgeStations,
  resolveEdgeVisibleExtent,
  resolveOrbitingEdgeStations
} from '../../src/render/edgeMarkers';

/**
 * MAZER-VIS-044/054: the four corner diamonds stay anchored in their screen corners at every viewport size, expanded or shrunk:
 * the painted outer tip is the viewport's tip inset (0 css px, or 16 on a tall rounded-display phone) from BOTH edges at
 * every size, DPR, and diamond scale; nothing drifts inward along an edge as the view gets bigger or smaller.
 */
const VIEWPORTS = [
  { name: 'phone 390x844 @3', width: 390, height: 844, dpr: 3 },
  { name: 'phone 375x812 @3', width: 375, height: 812, dpr: 3 },
  { name: 'phone 430x932 @3', width: 430, height: 932, dpr: 3 },
  { name: 'phone 360x740 @3', width: 360, height: 740, dpr: 3 },
  { name: 'phone 412x915 @2.625', width: 412, height: 915, dpr: 2.625 },
  { name: 'phone 393x851 @2.75', width: 393, height: 851, dpr: 2.75 },
  { name: 'phone 375x667 @2', width: 375, height: 667, dpr: 2 },
  { name: 'phone landscape 844x390 @3', width: 844, height: 390, dpr: 3 },
  { name: 'small phone 320x568 @2', width: 320, height: 568, dpr: 2 },
  { name: 'desktop 1280x720 @1', width: 1280, height: 720, dpr: 1 },
  { name: 'desktop 1920x1080 @1', width: 1920, height: 1080, dpr: 1 }
] as const;
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;
const SCALES = [EDGE_DIAMOND_REST_SCALE, 0.75, 1] as const;

describe('corner diamonds are anchored in the 4 screen corners (MAZER-VIS-044 / VIS-054)', () => {
  test('the tip inset is 0 for desktop, small/square-cornered phones, landscape and callers without a viewport; 16 only for a tall rounded-display phone (MAZER-VIS-054)', () => {
    expect(resolveEdgeCornerTipInset()).toBe(0);
    for (const viewport of [
      { width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 375, height: 667 }, { width: 375, height: 736 },
      { width: 360, height: 800 }, { width: 320, height: 568 }, { width: 374, height: 900 }, { width: 844, height: 390 },
      { width: 500, height: 900 }, { width: 768, height: 1024 }, { width: 430, height: 779 }
    ]) {
      expect(resolveEdgeCornerTipInset(viewport), `${viewport.width}x${viewport.height}`).toBe(0);
    }
    for (const viewport of [
      { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 393, height: 852 }, { width: 412, height: 915 },
      { width: 430, height: 932 }, { width: 499, height: 958 }, { width: 375, height: 780 }
    ]) {
      expect(resolveEdgeCornerTipInset(viewport), `${viewport.width}x${viewport.height}`).toBe(EDGE_CORNER_ROUNDED_TIP_INSET_PX);
    }
    expect(EDGE_CORNER_ROUNDED_TIP_INSET_PX).toBe(16);
  });

  test.each(VIEWPORTS)('$name: every corner diamond is the same distance from both edges at 50%, 75% and 100% size', (viewport) => {
    const resolution = resolveMazerCanvasResolution(viewport.dpr);
    const stations = resolveEdgeStations({ width: viewport.width, height: viewport.height }, resolution);
    const visible = {
      width: resolveEdgeVisibleExtent(viewport.width, resolution),
      height: resolveEdgeVisibleExtent(viewport.height, resolution)
    };
    const measured: string[] = [];
    CORNERS.forEach((corner, index) => {
      const station = stations[index * 2]!;
      expect(station.isCorner).toBe(true);
      for (const scale of SCALES) {
        const painted = resolveEdgeMarkerPaintedPolygon(anchorStationToOuterTip(station, scale), scale);
        const offset = measureEdgeCornerOffset(painted, corner, visible);
        measured.push(`${corner}@${scale}: ${offset.horizontal.toFixed(2)} x ${offset.vertical.toFixed(2)}`);
        expect(offset.horizontal, `${corner} ${scale} horizontal`).toBeCloseTo(resolveEdgeCornerTipInset(viewport), 9);
        expect(offset.vertical, `${corner} ${scale} vertical`).toBeCloseTo(resolveEdgeCornerTipInset(viewport), 9);
      }
    });
    expect(measured).toHaveLength(12);
  });

  test('the offset does not depend on the viewport size within a class: a bigger or smaller view never moves a diamond away from its corner', () => {
    for (const rounded of [true, false]) {
      const group = VIEWPORTS.filter((viewport) => (resolveEdgeCornerTipInset(viewport) > 0) === rounded);
      expect(group.length).toBeGreaterThan(2);
      const first = group[0]!;
      const reference = measureEdgeCornerOffset(
        resolveEdgeMarkerPaintedPolygon(resolveEdgeStations(first)[0]!),
        'top-left',
        first
      );
      for (const viewport of group) {
        const station = resolveEdgeStations({ width: viewport.width, height: viewport.height })[0]!;
        const offset = measureEdgeCornerOffset(resolveEdgeMarkerPaintedPolygon(station), 'top-left', viewport);
        expect(offset.horizontal, viewport.name).toBeCloseTo(reference.horizontal, 9);
        expect(offset.vertical, viewport.name).toBeCloseTo(reference.vertical, 9);
      }
    }
  });

  test('the corner stations mirror each other and the orbit lands back on them after a full lap', () => {
    const viewport = { width: 390, height: 844 };
    const [tl, , tr, , br, , bl] = resolveEdgeStations(viewport) as ReadonlyArray<{ x: number; y: number }>;
    expect(tr!.x).toBeCloseTo(viewport.width - tl!.x, 9);
    expect(bl!.y).toBeCloseTo(viewport.height - tl!.y, 9);
    expect(br!.x).toBeCloseTo(tr!.x, 9);
    expect(br!.y).toBeCloseTo(bl!.y, 9);
    expect(resolveOrbitingEdgeStations(viewport, Math.PI * 2)).toEqual(resolveEdgeStations(viewport));
  });
});
