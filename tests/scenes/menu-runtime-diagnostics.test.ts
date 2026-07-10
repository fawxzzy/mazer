import { describe, expect, test } from 'vitest';
import {
  MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE,
  MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY,
  clearMenuSceneRuntimeDiagnostics,
  parseMenuSceneRuntimeDiagnosticsAttribute,
  publishMenuSceneRuntimeDiagnostics,
  resolveMenuSceneGenerationDrawStageProgress,
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
      rowsRemaining: 18,
      tileCount: null,
      tilesRemaining: null,
      tilesVisible: null
    });

    expect(resolveMenuSceneGenerationDrawStageProgress({
      rowsVisible: 35,
      rowCount: 25
    })).toEqual({
      complete: true,
      progressPercent: 100,
      rowCount: 25,
      rowsRemaining: 0,
      tileCount: null,
      tilesRemaining: null,
      tilesVisible: null
    });

    expect(resolveMenuSceneGenerationDrawStageProgress({
      rowsVisible: 25,
      rowCount: 25,
      tilesVisible: 21,
      tileCount: 84
    })).toEqual({
      complete: false,
      progressPercent: 25,
      rowCount: 25,
      rowsRemaining: null,
      tileCount: 84,
      tilesRemaining: 63,
      tilesVisible: 21
    });

    expect(resolveMenuSceneGenerationDrawStageProgress({
      rowsVisible: null,
      rowCount: null
    })).toEqual({
      complete: null,
      progressPercent: null,
      rowCount: null,
      rowsRemaining: null,
      tileCount: null,
      tilesRemaining: null,
      tilesVisible: null
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

  test('publishes and clears runtime diagnostics on machine-readable proof surfaces only', () => {
    const runtimeWindow = {
      innerWidth: 1280,
      innerHeight: 720
    } as Window;
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const documentAttributes = new Map<string, string>();
    const createdElements: string[] = [];
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
        appendChild: () => {
          throw new Error('runtime diagnostics must not create visible DOM children');
        }
      },
      createElement: (tagName: string) => {
        createdElements.push(tagName);
        return {};
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
      surface: {
        mode: 'menu',
        overlay: 'none'
      },
      auth: {
        configured: true,
        displayName: 'Mazer Owner',
        email: 'fawxzzy@example.test',
        emailPresent: true,
        formMode: 'login',
        rememberedIdentity: {
          displayName: 'Mazer Owner',
          email: 'fawxzzy@example.test',
          sessionState: 'ready',
          updatedAt: '2026-07-09T12:00:00.000Z'
        },
        status: 'authenticated',
        userIdPresent: true,
        latestMessage: {
          copy: 'Signed in.',
          id: 'auth:signed-in',
          source: 'auth',
          tone: 'success'
        }
      },
      gameToggles: {
        animatedBackdrop: {
          enabled: false,
          switchIsOn: false,
          stateText: 'Stagnant'
        },
        cameraFollow: {
          enabled: false,
          switchIsOn: false,
          stateText: 'Off'
        },
        controlMode: {
          mode: 'arrows',
          switchIsOn: false,
          stateText: 'Arrows'
        },
        darkMode: {
          enabled: false,
          switchIsOn: false,
          stateText: 'Off'
        },
        movementSpeed: {
          label: '30%',
          value: 0.3
        },
        trailFade: {
          enabled: false,
          switchIsOn: false,
          stateText: 'Off'
        },
        trailPulse: {
          enabled: true,
          switchIsOn: true,
          stateText: 'On'
        }
      },
      play: {
        board: {
          bottom: 420,
          left: 20,
          right: 360,
          top: 80,
          size: 340,
          tileSize: 10
        },
        inputBuffer: {
          held: {
            down: true,
            left: false,
            right: true,
            up: false
          },
          pendingTimerActive: true,
          pointerStartActive: false,
          touchSprint: {
            activeControls: [],
            heldControl: null,
            movementSpeed: 0.3,
            movementSpeedLabel: '30%',
            repeatInitialDelayMs: 258,
            repeatIntervalMs: 112,
            stickInitialDelayMaxMs: 144,
            stickRepeatIntervalMaxMs: 104,
            stickRetargetDelayMs: 64,
            stickTurnDelayMaxMs: 144,
            turnDelayMs: 300,
            pendingStepCount: 0,
            repeatTimerActive: false,
            stepTimerActive: false
          },
          resolvedVector: {
            deltaX: 1,
            deltaY: 1
          },
          simultaneousDelayMs: 50
        },
        player: {
          x: 1,
          y: 2,
          screenX: 35,
          screenY: 105
        },
        goal: {
          x: 47,
          y: 46,
          screenX: 1735,
          screenY: 1715
        },
        playtest: {
          encoding: 'walkable-rows-v1',
          mazeSize: 3,
          walkableRows: [
            '111',
            '010',
            '111'
          ]
        },
        markerStyle: {
          goalCoreColor: 0xff263f,
          goalEdgeColor: 0xd81b2a,
          playerCoreColor: 0x36ff7d,
          playerCoreRadius: 2.38,
          playerHaloColor: 0x00b84a,
          playerHaloRadius: 3.22,
          startCoreColor: 0xfff05a,
          startEdgeColor: 0xffc629,
          trailShineColor: 0xc8fff4,
          trailShineEnabled: true,
          trailShinePeriodMs: 1800
        }
      },
      menuDemo: {
        phase: 'explore',
        cue: 'backtrack',
        pathCursor: 12,
        reachedGoal: false,
        prerollSteps: 72,
        runnerMistakesEnabled: true,
        route: {
          aiResetPathCursor: 42,
          canonicalPathLength: 120,
          cueCounts: {
            backtrack: 5,
            'dead-end': 1,
            reacquire: 2
          },
          routeLength: 144,
          segmentCount: 143,
          trailModeCounts: {
            backtrack: 7,
            explore: 135,
            goal: 1
          },
          traverseMs: 14872
        }
      },
      generation: {
        maze: {
          buildKind: 'menu-generated',
          source: 'menu-generated',
          size: 49,
          seed: 3749,
          solutionPathLength: 120,
          shortcutStats: {
            requested: 9,
            attempts: 9,
            created: 6,
            wallArrayEntries: 80,
            uniqueWallCandidates: 32,
            exhaustedWallArray: false
          },
          pathBuilderStats: {
            acceptedCheckpoints: 4,
            backtracks: 2,
            longestPathLength: 120,
            pathTiles: 260,
            requestedCheckpoints: 5,
            wallArrayEntries: 80
          },
          playableTopologyStats: {
            disconnectedComponentsPruned: 0,
            disconnectedFloorTilesPruned: 0,
            goalRebasedToFarthestReachableFloor: false,
            reachableFloors: 260,
            resolvedGoalDistance: 119
          },
          routeQualityStats: {
            bypassableRouteBands: 3,
            bypassableSolutionEdges: 17,
            meaningfulBypassableRouteBands: 2,
            meaningfulBypassableSolutionEdges: 8,
            routeQuality: 'multi-route',
            sampledSolutionEdges: 48
          }
        },
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
          legacyPlayFocusGuardAttached: false,
          installSurfaceAttached: false
        },
        trailSegmentCount: 46,
        trailSegmentCap: 46,
        runnerPolicy: {
          wrongBranchCount: 2,
          backtrackCount: 5,
          recoveryCount: 2,
          optionalRetargetCount: 1
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
          shards: 0,
          glassShards: 0,
          driftRunes: 0,
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
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]?.play?.player.screenX).toBe(35);
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]?.play?.inputBuffer.resolvedVector)
        .toEqual({ deltaX: 1, deltaY: 1 });
      expect(parseMenuSceneRuntimeDiagnosticsAttribute(
        documentAttributes.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE)
      )?.play?.inputBuffer.simultaneousDelayMs).toBe(50);
      expect(parseMenuSceneRuntimeDiagnosticsAttribute(
        documentAttributes.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE)
      )?.play?.inputBuffer.touchSprint.repeatInitialDelayMs).toBe(258);
      expect(parseMenuSceneRuntimeDiagnosticsAttribute(
        documentAttributes.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE)
      )?.play?.inputBuffer.touchSprint.repeatIntervalMs).toBe(112);
      expect(parseMenuSceneRuntimeDiagnosticsAttribute(
        documentAttributes.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE)
      )?.play?.inputBuffer.touchSprint.turnDelayMs).toBe(300);
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]?.auth?.status)
        .toBe('authenticated');
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]?.auth?.rememberedIdentity?.sessionState)
        .toBe('ready');
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]?.auth?.latestMessage?.copy)
        .toBe('Signed in.');
      expect(parseMenuSceneRuntimeDiagnosticsAttribute(
        documentAttributes.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE)
      )?.auth?.userIdPresent).toBe(true);
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]?.gameToggles?.animatedBackdrop.stateText)
        .toBe('Stagnant');
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]?.gameToggles?.darkMode.stateText)
        .toBe('Off');
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]?.gameToggles?.trailPulse.enabled)
        .toBe(true);
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]?.gameToggles?.trailPulse.switchIsOn)
        .toBe(true);
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]?.menuDemo?.route?.cueCounts.reacquire).toBe(2);
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]?.generation?.maze?.source).toBe('menu-generated');
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]?.generation?.maze?.routeQualityStats?.routeQuality)
        .toBe('multi-route');
      expect(createdElements).toEqual([]);

      publishMenuSceneRuntimeDiagnostics({
        ...diagnostics,
        revision: 2,
        surface: {
          mode: 'play',
          overlay: 'none'
        }
      });
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]?.surface.mode).toBe('play');
      expect(parseMenuSceneRuntimeDiagnosticsAttribute(
        documentAttributes.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE)
      )?.surface.mode).toBe('play');
      expect(parseMenuSceneRuntimeDiagnosticsAttribute(
        documentAttributes.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE)
      )?.generation?.maze?.buildKind).toBe('menu-generated');
      expect(createdElements).toEqual([]);

      clearMenuSceneRuntimeDiagnostics();
      expect(runtimeWindow[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY]).toBeUndefined();
      expect(documentAttributes.get(MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE)).toBeUndefined();
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
