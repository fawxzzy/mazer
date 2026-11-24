/**
 * Trail cost options page (MAZER-PERF-017 follow-up): the plan painter must reproduce today's draw call for call when
 * the plan is SHIPPED_PLAN (so the page's "Today" row and its ablations measure the real thing), and each option's
 * caching must only skip work when the picture would be the same.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  drawStarDustTrailToCanvasContext,
  type StarDustDrawOptions,
  type StarDustSegment
} from '../../src/render/starDustTrailCanvas';
import {
  SHIPPED_PLAN,
  TRAIL_PERF_VARIANTS,
  chunkTrailSegmentsByLength,
  createStarDustPlanRenderer,
  drawStarDustWithPlan,
  findTrailPerfVariant
} from '../../src/render/trailPerf/starDustTrailVariants';
import { TRAIL_PERF_RUNS, describeTrailPerfMeasurement } from '../../src/render/trailPerf/trailPerfMeasurements';

class FakePath2D {
  ops: unknown[][] = [];
  moveTo(x: number, y: number): void { this.ops.push(['moveTo', x, y]); }
  lineTo(x: number, y: number): void { this.ops.push(['lineTo', x, y]); }
  closePath(): void { this.ops.push(['closePath']); }
  addPath(other: FakePath2D): void { this.ops.push(...other.ops); }
}

type Logged = unknown[];

/** A 2D context that logs every call and every property write, in order; Path2D arguments are logged as their verbs. */
const loggingContext = (size = { width: 1000, height: 3000 }): { ctx: CanvasRenderingContext2D; log: Logged[] } => {
  const log: Logged[] = [];
  const props: Record<string, unknown> = {};
  const canvas = { ...size };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, name: string) {
      if (name === 'canvas') return canvas;
      if (name === 'getTransform') return () => ({ a: 1 });
      if (name === 'createLinearGradient') {
        return (...args: unknown[]) => {
          log.push([name, ...args]);
          return { addColorStop: (...stop: unknown[]) => log.push(['addColorStop', ...stop]) };
        };
      }
      if (name in props) return props[name];
      return (...args: unknown[]) => {
        log.push([name, ...args.map((a) => (a instanceof FakePath2D ? a.ops : a))]);
      };
    },
    set(_t, name: string, value: unknown) {
      props[name] = value;
      log.push([`=${name}`, value]);
      return true;
    }
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
};

const TILE = 16;
const route = (rows = 12): StarDustSegment[] => {
  const points: { x: number; y: number; distance: number }[] = [];
  let distance = 0;
  const push = (x: number, y: number) => {
    const last = points[points.length - 1];
    if (last) distance += Math.hypot(x - last.x, y - last.y);
    points.push({ x, y, distance });
  };
  for (let row = 0; row < rows; row += 2) {
    const ltr = (row / 2) % 2 === 0;
    for (let i = 0; i < 25; i += 1) push(((ltr ? i : 24 - i) + 0.5) * TILE, (row + 0.5) * TILE);
    push(((ltr ? 24 : 0) + 0.5) * TILE, (row + 1.5) * TILE);
  }
  const segments: StarDustSegment[] = [];
  for (let i = 1; i < points.length; i += 1) {
    segments.push({ previous: points[i - 1]!, current: points[i]!, glowColor: 0x336699 + i, coreColor: 0x88ccff - i, alpha: 0.9 });
  }
  return segments;
};

const OPTIONS: StarDustDrawOptions = {
  originX: 3,
  originY: 5,
  tileSize: TILE,
  coreWidth: 4,
  glowWidth: 10,
  glowAlphaRatio: 0.5,
  glowBlurPx: 6,
  keylineColor: 0x05030a,
  keylineAlpha: 1,
  timeMs: 4321,
  animated: true,
  originAdvancePx: 0
};

/** Fake offscreen canvases for the caching options (one logging context each). */
const stubDocument = (): Array<{ width: number; height: number; log: Logged[] }> => {
  const made: Array<{ width: number; height: number; log: Logged[] }> = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const { ctx, log } = loggingContext();
      const canvas = { width: 0, height: 0, log, getContext: () => ctx };
      made.push(canvas);
      return canvas;
    }
  });
  return made;
};

const count = (log: Logged[], name: string) => log.filter((c) => c[0] === name).length;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('plan painter at SHIPPED_PLAN is today\'s draw', () => {
  test.each([true, false])('identical calls, arguments and property writes (animated=%s)', (animated) => {
    vi.stubGlobal('Path2D', FakePath2D);
    const shipped = loggingContext();
    const plan = loggingContext();
    const options = { ...OPTIONS, animated };
    const a = drawStarDustTrailToCanvasContext(shipped.ctx, route(), options);
    const b = drawStarDustWithPlan(plan.ctx, route(), options, SHIPPED_PLAN);
    expect(b).toBe(a);
    expect(a).toBeGreaterThan(50);
    expect(plan.log).toEqual(shipped.log);
  });

  test('measured lines: each option next to Today from the same run, both engines', () => {
    expect(TRAIL_PERF_RUNS.filter((r) => r.engine === 'webkit').length).toBeGreaterThanOrEqual(2);
    expect(TRAIL_PERF_RUNS.filter((r) => r.engine === 'chromium').length).toBeGreaterThanOrEqual(2);
    const a = describeTrailPerfMeasurement('A');
    expect(a).toHaveLength(2);
    expect(a[0]).toMatch(/^WebKit: walk \d+ vs \d+, \d+ vs \d+ ms; idle /);
    expect(describeTrailPerfMeasurement('shipped')[1]).not.toContain('vs');
  });

  test('the variant table: Today plus three options, unknown ids fall back to Today', () => {
    expect(TRAIL_PERF_VARIANTS.map((v) => v.id)).toEqual(['shipped', 'A', 'B', 'C']);
    expect(findTrailPerfVariant('nope').id).toBe('shipped');
    expect(findTrailPerfVariant('C').plan.bodyCache).not.toBeNull();
    for (const v of TRAIL_PERF_VARIANTS) expect(v.look.length).toBeGreaterThan(20);
  });
});

describe('A. light bloom', () => {
  test('one stroke per tile of route for bloom and thread instead of one per colour piece; same sparkles', () => {
    vi.stubGlobal('Path2D', FakePath2D);
    const today = loggingContext();
    const light = loggingContext();
    // As the scene hands them over: 4 px pieces, the colour moving on every piece (so today's chunks are ~1 per piece).
    const segments = route().flatMap((s, i) => [0, 1, 2, 3].map((q) => {
      const at = (f: number) => ({
        x: s.previous.x + (s.current.x - s.previous.x) * f,
        y: s.previous.y + (s.current.y - s.previous.y) * f,
        distance: s.previous.distance! + (s.current.distance! - s.previous.distance!) * f
      });
      const colour = ((i * 4 + q) * 0x2a1b37) & 0xffffff;
      return { ...s, previous: at(q / 4), current: at((q + 1) / 4), glowColor: colour, coreColor: colour };
    }));
    const sparklesToday = drawStarDustWithPlan(today.ctx, segments, OPTIONS, SHIPPED_PLAN);
    const sparklesLight = drawStarDustWithPlan(light.ctx, segments, OPTIONS, findTrailPerfVariant('A').plan);
    expect(sparklesLight).toBe(sparklesToday);
    expect(count(light.log, 'fill')).toBe(count(today.log, 'fill'));
    expect(count(light.log, 'stroke')).toBeLessThan(count(today.log, 'stroke'));
    const tiles = Math.ceil(segments[segments.length - 1]!.current.distance! / TILE);
    // bloom + thread, one stroke per tile each at most, plus the keyline stroke
    expect(count(light.log, 'stroke')).toBeLessThanOrEqual(2 * (tiles + 1) + 1);
    // Flush pieces (butt caps, so no stacked round caps) with a colour fade per piece.
    expect(light.log).toContainEqual(['=lineCap', 'butt']);
    expect(count(light.log, 'createLinearGradient')).toBeGreaterThan(tiles);
    expect(count(today.log, 'createLinearGradient')).toBe(0);
  });

  test('A brightens its coarse bloom only (gain applies to coarse, never to today\'s plan)', () => {
    vi.stubGlobal('Path2D', FakePath2D);
    const plan = findTrailPerfVariant('A').plan;
    expect(plan.coarseBloomGain).toBeGreaterThan(1);
    expect(SHIPPED_PLAN.coarseBloomGain).toBe(1);
    const alphas = (gain: number): number[] => {
      const { ctx, log } = loggingContext();
      drawStarDustWithPlan(ctx, route(2), OPTIONS, { ...plan, thread: 'off', keyline: false, fills: false, coarseBloomGain: gain });
      return log.filter((c) => c[0] === '=shadowColor' && typeof c[1] === 'string' && c[1].startsWith('rgba'))
        .map((c) => Number(/,([\d.]+)\)$/.exec(c[1] as string)![1]));
    };
    const one = alphas(1);
    const two = alphas(2);
    expect(one.length).toBeGreaterThan(0);
    two.forEach((a, i) => expect(a).toBeCloseTo(Math.min(1, one[i]! * 2), 6));
  });

  test('chunkTrailSegmentsByLength keeps every segment in order and cuts only on a straight run past the budget', () => {
    const segments = route();
    const chunks = chunkTrailSegmentsByLength(segments, TILE * 3);
    expect(chunks.flat()).toEqual(segments);
    const dir = (s: StarDustSegment) => [Math.sign(s.current.x - s.previous.x), Math.sign(s.current.y - s.previous.y)];
    for (let i = 0; i < chunks.length - 1; i += 1) {
      const chunk = chunks[i]!;
      const length = chunk.reduce((sum, s) => sum + Math.hypot(s.current.x - s.previous.x, s.current.y - s.previous.y), 0);
      expect(length).toBeGreaterThanOrEqual(TILE * 3 - 1e-9);
      // At most one corner run past the budget (this route turns for one tile at each end of a row).
      expect(length).toBeLessThan(TILE * 6);
      expect(dir(chunks[i + 1]![0]!)).toEqual(dir(chunk[chunk.length - 1]!));
    }
    expect(chunkTrailSegmentsByLength([], TILE)).toEqual([]);
  });
});

describe('B. calm sparkles', () => {
  test('paints every call it gets (the idle cadence belongs to the scene gate), with the same calls as today minus motion', () => {
    vi.stubGlobal('Path2D', FakePath2D);
    stubDocument();
    const plan = findTrailPerfVariant('B').plan;
    expect(plan).toMatchObject({ still: true, idleRepaintMs: 250, bodyCache: null, bloom: 'shipped', thread: 'shipped' });
    const renderer = createStarDustPlanRenderer(plan);
    const a = loggingContext();
    const b = loggingContext();
    renderer(a.ctx, route(), OPTIONS);
    renderer(b.ctx, route(), { ...OPTIONS, timeMs: OPTIONS.timeMs + 100 });
    expect(renderer.stats).toMatchObject({ fullPaints: 2, headPaints: 0, bodyRebuilds: 0 });
    const names = (log: Logged[]) => log.map((c) => c[0]);
    expect(names(b.log)).toEqual(names(a.log));
  });

  test('still sparkles do not depend on the clock', () => {
    vi.stubGlobal('Path2D', FakePath2D);
    const plan = { ...SHIPPED_PLAN, still: true };
    const a = loggingContext();
    const b = loggingContext();
    drawStarDustWithPlan(a.ctx, route(), OPTIONS, plan);
    drawStarDustWithPlan(b.ctx, route(), { ...OPTIONS, timeMs: OPTIONS.timeMs + 700 }, plan);
    const fills = (log: Logged[]) => log.filter((c) => c[0] === 'fill' || c[0] === 'moveTo' || c[0] === 'lineTo');
    expect(fills(b.log)).toEqual(fills(a.log));
  });
});

describe('C. cached tail', () => {
  test('builds the body once, then paints only the newest tiles while the route only grows', () => {
    vi.stubGlobal('Path2D', FakePath2D);
    const canvases = stubDocument();
    const plan = findTrailPerfVariant('C').plan;
    const renderer = createStarDustPlanRenderer(plan);
    const full = route();
    const start = full.slice(0, -3);

    const first = loggingContext();
    renderer(first.ctx, start, OPTIONS);
    expect(renderer.stats).toMatchObject({ bodyRebuilds: 1, headPaints: 1, fullPaints: 0 });
    expect(canvases).toHaveLength(1);
    expect(first.log.filter((c) => c[0] === 'drawImage' && c[1] === canvases[0])).toHaveLength(1);

    // Two more steps: same body, head only (far fewer strokes than a full paint).
    const next = loggingContext();
    renderer(next.ctx, full.slice(0, -1), { ...OPTIONS, timeMs: OPTIONS.timeMs + 300 });
    expect(renderer.stats).toMatchObject({ bodyRebuilds: 1, headPaints: 2 });
    const fullPaint = loggingContext();
    drawStarDustWithPlan(fullPaint.ctx, full, OPTIONS, plan);
    expect(count(next.log, 'stroke')).toBeLessThan(count(fullPaint.log, 'stroke') / 5);

    // Refresh after refreshMs.
    renderer(loggingContext().ctx, full, { ...OPTIONS, timeMs: OPTIONS.timeMs + plan.bodyCache!.refreshMs + 1 });
    expect(renderer.stats.bodyRebuilds).toBe(2);
  });

  test('rebuilds when the route before the split is different (new level or step back past it)', () => {
    vi.stubGlobal('Path2D', FakePath2D);
    stubDocument();
    const renderer = createStarDustPlanRenderer(findTrailPerfVariant('C').plan);
    renderer(loggingContext().ctx, route(), OPTIONS);
    const shifted = route().map((s) => ({
      ...s,
      previous: { ...s.previous, x: s.previous.x + TILE },
      current: { ...s.current, x: s.current.x + TILE }
    }));
    renderer(loggingContext().ctx, shifted, { ...OPTIONS, timeMs: OPTIONS.timeMs + 50 });
    expect(renderer.stats.bodyRebuilds).toBe(2);
    // Stepping back far past the split also rebuilds.
    renderer(loggingContext().ctx, shifted.slice(0, 40), { ...OPTIONS, timeMs: OPTIONS.timeMs + 60 });
    expect(renderer.stats.bodyRebuilds).toBe(3);
  });

  test('short trails and no DOM fall back to a full paint', () => {
    vi.stubGlobal('Path2D', FakePath2D);
    const renderer = createStarDustPlanRenderer(findTrailPerfVariant('C').plan);
    renderer(loggingContext().ctx, route(), OPTIONS);
    stubDocument();
    renderer(loggingContext().ctx, route(2).slice(0, 10), OPTIONS);
    expect(renderer.stats).toMatchObject({ fullPaints: 2, bodyRebuilds: 0, headPaints: 0 });
  });
});
