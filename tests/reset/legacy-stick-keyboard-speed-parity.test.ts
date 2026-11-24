import { describe, expect, test, vi } from 'vitest';
import { MenuScene } from '../../src/scenes/MenuScene';
import { LegacyDirectionalIntentResolver } from '../../src/legacy-runtime/legacyDirectionalIntent';
import { HumanInputRepeatGate } from '../../src/input-human/keyboard';
import {
  FLOATING_ANCHOR_LEASH_INCHES,
  createFloatingAnchorController,
  resolveFloatingAnchorConfig
} from '../../src/legacy-runtime/legacyFloatingAnchor';
import { resolveLegacyMovementSpeedProfile } from '../../src/legacy-runtime/legacyMovementSpeed';
import { HARNESS_PATHS, measureReversalCostInches, simulateHarnessPath } from '../../scripts/legacy/floating-anchor-harness';

vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)), Linear: (a: number, b: number, t: number) => a + ((b - a) * t) },
    Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' },
    Scene: class {}
  }
}));

/**
 * MAZER-CTRL-005 speed parity harness (deterministic; no Phaser, no wall clock).
 *
 * Drives the REAL MenuScene cadence methods (stick: setLegacyPlayHeldTouchMoveCandidates / retarget / schedule / repeat;
 * keyboard: handleLegacyPlayMovementKeyDown) on a stub scene with a virtual clock that fires timers on frame boundaries
 * like Phaser's Clock does. Only the step itself (`performLegacyPlayDirectionalIntentStep`) is stubbed to count a step
 * and stamp `lastLegacyPlayStepAtMs`, so the maze and player do not matter: the question is how often a held input
 * produces a step, in cells per second.
 */

type Timer = { dueAtMs: number; callback: () => void; removed: boolean };
type Scene = Record<string, unknown> & { time: { now: number; delayedCall: (delay: number, cb: () => void) => { remove: () => void } } };

const proto = MenuScene.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
const call = <T>(scene: Scene, name: string, ...args: unknown[]): T => proto[name]!.call(scene, ...args) as T;

const PHONE = { width: 393, height: 852 };
const FRAME_RATES = [60, 120] as const;

interface Run {
  stepTimesMs: number[];
}

const createHarness = (movementSpeed: number, fps: number) => {
  const timers: Timer[] = [];
  const stepTimesMs: number[] = [];
  const profile = resolveLegacyMovementSpeedProfile(movementSpeed);
  const scene = Object.create(MenuScene.prototype) as Scene;
  const frameMs = 1000 / fps;
  const floatingAnchor = createFloatingAnchorController(resolveFloatingAnchorConfig({
    coarsePointer: true,
    devicePixelRatio: 3
  }));
  Object.assign(scene, {
    mode: 'play',
    overlay: 'none',
    pendingResetRequest: null,
    layout: { width: PHONE.width, height: PHONE.height },
    settings: { movementSpeed },
    game: { loop: { actualFps: fps } },
    time: {
      now: 0,
      delayedCall: (delay: number, callback: () => void) => {
        const timer: Timer = { dueAtMs: scene.time.now + delay, callback, removed: false };
        timers.push(timer);
        return { remove: () => { timer.removed = true; } };
      }
    },
    floatingAnchor,
    playHeldTouchMoves: [],
    playHeldTouchSequence: 0,
    playHeldTouchRepeatTimer: null,
    playHeldTouchRepeatDueAtMs: null,
    playHeldTouchRepeatFiredDueAtMs: null,
    playTouchStickPointerId: null,
    playTouchArrowPointerId: null,
    playTouchStickPull: null,
    playTouchStickFinger: null,
    playFloatingStickOrigin: null,
    playDirectionalIntent: new LegacyDirectionalIntentResolver(),
    playMoveFlags: { up: false, down: false, left: false, right: false },
    playMoveTimer: null,
    playKeyboardRepeatGate: new HumanInputRepeatGate(),
    playKeyboardBufferedVector: null,
    lastLegacyPlayStepAtMs: null,
    boardDynamicDirty: false,
    hudDirty: false,
    publishInteractionDiagnostics: () => undefined,
    // The step itself: count it and stamp the time, like tryMovePlayer does on an accepted step.
    performLegacyPlayDirectionalIntentStep: () => {
      stepTimesMs.push(scene.time.now);
      scene.lastLegacyPlayStepAtMs = scene.time.now;
      return true;
    }
  });
  // Phaser Clock: a delayed call fires on the first frame whose time has reached its due time, in due order.
  const runFrame = (frameTimeMs: number): void => {
    scene.time.now = frameTimeMs;
    for (;;) {
      const next = timers
        .filter((timer) => !timer.removed && timer.dueAtMs <= frameTimeMs + 1e-9)
        .sort((a, b) => a.dueAtMs - b.dueAtMs)[0];
      if (!next) {
        return;
      }
      next.removed = true;
      next.callback();
    }
  };
  return { scene, profile, frameMs, stepTimesMs, runFrame };
};

/** The stick held at one deflection (css px from where the thumb landed) for `seconds`; returns the step times. */
const runStick = (movementSpeed: number, fps: number, deflectionPx: number, seconds = 6): Run => {
  const { scene, frameMs, stepTimesMs, runFrame } = createHarness(movementSpeed, fps);
  const origin = { x: 150, y: 400 };
  Object.assign(scene, { playTouchStickPointerId: 1, playFloatingStickOrigin: origin, playTouchStickFinger: origin });
  (scene.floatingAnchor as ReturnType<typeof createFloatingAnchorController>).down(origin, 0);
  runFrame(0);
  call(scene, 'handleLegacyPlayTouchControlMove', origin.x + deflectionPx, origin.y, 1, 0);
  const frames = Math.round((seconds * 1000) / frameMs);
  for (let frame = 1; frame <= frames; frame += 1) {
    const now = frame * frameMs;
    runFrame(now);
    // The thumb stays put; the scene keeps feeding the same finger position each frame, as pointermove/tick do.
    if (frame % Math.round(fps / 30) === 0) {
      call(scene, 'handleLegacyPlayTouchControlMove', origin.x + deflectionPx, origin.y, 1, now);
    }
  }
  return { stepTimesMs };
};

/** A held arrow key: keydown, the OS repeat delay, then repeat events at `osRepeatMs` (the OS key repeat period). */
const runKeyboard = (movementSpeed: number, fps: number, osRepeatMs: number, seconds = 6): Run => {
  const { scene, frameMs, stepTimesMs, runFrame } = createHarness(movementSpeed, fps);
  const osDelayMs = 500;
  const events: number[] = [0];
  for (let t = osDelayMs; t < seconds * 1000; t += osRepeatMs) {
    events.push(t);
  }
  let nextEvent = 0;
  const frames = Math.round((seconds * 1000) / frameMs);
  for (let frame = 0; frame <= frames; frame += 1) {
    const frameTime = frame * frameMs;
    // Key events land between frames: they see the previous frame's clock (scene.time.now).
    while (nextEvent < events.length && events[nextEvent]! <= frameTime) {
      const event = {
        key: 'ArrowRight',
        code: 'ArrowRight',
        repeat: nextEvent > 0,
        timeStamp: events[nextEvent],
        preventDefault: () => undefined
      } as unknown as KeyboardEvent;
      call(scene, 'handleLegacyPlayMovementKeyDown', event);
      nextEvent += 1;
    }
    runFrame(frameTime);
  }
  return { stepTimesMs };
};

/** Mean step period in ms over the steady state (after the first three steps, which carry start-up delays). */
const steadyPeriodMs = (run: Run): number => {
  const times = run.stepTimesMs.slice(3);
  if (times.length < 4) {
    return Number.NaN;
  }
  return (times[times.length - 1]! - times[0]!) / (times.length - 1);
};
const cellsPerSecond = (periodMs: number): number => 1000 / periodMs;

const SPEEDS = [0, 0.04, 0.3, 0.6, 1] as const;
const DEFLECTIONS_PX = [14, 25, 40, 47, 90, 140] as const;
const OS_REPEAT_MS = [33, 83] as const;

describe('MAZER-CTRL-005 stick and keyboard speed parity', () => {
  test.each(SPEEDS)('move speed %s: full-deflection stick, held key and the profile all step at one pace', (speed) => {
    const intervalMs = resolveLegacyMovementSpeedProfile(speed).repeatIntervalMs;
    for (const fps of FRAME_RATES) {
      for (const deflection of DEFLECTIONS_PX) {
        const period = steadyPeriodMs(runStick(speed, fps, deflection));
        // Within 2%: the stick must not be faster or slower than the profile interval at any deflection or refresh rate.
        expect(Math.abs(period - intervalMs) / intervalMs).toBeLessThan(0.02);
      }
      for (const osRepeat of OS_REPEAT_MS) {
        const period = steadyPeriodMs(runKeyboard(speed, fps, osRepeat));
        expect(Math.abs(period - intervalMs) / intervalMs).toBeLessThan(0.02);
      }
    }
  });

  test('the stick speed does not depend on how far it is pulled (no variable-speed drag)', () => {
    for (const speed of SPEEDS) {
      const periods = DEFLECTIONS_PX.map((deflection) => steadyPeriodMs(runStick(speed, 60, deflection)));
      expect(Math.max(...periods) - Math.min(...periods)).toBeLessThan(1);
    }
  });

  test('the stick and the keyboard agree in cells per second at the default Move Speed', () => {
    const stick = cellsPerSecond(steadyPeriodMs(runStick(0.04, 60, 47)));
    const keyboard = cellsPerSecond(steadyPeriodMs(runKeyboard(0.04, 60, 33)));
    expect(Math.abs(stick - keyboard)).toBeLessThan(0.1);
  });

  test('a faster Move Speed is still faster for both inputs', () => {
    const rates = SPEEDS.map((speed) => ({
      stick: cellsPerSecond(steadyPeriodMs(runStick(speed, 60, 47))),
      keyboard: cellsPerSecond(steadyPeriodMs(runKeyboard(speed, 60, 33)))
    }));
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i]!.stick).toBeGreaterThan(rates[i - 1]!.stick - 1e-9);
      expect(rates[i]!.keyboard).toBeGreaterThan(rates[i - 1]!.keyboard - 1e-9);
    }
    expect(rates[rates.length - 1]!.stick).toBeGreaterThan(rates[1]!.stick * 1.5);
  });
});

describe('MAZER-CTRL-005 leash', () => {
  test('the leash is 56 css px (0.35 in at 160 css px per inch) on a phone', () => {
    expect(FLOATING_ANCHOR_LEASH_INCHES).toBeCloseTo(56 / 160, 9);
    expect(resolveFloatingAnchorConfig({ coarsePointer: true, devicePixelRatio: 3 }).leashPx).toBeCloseTo(56, 6);
  });

  test('the leash is never shorter than the stick max pull radius, on a phone or an iPad', () => {
    // Stick geometry (MenuScene.resolveLegacyPlayFloatingStickGeometry): ring = clamp(round(0.24 * minDim), 92, 160),
    // deadzone = max(12, round(0.12 * ring)); touch.ts max pull = deadzone + 0.6 * (ringRadius - deadzone).
    const leashPx = resolveFloatingAnchorConfig({ coarsePointer: true, devicePixelRatio: 3 }).leashPx;
    for (const minDim of [320, 360, 390, 393, 430, 600, 768, 820, 1024]) {
      const ring = Math.min(160, Math.max(92, Math.round(0.24 * minDim)));
      const deadzone = Math.max(12, Math.round(0.12 * ring));
      const maxPull = deadzone + ((ring / 2) - deadzone) * 0.6;
      expect(leashPx).toBeGreaterThanOrEqual(Math.floor(maxPull));
    }
  });

  test('a reversal costs less thumb travel than with the old 90 px leash', () => {
    const path = HARNESS_PATHS.find((p) => p.name === 'quick-reversal')!;
    const cost = (inches: number) => measureReversalCostInches(
      simulateHarnessPath(path, resolveFloatingAnchorConfig({ coarsePointer: true, devicePixelRatio: 3, leashInches: inches }), 160),
      160,
      0.1
    )!;
    expect(cost(FLOATING_ANCHOR_LEASH_INCHES)).toBeLessThan(cost(90 / 160) - 0.1);
    expect(cost(FLOATING_ANCHOR_LEASH_INCHES)).toBeLessThan(1);
  });
});
