import { describe, expect, test } from 'vitest';
import {
  MENU_CAPTURE_METADATA_DIAGNOSTICS_SCHEMA_ID,
  MENU_INPUT_DIAGNOSTICS_SCHEMA_ID,
  MENU_LAYOUT_BOUNDS_DIAGNOSTICS_SCHEMA_ID,
  MENU_RENDER_DPR_DIAGNOSTICS_SCHEMA_ID,
  MENU_SURFACE_STATE_DIAGNOSTICS_SCHEMA_ID,
  MENU_WORLD_SEMANTIC_DIAGNOSTICS_SCHEMA_ID,
  createMenuCaptureMetadataDiagnosticsV1,
  createMenuInputDiagnosticsV1,
  createMenuLayoutBoundsDiagnosticsV1,
  createMenuRenderDprDiagnosticsV1,
  createMenuSceneRuntimeDiagnosticsV1,
  createMenuSurfaceStateDiagnosticsV1,
  createMenuWorldSemanticDiagnosticsV1,
  parseMenuCaptureMetadataDiagnosticsV1,
  parseMenuInputDiagnosticsV1,
  parseMenuLayoutBoundsDiagnosticsV1,
  parseMenuRenderDprDiagnosticsV1,
  parseMenuSceneRuntimeDiagnosticsAttribute,
  parseMenuSurfaceStateDiagnosticsV1,
  parseMenuWorldSemanticDiagnosticsV1,
  type MenuSceneRuntimeDiagnostics
} from '../../src/scenes/menuRuntimeDiagnostics';

const createFixture = (): MenuSceneRuntimeDiagnostics => ({
  revision: 3,
  sceneInstanceId: 9,
  updatedAt: 120,
  runtimeMs: 120,
  surface: { mode: 'menu', overlay: 'none' },
  play: {
    board: { bottom: 400, left: 20, right: 380, top: 40, size: 360, tileSize: 12 },
    inputBuffer: {
      directionalIntent: {
        activeDirection: null,
        assistedLaneShiftCount: 0,
        assistedLaneShiftTileLimit: 1,
        lastDecision: 'idle',
        queuedDirection: null,
        requestedDirections: []
      },
      held: { down: false, left: false, right: false, up: false },
      keyboardRepeat: {
        acceptedCount: 0,
        droppedCount: 0,
        mergedCount: 0,
        lastAcceptedActionKind: null,
        lastAcceptedAtMs: null,
        lastDroppedActionKind: null,
        lastDroppedAtMs: null,
        lastDroppedReason: null,
        repeatIntervalMs: 112
      },
      pendingTimerActive: false,
      pointerStartActive: false,
      touchSprint: {
        activeControls: [],
        arrowPointerActive: false,
        baseMovementSpeed: 0.3,
        effectiveMovementSpeed: 0.3,
        formulaVersion: 'legacy-movement-pace-v1',
        heldControl: null,
        movementSpeed: 0.3,
        movementSpeedLabel: '30%',
        progressionCompletedCycles: '0',
        progressionContextApplied: false,
        progressionLevel: 1,
        progressionPaceScore: 0,
        repeatInitialDelayMs: 258,
        repeatIntervalMs: 112,
        stickInitialDelayMaxMs: 144,
        stickPointerActive: false,
        stickRepeatIntervalMaxMs: 104,
        stickRetargetDelayMs: 64,
        stickTurnDelayMaxMs: 144,
        turnDelayMs: 300,
        repeatTimerActive: false
      },
      resolvedVector: { deltaX: 0, deltaY: 0 },
      simultaneousDelayMs: 50
    },
    worldTurn: {
      acceptedTurnCount: 0,
      lastCommandId: null,
      lastReceipt: null,
      nextTurn: 0,
      registeredPhases: [],
      rejectedCommandCount: 0,
      state: 'running',
      timedModeEnabled: false
    },
    player: { x: 1, y: 1, screenX: 38, screenY: 58 },
    goal: { x: 3, y: 3, screenX: 62, screenY: 82 },
    playtest: { encoding: 'walkable-rows-v1', mazeWidth: 4, mazeHeight: 4, walkableRows: ['1111'] },
    markerStyle: {
      goalCoreColor: 1,
      goalEdgeColor: 2,
      playerCoreColor: 3,
      playerCoreRadius: 2,
      playerHaloColor: 4,
      playerHaloRadius: 3
    }
  },
  visibility: { hidden: false, changeCount: 0, suspendCount: 0 },
  performance: {
    mode: 'full', averageFrameMs: 16, recentAverageFrameMs: 16, recentFrameCount: 1,
    worstFrameMs: 16, worstRecentFrameMs: 16, spikeCount: 0, recentSpikeCount: 0,
    estimatedFps: 60, lowPowerDetected: false, lowPowerForced: false, lowPowerActive: false,
    heapPressureActive: false, postHiddenRecoveryActive: false, hardwareConcurrency: 8, saveData: false
  },
  feed: { step: null, signature: '', status: null, visibleEntryCount: 0, visibleEntries: [], changeCount: 0, lastChangedAt: null },
  input: {
    acceptedCount: 0, droppedCount: 0, mergedCount: 0, lastAcceptedActionKind: null,
    lastAcceptedSource: null, lastAcceptedAtMs: null, lastConsumedAtMs: null,
    lastDroppedActionKind: null, lastDroppedReason: null, lastDroppedAtMs: null,
    queueDepth: 0, maxQueueDepth: 0
  },
  projection: null,
  telemetry: {
    eventLogVersion: 0, currentRunId: null, currentMazeId: null, currentAttemptNo: null,
    events: [], summary: { countsByKind: {}, latestByKind: {}, latestAtMs: null }
  },
  cycleTelemetry: {} as MenuSceneRuntimeDiagnostics['cycleTelemetry'],
  resources: {
    activeTweens: 0, activeTimers: 0, listenerCount: 0,
    listenerBreakdown: {
      sceneUpdate: 0, sceneShutdown: 0, scaleResize: 0, visibilityAttached: false,
      legacyPlayFocusGuardAttached: false, legacyPlayKeyboardFallbackAttached: false,
      installSurfaceAttached: false
    },
    trailSegmentCount: 0, trailSegmentCap: 0,
    runnerPolicy: { wrongBranchCount: 0, backtrackCount: 0, recoveryCount: 0, optionalRetargetCount: 0 },
    intentEntryCount: 0, intentEntryCap: 0, deferredVisualTasksRemaining: 0,
    deferredTasksPerFrameCap: 0,
    background: {
      clouds: 0, farStars: 0, nearStars: 0, twinkles: 0, glassShards: 0,
      driftRunes: 0, moving: 0, movingCap: 0, signatureCap: 0
    }
  }
});

describe('versioned menu runtime diagnostic schemas', () => {
  test('builds all six fixed v1 schemas and a flattened compatibility envelope', () => {
    const fixture = createFixture();
    const schemas = [
      createMenuSurfaceStateDiagnosticsV1(fixture),
      createMenuLayoutBoundsDiagnosticsV1(fixture),
      createMenuRenderDprDiagnosticsV1(fixture),
      createMenuInputDiagnosticsV1(fixture),
      createMenuWorldSemanticDiagnosticsV1(fixture),
      createMenuCaptureMetadataDiagnosticsV1(fixture)
    ];
    expect(schemas.map((schema) => schema?.schemaId)).toEqual([
      MENU_SURFACE_STATE_DIAGNOSTICS_SCHEMA_ID,
      MENU_LAYOUT_BOUNDS_DIAGNOSTICS_SCHEMA_ID,
      MENU_RENDER_DPR_DIAGNOSTICS_SCHEMA_ID,
      MENU_INPUT_DIAGNOSTICS_SCHEMA_ID,
      MENU_WORLD_SEMANTIC_DIAGNOSTICS_SCHEMA_ID,
      MENU_CAPTURE_METADATA_DIAGNOSTICS_SCHEMA_ID
    ]);

    const compatibility = createMenuSceneRuntimeDiagnosticsV1(fixture);
    expect(compatibility).toMatchObject(fixture);
    expect(compatibility?.diagnosticsEnvelope.schemas).toHaveProperty('surfaceState');
    expect(parseMenuSceneRuntimeDiagnosticsAttribute(JSON.stringify(compatibility))).toEqual(compatibility);
    expect(parseMenuSceneRuntimeDiagnosticsAttribute(JSON.stringify(fixture))).toEqual(fixture);
  });

  test('rejects unknown keys and versions on every new schema', () => {
    const fixture = createFixture();
    const pairs = [
      [createMenuSurfaceStateDiagnosticsV1(fixture), parseMenuSurfaceStateDiagnosticsV1],
      [createMenuLayoutBoundsDiagnosticsV1(fixture), parseMenuLayoutBoundsDiagnosticsV1],
      [createMenuRenderDprDiagnosticsV1(fixture), parseMenuRenderDprDiagnosticsV1],
      [createMenuInputDiagnosticsV1(fixture), parseMenuInputDiagnosticsV1],
      [createMenuWorldSemanticDiagnosticsV1(fixture), parseMenuWorldSemanticDiagnosticsV1],
      [createMenuCaptureMetadataDiagnosticsV1(fixture), parseMenuCaptureMetadataDiagnosticsV1]
    ] as const;
    for (const [schema, parse] of pairs) {
      expect(parse(schema)).not.toBeNull();
      expect(parse({ ...schema, schemaVersion: 2 })).toBeNull();
      expect(parse({ ...schema, unexpected: true })).toBeNull();
      expect(parse({ ...schema, payload: { ...(schema?.payload as object), unexpected: true } })).toBeNull();
    }
  });

  test('is total for accessor and proxy traps and returns fresh mutation-isolated snapshots', () => {
    const fixture = createFixture();
    const surface = createMenuSurfaceStateDiagnosticsV1(fixture);
    expect(surface).not.toBeNull();
    fixture.surface.overlay = 'settings';
    expect((surface?.payload as { surface: { overlay: string } }).surface.overlay).toBe('none');
    (surface?.payload as { surface: { overlay: string } }).surface.overlay = 'mutated';
    expect(createMenuSurfaceStateDiagnosticsV1(createFixture())).toMatchObject({
      payload: { surface: { overlay: 'none' } }
    });

    const accessor = Object.create(Object.prototype);
    Object.defineProperty(accessor, 'schemaId', { enumerable: true, get: () => { throw new Error('trap'); } });
    expect(() => parseMenuSurfaceStateDiagnosticsV1(accessor)).not.toThrow();
    expect(parseMenuSurfaceStateDiagnosticsV1(accessor)).toBeNull();

    const proxy = new Proxy({}, { ownKeys: () => { throw new Error('trap'); } });
    expect(() => parseMenuSurfaceStateDiagnosticsV1(proxy)).not.toThrow();
    expect(parseMenuSurfaceStateDiagnosticsV1(proxy)).toBeNull();
  });
});
