import { describe, expect, test } from 'vitest';

import {
  resolveArrowPointForMove,
  resolveStickPointForMove,
  solveWalkableRoute
} from '../../scripts/analysis/live-play-qa.mjs';

describe('live play QA script helpers', () => {
  test('solves a compact walkable-row route from player to goal', () => {
    const route = solveWalkableRoute({
      player: { x: 0, y: 0 },
      goal: { x: 2, y: 2 },
      mazeSize: 3,
      walkableRows: [
        '110',
        '010',
        '011'
      ]
    });

    expect(route?.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 }
    ]);
    expect(route?.moves).toEqual(['move_right', 'move_down', 'move_down', 'move_right']);
  });

  test('returns null when live diagnostics expose no playable route', () => {
    expect(solveWalkableRoute({
      player: { x: 0, y: 0 },
      goal: { x: 2, y: 2 },
      mazeSize: 3,
      walkableRows: [
        '100',
        '000',
        '001'
      ]
    })).toBeNull();
  });

  test('resolves stick and arrow control points from diagnostics rectangles', () => {
    const stick = {
      outer: {
        centerX: 50,
        centerY: 60,
        left: 10,
        top: 20,
        right: 90,
        bottom: 100
      }
    };
    const controls = {
      move_left: { centerX: 12.5, centerY: 20.5 }
    };

    expect(resolveStickPointForMove(stick, 'move_up')).toEqual({ x: 50, y: 26 });
    expect(resolveStickPointForMove(stick, 'move_right')).toEqual({ x: 84, y: 60 });
    expect(resolveStickPointForMove(stick, 'move_down')).toEqual({ x: 50, y: 94 });
    expect(resolveStickPointForMove(stick, 'move_left')).toEqual({ x: 16, y: 60 });
    expect(resolveArrowPointForMove(controls, 'move_left')).toEqual({ x: 13, y: 21 });
  });
});
