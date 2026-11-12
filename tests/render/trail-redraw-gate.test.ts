import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TRAIL_FRAME_COST_OBSERVE_MAX_MS,
  TRAIL_REDRAW_MAX_GAP_MS,
  TRAIL_REDRAW_MIN_GAP_MS,
  observeTrailFrameCost,
  resolveTrailRedrawGapMs,
  shouldRebuildTrail,
  type TrailDrawRecord,
  type TrailDrawStamp
} from '../../src/render/trailRedrawGate';

const stamp = (overrides: Partial<TrailDrawStamp> = {}): TrailDrawStamp => ({
  routeRevision: 1,
  previousTileKey: '3,4',
  headX: 5,
  headY: 6,
  originX: 10,
  originY: 20,
  tileSize: 14.7,
  alphaMultiplier: 1,
  styleKey: 'chip|1|1|0|1|1',
  ...overrides
});

/**
 * Drives the gate the way the scene does: one request per frame, a rebuild whenever the gate says so, each rebuild costing
 * `costMs`. Returns the rebuild count and the share of wall time spent rebuilding.
 */
const simulate = (options: {
  frameMs: number;
  durationMs: number;
  costMs: number;
  stampAt?: (timeMs: number) => TrailDrawStamp;
  timeDriven?: boolean;
}): { rebuilds: number; share: number; skipped: number } => {
  let record: TrailDrawRecord | null = null;
  let rebuilds = 0;
  let skipped = 0;
  for (let time = 0; time <= options.durationMs; time += options.frameMs) {
    const next = options.stampAt ? options.stampAt(time) : stamp();
    if (shouldRebuildTrail(record, next, time, options.timeDriven ?? true)) {
      rebuilds += 1;
      record = { stamp: next, drawnAtMs: time, totalLength: 1000, costMs: options.costMs };
    } else {
      skipped += 1;
    }
  }
  return { rebuilds, skipped, share: (rebuilds * options.costMs) / options.durationMs };
};

describe('trail redraw gap (MAZER-PERF-002)', () => {
  it('keeps the long-standing 33 ms floor for cheap rebuilds and for unknown cost', () => {
    expect(TRAIL_REDRAW_MIN_GAP_MS).toBe(33);
    expect(resolveTrailRedrawGapMs(null)).toBe(33);
    expect(resolveTrailRedrawGapMs(0)).toBe(33);
    expect(resolveTrailRedrawGapMs(Number.NaN)).toBe(33);
    expect(resolveTrailRedrawGapMs(4)).toBe(33);
    expect(resolveTrailRedrawGapMs(16)).toBe(33);
  });

  it('stretches to twice the rebuild cost and is capped at 250 ms (never below 4 colour updates a second)', () => {
    expect(resolveTrailRedrawGapMs(25)).toBe(50);
    expect(resolveTrailRedrawGapMs(40)).toBe(80);
    expect(resolveTrailRedrawGapMs(110)).toBe(220);
    expect(resolveTrailRedrawGapMs(125)).toBe(TRAIL_REDRAW_MAX_GAP_MS);
    expect(resolveTrailRedrawGapMs(900)).toBe(TRAIL_REDRAW_MAX_GAP_MS);
    expect(TRAIL_REDRAW_MAX_GAP_MS).toBe(250);
  });
});

describe('trail rebuild gate (MAZER-PERF-002)', () => {
  it('rebuilds when nothing has been drawn yet or the clock is not a usable number', () => {
    expect(shouldRebuildTrail(null, stamp(), 0)).toBe(true);
    const record: TrailDrawRecord = { stamp: stamp(), drawnAtMs: 100, totalLength: 500, costMs: 5 };
    expect(shouldRebuildTrail(record, stamp(), Number.NaN)).toBe(true);
    expect(shouldRebuildTrail(record, stamp(), 50)).toBe(true); // clock went backwards
  });

  it('rebuilds at once for every kind of picture change, however recently it drew', () => {
    const record: TrailDrawRecord = { stamp: stamp(), drawnAtMs: 100, totalLength: 500, costMs: 5 };
    const changes: Partial<TrailDrawStamp>[] = [
      { routeRevision: 2 }, { previousTileKey: '4,4' }, { headX: 5.5 }, { headY: 6.25 }, { originX: 11 },
      { originY: 21 }, { tileSize: 15 }, { alphaMultiplier: 0.5 }, { styleKey: 'chip|2|2|0|1|1' }
    ];
    for (const change of changes) {
      expect(shouldRebuildTrail(record, stamp(change), 101), JSON.stringify(change)).toBe(true);
    }
    expect(shouldRebuildTrail(record, stamp(), 101)).toBe(false);
  });

  it('with colour drift off, an unchanged picture is never rebuilt, whatever the clock says', () => {
    const record: TrailDrawRecord = { stamp: stamp(), drawnAtMs: 0, totalLength: 500, costMs: 5 };
    expect(shouldRebuildTrail(record, stamp(), 60_000, false)).toBe(false);
  });

  it('WORK COUNT: an unchanged route redrawn on every frame rebuilds about every 33 ms, at any refresh rate', () => {
    for (const frameMs of [1000 / 60, 1000 / 120, 1000 / 144, 1000 / 240]) {
      const { rebuilds } = simulate({ frameMs, durationMs: 10_000, costMs: 5 });
      // 10 s at a 33 ms gap: 303 rebuilds at most, plus rounding up to the next frame.
      expect(rebuilds).toBeLessThanOrEqual(305);
      expect(rebuilds).toBeGreaterThan(200);
    }
  });

  it('WORK COUNT: a long route on a slow device spends at most about half of the main thread on its own colour drift', () => {
    // The measured 4x-throttle rebuild of a long route is 125 to 260 ms; 1x desktop is about 25 ms.
    const desktop = simulate({ frameMs: 1000 / 60, durationMs: 20_000, costMs: 25 });
    expect(desktop.share).toBeLessThanOrEqual(0.52);
    const phone = simulate({ frameMs: 1000 / 60, durationMs: 20_000, costMs: 40 });
    expect(phone.share).toBeLessThanOrEqual(0.52);
    // Before: a rebuild on every 2nd frame regardless of cost, 25 ms x 30 a second = 75 % of the thread.
    expect(desktop.rebuilds).toBeLessThan(0.7 * (20_000 / 33));
    // The measured 4x-throttle worst case (a 200 ms rebuild): the 250 ms cap holds it to 4 rebuilds a second (80 % of the
    // thread, down from a rebuild on every frame), and the colour still updates 4 times a second.
    const worst = simulate({ frameMs: 1000 / 60, durationMs: 20_000, costMs: 200 });
    expect(worst.rebuilds).toBeLessThanOrEqual(4.2 * 20);
    expect(worst.rebuilds).toBeGreaterThanOrEqual(3.5 * 20);
  });

  it('WORK COUNT: frames forced by other redraws (bleed glow, locator, announcer) do not rebuild an unchanged trail', () => {
    // 600 frames at 60 Hz with a still head. Colour clock only: 10 s at 25 ms cost, gap 50 ms = about 200 rebuilds, not 600.
    const { rebuilds, skipped } = simulate({ frameMs: 1000 / 60, durationMs: 10_000, costMs: 25 });
    expect(rebuilds).toBeLessThan(220);
    expect(skipped).toBeGreaterThan(rebuilds);
  });

  it('while the head glides (it changes every frame) every frame still rebuilds: growth stays visible', () => {
    const { rebuilds, skipped } = simulate({
      frameMs: 1000 / 60,
      durationMs: 1000,
      costMs: 25,
      stampAt: (time) => stamp({ headX: time / 100 })
    });
    expect(skipped).toBe(0);
    expect(rebuilds).toBeGreaterThanOrEqual(60);
  });

  it('with colour drift off, a still trail is rebuilt exactly once over a minute of frames', () => {
    const { rebuilds } = simulate({ frameMs: 1000 / 60, durationMs: 60_000, costMs: 25, timeDriven: false });
    expect(rebuilds).toBe(1);
  });
});

describe('frame cost observation (MAZER-PERF-002)', () => {
  const record = (costMs: number): TrailDrawRecord => ({ stamp: stamp(), drawnAtMs: 1000, totalLength: 1, costMs });

  it('raises the cost to the real frame time of the rebuild frame, once', () => {
    const r = record(10);
    observeTrailFrameCost(r, 1087);
    expect(r.costMs).toBe(87);
    observeTrailFrameCost(r, 1500);
    expect(r.costMs).toBe(87);
    expect(resolveTrailRedrawGapMs(r.costMs)).toBe(174);
  });

  it('never lowers the cost, and ignores idle gaps and bad clocks', () => {
    const cheap = record(40);
    observeTrailFrameCost(cheap, 1017);
    expect(cheap.costMs).toBe(40);
    const idle = record(10);
    observeTrailFrameCost(idle, 1000 + TRAIL_FRAME_COST_OBSERVE_MAX_MS + 1);
    expect(idle.costMs).toBe(10);
    const bad = record(10);
    observeTrailFrameCost(bad, Number.NaN);
    expect(bad.costMs).toBe(10);
  });

  it('WORK COUNT: a rebuild that costs 10 ms to draw and 87 ms per frame (phone, long route) is rebuilt every ~175 ms, not every frame', () => {
    let rec: TrailDrawRecord | null = null;
    let rebuilds = 0;
    let frames = 0;
    let time = 0;
    while (time < 10_000) {
      frames += 1;
      if (rec) observeTrailFrameCost(rec, time);
      if (shouldRebuildTrail(rec, stamp(), time, true)) {
        rebuilds += 1;
        rec = { stamp: stamp(), drawnAtMs: time, totalLength: 1, costMs: 10 };
        time += 87; // this frame is slow
      } else {
        time += 16.7;
      }
    }
    expect(rebuilds).toBeLessThanOrEqual(10_000 / 170);
    expect(frames).toBeGreaterThan(rebuilds * 4);
  });
});

describe('scene wiring (MAZER-PERF-002)', () => {
  const source = readFileSync(new URL('../../src/scenes/MenuScene.ts', import.meta.url), 'utf8');

  it('memoises the shortest route and gates the trail canvas rebuild through the pure helpers', () => {
    expect(source).toContain("import { TrailPerfectPathCache } from '../render/trailPerfectPathCache';");
    expect(source).toContain("import { observeTrailFrameCost, shouldRebuildTrail, type TrailDrawRecord } from '../render/trailRedrawGate';");
    expect(source).toContain('this.trailPerfectPathCache.resolve(');
    expect(source).toContain('shouldRebuildTrail(this.trailDrawRecord, gateStamp, time, gateMotionPlan.colourDrifts)');
    expect(source).toContain('observeTrailFrameCost(this.trailDrawRecord, time);');
  });

  it('records a rebuild only when the canvas image really was drawn and shown', () => {
    expect(source).toContain('if (this.trailCanvasImage?.visible === true) {');
    expect(source).toContain('this.trailDrawRecord = {');
  });
});
