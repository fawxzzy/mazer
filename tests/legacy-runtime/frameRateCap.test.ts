import { describe, expect, it } from 'vitest';
import { FRAME_RATE_CAP_FPS, createFrameRateGate, installFrameRateCap } from '../../src/legacy-runtime/frameRateCap';

/** Feed `seconds` of display frames at `hz` (with optional timestamp jitter) and return what ran. */
const drive = (hz: number, seconds: number, jitterMs = 0) => {
  const gate = createFrameRateGate(60);
  const period = 1000 / hz;
  let ran = 0;
  let maxGap = 0;
  let lastRun = 0;
  let last = 0;
  for (let i = 0; i <= hz * seconds; i += 1) {
    // deterministic pseudo-jitter, no Math.random
    const time = i * period + (jitterMs ? Math.sin(i * 12.9898) * jitterMs : 0);
    const delta = i === 0 ? period : time - last;
    last = time;
    const out = gate.offer(time, delta);
    if (out !== null) {
      ran += 1;
      maxGap = Math.max(maxGap, time - lastRun);
      lastRun = time;
    }
  }
  return { ran, fps: ran / seconds, maxGap };
};

describe('frame rate cap (MAZER-PERF)', () => {
  it('caps at 60 fps', () => {
    expect(FRAME_RATE_CAP_FPS).toBe(60);
  });

  it('never skips a frame on a 60 Hz display, even with realistic timestamp jitter', () => {
    expect(drive(60, 5).fps).toBeGreaterThanOrEqual(60);
    expect(drive(60, 5, 0.9).fps).toBeGreaterThanOrEqual(60);
  });

  it('runs every frame on displays below the cap', () => {
    expect(drive(30, 5).fps).toBeGreaterThanOrEqual(30);
    expect(drive(50, 5, 0.5).fps).toBeGreaterThanOrEqual(50);
  });

  it('halves a 120 Hz display to 60 fps, with and without jitter', () => {
    expect(Math.abs(drive(120, 5).fps - 60)).toBeLessThan(1);
    expect(Math.abs(drive(120, 5, 0.6).fps - 60)).toBeLessThan(2);
  });

  it('lands between the cap and the display rate for 75 / 90 / 144 / 165 Hz', () => {
    for (const hz of [75, 90, 144, 165]) {
      const { fps } = drive(hz, 5);
      expect(fps, `${hz} Hz`).toBeGreaterThanOrEqual(60 - 1);
      expect(fps, `${hz} Hz`).toBeLessThanOrEqual(hz + 0.5);
    }
  });

  it('hands skipped frames time to the next run frame: total game time equals total display time at every refresh rate', () => {
    for (const hz of [60, 90, 120, 144]) {
      const gate = createFrameRateGate(60);
      const period = 1000 / hz;
      let given = 0;
      let offered = 0;
      let pending = 0;
      for (let i = 0; i < hz * 4; i += 1) {
        offered += period;
        pending += period;
        const out = gate.offer(i * period, period);
        if (out !== null) {
          given += out;
          pending = 0;
        }
      }
      expect(given + pending).toBeCloseTo(offered, 6);
    }
  });

  it('keeps the gap between run frames at about 16.7 ms on 120 Hz (even cadence, no 8 / 25 ms beat)', () => {
    expect(drive(120, 5).maxGap).toBeLessThanOrEqual(16.8);
    expect(drive(120, 5, 0.6).maxGap).toBeLessThanOrEqual(25.1);
  });

  it('re-anchors after a stall instead of running a burst of catch-up frames', () => {
    const gate = createFrameRateGate(60);
    gate.offer(0, 16.7);
    gate.offer(16.7, 16.7);
    // 5 s stall (hidden tab), then 120 Hz frames resume.
    let time = 5000;
    let ran = 0;
    for (let i = 0; i < 24; i += 1) {
      if (gate.offer(time, i === 0 ? 5000 : 8.33) !== null) {
        ran += 1;
      }
      time += 8.33;
    }
    // 24 display frames at 120 Hz is 200 ms: about 12 run frames, not 24.
    expect(ran).toBeGreaterThanOrEqual(11);
    expect(ran).toBeLessThanOrEqual(14);
  });

  it('is a pass-through for a non-positive cap or a bad clock', () => {
    const off = createFrameRateGate(0);
    expect(off.offer(0, 8)).toBe(8);
    expect(off.offer(8, 8)).toBe(8);
    expect(createFrameRateGate(60).offer(Number.NaN, 8)).toBe(8);
  });

  it('installFrameRateCap wraps game.step: skipped frames never reach it, run frames get the accumulated delta', () => {
    const calls: Array<[number, number]> = [];
    const game = { step: (time: number, delta: number) => { calls.push([time, delta]); } } as never as Parameters<typeof installFrameRateCap>[0];
    installFrameRateCap(game, 60);
    const period = 1000 / 120;
    for (let i = 0; i < 6; i += 1) {
      game.step(i * period, period);
    }
    expect(calls.length).toBe(3);
    expect(calls[1]![1]).toBeCloseTo(2 * period, 6);
  });
});
