import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { drawBoardMarkers } from '../../src/render/boardTileBake';
import {
  BOARD_MARKER_MIN_CSS,
  BOARD_TILE_GEOMETRY,
  boardMaterial,
  resolveGoalEffectiveTile
} from '../../src/render/boardTileStyle';
import { GOAL_BEACON, drawGoalBeacon, resolveGoalBeacon } from '../../src/render/goalBeacon';
import { PhaserGraphicsTileContext } from '../../src/render/phaserTileContext';
import { drawTrailLayersToCanvasContext } from '../../src/render/trailLayersCanvas';
import { IRIDESCENT_TRAIL_CORE_STOPS } from '../../src/render/trailIridescence';
import {
  TRAIL_FADE_ALPHA_MIN,
  TRAIL_FLOOR_COLORS,
  TRAIL_MAX_CORE_TILE_RATIO,
  TRAIL_MIN_CORE_CSS,
  TRAIL_UNDERLAY_ALPHA,
  compositeTrailUnderlay,
  contrastRatio,
  mixRgb,
  resolveTrailWidths,
  trailCoreContrast
} from '../../src/render/trailLegibility';

const MENU_SCENE = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n?/g, '\n');

/** Every resting stop plus 63 in-between samples of each neighbouring pair (the trail lerps between stops). */
const restingSamples = (): number[] => {
  const samples: number[] = [];
  const stops = IRIDESCENT_TRAIL_CORE_STOPS;
  for (let i = 0; i < stops.length - 1; i += 1) {
    for (let s = 0; s <= 64; s += 1) {
      samples.push(mixRgb(stops[i]!, stops[i + 1]!, s / 64));
    }
  }
  return samples;
};

describe('trail width on dense boards', () => {
  test('the core is at least 3.5 css px on every tile size from 6.4 up, and never wider than 55% of the tile', () => {
    for (let tile = 6.4; tile <= 80; tile += 0.1) {
      const { coreWidth } = resolveTrailWidths(tile);
      expect(coreWidth, `tile ${tile.toFixed(1)}`).toBeGreaterThanOrEqual(3.5);
      expect(coreWidth, `tile ${tile.toFixed(1)}`).toBeLessThanOrEqual((tile * TRAIL_MAX_CORE_TILE_RATIO) + 1e-9);
    }
    expect(TRAIL_MIN_CORE_CSS).toBeGreaterThanOrEqual(3.5);
  });

  test('big tiles keep the Navigation Core 16% ratio; the old 1.5 px trail on a ~10 px tile is gone', () => {
    expect(resolveTrailWidths(40).coreWidth).toBeCloseTo(6.4, 5);
    expect(resolveTrailWidths(10).coreWidth).toBeGreaterThanOrEqual(3.5);
    expect(resolveTrailWidths(10).coreWidth).toBeGreaterThan(10 * 0.16 * 2);
  });

  test('the underlay and glow widen with the core', () => {
    for (const tile of [6.4, 10, 14, 25, 40, 80]) {
      const w = resolveTrailWidths(tile);
      expect(w.underlayWidth, `tile ${tile}`).toBeGreaterThanOrEqual(w.coreWidth + 3);
      expect(w.glowWidth, `tile ${tile}`).toBeGreaterThanOrEqual(w.coreWidth * 2.2 - 1e-9);
    }
  });
});

describe('trail contrast against the real Chip floor (chip fill, lit rim, gap)', () => {
  const floors = Object.entries(TRAIL_FLOOR_COLORS);

  test('the floor colours are the bake\'s own', () => {
    expect(TRAIL_FLOOR_COLORS.chip).toBe(boardMaterial.chip);
    expect(TRAIL_FLOOR_COLORS.rim).toBe(boardMaterial.rim);
    expect(TRAIL_FLOOR_COLORS.gap).toBe(boardMaterial.void);
  });

  test('every iridescent resting hue (stops and every in-between colour) clears 4.5:1 against its underlay on every floor', () => {
    expect(IRIDESCENT_TRAIL_CORE_STOPS.length).toBe(5);
    for (const sample of restingSamples()) {
      for (const [name, floor] of floors) {
        expect(trailCoreContrast(sample, floor, 1), `0x${sample.toString(16)} on ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test('the faded tail (Trail Fade floor alpha) still clears 3:1 for every hue on every floor, so it holds until it expires', () => {
    expect(TRAIL_FADE_ALPHA_MIN).toBeGreaterThanOrEqual(0.7);
    for (const sample of restingSamples()) {
      for (const [name, floor] of floors) {
        expect(trailCoreContrast(sample, floor, TRAIL_FADE_ALPHA_MIN), `0x${sample.toString(16)} on ${name}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test('the dark underlay stands off the chip it sits on by at least 3:1, and off the lit rim by far more', () => {
    expect(contrastRatio(compositeTrailUnderlay(boardMaterial.chip), boardMaterial.chip)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(compositeTrailUnderlay(boardMaterial.rim), boardMaterial.rim)).toBeGreaterThanOrEqual(10);
  });

  test('the underlay is near-opaque', () => {
    expect(TRAIL_UNDERLAY_ALPHA).toBeGreaterThanOrEqual(0.9);
  });
});

describe('trail wiring in the scene', () => {
  test('widths, fade floor and underlay come from trailLegibility; colour, pulse and breath from trailIridescence; the underlay ignores the age fade', () => {
    expect(MENU_SCENE).toContain("from '../render/trailLegibility'");
    expect(MENU_SCENE).toContain("from '../render/trailIridescence'");
    expect(MENU_SCENE).toContain('const restingWidths = resolveTrailWidths(tileSize);');
    expect(MENU_SCENE).toContain('sampleIridescentTrail(colorPhaseTiles, trailColourTimeMs, !trailAnimated)');
    expect(MENU_SCENE).toContain('const LEGACY_PLAY_TRAIL_AGE_ALPHA_MIN = TRAIL_FADE_ALPHA_MIN;');
    expect(MENU_SCENE).toContain('underlayAlpha: alphaMultiplier');
    expect(MENU_SCENE).not.toContain('LEGACY_NAV_CORE_TRAIL_CALM_ENERGY_STOPS');
  });

  test('the trail-tail fade is pinned off (Trail Fade retired) and Reduce Motion alone gates the shine', () => {
    expect(MENU_SCENE).toContain('const trailFadeEnabled = TRAIL_TAIL_FADE;');
    expect(MENU_SCENE).not.toContain('this.settings.toggleTrailFade');
    expect(MENU_SCENE).toContain('const shineEnabled = trailMotionPlan.shineVisible;');
    expect(MENU_SCENE).toContain('const trailAnimated = shineEnabled;');
  });
});

interface Recorded { op: string; args: unknown[] }

const recordGraphics = (): { calls: Recorded[]; graphics: import('phaser').GameObjects.Graphics } => {
  const calls: Recorded[] = [];
  const rec = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); };
  const graphics = {
    beginPath: rec('beginPath'), closePath: rec('closePath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    arc: rec('arc'), fillStyle: rec('fillStyle'), lineStyle: rec('lineStyle'), fillPath: rec('fillPath'),
    strokePath: rec('strokePath'), fillRect: rec('fillRect')
  } as unknown as import('phaser').GameObjects.Graphics;
  return { calls, graphics };
};

const drawGoal = (tileSize: number, minimum?: { goalBadgeDiameterCss?: number; startTileCss?: number }, style: 'chip' | 'trace' = 'chip'): Recorded[] => {
  const { calls, graphics } = recordGraphics();
  drawBoardMarkers(new PhaserGraphicsTileContext(graphics), {
    style, tileSize, devicePixelRatio: 2, goal: { x: 3, y: 4 }, minimumMarkerSizes: minimum
  });
  return calls;
};

const starArea = (calls: Recorded[]): number => {
  // the goal star is the only closed 10-point polygon in the goal draw
  const points = calls.filter((c) => c.op === 'moveTo' || c.op === 'lineTo');
  const polygon = points.slice(-10).map((c) => ({ x: c.args[0] as number, y: c.args[1] as number }));
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    sum += (a.x * b.y) - (b.x * a.y);
  }
  return Math.abs(sum) / 2;
};

const largestRadius = (calls: Recorded[]): number => Math.max(...calls.filter((c) => c.op === 'arc').map((c) => c.args[2] as number));

describe('goal end marker (Chip): a star on the tile, at every size', () => {
  test('the star is never larger than the tile and there is no disc, ring or pad: from a 4 px tile to an 80 px tile', () => {
    for (let tile = 4; tile <= 80; tile += 0.5) {
      // opting in to the css-px floors changes nothing: the Chip end marker ignores them
      const floored = drawGoal(tile, BOARD_MARKER_MIN_CSS);
      const plain = drawGoal(tile);
      expect(JSON.stringify(floored), `tile ${tile}`).toBe(JSON.stringify(plain));
      expect(plain.filter((c) => c.op === 'arc'), `tile ${tile} draws no circle`).toHaveLength(0);
      // the cell is (3, 4): centre at (3.5 tile, 4.5 tile); every vertex is inside the inscribed circle
      const cx = 3.5 * tile;
      const cy = 4.5 * tile;
      for (const c of plain.filter((p) => p.op === 'moveTo' || p.op === 'lineTo')) {
        const d = Math.hypot((c.args[0] as number) - cx, (c.args[1] as number) - cy);
        expect(d, `tile ${tile}`).toBeLessThanOrEqual((tile / 2) + 1e-6);
      }
    }
  });

  test('the red star keeps its proportions and scales with the tile (no css-px floor)', () => {
    let previous = 0;
    for (const tile of [6.45, 9.95, 10.77, 12.48, 14.72, 16.66, 20.58, 25.48, 40, 80]) {
      const area = starArea(drawGoal(tile));
      expect(area, `tile ${tile}`).toBeGreaterThan(previous);
      previous = area;
      const k = BOARD_TILE_GEOMETRY.endpoint;
      const half = (tile / 2);
      const outerR = half * k.goalStarOuterOfRadius;
      // a regular 5-point star has area ~ 5 * outer * inner * sin(36 deg)
      const expected = 5 * outerR * (half * k.goalStarInnerOfRadius) * Math.sin(Math.PI / 5);
      expect(area / expected, `tile ${tile}`).toBeGreaterThan(0.2); // FITTED inside the lit rim with its keyline (endpointTiles.ts), never above nominal
      expect(area / expected, `tile ${tile}`).toBeLessThan(1.1);
    }
  });

  test('same artwork on every size: only the scale changes (colours and order of the calls are the same)', () => {
    const shape = (calls: Recorded[]): string => calls.map((c) => c.op).join(',');
    const fills = (calls: Recorded[]): unknown[] => calls.filter((c) => c.op === 'fillStyle').map((c) => c.args[0]);
    expect(shape(drawGoal(6.45))).toBe(shape(drawGoal(40)));
    expect(fills(drawGoal(6.45))).toEqual(fills(drawGoal(40)));
    expect(fills(drawGoal(6.45))).toContain(boardMaterial.goal);
  });

  test('the Trace style (the alternate) keeps its css-px floors, as before', () => {
    expect(BOARD_MARKER_MIN_CSS.goalBadgeDiameterCss).toBeGreaterThanOrEqual(22);
    for (let tile = 4; tile <= 80; tile += 0.5) {
      const radius = largestRadius(drawGoal(tile, BOARD_MARKER_MIN_CSS, 'trace'));
      expect(radius * 2, `tile ${tile}`).toBeGreaterThanOrEqual(BOARD_MARKER_MIN_CSS.goalBadgeDiameterCss - 0.6);
    }
    expect(JSON.stringify(drawGoal(40, BOARD_MARKER_MIN_CSS, 'trace'))).toBe(JSON.stringify(drawGoal(40, undefined, 'trace')));
    expect(resolveGoalEffectiveTile(40, 22)).toBe(40);
  });

  test('the Guide icons do not opt in, so they are exactly as drawn before', () => {
    expect(MENU_SCENE.slice(MENU_SCENE.indexOf('private drawLegacyGuideBoardMarker(')))
      .not.toMatch(/^[\s\S]{0,1500}minimumMarkerSizes/);
  });

  test('the play board still passes the floors (the Trace style honours them), and the beacon keeps its own css-px sizing', () => {
    const fn = MENU_SCENE.slice(MENU_SCENE.indexOf('private fillPlayDynamicMarkerTile('));
    expect(fn.slice(0, 4500)).toContain('minimumMarkerSizes: BOARD_MARKER_MIN_CSS');
    expect(fn.slice(0, 4500)).toContain('minBadgeDiameterCss: BOARD_MARKER_MIN_CSS.goalBadgeDiameterCss');
    // the start's floor stays below the goal's, as before
    expect(BOARD_MARKER_MIN_CSS.startTileCss).toBeLessThan(resolveGoalEffectiveTile(0, BOARD_MARKER_MIN_CSS.goalBadgeDiameterCss));
  });
});

describe('goal beacon (css-px halo and ping)', () => {
  test('the halo is at least 34 css px out on every tile size, outside the badge', () => {
    for (let tile = 4; tile <= 80; tile += 1) {
      const spec = resolveGoalBeacon({ tileSize: tile, timeMs: 0, reducedMotion: false });
      expect(spec.haloRadiusCss, `tile ${tile}`).toBeGreaterThanOrEqual(GOAL_BEACON.minHaloRadiusCss);
      expect(spec.haloRadiusCss, `tile ${tile}`).toBeGreaterThan(spec.badgeRadiusCss);
    }
  });

  test('it is low alpha (never overpowers the trail or the star) and it pulses between 65% and 100% of the peak', () => {
    const alphas: number[] = [];
    for (let t = 0; t < GOAL_BEACON.pulsePeriodMs; t += 50) {
      alphas.push(resolveGoalBeacon({ tileSize: 10, timeMs: t, reducedMotion: false }).haloAlpha);
    }
    expect(Math.max(...alphas)).toBeLessThanOrEqual(0.4);
    expect(Math.max(...alphas)).toBeCloseTo(GOAL_BEACON.haloPeakAlpha, 2);
    expect(Math.min(...alphas)).toBeCloseTo(GOAL_BEACON.haloPeakAlpha * (1 - GOAL_BEACON.pulseSwing), 2);
  });

  test('a ping expands once per period and is otherwise absent', () => {
    const early = resolveGoalBeacon({ tileSize: 10, timeMs: 100, reducedMotion: false });
    const later = resolveGoalBeacon({ tileSize: 10, timeMs: 1300, reducedMotion: false });
    const idle = resolveGoalBeacon({ tileSize: 10, timeMs: 3000, reducedMotion: false });
    expect(early.ping).not.toBeNull();
    expect(later.ping!.radiusCss).toBeGreaterThan(early.ping!.radiusCss);
    expect(later.ping!.alpha).toBeLessThan(early.ping!.alpha);
    expect(idle.ping).toBeNull();
    expect(later.ping!.radiusCss).toBeLessThanOrEqual(early.haloRadiusCss * GOAL_BEACON.pingTravel + 1e-6);
  });

  test('reduced motion: static halo, no ping, at any time', () => {
    const a = resolveGoalBeacon({ tileSize: 10, timeMs: 100, reducedMotion: true });
    const b = resolveGoalBeacon({ tileSize: 10, timeMs: 1700, reducedMotion: true });
    expect(a).toEqual(b);
    expect(a.ping).toBeNull();
    expect(a.haloAlpha).toBeGreaterThan(0.2);
  });

  test('it draws goal-coloured discs (and a stroked ring only while pinging) into its own context', () => {
    const run = (timeMs: number, reducedMotion: boolean): Recorded[] => {
      const { calls, graphics } = recordGraphics();
      drawGoalBeacon(new PhaserGraphicsTileContext(graphics), {
        goal: { x: 3, y: 4 }, tileSize: 10, devicePixelRatio: 2, originX: 0, originY: 0, timeMs, reducedMotion, opacity: 1
      });
      return calls;
    };
    const pinging = run(400, false);
    expect(pinging.filter((c) => c.op === 'fillPath').length).toBe(GOAL_BEACON.haloSteps);
    expect(pinging.filter((c) => c.op === 'strokePath').length).toBe(1);
    expect(pinging.filter((c) => c.op === 'fillStyle').every((c) => c.args[0] === boardMaterial.goal)).toBe(true);
    expect(run(3000, false).filter((c) => c.op === 'strokePath').length).toBe(0);
    expect(run(400, true).filter((c) => c.op === 'strokePath').length).toBe(0);
    expect(largestRadius(pinging)).toBeGreaterThanOrEqual(GOAL_BEACON.minHaloRadiusCss);
  });

  test('the beacon layer sits above the baked tiles and BELOW the trail canvas, and is cleared with the dynamic layer', () => {
    expect(MENU_SCENE).toContain('      this.boardTileLayer.image,\n      this.goalBeaconGraphics,\n');
    expect(MENU_SCENE.indexOf('this.goalBeaconGraphics,')).toBeLessThan(MENU_SCENE.indexOf('this.trailCanvasImage,\n      this.playerGlowCanvasImage'));
    expect(MENU_SCENE).toContain('this.boardDynamicGraphics.clear();\n    this.goalBeaconGraphics.clear();');
  });
});

describe('trail layer order (bloom, underlay, core)', () => {
  test('strokes the bloom with a shadow, then the near-opaque underlay at its own width, then the core, and leaves no shadow behind', () => {
    const events: string[] = [];
    const props: Record<string, unknown> = { shadowBlur: 0, shadowColor: '', lineWidth: 1, strokeStyle: '' };
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, name: string) => (['save', 'restore', 'beginPath', 'moveTo', 'lineTo'].includes(name)
        ? () => undefined
        : name === 'stroke'
          ? () => events.push(`${props.lineWidth}|blur${props.shadowBlur}|${String(props.strokeStyle)}`)
          : props[name]),
      set: (_t, name: string, value: unknown) => { props[name] = value; return true; }
    }) as unknown as CanvasRenderingContext2D;
    const segment = { previous: { x: 0, y: 0 }, current: { x: 10, y: 0 }, glowColor: 0x45a4c0, coreColor: 0x70b0d0, alpha: 0.5, underlayAlpha: 1 };
    drawTrailLayersToCanvasContext(ctx, [segment], {
      originX: 0, originY: 0, coreWidth: 4, glowWidth: 9, underlayWidth: 7, glowAlphaRatio: 0.2, glowBlurPx: 6,
      underlayColor: boardMaterial.void, underlayAlpha: TRAIL_UNDERLAY_ALPHA
    });
    expect(events.length).toBe(3);
    expect(events[0]).toMatch(/^9\|blur6\|/);
    expect(events[1]).toMatch(new RegExp(`^7\|blur0\|rgba\(${(boardMaterial.void >> 16) & 255},${(boardMaterial.void >> 8) & 255},${boardMaterial.void & 255},0\.94\)$`));
    expect(events[2]).toMatch(/^4\|blur0\|rgba\(112,176,208,0\.5\)$/);
    expect(props.shadowBlur).toBe(0);
  });
});
