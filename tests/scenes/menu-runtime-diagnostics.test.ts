import { describe, expect, test } from 'vitest';
import {
  MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE,
  MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY,
  MENU_SCENE_RUNTIME_DIAGNOSTICS_SURFACE_ID,
  clearMenuSceneRuntimeDiagnostics,
  formatMenuSceneRuntimeDiagnosticsSurfaceText,
  parseMenuSceneRuntimeDiagnosticsAttribute,
  publishMenuSceneRuntimeDiagnostics,
  resolveMenuSceneGenerationDrawStageProgress,
  resolveMenuSceneRuntimeDiagnosticsSurfaceCssText,
  resolveMenuScenePerformanceMode,
  resolveMenuSceneRuntimeConfig,
  summarizeMenuSceneRuntimeFeed,
  summarizeMenuSceneFrameWindow,
  type MenuSceneRuntimeDiagnostics
} from '../../src/scenes/menuRuntimeDiagnostics';
import { legacyTuning } from '../../src/config/tuning';

describe('menu runtime diagnostics', () => {
  test('parses soak diagnostics and low-power flags from query params', () => {
    expect(MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY).toBe('__MAZER_RUNTIME_DIAGNOSTICS__');

    const config = resolveMenuSceneRuntimeConfig('?runtimeDiagnostics=1&lowPower=1', {
      hardwareConcurrency: 8,
      saveData: false,
      lowPowerHardwareConcurrencyMax: legacyTuning.menu.runtime.lowPowerHardwareConcurrencyMax
    });

    expect(config.enabled).toBe(true);
    expect(config.lowPowerForced).toBe(true);
    expect(config.lowPowerActive).toBe(true);
    expect(config.lowPowerDetected).toBe(false);
  });

  test('treats save-data and low core counts as detected low-power mode', () => {
    const saveDataConfig = resolveMenuSceneRuntimeConfig('?soak=1', {
      hardwareConcurrency: 8,
      saveData: true,
      lowPowerHardwareConcurrencyMax: legacyTuning.menu.runtime.lowPowerHardwareConcurrencyMax
    });
    const lowCoreConfig = resolveMenuSceneRuntimeConfig('', {
      hardwareConcurrency: 4,
      saveData: false,
      lowPowerHardwareConcurrencyMax: legacyTuning.menu.runtime.lowPowerHardwareConcurrencyMax
    });

    expect(saveDataConfig.lowPowerDetected).toBe(true);
    expect(lowCoreConfig.lowPowerDetected).toBe(true);
    expect(lowCoreConfig.lowPowerActive).toBe(true);
  });

  test('uses hysteresis when switching between full, throttled, and hidden modes', () => {
    expect(resolveMenuScenePerformanceMode('full', {
      hidden: false,
      lowPowerActive: false,
      recentAverageFrameMs: legacyTuning.menu.runtime.degradeAverageFrameMs + 2,
      recentSpikeCount: 0,
      tuning: legacyTuning.menu.runtime
    })).toBe('throttled');

    expect(resolveMenuScenePerformanceMode('full', {
      hidden: false,
      lowPowerActive: false,
      recentAverageFrameMs: legacyTuning.menu.runtime.recoverAverageFrameMs - 0.5,
      recentSpikeCount: legacyTuning.menu.runtime.degradeSpikeCount,
      tuning: legacyTuning.menu.runtime
    })).toBe('throttled');

    expect(resolveMenuScenePerformanceMode('throttled', {
      hidden: false,
      lowPowerActive: false,
      recentAverageFrameMs: legacyTuning.menu.runtime.recoverAverageFrameMs + 0.25,
      recentSpikeCount: legacyTuning.menu.runtime.recoverSpikeCount + 1,
      tuning: legacyTuning.menu.runtime
    })).toBe('throttled');

    expect(resolveMenuScenePerformanceMode('throttled', {
      hidden: false,
      lowPowerActive: false,
      recentAverageFrameMs: legacyTuning.menu.runtime.recoverAverageFrameMs - 1,
      recentSpikeCount: 0,
      tuning: legacyTuning.menu.runtime
    })).toBe('full');

    expect(resolveMenuScenePerformanceMode('full', {
      hidden: false,
      lowPowerActive: false,
      recentAverageFrameMs: 15,
      recentSpikeCount: 0,
      heapPressureActive: true,
      tuning: legacyTuning.menu.runtime
    })).toBe('throttled');

    expect(resolveMenuScenePerformanceMode('full', {
      hidden: false,
      lowPowerActive: false,
      recentAverageFrameMs: 15,
      recentSpikeCount: 0,
      recoveryHoldActive: true,
      tuning: legacyTuning.menu.runtime
    })).toBe('throttled');

    expect(resolveMenuScenePerformanceMode('full', {
      hidden: true,
      lowPowerActive: false,
      recentAverageFrameMs: 12,
      recentSpikeCount: 0,
      tuning: legacyTuning.menu.runtime
    })).toBe('hidden');
  });

  test('summarizes recent frame windows with spike counts and fps estimates', () => {
    const summary = summarizeMenuSceneFrameWindow([16, 17, 18, 58], legacyTuning.menu.runtime.spikeFrameMs);

    expect(summary.count).toBe(4);
    expect(summary.averageMs).toBe(27.25);
    expect(summary.worstMs).toBe(58);
    expect(summary.spikeCount).toBe(1);
    expect(summary.fps).toBeCloseTo(36.7, 1);
  });

  test('summarizes staged generation draw progress for fluid row-reveal proof', () => {
    expect(resolveMenuSceneGenerationDrawStageProgress({
      rowsVisible: 7,
      rowCount: 25
    })).toEqual({
      complete: false,
      progressPercent: 28,
      rowCount: 25,
      rowsRemaining: 18
    });

    expect(resolveMenuSceneGenerationDrawStageProgress({
      rowsVisible: 35,
      rowCount: 25
    })).toEqual({
      complete: true,
      progressPercent: 100,
      rowCount: 25,
      rowsRemaining: 0
    });

    expect(resolveMenuSceneGenerationDrawStageProgress({
      rowsVisible: null,
      rowCount: null
    })).toEqual({
      complete: null,
      progressPercent: null,
      rowCount: null,
      rowsRemaining: null
    });
  });

  test('tracks structured feed snapshots without inventing extra state changes', () => {
    const first = summarizeMenuSceneRuntimeFeed({
      step: 4,
      status: {
        speaker: 'Runner',
        kind: 'frontier-chosen',
        importance: 'medium',
        summary: '  Screening   West branch.  '
      },
      visibleEntries: [{
        id: 'intent-1',
        speaker: 'Runner',
        kind: 'frontier-chosen',
        importance: 'low',
        summary: '  Scanning   West branch from Junction A.  ',
        slot: 0
      }],
      nowMs: 120
    });

    const stable = summarizeMenuSceneRuntimeFeed({
      step: 4,
      status: {
        speaker: 'Runner',
        kind: 'frontier-chosen',
        importance: 'medium',
        summary: 'Screening West branch.'
      },
      visibleEntries: [{
        id: 'intent-1',
        speaker: 'Runner',
        kind: 'frontier-chosen',
        importance: 'low',
        summary: 'Scanning West branch from Junction A.',
        slot: 0
      }],
      previous: first,
      nowMs: 240
    });

    const changed = summarizeMenuSceneRuntimeFeed({
      step: 5,
      status: {
        speaker: 'Runner',
        kind: 'route-commitment-changed',
        importance: 'high',
        summary: 'Committing west branch.'
      },
      visibleEntries: [{
        id: 'intent-2',
        speaker: 'TrapNet',
        kind: 'trap-inferred',
        importance: 'high',
        summary: 'Reading trap rhythm from Junction A.',
        slot: 0
      }],
      previous: stable,
      nowMs: 360
    });

    expect(first.visibleEntryCount).toBe(1);
    expect(first.status?.summary).toBe('Screening West branch.');
    expect(first.visibleEntries[0]?.summary).toBe('Scanning West branch from Junction A.');
    expect(first.changeCount).toBe(1);
    expect(first.lastChangedAt).toBe(120);

    expect(stable.signature).toBe(first.signature);
    expect(stable.changeCount).toBe(1);
    expect(stable.lastChangedAt).toBe(120);

    expect(changed.signature).not.toBe(first.signature);
    expect(changed.changeCount).toBe(2);
    expect(changed.lastChangedAt).toBe(360);
  });

  test('anchors the proof panel in the upper-left gutter for desktop proof and keeps compact fallback placement on narrow viewports', () => {
    const desktopCss = resolveMenuSceneRuntimeDiagnosticsSurfaceCssText(1280, 720);
    const mobileCss = resolveMenuSceneRuntimeDiagnosticsSurfaceCssText(405, 958);

    expect(desktopCss).toContain('left:12px');
    expect(desktopCss).toContain('top:12px');
    expect(desktopCss).toContain('right:auto');
    expect(desktopCss).toContain('bottom:auto');
    expect(desktopCss).toContain('max-width:307px');
    expect(desktopCss).toContain('white-space:pre-wrap');

    expect(mobileCss).toContain('left:12px');
    expect(mobileCss).toContain('bottom:12px');
    expect(mobileCss).toContain('right:12px');
    expect(mobileCss).toContain('top:auto');
    expect(mobileCss).toContain('max-width:calc(100vw - 24px)');
    expect(mobileCss).toContain('font:11px/1.35 "Courier New", monospace');
  });

  test('publishes and clears runtime diagnostics on the window and DOM proof surfaces', () => {
    const runtimeWindow = {
      innerWidth: 1280,
      innerHeight: 720
    } as Window;
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const documentAttributes = new Map<string, string>();
    const documentElements = new Map<string, {
      id: string;
      textContent: string;
      style: { cssText: string };
      remove: () => void;
    }>();
    const runtimeDocument = {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          documentAttributes.set(name, value);
        },
        getAttribute: (name: string) => documentAttributes.get(name) ?? null,
        removeAttribute: (name: string) => {
          documentAttributes.delete(name);
        }
      },
      body: {
        appendChild: (element: {
          id: string;
          textContent: string;
          style: { cssText: string };
          remove: () => void;
        }) => {
          if (element.id) {
            documentElements.set(element.id, element);
          }
          return element;
        }
      },
      getElementById: (id: string) => documentElements.get(id) ?? null,
      createElement: () => {
        const element = {
          id: '',
          textContent: '',
          style: { cssText: '' },
          remove: () => {
            if (element.id) {
              documentElements.delete(element.id);
            }
          }
        };
        return element;
      }
    } as unknown as Document;

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: runtimeWindow
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: runtimeDocument
    });

    const diagnostics: MenuSceneRuntimeDiagnostics = {
      revision: 1,
      sceneInstanceId: 7,
      updatedAt: 1200,
      runtimeMs: 1200,
      menuDemo: {
        phase: 'explore',
        cue: 'backtrack',
        pathCursor: 12,
        reachedGoal: false,
        prerollSteps: 72,
        runnerMistakesEnabled: true
      },
      generation: {
        drawStage: {
          batchSize: 1,
          batchUnit: 'rows',
          complete: true,
          progressPercent: 100,
          rowCount: 25,
          rowsRemaining: 0,
          rowsVisible: 25,
          staged: true
        },
        stageCursor: {
          phase: 'consumed-finalized',
          currentStageId: 7,
          completionSignal: 'player-finalized',
          previousStageIds: [0, 3, 4, 5, 6],
          remainingStageIds: [8],
          processComplete: true
        }
      },
      visibility: {
        hidden: false,
        changeCount: 0,
        suspendCount: 0
      },
      performance: {
        mode: 'full',
        averageFrameMs: 16.667,
        recentAverageFrameMs: 16.667,
        recentFrameCount: 60,
        worstFrameMs: 18,
        worstRecentFrameMs: 18,
        spikeCount: 0,
        recentSpikeCount: 0,
        estimatedFps: 60,
        lowPowerDetected: false,
        lowPowerForced: false,
        lowPowerActive: false,
        heapPressureActive: false,
        postHiddenRecoveryActive: false,
        hardwareConcurrency: 8,
        saveData: false
      },
      feed: summarizeMenuSceneRuntimeFeed({
        step: 0,
        status: null,
        visibleEntries: [],
        nowMs: 1200
      }),
      input: {
        acceptedCount: 0,
        droppedCount: 0,
        mergedCount: 0,
        lastAcceptedActionKind: null,
        lastAcceptedSource: null,
        lastAcceptedAtMs: null,
        lastConsumedAtMs: null,
        lastDroppedActionKind: null,
        lastDroppedReason: null,
        lastDroppedAtMs: null,
        queueDepth: 0,
        maxQueueDepth: 0
      },
      projection: null,
      telemetry: {
        eventLogVersion: 0,
        currentRunId: null,
        currentMazeId: null,
        currentAttemptNo: null,
        events: [],
        summary: {
          countsByKind: {},
          latestByKind: {},
          latestAtMs: null
        }
      },
      resources: {
        activeTweens: 0,
        activeTimers: 0,
        listenerCount: 3,
        listenerBreakdown: {
          sceneUpdate: 1,
          sceneShutdown: 1,
          scaleResize: 1,
          visibilityAttached: false,
          installSurfaceAttached: false
        },
        trailSegmentCount: 46,
        trailSegmentCap: 46,
        runnerPolicy: {
          wrongBranchCount: 2,
          backtrackCount: 5,
          recoveryCount: 2
        },
        intentEntryCount: 0,
        intentEntryCap: 0,
        deferredVisualTasksRemaining: 0,
        deferredTasksPerFrameCap: legacyTuning.menu.runtime.deferredTasksPerFrame.full,
        background: {
          clouds: 0,
          farStars: 0,
          nearStars: 0,
          twinkles: 0,
          veils: 0,
          driftMotes: 0,
          moving: 0,
          movingCap: 0,
          signatureCap: 0
        }
      }
    };

    try {
      publishMenuSceneRuntimeDiagnostics(diagnostics);
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]).toEqual(diagnostics);
      expect(parseMenuSceneRuntimeDiagnosticsAttribute(
        documentAttributes.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE)
      )).toEqual(diagnostics);
      expect(documentElements.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_SURFACE_ID)?.textContent).toBe(
        formatMenuSceneRuntimeDiagnosticsSurfaceText(diagnostics)
      );
      expect(documentElements.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_SURFACE_ID)?.style.cssText).toContain('top:12px');
      expect(documentElements.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_SURFACE_ID)?.style.cssText).toContain('bottom:auto');
      expect(documentElements.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_SURFACE_ID)?.textContent).toContain(
        'demo explore cue backtrack mistakes on cursor 12'
      );
      expect(documentElements.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_SURFACE_ID)?.textContent).toContain(
        'trail 46/46'
      );
      expect(documentElements.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_SURFACE_ID)?.textContent).toContain(
        'ai wrong 2 back 5 recover 2'
      );
      expect(documentElements.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_SURFACE_ID)?.textContent).toContain(
        'gen stage consumed-finalized:7 signal player-finalized complete yes'
      );
      expect(documentElements.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_SURFACE_ID)?.textContent).toContain(
        'draw rows 25/25 remaining 0 progress 100% batch 1 rows staged yes'
      );

      clearMenuSceneRuntimeDiagnostics();
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]).toBeUndefined();
      expect(documentAttributes.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE)).toBeUndefined();
      expect(documentElements.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_SURFACE_ID)).toBeUndefined();
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow
      });
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: previousDocument
      });
    }
  });
});
