import { describe, expect, test } from 'vitest';
import { computeChipTileAt, type BoardCell, type BoardTileBakeInput } from '../../src/render/boardTileBake';
import {
  resolveLocatorSquareRadii,
  resolvePlayerLocatorMetrics,
  type LocatorCornerRadii,
  type LocatorGraphics,
  type LocatorTileRadii
} from '../../src/render/playerLocator';
import {
  createPlayerMarkerFrame,
  drawPlayerMarker,
  resolvePlayerMarkerCenter,
  resolvePlayerMarkerDiagnosticRadii,
  resolvePlayerMarkerEndpointRadii,
  resolvePlayerMarkerFrame,
  resolvePlayerMarkerReach,
  resolvePlayerMarkerRestHalf
} from '../../src/render/playerMarker';

/**
 * MAZER-VIS-023 (the ring follows the cap-tile shape on start / goal tiles) and MAZER-VIS-024 (the diagnostics report
 * the drawn block), against the REAL chip geometry of a dead-end tile and the REAL marker draw.
 */
// A three-tile corridor: (1,1) and (3,1) are dead-end caps (open one side), (2,1) is a straight.
const CAP_ROWS = [
  '#####',
  '#...#',
  '#####'
];
const CAP_GRID = CAP_ROWS.map((row) => [...row].map((c) => c !== '#'));
const LEFT_CAP: BoardCell = { x: 1, y: 1 };
const RIGHT_CAP: BoardCell = { x: 3, y: 1 };
const STRAIGHT: BoardCell = { x: 2, y: 1 };

const TILE_SIZES = [14.72, 25.44, 40.5];
const DPRS = [1, 2, 2.625, 3];

const bakeInput = (tileSize: number, dpr: number): BoardTileBakeInput => ({
  grid: CAP_GRID, width: CAP_GRID[0]!.length, height: CAP_GRID.length, tileSize, devicePixelRatio: dpr
});

interface Call {
  fn: 'fill' | 'stroke';
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number | LocatorCornerRadii;
  lineWidth: number;
}

const record = (): { g: LocatorGraphics; calls: Call[] } => {
  const calls: Call[] = [];
  let lineWidth = 0;
  // the draw reuses one radii record between calls, so snapshot it
  const copy = (r: number | LocatorCornerRadii): number | LocatorCornerRadii => (typeof r === 'number' ? r : { ...r });
  return {
    calls,
    g: {
      fillStyle: () => undefined,
      lineStyle: (w: number) => { lineWidth = w; },
      fillRoundedRect: (x, y, w, h, radius) => { calls.push({ fn: 'fill', x, y, w, h, radius: copy(radius), lineWidth }); },
      strokeRoundedRect: (x, y, w, h, radius) => { calls.push({ fn: 'stroke', x, y, w, h, radius: copy(radius), lineWidth }); }
    }
  };
};

const corners = (r: number | LocatorCornerRadii): LocatorCornerRadii => (
  typeof r === 'number' ? { tl: r, tr: r, br: r, bl: r } : r
);

/** Is (px, py) inside the rounded rectangle with per-corner radii, within `slack`? */
const insideRounded = (
  px: number, py: number, x: number, y: number, w: number, h: number, r: LocatorCornerRadii, slack: number
): boolean => {
  if (px < x - slack || px > x + w + slack || py < y - slack || py > y + h + slack) return false;
  // a point in a corner's square is inside only when within the corner's arc
  const check = (cx: number, cy: number, rad: number, sx: number, sy: number): boolean => (
    !(sx * (px - cx) > 0 && sy * (py - cy) > 0) || Math.hypot(px - cx, py - cy) <= rad + slack
  );
  return check(x + r.tl, y + r.tl, r.tl, -1, -1)
    && check(x + w - r.tr, y + r.tr, r.tr, 1, -1)
    && check(x + w - r.br, y + h - r.br, r.br, 1, 1)
    && check(x + r.bl, y + h - r.bl, r.bl, -1, 1);
};

const drawRing = (tileSize: number, dpr: number, cell: BoardCell, radii: LocatorTileRadii | null) => {
  const center = resolvePlayerMarkerCenter(cell.x, cell.y, tileSize, dpr, 0, 0);
  const frame = resolvePlayerMarkerFrame({
    centerX: center.x, centerY: center.y, tileSize, devicePixelRatio: dpr, timeMs: 0, reducedMotion: true,
    motionAmount: 0, headingX: 0, headingY: 0
  }, createPlayerMarkerFrame());
  const { g, calls } = record();
  drawPlayerMarker(g, frame, {
    tileSize, devicePixelRatio: dpr, alpha: 1, timeMs: 0, coreColor: 0x39e07a, pingStartMs: -1, reducedMotion: true,
    tileCornerRadii: radii
  });
  const metrics = resolvePlayerLocatorMetrics(tileSize, dpr, resolvePlayerMarkerReach(tileSize));
  expect(metrics.ringVisible).toBe(true);
  // the ring is the one stroke whose side is the ring's own extent (the keyline and the accent are other sizes)
  const ring = calls.find((c) => c.fn === 'stroke' && Math.abs(c.w - (metrics.ringHalfCss * 2)) < 1e-9)!;
  expect(ring).toBeDefined();
  return { ring, metrics, center };
};

describe('MAZER-VIS-023: the ring follows the cap-tile shape on start and goal tiles', () => {
  test('a dead-end cap tile is rounded on its closed corners only (the geometry the ring follows)', () => {
    const left = computeChipTileAt(bakeInput(25.44, 2), LEFT_CAP)!;
    const right = computeChipTileAt(bakeInput(25.44, 2), RIGHT_CAP)!;
    // open to the right: top-left and bottom-left are the round ones
    expect(left.radii[0]).toBeGreaterThan(0);
    expect(left.radii[3]).toBeGreaterThan(0);
    expect(left.radii[1]).toBe(0);
    expect(left.radii[2]).toBe(0);
    expect(right.radii[1]).toBeGreaterThan(0);
    expect(right.radii[2]).toBeGreaterThan(0);
    expect(right.radii[0]).toBe(0);
  });

  test('no ring corner extends past the dead-end disc, at large tile sizes and every DPR', () => {
    for (const tileSize of TILE_SIZES) {
      for (const dpr of DPRS) {
        for (const cell of [LEFT_CAP, RIGHT_CAP]) {
          const tile = computeChipTileAt(bakeInput(tileSize, dpr), cell)!;
          const { ring, metrics, center } = drawRing(tileSize, dpr, cell, tile.radii);
          const half = tileSize / 2;
          // the baked tile's edges are device-snapped (up to one device px from nominal); the ring is flush with nominal
          const snapSlack = 1 / dpr;
          const outline = { x: center.x - half, y: center.y - half, w: tileSize, h: tileSize };
          const outlineRadii: LocatorCornerRadii = {
            tl: tile.radii[0], tr: tile.radii[1], br: tile.radii[2], bl: tile.radii[3]
          };
          // sample the ring's OUTER edge: the stroke centre line grown by half the stroke width
          const grow = metrics.ringStrokeCss / 2;
          const r = corners(ring.radius);
          const ox = ring.x - grow;
          const oy = ring.y - grow;
          const ow = ring.w + (grow * 2);
          const oh = ring.h + (grow * 2);
          const arcs = [
            { name: 'tl', cx: ox + r.tl + grow, cy: oy + r.tl + grow, sx: -1, sy: -1, rad: r.tl + grow },
            { name: 'tr', cx: ox + ow - r.tr - grow, cy: oy + r.tr + grow, sx: 1, sy: -1, rad: r.tr + grow },
            { name: 'br', cx: ox + ow - r.br - grow, cy: oy + oh - r.br - grow, sx: 1, sy: 1, rad: r.br + grow },
            { name: 'bl', cx: ox + r.bl + grow, cy: oy + oh - r.bl - grow, sx: -1, sy: 1, rad: r.bl + grow }
          ];
          for (const arc of arcs) {
            for (let i = 0; i <= 90; i += 1) {
              const angle = (i / 90) * (Math.PI / 2);
              const px = arc.cx + (arc.sx * Math.cos(angle) * arc.rad);
              const py = arc.cy + (arc.sy * Math.sin(angle) * arc.rad);
              expect(
                insideRounded(px, py, outline.x, outline.y, outline.w, outline.h, outlineRadii, snapSlack),
                `${tileSize}@${dpr} ${arc.name} ring point (${px.toFixed(3)}, ${py.toFixed(3)}) is past the cap outline`
              ).toBe(true);
            }
          }
        }
      }
    }
  });

  test('regression: the plain chip-corner ring DOES poke past the cap disc at a large tile (what the card fixed)', () => {
    const tileSize = 40.5;
    const dpr = 2;
    const tile = computeChipTileAt(bakeInput(tileSize, dpr), LEFT_CAP)!;
    const { ring, metrics, center } = drawRing(tileSize, dpr, LEFT_CAP, null);
    expect(typeof ring.radius).toBe('number');
    const half = tileSize / 2;
    const grow = metrics.ringStrokeCss / 2;
    const rad = (ring.radius as number) + grow;
    // the ring's top-left corner arc at 45 degrees (outer edge)
    const px = ring.x - grow + rad - (Math.SQRT1_2 * rad);
    const py = ring.y - grow + rad - (Math.SQRT1_2 * rad);
    const outlineRadii: LocatorCornerRadii = { tl: tile.radii[0], tr: tile.radii[1], br: tile.radii[2], bl: tile.radii[3] };
    expect(insideRounded(px, py, center.x - half, center.y - half, tileSize, tileSize, outlineRadii, 1e-6)).toBe(false);
  });

  test('closed corners follow the tile arc concentrically; open-side corners keep the chip proportion', () => {
    const tileSize = 25.44;
    const dpr = 2;
    const tile = computeChipTileAt(bakeInput(tileSize, dpr), LEFT_CAP)!;
    const { ring, metrics } = drawRing(tileSize, dpr, LEFT_CAP, tile.radii);
    const r = corners(ring.radius);
    const inset = (tileSize / 2) - metrics.ringHalfCss;
    expect(r.tl).toBeCloseTo(Math.min(metrics.ringHalfCss, tile.radii[0] - inset), 9);
    expect(r.bl).toBeCloseTo(Math.min(metrics.ringHalfCss, tile.radii[3] - inset), 9);
    // the open (right) side keeps the chip corner proportion of the ring's own side
    expect(r.tr).toBeCloseTo(metrics.ringHalfCss * 2 * 0.3, 9);
    expect(r.br).toBeCloseTo(metrics.ringHalfCss * 2 * 0.3, 9);
  });

  test('a tile without end radii draws the ring exactly as before (one number radius)', () => {
    const { ring } = drawRing(25.44, 2, STRAIGHT, null);
    expect(typeof ring.radius).toBe('number');
  });

  test('resolveLocatorSquareRadii clamps to a full semicircle and never goes negative', () => {
    const out = { tl: 0, tr: 0, bl: 0, br: 0 };
    resolveLocatorSquareRadii(5, 12, [12, 0, 0, 12], out);
    expect(out.tl).toBe(5);
    expect(out.bl).toBe(5);
    expect(out.tr).toBeCloseTo(5 * 2 * 0.3, 9);
    resolveLocatorSquareRadii(5, 12, [1, 1, 1, 1], out);
    expect(out.tl).toBe(0);
  });

  test('resolvePlayerMarkerEndpointRadii: the start and goal tiles only, nearest cell while gliding', () => {
    const start = { x: 2, y: 3 };
    const goal = { x: 8, y: 1 };
    const tiles = {
      start: { radii: [1, 0, 0, 1] as LocatorTileRadii },
      goal: { radii: [0, 2, 2, 0] as LocatorTileRadii }
    };
    expect(resolvePlayerMarkerEndpointRadii(2, 3, start, goal, tiles)).toEqual([1, 0, 0, 1]);
    expect(resolvePlayerMarkerEndpointRadii(8, 1, start, goal, tiles)).toEqual([0, 2, 2, 0]);
    expect(resolvePlayerMarkerEndpointRadii(5, 5, start, goal, tiles)).toBeNull();
    // mid-glide: more than half way out of the start tile is no longer the start tile
    expect(resolvePlayerMarkerEndpointRadii(2.4, 3, start, goal, tiles)).toEqual([1, 0, 0, 1]);
    expect(resolvePlayerMarkerEndpointRadii(2.6, 3, start, goal, tiles)).toBeNull();
    expect(resolvePlayerMarkerEndpointRadii(2, 3, undefined, null, tiles)).toBeNull();
    expect(resolvePlayerMarkerEndpointRadii(2, 3, start, goal, { start: null, goal: null })).toBeNull();
  });
});

describe('MAZER-VIS-024: the diagnostics report the real drawn block and ring', () => {
  test('coreRadius is half the block the draw fills, haloRadius is the ring outer edge, at every tile and DPR', () => {
    for (const tileSize of [3.265, 7, 14.72, 18, 25.44]) {
      for (const dpr of DPRS) {
        const diag = resolvePlayerMarkerDiagnosticRadii(tileSize, dpr);
        const frame = resolvePlayerMarkerFrame({
          centerX: 50, centerY: 50, tileSize, devicePixelRatio: dpr, timeMs: 0, reducedMotion: true,
          motionAmount: 0, headingX: 0, headingY: 0
        }, createPlayerMarkerFrame());
        const { g, calls } = record();
        drawPlayerMarker(g, frame, {
          tileSize, devicePixelRatio: dpr, alpha: 1, timeMs: 0, coreColor: 0x39e07a, pingStartMs: -1, reducedMotion: true
        });
        // the block fill is the last fill the draw makes
        const fills = calls.filter((c) => c.fn === 'fill');
        const block = fills[fills.length - 1]!;
        expect(diag.coreRadius).toBeCloseTo(block.w / 2, 9);
        expect(diag.coreRadius).toBeCloseTo(block.h / 2, 9);
        expect(diag.coreRadius).toBeCloseTo(resolvePlayerMarkerRestHalf(tileSize), 9);
        const metrics = resolvePlayerLocatorMetrics(tileSize, dpr, resolvePlayerMarkerReach(tileSize));
        if (metrics.ringVisible) {
          // the ring (when the tile holds one) is the first stroke the draw makes
          const ring = calls.find((c) => c.fn === 'stroke')!;
          expect(diag.haloRadius).toBeCloseTo((ring.w / 2) + (ring.lineWidth / 2), 9);
        }
        expect(diag.haloRadius).toBeCloseTo(tileSize / 2, 9);
      }
    }
  });

  test('the old diamond-era ratios 0.46 and 0.72 of the tile are gone from the diagnostics', () => {
    for (const tileSize of [7, 14.72, 25.44]) {
      const diag = resolvePlayerMarkerDiagnosticRadii(tileSize, 2);
      expect(diag.coreRadius).not.toBeCloseTo(tileSize * 0.46, 3);
      expect(diag.haloRadius).not.toBeCloseTo(tileSize * 0.72, 3);
      expect(diag.coreRadius / tileSize).toBeCloseTo(0.3, 9);
      expect(diag.haloRadius / tileSize).toBeCloseTo(0.5, 9);
    }
  });

  test('reuses the caller record', () => {
    const out = { coreRadius: 0, haloRadius: 0 };
    expect(resolvePlayerMarkerDiagnosticRadii(14.72, 2, out)).toBe(out);
  });
});
