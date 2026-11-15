import { describe, expect, test } from 'vitest';
import { resolveMazerCanvasResolution } from '../../src/boot/canvasResolution';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';
import {
  EDGE_STATION_COUNT,
  anchorStationToOuterTip,
  drawEdgeMarker,
  resolveEdgeMarkerPaintedPolygon,
  resolveEdgeStations,
  resolveEdgeVisibleExtent,
  type EdgeGraphics,
  type EdgeMarkerState,
  type EdgeStation
} from '../../src/render/edgeMarkers';
import { measureEdgeCornerOffset, resolveEdgeCornerTipInset } from '../../src/render/edgeCornerAnchor';
import { EDGE_DIAMOND_REST_SCALE } from '../../src/render/edgeBeamTimeline';
import { RasterContext } from './support/rasterContext';

/**
 * MAZER-VIS-043: every one of the 8 edge diamonds sits fully INSIDE the painted canvas with its OUTER tip touching the screen edge
 * (not past it, not short of it), at 50%, 75% and 100% size, at every device pixel ratio the owner compares (1, 2, 2.625, 3), for
 * the shipped viewports and both frozen board sizes (25x51 phone, 45x27 desktop). The diamond is scaled about its OUTER tip, so the
 * tip stays on the edge while it grows and shrinks. The painted canvas is round(css * resolution) device px, where the resolution is
 * the DPR rounded to hundredths (2.625 -> 2.63) and capped at 3 (resolveMazerCanvasResolution).
 *
 * Three layers: (1) the exact painted bounding box (outline plus the stroke's miter join) lies inside the visible canvas and touches
 * its edge within 0.5 device px; (2) real pixels: a software rasteriser draws the real `drawEdgeMarker` with the real context scale
 * and not one lit pixel lies beyond the canvas border, while the last two device rows/columns at the edge ARE lit; (3) the corner
 * diamonds sit the viewport's tip inset from both edges (0 px, or 16 px on a tall rounded-display phone, MAZER-VIS-044 / VIS-054).
 */
const VIEWPORTS = [
  { name: 'phone 390x844', width: 390, height: 844, mazeWidth: 25, mazeHeight: 51 },
  { name: 'phone 393x852', width: 393, height: 852, mazeWidth: 25, mazeHeight: 51 },
  { name: 'phone 412x915', width: 412, height: 915, mazeWidth: 25, mazeHeight: 51 },
  { name: 'phone 360x740', width: 360, height: 740, mazeWidth: 25, mazeHeight: 51 },
  { name: 'phone 375x667', width: 375, height: 667, mazeWidth: 25, mazeHeight: 51 },
  { name: 'phone 375x812', width: 375, height: 812, mazeWidth: 25, mazeHeight: 51 },
  { name: 'phone 430x932', width: 430, height: 932, mazeWidth: 25, mazeHeight: 51 },
  { name: 'desktop 1280x720', width: 1280, height: 720, mazeWidth: 45, mazeHeight: 27 },
  { name: 'desktop 1440x900', width: 1440, height: 900, mazeWidth: 45, mazeHeight: 27 }
] as const;
const DPRS = [1, 2, 2.625, 3] as const;
const SCALES = [EDGE_DIAMOND_REST_SCALE, 0.75, 1] as const;

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

const stateAt = (station: EdgeStation, scale: number, fill = 0): EdgeMarkerState => ({
  alpha: 1, energized: false, energy: 0, fill, flash: 0, hidden: false, id: station.id, scale, spinRad: 0
});

// MAZER-VIS-044/054: the four corner diamonds are exempt from "touches the edge": they sit the viewport tip inset in from both edges instead.
describe('every edge diamond touches the screen edge with its outer tip and nothing leaves the canvas (MAZER-VIS-043)', () => {
  for (const viewport of VIEWPORTS) {
    for (const dpr of DPRS) {
      const resolution = resolveMazerCanvasResolution(dpr);
      const label = `${viewport.name} @${dpr}`;

      test(`${label} (board ${viewport.mazeWidth}x${viewport.mazeHeight}): painted bounding box inside the canvas and touching the edge within 0.5 device px at 50%, 75%, 100%`, () => {
        const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, viewport.mazeWidth, viewport.mazeHeight, 'play');
        expect(layout.width).toBe(viewport.width);
        expect(layout.height).toBe(viewport.height);
        const backing = { width: Math.max(1, Math.round(layout.width * resolution)), height: Math.max(1, Math.round(layout.height * resolution)) };
        const visibleWidth = resolveEdgeVisibleExtent(layout.width, resolution);
        const visibleHeight = resolveEdgeVisibleExtent(layout.height, resolution);
        expect(visibleWidth * resolution).toBeCloseTo(backing.width, 9);
        expect(visibleHeight * resolution).toBeCloseTo(backing.height, 9);
        const stations = resolveEdgeStations({ width: layout.width, height: layout.height }, resolution);
        expect(stations).toHaveLength(EDGE_STATION_COUNT);
        for (const station of stations) {
          for (const scale of SCALES) {
            const painted = resolveEdgeMarkerPaintedPolygon(anchorStationToOuterTip(station, scale), scale);
            const bounds = {
              left: Math.min(...painted.map((point) => point.x)),
              right: Math.max(...painted.map((point) => point.x)),
              top: Math.min(...painted.map((point) => point.y)),
              bottom: Math.max(...painted.map((point) => point.y))
            };
            const text = `${label} station ${station.id} (${station.side}${station.isCorner ? ' corner' : ''}) scale ${scale}`;
            // Inside the canvas, in css and in device px.
            expect(bounds.left, `${text} left`).toBeGreaterThanOrEqual(-1e-9);
            expect(bounds.top, `${text} top`).toBeGreaterThanOrEqual(-1e-9);
            expect(bounds.right * resolution, `${text} right`).toBeLessThanOrEqual(backing.width + 1e-6);
            expect(bounds.bottom * resolution, `${text} bottom`).toBeLessThanOrEqual(backing.height + 1e-6);
            // Touching the edge the station sits on, within half a device pixel (and never past it, checked above).
            if (station.isCorner) {
              // MAZER-VIS-044: a corner diamond is pinned snug in its corner, the same distance from BOTH edges at every size.
              const corner = (['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const)[station.id / 2] as 'top-left';
              const offset = measureEdgeCornerOffset(painted, corner, { width: visibleWidth, height: visibleHeight });
              const tipInset = resolveEdgeCornerTipInset(viewport);
              expect(Math.abs(offset.horizontal - tipInset) * resolution, `${text} horizontal corner offset`).toBeLessThanOrEqual(0.5);
              expect(Math.abs(offset.vertical - tipInset) * resolution, `${text} vertical corner offset`).toBeLessThanOrEqual(0.5);
              continue;
            }
            const gapDevice = {
              top: bounds.top * resolution,
              left: bounds.left * resolution,
              bottom: backing.height - (bounds.bottom * resolution),
              right: backing.width - (bounds.right * resolution)
            }[station.side];
            expect(gapDevice, `${text} gap to ${station.side}`).toBeGreaterThanOrEqual(-1e-6);
            expect(gapDevice, `${text} gap to ${station.side}`).toBeLessThanOrEqual(0.5);
          }
        }
      });

      test(`${label}: real pixels at 50%, 75%, 100%: not one lit pixel beyond the canvas border, the outer tip lights the last four device rows/columns of its edge`, () => {
        const stations = resolveEdgeStations({ width: viewport.width, height: viewport.height }, resolution);
        const backing = { width: Math.max(1, Math.round(viewport.width * resolution)), height: Math.max(1, Math.round(viewport.height * resolution)) };
        const WINDOW = 56; // css px square around the diamond
        for (const station of stations) {
          for (const scale of SCALES) {
            const originX = Math.floor((station.x - (WINDOW / 2)) * resolution);
            const originY = Math.floor((station.y - (WINDOW / 2)) * resolution);
            const size = Math.ceil(WINDOW * resolution);
            const ctx = new RasterContext(size, size);
            ctx.miterJoins = true; // a real canvas strokes with lineJoin 'miter' (the default; Phaser Graphics does not change it)
            // The real context transform is the resolution scale (patchCanvasContextResolution); here with the window origin folded in.
            ctx.setTransform(resolution, 0, 0, resolution, -originX, -originY);
            drawEdgeMarker(new Graphics(ctx), station, stateAt(station, scale, scale === 1 ? 0 : 0.5));
            let beyond = 0;
            let nearEdge = 0;
            let lit = 0;
            let nearCorner = 0;
            const cornerReachDevice = Math.ceil((resolveEdgeCornerTipInset(viewport) * resolution) + 2);
            for (let py = 0; py < size; py += 1) {
              for (let px = 0; px < size; px += 1) {
                if ((ctx.data[(((py * size) + px) * 4) + 3] ?? 0) === 0) continue;
                lit += 1;
                const dx = originX + px;
                const dy = originY + py;
                if (Math.min(dx, backing.width - 1 - dx) <= cornerReachDevice && Math.min(dy, backing.height - 1 - dy) <= cornerReachDevice) nearCorner += 1;
                if (dx < 0 || dy < 0 || dx >= backing.width || dy >= backing.height) beyond += 1;
                const distance = {
                  top: dy,
                  left: dx,
                  bottom: backing.height - 1 - dy,
                  right: backing.width - 1 - dx
                }[station.side];
                // The star's tips are needles (miter ~12 degree half angle): a pixel-centre sampler needs the last four device rows to see the tip.
                if (distance <= 3) nearEdge += 1;
              }
            }
            const text = `${label} station ${station.id} scale ${scale}`;
            expect(beyond, `${text} pixels beyond the canvas`).toBe(0);
            if (station.isCorner) {
              // Corner diamonds touch the corner point, not an edge midline: they must still be drawn (lit pixels in the window).
              expect(lit, `${text} lit pixels`).toBeGreaterThan(0);
              expect(nearCorner, `${text} lit pixels within the tip inset + 3 device px of both edges (the tip is in the corner)`).toBeGreaterThan(0);
              continue;
            }
            expect(nearEdge, `${text} pixels on the last four device rows/columns of ${station.side}`).toBeGreaterThan(0);
          }
        }
      });
    }
  }
});
