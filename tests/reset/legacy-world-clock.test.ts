import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  EMPTY_HAZARD_SCHEDULE,
  WORLD_CLOCK_MAX_FRAME_GAP_MS,
  createHazardWorldRuntime,
  createWorldClock,
  resolveHazardSchedule
} from '../../src/legacy-runtime/legacyWorldClock';

const TICK = 140;
const FRAME = 16;

// Drives a runtime frame by frame off the (fake) system clock, like the scene update loop.
const makeLoop = (runtime: ReturnType<typeof createHazardWorldRuntime>, active: () => boolean) => (ms: number): number => {
  let ticks = 0;
  for (let spent = 0; spent < ms; spent += FRAME) {
    vi.advanceTimersByTime(FRAME);
    ticks += runtime.frame(Date.now(), active(), TICK);
  }
  return ticks;
};

describe('world clock (fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('does not run before the first input, however long the board is read', () => {
    const runtime = createHazardWorldRuntime();
    const run = makeLoop(runtime, () => true);
    expect(run(10_000)).toBe(0);
    expect(runtime.clock.phase).toBe('idle');
    expect(runtime.clock.ticks).toBe(0);
  });

  test('starts on the first input and then ticks once per repeat interval', () => {
    const runtime = createHazardWorldRuntime();
    const run = makeLoop(runtime, () => true);
    run(5_000);
    runtime.noteInput(Date.now());
    expect(runtime.clock.phase).toBe('running');
    run(1_400);
    // 1400 ms in 16 ms frames counts 1408 ms (88 frames): 10 ticks of 140 ms.
    expect(runtime.clock.ticks).toBe(10);
    // A later input does not restart or shift a running clock.
    runtime.noteInput(Date.now());
    expect(runtime.clock.snapshot().starts).toBe(1);
  });

  test('pause (inactive frames) stops the clock; the time paused is never caught up', () => {
    let active = true;
    const runtime = createHazardWorldRuntime();
    const run = makeLoop(runtime, () => active);
    runtime.noteInput(Date.now());
    run(700);
    const before = runtime.clock.ticks;
    expect(before).toBeGreaterThanOrEqual(4);
    active = false;
    run(60_000);
    expect(runtime.clock.phase).toBe('stopped');
    expect(runtime.clock.ticks).toBe(before);
    // Resume: still stopped until the next input.
    active = true;
    run(2_000);
    expect(runtime.clock.ticks).toBe(before);
    runtime.noteInput(Date.now());
    run(FRAME);
    expect(runtime.clock.phase).toBe('running');
    expect(runtime.clock.ticks - before).toBeLessThanOrEqual(1);
    expect(runtime.clock.snapshot()).toMatchObject({ starts: 2, stops: 1 });
  });

  test('blur stops the clock by itself with no catch-up, restarting on the next input', () => {
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget();
    const runtime = createHazardWorldRuntime({ windowTarget, documentTarget, isHidden: () => false });
    const run = makeLoop(runtime, () => true);
    runtime.noteInput(Date.now());
    run(500);
    const before = runtime.clock.ticks;
    windowTarget.dispatchEvent(new Event('blur'));
    expect(runtime.clock.phase).toBe('stopped');
    vi.advanceTimersByTime(30_000);
    run(FRAME * 3);
    expect(runtime.clock.ticks).toBe(before);
    runtime.noteInput(Date.now());
    run(280);
    expect(runtime.clock.ticks - before).toBeLessThanOrEqual(2);
    runtime.dispose();
  });

  test('visibilitychange stops only when the page is hidden', () => {
    const documentTarget = new EventTarget();
    let hidden = false;
    const runtime = createHazardWorldRuntime({ documentTarget, isHidden: () => hidden });
    runtime.noteInput(Date.now());
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(runtime.clock.phase).toBe('running');
    hidden = true;
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(runtime.clock.phase).toBe('stopped');
    runtime.dispose();
  });

  test('dispose removes the listeners', () => {
    const windowTarget = new EventTarget();
    const runtime = createHazardWorldRuntime({ windowTarget });
    runtime.dispose();
    runtime.noteInput(Date.now());
    windowTarget.dispatchEvent(new Event('blur'));
    expect(runtime.clock.phase).toBe('running');
  });

  test('one stalled frame is clamped, never fast-forwarded', () => {
    const clock = createWorldClock();
    clock.noteInput(0);
    expect(clock.frame(10_000, true, TICK)).toBe(Math.floor(WORLD_CLOCK_MAX_FRAME_GAP_MS / TICK));
    expect(clock.ticks).toBeLessThanOrEqual(2);
  });

  test('a new level resets to idle', () => {
    const runtime = createHazardWorldRuntime();
    runtime.noteInput(0);
    runtime.frame(100, true, TICK);
    runtime.frame(200, true, TICK);
    expect(runtime.clock.ticks).toBe(1);
    runtime.resetLevel();
    expect(runtime.clock.snapshot()).toMatchObject({ phase: 'idle', ticks: 0, remainderMs: 0 });
    expect(runtime.frame(900, true, TICK)).toBe(0);
  });

  test('bad inputs (zero or NaN tick, time going backwards) never throw or tick', () => {
    const clock = createWorldClock();
    clock.noteInput(100);
    expect(clock.frame(200, true, 0)).toBe(0);
    expect(clock.frame(300, true, Number.NaN)).toBe(0);
    expect(clock.frame(250, true, TICK)).toBe(0);
    expect(clock.ticks).toBe(0);
  });
});

describe('the hazard schedule with the layer on is empty (H1)', () => {
  test('no hazards of any kind, frozen, for any level', () => {
    for (const level of [1, 10, 20, 35, 60, 288, 5000, '999']) {
      const schedule = resolveHazardSchedule(level);
      expect(schedule).toBe(EMPTY_HAZARD_SCHEDULE);
      expect(schedule.hazards).toEqual([]);
      expect(schedule.gates).toEqual([]);
      expect(schedule.sentries).toEqual([]);
      expect(schedule.hunters).toEqual([]);
      expect(schedule.shards).toEqual([]);
    }
    expect(Object.isFrozen(EMPTY_HAZARD_SCHEDULE)).toBe(true);
    expect(Object.isFrozen(EMPTY_HAZARD_SCHEDULE.hazards)).toBe(true);
  });
});

describe('world clock perf budget: under 0.05 ms per frame', () => {
  test('frame() averages far below the budget (number printed for the PR)', () => {
    const clock = createWorldClock();
    clock.noteInput(0);
    const FRAMES = 1_000_000;
    let now = 0;
    for (let index = 0; index < 50_000; index += 1) { now += 8; clock.frame(now, true, TICK); }
    const started = performance.now();
    let sink = 0;
    for (let index = 0; index < FRAMES; index += 1) {
      now += 8;
      sink += clock.frame(now, true, TICK);
    }
    const perFrameMs = (performance.now() - started) / FRAMES;
    console.log(`world clock frame(): ${(perFrameMs * 1000).toFixed(4)} us/frame (${FRAMES} frames, ${sink} ticks)`);
    expect(perFrameMs).toBeLessThan(0.05);
  });
});
