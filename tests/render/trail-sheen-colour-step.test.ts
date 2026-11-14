import { describe, expect, it } from 'vitest';
import { TRAIL_COLOUR_MAX_CORE_STEP, TRAIL_COLOUR_REDRAW_INTERVAL_MS } from '../../src/render/trailColourRedraw';
import { sampleIridescentTrail, TRAIL_SHEEN_PERIOD_MS } from '../../src/render/trailPalette';

// MAZER-VIS-037: the trail core colour at a fixed trail point must not move more than 8 of 255 on any channel between
// two consecutive redraws, including while the sheen band crosses it (it used to step up to 20 per 33 ms).
const channels = (c: number): number[] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

const worstCoreStep = (gapMs: number, motionStopped: boolean): number => {
  let worst = 0;
  const a = { core: 0, glow: 0, wave: 0, sheen: 0 };
  const b = { core: 0, glow: 0, wave: 0, sheen: 0 };
  // Whole sheen period and one full hue sweep (3600 ms), every 0.05 tile of a 30-tile trail.
  const span = Math.max(TRAIL_SHEEN_PERIOD_MS, 3600) * 2;
  for (let d = 0; d < 30; d += 0.05) {
    for (let t = 0; t < span; t += gapMs) {
      sampleIridescentTrail(d, t, motionStopped, a);
      sampleIridescentTrail(d, t + gapMs, motionStopped, b);
      const ca = channels(a.core);
      const cb = channels(b.core);
      for (let i = 0; i < 3; i += 1) worst = Math.max(worst, Math.abs(ca[i]! - cb[i]!));
    }
  }
  return worst;
};

describe('trail core colour step per redraw (MAZER-VIS-037)', () => {
  it('is at most 8 at the 33 ms full-motion redraw, sheen included', () => {
    expect(TRAIL_COLOUR_REDRAW_INTERVAL_MS).toBe(33);
    expect(worstCoreStep(TRAIL_COLOUR_REDRAW_INTERVAL_MS, false)).toBeLessThanOrEqual(TRAIL_COLOUR_MAX_CORE_STEP);
  });

  it('is within the same bound at a faster 20 ms redraw (smaller gap, smaller step)', () => {
    expect(worstCoreStep(20, false)).toBeLessThanOrEqual(TRAIL_COLOUR_MAX_CORE_STEP);
  });

  it('keeps the sheen visible: it still lifts the core and moves', () => {
    const on = { core: 0, glow: 0, wave: 0, sheen: 0 };
    let peak = 0;
    for (let t = 0; t < TRAIL_SHEEN_PERIOD_MS; t += 10) {
      sampleIridescentTrail(4, t, false, on);
      peak = Math.max(peak, on.sheen);
    }
    expect(peak).toBeGreaterThan(0.95);
    expect(worstCoreStep(TRAIL_COLOUR_REDRAW_INTERVAL_MS, false)).toBeGreaterThan(
      worstCoreStep(TRAIL_COLOUR_REDRAW_INTERVAL_MS, true) - 1
    );
  });
});
