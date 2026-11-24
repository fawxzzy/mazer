import { describe, expect, test, vi } from 'vitest';
import { MenuScene } from '../../src/scenes/MenuScene';
import { LegacyDirectionalIntentResolver } from '../../src/legacy-runtime/legacyDirectionalIntent';

vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)), Linear: (a: number, b: number, t: number) => a + ((b - a) * t) },
    Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' },
    Scene: class {}
  }
}));

// The constant-speed floor through the REAL MenuScene methods on a stub scene (the pure rule and the full turn
// simulation live in tests/legacy-runtime/legacyHeldStepCadence.test.ts). Only timers and diagnostics are stubbed.

type Scene = Record<string, unknown> & {
  time: { now: number; delayedCall: (delay: number, callback: () => void) => { remove: () => void } };
};

const proto = MenuScene.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
const call = <T>(scene: Scene, name: string, ...args: unknown[]): T => proto[name]!.call(scene, ...args) as T;

// MAZER-CTRL-005: the stick repeats at the keyboard interval (no stick cap on the repeat).
const STICK_REPEAT_MS = 151;
const KEYBOARD_REPEAT_MS = 151;

const createScene = () => {
  const armed: Array<{ delay: number; callback: () => void; removed: boolean }> = [];
  const scene = Object.create(MenuScene.prototype) as Scene;
  Object.assign(scene, {
    mode: 'play',
    overlay: 'none',
    pendingResetRequest: null,
    time: {
      now: 1000,
      delayedCall: (delay: number, callback: () => void) => {
        const entry = { delay, callback, removed: false };
        armed.push(entry);
        return { remove: () => { entry.removed = true; } };
      }
    },
    playHeldTouchMoves: [{ control: 'move_right', pointerId: 1, sequence: 1 }],
    playHeldTouchSequence: 1,
    playHeldTouchRepeatTimer: null,
    playHeldTouchRepeatDueAtMs: null,
    playHeldTouchRepeatFiredDueAtMs: null,
    playTouchStickPointerId: 1,
    playTouchArrowPointerId: null,
    playTouchStickPull: null,
    playDirectionalIntent: new LegacyDirectionalIntentResolver(),
    playMoveFlags: { up: false, down: false, left: false, right: false },
    playMoveTimer: null,
    playKeyboardRepeatGate: { accept: () => true },
    playKeyboardBufferedVector: null,
    lastLegacyPlayStepAtMs: null,
    boardDynamicDirty: false,
    hudDirty: false,
    publishInteractionDiagnostics: () => undefined,
    resolveLegacyPlayMovementSpeedProfile: () => ({ initialDelayMs: 372, repeatIntervalMs: KEYBOARD_REPEAT_MS, turnDelayMs: 417 })
  });
  return { scene, armed };
};

const armStickRepeat = (scene: Scene, dueAtMs: number): void => {
  Object.assign(scene, { playHeldTouchRepeatTimer: { remove: () => undefined }, playHeldTouchRepeatDueAtMs: dueAtMs });
};

describe('held moves keep one speed through turns (real MenuScene methods)', () => {
  test('stick: a turn 10 ms after a step keeps the armed step (was re-armed 32 ms out: the corner boost)', () => {
    const { scene, armed } = createScene();
    Object.assign(scene, { lastLegacyPlayStepAtMs: 990 });
    armStickRepeat(scene, 990 + STICK_REPEAT_MS);
    call(scene, 'setLegacyPlayHeldTouchMoveCandidates', ['move_down', 'move_right'], 1, { keepWhenBlocked: true, smoothRetarget: true });
    expect(armed).toHaveLength(0);
    expect(scene.playHeldTouchRepeatDueAtMs).toBe(990 + STICK_REPEAT_MS);
  });

  test('stick: from rest (no step for a while) a new direction still answers in 32 ms', () => {
    const { scene, armed } = createScene();
    Object.assign(scene, { lastLegacyPlayStepAtMs: 200 });
    armStickRepeat(scene, 1000 + STICK_REPEAT_MS);
    call(scene, 'setLegacyPlayHeldTouchMoveCandidates', ['move_down', 'move_right'], 1, { keepWhenBlocked: true, smoothRetarget: true });
    expect(armed.map((entry) => entry.delay)).toEqual([32]);
  });

  test('stick: nothing armed during a run arms for the end of the interval, not 32 ms', () => {
    const { scene, armed } = createScene();
    Object.assign(scene, { lastLegacyPlayStepAtMs: 960 });
    call(scene, 'setLegacyPlayHeldTouchMoveCandidates', ['move_down', 'move_right'], 1, { keepWhenBlocked: true, smoothRetarget: true });
    expect(armed.map((entry) => entry.delay)).toEqual([960 + STICK_REPEAT_MS - 1000]);
  });

  test('keyboard: a turn press 20 ms after a step waits out the interval, and a quick release still takes its one step', () => {
    const { scene, armed } = createScene();
    Object.assign(scene, { lastLegacyPlayStepAtMs: 980, playHeldTouchMoves: [], playTouchStickPointerId: null });
    const moves: Array<[number, number]> = [];
    scene.tryMovePlayerFromInput = (deltaX: unknown, deltaY: unknown) => { moves.push([deltaX as number, deltaY as number]); return true; };
    const event = { key: 'ArrowDown', code: 'ArrowDown', repeat: false, timeStamp: 1000, preventDefault: () => undefined } as unknown as KeyboardEvent;
    expect(call(scene, 'handleLegacyPlayMovementKeyDown', event)).toBe(true);
    expect(armed.map((entry) => entry.delay)).toEqual([980 + KEYBOARD_REPEAT_MS - 1000]);
    // Released 30 ms later, before the interval is up: no early step.
    scene.time.now = 1030;
    expect(call(scene, 'handleLegacyPlayMovementKeyUp', event)).toBe(true);
    expect(moves).toEqual([]);
    // The buffered step lands when the timer fires, exactly once.
    scene.time.now = 980 + KEYBOARD_REPEAT_MS;
    armed[0]!.callback();
    expect(moves).toEqual([[0, 1]]);
  });

  test('keyboard: a press from rest keeps the 50 ms two-key buffer', () => {
    const { scene, armed } = createScene();
    Object.assign(scene, { lastLegacyPlayStepAtMs: 100, playHeldTouchMoves: [], playTouchStickPointerId: null });
    const event = { key: 'ArrowRight', code: 'ArrowRight', repeat: false, timeStamp: 1000, preventDefault: () => undefined } as unknown as KeyboardEvent;
    expect(call(scene, 'handleLegacyPlayMovementKeyDown', event)).toBe(true);
    expect(armed.map((entry) => entry.delay)).toEqual([50]);
  });
});
