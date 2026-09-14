import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

import {
  appendLivePlayQaCleanupEvidence,
  assertLivePlayQaNavigationStable,
  captureRedactedLivePlayQaScreenshot,
  captureLivePlayQaFailureEvidence,
  createLivePlayQaEvidencePersistenceError,
  createLivePlayQaFailureError,
  createLivePlayQaNavigationTracker,
  createLivePlayQaUnexpectedNavigationError,
  isLivePlayDiagnosticsReady,
  measureLivePlayQaElapsedMs,
  normalizeLivePlayInputMethod,
  persistLivePlayQaFailureEvidence,
  resolveLivePlayBrowserContextOptions,
  resolveLivePlayLifecycleSnapshot,
  resolveArrowPointForMove,
  resolveLivePlayQaExpectedServiceWorkerReloadCount,
  sanitizeLivePlayQaDiagnosticValue,
  settleLivePlayQaCleanup,
  settleLivePlayQaServiceWorkerNavigation,
  resolveLivePlayRouteProgressIndex,
  resolveStickHoldMsForMove,
  resolveStickPointForMove,
  shouldCollectInputLockProbe,
  summarizeFreshWorldTurn,
  summarizeFreshReadyState,
  summarizeGoalTimerFreeze,
  summarizeGoalWorldTurn,
  summarizePlayerProgressionCompletion,
  summarizePostGoalLifecycleSamples,
  solveWalkableRoute
} from '../../scripts/analysis/live-play-qa.mjs';

describe('live play QA script helpers', () => {
  test('absorbs exactly one production service-worker reload before readiness is authoritative', async () => {
    const tracker = createLivePlayQaNavigationTracker();
    tracker.record({ isMainFrame: true, url: 'https://mazer.example.test/?runtimeDiagnostics=1' });
    const calls = [];
    const page = {
      evaluate: async () => ({
        controllerChangeCount: 1,
        correlatedReloadCount: 1,
        lastNavigationType: 'reload',
        lastReloadMatchedControllerChange: true,
        pendingControllerChange: false
      }),
      waitForFunction: async () => calls.push('controller'),
      waitForLoadState: async () => calls.push('load')
    };
    let reloadRecorded = false;

    const result = await settleLivePlayQaServiceWorkerNavigation({
      initialNavigationCount: 0,
      page,
      quietMs: 0,
      targetUrl: 'https://mazer.example.test/?runtimeDiagnostics=1',
      timeoutMs: 100,
      tracker,
      wait: async () => {
        if (!reloadRecorded) {
          reloadRecorded = true;
          tracker.record({ isMainFrame: true, url: 'https://mazer.example.test/?runtimeDiagnostics=1' });
        }
      }
    });

    expect(result).toEqual({
      expectedReloadCount: 1,
      mainFrameNavigationCount: 2,
      pass: true,
      serviceWorkerProbe: {
        controllerChangeCount: 1,
        correlatedReloadCount: 1,
        lastNavigationType: 'reload',
        lastReloadMatchedControllerChange: true,
        pendingControllerChange: false
      }
    });
    expect(calls).toEqual(['load', 'controller']);
    expect(tracker.snapshot()).toMatchObject({ stabilized: true, unexpectedNavigation: null });
  });

  test('expects a service-worker reload only for non-loopback HTTPS targets', () => {
    expect(resolveLivePlayQaExpectedServiceWorkerReloadCount('http://127.0.0.1:4173/')).toBe(0);
    expect(resolveLivePlayQaExpectedServiceWorkerReloadCount('http://localhost:4173/')).toBe(0);
    expect(resolveLivePlayQaExpectedServiceWorkerReloadCount('http://192.168.1.20:4173/')).toBe(0);
    expect(resolveLivePlayQaExpectedServiceWorkerReloadCount('http://mazer.example.test/')).toBe(0);
    expect(resolveLivePlayQaExpectedServiceWorkerReloadCount('https://localhost:4173/')).toBe(0);
    expect(resolveLivePlayQaExpectedServiceWorkerReloadCount('https://[::1]:4173/')).toBe(1);
    expect(resolveLivePlayQaExpectedServiceWorkerReloadCount('https://mazer.example.test/')).toBe(1);
  });

  test('fails closed when navigation occurs after movement begins', () => {
    const tracker = createLivePlayQaNavigationTracker();
    tracker.record({ isMainFrame: true, url: 'https://mazer.example.test/' });
    tracker.record({ isMainFrame: true, url: 'https://mazer.example.test/' });
    tracker.markStabilized();
    tracker.markMovementStarted();
    tracker.record({ isMainFrame: true, url: 'https://mazer.example.test/?token=secret' });

    const failure = createLivePlayQaUnexpectedNavigationError(tracker, new Error('context destroyed'));
    expect(failure.message).toBe(
      'live_play_unexpected_navigation_after_movement_started: https://mazer.example.test/?token=<redacted>'
    );
  });

  test('rejects an uncorrelated second navigation even when a controller exists', async () => {
    const tracker = createLivePlayQaNavigationTracker();
    tracker.record({ isMainFrame: true, url: 'https://mazer.example.test/' });
    const page = {
      waitForFunction: async () => {},
      waitForLoadState: async () => {}
    };
    let redirected = false;

    await expect(settleLivePlayQaServiceWorkerNavigation({
      initialNavigationCount: 0,
      page,
      quietMs: 0,
      targetUrl: 'https://mazer.example.test/',
      timeoutMs: 100,
      tracker,
      wait: async () => {
        if (!redirected) {
          redirected = true;
          tracker.record({ isMainFrame: true, url: 'https://attacker.example.test/' });
        }
      }
    })).rejects.toThrow('live_play_service_worker_reload_destination_drift');
  });

  test('rejects a missing production controller-change reload', async () => {
    const tracker = createLivePlayQaNavigationTracker();
    tracker.record({ isMainFrame: true, url: 'https://mazer.example.test/' });

    await expect(settleLivePlayQaServiceWorkerNavigation({
      initialNavigationCount: 0,
      page: {},
      quietMs: 0,
      targetUrl: 'https://mazer.example.test/',
      timeoutMs: 1,
      tracker,
      wait: async () => {}
    })).rejects.toThrow('live_play_expected_service_worker_reload_missing');
  });

  test('rejects extra navigation during service-worker stabilization', async () => {
    const tracker = createLivePlayQaNavigationTracker();
    tracker.record({ isMainFrame: true, url: 'https://mazer.example.test/' });

    await expect(settleLivePlayQaServiceWorkerNavigation({
      initialNavigationCount: 0,
      page: {},
      quietMs: 0,
      targetUrl: 'https://mazer.example.test/',
      timeoutMs: 100,
      tracker,
      wait: async () => {
        tracker.record({ isMainFrame: true, url: 'https://mazer.example.test/' });
        tracker.record({ isMainFrame: true, url: 'https://mazer.example.test/' });
      }
    })).rejects.toThrow('live_play_unexpected_navigation_during_service_worker_stabilization');
  });

  test('settles a navigation that commits during browser shutdown as a terminal cleanup failure', async () => {
    const tracker = createLivePlayQaNavigationTracker();
    tracker.record({ isMainFrame: true, url: 'https://mazer.example.test/' });
    tracker.record({ isMainFrame: true, url: 'https://mazer.example.test/' });
    tracker.markStabilized();
    tracker.markMovementStarted();

    const errors = await settleLivePlayQaCleanup([
      { name: 'navigation.before', run: async () => assertLivePlayQaNavigationStable(tracker) },
      {
        name: 'browser.close',
        run: async () => tracker.record({ isMainFrame: true, url: 'https://mazer.example.test/late' })
      },
      { name: 'navigation.after', run: async () => assertLivePlayQaNavigationStable(tracker) }
    ]);

    expect(errors).toEqual([{
      action: 'navigation.after',
      message: 'live_play_unexpected_navigation_after_movement_started: https://mazer.example.test/late'
    }]);
  });

  test('rebinds readiness after service-worker stabilization and before movement', async () => {
    const scriptSource = await readFile(new URL('../../scripts/analysis/live-play-qa.mjs', import.meta.url), 'utf8');
    const stabilizationIndex = scriptSource.indexOf('serviceWorkerStabilization = await settleLivePlayQaServiceWorkerNavigation');
    const readinessIndex = scriptSource.indexOf('const initialDiagnostics = await waitForDiagnosticsReady', stabilizationIndex);
    const movementIndex = scriptSource.indexOf('navigationTracker.markMovementStarted()', readinessIndex);
    expect(stabilizationIndex).toBeGreaterThan(-1);
    expect(readinessIndex).toBeGreaterThan(stabilizationIndex);
    expect(movementIndex).toBeGreaterThan(readinessIndex);
    expect(scriptSource.indexOf('await installLivePlayQaServiceWorkerStabilizationProbe(page)')).toBeLessThan(
      scriptSource.indexOf('await page.goto(targetUrl')
    );
  });

  test('requires the exact QA move surface before diagnostics readiness can pass', () => {
    const readyState = {
      runtime: {
        surface: { mode: 'play' },
        generation: {
          drawStage: {
            buildPrerollActive: false,
            complete: true,
            lifecyclePhase: 'settled'
          }
        },
        play: { playtest: { encoding: 'walkable-rows-v1' } }
      },
      visual: { touchControls: { visible: true } }
    };

    expect(isLivePlayDiagnosticsReady({ ...readyState, qaMoveAvailable: false })).toBe(false);
    expect(isLivePlayDiagnosticsReady({ ...readyState, qaMoveAvailable: true })).toBe(true);
    expect(isLivePlayDiagnosticsReady({
      ...readyState,
      qaMoveAvailable: true,
      runtime: {
        ...readyState.runtime,
        generation: { drawStage: { complete: false, lifecyclePhase: 'building' } }
      }
    })).toBe(false);
  });

  test('measures failure time at evidence capture instead of phase entry', () => {
    expect(measureLivePlayQaElapsedMs(100, 850)).toBe(750);
    expect(measureLivePlayQaElapsedMs(850, 100)).toBe(0);
  });

  test('sanitizes nested page text, controls, cache names, and embedded URLs', () => {
    expect(sanitizeLivePlayQaDiagnosticValue({
      title: 'user@example.test',
      controls: [{ text: 'token=secret' }],
      cacheNames: ['profile-user@example.test'],
      error: 'failed https://example.test/callback?state=raw&code=secret'
    })).toEqual({
      title: '<redacted-email>',
      controls: [{ text: 'token=<redacted>' }],
      cacheNames: ['<redacted-email>'],
      error: 'failed https://example.test/callback?code=<redacted>&state=<redacted>'
    });
  });

  test('builds a terminal error without retaining the raw URL or raw cause', () => {
    const failure = createLivePlayQaFailureError({
      error: new Error('failed https://example.test/callback?state=raw-secret'),
      evidencePath: 'failure.json'
    });
    expect(failure.message).toContain('state=<redacted>');
    expect(failure.message).not.toContain('raw-secret');
    expect(failure.cause).toBeUndefined();
  });

  test('sanitizes both failures when evidence persistence itself fails', () => {
    const failure = createLivePlayQaEvidencePersistenceError({
      error: new Error('failed https://example.test/callback?state=raw-secret'),
      evidenceError: new Error('write failed for user@example.test token=secret')
    });
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure.message).toBe('live_play_qa_failed_and_failure_evidence_could_not_be_persisted');
    expect(failure.errors.map((entry) => entry.message)).toEqual([
      'failed https://example.test/callback?state=<redacted>',
      'write failed for <redacted-email> token=<redacted>'
    ]);
    expect(JSON.stringify(failure.errors)).not.toContain('raw-secret');
    expect(JSON.stringify(failure.errors)).not.toContain('user@example.test');
  });

  test('redacts rendered text and media while capturing a failure screenshot', async () => {
    const calls = [];
    const page = {
      addStyleTag: async ({ content }) => {
        calls.push(['style', content]);
        return { evaluate: async () => calls.push(['remove']) };
      },
      locator: (selector) => ({ selector }),
      screenshot: async (options) => calls.push(['screenshot', options])
    };
    await captureRedactedLivePlayQaScreenshot(page, 'failure.png');
    expect(calls[0][0]).toBe('style');
    expect(calls[0][1]).toContain('color: transparent');
    expect(calls[1]).toEqual(['screenshot', {
      path: 'failure.png',
      fullPage: true,
      mask: [{ selector: 'canvas, svg' }],
      maskColor: '#111827'
    }]);
    expect(calls[2]).toEqual(['remove']);
  });

  test('settles every cleanup action and sanitizes each failure independently', async () => {
    const calls = [];
    const errors = await settleLivePlayQaCleanup([
      { name: 'browser.close', run: async () => { calls.push('browser'); throw new Error('user@example.test'); } },
      { name: 'preview.stop', run: async () => { calls.push('preview'); throw new Error('token=secret'); } }
    ]);
    expect(calls).toEqual(['browser', 'preview']);
    expect(errors).toEqual([
      { action: 'browser.close', message: '<redacted-email>' },
      { action: 'preview.stop', message: 'token=<redacted>' }
    ]);
  });

  test('persists finally-safe initial-timeout evidence with a sanitized page snapshot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mazer-live-play-qa-'));
    try {
      const page = {
        isClosed: () => false,
        evaluate: async () => ({
          url: 'https://mazer.example.test/?token=secret&runtimeDiagnostics=1',
          title: 'Mazer',
          document: { readyState: 'complete', visibilityState: 'visible' },
          canvas: { height: 900, width: 1440, visible: true },
          controls: [{ ariaLabel: 'Start', tag: 'button', text: 'Start', type: null }],
          runtime: { surface: { mode: 'play' } },
          visual: { runtime: { mode: 'play', overlay: 'none' } },
          qa: { present: false, movePlayPlayerCallable: false },
          serviceWorker: { cacheNames: ['workbox-precache-v2-test'], controllerScriptUrl: 'https://mazer.example.test/sw.js?token=secret' }
        }),
        addStyleTag: async () => ({ evaluate: async () => {} }),
        locator: (selector) => ({ selector }),
        screenshot: async ({ path }) => writeFile(path, 'png', 'utf8')
      };

      const artifact = await captureLivePlayQaFailureEvidence({
        browserContextOptions: { hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } },
        consoleMessages: ['user@example.test failed token=secret'],
        error: new Error('page.waitForFunction: Timeout 90000ms exceeded token=secret'),
        failedRequests: [{ method: 'GET', url: 'https://mazer.example.test/api?token=<redacted>' }],
        label: 'desktop-timeout',
        outputDir: root,
        page,
        pageErrors: ['Bearer abc.def.ghi'],
        pendingRequests: new Map([['request', { method: 'GET', url: 'https://mazer.example.test/pending?key=<redacted>' }]]),
        phase: 'readiness',
        phaseTimings: [{ phase: 'readiness', elapsedMs: 12 }],
        runStartedAt: performance.now() - 100,
        targetUrl: 'https://mazer.example.test/?runtimeDiagnostics=1&authFixture=authenticated',
        viewport: { width: 1440, height: 900 }
      });

      const evidence = JSON.parse(await readFile(artifact.evidencePath, 'utf8'));
      expect(evidence).toMatchObject({
        schema: 'mazer.live-play-qa-failure.v1',
        phase: 'readiness',
        page: {
          qa: { movePlayPlayerCallable: false, present: false },
          url: 'https://mazer.example.test/?runtimeDiagnostics=<redacted>&token=<redacted>'
        }
      });
      expect(evidence.elapsedMs).toBeGreaterThanOrEqual(100);
      expect(evidence.error).not.toContain('token=secret');
      expect(evidence.consoleMessages).toEqual(['<redacted-email> failed token=<redacted>']);
      expect(evidence.artifacts.screenshotPath).toBe(artifact.screenshotPath);
      expect(await readFile(artifact.screenshotPath, 'utf8')).toBe('png');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('retains failure JSON when screenshot capture itself fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mazer-live-play-qa-'));
    try {
      const artifact = await persistLivePlayQaFailureEvidence({
        evidence: { phase: 'navigation' },
        label: 'navigation-error',
        outputDir: root,
        screenshot: async () => { throw new Error('page closed'); }
      });
      const evidence = JSON.parse(await readFile(artifact.evidencePath, 'utf8'));
      expect(artifact.screenshotPath).toBeNull();
      expect(evidence.artifacts).toMatchObject({
        screenshotError: 'page closed',
        screenshotPath: null
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('appends cleanup failures to the durable failure bundle', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mazer-live-play-qa-'));
    try {
      const evidencePath = join(root, 'cleanup.failure.json');
      await writeFile(evidencePath, `${JSON.stringify({
        schema: 'mazer.live-play-qa-failure.v1',
        elapsedMs: 50,
        phase: 'readiness'
      })}\n`, 'utf8');
      await appendLivePlayQaCleanupEvidence({
        cleanupErrors: [
          { action: 'browser.close', message: 'user@example.test token=secret' },
          { action: 'preview.stop', message: 'preview failed' }
        ],
        evidencePath,
        elapsedMs: 125
      });
      expect(JSON.parse(await readFile(evidencePath, 'utf8'))).toMatchObject({
        elapsedMs: 125,
        phase: 'readiness',
        cleanupErrors: [
          { action: 'browser.close', message: '<redacted-email> token=<redacted>' },
          { action: 'preview.stop', message: 'preview failed' }
        ]
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('promotes the success pointer only after cleanup has settled', async () => {
    const scriptSource = await readFile(new URL('../../scripts/analysis/live-play-qa.mjs', import.meta.url), 'utf8');
    const cleanupIndex = scriptSource.lastIndexOf('cleanupErrors = await settleLivePlayQaCleanup');
    const promotionPhaseIndex = scriptSource.lastIndexOf("enterPhase('success-pointer-promotion')");
    const promotionTryIndex = scriptSource.indexOf('try {', promotionPhaseIndex);
    const latestPromotionIndex = scriptSource.lastIndexOf("await copyFile(summary.artifacts.summaryPath, resolve(artifactRoot, 'latest.summary.json'))");
    expect(cleanupIndex).toBeGreaterThan(-1);
    expect(promotionPhaseIndex).toBeGreaterThan(cleanupIndex);
    expect(promotionTryIndex).toBeGreaterThan(promotionPhaseIndex);
    expect(latestPromotionIndex).toBeGreaterThan(cleanupIndex);
    expect(latestPromotionIndex).toBeGreaterThan(promotionTryIndex);
    expect(scriptSource.indexOf("phase: 'success-pointer-promotion'", latestPromotionIndex)).toBeGreaterThan(latestPromotionIndex);
  });

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

  test('requires the goal timer to stay frozen across a real post-arrival resample', () => {
    expect(summarizeGoalTimerFreeze(
      { completedAtMs: 18_420, elapsedMs: 8_420, frozen: true },
      { completedAtMs: 18_420, elapsedMs: 8_420, frozen: true }
    )).toMatchObject({
      elapsedMs: 8_420,
      frozen: true,
      pass: true,
      resampleElapsedMs: 8_420
    });
    expect(summarizeGoalTimerFreeze(
      { completedAtMs: null, elapsedMs: 8_420, frozen: false },
      { completedAtMs: null, elapsedMs: 8_516, frozen: false }
    ).pass).toBe(false);
  });


  test('requires the live player journey to advance exactly one silent visible level', () => {
    expect(summarizePlayerProgressionCompletion({
      finalLevel: 2,
      initialLevel: 1,
      visibleMessages: []
    })).toMatchObject({
      finalLevel: 2,
      initialLevel: 1,
      pass: true,
      progressionMessages: []
    });
    expect(summarizePlayerProgressionCompletion({
      finalLevel: 3,
      initialLevel: 1,
      visibleMessages: []
    }).pass).toBe(false);
    expect(summarizePlayerProgressionCompletion({
      finalLevel: 2,
      initialLevel: 1,
      visibleMessages: [
        { copy: 'Maze 2 unlocked!', id: 'progression.player.cycle.1', source: 'progression', tone: 'success' }
      ]
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
      mazeWidth: 4,
      mazeHeight: 4,
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
      mazeWidth: 5,
      mazeHeight: 5,
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
      mazeWidth: 5,
      mazeHeight: 5,
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
      mazeWidth: 3,
      mazeHeight: 3,
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
