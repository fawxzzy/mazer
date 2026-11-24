import { describe, expect, test } from 'vitest';
import {
  bakeBoardTiles,
  computeBoardTileLayout,
  computeChipTileAt,
  type BoardCell,
  type BoardTileBakeInput,
  type TileBakeContext2D
} from '../../src/render/boardTileBake';
import {
  BOARD_TILE_GEOMETRY,
  DEFAULT_BOARD_TILE_STYLE,
  boardMaterial,
  resolveBoardSwatchColors,
  resolveBoardTileStyle
} from '../../src/render/boardTileStyle';
import { getContrastRatio, STARLIT_BEVEL_TILE } from '../../src/render/palette';
import { BLEED_GATE_FLOOR, BLEED_GATE_PLATE } from '../../src/render/bleedGateTileLook';
import { braidedMazeGrid, createRecordingSurface, inputFor as fixtureInput } from './support/boardTileFixtures';
import { RasterContext, type Rgba } from './support/rasterContext';

/**
 * MAZER-VIS-064: board tile set H "Starlit Bevel" (owner pick 2026-11-19) is the default bake. These pin the look the
 * owner picked on the options page, on real pixels (the real bake rasterised by the test rasteriser):
 *  - a closed top/left edge carries the highlight band, a closed bottom/right edge the shade band, the face keeps the floor;
 *  - bands stay inside the rounded faces (clip) and never land on gate tiles;
 *  - a gate tile is the dark gate face inside a shade ring;
 *  - wall specks are deterministic (cell hash, about one wall cell in five, capped);
 *  - the bevel stays at least one whole device pixel at 390x844@3 and 412x915@2.625 tile sizes;
 *  - Chip stays one switch away (`?tileStyle=chip`) and bakes its own, different look.
 */
const ROWS = [
  '#########',
  '#.......#',
  '#.#####.#',
  '#.......#',
  '#########'
];
const GRID = ROWS.map((row) => [...row].map((c) => c !== '#'));

const rgb = (color: number): Rgba => [(color >> 16) & 255, (color >> 8) & 255, color & 255, 255];
const same = (a: Rgba, b: Rgba): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

const input = (tileSize: number, dpr: number, extra: Partial<BoardTileBakeInput> = {}): BoardTileBakeInput => ({
  grid: GRID, width: GRID[0]!.length, height: GRID.length, tileSize, devicePixelRatio: dpr, goal: { x: 7, y: 3 }, ...extra
});

const raster = (i: BoardTileBakeInput) => {
  const layout = computeBoardTileLayout(i);
  const surface = new RasterContext(layout.pixelWidth, layout.pixelHeight);
  bakeBoardTiles(i, () => ({ canvas: surface, ctx: surface as unknown as TileBakeContext2D }));
  return { surface, layout };
};

/** Device pixel at a board-local css point. */
const at = (r: ReturnType<typeof raster>, i: BoardTileBakeInput, x: number, y: number): Rgba => (
  r.surface.pixel(Math.floor((r.layout.originX + x) * i.devicePixelRatio), Math.floor((r.layout.originY + y) * i.devicePixelRatio))
);

// tile sizes the shipped board uses at 390x844@3 and 412x915@2.625 (level 1 corridor through level 120 dense)
const CASES: Array<[number, number]> = [[14.72, 3], [25.44, 3], [9.95, 3], [15.6, 2.625], [16.66, 2.625], [9.95, 2.625]];

describe('Starlit Bevel is the default bake', () => {
  test('default style is starlit and its bake differs from Chip', () => {
    expect(DEFAULT_BOARD_TILE_STYLE).toBe('starlit');
    const starlit = createRecordingSurface();
    const chip = createRecordingSurface();
    const s = bakeBoardTiles(fixtureInput(braidedMazeGrid()), starlit.factory);
    const c = bakeBoardTiles(fixtureInput(braidedMazeGrid(), { style: 'chip' }), chip.factory);
    expect(s.style).toBe('starlit');
    expect(c.style).toBe('chip');
    expect(s.hash).not.toBe(c.hash);
    expect(starlit.rec.count('clip(')).toBe(1);
    expect(chip.rec.count('clip(')).toBe(0);
    expect(starlit.rec.count('save(')).toBe(starlit.rec.count('restore('));
    // the chip floor colour never paints a Starlit tile surface (docks keep their chip look: they are not tiles)
    const log = starlit.rec.log;
    expect(log).toContain(`set fillStyle=rgb(${rgb(STARLIT_BEVEL_TILE.floor).slice(0, 3).join(',')})`);
  });
});

describe.each(CASES)('Starlit pixels: tile %f css px at DPR %f', (tileSize, dpr) => {
  const i = input(tileSize, dpr);
  const r = raster(i);
  const band = resolveBoardTileStyle('starlit', tileSize, dpr).starlit.bevel;
  // (3,1): a straight in the top corridor, closed top and bottom, open left and right
  const tile = computeChipTileAt(i, { x: 3, y: 1 })!;
  const f = tile.fill;
  const cx = f.left + (f.width / 2);

  test('the bevel band is at least one whole device pixel', () => {
    expect(band * dpr).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(Math.round(band * dpr * 1e6) / 1e6)).toBe(true);
  });

  test('closed top edge: highlight band; closed bottom edge: shade band; face: the floor', () => {
    expect(same(at(r, i, cx, f.top + (band / 2)), rgb(STARLIT_BEVEL_TILE.highlight))).toBe(true);
    expect(same(at(r, i, cx, f.top + f.height - (band / 2)), rgb(STARLIT_BEVEL_TILE.shade))).toBe(true);
    expect(same(at(r, i, cx, f.top + (f.height / 2)), rgb(STARLIT_BEVEL_TILE.floor))).toBe(true);
  });

  test('open sides get no band: the face runs into the neighbour', () => {
    // (3,1) is open left and right: the face colour holds right up to the tile edge at mid height
    expect(same(at(r, i, tile.left + 0.01, f.top + (f.height / 2)), rgb(STARLIT_BEVEL_TILE.floor))).toBe(true);
    expect(same(at(r, i, tile.left + tile.width - 0.01, f.top + (f.height / 2)), rgb(STARLIT_BEVEL_TILE.floor))).toBe(true);
  });

  test('the rim is crisp H rim above the band (no glow, no chip rim)', () => {
    expect(same(at(r, i, cx, (tile.top + f.top) / 2), rgb(STARLIT_BEVEL_TILE.rim))).toBe(true);
  });
});

describe('Starlit gate tiles', () => {
  const gate: BoardCell & { lit?: boolean } = { x: 4, y: 3 };
  test.each(CASES)('tile %f at DPR %f: a lit gate is a dark gate face inside a shade ring, no floor bevel on the gate', (tileSize, dpr) => {
    const i = input(tileSize, dpr, { gates: [{ ...gate, lit: true }] });
    const r = raster(i);
    const t = computeChipTileAt(i, gate)!;
    const f = t.fill;
    const band = resolveBoardTileStyle('starlit', tileSize, dpr).starlit.bevel;
    expect(same(at(r, i, f.left + (f.width / 2), f.top + (f.height / 2)), rgb(STARLIT_BEVEL_TILE.gate))).toBe(true);
    // the top edge of a gate tile is the shade ring, never the floor highlight
    expect(same(at(r, i, f.left + (f.width / 2), f.top + (band / 2)), rgb(STARLIT_BEVEL_TILE.shade))).toBe(true);
  });
});

describe('Starlit sleeping gate tile (MAZER-VIS-067 Lit cap)', () => {
  const gate: BoardCell & { lit?: boolean } = { x: 4, y: 3 };
  test.each(CASES)('tile %f at DPR %f: the whole tile is the pale plate, rim and bevel included', (tileSize, dpr) => {
    const i = input(tileSize, dpr, { gates: [gate] });
    const r = raster(i);
    const t = computeChipTileAt(i, gate)!;
    const plate = rgb(BLEED_GATE_PLATE);
    // centre, and one device pixel inside the tile edge at the middle of each side (the rim zone)
    const step = 1 / dpr;
    expect(same(at(r, i, t.left + (t.width / 2), t.top + (t.height / 2)), plate)).toBe(true);
    expect(same(at(r, i, t.left + (t.width / 2), t.top + (step / 2)), plate)).toBe(true);
    expect(same(at(r, i, t.left + (t.width / 2), t.top + t.height - (step / 2)), plate)).toBe(true);
    expect(same(at(r, i, t.left + (step / 2), t.top + (t.height / 2)), plate)).toBe(true);
    expect(same(at(r, i, t.left + t.width - (step / 2), t.top + (t.height / 2)), plate)).toBe(true);
  });

  test('a sleeping gate is much lighter than the floor around it; a lit gate is darker', () => {
    expect(getContrastRatio(BLEED_GATE_PLATE, STARLIT_BEVEL_TILE.floor)).toBeGreaterThan(3);
    expect(getContrastRatio(BLEED_GATE_FLOOR, STARLIT_BEVEL_TILE.floor)).toBeGreaterThan(2);
  });
});

describe('Starlit wall specks', () => {
  test('deterministic: one per hashed wall cell, capped, rim colour at the speck alpha', () => {
    const grid = braidedMazeGrid();
    const a = createRecordingSurface();
    const b = createRecordingSurface();
    bakeBoardTiles(fixtureInput(grid), a.factory);
    bakeBoardTiles(fixtureInput(grid), b.factory);
    expect(a.rec.log).toEqual(b.rec.log);
    const g = BOARD_TILE_GEOMETRY.starlit;
    let expected = 0;
    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < grid[0]!.length; x += 1) {
        if (grid[y]![x]) continue;
        if (((Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0) % g.speckEvery === 0) expected += 1;
      }
    }
    expected = Math.min(expected, g.speckCap);
    const rim = rgb(STARLIT_BEVEL_TILE.rim);
    const start = a.rec.log.indexOf(`set fillStyle=rgba(${rim[0]},${rim[1]},${rim[2]},${g.speckAlpha})`);
    expect(start).toBeGreaterThan(-1);
    const end = a.rec.log.indexOf('fill()', start);
    expect(a.rec.log.slice(start, end).filter((e) => e.startsWith('rect('))).toHaveLength(expected);
    expect(expected).toBeGreaterThan(0);
  });
});

describe('Starlit contrast (real numbers, WCAG)', () => {
  const H = STARLIT_BEVEL_TILE;
  test('floor vs wall 4.18, gate vs floor 2.71, gate vs wall 1.54 (the options-page numbers)', () => {
    expect(getContrastRatio(H.floor, boardMaterial.void)).toBeCloseTo(4.18, 2);
    expect(getContrastRatio(H.gate, H.floor)).toBeCloseTo(2.71, 2);
    expect(getContrastRatio(H.gate, boardMaterial.void)).toBeCloseTo(1.54, 2);
  });

  test('the bevel bands read against the face: highlight and shade both at least 2:1 against the floor', () => {
    expect(getContrastRatio(H.highlight, H.floor)).toBeGreaterThanOrEqual(2);
    expect(getContrastRatio(H.shade, H.floor)).toBeGreaterThanOrEqual(2);
  });

  test('the Guide swatch uses the Starlit tile colours by default and Chip/Trace for their switches', () => {
    expect(resolveBoardSwatchColors('starlit')).toEqual({ rim: H.rim, fill: H.floor });
    expect(resolveBoardSwatchColors('chip')).toEqual({ rim: boardMaterial.rim, fill: boardMaterial.chip });
    expect(resolveBoardSwatchColors('trace')).toEqual({ rim: boardMaterial.channelBorder, fill: boardMaterial.channel });
  });
});
