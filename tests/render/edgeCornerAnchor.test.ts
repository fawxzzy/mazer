import { describe, expect, test } from 'vitest';
import { resolveMazerCanvasResolution } from '../../src/boot/canvasResolution';
import { EDGE_DIAMOND_REST_SCALE } from '../../src/render/edgeBeamTimeline';
import {
  EDGE_CORNER_DISPLAY_RADIUS_PX,
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
 * MAZER-VIS-044: the four corner diamonds stay anchored snug in their screen corners at every viewport size, expanded or shrunk:
 * the painted outer tip is the same distance (~16.4 css px, the rounded-display-corner arc on the diagonal) from BOTH edges at
 * every size, DPR, and diamond scale; nothing drifts inward along an edge as the view gets bigger or smaller.
 */
const VIEWPORTS = [
  { name: 'phone 390x844 @3', width: 390, height: 844, dpr: 3 },
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

describe('corner diamonds are anchored in the 4 screen corners (MAZER-VIS-044)', () => {
  test('the tip inset is the point where the corner diagonal meets the display-corner arc, ~16.4 px', () => {
    expect(resolveEdgeCornerTipInset()).toBeCloseTo(EDGE_CORNER_DISPLAY_RADIUS_PX * (1 - Math.SQRT1_2), 12);
    expect(resolveEdgeCornerTipInset()).toBeGreaterThan(16);
    expect(resolveEdgeCornerTipInset()).toBeLessThan(17);
    expect(resolveEdgeCornerTipInset(0)).toBe(0);
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
        expect(offset.horizontal, `${corner} ${scale} horizontal`).toBeCloseTo(resolveEdgeCornerTipInset(), 9);
        expect(offset.vertical, `${corner} ${scale} vertical`).toBeCloseTo(resolveEdgeCornerTipInset(), 9);
      }
    });
    expect(measured).toHaveLength(12);
  });

  test('the offset does not depend on the viewport size: a bigger or smaller view never moves a diamond away from its corner', () => {
    const reference = measureEdgeCornerOffset(
      resolveEdgeMarkerPaintedPolygon(resolveEdgeStations({ width: 390, height: 844 })[0]!),
      'top-left',
      { width: 390, height: 844 }
    );
    for (const viewport of VIEWPORTS) {
      const station = resolveEdgeStations({ width: viewport.width, height: viewport.height })[0]!;
      const offset = measureEdgeCornerOffset(resolveEdgeMarkerPaintedPolygon(station), 'top-left', viewport);
      expect(offset.horizontal, viewport.name).toBeCloseTo(reference.horizontal, 9);
      expect(offset.vertical, viewport.name).toBeCloseTo(reference.vertical, 9);
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
