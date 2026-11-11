import { describe, expect, test } from 'vitest';
import {
  PLAYER_GLIDE_MAX_LAG_TILES,
  PlayerGlide,
  type PlayerGlidePoint
} from '../../src/render/playerGlide';

interface Sample {
  dt: number;
  rx: number;
  ry: number;
  t: number;
}

/**
 * Drive a glide like the scene does: a logical step fires on the first frame at or after its due time
 * (`stepMs` after the previous step, frame-quantized exactly like `nextDemoMoveAtMs = time + delayMs`), and the
 * rendered position is sampled once per frame.
 */
const runCorridor = (
  route: PlayerGlidePoint[],
  { frameMs, stepMs, hintMs }: { frameMs: number; hintMs?: number; stepMs: number },
  glide = new PlayerGlide()
): { glide: PlayerGlide; samples: Sample[]; stepTimes: number[] } => {
  glide.snapTo(route[0]!, 0);
  const samples: Sample[] = [];
  const stepTimes: number[] = [];
  let nextStepAt = frameMs;
  let cursor = 0;
  let last = glide.sample(0);
  let t = 0;
  for (let frame = 1; frame < 4000; frame += 1) {
    t = frame * frameMs;
    if (cursor < route.length - 1 && t >= nextStepAt) {
      glide.step(route[cursor]!, route[cursor + 1]!, t, hintMs ?? stepMs);
      cursor += 1;
      stepTimes.push(t);
      nextStepAt = t + stepMs;
    }
    const p = glide.sample(t);
    samples.push({ dt: frameMs, rx: p.x, ry: p.y, t });
    last = p;
    if (cursor >= route.length - 1 && !glide.isMoving(t) && t > nextStepAt + 1000) {
      break;
    }
  }
  expect(last).toBeDefined();
  return { glide, samples, stepTimes };
};

const straight = (count: number): PlayerGlidePoint[] => Array.from({ length: count }, (_v, i) => ({ x: 5, y: i }));

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
const stdev = (values: number[]): number => {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
};

/** The previous behaviour, for the regression comparison: one smoothstep tween per step, shorter than the step. */
const legacyTweenSpeeds = (stepMs: number, tweenMs: number, frameMs: number): number[] => {
  const smoothstep = (p: number): number => p * p * (3 - (2 * p));
  const speeds: number[] = [];
  let stepStart = 0;
  let from = 0;
  let previous = 0;
  for (let t = frameMs; t < stepMs * 12; t += frameMs) {
    if (t >= stepStart + stepMs) {
      stepStart = t;
      from += 1;
    }
    const progress = Math.min(1, (t - stepStart) / tweenMs);
    const position = from + smoothstep(progress);
    if (stepStart > 0) {
      speeds.push((position - previous) / (frameMs / 1000));
    }
    previous = position;
  }
  return speeds;
};

describe('PlayerGlide', () => {
  test('moves at one steady speed along a straight run instead of pulsing per step', () => {
    // Menu walker at 60Hz: 88ms configured, so steps land every 6 frames (100ms).
    const { samples } = runCorridor(straight(20), { frameMs: 100 / 6, stepMs: 100, hintMs: 88 });
    const run = samples.slice(24, 100);
    const speeds = run.slice(1).map((s, i) => Math.abs(s.ry - run[i]!.ry) / (s.dt / 1000));

    expect(speeds.filter((v) => v < 1e-6)).toHaveLength(0);
    expect(stdev(speeds) / mean(speeds)).toBeLessThan(0.1);
    expect(mean(speeds)).toBeGreaterThan(9.3);
    expect(mean(speeds)).toBeLessThan(10.7);
  });

  test('is strictly smoother than the per-step smoothstep tween it replaced', () => {
    const legacy = legacyTweenSpeeds(100, 80, 100 / 6);
    const legacyCv = stdev(legacy) / mean(legacy);
    const { samples } = runCorridor(straight(20), { frameMs: 100 / 6, stepMs: 100, hintMs: 88 });
    const run = samples.slice(24, 100);
    const speeds = run.slice(1).map((s, i) => Math.abs(s.ry - run[i]!.ry) / (s.dt / 1000));
    const cv = stdev(speeds) / mean(speeds);

    expect(legacyCv).toBeGreaterThan(0.5);
    expect(cv).toBeLessThan(legacyCv / 4);
    expect(legacy.filter((v) => v < 1e-6).length).toBeGreaterThan(0);
  });

  test('stays continuous when frames are longer than the step (slow phone) and never overshoots', () => {
    const { samples, glide } = runCorridor(straight(24), { frameMs: 133, stepMs: 117, hintMs: 88 });
    const ys = samples.map((s) => s.ry);
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i]! + 1e-9).toBeGreaterThanOrEqual(ys[i - 1]!);
      expect(ys[i]!).toBeLessThanOrEqual(23 + 1e-9);
    }
    // Per-frame displacement stays well under a whole-tile jump even though a frame is longer than a step.
    const maxJump = Math.max(...ys.slice(1).map((y, i) => y - ys[i]!));
    expect(maxJump).toBeLessThan(1.3);
    expect(glide.getTarget()).toEqual({ x: 5, y: 23 });
    expect(glide.sample(60000)).toEqual({ x: 5, y: 23 });
  });

  test('follows the path through corners without cutting them or stalling', () => {
    const route: PlayerGlidePoint[] = [
      { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 3 }, { x: 4, y: 4 },
      { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 3 }, { x: 6, y: 2 }
    ];
    const { samples } = runCorridor(route, { frameMs: 100 / 6, stepMs: 100 });
    for (const sample of samples) {
      const onVertical = [2, 4, 6].some((x) => Math.abs(sample.rx - x) < 1e-9);
      const onHorizontal = [2, 4].some((y) => Math.abs(sample.ry - y) < 1e-9);
      expect(onVertical || onHorizontal).toBe(true);
    }
    const moving = samples.slice(8, 40);
    const speeds = moving.slice(1).map((s, i) => Math.hypot(s.rx - moving[i]!.rx, s.ry - moving[i]!.ry) / (s.dt / 1000));
    expect(speeds.filter((v) => v < 1e-6)).toHaveLength(0);
    expect(stdev(speeds) / mean(speeds)).toBeLessThan(0.12);
  });

  test('keeps the marker within the lag cap and the trail head on the last segment', () => {
    const glide = new PlayerGlide();
    const route = straight(40);
    glide.snapTo(route[0]!, 0);
    let t = 0;
    for (let i = 0; i < route.length - 1; i += 1) {
      t += 100 + ((i % 3) * 9);
      glide.step(route[i]!, route[i + 1]!, t, 100);
      for (let frame = 0; frame < 6; frame += 1) {
        const at = t + (frame * 16.7);
        const marker = glide.sample(at);
        const head = glide.sampleTrailHead(at);
        const lagTiles = (i + 1) - marker.y;
        expect(lagTiles).toBeLessThanOrEqual(PLAYER_GLIDE_MAX_LAG_TILES + 1e-6);
        // Head never trails the previous tile (the trail's last logical vertex) and never leads the marker's target.
        expect(head.y).toBeGreaterThanOrEqual(i - 1e-9);
        expect(head.y).toBeLessThanOrEqual(i + 1 + 1e-9);
        if (marker.y >= i) {
          expect(head).toEqual(marker);
        }
      }
    }
  });

  test('a burst of steps is pulled back inside the lag cap instead of falling behind', () => {
    const glide = new PlayerGlide();
    glide.snapTo({ x: 0, y: 0 }, 0);
    // Ten steps committed inside a single long frame (tab restored, GC pause).
    for (let i = 0; i < 10; i += 1) {
      glide.step({ x: 0, y: i }, { x: 0, y: i + 1 }, 1000 + i, 100);
    }
    const marker = glide.sample(1010);
    expect(10 - marker.y).toBeLessThanOrEqual(PLAYER_GLIDE_MAX_LAG_TILES + 1e-6);
    expect(glide.getTarget()).toEqual({ x: 0, y: 10 });
  });

  test('uses the caller hint after a pause, then the observed cadence', () => {
    const glide = new PlayerGlide();
    glide.snapTo({ x: 0, y: 0 }, 0);
    glide.step({ x: 0, y: 0 }, { x: 1, y: 0 }, 5000, 200);
    // One tile at the hinted 200ms: halfway at 100ms, home at 200ms.
    expect(glide.sample(5100).x).toBeCloseTo(0.5, 6);
    expect(glide.sample(5200).x).toBeCloseTo(1, 6);
    expect(glide.isMoving(5201)).toBe(true); // squash/stretch is still relaxing
    expect(glide.isMoving(7000)).toBe(false);

    // Steady 100ms cadence overrides the 200ms hint.
    glide.step({ x: 1, y: 0 }, { x: 2, y: 0 }, 8000, 200);
    glide.step({ x: 2, y: 0 }, { x: 3, y: 0 }, 8100, 200);
    glide.step({ x: 3, y: 0 }, { x: 4, y: 0 }, 8200, 200);
    const early = glide.sample(8210).x;
    const later = glide.sample(8260).x;
    // ~1 tile per observed 100ms (not per the 200ms hint).
    expect((later - early) / 50).toBeGreaterThan(1 / 130);
  });

  test('snapTo, stale anchors and no-op steps behave', () => {
    const glide = new PlayerGlide();
    glide.snapTo({ x: 3, y: 3 }, 100);
    glide.step({ x: 3, y: 3 }, { x: 3, y: 3 }, 120, 100);
    expect(glide.isMoving(130)).toBe(false);
    expect(glide.sample(130)).toEqual({ x: 3, y: 3 });

    glide.step({ x: 3, y: 3 }, { x: 4, y: 3 }, 200, 100);
    expect(glide.isMoving(210)).toBe(true);
    // A step that does not continue from the queued path (reset/teleport) re-anchors at its own start.
    glide.step({ x: 9, y: 9 }, { x: 9, y: 10 }, 220, 100);
    expect(glide.getTarget()).toEqual({ x: 9, y: 10 });
    expect(glide.sample(221).x).toBeCloseTo(9, 1);

    glide.snapTo({ x: 1, y: 1 }, 300);
    expect(glide.isMoving(310)).toBe(false);
    expect(glide.sample(310)).toEqual({ x: 1, y: 1 });
    expect(glide.getMotionPose(310).amount).toBe(0);
  });

  test('sampling is idempotent within a frame and ignores non-advancing times', () => {
    const glide = new PlayerGlide();
    glide.snapTo({ x: 0, y: 0 }, 0);
    glide.step({ x: 0, y: 0 }, { x: 0, y: 1 }, 10, 100);
    const a = glide.sample(60);
    expect(glide.sample(60)).toEqual(a);
    expect(glide.sample(40)).toEqual(a);
    expect(glide.sample(Number.NaN)).toEqual(a);
  });

  test('motion pose ramps smoothly with heading and relaxes after arrival', () => {
    const glide = new PlayerGlide();
    glide.snapTo({ x: 0, y: 0 }, 0);
    glide.step({ x: 0, y: 0 }, { x: 1, y: 0 }, 10, 100);
    const early = glide.getMotionPose(30);
    const mid = glide.getMotionPose(90);
    expect(early.amount).toBeGreaterThan(0);
    expect(mid.amount).toBeGreaterThan(early.amount);
    expect(mid.headingX).toBeCloseTo(1, 6);
    expect(mid.headingY).toBeCloseTo(0, 6);
    expect(glide.getMotionPose(2000).amount).toBe(0);
  });
});
