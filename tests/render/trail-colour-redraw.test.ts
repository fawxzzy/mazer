import { describe, expect, it } from 'vitest';
import {
  TRAIL_COLOUR_MAX_CORE_STEP,
  TRAIL_COLOUR_MAX_GLOW_STEP,
  TRAIL_COLOUR_REDRAW_INTERVAL_MS,
  TRAIL_COLOUR_REDRAW_INTERVAL_REDUCED_MS,
  resolveTrailColourRedrawIntervalMs,
  resolveTrailColourRedrawRateHz,
  stepTrailColourRedraw
} from '../../src/render/trailColourRedraw';
import { sampleIridescentTrail } from '../../src/render/trailPalette';
import { resolveTrailColourTimeMs, resolveTrailMotionPlan } from '../../src/render/reducedMotion';

const channelDelta = (a: number, b: number): number => Math.max(
  Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)),
  Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)),
  Math.abs((a & 255) - (b & 255))
);

/** Redraw times produced by the scheduler over `durationMs` of frames at `frameMs` (with optional jitter). */
const simulateRedraws = (
  reducedMotion: boolean,
  frameMs: number,
  durationMs: number,
  jitter: (frame: number) => number = () => 0
): number[] => {
  const redraws: number[] = [];
  let nextDueAtMs = 0;
  for (let frame = 0; frame * frameMs <= durationMs; frame += 1) {
    const time = (frame * frameMs) + jitter(frame);
    const step = stepTrailColourRedraw(time, nextDueAtMs, reducedMotion);
    nextDueAtMs = step.nextDueAtMs;
    if (step.due) redraws.push(time);
  }
  return redraws;
};

/**
 * The colours the reduced-motion trail shows at each redraw time: the same call the scene makes (colour clock fed
 * through resolveTrailColourTimeMs, motion stopped), over every phase of the 8-tile sweep.
 */
const maxColourStep = (redrawTimes: readonly number[]): { core: number; glow: number } => {
  const plan = resolveTrailMotionPlan(true, true);
  let core = 0;
  let glow = 0;
  for (let distanceTiles = 0; distanceTiles < 8; distanceTiles += 0.05) {
    let previous: { core: number; glow: number } | null = null;
    for (const time of redrawTimes) {
      const sample = sampleIridescentTrail(distanceTiles, resolveTrailColourTimeMs(time, plan), true, { core: 0, glow: 0, wave: 0, sheen: 0 });
      if (previous) {
        core = Math.max(core, channelDelta(previous.core, sample.core));
        glow = Math.max(glow, channelDelta(previous.glow, sample.glow));
      }
      previous = { core: sample.core, glow: sample.glow };
    }
  }
  return { core, glow };
};

describe('trail colour-only redraw cadence (MAZER-PERF-003)', () => {
  it('leaves full motion exactly as it was and lowers only reduced motion', () => {
    expect(TRAIL_COLOUR_REDRAW_INTERVAL_MS).toBe(33);
    expect(resolveTrailColourRedrawIntervalMs(false)).toBe(33);
    expect(resolveTrailColourRedrawIntervalMs(true)).toBe(TRAIL_COLOUR_REDRAW_INTERVAL_REDUCED_MS);
    expect(TRAIL_COLOUR_REDRAW_INTERVAL_REDUCED_MS).toBe(45);
    expect(resolveTrailColourRedrawRateHz(true)).toBeLessThan(resolveTrailColourRedrawRateHz(false));
    // Never below 20 Hz nominal: still reads as continuous drift.
    expect(resolveTrailColourRedrawRateHz(true)).toBeGreaterThanOrEqual(20);
  });

  it('full motion at 60 Hz still redraws every second frame (about 30 a second), reduced every third (20 a second)', () => {
    const full = simulateRedraws(false, 1000 / 60, 10_000);
    const reduced = simulateRedraws(true, 1000 / 60, 10_000);
    expect(full.length / 10).toBeGreaterThan(29);
    expect(full.length / 10).toBeLessThan(31);
    expect(reduced.length / 10).toBeGreaterThan(19);
    expect(reduced.length / 10).toBeLessThan(21);
    // One third fewer redraws.
    expect(reduced.length / full.length).toBeLessThan(0.7);
  });

  it('keeps ~20 redraws a second on 120 Hz and 144 Hz displays, and never stalls', () => {
    for (const frameMs of [1000 / 120, 1000 / 144]) {
      const redraws = simulateRedraws(true, frameMs, 10_000);
      const rate = redraws.length / 10;
      expect(rate).toBeGreaterThan(18);
      expect(rate).toBeLessThan(23);
    }
  });

  it('redraw gaps stay bounded with 60 Hz frame-time jitter: no gap longer than 4 frames', () => {
    const jitter = (frame: number): number => ((frame * 7919) % 5) - 2; // deterministic -2..+2 ms
    const redraws = simulateRedraws(true, 1000 / 60, 20_000, jitter);
    let maxGap = 0;
    for (let i = 1; i < redraws.length; i += 1) maxGap = Math.max(maxGap, redraws[i]! - redraws[i - 1]!);
    expect(maxGap).toBeLessThanOrEqual((4 * 1000 / 60) + 4);
    expect(maxGap).toBeGreaterThanOrEqual(TRAIL_COLOUR_REDRAW_INTERVAL_REDUCED_MS - 1);
  });

  it('the hue still advances smoothly: max per-channel step between redraws is within the stated bounds', () => {
    const redraws = simulateRedraws(true, 1000 / 60, 8000); // two full 3600 ms sweeps
    const nominal = maxColourStep(redraws);
    // STATED BOUNDS: at the nominal ~50 ms gap, no channel of the crisp core moves more than 8/255 and none of the bloom more than 18/255.
    expect(nominal.core).toBeLessThanOrEqual(TRAIL_COLOUR_MAX_CORE_STEP);
    expect(nominal.glow).toBeLessThanOrEqual(TRAIL_COLOUR_MAX_GLOW_STEP);
    // And it genuinely moves (the colour does not stop): the step is not zero.
    expect(nominal.core).toBeGreaterThan(0);
    // Reference: the full-motion 33 ms cadence, for the PR record.
    const full = maxColourStep(simulateRedraws(false, 1000 / 60, 8000));
    expect(full.core).toBeLessThan(nominal.core);
    expect(nominal.core / full.core).toBeLessThan(2);
    expect(nominal.glow / full.glow).toBeLessThan(2);
  });

  it('even the worst single redraw gap (4 frames at 60 Hz, 66.7 ms) stays under 10 core and 24 bloom units', () => {
    const times: number[] = [];
    for (let t = 0; t <= 8000; t += (4 * 1000) / 60) times.push(t);
    const worst = maxColourStep(times);
    expect(worst.core).toBeLessThanOrEqual(10);
    expect(worst.glow).toBeLessThanOrEqual(24);
  });

  it('the colour is never held still: every redraw time sees a changed hue except at the sweep turn-around', () => {
    const redraws = simulateRedraws(true, 1000 / 60, 7200);
    const plan = resolveTrailMotionPlan(true, true);
    let unchanged = 0;
    let previous = -1;
    for (const time of redraws) {
      const core = sampleIridescentTrail(3, resolveTrailColourTimeMs(time, plan), true, { core: 0, glow: 0, wave: 0, sheen: 0 }).core;
      if (core === previous) unchanged += 1;
      previous = core;
    }
    expect(unchanged).toBeLessThanOrEqual(2);
  });

  it('a throttled reduced-motion redraw still follows the colour clock, not a frozen time', () => {
    const plan = resolveTrailMotionPlan(true, true);
    expect(resolveTrailColourTimeMs(1234, plan)).toBe(1234);
  });

  it('step: not due before the gap, due at it, ignores a non-finite time, and 0 means due now', () => {
    expect(stepTrailColourRedraw(0, 0, true)).toEqual({ due: true, nextDueAtMs: 45 });
    expect(stepTrailColourRedraw(44, 45, true)).toEqual({ due: false, nextDueAtMs: 45 });
    expect(stepTrailColourRedraw(45, 45, true)).toEqual({ due: true, nextDueAtMs: 90 });
    expect(stepTrailColourRedraw(45, 45, false)).toEqual({ due: true, nextDueAtMs: 78 });
    expect(stepTrailColourRedraw(Number.NaN, 0, true).due).toBe(false);
  });
});
