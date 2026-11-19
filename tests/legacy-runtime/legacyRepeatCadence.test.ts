import { describe, expect, it } from 'vitest';
import { resolveDriftCorrectedRepeatWaitMs } from '../../src/legacy-runtime/legacyRepeatCadence';

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
