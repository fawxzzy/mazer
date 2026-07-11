import { describe, expect, test } from 'vitest';
import {
  advanceSimulationPolicy,
  applyHumanInputAction,
  createHumanRunState,
  createKeyboardSimulationPolicy,
  createScriptedSimulationPolicy,
  resolveHumanMovementActionFromPriorityStack,
  resolveHumanMovementPriorityCandidates,
  resolveHumanInputActionKindFromKeyboard
} from '../../src/input-human';
import type { HumanInputAction } from '../../src/input-human';

describe('input-human bridge', () => {
  test('maps desktop keys to the canonical input action schema', () => {
    expect(resolveHumanInputActionKindFromKeyboard({ key: 'ArrowUp' })).toBe('move_up');
    expect(resolveHumanInputActionKindFromKeyboard({ key: 'w' })).toBe('move_up');
    expect(resolveHumanInputActionKindFromKeyboard({ key: 'ArrowDown' })).toBe('move_down');
    expect(resolveHumanInputActionKindFromKeyboard({ key: 'a' })).toBe('move_left');
    expect(resolveHumanInputActionKindFromKeyboard({ code: 'KeyD' })).toBe('move_right');
    expect(resolveHumanInputActionKindFromKeyboard({ key: ' ' })).toBe('pause');
    expect(resolveHumanInputActionKindFromKeyboard({ code: 'KeyP' })).toBe('pause');
    expect(resolveHumanInputActionKindFromKeyboard({ key: 'r' })).toBeNull();
    expect(resolveHumanInputActionKindFromKeyboard({ key: 't' })).toBe('toggle_thoughts');
    expect(resolveHumanInputActionKindFromKeyboard({ key: 'q' })).toBeNull();
  });

  test('caps repeated movement emissions until keyup releases the hold', () => {
    const policy = createKeyboardSimulationPolicy({ maxRepeatBurst: 2 });
    const state = createHumanRunState();

    expect(policy.handleKeyDown({ key: 'ArrowUp' })?.repeatIndex).toBe(0);
    expect(policy.handleKeyDown({ key: 'ArrowUp', repeat: true })?.repeatIndex).toBe(1);
    expect(policy.handleKeyDown({ key: 'ArrowUp', repeat: true })?.repeatIndex).toBe(2);
    expect(policy.handleKeyDown({ key: 'ArrowUp', repeat: true })).toBeNull();

    const actions = [];
    let currentState = state;
    for (let index = 0; index < 3; index += 1) {
      const result = advanceSimulationPolicy(currentState, policy, applyHumanInputAction);
      if (!result.action) {
        break;
      }
      actions.push(result.action);
      currentState = result.state;
    }

    expect(actions.map((action) => action.kind)).toEqual(['move_up', 'move_up', 'move_up']);
    expect(actions.map((action) => action.repeatIndex)).toEqual([0, 1, 2]);

    policy.handleKeyUp({ key: 'ArrowUp' });
    expect(policy.handleKeyDown({ key: 'ArrowUp' })?.repeatIndex).toBe(0);
  });

  test('shares one run-state reducer across human and scripted policies', () => {
    const humanPolicy = createKeyboardSimulationPolicy({ maxRepeatBurst: 0 });
    const aiActions: readonly HumanInputAction[] = [
      { kind: 'toggle_thoughts', source: 'ai' },
      { kind: 'restart_attempt', source: 'ai' }
    ];
    const aiPolicy = createScriptedSimulationPolicy({
      kind: 'ai',
      actions: aiActions
    });

    humanPolicy.handleKeyDown({ key: 't' });
    humanPolicy.handleKeyDown({ key: 'r' });

    const humanFirst = advanceSimulationPolicy(createHumanRunState(), humanPolicy, applyHumanInputAction);
    const humanSecond = advanceSimulationPolicy(humanFirst.state, humanPolicy, applyHumanInputAction);
    const aiFirst = advanceSimulationPolicy(createHumanRunState({ thoughtsVisible: false }), aiPolicy, applyHumanInputAction);
    const aiSecond = advanceSimulationPolicy(aiFirst.state, aiPolicy, applyHumanInputAction);

    expect(humanPolicy.kind).toBe('human');
    expect(aiPolicy.kind).toBe('ai');
    expect(humanFirst.state.thoughtsVisible).toBe(false);
    expect(humanSecond.action).toBeNull();
    expect(humanSecond.state.attempt).toBe(1);
    expect(aiFirst.state.thoughtsVisible).toBe(true);
    expect(aiSecond.state.attempt).toBe(1);
    expect(aiSecond.state.movementCount).toBe(0);
  });

  test('lets controls jump ahead of queued moves in the shared keyboard policy', () => {
    const policy = createKeyboardSimulationPolicy({ maxRepeatBurst: 3 });

    expect(policy.handleKeyDown({ key: 'ArrowUp' })?.kind).toBe('move_up');
    expect(policy.handleKeyDown({ key: 'ArrowUp', repeat: true })?.kind).toBe('move_up');
    expect(policy.handleKeyDown({ key: 'p' })?.kind).toBe('pause');
    expect(policy.handleKeyDown({ key: ' ' })?.kind).toBe('pause');

    const first = advanceSimulationPolicy(createHumanRunState(), policy, applyHumanInputAction);
    const second = advanceSimulationPolicy(first.state, policy, applyHumanInputAction);
    const third = advanceSimulationPolicy(second.state, policy, applyHumanInputAction);

    expect(first.action?.kind).toBe('pause');
    expect(second.action?.kind).toBe('pause');
    expect(third.action?.kind).toBe('move_up');
  });

  test('combines up to two held movement controls by first-pressed axis priority', () => {
    expect(resolveHumanMovementActionFromPriorityStack(['move_right', 'move_down'])).toBe('move_down_right');
    expect(resolveHumanMovementActionFromPriorityStack(['move_down', 'move_right'])).toBe('move_down_right');
    expect(resolveHumanMovementActionFromPriorityStack(['move_left', 'move_right'])).toBe('move_left');
    expect(resolveHumanMovementActionFromPriorityStack(['move_up', 'move_down'])).toBe('move_up');
    expect(resolveHumanMovementActionFromPriorityStack(['move_up_right', 'move_down'])).toBe('move_up_right');
    expect(resolveHumanMovementActionFromPriorityStack(['move_right', 'move_down', 'move_left'])).toBe('move_down_right');
  });

  test('keeps held movement fallback candidates in press order with a two-control cap', () => {
    expect(resolveHumanMovementPriorityCandidates(['move_down', 'move_right'])).toEqual(['move_down', 'move_right']);
    expect(resolveHumanMovementPriorityCandidates(['move_right', 'move_down'])).toEqual(['move_right', 'move_down']);
    expect(resolveHumanMovementPriorityCandidates(['move_down', 'move_down', 'move_right'])).toEqual([
      'move_down',
      'move_right'
    ]);
    expect(resolveHumanMovementPriorityCandidates(['move_down', 'move_right', 'move_left'])).toEqual([
      'move_down',
      'move_right'
    ]);
  });
});
