import { describe, expect, test } from 'vitest';
import {
  SPARK_PLAYER,
  SparkHeading,
  createSparkFrame,
  createSparkMaterial,
  drawSparkPlayer,
  resolveShortestTurn,
  resolveSparkFrame,
  resolveSparkGlowPadding,
  resolveSparkMaterial,
  resolveSparkReach,
  resolveStartDirectionAngle,
  type SparkGraphics
} from '../../src/render/sparkPlayerSkin';
import { sampleIridescentTrail } from '../../src/render/trailPalette';

const frameInput = (overrides: Partial<Parameters<typeof resolveSparkFrame>[0]> = {}) => ({
  centerX: 100,
  centerY: 200,
  tileSize: 40,
  devicePixelRatio: 3,
  timeMs: 0,
  reducedMotion: true,
  angle: 0,
  motionAmount: 0,
  ...overrides
});

describe('Spark kite geometry', () => {
  test('stays inside its tile at rest and within its glow reach at full glide stretch, for every heading', () => {
    const frame = createSparkFrame();
    for (const motionAmount of [0, 1]) {
      for (let step = 0; step < 16; step += 1) {
        for (const timeMs of [0, 375, 750, 1125]) {
          resolveSparkFrame(frameInput({ angle: (step / 16) * Math.PI * 2, motionAmount, timeMs, reducedMotion: false }), frame);
          for (const [x, y] of [[frame.noseX, frame.noseY], [frame.leftX, frame.leftY], [frame.tailX, frame.tailY], [frame.rightX, frame.rightY]] as const) {
            const reach = Math.hypot(x - 100, y - 200);
            expect(reach).toBeLessThanOrEqual(frame.reachCss + 1e-9);
            if (motionAmount === 0) {
              // at rest (breathing included) the kite stays inside its own tile; mid-glide it is between tiles anyway
              expect(Math.abs(x - 100)).toBeLessThan(20);
              expect(Math.abs(y - 200)).toBeLessThan(20);
            }
          }
        }
      }
    }
    // the worst pose overshoots half a tile by about 3% only mid-glide: the glow canvas is padded for it
    expect(resolveSparkReach(40)).toBeLessThan(40 * 0.52);
  });

  test('the nose points along the heading (0 = right, PI/2 = down) and the tail behind it', () => {
    const frame = resolveSparkFrame(frameInput({ angle: 0 }), createSparkFrame());
    expect(frame.noseX).toBeCloseTo(100 + (40 * SPARK_PLAYER.noseTileRatio), 6);
    expect(frame.noseY).toBeCloseTo(200, 6);
    expect(frame.tailX).toBeLessThan(100);
    resolveSparkFrame(frameInput({ angle: Math.PI / 2 }), frame);
    expect(frame.noseY).toBeGreaterThan(200);
    expect(frame.noseX).toBeCloseTo(100, 6);
  });

  test('glide stretches along the heading and squeezes across it', () => {
    const rest = resolveSparkFrame(frameInput(), createSparkFrame());
    const glide = resolveSparkFrame(frameInput({ motionAmount: 1 }), createSparkFrame());
    expect(glide.noseX - 100).toBeGreaterThan(rest.noseX - 100);
    expect(Math.abs(glide.leftY - 200)).toBeLessThan(Math.abs(rest.leftY - 200));
  });

  test('reuses the frame it is given (no allocation per frame)', () => {
    const frame = createSparkFrame();
    expect(resolveSparkFrame(frameInput(), frame)).toBe(frame);
  });

  test('the glow padding covers the blur for the square glow canvas', () => {
    expect(resolveSparkGlowPadding(40)).toBeGreaterThanOrEqual(Math.ceil(40 * SPARK_PLAYER.glow.wideBlurTileRatio * 2));
    expect(resolveSparkGlowPadding(-5)).toBe(0);
  });
});

describe('Spark heading', () => {
  test('start directions map to screen angles, unknown means up', () => {
    expect(resolveStartDirectionAngle('right')).toBe(0);
    expect(resolveStartDirectionAngle('down')).toBeCloseTo(Math.PI / 2, 9);
    expect(resolveStartDirectionAngle('left')).toBeCloseTo(Math.PI, 9);
    expect(resolveStartDirectionAngle('up')).toBeCloseTo(-Math.PI / 2, 9);
    expect(resolveStartDirectionAngle(null)).toBeCloseTo(-Math.PI / 2, 9);
  });

  test('shortest turn wraps the long way round', () => {
    expect(resolveShortestTurn(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9);
    expect(resolveShortestTurn(Math.PI * 0.9, -Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2, 9);
    expect(resolveShortestTurn(-Math.PI * 0.9, Math.PI * 0.9)).toBeCloseTo(-Math.PI * 0.2, 9);
    expect(resolveShortestTurn(0, Math.PI)).toBeCloseTo(Math.PI, 9);
  });

  test('snaps to the start direction with no heading, then eases toward a new heading and settles on it', () => {
    const heading = new SparkHeading();
    expect(heading.update(0, 0, 0, 0, false)).toBe(0);
    const first = heading.update(16, 0, 1, 0, false);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(Math.PI / 2);
    let angle = first;
    for (let t = 32; t <= 600; t += 16) {
      angle = heading.update(t, 0, 1, 0, false);
    }
    expect(angle).toBe(Math.atan2(1, 0));
  });

  test('reduced motion and long frame gaps snap straight to the heading', () => {
    const heading = new SparkHeading();
    heading.update(0, 1, 0, 0, false);
    expect(heading.update(16, 0, 1, 0, true)).toBe(Math.atan2(1, 0));
    heading.update(32, 1, 0, 0, true);
    expect(heading.update(5000, -1, 0, 0, false)).toBe(Math.atan2(0, -1));
  });
});

describe('Spark material', () => {
  test('takes its colours from the trail palette at the trail head (rainbow, not fixed green)', () => {
    const material = createSparkMaterial();
    const out = resolveSparkMaterial({ distanceTiles: 3, timeMs: 1200, animated: true }, 0, false, material);
    expect(out).toBe(material);
    const front = sampleIridescentTrail(3, 1200, false, { core: 0, glow: 0, wave: 0, sheen: 0 });
    expect(out.core).toBe(front.core);
    expect(out.glow).toBe(front.glow);
  });

  test('the colour shifts with the clock and along the route', () => {
    const a = resolveSparkMaterial(null, 0, true, createSparkMaterial()).core;
    const b = resolveSparkMaterial(null, 4000, true, createSparkMaterial()).core;
    const c = resolveSparkMaterial({ distanceTiles: 6, timeMs: 0, animated: false }, 0, false, createSparkMaterial()).core;
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });
});

describe('drawSparkPlayer', () => {
  const recorder = () => {
    const calls: string[] = [];
    const g: SparkGraphics = {
      lineStyle: () => { calls.push('lineStyle'); return g; },
      fillStyle: () => { calls.push('fillStyle'); return g; },
      beginPath: () => { calls.push('beginPath'); return g; },
      moveTo: () => g,
      lineTo: () => g,
      closePath: () => g,
      strokePath: () => { calls.push('strokePath'); return g; },
      fillPath: () => { calls.push('fillPath'); return g; }
    } as unknown as SparkGraphics;
    return { g, calls };
  };
  const draw = (pingStartMs: number, reducedMotion: boolean) => {
    const { g, calls } = recorder();
    const frame = resolveSparkFrame(frameInput(), createSparkFrame());
    drawSparkPlayer(g, frame, {
      tileSize: 40,
      devicePixelRatio: 3,
      alpha: 1,
      timeMs: 100,
      material: resolveSparkMaterial(null, 0, true, createSparkMaterial()),
      pingStartMs,
      reducedMotion
    });
    return calls;
  };

  test('paints one keyline stroke and four facets without a ping', () => {
    const calls = draw(-1, false);
    expect(calls.filter((c) => c === 'fillPath')).toHaveLength(4);
    expect(calls.filter((c) => c === 'strokePath')).toHaveLength(1);
  });

  test('a live ping adds kite rings before the facets; reduced motion drops them', () => {
    const calls = draw(0, false);
    expect(calls.filter((c) => c === 'strokePath').length).toBeGreaterThan(1);
    expect(calls.indexOf('strokePath')).toBeLessThan(calls.indexOf('fillPath'));
    expect(draw(0, true).filter((c) => c === 'strokePath')).toHaveLength(1);
  });
});
