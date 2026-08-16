import { describe, expect, test } from 'vitest';

import {
  HumanInputRepeatGate,
  resolveHumanKeyboardAction,
  resolveHumanKeyboardActionKind
} from '../../src/input-human';

describe('input-human keyboard bridge', () => {
  test('maps desktop movement and control keys into the shared action schema', () => {
    expect(resolveHumanKeyboardActionKind({ code: 'ArrowUp' })).toBe('move_up');
    expect(resolveHumanKeyboardActionKind({ code: 'KeyW' })).toBe('move_up');
    expect(resolveHumanKeyboardActionKind({ code: 'ArrowLeft' })).toBe('move_left');
    expect(resolveHumanKeyboardActionKind({ code: 'KeyP' })).toBe('pause');
    expect(resolveHumanKeyboardActionKind({ code: 'KeyR' })).toBeNull();
    expect(resolveHumanKeyboardActionKind({ code: 'KeyT' })).toBe('toggle_thoughts');
    expect(resolveHumanKeyboardActionKind({ code: 'KeyQ' })).toBeNull();
  });

  test('builds normalized keyboard actions with stable timing metadata', () => {
    expect(resolveHumanKeyboardAction({
      code: 'KeyD',
      key: 'd',
      repeat: false,
      timeStamp: 128
    })).toEqual({
      kind: 'move_right',
      source: 'keyboard',
      atMs: 128,
      repeat: false,
      key: 'KeyD'
    });
  });

  test('bounds repeated movement actions but blocks repeated toggles', () => {
    const gate = new HumanInputRepeatGate({ moveRepeatMinIntervalMs: 120 });
    const move = resolveHumanKeyboardAction({ code: 'ArrowRight', repeat: false, timeStamp: 100 })!;
    const earlyRepeat = resolveHumanKeyboardAction({ code: 'ArrowRight', repeat: true, timeStamp: 180 })!;
    const lateRepeat = resolveHumanKeyboardAction({ code: 'ArrowRight', repeat: true, timeStamp: 240 })!;
    const pauseRepeat = resolveHumanKeyboardAction({ code: 'KeyP', repeat: true, timeStamp: 260 })!;

    expect(gate.accept(move)).toBe(true);
    expect(gate.accept(earlyRepeat)).toBe(false);
    expect(gate.accept(lateRepeat)).toBe(true);
    expect(gate.accept(pauseRepeat)).toBe(false);
    expect(gate.getSnapshot()).toMatchObject({
      acceptedCount: 2,
      droppedCount: 1,
      mergedCount: 1,
      lastAcceptedActionKind: 'move_right',
      lastDroppedActionKind: 'pause',
      lastDroppedReason: 'repeat_blocked'
    });
  });

  test('shares one repeat cadence across simultaneous movement directions', () => {
    const gate = new HumanInputRepeatGate({ moveRepeatMinIntervalMs: 120 });
    const right = resolveHumanKeyboardAction({ code: 'ArrowRight', repeat: false, timeStamp: 100 })!;
    const up = resolveHumanKeyboardAction({ code: 'ArrowUp', repeat: false, timeStamp: 110 })!;
    const rightRepeat = resolveHumanKeyboardAction({ code: 'ArrowRight', repeat: true, timeStamp: 220 })!;
    const upRepeat = resolveHumanKeyboardAction({ code: 'ArrowUp', repeat: true, timeStamp: 235 })!;

    expect(gate.accept(right)).toBe(true);
    expect(gate.accept(up)).toBe(true);
    expect(gate.accept(rightRepeat)).toBe(false);
    expect(gate.accept(upRepeat)).toBe(true);
    expect(gate.getSnapshot()).toMatchObject({
      acceptedCount: 3,
      mergedCount: 1,
      lastAcceptedActionKind: 'move_up',
      lastDroppedActionKind: 'move_right',
      lastDroppedReason: 'repeat_merged'
    });
  });

  test('supports a runtime movement-speed interval without rebuilding the gate', () => {
    const gate = new HumanInputRepeatGate({ moveRepeatMinIntervalMs: 120 });
    const initial = resolveHumanKeyboardAction({ code: 'ArrowRight', repeat: false, timeStamp: 100 })!;
    const fastRepeat = resolveHumanKeyboardAction({ code: 'ArrowRight', repeat: true, timeStamp: 180 })!;

    expect(gate.accept(initial)).toBe(true);
    expect(gate.accept(fastRepeat, fastRepeat.atMs, { moveRepeatMinIntervalMs: 72 })).toBe(true);
  });
});
