import { describe, expect, test } from 'vitest';
import {
  WORLD_TURN_PHASES,
  WorldTurnHost,
  type WorldTurnPhase,
  type WorldTurnPhaseHandler
} from '../../src/mazer-core/world';

const makeRecorder = (order: WorldTurnPhase[], phase: WorldTurnPhase): WorldTurnPhaseHandler => () => {
  order.push(phase);
  return {
    accepted: phase === 'player-movement' ? true : undefined,
    events: [{ type: `${phase}-applied` }]
  };
};

describe('WorldTurnHost', () => {
  test('registers gameplay phases once and advances them in canonical order', () => {
    const order: WorldTurnPhase[] = [];
    const host = new WorldTurnHost(Object.fromEntries(
      WORLD_TURN_PHASES.map((phase) => [phase, makeRecorder(order, phase)])
    ));

    const receipt = host.advance({
      expectedTurn: 0,
      id: 'move-1',
      inputId: 'arrow-right',
      kind: 'player-move'
    });

    expect(receipt).toMatchObject({ admitted: true, nextTurn: 1, reason: null, turn: 0 });
    expect(order).toEqual(WORLD_TURN_PHASES);
    expect(host.getDiagnostics()).toMatchObject({
      acceptedTurnCount: 1,
      nextTurn: 1,
      registeredPhases: WORLD_TURN_PHASES,
      state: 'running',
      timedModeEnabled: false
    });
  });

  test('freezes every gameplay phase while paused or stopped and resumes without consuming commands', () => {
    const order: WorldTurnPhase[] = [];
    const host = new WorldTurnHost({
      'player-movement': makeRecorder(order, 'player-movement'),
      'enemy-movement': makeRecorder(order, 'enemy-movement'),
      collisions: makeRecorder(order, 'collisions')
    });

    host.setState('paused');
    expect(host.advance({ id: 'move-1', inputId: 'right', kind: 'player-move' })).toMatchObject({
      admitted: false,
      nextTurn: 0,
      reason: 'simulation-paused'
    });
    host.setState('stopped');
    expect(host.advance({ id: 'move-2', inputId: 'right', kind: 'player-move' })).toMatchObject({
      admitted: false,
      nextTurn: 0,
      reason: 'simulation-paused'
    });
    expect(order).toEqual([]);

    host.setState('running');
    expect(host.advance({ id: 'move-1', inputId: 'right', kind: 'player-move' })).toMatchObject({
      admitted: true,
      nextTurn: 1,
      turn: 0
    });
    expect(order).toEqual(['player-movement', 'enemy-movement', 'collisions']);
  });

  test('admits timed ticks only through an explicit capability and skips player movement', () => {
    const disabledOrder: WorldTurnPhase[] = [];
    const disabled = new WorldTurnHost({
      collisions: makeRecorder(disabledOrder, 'collisions')
    });
    expect(disabled.advance({ id: 'clock-1', kind: 'timed-mode-tick', tickId: 'clock-1' })).toMatchObject({
      admitted: false,
      reason: 'timed-mode-disabled'
    });
    expect(disabledOrder).toEqual([]);

    const enabledOrder: WorldTurnPhase[] = [];
    const enabled = new WorldTurnHost({
      'enemy-movement': makeRecorder(enabledOrder, 'enemy-movement'),
      collisions: makeRecorder(enabledOrder, 'collisions')
    }, {
      timedModeEnabled: true
    });
    const receipt = enabled.advance({ id: 'clock-1', kind: 'timed-mode-tick', tickId: 'clock-1' });

    expect(receipt).toMatchObject({ admitted: true, nextTurn: 1, turn: 0 });
    expect(receipt.phases[0]).toEqual({ phase: 'player-movement', status: 'skipped', eventCount: 0 });
    expect(enabledOrder).toEqual(['enemy-movement', 'collisions']);
  });
});
