import { describe, expect, test } from 'vitest';
import {
  bakeBoardTiles,
  computeBoardTileLayout,
  computeChipGeometry,
  computeChipTileAt,
  drawBoardMarkers,
  type BoardCell,
  type BoardTileBakeInput,
  type ChipTileGeometry,
  type TileBakeContext2D
} from '../../src/render/boardTileBake';
import { boardMaterial } from '../../src/render/boardTileStyle';
import { dilatedTriangleCentroid, resolveEndpointCentre, tileCentre } from '../../src/render/endpointOpticalCentre';
import { resolveEndpointTile } from '../../src/render/endpointTiles';
import type { StartDirection } from '../../src/render/startDirection';
import { RasterContext, type Rgba } from './support/rasterContext';

/**
 * MAZER-VIS-036: the START arrow's optical centre (the centroid of its painted pixels, glyph and keyline together) sits
 * on the tile's painted-interior centre, within 0.5 device px, on every tile shape and in every direction the arrow can
 * point (an open side), at DPR 1 / 2 / 2.625 / 3 and the live tile sizes. Same method as endpointOpticalCentre.test.ts
 * (the real bake + marker draw rasterised to pixels). These fail on the previous bounding-box centring, which left the
 * painted centroid 2 to 6 device px BEHIND the tile centre (a triangle's centroid is a sixth of its length behind its
 * bounding-box centre) and ignored the rim-inset asymmetry of corner and junction tiles.
 */
const gridOf = (rows: string[]): boolean[][] => rows.map((row) => [...row].map((c) => c !== '#'));

const MAZE = gridOf([
  '###########',
  '#...#.....#',
  '##.##.###.#',
  '#...+...#.#',
  '#.###.#.#.#',
  '#.....#...#',
  '###########'
]);
const RING = gridOf(['.......', '.#####.', '.#####.', '.#####.', '.#####.', '.#####.', '.......']);
const BARS = gridOf(['.......', '#######', '#######', '#######', '#######', '#######', '.......']);
const STRIPES = gridOf(['.#####.', '.#####.', '.#####.', '.#####.', '.#####.', '.#####.', '.#####.']);

const TILE_SIZES = [9.95, 14.72, 15.6, 16.66, 25.44];
const DPRS = [1, 2, 2.625, 3];
const DIRECTIONS: readonly StartDirection[] = ['up', 'right', 'down', 'left'];

const rgbOf = (color: number): Rgba => [(color >> 16) & 255, (color >> 8) & 255, color & 255, 255];
const CHIP = rgbOf(boardMaterial.chip);
const same = (a: Rgba, b: Rgba): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
const near = (a: Rgba, b: Rgba): boolean => Math.abs(a[0] - b[0]) < 6 && Math.abs(a[1] - b[1]) < 6 && Math.abs(a[2] - b[2]) < 6;

const inputFor = (cells: boolean[][], tileSize: number, devicePixelRatio: number, start: BoardCell): BoardTileBakeInput => ({
  grid: cells, width: cells[0]!.length, height: cells.length, tileSize, devicePixelRatio, goal: start
});

const shapeKey = (t: ChipTileGeometry): string => (
  `${t.kind}|${(['u', 'd', 'l', 'r'] as const).filter((k) => t.open[k]).join('')}|${Object.values(t.concave).some(Boolean) ? 'concave' : ''}`
);
const shapes = (cells: boolean[][]): Map<string, BoardCell> => {
  const out = new Map<string, BoardCell>();
  for (const t of computeChipGeometry(inputFor(cells, 14.72, 2, { x: 0, y: 0 }))) {
    const key = shapeKey(t);
    if (!out.has(key)) out.set(key, { x: t.x, y: t.y });
  }
  return out;
};
const tileOf = (cells: boolean[][], cell: BoardCell, size = 14.72, dpr = 3): ChipTileGeometry => (
  computeChipTileAt(inputFor(cells, size, dpr, cell), cell)!
);
const OPEN_KEY = { up: 'u', down: 'd', left: 'l', right: 'r' } as const;
/** Every direction the arrow can really point on this tile: toward an open side. */
const openDirections = (t: ChipTileGeometry): StartDirection[] => DIRECTIONS.filter((d) => t.open[OPEN_KEY[d]]);
const rimOf = (t: ChipTileGeometry): number => Math.max(
  t.fill.left - t.left,
  t.left + t.width - (t.fill.left + t.fill.width),
  t.fill.top - t.top,
  t.top + t.height - (t.fill.top + t.fill.height)
);

interface Measured {
  centroid: { x: number; y: number };
  cell: { x: number; y: number };
  target: { x: number; y: number };
  interior: { x0: number; y0: number; x1: number; y1: number };
  /** Painted marker pixels that are NOT chip-fill pixels of the bake (they would be on the rim, the void or off-tile). */
  offFill: number;
  painted: number;
}

const memo = new Map<string, Measured>();
const measure = (cells: boolean[][], tileSize: number, dpr: number, cell: BoardCell, direction: StartDirection): Measured => {
  const key = `${cells.map((r) => r.map((c) => (c ? 1 : 0)).join('')).join('/')}|${tileSize}|${dpr}|${cell.x},${cell.y}|${direction}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const input = inputFor(cells, tileSize, dpr, cell);
  const layout = computeBoardTileLayout(input);
  const surface = new RasterContext(layout.pixelWidth, layout.pixelHeight);
  bakeBoardTiles(input, () => ({ canvas: surface, ctx: surface as unknown as TileBakeContext2D }));
  const base = surface.clone();
  const tile = { ...computeChipTileAt(input, cell)!, direction };
  const marked = base.clone();
  marked.paintStrokes = true;
  marked.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBoardMarkers(marked, {
    style: 'chip', tileSize, devicePixelRatio: dpr, originX: layout.originX, originY: layout.originY,
    start: cell, startTile: tile
  });
  let n = 0;
  let sx = 0;
  let sy = 0;
  let offFill = 0;
  for (let y = 0; y < marked.height; y += 1) {
    for (let x = 0; x < marked.width; x += 1) {
      if (!same(base.pixel(x, y), marked.pixel(x, y))) {
        n += 1; sx += x + 0.5; sy += y + 0.5;
        if (!near(base.pixel(x, y), CHIP)) offFill += 1;
      }
    }
  }
  const px = (v: number, origin: number): number => (origin + v) * dpr;
  const t = resolveEndpointCentre(tile);
  const x0 = Math.round(px(tile.left, layout.originX));
  const y0 = Math.round(px(tile.top, layout.originY));
  const x1 = Math.round(px(tile.left + tile.width, layout.originX)) - 1;
  const y1 = Math.round(px(tile.top + tile.height, layout.originY)) - 1;
  const interior = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (near(base.pixel(x, y), CHIP)) {
        interior.x0 = Math.min(interior.x0, x);
        interior.y0 = Math.min(interior.y0, y);
        interior.x1 = Math.max(interior.x1, x);
        interior.y1 = Math.max(interior.y1, y);
      }
    }
  }
  const result: Measured = {
    centroid: { x: sx / n, y: sy / n },
    cell: { x: px(tile.left + (tile.width / 2), layout.originX), y: px(tile.top + (tile.height / 2), layout.originY) },
    target: { x: px(t.x, layout.originX), y: px(t.y, layout.originY) },
    interior,
    offFill,
    painted: n
  };
  memo.set(key, result);
  return result;
};

describe('dilatedTriangleCentroid: the painted glyph centroid (pure)', () => {
  test('offset 0 is the plain centroid, in either winding', () => {
    expect(dilatedTriangleCentroid([0, 0], [0, 6], [9, 3], 0)).toEqual({ x: 3, y: 3 });
    const cw = dilatedTriangleCentroid([0, 6], [0, 0], [9, 3], 0);
    expect(cw.x).toBeCloseTo(3, 12);
    expect(cw.y).toBeCloseTo(3, 12);
  });

  test('matches a brute-force sample of the dilated triangle, in both windings and any orientation', () => {
    const tris: Array<[[number, number], [number, number], [number, number]]> = [
      [[0, -3.5], [0, 3.5], [6.6, 0]],
      [[0, 3.5], [0, -3.5], [6.6, 0]],
      [[1, 1], [8, 2], [3, 9]]
    ];
    for (const [a, b, c] of tris) {
      for (const d of [0.5, 1.3, 2.4]) {
        const inside = (x: number, y: number): boolean => {
          const s = (p: readonly number[], q: readonly number[]): number => ((q[0]! - p[0]!) * (y - p[1]!)) - ((q[1]! - p[1]!) * (x - p[0]!));
          const v = [s(a, b), s(b, c), s(c, a)];
          return v.every((e) => e >= 0) || v.every((e) => e <= 0);
        };
        const segDist = (p: readonly number[], q: readonly number[], x: number, y: number): number => {
          const dx = q[0]! - p[0]!;
          const dy = q[1]! - p[1]!;
          const t = Math.max(0, Math.min(1, (((x - p[0]!) * dx) + ((y - p[1]!) * dy)) / ((dx * dx) + (dy * dy))));
          return Math.hypot(x - (p[0]! + (t * dx)), y - (p[1]! + (t * dy)));
        };
        let n = 0;
        let sx = 0;
        let sy = 0;
        const step = 0.02;
        for (let y = -8; y <= 14; y += step) {
          for (let x = -8; x <= 14; x += step) {
            if (inside(x, y) || Math.min(segDist(a, b, x, y), segDist(b, c, x, y), segDist(c, a, x, y)) <= d) {
              n += 1; sx += x; sy += y;
            }
          }
        }
        const got = dilatedTriangleCentroid(a, b, c, d);
        expect(got.x, `x d=${d}`).toBeCloseTo(sx / n, 1);
        expect(got.y, `y d=${d}`).toBeCloseTo(sy / n, 1);
      }
    }
  });
});

describe('the start arrow geometry (pure)', () => {
  const straight = (): ChipTileGeometry => tileOf(MAZE, [...shapes(MAZE)].find(([k]) => k.startsWith('straight|lr'))![1]);

  test('size and shape are unchanged: the same triangle as before, only placed differently', () => {
    // 14.72 css px at DPR 3 (the live phone board): base and length pinned to what origin/main drew on this tile
    const play = resolveEndpointTile('start', { ...straight(), direction: 'right' }, 3).play!;
    expect(Math.hypot(play.bx - play.ax, play.by - play.ay)).toBeCloseTo(PINNED_BASE, 6);
    expect(play.cx - play.ax).toBeCloseTo(PINNED_LENGTH, 6);
    expect(play.stroke).toBeCloseTo(PINNED_STROKE, 6);
  });

  test('the arrow leans its apex forward: the base sits nearer the target than the apex (a triangle is heavy at its base)', () => {
    const t = straight();
    const centre = tileCentre(t);
    const play = resolveEndpointTile('start', { ...t, direction: 'right' }, 3).play!;
    expect(play.cx - centre.x).toBeGreaterThan(centre.x - play.ax);
    // and the frame is the target, not the old bounding-box centre
    const frame = resolveEndpointTile('start', { ...t, direction: 'right' }, 3).frame;
    expect(frame.cx).toBeCloseTo(resolveEndpointCentre(t).x, 9);
  });
});

const PLACEMENTS: Array<[string, boolean[][]]> = [
  ['maze (cap, straight, corner, junction, cross, concave)', MAZE],
  ['board corners are corner tiles (ring)', RING],
  ['board corners are caps opening sideways (bars)', BARS],
  ['board corners are caps opening up/down (stripes)', STRIPES]
];

describe.each(TILE_SIZES.flatMap((tile) => DPRS.map((dpr) => [tile, dpr] as const)))(
  'start arrow optical centre, raster: tile %f css px at DPR %f',
  (tileSize, dpr) => {
    test.each(PLACEMENTS)('%s: the painted arrow centroid is within 0.5 device px of the interior centre, in every direction', (_name, cells) => {
      for (const [key, cell] of shapes(cells)) {
        const open = openDirections(tileOf(cells, cell, tileSize, dpr));
        expect(open.length, key).toBeGreaterThan(0);
        for (const direction of open) {
          const m = measure(cells, tileSize, dpr, cell, direction);
          expect(Math.abs(m.centroid.x - m.target.x), `x, ${key} ${direction} @${cell.x},${cell.y}`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(m.centroid.y - m.target.y), `y, ${key} ${direction} @${cell.x},${cell.y}`).toBeLessThanOrEqual(0.5);
        }
      }
    });

    test('straight / cross: centroid on the cell centre; corner: on the interior centre read back from the bake', () => {
      for (const [key, cell] of shapes(MAZE)) {
        const t = tileOf(MAZE, cell, tileSize, dpr);
        for (const direction of openDirections(t)) {
          const m = measure(MAZE, tileSize, dpr, cell, direction);
          if (key.startsWith('straight') || key.startsWith('cross')) {
            expect(Math.abs(m.centroid.x - m.cell.x), `x ${key} ${direction}`).toBeLessThanOrEqual(0.5);
            expect(Math.abs(m.centroid.y - m.cell.y), `y ${key} ${direction}`).toBeLessThanOrEqual(0.5);
          }
          if (key.startsWith('corner')) {
            const bx = (m.interior.x0 + m.interior.x1 + 1) / 2;
            const by = (m.interior.y0 + m.interior.y1 + 1) / 2;
            expect(Math.abs(m.centroid.x - bx), `x ${key} ${direction} vs interior`).toBeLessThanOrEqual(0.5);
            expect(Math.abs(m.centroid.y - by), `y ${key} ${direction} vs interior`).toBeLessThanOrEqual(0.5);
          }
        }
      }
    });

    test('the arrow and its keyline stay on the chip fill: nothing painted on the rim, the void or off the tile', () => {
      for (const cells of [MAZE, RING, BARS, STRIPES]) {
        for (const [key, cell] of shapes(cells)) {
          for (const direction of openDirections(tileOf(cells, cell, tileSize, dpr))) {
            const m = measure(cells, tileSize, dpr, cell, direction);
            expect(m.painted, `${key} ${direction}`).toBeGreaterThan(0);
            expect(m.offFill, `${key} ${direction} @${cell.x},${cell.y}`).toBe(0);
          }
        }
      }
    });
  }
);

describe('the pure target shared with the star', () => {
  test('a corner target is half a rim toward the open sides', () => {
    for (const [key, cell] of shapes(MAZE)) {
      if (!key.startsWith('corner')) continue;
      const t = tileOf(MAZE, cell);
      const c = resolveEndpointCentre(t);
      expect(c.x - tileCentre(t).x, key).toBeCloseTo((t.open.r ? 1 : -1) * (rimOf(t) / 2), 6);
      expect(c.y - tileCentre(t).y, key).toBeCloseTo((t.open.d ? 1 : -1) * (rimOf(t) / 2), 6);
    }
  });
});

// Pinned from origin/main (566259c5) for the straight tile at 14.72 css px, DPR 3, direction right.
const PINNED_BASE = 5.780662150526126;
const PINNED_LENGTH = 5.4916290429998185;
const PINNED_STROKE = 1;
