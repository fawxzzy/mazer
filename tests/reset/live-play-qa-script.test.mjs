import { describe, expect, test } from 'vitest';

import {
  normalizeLivePlayInputMethod,
  resolveLivePlayLifecycleSnapshot,
  resolveArrowPointForMove,
  resolveLivePlayRouteProgressIndex,
  resolveStickHoldMsForMove,
  resolveStickPointForMove,
  summarizePostGoalLifecycleSamples,
  solveWalkableRoute
} from '../../scripts/analysis/live-play-qa.mjs';

describe('live play QA script helpers', () => {
  test('defaults live proof input to the diagnostics QA bridge while preserving explicit control modes', () => {
    expect(normalizeLivePlayInputMethod(undefined)).toBe('qa');
    expect(normalizeLivePlayInputMethod('')).toBe('qa');
    expect(normalizeLivePlayInputMethod('qa')).toBe('qa');
    expect(normalizeLivePlayInputMethod('keyboard')).toBe('keyboard');
    expect(normalizeLivePlayInputMethod('arrows')).toBe('arrows');
    expect(normalizeLivePlayInputMethod('stick')).toBe('stick');
  });

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

  test('keeps stick QA gestures below the repeat threshold after staged input is ready', () => {
    expect(resolveStickHoldMsForMove({
      runtime: {
        play: {
          inputBuffer: {
            touchSprint: {
              repeatInitialDelayMs: 239,
              repeatIntervalMs: 105
            }
          }
        }
      }
    }, 34)).toBe(96);

    expect(resolveStickHoldMsForMove({}, 34)).toBe(70);
  });

  test('matches stick overshoot only when it lands on the planned route', () => {
    const points = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 2 }
    ];

    expect(resolveLivePlayRouteProgressIndex({
      actual: { x: 3, y: 1 },
      fromIndex: 0,
      points
    })).toBe(2);

    expect(resolveLivePlayRouteProgressIndex({
      actual: { x: 4, y: 1 },
      fromIndex: 0,
      points
    })).toBe(-1);
  });

  test('summarizes the post-goal play lifecycle through fresh maze settlement', () => {
    const summary = summarizePostGoalLifecycleSamples([
      {
        complete: true,
        compassSpinActive: false,
        lifecyclePhase: 'settled',
        mode: 'play',
        nextSeedQueued: false,
        seed: 101
      },
      {
        complete: false,
        compassSpinActive: false,
        handoffActive: false,
        lifecyclePhase: 'deconstructing',
        mode: 'play',
        nextSeedQueued: true,
        seed: 101
      },
      {
        complete: false,
        compassSpinActive: true,
        handoffActive: true,
        handoffProgress: 0.5,
        lifecyclePhase: 'deconstructing',
        mode: 'play',
        nextSeedQueued: true,
        seed: 101
      },
      {
        buildPrerollActive: true,
        complete: false,
        compassSpinActive: true,
        lifecyclePhase: 'building',
        mode: 'play',
        nextSeedQueued: false,
        rowsVisible: 4,
        seed: 202
      },
      {
        complete: true,
        compassSpinActive: false,
        lifecyclePhase: 'settled',
        mode: 'play',
        nextSeedQueued: false,
        seed: 202
      }
    ], 101);

    expect(summary).toMatchObject({
      freshSeed: 202,
      pass: true,
      phaseSequence: ['settled', 'deconstructing', 'building'],
      sawBuilding: true,
      sawCompassSpin: true,
      sawDeconstructing: true,
      sawFreshSeedQueued: true,
      sawHandoff: true,
      settledFreshSeed: true
    });
  });

  test('does not pass post-goal lifecycle proof without a settled fresh seed', () => {
    const summary = summarizePostGoalLifecycleSamples([
      {
        complete: false,
        lifecyclePhase: 'deconstructing',
        mode: 'play',
        nextSeedQueued: true,
        seed: 101
      },
      {
        complete: false,
        lifecyclePhase: 'building',
        mode: 'play',
        rowsVisible: 4,
        seed: 101
      }
    ], 101);

    expect(summary.pass).toBe(false);
    expect(summary.settledFreshSeed).toBe(false);
    expect(summary.freshSeed).toBeNull();
  });

  test('normalizes lifecycle diagnostics from runtime and visual payloads', () => {
    const snapshot = resolveLivePlayLifecycleSnapshot({
      runtime: {
        surface: { mode: 'play', overlay: 'none' },
        generation: {
          maze: { seed: 303, source: 'play-generated' },
          drawStage: {
            buildPrerollActive: true,
            complete: false,
            handoffActive: true,
            handoffProgress: 0.25,
            lifecyclePhase: 'building',
            nextSeedQueued: true,
            progressPercent: 42,
            rowsVisible: 8,
            tilesVisible: 33
          }
        },
        play: {
          player: { x: 1, y: 2 }
        }
      },
      visual: {
        hud: { compassSpinActive: true }
      }
    });

    expect(snapshot).toMatchObject({
      buildPrerollActive: true,
      compassSpinActive: true,
      handoffActive: true,
      handoffProgress: 0.25,
      lifecyclePhase: 'building',
      mode: 'play',
      nextSeedQueued: true,
      overlay: 'none',
      player: { x: 1, y: 2 },
      progressPercent: 42,
      rowsVisible: 8,
      seed: 303,
      source: 'play-generated',
      tilesVisible: 33
    });
  });
});
