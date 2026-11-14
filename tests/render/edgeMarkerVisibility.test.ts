import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';
import {
  EDGE_STATION_COUNT,
  drawEdgeMarkers,
  resolveEdgeMarkerPaintedPolygon,
  resolveEdgeMarkerStates,
  resolveEdgeStations,
  resolveOrbitingEdgeStations,
  type EdgeGraphics,
  type EdgeStation
} from '../../src/render/edgeMarkers';

/**
 * MAZER-VIS-033 regression: ALL EIGHT edge diamonds are on the canvas, in play, for the shipped board sizes (25x51 on a
 * phone, 45x27 on desktop) at the viewports and device pixel ratios the owner compares (390x844 @2.625 / @3, 393x852
 * @3, 412x915 @2.625, 1280x720 @2, 1440x900 @2). The owner reported that only 6 of the 8 diamonds showed in a played
 * game (the two bottom corners missing). Headless Chromium never reproduced it (all 8 paint at every viewport, board and
 * DPR tried, see docs/ui/MAZER-EDGE-BEAMS-DIAMOND-FILL-2026-11-12.md), so this pins what can be pinned: every diamond
 * rect (the painted outline, miter join included) lies inside the canvas in css and device px, is not occluded by the board
 * rectangle, and is actually drawn (not hidden, not culled).
 */
interface Rect { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

const SHIPPED = [
  { name: 'phone 390x844 @2.625', width: 390, height: 844, dpr: 2.625, mazeWidth: 25, mazeHeight: 51 },
  { name: 'phone 390x844 @3', width: 390, height: 844, dpr: 3, mazeWidth: 25, mazeHeight: 51 },
  { name: 'phone 393x852 @3', width: 393, height: 852, dpr: 3, mazeWidth: 25, mazeHeight: 51 },
  { name: 'phone 412x915 @2.625', width: 412, height: 915, dpr: 2.625, mazeWidth: 25, mazeHeight: 51 },
  { name: 'desktop 1280x720 @2', width: 1280, height: 720, dpr: 2, mazeWidth: 45, mazeHeight: 27 },
  { name: 'desktop 1440x900 @2', width: 1440, height: 900, dpr: 2, mazeWidth: 45, mazeHeight: 27 }
] as const;

const rectOf = (station: Pick<EdgeStation, 'x' | 'y' | 'inwardAngle'>): Rect => {
  // The PAINTED outline (the stroke's miter join included): the exact bounding box of what the canvas shows.
  const painted = resolveEdgeMarkerPaintedPolygon(station);
  return {
    left: Math.min(...painted.map((vertex) => vertex.x)),
    top: Math.min(...painted.map((vertex) => vertex.y)),
    right: Math.max(...painted.map((vertex) => vertex.x)),
    bottom: Math.max(...painted.map((vertex) => vertex.y))
  };
};

const area = (rect: Rect): number => (rect.right - rect.left) * (rect.bottom - rect.top);

const overlapArea = (a: Rect, b: Rect): number => (
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
);

class Recorder implements EdgeGraphics {
  readonly paths: Array<Array<{ x: number; y: number }>> = [];
  private current: Array<{ x: number; y: number }> = [];
  fillStyle(): void {}
  lineStyle(): void {}
  beginPath(): void { this.current = []; }
  moveTo(x: number, y: number): void { this.current.push({ x, y }); }
  lineTo(x: number, y: number): void { this.current.push({ x, y }); }
  closePath(): void {}
  fillPath(): void {}
  strokePath(): void { this.paths.push(this.current); }
  fillCircle(): void {}
  lineBetween(): void {}
}

describe('all 8 edge diamonds are visible on the canvas in play (MAZER-VIS-033)', () => {
  test.each(SHIPPED)('$name: 8 distinct diamonds, each rect inside the canvas, top and bottom ones clear of the board', (config) => {
    const layout = resolveLegacyMenuLayout(config.width, config.height, 50, config.mazeWidth, config.mazeHeight, 'play');
    expect(layout.width).toBe(config.width);
    expect(layout.height).toBe(config.height);
    const stations = resolveEdgeStations({ width: layout.width, height: layout.height });
    expect(stations).toHaveLength(EDGE_STATION_COUNT);
    expect(new Set(stations.map((station) => station.id)).size).toBe(8);
    // Two bottom corners and the bottom middle: the three the owner counted.
    expect(stations.filter((station) => station.side === 'bottom')).toHaveLength(3);
    expect(stations.filter((station) => station.side === 'bottom' && station.isCorner)).toHaveLength(2);
    const board: Rect = {
      left: layout.boardLeft,
      top: layout.boardTop,
      right: layout.boardLeft + layout.boardWidth,
      bottom: layout.boardTop + layout.boardHeight
    };
    const backing = { width: Math.ceil(config.width * config.dpr), height: Math.ceil(config.height * config.dpr) };

    for (const station of stations) {
      const rect = rectOf(station);
      const label = `${config.name} diamond ${station.id} (${station.side}${station.isCorner ? ' corner' : ''})`;
      expect(area(rect), `${label} has an area`).toBeGreaterThan(100);
      // Inside the canvas in css px...
      expect(rect.left, `${label} left`).toBeGreaterThanOrEqual(-1e-9);
      expect(rect.top, `${label} top`).toBeGreaterThanOrEqual(-1e-9);
      expect(rect.right, `${label} right`).toBeLessThanOrEqual(config.width + 1e-9);
      expect(rect.bottom, `${label} bottom`).toBeLessThanOrEqual(config.height + 1e-9);
      // ...and in device px of the canvas backing store (ceil(css * dpr)), with the stroke snapped outward.
      expect(Math.floor((rect.left + 1e-9) * config.dpr), `${label} device left`).toBeGreaterThanOrEqual(0);
      expect(Math.floor((rect.top + 1e-9) * config.dpr), `${label} device top`).toBeGreaterThanOrEqual(0);
      expect(Math.ceil((rect.right - 1e-9) * config.dpr), `${label} device right`).toBeLessThanOrEqual(backing.width);
      expect(Math.ceil((rect.bottom - 1e-9) * config.dpr), `${label} device bottom`).toBeLessThanOrEqual(backing.height);
      // The board is drawn above the diamonds. A top or bottom diamond must be entirely clear of its rectangle. (The left and
      // right middle diamonds share the screen edge with a phone board that is as wide as the screen, whose bleed margin
      // reaches past it; the board is translucent there, so those two are only held to the canvas rule above.)
      if (station.side === 'top' || station.side === 'bottom') {
        expect(overlapArea(rect, board), `${label} is not under the board`).toBe(0);
      }
    }
  });

  test.each(SHIPPED)('$name: the draw call paints all 8 outlines inside the canvas (none hidden or culled), and a whole ring step lands back on all 8', (config) => {
    const viewport = { width: config.width, height: config.height };
    const stations = resolveEdgeStations(viewport);
    const states = resolveEdgeMarkerStates({ reducedMotion: false, timeMs: 1234, trailHeadDistanceTiles: 6 });
    expect(states.every((state) => !state.hidden)).toBe(true);
    const drawn = new Recorder();
    drawEdgeMarkers(drawn, stations, states);
    expect(drawn.paths).toHaveLength(8);
    for (const path of drawn.paths) {
      expect(path).toHaveLength(4);
      for (const point of path) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(config.width);
        expect(point.y).toBeLessThanOrEqual(config.height);
      }
    }
    // After any whole number of ring steps the eight are exactly the rest layout again (the bottom corners included).
    for (const steps of [0, 1, 4, 8]) {
      const orbit = resolveOrbitingEdgeStations(viewport, (steps / 8) * Math.PI * 2);
      expect(orbit).toHaveLength(8);
      expect(orbit.map((station) => station.side).sort()).toEqual(stations.map((station) => station.side).sort());
      for (const station of orbit) {
        const rect = rectOf(station);
        expect(rect.left).toBeGreaterThanOrEqual(-1e-9);
        expect(rect.top).toBeGreaterThanOrEqual(-1e-9);
        expect(rect.bottom).toBeLessThanOrEqual(config.height + 1e-9);
        expect(rect.right).toBeLessThanOrEqual(config.width + 1e-9);
      }
    }
  });
});
