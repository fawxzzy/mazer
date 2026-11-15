import { describe, expect, test } from 'vitest';
import { EDGE_DIAMOND_REST_SCALE } from '../../src/render/edgeBeamTimeline';
import {
  EDGE_CORNER_NARROW_MAX_SCALE,
  EDGE_CORNER_NARROW_WIDTH_PX,
  measureEdgeCornerOffset,
  resolveEdgeCornerMaxScale
} from '../../src/render/edgeCornerAnchor';
import {
  anchorStationToOuterTip,
  drawEdgeMarker,
  resolveEdgeMarkerPaintedPolygon,
  resolveEdgeStations,
  type EdgeGraphics
} from '../../src/render/edgeMarkers';
import {
  LEGACY_HEADER_CORNER_CLEARANCE_MIN_WIDTH_PX,
  LEGACY_HEADER_CORNER_DIAMOND_GAP_PX,
  LEGACY_HEADER_ICON_GLYPH_SCALE,
  resolveLegacyHeaderControlFrame,
  resolveLegacyHeaderEdgeInset,
  resolveLegacyHeaderTrailingEdgeInset
} from '../../src/legacy-runtime/legacyHeaderControl';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';

/**
 * MAZER-UI-035 follow-up: phones 320..374 css px wide. The trailing header inset stays the narrow-phone one (a wider gear inset
 * shrinks the title), the corner diamonds stay pinned on the corners, and the diamond's peak size is capped so the settings
 * glyph keeps clear of it. 375 and up are unchanged.
 */
const NARROW = [
  { width: 320, height: 568 },
  { width: 340, height: 640 },
  { width: 360, height: 740 },
  { width: 374, height: 812 }
] as const;
const WIDE = [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 720 }] as const;

const distanceToPolygon = (polygon: ReadonlyArray<{ x: number; y: number }>, cx: number, cy: number): number => {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    for (let t = 0; t <= 1; t += 0.01) {
      min = Math.min(min, Math.hypot(a.x + ((b.x - a.x) * t) - cx, a.y + ((b.y - a.y) * t) - cy));
    }
  }
  return min;
};

describe('narrow-phone corner diamond cap (MAZER-UI-035 follow-up)', () => {
  test('the cap applies under 375 wide only and sits above the 50% rest size', () => {
    expect(EDGE_CORNER_NARROW_WIDTH_PX).toBe(LEGACY_HEADER_CORNER_CLEARANCE_MIN_WIDTH_PX);
    for (const viewport of NARROW) expect(resolveEdgeCornerMaxScale(viewport.width)).toBe(EDGE_CORNER_NARROW_MAX_SCALE);
    for (const viewport of WIDE) expect(resolveEdgeCornerMaxScale(viewport.width)).toBe(1);
    expect(EDGE_CORNER_NARROW_MAX_SCALE).toBeGreaterThan(EDGE_DIAMOND_REST_SCALE);
  });

  test('only narrow corner stations carry maxScale; 375+ stations are byte-for-byte the old shape', () => {
    for (const viewport of NARROW) {
      for (const station of resolveEdgeStations(viewport)) {
        expect(station.maxScale, `${viewport.width} id ${station.id}`).toBe(station.isCorner ? EDGE_CORNER_NARROW_MAX_SCALE : undefined);
      }
    }
    for (const viewport of WIDE) {
      for (const station of resolveEdgeStations(viewport)) expect('maxScale' in station).toBe(false);
    }
  });

  test('the trailing header inset is unchanged under 375 (the title is not shrunk by it)', () => {
    for (const viewport of NARROW) {
      expect(resolveLegacyHeaderTrailingEdgeInset(viewport.width, 36)).toBe(resolveLegacyHeaderEdgeInset(viewport.width));
    }
  });

  test('a capped diamond drawn at full requested size stays on the corner and clears the settings glyph by the UI-035 gap at 320..374', () => {
    for (const viewport of NARROW) {
      const station = resolveEdgeStations(viewport, 3)[2]!;
      const polygon = resolveEdgeMarkerPaintedPolygon(anchorStationToOuterTip(station, EDGE_CORNER_NARROW_MAX_SCALE), EDGE_CORNER_NARROW_MAX_SCALE);
      const offset = measureEdgeCornerOffset(polygon, 'top-right', viewport);
      expect(Math.abs(offset.horizontal), `${viewport.width} h`).toBeLessThan(1);
      expect(Math.abs(offset.vertical), `${viewport.width} v`).toBeLessThan(1);
      const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'menu', {});
      const gear = resolveLegacyHeaderControlFrame({
        height: layout.height,
        hudHeight: layout.lanes.hud?.height ?? 64,
        hudTop: layout.lanes.hud?.top ?? 0,
        placement: 'trailing',
        safeArea: layout.headerSafeInset,
        sizeScale: layout.headerIconScale,
        width: layout.width
      });
      // The gear glyph is a ring of radius size * GLYPH_SCALE / 2: measure its centre to the painted kite.
      const radius = (gear.width * LEGACY_HEADER_ICON_GLYPH_SCALE) / 2;
      const gap = distanceToPolygon(polygon, (gear.left + gear.right) / 2, (gear.top + gear.bottom) / 2) - radius;
      expect(gap, `${viewport.width} glyph gap`).toBeGreaterThanOrEqual(LEGACY_HEADER_CORNER_DIAMOND_GAP_PX - 0.5);
    }
  });

  test('drawEdgeMarker clamps the requested size to the station cap', () => {
    const calls: Array<[string, ...number[]]> = [];
    const graphics = new Proxy({}, { get: (_t, name) => (...args: number[]) => { calls.push([String(name), ...args.filter((a) => typeof a === 'number')]); } }) as unknown as EdgeGraphics;
    const capped = resolveEdgeStations({ width: 320, height: 568 })[2]!;
    const uncapped = { ...capped, maxScale: undefined };
    const xs = (station: typeof capped) => { calls.length = 0; drawEdgeMarker(graphics, station, { scale: 1 } as never); return calls.filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo').map((c) => c[1]!); };
    const cappedXs = xs(capped);
    const fullXs = xs(uncapped as never);
    const span = (values: number[]) => Math.max(...values) - Math.min(...values);
    expect(span(cappedXs)).toBeLessThan(span(fullXs));
    expect(span(cappedXs) / span(fullXs)).toBeCloseTo(EDGE_CORNER_NARROW_MAX_SCALE, 1);
  });
});
