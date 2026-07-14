import { describe, expect, test } from 'vitest';

import {
  normalizeLivePlayInputMethod,
  resolveLivePlayBrowserContextOptions,
  resolveLivePlayLifecycleSnapshot,
  resolveArrowPointForMove,
  resolveLivePlayRouteProgressIndex,
  resolveStickHoldMsForMove,
  resolveStickPointForMove,
  shouldCollectInputLockProbe,
  summarizeFreshWorldTurn,
  summarizeFreshReadyState,
  summarizeGoalWorldTurn,
  summarizePostGoalLifecycleSamples,
  solveWalkableRoute
} from '../../scripts/analysis/live-play-qa.mjs';

describe('live play QA script helpers', () => {
  test('uses a touch-capable mobile context by default and permits explicit desktop proof', () => {
    expect(resolveLivePlayBrowserContextOptions({
      viewport: { width: 405, height: 958 }
    })).toEqual({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 405, height: 958 }
    });
    expect(resolveLivePlayBrowserContextOptions({
      isMobile: false,
      viewport: { width: 1280, height: 720 }
    })).toEqual({
      hasTouch: false,
      isMobile: false,
      viewport: { width: 1280, height: 720 }
    });
  });

  test('reprobes the build lock after the fresh maze replaces the world-turn system', () => {
    const probes = [
      { phase: 'building', pass: true, seed: 101 }
    ];

    expect(shouldCollectInputLockProbe({
      explicitLifecyclePhase: 'building',
      inputLocked: true,
      seed: 202
    }, 101, probes)).toBe(true);
    expect(shouldCollectInputLockProbe({
      explicitLifecyclePhase: 'building',
      inputLocked: true,
      seed: 202
    }, 101, [...probes, { phase: 'building', pass: true, seed: 202 }])).toBe(false);
    expect(shouldCollectInputLockProbe({
      explicitLifecyclePhase: 'handoff',
      inputLocked: true,
      seed: 101
    }, 101, [{ phase: 'handoff', pass: true, seed: 101 }])).toBe(false);
  });

  test('requires the rebuilt maze to be ready, settled, unlocked, and timing play', () => {
    expect(summarizeFreshReadyState({
      runtime: {
        surface: { mode: 'play' },
        generation: { drawStage: { lifecyclePhase: 'settled' }, maze: { seed: 202 } },
        play: { lifecycle: { drawPhase: 'settled', inputLocked: false, phase: 'ready', timerRunning: true } }
      }
    })).toMatchObject({ pass: true, seed: 202, timerRunning: true });
    expect(summarizeFreshReadyState({
      runtime: {
        surface: { mode: 'play' },
        generation: { drawStage: { lifecyclePhase: 'settled' }, maze: { seed: 202 } },
        play: { lifecycle: { drawPhase: 'settled', inputLocked: true, phase: 'ready', timerRunning: false } }
      }
    }).pass).toBe(false);
  });
  test('requires one admitted world turn per planned route move at the goal', () => {
    expect(summarizeGoalWorldTurn({
      acceptedTurnCount: 12,
      nextTurn: 12,
      lastReceipt: { admitted: true, turn: 11 }
    }, 12).pass).toBe(true);
    expect(summarizeGoalWorldTurn({
      acceptedTurnCount: 11,
      nextTurn: 11,
      lastReceipt: { admitted: true, turn: 10 }
    }, 12).pass).toBe(false);
  });

  test('requires a fresh maze to remain at turn zero with or without a locked build-phase receipt', () => {
    expect(summarizeFreshWorldTurn({
      acceptedTurnCount: 0,
      nextTurn: 0,
      rejectedCommandCount: 0,
      lastReceipt: null
    }).pass).toBe(true);
    expect(summarizeFreshWorldTurn({
      acceptedTurnCount: 0,
      nextTurn: 0,
      rejectedCommandCount: 1,
      lastReceipt: { admitted: false, reason: 'simulation-paused' }
    }).pass).toBe(true);
    expect(summarizeFreshWorldTurn({
      acceptedTurnCount: 1,
      nextTurn: 1,
      rejectedCommandCount: 0,
      lastReceipt: { admitted: true, reason: null }
    }).pass).toBe(false);
    expect(summarizeFreshWorldTurn({
      acceptedTurnCount: 0,
      nextTurn: 0,
      rejectedCommandCount: 1,
      lastReceipt: { admitted: false, reason: 'lifecycle-locked' }
    }).pass).toBe(false);
  });

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
      player: { x: 1, y: 1 },
      goal: { x: 2, y: 3 },
      mazeSize: 4,
      walkableRows: [
        '0000',
        '0110',
        '0010',
        '0010'
      ]
    });

    expect(route?.points).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 2, y: 3 }
    ]);
    expect(route?.moves).toEqual(['move_right', 'move_down', 'move_down']);
  });

  test('solves opposite-border wrapped steps like the live movement contract', () => {
    const horizontal = solveWalkableRoute({
      player: { x: 0, y: 2 },
      goal: { x: 4, y: 2 },
      mazeSize: 5,
      walkableRows: [
        '00000',
        '00000',
        '10001',
        '00000',
        '00100'
      ]
    });
    const vertical = solveWalkableRoute({
      player: { x: 2, y: 4 },
      goal: { x: 2, y: 0 },
      mazeSize: 5,
      walkableRows: [
        '00100',
        '00000',
        '10001',
        '00000',
        '00100'
      ]
    });

    expect(horizontal?.points).toEqual([{ x: 0, y: 2 }, { x: 4, y: 2 }]);
    expect(horizontal?.moves).toEqual(['move_left']);
    expect(vertical?.points).toEqual([{ x: 2, y: 4 }, { x: 2, y: 0 }]);
    expect(vertical?.moves).toEqual(['move_down']);
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
        explicitLifecyclePhase: 'goal-hold',
        handoffActive: false,
        inputLocked: true,
        lifecyclePhase: 'settled',
        mode: 'play',
        nextSeedQueued: true,
        seed: 101
      },
      {
        complete: false,
        compassSpinActive: true,
        explicitLifecyclePhase: 'deconstructing',
        handoffActive: false,
        inputLocked: true,
        lifecyclePhase: 'deconstructing',
        mode: 'play',
        nextSeedQueued: true,
        seed: 101
      },
      {
        complete: false,
        compassSpinActive: true,
        explicitLifecyclePhase: 'handoff',
        handoffActive: true,
        handoffProgress: 0.5,
        inputLocked: true,
        lifecyclePhase: 'deconstructing',
        mode: 'play',
        nextSeedQueued: true,
        seed: 101
      },
      {
        buildPrerollActive: true,
        complete: false,
        compassSpinActive: true,
        explicitLifecyclePhase: 'building',
        inputLocked: true,
        lifecyclePhase: 'building',
        mode: 'play',
        nextSeedQueued: false,
        rowsVisible: 4,
        seed: 202
      },
      {
        complete: true,
        compassSpinActive: false,
        explicitLifecyclePhase: 'ready',
        inputLocked: false,
        lifecyclePhase: 'settled',
        mode: 'play',
        nextSeedQueued: false,
        seed: 202
      }
    ], 101);

    expect(summary).toMatchObject({
      explicitLifecyclePass: true,
      explicitPhaseSequence: ['goal-hold', 'deconstructing', 'handoff', 'building', 'ready'],
      freshSeed: 202,
      hasExplicitLifecycle: true,
      pass: true,
      phaseSequence: ['settled', 'deconstructing', 'building'],
      sawBuilding: true,
      sawCompassSpin: true,
      sawDeconstructing: true,
      sawExplicitBuilding: true,
      sawExplicitDeconstructing: true,
      sawExplicitGoalHold: true,
      sawExplicitHandoff: true,
      sawExplicitInputLock: true,
      sawExplicitReady: true,
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

  test('requires rejected movement probes across every locked lifecycle boundary when probes are enabled', () => {
    const samples = [
      { complete: false, explicitLifecyclePhase: 'goal-hold', inputLocked: true, lifecyclePhase: 'settled', mode: 'play', seed: 101 },
      { complete: false, explicitLifecyclePhase: 'deconstructing', inputLocked: true, lifecyclePhase: 'deconstructing', mode: 'play', nextSeedQueued: true, seed: 101 },
      { complete: false, explicitLifecyclePhase: 'handoff', handoffActive: true, inputLocked: true, lifecyclePhase: 'deconstructing', mode: 'play', nextSeedQueued: true, seed: 101 },
      { complete: false, explicitLifecyclePhase: 'building', inputLocked: true, lifecyclePhase: 'building', mode: 'play', rowsVisible: 4, seed: 202 },
      { complete: true, explicitLifecyclePhase: 'ready', inputLocked: false, lifecyclePhase: 'settled', mode: 'play', seed: 202 }
    ];
    const passingProbes = ['goal-hold', 'deconstructing', 'handoff', 'building'].map((phase) => ({ phase, pass: true }));

    expect(summarizePostGoalLifecycleSamples(samples, 101, passingProbes)).toMatchObject({
      inputLockProbePass: true,
      pass: true
    });
    expect(summarizePostGoalLifecycleSamples(samples, 101, passingProbes.slice(0, 3))).toMatchObject({
      inputLockProbePass: false,
      pass: false
    });
  });

  test('fails explicit lifecycle proof when new diagnostics skip goal hold', () => {
    const summary = summarizePostGoalLifecycleSamples([
      {
        complete: false,
        explicitLifecyclePhase: 'deconstructing',
        inputLocked: true,
        lifecyclePhase: 'deconstructing',
        mode: 'play',
        nextSeedQueued: true,
        seed: 101
      },
      {
        complete: false,
        explicitLifecyclePhase: 'handoff',
        handoffActive: true,
        inputLocked: true,
        lifecyclePhase: 'deconstructing',
        mode: 'play',
        nextSeedQueued: true,
        seed: 101
      },
      {
        complete: false,
        explicitLifecyclePhase: 'building',
        inputLocked: true,
        lifecyclePhase: 'building',
        mode: 'play',
        rowsVisible: 4,
        seed: 202
      },
      {
        complete: true,
        explicitLifecyclePhase: 'ready',
        inputLocked: false,
        lifecyclePhase: 'settled',
        mode: 'play',
        seed: 202
      }
    ], 101);

    expect(summary.explicitLifecyclePass).toBe(false);
    expect(summary.sawExplicitGoalHold).toBe(false);
    expect(summary.pass).toBe(false);
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
          lifecycle: {
            compassSpinExpected: true,
            drawPhase: 'building',
            generationPending: true,
            inputLocked: true,
            nextSeedQueued: true,
            overlayOpen: false,
            phase: 'building',
            playerVisible: false,
            resetPending: false,
            timerRunning: false,
            trailLength: 1,
            trailVisible: false
          },
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
      explicitLifecyclePhase: 'building',
      handoffActive: true,
      handoffProgress: 0.25,
      inputLocked: true,
      lifecyclePhase: 'building',
      mode: 'play',
      nextSeedQueued: true,
      overlay: 'none',
      player: { x: 1, y: 2 },
      progressPercent: 42,
      rowsVisible: 8,
      seed: 303,
      source: 'play-generated',
      timerRunning: false,
      tilesVisible: 33
    });
  });

  test('prefers visual lifecycle when runtime lifecycle is older than the current draw phase', () => {
    const snapshot = resolveLivePlayLifecycleSnapshot({
      runtime: {
        surface: { mode: 'play', overlay: 'none' },
        generation: {
          maze: { seed: 101, source: 'play-generated' },
          drawStage: {
            complete: false,
            lifecyclePhase: 'settled',
            nextSeedQueued: true
          }
        },
        play: {
          lifecycle: {
            drawPhase: 'settled',
            phase: 'goal-hold',
            inputLocked: true
          },
          player: { x: 4, y: 5 }
        }
      },
      visual: {
        runtime: {
          generation: {
            drawStage: {
              complete: false,
              handoffActive: false,
              lifecyclePhase: 'deconstructing',
              nextSeedQueued: true
            }
          },
          playLifecycle: {
            drawPhase: 'deconstructing',
            phase: 'deconstructing',
            inputLocked: true
          }
        }
      }
    });

    expect(snapshot.explicitLifecyclePhase).toBe('deconstructing');
    expect(snapshot.lifecyclePhase).toBe('deconstructing');
    expect(snapshot.inputLocked).toBe(true);
  });
});
