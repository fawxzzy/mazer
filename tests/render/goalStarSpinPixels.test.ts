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
import { resolveGoalStarCentre } from '../../src/render/endpointOpticalCentre';
import { resolvePlayerCoreAlphaScale } from '../../src/render/endpointMarkerLayering';
import { GOAL_STAR_TOOTH_RAD } from '../../src/render/goalStarSpin';
import {
  createPlayerMarkerFrame,
  drawPlayerMarker,
  resolvePlayerMarkerCenter,
  resolvePlayerMarkerFrame
} from '../../src/render/playerMarker';
import { RasterContext, type Rgba } from './support/rasterContext';
import { RasterGraphics } from './support/rasterGraphics';

/**
 * Pixel proof of MAZER-VIS-041, on real pixels (the real bake, the real marker draw, the real player marker draw,
 * rasterised with pixel-centre sampling at DPR 1 / 2 / 2.625 / 3):
 *
 *  1. SPIN, NO WOBBLE: whatever the angle, the centroid of the painted star (fill plus keyline) stays on the tile's
 *     painted-interior centre (the circumcentre target of MAZER-VIS-034), within the same half device pixel the static
 *     star is held to, and it does not drift from the static star's centroid as the star turns;
 *  2. the turning star stays inside its tile's fill, clear of the lit rim (the fit is angle independent);
 *  3. LAYERING: with the player standing on the goal the star is still there (its pixels show through the translucent
 *     core and around it), and the only thing the translucent core changes is the core's own fill: the keyline, the
 *     accent stroke and the ring (what keeps the player highly visible) are pixel-identical to the opaque marker.
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
const TILE_SIZES = [10, 14.72, 15.6, 25.44];
const DPRS = [1, 2, 2.625, 3];
const ANGLES = [0, 0.2, 0.55, 0.8, 1.1, GOAL_STAR_TOOTH_RAD - 0.01];
const CORE = 0x39e07a;

const same = (a: Rgba, b: Rgba): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

const inputFor = (tileSize: number, dpr: number, goal: BoardCell): BoardTileBakeInput => ({
  grid: GRID, width: GRID[0]!.length, height: GRID.length, tileSize, devicePixelRatio: dpr, goal
});

/** One representative cell per tile kind (cap, straight, corner, junction) plus the first with a concave corner. */
const cellsFor = (): BoardCell[] => {
  const picked = new Map<string, BoardCell>();
  for (const t of computeChipGeometry(inputFor(14.72, 2, { x: 1, y: 1 }))) {
    const key = Object.values(t.concave).some(Boolean) ? 'concave' : t.kind;
    if (!picked.has(key)) picked.set(key, { x: t.x, y: t.y });
  }
  return [...picked.values()];
};

const BAKES = new Map<string, RasterContext>();

interface Options { rotation?: number; star?: boolean; player?: 'none' | 'opaque' | 'overGoal' }

const render = (tileSize: number, dpr: number, cell: BoardCell, options: Options = {}) => {
  const input = inputFor(tileSize, dpr, cell);
  const layout = computeBoardTileLayout(input);
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
  marked.paintStrokes = true;
  marked.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (options.star !== false) {
    drawBoardMarkers(marked, {
      style: 'chip', tileSize, devicePixelRatio: dpr, originX: layout.originX, originY: layout.originY,
      goal: cell, goalTile: tile, goalStarRotation: options.rotation ?? 0
    });
  }
  const center = resolvePlayerMarkerCenter(cell.x, cell.y, tileSize, dpr, layout.originX, layout.originY);
  const frame = resolvePlayerMarkerFrame({
    centerX: center.x, centerY: center.y, tileSize, devicePixelRatio: dpr, timeMs: 0, reducedMotion: true,
    motionAmount: 0, headingX: 0, headingY: 0
  }, createPlayerMarkerFrame());
  if (options.player && options.player !== 'none') {
    drawPlayerMarker(new RasterGraphics(marked), frame, {
      tileSize, devicePixelRatio: dpr, alpha: 1, timeMs: 0, coreColor: CORE, pingStartMs: -1, reducedMotion: true,
      coreAlphaScale: options.player === 'overGoal' ? resolvePlayerCoreAlphaScale(1) : 1
    });
  }
  const x0 = Math.round((layout.originX + tile.left) * dpr);
  const y0 = Math.round((layout.originY + tile.top) * dpr);
  const x1 = Math.round((layout.originX + tile.left + tile.width) * dpr) - 1;
  const y1 = Math.round((layout.originY + tile.top + tile.height) * dpr) - 1;
  return { base, marked, layout, tile, frame, rect: { x0, y0, x1, y1 } };
};

const changed = (base: RasterContext, marked: RasterContext): Array<{ x: number; y: number }> => {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < marked.height; y += 1) {
    for (let x = 0; x < marked.width; x += 1) {
      if (!same(base.pixel(x, y), marked.pixel(x, y))) out.push({ x, y });
    }
  }
  return out;
};

const centroid = (px: Array<{ x: number; y: number }>): { x: number; y: number } => ({
  x: px.reduce((n, p) => n + p.x + 0.5, 0) / px.length,
  y: px.reduce((n, p) => n + p.y + 0.5, 0) / px.length
});

describe.each(TILE_SIZES.flatMap((tile) => DPRS.map((dpr) => [tile, dpr] as const)))(
  'spinning goal star pixels: tile %f css px at DPR %f',
  (tileSize, dpr) => {
    const cells = cellsFor();

    test('the painted star stays centred on its circumcentre target at every angle (no wobble)', () => {
      for (const cell of cells) {
        const still = render(tileSize, dpr, cell, { rotation: 0 });
        const stillCentroid = centroid(changed(still.base, still.marked));
        const target = resolveGoalStarCentre(still.tile);
        const aimX = (still.layout.originX + target.x) * dpr;
        const aimY = (still.layout.originY + target.y) * dpr;
        for (const angle of ANGLES) {
          const r = render(tileSize, dpr, cell, { rotation: angle });
          const c = centroid(changed(r.base, r.marked));
          const tag = `cell ${cell.x},${cell.y} angle ${angle.toFixed(2)}`;
          expect(Math.abs(c.x - aimX), `x vs target, ${tag}`).toBeLessThanOrEqual(0.6);
          expect(Math.abs(c.y - aimY), `y vs target, ${tag}`).toBeLessThanOrEqual(0.6);
          expect(Math.abs(c.x - stillCentroid.x), `x drift from the static star, ${tag}`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(c.y - stillCentroid.y), `y drift from the static star, ${tag}`).toBeLessThanOrEqual(0.5);
        }
      }
    });

    test('the turning star never reaches the lit rim or the tile edge', () => {
      for (const cell of cells) {
        for (const angle of ANGLES) {
          const r = render(tileSize, dpr, cell, { rotation: angle });
          const f = r.tile.fill;
          const fx0 = Math.round((r.layout.originX + f.left) * dpr);
          const fy0 = Math.round((r.layout.originY + f.top) * dpr);
          const fx1 = Math.round((r.layout.originX + f.left + f.width) * dpr) - 1;
          const fy1 = Math.round((r.layout.originY + f.top + f.height) * dpr) - 1;
          const px = changed(r.base, r.marked);
          expect(px.length).toBeGreaterThan(0);
          for (const p of px) {
            expect(p.x >= fx0 && p.x <= fx1 && p.y >= fy0 && p.y <= fy1, `(${p.x},${p.y}) outside the fill, cell ${cell.x},${cell.y} angle ${angle.toFixed(2)}`).toBe(true);
            expect(p.x > r.rect.x0 && p.x < r.rect.x1 && p.y > r.rect.y0 && p.y < r.rect.y1, 'touches the tile edge').toBe(true);
          }
        }
      }
    });

    test('with the player on the goal the star is still painted: it shows through the core, the core only changes its own fill', () => {
      for (const cell of cells) {
        const withoutStar = render(tileSize, dpr, cell, { star: false, player: 'overGoal' });
        const withStar = render(tileSize, dpr, cell, { rotation: 0.4, player: 'overGoal' });
        const opaqueWithStar = render(tileSize, dpr, cell, { rotation: 0.4, player: 'opaque' });
        const opaqueWithoutStar = render(tileSize, dpr, cell, { star: false, player: 'opaque' });

        // star pixels are present: the render with the star differs from the render without it
        const starPixels = changed(withoutStar.marked, withStar.marked);
        expect(starPixels.length, `star visible over the player, cell ${cell.x},${cell.y}`).toBeGreaterThan(0);
        // ...and an OPAQUE core would have hidden strictly more of it (the old behaviour hid the star outright)
        const opaqueStarPixels = changed(opaqueWithoutStar.marked, opaqueWithStar.marked);
        expect(starPixels.length, `translucent core shows more star than an opaque one, cell ${cell.x},${cell.y}`).toBeGreaterThan(opaqueStarPixels.length);

        // the translucent core changes ONLY the core fill: ring, keyline and accent stroke are untouched, so the
        // player keeps its crisp outline
        const half = withStar.frame.coreHalfWidth * dpr;
        const cx = (withStar.layout.originX + resolvePlayerMarkerCenter(cell.x, cell.y, tileSize, dpr, 0, 0).x) * dpr;
        const cy = (withStar.layout.originY + resolvePlayerMarkerCenter(cell.x, cell.y, tileSize, dpr, 0, 0).y) * dpr;
        for (const p of changed(opaqueWithStar.marked, withStar.marked)) {
          expect(Math.abs(p.x + 0.5 - cx) <= half + 0.5 && Math.abs(p.y + 0.5 - cy) <= half + 0.5, `(${p.x},${p.y}) changed outside the core`).toBe(true);
        }
      }
    });
  }
);

describe('the star is a pure rotation of itself', () => {
  test('a full tooth (72 degrees) paints the same pixels as no rotation (five-fold symmetry), so the 2.8 s wrap cannot pop', () => {
    const cell = cellsFor()[0]!;
    for (const dpr of DPRS) {
      const a = render(14.72, dpr, cell, { rotation: 0 });
      const b = render(14.72, dpr, cell, { rotation: GOAL_STAR_TOOTH_RAD });
      let differing = 0;
      for (let y = a.rect.y0; y <= a.rect.y1; y += 1) {
        for (let x = a.rect.x0; x <= a.rect.x1; x += 1) {
          if (!same(a.marked.pixel(x, y), b.marked.pixel(x, y))) differing += 1;
        }
      }
      // identical up to rasteriser rounding on a handful of edge pixels
      expect(differing, `DPR ${dpr}`).toBeLessThanOrEqual(Math.ceil(0.04 * (a.rect.x1 - a.rect.x0 + 1) * (a.rect.y1 - a.rect.y0 + 1)));
    }
  });
});
