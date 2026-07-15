import { describe, expect, test } from 'vitest';
import {
  WORLD_TURN_PHASES,
  WorldTurnSystem,
  type WorldTurnPhase,
  type WorldTurnPhaseHandler
} from '../../src/mazer-core/world';

const makeRecorder = (order: WorldTurnPhase[], phase: WorldTurnPhase): WorldTurnPhaseHandler => ({ turn }) => {
  order.push(phase);
  return {
    accepted: phase === 'player-movement' ? true : undefined,
    events: [{ type: `${phase}-applied`, payload: { turn } }]
  };
};

describe('WorldTurnSystem', () => {
  test('applies gameplay phases in one deterministic order after an accepted player move', () => {
    const order: WorldTurnPhase[] = [];
    const system = new WorldTurnSystem(Object.fromEntries(
      WORLD_TURN_PHASES.map((phase) => [phase, makeRecorder(order, phase)])
    ));

    const receipt = system.advance({
      id: 'move-1',
      kind: 'player-move',
      inputId: 'arrow-right',
      expectedTurn: 0
    });

    expect(receipt.admitted).toBe(true);
    expect(receipt.turn).toBe(0);
    expect(receipt.nextTurn).toBe(1);
    expect(order).toEqual(WORLD_TURN_PHASES);
    expect(receipt.events.map((event) => event.phase)).toEqual(WORLD_TURN_PHASES);
    expect(receipt.events.map((event) => event.sequence)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test('does not advance downstream gameplay when player movement is rejected', () => {
    const downstream: string[] = [];
    const system = new WorldTurnSystem({
      'player-movement': () => ({ accepted: false }),
      'enemy-movement': () => {
        downstream.push('enemy');
      },
      collisions: () => {
        downstream.push('collision');
      }
    });

    const receipt = system.advance({ id: 'wall-hit', kind: 'player-move', inputId: 'arrow-up' });

    expect(receipt).toMatchObject({
      admitted: false,
      nextTurn: 0,
      reason: 'player-move-rejected',
      turn: null
    });
    expect(downstream).toEqual([]);
    expect(system.getDiagnostics()).toMatchObject({ acceptedTurnCount: 0, nextTurn: 0, rejectedCommandCount: 1 });
    expect(system.advance({ id: 'wall-hit', kind: 'player-move', inputId: 'arrow-up' })).toMatchObject({
      admitted: false,
      reason: 'duplicate-command'
    });
  });

  test('freezes gameplay while paused and admits explicit timed-mode ticks without player movement', () => {
    const order: WorldTurnPhase[] = [];
    const system = new WorldTurnSystem({
      'enemy-movement': makeRecorder(order, 'enemy-movement'),
      'projectile-movement': makeRecorder(order, 'projectile-movement'),
      collisions: makeRecorder(order, 'collisions')
    }, {
      timedModeEnabled: true
    });

    expect(system.advance({
      id: 'paused-tick',
      kind: 'timed-mode-tick',
      tickId: 'clock-1',
      simulationPaused: true
    })).toMatchObject({ admitted: false, reason: 'simulation-paused', nextTurn: 0 });
    expect(order).toEqual([]);

    const receipt = system.advance({ id: 'timed-tick', kind: 'timed-mode-tick', tickId: 'clock-2' });
    expect(receipt.admitted).toBe(true);
    expect(receipt.phases[0]).toEqual({ phase: 'player-movement', status: 'skipped', eventCount: 0 });
    expect(order).toEqual(['enemy-movement', 'projectile-movement', 'collisions']);
  });

  test('keeps timed-mode advancement disabled unless the host policy opts in', () => {
    const system = new WorldTurnSystem({
      collisions: () => ({ events: [{ type: 'collision-tick' }] })
    });

    expect(system.advance({ id: 'clock-1', kind: 'timed-mode-tick', tickId: 'clock-1' })).toMatchObject({
      admitted: false,
      nextTurn: 0,
      reason: 'timed-mode-disabled'
    });
    expect(system.getDiagnostics()).toMatchObject({
      acceptedTurnCount: 0,
      registeredPhases: ['collisions'],
      timedModeEnabled: false
    });
  });

  test('rejects duplicate and stale commands without repeating mutations', () => {
    let collisionCount = 0;
    const system = new WorldTurnSystem({
      'player-movement': () => ({ accepted: true }),
      collisions: () => {
        collisionCount += 1;
      }
    });
    const command = { id: 'move-1', kind: 'player-move' as const, inputId: 'right', expectedTurn: 0 };

    expect(system.advance(command).admitted).toBe(true);
    expect(system.advance(command)).toMatchObject({ admitted: false, reason: 'duplicate-command', nextTurn: 1 });
    expect(system.advance({ ...command, id: 'move-2' })).toMatchObject({
      admitted: false,
      reason: 'expected-turn-mismatch',
      nextTurn: 1
    });
    expect(collisionCount).toBe(1);
  });

  test('returns cloned receipts so diagnostics cannot mutate simulation truth', () => {
    const system = new WorldTurnSystem({
      'player-movement': () => ({
        accepted: true,
        events: [{ type: 'player-moved', payload: { x: 2, y: 4 } }]
      })
    });
    const receipt = system.advance({ id: 'move-1', kind: 'player-move', inputId: 'right' });
    (receipt.events[0].payload as { x: number }).x = 999;

    expect(system.getDiagnostics().lastReceipt?.events[0].payload).toEqual({ x: 2, y: 4 });
  });
});
