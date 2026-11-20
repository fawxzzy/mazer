// MAZER-VIS-063: the gate tile's look (darker floor + corner brackets) around an UNCHANGED Pulse ring.
import { describe, expect, test } from 'vitest';
import { generateLadderMaze, LADDER_BOARDS } from '../../scripts/analysis/lib/progressionLadderSampling';
import { BLEED_GATE_FIRST_LEVEL } from '../../src/legacy-runtime/legacyBleedGates';
import { BLEED_GATE_ANIMATION_MS, syncLegacyBleedGatePassOver } from '../../src/legacy-runtime/legacyBleedGateState';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import {
  BLEED_GATE_LIT,
  BLEED_GATE_PULSE_RATE,
  drawBleedGatePlan,
  resolveBleedGateDrawPlan,
  type BleedGateGraphics
} from '../../src/render/bleedGateRenderer';
import { drawLegacyBleedGateLayer } from '../../src/render/bleedGateSceneLayer';
import {
  BLEED_GATE_BRACKET_GEOMETRY,
  BLEED_GATE_BRACKET_IDLE,
  BLEED_GATE_BRACKET_LIT,
  BLEED_GATE_FLOOR,
  resolveBleedGateBrackets,
  resolveBleedGateBracketStyle,
  resolveBoardTileGates
} from '../../src/render/bleedGateTileLook';
import {
  bakeBoardTiles,
  computeBleedGateBracketPlans,
  computeBoardTileBakeHash,
  type BoardTileBakeInput
} from '../../src/render/boardTileBake';
import { BOARD_CHIP_FILL, cssRgb } from '../../src/render/boardTileStyle';
import { contrast, corridorGrid, createRecordingSurface, inputFor, luminance } from './support/boardTileFixtures';

// Records every Graphics call (numbers rounded to 1e-6 so the text is stable).
const recordCalls = (): { graphics: BleedGateGraphics; log: string[] } => {
  const log: string[] = [];
  const graphics = new Proxy({}, {
    get: (_target, key) => (...args: unknown[]) => {
      log.push(`${String(key)}(${args.map((a) => (typeof a === 'number' ? Number(a.toFixed(6)) : String(a))).join(',')})`);
    }
  }) as BleedGateGraphics;
  return { graphics, log };
};

// cyrb53 over the call log.
const fingerprint = (text: string): string => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
};

const ringLog = (): string => {
  const { graphics, log } = recordCalls();
  for (const axis of ['horizontal', 'vertical'] as const) {
    for (const tileSize of [14, 15.6, 20, 39]) {
      for (const activation of [0, 0.4, 1]) {
        for (const timeSec of [0, 0.37, 3.2]) {
          for (const reducedMotion of [false, true]) {
            drawBleedGatePlan(graphics, resolveBleedGateDrawPlan({
              axis, centerX: 50.5, centerY: 61.25, tileSize, activation, timeSec, reducedMotion
            }), 0.8);
          }
        }
      }
    }
  }
  return log.join('\n');
};

describe('the Pulse ring is unchanged by the gate look', () => {
  test('ring draw calls match the pre-change ring output exactly (fingerprint taken on main 6944c999)', () => {
    expect(fingerprint(ringLog())).toBe('0e668ce7067074');
  });
});

describe('gate tile colours (Zac pick 2026-11-19: C + D)', () => {
  test('dark floor #1F3A38, idle brackets #F2FBFA, lit brackets the ring lit cyan #6BE8E1', () => {
    expect(BLEED_GATE_FLOOR).toBe(0x1f3a38);
    expect(BLEED_GATE_BRACKET_IDLE).toBe(0xf2fbfa);
    expect(BLEED_GATE_BRACKET_LIT).toBe(BLEED_GATE_LIT);
    expect(BLEED_GATE_LIT).toBe(0x6be8e1);
  });

  test('the dark floor is darker than the chip but above the wall void; the brackets stand out on it', () => {
    expect(luminance(BLEED_GATE_FLOOR)).toBeLessThan(luminance(BOARD_CHIP_FILL));
    expect(contrast(BLEED_GATE_FLOOR, 0x03070b)).toBeGreaterThan(1.5);
    expect(contrast(BLEED_GATE_BRACKET_IDLE, BLEED_GATE_FLOOR)).toBeGreaterThan(10);
    expect(contrast(BLEED_GATE_BRACKET_LIT, BLEED_GATE_FLOOR)).toBeGreaterThan(5);
  });
});

const ringOuter = (tileSize: number): number => {
  const ring = resolveBleedGateDrawPlan({ axis: 'horizontal', centerX: 0, centerY: 0, tileSize, activation: 0, timeSec: 0 });
  return ring.radius + (ring.lineWidth / 2);
};

const tileOf = (tileSize: number, rim: number, radius: number) => ({
  left: 0,
  top: 0,
  width: tileSize,
  height: tileSize,
  fill: { left: rim, top: rim, width: tileSize - (2 * rim), height: tileSize - (2 * rim) },
  // A dead-end tile (the most rounded a gate tile gets): its two closed-end corners are rounded.
  fillRadii: [radius, radius, 0, 0] as const
});

describe('corner bracket geometry', () => {
  const sizes = [12, 13.5, 14, 14.72, 15.6, 20, 28, 39, 40];
  const scales = [1, 2, 2.625, 3];

  test('four L brackets inside the fill, clear of the rounded corners; corners clear the ring, arms stop at it', () => {
    for (const tileSize of sizes) {
      // Phone-sized tiles only occur on phones (DPR 2 and up); DPR 1 is a desktop with big tiles.
      for (const scale of scales.filter((value) => value >= 2 || tileSize >= 20)) {
        const rim = tileSize * 0.1;
        const radius = (tileSize * 0.3) - rim; // chip corner 0.3 T, minus the rim (computeChipGeometry)
        const tile = tileOf(tileSize, rim, radius);
        const outer = ringOuter(tileSize);
        const plan = resolveBleedGateBrackets({ tile, tileSize, scale, ringOuterRadius: outer });
        expect(plan.brackets).toHaveLength(4);
        const half = plan.lineWidth / 2;
        const c = tileSize / 2;
        plan.brackets.forEach((bracket, index) => {
          expect(bracket).toHaveLength(3);
          for (const point of bracket) {
            expect(point.x - half).toBeGreaterThanOrEqual(tile.fill.left - 1e-9);
            expect(point.y - half).toBeGreaterThanOrEqual(tile.fill.top - 1e-9);
            expect(point.x + half).toBeLessThanOrEqual(tile.fill.left + tile.fill.width + 1e-9);
            expect(point.y + half).toBeLessThanOrEqual(tile.fill.top + tile.fill.height + 1e-9);
          }
          // The bracket corner never touches the ring; an arm is shortened toward the ring but keeps one stroke
          // width so the bracket still reads as an L on a phone tile.
          const corner = bracket[1]!;
          // Square fill corners always clear the ring. A rounded fill corner has less room than a bracket needs;
          // the rim wins, so that bracket may graze the ring's outer edge (the ring is drawn on top) by a fraction
          // of a css px.
          const overlap = outer - (Math.hypot(corner.x - c, corner.y - c) - half);
          if (tile.fillRadii[index]! > 0) {
            expect(overlap).toBeLessThan(0.6);
          } else {
            expect(overlap).toBeLessThanOrEqual(1e-9);
          }
          for (const end of [bracket[0]!, bracket[2]!]) {
            const arm = Math.hypot(end.x - corner.x, end.y - corner.y);
            const clear = Math.hypot(end.x - c, end.y - c) - half >= outer - 1e-9;
            expect(clear || Math.abs(arm - plan.lineWidth) < 1e-9).toBe(true);
          }
          const r = tile.fillRadii[index]!;
          if (r > 0) {
            const corner = bracket[1]!;
            const arcX = index === 0 || index === 3 ? tile.fill.left + r : tile.fill.left + tile.fill.width - r;
            const arcY = index < 2 ? tile.fill.top + r : tile.fill.top + tile.fill.height - r;
            expect(Math.hypot(corner.x - arcX, corner.y - arcY) + half).toBeLessThanOrEqual(r + 1e-6);
          }
        });
      }
    }
  });

  test('device-pixel snapped: whole-device-px stroke whose edges land on device px', () => {
    for (const tileSize of sizes) {
      for (const scale of scales) {
        const plan = resolveBleedGateBrackets({ tile: tileOf(tileSize, 1.5, 4), tileSize, scale, ringOuterRadius: ringOuter(tileSize) });
        const lineDevice = plan.lineWidth * scale;
        expect(Math.abs(lineDevice - Math.round(lineDevice))).toBeLessThan(1e-9);
        expect(plan.lineWidth).toBeGreaterThanOrEqual(1 - 1e-9);
        for (const point of plan.brackets.flat()) {
          for (const v of [point.x, point.y]) {
            const edge = (v - (plan.lineWidth / 2)) * scale;
            expect(Math.abs(edge - Math.round(edge))).toBeLessThan(1e-6);
          }
        }
      }
    }
  });

  test('at the design chip size the options page shares hold (corner 8, arm 16, stroke 6 of 92)', () => {
    const plan = resolveBleedGateBrackets({ tile: tileOf(92, 0, 0), tileSize: 92, scale: 1, ringOuterRadius: 0 });
    expect(plan.lineWidth).toBe(6);
    expect(plan.brackets[0]).toEqual([{ x: 8, y: 24 }, { x: 8, y: 8 }, { x: 24, y: 8 }]);
  });
});

describe('bracket style', () => {
  test('asleep: idle white at full alpha (what the bake shows); lit: cyan breathing on the ring pulse clock', () => {
    expect(resolveBleedGateBracketStyle({ activation: 0, timeSec: 1.3 })).toEqual({ color: BLEED_GATE_BRACKET_IDLE, alpha: 1 });
    const alphas: number[] = [];
    for (let t = 0; t < 1 / BLEED_GATE_PULSE_RATE; t += 0.005) {
      const look = resolveBleedGateBracketStyle({ activation: 1, timeSec: t });
      expect(look.color).toBe(BLEED_GATE_BRACKET_LIT);
      alphas.push(look.alpha);
    }
    expect(Math.max(...alphas)).toBeCloseTo(1, 3);
    expect(Math.min(...alphas)).toBeCloseTo(BLEED_GATE_BRACKET_GEOMETRY.litAlphaMin, 2);
    expect(resolveBleedGateBracketStyle({ activation: 1, timeSec: 0.2 }).alpha)
      .toBeCloseTo(resolveBleedGateBracketStyle({ activation: 1, timeSec: 0.2 + (1 / BLEED_GATE_PULSE_RATE) }).alpha, 9);
  });

  test('Reduce Motion: no breathing', () => {
    expect(resolveBleedGateBracketStyle({ activation: 1, timeSec: 0.4, reducedMotion: true })).toEqual({ color: BLEED_GATE_LIT, alpha: 1 });
  });
});

const bake = (input: BoardTileBakeInput) => {
  const surface = createRecordingSurface();
  const result = bakeBoardTiles(input, surface.factory);
  return { result, log: surface.rec.log };
};

describe('board bake: gate floor and idle brackets', () => {
  const grid = corridorGrid();
  const gate = { x: 12, y: 20 };
  const darkFill = `set fillStyle=${cssRgb(BLEED_GATE_FLOOR)}`;
  const whiteStroke = `set strokeStyle=${cssRgb(BLEED_GATE_BRACKET_IDLE)}`;

  test('a gateless board keeps its hash; gates and their lit state change it', () => {
    const plain = computeBoardTileBakeHash(inputFor(grid));
    expect(computeBoardTileBakeHash(inputFor(grid, { gates: [] }))).toBe(plain);
    expect(computeBoardTileBakeHash(inputFor(grid, { gates: [{ x: 0, y: 0 }] }))).toBe(plain);
    const idle = computeBoardTileBakeHash(inputFor(grid, { gates: [gate] }));
    const lit = computeBoardTileBakeHash(inputFor(grid, { gates: [{ ...gate, lit: true }] }));
    expect(idle).not.toBe(plain);
    expect(lit).not.toBe(idle);
  });

  test('chip style: the gate fill is painted dark and an idle gate gets four white brackets in one stroke', () => {
    const { log } = bake(inputFor(grid, { gates: [gate], style: 'chip' }));
    expect(log).toContain(darkFill);
    const white = log.indexOf(whiteStroke);
    expect(white).toBeGreaterThan(-1);
    const after = log.slice(white);
    expect(after.filter((entry) => entry === 'stroke()')).toHaveLength(1);
    expect(after.filter((entry) => entry.startsWith('moveTo('))).toHaveLength(4);
    expect(log.slice(0, white)).toContain('set lineCap=butt');
  });

  test('a lit gate keeps the dark floor but its brackets are left to the live layer', () => {
    const { log } = bake(inputFor(grid, { gates: [{ ...gate, lit: true }], style: 'chip' }));
    expect(log).toContain(darkFill);
    expect(log).not.toContain(whiteStroke);
  });

  test('no gates: no gate paint', () => {
    const { log } = bake(inputFor(grid));
    expect(log).not.toContain(darkFill);
    expect(log).not.toContain(whiteStroke);
  });

  test('the bracket plans the scene uses are the ones the bake strokes (fractional DPR)', () => {
    const input = inputFor(grid, { gates: [gate], devicePixelRatio: 2.625, tileSize: 14.72 });
    const plan = computeBleedGateBracketPlans(input).get('12,20')!;
    expect(plan.brackets).toHaveLength(4);
    const { log } = bake(input);
    const moves = log.slice(log.indexOf(whiteStroke)).filter((entry) => entry.startsWith('moveTo('));
    expect(moves).toEqual(plan.brackets.map((bracket) => `moveTo(${bracket[0]!.x},${bracket[0]!.y})`));
  });

  test('resolveBoardTileGates maps gates and their lit state', () => {
    expect(resolveBoardTileGates([{ x: 1, y: 2, axis: 'h' }, { x: 3, y: 4, axis: 'v' }], (g) => g.axis === 'v'))
      .toEqual([{ x: 1, y: 2, lit: false }, { x: 3, y: 4, lit: true }]);
    expect(resolveBoardTileGates(undefined, () => true)).toEqual([]);
  });
});

describe('scene layer: lit brackets under the unchanged ring', () => {
  const SEED = 20261106;
  const gated = (() => {
    for (let level = BLEED_GATE_FIRST_LEVEL; level <= 80; level += 1) {
      const maze = generateLadderMaze(level, LADDER_BOARDS[0], SEED + level) as LegacyMazeSnapshot;
      if (maze.bleedGates?.[0]) return maze;
    }
    throw new Error('no gated ladder maze');
  })();
  const plan = resolveBleedGateBrackets({ tile: tileOf(20, 2, 0), tileSize: 20, scale: 1, ringOuterRadius: ringOuter(20) });

  test('asleep: only the ring is drawn live (idle brackets are baked)', () => {
    const run = { ...gated, bleedGates: [...gated.bleedGates!] };
    const gate = run.bleedGates[0]!;
    const plans = new Map([[`${gate.x},${gate.y}`, plan]]);
    const base = { maze: run, mazeLeft: 0, mazeTop: 0, tileSize: 20, nowMs: 0, reducedMotion: false, fieldColor: 0 };
    const without = recordCalls();
    drawLegacyBleedGateLayer(without.graphics, base);
    const withPlans = recordCalls();
    drawLegacyBleedGateLayer(withPlans.graphics, { ...base, brackets: { origin: { x: 5, y: 7 }, plans } });
    expect(withPlans.log).toEqual(without.log);
  });

  test('lit: four cyan brackets first, then exactly the ring calls drawn without brackets', () => {
    const run = { ...gated, bleedGates: [...gated.bleedGates!] };
    const gate = run.bleedGates[0]!;
    syncLegacyBleedGatePassOver(run, { x: gate.x, y: gate.y }, [], 0);
    const plans = new Map([[`${gate.x},${gate.y}`, plan]]);
    const nowMs = BLEED_GATE_ANIMATION_MS + 50;
    const base = { maze: run, mazeLeft: 0, mazeTop: 0, tileSize: 20, nowMs, reducedMotion: false, fieldColor: 0 };
    const without = recordCalls();
    drawLegacyBleedGateLayer(without.graphics, base);
    const withPlans = recordCalls();
    drawLegacyBleedGateLayer(withPlans.graphics, { ...base, brackets: { origin: { x: 5, y: 7 }, plans } });
    const bracketCalls = withPlans.log.slice(0, withPlans.log.length - without.log.length);
    expect(withPlans.log.slice(bracketCalls.length)).toEqual(without.log);
    const look = resolveBleedGateBracketStyle({ activation: 1, timeSec: nowMs / 1000 });
    expect(bracketCalls[0]).toBe(`lineStyle(${Number(plan.lineWidth.toFixed(6))},${BLEED_GATE_LIT},${Number(look.alpha.toFixed(6))})`);
    expect(bracketCalls.filter((call) => call.startsWith('strokePath'))).toHaveLength(4);
    const first = plan.brackets[0]![0]!;
    expect(bracketCalls[2]).toBe(`moveTo(${Number((first.x + 5).toFixed(6))},${Number((first.y + 7).toFixed(6))})`);
  });
});
