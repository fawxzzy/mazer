import { describe, expect, test } from 'vitest';
import {
  bakeBoardTiles,
  computeBoardTileLayout,
  computeChipGeometry,
  computeChipTileAt,
  drawBoardMarkers,
  type BoardCell,
  type BoardTileBakeInput,
  type TileBakeContext2D
} from '../../src/render/boardTileBake';
import { boardMaterial } from '../../src/render/boardTileStyle';
import { resolveEndpointPadColor } from '../../src/render/endpointTiles';
import { RasterContext, type Rgba } from './support/rasterContext';

/**
 * Pixel alignment of the start/goal END TILES, proven on real pixels: the real bake and the real marker draw are
 * rasterised (fill only, pixel-centre sampling, no anti-aliasing) at several tile sizes and device pixel ratios,
 * and the end tile's pad is compared to the baked tile under it.
 *
 *  - the pad repaints EXACTLY the pixels of that tile's baked chip fill: no pixel outside it (bleed), no chip pixel
 *    left showing inside it (gap), no off-by-one at any edge, for caps, straights, corners, concave corners and junctions;
 *  - the pad stays inside the tile's own device-pixel rectangle;
 *  - the badge's circle spans the whole tile (tangent to all four tile edges, within one device pixel of rounding)
 *    and never leaves the tile.
 */
const ROWS = [
  '###########',
  '#...#.....#',
  '##.##.###.#',
  '#...+...#.#',
  '#.###.#.#.#',
  '#.....#...#',
  '###########'
];
const GRID = ROWS.map((row) => [...row].map((c) => c !== '#'));

const TILE_SIZES = [6.4, 10, 14.72, 25.44];
const DPRS = [1, 2, 3];

const rgb = (color: number): Rgba => [(color >> 16) & 255, (color >> 8) & 255, color & 255, 255];
const same = (a: Rgba, b: Rgba): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

const inputFor = (tileSize: number, devicePixelRatio: number, goal: BoardCell): BoardTileBakeInput => ({
  grid: GRID, width: GRID[0]!.length, height: GRID.length, tileSize, devicePixelRatio, goal
});

/** One representative cell per distinct (kind, open sides, concave corners) so every tile shape is covered. */
const representativeCells = (): BoardCell[] => {
  const seen = new Map<string, BoardCell>();
  for (const t of computeChipGeometry(inputFor(14.72, 2, { x: 1, y: 1 }))) {
    const key = `${t.kind}|${t.open.u}${t.open.d}${t.open.l}${t.open.r}|${Object.values(t.concave).join('')}`;
    if (!seen.has(key)) seen.set(key, { x: t.x, y: t.y });
  }
  return [...seen.values()];
};

interface Rendered { base: RasterContext; withPad: RasterContext; withBadge: RasterContext; rect: { x0: number; y0: number; x1: number; y1: number }; }

const render = (tileSize: number, dpr: number, cell: BoardCell): Rendered => {
  const input = inputFor(tileSize, dpr, cell);
  const layout = computeBoardTileLayout(input);
  const surface = new RasterContext(layout.pixelWidth, layout.pixelHeight);
  bakeBoardTiles(input, () => ({ canvas: surface, ctx: surface as unknown as TileBakeContext2D }));
  const base = surface.clone();
  const tile = computeChipTileAt(input, cell)!;
  const draw = (target: RasterContext, endpointLayer: 'pad' | 'badge'): void => {
    target.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBoardMarkers(target, {
      style: 'chip', tileSize, devicePixelRatio: dpr, originX: layout.originX, originY: layout.originY,
      goal: cell, goalTile: tile, endpointLayer
    });
  };
  const withPad = base.clone();
  draw(withPad, 'pad');
  const withBadge = withPad.clone();
  draw(withBadge, 'badge');
  const x0 = Math.round((layout.originX + tile.left) * dpr);
  const y0 = Math.round((layout.originY + tile.top) * dpr);
  const rect = {
    x0, y0,
    x1: Math.round((layout.originX + tile.left + tile.width) * dpr) - 1,
    y1: Math.round((layout.originY + tile.top + tile.height) * dpr) - 1
  };
  return { base, withPad, withBadge, rect };
};

const chip = rgb(boardMaterial.chip);

describe.each(TILE_SIZES.flatMap((tile) => DPRS.map((dpr) => [tile, dpr] as const)))(
  'end tile pixel alignment: tile %f css px at DPR %i',
  (tileSize, dpr) => {
    const cells = representativeCells();

    test('the fixture covers every tile shape (cap, straight, corner, junction, concave corner)', () => {
      const kinds = new Set(computeChipGeometry(inputFor(tileSize, dpr, { x: 1, y: 1 })).map((t) => t.kind));
      for (const kind of ['cap', 'straight', 'corner', 'junction']) expect(kinds.has(kind as never), kind).toBe(true);
      expect(cells.length).toBeGreaterThanOrEqual(8);
    });

    test('the pad repaints exactly the baked chip fill of its tile: no bleed outside it, no gap inside it', () => {
      for (const cell of cells) {
        const { base, withPad, rect } = render(tileSize, dpr, cell);
        const pad = resolveEndpointPadColor('goal');
        let changed = 0;
        let chipPixels = 0;
        for (let y = rect.y0 - 3; y <= rect.y1 + 3; y += 1) {
          for (let x = rect.x0 - 3; x <= rect.x1 + 3; x += 1) {
            if (x < 0 || y < 0 || x >= base.width || y >= base.height) continue;
            const inside = x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
            const before = base.pixel(x, y);
            const after = withPad.pixel(x, y);
            const moved = !same(before, after);
            if (moved) changed += 1;
            if (!inside) {
              expect(moved, `bleed at (${x},${y}) outside the tile of cell ${cell.x},${cell.y}`).toBe(false);
              continue;
            }
            if (same(before, chip)) {
              chipPixels += 1;
              expect(same(after, rgb(pad)), `gap at (${x},${y}) cell ${cell.x},${cell.y}`).toBe(true);
            } else {
              expect(moved, `off-fill pixel (${x},${y}) changed in cell ${cell.x},${cell.y}`).toBe(false);
            }
          }
        }
        expect(chipPixels, `cell ${cell.x},${cell.y} has chip fill`).toBeGreaterThan(0);
        expect(changed).toBe(chipPixels);
      }
    });

    test('the badge circle spans the whole tile and stays inside it (tangent to all four edges)', () => {
      for (const cell of cells) {
        const { withPad, withBadge, rect } = render(tileSize, dpr, cell);
        const rectW = rect.x1 - rect.x0 + 1;
        const rectH = rect.y1 - rect.y0 + 1;
        let minX = Infinity; let minY = Infinity; let maxX = -1; let maxY = -1;
        const dark = rgb(boardMaterial.void);
        for (let y = 0; y < withBadge.height; y += 1) {
          for (let x = 0; x < withBadge.width; x += 1) {
            const a = withPad.pixel(x, y);
            const b = withBadge.pixel(x, y);
            if (same(a, b)) continue;
            // anything the badge pass changed lies inside the tile rect
            expect(x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1, `badge bleed (${x},${y}) cell ${cell.x},${cell.y}`).toBe(true);
            if (same(b, dark)) {
              minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            }
          }
        }
        const diameter = Math.min(rectW, rectH);
        expect(maxX - minX + 1, `badge width, cell ${cell.x},${cell.y}`).toBeGreaterThanOrEqual(diameter - 1);
        expect(maxX - minX + 1).toBeLessThanOrEqual(diameter);
        expect(maxY - minY + 1).toBeGreaterThanOrEqual(diameter - 1);
        expect(maxY - minY + 1).toBeLessThanOrEqual(diameter);
        // centred on the tile
        expect(Math.abs(((minX + maxX) / 2) - ((rect.x0 + rect.x1) / 2))).toBeLessThanOrEqual(0.5);
        expect(Math.abs(((minY + maxY) / 2) - ((rect.y0 + rect.y1) / 2))).toBeLessThanOrEqual(0.5);
      }
    });
  }
);

describe('end tile geometry is device-pixel exact by construction', () => {
  test('pad rect, radii and badge centre sit on the device-pixel grid at every tile size and DPR', () => {
    for (const tileSize of [6.4, 9.95, 10.77, 12.48, 14.72, 16.66, 25.44, 40]) {
      for (const dpr of DPRS) {
        for (const cell of representativeCells()) {
          const t = computeChipTileAt(inputFor(tileSize, dpr, cell), cell)!;
          for (const v of [t.left, t.top, t.width, t.height, t.fill.left, t.fill.top, t.fill.width, t.fill.height]) {
            expect(Math.abs((v * dpr) - Math.round(v * dpr)), `T ${tileSize} dpr ${dpr}`).toBeLessThan(1e-6);
          }
        }
      }
    }
  });

  test('computeChipTileAt agrees with computeChipGeometry for every floor cell, and is null for walls', () => {
    const input = inputFor(14.72, 3, { x: 1, y: 1 });
    for (const t of computeChipGeometry(input)) {
      expect(computeChipTileAt(input, { x: t.x, y: t.y })).toEqual(t);
    }
    expect(computeChipTileAt(input, { x: 0, y: 0 })).toBeNull();
    expect(computeChipTileAt(input, { x: 99, y: 99 })).toBeNull();
  });
});
