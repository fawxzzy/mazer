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
import {
  resolveGoalStarCentre,
  STAR_CIRCUMCENTRE_BELOW_BOX_CENTRE,
  tileCentre
} from '../../src/render/endpointOpticalCentre';
import { resolveEndpointTile } from '../../src/render/endpointTiles';
import { RasterContext, type Rgba } from './support/rasterContext';

/**
 * MAZER-VIS-034: the goal star's OPTICAL centre (its centre of mass, the circumcentre of the five points) sits on the
 * tile's painted-interior centre, within 0.5 device px, on every tile shape (straight, edge, corner, dead end,
 * junction, cross), at DPR 1 / 2 / 2.625 / 3, on odd and even device tile sizes and at the two frozen board sizes' tile
 * sizes. Measured on the real bake + marker draw rasterised to pixels (the centroid of every pixel the marker pass
 * painted, glyph and keyline together). These tests fail on the previous bounding-box centring, which left the
 * centroid 1.1 to 1.9 device px below the tile centre, and ignored the rim-inset asymmetry of corner tiles.
 */
const gridOf = (rows: string[]): boolean[][] => rows.map((row) => [...row].map((c) => c !== '#'));

/** A maze with caps, straights, corners, junctions, a cross and concave corners. */
const MAZE = gridOf([
  '###########',
  '#...#.....#',
  '##.##.###.#',
  '#...+...#.#',
  '#.###.#.#.#',
  '#.....#...#',
  '###########'
]);
/** Perimeter ring: the four BOARD CORNERS are corner tiles, the four edges are straights. */
const RING = gridOf([
  '.......',
  '.#####.',
  '.#####.',
  '.#####.',
  '.#####.',
  '.#####.',
  '.......'
]);
/** Two bars on the top and bottom edge: the four BOARD CORNERS are dead-end caps (open sideways only). */
const BARS = gridOf([
  '.......',
  '#######',
  '#######',
  '#######',
  '#######',
  '#######',
  '.......'
]);
/** Two stripes on the left and right edge: the board corners are caps opening up / down. */
const STRIPES = gridOf([
  '.#####.',
  '.#####.',
  '.#####.',
  '.#####.',
  '.#####.',
  '.#####.',
  '.#####.'
]);

/** Tile sizes: the live phone board (25x51 on 390x844 -> 14.72), odd/even device sizes, and the desktop board's. */
const TILE_SIZES = [9.95, 14.72, 15.6, 16.66, 25.44];
const DPRS = [1, 2, 2.625, 3];

const rgbOf = (color: number): Rgba => [(color >> 16) & 255, (color >> 8) & 255, color & 255, 255];
const GOAL = rgbOf(boardMaterial.goal);
const CHIP = rgbOf(boardMaterial.chip);
const same = (a: Rgba, b: Rgba): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
const near = (a: Rgba, b: Rgba): boolean => Math.abs(a[0] - b[0]) < 6 && Math.abs(a[1] - b[1]) < 6 && Math.abs(a[2] - b[2]) < 6;

const inputFor = (cells: boolean[][], tileSize: number, devicePixelRatio: number, goal: BoardCell): BoardTileBakeInput => ({
  grid: cells, width: cells[0]!.length, height: cells.length, tileSize, devicePixelRatio, goal
});

const shapeKey = (t: ChipTileGeometry): string => (
  `${t.kind}|${(['u', 'd', 'l', 'r'] as const).filter((k) => t.open[k]).join('')}|${Object.values(t.concave).some(Boolean) ? 'concave' : ''}`
);

/** One cell per distinct (kind, open sides, concave) in a grid. */
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

/** The rim width of a tile: the inset of its fill on any closed side. */
const rimOf = (t: ChipTileGeometry): number => Math.max(
  t.fill.left - t.left,
  t.left + t.width - (t.fill.left + t.fill.width),
  t.fill.top - t.top,
  t.top + t.height - (t.fill.top + t.fill.height)
);

interface Measured {
  /** Centroid of every pixel the marker pass painted (glyph + keyline), device px, bake-bitmap space. */
  centroid: { x: number; y: number };
  cell: { x: number; y: number };
  target: { x: number; y: number };
  /** Bounding box of the tile's chip-fill pixels read back from the bake. */
  interior: { x0: number; y0: number; x1: number; y1: number };
}

const memo = new Map<string, Measured>();
const measure = (cells: boolean[][], tileSize: number, dpr: number, cell: BoardCell): Measured => {
  const key = `${cells.map((r) => r.map((c) => (c ? 1 : 0)).join('')).join('/')}|${tileSize}|${dpr}|${cell.x},${cell.y}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const input = inputFor(cells, tileSize, dpr, cell);
  const layout = computeBoardTileLayout(input);
  const surface = new RasterContext(layout.pixelWidth, layout.pixelHeight);
  bakeBoardTiles(input, () => ({ canvas: surface, ctx: surface as unknown as TileBakeContext2D }));
  const base = surface.clone();
  const tile = computeChipTileAt(input, cell)!;
  const marked = base.clone();
  marked.paintStrokes = true;
  marked.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBoardMarkers(marked, {
    style: 'chip', tileSize, devicePixelRatio: dpr, originX: layout.originX, originY: layout.originY,
    goal: cell, goalTile: tile
  });
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < marked.height; y += 1) {
    for (let x = 0; x < marked.width; x += 1) {
      if (!same(base.pixel(x, y), marked.pixel(x, y))) {
        n += 1; sx += x + 0.5; sy += y + 0.5;
      }
    }
  }
  const px = (v: number, origin: number): number => (origin + v) * dpr;
  const t = resolveGoalStarCentre(tile);
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
    interior
  };
  memo.set(key, result);
  return result;
};

describe('resolveGoalStarCentre: the painted-interior centre (pure)', () => {
  test('a straight tile and a cross: exactly the cell centre', () => {
    for (const [key, cell] of shapes(MAZE)) {
      if (!key.startsWith('straight') && !key.startsWith('cross')) continue;
      const t = tileOf(MAZE, cell);
      expect(resolveGoalStarCentre(t), key).toEqual(tileCentre(t));
    }
  });

  test('a dead end keeps the centre of its round bulb: the cell centre, NOT pulled toward the opening', () => {
    let seen = 0;
    for (const [key, cell] of shapes(MAZE)) {
      if (!key.startsWith('cap')) continue;
      seen += 1;
      const t = tileOf(MAZE, cell);
      const c = resolveGoalStarCentre(t);
      expect(c.x, key).toBeCloseTo(tileCentre(t).x, 6);
      expect(c.y, key).toBeCloseTo(tileCentre(t).y, 6);
    }
    expect(seen).toBeGreaterThan(0);
  });

  test('a corner moves half a rim toward its open sides, on both axes', () => {
    let seen = 0;
    for (const [key, cell] of shapes(MAZE)) {
      if (!key.startsWith('corner')) continue;
      seen += 1;
      const t = tileOf(MAZE, cell);
      const c = resolveGoalStarCentre(t);
      const centre = tileCentre(t);
      const rim = rimOf(t);
      expect(rim, 'rim width').toBeGreaterThan(0);
      expect(c.x - centre.x, `${key} x`).toBeCloseTo((t.open.r ? 1 : -1) * (rim / 2), 6);
      expect(c.y - centre.y, `${key} y`).toBeCloseTo((t.open.d ? 1 : -1) * (rim / 2), 6);
    }
    expect(seen).toBeGreaterThan(0);
  });

  test('a junction moves half a rim toward its open side across its one closed side only', () => {
    let seen = 0;
    for (const [key, cell] of shapes(MAZE)) {
      if (!key.startsWith('junction')) continue;
      seen += 1;
      const t = tileOf(MAZE, cell);
      const c = resolveGoalStarCentre(t);
      const centre = tileCentre(t);
      const rim = rimOf(t);
      if (!t.open.u || !t.open.d) {
        expect(c.x, key).toBeCloseTo(centre.x, 6);
        expect(Math.abs(c.y - centre.y), key).toBeCloseTo(rim / 2, 6);
      } else {
        expect(c.y, key).toBeCloseTo(centre.y, 6);
        expect(Math.abs(c.x - centre.x), key).toBeCloseTo(rim / 2, 6);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  test('the target never moves TOWARD a lit rim (the star keeps at least its old clearance)', () => {
    for (const cells of [MAZE, RING, BARS, STRIPES]) {
      for (const size of TILE_SIZES) {
        for (const dpr of DPRS) {
          for (const cell of shapes(cells).values()) {
            const t = tileOf(cells, cell, size, dpr);
            const c = resolveGoalStarCentre(t);
            const centre = tileCentre(t);
            if (!t.open.l) expect(c.x).toBeGreaterThanOrEqual(centre.x - 1e-9);
            if (!t.open.r) expect(c.x).toBeLessThanOrEqual(centre.x + 1e-9);
            if (!t.open.u) expect(c.y).toBeGreaterThanOrEqual(centre.y - 1e-9);
            if (!t.open.d) expect(c.y).toBeLessThanOrEqual(centre.y + 1e-9);
          }
        }
      }
    }
  });

  test('the star is drawn on its circumcentre: the frame is the target, not a bounding-box shift', () => {
    const t = tileOf(MAZE, [...shapes(MAZE)].find(([k]) => k.startsWith('corner|dr'))![1]);
    const spec = resolveEndpointTile('goal', t, 3);
    const c = resolveGoalStarCentre(t);
    expect(spec.frame.cx).toBeCloseTo(c.x, 9);
    expect(spec.frame.cy).toBeCloseTo(c.y, 9);
    // 0.0955 of the outer radius: what the old bounding-box centring moved the circumcentre by
    expect(STAR_CIRCUMCENTRE_BELOW_BOX_CENTRE).toBeCloseTo(0.0955, 4);
  });

  test('the star keeps its size: identical to the cell-centre fit it had before (pinned)', () => {
    // 14.72 css px at DPR 3 (the live phone board). 4.1592678... is the outer radius origin/main draws on this tile (a
    // 744-tile old-vs-new comparison at DPR 1/2/2.625/3 and tile sizes 6.4..40 found every outer radius identical).
    const t = tileOf(MAZE, [...shapes(MAZE)].find(([k]) => k.startsWith('corner|dr'))![1]);
    expect(resolveEndpointTile('goal', t, 3).star!.outer).toBeCloseTo(4.15926783, 6);
    const straight = tileOf(MAZE, [...shapes(MAZE)].find(([k]) => k.startsWith('straight'))![1]);
    expect(resolveEndpointTile('goal', straight, 3).star!.outer).toBeCloseTo(4.15926783, 1);
  });
});

const PLACEMENTS: Array<[string, boolean[][]]> = [
  ['maze (cap, straight, corner, junction, cross, concave)', MAZE],
  ['board corners are corner tiles (ring)', RING],
  ['board corners are caps opening sideways (bars)', BARS],
  ['board corners are caps opening up/down (stripes)', STRIPES]
];

describe.each(TILE_SIZES.flatMap((tile) => DPRS.map((dpr) => [tile, dpr] as const)))(
  'goal star optical centre, raster: tile %f css px at DPR %f',
  (tileSize, dpr) => {
    test.each(PLACEMENTS)('%s: the painted star centroid is within 0.5 device px of the interior centre', (_name, cells) => {
      for (const [key, cell] of shapes(cells)) {
        const m = measure(cells, tileSize, dpr, cell);
        expect(Math.abs(m.centroid.x - m.target.x), `x, ${key} @${cell.x},${cell.y}`).toBeLessThanOrEqual(0.5);
        expect(Math.abs(m.centroid.y - m.target.y), `y, ${key} @${cell.x},${cell.y}`).toBeLessThanOrEqual(0.5);
      }
    });

    test('straight / cross: centroid on the cell centre; corner: on the interior bounding-box centre read back from the bake', () => {
      for (const [key, cell] of shapes(MAZE)) {
        const m = measure(MAZE, tileSize, dpr, cell);
        if (key.startsWith('straight') || key.startsWith('cross')) {
          expect(Math.abs(m.centroid.x - m.cell.x), `x ${key}`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(m.centroid.y - m.cell.y), `y ${key}`).toBeLessThanOrEqual(0.5);
        }
        if (key.startsWith('corner')) {
          // the painted interior of a corner tile, as pixels: the fill runs to the tile edge on the open sides only
          const bx = (m.interior.x0 + m.interior.x1 + 1) / 2;
          const by = (m.interior.y0 + m.interior.y1 + 1) / 2;
          expect(Math.abs(m.centroid.x - bx), `x ${key} vs interior`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(m.centroid.y - by), `y ${key} vs interior`).toBeLessThanOrEqual(0.5);
        }
      }
    });
  }
);
