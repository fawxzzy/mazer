import { describe, expect, test } from 'vitest';
import {
  YOYO_ORBIT_LAPS,
  resolveYoYoApproach,
  resolveYoYoApproachSpeed,
  resolveYoYoDeconstructPhase,
  resolveYoYoRebuildPhase
} from '../../src/render/ringYoYoMotion';
import { resolveEdgeStations, resolveOrbitingEdgeStations } from '../../src/render/edgeMarkers';

const TAU = Math.PI * 2;
const OUT = { start: 0, end: 2400 };
const IN = { start: 0, end: 2000 };
const outPhase = (t: number): number => resolveYoYoDeconstructPhase(t, OUT.start, OUT.end);
const inPhase = (t: number): number => resolveYoYoRebuildPhase(t, IN.start, IN.end);
// Seam time axis: s < 0 is the deconstruct (s = ms before the turnaround), s >= 0 the rebuild.
const seamPhase = (s: number): number => (s < 0 ? outPhase(OUT.end + s) : inPhase(IN.start + s));
const velocity = (s: number, h = 0.5): number => (seamPhase(s + h) - seamPhase(s - h)) / (2 * h);

describe('ringYoYoMotion', () => {
  test('approach is monotone 0..1 with zero speed at both ends', () => {
    expect(resolveYoYoApproach(0)).toBe(0);
    expect(resolveYoYoApproach(1)).toBe(1);
    expect(resolveYoYoApproachSpeed(0)).toBe(0);
    expect(resolveYoYoApproachSpeed(1)).toBe(0);
    let previous = -1;
    for (let u = 0; u <= 1; u += 0.001) {
      const value = resolveYoYoApproach(u);
      expect(value).toBeGreaterThan(previous - 1e-15);
      previous = value;
    }
  });

  test('rests: exactly 0 outside the windows, one lap each way, ends on a rest layout', () => {
    expect(outPhase(-10)).toBe(0);
    expect(outPhase(OUT.end)).toBe(0);
    expect(outPhase(OUT.end - 1e-6)).toBeCloseTo(-TAU * YOYO_ORBIT_LAPS, 6);
    expect(inPhase(IN.start)).toBeCloseTo(-TAU * YOYO_ORBIT_LAPS, 9);
    expect(inPhase(IN.end)).toBe(0);
    expect(inPhase(IN.end + 1000)).toBe(0);
    const viewport = { width: 390, height: 844 };
    expect(resolveOrbitingEdgeStations(viewport, inPhase(IN.start))).toEqual(resolveEdgeStations(viewport));
  });

  test('direction: deconstruct counter-clockwise, rebuild clockwise', () => {
    for (let t = 1; t < OUT.end; t += 7) {
      expect(outPhase(t + 1)).toBeLessThanOrEqual(outPhase(t) + 1e-12);
    }
    for (let t = 0; t < IN.end; t += 7) {
      expect(inPhase(t + 1)).toBeGreaterThanOrEqual(inPhase(t) - 1e-12);
    }
  });

  test('turnaround: position and velocity are continuous and there is no zero-velocity plateau', () => {
    // Position continuous across the seam.
    expect(Math.abs(seamPhase(-1e-6) - seamPhase(0))).toBeLessThan(1e-6);
    // Velocity passes through zero at the seam, with the opposite sign on each side (reversal).
    expect(velocity(-20)).toBeLessThan(0);
    expect(velocity(20)).toBeGreaterThan(0);
    // Continuity: velocity changes smoothly sample to sample (no jump) across the whole seam region.
    for (let s = -300; s < 300; s += 1) {
      expect(Math.abs(velocity(s + 1) - velocity(s)), `s=${s}`).toBeLessThan(2e-4);
    }
    // No plateau: speed grows steadily away from the apex on both sides (strictly increasing until the cruise).
    for (let s = 1; s < 120; s += 1) {
      expect(Math.abs(velocity(s + 1)), `in s=${s}`).toBeGreaterThan(Math.abs(velocity(s)));
      expect(Math.abs(velocity(-s - 1)), `out s=${s}`).toBeGreaterThan(Math.abs(velocity(-s)));
    }
    // The set of times with near-zero speed is just the apex neighbourhood: |v| < 1e-5 rad/ms for at most a few ms.
    let nearZero = 0;
    for (let s = -600; s <= 600; s += 0.25) {
      if (Math.abs(velocity(s, 0.25)) < 1e-5) {
        nearZero += 0.25;
      }
    }
    expect(nearZero).toBeLessThan(8);
  });

  test('settles to rest at the build end: speed falls to zero', () => {
    expect(Math.abs(velocity(IN.end - 1))).toBeLessThan(Math.abs(velocity(IN.end - 400)));
    expect(Math.abs(velocity(IN.end - 1))).toBeLessThan(1e-4);
  });
});
