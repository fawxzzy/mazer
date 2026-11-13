import { describe, expect, test } from 'vitest';
import {
  LOADER_FADE_IN_MS,
  LOADER_FADE_OUT_MS,
  LOADER_ICON_MAX_PX,
  LOADER_ICON_MIN_PX,
  LOADER_MIN_HOLD_MS,
  LOADER_PULSE_PERIOD_MS,
  LOADER_RING_GROWTH,
  LOADER_RING_REDUCED_ALPHA,
  LOADER_RING_REDUCED_SCALE,
  LOADER_SHOW_DELAY_MS,
  createLoaderMachine,
  resolveBootSplashExitDelayMs,
  resolveLoaderFadeMs,
  resolveLoaderIconSizePx,
  resolveLoaderLayout,
  resolveLoaderPose,
  stepLoader,
  type LoaderFrame,
  type LoaderMachine
} from '../../src/render/appLoader';
import { MOTION_DURATION_MS, MOTION_LOOP_MS, MOTION_REDUCED_MS } from '../../src/render/motionScale';

/** Runs the machine at a fixed frame step, `active(t)` deciding whether a wait is in progress at time t. */
const run = (
  active: (timeMs: number) => boolean,
  endMs: number,
  { reducedMotion = false, stepMs = 16, instantAtStart = false } = {}
): LoaderFrame[] => {
  const frames: LoaderFrame[] = [];
  let machine: LoaderMachine = createLoaderMachine();
  for (let t = 0; t <= endMs; t += stepMs) {
    const frame = stepLoader(machine, active(t), t, reducedMotion, { instant: instantAtStart && t === 0 });
    machine = frame.machine;
    frames.push(frame);
  }
  return frames;
};

const maxJump = (frames: LoaderFrame[]): number => frames.slice(1).reduce(
  (worst, frame, index) => Math.max(worst, Math.abs(frame.alpha - frames[index].alpha)),
  0
);

describe('loader policy rides the shared motion scale (MAZER-VIS-039)', () => {
  test('fade lengths are ladder steps, reduced motion is the one 200 ms crossfade, the pulse is the beat', () => {
    expect(LOADER_FADE_IN_MS).toBe(MOTION_DURATION_MS.base);
    expect(LOADER_FADE_OUT_MS).toBe(MOTION_DURATION_MS.slow);
    expect(LOADER_PULSE_PERIOD_MS).toBe(MOTION_LOOP_MS.beat);
    expect(resolveLoaderFadeMs('in', false)).toBe(MOTION_DURATION_MS.base);
    expect(resolveLoaderFadeMs('out', false)).toBe(MOTION_DURATION_MS.slow);
    expect(resolveLoaderFadeMs('in', true)).toBe(MOTION_REDUCED_MS.crossfade);
    expect(resolveLoaderFadeMs('out', true)).toBe(MOTION_REDUCED_MS.crossfade);
    expect(MOTION_REDUCED_MS.crossfade).toBe(200);
  });

  test('the owner thresholds: show only after ~150 ms, hold at least ~350 ms', () => {
    expect(LOADER_SHOW_DELAY_MS).toBe(150);
    expect(LOADER_MIN_HOLD_MS).toBe(350);
  });
});

describe('stepLoader timeline', () => {
  test('a wait shorter than the show delay never shows anything', () => {
    const frames = run((t) => t < LOADER_SHOW_DELAY_MS - 20, 1000);
    expect(frames.every((frame) => frame.alpha === 0 && !frame.visible)).toBe(true);
  });

  test('a long wait: nothing for the delay, then a smooth fade in over the base step, then full', () => {
    const frames = run(() => true, 1000);
    const at = (t: number) => frames[Math.round(t / 16)];
    expect(at(LOADER_SHOW_DELAY_MS - 16).alpha).toBe(0);
    expect(at(LOADER_SHOW_DELAY_MS + 32).visible).toBe(true);
    // Never pops: no frame-to-frame jump bigger than a smoothstep slope at 16 ms steps allows.
    expect(maxJump(frames)).toBeLessThan(0.15);
    expect(at(LOADER_SHOW_DELAY_MS + LOADER_FADE_IN_MS + 32).alpha).toBe(1);
    const firstVisible = frames.find((frame) => frame.visible);
    expect(firstVisible?.alpha).toBeLessThan(0.1);
  });

  test('a wait that ends just after the loader showed still holds the minimum before leaving', () => {
    const endsAt = LOADER_SHOW_DELAY_MS + 40;
    const frames = run((t) => t < endsAt, 1400);
    const shownIndex = frames.findIndex((frame) => frame.machine.phase === 'fading-in');
    expect(shownIndex).toBeGreaterThan(-1);
    const shownAtMs = shownIndex * 16;
    const fadingOutIndex = frames.findIndex((frame) => frame.machine.phase === 'fading-out');
    expect(fadingOutIndex).toBeGreaterThan(-1);
    expect((fadingOutIndex * 16) - shownAtMs).toBeGreaterThanOrEqual(LOADER_MIN_HOLD_MS);
    // Fully shown by the time the exit starts, and the exit is a fade, not a cut.
    expect(frames[fadingOutIndex - 1].alpha).toBe(1);
    expect(maxJump(frames)).toBeLessThan(0.15);
    expect(frames[frames.length - 1].alpha).toBe(0);
  });

  test('the exit takes the slow step and ends idle', () => {
    const frames = run((t) => t < 1000, 2000);
    const start = frames.findIndex((frame) => frame.machine.phase === 'fading-out');
    const end = frames.findIndex((frame, index) => index > start && frame.machine.phase === 'idle');
    expect(((end - start) * 16)).toBeGreaterThanOrEqual(LOADER_FADE_OUT_MS - 16);
    expect(((end - start) * 16)).toBeLessThanOrEqual(LOADER_FADE_OUT_MS + 32);
    expect(frames[end].alpha).toBe(0);
    expect(frames[end].visible).toBe(false);
  });

  test('a new wait during the fade-out turns around from the current opacity (no pop to 0 or 1)', () => {
    // Wait 0..800, idle 800..960, wait again from 960 while the exit is part way through.
    const active = (t: number): boolean => t < 800 || t >= 960;
    const frames = run(active, 2400, { stepMs: 8 });
    expect(maxJump(frames)).toBeLessThan(0.1);
    const turned = frames.findIndex((frame, index) => index > 0 && frames[index - 1].machine.phase === 'fading-out' && frame.machine.phase === 'fading-in');
    expect(turned).toBeGreaterThan(0);
    expect(frames[turned].alpha).toBeGreaterThan(0);
    expect(frames[turned].alpha).toBeLessThan(1);
    expect(frames[frames.length - 1].alpha).toBe(1);
  });

  test('instant (a cover under the still-showing HTML splash) starts fully opaque, with the hold already served', () => {
    const frames = run((t) => t < 100, 1000, { instantAtStart: true });
    expect(frames[0].alpha).toBe(1);
    expect(frames[0].visible).toBe(true);
    // The wait ended at 100 ms; no extra 350 ms hold on top of the splash's own.
    const out = frames.findIndex((frame) => frame.machine.phase === 'fading-out');
    expect(out * 16).toBeLessThanOrEqual(128);
    expect(frames[frames.length - 1].alpha).toBe(0);
  });

  test('reduced motion: both fades are the 200 ms crossfade; delay and hold are unchanged', () => {
    const frames = run((t) => t < 600, 2000, { reducedMotion: true });
    const firstVisible = frames.findIndex((frame) => frame.visible);
    expect(firstVisible * 16).toBeGreaterThanOrEqual(LOADER_SHOW_DELAY_MS);
    const full = frames.findIndex((frame) => frame.alpha === 1);
    expect((full - firstVisible) * 16).toBeLessThanOrEqual(MOTION_REDUCED_MS.crossfade + 32);
    const out = frames.findIndex((frame) => frame.machine.phase === 'fading-out');
    const idle = frames.findIndex((frame, index) => index > out && frame.machine.phase === 'idle');
    expect((idle - out) * 16).toBeLessThanOrEqual(MOTION_REDUCED_MS.crossfade + 32);
  });

  test('a clock that runs backwards, or a non-finite time, never produces NaN or negative opacity', () => {
    let machine = createLoaderMachine();
    for (const t of [100, 400, 300, Number.NaN, 700, 650]) {
      const frame = stepLoader(machine, true, t, false);
      machine = frame.machine;
      expect(Number.isFinite(frame.alpha)).toBe(true);
      expect(frame.alpha).toBeGreaterThanOrEqual(0);
      expect(frame.alpha).toBeLessThanOrEqual(1);
    }
  });

  test('is deterministic: the same inputs give the same frames', () => {
    const a = run((t) => t < 700, 1500).map((frame) => frame.alpha);
    const b = run((t) => t < 700, 1500).map((frame) => frame.alpha);
    expect(a).toEqual(b);
  });
});

describe('resolveLoaderPose', () => {
  test('alpha 0 draws nothing; every opacity tracks the loader opacity', () => {
    const pose = resolveLoaderPose(0, 500, false);
    expect(pose.backdropAlpha).toBe(0);
    expect(pose.iconAlpha).toBe(0);
    expect(pose.ringAlpha).toBe(0);
    expect(pose.labelAlpha).toBe(0);
  });

  test('full motion: the ring starts on the icon edge and grows while fading, once per beat', () => {
    const start = resolveLoaderPose(1, 0, false);
    expect(start.ringScale).toBe(1);
    expect(start.ringAlpha).toBeGreaterThan(0.4);
    const late = resolveLoaderPose(1, LOADER_PULSE_PERIOD_MS * 0.99, false);
    expect(late.ringScale).toBeGreaterThan(1 + (LOADER_RING_GROWTH * 0.9));
    expect(late.ringAlpha).toBeLessThan(0.02);
    const next = resolveLoaderPose(1, LOADER_PULSE_PERIOD_MS, false);
    expect(next.ringScale).toBeCloseTo(start.ringScale, 6);
    expect(next.iconScale).toBeCloseTo(start.iconScale, 6);
  });

  test('the icon breathes within a few percent and never below its size', () => {
    for (let t = 0; t <= LOADER_PULSE_PERIOD_MS; t += 50) {
      const pose = resolveLoaderPose(1, t, false);
      expect(pose.iconScale).toBeGreaterThanOrEqual(1);
      expect(pose.iconScale).toBeLessThanOrEqual(1.031);
    }
  });

  test('reduced motion: nothing moves with time (still icon, still halo ring)', () => {
    const a = resolveLoaderPose(1, 0, true);
    const b = resolveLoaderPose(1, 777, true);
    expect(a).toEqual(b);
    expect(a.iconScale).toBe(1);
    expect(a.ringScale).toBe(LOADER_RING_REDUCED_SCALE);
    expect(a.ringAlpha).toBeCloseTo(LOADER_RING_REDUCED_ALPHA, 10);
  });
});

describe('layout and HTML splash hand-off', () => {
  test('icon size is 30% of the short side, clamped 88..150', () => {
    expect(resolveLoaderIconSizePx(390, 844)).toBe(117);
    expect(resolveLoaderIconSizePx(375, 667)).toBe(113);
    expect(resolveLoaderIconSizePx(1280, 720)).toBe(LOADER_ICON_MAX_PX);
    expect(resolveLoaderIconSizePx(200, 300)).toBe(LOADER_ICON_MIN_PX);
    expect(resolveLoaderIconSizePx(0, 0)).toBe(LOADER_ICON_MIN_PX);
  });

  test('the loader is dead centre and the label sits under the icon', () => {
    const layout = resolveLoaderLayout(390, 844);
    expect(layout.centreX).toBe(195);
    expect(layout.centreY).toBe(422);
    expect(layout.labelCentreY).toBeGreaterThan(layout.centreY + (layout.iconSizePx / 2));
  });

  test('the HTML splash exit: leave at once if the loader never showed, else wait out the rest of the hold', () => {
    expect(resolveBootSplashExitDelayMs(null)).toBe(0);
    expect(resolveBootSplashExitDelayMs(Number.NaN)).toBe(0);
    expect(resolveBootSplashExitDelayMs(LOADER_SHOW_DELAY_MS - 1)).toBe(0);
    expect(resolveBootSplashExitDelayMs(LOADER_SHOW_DELAY_MS)).toBe(LOADER_MIN_HOLD_MS);
    expect(resolveBootSplashExitDelayMs(LOADER_SHOW_DELAY_MS + 100)).toBe(LOADER_MIN_HOLD_MS - 100);
    expect(resolveBootSplashExitDelayMs(LOADER_SHOW_DELAY_MS + LOADER_MIN_HOLD_MS)).toBe(0);
    expect(resolveBootSplashExitDelayMs(60_000)).toBe(0);
  });
});
