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
import { boardMaterial, cssRgb, cssRgba } from '../../src/render/boardTileStyle';
import { resolveGoalStarCentre } from '../../src/render/endpointOpticalCentre';
import {
  DEFAULT_END_TILE_SKIN,
  DEFAULT_START_TILE_SKIN,
  END_TILE_SKINS,
  SEED_SPIRAL,
  START_TILE_SKINS,
  TWIN_STARS,
  resolveEndTileSkin,
  resolveGoalPingShape,
  resolveSeedBeadAlpha,
  resolveSeedSpiralClock,
  resolveStartTileSkin,
  resolveTwinStarsClock,
  resolveTwinStarsPingRotation,
  selectableEndTileSkins,
  selectableStartTileSkins
} from '../../src/render/endpointTileSkins';
import { drawGoalBeacon, GOAL_BEACON } from '../../src/render/goalBeacon';
import { resolveSharedBorderColor } from '../../src/render/trailPalette';
import { RasterContext, type Rgba } from './support/rasterContext';
import { createRecordingContext } from './support/boardTileFixtures';

/**
 * L5 end-tile skins (endpointTileSkins.ts): Zac's picks (2026-11-19) are the defaults, START = Seed spiral (beaded
 * spiral, breathes as it turns, start gold), END = Twin stars (big outline star + solid star turning opposite ways, a
 * five-point star ping). The pre-L5 looks stay drawable as retired skins (their own suites pin them); the other archive
 * designs are registered for a future shop and are neither selectable nor drawable.
 */

describe('skin registry', () => {
  test('the picks are the defaults and the only selectable skins', () => {
    expect(DEFAULT_START_TILE_SKIN).toBe('seed-spiral');
    expect(DEFAULT_END_TILE_SKIN).toBe('twin-stars');
    expect(selectableStartTileSkins().map((s) => s.id)).toEqual(['seed-spiral']);
    expect(selectableEndTileSkins().map((s) => s.id)).toEqual(['twin-stars']);
  });

  test('retired skins stay drawable, archive designs are registered but neither selectable nor drawable', () => {
    for (const list of [START_TILE_SKINS, END_TILE_SKINS]) {
      expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
      for (const skin of list) {
        expect(skin.selectable, skin.id).toBe(skin.status === 'default');
        expect(skin.drawable, skin.id).toBe(skin.status !== 'archived');
        expect(skin.name.length, skin.id).toBeGreaterThan(0);
      }
    }
    expect(START_TILE_SKINS.filter((s) => s.status === 'retired').map((s) => s.id)).toEqual(['pinwheel']);
    expect(END_TILE_SKINS.filter((s) => s.status === 'retired').map((s) => s.id)).toEqual(['solid-star']);
    expect(START_TILE_SKINS.filter((s) => s.status === 'archived')).toHaveLength(3);
    expect(END_TILE_SKINS.filter((s) => s.status === 'archived')).toHaveLength(10);
  });

  test('resolution: missing, unknown and archived ids fall back to the default; retired ids are honoured', () => {
    expect(resolveStartTileSkin()).toBe('seed-spiral');
    expect(resolveStartTileSkin('nope')).toBe('seed-spiral');
    expect(resolveStartTileSkin('portal-rings')).toBe('seed-spiral');
    expect(resolveStartTileSkin('pinwheel')).toBe('pinwheel');
    expect(resolveEndTileSkin()).toBe('twin-stars');
    expect(resolveEndTileSkin(null)).toBe('twin-stars');
    expect(resolveEndTileSkin('nova-burst')).toBe('twin-stars');
    expect(resolveEndTileSkin('solid-star')).toBe('solid-star');
    expect(resolveGoalPingShape()).toBe('star5');
    expect(resolveGoalPingShape('twin-stars')).toBe('star5');
    expect(resolveGoalPingShape('solid-star')).toBe('circle');
  });
});

describe('clocks', () => {
  test('reduced motion (and a broken clock) hold everything still', () => {
    for (const t of [0, 1234, Number.NaN]) {
      expect(resolveSeedSpiralClock(t, true)).toEqual({ rotation: 0, breath: 1 });
      expect(resolveTwinStarsClock(t, true)).toEqual({ solid: 0, outline: 0 });
      expect(resolveTwinStarsPingRotation(t, true)).toBe(0);
    }
    expect(resolveSeedSpiralClock(Number.NaN, false)).toEqual({ rotation: 0, breath: 1 });
  });

  test('the seed spiral turns clockwise once per spin period and breathes within its swing', () => {
    const k = SEED_SPIRAL;
    expect(resolveSeedSpiralClock(k.spinPeriodMs / 4, false).rotation).toBeCloseTo(Math.PI / 2, 9);
    expect(resolveSeedSpiralClock(k.spinPeriodMs, false).rotation).toBeCloseTo(0, 9);
    expect(resolveSeedSpiralClock(k.breathPeriodMs / 4, false).breath).toBeCloseTo(1 + k.breathSwing, 9);
    for (let t = 0; t < 10000; t += 137) {
      const c = resolveSeedSpiralClock(t, false);
      expect(c.breath).toBeGreaterThanOrEqual(1 - k.breathSwing - 1e-12);
      expect(c.breath).toBeLessThanOrEqual(1 + k.breathSwing + 1e-12);
      expect(c.rotation).toBeGreaterThanOrEqual(0);
      expect(c.rotation).toBeLessThan(Math.PI * 2);
    }
  });

  test('the twin stars turn opposite ways (solid clockwise, outline and ping counter-clockwise), each within one 72 degree tooth', () => {
    const c = resolveTwinStarsClock(100, false);
    expect(c.solid).toBeGreaterThan(0);
    expect(c.outline).toBeLessThan(0);
    expect(resolveTwinStarsPingRotation(100, false)).toBeLessThan(0);
    const tooth = (Math.PI * 2) / 5;
    for (let t = 0; t < 60000; t += 777) {
      const s = resolveTwinStarsClock(t, false);
      expect(Math.abs(s.solid)).toBeLessThan(tooth);
      expect(Math.abs(s.outline)).toBeLessThan(tooth);
    }
    // the solid star makes a full turn in base / solidTurns ms: one tooth = that / 5
    const toothMs = TWIN_STARS.spinPeriodMs / TWIN_STARS.solidTurns / 5;
    expect(resolveTwinStarsClock(toothMs / 2, false).solid).toBeCloseTo(tooth / 2, 9);
  });

  test('the start spiral does not spin in lockstep with the end stars', () => {
    const solidTurnMs = TWIN_STARS.spinPeriodMs / Math.abs(TWIN_STARS.solidTurns);
    const outlineTurnMs = TWIN_STARS.spinPeriodMs / Math.abs(TWIN_STARS.outlineTurns);
    for (const turnMs of [solidTurnMs, outlineTurnMs]) {
      expect(SEED_SPIRAL.spinPeriodMs).not.toBe(turnMs);
      expect(Number.isInteger(turnMs / SEED_SPIRAL.spinPeriodMs)).toBe(false);
    }
  });

  test('bead alpha steps up in a few bands from a faint centre to a solid rim', () => {
    const alphas = Array.from({ length: SEED_SPIRAL.beads }, (_, i) => resolveSeedBeadAlpha(i / (SEED_SPIRAL.beads - 1)));
    expect(alphas[0]).toBeCloseTo(SEED_SPIRAL.alphaBase, 9);
    expect(alphas[alphas.length - 1]).toBeCloseTo(1, 9);
    expect(new Set(alphas).size).toBe(SEED_SPIRAL.alphaBands);
    for (let i = 1; i < alphas.length; i += 1) expect(alphas[i]!).toBeGreaterThanOrEqual(alphas[i - 1]!);
  });
});

describe('drawBoardMarkers with the default skins (recorded calls)', () => {
  const draw = (extra: Partial<Parameters<typeof drawBoardMarkers>[1]> = {}) => {
    const rec = createRecordingContext();
    const stats = drawBoardMarkers(rec.ctx, { style: 'chip', tileSize: 14, devicePixelRatio: 2, ...extra });
    return { rec, stats };
  };

  test('start: one keyline fill for every bead, then one gold fill per alpha band; no strokes', () => {
    const { rec } = draw({ start: { x: 1, y: 1 } });
    const fills = rec.log.filter((e) => e.startsWith('set fillStyle='));
    expect(fills[0]).toBe(`set fillStyle=${cssRgb(boardMaterial.void)}`);
    expect(fills.slice(1)).toEqual(
      [...new Set(Array.from({ length: SEED_SPIRAL.beads }, (_, i) => resolveSeedBeadAlpha(i / (SEED_SPIRAL.beads - 1))))]
        .map((a) => `set fillStyle=${cssRgba(boardMaterial.start, a)}`)
    );
    expect(rec.count('fill(')).toBe(1 + SEED_SPIRAL.alphaBands);
    expect(rec.count('stroke(')).toBe(0);
    // every bead is a disc twice: its keyline and its gold
    expect(rec.count('arc(')).toBe(SEED_SPIRAL.beads * 2);
  });

  test('goal: the outline star (keyline stroke, then 0.9 red) under the solid star (keyline, shared border, red); no circles', () => {
    const { rec } = draw({ goal: { x: 3, y: 3 } });
    expect(rec.log.filter((e) => e.startsWith('set strokeStyle='))).toEqual([
      `set strokeStyle=${cssRgb(boardMaterial.void)}`,
      `set strokeStyle=${cssRgba(boardMaterial.goal, TWIN_STARS.outlineAlpha)}`,
      `set strokeStyle=${cssRgb(boardMaterial.void)}`,
      `set strokeStyle=${cssRgb(resolveSharedBorderColor(null, 0, true))}`
    ]);
    expect(rec.log.filter((e) => e.startsWith('set fillStyle='))).toEqual([
      `set fillStyle=${cssRgb(boardMaterial.void)}`,
      `set fillStyle=${cssRgb(resolveSharedBorderColor(null, 0, true))}`,
      `set fillStyle=${cssRgb(boardMaterial.goal)}`
    ]);
    expect(rec.count('arc(')).toBe(0);
    expect(rec.count('stroke(')).toBe(4);
  });

  test('both animate on endpointTimeMs; reduced motion draws the time-0 frame (the Guide icon)', () => {
    const at = (endpointTimeMs: number, reducedMotion = false) => draw({ start: { x: 1, y: 1 }, goal: { x: 5, y: 5 }, endpointTimeMs, reducedMotion }).rec.log;
    expect(at(700)).not.toEqual(at(0));
    expect(at(700, true)).toEqual(at(0));
    expect(at(700)).toEqual(at(700));
    const startOnly = (t: number) => draw({ start: { x: 1, y: 1 }, endpointTimeMs: t }).rec.log;
    const goalOnly = (t: number) => draw({ goal: { x: 5, y: 5 }, endpointTimeMs: t }).rec.log;
    expect(startOnly(400)).not.toEqual(startOnly(0));
    expect(goalOnly(400)).not.toEqual(goalOnly(0));
  });

  test('both default skins together stay a small, bounded draw', () => {
    const { rec, stats } = draw({ start: { x: 1, y: 1 }, goal: { x: 5, y: 5 }, endpointTimeMs: 900 });
    // seed spiral 1 + 4 fills, twin stars 2 outline strokes + 5 solid-star ops
    expect(stats.paintOps).toBeLessThanOrEqual(12);
    expect(rec.log.some((e) => e.includes('Gradient') || e.startsWith('set shadowBlur'))).toBe(false);
  });
});

describe('goal beacon ping follows the end skin', () => {
  const beacon = (timeMs: number, extra: Partial<Parameters<typeof drawGoalBeacon>[1]> = {}) => {
    const rec = createRecordingContext();
    const spec = drawGoalBeacon(rec.ctx, {
      goal: { x: 4, y: 4 }, tileSize: 14, devicePixelRatio: 2, originX: 0, originY: 0, opacity: 1, timeMs, reducedMotion: false, ...extra
    });
    return { rec, spec };
  };

  test('Twin stars: a five-point star ping whose tips sit on the ring radius it replaced, same stroke and alpha', () => {
    const { rec, spec } = beacon(600);
    expect(spec.ping?.shape).toBe('star5');
    expect(rec.count('arc(')).toBe(GOAL_BEACON.haloSteps);
    const pts = rec.log
      .filter((e) => e.startsWith('moveTo(') || e.startsWith('lineTo('))
      .slice(-10)
      .map((e) => e.slice(e.indexOf('(') + 1, -1).split(',').map(Number) as [number, number]);
    const cx = pts.reduce((n, p) => n + p[0], 0) / 10;
    const cy = pts.reduce((n, p) => n + p[1], 0) / 10;
    const tips = pts.filter((_, i) => i % 2 === 0).map(([x, y]) => Math.hypot(x - cx, y - cy));
    for (const r of tips) expect(r).toBeCloseTo(spec.ping!.radiusCss, 9);
    expect(rec.count('closePath(')).toBe(1);
    expect(rec.log).toContain(`set lineWidth=${GOAL_BEACON.pingStrokeCss}`);
    expect(rec.log).toContain(`set strokeStyle=${cssRgba(boardMaterial.goal, spec.ping!.alpha)}`);
  });

  test('the retired solid star keeps the round ping; reduced motion draws no ping', () => {
    const round = beacon(600, { endTileSkin: 'solid-star' });
    expect(round.spec.ping?.shape).toBe('circle');
    expect(round.rec.count('arc(')).toBe(GOAL_BEACON.haloSteps + 1);
    const still = beacon(600, { reducedMotion: true });
    expect(still.spec.ping).toBeNull();
    expect(still.rec.count('stroke(')).toBe(0);
  });
});

/* ----- real pixels: the default skins stay inside their tile at every size, DPR and clock time ----- */

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
const inputFor = (tileSize: number, devicePixelRatio: number, goal: BoardCell): BoardTileBakeInput => ({
  grid: GRID, width: GRID[0]!.length, height: GRID.length, tileSize, devicePixelRatio, goal
});
const same = (a: Rgba, b: Rgba): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

/** One cell per tile kind (cap, straight, corner, junction) plus one with a concave corner. */
const cells = ((): BoardCell[] => {
  const picked = new Map<string, BoardCell>();
  for (const t of computeChipGeometry(inputFor(14.72, 2, { x: 1, y: 1 }))) {
    const key = Object.values(t.concave).some(Boolean) ? 'concave' : t.kind;
    if (!picked.has(key)) picked.set(key, { x: t.x, y: t.y });
  }
  return [...picked.values()];
})();

const BAKES = new Map<string, RasterContext>();
const render = (tileSize: number, dpr: number, cell: BoardCell, kind: 'start' | 'goal', timeMs: number, reducedMotion = false) => {
  const input = inputFor(tileSize, dpr, cell);
  const layout = computeBoardTileLayout(input);
  const key = `${tileSize}|${dpr}|${cell.x},${cell.y}`;
  let base = BAKES.get(key);
  if (!base) {
    const surface = new RasterContext(layout.pixelWidth, layout.pixelHeight);
    bakeBoardTiles(input, () => ({ canvas: surface, ctx: surface as unknown as TileBakeContext2D }));
    base = surface.clone();
    BAKES.set(key, base);
  }
  const tile = computeChipTileAt(input, cell)!;
  const marked = base.clone();
  marked.paintStrokes = true;
  marked.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBoardMarkers(marked, {
    style: 'chip', tileSize, devicePixelRatio: dpr, originX: layout.originX, originY: layout.originY,
    [kind]: cell, [kind === 'goal' ? 'goalTile' : 'startTile']: tile, endpointTimeMs: timeMs, reducedMotion
  });
  const rect = {
    x0: Math.round((layout.originX + tile.left) * dpr),
    y0: Math.round((layout.originY + tile.top) * dpr),
    x1: Math.round((layout.originX + tile.left + tile.width) * dpr) - 1,
    y1: Math.round((layout.originY + tile.top + tile.height) * dpr) - 1
  };
  const changed: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < marked.height; y += 1) {
    for (let x = 0; x < marked.width; x += 1) {
      if (!same(base.pixel(x, y), marked.pixel(x, y))) changed.push({ x, y });
    }
  }
  return { base, marked, rect, changed, tile, layout };
};

// 15.6 and 2.625 are the live phone values seen in the field (fractional DPR, fractional tile).
const SIZES = [6.4, 10, 14.72, 15.6, 25.44];
const DPRS = [1, 2, 2.625, 3];
// 525 ms is the breath peak (largest spiral); the others catch the stars at mixed angles.
const TIMES = [0, 525, 1300, 4100];

describe.each(SIZES.flatMap((size) => DPRS.map((dpr) => [size, dpr] as const)))('default skins on real pixels: tile %f css px at DPR %f', (tileSize, dpr) => {
  test.each(['start', 'goal'] as const)('%s: painted, and every pixel stays inside the tile; the corners stay baked chip', (kind) => {
    for (const cell of cells) {
      for (const t of TIMES) {
        const r = render(tileSize, dpr, cell, kind, t);
        expect(r.changed.length, `${kind} paints something, cell ${cell.x},${cell.y} t=${t}`).toBeGreaterThan(0);
        for (const px of r.changed) {
          expect(px.x >= r.rect.x0 && px.x <= r.rect.x1 && px.y >= r.rect.y0 && px.y <= r.rect.y1,
            `bleed (${px.x},${px.y}) ${kind} cell ${cell.x},${cell.y} t=${t}`).toBe(true);
        }
        if (tileSize * dpr >= 10) {
          for (const [x, y] of [[r.rect.x0, r.rect.y0], [r.rect.x1, r.rect.y0], [r.rect.x0, r.rect.y1], [r.rect.x1, r.rect.y1]] as const) {
            expect(same(r.marked.pixel(x, y), r.base.pixel(x, y)), `corner (${x},${y}) ${kind} cell ${cell.x},${cell.y} t=${t}`).toBe(true);
          }
        }
      }
    }
  });

  test('goal at rest (reduced motion, tips up): the twin stars are centred on the tile optical centre horizontally', () => {
    for (const cell of cells) {
      const r = render(tileSize, dpr, cell, 'goal', 900, true);
      const xs = r.changed.map((px) => px.x + 0.5);
      const aim = (r.layout.originX + resolveGoalStarCentre(r.tile).x) * dpr;
      expect(Math.abs(((Math.min(...xs) + Math.max(...xs)) / 2) - aim), `cell ${cell.x},${cell.y}`).toBeLessThanOrEqual(1);
    }
  });
});
