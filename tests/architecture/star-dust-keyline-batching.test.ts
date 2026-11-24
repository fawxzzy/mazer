/**
 * MAZER-PERF-017: the star-dust keylines are built as small Path2D batches joined with addPath, not as one context path
 * closed thousands of times (Chromium's closePath costs time in proportion to the path, so one big path was quadratic in
 * the trail length). These tests pin that the batched path is the SAME path: identical verbs and points in identical order,
 * stroked once, so the pixels cannot change; and that no single path is closed more than one batch's worth of times.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  STAR_DUST_KEYLINE_BATCH,
  drawStarDustTrailToCanvasContext,
  type StarDustDrawOptions,
  type StarDustSegment
} from '../../src/render/starDustTrailCanvas';

type Op = [string, ...number[]];

/** Records path verbs; addPath appends the other path's verbs (what an untransformed addPath does). */
class FakePath2D {
  static created: FakePath2D[] = [];
  ops: Op[] = [];
  closes = 0;
  constructor() {
    FakePath2D.created.push(this);
  }
  moveTo(x: number, y: number): void { this.ops.push(['moveTo', x, y]); }
  lineTo(x: number, y: number): void { this.ops.push(['lineTo', x, y]); }
  closePath(): void { this.ops.push(['closePath']); this.closes += 1; }
  addPath(other: FakePath2D, transform?: unknown): void {
    expect(transform).toBeUndefined();
    this.ops.push(...other.ops);
  }
}

interface LoggedCall { name: string; args: unknown[] }

/** A 2D context that logs every call (no DOM: the bloom falls back to in-place strokes, which is fine here). */
const loggingContext = (): { ctx: CanvasRenderingContext2D; log: LoggedCall[] } => {
  const log: LoggedCall[] = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, name: string) {
      if (name === 'canvas') return { width: 1000, height: 3000 };
      if (name in props) return props[name];
      return (...args: unknown[]) => { log.push({ name, args }); };
    },
    set(_t, name: string, value: unknown) {
      props[name] = value;
      return true;
    }
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
};

const TILE = 16;
/** A serpentine route long enough for several keyline batches. */
const route = (): StarDustSegment[] => {
  const points: { x: number; y: number; distance: number }[] = [];
  let distance = 0;
  const push = (x: number, y: number) => {
    const last = points[points.length - 1];
    if (last) distance += Math.hypot(x - last.x, y - last.y);
    points.push({ x, y, distance });
  };
  for (let row = 0; row < 12; row += 2) {
    const ltr = (row / 2) % 2 === 0;
    for (let i = 0; i < 25; i += 1) push(((ltr ? i : 24 - i) + 0.5) * TILE + 0.25, (row + 0.5) * TILE + 0.75);
    push(((ltr ? 24 : 0) + 0.5) * TILE + 0.25, (row + 1.5) * TILE + 0.75);
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
  glowBlurPx: 0,
  keylineColor: 0x05030a,
  keylineAlpha: 1,
  timeMs: 4321,
  animated: true,
  originAdvancePx: 0
};

const PATH_VERBS = new Set(['moveTo', 'lineTo', 'closePath']);

/** The keyline verbs the fallback writes into the context path: the run before the last stroke ahead of the first fill. */
const fallbackKeylineOps = (log: LoggedCall[]): Op[] => {
  const firstFill = log.findIndex((c) => c.name === 'fill');
  let stroke = firstFill - 1;
  while (log[stroke]!.name !== 'stroke') stroke -= 1;
  let begin = stroke - 1;
  while (log[begin]!.name !== 'beginPath') begin -= 1;
  return log.slice(begin + 1, stroke).filter((c) => PATH_VERBS.has(c.name)).map((c) => [c.name, ...(c.args as number[])] as Op);
};

afterEach(() => {
  vi.unstubAllGlobals();
  FakePath2D.created = [];
});

describe('star dust keylines: batched Path2D is the same path, closed linearly', () => {
  test('without Path2D the keylines go into the context path (the code before the change)', () => {
    vi.stubGlobal('Path2D', undefined);
    const { ctx, log } = loggingContext();
    const sparkles = drawStarDustTrailToCanvasContext(ctx, route(), OPTIONS);
    expect(sparkles).toBeGreaterThan(3 * STAR_DUST_KEYLINE_BATCH);
    const ops = fallbackKeylineOps(log);
    expect(ops.filter((o) => o[0] === 'closePath')).toHaveLength(sparkles);
    expect(log.some((c) => c.name === 'stroke' && c.args.length > 0)).toBe(false);
  });

  test('with Path2D: one keyline stroke of a path with exactly the same verbs and points, in the same order', () => {
    vi.stubGlobal('Path2D', undefined);
    const before = loggingContext();
    const sparkles = drawStarDustTrailToCanvasContext(before.ctx, route(), OPTIONS);
    const expected = fallbackKeylineOps(before.log);

    vi.stubGlobal('Path2D', FakePath2D);
    const after = loggingContext();
    expect(drawStarDustTrailToCanvasContext(after.ctx, route(), OPTIONS)).toBe(sparkles);
    const pathStrokes = after.log.filter((c) => c.name === 'stroke' && c.args.length > 0);
    expect(pathStrokes).toHaveLength(1);
    const keylinePath = pathStrokes[0]!.args[0] as FakePath2D;
    expect(keylinePath).toBeInstanceOf(FakePath2D);
    expect(keylinePath.ops).toEqual(expected);

    // Everything else the draw does is unchanged: same calls minus the keyline verbs that moved into the Path2D.
    const strip = (log: LoggedCall[]) => log.filter((c) => !PATH_VERBS.has(c.name)).map((c) => c.name);
    const beforeNames = strip(before.log);
    const afterNames = strip(after.log);
    // The fallback opens the keyline path with beginPath; the batched version strokes the Path2D directly.
    const keylineStroke = beforeNames.lastIndexOf('stroke', beforeNames.indexOf('fill'));
    const keylineBegin = beforeNames.lastIndexOf('beginPath', keylineStroke);
    expect(afterNames).toEqual([...beforeNames.slice(0, keylineBegin), ...beforeNames.slice(keylineBegin + 1)]);
  });

  test('no single path closes more than one batch of sparkles (linear, not quadratic)', () => {
    vi.stubGlobal('Path2D', FakePath2D);
    const { ctx } = loggingContext();
    const sparkles = drawStarDustTrailToCanvasContext(ctx, route(), OPTIONS);
    const [outer, ...batches] = FakePath2D.created;
    expect(outer!.closes).toBe(0);
    expect(batches).toHaveLength(Math.ceil(sparkles / STAR_DUST_KEYLINE_BATCH));
    for (const batch of batches) {
      expect(batch.closes).toBeGreaterThan(0);
      expect(batch.closes).toBeLessThanOrEqual(STAR_DUST_KEYLINE_BATCH);
    }
    expect(batches.reduce((sum, b) => sum + b.closes, 0)).toBe(sparkles);
  });
});
