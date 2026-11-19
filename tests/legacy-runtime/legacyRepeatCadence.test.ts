import { describe, expect, it } from 'vitest';
import { resolveDriftCorrectedRepeatWaitMs, resolveRepeatMaxLateMs } from '../../src/legacy-runtime/legacyRepeatCadence';

/**
 * Models Phaser's Clock: a delayed call due `wait` ms after it is armed fires on the first frame whose time is at or past
 * the due time. Returns the mean step period over `steps` steps.
 */
const meanPeriodMs = (options: { delayMs: number; frameMs: number; steps: number; driftCorrected: boolean }): number => {
  const { delayMs, frameMs, steps, driftCorrected } = options;
  let now = 0;
  let dueAt = delayMs;
  let firstFire = 0;
  let lastFire = 0;
  for (let i = 0; i < steps; i += 1) {
    const fireAt = Math.ceil(dueAt / frameMs - 1e-9) * frameMs;
    now = fireAt;
    if (i === 0) {
      firstFire = fireAt;
    }
    lastFire = fireAt;
    const wait = driftCorrected ? resolveDriftCorrectedRepeatWaitMs(dueAt, now, delayMs) : delayMs;
    // the scene stores the new due time as `now + wait`, which is the previous due time plus the delay when corrected
    dueAt = now + wait;
  }
  return (lastFire - firstFire) / (steps - 1);
};

describe('drift-corrected repeat cadence (MAZER-PERF)', () => {
  it('waits the rest of the step when the previous one fired a little late', () => {
    expect(resolveDriftCorrectedRepeatWaitMs(1000, 1010, 139)).toBeCloseTo(129, 9);
    expect(resolveDriftCorrectedRepeatWaitMs(1000, 1000, 139)).toBe(139);
  });

  it('falls back to the plain delay without an anchor, with a bad clock, or after a stall of more than a step', () => {
    expect(resolveDriftCorrectedRepeatWaitMs(null, 500, 139)).toBe(139);
    expect(resolveDriftCorrectedRepeatWaitMs(Number.NaN, 500, 139)).toBe(139);
    expect(resolveDriftCorrectedRepeatWaitMs(1000, Number.NaN, 139)).toBe(139);
    expect(resolveDriftCorrectedRepeatWaitMs(1000, 1200, 139)).toBe(139);
    // an anchor in the future (clock reset) never waits longer than one step
    expect(resolveDriftCorrectedRepeatWaitMs(2000, 1000, 139)).toBe(139);
  });

  it('WORK COUNT: the chained timer drifts by 8 % at 60 Hz and 2 % at 120 Hz (the cause of the ProMotion speed-up)', () => {
    const at60 = meanPeriodMs({ delayMs: 139, frameMs: 1000 / 60, steps: 200, driftCorrected: false });
    const at120 = meanPeriodMs({ delayMs: 139, frameMs: 1000 / 120, steps: 200, driftCorrected: false });
    expect(at60).toBeCloseTo(150, 0);
    expect(at120).toBeCloseTo(141.67, 0);
    expect(at60 / at120).toBeGreaterThan(1.05);
  });

  it('WORK COUNT: drift-corrected, the mean period is the requested delay at 60, 90, 120 and 144 Hz, and equal across them', () => {
    const periods = [60, 90, 120, 144].map((hz) => meanPeriodMs({ delayMs: 147, frameMs: 1000 / hz, steps: 400, driftCorrected: true }));
    for (const period of periods) {
      expect(Math.abs(period - 147)).toBeLessThan(0.6);
    }
    expect(Math.max(...periods) - Math.min(...periods)).toBeLessThan(0.8);
  });
});

describe('bounded catch-up: a hitch never buys a fast step (MAZER-CTRL-003)', () => {
  const FRAME = 1000 / 60;
  const DELAY = 122;
  const MAX_LATE = resolveRepeatMaxLateMs(60);

  /** Same Phaser Clock model as meanPeriodMs, with optional extra frame stalls (frame index -> extra ms). */
  const gapsWith = (stalls: Record<number, number>, maxLateMs: number, steps = 40): number[] => {
    const frames: number[] = [0];
    for (let i = 1; frames.length < 4000; i += 1) {
      frames.push(frames[frames.length - 1]! + FRAME + (stalls[i] ?? 0));
    }
    let dueAt = DELAY;
    const fires: number[] = [];
    for (let i = 0; i < steps; i += 1) {
      const fireAt = frames.find((t) => t >= dueAt - 1e-9)!;
      fires.push(fireAt);
      dueAt = fireAt + resolveDriftCorrectedRepeatWaitMs(dueAt, fireAt, DELAY, maxLateMs);
    }
    return fires.slice(1).map((t, i) => t - fires[i]!);
  };

  it('the budget is one frame plus a small margin, clamped to 30-60 fps', () => {
    expect(resolveRepeatMaxLateMs(60)).toBeCloseTo(FRAME + 4, 6);
    expect(resolveRepeatMaxLateMs(30)).toBeCloseTo((1000 / 30) + 4, 6);
    expect(resolveRepeatMaxLateMs(144)).toBeCloseTo(FRAME + 4, 6);
    expect(resolveRepeatMaxLateMs(Number.NaN)).toBeCloseTo(FRAME + 4, 6);
  });

  it('frame-grid lateness is still made up (average stays exact), a hitch re-anchors instead', () => {
    expect(resolveDriftCorrectedRepeatWaitMs(1000, 1000 + 16, DELAY, MAX_LATE)).toBe(DELAY - 16);
    expect(resolveDriftCorrectedRepeatWaitMs(1000, 1000 + 60, DELAY, MAX_LATE)).toBe(DELAY);
    // Default (no budget) keeps the old behaviour for other callers.
    expect(resolveDriftCorrectedRepeatWaitMs(1000, 1000 + 60, DELAY)).toBe(DELAY - 60);
  });

  it('REPRO: unbounded, a 60 ms hitch is followed by a step ~60 ms short', () => {
    const gaps = gapsWith({ 50: 60 }, Number.POSITIVE_INFINITY);
    expect(Math.min(...gaps)).toBeLessThan(DELAY - (2 * FRAME));
  });

  it('FIXED: with the budget no step is shorter than one interval minus one frame (and margin), hitch or not', () => {
    for (const stalls of [{}, { 50: 60 }, { 30: 25, 90: 45, 140: 100 }]) {
      const gaps = gapsWith(stalls, MAX_LATE);
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(DELAY - MAX_LATE - 1e-6);
    }
    // No hitch: the average is still the requested interval.
    const clean = gapsWith({}, MAX_LATE, 200);
    expect(clean.reduce((a, b) => a + b, 0) / clean.length).toBeCloseTo(DELAY, 0);
  });
});
