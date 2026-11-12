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
  resolvePlayerMarkerEndpointRadii,
  resolvePlayerMarkerFrame,
  resolvePlayerMarkerReach
} from '../../src/render/playerMarker';
import {
  createPlayerRingMorph,
  resolveEndpointRingBlend,
  resolvePlayerMarkerEndpointMorph
} from '../../src/render/playerRingMorph';

/**
 * MAZER-VIS-028: the ring blends between the cap and chip shape while the marker glides on or off a start / goal tile,
 * instead of switching at the half-way point. Pure blend tests plus the REAL chip geometry and the REAL marker draw.
 */
const CAP_ROWS = ['#####', '#...#', '#####'];
const CAP_GRID = CAP_ROWS.map((row) => [...row].map((c) => c !== '#'));
const LEFT_CAP: BoardCell = { x: 1, y: 1 };
const RIGHT_CAP: BoardCell = { x: 3, y: 1 };

const TILE_SIZES = [14.72, 25.44, 40.5];
const DPRS = [1, 2, 2.625, 3];
const STEPS = 20;

const bakeInput = (tileSize: number, dpr: number): BoardTileBakeInput => ({
  grid: CAP_GRID, width: CAP_GRID[0]!.length, height: CAP_GRID.length, tileSize, devicePixelRatio: dpr
});

describe('resolveEndpointRingBlend', () => {
  const end = { x: 4, y: 2 };
  test('1 on the end tile, 0 a whole tile away, linear in between along either axis', () => {
    expect(resolveEndpointRingBlend(4, 2, end, false)).toBe(1);
    expect(resolveEndpointRingBlend(5, 2, end, false)).toBe(0);
    expect(resolveEndpointRingBlend(4, 3, end, false)).toBe(0);
    expect(resolveEndpointRingBlend(4.25, 2, end, false)).toBeCloseTo(0.75, 12);
    expect(resolveEndpointRingBlend(3.5, 2, end, false)).toBeCloseTo(0.5, 12);
    expect(resolveEndpointRingBlend(4, 1.1, end, false)).toBeCloseTo(0.1, 12);
    expect(resolveEndpointRingBlend(9, 9, end, false)).toBe(0);
  });

  test('it is continuous: no jump across the old half-way switch point', () => {
    let previous = resolveEndpointRingBlend(4, 2, end, false);
    for (let i = 1; i <= 100; i += 1) {
      const next = resolveEndpointRingBlend(4 + (i / 100), 2, end, false);
      expect(next).toBeLessThanOrEqual(previous);
      expect(previous - next).toBeLessThan(0.0101);
      previous = next;
    }
    expect(resolveEndpointRingBlend(4.5, 2, end, false)).toBeCloseTo(0.5, 12);
  });

  test('reduced motion collapses to the rest decision: 1 or 0, never in between', () => {
    for (let i = 0; i <= 100; i += 1) {
      const blend = resolveEndpointRingBlend(4 + (i / 100), 2, end, true);
      expect(blend === 0 || blend === 1).toBe(true);
    }
    expect(resolveEndpointRingBlend(4.4, 2, end, true)).toBe(1);
    expect(resolveEndpointRingBlend(4.6, 2, end, true)).toBe(0);
  });

  test('non-finite positions are the chip ring', () => {
    expect(resolveEndpointRingBlend(Number.NaN, 2, end, false)).toBe(0);
  });
});

describe('resolvePlayerMarkerEndpointMorph', () => {
  const start = { x: 2, y: 3 };
  const goal = { x: 8, y: 1 };
  const tiles = {
    start: { radii: [1, 0, 0, 1] as LocatorTileRadii },
    goal: { radii: [0, 2, 2, 0] as LocatorTileRadii }
  };
  test('whole cells match resolvePlayerMarkerEndpointRadii exactly (the resting frames do not change)', () => {
    const out = createPlayerRingMorph();
    for (const [x, y] of [[2, 3], [8, 1], [5, 5], [3, 3], [2, 2]] as const) {
      const morph = resolvePlayerMarkerEndpointMorph(x, y, start, goal, tiles, false, out);
      const radii = resolvePlayerMarkerEndpointRadii(x, y, start, goal, tiles);
      expect(morph.radii).toEqual(radii);
      expect(morph.blend).toBe(radii === null ? 0 : 1);
    }
  });

  test('mid-glide keeps the end tile radii with a fractional blend; the nearer end tile wins', () => {
    const out = createPlayerRingMorph();
    const a = resolvePlayerMarkerEndpointMorph(2.3, 3, start, goal, tiles, false, out);
    expect(a.radii).toEqual([1, 0, 0, 1]);
    expect(a.blend).toBeCloseTo(0.7, 12);
    const b = resolvePlayerMarkerEndpointMorph(7.8, 1, start, goal, tiles, false, out);
    expect(b.radii).toEqual([0, 2, 2, 0]);
    expect(b.blend).toBeCloseTo(0.8, 12);
    const none = resolvePlayerMarkerEndpointMorph(5, 5, start, undefined, { start: null, goal: null }, false, out);
    expect(none.radii).toBeNull();
    expect(none.blend).toBe(0);
  });

  test('reduced motion never produces a fractional blend', () => {
    const out = createPlayerRingMorph();
    for (let i = 0; i <= 50; i += 1) {
      const m = resolvePlayerMarkerEndpointMorph(2 + (i / 50), 3, start, goal, tiles, true, out);
      expect(m.blend === 0 || m.blend === 1).toBe(true);
    }
  });
});

describe('resolveLocatorSquareRadii blend', () => {
  test('0 is the chip radius on every corner, 1 is the cap arc exactly, in between is monotonic', () => {
    const half = 10;
    const tileHalf = 12;
    const radii: LocatorTileRadii = [12, 0, 0, 12];
    const chip = half * 2 * 0.3;
    const out = { tl: 0, tr: 0, bl: 0, br: 0 };
    const full = { ...resolveLocatorSquareRadii(half, tileHalf, radii, out, 1) };
    expect(full).toEqual(resolveLocatorSquareRadii(half, tileHalf, radii, { tl: 0, tr: 0, bl: 0, br: 0 }));
    const none = resolveLocatorSquareRadii(half, tileHalf, radii, out, 0);
    expect(none).toEqual({ tl: chip, tr: chip, br: chip, bl: chip });
    let previous = chip;
    for (let i = 1; i <= 10; i += 1) {
      const mid = resolveLocatorSquareRadii(half, tileHalf, radii, out, i / 10);
      expect(mid.tl).toBeGreaterThanOrEqual(previous);
      expect(mid.tl).toBeLessThanOrEqual(full.tl + 1e-12);
      expect(mid.tr).toBe(chip);
      expect(mid.br).toBe(chip);
      previous = mid.tl;
    }
  });
});

interface Call {
  fn: 'fill' | 'stroke';
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number | LocatorCornerRadii;
}

const drawAt = (
  tileSize: number, dpr: number, cellX: number, cellY: number, radii: LocatorTileRadii | null, blend: number | undefined
) => {
  const center = resolvePlayerMarkerCenter(cellX, cellY, tileSize, dpr, 0, 0);
  const frame = resolvePlayerMarkerFrame({
    centerX: center.x, centerY: center.y, tileSize, devicePixelRatio: dpr, timeMs: 0, reducedMotion: true,
    motionAmount: 0, headingX: 0, headingY: 0
  }, createPlayerMarkerFrame());
  const calls: Call[] = [];
  const copy = (r: number | LocatorCornerRadii): number | LocatorCornerRadii => (typeof r === 'number' ? r : { ...r });
  const g: LocatorGraphics = {
    fillStyle: () => undefined,
    lineStyle: () => undefined,
    fillRoundedRect: (x, y, w, h, radius) => { calls.push({ fn: 'fill', x, y, w, h, radius: copy(radius) }); },
    strokeRoundedRect: (x, y, w, h, radius) => { calls.push({ fn: 'stroke', x, y, w, h, radius: copy(radius) }); }
  };
  drawPlayerMarker(g, frame, {
    tileSize, devicePixelRatio: dpr, alpha: 1, timeMs: 0, coreColor: 0x39e07a, pingStartMs: -1, reducedMotion: true,
    tileCornerRadii: radii, ...(blend === undefined ? {} : { tileCornerBlend: blend })
  });
  const metrics = resolvePlayerLocatorMetrics(tileSize, dpr, resolvePlayerMarkerReach(tileSize));
  const ring = calls.find((c) => c.fn === 'stroke' && Math.abs(c.w - (metrics.ringHalfCss * 2)) < 1e-9)!;
  return { calls, ring, metrics, center };
};

const corners = (r: number | LocatorCornerRadii): LocatorCornerRadii => (
  typeof r === 'number' ? { tl: r, tr: r, br: r, bl: r } : r
);

const insideRounded = (
  px: number, py: number, x: number, y: number, w: number, h: number, r: LocatorCornerRadii, slack: number
): boolean => {
  if (px < x - slack || px > x + w + slack || py < y - slack || py > y + h + slack) return false;
  const check = (cx: number, cy: number, rad: number, sx: number, sy: number): boolean => (
    !(sx * (px - cx) > 0 && sy * (py - cy) > 0) || Math.hypot(px - cx, py - cy) <= rad + slack
  );
  return check(x + r.tl, y + r.tl, r.tl, -1, -1)
    && check(x + w - r.tr, y + r.tr, r.tr, 1, -1)
    && check(x + w - r.br, y + h - r.br, r.br, 1, 1)
    && check(x + r.bl, y + h - r.bl, r.bl, -1, 1);
};

const radiiOf = (t: { radii: readonly number[] }): LocatorCornerRadii => (
  { tl: t.radii[0]!, tr: t.radii[1]!, br: t.radii[2]!, bl: t.radii[3]! }
);

describe('MAZER-VIS-028: the drawn ring morphs and never leaves the cap / corridor outline', () => {
  test('the resting frames are identical to before: blend 1 on the end tile, blend 0 / no radii elsewhere', () => {
    for (const tileSize of TILE_SIZES) {
      for (const dpr of DPRS) {
        const tiles = {
          start: { radii: computeChipTileAt(bakeInput(tileSize, dpr), LEFT_CAP)!.radii },
          goal: { radii: computeChipTileAt(bakeInput(tileSize, dpr), RIGHT_CAP)!.radii }
        };
        for (const cell of [LEFT_CAP, RIGHT_CAP]) {
          const tile = computeChipTileAt(bakeInput(tileSize, dpr), cell)!;
          const before = drawAt(tileSize, dpr, cell.x, cell.y, tile.radii, undefined);
          const morph = resolvePlayerMarkerEndpointMorph(
            cell.x, cell.y, LEFT_CAP, RIGHT_CAP, tiles, false, createPlayerRingMorph()
          );
          const after = drawAt(tileSize, dpr, cell.x, cell.y, morph.radii, morph.blend);
          expect(after.calls).toEqual(before.calls);
        }
        const morphPlain = resolvePlayerMarkerEndpointMorph(2, 1, LEFT_CAP, RIGHT_CAP, tiles, false, createPlayerRingMorph());
        const plainBefore = drawAt(tileSize, dpr, 2, 1, null, undefined);
        const plainAfter = drawAt(tileSize, dpr, 2, 1, morphPlain.radii, morphPlain.blend);
        expect(plainAfter.calls).toEqual(plainBefore.calls);
      }
    }
  });

  test('the closed corner radius moves smoothly from the cap arc to the chip radius across the tile', () => {
    for (const tileSize of TILE_SIZES) {
      for (const dpr of DPRS) {
        const tile = computeChipTileAt(bakeInput(tileSize, dpr), LEFT_CAP)!;
        let previous: number | null = null;
        let largestStep = 0;
        for (let i = 0; i <= STEPS; i += 1) {
          const cellX = LEFT_CAP.x + (i / STEPS);
          const m = resolvePlayerMarkerEndpointMorph(
            cellX, LEFT_CAP.y, LEFT_CAP, null, { start: { radii: tile.radii }, goal: null }, false, createPlayerRingMorph()
          );
          const { ring } = drawAt(tileSize, dpr, cellX, LEFT_CAP.y, m.radii, m.blend);
          const r = corners(ring.radius);
          expect(r.tr).toBeCloseTo(r.br, 9);
          if (previous !== null) {
            largestStep = Math.max(largestStep, Math.abs(r.tl - previous));
            expect(r.tl).toBeLessThanOrEqual(previous + 1e-9);
          }
          previous = r.tl;
        }
        // no pop: the biggest single step is no more than a share of the whole change (half a tile at most)
        expect(largestStep).toBeLessThanOrEqual((tileSize / 2 / STEPS) + 1e-9);
      }
    }
  });

  for (const cap of [LEFT_CAP, RIGHT_CAP]) {
    test(`no frame shows a corner poking past the dead-end disc (${cap === LEFT_CAP ? 'left' : 'right'} cap), every tile size and DPR`, () => {
      const neighbourX = cap.x + (cap === LEFT_CAP ? 1 : -1);
      for (const tileSize of TILE_SIZES) {
        for (const dpr of DPRS) {
          const capTile = computeChipTileAt(bakeInput(tileSize, dpr), cap)!;
          const neighbour = computeChipTileAt(bakeInput(tileSize, dpr), { x: neighbourX, y: cap.y })!;
          const half = tileSize / 2;
          const snapSlack = 1 / dpr;
          const capCenter = resolvePlayerMarkerCenter(cap.x, cap.y, tileSize, dpr, 0, 0);
          const neighbourCenter = resolvePlayerMarkerCenter(neighbourX, cap.y, tileSize, dpr, 0, 0);
          for (let i = 0; i <= STEPS; i += 1) {
            const cellX = cap.x + ((neighbourX - cap.x) * (i / STEPS));
            const morph = resolvePlayerMarkerEndpointMorph(
              cellX, cap.y, cap, null, { start: { radii: capTile.radii }, goal: null }, false, createPlayerRingMorph()
            );
            const { ring, metrics } = drawAt(tileSize, dpr, cellX, cap.y, morph.radii, morph.blend);
            const grow = metrics.ringStrokeCss / 2;
            const r = corners(ring.radius);
            const ox = ring.x - grow;
            const oy = ring.y - grow;
            const ow = ring.w + (grow * 2);
            const oh = ring.h + (grow * 2);
            const arcs = [
              { cx: ox + r.tl + grow, cy: oy + r.tl + grow, sx: -1, sy: -1, rad: r.tl + grow },
              { cx: ox + ow - r.tr - grow, cy: oy + r.tr + grow, sx: 1, sy: -1, rad: r.tr + grow },
              { cx: ox + ow - r.br - grow, cy: oy + oh - r.br - grow, sx: 1, sy: 1, rad: r.br + grow },
              { cx: ox + r.bl + grow, cy: oy + oh - r.bl - grow, sx: -1, sy: 1, rad: r.bl + grow }
            ];
            for (const arc of arcs) {
              for (let a = 0; a <= 45; a += 1) {
                const angle = (a / 45) * (Math.PI / 2);
                const px = arc.cx + (arc.sx * Math.cos(angle) * arc.rad);
                const py = arc.cy + (arc.sy * Math.sin(angle) * arc.rad);
                const inCap = insideRounded(
                  px, py, capCenter.x - half, capCenter.y - half, tileSize, tileSize, radiiOf(capTile), snapSlack
                );
                const inNeighbour = insideRounded(
                  px, py, neighbourCenter.x - half, neighbourCenter.y - half, tileSize, tileSize, radiiOf(neighbour), snapSlack
                );
                expect(
                  inCap || inNeighbour,
                  `${tileSize}@${dpr} step ${i}/${STEPS} ring point (${px.toFixed(3)}, ${py.toFixed(3)}) is outside the cap and its neighbour`
                ).toBe(true);
              }
            }
          }
        }
      }
    });
  }
});
