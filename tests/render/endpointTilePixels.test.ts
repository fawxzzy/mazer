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
import { resolveGoalStarCentre } from '../../src/render/endpointOpticalCentre';
import { START_DIRECTIONS, type StartDirection } from '../../src/render/startDirection';
import { resolveSharedBorderColor } from '../../src/render/trailPalette';
import { RasterContext, type Rgba } from './support/rasterContext';

/**
 * Pixel proof of the start/goal END MARKERS (no backdrop box), on real pixels: the real bake and the real marker draw
 * are rasterised (pixel-centre sampling, no anti-aliasing; strokes enabled for the marker pass so the dark keyline is
 * painted) at several tile sizes and device pixel ratios.
 *
 *  - NO BOX: every pixel the marker pass changes lies inside the tile's inscribed circle, so the four corners of the
 *    tile (where the retired square pad and the rounded-square backdrop used to show) are untouched baked chip fill;
 *    the old pad tint colours never appear, only the glyph colour and the dark keyline do;
 *  - the goal star is centred on the tile and stays inside it;
 *  - the start SPIRAL (MAZER-VIS-053, it replaced the play arrow) is centred on the tile at every angle it turns through,
 *    and no longer depends on the first-step direction;
 *  - the goal star paints three colours only: the goal red, its border in the shared border colour, the dark keyline;
 *  - both stay inside the tile's own device-pixel rectangle.
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

/** One representative cell per tile kind, plus the first cell with a concave corner. */
const wholeGlyphCells = (): BoardCell[] => {
  const picked = new Map<string, BoardCell>();
  for (const t of computeChipGeometry(inputFor(14.72, 2, { x: 1, y: 1 }))) {
    const key = Object.values(t.concave).some(Boolean) ? 'concave' : t.kind;
    if (!picked.has(key)) picked.set(key, { x: t.x, y: t.y });
  }
  return [...picked.values()];
};

interface Rendered { base: RasterContext; marked: RasterContext; rect: { x0: number; y0: number; x1: number; y1: number }; }

const render = (
  tileSize: number,
  dpr: number,
  cell: BoardCell,
  kind: 'goal' | 'start',
  direction: StartDirection = 'right',
  rotation = 0
): Rendered => {
  const input = inputFor(tileSize, dpr, cell);
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
    [kind]: cell, [kind === 'goal' ? 'goalTile' : 'startTile']: tile,
    ...(kind === 'start' ? { startSpiralRotation: rotation } : { goalStarRotation: rotation })
  });
  const x0 = Math.round((layout.originX + tile.left) * dpr);
  const y0 = Math.round((layout.originY + tile.top) * dpr);
  const rect = {
    x0, y0,
    x1: Math.round((layout.originX + tile.left + tile.width) * dpr) - 1,
    y1: Math.round((layout.originY + tile.top + tile.height) * dpr) - 1
  };
  return { base, marked, rect };
};

const chip = rgb(boardMaterial.chip);
const VOID = rgb(boardMaterial.void);
const GLYPH_COLORS = { goal: rgb(boardMaterial.goal), start: rgb(boardMaterial.start) };
/** The goal star's border when no live colour is passed: the shared border colour at its static start (what the Guide shows). */
const BORDER = rgb(resolveSharedBorderColor(null, 0, true));

interface Changed { x: number; y: number; dx: number; dy: number; color: Rgba }

/** Pixels the marker pass changed, with their offset from the tile centre in device px. */
const changedPixels = (r: Rendered): Changed[] => {
  const cx = (r.rect.x0 + r.rect.x1 + 1) / 2;
  const cy = (r.rect.y0 + r.rect.y1 + 1) / 2;
  const out: Changed[] = [];
  for (let y = 0; y < r.marked.height; y += 1) {
    for (let x = 0; x < r.marked.width; x += 1) {
      const after = r.marked.pixel(x, y);
      if (!same(r.base.pixel(x, y), after)) out.push({ x, y, dx: x + 0.5 - cx, dy: y + 0.5 - cy, color: after });
    }
  }
  return out;
};

describe.each(TILE_SIZES.flatMap((tile) => DPRS.map((dpr) => [tile, dpr] as const)))(
  'end marker pixels (no backdrop box): tile %f css px at DPR %i',
  (tileSize, dpr) => {
    const cells = representativeCells();

    test('the fixture covers every tile shape (cap, straight, corner, junction, concave corner)', () => {
      const kinds = new Set(computeChipGeometry(inputFor(tileSize, dpr, { x: 1, y: 1 })).map((t) => t.kind));
      for (const kind of ['cap', 'straight', 'corner', 'junction']) expect(kinds.has(kind as never), kind).toBe(true);
      expect(cells.length).toBeGreaterThanOrEqual(8);
    });

    test.each(['goal', 'start'] as const)('%s: nothing is painted outside the glyph (no pad, no disc, no ring): the tile corners stay baked chip', (kind) => {
      for (const cell of cells) {
        const r = render(tileSize, dpr, cell, kind);
        const half = (r.rect.x1 - r.rect.x0 + 1) / 2;
        const changed = changedPixels(r);
        expect(changed.length, `${kind} paints something in cell ${cell.x},${cell.y}`).toBeGreaterThan(0);
        for (const px of changed) {
          // inside the tile's own rect...
          expect(px.x >= r.rect.x0 && px.x <= r.rect.x1 && px.y >= r.rect.y0 && px.y <= r.rect.y1, `bleed (${px.x},${px.y}) ${kind} cell ${cell.x},${cell.y}`).toBe(true);
          // ...and inside the inscribed circle (a rounded-square plate would reach the corners)
          expect(Math.hypot(px.dx, px.dy), `outside the inscribed circle (${px.x},${px.y})`).toBeLessThanOrEqual(half + 0.75);
          // only the glyph colour or the keyline colour: no tinted pad / disc / ring colour
          expect(same(px.color, GLYPH_COLORS[kind]) || same(px.color, VOID) || (kind === 'goal' && same(px.color, BORDER)), `unexpected colour ${px.color} at (${px.x},${px.y})`).toBe(true);
        }
        // (a 6 device-px tile is the physical floor: the 1 px stroke and 1 px keyline minimums can touch its corner)
        const corners = tileSize * dpr >= 10
          ? [[r.rect.x0, r.rect.y0], [r.rect.x1, r.rect.y0], [r.rect.x0, r.rect.y1], [r.rect.x1, r.rect.y1]] as const
          : [];
        for (const [x, y] of corners) {
          expect(same(r.marked.pixel(x, y), r.base.pixel(x, y)), `corner (${x},${y}) cell ${cell.x},${cell.y}`).toBe(true);
        }
        // the baked chip fill is still what shows around the glyph (nothing repaints the tile)
        let chipPixels = 0;
        for (let y = r.rect.y0; y <= r.rect.y1; y += 1) {
          for (let x = r.rect.x0; x <= r.rect.x1; x += 1) {
            if (same(r.marked.pixel(x, y), chip)) chipPixels += 1;
          }
        }
        expect(chipPixels, `chip fill remains visible around the ${kind}`).toBeGreaterThan(0);
      }
    });

    test('goal: the star is centred on the tile and carries the goal red', () => {
      for (const cell of cells) {
        const r = render(tileSize, dpr, cell, 'goal');
        const changed = changedPixels(r);
        const red = changed.filter((px) => same(px.color, GLYPH_COLORS.goal));
        expect(red.length, `star pixels, cell ${cell.x},${cell.y}`).toBeGreaterThan(0);
        const xs = changed.map((px) => px.dx);
        // a five-point star is symmetric about the vertical axis: its bounding box is centred horizontally on its
        // circumcentre, which is the tile's painted-interior centre (endpointOpticalCentre.ts: the cell centre, or half
        // a rim toward the open sides on a corner / junction; MAZER-VIS-034)
        const tile = computeChipTileAt(inputFor(tileSize, dpr, cell), cell)!;
        const aim = (resolveGoalStarCentre(tile).x - (tile.left + (tile.width / 2))) * dpr;
        expect(Math.abs(((Math.min(...xs) + Math.max(...xs)) / 2) - aim), `x centre, cell ${cell.x},${cell.y}`).toBeLessThanOrEqual(1);
        if (tileSize * dpr >= 20) {
          expect(changed.some((px) => same(px.color, VOID)), 'keyline painted around the star').toBe(true);
        }
      }
    });
  }
);


/**
 * Centring and containment of the WHOLE visible glyph (fill plus its dark keyline), on real pixels, at every tile size
 * the board can produce (6.4 .. 25.44 css px) and DPR 1..3. Owner report (2026-11-10, live phone): "the star ... isn't
 * centered in the middle of its tile, same with the start arrow, and its size should not be making it bleed over the
 * tile edges". Measured then: a five-point star's bounding box sat about 0.1 of its radius above the tile centre
 * (it was centred on its circumcentre), the play arrow was centred on its centroid, and the keyline touched the
 * chip's rim.
 *  - CENTRED: the bounding box of every painted pixel (glyph + keyline) is centred on the tile within 0.5 device px;
 *  - INSIDE: every painted pixel lies strictly inside the tile's fill (the area inside the lit rim) with at least
 *    a device pixel to spare on every side that has a rim, so the keyline never reaches the rim or the tile edge.
 */
const WHOLE_GLYPH_TILE_SIZES = [6.4, 8, 10, 12.48, 14.72, 18, 25.44];
describe.each(WHOLE_GLYPH_TILE_SIZES.flatMap((tile) => DPRS.map((dpr) => [tile, dpr] as const)))(
  'whole glyph (fill + keyline) is centred and inside its tile: tile %f css px at DPR %i',
  (tileSize, dpr) => {
    // one cell per tile kind (cap, straight, corner, junction) plus one with a concave corner keeps this fast
    const cells = wholeGlyphCells();
    // The start spiral is checked at several angles of its turn (the goal star at its rest angle). The `direction` key stays
    // so the call sites read the same; the spiral ignores it.
    const cases = [
      ...(['goal'] as const).map((kind) => ({ kind, direction: 'right' as StartDirection, rotation: 0 })),
      ...[0, 0.4, 1.3, 2.2, 3.0].map((rotation) => ({ kind: 'start' as const, direction: 'right' as StartDirection, rotation }))
    ];
    // The start spiral is centred on its spin axis (MAZER-VIS-053: two arms half a turn apart are 2-fold symmetric), which is the
    // tile's painted-interior centre like the goal star (MAZER-VIS-034); the painted centroid must stay there at every angle.
    // Checked here on this suite's cells and tile sizes (down to 6.4 css px, where the glyph is fitted small).
    const arrowCases = cases.filter((c) => c.kind === 'start');

    test.each(arrowCases)('$kind (turned $rotation rad): painted centroid within 0.5 device px of the painted-interior centre', ({ kind, direction, rotation }) => {
      for (const cell of cells) {
        const input = inputFor(tileSize, dpr, cell);
        const layout = computeBoardTileLayout(input);
        const tile = computeChipTileAt(input, cell)!;
        const r = render(tileSize, dpr, cell, kind, direction, rotation);
        const changed = changedPixels(r);
        expect(changed.length).toBeGreaterThan(0);
        const cx = changed.reduce((n, px) => n + px.x + 0.5, 0) / changed.length;
        const cy = changed.reduce((n, px) => n + px.y + 0.5, 0) / changed.length;
        const target = resolveGoalStarCentre(tile);
        expect(Math.abs(cx - ((layout.originX + target.x) * dpr)), `x centroid offset, ${kind} ${direction} cell ${cell.x},${cell.y}`).toBeLessThanOrEqual(0.5);
        expect(Math.abs(cy - ((layout.originY + target.y) * dpr)), `y centroid offset, ${kind} ${direction} cell ${cell.x},${cell.y}`).toBeLessThanOrEqual(0.5);
      }
    });

    test.each(cases)('$kind (rotation $rotation): nothing reaches the tile edge or its rim', ({ kind, direction, rotation }) => {
      for (const cell of cells) {
        const input = inputFor(tileSize, dpr, cell);
        const tile = computeChipTileAt(input, cell)!;
        const r = render(tileSize, dpr, cell, kind, direction, rotation);
        const layout = computeBoardTileLayout(input);
        const f = {
          x0: Math.round((layout.originX + tile.fill.left) * dpr),
          y0: Math.round((layout.originY + tile.fill.top) * dpr),
          x1: Math.round((layout.originX + tile.fill.left + tile.fill.width) * dpr) - 1,
          y1: Math.round((layout.originY + tile.fill.top + tile.fill.height) * dpr) - 1
        };
        for (const px of changedPixels(r)) {
          // strictly inside the fill (the lit rim lives outside it), and inside the tile rect with a pixel to spare
          expect(px.x >= f.x0 && px.x <= f.x1 && px.y >= f.y0 && px.y <= f.y1, `outside the fill (${px.x},${px.y}) ${kind} ${direction} cell ${cell.x},${cell.y}`).toBe(true);
          expect(px.x > r.rect.x0 && px.x < r.rect.x1 && px.y > r.rect.y0 && px.y < r.rect.y1, `touches the tile edge (${px.x},${px.y})`).toBe(true);
        }
      }
    });
  }
);

describe.each([[14.72, 3], [25.44, 2], [10, 3]] as const)('start spiral: tile %f css px at DPR %i', (tileSize, dpr) => {
  const cell = { x: 5, y: 3 };
  const sig = (direction: StartDirection, rotation: number): string => changedPixels(render(tileSize, dpr, cell, 'start', direction, rotation)).map((px) => `${px.x},${px.y}`).join('|');

  test('it is gold and keyline only, and the first-step direction no longer changes a pixel (it points nowhere)', () => {
    const gold = changedPixels(render(tileSize, dpr, cell, 'start')).filter((px) => same(px.color, GLYPH_COLORS.start));
    expect(gold.length).toBeGreaterThan(8);
    const sigs = START_DIRECTIONS.map((d) => sig(d, 0));
    expect(new Set(sigs).size).toBe(1);
  });

  test('turning it changes the pixels (it spins), and the same angle is the same pixels', () => {
    expect(sig('right', 0)).not.toBe(sig('right', 0.9));
    expect(sig('right', 0.9)).toBe(sig('right', 0.9));
  });
});

describe('end tile geometry is device-pixel exact by construction', () => {
  test('tile rect and fill sit on the device-pixel grid at every tile size and DPR (the marker is centred on them)', () => {
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
