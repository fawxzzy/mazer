import { describe, expect, test } from 'vitest';
import {
  MOTION_DURATION_MS,
  MOTION_LOOP_MS,
  MOTION_REDUCED_MS
} from '../../src/render/motionScale';
import {
  UI_LOADER_PULSE_PERIOD_MS,
  UI_TRANSITION_DURATION_MS,
  UI_TRANSITION_FRAME_EMA_INITIAL_MS,
  UI_TRANSITION_MAX_AVERAGE_FRAME_MS,
  UI_TRANSITION_SNAPSHOT_MAX_PIXELS,
  advanceUiTransitionFrameAverageMs,
  shouldSkipUiTransitionForFrameBudget,
  UI_TRANSITION_START_END_SCALE,
  resolveUiTransitionSnapshotSize,
  resolveBootSplashFadeMs,
  resolveUiLoaderPulse,
  resolveUiTransitionFrame,
  resolveUiTransitionPlan,
  type UiTransitionKind
} from '../../src/render/uiTransition';

const KINDS: UiTransitionKind[] = ['start', 'overlay-open', 'overlay-close'];

describe('UI transition plans read the shared motion scale (MAZER-MOTION-002)', () => {
  test('full-motion lengths are steps of the duration ladder: panel in = base, exit = fast, Start = slow', () => {
    expect(UI_TRANSITION_DURATION_MS['overlay-open']).toBe(MOTION_DURATION_MS.base);
    expect(UI_TRANSITION_DURATION_MS['overlay-close']).toBe(MOTION_DURATION_MS.fast);
    expect(UI_TRANSITION_DURATION_MS.start).toBe(MOTION_DURATION_MS.slow);
    for (const kind of KINDS) {
      expect(Object.values(MOTION_DURATION_MS)).toContain(resolveUiTransitionPlan(kind, false).durationMs);
    }
  });

  test('reduced motion is the one 200 ms crossfade for every kind, with no movement', () => {
    for (const kind of KINDS) {
      const plan = resolveUiTransitionPlan(kind, true);
      expect(plan.durationMs).toBe(MOTION_REDUCED_MS.crossfade);
      expect(plan.durationMs).toBe(200);
      expect(plan.endScale).toBe(1);
      for (const elapsed of [0, 50, 100, 150, 199, 200]) {
        expect(resolveUiTransitionFrame(plan, elapsed).scale).toBe(1);
      }
    }
  });

  test('only Start moves in full motion, by a small outward drift', () => {
    expect(resolveUiTransitionPlan('start', false).endScale).toBe(UI_TRANSITION_START_END_SCALE);
    expect(UI_TRANSITION_START_END_SCALE).toBeGreaterThan(1);
    expect(UI_TRANSITION_START_END_SCALE).toBeLessThanOrEqual(1.05);
    expect(resolveUiTransitionPlan('overlay-open', false).endScale).toBe(1);
    expect(resolveUiTransitionPlan('overlay-close', false).endScale).toBe(1);
  });
});

describe('UI transition frames', () => {
  test('the outgoing snapshot starts fully opaque and ends invisible and finished', () => {
    for (const reduced of [false, true]) {
      for (const kind of KINDS) {
        const plan = resolveUiTransitionPlan(kind, reduced);
        const first = resolveUiTransitionFrame(plan, 0);
        expect(first.alpha).toBe(1);
        expect(first.scale).toBe(1);
        expect(first.done).toBe(false);
        const last = resolveUiTransitionFrame(plan, plan.durationMs);
        expect(last.alpha).toBe(0);
        expect(last.scale).toBeCloseTo(plan.endScale, 10);
        expect(last.done).toBe(true);
      }
    }
  });

  test('alpha falls monotonically and stays in 0..1; scale rises monotonically toward the end scale', () => {
    const plan = resolveUiTransitionPlan('start', false);
    let previousAlpha = 2;
    let previousScale = 0;
    for (let elapsed = 0; elapsed <= plan.durationMs; elapsed += 5) {
      const frame = resolveUiTransitionFrame(plan, elapsed);
      expect(frame.alpha).toBeGreaterThanOrEqual(0);
      expect(frame.alpha).toBeLessThanOrEqual(1);
      expect(frame.alpha).toBeLessThanOrEqual(previousAlpha);
      expect(frame.scale).toBeGreaterThanOrEqual(previousScale);
      expect(frame.scale).toBeLessThanOrEqual(plan.endScale + 1e-9);
      previousAlpha = frame.alpha;
      previousScale = frame.scale;
    }
  });

  test('is a pure function of elapsed time: a late sample is simply done, a negative one is the first frame', () => {
    const plan = resolveUiTransitionPlan('overlay-open', false);
    expect(resolveUiTransitionFrame(plan, plan.durationMs * 10)).toEqual(resolveUiTransitionFrame(plan, plan.durationMs));
    expect(resolveUiTransitionFrame(plan, -40)).toEqual(resolveUiTransitionFrame(plan, 0));
    expect(resolveUiTransitionFrame(plan, 77)).toEqual(resolveUiTransitionFrame(plan, 77));
  });

  test('non-finite elapsed time finishes the transition instead of leaving a cover on screen', () => {
    const plan = resolveUiTransitionPlan('overlay-close', false);
    expect(resolveUiTransitionFrame(plan, Number.NaN).done).toBe(true);
    expect(resolveUiTransitionFrame(plan, Number.POSITIVE_INFINITY).done).toBe(true);
  });

  test('a zero-length plan is finished at the first frame', () => {
    expect(resolveUiTransitionFrame({ kind: 'start', durationMs: 0, endScale: 1, reducedMotion: false }, 0).done).toBe(true);
  });
});

describe('shared loader period and splash fade', () => {
  test('the loader pulses on the one beat the HTML splash dot also uses', () => {
    expect(UI_LOADER_PULSE_PERIOD_MS).toBe(MOTION_LOOP_MS.beat);
    expect(resolveUiLoaderPulse(0, false)).toBeCloseTo(0.5, 10);
    expect(resolveUiLoaderPulse(UI_LOADER_PULSE_PERIOD_MS / 4, false)).toBeCloseTo(1, 10);
    expect(resolveUiLoaderPulse((UI_LOADER_PULSE_PERIOD_MS * 3) / 4, false)).toBeCloseTo(0, 10);
    expect(resolveUiLoaderPulse(UI_LOADER_PULSE_PERIOD_MS, false)).toBeCloseTo(0.5, 10);
  });

  test('reduced motion holds the loader still and lit', () => {
    for (const time of [0, 300, 900, 12345]) {
      expect(resolveUiLoaderPulse(time, true)).toBe(0.5);
    }
    expect(resolveUiLoaderPulse(Number.NaN, false)).toBe(0.5);
  });

  test('the splash fades over the slow step, or the 200 ms crossfade under reduced motion', () => {
    expect(resolveBootSplashFadeMs(false)).toBe(MOTION_DURATION_MS.slow);
    expect(resolveBootSplashFadeMs(true)).toBe(MOTION_REDUCED_MS.crossfade);
  });
});

describe('snapshot pixel budget', () => {
  test('a canvas within the budget is copied 1:1', () => {
    expect(resolveUiTransitionSnapshotSize(1280, 720)).toEqual({ width: 1280, height: 720 });
    expect(resolveUiTransitionSnapshotSize(390, 844)).toEqual({ width: 390, height: 844 });
  });

  test('a DPR 3 phone canvas is reduced to the budget and keeps its aspect ratio', () => {
    const size = resolveUiTransitionSnapshotSize(1170, 2532);
    expect(size.width * size.height).toBeLessThanOrEqual(UI_TRANSITION_SNAPSHOT_MAX_PIXELS);
    expect(size.width * size.height).toBeGreaterThan(UI_TRANSITION_SNAPSHOT_MAX_PIXELS * 0.95);
    expect(size.width / size.height).toBeCloseTo(1170 / 2532, 2);
  });

  test('degenerate sizes never produce NaN or a zero-by-something copy of a real canvas', () => {
    expect(resolveUiTransitionSnapshotSize(0, 500)).toEqual({ width: 0, height: 500 });
    expect(resolveUiTransitionSnapshotSize(Number.NaN, 500)).toEqual({ width: 0, height: 500 });
    const huge = resolveUiTransitionSnapshotSize(100000, 1);
    expect(huge.width).toBeGreaterThanOrEqual(1);
    expect(huge.height).toBeGreaterThanOrEqual(1);
  });
});

describe('frame budget gate', () => {
  test('a device holding 60 fps or 30 fps gets the cover; one below 30 fps gets the instant change', () => {
    expect(shouldSkipUiTransitionForFrameBudget(UI_TRANSITION_FRAME_EMA_INITIAL_MS)).toBe(false);
    expect(shouldSkipUiTransitionForFrameBudget(33.3)).toBe(false);
    expect(shouldSkipUiTransitionForFrameBudget(UI_TRANSITION_MAX_AVERAGE_FRAME_MS + 0.1)).toBe(true);
    expect(shouldSkipUiTransitionForFrameBudget(Number.NaN)).toBe(false);
  });

  test('the average follows sustained slow frames and recovers, but one long pause cannot poison it', () => {
    let average = UI_TRANSITION_FRAME_EMA_INITIAL_MS;
    for (let i = 0; i < 60; i += 1) average = advanceUiTransitionFrameAverageMs(average, 60);
    expect(shouldSkipUiTransitionForFrameBudget(average)).toBe(true);
    for (let i = 0; i < 80; i += 1) average = advanceUiTransitionFrameAverageMs(average, 16.7);
    expect(shouldSkipUiTransitionForFrameBudget(average)).toBe(false);

    const afterPause = advanceUiTransitionFrameAverageMs(UI_TRANSITION_FRAME_EMA_INITIAL_MS, 30000);
    expect(shouldSkipUiTransitionForFrameBudget(afterPause)).toBe(false);
  });

  test('ignores non-finite and non-positive frame deltas', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -5]) {
      expect(advanceUiTransitionFrameAverageMs(20, bad)).toBe(20);
    }
  });
});
