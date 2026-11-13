import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BLEED_GLOW,
  resolveBleedGlowColor,
  resolveBleedGlowProgress,
  resolveBleedGlowRects
} from '../../src/render/bleedGlow';
import {
  TRAIL_COLOUR_MAX_CORE_STEP,
  TRAIL_COLOUR_REDRAW_INTERVAL_MS,
  stepTrailColourRedraw
} from '../../src/render/trailColourRedraw';

/**
 * MAZER-PERF-007: the wrap-dock glow arms a dynamic-board redraw on the trail's shared colour-redraw schedule at EVERY
 * motion setting (it used to arm one every frame at full motion). The gate in MenuScene.update is
 * `hasLegacyBleedOffGlowPendingFrame() && isLegacyColourRedrawDue(time)`; these tests replay exactly that call
 * sequence with the real scheduler (stepTrailColourRedraw) and pin the rates and the visible-step bounds.
 */

const channelDelta = (a: number, b: number): number => Math.max(
  Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)),
  Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)),
  Math.abs((a & 255) - (b & 255))
);

/** Times at which the scene would arm a glow redraw, using the scene's per-frame cached scheduler. */
const simulateGlowRedraws = (reducedMotion: boolean, frameMs: number, durationMs: number, glowPending = true): number[] => {
  const redraws: number[] = [];
  let nextDueAtMs = 0;
  let checkedAt = -1;
  let due = false;
  const isDue = (time: number): boolean => {
    if (time === checkedAt) return due;
    const step = stepTrailColourRedraw(time, nextDueAtMs, reducedMotion);
    nextDueAtMs = step.nextDueAtMs;
    checkedAt = time;
    due = step.due;
    return due;
  };
  for (let frame = 0; frame * frameMs <= durationMs; frame += 1) {
    const time = frame * frameMs;
    if (glowPending && isDue(time)) redraws.push(time);
  }
  return redraws;
};

describe('wrap-dock glow redraw schedule (MAZER-PERF-007)', () => {
  it('full motion: about 30 redraws a second instead of one per frame (60 Hz, 120 Hz, 144 Hz)', () => {
    for (const [hz, frames] of [[60, 600], [120, 1200], [144, 1440]] as const) {
      const redraws = simulateGlowRedraws(false, 1000 / hz, 10_000);
      expect(redraws.length / 10).toBeGreaterThan(28);
      expect(redraws.length / 10).toBeLessThan(31);
      expect(redraws.length).toBeLessThan(frames * 0.55);
    }
  });

  it('reduced motion is unchanged: about 20 redraws a second (the 45 ms schedule)', () => {
    const redraws = simulateGlowRedraws(true, 1000 / 60, 10_000);
    expect(redraws.length / 10).toBeGreaterThan(19);
    expect(redraws.length / 10).toBeLessThan(21);
  });

  it('levels without wrap docks never arm a redraw', () => {
    expect(simulateGlowRedraws(false, 1000 / 60, 5000, false)).toEqual([]);
  });

  it('no gap between full-motion redraws is longer than two 60 Hz frames', () => {
    const redraws = simulateGlowRedraws(false, 1000 / 60, 10_000);
    let maxGap = 0;
    for (let i = 1; i < redraws.length; i += 1) maxGap = Math.max(maxGap, redraws[i]! - redraws[i - 1]!);
    expect(maxGap).toBeLessThanOrEqual((2 * 1000 / 60) + 0.01);
  });

  it('COLOUR STEP TABLE: hue-only drift stays inside the stated core bound; the sheen crossing equals the trails own step', () => {
    const frameMs = 1000 / 60;
    const redraws = simulateGlowRedraws(false, frameMs, 8000); // more than two full 3600 ms sweeps
    const everyFrame = Array.from({ length: Math.floor(8000 / frameMs) + 1 }, (_, i) => i * frameMs);
    // Largest per-channel (0..255) change of the glow colour between consecutive samples, over every head phase.
    const maxStep = (times: readonly number[], animated: boolean): number => {
      let worst = 0;
      for (let distance = 0; distance < 8; distance += 0.05) {
        for (let i = 1; i < times.length; i += 1) {
          worst = Math.max(worst, channelDelta(
            resolveBleedGlowColor({ distanceTiles: distance, timeMs: times[i - 1]!, animated }, 0, false),
            resolveBleedGlowColor({ distanceTiles: distance, timeMs: times[i]!, animated }, 0, false)
          ));
        }
      }
      return worst;
    };
    // Hue sweep only (Trail Shine off / reduced motion colour): the stated bound holds at the full-motion 33 ms gap.
    const hueThrottled = maxStep(redraws, false);
    expect(hueThrottled).toBeLessThanOrEqual(TRAIL_COLOUR_MAX_CORE_STEP);
    expect(hueThrottled).toBeGreaterThan(0);
    expect(hueThrottled).toBeGreaterThan(maxStep(everyFrame, false));
    // Full motion adds the travelling sheen (about 6 tiles a second): where it crosses the head the colour jumps more.
    // Measured: 11 per frame today, 20 per 33 ms redraw after. That is the SAME step the trail beside the player already
    // takes on this schedule (same function, same gap), so the dock glow and the trail change colour in lockstep.
    const sheenThrottled = maxStep(redraws, true);
    const sheenPerFrame = maxStep(everyFrame, true);
    expect(sheenPerFrame).toBeLessThanOrEqual(11);
    expect(sheenThrottled).toBeLessThanOrEqual(20);
    expect(sheenThrottled).toBeLessThanOrEqual(sheenPerFrame * 2);
  });

  it('the travelling band moves under one device pixel per redraw on a 42 px dock', () => {
    const perRedraw = TRAIL_COLOUR_REDRAW_INTERVAL_MS / BLEED_GLOW.periodMs;
    expect(perRedraw * 42).toBeLessThan(1);
  });

  it('the painted band changes little between two redraws: no rect alpha moves more than 0.06 (max alpha 0.55)', () => {
    const area = { left: 100, top: 20, right: 114, bottom: 62 };
    let worst = 0;
    for (let t = 0; t < BLEED_GLOW.periodMs; t += 7) {
      const make = (time: number) => resolveBleedGlowRects({
        direction: 'top',
        area,
        cellCentre: { x: 107.1667, y: 307.5 },
        tileSize: 14.72,
        progress: resolveBleedGlowProgress(time)
      });
      const before = new Map(make(t).map((rect) => [rect.y, rect.alpha]));
      for (const rect of make(t + TRAIL_COLOUR_REDRAW_INTERVAL_MS)) {
        const previous = before.get(rect.y);
        if (previous !== undefined) worst = Math.max(worst, Math.abs(rect.alpha - previous));
      }
    }
    expect(worst).toBeLessThan(0.06);
  });
});

describe('MenuScene wiring (MAZER-PERF-007)', () => {
  const source = readFileSync('src/scenes/MenuScene.ts', 'utf8');

  it('arms the glow redraw from the shared colour-redraw schedule at every motion setting', () => {
    expect(source).toContain('if (this.hasLegacyBleedOffGlowPendingFrame() && this.isLegacyColourRedrawDue(time)) {');
    expect(source).not.toContain('(!this.prefersLegacyReducedMotion() || this.isLegacyColourRedrawDue(time))');
  });
});
