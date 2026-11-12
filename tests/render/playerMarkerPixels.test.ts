import { describe, expect, test } from 'vitest';
import {
  bakeBoardTiles,
  computeBoardTileLayout,
  computeChipTileAt,
  type BoardCell,
  type BoardTileBakeInput,
  type TileBakeContext2D
} from '../../src/render/boardTileBake';
import { boardMaterial } from '../../src/render/boardTileStyle';
import { PLAYER_LOCATOR, resolvePlayerLocatorMetrics } from '../../src/render/playerLocator';
import {
  PLAYER_MARKER,
  createPlayerMarkerFrame,
  drawPlayerMarker,
  resolvePlayerMarkerCenter,
  resolvePlayerMarkerFrame,
  resolvePlayerMarkerRestHalf
} from '../../src/render/playerMarker';
import { RasterContext, type Rgba } from './support/rasterContext';
import { RasterGraphics } from './support/rasterGraphics';

/**
 * Pixel proof of the shared PLAYER MARKER, on real pixels: the real Chip bake and the real marker draw are rasterised
 * (pixel-centre sampling, no anti-aliasing) at the tile sizes and device pixel ratios the owner compared (an 8 px
 * dense tile, the 14.7 px phone tile, the 25 px desktop tile; DPR 1, 2, 2.625, 3).
 *
 *  - the marker is centred on the baked tile's device-snapped centre (the end markers' centre), and its block is the
 *    same fraction of the tile at every size;
 *  - nothing solid is painted outside the player's own tile: past the tile edge only the soft glow shows (a translucent
 *    fall-off bounded by the glow's own alpha), never the ring, the keyline or the block;
 *  - the dark keyline wraps the block and the ring (where the tile holds one) is inside the tile, as in the end markers;
 *  - the human's marker and the AI's are the same pixels for the same state: both go through this one draw with no
 *    mode input, the only difference allowed is the find-me ping, which only play ever passes.
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
const CELLS: BoardCell[] = [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 4, y: 3 }, { x: 9, y: 3 }, { x: 5, y: 5 }];

const TILE_SIZES = [8.32, 14.72, 25.44];
const DPRS = [1, 2, 2.625, 3];

const CORE = 0x39e07a;
const rgb = (color: number): Rgba => [(color >> 16) & 255, (color >> 8) & 255, color & 255, 255];
const same = (a: Rgba, b: Rgba): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

const BAKES = new Map<string, RasterContext>();

interface Rendered {
  base: RasterContext;
  marked: RasterContext;
  /** The tile's device-pixel rectangle (inclusive) and centre. */
  rect: { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number };
  centerCss: { x: number; y: number };
  tileCenterCss: { x: number; y: number };
  frame: ReturnType<typeof createPlayerMarkerFrame>;
}

interface RenderOptions {
  pingStartMs?: number;
  timeMs?: number;
  reducedMotion?: boolean;
  motionAmount?: number;
  headingX?: number;
  headingY?: number;
}

const render = (tileSize: number, dpr: number, cell: BoardCell, options: RenderOptions = {}): Rendered => {
  const input: BoardTileBakeInput = {
    grid: GRID, width: GRID[0]!.length, height: GRID.length, tileSize, devicePixelRatio: dpr, goal: { x: 1, y: 5 }
  };
  const layout = computeBoardTileLayout(input);
  // the bake is the slow part and identical for every cell and option: bake once per tile size and DPR
  const key = `${tileSize}@${dpr}`;
  let base = BAKES.get(key);
  if (!base) {
    const surface = new RasterContext(layout.pixelWidth, layout.pixelHeight);
    bakeBoardTiles(input, () => ({ canvas: surface, ctx: surface as unknown as TileBakeContext2D }));
    base = surface;
    BAKES.set(key, base);
  }
  const tile = computeChipTileAt(input, cell)!;
  const marked = base.clone();
  marked.setTransform(dpr, 0, 0, dpr, 0, 0);
  const centerCss = resolvePlayerMarkerCenter(cell.x, cell.y, tileSize, dpr, layout.originX, layout.originY);
  const frame = resolvePlayerMarkerFrame({
    centerX: centerCss.x,
    centerY: centerCss.y,
    tileSize,
    devicePixelRatio: dpr,
    timeMs: options.timeMs ?? 0,
    reducedMotion: options.reducedMotion ?? true,
    motionAmount: options.motionAmount ?? 0,
    headingX: options.headingX ?? 0,
    headingY: options.headingY ?? 0
  }, createPlayerMarkerFrame());
  drawPlayerMarker(new RasterGraphics(marked), frame, {
    tileSize,
    devicePixelRatio: dpr,
    alpha: 1,
    timeMs: options.timeMs ?? 0,
    coreColor: CORE,
    pingStartMs: options.pingStartMs ?? -1,
    reducedMotion: options.reducedMotion ?? true
  });
  const x0 = Math.round((layout.originX + tile.left) * dpr);
  const y0 = Math.round((layout.originY + tile.top) * dpr);
  const x1 = Math.round((layout.originX + tile.left + tile.width) * dpr) - 1;
  const y1 = Math.round((layout.originY + tile.top + tile.height) * dpr) - 1;
  return {
    base,
    marked,
    rect: { x0, y0, x1, y1, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 },
    centerCss,
    tileCenterCss: { x: layout.originX + tile.left + (tile.width / 2), y: layout.originY + tile.top + (tile.height / 2) },
    frame
  };
};

/**
 * The tile's device rectangle, grown by one device pixel: the baked tiles snap each cell edge to a whole device pixel,
 * so a cell is up to one device pixel wider or narrower than tileSize * dpr, while the ring is flush with the nominal
 * tile edge. One pixel is that snap, not a bleed.
 */
const inTileRect = (r: Rendered, x: number, y: number): boolean => (
  x >= r.rect.x0 - 1 && x <= r.rect.x1 + 1 && y >= r.rect.y0 - 1 && y <= r.rect.y1 + 1
);

interface Changed { x: number; y: number; after: Rgba; before: Rgba }

const changedPixels = (r: Rendered): Changed[] => {
  const out: Changed[] = [];
  // only the marker's neighbourhood can change (the glow and ping are bounded well inside this window)
  const reach = Math.ceil((r.rect.x1 - r.rect.x0 + 1) * 3) + 40;
  const yFrom = Math.max(0, r.rect.y0 - reach);
  const yTo = Math.min(r.marked.height - 1, r.rect.y1 + reach);
  const xFrom = Math.max(0, r.rect.x0 - reach);
  const xTo = Math.min(r.marked.width - 1, r.rect.x1 + reach);
  for (let y = yFrom; y <= yTo; y += 1) {
    for (let x = xFrom; x <= xTo; x += 1) {
      const after = r.marked.pixel(x, y);
      const before = r.base.pixel(x, y);
      if (!same(before, after)) out.push({ x, y, after, before });
    }
  }
  return out;
};

describe.each(TILE_SIZES.flatMap((tile) => DPRS.map((dpr) => [tile, dpr] as const)))(
  'player marker pixels: tile %f css px at DPR %f',
  (tileSize, dpr) => {
    test('the marker centre is the baked tile\'s device-snapped centre (the end markers\' centre), for every cell', () => {
      for (const cell of CELLS) {
        const r = render(tileSize, dpr, cell);
        expect(r.centerCss.x, `x ${cell.x},${cell.y}`).toBeCloseTo(r.tileCenterCss.x, 9);
        expect(r.centerCss.y, `y ${cell.x},${cell.y}`).toBeCloseTo(r.tileCenterCss.y, 9);
      }
    });

    test('the opaque block is centred on the tile and is the same share of it at every size', () => {
      for (const cell of CELLS) {
        const r = render(tileSize, dpr, cell);
        // opaque core pixels: the exact core colour (the accent stroke and keyline differ from it)
        let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity; let count = 0;
        for (const p of changedPixels(r)) {
          if (!same(p.after, rgb(CORE))) continue;
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); count += 1;
        }
        expect(count, `core pixels ${cell.x},${cell.y}`).toBeGreaterThan(0);
        // bounding box centre within one device px of the tile centre (the accent stroke eats at most its width at the edge)
        expect(Math.abs(((minX + maxX + 1) / 2) - r.rect.cx), `centre x ${cell.x},${cell.y}`).toBeLessThanOrEqual(1);
        expect(Math.abs(((minY + maxY + 1) / 2) - r.rect.cy), `centre y ${cell.x},${cell.y}`).toBeLessThanOrEqual(1);
        // width: PLAYER_MARKER.sizeRatio of the tile, less the accent stroke's half-width each side, within 2 device px
        const expected = (tileSize * PLAYER_MARKER.sizeRatio * dpr) - (r.frame.accentStrokeCss * dpr);
        expect(Math.abs((maxX - minX + 1) - expected), `width ${cell.x},${cell.y}`).toBeLessThanOrEqual(2);
        expect(Math.abs((maxY - minY + 1) - expected), `height ${cell.x},${cell.y}`).toBeLessThanOrEqual(2);
      }
    });

    test('nothing solid leaves the tile: past its edge only the translucent glow shows, bounded by the glow alpha', () => {
      const m = resolvePlayerLocatorMetrics(tileSize, dpr, resolvePlayerMarkerRestHalf(tileSize) * (1 + PLAYER_MARKER.breatheAmount));
      const player = rgb(boardMaterial.player);
      for (const cell of CELLS) {
        const r = render(tileSize, dpr, cell);
        const reach = (m.glowHalfCss * dpr) + 1;
        let outside = 0;
        for (const p of changedPixels(r)) {
          const inTile = inTileRect(r, p.x, p.y);
          // never painted beyond the glow's own bound
          expect(Math.abs(p.x + 0.5 - r.rect.cx), `glow bound x (${p.x},${p.y})`).toBeLessThanOrEqual(reach);
          expect(Math.abs(p.y + 0.5 - r.rect.cy), `glow bound y (${p.x},${p.y})`).toBeLessThanOrEqual(reach);
          if (inTile) continue;
          outside += 1;
          // outside the tile every changed pixel is a blend of the base towards the player's green by at most the
          // glow's cumulative alpha: a solid ring / keyline / block pixel would be far further than that
          if (p.before[3]! < 255) {
            // over the empty board margin / wall the base is transparent: the glow is then a low-alpha player-green pixel
            expect(p.after[3]!, `opaque pixel outside the tile (${p.x},${p.y})`).toBeLessThanOrEqual(((PLAYER_LOCATOR.glowPeakAlpha + 0.02) * 255) + 1);
            continue;
          }
          for (let c = 0; c < 3; c += 1) {
            const room = Math.abs(player[c]! - p.before[c]!) * (PLAYER_LOCATOR.glowPeakAlpha + 0.02);
            expect(Math.abs(p.after[c]! - p.before[c]!), `solid pixel outside the tile (${p.x},${p.y}) channel ${c}`).toBeLessThanOrEqual(room + 1);
          }
        }
        // the glow does bleed a little (a falloff), it is not clipped to the tile
        expect(outside, `glow bleed ${cell.x},${cell.y}`).toBeGreaterThan(0);
      }
    });

    test('a dark keyline wraps the block, and the ring (where the tile holds one) sits inside the tile', () => {
      const m = resolvePlayerLocatorMetrics(tileSize, dpr, resolvePlayerMarkerRestHalf(tileSize) * (1 + PLAYER_MARKER.breatheAmount));
      const void_ = rgb(boardMaterial.void);
      const ring = rgb(boardMaterial.player);
      for (const cell of CELLS) {
        const r = render(tileSize, dpr, cell);
        const keyline = changedPixels(r).filter((p) => {
          // the keyline is drawn at 0.9 alpha over the chip: close to (but not exactly) the void colour
          return Math.abs(p.after[0]! - void_[0]!) < 40 && Math.abs(p.after[1]! - void_[1]!) < 60 && Math.abs(p.after[2]! - void_[2]!) < 60
            && !same(p.before, p.after);
        });
        expect(keyline.length, `keyline pixels ${cell.x},${cell.y}`).toBeGreaterThan(0);
        if (m.ringVisible) {
          const ringPixels = changedPixels(r).filter((p) => p.after[3]! >= 200 && (same(p.after, ring) || (
            Math.abs(p.after[0]! - ring[0]!) <= 24 && Math.abs(p.after[1]! - ring[1]!) <= 24 && Math.abs(p.after[2]! - ring[2]!) <= 24
          )));
          expect(ringPixels.length, `ring pixels ${cell.x},${cell.y}`).toBeGreaterThan(0);
          for (const p of ringPixels) {
            // ring pixels (and anything as bright) lie in the tile's own rectangle
            expect(inTileRect(r, p.x, p.y), `ring outside tile (${p.x},${p.y})`).toBe(true);
          }
        }
      }
    });

    test('the same state renders the same pixels for the human and for the AI; a find-me ping only adds pixels', () => {
      // "play" and "menu demo" are the same call: no mode input exists. Rendering twice must be byte-identical.
      const cell = CELLS[2]!;
      const play = render(tileSize, dpr, cell, { reducedMotion: false, timeMs: 777, motionAmount: 0.5, headingX: 1, headingY: 0 });
      const ai = render(tileSize, dpr, cell, { reducedMotion: false, timeMs: 777, motionAmount: 0.5, headingX: 1, headingY: 0 });
      expect(Buffer.from(play.marked.data).equals(Buffer.from(ai.marked.data))).toBe(true);
      // the ping (play only) changes the picture; without it the two stay identical
      const pinged = render(tileSize, dpr, cell, { reducedMotion: false, timeMs: 777, motionAmount: 0.5, headingX: 1, headingY: 0, pingStartMs: 400 });
      expect(Buffer.from(play.marked.data).equals(Buffer.from(pinged.marked.data))).toBe(false);
    });
  }
);

describe('the marker is gliding: squash and stretch moves both surfaces the same way', () => {
  test('a horizontal glide widens the block along x and narrows it across y, a vertical glide does the opposite', () => {
    const base = { centerX: 50, centerY: 50, tileSize: 20, devicePixelRatio: 2, timeMs: 0, reducedMotion: true };
    const rest = resolvePlayerMarkerFrame({ ...base, motionAmount: 0, headingX: 0, headingY: 0 }, createPlayerMarkerFrame());
    const horizontal = resolvePlayerMarkerFrame({ ...base, motionAmount: 1, headingX: 1, headingY: 0 }, createPlayerMarkerFrame());
    const vertical = resolvePlayerMarkerFrame({ ...base, motionAmount: 1, headingX: 0, headingY: -1 }, createPlayerMarkerFrame());
    expect(horizontal.coreHalfWidth).toBeGreaterThan(rest.coreHalfWidth);
    expect(horizontal.coreHalfHeight).toBeLessThan(rest.coreHalfHeight);
    expect(vertical.coreHalfHeight).toBeGreaterThan(rest.coreHalfHeight);
    expect(vertical.coreHalfWidth).toBeLessThan(rest.coreHalfWidth);
  });
});
