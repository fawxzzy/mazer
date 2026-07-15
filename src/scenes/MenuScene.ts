import Phaser from 'phaser';
import {
  applyMazerCanvasBackingResolution,
  resolveMazerCanvasBackingResolution,
  summarizeMazerRenderResolution,
  type MazerRenderResolutionDiagnostics,
  type MazerRenderResolutionStatus
} from '../boot/canvasResolution';
import { MAZER_VIEWPORT_CHANGE_EVENT, readMazerViewportGeometry } from '../boot/viewportGeometry';
import {
  collectDemoWalkerRouteDiagnostics,
  type DemoRunnerTelemetry,
  type DemoWalkerConfig,
  type DemoWalkerChoiceClass,
  type DemoWalkerState,
  type DemoWalkerThoughtState
} from '../domain/ai';
import type { MazeEpisode } from '../domain/maze';
import { markMazerBootStatus } from '../boot/bootStatus';
import {
  WorldTurnHost,
  type WorldTurnHostState,
  type WorldTurnPhaseResult,
  type WorldTurnReceipt
} from '../mazer-core/world';
import { legacyTuning } from '../config/tuning';
import {
  LEGACY_DEFAULTS,
  MAIN_MENU_BUTTONS,
  clampInteger,
  copyLegacySettings,
  linearColorToHex,
  type LegacySettings
} from '../legacy-runtime/legacyDefaults';
import { resolveLegacyAdvancedOptionsVisible } from '../legacy-runtime/legacyAdvancedOptions';
import {
  isLegacyWrappedStepTransition,
  type LegacyMazeGenerationProfile,
  type LegacyMazeSnapshot,
  resolveLegacyNavigationTarget,
  type LegacyPoint
} from '../legacy-runtime/legacyMaze';
import { resolveInitialRuntimeMode } from '../legacy-runtime/legacyLaunchMode';
import {
  resolveLegacyOverlayBackAction,
  type LegacyOverlayKind,
  type LegacyRuntimeMode
} from '../legacy-runtime/legacyOverlayRouting';
import {
  DEFAULT_LEGACY_RUNTIME_SEED,
  createLegacyRuntimeRandomSeed,
  resolveInitialLegacyRuntimeSeed
} from '../legacy-runtime/legacyRuntimeSeed';
import {
  createLegacyMenuResetGenerationRequest,
  createLegacyPlayResetGenerationRequest,
  consumeLegacyGenerationRequestState,
  createLegacyGenerationRequest,
  shouldConsumeLegacyGenerationRequest,
  stepLegacyGenerationSeed,
  type LegacyGenerationRequest,
} from '../legacy-runtime/legacyGenerationLifecycle';
import {
  createLegacyResetRequest,
  hasPendingLegacyResetRequest,
  resolveLegacyPlayLifecycleSnapshot,
  shouldConsumeLegacyResetRequest,
  type LegacyPlayLifecycleSnapshot,
  type LegacyResetRequest,
} from '../legacy-runtime/legacyPlayLifecycle';
import {
  resolveLegacyPauseCommand,
  type LegacyPauseCommand
} from '../legacy-runtime/legacyPauseLifecycle';
import {
  advanceLegacyPlayStep,
  createLegacyPlayMoveFlags,
  LEGACY_SIMULTANEOUS_KEY_PRESS_DELAY_MS,
  resolveLegacyPointerMoveVector,
  resolveLegacyPlayMoveVector,
  isSameLegacyPlayPointer,
  type LegacyPlayMoveFlags,
  type LegacyPlayPointerStart
} from '../legacy-runtime/legacyPlayStep';
import {
  LegacyDirectionalIntentResolver,
  resolveLegacyCardinalDirectionsFromVector,
  type LegacyCardinalDirection
} from '../legacy-runtime/legacyDirectionalIntent';
import {
  resolveLegacyCompassSpinFrame,
  resolveLegacyPlayHudFrame,
  type LegacyPlayHudFrame
} from '../legacy-runtime/legacyPlayHud';
import {
  advanceLegacyMenuDemoFrame,
  createLegacyMenuDemoBootstrap,
  resolveLegacyMenuDemoTrail,
  type LegacyMenuDemoAdvance
} from '../legacy-runtime/legacyMenuDemoLifecycle';
import {
  resolveLegacyAuthenticatedMenuButtonStack,
  resolveLegacyMenuLayout,
  type LegacyMenuLayout
} from '../legacy-runtime/legacyMenuLayout';
import {
  resolveLegacyPathVisualStyle,
  type LegacyPathVisualStyle
} from '../legacy-runtime/legacyPathVisualStyle';
import { resolveLegacyMenuButtonChrome } from '../legacy-runtime/legacyMenuButtonChrome';
import {
  resolveLegacyFeatureControlLayout,
  resolveLegacyOverlayContentFlowLayout,
  resolveLegacyOptionsGuideLayout,
  resolveLegacyRunStatusPanelLayout,
  resolveLegacyToggleRowLayout,
  resolveLegacyUiLabelCenterY,
  type LegacyUiLabelRole
} from '../legacy-runtime/legacyUiStandards';
import {
  resolveLegacyMenuPathTitleLayout,
  resolveLegacyMenuPathTitleOrbitGeometry,
  resolveLegacyMenuPathTitleOrbitPoint,
  resolveLegacyMenuTitlePresentation,
  type LegacyMenuPathTitleCell
} from '../legacy-runtime/legacyMenuTitle';
import {
  LEGACY_MENU_BACKDROP_SHARD_COUNT,
  LEGACY_MENU_DRIFT_RUNE_COUNT,
  LEGACY_MENU_GLASS_SHARD_COUNT,
  LEGACY_MENU_BACKDROP_STAR_MOTION,
  LEGACY_MENU_STAR_COUNT,
  advanceLegacyMenuBackdropStars,
  createLegacyMenuBackdropStars,
  resolveLegacyMenuBackdropDriftRunes,
  resolveLegacyMenuBackdropGlassShards,
  resolveLegacyMenuBackdropPalette,
  resolveLegacyMenuBackdropShards,
  resolveLegacyMenuBackdropStreakLength,
  resolveLegacyMenuBackdropTailStep,
  type LegacyMenuBackdropDriftRune,
  type LegacyMenuBackdropGlassShard,
  type LegacyMenuBackdropShard,
  type LegacyMenuBackdropStar
} from '../legacy-runtime/legacyMenuBackdrop';
import {
  LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE,
  resolveLegacyIridescentPlayerCoreColor,
  resolveLegacyIridescentPlayerAccentColor,
  resolveLegacyIridescentPlayerHaloColor,
  resolveLegacyIridescentPulseColor,
  resolveLegacyIridescentTrailColor
} from '../legacy-runtime/legacyIridescentMaterial';
import {
  LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS,
  buildLegacyMazeRevealOrder,
  resolveLegacyTrailShineMotion,
  summarizeLegacyMazeRevealOrder,
  type LegacyTrailShineDirection
} from '../legacy-runtime/legacyAnimationCadence';
import {
  createLegacyOptionFieldDrafts,
  type LegacyOptionFieldDrafts,
  type LegacyOptionFieldId
} from '../legacy-runtime/legacyOptionFields';
import { applyLegacyOverlayFieldCommit } from '../legacy-runtime/legacyOverlayFieldCommit';
import {
  applyLegacyOverlayToggleField,
  resolveLegacyOverlayToggleSwitchIsOn,
  resolveLegacyOverlayToggleStateText,
  type LegacyOverlayToggleFieldId
} from '../legacy-runtime/legacyOverlayToggleFields';
import {
  LEGACY_GAME_TOGGLE_STORAGE_KEY,
  migrateLegacyGameToggleSettingsToGuestScope,
  readLegacyGameToggleSettings,
  writeLegacyGameToggleSettings
} from '../legacy-runtime/legacyGameTogglePreferences';
import {
  MAZE_CYCLE_TELEMETRY_STORAGE_KEY,
  MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT,
  readMazeCycleTelemetryHistory,
  recordMazeCycleTelemetryReceipt,
  summarizeMazeCycleTelemetryDiagnostics,
  type MazeCycleTelemetryHistory,
  type MazeCycleTelemetrySurface
} from '../legacy-runtime/mazeCycleTelemetry';
import {
  LEGACY_PROGRESSION_STORAGE_KEY,
  createEmptyLegacyProgressionState,
  readLegacyProgressionState,
  recordLegacyProgressionCycle,
  resolveLegacyMazeGenerationProfileForProgression,
  resolveLegacyProgressionGenerationScale,
  resolveLegacyProgressionPalette,
  resolveLegacyProgressionTrackIdForSurface,
  summarizeLegacyProgressionDiagnostics,
  writeLegacyProgressionState,
  type LegacyProgressionDiagnostics,
  type LegacyProgressionPalette,
  type LegacyProgressionState,
  type LegacyProgressionTrackId
} from '../legacy-runtime/legacyProgression';
import {
  createEmptyLegacyAuthFormState,
  createLegacyAuthScopedStorage,
  createLegacyGuestAuthSnapshot,
  readLegacyAuthSessionSnapshot,
  readLegacyRememberedIdentity,
  readLegacyRememberedIdentityState,
  requestLegacyPasswordReset,
  normalizeLegacyAuthEmail,
  resolveLegacyAuthAccountLabel,
  resolveLegacyAuthScopedStorageKey,
  resolveLegacyAuthSubmitState,
  signInLegacyAuth,
  signOutLegacyAuth,
  signUpLegacyAuth,
  subscribeLegacyAuthState,
  syncLegacyRememberedIdentityFromAuthenticatedSession,
  writeLegacyRememberedIdentity,
  type LegacyAuthFieldId,
  type LegacyAuthFormState,
  type LegacyAuthSessionSnapshot,
  type LegacyAuthStatus
} from '../legacy-runtime/legacyAuth';
import { resolveLegacyAuthInputCssRect } from '../legacy-runtime/legacyAuthInputGeometry';
import {
  LEGACY_AUTH_MESSAGE_COPY,
  LEGACY_REMOTE_MESSAGE_COPY,
  createLegacyPlayerMessage,
  enqueueLegacyPlayerMessage,
  expireLegacyPlayerMessageQueue,
  resolveLegacyAuthFeedbackMessage,
  resolveLegacyAuthValidationMessage,
  resolveLegacyOverlayFieldCommitMessage,
  resolveLegacyOverlayMovementSpeedMessage,
  resolveLegacyOverlayToggleMessage,
  resolveLegacyPlayerMessageColor,
  type LegacyQueuedPlayerMessage,
  type LegacyPlayerMessage
} from '../legacy-runtime/legacyPlayerMessage';
import {
  writeLegacyRemoteCycleReceipt,
  writeLegacyRemoteProgressionState,
  type LegacyRemoteProgressionSyncResult
} from '../legacy-runtime/legacyRemoteProgression';
import {
  clampLegacyOverlayScrollOffset,
  resolveLegacyOverlayScrollMetrics,
  type LegacyOverlayScrollMetrics,
  type LegacyOverlayScrollRect
} from '../legacy-runtime/legacyOverlayScroll';
import {
  formatLegacyMovementSpeedPercent,
  normalizeLegacyMovementSpeed,
  quantizeLegacyMovementSpeed,
  resolveLegacyMovementSpeedProfile
} from '../legacy-runtime/legacyMovementSpeed';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig,
  resolveLegacyPointFromDemoIndex,
} from '../legacy-runtime/legacyDemoWalker';
import {
  resolveLegacyEndpointMarkerRenderMetrics,
  resolveLegacyMenuBorderDockDirections,
  resolveLegacyMenuBorderDockRenderAreas,
  resolveLegacyMenuPathRenderFrames,
  resolveLegacyMenuPathRenderSegments,
  resolveLegacyPlayerLocatorRenderMetrics,
  resolveLegacyPlayerMarkerRenderMetrics,
  type LegacyMenuBorderDockDirection
} from '../legacy-runtime/legacyMenuRender';
import {
  clearMenuSceneRuntimeDiagnostics,
  nextMenuSceneInstanceId,
  publishMenuSceneRuntimeDiagnostics,
  resolveMenuSceneGenerationDrawStageProgress,
  resolveMenuScenePerformanceMode,
  resolveMenuSceneRuntimeConfig,
  summarizeMenuSceneFrameWindow,
  summarizeMenuSceneRuntimeFeed,
  type MenuScenePerformanceMode,
  type MenuSceneRuntimeConfig
} from './menuRuntimeDiagnostics';
import { summarizeTelemetrySemantics } from '../telemetry';
import {
  HumanInputRepeatGate,
  isMovementActionKind,
  resolveHumanKeyboardAction,
  resolveHumanMovementActionVector,
  resolveHumanMovementPriorityCandidates,
  type HumanMovementActionKind
} from '../input-human';
import {
  resolveStickPullVector,
  resolveTouchControlKindAtPoint,
  resolveTouchControlLayout,
  type TouchStickPullVector
} from '../input-human/touch';
import { applyTextResolution, resolveHudTextResolution } from '../render/textCrispness';
import {
  CYBER_ARCADE_ICON_TARGET,
  CYBER_ARCADE_MATERIAL_VERSION,
  cyberArcadeMaterial,
  snapCyberArcadeRect,
  snapCyberArcadeStrokeCoordinate,
  summarizeCyberArcadeMaterial,
  toCyberArcadeCssHex
} from '../render/cyberArcadeMaterial';

type RuntimeMode = LegacyRuntimeMode;
type OverlayKind = LegacyOverlayKind;
type LegacyMenuStaticDrawLifecyclePhase = 'idle' | 'building' | 'settled' | 'deconstructing';
type LegacyMenuPathTitleSweepMode = 'build' | 'deconstruct' | 'idle';
type RuntimeGenerationStage = NonNullable<LegacyMazeSnapshot['generation']>['executionPlan'][number];
type LegacyPlayHeldTouchMove = {
  control: HumanMovementActionKind;
  pointerId: number | null;
  sequence: number;
};

interface LegacyMenuPathTitleSweepState {
  column: number;
  diagonalPosition: number;
  direction: 'forward' | 'reverse' | 'idle';
  mode: LegacyMenuPathTitleSweepMode;
  phase: number;
  progress: number;
  syncedToLifecycle: boolean;
}

interface UiButton {
  background: Phaser.GameObjects.Rectangle;
  bounds: VisualRect;
  label: Phaser.GameObjects.Text;
  setActive(active: boolean): void;
  text: string;
  destroy(): void;
}

interface OverlayPanelFrame {
  centerX: number;
  height: number;
  left: number;
  top: number;
  width: number;
}

interface VisualRect {
  bottom: number;
  centerX: number;
  centerY: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface VisualTextLabel {
  bounds: VisualRect;
  text: string;
}

interface LegacyMazeRenderFrame {
  boardLeft: number;
  boardTop: number;
  boardSize: number;
  tileSize: number;
  safeInset: number;
}

interface LegacyPixelTileRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface LegacyPathMaterialOptions {
  coreAlpha: number;
  coreColor: number;
  cueAlpha?: number;
  cueColor?: number;
  drawCue?: boolean;
  edgeAlpha: number;
  edgeColor: number;
}

type LegacyPlayerVisualMotionSnapReason = 'wrapped-step' | null;

interface LegacyIridescentMaterialDiagnostics {
  minPathColorDistance: number;
  playerAccentColor: number;
  playerCoreColor: number;
  playerHaloShiftColor: number;
  pulseHeadColor: number;
  pulseTailColor: number;
  shineHeadColor: number;
  shineTailColor: number;
  shiftPeriodMs: {
    playerAccent: number;
    playerHalo: number;
    pulse: number;
    trail: number;
  };
  trailHeadColor: number;
  trailTailColor: number;
}

interface MenuSceneVisualDiagnostics {
  materialSystem: {
    version: typeof CYBER_ARCADE_MATERIAL_VERSION;
    iconTarget: typeof CYBER_ARCADE_ICON_TARGET;
    surfaceRoles: string[];
    geometry: {
      fillAlignment: string;
      strokeAlignment: string;
      backingScale: string;
      sharedPanelBounds: 'snapped-at-draw-boundary';
    };
  };
  board: {
    bounds: VisualRect;
    renderBounds: VisualRect;
    renderSafeInset: number;
    safeBounds: VisualRect;
    pathVisualStyle: LegacyPathVisualStyle;
    tileSize: number;
    cornerFacet: {
      alpha: number;
      animated: boolean;
      shimmerPeriodMs: number;
      visible: boolean;
    };
    pathMaterial: {
      connectorSeamsEnabled: boolean;
      seamCoreAlphaRatio: number;
      seamEdgeAlphaRatio: number;
      seamPadRatio: number;
    };
    renderResolution: MazerRenderResolutionDiagnostics;
    topCenterNotch: VisualRect;
  };
  markerStyle: {
    goalCoreColor: number;
    goalEdgeColor: number;
    playerCoreColor: number;
    playerCoreRadius: number;
    playerHaloColor: number;
    playerHaloRadius: number;
    playerBeaconAccentColor: number;
    playerBeaconColor: number;
    playerBeaconPeriodMs: number;
    startCoreColor: number;
    startEdgeColor: number;
    trailPulseEnabled: boolean;
    trailPulseColor: number;
    trailPulseEdgeColor: number;
    trailShineEnabled: boolean;
    trailShineColor: number;
    trailShineEdgeColor: number;
    trailShineCenterIndex: number;
    trailShineCyclePeriodMs: number;
    trailShineDirection: LegacyTrailShineDirection;
    trailShineProgress: number;
    trailShineSpeedTilesPerSecond: number;
    iridescentMaterial: LegacyIridescentMaterialDiagnostics;
    trailPulsePeriodMs: number;
  };
  progression: LegacyProgressionDiagnostics;
  progressionBadge: {
    bounds: VisualRect | null;
    text: string | null;
    textBounds: VisualRect | null;
    textFits: boolean;
  };
  menuCompass: {
    bounds: VisualRect | null;
    notchBounds: VisualRect;
    visible: boolean;
  };
  remoteSync: {
    lastError: string | null;
    lastMessage: LegacyPlayerMessage | null;
    lastSkippedReason: LegacyRemoteProgressionSyncResult['skippedReason'] | null;
    lastSynced: boolean | null;
  };
  authAction: LegacyAuthActionDiagnostics | null;
  layout: {
    buttonHeight: number;
    buttonLayout: LegacyMenuLayout['buttonLayout'];
    buttonWidth: number;
    centerButtonWidth: number;
    centerButtonX: number;
    centerButtonY: number;
    leftButtonX: number;
    leftButtonY: number;
    rightButtonX: number;
    rightButtonY: number;
    surface: 'menu' | 'play';
    titleX: number;
    titleY: number;
  };
  buttons: Array<{
    bounds: VisualRect;
    labelBounds: VisualRect | null;
    text: string;
  }>;
  title: {
    animation: {
      active: boolean;
      facetCellCount: number;
      facetPulsePeriodMs: number;
      phase: number;
      scannerAttachedToVisibleEdge: boolean;
      scannerDirection: LegacyMenuPathTitleSweepState['direction'];
      scannerMode: LegacyMenuPathTitleSweepMode;
      scannerProgress: number;
      scannerSyncedToLifecycle: boolean;
      scannerVisibleEdgeColumn: number | null;
      sigilOrbitCount: number;
      sigilOrbitPeriodMs: number;
      sigilOrbitPhase: number;
      sweepColumn: number;
      sweepPeriodMs: number;
    };
    bounds: VisualRect;
    builtFromPathPieces: boolean;
    pieceCount: number;
    progressPercent: number;
    visible: boolean;
    visiblePieces: number;
  };
  textLabels: VisualTextLabel[];
  renderSurface: {
    canvasCssHeight: number;
    canvasCssWidth: number;
    canvasPixelHeight: number;
    canvasPixelWidth: number;
    devicePixelRatio: number;
    renderResolutionDeficit: number;
    renderResolutionTargetRatio: number;
    renderResolutionRatio: number;
    status: MazerRenderResolutionStatus;
    undersampledForDevicePixelRatio: boolean;
  };
  hud: {
    kind: 'legacy-play-hud' | null;
    visible: boolean;
    bounds: VisualRect | null;
    timerBounds: VisualRect | null;
    arrowBounds: VisualRect | null;
    arrowAngleDegrees: number | null;
    timerText: string | null;
    arrowAngleRadians: number | null;
    compassSpinActive: boolean;
    compassSpinProgress: number | null;
    compassVisualAngleDegrees: number | null;
    compassVisualAngleRadians: number | null;
  };
  touchControls: {
    visible: boolean;
    compact: boolean | null;
    controlMode: ReturnType<typeof resolveTouchControlLayout>['controlMode'] | null;
    activeControls: HumanMovementActionKind[];
    frame: VisualRect | null;
    stick: {
      inner: VisualRect;
      outer: VisualRect;
      pull: {
        distanceRatio: number;
        intentSegment: number;
        movement: HumanMovementActionKind;
        movementCandidates: HumanMovementActionKind[];
        normalizedX: number;
        normalizedY: number;
      } | null;
    } | null;
    controls: {
      move_up: VisualRect | null;
      move_up_right: VisualRect | null;
      move_right: VisualRect | null;
      move_down_right: VisualRect | null;
      move_down: VisualRect | null;
      move_down_left: VisualRect | null;
      move_left: VisualRect | null;
      move_up_left: VisualRect | null;
      pause: VisualRect | null;
      restart_attempt: VisualRect | null;
      toggle_thoughts: VisualRect | null;
    };
  };
  overlayUi: {
    backChevron: VisualRect | null;
    guidePanel: VisualRect | null;
    latestAuthMessage: LegacyPlayerMessage | null;
    latestMessage: LegacyPlayerMessage | null;
    panel: VisualRect | null;
    visibleMessages: LegacyPlayerMessage[];
    scroll: {
      bottomFadeAlpha: number;
      contentHeight: number;
      enabled: boolean;
      maxOffset: number;
      offset: number;
      thumb: VisualRect | null;
      topFadeAlpha: number;
      track: VisualRect | null;
      viewport: VisualRect | null;
    };
  };
  runtime: {
    goal: LegacyPoint;
    mazeSize: number;
    menuDemo: {
      cue: DemoWalkerState['cue'] | null;
      gate: {
        nextMoveAtMs: number;
        released: boolean;
        waitingForBuild: boolean;
      };
      pathCursor: number | null;
      phase: DemoWalkerState['phase'] | null;
      prerollSteps: number;
      reachedGoal: boolean;
      runnerMistakesEnabled: boolean;
      aiMemory: {
        choiceClass: DemoWalkerChoiceClass | null;
        confidence: number;
        optionCount: number;
        optionPoints: LegacyPoint[];
        targetPoint: LegacyPoint | null;
        thoughtState: DemoWalkerThoughtState;
      };
      telemetry: DemoRunnerTelemetry | null;
    };
    generation: {
      budget: {
        checkpointCount: number | null;
        checkpointModifier: number | null;
        scale: number | null;
        shortcutCount: number | null;
        shortcutCountModifier: number | null;
        shortcutStageEnabled: boolean | null;
      };
      buildKind: string | null;
      seed: number | null;
      seedSource: 'query' | 'runtime-random';
      executionPlan: Array<{
        advancesToStageId: number | null;
        batchSize: number | null;
        batchUnit: string | null;
        completionSignal: string | null;
        executionKind: string | null;
        id: number;
        name: string;
        skipToStageIdWhenDisabled: number | null;
      }>;
      gate: {
        armsDelayStartOnQueue: boolean | null;
        consumesWhileInitialized: boolean | null;
        consumesWhileUninitialized: boolean | null;
        entryStageId: number | null;
        initializedResetBypassesDelayGate: boolean | null;
        levelBuildingDelayDurationMs: number | null;
        levelBuildingDelayDurationSource: string | null;
        requiresLevelBuildingDelayStartedFlag: boolean | null;
        requiresLevelBuildingStartTime: boolean | null;
        resetsLevelBuildingTimerAfterConsume: boolean | null;
        waitsForLevelBuildingDelay: boolean | null;
      };
      profile: LegacyMazeGenerationProfile | null;
      stageCursor: {
        completionSignal: string | null;
        currentStageId: number | null;
        phase: string | null;
        previousStageIds: number[];
        processComplete: boolean | null;
        remainingStageIds: number[];
      };
      drawStage: {
        batchSize: number | null;
        batchUnit: string | null;
        buildPrerollActive: boolean;
        buildPrerollDurationMs: number;
        buildPrerollProgress: number;
        complete: boolean | null;
        handoffEndsAtMs: number | null;
        handoffActive: boolean;
        handoffDurationMs: number;
        handoffProgress: number;
        lifecyclePhase: LegacyMenuStaticDrawLifecyclePhase;
        zeroHoldStartedAtMs: number | null;
        nextSeedQueued: boolean;
        nonSolutionTileCountBeforeSolutionComplete: number;
        progressPercent: number | null;
        revealStrategyVersion: string;
        rowCount: number | null;
        rowsRemaining: number | null;
        rowsVisible: number | null;
        staged: boolean;
        titleFullyDeconstructed: boolean;
        titlePieceCount: number;
        titlePiecesRemaining: number;
        titleVisiblePieces: number;
        tileCount?: number | null;
        solutionCompletedAtIndex: number | null;
        solutionFirstRevealPrevented: boolean;
        solutionPrefixLength: number;
        tilesRemaining?: number | null;
        tilesVisible?: number | null;
      };
      pendingRequest: {
        budget: {
          checkpointCount: number | null;
          checkpointModifier: number | null;
          scale: number | null;
          shortcutCount: number | null;
          shortcutCountModifier: number | null;
          shortcutStageEnabled: boolean | null;
        };
        buildKind: string | null;
        dueAtMs: number | null;
        queuedAtMs: number | null;
        executionPlan: Array<{
          advancesToStageId: number | null;
          batchSize: number | null;
          batchUnit: string | null;
          completionSignal: string | null;
          executionKind: string | null;
          id: number;
          name: string;
          skipToStageIdWhenDisabled: number | null;
        }>;
        gate: {
          armsDelayStartOnQueue: boolean | null;
          consumesWhileInitialized: boolean | null;
          consumesWhileUninitialized: boolean | null;
          entryStageId: number | null;
          initializedResetBypassesDelayGate: boolean | null;
          levelBuildingDelayDurationMs: number | null;
          levelBuildingDelayDurationSource: string | null;
          requiresLevelBuildingDelayStartedFlag: boolean | null;
          requiresLevelBuildingStartTime: boolean | null;
          resetsLevelBuildingTimerAfterConsume: boolean | null;
          waitsForLevelBuildingDelay: boolean | null;
        };
        profile: LegacyMazeGenerationProfile | null;
        mode: RuntimeMode | null;
        processStageIds: number[];
        reason: string | null;
        seed: number | null;
        stageCursor: {
          completionSignal: string | null;
          currentStageId: number | null;
          phase: string | null;
          previousStageIds: number[];
          processComplete: boolean | null;
          remainingStageIds: number[];
        };
      };
      processStageIds: number[];
    };
    reset: {
      entry: {
        bypassesLevelBuildingDelay: boolean | null;
        clearsResetFlagOnConsume: boolean | null;
        consumesWhileInitialized: boolean | null;
        entryStageId: number | null;
        rearmsDelayStart: boolean | null;
        returnsToTemplateLevel: boolean | null;
      };
      pendingAction: string | null;
      dueAtMs: number | null;
      reason: string | null;
    };
    mode: RuntimeMode;
    overlay: OverlayKind;
    player: LegacyPoint;
    playLifecycle: LegacyPlayLifecycleSnapshot;
    trailLength: number;
    trailTail: LegacyPoint[];
  };
  revision: number;
  updatedAt: number;
  viewport: {
    geometry: {
      content: VisualRect;
      devicePixelRatio: number;
      isLandscape: boolean;
      isPhoneLike: boolean;
      layoutHeight: number;
      layoutWidth: number;
      revision: number;
      visualHeight: number;
      visualOffsetLeft: number;
      visualOffsetTop: number;
      visualScale: number;
      visualUsedForContent: boolean;
      visualWidth: number;
    };
    height: number;
    integrity: {
      offscreenBoundsViolations: string[];
      overlapViolations: string[];
    };
    safeInsets: {
      bottom: number;
      left: number;
      right: number;
      top: number;
    };
    width: number;
  };
}

interface LegacyAuthActionDiagnostics {
  canSubmit: boolean | null;
  emailPresent: boolean;
  error: string | null;
  info: string | null;
  mode: LegacyAuthFormState['mode'];
  passwordLength: number;
  reason: string | null;
  sequence: number;
  stage: 'started' | 'blocked' | 'submitting' | 'result' | 'exception';
  status: LegacyAuthStatus | null;
}

interface LegacyQaMoveResult {
  accepted: boolean;
  lifecycleLocked: boolean;
  mode: RuntimeMode;
  move: HumanMovementActionKind | null;
  overlay: OverlayKind;
  player: LegacyPoint;
  reason: string | null;
}

interface LegacyQaOverlayResult {
  accepted: boolean;
  mode: RuntimeMode;
  overlay: OverlayKind;
  reason: string | null;
}

interface LegacyQaDiagnosticsApi {
  movePlayPlayer(move: string): LegacyQaMoveResult;
  openOptionsOverlay(): LegacyQaOverlayResult;
  openPauseOverlay(): LegacyQaOverlayResult;
  startPlayMode(): LegacyQaOverlayResult;
}

declare global {
  interface Window {
    __MAZER_QA__?: LegacyQaDiagnosticsApi;
    __MAZER_VISUAL_CAPTURE__?: {
      enabled?: boolean;
      forceInstallMode?: string;
    };
    __MAZER_VISUAL_DIAGNOSTICS__?: MenuSceneVisualDiagnostics;
  }
}

export const MENU_SCENE_VISUAL_CAPTURE_KEY = '__MAZER_VISUAL_CAPTURE__' as const;
export const MENU_SCENE_VISUAL_DIAGNOSTICS_KEY = '__MAZER_VISUAL_DIAGNOSTICS__' as const;
export const MENU_SCENE_VISUAL_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-visual-diagnostics' as const;

const BOARD_SHADOW_OFFSET = 0;
const MENU_BUTTON_ALPHA = 0.34;
const LEGACY_UI_FONT_FAMILY = '"Trebuchet MS", "Segoe UI", sans-serif';
const LEGACY_UI_MONO_FONT_FAMILY = 'Consolas, "Lucida Console", monospace';
const MENU_TEXT_COLOR = toCyberArcadeCssHex(cyberArcadeMaterial.rail.white);
const LEGACY_MENU_ACTION_GREEN = toCyberArcadeCssHex(cyberArcadeMaterial.signal.player);
const LEGACY_MENU_PATH_TITLE_SHADOW = cyberArcadeMaterial.substrate.shadow;
const LEGACY_MENU_PATH_TITLE_ACCENT = cyberArcadeMaterial.signal.player;
const LEGACY_MENU_PATH_TITLE_PRISM = cyberArcadeMaterial.rail.cyan;
const LEGACY_MENU_PATH_TITLE_RUNE = cyberArcadeMaterial.signal.start;
const LEGACY_MENU_PATH_TITLE_GEM = cyberArcadeMaterial.signal.playerAccent;
const LEGACY_MENU_PATH_TITLE_FACET_WARM = cyberArcadeMaterial.signal.warning;
const LEGACY_MENU_PATH_TITLE_SWEEP_MS = 2600;
const LEGACY_MENU_PATH_TITLE_SWEEP_OVERSCAN_COLUMNS = 3;
const LEGACY_MENU_PATH_TITLE_GEM_PULSE_MS = 3400;
const LEGACY_MENU_PATH_TITLE_ORBIT_MS = 6200;
const LEGACY_MENU_PATH_TITLE_FRAME_MS = 33;
const LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS = 6;
const LEGACY_MENU_PATH_TITLE_SHADOW_ALPHA = 0.44;
const LEGACY_MENU_PATH_TITLE_ACCENT_ALPHA = 0.92;
const LEGACY_BOARD_GRID_ALPHA = 0;
const INITIAL_MENU_DEMO_HOLD_MS = 1800;
const TRAIL_FADE_TAIL = 16;
const LEGACY_MENU_SLAB_FILL = cyberArcadeMaterial.substrate.fieldRaised;
const LEGACY_MENU_PANEL_SHADOW_ALPHA = 0;
const LEGACY_MENU_PATH_CORE = cyberArcadeMaterial.path.core;
const LEGACY_MENU_PATH_EDGE = cyberArcadeMaterial.path.edge;
const LEGACY_MENU_PATH_EDGE_ALPHA = 0.58;
const LEGACY_MENU_WALL_FILL = cyberArcadeMaterial.substrate.field;
const LEGACY_MENU_WALL_GLASS_ALPHA = 0.18;
const LEGACY_MENU_BOARD_GLASS_ALPHA = 0.1;
const LEGACY_PLAY_PATH_CORE = cyberArcadeMaterial.path.core;
const LEGACY_PLAY_PATH_EDGE = cyberArcadeMaterial.path.edge;
const LEGACY_PLAY_PATH_EDGE_ALPHA = 0.58;
const LEGACY_PLAY_WALL_FILL = cyberArcadeMaterial.substrate.field;
const LEGACY_PLAY_WALL_GLASS_ALPHA = 0.18;
const LEGACY_PLAY_BOARD_GLASS_ALPHA = 0.1;
const LEGACY_PLAY_BOARD_FILL = cyberArcadeMaterial.substrate.field;
const LEGACY_PLAY_BOARD_EDGE = 0x031022;
const LEGACY_PATH_TILE_CUE_COLOR = cyberArcadeMaterial.path.edge;
const LEGACY_PATH_TILE_CUE_ALPHA = 0.42;
const LEGACY_PATH_CONNECTOR_SEAM_PAD_RATIO = 0.16;
const LEGACY_PATH_CONNECTOR_SEAM_EDGE_ALPHA_RATIO = 0.72;
const LEGACY_PATH_CONNECTOR_SEAM_CORE_ALPHA_RATIO = 0.94;
const LEGACY_BOARD_SIGIL_BORDER_PRIMARY = cyberArcadeMaterial.rail.mint;
const LEGACY_BOARD_SIGIL_BORDER_SECONDARY = cyberArcadeMaterial.rail.cyan;
const LEGACY_BOARD_SIGIL_BORDER_SHADOW = cyberArcadeMaterial.substrate.shadow;
const LEGACY_BOARD_SIGIL_BORDER_ALPHA = 0.82;
const LEGACY_BOARD_SIGIL_BACKGROUND_ALPHA = 0.12;
const LEGACY_BOARD_SIGIL_CORNER_FACET_BASE = 0x10293a;
const LEGACY_BOARD_SIGIL_CORNER_FACET_GLOW = 0xc8fff4;
const LEGACY_BOARD_SIGIL_CORNER_FACET_IRIS = 0x9cff7d;
const LEGACY_BOARD_SIGIL_CORNER_FACET_PRISM = 0x72e0bf;
const LEGACY_BOARD_SIGIL_CORNER_FACET_HOTSPOT = 0xffffff;
const LEGACY_BOARD_SIGIL_CORNER_FACET_ALPHA = 0.48;
const LEGACY_BOARD_SIGIL_CORNER_FACET_SIZE_RATIO = 0.066;
const LEGACY_BOARD_SIGIL_CORNER_FACET_SHIMMER_MS = 1280;
const LEGACY_BOARD_SIGIL_CORNER_FACET_FRAME_MS = 33;
const LEGACY_BOARD_MAZE_SAFE_INSET_RATIO = 0.018;
const LEGACY_BOARD_MAZE_SAFE_INSET_MIN = 4;
const LEGACY_BOARD_MAZE_SAFE_INSET_MAX = 7;
const LEGACY_PLAY_HUD_TIMER_PANE = cyberArcadeMaterial.substrate.panel;
const LEGACY_PLAY_HUD_TIMER_TEXT = toCyberArcadeCssHex(cyberArcadeMaterial.rail.white);
const LEGACY_PLAY_HUD_ARROW = cyberArcadeMaterial.signal.goal;
const LEGACY_PLAY_HUD_ARROW_TAIL = cyberArcadeMaterial.rail.white;
const LEGACY_PLAY_HUD_ARROW_SHADOW = 0x06080a;
const LEGACY_PLAY_TOUCH_FRAME_FILL = cyberArcadeMaterial.substrate.field;
const LEGACY_PLAY_TOUCH_BUTTON_FILL = cyberArcadeMaterial.substrate.panelRaised;
const LEGACY_PLAY_TOUCH_BUTTON_STROKE = cyberArcadeMaterial.rail.cyan;
const LEGACY_PLAY_TOUCH_ICON = cyberArcadeMaterial.rail.white;
const LEGACY_PLAY_TOUCH_ACCENT = cyberArcadeMaterial.rail.mint;
const LEGACY_CYBER_PANEL_FILL = cyberArcadeMaterial.substrate.panel;
const LEGACY_CYBER_PANEL_STROKE = cyberArcadeMaterial.rail.mint;
const LEGACY_CYBER_PANEL_STROKE_ALT = cyberArcadeMaterial.rail.cyan;
const LEGACY_CYBER_PANEL_SHADOW = cyberArcadeMaterial.substrate.shadow;
const LEGACY_OVERLAY_SCROLL_WHEEL_STEP = 42;
const LEGACY_OVERLAY_SCROLL_DRAG_START_PX = 3;
const LEGACY_OVERLAY_SCROLL_RIGHT_GUTTER = 20;
const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS = LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS;
const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_WINDOW = 3.6;
const LEGACY_PLAY_TRAIL_PULSE_FRAME_INTERVAL_MS = 33;
const LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT = 2;
const LEGACY_PLAY_STICK_RETARGET_STEP_MS = 64;
const LEGACY_PLAY_STICK_RETARGET_RESCHEDULE_GRACE_MS = 16;
const LEGACY_PLAY_STICK_INITIAL_DELAY_MAX_MS = 144;
const LEGACY_PLAY_STICK_REPEAT_INTERVAL_MAX_MS = 104;
const LEGACY_PLAY_STICK_TURN_DELAY_MAX_MS = 144;
const LEGACY_PLAY_COMPASS_SPIN_DURATION_MS = 1800;
const LEGACY_PLAY_COMPASS_SPIN_TURNS = 3.25;
const LEGACY_PLAY_PLAYER_VISUAL_MOVE_MS = 116;
const LEGACY_MENU_PLAYER_VISUAL_MOVE_MS = 150;
const LEGACY_PLAYER_MARKER_SHADOW = 0x00131f;
const LEGACY_PLAYER_MARKER_RADIUS_RATIO = 0.34;
const LEGACY_PLAYER_MARKER_HALO_RATIO = 0.54;
const LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO = 0.46;
const LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO = 0.72;
const LEGACY_PLAY_PLAYER_BEACON_COLOR = cyberArcadeMaterial.signal.player;
const LEGACY_PLAY_PLAYER_BEACON_ACCENT = cyberArcadeMaterial.signal.playerAccent;
const LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS = 1150;
const LEGACY_MENU_AI_BEACON_ALPHA_RATIO = 0.74;
const LEGACY_MENU_AI_BEACON_RADIUS_RATIO = 0.16;
const LEGACY_PLAY_START_MARKER_CORE = cyberArcadeMaterial.signal.start;
const LEGACY_PLAY_START_MARKER_EDGE = cyberArcadeMaterial.signal.startEdge;
const LEGACY_PLAY_GOAL_MARKER_CORE = cyberArcadeMaterial.signal.goal;
const LEGACY_PLAY_GOAL_MARKER_EDGE = cyberArcadeMaterial.signal.goalEdge;
const LEGACY_MENU_AI_MEMORY_OPTION_CORE = cyberArcadeMaterial.signal.memory;
const LEGACY_MENU_AI_MEMORY_OPTION_EDGE = cyberArcadeMaterial.rail.mint;
const LEGACY_MENU_AI_MEMORY_TARGET_CORE = cyberArcadeMaterial.signal.warning;
const LEGACY_MENU_AI_MEMORY_TARGET_EDGE = cyberArcadeMaterial.signal.warningEdge;
const LEGACY_MENU_STATIC_DRAW_ROW_STEP_MS = 64;
const LEGACY_MENU_STATIC_DRAW_TILE_STEP_MS = 44;
const LEGACY_MENU_STATIC_DECONSTRUCT_TILE_STEP_MS = 34;
const LEGACY_MENU_STATIC_DRAW_TARGET_TICKS = 96;
const LEGACY_PLAY_STATIC_DRAW_TARGET_TICKS = 64;
const LEGACY_MENU_STATIC_DRAW_SETTLE_MS = 420;
const LEGACY_MENU_STATIC_BUILD_PREROLL_BURST_MS = 500;
const LEGACY_MENU_STATIC_DECONSTRUCT_HOLD_MS = 0;
const LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS = 1000;
const LEGACY_MENU_DECONSTRUCT_PLAYER_REMOVE_MS = 220;
const LEGACY_MENU_DECONSTRUCT_TRAIL_FADE_MS = 860;
const LEGACY_MENU_DECONSTRUCT_BURST_COLOR = 0xb7f2ff;
const LEGACY_MENU_DECONSTRUCT_BURST_ALT = 0x72e0bf;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const smoothstep = (value: number): number => {
  const x = clamp(value, 0, 1);
  return x * x * (3 - (2 * x));
};
const legacyScenePointKey = (point: LegacyPoint): string => `${point.x},${point.y}`;

const createVisualRect = (left: number, top: number, width: number, height: number): VisualRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  centerX: left + (width / 2),
  centerY: top + (height / 2)
});

const cloneVisualRect = (rect: VisualRect | null): VisualRect | null => (
  rect ? { ...rect } : null
);

const visualRectFromBounds = (rect: { left: number; top: number; width: number; height: number }): VisualRect => (
  createVisualRect(rect.left, rect.top, rect.width, rect.height)
);

const mergeVisualRects = (...rects: Array<VisualRect | null>): VisualRect | null => {
  const presentRects = rects.filter((rect): rect is VisualRect => rect !== null);
  if (presentRects.length === 0) {
    return null;
  }

  const left = Math.min(...presentRects.map((rect) => rect.left));
  const top = Math.min(...presentRects.map((rect) => rect.top));
  const right = Math.max(...presentRects.map((rect) => rect.right));
  const bottom = Math.max(...presentRects.map((rect) => rect.bottom));

  return createVisualRect(left, top, right - left, bottom - top);
};

const copyPoint = (point: LegacyPoint): LegacyPoint => ({ x: point.x, y: point.y });

const buildPathTrail = (
  points: readonly LegacyPoint[],
  limit: number | null
): LegacyPoint[] => {
  if (limit === null || points.length <= limit) {
    return points.map((point) => ({ x: point.x, y: point.y }));
  }

  return points.slice(Math.max(0, points.length - limit)).map((point) => ({ x: point.x, y: point.y }));
};

export class MenuScene extends Phaser.Scene {
  private settings: LegacySettings = copyLegacySettings(LEGACY_DEFAULTS);
  private optionFieldDrafts: LegacyOptionFieldDrafts = createLegacyOptionFieldDrafts(LEGACY_DEFAULTS);
  private activeInputField: LegacyOptionFieldId | null = null;
  private authSnapshot: LegacyAuthSessionSnapshot = createLegacyGuestAuthSnapshot();
  private authForm: LegacyAuthFormState = createEmptyLegacyAuthFormState('login');
  private activeAuthField: LegacyAuthFieldId | null = null;
  private authNativeInput: HTMLInputElement | null = null;
  private authNativeInputField: LegacyAuthFieldId | null = null;
  private authNativeInputHandler: ((event: Event) => void) | null = null;
  private authNativeKeyDownHandler: ((event: KeyboardEvent) => void) | null = null;
  private authSubmitting = false;
  private authUnsubscribe: (() => void) | null = null;
  private mazeSeed = DEFAULT_LEGACY_RUNTIME_SEED;
  private explicitRuntimeMazeSeed = false;
  private maze!: LegacyMazeSnapshot;
  private player!: LegacyPoint;
  private trail: LegacyPoint[] = [];
  private mode: RuntimeMode = 'menu';
  private overlay: OverlayKind = 'none';
  private overlayReturn: OverlayKind = 'none';
  private pendingGenerationRequest: LegacyGenerationRequest | null = null;
  private menuDemoEpisode: MazeEpisode | null = null;
  private menuDemoState: DemoWalkerState | null = null;
  private menuDemoConfig!: DemoWalkerConfig;
  private nextDemoMoveAtMs = 0;
  private playStartedAtMs = 0;
  private playCyclePath: LegacyPoint[] = [];
  private playCycleResetUsed = false;
  private menuDemoCycleStartedAtMs = 0;
  private menuDemoCycleRecorded = false;
  private mazeCycleTelemetryHistory: MazeCycleTelemetryHistory = readMazeCycleTelemetryHistory(undefined);
  private progressionState: LegacyProgressionState = readLegacyProgressionState(undefined);
  private latestAuthMessage: LegacyPlayerMessage | null = null;
  private latestRemoteSyncResult: LegacyRemoteProgressionSyncResult | null = null;
  private latestOverlayMessage: LegacyPlayerMessage | null = null;
  private latestAuthActionDiagnostics: LegacyAuthActionDiagnostics | null = null;
  private authActionDiagnosticsSequence = 0;
  private latestAuthFeedbackMessageExpiresAtMs = Number.NEGATIVE_INFINITY;
  private latestOverlayMessageExpiresAtMs = Number.NEGATIVE_INFINITY;
  private playerMessageQueue: LegacyQueuedPlayerMessage[] = [];
  private playerMessageSequence = 0;
  private pendingResetRequest: LegacyResetRequest | null = null;
  private pendingOverlayMazeRebuild = false;
  private playMoveFlags: LegacyPlayMoveFlags = createLegacyPlayMoveFlags();
  private legacyWorldTurnMove: { deltaX: number; deltaY: number } | null = null;
  private legacyWorldTurnCommandSequence = 0;
  private legacyWorldTurnHost = this.createLegacyWorldTurnHost();
  private readonly playKeyboardRepeatGate = new HumanInputRepeatGate();
  private readonly playDirectionalIntent = new LegacyDirectionalIntentResolver();
  private playMoveTimer: Phaser.Time.TimerEvent | null = null;
  private playHeldTouchMoves: LegacyPlayHeldTouchMove[] = [];
  private playHeldTouchSequence = 0;
  private playHeldTouchRepeatTimer: Phaser.Time.TimerEvent | null = null;
  private playHeldTouchRepeatDueAtMs: number | null = null;
  private playTouchStickPointerId: number | null = null;
  private playTouchStickPull: TouchStickPullVector | null = null;
  private playPointerStart: LegacyPlayPointerStart | null = null;
  private titleGraphics!: Phaser.GameObjects.Graphics;
  private footerText!: Phaser.GameObjects.Text;
  private progressionBadgeText!: Phaser.GameObjects.Text;
  private progressionBadgeBounds: VisualRect | null = null;
  private progressionBadgeTextBounds: VisualRect | null = null;
  private progressionBadgeTextFits = false;
  private menuCompassBounds: VisualRect | null = null;
  private backdropGraphics!: Phaser.GameObjects.Graphics;
  private boardStaticGraphics!: Phaser.GameObjects.Graphics;
  private boardPathGraphics!: Phaser.GameObjects.Graphics;
  private boardDynamicGraphics!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private overlayScrollGraphics: Phaser.GameObjects.Graphics | null = null;
  private overlayGuideGraphics: Phaser.GameObjects.Graphics | null = null;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private uiTexts: Phaser.GameObjects.Text[] = [];
  private uiButtons: UiButton[] = [];
  private overlayBackChevronBounds: VisualRect | null = null;
  private overlayGuideBounds: VisualRect | null = null;
  private overlayScrollOffset = 0;
  private overlayScrollMax = 0;
  private overlayScrollContentHeight = 0;
  private overlayScrollTopFadeAlpha = 0;
  private overlayScrollBottomFadeAlpha = 0;
  private overlayScrollViewportBounds: VisualRect | null = null;
  private overlayScrollTrackBounds: VisualRect | null = null;
  private overlayScrollThumbBounds: VisualRect | null = null;
  private overlayScrollPointerId: number | null = null;
  private overlayScrollPointerStartY = 0;
  private overlayScrollPointerStartOffset = 0;
  private overlayScrollPointerHasMoved = false;
  private viewportGeometryListener: (() => void) | null = null;
  private stars: LegacyMenuBackdropStar[] = [];
  private layout!: LegacyMenuLayout;
  private hudBounds: VisualRect | null = null;
  private hudTimerBounds: VisualRect | null = null;
  private hudArrowBounds: VisualRect | null = null;
  private hudTouchControlBounds: VisualRect | null = null;
  private hudFrame: LegacyPlayHudFrame | null = null;
  private hudCompassSpinStartedAtMs: number | null = null;
  private hudCompassSpinActive = false;
  private hudCompassSpinProgress: number | null = null;
  private hudCompassVisualAngleRadians: number | null = null;
  private hudCompassVisualAngleDegrees: number | null = null;
  private playerVisualMotion: {
    durationMs: number;
    from: LegacyPoint;
    startedAtMs: number;
    to: LegacyPoint;
  } | null = null;
  private lastPlayerVisualMotionSnapReason: LegacyPlayerVisualMotionSnapReason = null;
  private boardStaticDirty = true;
  private boardPathDirty = true;
  private boardDynamicDirty = true;
  private hudDirty = true;
  private backdropDirty = true;
  private uiDirty = true;
  private menuStaticDrawLifecyclePhase: LegacyMenuStaticDrawLifecyclePhase = 'idle';
  private menuStaticDrawRowsVisible: number | null = null;
  private menuStaticDrawNextRowAtMs = 0;
  private menuStaticDrawTileOrder: LegacyPoint[] = [];
  private menuStaticDrawVisibleTileKeys = new Set<string>();
  private menuStaticDrawTilesVisible: number | null = null;
  private menuStaticDrawNextTileAtMs = 0;
  private menuStaticDeconstructStartedAtMs: number | null = null;
  private menuStaticDeconstructZeroHoldStartedAtMs: number | null = null;
  private menuStaticBuildPrerollStartedAtMs: number | null = null;
  private legacyPlayTrailPulseNextFrameAtMs = 0;
  private legacyBoardCornerShimmerNextFrameAtMs = 0;
  private legacyMenuTitleAnimationNextFrameAtMs = 0;
  private visualDiagnosticsRevision = 0;
  private visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
  private visualDiagnosticsPlayLifecycleSignature: string | null = null;
  private backdropNextUpdateAtMs = Number.NEGATIVE_INFINITY;
  private backdropAccumulatedDeltaMs = 0;
  private runtimeDiagnosticsConfig: MenuSceneRuntimeConfig = {
    enabled: false,
    lowPowerDetected: false,
    lowPowerForced: false,
    lowPowerActive: false,
    hardwareConcurrency: null,
    saveData: false
  };
  private runtimeDiagnosticsRevision = 0;
  private runtimeDiagnosticsSceneInstanceId = 0;
  private runtimeDiagnosticsPerformanceMode: MenuScenePerformanceMode = 'full';
  private runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
  private runtimeDiagnosticsPlayLifecycleSignature: string | null = null;
  private runtimeFrameWindowMs: number[] = [];
  private runtimeFrameCount = 0;
  private runtimeFrameTotalMs = 0;
  private runtimeWorstFrameMs = 0;
  private runtimeVisibilityChangeCount = 0;
  private runtimeVisibilitySuspendCount = 0;
  private runtimeVisibilityAttached = false;
  private runtimeInstallSurfaceAttached = false;
  private runtimeVisibilityChangeHandler: (() => void) | null = null;
  private legacyPlayFocusGuardAttached = false;
  private legacyPlayWindowBlurHandler: (() => void) | null = null;
  private legacyPlayVisibilityChangeHandler: (() => void) | null = null;
  private legacyPlayDocumentKeyDownHandler: ((event: KeyboardEvent) => void) | null = null;
  private legacyPlayDocumentKeyUpHandler: ((event: KeyboardEvent) => void) | null = null;
  private legacyPlayTouchControlPointerDownHandler: ((event: PointerEvent) => void) | null = null;
  private legacyPlayTouchControlPointerMoveHandler: ((event: PointerEvent) => void) | null = null;
  private legacyPlayTouchControlPointerUpHandler: ((event: PointerEvent) => void) | null = null;
  private pathVisualStyle: LegacyPathVisualStyle = 'corridor';
  private runtimeFeedDiagnostics = summarizeMenuSceneRuntimeFeed({ nowMs: 0 });

  public constructor() {
    super('MenuScene');
  }

  public create(): void {
    markMazerBootStatus('menu-scene-create');
    const runtimeSearch = typeof window === 'undefined' ? '' : window.location.search;
    this.pathVisualStyle = resolveLegacyPathVisualStyle(runtimeSearch);
    const initialSeed = resolveInitialLegacyRuntimeSeed(runtimeSearch, {
      previousSeed: this.mazeSeed
    });
    this.mazeSeed = initialSeed.seed;
    this.explicitRuntimeMazeSeed = initialSeed.explicit;
    this.loadPersistedLegacyAuthForm();
    this.loadPersistedLegacyGameToggleSettings();
    this.loadPersistedMazeCycleTelemetryHistory();
    this.loadPersistedLegacyProgressionState();
    void this.initializeLegacyAuth();
    this.initializeRuntimeDiagnostics();
    this.backdropGraphics = this.add.graphics();
    this.boardStaticGraphics = this.add.graphics();
    this.boardPathGraphics = this.add.graphics();
    this.boardDynamicGraphics = this.add.graphics();
    this.titleGraphics = this.add.graphics();
    this.overlayGraphics = this.add.graphics();
    this.hudGraphics = this.add.graphics();

    this.footerText = this.applyLegacyUiTextCrispness(this.add.text(0, 0, '', {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: '18px',
      color: '#d7d6de',
      align: 'center'
    })).setOrigin(0.5).setAlpha(0.92);
    this.progressionBadgeText = this.applyLegacyUiTextCrispness(this.add.text(0, 0, '', {
      fontFamily: LEGACY_UI_MONO_FONT_FAMILY,
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#36ff7d',
      align: 'center'
    })).setOrigin(0.5).setAlpha(0.96).setVisible(false);

    this.createStars();
    if (resolveInitialRuntimeMode(runtimeSearch) === 'play') {
      this.startPlayMode();
    } else {
      this.applyGenerationRequest(
        createLegacyGenerationRequest({
          currentSeed: this.mazeSeed,
          dueAtMs: this.time.now,
          generationProfile: this.resolveLegacyMazeGenerationProfileForMode('menu'),
          mode: 'menu',
          queuedAtMs: this.time.now,
          reason: 'boot-menu',
          scale: this.resolveLegacyProgressionScaleForMode('menu'),
          targetComplexity: this.resolveLegacyTargetComplexityForMode('menu')
        }),
        this.time.now + INITIAL_MENU_DEMO_HOLD_MS
      );
    }
    this.installInput();
    this.installLegacyPlayFocusGuards();
    this.installLegacyQaDiagnosticsSurface();

    this.scale.on('resize', () => {
      this.refreshLayout();
    });
    if (typeof window !== 'undefined') {
      this.viewportGeometryListener = () => this.refreshLayout();
      window.addEventListener(MAZER_VIEWPORT_CHANGE_EVENT, this.viewportGeometryListener);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.authUnsubscribe?.();
      this.authUnsubscribe = null;
      this.destroyLegacyAuthNativeInput();
      this.detachRuntimeDiagnostics();
      this.detachLegacyPlayFocusGuards();
      this.detachLegacyPlayKeyboardFallback();
      this.detachLegacyPlayTouchControlFallback();
      this.detachLegacyQaDiagnosticsSurface();
      if (this.viewportGeometryListener !== null && typeof window !== 'undefined') {
        window.removeEventListener(MAZER_VIEWPORT_CHANGE_EVENT, this.viewportGeometryListener);
        this.viewportGeometryListener = null;
      }
      this.clearVisualDiagnostics();
      clearMenuSceneRuntimeDiagnostics();
    });
    this.publishVisualDiagnostics(this.time.now, true);
    this.publishRuntimeDiagnostics(this.time.now, true);
  }

  private installLegacyQaDiagnosticsSurface(): void {
    if (!this.runtimeDiagnosticsConfig.enabled || typeof window === 'undefined') {
      return;
    }

    window.__MAZER_QA__ = {
      movePlayPlayer: (move: string): LegacyQaMoveResult => this.handleLegacyQaPlayMove(move),
      openOptionsOverlay: (): LegacyQaOverlayResult => this.handleLegacyQaOpenOptionsOverlay(),
      openPauseOverlay: (): LegacyQaOverlayResult => this.handleLegacyQaOpenPauseOverlay(),
      startPlayMode: (): LegacyQaOverlayResult => this.handleLegacyQaStartPlayMode()
    };
  }

  private detachLegacyQaDiagnosticsSurface(): void {
    if (typeof window === 'undefined') {
      return;
    }

    delete window.__MAZER_QA__;
  }

  private handleLegacyQaPlayMove(move: string): LegacyQaMoveResult {
    const maybeMove = move as HumanMovementActionKind;
    const normalizedMove = isMovementActionKind(maybeMove) ? maybeMove : null;
    const base = {
      lifecycleLocked: this.isLegacyPlayLifecycleInputLocked(),
      mode: this.mode,
      move: normalizedMove,
      overlay: this.overlay,
      player: copyPoint(this.player)
    };

    if (normalizedMove === null) {
      return {
        ...base,
        accepted: false,
        reason: 'invalid-move'
      };
    }
    if (this.mode !== 'play') {
      return {
        ...base,
        accepted: false,
        reason: 'not-play-mode'
      };
    }
    if (this.overlay !== 'none') {
      return {
        ...base,
        accepted: false,
        reason: 'overlay-open'
      };
    }
    if (base.lifecycleLocked) {
      const vector = resolveHumanMovementActionVector(normalizedMove);
      this.tryMovePlayerFromInput(vector.deltaX, vector.deltaY, { releaseAfterStep: true });
      return {
        ...base,
        accepted: false,
        reason: 'lifecycle-locked'
      };
    }

    const vector = resolveHumanMovementActionVector(normalizedMove);
    const accepted = this.tryMovePlayerFromInput(vector.deltaX, vector.deltaY, { releaseAfterStep: true });
    return {
      ...base,
      accepted,
      lifecycleLocked: this.isLegacyPlayLifecycleInputLocked(),
      player: copyPoint(this.player),
      reason: accepted ? null : 'blocked'
    };
  }

  private handleLegacyQaOpenOptionsOverlay(): LegacyQaOverlayResult {
    const base = {
      mode: this.mode,
      overlay: this.overlay
    };

    if (this.mode !== 'menu') {
      return {
        ...base,
        accepted: false,
        reason: 'not-menu-mode'
      };
    }
    if (this.overlay !== 'none' && this.overlay !== 'options') {
      return {
        ...base,
        accepted: false,
        reason: 'overlay-open'
      };
    }

    this.openOverlay('options');
    this.rebuildUi();
    this.publishVisualDiagnostics(this.time.now, true);
    this.publishRuntimeDiagnostics(this.time.now, true);
    return {
      accepted: true,
      mode: this.mode,
      overlay: this.overlay,
      reason: null
    };
  }

  private handleLegacyQaStartPlayMode(): LegacyQaOverlayResult {
    const base = {
      mode: this.mode,
      overlay: this.overlay
    };

    if (this.authSnapshot.status !== 'authenticated') {
      return {
        ...base,
        accepted: false,
        reason: 'auth-required'
      };
    }
    if (this.mode !== 'menu' || this.overlay !== 'none') {
      return {
        ...base,
        accepted: false,
        reason: this.mode !== 'menu' ? 'not-menu-mode' : 'overlay-open'
      };
    }

    this.startPlayMode();
    this.rebuildUi();
    this.publishVisualDiagnostics(this.time.now, true);
    this.publishRuntimeDiagnostics(this.time.now, true);
    return {
      accepted: true,
      mode: this.mode,
      overlay: this.overlay,
      reason: null
    };
  }

  private handleLegacyQaOpenPauseOverlay(): LegacyQaOverlayResult {
    const base = {
      mode: this.mode,
      overlay: this.overlay
    };

    if (this.mode !== 'play') {
      return {
        ...base,
        accepted: false,
        reason: 'not-play-mode'
      };
    }
    if (this.overlay !== 'none' && this.overlay !== 'pause') {
      return {
        ...base,
        accepted: false,
        reason: 'overlay-open'
      };
    }

    this.openOverlay('pause');
    this.rebuildUi();
    this.publishVisualDiagnostics(this.time.now, true);
    this.publishRuntimeDiagnostics(this.time.now, true);
    return {
      accepted: true,
      mode: this.mode,
      overlay: this.overlay,
      reason: null
    };
  }

  public update(time: number, delta: number): void {
    this.recordRuntimeFrame(delta);
    this.updateStars(time, delta);
    this.expireLegacyPlayerMessages(time);

    const pendingReset = this.pendingResetRequest;
    if (pendingReset !== null && shouldConsumeLegacyResetRequest(pendingReset, time)) {
      this.pendingResetRequest = null;
      this.consumeResetRequest(pendingReset, time);
      return;
    }

    const nextRequest = this.pendingGenerationRequest;
    if (
      nextRequest !== null
      && shouldConsumeLegacyGenerationRequest(nextRequest, time)
      && !this.shouldDelayLegacyMenuDeconstructRebuild(nextRequest, time)
    ) {
      this.pendingGenerationRequest = null;
      this.applyGenerationRequest(nextRequest, time);
    }

    if (
      this.mode === 'menu'
      && this.overlay === 'none'
      && this.pendingGenerationRequest === null
      && this.pendingResetRequest === null
    ) {
      this.updateMenuDemo(time);
    }

    this.advanceLegacyMenuStaticDrawStage(time);
    if (
      this.menuStaticDrawLifecyclePhase === 'deconstructing'
      && (
        this.resolveLegacyMenuDeconstructTrailAlpha(time) > 0
        || this.isLegacyMenuDeconstructHandoffActive(time)
      )
    ) {
      this.boardDynamicDirty = true;
    }
    if (this.isLegacyMenuBuildPrerollActive(time)) {
      this.boardDynamicDirty = true;
    }
    if (this.hasLegacyPlayCompassSpinPendingFrame()) {
      this.hudDirty = true;
    }
    if (this.hasLegacyPlayTrailPulsePendingFrame(time)) {
      this.boardDynamicDirty = true;
    }
    if (this.hasLegacyPlayerVisualMotionPendingFrame(time)) {
      this.boardDynamicDirty = true;
      if (this.mode === 'play') {
        this.hudDirty = true;
      }
    }
    if (this.hasLegacyBoardCornerShimmerPendingFrame(time)) {
      this.boardDynamicDirty = true;
    }
    if (this.isLegacyMenuHandoffAnimationActive(time)) {
      this.boardDynamicDirty = true;
      this.backdropDirty = true;
      this.drawLegacyMenuPathTitle(time);
    }

    if (this.backdropDirty) {
      this.drawBackdrop();
    }
    if (this.boardStaticDirty) {
      this.drawStaticBoard();
      this.boardPathDirty = true;
    }
    if (this.boardPathDirty) {
      this.drawBoardPaths(time);
    } else if (this.hasLegacyMenuTitleAnimationPendingFrame(time)) {
      this.drawLegacyMenuPathTitle(time);
    }
    const shouldDrawDynamicBoard = this.boardDynamicDirty;
    if (shouldDrawDynamicBoard) {
      this.drawDynamicBoard(time);
    }
    if (this.hudDirty || shouldDrawDynamicBoard) {
      this.drawHud(time);
      this.hudDirty = false;
    }
    const uiRebuilt = this.uiDirty;
    if (uiRebuilt) {
      this.rebuildUi();
    }

    this.publishVisualDiagnostics(time, uiRebuilt);
    this.publishRuntimeDiagnostics(time);
  }

  private initializeRuntimeDiagnostics(): void {
    const runtimeSearch = typeof window === 'undefined' ? '' : window.location.search;
    const runtimeNavigator = typeof navigator === 'undefined' ? null : navigator;
    const networkInformation = runtimeNavigator && 'connection' in runtimeNavigator
      ? (runtimeNavigator as Navigator & { connection?: { saveData?: boolean } }).connection
      : undefined;

    this.runtimeDiagnosticsConfig = resolveMenuSceneRuntimeConfig(runtimeSearch, {
      hardwareConcurrency: runtimeNavigator?.hardwareConcurrency ?? null,
      saveData: networkInformation?.saveData === true,
      lowPowerHardwareConcurrencyMax: legacyTuning.menu.runtime.lowPowerHardwareConcurrencyMax
    });

    if (!this.runtimeDiagnosticsConfig.enabled) {
      return;
    }

    this.runtimeDiagnosticsSceneInstanceId = nextMenuSceneInstanceId();
    this.runtimeInstallSurfaceAttached = typeof document !== 'undefined';
    if (typeof document !== 'undefined') {
      this.runtimeVisibilityChangeHandler = () => {
        this.runtimeVisibilityChangeCount += 1;
        if (document.hidden) {
          this.runtimeVisibilitySuspendCount += 1;
        }
      };
      document.addEventListener('visibilitychange', this.runtimeVisibilityChangeHandler);
      this.runtimeVisibilityAttached = true;
    }
  }

  private recordRuntimeFrame(delta: number): void {
    if (!this.runtimeDiagnosticsConfig.enabled) {
      return;
    }

    const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    this.runtimeFrameWindowMs.push(safeDelta);
    if (this.runtimeFrameWindowMs.length > legacyTuning.menu.runtime.recentFrameWindow) {
      this.runtimeFrameWindowMs.shift();
    }
    this.runtimeFrameCount += 1;
    this.runtimeFrameTotalMs += safeDelta;
    this.runtimeWorstFrameMs = Math.max(this.runtimeWorstFrameMs, safeDelta);
  }

  private resolveRuntimeAverageFrameMs(): number {
    return this.runtimeFrameCount > 0
      ? Number((this.runtimeFrameTotalMs / this.runtimeFrameCount).toFixed(3))
      : 0;
  }

  private publishRuntimeDiagnostics(time: number, force = false): void {
    if (!this.runtimeDiagnosticsConfig.enabled) {
      return;
    }

    const playLifecycleSignature = this.resolveLegacyPlayLifecycleDiagnosticsSignature(time);
    const lifecycleChanged = playLifecycleSignature !== this.runtimeDiagnosticsPlayLifecycleSignature;
    if (
      !force
      && !lifecycleChanged
      && time - this.runtimeDiagnosticsLastPublishedAtMs < legacyTuning.menu.runtime.diagnosticsPublishIntervalMs
    ) {
      return;
    }

    const frameSummary = summarizeMenuSceneFrameWindow(
      this.runtimeFrameWindowMs,
      legacyTuning.menu.runtime.spikeFrameMs
    );
    const hidden = typeof document !== 'undefined' ? document.hidden === true : false;
    this.runtimeDiagnosticsPerformanceMode = resolveMenuScenePerformanceMode(
      this.runtimeDiagnosticsPerformanceMode,
      {
        hidden,
        lowPowerActive: this.runtimeDiagnosticsConfig.lowPowerActive,
        recentAverageFrameMs: frameSummary.averageMs,
        recentSpikeCount: frameSummary.spikeCount,
        tuning: legacyTuning.menu.runtime
      }
    );
    this.runtimeFeedDiagnostics = summarizeMenuSceneRuntimeFeed({
      step: this.menuDemoState?.stepsTaken ?? null,
      status: null,
      visibleEntries: [],
      previous: this.runtimeFeedDiagnostics,
      nowMs: time
    });
    this.runtimeDiagnosticsRevision += 1;
    this.runtimeDiagnosticsLastPublishedAtMs = time;
    this.runtimeDiagnosticsPlayLifecycleSignature = playLifecycleSignature;

    const averageFrameMs = this.resolveRuntimeAverageFrameMs();
    const starCount = this.stars.length;
    const backdropSignatureCount = starCount
      + LEGACY_MENU_BACKDROP_SHARD_COUNT
      + LEGACY_MENU_GLASS_SHARD_COUNT
      + LEGACY_MENU_DRIFT_RUNE_COUNT;
    const movingBackdropActorCount = this.settings.toggleAnimatedBackdrop
      ? starCount + LEGACY_MENU_GLASS_SHARD_COUNT + LEGACY_MENU_DRIFT_RUNE_COUNT
      : 0;
    const telemetrySummary = summarizeTelemetrySemantics([]);
    const drawStage = this.resolveLegacyMenuStaticDrawStage();
    const drawStageStaged = drawStage?.executionKind === 'row-slice';
    const drawRowsVisible = this.resolveLegacyMenuStaticDrawRowsVisibleForDiagnostics();
    const drawTilesVisible = this.resolveLegacyMenuStaticDrawTilesVisibleForDiagnostics();
    const drawTileCount = drawStageStaged && this.menuStaticDrawTileOrder.length > 0
      ? this.menuStaticDrawTileOrder.length
      : null;
    const drawStageProgress = resolveMenuSceneGenerationDrawStageProgress({
      rowsVisible: drawRowsVisible,
      rowCount: drawStageStaged ? this.maze.size : null,
      tilesVisible: drawTilesVisible,
      tileCount: drawTileCount
    });
    const revealOrderDiagnostics = summarizeLegacyMazeRevealOrder(
      this.menuStaticDrawTileOrder,
      this.maze.solutionPath
    );
    const titlePieceCount = this.mode === 'menu'
      ? this.resolveLegacyMenuPathTitlePieceCount()
      : 0;
    const titleVisiblePieces = this.mode === 'menu'
      ? this.resolveLegacyMenuPathTitleVisiblePieceCount()
      : 0;
    const titlePiecesRemaining = this.menuStaticDrawLifecyclePhase === 'deconstructing'
      ? titleVisiblePieces
      : Math.max(0, titlePieceCount - titleVisiblePieces);
    const routeDiagnostics = this.menuDemoEpisode && this.menuDemoConfig
      ? collectDemoWalkerRouteDiagnostics(this.menuDemoEpisode, this.menuDemoConfig)
      : null;
    const menuAiMemory = this.resolveLegacyMenuAiMemoryPoints();
    const runnerTelemetry = routeDiagnostics?.telemetry ?? this.menuDemoState?.telemetry ?? {
      wrongBranchCount: 0,
      backtrackCount: 0,
      recoveryCount: 0,
      visitedUndoCount: 0,
      optionalRetargetCount: 0
    };
    const movementSpeedProfile = this.resolveLegacyPlayMovementSpeedProfile();
    const trailSegmentCap = this.settings.toggleTrailFade
      ? TRAIL_FADE_TAIL
      : Math.max(this.trail.length, this.menuDemoConfig?.behavior.trailMaxLength ?? this.trail.length);
    const boardOffset = this.resolveBoardOffset();
    const boardBounds = this.resolveLegacyPlayBoardBounds();
    const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(
      this.layout.boardLeft + boardOffset.x,
      this.layout.boardTop + boardOffset.y,
      this.layout.boardSize
    );
    const progressionPalette = this.resolveActiveLegacyProgressionPalette();
    const trailShineMotion = resolveLegacyTrailShineMotion({
      timeMs: time,
      trailLength: this.trail.length
    });
    const rememberedAuthIdentity = readLegacyRememberedIdentityState(this.resolveBrowserLocalStorage());
    const renderedPlayerPoint = this.resolveLegacyRenderedPlayerPoint(time);
    const playerMarkerMetrics = resolveLegacyPlayerMarkerRenderMetrics(
      mazeRenderFrame.tileSize,
      this.mode === 'play' ? LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO : LEGACY_PLAYER_MARKER_RADIUS_RATIO,
      this.mode === 'play' ? LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO : LEGACY_PLAYER_MARKER_HALO_RATIO,
      this.mode === 'play' ? LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO : undefined,
      this.mode === 'play' ? LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO : undefined
    );
    const playLifecycle = this.resolveLegacyPlayLifecycleDiagnostics(time);
    this.legacyWorldTurnHost.setState(this.resolveLegacyWorldTurnHostState());
    const worldTurnDiagnostics = this.legacyWorldTurnHost.getDiagnostics();

    publishMenuSceneRuntimeDiagnostics({
      revision: this.runtimeDiagnosticsRevision,
      sceneInstanceId: this.runtimeDiagnosticsSceneInstanceId,
      updatedAt: Math.max(0, Math.round(time)),
      runtimeMs: Math.max(0, Math.round(time)),
      surface: {
        mode: this.mode,
        overlay: this.overlay
      },
      auth: {
        configured: this.authSnapshot.configured,
        displayName: this.authSnapshot.displayName,
        email: this.authSnapshot.email,
        emailPresent: this.authSnapshot.email !== null,
        formMode: this.authForm.mode,
        rememberedIdentity: rememberedAuthIdentity,
        status: this.authSnapshot.status,
        userIdPresent: this.authSnapshot.userId !== null,
        latestMessage: this.latestAuthMessage
          ? {
              copy: this.latestAuthMessage.copy,
              id: this.latestAuthMessage.id,
              source: this.latestAuthMessage.source,
              tone: this.latestAuthMessage.tone
            }
          : null
      },
      gameToggles: {
        animatedBackdrop: {
          enabled: this.settings.toggleAnimatedBackdrop,
          switchIsOn: resolveLegacyOverlayToggleSwitchIsOn('toggleAnimatedBackdrop', this.settings),
          stateText: resolveLegacyOverlayToggleStateText('toggleAnimatedBackdrop', this.settings.toggleAnimatedBackdrop) ?? 'Stagnant'
        },
        cameraFollow: {
          enabled: this.settings.toggleCameraFollow,
          switchIsOn: resolveLegacyOverlayToggleSwitchIsOn('toggleCameraFollow', this.settings),
          stateText: resolveLegacyOverlayToggleStateText('toggleCameraFollow', this.settings.toggleCameraFollow) ?? 'Off'
        },
        controlMode: {
          mode: this.settings.controlMode,
          switchIsOn: resolveLegacyOverlayToggleSwitchIsOn('controlMode', this.settings),
          stateText: resolveLegacyOverlayToggleStateText('controlMode', this.settings.controlMode === 'stick') ?? 'Arrows'
        },
        darkMode: {
          enabled: this.settings.darkMode,
          switchIsOn: resolveLegacyOverlayToggleSwitchIsOn('darkMode', this.settings),
          stateText: resolveLegacyOverlayToggleStateText('darkMode', this.settings.darkMode) ?? 'Off'
        },
        movementSpeed: {
          label: formatLegacyMovementSpeedPercent(this.settings.movementSpeed),
          value: normalizeLegacyMovementSpeed(this.settings.movementSpeed)
        },
        trailFade: {
          enabled: this.settings.toggleTrailFade,
          switchIsOn: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailFade', this.settings),
          stateText: resolveLegacyOverlayToggleStateText('toggleTrailFade', this.settings.toggleTrailFade) ?? 'Off'
        },
        trailPulse: {
          enabled: this.settings.toggleTrailPulse,
          switchIsOn: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailPulse', this.settings),
          stateText: resolveLegacyOverlayToggleStateText('toggleTrailPulse', this.settings.toggleTrailPulse) ?? 'Off'
        }
      },
      play: {
        board: {
          ...boardBounds,
          size: this.layout.boardSize,
          tileSize: this.layout.tileSize,
          renderBounds: {
            bottom: mazeRenderFrame.boardTop + mazeRenderFrame.boardSize,
            left: mazeRenderFrame.boardLeft,
            right: mazeRenderFrame.boardLeft + mazeRenderFrame.boardSize,
            top: mazeRenderFrame.boardTop
          },
          renderSafeInset: mazeRenderFrame.safeInset,
          renderSize: mazeRenderFrame.boardSize,
          renderTileSize: mazeRenderFrame.tileSize
        },
        lifecycle: playLifecycle,
        worldTurn: {
          acceptedTurnCount: worldTurnDiagnostics.acceptedTurnCount,
          lastCommandId: worldTurnDiagnostics.lastCommandId,
          lastReceipt: worldTurnDiagnostics.lastReceipt
            ? {
                admitted: worldTurnDiagnostics.lastReceipt.admitted,
                commandId: worldTurnDiagnostics.lastReceipt.commandId,
                commandKind: worldTurnDiagnostics.lastReceipt.commandKind,
                eventCount: worldTurnDiagnostics.lastReceipt.events.length,
                nextTurn: worldTurnDiagnostics.lastReceipt.nextTurn,
                phases: worldTurnDiagnostics.lastReceipt.phases.map((phase) => ({ ...phase })),
                reason: worldTurnDiagnostics.lastReceipt.reason,
                turn: worldTurnDiagnostics.lastReceipt.turn
              }
            : null,
          nextTurn: worldTurnDiagnostics.nextTurn,
          registeredPhases: [...worldTurnDiagnostics.registeredPhases],
          rejectedCommandCount: worldTurnDiagnostics.rejectedCommandCount,
          state: worldTurnDiagnostics.state,
          timedModeEnabled: worldTurnDiagnostics.timedModeEnabled
        },
        inputBuffer: {
          directionalIntent: this.playDirectionalIntent.getDiagnostics(),
          held: {
            down: this.playMoveFlags.down,
            left: this.playMoveFlags.left,
            right: this.playMoveFlags.right,
            up: this.playMoveFlags.up
          },
          pendingTimerActive: this.playMoveTimer !== null,
          keyboardRepeat: {
            ...this.playKeyboardRepeatGate.getSnapshot(),
            repeatIntervalMs: movementSpeedProfile.repeatIntervalMs
          },
          pointerStartActive: this.playPointerStart !== null,
          touchSprint: {
            activeControls: this.playHeldTouchMoves.map((move) => move.control),
            baseMovementSpeed: movementSpeedProfile.baseSpeed,
            effectiveMovementSpeed: movementSpeedProfile.effectiveSpeed,
            formulaVersion: movementSpeedProfile.formulaVersion,
            heldControl: this.resolveLegacyPlayHeldTouchControl(),
            movementSpeed: normalizeLegacyMovementSpeed(this.settings.movementSpeed),
            movementSpeedLabel: formatLegacyMovementSpeedPercent(this.settings.movementSpeed),
            progressionCompletedCycles: movementSpeedProfile.completedCycles,
            progressionContextApplied: movementSpeedProfile.contextApplied,
            progressionLevel: movementSpeedProfile.level,
            progressionPaceScore: movementSpeedProfile.paceScore,
            repeatInitialDelayMs: movementSpeedProfile.initialDelayMs,
            repeatIntervalMs: movementSpeedProfile.repeatIntervalMs,
            stickInitialDelayMaxMs: LEGACY_PLAY_STICK_INITIAL_DELAY_MAX_MS,
            stickRepeatIntervalMaxMs: LEGACY_PLAY_STICK_REPEAT_INTERVAL_MAX_MS,
            stickRetargetDelayMs: LEGACY_PLAY_STICK_RETARGET_STEP_MS,
            stickTurnDelayMaxMs: LEGACY_PLAY_STICK_TURN_DELAY_MAX_MS,
            turnDelayMs: movementSpeedProfile.turnDelayMs,
            repeatTimerActive: this.playHeldTouchRepeatTimer !== null
          },
          resolvedVector: resolveLegacyPlayMoveVector(this.playMoveFlags),
          simultaneousDelayMs: LEGACY_SIMULTANEOUS_KEY_PRESS_DELAY_MS
        },
        player: {
          renderScreenX: mazeRenderFrame.boardLeft + ((renderedPlayerPoint.x + 0.5) * mazeRenderFrame.tileSize),
          renderScreenY: mazeRenderFrame.boardTop + ((renderedPlayerPoint.y + 0.5) * mazeRenderFrame.tileSize),
          visualMotionActive: this.hasLegacyPlayerVisualMotionPendingFrame(time),
          visualMotionSnapReason: this.lastPlayerVisualMotionSnapReason,
          visualX: renderedPlayerPoint.x,
          visualY: renderedPlayerPoint.y,
          x: this.player.x,
          y: this.player.y,
          screenX: mazeRenderFrame.boardLeft + ((this.player.x + 0.5) * mazeRenderFrame.tileSize),
          screenY: mazeRenderFrame.boardTop + ((this.player.y + 0.5) * mazeRenderFrame.tileSize)
        },
        goal: {
          x: this.maze.goal.x,
          y: this.maze.goal.y,
          screenX: mazeRenderFrame.boardLeft + ((this.maze.goal.x + 0.5) * mazeRenderFrame.tileSize),
          screenY: mazeRenderFrame.boardTop + ((this.maze.goal.y + 0.5) * mazeRenderFrame.tileSize)
        },
        playtest: {
          encoding: 'walkable-rows-v1',
          mazeSize: this.maze.size,
          walkableRows: this.maze.grid.map((row) => row.map((walkable) => (walkable ? '1' : '0')).join(''))
        },
        markerStyle: {
          goalCoreColor: LEGACY_PLAY_GOAL_MARKER_CORE,
          goalEdgeColor: LEGACY_PLAY_GOAL_MARKER_EDGE,
          playerCoreColor: resolveLegacyIridescentPlayerCoreColor(),
          playerCoreRadius: playerMarkerMetrics.coreRadius,
          playerBeaconAccentColor: LEGACY_PLAY_PLAYER_BEACON_ACCENT,
          playerBeaconColor: LEGACY_PLAY_PLAYER_BEACON_COLOR,
          playerBeaconPeriodMs: LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS,
          playerHaloColor: progressionPalette.playerHaloColor,
          playerHaloRadius: playerMarkerMetrics.haloRadius,
          startCoreColor: LEGACY_PLAY_START_MARKER_CORE,
          startEdgeColor: LEGACY_PLAY_START_MARKER_EDGE,
          trailPulseEnabled: this.settings.toggleTrailPulse,
          trailPulseColor: progressionPalette.trailPulseColor,
          trailPulseEdgeColor: progressionPalette.trailPulseEdgeColor,
          trailShineEnabled: this.settings.toggleTrailPulse,
          trailShineColor: progressionPalette.trailPulseColor,
          trailShineEdgeColor: progressionPalette.trailPulseEdgeColor,
          trailShineCenterIndex: trailShineMotion.centerIndex,
          trailShineCyclePeriodMs: trailShineMotion.cyclePeriodMs,
          trailShineDirection: trailShineMotion.direction,
          trailShineProgress: trailShineMotion.distanceProgress,
          trailShineSpeedTilesPerSecond: trailShineMotion.speedTilesPerSecond,
          iridescentMaterial: this.resolveLegacyIridescentMaterialDiagnostics(time, progressionPalette),
          trailPulsePeriodMs: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS
        }
      },
      menuDemo: {
        phase: this.menuDemoState?.phase ?? null,
        cue: this.menuDemoState?.cue ?? null,
        pathCursor: this.menuDemoState?.pathCursor ?? null,
        gate: {
          nextMoveAtMs: Math.round(this.nextDemoMoveAtMs),
          released: this.menuStaticDrawLifecyclePhase === 'settled' && this.nextDemoMoveAtMs <= time,
          waitingForBuild: this.menuStaticDrawLifecyclePhase !== 'settled'
            || this.menuStaticDrawRowsVisible !== null
            || this.menuStaticDrawTilesVisible !== null
        },
        reachedGoal: this.menuDemoState?.reachedGoal ?? false,
        prerollSteps: Math.max(0, this.menuDemoConfig?.behavior.prerollSteps ?? 0),
        runnerMistakesEnabled: this.menuDemoConfig
          ? this.menuDemoConfig.behavior.enableRunnerMistakes === true
          : null,
        aiMemory: {
          choiceClass: menuAiMemory.choiceClass,
          confidence: menuAiMemory.confidence,
          optionCount: menuAiMemory.optionPoints.length,
          optionPoints: menuAiMemory.optionPoints.map(copyPoint),
          targetPoint: menuAiMemory.targetPoint ? copyPoint(menuAiMemory.targetPoint) : null,
          thoughtState: menuAiMemory.thoughtState
        },
        route: routeDiagnostics ? {
          aiResetPathCursor: routeDiagnostics.aiResetPathCursor,
          canonicalPathLength: routeDiagnostics.canonicalPathLength,
          cueCounts: routeDiagnostics.cueCounts,
          routeLength: routeDiagnostics.routeLength,
          segmentCount: routeDiagnostics.segmentCount,
          trailModeCounts: routeDiagnostics.trailModeCounts,
          traverseMs: routeDiagnostics.traverseMs
        } : undefined
      },
      generation: {
        maze: {
          buildTrace: this.maze.generationBuildTrace ? {
            checkpointTileCount: this.maze.generationBuildTrace.checkpointTiles.length,
            pathTileCount: this.maze.generationBuildTrace.pathTiles.length,
            reinforcementShortcutTileCount: this.maze.generationBuildTrace.reinforcementShortcutTiles.length,
            shortcutTileCount: this.maze.generationBuildTrace.shortcutTiles.length
          } : undefined,
          buildKind: this.maze.generation?.buildKind ?? null,
          source: this.maze.source,
          size: this.maze.size,
          seed: this.maze.seed,
          seedSource: this.mode === 'play' || !this.explicitRuntimeMazeSeed ? 'runtime-random' : 'query',
          solutionPathLength: this.maze.solutionPath.length,
          wrapTopologyDiagnostics: this.maze.wrapTopologyDiagnostics ? {
            contractVersion: this.maze.wrapTopologyDiagnostics.contractVersion,
            cornerBorderFloorCount: this.maze.wrapTopologyDiagnostics.cornerBorderFloors.length,
            decorativeCutoutCandidateCount: this.maze.wrapTopologyDiagnostics.decorativeCutoutCandidates.length,
            decorativeCutoutPolicy: this.maze.wrapTopologyDiagnostics.decorativeCutoutPolicy,
            directShortestStepCount: this.maze.wrapTopologyDiagnostics.directShortestStepCount,
            graphPolicy: this.maze.wrapTopologyDiagnostics.graphPolicy,
            graphTopologyValid: this.maze.wrapTopologyDiagnostics.graphTopologyValid,
            horizontal: {
              endpointCount: this.maze.wrapTopologyDiagnostics.horizontal.endpointCount,
              pairCount: this.maze.wrapTopologyDiagnostics.horizontal.pairCount,
              required: this.maze.wrapTopologyDiagnostics.horizontal.required,
              requiredSatisfied: this.maze.wrapTopologyDiagnostics.horizontal.requiredSatisfied,
              unpairedEndpointCount: this.maze.wrapTopologyDiagnostics.horizontal.unpairedEndpoints.length
            },
            inwardDisconnectedEndpointCount: this.maze.wrapTopologyDiagnostics.inwardDisconnectedEndpoints.length,
            playableShortcutDelta: this.maze.wrapTopologyDiagnostics.playableShortcutDelta,
            playableShortestStepCount: this.maze.wrapTopologyDiagnostics.playableShortestStepCount,
            solutionPathPolicy: this.maze.wrapTopologyDiagnostics.solutionPathPolicy,
            solutionRouteAudit: {
              actualStepCount: this.maze.wrapTopologyDiagnostics.solutionRouteAudit.actualStepCount,
              firstIllegalStepIndex: this.maze.wrapTopologyDiagnostics.solutionRouteAudit.firstIllegalStepIndex,
              lowerBoundSatisfied: this.maze.wrapTopologyDiagnostics.solutionRouteAudit.lowerBoundSatisfied,
              validCompletedRoute: this.maze.wrapTopologyDiagnostics.solutionRouteAudit.validCompletedRoute
            },
            vertical: {
              endpointCount: this.maze.wrapTopologyDiagnostics.vertical.endpointCount,
              pairCount: this.maze.wrapTopologyDiagnostics.vertical.pairCount,
              required: this.maze.wrapTopologyDiagnostics.vertical.required,
              requiredSatisfied: this.maze.wrapTopologyDiagnostics.vertical.requiredSatisfied,
              unpairedEndpointCount: this.maze.wrapTopologyDiagnostics.vertical.unpairedEndpoints.length
            }
          } : undefined,
          shortcutStats: this.maze.shortcutStats ? {
            requested: this.maze.shortcutStats.requested,
            attempts: this.maze.shortcutStats.attempts,
            created: this.maze.shortcutStats.created,
            wallArrayEntries: this.maze.shortcutStats.wallArrayEntries,
            uniqueWallCandidates: this.maze.shortcutStats.uniqueWallCandidates,
            exhaustedWallArray: this.maze.shortcutStats.exhaustedWallArray
          } : undefined,
          pathBuilderStats: this.maze.pathBuilderStats ? {
            acceptedCheckpoints: this.maze.pathBuilderStats.acceptedCheckpoints,
            backtracks: this.maze.pathBuilderStats.backtracks,
            longestPathLength: this.maze.pathBuilderStats.longestPathLength,
            pathTiles: this.maze.pathBuilderStats.pathTiles,
            requestedCheckpoints: this.maze.pathBuilderStats.requestedCheckpoints,
            wallArrayEntries: this.maze.pathBuilderStats.wallArrayEntries
          } : undefined,
          playableTopologyStats: this.maze.playableTopologyStats ? {
            disconnectedComponentsPruned: this.maze.playableTopologyStats.disconnectedComponentsPruned,
            disconnectedFloorTilesPruned: this.maze.playableTopologyStats.disconnectedFloorTilesPruned,
            goalRebasedToFarthestReachableFloor: this.maze.playableTopologyStats.goalRebasedToFarthestReachableFloor,
            reachableFloors: this.maze.playableTopologyStats.reachableFloors,
            resolvedGoalDistance: this.maze.playableTopologyStats.resolvedGoalDistance
          } : undefined,
          routeQualityStats: this.maze.routeQualityStats ? {
            bypassableRouteBands: this.maze.routeQualityStats.bypassableRouteBands,
            bypassableSolutionEdges: this.maze.routeQualityStats.bypassableSolutionEdges,
            meaningfulBypassableRouteBands: this.maze.routeQualityStats.meaningfulBypassableRouteBands,
            meaningfulBypassableSolutionEdges: this.maze.routeQualityStats.meaningfulBypassableSolutionEdges,
            routeQuality: this.maze.routeQualityStats.routeQuality,
            sampledSolutionEdges: this.maze.routeQualityStats.sampledSolutionEdges
          } : undefined
        },
        drawStage: {
          batchSize: drawStage?.batchSize ?? null,
          batchUnit: drawStage?.batchUnit ?? null,
          buildPrerollActive: this.isLegacyMenuBuildPrerollActive(time),
          buildPrerollDurationMs: LEGACY_MENU_STATIC_BUILD_PREROLL_BURST_MS,
          buildPrerollProgress: this.resolveLegacyMenuBuildPrerollProgress(time),
          complete: drawStageProgress.complete,
          handoffActive: this.isLegacyMenuDeconstructHandoffActive(time),
          handoffEndsAtMs: this.menuStaticDeconstructZeroHoldStartedAtMs === null
            ? null
            : Math.round(this.resolveLegacyMenuDeconstructHandoffEndsAtMs()),
          handoffDurationMs: LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS,
          handoffProgress: this.resolveLegacyMenuDeconstructHandoffProgress(time),
          lifecyclePhase: this.menuStaticDrawLifecyclePhase,
          zeroHoldStartedAtMs: this.menuStaticDeconstructZeroHoldStartedAtMs === null
            ? null
            : Math.round(this.menuStaticDeconstructZeroHoldStartedAtMs),
            nextSeedQueued: this.isLegacyDeconstructGenerationReason(this.pendingGenerationRequest?.reason ?? null),
            nonSolutionTileCountBeforeSolutionComplete: revealOrderDiagnostics.nonSolutionTileCountBeforeSolutionComplete,
            progressPercent: drawStageProgress.progressPercent,
            revealStrategyVersion: revealOrderDiagnostics.strategyVersion,
            rowCount: drawStageProgress.rowCount,
          rowsRemaining: drawStageProgress.rowsRemaining,
          rowsVisible: drawRowsVisible,
          staged: drawStageStaged,
          titleFullyDeconstructed: titleVisiblePieces === 0,
          titlePieceCount,
          titlePiecesRemaining,
            titleVisiblePieces,
            tileCount: drawStageProgress.tileCount,
            solutionCompletedAtIndex: revealOrderDiagnostics.solutionCompletedAtIndex,
            solutionFirstRevealPrevented: revealOrderDiagnostics.solutionFirstRevealPrevented,
            solutionPrefixLength: revealOrderDiagnostics.solutionPrefixLength,
            tilesRemaining: drawStageProgress.tilesRemaining,
          tilesVisible: drawStageProgress.tilesVisible
        },
        stageCursor: {
          completionSignal: this.maze.generation?.stageCursor.completionSignal ?? null,
          currentStageId: this.maze.generation?.stageCursor.currentStageId ?? null,
          phase: this.maze.generation?.stageCursor.phase ?? null,
          previousStageIds: [...(this.maze.generation?.stageCursor.previousStageIds ?? [])],
          processComplete: this.maze.generation?.stageCursor.processComplete ?? null,
          remainingStageIds: [...(this.maze.generation?.stageCursor.remainingStageIds ?? [])]
        }
      },
      visibility: {
        hidden,
        changeCount: this.runtimeVisibilityChangeCount,
        suspendCount: this.runtimeVisibilitySuspendCount
      },
      performance: {
        mode: this.runtimeDiagnosticsPerformanceMode,
        averageFrameMs,
        recentAverageFrameMs: frameSummary.averageMs,
        recentFrameCount: frameSummary.count,
        worstFrameMs: Number(this.runtimeWorstFrameMs.toFixed(3)),
        worstRecentFrameMs: frameSummary.worstMs,
        spikeCount: this.runtimeFrameWindowMs.filter((sample) => sample >= legacyTuning.menu.runtime.spikeFrameMs).length,
        recentSpikeCount: frameSummary.spikeCount,
        estimatedFps: frameSummary.fps,
        lowPowerDetected: this.runtimeDiagnosticsConfig.lowPowerDetected,
        lowPowerForced: this.runtimeDiagnosticsConfig.lowPowerForced,
        lowPowerActive: this.runtimeDiagnosticsConfig.lowPowerActive,
        heapPressureActive: false,
        postHiddenRecoveryActive: false,
        hardwareConcurrency: this.runtimeDiagnosticsConfig.hardwareConcurrency,
        saveData: this.runtimeDiagnosticsConfig.saveData
      },
      feed: this.runtimeFeedDiagnostics,
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
        summary: telemetrySummary
      },
      cycleTelemetry: summarizeMazeCycleTelemetryDiagnostics(this.mazeCycleTelemetryHistory),
      progression: summarizeLegacyProgressionDiagnostics(
        this.progressionState,
        this.resolveActiveLegacyProgressionTrackId(),
        this.maze,
        this.resolveLegacyProgressionStorageKey()
      ),
      resources: {
        activeTweens: 0,
        activeTimers: 0,
        animatedBackdropEnabled: this.settings.toggleAnimatedBackdrop,
        backdropDirty: this.backdropDirty,
        boardDynamicDirty: this.boardDynamicDirty,
        boardPathDirty: this.boardPathDirty,
        boardStaticDirty: this.boardStaticDirty,
        listenerCount: 3
          + (this.runtimeVisibilityAttached ? 1 : 0)
          + (this.legacyPlayFocusGuardAttached ? 2 : 0)
          + (this.legacyPlayDocumentKeyDownHandler !== null ? 1 : 0)
          + (this.legacyPlayDocumentKeyUpHandler !== null ? 1 : 0),
        listenerBreakdown: {
          sceneUpdate: 1,
          sceneShutdown: 1,
          scaleResize: 1,
          visibilityAttached: this.runtimeVisibilityAttached,
          legacyPlayFocusGuardAttached: this.legacyPlayFocusGuardAttached,
          legacyPlayKeyboardFallbackAttached: (
            this.legacyPlayDocumentKeyDownHandler !== null
            && this.legacyPlayDocumentKeyUpHandler !== null
          ),
          installSurfaceAttached: this.runtimeInstallSurfaceAttached
        },
        trailSegmentCount: this.trail.length,
        trailSegmentCap,
        runnerPolicy: {
          wrongBranchCount: runnerTelemetry.wrongBranchCount,
          backtrackCount: runnerTelemetry.backtrackCount,
          recoveryCount: runnerTelemetry.recoveryCount,
          optionalRetargetCount: runnerTelemetry.optionalRetargetCount
        },
        intentEntryCount: 0,
        intentEntryCap: 0,
        deferredVisualTasksRemaining: 0,
        deferredTasksPerFrameCap: legacyTuning.menu.runtime.deferredTasksPerFrame[this.runtimeDiagnosticsPerformanceMode],
        background: {
          clouds: 0,
          farStars: starCount,
          starMotion: LEGACY_MENU_BACKDROP_STAR_MOTION,
          nearStars: 0,
          twinkles: 0,
          shards: LEGACY_MENU_BACKDROP_SHARD_COUNT,
          glassShards: LEGACY_MENU_GLASS_SHARD_COUNT,
          driftRunes: LEGACY_MENU_DRIFT_RUNE_COUNT,
          sigils: 4,
          moving: movingBackdropActorCount,
          movingCap: movingBackdropActorCount,
          signatureCap: backdropSignatureCount
        }
      }
    });
  }

  private publishInteractionDiagnostics(force = true): void {
    const now = this.time.now;
    this.publishVisualDiagnostics(now, force);
    this.publishRuntimeDiagnostics(now, force);
  }

  private detachRuntimeDiagnostics(): void {
    if (
      !this.runtimeVisibilityAttached
      || this.runtimeVisibilityChangeHandler === null
      || typeof document === 'undefined'
    ) {
      return;
    }

    document.removeEventListener('visibilitychange', this.runtimeVisibilityChangeHandler);
    this.runtimeVisibilityAttached = false;
    this.runtimeVisibilityChangeHandler = null;
  }

  private installLegacyPlayFocusGuards(): void {
    if (this.legacyPlayFocusGuardAttached) {
      return;
    }

    this.legacyPlayWindowBlurHandler = () => {
      this.handleLegacyPlayInputFocusLoss();
    };
    this.legacyPlayVisibilityChangeHandler = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        this.handleLegacyPlayInputFocusLoss();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.legacyPlayWindowBlurHandler);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.legacyPlayVisibilityChangeHandler);
    }
    this.legacyPlayFocusGuardAttached = true;
  }

  private detachLegacyPlayFocusGuards(): void {
    if (!this.legacyPlayFocusGuardAttached) {
      return;
    }

    if (typeof window !== 'undefined' && this.legacyPlayWindowBlurHandler !== null) {
      window.removeEventListener('blur', this.legacyPlayWindowBlurHandler);
    }
    if (typeof document !== 'undefined' && this.legacyPlayVisibilityChangeHandler !== null) {
      document.removeEventListener('visibilitychange', this.legacyPlayVisibilityChangeHandler);
    }
    this.legacyPlayWindowBlurHandler = null;
    this.legacyPlayVisibilityChangeHandler = null;
    this.legacyPlayFocusGuardAttached = false;
  }

  private installInput(): void {
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      this.handleLegacyKeyboardDown(event);
    });

    this.input.keyboard?.on('keyup', (event: KeyboardEvent) => {
      this.handleLegacyPlayMovementKeyUp(event);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.handleOverlayScrollPointerDown(pointer)) {
        return;
      }
      this.handleLegacyPlayPointerDown(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.handleOverlayScrollPointerMove(pointer)) {
        return;
      }
      this.handleLegacyPlayPointerMove(pointer);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.handleOverlayScrollPointerUp(pointer)) {
        return;
      }
      this.handleLegacyPlayPointerUp(pointer);
    });
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {
      if (this.handleOverlayScrollPointerUp(pointer)) {
        return;
      }
      this.handleLegacyPlayPointerUp(pointer);
    });
    this.input.on('wheel', (
      pointer: Phaser.Input.Pointer,
      _gameObjects: Phaser.GameObjects.GameObject[],
      _deltaX: number,
      deltaY: number
    ) => {
      this.handleOverlayScrollWheel(pointer, deltaY);
    });
    this.input.on('gameout', () => {
      this.releaseOverlayScrollPointer();
      this.playPointerStart = null;
    });

    this.installLegacyPlayKeyboardFallback();
    this.installLegacyPlayTouchControlFallback();
  }

  private installLegacyPlayKeyboardFallback(): void {
    if (
      this.legacyPlayDocumentKeyDownHandler !== null
      || this.legacyPlayDocumentKeyUpHandler !== null
      || typeof document === 'undefined'
    ) {
      return;
    }

    this.legacyPlayDocumentKeyDownHandler = (event: KeyboardEvent) => {
      if (!event.defaultPrevented) {
        this.handleLegacyKeyboardDown(event);
      }
    };
    this.legacyPlayDocumentKeyUpHandler = (event: KeyboardEvent) => {
      if (!event.defaultPrevented) {
        this.handleLegacyPlayMovementKeyUp(event);
      }
    };

    document.addEventListener('keydown', this.legacyPlayDocumentKeyDownHandler);
    document.addEventListener('keyup', this.legacyPlayDocumentKeyUpHandler);
  }

  private detachLegacyPlayKeyboardFallback(): void {
    if (typeof document === 'undefined') {
      this.legacyPlayDocumentKeyDownHandler = null;
      this.legacyPlayDocumentKeyUpHandler = null;
      return;
    }

    if (this.legacyPlayDocumentKeyDownHandler !== null) {
      document.removeEventListener('keydown', this.legacyPlayDocumentKeyDownHandler);
    }
    if (this.legacyPlayDocumentKeyUpHandler !== null) {
      document.removeEventListener('keyup', this.legacyPlayDocumentKeyUpHandler);
    }
    this.legacyPlayDocumentKeyDownHandler = null;
    this.legacyPlayDocumentKeyUpHandler = null;
  }

  private handleLegacyKeyboardDown(event: KeyboardEvent): boolean {
    if (hasPendingLegacyResetRequest(this.pendingResetRequest)) {
      this.resetLegacyPlayInputBuffer();
      return true;
    }

    if (this.handleLegacyPlayMovementKeyDown(event)) {
      return true;
    }

    if (event.repeat) {
      return false;
    }

    if (
      this.overlay !== 'none'
      && (this.handleOverlayFieldInput(event) || this.handleLegacyAuthFieldInput(event))
    ) {
      event.preventDefault();
      return true;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.handleBackAction();
      return true;
    }

    const lowerKey = event.key.toLowerCase();
    if (lowerKey === 'p' && this.mode === 'play') {
      event.preventDefault();
      if (this.overlay === 'pause') {
        this.closeOverlay();
      } else if (this.overlay === 'none') {
        this.openOverlay('pause');
      }
      return true;
    }

    if (lowerKey === 't' && this.mode === 'play' && (this.overlay === 'none' || this.overlay === 'pause')) {
      event.preventDefault();
      this.applyLegacyOverlayToggleField('toggleTrailFade');
      return true;
    }

    if (event.key === 'Enter' && this.mode === 'menu' && this.overlay === 'none') {
      event.preventDefault();
      this.startPlayMode();
      return true;
    }

    if (lowerKey === 'o' && this.mode === 'menu' && this.overlay === 'none') {
      event.preventDefault();
      this.openOverlay('options');
      return true;
    }

    return false;
  }

  private installLegacyPlayTouchControlFallback(): void {
    if (this.legacyPlayTouchControlPointerDownHandler !== null) {
      return;
    }

    this.legacyPlayTouchControlPointerDownHandler = (event: PointerEvent) => {
      // Phaser owns touch pointers; this fallback only catches non-touch pointer paths before DOM overlays.
      if (event.pointerType === 'touch' || event.target === this.game.canvas) {
        return;
      }

      if (!this.handleLegacyPlayTouchControlClientPoint(event.clientX, event.clientY, event.pointerId)) {
        return;
      }

      this.playPointerStart = null;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    this.legacyPlayTouchControlPointerMoveHandler = (event: PointerEvent) => {
      // Match the non-touch fallback down path; Phaser continues to own real touch move events.
      if (event.pointerType === 'touch' || event.target === this.game.canvas) {
        return;
      }

      if (!this.handleLegacyPlayTouchControlClientMove(event.clientX, event.clientY, event.pointerId)) {
        return;
      }

      this.playPointerStart = null;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    this.legacyPlayTouchControlPointerUpHandler = (event: PointerEvent) => {
      // Match the non-touch fallback down path; Phaser continues to own real touch release events.
      if (event.pointerType === 'touch' || event.target === this.game.canvas) {
        return;
      }

      if (!this.releaseLegacyPlayTouchPointer(event.pointerId)) {
        return;
      }

      this.playPointerStart = null;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const target = typeof document !== 'undefined' ? document : this.game.canvas;
    if (typeof PointerEvent !== 'undefined') {
      target.addEventListener('pointerdown', this.legacyPlayTouchControlPointerDownHandler as EventListener, {
        capture: true,
        passive: false
      });
      target.addEventListener('pointermove', this.legacyPlayTouchControlPointerMoveHandler as EventListener, {
        capture: true,
        passive: false
      });
      target.addEventListener('pointerup', this.legacyPlayTouchControlPointerUpHandler as EventListener, {
        capture: true,
        passive: false
      });
      target.addEventListener('pointercancel', this.legacyPlayTouchControlPointerUpHandler as EventListener, {
        capture: true,
        passive: false
      });
    }
  }

  private detachLegacyPlayTouchControlFallback(): void {
    if (this.legacyPlayTouchControlPointerDownHandler === null) {
      return;
    }

    const target = typeof document !== 'undefined' ? document : this.game.canvas;
    if (this.legacyPlayTouchControlPointerDownHandler !== null && typeof PointerEvent !== 'undefined') {
      target.removeEventListener('pointerdown', this.legacyPlayTouchControlPointerDownHandler as EventListener, {
        capture: true
      });
    }
    if (this.legacyPlayTouchControlPointerUpHandler !== null && typeof PointerEvent !== 'undefined') {
      if (this.legacyPlayTouchControlPointerMoveHandler !== null) {
        target.removeEventListener('pointermove', this.legacyPlayTouchControlPointerMoveHandler as EventListener, {
          capture: true
        });
      }
      target.removeEventListener('pointerup', this.legacyPlayTouchControlPointerUpHandler as EventListener, {
        capture: true
      });
      target.removeEventListener('pointercancel', this.legacyPlayTouchControlPointerUpHandler as EventListener, {
        capture: true
      });
    }
    this.legacyPlayTouchControlPointerDownHandler = null;
    this.legacyPlayTouchControlPointerMoveHandler = null;
    this.legacyPlayTouchControlPointerUpHandler = null;
  }

  private handleLegacyPlayTouchControlClientPoint(clientX: number, clientY: number, pointerId: number | null = null): boolean {
    const point = this.resolveLegacyPlayTouchClientPoint(clientX, clientY);
    return this.handleLegacyPlayTouchControl(point.x, point.y, pointerId);
  }

  private handleLegacyPlayTouchControlClientMove(clientX: number, clientY: number, pointerId: number | null = null): boolean {
    const point = this.resolveLegacyPlayTouchClientPoint(clientX, clientY);
    return this.handleLegacyPlayTouchControlMove(point.x, point.y, pointerId);
  }

  private hasLegacyPlayTouchStickPullChanged(nextPull: TouchStickPullVector | null): boolean {
    const previousPull = this.playTouchStickPull;
    if (previousPull === null || nextPull === null) {
      return previousPull !== nextPull;
    }

    const pullDelta = Math.max(
      Math.abs(previousPull.normalizedX - nextPull.normalizedX),
      Math.abs(previousPull.normalizedY - nextPull.normalizedY),
      Math.abs(previousPull.distanceRatio - nextPull.distanceRatio)
    );
    return previousPull.movement !== nextPull.movement || pullDelta >= 0.008;
  }

  private resolveLegacyPlayTouchClientPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.game.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    return {
      x: ((clientX - rect.left) / width) * this.layout.width,
      y: ((clientY - rect.top) / height) * this.layout.height
    };
  }

  private legacyOverlayScrollRectToVisualRect(rect: LegacyOverlayScrollRect): VisualRect {
    return createVisualRect(rect.left, rect.top, rect.width, rect.height);
  }

  private isPointInVisualRect(rect: VisualRect | null, x: number, y: number, pad = 0): boolean {
    if (rect === null) {
      return false;
    }

    return x >= rect.left - pad
      && x <= rect.right + pad
      && y >= rect.top - pad
      && y <= rect.bottom + pad;
  }

  private resetLegacyOverlayScrollState(): void {
    this.overlayScrollOffset = 0;
    this.overlayScrollMax = 0;
    this.overlayScrollContentHeight = 0;
    this.overlayScrollTopFadeAlpha = 0;
    this.overlayScrollBottomFadeAlpha = 0;
    this.overlayScrollViewportBounds = null;
    this.overlayScrollTrackBounds = null;
    this.overlayScrollThumbBounds = null;
    this.releaseOverlayScrollPointer();
  }

  private releaseOverlayScrollPointer(): void {
    this.overlayScrollPointerId = null;
    this.overlayScrollPointerStartY = 0;
    this.overlayScrollPointerStartOffset = 0;
    this.overlayScrollPointerHasMoved = false;
  }

  private applyLegacyOverlayScrollMetrics(metrics: LegacyOverlayScrollMetrics): void {
    this.overlayScrollOffset = metrics.offset;
    this.overlayScrollMax = metrics.maxOffset;
    this.overlayScrollContentHeight = metrics.contentHeight;
    this.overlayScrollTopFadeAlpha = metrics.topFadeAlpha;
    this.overlayScrollBottomFadeAlpha = metrics.bottomFadeAlpha;
    this.overlayScrollViewportBounds = this.legacyOverlayScrollRectToVisualRect(metrics.viewport);
    this.overlayScrollTrackBounds = metrics.enabled
      ? this.legacyOverlayScrollRectToVisualRect(metrics.track)
      : null;
    this.overlayScrollThumbBounds = metrics.enabled
      ? this.legacyOverlayScrollRectToVisualRect(metrics.thumb)
      : null;
  }

  private setLegacyOverlayScrollOffset(offset: number): boolean {
    const nextOffset = clampLegacyOverlayScrollOffset(offset, this.overlayScrollMax);
    if (Math.abs(nextOffset - this.overlayScrollOffset) < 0.5) {
      return false;
    }

    this.overlayScrollOffset = nextOffset;
    this.uiDirty = true;
    this.publishInteractionDiagnostics(false);
    return true;
  }

  private handleOverlayScrollWheel(pointer: Phaser.Input.Pointer, deltaY: number): boolean {
    if (this.overlay === 'none' || this.overlayScrollMax <= 0) {
      return false;
    }
    if (!this.isPointInVisualRect(this.overlayScrollViewportBounds, pointer.x, pointer.y, 12)) {
      return false;
    }

    const wheelStep = Math.max(LEGACY_OVERLAY_SCROLL_WHEEL_STEP, Math.abs(deltaY) * 0.35);
    return this.setLegacyOverlayScrollOffset(this.overlayScrollOffset + (Math.sign(deltaY) * wheelStep));
  }

  private handleOverlayScrollPointerDown(pointer: Phaser.Input.Pointer): boolean {
    if (this.overlay === 'none' || this.overlayScrollMax <= 0) {
      return false;
    }
    const onViewport = this.isPointInVisualRect(this.overlayScrollViewportBounds, pointer.x, pointer.y, 0);
    const onRail = this.isPointInVisualRect(this.overlayScrollTrackBounds, pointer.x, pointer.y, 20);
    if (!onViewport && !onRail) {
      return false;
    }

    this.overlayScrollPointerId = this.normalizeLegacyPlayTouchPointerId(pointer.id) ?? -1;
    this.overlayScrollPointerStartY = pointer.y;
    this.overlayScrollPointerStartOffset = this.overlayScrollOffset;
    this.overlayScrollPointerHasMoved = false;
    return true;
  }

  private handleOverlayScrollPointerMove(pointer: Phaser.Input.Pointer): boolean {
    const pointerId = this.normalizeLegacyPlayTouchPointerId(pointer.id) ?? -1;
    if (this.overlayScrollPointerId === null || this.overlayScrollPointerId !== pointerId) {
      return false;
    }

    const deltaY = pointer.y - this.overlayScrollPointerStartY;
    if (!this.overlayScrollPointerHasMoved && Math.abs(deltaY) < LEGACY_OVERLAY_SCROLL_DRAG_START_PX) {
      return true;
    }

    this.overlayScrollPointerHasMoved = true;
    this.setLegacyOverlayScrollOffset(this.overlayScrollPointerStartOffset - deltaY);
    return true;
  }

  private handleOverlayScrollPointerUp(pointer: Phaser.Input.Pointer): boolean {
    const pointerId = this.normalizeLegacyPlayTouchPointerId(pointer.id) ?? -1;
    if (this.overlayScrollPointerId === null || this.overlayScrollPointerId !== pointerId) {
      return false;
    }

    this.releaseOverlayScrollPointer();
    return true;
  }

  private resolveLegacyPlayMovementDirection(event: KeyboardEvent): keyof LegacyPlayMoveFlags | null {
    const lower = event.key.toLowerCase();
    if (lower === 'w' || event.key === 'ArrowUp') {
      return 'up';
    }
    if (lower === 's' || event.key === 'ArrowDown') {
      return 'down';
    }
    if (lower === 'a' || event.key === 'ArrowLeft') {
      return 'left';
    }
    if (lower === 'd' || event.key === 'ArrowRight') {
      return 'right';
    }
    return null;
  }

  private handleLegacyPlayMovementKeyDown(event: KeyboardEvent): boolean {
    if (this.mode !== 'play' || this.overlay !== 'none') {
      return false;
    }

    const direction = this.resolveLegacyPlayMovementDirection(event);
    if (direction === null) {
      return false;
    }

    event.preventDefault();
    const action = resolveHumanKeyboardAction(event, this.time.now);
    if (
      action === null
      || !this.playKeyboardRepeatGate.accept(action, this.time.now, {
        moveRepeatMinIntervalMs: this.resolveLegacyPlayMovementSpeedProfile().repeatIntervalMs
      })
    ) {
      return true;
    }
    const wasHeld = this.playMoveFlags[direction];
    this.playMoveFlags[direction] = true;
    if (!wasHeld) {
      this.playDirectionalIntent.request([direction]);
    }
    if (!wasHeld) {
      this.boardDynamicDirty = true;
    }
    if (event.repeat) {
      this.resolveLegacyPlayInputBuffer();
    } else {
      this.scheduleLegacyPlayInputBuffer();
    }
    return true;
  }

  private handleLegacyPlayMovementKeyUp(event: KeyboardEvent): boolean {
    const direction = this.resolveLegacyPlayMovementDirection(event);
    if (direction === null) {
      return false;
    }

    event.preventDefault();
    const wasHeld = this.playMoveFlags[direction];
    if (wasHeld && this.playMoveTimer !== null) {
      this.resolveLegacyPlayInputBuffer();
    }
    this.playMoveFlags[direction] = false;
    this.synchronizeLegacyPlayDirectionalIntent();
    if (wasHeld) {
      this.boardDynamicDirty = true;
    }
    return true;
  }

  private handleLegacyPlayPointerDown(pointer: Phaser.Input.Pointer): boolean {
    if (this.handleLegacyPlayTouchControl(pointer.x, pointer.y, pointer.id)) {
      this.playPointerStart = null;
      return true;
    }

    this.playPointerStart = null;
    return false;
  }

  private handleLegacyPlayPointerMove(pointer: Phaser.Input.Pointer): boolean {
    return this.handleLegacyPlayTouchControlMove(pointer.x, pointer.y, pointer.id);
  }

  private handleLegacyPlayTouchControl(x: number, y: number, pointerId: number | null = null): boolean {
    if (this.mode !== 'play' || hasPendingLegacyResetRequest(this.pendingResetRequest)) {
      return false;
    }

    const touchControlLayout = this.resolveLegacyPlayTouchControlLayout();
    const control = resolveTouchControlKindAtPoint(
      touchControlLayout,
      x,
      y
    );
    const normalizedPointerId = this.normalizeLegacyPlayTouchPointerId(pointerId);
    if (touchControlLayout.controlMode === 'stick' && this.isLegacyPlayTouchStickPoint(touchControlLayout, x, y)) {
      if (this.overlay !== 'none') {
        return false;
      }

      this.resetLegacyPlayDirectionalInputBuffer();
      this.playTouchStickPointerId = normalizedPointerId;
      this.playHeldTouchMoves = [];
      this.clearLegacyPlayHeldTouchRepeat();
      this.playTouchStickPull = touchControlLayout.stick === null
        ? null
        : resolveStickPullVector(touchControlLayout.stick, x, y, {
          allowBeyondOuter: true
        });
      if (this.playTouchStickPull !== null) {
        this.setLegacyPlayHeldTouchMoveCandidates(this.playTouchStickPull.movementCandidates, pointerId, { keepWhenBlocked: true });
      } else {
        this.releaseLegacyPlayHeldTouchMove(pointerId);
        this.publishInteractionDiagnostics();
      }
      this.boardDynamicDirty = true;
      return true;
    }

    if (isMovementActionKind(control)) {
      if (this.overlay !== 'none') {
        return false;
      }

      this.resetLegacyPlayDirectionalInputBuffer();
      this.beginLegacyPlayHeldTouchMove(control, pointerId, { keepWhenBlocked: true });
      return true;
    }

    switch (control) {
      case 'pause':
        if (this.overlay === 'pause') {
          this.closeOverlay();
        } else if (this.overlay === 'none') {
          this.openOverlay('pause');
        } else {
          return false;
        }
        return true;
      case 'restart_attempt':
        return false;
      case 'toggle_thoughts':
        return false;
      case null:
        return false;
      default:
        return control satisfies never;
    }
  }

  private handleLegacyPlayTouchControlMove(x: number, y: number, pointerId: number | null = null): boolean {
    if (this.mode !== 'play' || this.overlay !== 'none' || hasPendingLegacyResetRequest(this.pendingResetRequest)) {
      return false;
    }

    const normalizedPointerId = this.normalizeLegacyPlayTouchPointerId(pointerId);
    if (this.playTouchStickPointerId !== normalizedPointerId) {
      return false;
    }

    const touchControlLayout = this.resolveLegacyPlayTouchControlLayout();
    if (touchControlLayout.controlMode !== 'stick' || touchControlLayout.stick === null) {
      this.releaseLegacyPlayTouchPointer(pointerId);
      return true;
    }

    const pullVector = resolveStickPullVector(touchControlLayout.stick, x, y, {
      allowBeyondOuter: true,
      previousIntentSegment: this.playTouchStickPull?.intentSegment ?? null
    });
    const pullChanged = this.hasLegacyPlayTouchStickPullChanged(pullVector);
    this.playTouchStickPull = pullVector;
    if (pullVector !== null && pullVector.movementCandidates.length > 0) {
      this.setLegacyPlayHeldTouchMoveCandidates(pullVector.movementCandidates, pointerId, {
        keepWhenBlocked: true,
        smoothRetarget: true
      });
    } else {
      this.releaseLegacyPlayHeldTouchMove(pointerId);
    }
    if (pullChanged) {
      this.hudDirty = true;
      this.publishInteractionDiagnostics(false);
    }
    return true;
  }

  private isLegacyPlayTouchStickPoint(
    touchControlLayout: ReturnType<typeof resolveTouchControlLayout>,
    x: number,
    y: number
  ): boolean {
    const stick = touchControlLayout.stick;
    if (stick === null) {
      return false;
    }

    return Math.hypot(x - stick.outer.centerX, y - stick.outer.centerY) <= stick.outer.width / 2;
  }

  private setLegacyPlayHeldTouchMoveCandidates(
    controls: readonly HumanMovementActionKind[],
    pointerId: number | null,
    options: { keepWhenBlocked?: boolean; smoothRetarget?: boolean } = {}
  ): boolean {
    const normalizedPointerId = this.normalizeLegacyPlayTouchPointerId(pointerId);
    const uniqueControls: HumanMovementActionKind[] = [];
    for (const control of controls) {
      if (!uniqueControls.includes(control)) {
        uniqueControls.push(control);
      }
      if (uniqueControls.length >= LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT) {
        break;
      }
    }

    if (uniqueControls.length === 0) {
      return this.releaseLegacyPlayHeldTouchMove(normalizedPointerId);
    }

    const existingForPointer = this.playHeldTouchMoves
      .filter((move) => move.pointerId === normalizedPointerId)
      .map((move) => move.control);
    const candidatesUnchanged = existingForPointer.length === uniqueControls.length
      && existingForPointer.every((control, index) => control === uniqueControls[index]);
    if (candidatesUnchanged) {
      return true;
    }

    const hadActiveMove = this.playHeldTouchMoves.length > 0;
    const remainingMoves = this.playHeldTouchMoves.filter((move) => move.pointerId !== normalizedPointerId);
    const availableCandidateSlots = Math.max(0, LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT - remainingMoves.length);
    const nextControls = uniqueControls.slice(0, availableCandidateSlots);
    if (nextControls.length === 0) {
      return false;
    }

    const nextMoves = nextControls.map((control): LegacyPlayHeldTouchMove => {
      this.playHeldTouchSequence += 1;
      return {
        control,
        pointerId: normalizedPointerId,
        sequence: this.playHeldTouchSequence
      };
    });
    this.playHeldTouchMoves = [...remainingMoves, ...nextMoves];
    this.sortLegacyPlayHeldTouchMoves();
    this.requestLegacyPlayDirectionalIntent(uniqueControls);
    this.boardDynamicDirty = true;

    if (options.smoothRetarget) {
      const currentDueAtMs = this.playHeldTouchRepeatDueAtMs;
      const rescheduleThresholdMs = LEGACY_PLAY_STICK_RETARGET_STEP_MS
        + LEGACY_PLAY_STICK_RETARGET_RESCHEDULE_GRACE_MS;
      if (
        this.playHeldTouchRepeatTimer === null
        || currentDueAtMs === null
        || currentDueAtMs - this.time.now > rescheduleThresholdMs
      ) {
        this.scheduleLegacyPlayHeldTouchRepeat(LEGACY_PLAY_STICK_RETARGET_STEP_MS);
      }
      this.publishInteractionDiagnostics();
      return true;
    }

    this.clearLegacyPlayHeldTouchRepeat();
    const moved = this.performLegacyPlayHeldTouchMove();
    if (moved) {
      this.scheduleLegacyPlayHeldTouchRepeat(this.resolveLegacyPlayHeldTouchDelay(hadActiveMove ? 'turn' : 'initial'));
    } else if (!options.keepWhenBlocked) {
      this.releaseLegacyPlayHeldTouchMove(normalizedPointerId);
      return false;
    } else if (!hadActiveMove) {
      this.scheduleLegacyPlayHeldTouchRepeat(this.resolveLegacyPlayHeldTouchDelay('repeat'));
    }

    this.publishInteractionDiagnostics();
    return true;
  }

  private beginLegacyPlayHeldTouchMove(
    control: HumanMovementActionKind,
    pointerId: number | null,
    options: { keepWhenBlocked?: boolean } = {}
  ): boolean {
    const normalizedPointerId = this.normalizeLegacyPlayTouchPointerId(pointerId);
    const hadActiveMove = this.playHeldTouchMoves.length > 0;
    const existingIndex = this.playHeldTouchMoves.findIndex((move) => move.pointerId === normalizedPointerId);
    let existingControlChanged = false;
    if (existingIndex >= 0) {
      existingControlChanged = this.playHeldTouchMoves[existingIndex]?.control !== control;
      this.playHeldTouchMoves[existingIndex] = {
        ...this.playHeldTouchMoves[existingIndex],
        control
      };
    } else {
      const sameControlIndex = this.playHeldTouchMoves.findIndex((move) => move.control === control);
      if (sameControlIndex >= 0) {
        const sameControlMove = this.playHeldTouchMoves[sameControlIndex];
        if (sameControlMove?.pointerId === null && normalizedPointerId !== null) {
          this.playHeldTouchMoves[sameControlIndex] = {
            ...sameControlMove,
            pointerId: normalizedPointerId
          };
        }
        this.boardDynamicDirty = true;
        this.publishInteractionDiagnostics();
        return true;
      }

      if (this.playHeldTouchMoves.length >= LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT) {
        return false;
      }

      this.playHeldTouchSequence += 1;
      this.playHeldTouchMoves.push({
        control,
        pointerId: normalizedPointerId,
        sequence: this.playHeldTouchSequence
      });
    }

    this.sortLegacyPlayHeldTouchMoves();
    this.requestLegacyPlayDirectionalIntent([control]);
    this.boardDynamicDirty = true;
    if (hadActiveMove && existingControlChanged) {
      this.clearLegacyPlayHeldTouchRepeat();
      const moved = this.performLegacyPlayHeldTouchMove();
      if (moved) {
        this.scheduleLegacyPlayHeldTouchRepeat(this.resolveLegacyPlayHeldTouchDelay('turn'));
      } else if (!options.keepWhenBlocked) {
        this.releaseLegacyPlayHeldTouchMove(normalizedPointerId);
        return false;
      }
      this.publishInteractionDiagnostics();
      return true;
    }

    if (hadActiveMove) {
      if (this.playHeldTouchRepeatTimer === null) {
        this.scheduleLegacyPlayHeldTouchRepeat(this.resolveLegacyPlayHeldTouchDelay('repeat'));
      }
      this.publishInteractionDiagnostics();
      return true;
    }

    this.clearLegacyPlayHeldTouchRepeat();
    const moved = this.performLegacyPlayHeldTouchMove();
    if (!moved) {
      if (options.keepWhenBlocked) {
        this.publishInteractionDiagnostics();
        return true;
      }
      this.releaseLegacyPlayHeldTouchMove(normalizedPointerId);
      return false;
    }

    if (moved) {
      this.scheduleLegacyPlayHeldTouchRepeat(this.resolveLegacyPlayHeldTouchDelay('initial'));
      this.publishInteractionDiagnostics();
    }
    return moved;
  }

  private releaseLegacyPlayHeldTouchMove(pointerId: number | null = null): boolean {
    if (this.playHeldTouchMoves.length === 0) {
      return false;
    }

    const normalizedPointerId = this.normalizeLegacyPlayTouchPointerId(pointerId);
    if (normalizedPointerId === null) {
      this.playHeldTouchMoves = [];
    } else {
      const nextMoves = this.playHeldTouchMoves.filter((move) => move.pointerId !== normalizedPointerId);
      if (nextMoves.length === this.playHeldTouchMoves.length) {
        return false;
      }
      this.playHeldTouchMoves = nextMoves;
    }

    if (this.playHeldTouchMoves.length === 0) {
      this.clearLegacyPlayHeldTouchRepeat();
    }
    this.synchronizeLegacyPlayDirectionalIntent();
    this.hudDirty = true;
    this.publishInteractionDiagnostics();
    return true;
  }

  private releaseLegacyPlayTouchPointer(pointerId: number | null = null): boolean {
    const normalizedPointerId = this.normalizeLegacyPlayTouchPointerId(pointerId);
    const releasedMove = this.releaseLegacyPlayHeldTouchMove(pointerId);
    const releasedStick = this.playTouchStickPointerId === normalizedPointerId;
    if (releasedStick) {
      this.playTouchStickPointerId = null;
      this.playTouchStickPull = null;
      this.boardDynamicDirty = true;
      this.publishInteractionDiagnostics();
    }

    return releasedMove || releasedStick;
  }

  private clearLegacyPlayHeldTouchRepeat(): void {
    this.playHeldTouchRepeatTimer?.remove(false);
    this.playHeldTouchRepeatTimer = null;
    this.playHeldTouchRepeatDueAtMs = null;
  }

  private scheduleLegacyPlayHeldTouchRepeat(delayMs: number): void {
    this.clearLegacyPlayHeldTouchRepeat();
    const normalizedDelayMs = Math.max(0, Math.round(delayMs));
    this.playHeldTouchRepeatDueAtMs = this.time.now + normalizedDelayMs;
    this.playHeldTouchRepeatTimer = this.time.delayedCall(normalizedDelayMs, () => {
      this.playHeldTouchRepeatTimer = null;
      this.playHeldTouchRepeatDueAtMs = null;
      this.repeatLegacyPlayHeldTouchMove();
    });
  }

  private resolveLegacyPlayHeldTouchDelay(kind: 'initial' | 'repeat' | 'turn'): number {
    const profile = this.resolveLegacyPlayMovementSpeedProfile();
    const stickActive = this.playTouchStickPointerId !== null;
    switch (kind) {
      case 'initial':
        return stickActive
          ? Math.min(profile.initialDelayMs, LEGACY_PLAY_STICK_INITIAL_DELAY_MAX_MS)
          : profile.initialDelayMs;
      case 'repeat':
        return stickActive
          ? Math.min(profile.repeatIntervalMs, LEGACY_PLAY_STICK_REPEAT_INTERVAL_MAX_MS)
          : profile.repeatIntervalMs;
      case 'turn':
        return stickActive
          ? Math.min(profile.turnDelayMs, LEGACY_PLAY_STICK_TURN_DELAY_MAX_MS)
          : profile.turnDelayMs;
      default:
        return kind satisfies never;
    }
  }

  private repeatLegacyPlayHeldTouchMove(): void {
    if (
      this.playHeldTouchMoves.length === 0
      || this.mode !== 'play'
      || this.overlay !== 'none'
      || hasPendingLegacyResetRequest(this.pendingResetRequest)
    ) {
      this.playHeldTouchMoves = [];
      this.playTouchStickPointerId = null;
      this.playTouchStickPull = null;
      this.clearLegacyPlayHeldTouchRepeat();
      this.publishInteractionDiagnostics();
      return;
    }

    const moved = this.performLegacyPlayHeldTouchMove();
    if (!moved) {
      if (this.playTouchStickPointerId !== null) {
        this.clearLegacyPlayHeldTouchRepeat();
        this.publishInteractionDiagnostics();
        return;
      }
      this.playHeldTouchMoves = [];
      this.playTouchStickPointerId = null;
      this.playTouchStickPull = null;
      this.clearLegacyPlayHeldTouchRepeat();
      this.publishInteractionDiagnostics();
      return;
    }

    this.scheduleLegacyPlayHeldTouchRepeat(this.resolveLegacyPlayHeldTouchDelay('repeat'));
    this.publishInteractionDiagnostics();
  }

  private resolveLegacyPlayMovementSpeedProfile() {
    const playerTrack = this.progressionState.tracks.player;
    return resolveLegacyMovementSpeedProfile(this.settings.movementSpeed, {
      completedCycles: playerTrack.completedCycles,
      level: playerTrack.level,
      paceScore: playerTrack.paceScore
    });
  }

  private normalizeLegacyPlayTouchPointerId(pointerId: number | null | undefined): number | null {
    return Number.isFinite(pointerId ?? NaN) ? Math.round(pointerId ?? 0) : null;
  }

  private sortLegacyPlayHeldTouchMoves(): void {
    this.playHeldTouchMoves.sort((left, right) => left.sequence - right.sequence);
  }

  private resolveLegacyPlayHeldTouchControl(): HumanMovementActionKind | null {
    return this.playHeldTouchMoves[0]?.control ?? null;
  }

  private resolveLegacyPlayActiveTouchControls(): HumanMovementActionKind[] {
    const activeControls: HumanMovementActionKind[] = [];
    const addActiveControl = (control: HumanMovementActionKind): void => {
      if (!activeControls.includes(control)) {
        activeControls.push(control);
      }
    };

    if (this.playMoveFlags.up) {
      addActiveControl('move_up');
    }
    if (this.playMoveFlags.right) {
      addActiveControl('move_right');
    }
    if (this.playMoveFlags.down) {
      addActiveControl('move_down');
    }
    if (this.playMoveFlags.left) {
      addActiveControl('move_left');
    }

    for (const move of this.playHeldTouchMoves) {
      addActiveControl(move.control);
    }

    return activeControls;
  }

  private resolveLegacyPlayActiveTouchControlSet(): Set<HumanMovementActionKind> {
    return new Set(this.resolveLegacyPlayActiveTouchControls());
  }

  private performLegacyPlayHeldTouchMove(): boolean {
    const candidates = this.resolveLegacyPlayStickIntentMoveCandidates()
      ?? resolveHumanMovementPriorityCandidates(
        this.playHeldTouchMoves.map((move) => move.control),
        LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT
      );
    this.requestLegacyPlayDirectionalIntent(candidates);
    return this.performLegacyPlayDirectionalIntentStep();
  }

  private resolveLegacyPlayCardinalDirections(
    controls: readonly HumanMovementActionKind[]
  ): LegacyCardinalDirection[] {
    const directions: LegacyCardinalDirection[] = [];
    for (const control of controls) {
      const vector = resolveHumanMovementActionVector(control);
      for (const direction of resolveLegacyCardinalDirectionsFromVector(vector.deltaX, vector.deltaY)) {
        if (!directions.includes(direction)) {
          directions.push(direction);
        }
        if (directions.length >= LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT) {
          return directions;
        }
      }
    }
    return directions;
  }

  private requestLegacyPlayDirectionalIntent(controls: readonly HumanMovementActionKind[]): void {
    this.playDirectionalIntent.request(this.resolveLegacyPlayCardinalDirections(controls));
  }

  private synchronizeLegacyPlayDirectionalIntent(): void {
    this.playDirectionalIntent.synchronize(
      this.resolveLegacyPlayCardinalDirections(this.resolveLegacyPlayActiveTouchControls())
    );
  }

  private performLegacyPlayDirectionalIntentStep(): boolean {
    const step = this.playDirectionalIntent.step(this.maze, this.player);
    if (!step.moved) {
      this.publishInteractionDiagnostics();
      return false;
    }
    return this.tryMovePlayer(step.deltaX, step.deltaY);
  }

  private resolveLegacyPlayStickIntentMoveCandidates(): HumanMovementActionKind[] | null {
    if (this.playTouchStickPointerId === null || this.playTouchStickPull === null) {
      return null;
    }

    const pullVector = this.playTouchStickPull;
    const axes: Array<{
      control: HumanMovementActionKind;
      deltaX: number;
      deltaY: number;
      magnitude: number;
    }> = [];
    const absoluteX = Math.abs(pullVector.normalizedX);
    const absoluteY = Math.abs(pullVector.normalizedY);
    if (absoluteX >= 0.08) {
      axes.push({
        control: pullVector.normalizedX > 0 ? 'move_right' : 'move_left',
        deltaX: pullVector.normalizedX > 0 ? 1 : -1,
        deltaY: 0,
        magnitude: absoluteX
      });
    }
    if (absoluteY >= 0.08) {
      axes.push({
        control: pullVector.normalizedY > 0 ? 'move_down' : 'move_up',
        deltaX: 0,
        deltaY: pullVector.normalizedY > 0 ? 1 : -1,
        magnitude: absoluteY
      });
    }

    const vectorOrderedControls = axes
      .sort((left, right) => right.magnitude - left.magnitude)
      .map((axis) => axis.control);
    const legalOrderedControls = axes
      .filter((axis) => resolveLegacyNavigationTarget(this.maze, this.player, axis.deltaX, axis.deltaY) !== null)
      .sort((left, right) => right.magnitude - left.magnitude)
      .map((axis) => axis.control);
    const candidateSource = legalOrderedControls.length > 0
      ? legalOrderedControls
      : vectorOrderedControls.length > 0
        ? vectorOrderedControls
        : pullVector.movementCandidates;

    return resolveHumanMovementPriorityCandidates(candidateSource, LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT);
  }

  private resolveLegacyPlayTouchControlLayout(): ReturnType<typeof resolveTouchControlLayout> {
    const boardBounds = this.resolveLegacyPlayBoardBounds();

    return resolveTouchControlLayout({
      width: this.layout.width,
      height: this.layout.height
    }, {
      compact: true,
      controlMode: this.settings.controlMode,
      placement: this.layout.width >= 720 && this.layout.height >= 600
        ? 'bottom-centered'
        : undefined,
      avoidRect: {
        left: boardBounds.left,
        top: boardBounds.top,
        width: boardBounds.right - boardBounds.left,
        height: boardBounds.bottom - boardBounds.top
      }
    });
  }

  private shouldRenderLegacyPlayTouchControls(
    touchControlLayout = this.resolveLegacyPlayTouchControlLayout()
  ): boolean {
    void touchControlLayout;
    return this.mode === 'play' && this.overlay === 'none';
  }

  private handleLegacyPlayPointerUp(pointer: Phaser.Input.Pointer): boolean {
    if (this.releaseLegacyPlayTouchPointer(pointer.id)) {
      return true;
    }

    if (this.playPointerStart === null) {
      return false;
    }
    if (!isSameLegacyPlayPointer(this.playPointerStart, pointer)) {
      return false;
    }

    const pointerStart = this.playPointerStart;
    this.playPointerStart = null;
    if (this.mode !== 'play' || this.overlay !== 'none' || hasPendingLegacyResetRequest(this.pendingResetRequest)) {
      return false;
    }

    const { deltaX, deltaY } = this.resolveLegacyPlayPointerMoveVector(pointerStart, {
      x: pointer.x,
      y: pointer.y
    });
    if (deltaX === 0 && deltaY === 0) {
      return false;
    }

    this.resetLegacyPlayInputBuffer();
    this.tryMovePlayerFromInput(deltaX, deltaY, { releaseAfterStep: true });
    return true;
  }

  private resolveLegacyPlayPointerMoveVector(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): { deltaX: number; deltaY: number } {
    const boardOffset = this.resolveBoardOffset();
    const boardBounds = this.resolveLegacyPlayBoardBounds();
    const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(
      this.layout.boardLeft + boardOffset.x,
      this.layout.boardTop + boardOffset.y,
      this.layout.boardSize
    );
    return resolveLegacyPointerMoveVector({
      boardBounds,
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
      playerScreenX: mazeRenderFrame.boardLeft + ((this.player.x + 0.5) * mazeRenderFrame.tileSize),
      playerScreenY: mazeRenderFrame.boardTop + ((this.player.y + 0.5) * mazeRenderFrame.tileSize),
      tileSize: mazeRenderFrame.tileSize
    });
  }

  private resolveLegacyPlayBoardBounds(): { bottom: number; left: number; right: number; top: number } {
    const boardOffset = this.resolveBoardOffset();
    return {
      bottom: this.layout.boardTop + boardOffset.y + this.layout.boardSize,
      left: this.layout.boardLeft + boardOffset.x,
      right: this.layout.boardLeft + boardOffset.x + this.layout.boardSize,
      top: this.layout.boardTop + boardOffset.y
    };
  }

  private scheduleLegacyPlayInputBuffer(): void {
    this.playMoveTimer?.remove(false);
    this.playMoveTimer = this.time.delayedCall(LEGACY_SIMULTANEOUS_KEY_PRESS_DELAY_MS, () => {
      this.playMoveTimer = null;
      this.resolveLegacyPlayInputBuffer();
    });
  }

  private resetLegacyPlayInputBuffer(): void {
    this.playMoveTimer?.remove(false);
    this.playMoveTimer = null;
    this.clearLegacyPlayHeldTouchRepeat();
    this.playHeldTouchMoves = [];
    this.playTouchStickPointerId = null;
    this.playTouchStickPull = null;
    this.playMoveFlags = createLegacyPlayMoveFlags();
    this.playKeyboardRepeatGate.reset();
    this.playDirectionalIntent.reset();
    this.playPointerStart = null;
  }

  private resetLegacyPlayDirectionalInputBuffer(): void {
    this.playMoveTimer?.remove(false);
    this.playMoveTimer = null;
    this.playMoveFlags = createLegacyPlayMoveFlags();
    this.playKeyboardRepeatGate.reset();
    this.playDirectionalIntent.reset();
    this.playPointerStart = null;
  }

  private handleLegacyPlayInputFocusLoss(): void {
    this.resetLegacyPlayInputBuffer();
  }

  private resolveLegacyPlayInputBuffer(): void {
    this.playMoveTimer?.remove(false);
    this.playMoveTimer = null;
    const { deltaX, deltaY } = resolveLegacyPlayMoveVector(this.playMoveFlags);
    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    this.tryMovePlayerFromInput(deltaX, deltaY);
  }

  private handleOverlayFieldInput(event: KeyboardEvent): boolean {
    if (this.activeInputField === null) {
      return false;
    }

    if (event.key === 'Enter') {
      this.commitOverlayField(this.activeInputField);
      return true;
    }

    if (event.key === 'Escape') {
      this.optionFieldDrafts = createLegacyOptionFieldDrafts(this.settings);
      this.activeInputField = null;
      this.uiDirty = true;
      return true;
    }

    if (event.key === 'Backspace') {
      const nextValue = this.optionFieldDrafts[this.activeInputField].slice(0, -1);
      this.optionFieldDrafts[this.activeInputField] = nextValue;
      this.uiDirty = true;
      return true;
    }

    if (!/^[0-9.-]$/.test(event.key)) {
      return false;
    }

    const currentValue = this.optionFieldDrafts[this.activeInputField];
    if (event.key === '-' && currentValue.includes('-')) {
      return true;
    }
    if (event.key === '.' && currentValue.includes('.')) {
      return true;
    }

    this.optionFieldDrafts[this.activeInputField] = `${currentValue}${event.key}`;
    this.uiDirty = true;
    return true;
  }

  private handleLegacyAuthFieldInput(event: KeyboardEvent): boolean {
    if (this.overlay !== 'auth' || this.activeAuthField === null) {
      return false;
    }

    if (event.key === 'Enter') {
      void this.handleLegacyAuthSubmit();
      return true;
    }

    if (event.key === 'Escape') {
      this.activeAuthField = null;
      this.uiDirty = true;
      return true;
    }

    if (event.key === 'Tab') {
      this.selectNextLegacyAuthField(event.shiftKey ? -1 : 1);
      return true;
    }

    if (event.key === 'Backspace') {
      this.updateLegacyAuthFieldDraft(this.activeAuthField, (value) => value.slice(0, -1));
      return true;
    }

    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }

    this.updateLegacyAuthFieldDraft(this.activeAuthField, (value) => `${value}${event.key}`);
    return true;
  }

  private refreshLayout(): void {
    const viewportGeometry = readMazerViewportGeometry();
    const width = viewportGeometry.content.width;
    const height = viewportGeometry.content.height;
    const backingResolution = resolveMazerCanvasBackingResolution({
      canvasCssHeight: height,
      canvasCssWidth: width
    });
    const canvasRenderer = this.game.renderer as {
      gameContext?: CanvasRenderingContext2D;
      height?: number;
      resize?: (width: number, height: number) => void;
      width?: number;
    };
    applyMazerCanvasBackingResolution({
      ...backingResolution,
      canvas: this.game.canvas,
      context: canvasRenderer.gameContext ?? this.game.canvas.getContext('2d'),
      renderer: canvasRenderer
    });
    const layoutSurface = this.mode === 'play' ? 'play' : 'menu';
    this.layout = resolveLegacyMenuLayout(
      width,
      height,
      this.settings.scale + this.settings.camScale,
      this.maze.size,
      layoutSurface
    );
    this.footerText.setPosition(this.layout.width / 2, this.layout.footerY);

    this.boardStaticDirty = true;
    this.boardPathDirty = true;
    this.boardDynamicDirty = true;
    this.backdropDirty = true;
    this.uiDirty = true;
  }

  private applyGenerationRequest(request: LegacyGenerationRequest, nextDemoMoveAtMs = 0): void {
    const generationState = consumeLegacyGenerationRequestState(request, request.budget.scale);
    this.mode = request.mode;
    this.mazeSeed = request.seed;
    this.maze = generationState.maze;
    this.resetLegacyWorldTurnHost();
    this.titleGraphics.setVisible(generationState.titleVisible);
    this.menuDemoEpisode = this.mode === 'menu' ? createLegacyDemoWalkerEpisode(this.maze) : null;
    if (this.mode === 'menu') {
      const bootstrap = createLegacyMenuDemoBootstrap(this.maze, this.settings.toggleTrailFade, TRAIL_FADE_TAIL);
      this.menuDemoEpisode = bootstrap.episode;
      this.menuDemoConfig = bootstrap.config;
      this.menuDemoState = bootstrap.state;
      this.player = bootstrap.player;
      this.syncLegacyPlayerVisualMotionTo(bootstrap.player);
      this.trail = bootstrap.trail;
      this.menuDemoCycleStartedAtMs = this.time.now;
      this.menuDemoCycleRecorded = false;
      this.playCyclePath = [];
      this.playCycleResetUsed = false;
    } else {
      this.menuDemoConfig = createLegacyMenuDemoWalkerConfig(this.maze.seed);
      this.menuDemoState = null;
      this.player = generationState.initialPlayer;
      this.syncLegacyPlayerVisualMotionTo(generationState.initialPlayer);
      this.trail = generationState.initialTrail;
      this.playCyclePath = generationState.initialTrail.map(copyPoint);
      this.playCycleResetUsed = false;
      this.startLegacyPlayCompassSpin(this.time.now);
    }
    this.nextDemoMoveAtMs = nextDemoMoveAtMs;
    this.optionFieldDrafts = createLegacyOptionFieldDrafts(this.settings);
    this.activeInputField = null;
    this.refreshLayout();
    this.boardStaticDirty = true;
    this.boardPathDirty = true;
    this.boardDynamicDirty = true;
    this.uiDirty = true;
    this.armLegacyMenuStaticDrawStage();
    if (this.mode === 'menu') {
      this.nextDemoMoveAtMs = Math.max(this.nextDemoMoveAtMs, this.resolveLegacyMenuStaticDrawDemoGateAtMs());
    } else if (generationState.startsPlayTimer) {
      this.playStartedAtMs = Math.max(this.time.now, this.resolveLegacyMenuStaticDrawDemoGateAtMs());
    }
  }

  private shouldDelayLegacyMenuDeconstructRebuild(request: LegacyGenerationRequest, time: number): boolean {
    if (
      !this.isLegacyDeconstructGenerationReason(request.reason)
      || request.mode !== this.mode
      || this.menuStaticDrawLifecyclePhase !== 'deconstructing'
    ) {
      return false;
    }

    if (!this.isLegacyMenuDeconstructVisualHandoffReady() || this.menuStaticDeconstructZeroHoldStartedAtMs === null) {
      return true;
    }

    return time < this.resolveLegacyMenuDeconstructHandoffEndsAtMs();
  }

  private rebuildMaze(nextDemoMoveAtMs = 0): void {
    const mode = this.mode;
    const seedOverride = mode === 'play'
      ? this.createFreshLegacyPlayGenerationSeed()
      : undefined;
    this.applyGenerationRequest(
        createLegacyGenerationRequest({
          currentSeed: this.mazeSeed,
          dueAtMs: this.time.now,
          generationProfile: this.resolveLegacyMazeGenerationProfileForMode(mode),
          mode,
          queuedAtMs: this.time.now,
          reason: mode === 'play' ? 'play-start' : 'boot-menu',
          scale: this.resolveLegacyProgressionScaleForMode(mode),
          seedOverride,
          targetComplexity: this.resolveLegacyTargetComplexityForMode(mode)
        }),
      nextDemoMoveAtMs
    );
  }

  private refreshRuntimeMazeSeedIfUnpinned(): void {
    if (this.explicitRuntimeMazeSeed) {
      return;
    }

    this.mazeSeed = createLegacyRuntimeRandomSeed({
      nowMs: this.time.now,
      previousSeed: this.mazeSeed
    });
  }

  private createFreshLegacyPlayGenerationSeed(): number {
    const playerTrack = this.progressionState.tracks.player;
    const progressionSalt = (
      (playerTrack.targetComplexity * 1009)
      + (playerTrack.completedCycles * 9176)
      + (playerTrack.level * 313)
      + (playerTrack.paceScore * 37)
    );
    const seed = createLegacyRuntimeRandomSeed({
      nowMs: Math.round(this.time.now + progressionSalt),
      previousSeed: this.mazeSeed
    });

    return seed === this.mazeSeed || seed === playerTrack.lastMazeSeed
      ? createLegacyRuntimeRandomSeed({
        nowMs: Math.round(this.time.now + progressionSalt + 1),
        previousSeed: stepLegacyGenerationSeed(this.mazeSeed)
      })
      : seed;
  }

  private createFreshLegacyMenuGenerationSeed(): number {
    const aiTrack = this.progressionState.tracks['ai-runner'];
    const progressionSalt = (
      (aiTrack.targetComplexity * 1151)
      + (aiTrack.completedCycles * 7219)
      + (aiTrack.level * 433)
      + (aiTrack.paceScore * 41)
    );
    const seed = createLegacyRuntimeRandomSeed({
      nowMs: Math.round(this.time.now + progressionSalt),
      previousSeed: this.mazeSeed
    });

    return seed === this.mazeSeed || seed === aiTrack.lastMazeSeed
      ? createLegacyRuntimeRandomSeed({
        nowMs: Math.round(this.time.now + progressionSalt + 1),
        previousSeed: stepLegacyGenerationSeed(this.mazeSeed)
      })
      : seed;
  }

  private queueGenerationRequest(
    reason: LegacyGenerationRequest['reason'],
    delayMs = 0,
    options: {
      mode?: RuntimeMode;
      seedOverride?: number;
      stepSeed?: boolean;
    } = {}
  ): void {
    const mode = options.mode ?? this.mode;
    this.pendingGenerationRequest = createLegacyGenerationRequest({
      currentSeed: this.mazeSeed,
      dueAtMs: this.time.now + Math.max(0, delayMs),
      generationProfile: this.resolveLegacyMazeGenerationProfileForMode(mode),
      mode,
      queuedAtMs: this.time.now,
      reason,
      scale: this.resolveLegacyProgressionScaleForMode(mode),
      seedOverride: options.seedOverride,
      stepSeed: options.stepSeed === true,
      targetComplexity: this.resolveLegacyTargetComplexityForMode(mode)
    });
  }

  private resolveLegacyMenuStaticDrawStage(): RuntimeGenerationStage | null {
    return this.maze.generation?.executionPlan.find((stage) => stage.id === 6) ?? null;
  }

  private resolveLegacyMenuStaticDrawRowsVisibleForDiagnostics(): number | null {
    const drawStage = this.resolveLegacyMenuStaticDrawStage();
    if (drawStage?.executionKind !== 'row-slice') {
      return null;
    }

    return this.menuStaticDrawRowsVisible ?? this.maze.size;
  }

  private resolveLegacyMenuStaticDrawTilesVisibleForDiagnostics(): number | null {
    if (this.menuStaticDrawTileOrder.length <= 0) {
      return null;
    }

    return this.menuStaticDrawTilesVisible ?? this.menuStaticDrawTileOrder.length;
  }

  private resolveLegacyMenuStaticDrawRowLimit(): number | null {
    return this.menuStaticDrawRowsVisible !== null
      ? this.menuStaticDrawRowsVisible
      : null;
  }

  private resolveLegacyMenuStaticDrawTileLimit(): number | null {
    return this.menuStaticDrawTilesVisible !== null
      ? this.menuStaticDrawTilesVisible
      : null;
  }

  private isLegacyMenuPointVisibleInStaticDraw(point: LegacyPoint): boolean {
    const tileLimit = this.resolveLegacyMenuStaticDrawTileLimit();
    if (tileLimit !== null) {
      return this.menuStaticDrawVisibleTileKeys.has(legacyScenePointKey(point));
    }

    const rowLimit = this.resolveLegacyMenuStaticDrawRowLimit();
    return rowLimit === null || point.y < rowLimit;
  }

  private buildLegacyMenuStaticDrawTileOrder(): LegacyPoint[] {
    return buildLegacyMazeRevealOrder(this.maze);
  }

  private resolveLegacyMenuStaticDrawDemoGateAtMs(): number {
    const drawStage = this.resolveLegacyMenuStaticDrawStage();
    if (drawStage?.executionKind !== 'row-slice') {
      return this.time.now;
    }

    const batchSize = Math.max(1, this.resolveLegacyMenuStaticDrawTileBatchSize());
    const tileTicks = Math.ceil(Math.max(1, this.menuStaticDrawTileOrder.length) / batchSize);
    return this.time.now + (tileTicks * LEGACY_MENU_STATIC_DRAW_TILE_STEP_MS) + LEGACY_MENU_STATIC_DRAW_SETTLE_MS;
  }

  private releaseLegacyMenuDemoGateOnStaticDrawSettled(time: number): void {
    if (this.mode !== 'menu' || !this.menuDemoState || this.menuDemoState.pathCursor > 0) {
      return;
    }

    this.nextDemoMoveAtMs = Math.min(this.nextDemoMoveAtMs, time);
    this.menuDemoCycleStartedAtMs = time;
    this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
  }

  private resolveLegacyMenuStaticDeconstructDurationMs(): number {
    const batchSize = Math.max(1, this.resolveLegacyMenuStaticDrawTileBatchSize());
    const tileTicks = Math.ceil(Math.max(1, this.menuStaticDrawTileOrder.length) / batchSize);
    return LEGACY_MENU_STATIC_DECONSTRUCT_HOLD_MS
      + LEGACY_MENU_DECONSTRUCT_PLAYER_REMOVE_MS
      + LEGACY_MENU_DECONSTRUCT_TRAIL_FADE_MS
      + (tileTicks * LEGACY_MENU_STATIC_DECONSTRUCT_TILE_STEP_MS);
  }

  private resolveLegacyMenuStaticDeconstructTileStartAtMs(time: number): number {
    return time
      + LEGACY_MENU_STATIC_DECONSTRUCT_HOLD_MS
      + LEGACY_MENU_DECONSTRUCT_PLAYER_REMOVE_MS
      + LEGACY_MENU_DECONSTRUCT_TRAIL_FADE_MS;
  }

  private resolveLegacyMenuDeconstructTrailAlpha(time: number): number {
    if (this.menuStaticDrawLifecyclePhase !== 'deconstructing' || this.menuStaticDeconstructStartedAtMs === null) {
      return 1;
    }

    const fadeElapsedMs = time
      - this.menuStaticDeconstructStartedAtMs
      - LEGACY_MENU_STATIC_DECONSTRUCT_HOLD_MS
      - LEGACY_MENU_DECONSTRUCT_PLAYER_REMOVE_MS;
    if (fadeElapsedMs <= 0) {
      return 1;
    }

    return clamp(1 - (fadeElapsedMs / LEGACY_MENU_DECONSTRUCT_TRAIL_FADE_MS), 0, 1);
  }

  private resolveLegacyMenuDeconstructPlayerAlpha(time: number): number {
    if (this.menuStaticDrawLifecyclePhase !== 'deconstructing' || this.menuStaticDeconstructStartedAtMs === null) {
      return 1;
    }

    const removeElapsedMs = time
      - this.menuStaticDeconstructStartedAtMs
      - LEGACY_MENU_STATIC_DECONSTRUCT_HOLD_MS;
    if (removeElapsedMs <= 0) {
      return 1;
    }

    return clamp(1 - (removeElapsedMs / LEGACY_MENU_DECONSTRUCT_PLAYER_REMOVE_MS), 0, 1);
  }

  private resolveLegacyMenuDeconstructHandoffProgress(time: number): number {
    if (
      this.menuStaticDrawLifecyclePhase !== 'deconstructing'
      || !this.isLegacyMenuDeconstructVisualHandoffReady()
      || this.menuStaticDeconstructZeroHoldStartedAtMs === null
      || !this.isLegacyDeconstructGenerationReason(this.pendingGenerationRequest?.reason ?? null)
    ) {
      return 0;
    }

    const remainingMs = Math.max(0, this.resolveLegacyMenuDeconstructHandoffEndsAtMs() - time);
    return clamp(
      1 - (remainingMs / LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS),
      0,
      1
    );
  }

  private resolveLegacyMenuDeconstructHandoffEndsAtMs(): number {
    const holdStartedAtMs = this.menuStaticDeconstructZeroHoldStartedAtMs ?? this.time.now;
    const pendingRequest = this.pendingGenerationRequest;
    const pendingDueAtMs = pendingRequest !== null && this.isLegacyDeconstructGenerationReason(pendingRequest.reason)
      ? pendingRequest.dueAtMs
      : 0;

    return Math.max(
      pendingDueAtMs,
      holdStartedAtMs + LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS
    );
  }

  private isLegacyMenuDeconstructHandoffActive(time: number): boolean {
    return this.menuStaticDrawLifecyclePhase === 'deconstructing'
      && this.isLegacyMenuDeconstructVisualHandoffReady()
      && this.menuStaticDeconstructZeroHoldStartedAtMs !== null
      && this.isLegacyDeconstructGenerationReason(this.pendingGenerationRequest?.reason ?? null)
      && time < this.resolveLegacyMenuDeconstructHandoffEndsAtMs();
  }

  private isLegacyMenuDeconstructVisualHandoffReady(): boolean {
    return this.menuStaticDrawTilesVisible === 0
      && this.resolveLegacyMenuPathTitleVisiblePieceCount() === 0;
  }

  private deferLegacyMenuDeconstructRebuildUntil(dueAtMs: number): void {
    const pendingRequest = this.pendingGenerationRequest;
    if (pendingRequest === null || !this.isLegacyDeconstructGenerationReason(pendingRequest.reason)) {
      return;
    }

    if (pendingRequest.dueAtMs >= dueAtMs) {
      return;
    }

    this.pendingGenerationRequest = {
      ...pendingRequest,
      dueAtMs
    };
  }

  private resolveLegacyMenuBuildPrerollProgress(time: number): number {
    if (
      this.menuStaticDrawLifecyclePhase !== 'building'
      || this.menuStaticBuildPrerollStartedAtMs === null
    ) {
      return 0;
    }

    return clamp(
      (time - this.menuStaticBuildPrerollStartedAtMs) / LEGACY_MENU_STATIC_BUILD_PREROLL_BURST_MS,
      0,
      1
    );
  }

  private isLegacyMenuBuildPrerollActive(time: number): boolean {
    const progress = this.resolveLegacyMenuBuildPrerollProgress(time);
    return progress > 0 && progress < 1;
  }

  private isLegacyMenuHandoffAnimationActive(time: number): boolean {
    return this.isLegacyMenuBuildPrerollActive(time) || this.isLegacyMenuDeconstructHandoffActive(time);
  }

  private resolveLegacyMenuStaticDrawTileBatchSize(): number {
    const targetTicks = this.mode === 'play'
      ? LEGACY_PLAY_STATIC_DRAW_TARGET_TICKS
      : LEGACY_MENU_STATIC_DRAW_TARGET_TICKS;
    return Math.max(1, Math.ceil(this.menuStaticDrawTileOrder.length / targetTicks));
  }

  private refreshLegacyMenuStaticDrawVisibleTileKeys(): void {
    this.menuStaticDrawVisibleTileKeys.clear();
    const visibleCount = this.menuStaticDrawTilesVisible ?? this.menuStaticDrawTileOrder.length;
    for (let index = 0; index < Math.min(visibleCount, this.menuStaticDrawTileOrder.length); index += 1) {
      const point = this.menuStaticDrawTileOrder[index];
      if (point) {
        this.menuStaticDrawVisibleTileKeys.add(legacyScenePointKey(point));
      }
    }
  }

  private armLegacyMenuStaticDrawStage(): void {
    const drawStage = this.resolveLegacyMenuStaticDrawStage();
    if (drawStage?.executionKind === 'row-slice') {
      const buildPrerollStartedAtMs = this.time.now - 1;
      this.menuStaticDrawLifecyclePhase = 'building';
      this.menuStaticDeconstructStartedAtMs = null;
      this.menuStaticDeconstructZeroHoldStartedAtMs = null;
      this.menuStaticBuildPrerollStartedAtMs = buildPrerollStartedAtMs;
      this.menuStaticDrawRowsVisible = 0;
      this.menuStaticDrawNextRowAtMs = buildPrerollStartedAtMs + LEGACY_MENU_STATIC_BUILD_PREROLL_BURST_MS;
      this.menuStaticDrawTileOrder = this.buildLegacyMenuStaticDrawTileOrder();
      this.menuStaticDrawTilesVisible = 0;
      this.menuStaticDrawNextTileAtMs = buildPrerollStartedAtMs + LEGACY_MENU_STATIC_BUILD_PREROLL_BURST_MS;
      this.refreshLegacyMenuStaticDrawVisibleTileKeys();
      this.titleGraphics.clear();
      return;
    }

    this.menuStaticDrawLifecyclePhase = 'idle';
    this.menuStaticDrawRowsVisible = null;
    this.menuStaticDrawNextRowAtMs = 0;
    this.menuStaticDrawTileOrder = [];
    this.menuStaticDrawVisibleTileKeys.clear();
    this.menuStaticDrawTilesVisible = null;
    this.menuStaticDrawNextTileAtMs = 0;
    this.menuStaticDeconstructStartedAtMs = null;
    this.menuStaticDeconstructZeroHoldStartedAtMs = null;
    this.menuStaticBuildPrerollStartedAtMs = null;
  }

  private armLegacyMenuStaticDeconstructStage(time: number): void {
    if (this.menuStaticDrawLifecyclePhase === 'deconstructing') {
      return;
    }

    if (this.menuStaticDrawTileOrder.length <= 0) {
      this.menuStaticDrawTileOrder = this.buildLegacyMenuStaticDrawTileOrder();
    }

    this.menuStaticDrawLifecyclePhase = 'deconstructing';
    this.menuStaticDeconstructStartedAtMs = time;
    this.menuStaticDeconstructZeroHoldStartedAtMs = null;
    this.menuStaticBuildPrerollStartedAtMs = null;
    this.menuStaticDrawRowsVisible = null;
    this.menuStaticDrawNextRowAtMs = 0;
    this.menuStaticDrawTilesVisible = this.menuStaticDrawTileOrder.length;
    this.refreshLegacyMenuStaticDrawVisibleTileKeys();
    this.menuStaticDrawNextTileAtMs = this.resolveLegacyMenuStaticDeconstructTileStartAtMs(time);
    this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    if (this.mode === 'play') {
      this.pendingGenerationRequest = createLegacyPlayResetGenerationRequest({
        currentSeed: this.mazeSeed,
        generationProfile: this.resolveLegacyMazeGenerationProfileForMode('play'),
        nowMs: time + this.resolveLegacyMenuStaticDeconstructDurationMs() + LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS,
        seedOverride: this.createFreshLegacyPlayGenerationSeed(),
        scale: this.resolveLegacyProgressionScaleForMode('play'),
        targetComplexity: this.resolveLegacyTargetComplexityForMode('play')
      });
    } else {
      this.queueGenerationRequest(
        'menu-demo-goal-reset',
        this.resolveLegacyMenuStaticDeconstructDurationMs() + LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS,
        {
          mode: 'menu',
          seedOverride: this.createFreshLegacyMenuGenerationSeed(),
          stepSeed: true
        }
      );
    }
    this.boardPathDirty = true;
    this.boardDynamicDirty = true;
  }

  private isLegacyDeconstructGenerationReason(
    reason: LegacyGenerationRequest['reason'] | null
  ): boolean {
    return reason === 'menu-demo-goal-reset' || reason === 'play-goal-reset';
  }

  private shouldStartLegacyMenuDeconstructOnGoalArrival(nextFrame: LegacyMenuDemoAdvance): boolean {
    return this.mode === 'menu'
      && this.maze.source !== 'menu-snapshot'
      && this.menuStaticDrawLifecyclePhase === 'settled'
      && nextFrame.state.reachedGoal === true
      && nextFrame.state.phase === 'goal-hold';
  }

  private advanceLegacyMenuStaticDrawStage(time: number): void {
    if (this.menuStaticDrawRowsVisible === null && this.menuStaticDrawTilesVisible === null) {
      return;
    }

    if (
      this.menuStaticDrawLifecyclePhase === 'building'
      && this.menuStaticBuildPrerollStartedAtMs !== null
      && time >= this.menuStaticBuildPrerollStartedAtMs + LEGACY_MENU_STATIC_BUILD_PREROLL_BURST_MS
    ) {
      this.menuStaticBuildPrerollStartedAtMs = null;
      this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
      this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    }

    const drawStage = this.resolveLegacyMenuStaticDrawStage();
    const batchSize = Math.max(1, drawStage?.batchSize ?? 1);
    if (
      this.menuStaticDrawLifecyclePhase === 'building'
      && this.menuStaticDrawRowsVisible !== null
      && time >= this.menuStaticDrawNextRowAtMs
    ) {
      this.menuStaticDrawRowsVisible = Math.min(this.maze.size, this.menuStaticDrawRowsVisible + batchSize);
      this.menuStaticDrawNextRowAtMs = time + LEGACY_MENU_STATIC_DRAW_ROW_STEP_MS;
      this.boardPathDirty = true;
      this.boardDynamicDirty = true;
      if (this.menuStaticDrawRowsVisible >= this.maze.size) {
        this.menuStaticDrawRowsVisible = null;
        this.menuStaticDrawNextRowAtMs = 0;
      }
    }

    if (this.menuStaticDrawTilesVisible !== null && time >= this.menuStaticDrawNextTileAtMs) {
      if (this.menuStaticDrawLifecyclePhase === 'deconstructing') {
        this.menuStaticDrawTilesVisible = Math.max(
          0,
          this.menuStaticDrawTilesVisible - this.resolveLegacyMenuStaticDrawTileBatchSize()
        );
        this.refreshLegacyMenuStaticDrawVisibleTileKeys();
        this.menuStaticDrawNextTileAtMs = time + LEGACY_MENU_STATIC_DECONSTRUCT_TILE_STEP_MS;
        this.boardPathDirty = true;
        this.boardDynamicDirty = true;
        if (this.menuStaticDrawTilesVisible <= 0) {
          this.menuStaticDrawTilesVisible = 0;
          this.menuStaticDrawNextTileAtMs = Number.POSITIVE_INFINITY;
          this.drawLegacyMenuPathTitle(time);
          if (this.menuStaticDeconstructZeroHoldStartedAtMs === null) {
            this.menuStaticDeconstructZeroHoldStartedAtMs = time;
          }
          this.deferLegacyMenuDeconstructRebuildUntil(
            this.menuStaticDeconstructZeroHoldStartedAtMs + LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS
          );
          this.refreshLegacyMenuStaticDrawVisibleTileKeys();
          this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
          this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
        }
        return;
      }

      this.menuStaticDrawTilesVisible = Math.min(
        this.menuStaticDrawTileOrder.length,
        this.menuStaticDrawTilesVisible + this.resolveLegacyMenuStaticDrawTileBatchSize()
      );
      this.refreshLegacyMenuStaticDrawVisibleTileKeys();
      this.menuStaticDrawNextTileAtMs = time + LEGACY_MENU_STATIC_DRAW_TILE_STEP_MS;
      this.boardPathDirty = true;
      this.boardDynamicDirty = true;
      if (this.menuStaticDrawTilesVisible >= this.menuStaticDrawTileOrder.length) {
        this.menuStaticDrawTilesVisible = null;
        this.menuStaticDrawNextTileAtMs = 0;
        this.menuStaticDrawLifecyclePhase = 'settled';
        this.menuStaticDeconstructStartedAtMs = null;
        this.menuStaticBuildPrerollStartedAtMs = null;
        this.refreshLegacyMenuStaticDrawVisibleTileKeys();
        this.releaseLegacyMenuDemoGateOnStaticDrawSettled(time);
      }
    }
  }

  private enterMenuMode(): void {
    this.resetLegacyPlayInputBuffer();
    this.mode = 'menu';
    this.pendingOverlayMazeRebuild = false;
    this.pendingResetRequest = null;
    this.overlay = 'none';
    this.overlayReturn = 'none';
    this.refreshRuntimeMazeSeedIfUnpinned();
    this.applyGenerationRequest(
      createLegacyGenerationRequest({
        currentSeed: this.mazeSeed,
        dueAtMs: this.time.now,
        generationProfile: this.resolveLegacyMazeGenerationProfileForMode('menu'),
        mode: 'menu',
        queuedAtMs: this.time.now,
        reason: 'menu-return',
        scale: this.resolveLegacyProgressionScaleForMode('menu'),
        targetComplexity: this.resolveLegacyTargetComplexityForMode('menu')
      }),
      this.time.now + INITIAL_MENU_DEMO_HOLD_MS
    );
  }

  private startPlayMode(): void {
    this.resetLegacyPlayInputBuffer();
    this.mode = 'play';
    this.pendingOverlayMazeRebuild = false;
    this.pendingResetRequest = null;
    this.overlay = 'none';
    this.overlayReturn = 'none';
    this.refreshRuntimeMazeSeedIfUnpinned();
    this.rebuildMaze();
    this.boardStaticDirty = true;
    this.boardPathDirty = true;
    this.boardDynamicDirty = true;
    this.uiDirty = true;
  }

  private updateMenuDemo(time: number): void {
    if (
      this.menuStaticDrawLifecyclePhase !== 'settled'
      || this.menuStaticDrawRowsVisible !== null
      || this.menuStaticDrawTilesVisible !== null
    ) {
      return;
    }
    if (time < this.nextDemoMoveAtMs) {
      return;
    }

    if (!this.menuDemoEpisode || !this.menuDemoState) {
      this.queueGenerationRequest('menu-demo-missing-episode', 0, { stepSeed: true });
      return;
    }

    const nextFrame = advanceLegacyMenuDemoFrame(
      this.menuDemoEpisode,
      this.menuDemoState,
      this.menuDemoConfig,
      this.settings.toggleTrailFade,
      TRAIL_FADE_TAIL
    );
    if (nextFrame.shouldRegenerateMaze) {
      this.menuDemoState = nextFrame.state;
      this.nextDemoMoveAtMs = time + nextFrame.delayMs;
      this.recordMazeCycleCompletion('menu-demo');
      this.armLegacyMenuStaticDeconstructStage(time);
      this.boardDynamicDirty = true;
      return;
    }

    this.menuDemoState = nextFrame.state;
    const previousPlayer = copyPoint(this.player);
    this.player = nextFrame.player;
    this.armLegacyPlayerVisualMotion(
      previousPlayer,
      nextFrame.player,
      time,
      Math.min(LEGACY_MENU_PLAYER_VISUAL_MOVE_MS, Math.max(80, nextFrame.delayMs * 0.72))
    );
    this.trail = nextFrame.trail;
    this.nextDemoMoveAtMs = time + nextFrame.delayMs;
    if (this.shouldStartLegacyMenuDeconstructOnGoalArrival(nextFrame)) {
      this.nextDemoMoveAtMs = time;
      this.recordMazeCycleCompletion('menu-demo');
      this.armLegacyMenuStaticDeconstructStage(time);
      this.boardDynamicDirty = true;
      return;
    }
    this.boardDynamicDirty = true;
  }

  private isLegacyPlayLifecycleInputLocked(): boolean {
    return hasPendingLegacyResetRequest(this.pendingResetRequest)
      || this.pendingGenerationRequest !== null
      || this.menuStaticDrawLifecyclePhase === 'building'
      || this.menuStaticDrawLifecyclePhase === 'deconstructing'
      || this.menuStaticDrawRowsVisible !== null
      || this.menuStaticDrawTilesVisible !== null;
  }

  private resolveLegacyPlayLifecycleDiagnostics(time: number): LegacyPlayLifecycleSnapshot {
    return resolveLegacyPlayLifecycleSnapshot({
      drawPhase: this.menuStaticDrawLifecyclePhase,
      generationPending: this.pendingGenerationRequest !== null,
      handoffActive: this.isLegacyMenuDeconstructHandoffActive(time),
      mode: this.mode,
      nextSeedQueued: this.isLegacyDeconstructGenerationReason(this.pendingGenerationRequest?.reason ?? null),
      overlayOpen: this.overlay !== 'none',
      playerAlpha: this.resolveLegacyMenuDeconstructPlayerAlpha(time),
      resetPending: hasPendingLegacyResetRequest(this.pendingResetRequest),
      stagedBuildVisible: this.menuStaticDrawRowsVisible !== null || this.menuStaticDrawTilesVisible !== null,
      timerStarted: this.mode === 'play' && time >= this.playStartedAtMs,
      trailAlpha: this.resolveLegacyMenuDeconstructTrailAlpha(time),
      trailLength: this.trail.length
    });
  }

  private resolveLegacyPlayLifecycleDiagnosticsSignature(time: number): string {
    const lifecycle = this.resolveLegacyPlayLifecycleDiagnostics(time);
    return [
      lifecycle.phase,
      lifecycle.drawPhase,
      lifecycle.inputLocked ? 'locked' : 'open',
      lifecycle.nextSeedQueued ? 'seed' : 'no-seed',
      lifecycle.timerRunning ? 'timer' : 'no-timer',
      lifecycle.playerVisible ? 'player' : 'no-player',
      lifecycle.trailVisible ? 'trail' : 'no-trail'
    ].join(':');
  }

  private createLegacyWorldTurnHost(): WorldTurnHost {
    return new WorldTurnHost({
      'player-movement': (): WorldTurnPhaseResult => this.applyLegacyWorldTurnPlayerMovement()
    });
  }

  private resetLegacyWorldTurnHost(): void {
    this.legacyWorldTurnMove = null;
    this.legacyWorldTurnCommandSequence = 0;
    this.legacyWorldTurnHost = this.createLegacyWorldTurnHost();
  }

  private resolveLegacyWorldTurnHostState(): WorldTurnHostState {
    if (this.mode !== 'play') {
      return 'stopped';
    }
    if (this.overlay !== 'none' || this.isLegacyPlayLifecycleInputLocked()) {
      return 'paused';
    }
    return 'running';
  }

  private tryMovePlayer(deltaX: number, deltaY: number): boolean {
    this.legacyWorldTurnCommandSequence += 1;
    this.legacyWorldTurnHost.setState(this.resolveLegacyWorldTurnHostState());
    const diagnostics = this.legacyWorldTurnHost.getDiagnostics();
    this.legacyWorldTurnMove = { deltaX, deltaY };
    let receipt: WorldTurnReceipt;
    try {
      receipt = this.legacyWorldTurnHost.advance({
        expectedTurn: diagnostics.nextTurn,
        id: `${this.mazeSeed}:move:${this.legacyWorldTurnCommandSequence}`,
        inputId: `${deltaX},${deltaY}`,
        kind: 'player-move'
      });
    } finally {
      this.legacyWorldTurnMove = null;
    }
    this.publishInteractionDiagnostics();
    return receipt.admitted;
  }

  private applyLegacyWorldTurnPlayerMovement(): WorldTurnPhaseResult {
    const move = this.legacyWorldTurnMove;
    if (move === null) {
      return { accepted: false };
    }

    const nextStep = advanceLegacyPlayStep({
      maze: this.maze,
      player: this.player,
      trail: this.trail,
      deltaX: move.deltaX,
      deltaY: move.deltaY,
      toggleTrailFade: this.settings.toggleTrailFade,
      trailFadeTail: TRAIL_FADE_TAIL
    });
    if (!nextStep.moved) {
      return { accepted: false };
    }

    const previousPlayer = copyPoint(this.player);
    this.player = nextStep.player;
    this.armLegacyPlayerVisualMotion(previousPlayer, nextStep.player, this.time.now, LEGACY_PLAY_PLAYER_VISUAL_MOVE_MS);
    this.trail = nextStep.trail;
    this.appendLegacyPlayCyclePoint(nextStep.player);
    if (this.settings.toggleCameraFollow) {
      this.boardStaticDirty = true;
      this.boardPathDirty = true;
    }

    if (nextStep.reachedGoal) {
      this.recordMazeCycleCompletion('play');
      this.schedulePlayResetReturn();
      this.boardDynamicDirty = true;
      return {
        accepted: true,
        events: [{ type: 'player-reached-goal', entityId: 'player' }]
      };
    }

    this.boardDynamicDirty = true;
    return {
      accepted: true,
      events: [{ type: 'player-moved', entityId: 'player' }]
    };
  }

  private tryMovePlayerFromInput(
    deltaX: number,
    deltaY: number,
    options: { releaseAfterStep?: boolean } = {}
  ): boolean {
    const directions = resolveLegacyCardinalDirectionsFromVector(deltaX, deltaY);
    if (directions.length === 0) {
      return false;
    }
    this.playDirectionalIntent.request(directions);
    const moved = this.performLegacyPlayDirectionalIntentStep();
    if (options.releaseAfterStep) {
      this.synchronizeLegacyPlayDirectionalIntent();
    }
    return moved;
  }

  private schedulePlayResetReturn(): void {
    this.resetLegacyPlayInputBuffer();
    this.pendingResetRequest = createLegacyResetRequest({
      mode: 'play',
      nowMs: this.time.now,
      reason: 'goal'
    });
  }

  private consumeResetRequest(request: LegacyResetRequest, time: number): void {
    if (request.action === 'return-menu') {
      this.enterMenuMode();
      return;
    }

    if (request.mode === 'play') {
      this.armLegacyMenuStaticDeconstructStage(time);
      this.publishVisualDiagnostics(time, true);
      this.publishRuntimeDiagnostics(time, true);
      return;
    }

    this.pendingGenerationRequest = createLegacyMenuResetGenerationRequest({
      currentSeed: this.mazeSeed,
      generationProfile: this.resolveLegacyMazeGenerationProfileForMode('menu'),
      nowMs: time,
      scale: this.resolveLegacyProgressionScaleForMode('menu'),
      targetComplexity: this.resolveLegacyTargetComplexityForMode('menu')
    });
  }

  private createStars(): void {
    this.stars = createLegacyMenuBackdropStars().slice(0, LEGACY_MENU_STAR_COUNT);
  }

  private updateStars(time: number, delta: number): void {
    if (!this.settings.toggleAnimatedBackdrop) {
      this.backdropAccumulatedDeltaMs = 0;
      this.backdropNextUpdateAtMs = Number.NEGATIVE_INFINITY;
      return;
    }

    this.backdropAccumulatedDeltaMs += Math.max(0, delta);
    const updateIntervalMs = legacyTuning.menu.runtime.ambientUpdateIntervalMs[this.runtimeDiagnosticsPerformanceMode];
    if (time < this.backdropNextUpdateAtMs) {
      return;
    }

    const elapsedMs = Math.min(this.backdropAccumulatedDeltaMs, updateIntervalMs * 2.25);
    this.backdropAccumulatedDeltaMs = 0;
    this.backdropNextUpdateAtMs = time + updateIntervalMs;
    advanceLegacyMenuBackdropStars(this.stars, elapsedMs, this.settings.darkMode);
    this.backdropDirty = true;
  }

  private drawBackdrop(): void {
    const { width, height } = this.layout;
    this.backdropGraphics.clear();
    const palette = resolveLegacyMenuBackdropPalette(this.settings.darkMode);
    const backdropShards = resolveLegacyMenuBackdropShards(width, height, this.settings.darkMode);
    const backdropAnimationTime = this.settings.toggleAnimatedBackdrop ? this.time.now : 0;
    const glassShards = resolveLegacyMenuBackdropGlassShards(
      width,
      height,
      this.settings.darkMode,
      backdropAnimationTime,
      this.settings.toggleAnimatedBackdrop
    );
    const driftRunes = resolveLegacyMenuBackdropDriftRunes(
      width,
      height,
      this.settings.darkMode,
      backdropAnimationTime,
      this.settings.toggleAnimatedBackdrop
    );

    this.backdropGraphics.fillStyle(palette.fieldColor, 1);
    this.backdropGraphics.fillRect(0, 0, width, height);
    for (const shard of backdropShards) {
      this.drawLegacyBackdropShard(shard, 0.36);
    }
    for (const shard of glassShards) {
      this.drawLegacyBackdropShard(shard, 0.74);
    }
    for (const rune of driftRunes) {
      this.drawLegacyBackdropRune(rune);
    }
    this.drawLegacyBackdropSigils(width, height, this.time.now);

    const starAlphaScale = palette.starAlphaScale;
    for (const star of this.stars) {
      const pixelX = Math.round(star.x * width);
      const pixelY = Math.round(star.y * height);
      const streakLength = resolveLegacyMenuBackdropStreakLength(star);
      const coreSize = Math.max(1, Math.round(star.radius));
      const { x: stepX, y: stepY } = resolveLegacyMenuBackdropTailStep(star);
      const haloAlpha = star.alpha * starAlphaScale * (coreSize > 1 ? 0.16 : 0.07);

      if (coreSize > 1) {
        this.backdropGraphics.fillStyle(0xffffff, haloAlpha);
        this.backdropGraphics.fillRect(pixelX - 1, pixelY - 1, coreSize + 2, coreSize + 2);
      }

      this.backdropGraphics.fillStyle(0xffffff, star.alpha * starAlphaScale);
      this.backdropGraphics.fillRect(pixelX, pixelY, coreSize, coreSize);

      for (let index = 1; index <= streakLength; index += 1) {
        this.backdropGraphics.fillStyle(0xffffff, star.alpha * starAlphaScale * (0.54 - (index * 0.07)));
        this.backdropGraphics.fillRect(
          Math.round(pixelX + (stepX * index)),
          Math.round(pixelY + (stepY * index)),
          1,
          1
        );
      }
    }
    if (palette.overlayAlpha > 0) {
      this.backdropGraphics.fillStyle(0x000000, palette.overlayAlpha);
      this.backdropGraphics.fillRect(0, 0, width, height);
    }

    this.backdropDirty = false;
  }

  private drawLegacyBackdropShard(
    shard: LegacyMenuBackdropShard | LegacyMenuBackdropGlassShard,
    edgeAlphaScale: number
  ): void {
    const halfLength = shard.length / 2;
    const halfThickness = shard.thickness / 2;
    const taper = Math.min(halfLength * 0.28, shard.thickness * 2.2);
    const ghostPoints = [
      this.rotateBackdropPoint(shard, -halfLength * 0.62, -halfThickness * 0.66),
      this.rotateBackdropPoint(shard, halfLength * 0.52, -halfThickness * 0.66),
      this.rotateBackdropPoint(shard, halfLength * 0.62, 0),
      this.rotateBackdropPoint(shard, halfLength * 0.46, halfThickness * 0.66),
      this.rotateBackdropPoint(shard, -halfLength * 0.58, halfThickness * 0.66),
      this.rotateBackdropPoint(shard, -halfLength * 0.7, 0)
    ];

    this.backdropGraphics.fillStyle(shard.color, shard.alpha * 0.038);
    this.backdropGraphics.beginPath();
    this.backdropGraphics.moveTo(ghostPoints[0]?.x ?? shard.x, ghostPoints[0]?.y ?? shard.y);
    for (let index = 1; index < ghostPoints.length; index += 1) {
      const point = ghostPoints[index];
      if (point) {
        this.backdropGraphics.lineTo(point.x, point.y);
      }
    }
    this.backdropGraphics.closePath();
    this.backdropGraphics.fillPath();

    const upperRailStart = this.rotateBackdropPoint(shard, -halfLength * 0.86, -halfThickness * 0.58);
    const upperRailBreakStart = this.rotateBackdropPoint(shard, -halfLength * 0.26, -halfThickness * 0.58);
    const upperRailBreakEnd = this.rotateBackdropPoint(shard, halfLength * 0.1, -halfThickness * 0.58);
    const upperRailEnd = this.rotateBackdropPoint(shard, halfLength * 0.82, -halfThickness * 0.58);
    const lowerRailStart = this.rotateBackdropPoint(shard, -halfLength * 0.78, halfThickness * 0.58);
    const lowerRailBreakStart = this.rotateBackdropPoint(shard, -halfLength * 0.12, halfThickness * 0.58);
    const lowerRailBreakEnd = this.rotateBackdropPoint(shard, halfLength * 0.24, halfThickness * 0.58);
    const lowerRailEnd = this.rotateBackdropPoint(shard, halfLength * 0.74, halfThickness * 0.58);
    const centerBridgeStart = this.rotateBackdropPoint(shard, -halfLength * 0.2, 0);
    const centerBridgeEnd = this.rotateBackdropPoint(shard, halfLength * 0.3, 0);
    const leadingCutStart = this.rotateBackdropPoint(shard, halfLength * 0.54, -halfThickness - taper);
    const leadingCutEnd = this.rotateBackdropPoint(shard, halfLength * 0.72, halfThickness + taper);
    const trailingCutStart = this.rotateBackdropPoint(shard, -halfLength * 0.72, halfThickness + taper);
    const trailingCutEnd = this.rotateBackdropPoint(shard, -halfLength * 0.5, -halfThickness - taper);
    const notchStart = this.rotateBackdropPoint(shard, halfLength * 0.02, -halfThickness * 1.05);
    const notchEnd = this.rotateBackdropPoint(shard, halfLength * 0.02, halfThickness * 1.05);
    const tipGlintStart = this.rotateBackdropPoint(shard, halfLength * 0.78, -halfThickness * 0.92);
    const tipGlintEnd = this.rotateBackdropPoint(shard, halfLength * 0.92, -halfThickness * 0.18);

    this.backdropGraphics.lineStyle(1, shard.color, shard.alpha * (edgeAlphaScale + 0.7));
    this.strokeLegacyPolyline(this.backdropGraphics, [upperRailStart, upperRailBreakStart]);
    this.strokeLegacyPolyline(this.backdropGraphics, [upperRailBreakEnd, upperRailEnd]);
    this.strokeLegacyPolyline(this.backdropGraphics, [lowerRailStart, lowerRailBreakStart]);
    this.strokeLegacyPolyline(this.backdropGraphics, [lowerRailBreakEnd, lowerRailEnd]);
    this.backdropGraphics.lineStyle(1, shard.color, shard.alpha * (edgeAlphaScale + 0.32));
    this.strokeLegacyPolyline(this.backdropGraphics, [centerBridgeStart, centerBridgeEnd]);
    this.strokeLegacyPolyline(this.backdropGraphics, [leadingCutStart, leadingCutEnd]);
    this.strokeLegacyPolyline(this.backdropGraphics, [trailingCutStart, trailingCutEnd]);
    this.backdropGraphics.lineStyle(1, shard.color, shard.alpha * (edgeAlphaScale + 0.18));
    this.strokeLegacyPolyline(this.backdropGraphics, [notchStart, notchEnd]);
    this.backdropGraphics.lineStyle(1, 0xffffff, shard.alpha * 0.18);
    this.strokeLegacyPolyline(this.backdropGraphics, [tipGlintStart, tipGlintEnd]);
  }

  private drawLegacyBackdropRune(rune: LegacyMenuBackdropDriftRune): void {
    const firstStrokeStart = this.rotateBackdropPoint(rune, -rune.size * 0.78, rune.size * 0.48);
    const firstStrokeKnee = this.rotateBackdropPoint(rune, -rune.size * 0.08, -rune.size * 0.36);
    const firstStrokeEnd = this.rotateBackdropPoint(rune, rune.size * 0.52, -rune.size * 0.12);
    const secondStrokeStart = this.rotateBackdropPoint(rune, -rune.size * 0.3, rune.size * 0.74);
    const secondStrokeEnd = this.rotateBackdropPoint(rune, rune.size * 0.72, rune.size * 0.18);
    const tickStart = this.rotateBackdropPoint(rune, rune.size * 0.16, -rune.size * 0.72);
    const tickEnd = this.rotateBackdropPoint(rune, rune.size * 0.54, -rune.size * 0.42);

    this.backdropGraphics.lineStyle(1, rune.color, rune.alpha * 0.86);
    this.strokeLegacyPolyline(this.backdropGraphics, [firstStrokeStart, firstStrokeKnee, firstStrokeEnd]);
    this.backdropGraphics.lineStyle(1, rune.color, rune.alpha * 0.58);
    this.strokeLegacyPolyline(this.backdropGraphics, [secondStrokeStart, secondStrokeEnd]);
    this.backdropGraphics.lineStyle(1, 0xffffff, rune.alpha * 0.18);
    this.strokeLegacyPolyline(this.backdropGraphics, [tickStart, tickEnd]);
  }

  private rotateBackdropPoint(
    source: { x: number; y: number; angle: number },
    xOffset: number,
    yOffset: number
  ): { x: number; y: number } {
    const cos = Math.cos(source.angle);
    const sin = Math.sin(source.angle);

    return {
      x: source.x + (xOffset * cos) - (yOffset * sin),
      y: source.y + (xOffset * sin) + (yOffset * cos)
    };
  }

  private drawLegacyBackdropSigils(width: number, height: number, time: number): void {
    const pulse = this.settings.toggleAnimatedBackdrop
      ? 0.7 + (Math.sin(time / 1800) * 0.3)
      : 0.78;
    const alpha = LEGACY_BOARD_SIGIL_BACKGROUND_ALPHA * pulse * 0.76;
    const color = this.settings.darkMode ? LEGACY_BOARD_SIGIL_BORDER_PRIMARY : LEGACY_BOARD_SIGIL_BORDER_SECONDARY;
    const glyphs = [
      { x: 0.14, y: 0.19, scale: 0.23, flip: 1 },
      { x: 0.87, y: 0.27, scale: 0.2, flip: -1 },
      { x: 0.19, y: 0.82, scale: 0.18, flip: -1 },
      { x: 0.79, y: 0.79, scale: 0.21, flip: 1 }
    ];

    for (const glyph of glyphs) {
      const cx = width * glyph.x;
      const cy = height * glyph.y;
      const unit = Math.max(10, Math.round(Math.min(width, height) * glyph.scale * 0.13));
      const flip = glyph.flip;
      const primaryRailStart = { x: cx - (unit * 1.82 * flip), y: cy - (unit * 0.34) };
      const primaryRailKnee = { x: cx - (unit * 0.62 * flip), y: cy - (unit * 0.34) };
      const primaryRailBridge = { x: cx - (unit * 0.12 * flip), y: cy - (unit * 0.78) };
      const primaryRailEnd = { x: cx + (unit * 1.18 * flip), y: cy - (unit * 0.78) };
      const lowerRailStart = { x: cx - (unit * 1.18 * flip), y: cy + (unit * 0.72) };
      const lowerRailEnd = { x: cx + (unit * 0.86 * flip), y: cy + (unit * 0.34) };
      const mastStart = { x: cx + (unit * 0.22 * flip), y: cy - (unit * 1.34) };
      const mastEnd = { x: cx + (unit * 0.22 * flip), y: cy + (unit * 1.18) };
      const glintStart = { x: cx + (unit * 0.7 * flip), y: cy - (unit * 1.08) };
      const glintEnd = { x: cx + (unit * 1.1 * flip), y: cy - (unit * 0.88) };

      this.backdropGraphics.lineStyle(1, color, alpha);
      this.strokeLegacyPolyline(this.backdropGraphics, [
        primaryRailStart,
        primaryRailKnee,
        primaryRailBridge,
        primaryRailEnd
      ]);
      this.strokeLegacyPolyline(this.backdropGraphics, [lowerRailStart, lowerRailEnd]);
      this.backdropGraphics.lineStyle(1, color, alpha * 0.56);
      this.strokeLegacyPolyline(this.backdropGraphics, [mastStart, mastEnd]);
      this.strokeLegacyPolyline(this.backdropGraphics, [
        { x: cx - (unit * 0.38 * flip), y: cy + (unit * 0.06) },
        { x: cx + (unit * 0.28 * flip), y: cy - (unit * 0.22) },
        { x: cx + (unit * 0.78 * flip), y: cy + (unit * 0.02) }
      ]);
      this.backdropGraphics.lineStyle(1, 0xffffff, alpha * 0.22);
      this.strokeLegacyPolyline(this.backdropGraphics, [glintStart, glintEnd]);
    }
  }

  private drawStaticBoard(): void {
    const { boardLeft: layoutBoardLeft, boardTop: layoutBoardTop, boardSize } = this.layout;
    const boardOffset = this.resolveBoardOffset();
    const boardLeft = layoutBoardLeft + boardOffset.x;
    const boardTop = layoutBoardTop + boardOffset.y;
    const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(boardLeft, boardTop, boardSize);
    const mazeLeft = mazeRenderFrame.boardLeft;
    const mazeTop = mazeRenderFrame.boardTop;
    const mazeSize = mazeRenderFrame.boardSize;
    const tileSize = mazeRenderFrame.tileSize;
    const isMenuMode = this.mode === 'menu';
    const wallColor = isMenuMode
      ? LEGACY_MENU_WALL_FILL
      : LEGACY_PLAY_WALL_FILL;
    const boardFill = LEGACY_PLAY_BOARD_FILL;
    const boardEdge = LEGACY_PLAY_BOARD_EDGE;

    this.boardStaticGraphics.clear();
    const boardShadowAlpha = isMenuMode ? LEGACY_MENU_PANEL_SHADOW_ALPHA : 0;
    if (boardShadowAlpha > 0) {
      this.boardStaticGraphics.fillStyle(0x000000, boardShadowAlpha);
      this.boardStaticGraphics.fillRect(boardLeft + BOARD_SHADOW_OFFSET, boardTop + BOARD_SHADOW_OFFSET, boardSize, boardSize);
    }
    if (isMenuMode) {
      this.boardStaticGraphics.fillStyle(LEGACY_MENU_SLAB_FILL, 0.16);
      this.boardStaticGraphics.fillRect(boardLeft - 2, boardTop - 2, boardSize + 4, boardSize + 4);
    }
    this.fillLegacyBoardEdgeFrame(boardLeft, boardTop, boardSize, boardEdge);
    this.boardStaticGraphics.fillStyle(boardFill, isMenuMode ? LEGACY_MENU_BOARD_GLASS_ALPHA : LEGACY_PLAY_BOARD_GLASS_ALPHA);
    this.boardStaticGraphics.fillRect(boardLeft, boardTop, boardSize, boardSize);
    // Keep the board top-down: no pseudo bevel/highlight pass over the maze.
    if (this.settings.darkMode) {
      this.boardStaticGraphics.fillStyle(0x000000, 0.12);
      this.boardStaticGraphics.fillRect(boardLeft, boardTop, boardSize, boardSize);
    }
    if (isMenuMode && LEGACY_BOARD_GRID_ALPHA > 0) {
      this.boardStaticGraphics.lineStyle(1, 0x6c6673, LEGACY_BOARD_GRID_ALPHA);
      for (let step = 0; step <= this.maze.size; step += 1) {
        const offset = step * tileSize;
        this.boardStaticGraphics.beginPath();
        this.boardStaticGraphics.moveTo(mazeLeft + offset, mazeTop);
        this.boardStaticGraphics.lineTo(mazeLeft + offset, mazeTop + mazeSize);
        this.boardStaticGraphics.moveTo(mazeLeft, mazeTop + offset);
        this.boardStaticGraphics.lineTo(mazeLeft + mazeSize, mazeTop + offset);
        this.boardStaticGraphics.strokePath();
      }
    }

    for (let y = 0; y < this.maze.size; y += 1) {
      for (let x = 0; x < this.maze.size; x += 1) {
        const tileRect = this.resolveLegacyPixelTileRect(mazeLeft, mazeTop, tileSize, { x, y });
        this.boardStaticGraphics.fillStyle(wallColor, isMenuMode ? LEGACY_MENU_WALL_GLASS_ALPHA : LEGACY_PLAY_WALL_GLASS_ALPHA);
        this.boardStaticGraphics.fillRect(tileRect.left, tileRect.top, tileRect.width, tileRect.height);

        // Keep wall cells flat and glassy so the backdrop shows through without fake bevel/depth.
      }
    }

    this.drawLegacyBoardSigilBorder(boardLeft, boardTop, boardSize);

    const showMenuTitle = this.mode === 'menu' && this.overlay === 'none';
    this.titleGraphics.setVisible(showMenuTitle);
    this.boardStaticDirty = false;
  }

  private drawLegacyPathMaterialTile(
    graphics: Phaser.GameObjects.Graphics,
    point: LegacyPoint,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'size'>,
    originX: number,
    originY: number,
    tileSize: number,
    options: LegacyPathMaterialOptions
  ): void {
    if (pathSource.grid[point.y]?.[point.x] !== true) {
      return;
    }

    const tileRect = this.resolveLegacyPixelTileRect(originX, originY, tileSize, point);
    const materialTileSize = Math.max(1, Math.round(tileSize));
    const segments = resolveLegacyMenuPathRenderSegments(pathSource, point, materialTileSize);
    const frames = resolveLegacyMenuPathRenderFrames(pathSource, point, materialTileSize);
    const fillMaterialFrame = (
      frame: { height: number; leftInset: number; topInset: number; width: number }
    ): void => {
      const left = tileRect.left + Math.floor((frame.leftInset / materialTileSize) * tileRect.width);
      const top = tileRect.top + Math.floor((frame.topInset / materialTileSize) * tileRect.height);
      const right = tileRect.left + Math.ceil(((frame.leftInset + frame.width) / materialTileSize) * tileRect.width);
      const bottom = tileRect.top + Math.ceil(((frame.topInset + frame.height) / materialTileSize) * tileRect.height);

      graphics.fillRect(
        left,
        top,
        Math.max(1, right - left),
        Math.max(1, bottom - top)
      );
    };

    graphics.fillStyle(options.edgeColor, options.edgeAlpha);
    for (const segment of segments.edge) {
      fillMaterialFrame(segment);
    }

    graphics.fillStyle(options.coreColor, options.coreAlpha);
    fillMaterialFrame(frames.core);
    this.fillLegacyPathConnectorSeams(
      graphics,
      point,
      pathSource,
      tileRect,
      frames,
      materialTileSize,
      options
    );

    if (options.drawCue === true) {
      const cueSize = Math.max(1, Math.floor(Math.min(tileRect.width, tileRect.height) * 0.22));
      const cueInsetX = Math.floor((tileRect.width - cueSize) / 2);
      const cueInsetY = Math.floor((tileRect.height - cueSize) / 2);
      graphics.fillStyle(
        options.cueColor ?? LEGACY_PATH_TILE_CUE_COLOR,
        options.cueAlpha ?? LEGACY_PATH_TILE_CUE_ALPHA
      );
      graphics.fillRect(
        tileRect.left + cueInsetX,
        tileRect.top + cueInsetY,
        cueSize,
        cueSize
      );
    }
  }

  private fillLegacyPathConnectorSeams(
    graphics: Phaser.GameObjects.Graphics,
    point: LegacyPoint,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'size'>,
    tileRect: LegacyPixelTileRect,
    frames: ReturnType<typeof resolveLegacyMenuPathRenderFrames>,
    materialTileSize: number,
    options: LegacyPathMaterialOptions
  ): void {
    const coreFrame = frames.core;
    const coreLeft = tileRect.left + Math.floor((coreFrame.leftInset / materialTileSize) * tileRect.width);
    const coreTop = tileRect.top + Math.floor((coreFrame.topInset / materialTileSize) * tileRect.height);
    const coreRight = tileRect.left + Math.ceil(((coreFrame.leftInset + coreFrame.width) / materialTileSize) * tileRect.width);
    const coreBottom = tileRect.top + Math.ceil(((coreFrame.topInset + coreFrame.height) / materialTileSize) * tileRect.height);
    const coreWidth = Math.max(1, coreRight - coreLeft);
    const coreHeight = Math.max(1, coreBottom - coreTop);
    const tileRight = tileRect.left + tileRect.width;
    const tileBottom = tileRect.top + tileRect.height;
    const seamPad = Math.max(1, Math.round(Math.min(tileRect.width, tileRect.height) * LEGACY_PATH_CONNECTOR_SEAM_PAD_RATIO));
    const seamEdgeAlpha = Math.min(options.edgeAlpha, options.edgeAlpha * LEGACY_PATH_CONNECTOR_SEAM_EDGE_ALPHA_RATIO);
    const seamCoreAlpha = Math.min(options.coreAlpha, options.coreAlpha * LEGACY_PATH_CONNECTOR_SEAM_CORE_ALPHA_RATIO);
    const hasConnectedNeighbor = (deltaX: number, deltaY: number): boolean =>
      pathSource.grid[point.y + deltaY]?.[point.x + deltaX] === true;
    const fillRect = (left: number, top: number, width: number, height: number): void => {
      graphics.fillRect(left, top, Math.max(1, width), Math.max(1, height));
    };
    const seamRects: Array<{ height: number; left: number; top: number; width: number }> = [];

    if (hasConnectedNeighbor(-1, 0)) {
      seamRects.push({
        left: tileRect.left,
        top: coreTop,
        width: (coreLeft - tileRect.left) + seamPad,
        height: coreHeight
      });
    }
    if (hasConnectedNeighbor(1, 0)) {
      seamRects.push({
        left: coreRight - seamPad,
        top: coreTop,
        width: (tileRight - coreRight) + seamPad,
        height: coreHeight
      });
    }
    if (hasConnectedNeighbor(0, -1)) {
      seamRects.push({
        left: coreLeft,
        top: tileRect.top,
        width: coreWidth,
        height: (coreTop - tileRect.top) + seamPad
      });
    }
    if (hasConnectedNeighbor(0, 1)) {
      seamRects.push({
        left: coreLeft,
        top: coreBottom - seamPad,
        width: coreWidth,
        height: (tileBottom - coreBottom) + seamPad
      });
    }

    if (seamRects.length <= 0) {
      return;
    }

    graphics.fillStyle(options.edgeColor, seamEdgeAlpha);
    for (const seam of seamRects) {
      fillRect(
        seam.left - seamPad,
        seam.top - seamPad,
        seam.width + (seamPad * 2),
        seam.height + (seamPad * 2)
      );
    }

    graphics.fillStyle(options.coreColor, seamCoreAlpha);
    for (const seam of seamRects) {
      fillRect(seam.left, seam.top, seam.width, seam.height);
    }
  }

  private drawLegacyPathBorderDock(
    graphics: Phaser.GameObjects.Graphics,
    point: LegacyPoint,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'size'>,
    boardLeft: number,
    boardTop: number,
    boardSize: number,
    mazeLeft: number,
    mazeTop: number,
    mazeSize: number,
    tileSize: number,
    options: LegacyPathMaterialOptions
  ): void {
    const dockDirections = resolveLegacyMenuBorderDockDirections(pathSource, point);
    if (dockDirections.length <= 0) {
      return;
    }

    const tileRect = this.resolveLegacyPixelTileRect(mazeLeft, mazeTop, tileSize, point);
    const materialTileSize = Math.max(1, Math.round(tileSize));
    const frames = resolveLegacyMenuPathRenderFrames(pathSource, point, materialTileSize);
    const cornerGuardSize = Math.max(
      mazeLeft - boardLeft,
      Math.round(boardSize * LEGACY_BOARD_SIGIL_CORNER_FACET_SIZE_RATIO)
    );
    const fillDockFrame = (
      direction: LegacyMenuBorderDockDirection,
      frame: { height: number; leftInset: number; topInset: number; width: number }
    ): void => {
      const dockAreas = resolveLegacyMenuBorderDockRenderAreas(direction, frame, {
        boardLeft,
        boardTop,
        boardSize,
        cornerGuardSize,
        continuationLength: Math.max(2, Math.round(tileSize * 0.32)),
        materialTileSize,
        mazeLeft,
        mazeTop,
        mazeSize,
        tileRect,
        topCenterNotch: this.resolveLegacyBoardTopCenterNotchBounds(boardLeft, boardTop, boardSize)
      });

      for (const dockArea of dockAreas) {
        graphics.fillRect(
          Math.round(dockArea.left),
          Math.round(dockArea.top),
          Math.round(dockArea.right - dockArea.left),
          Math.round(dockArea.bottom - dockArea.top)
        );
      }
    };

    graphics.fillStyle(options.edgeColor, options.edgeAlpha);
    for (const direction of dockDirections) {
      fillDockFrame(direction, frames.edge);
    }

    graphics.fillStyle(options.coreColor, options.coreAlpha);
    for (const direction of dockDirections) {
      fillDockFrame(direction, frames.core);
    }
  }

  private drawBoardPaths(time: number): void {
    const { boardLeft: layoutBoardLeft, boardTop: layoutBoardTop, boardSize } = this.layout;
    const boardOffset = this.resolveBoardOffset();
    const boardLeft = layoutBoardLeft + boardOffset.x;
    const boardTop = layoutBoardTop + boardOffset.y;
    const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(boardLeft, boardTop, boardSize);
    const mazeLeft = mazeRenderFrame.boardLeft;
    const mazeTop = mazeRenderFrame.boardTop;
    const tileSize = mazeRenderFrame.tileSize;
    const isMenuMode = this.mode === 'menu';
    const pathColor = isMenuMode
      ? LEGACY_MENU_PATH_CORE
      : LEGACY_PLAY_PATH_CORE;
    const pathGlow = isMenuMode
      ? LEGACY_MENU_PATH_EDGE
      : LEGACY_PLAY_PATH_EDGE;

    this.boardPathGraphics.clear();
    const drawPathPoint = (point: LegacyPoint): void => {
      this.drawLegacyPathMaterialTile(
        this.boardPathGraphics,
        point,
        this.maze,
        mazeLeft,
        mazeTop,
        tileSize,
        {
          coreAlpha: isMenuMode ? 0.92 : 0.96,
          coreColor: pathColor,
          cueAlpha: isMenuMode ? LEGACY_PATH_TILE_CUE_ALPHA : LEGACY_PATH_TILE_CUE_ALPHA * 0.82,
          drawCue: false,
          edgeAlpha: isMenuMode ? LEGACY_MENU_PATH_EDGE_ALPHA : LEGACY_PLAY_PATH_EDGE_ALPHA,
          edgeColor: isMenuMode ? pathGlow : LEGACY_PLAY_PATH_EDGE
        }
      );
      this.drawLegacyPathBorderDock(
        this.boardPathGraphics,
        point,
        this.maze,
        boardLeft,
        boardTop,
        boardSize,
        mazeLeft,
        mazeTop,
        mazeRenderFrame.boardSize,
        tileSize,
        {
          coreAlpha: isMenuMode ? 0.92 : 0.96,
          coreColor: pathColor,
          cueAlpha: isMenuMode ? LEGACY_PATH_TILE_CUE_ALPHA : LEGACY_PATH_TILE_CUE_ALPHA * 0.82,
          drawCue: false,
          edgeAlpha: isMenuMode ? LEGACY_MENU_PATH_EDGE_ALPHA : LEGACY_PLAY_PATH_EDGE_ALPHA,
          edgeColor: isMenuMode ? pathGlow : LEGACY_PLAY_PATH_EDGE
        }
      );
    };

    const tileLimit = this.resolveLegacyMenuStaticDrawTileLimit();
    if (tileLimit !== null) {
      for (let index = 0; index < Math.min(tileLimit, this.menuStaticDrawTileOrder.length); index += 1) {
        const point = this.menuStaticDrawTileOrder[index];
        if (point) {
          drawPathPoint(point);
        }
      }
    } else {
      for (let y = 0; y < this.maze.size; y += 1) {
        for (let x = 0; x < this.maze.size; x += 1) {
          if (!this.isLegacyMenuPointVisibleInStaticDraw({ x, y })) {
            continue;
          }
          drawPathPoint({ x, y });
        }
      }
    }

    this.drawLegacyMenuPathTitle(time);
    this.boardPathDirty = false;
  }

  private resolveLegacyMenuPathTitleProgress(): number {
    if (this.mode !== 'menu') {
      return 0;
    }

    const tileLimit = this.resolveLegacyMenuStaticDrawTileLimit();
    if (tileLimit !== null && this.menuStaticDrawTileOrder.length > 0) {
      return clamp(tileLimit / this.menuStaticDrawTileOrder.length, 0, 1);
    }

    return this.menuStaticDrawLifecyclePhase === 'building' ? 0 : 1;
  }

  private resolveLegacyMenuPathTitlePieceCount(): number {
    const titlePresentation = resolveLegacyMenuTitlePresentation(
      this.layout.boardSize,
      this.layout.tileSize,
      this.layout.height > this.layout.width,
      this.layout.width,
      this.maze.source === 'menu-generated' ? 'procedural' : 'snapshot'
    );
    const titleLayout = resolveLegacyMenuPathTitleLayout(
      this.layout.titleX,
      this.layout.titleY,
      titlePresentation.fontSize
    );

    return titleLayout.cells.length;
  }

  private resolveLegacyMenuPathTitleVisiblePieceCount(): number {
    return this.resolveLegacyMenuPathTitleVisiblePieces(this.resolveLegacyMenuPathTitlePieceCount());
  }

  private hasLegacyMenuTitleAnimationPendingFrame(time: number): boolean {
    if (this.mode !== 'menu' || this.overlay !== 'none') {
      return false;
    }
    if (time < this.legacyMenuTitleAnimationNextFrameAtMs) {
      return false;
    }

    this.legacyMenuTitleAnimationNextFrameAtMs = time + LEGACY_MENU_PATH_TITLE_FRAME_MS;
    return true;
  }

  private resolveLegacyMenuPathTitleAnimationPhase(time: number): number {
    const phase = (time % LEGACY_MENU_PATH_TITLE_SWEEP_MS) / LEGACY_MENU_PATH_TITLE_SWEEP_MS;
    return phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
  }

  private resolveLegacyMenuPathTitleAnimationDirection(time: number): 'forward' | 'reverse' {
    return ((time % LEGACY_MENU_PATH_TITLE_SWEEP_MS) / LEGACY_MENU_PATH_TITLE_SWEEP_MS) <= 0.5
      ? 'forward'
      : 'reverse';
  }

  private resolveLegacyMenuPathTitleOrbitPhase(time: number): number {
    return (time % LEGACY_MENU_PATH_TITLE_ORBIT_MS) / LEGACY_MENU_PATH_TITLE_ORBIT_MS;
  }

  private resolveLegacyMenuPathTitleSweepTravel(columns: number, rows: number): number {
    return columns + (rows * 0.72) + (LEGACY_MENU_PATH_TITLE_SWEEP_OVERSCAN_COLUMNS * 2);
  }

  private resolveLegacyMenuPathTitleSweepState(
    columns: number,
    rows: number,
    time: number
  ): LegacyMenuPathTitleSweepState {
    const idlePhase = this.resolveLegacyMenuPathTitleAnimationPhase(time);
    const lifecycleProgress = clamp(this.resolveLegacyMenuPathTitleProgress(), 0, 1);
    const mode: LegacyMenuPathTitleSweepMode = this.menuStaticDrawLifecyclePhase === 'building'
      ? 'build'
      : this.menuStaticDrawLifecyclePhase === 'deconstructing'
        ? 'deconstruct'
        : 'idle';
    const syncedToLifecycle = mode !== 'idle';
    const progress = syncedToLifecycle ? lifecycleProgress : idlePhase;
    const travel = this.resolveLegacyMenuPathTitleSweepTravel(columns, rows);
    const overscan = LEGACY_MENU_PATH_TITLE_SWEEP_OVERSCAN_COLUMNS;

    return {
      column: (progress * (columns + (overscan * 2))) - overscan,
      diagonalPosition: (progress * travel) - overscan,
      direction: mode === 'build'
        ? 'forward'
        : mode === 'deconstruct'
          ? 'reverse'
          : this.resolveLegacyMenuPathTitleAnimationDirection(time),
      mode,
      phase: syncedToLifecycle ? progress : idlePhase,
      progress,
      syncedToLifecycle
    };
  }

  private resolveLegacyMenuPathTitleVisibleSweepEdge(
    visibleCells: LegacyMenuPathTitleCell[],
    columns: number,
    rows: number
  ): Pick<LegacyMenuPathTitleSweepState, 'column' | 'diagonalPosition'> | null {
    if (visibleCells.length <= 0) {
      return null;
    }

    const rightmostVisibleColumn = visibleCells.reduce(
      (rightmostColumn, cell) => Math.max(rightmostColumn, cell.column + 1),
      0
    );
    const rightmostVisibleDiagonalPosition = visibleCells.reduce(
      (rightmostDiagonalPosition, cell) => Math.max(
        rightmostDiagonalPosition,
        cell.column + 1 + (cell.row * 0.72)
      ),
      0
    );
    const leadColumns = 0.18;

    return {
      column: clamp(rightmostVisibleColumn + leadColumns, 0, columns),
      diagonalPosition: clamp(
        rightmostVisibleDiagonalPosition + leadColumns,
        0,
        this.resolveLegacyMenuPathTitleSweepTravel(columns, rows)
      )
    };
  }

  private resolveLegacyMenuPathTitleVisibleSweepState(
    visibleCells: LegacyMenuPathTitleCell[],
    titleLayout: ReturnType<typeof resolveLegacyMenuPathTitleLayout>,
    time: number
  ): LegacyMenuPathTitleSweepState {
    const sweepState = this.resolveLegacyMenuPathTitleSweepState(titleLayout.columns, titleLayout.rows, time);
    if (!sweepState.syncedToLifecycle) {
      return sweepState;
    }

    const visibleSweepEdge = this.resolveLegacyMenuPathTitleVisibleSweepEdge(
      visibleCells,
      titleLayout.columns,
      titleLayout.rows
    );
    if (!visibleSweepEdge) {
      return sweepState;
    }

    const scannerProgress = titleLayout.columns > 0
      ? clamp(visibleSweepEdge.column / titleLayout.columns, 0, 1)
      : sweepState.progress;

    return {
      ...sweepState,
      column: visibleSweepEdge.column,
      diagonalPosition: visibleSweepEdge.diagonalPosition,
      phase: scannerProgress,
      progress: scannerProgress
    };
  }

  private resolveLegacyMenuPathTitleVisiblePieces(pieceCount: number): number {
    const progress = this.resolveLegacyMenuPathTitleProgress();
    if (progress <= 0) {
      return 0;
    }

    return clamp(Math.ceil(pieceCount * progress), 0, pieceCount);
  }

  private drawLegacyMenuPathTitleCell(
    cell: LegacyMenuPathTitleCell,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'size'>,
    left: number,
    top: number,
    cellSize: number,
    options: LegacyPathMaterialOptions
  ): void {
    this.drawLegacyPathMaterialTile(
      this.titleGraphics,
      { x: cell.column, y: cell.row },
      pathSource,
      left,
      top,
      cellSize,
      options
    );
  }

  private drawLegacyMenuPathTitleSigilRails(
    visibleCells: LegacyMenuPathTitleCell[],
    titleLayout: ReturnType<typeof resolveLegacyMenuPathTitleLayout>,
    time: number,
    alphaScale: number
  ): void {
    const sweepState = this.resolveLegacyMenuPathTitleVisibleSweepState(visibleCells, titleLayout, time);
    const pulsePhase = this.resolveLegacyMenuPathTitleAnimationPhase(time);
    const pulseBoost = sweepState.syncedToLifecycle ? 1.12 : 1;
    const pulse = (0.55 + (Math.sin((pulsePhase * Math.PI * 2) + 0.4) * 0.22)) * pulseBoost;
    const railAlpha = clamp((0.28 + pulse * 0.3) * alphaScale, 0.16, 0.58);
    const railGap = Math.max(5, Math.round(titleLayout.cellSize * 0.8));
    const notch = Math.max(3, Math.round(titleLayout.cellSize * 0.46));
    const orbitGeometry = resolveLegacyMenuPathTitleOrbitGeometry(
      titleLayout.left,
      titleLayout.top,
      titleLayout.width,
      titleLayout.height,
      titleLayout.cellSize
    );
    const left = titleLayout.left - railGap;
    const right = titleLayout.left + titleLayout.width + railGap;
    const top = titleLayout.top - railGap;
    const bottom = titleLayout.top + titleLayout.height + railGap;
    const crest = Math.max(5, Math.round(titleLayout.cellSize * 0.68));

    this.titleGraphics.lineStyle(1, LEGACY_MENU_PATH_EDGE, railAlpha);
    this.strokeLegacyPolyline(this.titleGraphics, [
      { x: left, y: top + notch },
      { x: left + notch, y: top },
      { x: orbitGeometry.centerX - crest, y: top },
      { x: orbitGeometry.centerX, y: top - Math.round(crest * 0.55) },
      { x: orbitGeometry.centerX + crest, y: top },
      { x: right - notch, y: top },
      { x: right, y: top + notch }
    ]);
    this.strokeLegacyPolyline(this.titleGraphics, [
      { x: left, y: bottom - notch },
      { x: left + notch, y: bottom },
      { x: orbitGeometry.centerX - crest, y: bottom },
      { x: orbitGeometry.centerX, y: bottom + Math.round(crest * 0.55) },
      { x: orbitGeometry.centerX + crest, y: bottom },
      { x: right - notch, y: bottom },
      { x: right, y: bottom - notch }
    ]);

    this.titleGraphics.lineStyle(1, LEGACY_MENU_PATH_TITLE_ACCENT, railAlpha * 1.12);
    this.strokeLegacyPolyline(this.titleGraphics, [
      { x: orbitGeometry.centerX, y: orbitGeometry.crownTop - orbitGeometry.crownHalf },
      { x: orbitGeometry.centerX + orbitGeometry.crownHalf, y: orbitGeometry.crownTop },
      { x: orbitGeometry.centerX, y: orbitGeometry.crownTop + orbitGeometry.crownHalf },
      { x: orbitGeometry.centerX - orbitGeometry.crownHalf, y: orbitGeometry.crownTop },
      { x: orbitGeometry.centerX, y: orbitGeometry.crownTop - orbitGeometry.crownHalf }
    ]);
    this.strokeLegacyPolyline(this.titleGraphics, [
      { x: orbitGeometry.centerX, y: orbitGeometry.crownBottom - orbitGeometry.crownHalf },
      { x: orbitGeometry.centerX + orbitGeometry.crownHalf, y: orbitGeometry.crownBottom },
      { x: orbitGeometry.centerX, y: orbitGeometry.crownBottom + orbitGeometry.crownHalf },
      { x: orbitGeometry.centerX - orbitGeometry.crownHalf, y: orbitGeometry.crownBottom },
      { x: orbitGeometry.centerX, y: orbitGeometry.crownBottom - orbitGeometry.crownHalf }
    ]);

    const tickWidth = Math.max(2, Math.round(titleLayout.cellSize * 0.5));
    const sweepX = titleLayout.left + (
      clamp(sweepState.column, 0, titleLayout.columns)
      * titleLayout.cellSize
    );
    this.titleGraphics.lineStyle(1, LEGACY_MENU_PATH_TITLE_PRISM, railAlpha * 1.35);
    this.strokeLegacyPolyline(this.titleGraphics, [
      { x: sweepX - tickWidth, y: top - 1 },
      { x: sweepX + tickWidth, y: top - 1 }
    ]);
    this.strokeLegacyPolyline(this.titleGraphics, [
      { x: sweepX - tickWidth, y: bottom + 1 },
      { x: sweepX + tickWidth, y: bottom + 1 }
    ]);
    this.titleGraphics.lineStyle(1, LEGACY_MENU_PATH_TITLE_ACCENT, railAlpha * 0.78);
    this.strokeLegacyPolyline(this.titleGraphics, [
      { x: sweepX, y: top + Math.round(titleLayout.cellSize * 0.5) },
      { x: sweepX, y: bottom - Math.round(titleLayout.cellSize * 0.5) }
    ]);
  }

  private drawLegacyMenuPathTitlePrismSweep(
    visibleCells: LegacyMenuPathTitleCell[],
    titleLayout: ReturnType<typeof resolveLegacyMenuPathTitleLayout>,
    time: number,
    alphaScale: number
  ): void {
    const sweepState = this.resolveLegacyMenuPathTitleVisibleSweepState(visibleCells, titleLayout, time);
    const pulsePhase = this.resolveLegacyMenuPathTitleAnimationPhase(time);
    const sweepPosition = sweepState.diagonalPosition;
    const pulse = (0.76 + (Math.sin(pulsePhase * Math.PI * 2) * 0.14))
      * (sweepState.syncedToLifecycle ? 1.08 : 1);
    const inset = Math.max(titleLayout.coreInset, Math.floor(titleLayout.cellSize * 0.16));
    const glintSize = Math.max(1, titleLayout.cellSize - (inset * 2));
    const starInset = Math.max(titleLayout.coreInset + 1, Math.floor(titleLayout.cellSize * 0.32));

    for (const cell of visibleCells) {
      const diagonalPosition = cell.column + (cell.row * 0.72);
      const distance = Math.abs(diagonalPosition - sweepPosition);
      const localTwinkle = Math.sin((time / 480) + (cell.order * 0.61));
      const isAnchorSpark = cell.order % 13 === 0 && localTwinkle > 0.54;

      if (distance < 2.2) {
        const alpha = clamp(smoothstep(1 - (distance / 2.2)) * 0.72 * pulse * alphaScale, 0, 0.78);
        this.titleGraphics.fillStyle(LEGACY_MENU_PATH_TITLE_ACCENT, alpha);
        this.titleGraphics.fillRect(
          titleLayout.left + (cell.column * titleLayout.cellSize) + inset,
          titleLayout.top + (cell.row * titleLayout.cellSize) + inset,
          glintSize,
          glintSize
        );
        this.titleGraphics.lineStyle(1, LEGACY_MENU_PATH_TITLE_PRISM, alpha * 0.88);
        this.strokeLegacyPolyline(this.titleGraphics, [
          {
            x: titleLayout.left + (cell.column * titleLayout.cellSize) + inset,
            y: titleLayout.top + (cell.row * titleLayout.cellSize) + inset
          },
          {
            x: titleLayout.left + ((cell.column + 1) * titleLayout.cellSize) - inset,
            y: titleLayout.top + ((cell.row + 1) * titleLayout.cellSize) - inset
          }
        ]);
      }

      if (isAnchorSpark) {
        this.titleGraphics.fillStyle(LEGACY_MENU_PATH_TITLE_RUNE, 0.4 * alphaScale);
        this.titleGraphics.fillRect(
          titleLayout.left + (cell.column * titleLayout.cellSize) + starInset,
          titleLayout.top + (cell.row * titleLayout.cellSize) + starInset,
          Math.max(1, titleLayout.cellSize - (starInset * 2)),
          Math.max(1, titleLayout.cellSize - (starInset * 2))
        );
      }
    }
  }

  private drawLegacyMenuPathTitleGemFacets(
    visibleCells: LegacyMenuPathTitleCell[],
    titleLayout: ReturnType<typeof resolveLegacyMenuPathTitleLayout>,
    time: number,
    alphaScale: number
  ): void {
    const phase = (time % LEGACY_MENU_PATH_TITLE_GEM_PULSE_MS) / LEGACY_MENU_PATH_TITLE_GEM_PULSE_MS;
    const inset = Math.max(titleLayout.coreInset, Math.floor(titleLayout.cellSize * 0.2));
    const lineInset = Math.max(titleLayout.coreInset + 1, Math.floor(titleLayout.cellSize * 0.32));

    for (const cell of visibleCells) {
      const localPhase = (phase + ((cell.order % 17) / 17)) % 1;
      const left = titleLayout.left + (cell.column * titleLayout.cellSize) + inset;
      const top = titleLayout.top + (cell.row * titleLayout.cellSize) + inset;
      const right = titleLayout.left + ((cell.column + 1) * titleLayout.cellSize) - inset;
      const bottom = titleLayout.top + ((cell.row + 1) * titleLayout.cellSize) - inset;
      const midX = (left + right) / 2;
      const midY = (top + bottom) / 2;
      const shimmer = smoothstep(0.5 + (Math.sin((localPhase * Math.PI * 2) + (cell.order * 0.37)) * 0.5));
      const alpha = clamp((0.065 + (shimmer * 0.14)) * alphaScale, 0.04, 0.27);
      const facetColor = cell.order % 4 === 0
        ? LEGACY_MENU_PATH_TITLE_FACET_WARM
        : LEGACY_MENU_PATH_TITLE_GEM;

      this.titleGraphics.fillStyle(facetColor, alpha);
      switch (cell.order % 4) {
        case 0:
          this.titleGraphics.fillTriangle(left, top, right, top, midX, midY);
          break;
        case 1:
          this.titleGraphics.fillTriangle(right, top, right, bottom, midX, midY);
          break;
        case 2:
          this.titleGraphics.fillTriangle(right, bottom, left, bottom, midX, midY);
          break;
        default:
          this.titleGraphics.fillTriangle(left, bottom, left, top, midX, midY);
          break;
      }

      if (cell.order % 7 === 0) {
        const glintAlpha = clamp(alpha * (1.12 + (smoothstep(localPhase) * 0.58)), 0, 0.38);
        const glintLean = (smoothstep(localPhase) - 0.5) * titleLayout.cellSize * 0.16;
        this.titleGraphics.lineStyle(1, LEGACY_MENU_PATH_TITLE_PRISM, glintAlpha);
        this.strokeLegacyPolyline(this.titleGraphics, [
          {
            x: titleLayout.left + (cell.column * titleLayout.cellSize) + lineInset,
            y: titleLayout.top + ((cell.row + 1) * titleLayout.cellSize) - lineInset + glintLean
          },
          {
            x: titleLayout.left + ((cell.column + 1) * titleLayout.cellSize) - lineInset,
            y: titleLayout.top + (cell.row * titleLayout.cellSize) + lineInset + glintLean
          }
        ]);
      }
    }
  }

  private drawLegacyMenuPathTitleDiamond(
    centerX: number,
    centerY: number,
    radius: number,
    fillColor: number,
    fillAlpha: number,
    edgeColor: number,
    edgeAlpha: number
  ): void {
    const top = { x: centerX, y: centerY - radius };
    const right = { x: centerX + radius, y: centerY };
    const bottom = { x: centerX, y: centerY + radius };
    const left = { x: centerX - radius, y: centerY };

    this.titleGraphics.fillStyle(fillColor, fillAlpha);
    this.titleGraphics.fillTriangle(top.x, top.y, right.x, right.y, bottom.x, bottom.y);
    this.titleGraphics.fillTriangle(top.x, top.y, left.x, left.y, bottom.x, bottom.y);
    this.titleGraphics.lineStyle(1, edgeColor, edgeAlpha);
    this.strokeLegacyPolyline(this.titleGraphics, [top, right, bottom, left, top]);
    this.titleGraphics.lineStyle(1, LEGACY_MENU_PATH_TITLE_PRISM, edgeAlpha * 0.42);
    this.strokeLegacyPolyline(this.titleGraphics, [
      { x: centerX - (radius * 0.52), y: centerY },
      { x: centerX, y: centerY - (radius * 0.52) },
      { x: centerX + (radius * 0.52), y: centerY }
    ]);
  }

  private drawLegacyMenuPathTitleOrbitSigils(
    titleLayout: ReturnType<typeof resolveLegacyMenuPathTitleLayout>,
    time: number,
    alphaScale: number
  ): void {
    const orbitPhase = this.resolveLegacyMenuPathTitleOrbitPhase(time);
    const orbitGeometry = resolveLegacyMenuPathTitleOrbitGeometry(
      titleLayout.left,
      titleLayout.top,
      titleLayout.width,
      titleLayout.height,
      titleLayout.cellSize
    );

    for (let index = 0; index < LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS; index += 1) {
      const orbit = (orbitPhase + (index / LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS)) % 1;
      const { x, y } = resolveLegacyMenuPathTitleOrbitPoint(orbitGeometry, orbit);

      const wave = 0.62 + (Math.sin((orbitPhase * Math.PI * 2) + (index * 1.38)) * 0.28);
      const radius = Math.max(4, Math.round(titleLayout.cellSize * (0.46 + (wave * 0.32))));
      const alpha = clamp((0.14 + (wave * 0.24)) * alphaScale, 0.1, 0.42);
      const fillColor = index % 3 === 0
        ? LEGACY_MENU_PATH_TITLE_FACET_WARM
        : LEGACY_MENU_PATH_TITLE_GEM;

      this.drawLegacyMenuPathTitleDiamond(
        x,
        y,
        radius,
        fillColor,
        alpha * 0.6,
        LEGACY_MENU_PATH_TITLE_ACCENT,
        alpha
      );
      this.titleGraphics.lineStyle(1, LEGACY_MENU_PATH_TITLE_PRISM, alpha * 0.32);
      this.strokeLegacyPolyline(this.titleGraphics, [
        { x, y },
        {
          x: x + ((orbitGeometry.centerX - x) * 0.12),
          y: y + ((orbitGeometry.centerY - y) * 0.12)
        }
      ]);
    }
  }

  private drawLegacyMenuPathTitle(time: number): void {
    this.titleGraphics.clear();
    const visible = this.mode === 'menu' && this.overlay === 'none';
    this.titleGraphics.setVisible(visible);
    if (!visible) {
      return;
    }

    const titlePresentation = resolveLegacyMenuTitlePresentation(
      this.layout.boardSize,
      this.layout.tileSize,
      this.layout.height > this.layout.width,
      this.layout.width,
      this.maze.source === 'menu-generated' ? 'procedural' : 'snapshot'
    );
    const titleLayout = resolveLegacyMenuPathTitleLayout(
      this.layout.titleX,
      this.layout.titleY,
      titlePresentation.fontSize
    );
    const visiblePieceCount = this.resolveLegacyMenuPathTitleVisiblePieces(titleLayout.cells.length);
    const visibleCells = titleLayout.cells.slice(0, visiblePieceCount);
    const titlePathSource: Pick<LegacyMazeSnapshot, 'grid' | 'size'> = {
      grid: titleLayout.grid,
      size: titleLayout.columns
    };

    if (visibleCells.length > 0) {
      for (const cell of visibleCells) {
        this.drawLegacyMenuPathTitleCell(
          cell,
          titlePathSource,
          titleLayout.left + titlePresentation.shadowOffsetX,
          titleLayout.top + titlePresentation.shadowOffsetY,
          titleLayout.cellSize,
          {
            coreAlpha: LEGACY_MENU_PATH_TITLE_SHADOW_ALPHA,
            coreColor: LEGACY_MENU_PATH_TITLE_SHADOW,
            edgeAlpha: LEGACY_MENU_PATH_TITLE_SHADOW_ALPHA,
            edgeColor: LEGACY_MENU_PATH_TITLE_SHADOW
          }
        );
      }
    }

    this.drawLegacyMenuPathTitleSigilRails(visibleCells, titleLayout, time, titlePresentation.titleAlpha);

    if (visibleCells.length > 0) {
      for (const cell of visibleCells) {
        this.drawLegacyMenuPathTitleCell(
          cell,
          titlePathSource,
          titleLayout.left,
          titleLayout.top,
          titleLayout.cellSize,
          {
            coreAlpha: 0.92 * titlePresentation.titleAlpha,
            coreColor: LEGACY_MENU_PATH_CORE,
            edgeAlpha: LEGACY_MENU_PATH_EDGE_ALPHA * titlePresentation.titleAlpha,
            edgeColor: LEGACY_MENU_PATH_EDGE
          }
        );
      }

      this.drawLegacyMenuPathTitleGemFacets(visibleCells, titleLayout, time, titlePresentation.titleAlpha);
      this.drawLegacyMenuPathTitlePrismSweep(visibleCells, titleLayout, time, titlePresentation.titleAlpha);
    }
    this.drawLegacyMenuPathTitleOrbitSigils(titleLayout, time, titlePresentation.titleAlpha);

    const cursorCell = visibleCells.at(-1);
    if (cursorCell && visiblePieceCount < titleLayout.cells.length) {
      const accentInset = Math.max(titleLayout.coreInset + 1, Math.floor(titleLayout.cellSize * 0.28));
      this.titleGraphics.fillStyle(LEGACY_MENU_PATH_TITLE_ACCENT, LEGACY_MENU_PATH_TITLE_ACCENT_ALPHA);
      this.titleGraphics.fillRect(
        titleLayout.left + (cursorCell.column * titleLayout.cellSize) + accentInset,
        titleLayout.top + (cursorCell.row * titleLayout.cellSize) + accentInset,
        Math.max(1, titleLayout.cellSize - (accentInset * 2)),
        Math.max(1, titleLayout.cellSize - (accentInset * 2))
      );
    }
  }

  private resolveLegacyMazeRenderFrame(
    boardLeft: number,
    boardTop: number,
    boardSize: number
  ): LegacyMazeRenderFrame {
    const safeInset = clamp(
      Math.round(boardSize * LEGACY_BOARD_MAZE_SAFE_INSET_RATIO),
      LEGACY_BOARD_MAZE_SAFE_INSET_MIN,
      LEGACY_BOARD_MAZE_SAFE_INSET_MAX
    );
    const renderSize = Math.max(1, boardSize - (safeInset * 2));

    return {
      boardLeft: boardLeft + safeInset,
      boardTop: boardTop + safeInset,
      boardSize: renderSize,
      tileSize: renderSize / Math.max(1, this.maze.size),
      safeInset
    };
  }

  private resolveLegacyBoardTopCenterNotchBounds(
    boardLeft: number,
    boardTop: number,
    boardSize: number
  ): VisualRect {
    const inset = 2;
    const outerLeft = boardLeft - inset;
    const outerTop = boardTop - inset;
    const outerSize = boardSize + (inset * 2);
    const mid = Math.max(7, Math.round(boardSize * 0.028));
    const halfWidth = Math.max(mid + 5, Math.round(boardSize * 0.046));
    const top = Math.round(outerTop - 1);
    const bottom = Math.round(outerTop + mid + Math.max(Math.round(boardSize * 0.04), 13));
    const centerX = outerLeft + (outerSize / 2);

    return createVisualRect(
      Math.round(centerX - halfWidth),
      top,
      Math.round(halfWidth * 2),
      Math.max(1, bottom - top)
    );
  }

  private resolveLegacyPixelTileRect(
    originX: number,
    originY: number,
    tileSize: number,
    point: LegacyPoint
  ): LegacyPixelTileRect {
    const left = Math.round(originX + (point.x * tileSize));
    const top = Math.round(originY + (point.y * tileSize));
    const right = Math.round(originX + ((point.x + 1) * tileSize));
    const bottom = Math.round(originY + ((point.y + 1) * tileSize));

    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top)
    };
  }

  private fillLegacyBoardEdgeFrame(
    boardLeft: number,
    boardTop: number,
    boardSize: number,
    color: number
  ): void {
    const frameSize = boardSize + 2;
    this.boardStaticGraphics.fillStyle(color, 1);
    this.boardStaticGraphics.fillRect(boardLeft - 1, boardTop - 1, frameSize, 1);
    this.boardStaticGraphics.fillRect(boardLeft - 1, boardTop + boardSize, frameSize, 1);
    this.boardStaticGraphics.fillRect(boardLeft - 1, boardTop, 1, boardSize);
    this.boardStaticGraphics.fillRect(boardLeft + boardSize, boardTop, 1, boardSize);
  }

  private drawLegacyBoardSigilBorder(boardLeft: number, boardTop: number, boardSize: number): void {
    const inset = 2;
    const outerLeft = boardLeft - inset;
    const outerTop = boardTop - inset;
    const outerSize = boardSize + (inset * 2);
    const right = outerLeft + outerSize;
    const bottom = outerTop + outerSize;
    const corner = Math.max(10, Math.round(boardSize * 0.045));
    const mid = Math.max(7, Math.round(boardSize * 0.028));
    const centerX = outerLeft + (outerSize / 2);
    const centerY = outerTop + (outerSize / 2);

    this.boardStaticGraphics.lineStyle(2, LEGACY_BOARD_SIGIL_BORDER_SHADOW, 0.62);
    this.strokeLegacyPolyline(this.boardStaticGraphics, [
      { x: outerLeft, y: outerTop },
      { x: right, y: outerTop },
      { x: right, y: bottom },
      { x: outerLeft, y: bottom },
      { x: outerLeft, y: outerTop }
    ]);

    this.boardStaticGraphics.lineStyle(1, LEGACY_BOARD_SIGIL_BORDER_PRIMARY, LEGACY_BOARD_SIGIL_BORDER_ALPHA);
    this.strokeLegacyPolyline(this.boardStaticGraphics, [
      { x: outerLeft + corner, y: outerTop },
      { x: centerX - mid, y: outerTop },
      { x: centerX, y: outerTop + mid },
      { x: centerX + mid, y: outerTop },
      { x: right - corner, y: outerTop }
    ]);
    this.strokeLegacyPolyline(this.boardStaticGraphics, [
      { x: right, y: outerTop + corner },
      { x: right, y: centerY - mid },
      { x: right - mid, y: centerY },
      { x: right, y: centerY + mid },
      { x: right, y: bottom - corner }
    ]);
    this.strokeLegacyPolyline(this.boardStaticGraphics, [
      { x: right - corner, y: bottom },
      { x: centerX + mid, y: bottom },
      { x: centerX, y: bottom - mid },
      { x: centerX - mid, y: bottom },
      { x: outerLeft + corner, y: bottom }
    ]);
    this.strokeLegacyPolyline(this.boardStaticGraphics, [
      { x: outerLeft, y: bottom - corner },
      { x: outerLeft, y: centerY + mid },
      { x: outerLeft + mid, y: centerY },
      { x: outerLeft, y: centerY - mid },
      { x: outerLeft, y: outerTop + corner }
    ]);

    this.boardStaticGraphics.lineStyle(1, LEGACY_BOARD_SIGIL_BORDER_SECONDARY, 0.56);
    const corners = [
      { x: outerLeft, y: outerTop, sx: 1, sy: 1 },
      { x: right, y: outerTop, sx: -1, sy: 1 },
      { x: right, y: bottom, sx: -1, sy: -1 },
      { x: outerLeft, y: bottom, sx: 1, sy: -1 }
    ];
    for (const cornerGlyph of corners) {
      this.strokeLegacyPolyline(this.boardStaticGraphics, [
        { x: cornerGlyph.x + (cornerGlyph.sx * 2), y: cornerGlyph.y + (cornerGlyph.sy * corner) },
        { x: cornerGlyph.x + (cornerGlyph.sx * corner), y: cornerGlyph.y + (cornerGlyph.sy * corner) },
        { x: cornerGlyph.x + (cornerGlyph.sx * corner), y: cornerGlyph.y + (cornerGlyph.sy * 2) }
      ]);
      this.strokeLegacyPolyline(this.boardStaticGraphics, [
        { x: cornerGlyph.x + (cornerGlyph.sx * (corner * 0.48)), y: cornerGlyph.y + (cornerGlyph.sy * (corner * 0.88)) },
        { x: cornerGlyph.x + (cornerGlyph.sx * (corner * 0.88)), y: cornerGlyph.y + (cornerGlyph.sy * (corner * 0.48)) }
      ]);
    }
  }

  private resolveLegacyBoardCornerFacetAlpha(time: number): number {
    const phase = (time % LEGACY_BOARD_SIGIL_CORNER_FACET_SHIMMER_MS) / LEGACY_BOARD_SIGIL_CORNER_FACET_SHIMMER_MS;
    const wave = 0.5 + (Math.sin(phase * Math.PI * 2) * 0.5);
    const glint = Math.max(0, Math.sin((phase * Math.PI * 4) - 0.6));
    return LEGACY_BOARD_SIGIL_CORNER_FACET_ALPHA + (wave * 0.14) + (glint * 0.08);
  }

  private hasLegacyBoardCornerShimmerPendingFrame(time: number): boolean {
    if (time < this.legacyBoardCornerShimmerNextFrameAtMs) {
      return false;
    }

    this.legacyBoardCornerShimmerNextFrameAtMs = time + LEGACY_BOARD_SIGIL_CORNER_FACET_FRAME_MS;
    return true;
  }

  private drawLegacyBoardCornerFacetShimmer(boardLeft: number, boardTop: number, boardSize: number, time: number): void {
    const inset = 2;
    const outerLeft = boardLeft - inset;
    const outerTop = boardTop - inset;
    const outerSize = boardSize + (inset * 2);
    const right = outerLeft + outerSize;
    const bottom = outerTop + outerSize;
    const corner = Math.max(16, Math.round(boardSize * LEGACY_BOARD_SIGIL_CORNER_FACET_SIZE_RATIO));
    const baseAlpha = clamp(this.resolveLegacyBoardCornerFacetAlpha(time), 0.42, 0.82);
    const phase = (time % LEGACY_BOARD_SIGIL_CORNER_FACET_SHIMMER_MS) / LEGACY_BOARD_SIGIL_CORNER_FACET_SHIMMER_MS;
    const corners = [
      { x: outerLeft, y: outerTop, sx: 1, sy: 1 },
      { x: right, y: outerTop, sx: -1, sy: 1 },
      { x: right, y: bottom, sx: -1, sy: -1 },
      { x: outerLeft, y: bottom, sx: 1, sy: -1 }
    ];

    for (let index = 0; index < corners.length; index += 1) {
      const cornerGlyph = corners[index];
      if (!cornerGlyph) {
        continue;
      }

      const localPhase = (phase + (index * 0.19)) % 1;
      const wave = 0.5 + (Math.sin(localPhase * Math.PI * 2) * 0.5);
      const originX = Math.round(cornerGlyph.x + (cornerGlyph.sx * 2));
      const originY = Math.round(cornerGlyph.y + (cornerGlyph.sy * 2));
      const edgeX = Math.round(cornerGlyph.x + (cornerGlyph.sx * (corner * 0.9)));
      const edgeY = Math.round(cornerGlyph.y + (cornerGlyph.sy * (corner * 0.9)));
      const innerX = Math.round(cornerGlyph.x + (cornerGlyph.sx * (corner * 0.58)));
      const innerY = Math.round(cornerGlyph.y + (cornerGlyph.sy * (corner * 0.58)));
      const glintStep = 0.22 + (wave * 0.52);
      const glintX = cornerGlyph.x + (cornerGlyph.sx * (corner * glintStep));
      const glintY = cornerGlyph.y + (cornerGlyph.sy * (corner * glintStep));
      const prismStep = 0.3 + (wave * 0.2);
      const prismX = Math.round(cornerGlyph.x + (cornerGlyph.sx * (corner * prismStep)));
      const prismY = Math.round(cornerGlyph.y + (cornerGlyph.sy * (corner * prismStep)));
      const prismAlpha = clamp(baseAlpha * (0.55 + (wave * 0.62)), 0.26, 0.74);
      const glintAlpha = clamp(baseAlpha * (1.05 + (wave * 0.82)), 0.38, 0.96);

      this.boardDynamicGraphics.fillStyle(LEGACY_BOARD_SIGIL_CORNER_FACET_GLOW, baseAlpha * (0.18 + (wave * 0.18)));
      this.boardDynamicGraphics.fillTriangle(originX, originY, edgeX, originY, originX, edgeY);
      this.boardDynamicGraphics.fillStyle(LEGACY_BOARD_SIGIL_CORNER_FACET_BASE, baseAlpha);
      this.boardDynamicGraphics.fillTriangle(originX, originY, edgeX, originY, originX, edgeY);
      this.boardDynamicGraphics.fillStyle(LEGACY_BOARD_SIGIL_CORNER_FACET_IRIS, baseAlpha * (0.38 + (wave * 0.28)));
      this.boardDynamicGraphics.fillTriangle(originX, originY, innerX, originY, originX, innerY);
      this.boardDynamicGraphics.fillStyle(LEGACY_BOARD_SIGIL_CORNER_FACET_PRISM, prismAlpha);
      this.boardDynamicGraphics.fillTriangle(originX, originY, prismX, originY, originX, prismY);
      this.boardDynamicGraphics.lineStyle(2, LEGACY_BOARD_SIGIL_CORNER_FACET_GLOW, glintAlpha);
      this.strokeLegacyPolyline(this.boardDynamicGraphics, [
        { x: glintX, y: cornerGlyph.y + (cornerGlyph.sy * 3) },
        { x: cornerGlyph.x + (cornerGlyph.sx * 3), y: glintY }
      ]);
      this.boardDynamicGraphics.lineStyle(1, LEGACY_BOARD_SIGIL_CORNER_FACET_PRISM, glintAlpha * 0.72);
      this.strokeLegacyPolyline(this.boardDynamicGraphics, [
        { x: glintX - (cornerGlyph.sx * 3), y: cornerGlyph.y + (cornerGlyph.sy * 6) },
        { x: cornerGlyph.x + (cornerGlyph.sx * 6), y: glintY - (cornerGlyph.sy * 3) }
      ]);
      this.boardDynamicGraphics.lineStyle(1, LEGACY_BOARD_SIGIL_CORNER_FACET_HOTSPOT, glintAlpha * 0.38);
      this.strokeLegacyPolyline(this.boardDynamicGraphics, [
        { x: glintX + (cornerGlyph.sx * 2), y: cornerGlyph.y + (cornerGlyph.sy * 5) },
        { x: cornerGlyph.x + (cornerGlyph.sx * 5), y: glintY + (cornerGlyph.sy * 2) }
      ]);
      this.boardDynamicGraphics.fillStyle(LEGACY_BOARD_SIGIL_CORNER_FACET_HOTSPOT, glintAlpha * 0.5);
      this.boardDynamicGraphics.fillCircle(
        cornerGlyph.x + (cornerGlyph.sx * (corner * (0.24 + (wave * 0.38)))),
        cornerGlyph.y + (cornerGlyph.sy * (corner * (0.24 + (wave * 0.38)))),
        1.1 + (wave * 1.2)
      );
      this.boardDynamicGraphics.lineStyle(1, LEGACY_BOARD_SIGIL_CORNER_FACET_HOTSPOT, glintAlpha * 0.46);
      this.strokeLegacyPolyline(this.boardDynamicGraphics, [
        { x: originX, y: originY },
        { x: cornerGlyph.x + (cornerGlyph.sx * (corner * 0.32)), y: cornerGlyph.y + (cornerGlyph.sy * (corner * 0.32)) }
      ]);
      this.boardDynamicGraphics.lineStyle(2, LEGACY_BOARD_SIGIL_CORNER_FACET_IRIS, baseAlpha * 0.78);
      this.strokeLegacyPolyline(this.boardDynamicGraphics, [
        { x: cornerGlyph.x + (cornerGlyph.sx * (corner * 0.34)), y: cornerGlyph.y + (cornerGlyph.sy * (corner * 0.76)) },
        { x: cornerGlyph.x + (cornerGlyph.sx * (corner * 0.76)), y: cornerGlyph.y + (cornerGlyph.sy * (corner * 0.34)) }
      ]);
      this.boardDynamicGraphics.lineStyle(1, LEGACY_BOARD_SIGIL_CORNER_FACET_HOTSPOT, glintAlpha * 0.62);
      this.strokeLegacyPolyline(this.boardDynamicGraphics, [
        { x: cornerGlyph.x + (cornerGlyph.sx * (corner * 0.16)), y: cornerGlyph.y + (cornerGlyph.sy * (corner * 0.84)) },
        { x: cornerGlyph.x + (cornerGlyph.sx * (corner * 0.84)), y: cornerGlyph.y + (cornerGlyph.sy * (corner * 0.16)) }
      ]);
    }
  }

  private strokeLegacyPolyline(
    graphics: Phaser.GameObjects.Graphics,
    points: Array<{ x: number; y: number }>
  ): void {
    const [first, ...rest] = points;
    if (!first) {
      return;
    }

    graphics.beginPath();
    graphics.moveTo(Math.round(first.x) + 0.5, Math.round(first.y) + 0.5);
    for (const point of rest) {
      graphics.lineTo(Math.round(point.x) + 0.5, Math.round(point.y) + 0.5);
    }
    graphics.strokePath();
  }

  private drawLegacyMenuDeconstructHandoffBurst(
    boardLeft: number,
    boardTop: number,
    boardSize: number,
    progress: number
  ): void {
    if (progress <= 0 || progress >= 1) {
      return;
    }

    const inset = 2;
    const left = boardLeft - inset;
    const top = boardTop - inset;
    const right = boardLeft + boardSize + inset;
    const bottom = boardTop + boardSize + inset;
    const centerX = boardLeft + (boardSize / 2);
    const centerY = boardTop + (boardSize / 2);
    const burstPoints = [
      { x: left, y: top },
      { x: centerX, y: top },
      { x: right, y: top },
      { x: right, y: centerY },
      { x: right, y: bottom },
      { x: centerX, y: bottom },
      { x: left, y: bottom },
      { x: left, y: centerY }
    ];

    for (let index = 0; index < burstPoints.length; index += 1) {
      const point = burstPoints[index];
      if (!point) {
        continue;
      }

      const localProgress = clamp((progress - (index * 0.045)) / 0.46, 0, 1);
      if (localProgress <= 0 || localProgress >= 1) {
        continue;
      }

      const alpha = Math.sin(localProgress * Math.PI) * 0.9;
      const radius = 3 + (localProgress * 7);
      const color = index % 2 === 0 ? LEGACY_MENU_DECONSTRUCT_BURST_COLOR : LEGACY_MENU_DECONSTRUCT_BURST_ALT;

      this.boardDynamicGraphics.fillStyle(color, alpha * 0.34);
      this.boardDynamicGraphics.fillCircle(point.x, point.y, Math.max(1.2, radius * 0.32));
      this.boardDynamicGraphics.lineStyle(1, color, alpha);
      this.strokeLegacyPolyline(this.boardDynamicGraphics, [
        { x: point.x - radius, y: point.y },
        { x: point.x + radius, y: point.y }
      ]);
      this.strokeLegacyPolyline(this.boardDynamicGraphics, [
        { x: point.x, y: point.y - radius },
        { x: point.x, y: point.y + radius }
      ]);
      this.boardDynamicGraphics.lineStyle(1, LEGACY_BOARD_SIGIL_BORDER_SECONDARY, alpha * 0.62);
      this.strokeLegacyPolyline(this.boardDynamicGraphics, [
        { x: point.x - (radius * 0.62), y: point.y - (radius * 0.62) },
        { x: point.x + (radius * 0.62), y: point.y + (radius * 0.62) }
      ]);
      this.strokeLegacyPolyline(this.boardDynamicGraphics, [
        { x: point.x + (radius * 0.62), y: point.y - (radius * 0.62) },
        { x: point.x - (radius * 0.62), y: point.y + (radius * 0.62) }
      ]);
    }
  }

  private drawDynamicBoard(time: number): void {
    const { boardLeft, boardTop, boardSize } = this.layout;
    this.boardDynamicGraphics.clear();

    const trail = this.mode === 'menu'
      ? this.trail
      : buildPathTrail(this.trail, this.settings.toggleTrailFade ? TRAIL_FADE_TAIL : null);
    const visibleTrail = trail.filter((point) => this.isLegacyMenuPointVisibleInStaticDraw(point));
    const menuTrailAlphaMultiplier = this.mode === 'menu'
      ? this.resolveLegacyMenuDeconstructTrailAlpha(time)
      : 1;
    const dynamicTrailPathSource = this.maze;
    const boardOffset = this.resolveBoardOffset();
    const resolvedBoardLeft = boardLeft + boardOffset.x;
    const resolvedBoardTop = boardTop + boardOffset.y;
    const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(
      resolvedBoardLeft,
      resolvedBoardTop,
      boardSize
    );
    const mazeLeft = mazeRenderFrame.boardLeft;
    const mazeTop = mazeRenderFrame.boardTop;
    const mazeTileSize = mazeRenderFrame.tileSize;
    const progressionPalette = this.resolveActiveLegacyProgressionPalette();
    const renderedPlayerPoint = this.resolveLegacyRenderedPlayerPoint(time);

    this.menuCompassBounds = null;
    this.drawLegacyBoardCornerFacetShimmer(resolvedBoardLeft, resolvedBoardTop, boardSize, time);
    this.drawLegacyProgressionBadge(mazeRenderFrame, progressionPalette);
    if (this.mode === 'menu' && this.overlay === 'none') {
      this.drawLegacyMenuCompass(mazeRenderFrame, progressionPalette, time);
    }

    if (this.maze.start && this.isLegacyMenuPointVisibleInStaticDraw(this.maze.start)) {
      this.fillPlayDynamicMarkerTile(this.maze.start, mazeLeft, mazeTop, mazeTileSize, 0.9, 'start');
    }
    if (this.maze.goal && this.isLegacyMenuPointVisibleInStaticDraw(this.maze.goal)) {
      this.fillPlayDynamicMarkerTile(this.maze.goal, mazeLeft, mazeTop, mazeTileSize, 0.95, 'goal');
    }

    for (let index = 0; index < visibleTrail.length; index += 1) {
      const point = visibleTrail[index];
      if (!point) {
        continue;
      }

      const shouldFadeTrailByAge = this.mode === 'play' || this.settings.toggleTrailFade;
      const alpha = shouldFadeTrailByAge
        ? this.mode === 'play'
          ? clamp(0.34 + ((index / Math.max(1, visibleTrail.length - 1)) * 0.66), 0.34, 1)
          : clamp(0.22 + ((index / Math.max(1, visibleTrail.length - 1)) * 0.82), 0.22, 1)
        : 0.94;
      const trailColor = resolveLegacyIridescentTrailColor(
        index,
        visibleTrail.length,
        time,
        progressionPalette.trailColor
      );
      const trailAlpha = this.settings.darkMode && this.mode === 'menu'
        ? clamp(alpha + 0.08, 0, 1)
        : alpha;
      const resolvedTrailAlpha = trailAlpha * menuTrailAlphaMultiplier;
      if (resolvedTrailAlpha <= 0) {
        continue;
      }
      if (this.mode === 'menu') {
        this.fillLegacyMenuDynamicPathTile(
          point,
          trailColor,
          mazeLeft,
          mazeTop,
          mazeTileSize,
          resolvedTrailAlpha,
          dynamicTrailPathSource
        );
        this.drawLegacyDynamicTrailBorderDock(
          point,
          trailColor,
          LEGACY_MENU_PATH_EDGE,
          LEGACY_MENU_PATH_EDGE_ALPHA,
          0.92,
          resolvedTrailAlpha,
          resolvedBoardLeft,
          resolvedBoardTop,
          boardSize,
          mazeLeft,
          mazeTop,
          mazeRenderFrame.boardSize,
          mazeTileSize,
          dynamicTrailPathSource
        );
      } else {
        this.fillLegacyPlayDynamicPathTile(
          point,
          trailColor,
          mazeLeft,
          mazeTop,
          mazeTileSize,
          resolvedTrailAlpha,
          dynamicTrailPathSource
        );
        this.drawLegacyDynamicTrailBorderDock(
          point,
          trailColor,
          LEGACY_PLAY_PATH_EDGE,
          LEGACY_PLAY_PATH_EDGE_ALPHA,
          0.96,
          resolvedTrailAlpha,
          resolvedBoardLeft,
          resolvedBoardTop,
          boardSize,
          mazeLeft,
          mazeTop,
          mazeRenderFrame.boardSize,
          mazeTileSize,
          dynamicTrailPathSource
        );
      }
    }

    if (this.mode === 'menu' && menuTrailAlphaMultiplier > 0 && this.menuStaticDrawLifecyclePhase !== 'deconstructing') {
      this.drawLegacyMenuAiMemoryOverlay(
        mazeLeft,
        mazeTop,
        mazeTileSize,
        menuTrailAlphaMultiplier,
        dynamicTrailPathSource,
        time
      );
    }

    if (this.settings.toggleTrailPulse) {
      if (menuTrailAlphaMultiplier > 0 && this.menuStaticDrawLifecyclePhase !== 'deconstructing') {
        this.drawLegacyPlayDynamicTrailPulse(
          visibleTrail,
        mazeLeft,
        mazeTop,
        resolvedBoardLeft,
        resolvedBoardTop,
        boardSize,
        mazeRenderFrame.boardSize,
        mazeTileSize,
        time,
        dynamicTrailPathSource,
          progressionPalette
        );
      }
    }

    const playerAlpha = this.resolveLegacyMenuDeconstructPlayerAlpha(time);
    if (this.mode === 'menu') {
      if (
        this.menuStaticDrawLifecyclePhase !== 'deconstructing'
        && this.isLegacyMenuPointVisibleInStaticDraw(this.player)
      ) {
        this.fillLegacyPlayerMarkerTile(renderedPlayerPoint, mazeLeft, mazeTop, mazeTileSize, 0.94 * playerAlpha, false, progressionPalette, time);
      }
    } else {
      if (
        playerAlpha > 0
        && this.menuStaticDrawLifecyclePhase !== 'building'
        && this.isLegacyMenuPointVisibleInStaticDraw(this.player)
      ) {
        this.fillLegacyPlayerMarkerTile(renderedPlayerPoint, mazeLeft, mazeTop, mazeTileSize, playerAlpha, true, progressionPalette, time);
      }
    }

    if (this.mode === 'menu' || this.mode === 'play') {
      this.drawLegacyMenuDeconstructHandoffBurst(
        boardLeft,
        boardTop,
        boardSize,
        this.resolveLegacyMenuDeconstructHandoffProgress(time)
      );
      this.drawLegacyMenuDeconstructHandoffBurst(
        boardLeft,
        boardTop,
        boardSize,
        this.resolveLegacyMenuBuildPrerollProgress(time)
      );
    }
    this.boardDynamicDirty = false;
  }

  private drawLegacyProgressionBadge(
    mazeRenderFrame: LegacyMazeRenderFrame,
    palette: LegacyProgressionPalette
  ): VisualRect | null {
    if (this.overlay !== 'none') {
      this.progressionBadgeBounds = null;
      this.progressionBadgeTextBounds = null;
      this.progressionBadgeTextFits = false;
      this.progressionBadgeText.setVisible(false);
      return null;
    }

    const text = this.resolveLegacyProgressionBadgeText(palette);
    const portraitPlay = this.mode === 'play' && this.layout.height > this.layout.width;
    const portraitPauseBounds = portraitPlay
      ? this.resolveLegacyPlayTouchControlLayout().controls.pause
      : null;
    const playLaneLeft = Math.max(9, mazeRenderFrame.boardLeft);
    const playLaneRight = portraitPauseBounds
      ? Math.max(playLaneLeft, portraitPauseBounds.left - 8)
      : this.layout.width - 9;
    const availableWidth = portraitPlay
      ? Math.max(160, playLaneRight - playLaneLeft)
      : Math.min(
        this.layout.width - 18,
        Math.round(mazeRenderFrame.boardSize + (mazeRenderFrame.safeInset * 2))
      );
    const statusLayout = resolveLegacyRunStatusPanelLayout(this.layout.width, availableWidth);
    const baseFontSize = statusLayout.fontSize;
    this.progressionBadgeText
      .setText(text)
      .setFontSize(baseFontSize)
      .setAlign('center')
      .setLineSpacing(statusLayout.lineSpacing)
      // Bitmap glyph descenders can paint beyond Phaser's logical line box on HiDPI phones.
      .setPadding(0, 0, 0, 8)
      .setColor(LEGACY_MENU_ACTION_GREEN);
    this.fitLegacyUiTextToWidth(
      this.progressionBadgeText,
      statusLayout.width - statusLayout.horizontalPadding,
      baseFontSize,
      9
    );
    const width = statusLayout.width;
    const height = statusLayout.height;
    const centerX = portraitPlay
      ? Math.round(playLaneLeft + ((playLaneRight - playLaneLeft) / 2))
      : mazeRenderFrame.boardLeft + (mazeRenderFrame.boardSize / 2);
    const centerY = this.mode === 'play'
      ? this.resolveLegacyPlayProgressionBadgeCenterY(mazeRenderFrame, height)
      : this.resolveLegacyMenuProgressionBadgeCenterY(mazeRenderFrame, height);

    this.drawLegacyCyberPanel(this.boardDynamicGraphics, {
      active: true,
      alpha: 0.42,
      fill: LEGACY_PLAY_HUD_TIMER_PANE,
      height,
      left: centerX - (width / 2),
      radius: 7,
      top: centerY - (height / 2),
      width
    });
    this.boardDynamicGraphics.lineStyle(1, palette.rankColor, 0.72);
    this.boardDynamicGraphics.strokeRoundedRect(centerX - (width / 2), centerY - (height / 2), width, height, 7);
    this.progressionBadgeText
      .setPosition(centerX, centerY)
      .setVisible(true);

    const badgeBounds = createVisualRect(centerX - (width / 2), centerY - (height / 2), width, height);
    const rawTextBounds = this.progressionBadgeText.getBounds();
    const textBounds = createVisualRect(rawTextBounds.x, rawTextBounds.y, rawTextBounds.width, rawTextBounds.height);
    this.progressionBadgeBounds = badgeBounds;
    this.progressionBadgeTextBounds = textBounds;
    this.progressionBadgeTextFits = textBounds.left >= badgeBounds.left + 4
      && textBounds.right <= badgeBounds.right - 4
      && textBounds.top >= badgeBounds.top + 2
      && textBounds.bottom <= badgeBounds.bottom - 2;

    return badgeBounds;
  }

  private resolveLegacyMenuProgressionBadgeCenterY(
    mazeRenderFrame: LegacyMazeRenderFrame,
    height: number
  ): number {
    if (this.layout.lanes.rank !== null) {
      return Math.round(this.layout.lanes.rank.top + (height / 2));
    }

    const outerInset = Math.max(0, (this.layout.boardSize - mazeRenderFrame.boardSize) / 2);
    const boardBottom = mazeRenderFrame.boardTop + mazeRenderFrame.boardSize + outerInset;
    const authenticatedStack = this.authSnapshot.status === 'authenticated'
      ? resolveLegacyAuthenticatedMenuButtonStack(this.layout)
      : null;
    const firstButtonCenterY = authenticatedStack?.startButtonY ?? this.layout.centerButtonY;
    const buttonTop = firstButtonCenterY - (this.layout.buttonHeight / 2);
    const availableGap = Math.max(0, buttonTop - boardBottom);
    const badgeGap = clampInteger(Math.round(Math.min(mazeRenderFrame.tileSize * 0.95, availableGap * 0.22)), 5, 10);
    const buttonGap = clampInteger(Math.round(Math.min(mazeRenderFrame.tileSize * 1.05, availableGap * 0.26)), 6, 12);
    const minimumCenterY = boardBottom + badgeGap + (height / 2);
    const maximumCenterY = buttonTop - buttonGap - (height / 2);

    return maximumCenterY >= minimumCenterY
      ? Math.round((minimumCenterY + maximumCenterY) / 2)
      : minimumCenterY;
  }

  private resolveLegacyPlayProgressionBadgeCenterY(
    mazeRenderFrame: LegacyMazeRenderFrame,
    height: number
  ): number {
    if (this.layout.lanes.hud !== null) {
      const laneCenter = this.layout.lanes.hud.top + (this.layout.lanes.hud.height / 2);
      const minimumCenter = 4 + (height / 2);
      const maximumCenter = mazeRenderFrame.boardTop - 4 - (height / 2);
      return Math.round(Math.max(minimumCenter, Math.min(laneCenter, maximumCenter)));
    }

    const mazeGap = clampInteger(Math.round(mazeRenderFrame.tileSize * 2.4), 16, 28);
    const minimumTop = this.layout.height > this.layout.width ? 8 : 10;
    const maximumTopBeforeMaze = mazeRenderFrame.boardTop - mazeGap - height;
    const top = Math.max(4, Math.min(minimumTop, maximumTopBeforeMaze));

    return Math.round(top + (height / 2));
  }

  private formatLegacyElapsedLabel(elapsedMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  private resolveLegacyMenuAiElapsedMs(): number {
    if (this.mode !== 'menu') {
      return 0;
    }

    const activeTrack = this.progressionState.tracks['ai-runner'];
    if (
      this.menuStaticDrawLifecyclePhase === 'settled'
      && this.menuStaticDrawRowsVisible === null
      && this.menuStaticDrawTilesVisible === null
      && !this.menuDemoCycleRecorded
    ) {
      return Math.max(0, Math.round(this.time.now - this.menuDemoCycleStartedAtMs));
    }

    return activeTrack.lastCompletionTimeMs ?? 0;
  }

  private resolveLegacyPlayElapsedMs(): number {
    return this.mode === 'play'
      ? Math.max(0, Math.round(this.time.now - this.playStartedAtMs))
      : 0;
  }

  private resolveLegacyProgressionBadgeText(_palette: LegacyProgressionPalette): string {
    const menu = this.mode === 'menu';
    const track = this.progressionState.tracks[menu ? 'ai-runner' : 'player'];
    const timerLabel = this.formatLegacyElapsedLabel(
      menu ? this.resolveLegacyMenuAiElapsedMs() : this.resolveLegacyPlayElapsedMs()
    );
    const rankLabel = `${menu ? 'AI ' : ''}Rank: ${track.rank}`;
    const score = clampInteger(Math.round(track.paceScore), 0, 100);

    return `${timerLabel}  ${rankLabel}\nScore: ${score}/100  Maze Lvl: ${track.level}`;
  }

  private drawLegacyMenuCompass(
    mazeRenderFrame: LegacyMazeRenderFrame,
    palette: LegacyProgressionPalette,
    time: number
  ): void {
    const boardLeft = mazeRenderFrame.boardLeft - mazeRenderFrame.safeInset;
    const boardTop = mazeRenderFrame.boardTop - mazeRenderFrame.safeInset;
    const boardSize = mazeRenderFrame.boardSize + (mazeRenderFrame.safeInset * 2);
    const notchBounds = this.resolveLegacyBoardTopCenterNotchBounds(boardLeft, boardTop, boardSize);
    const size = clampInteger(
      Math.round(Math.min(
        notchBounds.width * 0.56,
        notchBounds.height * 0.68,
        mazeRenderFrame.tileSize * 2.15
      )),
      14,
      22
    );
    const centerX = notchBounds.centerX;
    const centerY = Math.round(notchBounds.top + (notchBounds.height * 0.43));
    this.menuCompassBounds = createVisualRect(centerX - (size / 2), centerY - (size / 2), size, size);
    const renderedPlayerPoint = this.resolveLegacyRenderedPlayerPoint(time);
    const playerScreen = {
      x: mazeRenderFrame.boardLeft + ((renderedPlayerPoint.x + 0.5) * mazeRenderFrame.tileSize),
      y: mazeRenderFrame.boardTop + ((renderedPlayerPoint.y + 0.5) * mazeRenderFrame.tileSize)
    };
    const goalScreen = {
      x: mazeRenderFrame.boardLeft + ((this.maze.goal.x + 0.5) * mazeRenderFrame.tileSize),
      y: mazeRenderFrame.boardTop + ((this.maze.goal.y + 0.5) * mazeRenderFrame.tileSize)
    };
    const isLifecycleSpinActive = this.menuStaticDrawLifecyclePhase === 'building'
      || this.menuStaticDrawLifecyclePhase === 'deconstructing';
    const goalAngle = Math.atan2(goalScreen.y - playerScreen.y, goalScreen.x - playerScreen.x);
    const angle = isLifecycleSpinActive
      ? (time / 130) % (Math.PI * 2)
      : goalAngle;
    this.drawLegacyCompassGlyph(
      this.boardDynamicGraphics,
      centerX,
      centerY,
      size,
      angle,
      palette,
      time,
      isLifecycleSpinActive
    );
  }

  private drawLegacyCompassGlyph(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    size: number,
    angle: number,
    palette: LegacyProgressionPalette,
    time: number,
    isLifecycleSpinActive: boolean
  ): void {
    const pulse = 0.5 + (0.5 * Math.sin(time / 380));
    const arrowLength = Math.max(8, size * 0.58);
    const wing = Math.max(3, size * 0.26);
    const tailLength = Math.max(4, size * 0.34);
    const tip = {
      x: centerX + (Math.cos(angle) * arrowLength),
      y: centerY + (Math.sin(angle) * arrowLength)
    };
    const tail = {
      x: centerX - (Math.cos(angle) * tailLength),
      y: centerY - (Math.sin(angle) * tailLength)
    };
    const left = {
      x: centerX + (Math.cos(angle + 2.36) * wing),
      y: centerY + (Math.sin(angle + 2.36) * wing)
    };
    const right = {
      x: centerX + (Math.cos(angle - 2.36) * wing),
      y: centerY + (Math.sin(angle - 2.36) * wing)
    };
    const hubRadius = Math.max(2, size * 0.16);

    graphics.lineStyle(1, palette.rankColor, (isLifecycleSpinActive ? 0.5 : 0.34) + (pulse * 0.22));
    graphics.beginPath();
    graphics.moveTo(centerX - (size * 0.43), centerY - (size * 0.08));
    graphics.lineTo(centerX, centerY + (size * 0.38));
    graphics.lineTo(centerX + (size * 0.43), centerY - (size * 0.08));
    graphics.strokePath();
    graphics.fillStyle(LEGACY_PLAY_HUD_ARROW, 0.14 + (pulse * 0.12));
    graphics.fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
    graphics.lineStyle(2, LEGACY_PLAY_HUD_ARROW_SHADOW, 0.32);
    graphics.beginPath();
    graphics.moveTo(tail.x + 1, tail.y + 1);
    graphics.lineTo(centerX + 1, centerY + 1);
    graphics.lineTo(tip.x + 1, tip.y + 1);
    graphics.strokePath();
    graphics.lineStyle(2, LEGACY_PLAY_HUD_ARROW, 0.86);
    graphics.beginPath();
    graphics.moveTo(tail.x, tail.y);
    graphics.lineTo(centerX, centerY);
    graphics.lineTo(tip.x, tip.y);
    graphics.strokePath();
    graphics.fillStyle(LEGACY_PLAY_HUD_ARROW, 0.78);
    graphics.fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
    graphics.fillStyle(LEGACY_PLAY_GOAL_MARKER_CORE, 0.82);
    graphics.fillTriangle(centerX, centerY - hubRadius, centerX + hubRadius, centerY, centerX, centerY + hubRadius);
    graphics.fillTriangle(centerX, centerY - hubRadius, centerX - hubRadius, centerY, centerX, centerY + hubRadius);
  }

  private resolveBoardOffset(): Phaser.Math.Vector2 {
    if (this.mode !== 'play' || !this.settings.toggleCameraFollow) {
      return new Phaser.Math.Vector2(0, 0);
    }

    const xRatio = this.player.x / Math.max(1, this.maze.size - 1);
    const yRatio = this.player.y / Math.max(1, this.maze.size - 1);
    const offsetX = Math.round((0.5 - xRatio) * Math.min(42, this.layout.tileSize * 4));
    const offsetY = Math.round((0.5 - yRatio) * Math.min(42, this.layout.tileSize * 4));
    return new Phaser.Math.Vector2(offsetX, offsetY);
  }

  private fillLegacyMenuDynamicPathTile(
    point: LegacyPoint,
    color: number,
    originX: number,
    originY: number,
    tileSize: number,
    alpha: number,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'size'>
  ): void {
    this.fillLegacyDynamicPathTile(
      point,
      color,
      originX,
      originY,
      tileSize,
      alpha,
      pathSource,
      LEGACY_MENU_PATH_EDGE,
      LEGACY_MENU_PATH_EDGE_ALPHA,
      0.92
    );
  }

  private resolveLegacyMenuAiMemoryPoints(): {
    choiceClass: DemoWalkerChoiceClass | null;
    confidence: number;
    optionPoints: LegacyPoint[];
    targetPoint: LegacyPoint | null;
    thoughtState: DemoWalkerThoughtState;
  } {
    if (this.mode !== 'menu' || this.menuDemoState === null || this.menuDemoEpisode === null) {
      return {
        choiceClass: null,
        confidence: 0,
        optionPoints: [],
        targetPoint: null,
        thoughtState: 'scanning'
      };
    }

    const aiMemory = this.menuDemoState.aiMemory;
    const width = this.menuDemoEpisode.raster.width;
    const targetIndex = aiMemory.targetIndex;
    const endIndex = this.menuDemoEpisode.raster.endIndex;
    const targetPoint = targetIndex === null || targetIndex === endIndex
      ? null
      : resolveLegacyPointFromDemoIndex(targetIndex, width);
    const targetKey = targetPoint ? legacyScenePointKey(targetPoint) : null;
    const seen = new Set<string>();
    const optionPoints: LegacyPoint[] = [];

    for (const optionIndex of aiMemory.optionIndices) {
      const optionPoint = resolveLegacyPointFromDemoIndex(optionIndex, width);
      const key = legacyScenePointKey(optionPoint);
      if (
        key === targetKey
        || seen.has(key)
        || !this.isLegacyMenuPointVisibleInStaticDraw(optionPoint)
      ) {
        continue;
      }
      seen.add(key);
      optionPoints.push(optionPoint);
    }

    return {
      choiceClass: aiMemory.choiceClass,
      confidence: aiMemory.confidence,
      optionPoints,
      targetPoint: targetPoint && this.isLegacyMenuPointVisibleInStaticDraw(targetPoint)
        ? targetPoint
        : null,
      thoughtState: aiMemory.thoughtState
    };
  }

  private resolveLegacyMenuAiThoughtStyle(
    thoughtState: DemoWalkerThoughtState,
    choiceClass: DemoWalkerChoiceClass | null,
    confidence: number
  ): {
    coreColor: number;
    edgeColor: number;
    pulseScale: number;
  } {
    const confidenceScale = clamp(confidence / 100, 0, 1);
    const isHighConfidenceTarget = thoughtState === 'goal-confirming'
      || thoughtState === 'committing'
      || thoughtState === 'shortcut-testing'
      || choiceClass === 'shortcut-looking';
    return {
      coreColor: LEGACY_MENU_AI_MEMORY_TARGET_CORE,
      edgeColor: LEGACY_MENU_AI_MEMORY_TARGET_EDGE,
      pulseScale: (isHighConfidenceTarget ? 1.02 : 0.82) + (confidenceScale * 0.16)
    };
  }

  private drawLegacyMenuAiMemoryOverlay(
    originX: number,
    originY: number,
    tileSize: number,
    alphaMultiplier: number,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'size'>,
    time: number
  ): void {
    const { choiceClass, confidence, optionPoints, targetPoint, thoughtState } = this.resolveLegacyMenuAiMemoryPoints();
    const optionAlpha = clamp(0.34 + (0.08 * Math.sin(time / 240)), 0.28, 0.44) * alphaMultiplier;
    for (const point of optionPoints) {
      this.fillLegacyDynamicPathTile(
        point,
        LEGACY_MENU_AI_MEMORY_OPTION_CORE,
        originX,
        originY,
        tileSize,
        optionAlpha,
        pathSource,
        LEGACY_MENU_AI_MEMORY_OPTION_EDGE,
        0.72,
        0.72
      );
    }

    if (targetPoint === null) {
      return;
    }

    const thoughtStyle = this.resolveLegacyMenuAiThoughtStyle(thoughtState, choiceClass, confidence);
    const targetPulse = 0.5 + (0.5 * Math.sin(time / 150));
    this.drawLegacyPathMaterialTile(
      this.boardDynamicGraphics,
      targetPoint,
      pathSource,
      originX,
      originY,
      tileSize,
      {
        coreAlpha: clamp(0.7 + (targetPulse * 0.22 * thoughtStyle.pulseScale), 0.62, 0.96) * alphaMultiplier,
        coreColor: thoughtStyle.coreColor,
        cueAlpha: clamp(0.56 + (targetPulse * 0.24 * thoughtStyle.pulseScale), 0.52, 0.92) * alphaMultiplier,
        cueColor: thoughtStyle.edgeColor,
        drawCue: true,
        edgeAlpha: clamp(0.66 + (targetPulse * 0.22 * thoughtStyle.pulseScale), 0.58, 0.94) * alphaMultiplier,
        edgeColor: thoughtStyle.edgeColor
      }
    );
  }

  private fillLegacyPlayDynamicPathTile(
    point: LegacyPoint,
    color: number,
    originX: number,
    originY: number,
    tileSize: number,
    alpha: number,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'size'>
  ): void {
    this.fillLegacyDynamicPathTile(
      point,
      color,
      originX,
      originY,
      tileSize,
      alpha,
      pathSource,
      LEGACY_PLAY_PATH_EDGE,
      LEGACY_PLAY_PATH_EDGE_ALPHA,
      0.96
    );
  }

  private drawLegacyPlayDynamicTrailPulse(
    trail: readonly LegacyPoint[],
    originX: number,
    originY: number,
    boardLeft: number,
    boardTop: number,
    boardSize: number,
    mazeSize: number,
    tileSize: number,
    time: number,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'size'>,
    palette: LegacyProgressionPalette
  ): void {
    if (trail.length < 2) {
      return;
    }

    const pulseCenterIndex = resolveLegacyTrailShineMotion({
      timeMs: time,
      trailLength: trail.length,
      oneWayPeriodMs: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS
    }).centerIndex;

    for (let index = trail.length - 1; index >= 0; index -= 1) {
      const point = trail[index];
      if (!point) {
        continue;
      }

      const distance = Math.abs(index - pulseCenterIndex);
      if (distance > LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_WINDOW) {
        continue;
      }

      const falloff = smoothstep(1 - (distance / LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_WINDOW));
      const alpha = clamp(0.14 + (falloff * 0.62), 0.14, 0.76);
      const pulseColor = resolveLegacyIridescentPulseColor(index, trail.length, time, palette.trailPulseColor);
      const pulseEdgeColor = resolveLegacyIridescentPulseColor(
        index + 2,
        trail.length + 3,
        time + 340,
        palette.trailPulseEdgeColor
      );
      this.fillLegacyDynamicPathTile(
        point,
        pulseColor,
        originX,
        originY,
        tileSize,
        alpha,
        pathSource,
        pulseEdgeColor,
        LEGACY_PLAY_PATH_EDGE_ALPHA,
        0.96
      );
      this.drawLegacyDynamicTrailBorderDock(
        point,
        pulseColor,
        pulseEdgeColor,
        LEGACY_PLAY_PATH_EDGE_ALPHA,
        0.96,
        alpha,
        boardLeft,
        boardTop,
        boardSize,
        originX,
        originY,
        mazeSize,
        tileSize,
        pathSource
      );
    }
  }

  private drawLegacyDynamicTrailBorderDock(
    point: LegacyPoint,
    color: number,
    edgeColor: number,
    edgeAlpha: number,
    coreAlphaMax: number,
    alpha: number,
    boardLeft: number,
    boardTop: number,
    boardSize: number,
    mazeLeft: number,
    mazeTop: number,
    mazeSize: number,
    tileSize: number,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'size'>
  ): void {
    this.drawLegacyPathBorderDock(
      this.boardDynamicGraphics,
      point,
      pathSource,
      boardLeft,
      boardTop,
      boardSize,
      mazeLeft,
      mazeTop,
      mazeSize,
      tileSize,
      {
        coreAlpha: Math.min(coreAlphaMax, coreAlphaMax * alpha),
        coreColor: color,
        edgeAlpha: Math.min(edgeAlpha, edgeAlpha * alpha),
        edgeColor
      }
    );
  }

  private fillLegacyDynamicPathTile(
    point: LegacyPoint,
    color: number,
    originX: number,
    originY: number,
    tileSize: number,
    alpha: number,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'size'>,
    edgeColor: number,
    edgeAlpha: number,
    coreAlphaMax: number
  ): void {
    this.drawLegacyPathMaterialTile(
      this.boardDynamicGraphics,
      point,
      pathSource,
      originX,
      originY,
      tileSize,
      {
        coreAlpha: Math.min(coreAlphaMax, coreAlphaMax * alpha),
        coreColor: color,
        edgeAlpha: Math.min(edgeAlpha, edgeAlpha * alpha),
        edgeColor
      }
    );
  }

  private fillPlayDynamicMarkerTile(
    point: LegacyPoint,
    originX: number,
    originY: number,
    tileSize: number,
    alpha: number,
    kind: 'start' | 'goal'
  ): void {
    const centerX = originX + ((point.x + 0.5) * tileSize);
    const centerY = originY + ((point.y + 0.5) * tileSize);
    this.drawLegacyEndpointMarker(
      this.boardDynamicGraphics,
      centerX,
      centerY,
      tileSize,
      alpha,
      kind
    );
  }

  private drawLegacyEndpointMarker(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    tileSize: number,
    alpha: number,
    kind: 'start' | 'goal'
  ): void {
    const markerMetrics = resolveLegacyEndpointMarkerRenderMetrics(tileSize);
    const shadowRadius = Math.min(tileSize * 0.52, markerMetrics.outerRadius + markerMetrics.strokeWidth);

    graphics.fillStyle(LEGACY_PLAYER_MARKER_SHADOW, Math.min(0.48, alpha * 0.48));
    graphics.fillCircle(centerX, centerY, shadowRadius);
    graphics.lineStyle(markerMetrics.strokeWidth, kind === 'goal' ? LEGACY_PLAY_GOAL_MARKER_EDGE : LEGACY_PLAY_START_MARKER_EDGE, Math.min(0.96, alpha));
    graphics.strokeCircle(centerX, centerY, markerMetrics.outerRadius);

    if (kind === 'goal') {
      graphics.fillStyle(LEGACY_PLAY_GOAL_MARKER_EDGE, Math.min(0.86, alpha * 0.86));
      graphics.beginPath();
      graphics.moveTo(centerX, centerY - markerMetrics.outerRadius);
      graphics.lineTo(centerX + markerMetrics.outerRadius, centerY);
      graphics.lineTo(centerX, centerY + markerMetrics.outerRadius);
      graphics.lineTo(centerX - markerMetrics.outerRadius, centerY);
      graphics.closePath();
      graphics.fillPath();
      graphics.fillStyle(LEGACY_PLAY_GOAL_MARKER_CORE, alpha);
      graphics.fillCircle(centerX, centerY, markerMetrics.coreRadius);
      return;
    }

    graphics.fillStyle(LEGACY_PLAY_START_MARKER_CORE, alpha);
    graphics.fillCircle(centerX, centerY, markerMetrics.coreRadius);
  }

  private fillLegacyPlayerMarkerTile(
    point: LegacyPoint,
    originX: number,
    originY: number,
    tileSize: number,
    alpha: number,
    showLocatorTicks: boolean,
    _palette: LegacyProgressionPalette,
    time: number
  ): void {
    const centerX = originX + ((point.x + 0.5) * tileSize);
    const centerY = originY + ((point.y + 0.5) * tileSize);
    const playerMetrics = resolveLegacyPlayerMarkerRenderMetrics(
      tileSize,
      showLocatorTicks ? LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO : LEGACY_PLAYER_MARKER_RADIUS_RATIO,
      showLocatorTicks ? LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO : LEGACY_PLAYER_MARKER_HALO_RATIO,
      showLocatorTicks ? LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO : undefined,
      showLocatorTicks ? LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO : undefined
    );

    const shadowRadius = Math.min(tileSize * 0.5, playerMetrics.haloRadius + playerMetrics.strokeWidth);

    this.boardDynamicGraphics.fillStyle(LEGACY_PLAYER_MARKER_SHADOW, Math.min(0.36, alpha * 0.36));
    this.boardDynamicGraphics.fillCircle(centerX, centerY, shadowRadius);
    const playerCoreColor = resolveLegacyIridescentPlayerCoreColor();
    const iridescentAccentColor = resolveLegacyIridescentPlayerAccentColor(time, playerCoreColor);
    const beaconPhase = (Math.sin((time / LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS) * Math.PI * 2) + 1) / 2;
    const beaconRadiusOffset = showLocatorTicks
      ? tileSize * (0.18 + (beaconPhase * 0.1))
      : tileSize * (LEGACY_MENU_AI_BEACON_RADIUS_RATIO + (beaconPhase * 0.08));
    const beaconRadius = playerMetrics.haloRadius + playerMetrics.strokeWidth + beaconRadiusOffset;
    const beaconAlpha = showLocatorTicks
      ? Math.min(0.74, alpha * (0.34 + (beaconPhase * 0.28)))
      : Math.min(0.5, alpha * LEGACY_MENU_AI_BEACON_ALPHA_RATIO * (0.34 + (beaconPhase * 0.22)));

    this.boardDynamicGraphics.lineStyle(
      Math.max(1, playerMetrics.strokeWidth * (showLocatorTicks ? 0.76 : 0.58)),
      LEGACY_PLAY_PLAYER_BEACON_COLOR,
      beaconAlpha
    );
    this.boardDynamicGraphics.strokeCircle(centerX, centerY, beaconRadius);
    this.boardDynamicGraphics.lineStyle(
      Math.max(1, playerMetrics.strokeWidth * (showLocatorTicks ? 0.42 : 0.32)),
      LEGACY_PLAY_PLAYER_BEACON_ACCENT,
      Math.min(showLocatorTicks ? 0.52 : 0.34, beaconAlpha * 0.7)
    );
    this.boardDynamicGraphics.strokeCircle(centerX, centerY, beaconRadius + Math.max(1, tileSize * 0.08));

    this.boardDynamicGraphics.lineStyle(playerMetrics.strokeWidth, LEGACY_PLAY_PLAYER_BEACON_ACCENT, Math.min(0.95, alpha * 0.95));
    this.boardDynamicGraphics.strokeCircle(centerX, centerY, playerMetrics.haloRadius + playerMetrics.strokeWidth);
    this.boardDynamicGraphics.fillStyle(LEGACY_PLAY_PLAYER_BEACON_COLOR, Math.min(showLocatorTicks ? 0.88 : 0.78, alpha * (showLocatorTicks ? 0.88 : 0.78)));
    this.boardDynamicGraphics.fillCircle(centerX, centerY, playerMetrics.haloRadius);
    this.boardDynamicGraphics.fillStyle(playerCoreColor, alpha);
    this.boardDynamicGraphics.beginPath();
    this.boardDynamicGraphics.moveTo(centerX, centerY - playerMetrics.coreRadius);
    this.boardDynamicGraphics.lineTo(centerX + playerMetrics.coreRadius, centerY);
    this.boardDynamicGraphics.lineTo(centerX, centerY + playerMetrics.coreRadius);
    this.boardDynamicGraphics.lineTo(centerX - playerMetrics.coreRadius, centerY);
    this.boardDynamicGraphics.closePath();
    this.boardDynamicGraphics.fillPath();
    this.boardDynamicGraphics.lineStyle(
      Math.max(1, playerMetrics.strokeWidth * 0.58),
      showLocatorTicks ? LEGACY_PLAY_PLAYER_BEACON_ACCENT : iridescentAccentColor,
      Math.min(0.86, alpha * 0.86)
    );
    this.boardDynamicGraphics.strokePath();

    if (!showLocatorTicks) {
      return;
    }

    const locatorMetrics = resolveLegacyPlayerLocatorRenderMetrics(
      tileSize,
      playerMetrics.haloRadius,
      playerMetrics.strokeWidth
    );
    const drawLocatorTick = (startX: number, startY: number, endX: number, endY: number): void => {
      this.boardDynamicGraphics.beginPath();
      this.boardDynamicGraphics.moveTo(startX, startY);
      this.boardDynamicGraphics.lineTo(endX, endY);
      this.boardDynamicGraphics.strokePath();
    };

    this.boardDynamicGraphics.lineStyle(locatorMetrics.strokeWidth, LEGACY_PLAY_PLAYER_BEACON_ACCENT, Math.min(0.96, alpha * 0.96));
    drawLocatorTick(centerX - locatorMetrics.outerRadius, centerY, centerX - locatorMetrics.innerRadius, centerY);
    drawLocatorTick(centerX + locatorMetrics.innerRadius, centerY, centerX + locatorMetrics.outerRadius, centerY);
    drawLocatorTick(centerX, centerY - locatorMetrics.outerRadius, centerX, centerY - locatorMetrics.innerRadius);
    drawLocatorTick(centerX, centerY + locatorMetrics.innerRadius, centerX, centerY + locatorMetrics.outerRadius);
  }

  private syncLegacyPlayerVisualMotionTo(
    point: LegacyPoint,
    snapReason: LegacyPlayerVisualMotionSnapReason = null
  ): void {
    this.playerVisualMotion = {
      durationMs: 0,
      from: copyPoint(point),
      startedAtMs: this.time.now,
      to: copyPoint(point)
    };
    this.lastPlayerVisualMotionSnapReason = snapReason;
  }

  private armLegacyPlayerVisualMotion(
    from: LegacyPoint,
    to: LegacyPoint,
    time: number,
    durationMs: number
  ): void {
    if (from.x === to.x && from.y === to.y) {
      this.syncLegacyPlayerVisualMotionTo(to);
      return;
    }

    if (this.isLegacyPlayerVisualWrapMove(from, to)) {
      this.syncLegacyPlayerVisualMotionTo(to, 'wrapped-step');
      return;
    }

    this.playerVisualMotion = {
      durationMs: Math.max(1, Math.round(durationMs)),
      from: copyPoint(from),
      startedAtMs: time,
      to: copyPoint(to)
    };
    this.lastPlayerVisualMotionSnapReason = null;
  }

  private isLegacyPlayerVisualWrapMove(from: LegacyPoint, to: LegacyPoint): boolean {
    return isLegacyWrappedStepTransition(from, to);
  }

  private resolveLegacyIridescentMaterialDiagnostics(
    time: number,
    palette: LegacyProgressionPalette
  ): LegacyIridescentMaterialDiagnostics {
    const playerCoreColor = resolveLegacyIridescentPlayerCoreColor();
    const trailLength = Math.max(1, this.trail.length);
    const trailTailIndex = 0;
    const trailHeadIndex = Math.max(0, this.trail.length - 1);

    return {
      minPathColorDistance: LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE,
      playerAccentColor: resolveLegacyIridescentPlayerAccentColor(time, playerCoreColor),
      playerCoreColor,
      playerHaloShiftColor: resolveLegacyIridescentPlayerHaloColor(time, palette.playerHaloColor),
      pulseHeadColor: resolveLegacyIridescentPulseColor(trailHeadIndex, trailLength, time, palette.trailPulseColor),
      pulseTailColor: resolveLegacyIridescentPulseColor(trailTailIndex, trailLength, time, palette.trailPulseEdgeColor),
      shineHeadColor: resolveLegacyIridescentPulseColor(trailHeadIndex, trailLength, time, palette.trailPulseColor),
      shineTailColor: resolveLegacyIridescentPulseColor(trailTailIndex, trailLength, time, palette.trailPulseEdgeColor),
      shiftPeriodMs: {
        playerAccent: 4200,
        playerHalo: 3600,
        pulse: 2600,
        trail: 7200
      },
      trailHeadColor: resolveLegacyIridescentTrailColor(trailHeadIndex, trailLength, time, palette.trailColor),
      trailTailColor: resolveLegacyIridescentTrailColor(trailTailIndex, trailLength, time, palette.trailColor)
    };
  }

  private hasLegacyPlayerVisualMotionPendingFrame(time: number): boolean {
    if (this.playerVisualMotion === null) {
      return false;
    }

    return time < this.playerVisualMotion.startedAtMs + this.playerVisualMotion.durationMs;
  }

  private resolveLegacyRenderedPlayerPoint(time: number): LegacyPoint {
    const motion = this.playerVisualMotion;
    if (motion === null || motion.durationMs <= 0) {
      return copyPoint(this.player);
    }

    const progress = clamp((time - motion.startedAtMs) / motion.durationMs, 0, 1);
    if (progress >= 1) {
      return copyPoint(motion.to);
    }

    const eased = smoothstep(progress);
    return {
      x: motion.from.x + ((motion.to.x - motion.from.x) * eased),
      y: motion.from.y + ((motion.to.y - motion.from.y) * eased)
    };
  }

  private drawLegacyCyberPanel(
    graphics: Phaser.GameObjects.Graphics,
    rect: {
      active?: boolean;
      alpha?: number;
      fill?: number;
      height: number;
      left: number;
      radius?: number;
      stroke?: number;
      strokeAlt?: number;
      top: number;
      width: number;
    }
  ): void {
    const alpha = rect.alpha ?? 0.48;
    const panelRect = snapCyberArcadeRect(rect);
    const { height, left, top, width } = panelRect;
    const radius = this.resolveLegacyRoundedRectRadius(width, height, rect.radius ?? 10);
    const active = rect.active ?? false;
    const corner = Math.max(7, Math.min(16, Math.round(Math.min(width, height) * 0.28)));
    const inset = 4;

    graphics.fillStyle(LEGACY_CYBER_PANEL_SHADOW, Math.min(0.42, alpha * 0.42));
    graphics.fillRoundedRect(left + 2, top + 3, width, height, radius);
    graphics.fillStyle(rect.fill ?? LEGACY_CYBER_PANEL_FILL, alpha);
    graphics.fillRoundedRect(left, top, width, height, radius);
    const stroke = rect.stroke ?? LEGACY_CYBER_PANEL_STROKE;
    const strokeAlt = rect.strokeAlt ?? LEGACY_CYBER_PANEL_STROKE_ALT;
    const outerStrokeWidth = active ? 2 : 1;
    const outerStrokeInset = outerStrokeWidth % 2 === 1 ? 0.5 : 0;
    graphics.lineStyle(outerStrokeWidth, stroke, active ? 0.86 : 0.5);
    graphics.strokeRoundedRect(
      left + outerStrokeInset,
      top + outerStrokeInset,
      Math.max(1, width - (outerStrokeInset * 2)),
      Math.max(1, height - (outerStrokeInset * 2)),
      Math.max(1, radius - outerStrokeInset)
    );
    graphics.lineStyle(1, strokeAlt, active ? 0.34 : 0.2);
    graphics.strokeRoundedRect(
      snapCyberArcadeStrokeCoordinate(left + inset),
      snapCyberArcadeStrokeCoordinate(top + inset),
      Math.max(1, width - (inset * 2) - 1),
      Math.max(1, height - (inset * 2) - 1),
      Math.max(2, radius - 4)
    );

    const cornerStrokeWidth = active ? 2 : 1;
    const cornerStrokeOffset = cornerStrokeWidth % 2 === 1 ? 0.5 : 0;
    graphics.lineStyle(cornerStrokeWidth, active ? strokeAlt : stroke, active ? 0.9 : 0.62);
    graphics.beginPath();
    graphics.moveTo(left + inset + cornerStrokeOffset, top + corner + cornerStrokeOffset);
    graphics.lineTo(left + inset + cornerStrokeOffset, top + inset + cornerStrokeOffset);
    graphics.lineTo(left + corner + cornerStrokeOffset, top + inset + cornerStrokeOffset);
    graphics.moveTo(left + width - corner - cornerStrokeOffset, top + inset + cornerStrokeOffset);
    graphics.lineTo(left + width - inset - cornerStrokeOffset, top + inset + cornerStrokeOffset);
    graphics.lineTo(left + width - inset - cornerStrokeOffset, top + corner + cornerStrokeOffset);
    graphics.moveTo(left + inset + cornerStrokeOffset, top + height - corner - cornerStrokeOffset);
    graphics.lineTo(left + inset + cornerStrokeOffset, top + height - inset - cornerStrokeOffset);
    graphics.lineTo(left + corner + cornerStrokeOffset, top + height - inset - cornerStrokeOffset);
    graphics.moveTo(left + width - corner - cornerStrokeOffset, top + height - inset - cornerStrokeOffset);
    graphics.lineTo(left + width - inset - cornerStrokeOffset, top + height - inset - cornerStrokeOffset);
    graphics.lineTo(left + width - inset - cornerStrokeOffset, top + height - corner - cornerStrokeOffset);
    graphics.strokePath();
  }

  private resolveLegacyRoundedRectRadius(width: number, height: number, requestedRadius?: number): number {
    const safeWidth = Math.max(1, Math.abs(width));
    const safeHeight = Math.max(1, Math.abs(height));
    const maxRadius = Math.max(1, Math.floor(Math.min(safeWidth, safeHeight) / 2));
    const requested = requestedRadius ?? maxRadius;

    return Math.max(1, Math.min(maxRadius, Math.round(requested)));
  }

  private resolveLegacyUiTextResolution(): number {
    const width = this.layout?.width ?? this.scale.width;
    const height = this.layout?.height ?? this.scale.height;
    return resolveHudTextResolution({ width, height });
  }

  private applyLegacyUiTextCrispness<T extends Phaser.GameObjects.Text>(text: T): T {
    return applyTextResolution(text, this.resolveLegacyUiTextResolution());
  }

  private padLegacyUiText<T extends Phaser.GameObjects.Text>(text: T): T {
    this.applyLegacyUiTextCrispness(text);
    text.setPadding(12, 6, 12, 6);
    return text;
  }

  private fitLegacyUiTextToWidth<T extends Phaser.GameObjects.Text>(
    text: T,
    maxWidth: number,
    maxFontSize: number,
    minFontSize: number
  ): T {
    const safeMaxWidth = Math.max(1, Math.floor(maxWidth));
    const safeMaxFontSize = Math.max(1, Math.floor(maxFontSize));
    const safeMinFontSize = Math.max(1, Math.min(safeMaxFontSize, Math.floor(minFontSize)));
    for (let fontSize = safeMaxFontSize; fontSize >= safeMinFontSize; fontSize -= 1) {
      text.setFontSize(fontSize);
      if (text.width <= safeMaxWidth) {
        return text;
      }
    }

    text.setFontSize(safeMinFontSize);
    return text;
  }

  private drawHud(time: number): void {
    this.hudGraphics.clear();
    this.clearHudTexts();
    this.hudBounds = null;
    this.hudTimerBounds = null;
    this.hudArrowBounds = null;
    this.hudTouchControlBounds = null;
    this.hudFrame = null;
    this.hudCompassSpinActive = false;
    this.hudCompassSpinProgress = null;
    this.hudCompassVisualAngleRadians = null;
    this.hudCompassVisualAngleDegrees = null;
    if (this.mode !== 'play' || this.overlay !== 'none') {
      this.footerText.setText('');
      return;
    }
    this.footerText.setText('');

    const boardOffset = this.resolveBoardOffset();
    const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(
      this.layout.boardLeft + boardOffset.x,
      this.layout.boardTop + boardOffset.y,
      this.layout.boardSize
    );
    const goalScreenX = mazeRenderFrame.boardLeft + ((this.maze.goal.x + 0.5) * mazeRenderFrame.tileSize);
    const goalScreenY = mazeRenderFrame.boardTop + ((this.maze.goal.y + 0.5) * mazeRenderFrame.tileSize);
    const renderedPlayerPoint = this.resolveLegacyRenderedPlayerPoint(time);
    const playerScreenX = mazeRenderFrame.boardLeft + ((renderedPlayerPoint.x + 0.5) * mazeRenderFrame.tileSize);
    const playerScreenY = mazeRenderFrame.boardTop + ((renderedPlayerPoint.y + 0.5) * mazeRenderFrame.tileSize);
    const touchControlLayout = this.resolveLegacyPlayTouchControlLayout();
    const touchCompassBounds = this.resolveLegacyPlayTouchCompassBounds(touchControlLayout);
    const hudFrame = resolveLegacyPlayHudFrame({
      compassBounds: touchCompassBounds ?? undefined,
      elapsedMs: time - this.playStartedAtMs,
      goalScreen: { x: goalScreenX, y: goalScreenY },
      layoutWidth: this.layout.width,
      playerScreen: { x: playerScreenX, y: playerScreenY }
    });

    this.hudTouchControlBounds = this.drawLegacyPlayTouchControls(touchControlLayout);
    this.drawLegacyPlayCompass(hudFrame, {
      showPane: touchControlLayout.controlMode !== 'stick'
    });
    this.drawLegacyPlayPlayerMessageStack(hudFrame);
    const compassVisualFrame = this.resolveLegacyPlayCompassVisualFrame(hudFrame, time);
    const visualArrow = this.resolveLegacyPlayCompassArrowGeometry(hudFrame, compassVisualFrame.angleRadians);

    this.hudGraphics.lineStyle(3, LEGACY_PLAY_HUD_ARROW_SHADOW, 0.36);
    this.hudGraphics.beginPath();
    this.hudGraphics.moveTo(hudFrame.arrowOrigin.x + 1, hudFrame.arrowOrigin.y + 1);
    this.hudGraphics.lineTo(
      visualArrow.tip.x + 1,
      visualArrow.tip.y + 1
    );
    this.hudGraphics.strokePath();
    this.hudGraphics.fillStyle(LEGACY_PLAY_HUD_ARROW_SHADOW, 0.36);
    this.hudGraphics.fillTriangle(
      visualArrow.tip.x + 1,
      visualArrow.tip.y + 1,
      visualArrow.left.x + 1,
      visualArrow.left.y + 1,
      visualArrow.right.x + 1,
      visualArrow.right.y + 1
    );

    this.hudGraphics.lineStyle(2, LEGACY_PLAY_HUD_ARROW_TAIL, 0.86);
    this.hudGraphics.beginPath();
    this.hudGraphics.moveTo(hudFrame.arrowOrigin.x, hudFrame.arrowOrigin.y);
    this.hudGraphics.lineTo(
      hudFrame.arrowOrigin.x - (Math.cos(compassVisualFrame.angleRadians) * 9),
      hudFrame.arrowOrigin.y - (Math.sin(compassVisualFrame.angleRadians) * 9)
    );
    this.hudGraphics.strokePath();
    this.hudGraphics.lineStyle(2, LEGACY_PLAY_HUD_ARROW, 0.9);
    this.hudGraphics.beginPath();
    this.hudGraphics.moveTo(hudFrame.arrowOrigin.x, hudFrame.arrowOrigin.y);
    this.hudGraphics.lineTo(
      visualArrow.tip.x,
      visualArrow.tip.y
    );
    this.hudGraphics.strokePath();
    this.hudGraphics.fillStyle(LEGACY_PLAY_HUD_ARROW, 0.9);
    this.hudGraphics.fillTriangle(
      visualArrow.tip.x,
      visualArrow.tip.y,
      visualArrow.left.x,
      visualArrow.left.y,
      visualArrow.right.x,
      visualArrow.right.y
    );

    this.hudTimerBounds = createVisualRect(
      hudFrame.timerBounds.left,
      hudFrame.timerBounds.top,
      hudFrame.timerBounds.width,
      hudFrame.timerBounds.height
    );
    this.hudArrowBounds = createVisualRect(
      hudFrame.arrowBounds.left,
      hudFrame.arrowBounds.top,
      hudFrame.arrowBounds.width,
      hudFrame.arrowBounds.height
    );
    this.hudBounds = touchCompassBounds
      ? this.hudTimerBounds
      : mergeVisualRects(this.hudTimerBounds, this.hudArrowBounds);
    this.hudFrame = hudFrame;
  }

  private startLegacyPlayCompassSpin(time: number): void {
    this.hudCompassSpinStartedAtMs = time;
    this.hudCompassSpinActive = true;
    this.hudCompassSpinProgress = 0;
    this.hudDirty = true;
  }

  private drawLegacyPlayPlayerMessageStack(hudFrame: LegacyPlayHudFrame): void {
    const messages = this.resolveVisibleLegacyPlayerMessages();
    if (messages.length <= 0) {
      return;
    }

    const compact = this.layout.width < 520;
    const cardWidth = Math.min(this.layout.width - (compact ? 30 : 64), compact ? 342 : 430);
    const cardHeight = compact ? 28 : 32;
    const cardGap = cardHeight + 5;
    const centerX = this.layout.width / 2;
    const topY = hudFrame.timerBounds.top + hudFrame.timerBounds.height + (compact ? 12 : 16);

    messages.forEach((message, index) => {
      const cardTop = topY + (index * cardGap);
      const cardLeft = centerX - (cardWidth / 2);
      const toneColor = Phaser.Display.Color.HexStringToColor(resolveLegacyPlayerMessageColor(message)).color;

      this.drawLegacyCyberPanel(this.hudGraphics, {
        active: true,
        alpha: message.tone === 'error' ? 0.9 : 0.78,
        fill: message.tone === 'error' ? 0x211019 : LEGACY_CYBER_PANEL_FILL,
        height: cardHeight,
        left: cardLeft,
        radius: 9,
        top: cardTop,
        width: cardWidth
      });
      this.hudGraphics.lineStyle(1, toneColor, message.tone === 'error' ? 0.82 : 0.58);
      this.hudGraphics.strokeRoundedRect(cardLeft + 3, cardTop + 3, cardWidth - 6, cardHeight - 6, 7);

      const label = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(centerX, cardTop + (cardHeight / 2), message.copy, {
        align: 'center',
        color: resolveLegacyPlayerMessageColor(message),
        fontFamily: LEGACY_UI_FONT_FAMILY,
        fontSize: compact ? '12px' : '14px'
      })), cardWidth - 24, compact ? 12 : 14, 10).setOrigin(0.5);
      label.setData('hud', true);
      this.uiTexts.push(label);
    });
  }

  private hasLegacyPlayCompassSpinPendingFrame(): boolean {
    return this.hudCompassSpinStartedAtMs !== null;
  }

  private hasLegacyPlayTrailPulsePendingFrame(time: number): boolean {
    const active = this.settings.toggleTrailPulse && this.overlay === 'none' && this.trail.length > 1;
    if (!active) {
      this.legacyPlayTrailPulseNextFrameAtMs = 0;
      return false;
    }
    if (time < this.legacyPlayTrailPulseNextFrameAtMs) {
      return false;
    }

    this.legacyPlayTrailPulseNextFrameAtMs = time + LEGACY_PLAY_TRAIL_PULSE_FRAME_INTERVAL_MS;
    return true;
  }

  private resolveLegacyPlayCompassVisualFrame(
    hudFrame: LegacyPlayHudFrame,
    time: number
  ): {
    active: boolean;
    angleDegrees: number;
    angleRadians: number;
    progress: number;
  } {
    if (this.hudCompassSpinStartedAtMs === null) {
      this.hudCompassSpinActive = false;
      this.hudCompassSpinProgress = null;
      this.hudCompassVisualAngleRadians = hudFrame.arrowAngleRadians;
      this.hudCompassVisualAngleDegrees = hudFrame.arrowAngleDegrees;
      return {
        active: false,
        angleDegrees: hudFrame.arrowAngleDegrees,
        angleRadians: hudFrame.arrowAngleRadians,
        progress: 1
      };
    }

    const frame = resolveLegacyCompassSpinFrame({
      durationMs: LEGACY_PLAY_COMPASS_SPIN_DURATION_MS,
      elapsedMs: time - this.hudCompassSpinStartedAtMs,
      targetAngleRadians: hudFrame.arrowAngleRadians,
      turns: LEGACY_PLAY_COMPASS_SPIN_TURNS
    });
    this.hudCompassSpinActive = frame.active;
    this.hudCompassSpinProgress = frame.progress;
    this.hudCompassVisualAngleRadians = frame.angleRadians;
    this.hudCompassVisualAngleDegrees = frame.angleDegrees;

    if (!frame.active) {
      this.hudCompassSpinStartedAtMs = null;
    }

    return frame;
  }

  private resolveLegacyPlayCompassArrowGeometry(
    hudFrame: LegacyPlayHudFrame,
    angleRadians: number
  ): {
    left: { x: number; y: number };
    right: { x: number; y: number };
    tip: { x: number; y: number };
  } {
    const length = 14;

    return {
      left: {
        x: hudFrame.arrowOrigin.x + (Math.cos(angleRadians + 2.42) * 6),
        y: hudFrame.arrowOrigin.y + (Math.sin(angleRadians + 2.42) * 6)
      },
      right: {
        x: hudFrame.arrowOrigin.x + (Math.cos(angleRadians - 2.42) * 6),
        y: hudFrame.arrowOrigin.y + (Math.sin(angleRadians - 2.42) * 6)
      },
      tip: {
        x: hudFrame.arrowOrigin.x + (Math.cos(angleRadians) * length),
        y: hudFrame.arrowOrigin.y + (Math.sin(angleRadians) * length)
      }
    };
  }

  private resolveLegacyPlayTouchCompassBounds(
    touchControlLayout = this.resolveLegacyPlayTouchControlLayout()
  ): { height: number; left: number; top: number; width: number } | null {
    if (!this.shouldRenderLegacyPlayTouchControls(touchControlLayout)) {
      return null;
    }

    if (touchControlLayout.controlMode === 'stick' && touchControlLayout.stick !== null) {
      return {
        height: touchControlLayout.stick.inner.height,
        left: touchControlLayout.stick.inner.left,
        top: touchControlLayout.stick.inner.top,
        width: touchControlLayout.stick.inner.width
      };
    }

    const { move_down, move_left, move_right, move_up } = touchControlLayout.controls;
    const centerX = (move_left.centerX + move_right.centerX) / 2;
    const centerY = (move_up.centerY + move_down.centerY) / 2;
    const size = Math.max(32, Math.min(44, Math.min(move_up.width, move_down.width, move_left.width, move_right.width) - 8));

    return {
      height: size,
      left: Math.round(centerX - (size / 2)),
      top: Math.round(centerY - (size / 2)),
      width: size
    };
  }

  private drawLegacyPlayCompass(hudFrame: LegacyPlayHudFrame, options: { showPane: boolean } = { showPane: true }): void {
    const { arrowBounds } = hudFrame;
    const radius = Math.max(8, Math.min(arrowBounds.width, arrowBounds.height) * 0.34);

    if (options.showPane) {
      this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_FRAME_FILL, 0.36);
      this.hudGraphics.fillRoundedRect(arrowBounds.left, arrowBounds.top, arrowBounds.width, arrowBounds.height, 10);
      this.hudGraphics.lineStyle(2, LEGACY_PLAY_TOUCH_BUTTON_STROKE, 0.42);
      this.hudGraphics.strokeRoundedRect(arrowBounds.left, arrowBounds.top, arrowBounds.width, arrowBounds.height, 10);
    }
    this.hudGraphics.lineStyle(1, LEGACY_PLAY_HUD_ARROW, 0.28);
    this.hudGraphics.strokeCircle(hudFrame.arrowOrigin.x, hudFrame.arrowOrigin.y, radius);
    this.hudGraphics.beginPath();
    this.hudGraphics.moveTo(hudFrame.arrowOrigin.x - radius + 3, hudFrame.arrowOrigin.y);
    this.hudGraphics.lineTo(hudFrame.arrowOrigin.x + radius - 3, hudFrame.arrowOrigin.y);
    this.hudGraphics.moveTo(hudFrame.arrowOrigin.x, hudFrame.arrowOrigin.y - radius + 3);
    this.hudGraphics.lineTo(hudFrame.arrowOrigin.x, hudFrame.arrowOrigin.y + radius - 3);
    this.hudGraphics.strokePath();
    this.hudGraphics.fillStyle(LEGACY_PLAY_GOAL_MARKER_CORE, 0.92);
    this.hudGraphics.fillCircle(hudFrame.arrowOrigin.x, hudFrame.arrowOrigin.y, 2);
  }

  private drawLegacyPlayTouchControls(
    touchControlLayout = this.resolveLegacyPlayTouchControlLayout()
  ): VisualRect | null {
    if (!this.shouldRenderLegacyPlayTouchControls(touchControlLayout)) {
      return null;
    }

    const { controls, frame } = touchControlLayout;
    const activeControls = this.resolveLegacyPlayActiveTouchControlSet();

    if (touchControlLayout.controlMode === 'stick' && touchControlLayout.stick !== null) {
      this.drawLegacyPlayTouchStick(touchControlLayout.stick, this.resolveLegacyPlayHeldTouchControl(), this.playTouchStickPull);
      this.drawLegacyPlayTouchButton(controls.pause, true, false);
      this.drawLegacyPlayTouchPauseIcon(controls.pause);
      this.drawLegacyPlayTouchLabel(controls.pause, 'PAUSE');
      return createVisualRect(frame.left, frame.top, frame.width, frame.height);
    }

    this.drawLegacyPlayTouchButton(controls.move_up, false, activeControls.has('move_up'));
    this.drawLegacyPlayTouchButton(controls.move_up_right, false, activeControls.has('move_up_right'));
    this.drawLegacyPlayTouchButton(controls.move_right, false, activeControls.has('move_right'));
    this.drawLegacyPlayTouchButton(controls.move_down_right, false, activeControls.has('move_down_right'));
    this.drawLegacyPlayTouchButton(controls.move_down, false, activeControls.has('move_down'));
    this.drawLegacyPlayTouchButton(controls.move_down_left, false, activeControls.has('move_down_left'));
    this.drawLegacyPlayTouchButton(controls.move_left, false, activeControls.has('move_left'));
    this.drawLegacyPlayTouchButton(controls.move_up_left, false, activeControls.has('move_up_left'));
    this.drawLegacyPlayTouchButton(controls.pause, true, false);

    this.drawLegacyPlayTouchArrow(controls.move_up, 'up', activeControls.has('move_up'));
    this.drawLegacyPlayTouchArrow(controls.move_up_right, 'up-right', activeControls.has('move_up_right'));
    this.drawLegacyPlayTouchArrow(controls.move_right, 'right', activeControls.has('move_right'));
    this.drawLegacyPlayTouchArrow(controls.move_down_right, 'down-right', activeControls.has('move_down_right'));
    this.drawLegacyPlayTouchArrow(controls.move_down, 'down', activeControls.has('move_down'));
    this.drawLegacyPlayTouchArrow(controls.move_down_left, 'down-left', activeControls.has('move_down_left'));
    this.drawLegacyPlayTouchArrow(controls.move_left, 'left', activeControls.has('move_left'));
    this.drawLegacyPlayTouchArrow(controls.move_up_left, 'up-left', activeControls.has('move_up_left'));
    this.drawLegacyPlayTouchPauseIcon(controls.pause);
    this.drawLegacyPlayTouchLabel(controls.pause, 'PAUSE');

    return createVisualRect(frame.left, frame.top, frame.width, frame.height);
  }

  private drawLegacyPlayTouchStick(
    stick: NonNullable<ReturnType<typeof resolveTouchControlLayout>['stick']>,
    activeControl: HumanMovementActionKind | null,
    pullVector: TouchStickPullVector | null
  ): void {
    const outerRadius = stick.outer.width / 2;
    const innerRadius = stick.inner.width / 2;
    const centerX = stick.outer.centerX;
    const centerY = stick.outer.centerY;
    const knobRadius = Math.max(10, innerRadius * 0.42);
    let knobX = centerX;
    let knobY = centerY;

    const travel = Math.max(outerRadius * 0.26, outerRadius - innerRadius - knobRadius);
    if (pullVector !== null) {
      knobX += pullVector.normalizedX * travel;
      knobY += pullVector.normalizedY * travel;
    } else if (activeControl !== null) {
      const vector = resolveHumanMovementActionVector(activeControl);
      const length = Math.hypot(vector.deltaX, vector.deltaY) || 1;
      knobX += (vector.deltaX / length) * travel;
      knobY += (vector.deltaY / length) * travel;
    }

    this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_BUTTON_FILL, 0.3);
    this.hudGraphics.fillCircle(centerX, centerY, outerRadius);
    this.hudGraphics.lineStyle(3, activeControl === null ? LEGACY_PLAY_TOUCH_BUTTON_STROKE : LEGACY_PLAY_TOUCH_ACCENT, activeControl === null ? 0.42 : 0.76);
    this.hudGraphics.strokeCircle(centerX, centerY, outerRadius);
    this.hudGraphics.lineStyle(1, LEGACY_PLAY_TOUCH_ICON, 0.18);
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      this.hudGraphics.beginPath();
      this.hudGraphics.moveTo(centerX + (Math.cos(angle) * (innerRadius + 8)), centerY + (Math.sin(angle) * (innerRadius + 8)));
      this.hudGraphics.lineTo(centerX + (Math.cos(angle) * (outerRadius - 8)), centerY + (Math.sin(angle) * (outerRadius - 8)));
      this.hudGraphics.strokePath();
    }
    this.hudGraphics.fillStyle(0x05070a, 0.45);
    this.hudGraphics.fillCircle(centerX, centerY, innerRadius);
    this.hudGraphics.lineStyle(2, LEGACY_PLAY_TOUCH_BUTTON_STROKE, 0.38);
    this.hudGraphics.strokeCircle(centerX, centerY, innerRadius);
    this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_ACCENT, activeControl === null ? 0.28 : 0.5);
    this.hudGraphics.fillCircle(knobX, knobY, knobRadius);
    this.hudGraphics.lineStyle(2, LEGACY_PLAY_TOUCH_ICON, activeControl === null ? 0.52 : 0.86);
    this.hudGraphics.strokeCircle(knobX, knobY, knobRadius);
  }

  private drawLegacyPlayTouchButton(
    rect: ReturnType<typeof resolveTouchControlLayout>['controls']['move_up'],
    accented: boolean,
    active = false
  ): void {
    this.drawLegacyCyberPanel(this.hudGraphics, {
      active: active || accented,
      alpha: active ? 0.7 : (accented ? 0.56 : 0.44),
      fill: active ? cyberArcadeMaterial.substrate.panelActive : LEGACY_PLAY_TOUCH_BUTTON_FILL,
      height: rect.height,
      left: rect.left,
      radius: accented ? 8 : 10,
      top: rect.top,
      width: rect.width
    });
  }

  private drawLegacyPlayTouchArrow(
    rect: ReturnType<typeof resolveTouchControlLayout>['controls']['move_up'],
    direction: 'up' | 'up-right' | 'right' | 'down-right' | 'down' | 'down-left' | 'left' | 'up-left',
    active = false
  ): void {
    const diagonal = direction.includes('-');
    const size = Math.round(Math.min(rect.width, rect.height) * (diagonal ? 0.2 : 0.24));
    const stem = Math.max(8, Math.round(size * (diagonal ? 0.86 : 1.05)));
    const cx = rect.centerX;
    const cy = rect.centerY;

    this.hudGraphics.lineStyle(Math.max(active ? 4 : 3, Math.round(rect.width * 0.06)), LEGACY_PLAY_TOUCH_ICON, active ? 1 : 0.9);
    this.hudGraphics.beginPath();
    switch (direction) {
      case 'up':
        this.hudGraphics.moveTo(cx, cy + stem);
        this.hudGraphics.lineTo(cx, cy - size);
        this.hudGraphics.moveTo(cx, cy - size);
        this.hudGraphics.lineTo(cx - size, cy + Math.round(size * 0.28));
        this.hudGraphics.moveTo(cx, cy - size);
        this.hudGraphics.lineTo(cx + size, cy + Math.round(size * 0.28));
        break;
      case 'right':
        this.hudGraphics.moveTo(cx - stem, cy);
        this.hudGraphics.lineTo(cx + size, cy);
        this.hudGraphics.moveTo(cx + size, cy);
        this.hudGraphics.lineTo(cx - Math.round(size * 0.28), cy - size);
        this.hudGraphics.moveTo(cx + size, cy);
        this.hudGraphics.lineTo(cx - Math.round(size * 0.28), cy + size);
        break;
      case 'up-right':
        this.hudGraphics.moveTo(cx - stem, cy + stem);
        this.hudGraphics.lineTo(cx + size, cy - size);
        this.hudGraphics.moveTo(cx + size, cy - size);
        this.hudGraphics.lineTo(cx - Math.round(size * 0.16), cy - size);
        this.hudGraphics.moveTo(cx + size, cy - size);
        this.hudGraphics.lineTo(cx + size, cy + Math.round(size * 0.16));
        break;
      case 'down-right':
        this.hudGraphics.moveTo(cx - stem, cy - stem);
        this.hudGraphics.lineTo(cx + size, cy + size);
        this.hudGraphics.moveTo(cx + size, cy + size);
        this.hudGraphics.lineTo(cx - Math.round(size * 0.16), cy + size);
        this.hudGraphics.moveTo(cx + size, cy + size);
        this.hudGraphics.lineTo(cx + size, cy - Math.round(size * 0.16));
        break;
      case 'down':
        this.hudGraphics.moveTo(cx, cy - stem);
        this.hudGraphics.lineTo(cx, cy + size);
        this.hudGraphics.moveTo(cx, cy + size);
        this.hudGraphics.lineTo(cx - size, cy - Math.round(size * 0.28));
        this.hudGraphics.moveTo(cx, cy + size);
        this.hudGraphics.lineTo(cx + size, cy - Math.round(size * 0.28));
        break;
      case 'down-left':
        this.hudGraphics.moveTo(cx + stem, cy - stem);
        this.hudGraphics.lineTo(cx - size, cy + size);
        this.hudGraphics.moveTo(cx - size, cy + size);
        this.hudGraphics.lineTo(cx + Math.round(size * 0.16), cy + size);
        this.hudGraphics.moveTo(cx - size, cy + size);
        this.hudGraphics.lineTo(cx - size, cy - Math.round(size * 0.16));
        break;
      case 'left':
        this.hudGraphics.moveTo(cx + stem, cy);
        this.hudGraphics.lineTo(cx - size, cy);
        this.hudGraphics.moveTo(cx - size, cy);
        this.hudGraphics.lineTo(cx + Math.round(size * 0.28), cy - size);
        this.hudGraphics.moveTo(cx - size, cy);
        this.hudGraphics.lineTo(cx + Math.round(size * 0.28), cy + size);
        break;
      case 'up-left':
        this.hudGraphics.moveTo(cx + stem, cy + stem);
        this.hudGraphics.lineTo(cx - size, cy - size);
        this.hudGraphics.moveTo(cx - size, cy - size);
        this.hudGraphics.lineTo(cx + Math.round(size * 0.16), cy - size);
        this.hudGraphics.moveTo(cx - size, cy - size);
        this.hudGraphics.lineTo(cx - size, cy + Math.round(size * 0.16));
        break;
      default:
        direction satisfies never;
    }
    this.hudGraphics.strokePath();
  }

  private drawLegacyPlayTouchPauseIcon(
    rect: ReturnType<typeof resolveTouchControlLayout>['controls']['pause']
  ): void {
    const barWidth = Math.max(4, Math.round(rect.width * 0.055));
    const barHeight = Math.round(rect.height * 0.28);
    const gap = Math.round(rect.width * 0.08);
    const top = rect.top + Math.round(rect.height * 0.16);

    this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_ICON, 0.86);
    this.hudGraphics.fillRoundedRect(rect.centerX - gap - barWidth, top, barWidth, barHeight, 2);
    this.hudGraphics.fillRoundedRect(rect.centerX + gap, top, barWidth, barHeight, 2);
  }

  private drawLegacyPlayTouchLabel(
    rect: ReturnType<typeof resolveTouchControlLayout>['controls']['pause'],
    label: string
  ): void {
    const text = this.padLegacyUiText(this.add.text(rect.centerX, rect.bottom - Math.max(8, Math.round(rect.height * 0.22)), label, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${Math.max(8, Math.min(12, Math.round(rect.height * 0.26)))}px`,
      color: LEGACY_PLAY_HUD_TIMER_TEXT
    })).setOrigin(0.5).setAlpha(0.88);
    text.setData('hud', true);
    this.uiTexts.push(text);
  }

  private clearHudTexts(): void {
    this.uiTexts.forEach((text) => {
      if (text.getData('hud') === true) {
        text.destroy();
      }
    });
    this.uiTexts = this.uiTexts.filter((text) => text.active);
  }

  private clearPlayHudImmediately(): void {
    this.hudGraphics.clear();
    this.hudBounds = null;
    this.hudTimerBounds = null;
    this.hudArrowBounds = null;
    this.hudTouchControlBounds = null;
    this.hudFrame = null;
    this.clearHudTexts();
    this.footerText.setText('');
  }

  private rebuildUi(): void {
    this.overlayGraphics.clear();
    this.clearUi();
    this.overlayBackChevronBounds = null;
    this.overlayGuideBounds = null;
    this.overlayScrollViewportBounds = null;
    this.overlayScrollTrackBounds = null;
    this.overlayScrollThumbBounds = null;
    this.overlayScrollContentHeight = 0;
    this.overlayScrollMax = 0;
    this.overlayScrollTopFadeAlpha = 0;
    this.overlayScrollBottomFadeAlpha = 0;
    this.progressionBadgeText.setVisible(this.overlay === 'none');

    if (this.overlay === 'none') {
      if (this.mode === 'menu') {
        const [startLabel, optionsLabel] = MAIN_MENU_BUTTONS;
        const isAuthenticated = this.authSnapshot.status === 'authenticated';
        const primaryButtonWidth = Math.min(
          this.layout.centerButtonWidth,
          Math.max(118, Math.floor(this.layout.width * 0.34))
        );

        if (!isAuthenticated) {
          this.uiButtons.push(
            this.createButton(
              this.layout.centerButtonX,
              this.layout.centerButtonY,
              primaryButtonWidth,
              this.layout.buttonHeight,
              'Login',
              () => this.openOverlay('auth')
            )
          );
        } else {
          const authenticatedMenuButtonStack = resolveLegacyAuthenticatedMenuButtonStack(this.layout);
          const optionsButtonWidth = authenticatedMenuButtonStack.buttonLayout === 'row'
            ? primaryButtonWidth
            : Math.round(primaryButtonWidth * 0.84);
          this.uiButtons.push(
            this.createButton(
              authenticatedMenuButtonStack.startButtonX,
              authenticatedMenuButtonStack.startButtonY,
              primaryButtonWidth,
              this.layout.buttonHeight,
              startLabel,
              () => this.startPlayMode()
            ),
            this.createButton(
              authenticatedMenuButtonStack.optionsButtonX,
              authenticatedMenuButtonStack.optionsButtonY,
              optionsButtonWidth,
              authenticatedMenuButtonStack.optionsButtonHeight,
              optionsLabel,
              () => this.openOverlay('options')
            )
          );
        }
      }

      this.uiDirty = false;
      return;
    }

    this.drawOverlayPanel();

    switch (this.overlay) {
      case 'options':
        this.buildOptionsOverlay();
        break;
      case 'pause':
        this.buildPauseOverlay();
        break;
      case 'auth':
        this.buildAuthOverlay();
        break;
      case 'confirm-progression-reset':
        this.buildProgressionResetConfirmationOverlay();
        break;
    }

    this.uiDirty = false;
  }

  private drawOverlayPanel(): void {
    const panel = this.resolveOverlayPanelFrame(this.overlay);

    this.overlayGraphics.fillStyle(0x06060b, 0.94);
    this.overlayGraphics.fillRect(0, 0, this.layout.width, this.layout.height);
    this.drawLegacyCyberPanel(this.overlayGraphics, {
      active: true,
      alpha: 0.98,
      fill: 0x08131d,
      height: panel.height,
      left: panel.left,
      radius: 14,
      top: panel.top,
      width: panel.width
    });
  }

  private resolveOverlayPanelFrame(kind: OverlayKind = this.overlay): OverlayPanelFrame {
    const width = Math.min(720, this.layout.width - 40);
    const compact = this.layout.width < 480;
    const mobilePortrait = compact && this.layout.height > this.layout.width;
    const mobileTopInset = mobilePortrait
      ? clampInteger(Math.round(this.layout.height * 0.055), 30, 44)
      : 16;
    const maxCompactHeight = kind === 'pause' ? 820 : this.layout.height - 32;
    const maxDesktopHeight = kind === 'pause' ? 700 : 620;
    let height = Math.min(
      compact ? maxCompactHeight : maxDesktopHeight,
      this.layout.height - mobileTopInset - 16
    );
    const left = Math.round((this.layout.width - width) / 2);
    let top = Math.max(mobileTopInset, Math.round((this.layout.height - height) / 2));

    if (kind === 'pause' && this.mode === 'play') {
      const timerFrame = resolveLegacyPlayHudFrame({
        elapsedMs: 0,
        goalScreen: { x: 0, y: 0 },
        layoutWidth: this.layout.width,
        playerScreen: { x: 0, y: 0 }
      });
      const timerBottom = timerFrame.timerBounds.top + timerFrame.timerBounds.height;
      top = Math.max(timerBottom + (compact ? 10 : 14), 58);
      height = Math.min(height, Math.max(180, this.layout.height - top - 16));
    }

    return {
      centerX: left + Math.round(width / 2),
      height,
      left,
      top,
      width
    };
  }

  private visualRectToLegacyOverlayScrollRect(rect: VisualRect): LegacyOverlayScrollRect {
    return {
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width
    };
  }

  private resolveFeatureControlRowsContentHeight(
    panel: OverlayPanelFrame,
    options: { includeMovementSpeed?: boolean; showDescriptions?: boolean } = {}
  ): number {
    const stacked = panel.width < 420;
    const controlLayout = resolveLegacyFeatureControlLayout(panel.width, options.showDescriptions === true);
    const rowHeight = controlLayout.rowHeight;
    const rowGap = controlLayout.rowGap;
    const toggleRowCount = 6;

    return 4
      + (toggleRowCount * (rowHeight + rowGap))
      + (options.includeMovementSpeed ? rowHeight + (stacked ? 10 : 6) : 0)
      + 4;
  }

  private drawLegacyOverlayScrollFacade(metrics: LegacyOverlayScrollMetrics, forceVisible = false): void {
    if (!metrics.enabled && !forceVisible) {
      return;
    }

    const graphics = this.add.graphics();
    this.overlayScrollGraphics = graphics;
    const viewport = metrics.viewport;
    const track = metrics.track;
    const thumb = metrics.thumb;
    const fadeHeight = Math.min(34, Math.max(18, Math.round(viewport.height * 0.12)));

    if (metrics.topFadeAlpha > 0) {
      graphics.fillStyle(LEGACY_CYBER_PANEL_SHADOW, metrics.topFadeAlpha);
      graphics.fillRect(viewport.left, viewport.top, viewport.width, fadeHeight);
      graphics.lineStyle(1, LEGACY_CYBER_PANEL_STROKE_ALT, 0.22);
      graphics.lineBetween(viewport.left + 8, viewport.top + fadeHeight, viewport.left + viewport.width - 20, viewport.top + fadeHeight);
    }

    if (metrics.bottomFadeAlpha > 0) {
      graphics.fillStyle(LEGACY_CYBER_PANEL_SHADOW, metrics.bottomFadeAlpha);
      graphics.fillRect(viewport.left, viewport.top + viewport.height - fadeHeight, viewport.width, fadeHeight);
      graphics.lineStyle(1, LEGACY_CYBER_PANEL_STROKE_ALT, 0.2);
      graphics.lineBetween(
        viewport.left + 8,
        viewport.top + viewport.height - fadeHeight,
        viewport.left + viewport.width - 20,
        viewport.top + viewport.height - fadeHeight
      );
    }

    const fillScrollPill = (
      left: number,
      top: number,
      width: number,
      height: number,
      color: number,
      alpha: number
    ): void => {
      const safeWidth = Math.max(1, width);
      const safeHeight = Math.max(1, height);
      graphics.fillStyle(color, alpha);
      graphics.fillRoundedRect(
        left,
        top,
        safeWidth,
        safeHeight,
        this.resolveLegacyRoundedRectRadius(safeWidth, safeHeight)
      );
    };

    // CanvasRenderer can overfill skinny pill shapes when the requested radius is much
    // larger than the rect. Clamp it so the mobile scroll rail never paints over the UI.
    const railAlpha = metrics.enabled ? 0.46 : 0.34;
    const trackAlpha = metrics.enabled ? 0.34 : 0.24;
    const thumbAlpha = metrics.enabled ? 0.92 : 0.58;
    const thumbCoreAlpha = metrics.enabled ? 0.38 : 0.22;
    fillScrollPill(track.left - 3, track.top - 2, track.width + 6, track.height + 4, LEGACY_CYBER_PANEL_SHADOW, railAlpha);
    fillScrollPill(track.left - 1, track.top, track.width + 2, track.height, LEGACY_CYBER_PANEL_STROKE_ALT, trackAlpha);
    fillScrollPill(thumb.left - 2, thumb.top, thumb.width + 4, thumb.height, LEGACY_PLAY_TOUCH_ACCENT, thumbAlpha);
    fillScrollPill(
      thumb.left,
      thumb.top + 2,
      Math.max(1, thumb.width),
      Math.max(1, thumb.height - 4),
      LEGACY_PLAY_TOUCH_ICON,
      thumbCoreAlpha
    );
  }

  private buildOptionsOverlay(): void {
    const panel = this.resolveOverlayPanelFrame('options');
    const compact = panel.width < 420;
    const showAdvancedOptions = this.shouldShowLegacyAdvancedOptions();
    const visibleMessages = this.resolveVisibleLegacyPlayerMessages();
    let rowY = panel.top + 104;
    this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.handleBackAction()));
    this.createOverlayTitle('Options', panel.top + 52);
    if (visibleMessages.length > 0) {
      this.createOverlayPlayerMessageStack(visibleMessages, panel.top + 76, panel);
      rowY += visibleMessages.length * (compact ? 18 : 19);
    }

    if (!showAdvancedOptions) {
      const actionButtonHeight = compact ? 44 : 48;
      const actionY = panel.top + panel.height - (compact ? 42 : 54);
      const viewportTop = rowY + (compact ? 4 : 6);
      const viewportBottom = actionY - (actionButtonHeight / 2) - (compact ? 12 : 16);
      const viewport = createVisualRect(
        panel.left + 24,
        viewportTop,
        panel.width - 48,
        Math.max(140, viewportBottom - viewportTop)
      );
      const controlContentHeight = this.resolveFeatureControlRowsContentHeight(panel, {
        includeMovementSpeed: false
      });
      const contentFlow = resolveLegacyOverlayContentFlowLayout({
        contentTop: viewport.top,
        controlsHeight: controlContentHeight,
        guideHeight: resolveLegacyOptionsGuideLayout(panel.width).cardHeight,
        panelWidth: panel.width
      });
      const scrollMetrics = resolveLegacyOverlayScrollMetrics({
        contentHeight: contentFlow.contentHeight,
        offset: this.overlayScrollOffset,
        viewport: this.visualRectToLegacyOverlayScrollRect(viewport)
      });
      this.applyLegacyOverlayScrollMetrics(scrollMetrics);
      this.createLegacyOptionsInfoSection(contentFlow.guideTop, panel, {
        exactTop: true,
        rightGutter: LEGACY_OVERLAY_SCROLL_RIGHT_GUTTER,
        scrollOffset: scrollMetrics.offset,
        viewport
      });
      this.createFeatureControlRows(contentFlow.controlsTop, panel, {
        includeMovementSpeed: false,
        rightGutter: LEGACY_OVERLAY_SCROLL_RIGHT_GUTTER,
        scrollOffset: scrollMetrics.offset,
        viewport
      });
      this.createLegacyOptionsAccountActionRow(panel, { contentCenterY: actionY });
      this.drawLegacyOverlayScrollFacade(scrollMetrics);
      return;
    }

    rowY = this.createLegacyOptionsInfoSection(rowY, panel);

    if (showAdvancedOptions) {
      rowY = this.createInputRow('Maze Scale', 'scale', rowY, panel);
      rowY = this.createInputRow('Camera Scale', 'camScale', rowY, panel);
    }

    rowY = this.createFeatureControlRows(rowY, panel, { includeMovementSpeed: false });

    if (showAdvancedOptions && !compact) {
      rowY = this.createColorInputRow('Path RGB 0-255', ['pathR', 'pathG', 'pathB'], rowY, panel, this.settings.pathColor);
      rowY = this.createColorInputRow('Wall RGB 0-255', ['wallR', 'wallG', 'wallB'], rowY, panel, this.settings.wallColor);
    }

    this.createLegacyOptionsAccountActionRow(panel);
  }

  private createLegacyOptionsInfoSection(
    rowY: number,
    panel: OverlayPanelFrame,
    options: {
      exactTop?: boolean;
      rightGutter?: number;
      scrollOffset?: number;
      viewport?: VisualRect | null;
    } = {}
  ): number {
    const compact = panel.width < 420;
    const guideLayout = resolveLegacyOptionsGuideLayout(panel.width);
    const cardHeight = guideLayout.cardHeight;
    const rightGutter = options.rightGutter ?? 0;
    const cardWidth = Math.min(
      panel.width - guideLayout.horizontalMargin - rightGutter,
      guideLayout.cardWidthLimit
    );
    const cardCenterX = panel.centerX - (rightGutter / 2);
    const cardLeft = cardCenterX - (cardWidth / 2);
    const contentCardTop = options.exactTop === true
      ? rowY
      : Math.max(panel.top + (compact ? 82 : 88), rowY + (compact ? 8 : 10));
    const cardTop = contentCardTop - (options.scrollOffset ?? 0);
    const viewport = options.viewport ?? null;
    const cardIntersectsViewport = viewport === null || (
      cardTop < viewport.bottom
      && cardTop + cardHeight > viewport.top
    );

    if (!cardIntersectsViewport) {
      this.overlayGuideBounds = null;
      return contentCardTop + cardHeight + (options.exactTop === true ? 0 : (compact ? 14 : 16));
    }

    const guideGraphics = this.add.graphics();
    this.overlayGuideGraphics = guideGraphics;

    const inset = guideLayout.inset;
    const titleY = cardTop + guideLayout.titleOffset;
    const titleRuleY = cardTop + guideLayout.titleRuleOffset;
    const legendTop = cardTop + guideLayout.legendTopOffset;
    const rowHeight = guideLayout.rowHeight;
    const guideTitleFontSize = guideLayout.titleFontSize;
    const guideRowFontSize = guideLayout.rowFontSize;
    const guideRowMinFontSize = guideLayout.rowMinFontSize;
    const detailLeft = cardLeft + inset;
    const detailWidth = cardWidth - (inset * 2);
    const detailRight = detailLeft + detailWidth;
    const visibleCardTop = viewport === null ? cardTop : Math.max(cardTop, viewport.top);
    const visibleCardBottom = viewport === null ? cardTop + cardHeight : Math.min(cardTop + cardHeight, viewport.bottom);
    const visibleCardHeight = Math.max(0, visibleCardBottom - visibleCardTop);
    if (visibleCardHeight < 44) {
      this.overlayGuideBounds = null;
      return contentCardTop + cardHeight + (options.exactTop === true ? 0 : (compact ? 14 : 16));
    }
    this.overlayGuideBounds = createVisualRect(cardLeft, visibleCardTop, cardWidth, visibleCardHeight);

    this.drawLegacyCyberPanel(guideGraphics, {
      active: true,
      alpha: 0.66,
      fill: LEGACY_PLAY_HUD_TIMER_PANE,
      height: visibleCardHeight,
      left: cardLeft,
      radius: 12,
      top: visibleCardTop,
      width: cardWidth
    });
    guideGraphics.lineStyle(1, LEGACY_PLAY_TOUCH_ACCENT, 0.62);
    guideGraphics.strokeRoundedRect(cardLeft + 4, visibleCardTop + 4, cardWidth - 8, Math.max(1, visibleCardHeight - 8), 9);
    if (titleRuleY >= visibleCardTop + 2 && titleRuleY <= visibleCardBottom - 2) {
      guideGraphics.lineStyle(1, LEGACY_CYBER_PANEL_STROKE_ALT, 0.26);
      guideGraphics.lineBetween(cardLeft + inset, titleRuleY, cardLeft + cardWidth - inset, titleRuleY);
    }

    const addText = (
      copy: string,
      x: number,
      y: number,
      width: number,
      color: string,
      fontSize: number,
      originX = 0,
      alpha = 0.94,
      minFontSize = 9
    ): Phaser.GameObjects.Text | null => {
      const label = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(x, y, copy, {
        align: 'left',
        color,
        fontFamily: LEGACY_UI_FONT_FAMILY,
        fontSize: `${fontSize}px`
      })), width, fontSize, minFontSize)
        .setOrigin(originX, 0.5)
        .setAlpha(alpha);
      const bounds = visualRectFromBounds(label.getBounds());
      if (viewport !== null && (
        bounds.top < viewport.top + 2
        || bounds.bottom > viewport.bottom - 2
      )) {
        label.destroy();
        return null;
      }
      this.uiTexts.push(label);
      return label;
    };

    addText('PLAYER GUIDE', cardCenterX, titleY, cardWidth - (inset * 2), '#9dffd5', guideTitleFontSize, 0.5, 1, guideRowMinFontSize);

    const drawLegendRow = (
      index: number,
      kind: 'compass' | 'start' | 'end',
      title: string,
      copy: string,
      color: string
    ): void => {
      const rowTop = legendTop + (index * rowHeight);
      const glyphX = detailLeft + (compact ? 14 : 16);
      const glyphY = rowTop + (rowHeight / 2);
      const labelX = detailLeft + (compact ? 28 : 34);
      if (compact) {
        if (viewport === null || (glyphY - 6 >= viewport.top + 2 && glyphY + 6 <= viewport.bottom - 2)) {
          this.drawLegacyOptionsGuideGlyph(kind, glyphX, glyphY, 12, guideGraphics);
        }
        addText(
          `${title}: ${copy}`,
          labelX,
          glyphY,
          Math.max(96, detailRight - labelX),
          color,
          guideRowFontSize,
          0,
          0.96,
          guideRowMinFontSize
        );
        return;
      }
      const labelWidth = Math.min(compact ? 76 : 118, Math.round(detailWidth * (compact ? 0.32 : 0.36)));
      const copyX = labelX + labelWidth + (compact ? 4 : 8);
      const copyWidth = Math.max(compact ? 82 : 104, detailRight - copyX);
      if (viewport === null || (glyphY - 7 >= viewport.top + 2 && glyphY + 7 <= viewport.bottom - 2)) {
        this.drawLegacyOptionsGuideGlyph(kind, glyphX, glyphY, 13, guideGraphics);
      }
      addText(title, labelX, glyphY, labelWidth, color, guideRowFontSize, 0, 1, guideRowMinFontSize);
      addText(
        copy,
        copyX,
        glyphY,
        copyWidth,
        '#d9fff5',
        guideRowFontSize,
        0,
        0.92,
        compact ? 11 : guideRowMinFontSize
      );
    };

    drawLegendRow(0, 'compass', 'Compass', 'points to End', '#b7f2ff');
    drawLegendRow(1, 'start', 'Start', 'run begins', '#fff05a');
    drawLegendRow(2, 'end', 'End', 'clear here', '#ff5264');
    const bulletTop = legendTop + (3 * rowHeight) + (compact ? 14 : 12);
    const bullets = [
      'Player: green beacon + trail',
      `${this.mode === 'play' ? 'Rank' : 'AI Rank'}: public tier`,
      'Score: run quality; Runs: clears',
      'Maze Lvl: challenge tier'
    ];
    bullets.forEach((copy, index) => {
      addText(`• ${copy}`, detailLeft, bulletTop + (index * rowHeight), detailWidth, '#d9fff5', guideRowFontSize, 0, 0.92, guideRowMinFontSize);
    });

    return contentCardTop + cardHeight + (options.exactTop === true ? 0 : (compact ? 14 : 16));
  }

  private drawLegacyOptionsGuideGlyph(
    kind: 'compass' | 'start' | 'end',
    centerX: number,
    centerY: number,
    size: number,
    graphics: Phaser.GameObjects.Graphics = this.overlayGraphics
  ): void {
    if (kind === 'compass') {
      this.drawLegacyCompassGlyph(graphics, centerX, centerY, size, -Math.PI / 2, this.resolveActiveLegacyProgressionPalette(), this.time.now, false);
      return;
    }
    this.drawLegacyEndpointMarker(graphics, centerX, centerY, size * 2, 0.94, kind === 'start' ? 'start' : 'goal');
  }

  private createLegacyOptionsAccountActionRow(
    panel: OverlayPanelFrame,
    options: {
      contentCenterY?: number | null;
      scrollOffset?: number;
      viewport?: VisualRect | null;
    } = {}
  ): void {
    const compact = panel.width < 420;
    const label = this.authSnapshot.status === 'authenticated' ? 'Log out' : 'Account';
    const buttonWidth = Math.min(panel.width - 72, compact ? 190 : 220);
    const buttonHeight = compact ? 44 : 48;
    const contentCenterY = options.contentCenterY ?? panel.top + panel.height - (compact ? 48 : 56);
    const buttonY = contentCenterY - (options.scrollOffset ?? 0);
    const viewport = options.viewport ?? null;
    if (viewport !== null && (
      buttonY - (buttonHeight / 2) < viewport.top + 2
      || buttonY + (buttonHeight / 2) > viewport.bottom - 2
    )) {
      return;
    }
    const action = (): void => {
      if (this.authSnapshot.status === 'authenticated') {
        void this.handleLegacyAuthSignOut();
        return;
      }

      this.openOverlay('auth');
    };

    this.uiButtons.push(this.createButton(
      panel.centerX,
      buttonY,
      buttonWidth,
      buttonHeight,
      label,
      action,
      { labelRole: 'overlay-action' }
    ));
  }

  private shouldShowLegacyAdvancedOptions(): boolean {
    return resolveLegacyAdvancedOptionsVisible(typeof window === 'undefined' ? '' : window.location.search);
  }

  private buildPauseOverlay(): void {
    const panel = this.resolveOverlayPanelFrame('pause');
    this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.applyLegacyPauseCommand('resume')));
    this.createOverlayTitle('Paused', panel.top + 52);
    const stacked = panel.width < 420;
    const messageY = panel.top + (stacked ? 86 : 92);
    const visibleMessages = this.resolveVisibleLegacyPlayerMessages();
    const hasOverlayMessage = visibleMessages.length > 0;
    if (hasOverlayMessage) {
      this.createOverlayPlayerMessageStack(visibleMessages, messageY, panel);
    }
    const actionButtonHeight = stacked ? 42 : 48;
    const actionY = panel.top + panel.height - (stacked ? 42 : 54);
    const viewportTop = panel.top + (stacked ? 112 : 120) + (hasOverlayMessage ? 22 : 0);
    const viewportBottom = actionY - (actionButtonHeight * 2) - 4;
    const viewport = createVisualRect(
      panel.left + 24,
      viewportTop,
      panel.width - 48,
      Math.max(120, viewportBottom - viewportTop)
    );
    const controlContentHeight = this.resolveFeatureControlRowsContentHeight(panel, {
      includeMovementSpeed: true,
      showDescriptions: true
    });
    const contentFlow = resolveLegacyOverlayContentFlowLayout({
      contentTop: viewport.top,
      controlsHeight: controlContentHeight,
      guideHeight: resolveLegacyOptionsGuideLayout(panel.width).cardHeight,
      panelWidth: panel.width
    });
    const scrollMetrics = resolveLegacyOverlayScrollMetrics({
      contentHeight: contentFlow.contentHeight,
      offset: this.overlayScrollOffset,
      viewport: this.visualRectToLegacyOverlayScrollRect(viewport)
    });
    this.applyLegacyOverlayScrollMetrics(scrollMetrics);
    this.createLegacyOptionsInfoSection(contentFlow.guideTop, panel, {
      exactTop: true,
      rightGutter: LEGACY_OVERLAY_SCROLL_RIGHT_GUTTER,
      scrollOffset: scrollMetrics.offset,
      viewport
    });
    this.createFeatureControlRows(contentFlow.controlsTop, panel, {
      includeMovementSpeed: true,
      rightGutter: LEGACY_OVERLAY_SCROLL_RIGHT_GUTTER,
      scrollOffset: scrollMetrics.offset,
      showDescriptions: true,
      viewport
    });
    this.drawLegacyOverlayScrollFacade(scrollMetrics);

    const resetAction = (): void => this.applyLegacyPauseCommand('reset-player');
    const mainMenuAction = (): void => this.applyLegacyPauseCommand('return-menu');
    const progressionResetAction = (): void => this.openOverlay('confirm-progression-reset');

    if (stacked) {
      const compactActionWidth = Math.min(128, Math.floor((panel.width - 64) / 2));
      const compactActionGap = 14;
      const compactOffset = compactActionWidth + compactActionGap;
      this.uiButtons.push(
        this.createButton(panel.centerX - (compactOffset / 2), actionY, compactActionWidth, actionButtonHeight, 'Reset', resetAction),
        this.createButton(panel.centerX + (compactOffset / 2), actionY, compactActionWidth, actionButtonHeight, 'Menu', mainMenuAction),
        this.createButton(panel.centerX, actionY - actionButtonHeight - 10, Math.min(232, panel.width - 72), actionButtonHeight, 'Reset Progress', progressionResetAction)
      );
      return;
    }

    const desktopActionWidth = Math.min(140, Math.floor((panel.width - 72) / 2));
    const desktopActionGap = 14;
    const desktopOffset = (desktopActionWidth + desktopActionGap) / 2;
    this.uiButtons.push(
      this.createButton(panel.centerX - desktopOffset, actionY, desktopActionWidth, actionButtonHeight, 'Reset', resetAction),
      this.createButton(panel.centerX + desktopOffset, actionY, desktopActionWidth, actionButtonHeight, 'Menu', mainMenuAction),
      this.createButton(panel.centerX, actionY - actionButtonHeight - 14, Math.min(252, panel.width - 88), actionButtonHeight, 'Reset Progress', progressionResetAction)
    );
  }

  private buildProgressionResetConfirmationOverlay(): void {
    const panel = this.resolveOverlayPanelFrame('confirm-progression-reset');
    const compact = panel.width < 420;
    const buttonHeight = compact ? 44 : 48;
    const buttonWidth = Math.min(panel.width - 72, compact ? 240 : 280);
    const bodyWidth = Math.min(panel.width - 72, compact ? 300 : 440);
    const bodyY = panel.top + (compact ? 138 : 156);
    const actionY = panel.top + panel.height - (compact ? 72 : 84);

    this.createOverlayTitle('Reset Progress?', panel.top + (compact ? 52 : 58));
    const body = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(panel.centerX, bodyY, 'This resets your rank progress, score, runs, and maze level to the starting baseline. Your menu AI progression stays unchanged.', {
      align: 'center',
      color: '#d9fff5',
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${compact ? 16 : 18}px`,
      wordWrap: { width: bodyWidth }
    })), bodyWidth, compact ? 16 : 18, 13).setOrigin(0.5, 0.5);
    this.uiTexts.push(body);

    const cancel = (): void => this.openOverlay('pause');
    const confirm = (): void => this.resetLegacyPlayerProgression();
    if (compact) {
      const width = Math.floor((buttonWidth - 12) / 2);
      this.uiButtons.push(
        this.createButton(panel.centerX - (width / 2) - 6, actionY, width, buttonHeight, 'Cancel', cancel),
        this.createButton(panel.centerX + (width / 2) + 6, actionY, width, buttonHeight, 'Confirm', confirm)
      );
      return;
    }

    this.uiButtons.push(
      this.createButton(panel.centerX, actionY - 28, buttonWidth, buttonHeight, 'Confirm Reset', confirm),
      this.createButton(panel.centerX, actionY + 30, buttonWidth, buttonHeight, 'Cancel', cancel)
    );
  }

  private buildAuthOverlay(): void {
    const panel = this.resolveOverlayPanelFrame('auth');
    const stacked = panel.width < 420;
    const fieldWidth = Math.min(panel.width - 56, stacked ? 330 : 420);
    const fieldHeight = stacked ? 44 : 48;
    const buttonHeight = stacked ? 44 : 48;
    const buttonWidth = Math.min(panel.width - 72, stacked ? 260 : 320);
    const centerX = panel.centerX;
    const panelBottom = panel.top + panel.height;
    let rowY = panel.top + (stacked ? 106 : 122);

    this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.handleBackAction()));
    this.createOverlayTitle('Account', panel.top + (stacked ? 46 : 54));

    const accountLabel = resolveLegacyAuthAccountLabel(this.authSnapshot);
    this.latestAuthMessage = this.resolveLegacyCurrentAuthMessage();
    const visibleMessages = this.resolveVisibleLegacyPlayerMessages();
    if (visibleMessages.length > 0) {
      this.createOverlayPlayerMessageStack(visibleMessages, panel.top + (stacked ? 80 : 88), panel);
      rowY += visibleMessages.length * (stacked ? 18 : 20);
    }

    if (this.authSnapshot.status === 'authenticated') {
      this.createAuthInfoText(`Signed in as ${accountLabel}`, rowY, panel, '#72e0bf');
      rowY += stacked ? 48 : 54;
      const detail = this.authSnapshot.email ?? this.authSnapshot.userId ?? '';
      if (detail.length > 0) {
        this.createAuthInfoText(detail, rowY, panel, '#b7f2ff', stacked ? 14 : 16);
        rowY += stacked ? 50 : 58;
      }

      this.uiButtons.push(
        this.createButton(centerX, panelBottom - (stacked ? 116 : 126), buttonWidth, buttonHeight, 'Log out', () => {
          void this.handleLegacyAuthSignOut();
        }),
        this.createButton(centerX, panelBottom - (stacked ? 62 : 68), buttonWidth, buttonHeight, 'Close', () => this.closeOverlay())
      );
      return;
    }

    this.createAuthFieldBox(centerX, rowY, fieldWidth, fieldHeight, 'email', this.authForm.email || 'email', this.authForm.email.length === 0);
    rowY += stacked ? 56 : 62;
    this.createAuthFieldBox(centerX, rowY, fieldWidth, fieldHeight, 'password', this.maskLegacyAuthPassword(), this.authForm.password.length === 0);
    rowY += stacked ? 56 : 62;

    if (this.authForm.mode === 'signup') {
      this.createAuthFieldBox(
        centerX,
        rowY,
        fieldWidth,
        fieldHeight,
        'displayName',
        this.authForm.displayName || 'display name',
        this.authForm.displayName.length === 0
      );
      rowY += stacked ? 56 : 62;
    }

    const primaryLabel = this.authSubmitting
      ? 'Working'
      : this.authForm.mode === 'signup'
        ? 'Create'
        : 'Login';
    const secondaryModeLabel = this.authForm.mode === 'signup' ? 'Use Login' : 'Create Account';
    const bottomButtonGap = stacked ? 54 : 58;
    const bottomStartY = panelBottom - (stacked ? 184 : 196);

    this.uiButtons.push(
      this.createButton(centerX, bottomStartY, buttonWidth, buttonHeight, primaryLabel, () => {
        void this.handleLegacyAuthSubmit();
      }),
      this.createButton(centerX, bottomStartY + bottomButtonGap, buttonWidth, buttonHeight, secondaryModeLabel, () => {
        this.setLegacyAuthFormMode(this.authForm.mode === 'signup' ? 'login' : 'signup');
      }),
      this.createButton(centerX, bottomStartY + (bottomButtonGap * 2), buttonWidth, buttonHeight, 'Reset Password', () => {
        void this.handleLegacyAuthPasswordReset();
      })
    );
    this.latestAuthMessage = this.resolveLegacyCurrentAuthMessage();
  }

  private resolveLegacyCurrentAuthMessage(): LegacyPlayerMessage | null {
    const feedbackMessage = resolveLegacyAuthFeedbackMessage(this.authSnapshot.error, this.authSnapshot.info);
    if (feedbackMessage) {
      return feedbackMessage;
    }

    if (this.authSnapshot.status === 'authenticated') {
      return null;
    }

    const submitState = resolveLegacyAuthSubmitState(this.authForm, this.authSnapshot.configured);
    const validationCopy = submitState.reason ?? (
      this.authForm.mode === 'signup'
        ? LEGACY_AUTH_MESSAGE_COPY.createReady
        : LEGACY_AUTH_MESSAGE_COPY.loginReady
    );

    return resolveLegacyAuthValidationMessage(validationCopy, submitState.canSubmit);
  }

  private resolveVisibleLegacyPlayerMessages(): LegacyPlayerMessage[] {
    return this.playerMessageQueue.map((entry) => entry.message);
  }

  private pushLegacyPlayerMessage(message: LegacyPlayerMessage | null): void {
    if (!message) {
      return;
    }

    this.playerMessageSequence += 1;
    this.playerMessageQueue = enqueueLegacyPlayerMessage(
      this.playerMessageQueue,
      message,
      this.time.now,
      this.playerMessageSequence
    );
    this.markLegacyPlayerMessagesDirty();
  }

  private clearQueuedLegacyPlayerMessagesBySource(source: LegacyPlayerMessage['source']): void {
    const nextQueue = this.playerMessageQueue.filter((entry) => entry.message.source !== source);
    if (nextQueue.length !== this.playerMessageQueue.length) {
      this.playerMessageQueue = nextQueue;
      this.markLegacyPlayerMessagesDirty();
    }
  }

  private markLegacyPlayerMessagesDirty(): void {
    if (this.mode === 'play' && this.overlay === 'none') {
      this.hudDirty = true;
    } else {
      this.uiDirty = true;
    }
    this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
  }

  private setLatestOverlayMessage(message: LegacyPlayerMessage | null): void {
    this.latestOverlayMessage = message;
    this.latestOverlayMessageExpiresAtMs = message
      ? this.time.now + message.durationMs
      : Number.NEGATIVE_INFINITY;
    this.pushLegacyPlayerMessage(message);
  }

  private armLegacyAuthFeedbackMessage(): void {
    const message = resolveLegacyAuthFeedbackMessage(this.authSnapshot.error, this.authSnapshot.info);
    this.latestAuthFeedbackMessageExpiresAtMs = message
      ? this.time.now + message.durationMs
      : Number.NEGATIVE_INFINITY;
    this.pushLegacyPlayerMessage(message);
  }

  private clearLegacyAuthFeedbackMessage(): void {
    this.authSnapshot = {
      ...this.authSnapshot,
      error: null,
      info: null
    };
    this.latestAuthFeedbackMessageExpiresAtMs = Number.NEGATIVE_INFINITY;
    this.latestAuthMessage = this.resolveLegacyCurrentAuthMessage();
    this.clearQueuedLegacyPlayerMessagesBySource('auth');
  }

  private expireLegacyPlayerMessages(time: number): void {
    let expired = false;
    const nextQueue = expireLegacyPlayerMessageQueue(this.playerMessageQueue, time);
    if (nextQueue.length !== this.playerMessageQueue.length) {
      this.playerMessageQueue = nextQueue;
      expired = true;
    }

    if (this.latestOverlayMessage && time >= this.latestOverlayMessageExpiresAtMs) {
      this.setLatestOverlayMessage(null);
      expired = true;
    }

    if (
      (this.authSnapshot.error !== null || this.authSnapshot.info !== null)
      && time >= this.latestAuthFeedbackMessageExpiresAtMs
    ) {
      this.clearLegacyAuthFeedbackMessage();
      expired = true;
    }

    if (expired) {
      this.markLegacyPlayerMessagesDirty();
    }
  }

  private createOverlayPlayerMessageStack(
    messages: readonly LegacyPlayerMessage[],
    y: number,
    panel: OverlayPanelFrame
  ): void {
    const stacked = panel.width < 420;
    const cardGap = stacked ? 34 : 38;
    const firstY = y - (((messages.length - 1) * cardGap) / 2);

    messages.forEach((message, index) => {
      this.createOverlayPlayerMessageCard(message, firstY + (index * cardGap), panel);
    });
  }

  private createAuthInfoText(
    copy: string,
    y: number,
    panel: OverlayPanelFrame,
    color: string,
    fontSize?: number
  ): void {
    const maxWidth = panel.width - 56;
    const label = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(panel.centerX, y, copy, {
      align: 'center',
      color,
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${fontSize ?? (panel.width < 420 ? 16 : 18)}px`,
      wordWrap: { width: maxWidth, useAdvancedWrap: true }
    })), maxWidth, fontSize ?? 18, 11).setOrigin(0.5);
    this.uiTexts.push(label);
  }

  private createOverlayPlayerMessageCard(
    message: LegacyPlayerMessage,
    y: number,
    panel: OverlayPanelFrame
  ): void {
    const stacked = panel.width < 420;
    const cardWidth = Math.min(panel.width - (stacked ? 56 : 92), stacked ? 330 : 430);
    const cardHeight = stacked ? 30 : 34;
    const cardLeft = panel.centerX - (cardWidth / 2);
    const cardTop = y - (cardHeight / 2);
    const toneColor = Phaser.Display.Color.HexStringToColor(resolveLegacyPlayerMessageColor(message)).color;

    this.drawLegacyCyberPanel(this.overlayGraphics, {
      active: true,
      alpha: message.tone === 'error' ? 0.94 : 0.86,
      fill: message.tone === 'error' ? 0x211019 : LEGACY_CYBER_PANEL_FILL,
      height: cardHeight,
      left: cardLeft,
      radius: 10,
      top: cardTop,
      width: cardWidth
    });
    this.overlayGraphics.lineStyle(1, toneColor, message.tone === 'error' ? 0.84 : 0.62);
    this.overlayGraphics.strokeRoundedRect(cardLeft + 3, cardTop + 3, cardWidth - 6, cardHeight - 6, 8);

    const maxWidth = cardWidth - 24;
    const text = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(panel.centerX, y, message.copy, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: stacked ? '13px' : '15px',
      color: resolveLegacyPlayerMessageColor(message),
      align: 'center'
    })), maxWidth, stacked ? 13 : 15, 11).setOrigin(0.5);
    this.uiTexts.push(text);
  }

  private createAuthFieldBox(
    x: number,
    y: number,
    width: number,
    height: number,
    fieldId: LegacyAuthFieldId,
    value: string,
    placeholder: boolean
  ): void {
    const isActive = this.activeAuthField === fieldId;
    const background = this.add.rectangle(x, y, width, height, LEGACY_CYBER_PANEL_FILL, isActive ? 0.76 : 0.5);
    background.setStrokeStyle(2, isActive ? LEGACY_PLAY_TOUCH_ACCENT : LEGACY_PLAY_TOUCH_BUTTON_STROKE, isActive ? 0.95 : 0.42);
    background.setInteractive({ useHandCursor: true });
    background.on('pointerdown', () => this.selectLegacyAuthField(fieldId, { height, width, x, y }));
    if (isActive) {
      this.positionLegacyAuthNativeInput(fieldId, { height, width, x, y });
    }

    const label = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(x, y, value, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${Math.max(14, Math.min(20, Math.round(height * 0.38)))}px`,
      color: placeholder ? '#7894a0' : (isActive ? '#72e0bf' : '#ecfff5')
    })), width - 24, Math.max(14, Math.min(20, Math.round(height * 0.38))), 10).setOrigin(0.5);
    const caret = isActive
      ? this.add.rectangle(
        placeholder ? x - (width / 2) + 22 : Math.min(x + (width / 2) - 18, label.x + (label.displayWidth / 2) + 6),
        y,
        Math.max(2, Math.round(width * 0.006)),
        Math.max(18, Math.round(height * 0.5)),
        LEGACY_PLAY_TOUCH_ACCENT,
        0.98
      ).setOrigin(0.5)
      : null;
    if (caret) {
      this.tweens.add({
        targets: caret,
        alpha: 0.18,
        duration: 420,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1
      });
    }

    this.uiButtons.push({
      background,
      bounds: createVisualRect(x - (width / 2), y - (height / 2), width, height),
      label,
      setActive: () => undefined,
      text: fieldId,
      destroy: () => {
        if (caret) {
          this.tweens.killTweensOf(caret);
          caret.destroy();
        }
        background.destroy();
        label.destroy();
      }
    });
  }

  private createFeatureControlRows(
    y: number,
    panel: OverlayPanelFrame,
    options: {
      includeMovementSpeed?: boolean;
      rightGutter?: number;
      scrollOffset?: number;
      showDescriptions?: boolean;
      viewport?: VisualRect | null;
    } = {}
  ): number {
    const stacked = panel.width < 420;
    const left = panel.left + 28;
    const width = panel.width - 56 - (options.rightGutter ?? 0);
    const showDescriptions = options.showDescriptions === true;
    const controlLayout = resolveLegacyFeatureControlLayout(panel.width, showDescriptions);
    const rowHeight = controlLayout.rowHeight;
    const rowGap = controlLayout.rowGap;
    const scrollOffset = options.scrollOffset ?? 0;
    const viewport = options.viewport ?? null;
    const toRenderY = (contentY: number): number => contentY - scrollOffset;
    const isVisible = (centerY: number, height: number): boolean => (
      viewport === null || (
        centerY - (height / 2) >= viewport.top + 2
        && centerY + (height / 2) <= viewport.bottom - 2
      )
    );
    const controls: Array<{
      checked: boolean;
      description: string;
      label: string;
      offLabel: string;
      onClick: () => void;
      onLabel: string;
      stateText: string;
    }> = [
      {
        checked: resolveLegacyOverlayToggleSwitchIsOn('toggleCameraFollow', this.settings),
        description: this.settings.toggleCameraFollow
          ? 'On: camera follows you.'
          : 'Off: full maze view.',
        label: 'Camera Follow',
        offLabel: 'Off',
        onClick: () => this.applyLegacyOverlayToggleField('toggleCameraFollow'),
        onLabel: 'On',
        stateText: resolveLegacyOverlayToggleStateText('toggleCameraFollow', this.settings.toggleCameraFollow) ?? 'Off'
      },
      {
        checked: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailFade', this.settings),
        description: this.settings.toggleTrailFade
          ? 'On: old trail fades.'
          : 'Off: trail stays.',
        label: 'Trail Fade',
        offLabel: 'Off',
        onClick: () => this.applyLegacyOverlayToggleField('toggleTrailFade'),
        onLabel: 'On',
        stateText: resolveLegacyOverlayToggleStateText('toggleTrailFade', this.settings.toggleTrailFade) ?? 'Off'
      },
      {
        checked: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailPulse', this.settings),
        description: this.settings.toggleTrailPulse
          ? 'On: white shine travels.'
          : 'Off: no trail shine.',
        label: 'Trail Shine',
        offLabel: 'Off',
        onClick: () => this.applyLegacyOverlayToggleField('toggleTrailPulse'),
        onLabel: 'On',
        stateText: resolveLegacyOverlayToggleStateText('toggleTrailPulse', this.settings.toggleTrailPulse) ?? 'Off'
      },
      {
        checked: resolveLegacyOverlayToggleSwitchIsOn('toggleAnimatedBackdrop', this.settings),
        description: this.settings.toggleAnimatedBackdrop
          ? 'On: background moves.'
          : 'Off: background still.',
        label: 'Animated BG',
        offLabel: 'Stagnant',
        onClick: () => this.applyLegacyOverlayToggleField('toggleAnimatedBackdrop'),
        onLabel: 'Animated',
        stateText: resolveLegacyOverlayToggleStateText('toggleAnimatedBackdrop', this.settings.toggleAnimatedBackdrop) ?? 'Stagnant'
      },
      {
        checked: resolveLegacyOverlayToggleSwitchIsOn('darkMode', this.settings),
        description: this.settings.darkMode
          ? 'On: darker contrast.'
          : 'Off: brighter view.',
        label: 'Dark Mode',
        offLabel: 'Off',
        onClick: () => this.applyLegacyOverlayToggleField('darkMode'),
        onLabel: 'On',
        stateText: resolveLegacyOverlayToggleStateText('darkMode', this.settings.darkMode) ?? 'Off'
      },
      {
        checked: resolveLegacyOverlayToggleSwitchIsOn('controlMode', this.settings),
        description: this.settings.controlMode === 'stick'
          ? 'Stick: drag to move.'
          : 'Arrows: tap to move.',
        label: 'Controls',
        offLabel: 'Arrows',
        onClick: () => this.applyLegacyOverlayToggleField('controlMode'),
        onLabel: 'Stick',
        stateText: resolveLegacyOverlayToggleStateText('controlMode', this.settings.controlMode === 'stick') ?? 'Arrows'
      }
    ];

    const gridTop = y + (stacked ? 4 : 6);
    controls.forEach((control, index) => {
      const rowCenterY = gridTop + (index * (rowHeight + rowGap)) + Math.round(rowHeight / 2);
      const renderY = toRenderY(rowCenterY);
      if (!isVisible(renderY, rowHeight)) {
        return;
      }

      this.uiButtons.push(
        this.createToggleSwitchRow({
          checked: control.checked,
          description: showDescriptions ? control.description : undefined,
          label: control.label,
          offLabel: control.offLabel,
          onClick: control.onClick,
          onLabel: control.onLabel,
          stateText: control.stateText,
          x: left + Math.round(width / 2),
          y: renderY,
          width,
          height: rowHeight
        })
      );
    });

    const sliderY = gridTop + (controls.length * (rowHeight + rowGap)) + Math.round(rowHeight / 2);
    const sliderRenderY = toRenderY(sliderY);
    if (options.includeMovementSpeed === true && isVisible(sliderRenderY, rowHeight)) {
      this.uiButtons.push(
        this.createMovementSpeedSliderRow({
          height: rowHeight,
          label: 'Move Speed',
          stateText: formatLegacyMovementSpeedPercent(this.settings.movementSpeed),
          value: normalizeLegacyMovementSpeed(this.settings.movementSpeed),
          x: left + Math.round(width / 2),
          y: sliderRenderY,
          width
        })
      );
    }

    return options.includeMovementSpeed === true
      ? sliderY + Math.round(rowHeight / 2) + (stacked ? 10 : 6)
      : gridTop + (controls.length * (rowHeight + rowGap));
  }

  private createToggleSwitchRow(input: {
    checked: boolean;
    description?: string;
    height: number;
    label: string;
    offLabel: string;
    onClick: () => void;
    onLabel: string;
    stateText: string;
    width: number;
    x: number;
    y: number;
  }): UiButton {
    const left = input.x - (input.width / 2);
    const rowFill = input.checked ? 0x10251e : LEGACY_CYBER_PANEL_FILL;
    const rowStroke = input.checked ? LEGACY_PLAY_TOUCH_ACCENT : LEGACY_PLAY_TOUCH_BUTTON_STROKE;
    const stateColor = input.checked ? '#72e0bf' : '#b7f2ff';
    const hasDescription = Boolean(input.description);
    const uiLayout = resolveLegacyToggleRowLayout(input.width, input.height, hasDescription);
    const rowPaddingX = uiLayout.rowPaddingX;
    const trackWidth = uiLayout.trackWidth;
    const trackHeight = uiLayout.trackHeight;
    const trackX = left + input.width - rowPaddingX - Math.round(trackWidth / 2);
    const trackLeft = trackX - Math.round(trackWidth / 2);
    const trackGap = uiLayout.trackGap;
    const showStateLabel = uiLayout.showStateLabel;
    const stateLaneWidth = uiLayout.stateLaneWidth;
    const stateLabelRight = trackLeft - trackGap;
    const labelX = left + rowPaddingX;
    const labelRight = showStateLabel
      ? stateLabelRight - stateLaneWidth - trackGap
      : stateLabelRight - trackGap;
    const labelMaxWidth = Math.max(54, labelRight - labelX);
    const titleY = resolveLegacyUiLabelCenterY(
      input.y + (hasDescription ? -Math.round(input.height * 0.24) : 0),
      uiLayout.labelFontSize,
      'toggle-title'
    );
    const background = this.add.rectangle(input.x, input.y, input.width, input.height, rowFill, input.checked ? 0.62 : 0.5);
    background.setStrokeStyle(1, rowStroke, input.checked ? 0.56 : 0.38);
    background.setInteractive({ useHandCursor: true });

    const label = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(labelX, titleY, input.label, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${uiLayout.labelFontSize}px`,
      color: '#ecfff5'
    })), labelMaxWidth, uiLayout.labelFontSize, 11).setOrigin(0, 0.5).setAlpha(0.94);

    const displayStateText = input.stateText || (input.checked ? input.onLabel : input.offLabel);
    const stateLabel = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(stateLabelRight, titleY, displayStateText || input.stateText, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${uiLayout.stateFontSize}px`,
      color: stateColor
    })), stateLaneWidth, uiLayout.stateFontSize, 9)
      .setOrigin(1, 0.5)
      .setAlpha(showStateLabel ? 0.92 : 0)
      .setVisible(showStateLabel);
    this.uiTexts.push(label);
    if (showStateLabel) {
      this.uiTexts.push(stateLabel);
    }

    const descriptionFontSize = Math.max(10, Math.min(12, Math.round(input.height * 0.18)));
    const descriptionMaxWidth = Math.max(72, labelRight - labelX);
    const description = hasDescription
      ? this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(labelX, input.y + Math.round(input.height * 0.3), input.description!, {
        color: '#bfe9de',
        fontFamily: LEGACY_UI_FONT_FAMILY,
        fontSize: `${descriptionFontSize}px`
      })), descriptionMaxWidth, descriptionFontSize, 9)
        .setOrigin(0, 0.5)
        .setAlpha(0.84)
      : null;
    if (description) {
      this.uiTexts.push(description);
    }

    const track = this.add.ellipse(trackX, titleY, trackWidth, trackHeight, input.checked ? 0x123a2d : 0x07131d, 0.9);
    track.setStrokeStyle(2, rowStroke, input.checked ? 0.66 : 0.52);
    const knobX = trackX + (input.checked ? 9 : -9);
    const knob = this.add.circle(knobX, titleY, 8, input.checked ? LEGACY_PLAY_TOUCH_ACCENT : LEGACY_PLAY_TOUCH_BUTTON_STROKE, 0.98);
    knob.setStrokeStyle(1, 0xecfff5, input.checked ? 0.7 : 0.46);
    let pressStart: { x: number; y: number } | null = null;

    const setActive = (active: boolean): void => {
      background.setFillStyle(rowFill, active ? 0.7 : (input.checked ? 0.58 : 0.5));
      background.setStrokeStyle(1, rowStroke, active ? 0.72 : (input.checked ? 0.42 : 0.34));
      track.setStrokeStyle(2, rowStroke, active ? 0.88 : (input.checked ? 0.66 : 0.52));
      knob.setScale(active ? 1.08 : 1);
      label.setAlpha(active ? 1 : 0.94);
      stateLabel.setAlpha(active ? 1 : 0.92);
    };

    background.on('pointerover', () => setActive(true));
    background.on('pointerout', () => {
      setActive(false);
      pressStart = null;
    });
    background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pressStart = { x: pointer.x, y: pointer.y };
    });
    background.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pressStart === null) {
        return;
      }
      const dragDistance = Math.hypot(pointer.x - pressStart.x, pointer.y - pressStart.y);
      pressStart = null;
      if (dragDistance <= 8) {
        input.onClick();
      }
    });

    return {
      background,
      bounds: createVisualRect(left, input.y - (input.height / 2), input.width, input.height),
      label,
      setActive,
      text: input.label,
      destroy: () => {
        background.destroy();
        label.destroy();
        stateLabel.destroy();
        description?.destroy();
        track.destroy();
        knob.destroy();
      }
    };
  }

  private createMovementSpeedSliderRow(input: {
    height: number;
    label: string;
    stateText: string;
    value: number;
    width: number;
    x: number;
    y: number;
  }): UiButton {
    const left = input.x - (input.width / 2);
    const rowFill = LEGACY_CYBER_PANEL_FILL;
    const rowStroke = LEGACY_PLAY_TOUCH_BUTTON_STROKE;
    const background = this.add.rectangle(input.x, input.y, input.width, input.height, rowFill, 0.5);
    background.setStrokeStyle(1, rowStroke, 0.38);
    background.setInteractive({ useHandCursor: true });

    const labelFontSize = Math.max(14, Math.min(18, Math.round(input.height * 0.28)));
    const stateFontSize = Math.max(10, Math.min(12, Math.round(input.height * 0.18)));
    const labelY = resolveLegacyUiLabelCenterY(input.y - Math.round(input.height * 0.2), labelFontSize, 'toggle-title');
    const trackY = input.y + Math.round(input.height * 0.23);
    const label = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(left + 16, labelY, input.label, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${labelFontSize}px`,
      color: '#ecfff5'
    })), input.width - 100, labelFontSize, 11).setOrigin(0, 0.5).setAlpha(0.94);

    const stateLabel = this.padLegacyUiText(this.add.text(left + input.width - 16, labelY, input.stateText, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${stateFontSize}px`,
      color: '#72e0bf'
    })).setOrigin(1, 0.5).setAlpha(0.92);
    this.uiTexts.push(label, stateLabel);

    const trackLeft = left + 16;
    const trackRight = left + input.width - 16;
    const trackWidth = Math.max(44, trackRight - trackLeft);
    const normalizedValue = quantizeLegacyMovementSpeed(input.value);
    const track = this.add.rectangle(
      trackLeft + Math.round(trackWidth / 2),
      trackY,
      trackWidth,
      6,
      0x07131d,
      0.86
    );
    track.setStrokeStyle(1, LEGACY_PLAY_TOUCH_BUTTON_STROKE, 0.46);
    const fill = this.add.rectangle(
      trackLeft + Math.round((trackWidth * normalizedValue) / 2),
      trackY,
      Math.max(4, Math.round(trackWidth * normalizedValue)),
      6,
      LEGACY_PLAY_TOUCH_ACCENT,
      0.72
    );
    const knob = this.add.circle(
      trackLeft + Math.round(trackWidth * normalizedValue),
      trackY,
      8,
      LEGACY_PLAY_TOUCH_ACCENT,
      0.98
    );
    knob.setStrokeStyle(1, 0xecfff5, 0.72);

    const commitPointerSpeed = (pointerX: number): void => {
      const nextSpeed = quantizeLegacyMovementSpeed((pointerX - trackLeft) / trackWidth);
      this.applyLegacyMovementSpeed(nextSpeed);
    };

    const setActive = (active: boolean): void => {
      background.setFillStyle(rowFill, active ? 0.7 : 0.5);
      background.setStrokeStyle(1, LEGACY_PLAY_TOUCH_ACCENT, active ? 0.72 : 0.38);
      track.setStrokeStyle(1, LEGACY_PLAY_TOUCH_ACCENT, active ? 0.75 : 0.46);
      knob.setScale(active ? 1.08 : 1);
      label.setAlpha(active ? 1 : 0.94);
      stateLabel.setAlpha(active ? 1 : 0.92);
    };

    background.on('pointerover', () => setActive(true));
    background.on('pointerout', () => setActive(false));
    background.on('pointerdown', (pointer: Phaser.Input.Pointer) => commitPointerSpeed(pointer.x));
    background.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        commitPointerSpeed(pointer.x);
      }
    });

    return {
      background,
      bounds: createVisualRect(left, input.y - (input.height / 2), input.width, input.height),
      label,
      setActive,
      text: input.label,
      destroy: () => {
        background.destroy();
        label.destroy();
        stateLabel.destroy();
        track.destroy();
        fill.destroy();
        knob.destroy();
      }
    };
  }

  private selectOverlayField(fieldId: LegacyOptionFieldId): void {
    if (this.activeInputField && this.activeInputField !== fieldId) {
      this.commitOverlayField(this.activeInputField);
    }

    this.activeInputField = fieldId;
    this.uiDirty = true;
  }

  private selectLegacyAuthField(
    fieldId: LegacyAuthFieldId,
    bounds?: { height: number; width: number; x: number; y: number }
  ): void {
    this.activeAuthField = fieldId;
    if (bounds) {
      this.positionLegacyAuthNativeInput(fieldId, bounds);
    }
    this.uiDirty = true;
  }

  private createLegacyAuthNativeInput(fieldId: LegacyAuthFieldId): HTMLInputElement | null {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return null;
    }

    if (this.authNativeInput && this.authNativeInputField === fieldId) {
      return this.authNativeInput;
    }

    this.destroyLegacyAuthNativeInput();
    const input = document.createElement('input');
    input.type = fieldId === 'password' ? 'password' : fieldId === 'email' ? 'email' : 'text';
    input.autocomplete = fieldId === 'password' ? 'current-password' : fieldId === 'email' ? 'email' : 'name';
    input.autocapitalize = fieldId === 'email' || fieldId === 'password' ? 'none' : 'words';
    input.spellcheck = false;
    input.setAttribute('aria-label', fieldId === 'displayName' ? 'display name' : fieldId);
    input.setAttribute('data-mazer-auth-input', fieldId);
    input.value = this.authForm[fieldId];
    Object.assign(input.style, {
      position: 'fixed',
      zIndex: '2147483647',
      opacity: '0.01',
      background: 'transparent',
      color: 'transparent',
      caretColor: 'transparent',
      border: '0',
      outline: '0',
      padding: '0',
      margin: '0'
    });

    this.authNativeInputHandler = () => {
      this.authForm = {
        ...this.authForm,
        [fieldId]: input.value
      };
      this.authSnapshot = {
        ...this.authSnapshot,
        error: null,
        info: null
      };
      this.latestAuthFeedbackMessageExpiresAtMs = Number.NEGATIVE_INFINITY;
      this.clearQueuedLegacyPlayerMessagesBySource('auth');
      this.uiDirty = true;
    };
    this.authNativeKeyDownHandler = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void this.handleLegacyAuthSubmit();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.activeAuthField = null;
        this.destroyLegacyAuthNativeInput();
        this.uiDirty = true;
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        this.selectNextLegacyAuthField(event.shiftKey ? -1 : 1);
      }
    };
    input.addEventListener('input', this.authNativeInputHandler);
    input.addEventListener('keydown', this.authNativeKeyDownHandler);
    document.body.appendChild(input);
    this.authNativeInput = input;
    this.authNativeInputField = fieldId;
    return input;
  }

  private syncLegacyAuthNativeInputValue(): void {
    if (!this.authNativeInput || this.authNativeInputField === null) {
      return;
    }

    this.authForm = {
      ...this.authForm,
      [this.authNativeInputField]: this.authNativeInput.value
    };
  }

  private recordLegacyAuthActionDiagnostics(
    input: Pick<LegacyAuthActionDiagnostics, 'stage'> & Partial<Omit<LegacyAuthActionDiagnostics, 'sequence' | 'stage'>>
  ): void {
    this.authActionDiagnosticsSequence += 1;
    this.latestAuthActionDiagnostics = {
      canSubmit: input.canSubmit ?? null,
      emailPresent: input.emailPresent ?? normalizeLegacyAuthEmail(this.authForm.email).includes('@'),
      error: input.error ?? null,
      info: input.info ?? null,
      mode: input.mode ?? this.authForm.mode,
      passwordLength: input.passwordLength ?? this.authForm.password.length,
      reason: input.reason ?? null,
      sequence: this.authActionDiagnosticsSequence,
      stage: input.stage,
      status: input.status ?? this.authSnapshot.status
    };
    this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
  }

  private positionLegacyAuthNativeInput(
    fieldId: LegacyAuthFieldId,
    bounds: { height: number; width: number; x: number; y: number }
  ): void {
    const input = this.createLegacyAuthNativeInput(fieldId);
    const canvas = this.game.canvas;
    if (!input || !canvas) {
      return;
    }

    input.type = fieldId === 'password' ? 'password' : fieldId === 'email' ? 'email' : 'text';
    input.value = this.authForm[fieldId];
    const rect = canvas.getBoundingClientRect();
    const cssRect = resolveLegacyAuthInputCssRect(bounds, rect, this.layout);
    input.style.left = `${cssRect.left}px`;
    input.style.top = `${cssRect.top}px`;
    input.style.width = `${cssRect.width}px`;
    input.style.height = `${cssRect.height}px`;
    window.setTimeout(() => input.focus({ preventScroll: true }), 0);
  }

  private destroyLegacyAuthNativeInput(): void {
    if (this.authNativeInput) {
      if (this.authNativeInputHandler) {
        this.authNativeInput.removeEventListener('input', this.authNativeInputHandler);
      }
      if (this.authNativeKeyDownHandler) {
        this.authNativeInput.removeEventListener('keydown', this.authNativeKeyDownHandler);
      }
      this.authNativeInput.remove();
    }
    this.authNativeInput = null;
    this.authNativeInputField = null;
    this.authNativeInputHandler = null;
    this.authNativeKeyDownHandler = null;
  }

  private selectNextLegacyAuthField(direction: -1 | 1): void {
    const fields: LegacyAuthFieldId[] = this.authForm.mode === 'signup'
      ? ['email', 'password', 'displayName']
      : ['email', 'password'];
    const currentIndex = Math.max(0, fields.indexOf(this.activeAuthField ?? 'email'));
    const nextIndex = (currentIndex + direction + fields.length) % fields.length;
    this.activeAuthField = fields[nextIndex] ?? fields[0] ?? null;
    this.uiDirty = true;
  }

  private updateLegacyAuthFieldDraft(
    fieldId: LegacyAuthFieldId,
    update: (value: string) => string
  ): void {
    const maxLengthByField: Record<LegacyAuthFieldId, number> = {
      displayName: 32,
      email: 96,
      password: 72
    };
    const nextValue = update(this.authForm[fieldId]).slice(0, maxLengthByField[fieldId]);
    this.authForm = {
      ...this.authForm,
      [fieldId]: nextValue
    };
    if (this.authNativeInput && this.authNativeInputField === fieldId && this.authNativeInput.value !== nextValue) {
      this.authNativeInput.value = nextValue;
    }
    this.authSnapshot = {
      ...this.authSnapshot,
      error: null,
      info: null
    };
    this.latestAuthFeedbackMessageExpiresAtMs = Number.NEGATIVE_INFINITY;
    this.clearQueuedLegacyPlayerMessagesBySource('auth');
    this.uiDirty = true;
  }

  private setLegacyAuthFormMode(mode: LegacyAuthFormState['mode']): void {
    this.authForm = {
      ...this.authForm,
      mode
    };
    this.activeAuthField = this.authForm.email.length > 0 ? 'password' : 'email';
    this.destroyLegacyAuthNativeInput();
    this.authSnapshot = {
      ...this.authSnapshot,
      error: null,
      info: null
    };
    this.latestAuthFeedbackMessageExpiresAtMs = Number.NEGATIVE_INFINITY;
    this.clearQueuedLegacyPlayerMessagesBySource('auth');
    this.uiDirty = true;
  }

  private maskLegacyAuthPassword(): string {
    if (this.authForm.password.length === 0) {
      return 'password';
    }

    return '*'.repeat(Math.min(24, this.authForm.password.length));
  }

  private async handleLegacyAuthSubmit(): Promise<void> {
    if (this.authSubmitting) {
      return;
    }

    this.syncLegacyAuthNativeInputValue();
    this.recordLegacyAuthActionDiagnostics({ stage: 'started' });
    const submitState = resolveLegacyAuthSubmitState(this.authForm, this.authSnapshot.configured);
    if (!submitState.canSubmit) {
      this.recordLegacyAuthActionDiagnostics({
        canSubmit: false,
        reason: submitState.reason,
        stage: 'blocked'
      });
      this.authSnapshot = {
        ...this.authSnapshot,
        error: submitState.reason,
        info: null
      };
      this.armLegacyAuthFeedbackMessage();
      this.uiDirty = true;
      return;
    }

    this.authSubmitting = true;
    this.uiDirty = true;
    this.recordLegacyAuthActionDiagnostics({
      canSubmit: true,
      stage: 'submitting'
    });
    writeLegacyRememberedIdentity(this.resolveBrowserLocalStorage(), this.authForm.email);

    let result: Awaited<ReturnType<typeof signInLegacyAuth | typeof signUpLegacyAuth>>;
    try {
      result = this.authForm.mode === 'signup'
        ? await signUpLegacyAuth(this.authForm.email, this.authForm.password, this.authForm.displayName)
        : await signInLegacyAuth(this.authForm.email, this.authForm.password);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.authSubmitting = false;
      this.authSnapshot = {
        ...this.authSnapshot,
        error: message,
        info: null
      };
      this.recordLegacyAuthActionDiagnostics({
        error: message,
        stage: 'exception',
        status: this.authSnapshot.status
      });
      this.armLegacyAuthFeedbackMessage();
      this.uiDirty = true;
      return;
    }

    this.authSubmitting = false;
    this.authForm = {
      ...this.authForm,
      password: result.snapshot.status === 'authenticated' ? '' : this.authForm.password
    };
    this.recordLegacyAuthActionDiagnostics({
      error: result.snapshot.error,
      info: result.snapshot.info,
      stage: 'result',
      status: result.snapshot.status
    });
    const shouldReturnToMainMenuAfterLogin = this.authForm.mode === 'login'
      && result.snapshot.status === 'authenticated';
    this.applyLegacyAuthSnapshot(result.snapshot);
    if (shouldReturnToMainMenuAfterLogin) {
      this.closeLegacyAuthOverlayToMainMenu();
    }
    this.uiDirty = true;
  }

  private async handleLegacyAuthPasswordReset(): Promise<void> {
    if (this.authSubmitting) {
      return;
    }

    this.syncLegacyAuthNativeInputValue();
    if (!this.authSnapshot.configured) {
      this.authSnapshot = {
        ...this.authSnapshot,
        error: LEGACY_AUTH_MESSAGE_COPY.passwordResetNotConfigured,
        info: null
      };
      this.armLegacyAuthFeedbackMessage();
      this.uiDirty = true;
      return;
    }

    if (!this.authForm.email.includes('@')) {
      this.authSnapshot = {
        ...this.authSnapshot,
        error: LEGACY_AUTH_MESSAGE_COPY.passwordResetEmailRequired,
        info: null
      };
      this.armLegacyAuthFeedbackMessage();
      this.activeAuthField = 'email';
      this.uiDirty = true;
      return;
    }

    this.authSubmitting = true;
    this.uiDirty = true;
    const result = await requestLegacyPasswordReset(this.authForm.email);
    this.authSubmitting = false;
    this.applyLegacyAuthSnapshot(result.snapshot);
    this.uiDirty = true;
  }

  private async handleLegacyAuthSignOut(): Promise<void> {
    if (this.authSubmitting) {
      return;
    }

    this.syncLegacyAuthNativeInputValue();
    this.authSubmitting = true;
    this.uiDirty = true;
    const result = await signOutLegacyAuth();
    this.authSubmitting = false;
    this.authForm = createEmptyLegacyAuthFormState(
      'login',
      readLegacyRememberedIdentity(this.resolveBrowserLocalStorage())
    );
    this.activeAuthField = null;
    this.applyLegacyAuthSnapshot(result.snapshot);
    this.uiDirty = true;
  }

  private commitOverlayField(
    fieldId: LegacyOptionFieldId,
    options: { announce?: boolean } = {}
  ): void {
    const result = applyLegacyOverlayFieldCommit(this.settings, this.optionFieldDrafts, fieldId);

    this.settings = result.settings;
    this.optionFieldDrafts = result.drafts;
    if (options.announce !== false) {
      const outcome = result.affectsCamera
        ? 'camera'
        : result.affectsMaze
          ? result.commitKind === 'material-change' ? 'material' : 'maze'
          : 'unchanged';
      this.setLatestOverlayMessage(resolveLegacyOverlayFieldCommitMessage(
        this.resolveLegacyOverlayFieldMessageLabel(fieldId),
        this.resolveLegacyOverlayFieldMessageState(fieldId),
        outcome
      ));
    }

    if (result.triggersReloadOnBack) {
      this.pendingOverlayMazeRebuild = true;
    }
    if (result.refreshLayout) {
      this.refreshLayout();
    }

    this.uiDirty = true;
  }

  private commitAllOverlayFields(): void {
    const previousScale = this.settings.scale;
    const fieldIds: LegacyOptionFieldId[] = this.overlay === 'pause'
      ? []
      : ['scale', 'camScale', 'pathR', 'pathG', 'pathB', 'wallR', 'wallG', 'wallB'];

    for (const fieldId of fieldIds) {
      this.commitOverlayField(fieldId, { announce: false });
    }

    if (this.pendingOverlayMazeRebuild) {
      this.queueGenerationRequest('overlay-rebuild', 0, { stepSeed: true });
      this.pendingOverlayMazeRebuild = false;
      this.boardStaticDirty = true;
      this.boardPathDirty = true;
      this.boardDynamicDirty = true;
    }
    if (this.settings.scale !== previousScale) {
      this.refreshLayout();
    }

    this.activeInputField = null;
  }

  private resolveLegacyOverlayFieldMessageLabel(fieldId: LegacyOptionFieldId): string {
    switch (fieldId) {
      case 'scale':
        return 'Maze Scale';
      case 'camScale':
        return 'Camera Scale';
      case 'pathR':
        return 'Path R';
      case 'pathG':
        return 'Path G';
      case 'pathB':
        return 'Path B';
      case 'wallR':
        return 'Wall R';
      case 'wallG':
        return 'Wall G';
      case 'wallB':
        return 'Wall B';
      default:
        return fieldId satisfies never;
    }
  }

  private resolveLegacyOverlayFieldMessageState(fieldId: LegacyOptionFieldId): string {
    return this.optionFieldDrafts[fieldId];
  }

  private createOverlayTitle(text: string, y: number): void {
    const fontSize = this.layout.width < 420 ? 24 : (this.layout.width < 480 ? 28 : 34);
    const label = this.padLegacyUiText(this.add.text(
      this.layout.width / 2,
      resolveLegacyUiLabelCenterY(y, fontSize, 'overlay-title'),
      text,
      {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${fontSize}px`,
      color: '#6bc96f'
    })).setOrigin(0.5).setDepth(3);
    this.uiTexts.push(label);
  }

  private createInputRow(
    label: string,
    fieldId: LegacyOptionFieldId,
    y: number,
    panel: OverlayPanelFrame
  ): number {
    const stacked = panel.width < 420;
    const labelX = panel.left + 28;
    const rowLabel = this.padLegacyUiText(this.add.text(labelX, y, label, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: stacked ? '20px' : '22px',
      color: '#ecfff5'
    })).setOrigin(0, 0.5);

    this.uiTexts.push(rowLabel);
    this.createInputFieldBox(
      stacked ? panel.centerX : panel.left + Math.round(panel.width * 0.72),
      stacked ? y + 34 : y,
      stacked ? panel.width - 56 : Math.min(188, Math.round(panel.width * 0.38)),
      44,
      fieldId,
      this.optionFieldDrafts[fieldId]
    );

    return y + (stacked ? 82 : 58);
  }

  private createColorInputRow(
    label: string,
    fieldIds: [LegacyOptionFieldId, LegacyOptionFieldId, LegacyOptionFieldId],
    y: number,
    panel: OverlayPanelFrame,
    color: { r: number; g: number; b: number }
  ): number {
    const stacked = panel.width < 420;
    const swatch = linearColorToHex(color);

    const rowLabel = this.padLegacyUiText(this.add.text(panel.left + 28, y, label, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: '20px',
      color: '#ecfff5'
    })).setOrigin(0, 0.5);
    const swatchLabel = this.padLegacyUiText(this.add.text(panel.left + panel.width - 72, y, swatch, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: stacked ? '16px' : '18px',
      color: swatch
    })).setOrigin(0.5);

    this.uiTexts.push(rowLabel, swatchLabel);
    const startX = stacked ? panel.left + 58 : panel.left + Math.round(panel.width * 0.46);
    const spacing = stacked ? Math.round((panel.width - 116) / 2) : 122;
    const inputY = stacked ? y + 38 : y;
    const channelLabelY = stacked ? y + 14 : y - 24;

    for (const [index, fieldId] of fieldIds.entries()) {
      const caption = this.padLegacyUiText(this.add.text(startX + (spacing * index), channelLabelY, ['R', 'G', 'B'][index] ?? '', {
        fontFamily: LEGACY_UI_FONT_FAMILY,
        fontSize: '14px',
        color: '#72e0bf'
      })).setOrigin(0.5);
      this.uiTexts.push(caption);
      this.createInputFieldBox(
        startX + (spacing * index),
        inputY,
        stacked ? 84 : 100,
        42,
        fieldId,
        this.optionFieldDrafts[fieldId]
      );
    }

    return y + (stacked ? 92 : 82);
  }

  private createInputFieldBox(
    x: number,
    y: number,
    width: number,
    height: number,
    fieldId: LegacyOptionFieldId,
    value: string
  ): void {
    const isActive = this.activeInputField === fieldId;
    const background = this.add.rectangle(x, y, width, height, LEGACY_CYBER_PANEL_FILL, isActive ? 0.76 : 0.5);
    background.setStrokeStyle(2, isActive ? LEGACY_PLAY_TOUCH_ACCENT : LEGACY_PLAY_TOUCH_BUTTON_STROKE, isActive ? 0.95 : 0.42);
    background.setInteractive({ useHandCursor: true });
    background.on('pointerdown', () => this.selectOverlayField(fieldId));

    const label = this.padLegacyUiText(this.add.text(x, y, value, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${Math.max(14, Math.min(20, Math.round(height * 0.36)))}px`,
      color: isActive ? '#72e0bf' : '#ecfff5'
    })).setOrigin(0.5);

    this.uiButtons.push({
      background,
      bounds: createVisualRect(x - (width / 2), y - (height / 2), width, height),
      label,
      setActive: () => undefined,
      text: fieldId,
      destroy: () => {
        background.destroy();
        label.destroy();
      }
    });
  }

  private createOverlayBackChevronButton(panel: OverlayPanelFrame, onClick: () => void): UiButton {
    const size = this.layout.width < 480 ? 42 : 46;
    const x = panel.left + Math.round(size * 0.86);
    const y = panel.top + Math.round(size * 0.82);
    const chrome = this.add.graphics();
    const drawChevronChrome = (active: boolean): void => {
      chrome.clear();
      this.drawLegacyCyberPanel(chrome, {
        active,
        alpha: active ? 0.76 : 0.56,
        fill: active ? cyberArcadeMaterial.substrate.panelActive : LEGACY_CYBER_PANEL_FILL,
        height: size,
        left: x - (size / 2),
        radius: 999,
        top: y - (size / 2),
        width: size
      });
      const chevronInset = Math.round(size * 0.31);
      const chevronLeft = x - Math.round(size * 0.12);
      chrome.lineStyle(Math.max(3, Math.round(size * 0.08)), active ? LEGACY_PLAY_TOUCH_ACCENT : LEGACY_PLAY_TOUCH_ICON, active ? 0.98 : 0.9);
      chrome.beginPath();
      chrome.moveTo(chevronLeft + chevronInset, y - chevronInset);
      chrome.lineTo(chevronLeft - chevronInset, y);
      chrome.lineTo(chevronLeft + chevronInset, y + chevronInset);
      chrome.strokePath();
    };

    drawChevronChrome(false);
    const background = this.add.rectangle(x, y, size, size, 0x000000, 0.001);
    chrome.setDepth(3);
    background.setDepth(3);
    background.setInteractive({ useHandCursor: true });
    const label = this.padLegacyUiText(this.add.text(x, y, '', {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: '1px',
      color: MENU_TEXT_COLOR
    })).setOrigin(0.5).setAlpha(0).setDepth(3);
    this.overlayBackChevronBounds = createVisualRect(x - (size / 2), y - (size / 2), size, size);

    const setActive = (active: boolean): void => {
      drawChevronChrome(active);
    };

    background.on('pointerover', () => setActive(true));
    background.on('pointerout', () => setActive(false));
    background.on('pointerdown', onClick);

    return {
      background,
      bounds: this.overlayBackChevronBounds,
      label,
      setActive,
      text: 'Back',
      destroy: () => {
        chrome.destroy();
        background.destroy();
        label.destroy();
      }
    };
  }

  private createButton(
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    onClick: () => void,
    options: { labelRole?: LegacyUiLabelRole } = {}
  ): UiButton {
    const isMenuFrontDoor = this.mode === 'menu' && this.overlay === 'none';
    const isPrimaryFrontDoorButton = isMenuFrontDoor && text === 'Start';
    const frontDoorChrome = isMenuFrontDoor
      ? resolveLegacyMenuButtonChrome({
        width,
        height,
        textLength: text.length,
        isPrimary: isPrimaryFrontDoorButton
      })
      : null;
    const baseAlpha = isMenuFrontDoor ? Math.max(frontDoorChrome?.baseAlpha ?? MENU_BUTTON_ALPHA, 0.38) : 0.54;
    const panel = this.add.graphics();
    const drawButtonPanel = (active: boolean): void => {
      panel.clear();
      this.drawLegacyCyberPanel(panel, {
        active: active || isPrimaryFrontDoorButton,
        alpha: active
          ? Math.max(frontDoorChrome?.hoverAlpha ?? 0.68, 0.68)
          : baseAlpha,
        fill: active
          ? frontDoorChrome?.hoverFillColor ?? cyberArcadeMaterial.substrate.panelActive
          : frontDoorChrome?.fillColor ?? LEGACY_CYBER_PANEL_FILL,
        height,
        left: x - (width / 2),
        radius: isMenuFrontDoor ? 8 : 10,
        stroke: frontDoorChrome?.strokeColor,
        strokeAlt: isPrimaryFrontDoorButton
          ? cyberArcadeMaterial.rail.mint
          : cyberArcadeMaterial.rail.mint,
        top: y - (height / 2),
        width
      });
    };
    drawButtonPanel(false);

    const background = this.add.rectangle(x, y, width, height, 0x000000, 0.001);
    background.setInteractive({ useHandCursor: true });
    const textFitSize = Math.floor((width * (isMenuFrontDoor ? 1.08 : 1.45)) / Math.max(4, text.length));
    const buttonFontSize = frontDoorChrome?.fontSize ?? Math.max(
      18,
      Math.min(40, Math.min(Math.round(height * 0.46), textFitSize))
    );
    const buttonTextColor = isPrimaryFrontDoorButton
      ? LEGACY_MENU_ACTION_GREEN
      : frontDoorChrome?.textColor ?? MENU_TEXT_COLOR;

    const labelY = resolveLegacyUiLabelCenterY(y, buttonFontSize, options.labelRole ?? 'button');
    const label = this.padLegacyUiText(this.add.text(x, labelY, text, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${buttonFontSize}px`,
      color: buttonTextColor
    })).setOrigin(0.5).setAlpha(frontDoorChrome?.labelAlpha ?? 0.92);
    if (isMenuFrontDoor) {
      this.fitLegacyUiTextToWidth(label, Math.max(56, width - 24), buttonFontSize, 15);
    }
    this.uiTexts.push(label);

    const setActive = (active: boolean): void => {
      background.setFillStyle(
        0x000000,
        0.001
      );
      drawButtonPanel(active);
      label.setAlpha(
        active ? (frontDoorChrome?.hoverLabelAlpha ?? 0.98) : (frontDoorChrome?.labelAlpha ?? 0.92)
      );
    };

    background.on('pointerover', () => setActive(true));
    background.on('pointerout', () => setActive(false));
    background.on('pointerdown', onClick);

    return {
      background,
      bounds: createVisualRect(x - (width / 2), y - (height / 2), width, height),
      label,
      setActive,
      text,
      destroy: () => {
        panel.destroy();
        background.destroy();
        label.destroy();
      }
    };
  }

  private clearUi(): void {
    this.overlayScrollGraphics?.destroy();
    this.overlayScrollGraphics = null;

    for (const button of this.uiButtons) {
      button.destroy();
    }
    this.uiButtons = [];

    for (const text of this.uiTexts) {
      if (text.active && text.getData('hud') !== true) {
        text.destroy();
      }
    }
    this.uiTexts = this.uiTexts.filter((text) => text.active);

    this.overlayGuideGraphics?.destroy();
    this.overlayGuideGraphics = null;
  }

  private openOverlay(kind: OverlayKind): void {
    const previousOverlay = this.overlay;
    if (kind === 'options' || kind === 'pause') {
      this.optionFieldDrafts = createLegacyOptionFieldDrafts(this.settings);
      this.pendingOverlayMazeRebuild = false;
    }
    if (kind === 'auth') {
      const rememberedIdentity = readLegacyRememberedIdentity(this.resolveBrowserLocalStorage());
      this.authForm = {
        ...this.authForm,
        email: this.authForm.email || rememberedIdentity
      };
      this.activeAuthField = this.authSnapshot.status === 'authenticated'
        ? null
        : this.authForm.email.length > 0
          ? 'password'
          : 'email';
    }
    this.resetLegacyOverlayScrollState();
    this.activeInputField = null;
    if (this.mode === 'play') {
      this.resetLegacyPlayInputBuffer();
      this.clearPlayHudImmediately();
    }
    this.overlay = kind;
    this.overlayReturn = kind === 'auth' && (previousOverlay === 'pause' || previousOverlay === 'options')
      ? previousOverlay
      : 'none';
    this.titleGraphics.setVisible(false);
    this.boardDynamicDirty = true;
    this.uiDirty = true;
    if (this.mode === 'play') {
      this.publishInteractionDiagnostics();
    }
  }

  private closeOverlay(): void {
    if (this.overlay === 'options' || this.overlay === 'pause') {
      this.commitAllOverlayFields();
    }
    if (this.overlay === 'auth') {
      this.destroyLegacyAuthNativeInput();
    }
    const returnOverlay = this.overlay === 'auth' ? this.overlayReturn : 'none';
    this.resetLegacyOverlayScrollState();
    if (returnOverlay !== 'none') {
      this.overlay = returnOverlay;
      this.overlayReturn = 'none';
      this.activeInputField = null;
      this.activeAuthField = null;
      this.titleGraphics.setVisible(false);
      this.boardDynamicDirty = true;
      this.uiDirty = true;
      return;
    }
    this.overlay = 'none';
    this.overlayReturn = 'none';
    const showMenuTitle = this.mode === 'menu';
    this.titleGraphics.setVisible(showMenuTitle);
    this.activeInputField = null;
    this.activeAuthField = null;
    if (this.mode === 'play') {
      this.resetLegacyPlayInputBuffer();
      this.clearPlayHudImmediately();
    }
    this.boardDynamicDirty = true;
    this.uiDirty = true;
    if (this.mode === 'play') {
      this.publishInteractionDiagnostics();
    }
  }

  private closeLegacyAuthOverlayToMainMenu(): void {
    this.destroyLegacyAuthNativeInput();
    this.resetLegacyOverlayScrollState();
    if (this.mode !== 'menu') {
      this.enterMenuMode();
      return;
    }

    this.overlay = 'none';
    this.overlayReturn = 'none';
    this.activeInputField = null;
    this.activeAuthField = null;
    this.titleGraphics.setVisible(true);
    this.boardDynamicDirty = true;
    this.uiDirty = true;
  }

  private applyLegacyPauseCommand(command: LegacyPauseCommand): void {
    if (command === 'reset-progression') {
      this.openOverlay('confirm-progression-reset');
      return;
    }
    const result = resolveLegacyPauseCommand(command, this.maze.start, this.trail);

    if (result.nextPlayer !== null) {
      this.player = result.nextPlayer;
      this.syncLegacyPlayerVisualMotionTo(result.nextPlayer);
      this.trail = result.nextTrail ?? [copyPoint(result.nextPlayer)];
      this.playCyclePath = [copyPoint(result.nextPlayer)];
      this.playCycleResetUsed = true;
      this.playStartedAtMs = this.time.now;
      this.resetLegacyWorldTurnHost();
      this.resetLegacyPlayInputBuffer();
      this.boardDynamicDirty = true;
      this.publishInteractionDiagnostics();
    }

    if (result.enterMenu) {
      this.enterMenuMode();
      return;
    }

    if (result.closesOverlay) {
      this.closeOverlay();
    }
  }

  private resetLegacyPlayerProgression(): void {
    const baseline = createEmptyLegacyProgressionState();
    this.progressionState = writeLegacyProgressionState(this.resolveLegacyProgressionStorage(), {
      ...baseline,
      updatedAt: new Date().toISOString(),
      tracks: {
        player: baseline.tracks.player,
        'ai-runner': this.progressionState.tracks['ai-runner']
      }
    });
    this.setLatestOverlayMessage(createLegacyPlayerMessage({
      copy: 'Player progression reset. AI progression was kept.',
      id: 'progression.player.reset',
      source: 'progression',
      tone: 'success'
    }));
    this.syncLegacyRemoteProgressionState();
    this.openOverlay('pause');
    this.boardDynamicDirty = true;
    this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
  }

  private applyLegacyOverlayToggleField(fieldId: LegacyOverlayToggleFieldId): void {
    const result = applyLegacyOverlayToggleField(this.settings, fieldId);
    this.settings = writeLegacyGameToggleSettings(this.resolveLegacyGameToggleStorage(), result.settings);
    this.setLatestOverlayMessage(resolveLegacyOverlayToggleMessage(
      this.resolveLegacyOverlayToggleLabel(fieldId),
      result.stateText ?? 'Updated'
    ));
    if (fieldId === 'controlMode') {
      this.resetLegacyPlayInputBuffer();
      this.hudDirty = true;
    }
    if (fieldId === 'toggleTrailPulse') {
      this.legacyPlayTrailPulseNextFrameAtMs = 0;
    }
    if (fieldId === 'toggleTrailFade' && this.mode === 'menu' && this.menuDemoState !== null && this.menuDemoEpisode !== null) {
      this.trail = resolveLegacyMenuDemoTrail(
        this.menuDemoState,
        this.menuDemoEpisode.raster.width,
        this.settings.toggleTrailFade,
        TRAIL_FADE_TAIL
      );
    }

    if (result.affectsBackdrop) {
      this.backdropDirty = true;
    }
    if (result.affectsBoardStatic) {
      this.boardStaticDirty = true;
      this.boardPathDirty = true;
    }
    if (result.affectsBoardDynamic) {
      this.boardDynamicDirty = true;
    }
    if (fieldId === 'toggleCameraFollow') {
      this.hudDirty = true;
    }

    this.uiDirty = true;
    if (this.mode === 'play') {
      this.publishInteractionDiagnostics();
    }
  }

  private applyLegacyMovementSpeed(speed: number): void {
    const currentSpeed = quantizeLegacyMovementSpeed(this.settings.movementSpeed);
    const nextSpeed = quantizeLegacyMovementSpeed(speed);
    if (currentSpeed === nextSpeed) {
      return;
    }

    const nextSettings = copyLegacySettings(this.settings);
    nextSettings.movementSpeed = nextSpeed;
    this.settings = writeLegacyGameToggleSettings(this.resolveLegacyGameToggleStorage(), nextSettings);
    this.setLatestOverlayMessage(resolveLegacyOverlayMovementSpeedMessage(
      formatLegacyMovementSpeedPercent(nextSpeed)
    ));
    if (this.playHeldTouchMoves.length > 0 && this.playHeldTouchRepeatTimer !== null) {
      this.scheduleLegacyPlayHeldTouchRepeat(this.resolveLegacyPlayHeldTouchDelay('repeat'));
    }
    this.uiDirty = true;
    if (this.mode === 'play') {
      this.publishInteractionDiagnostics();
    }
  }

  private resolveLegacyOverlayToggleLabel(fieldId: LegacyOverlayToggleFieldId): string {
    switch (fieldId) {
      case 'toggleCameraFollow':
        return 'Camera Follow';
      case 'toggleTrailFade':
        return 'Trail Fade';
      case 'toggleTrailPulse':
        return 'Trail Pulse';
      case 'toggleAnimatedBackdrop':
        return 'Animated BG';
      case 'darkMode':
        return 'Dark Mode';
      case 'controlMode':
        return 'Controls';
      default:
        return fieldId satisfies never;
    }
  }

  private loadPersistedLegacyGameToggleSettings(): void {
    const browserStorage = this.resolveBrowserLocalStorage();
    migrateLegacyGameToggleSettingsToGuestScope(
      browserStorage,
      this.resolveLegacyGuestGameToggleStorage(),
      LEGACY_DEFAULTS
    );
    const scopedStorage = this.resolveLegacyGameToggleStorage();
    this.settings = readLegacyGameToggleSettings(scopedStorage, LEGACY_DEFAULTS);
    this.optionFieldDrafts = createLegacyOptionFieldDrafts(this.settings);
  }

  private loadPersistedLegacyAuthForm(): void {
    const rememberedIdentity = readLegacyRememberedIdentity(this.resolveBrowserLocalStorage());
    this.authSnapshot = createLegacyGuestAuthSnapshot();
    this.authForm = createEmptyLegacyAuthFormState('login', rememberedIdentity);
  }

  private async initializeLegacyAuth(): Promise<void> {
    const runtimeAuthFixtureSnapshot = this.resolveLegacyRuntimeAuthFixtureSnapshot();
    if (runtimeAuthFixtureSnapshot) {
      this.applyLegacyAuthSnapshot(runtimeAuthFixtureSnapshot);
      return;
    }

    this.authUnsubscribe = await subscribeLegacyAuthState((snapshot) => {
      this.applyLegacyAuthSnapshot(snapshot);
    });

    const snapshot = await readLegacyAuthSessionSnapshot();
    this.applyLegacyAuthSnapshot(snapshot);
  }

  private resolveLegacyRuntimeAuthFixtureSnapshot(): LegacyAuthSessionSnapshot | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const runtimeDiagnostics = searchParams.get('runtimeDiagnostics')?.trim().toLowerCase();
    if (runtimeDiagnostics !== '1' && runtimeDiagnostics !== 'true') {
      return null;
    }

    if (searchParams.get('authFixture')?.trim().toLowerCase() !== 'authenticated') {
      return null;
    }

    return {
      configured: true,
      displayName: 'QA Player',
      email: 'qa@mazer.local',
      error: null,
      info: 'Runtime diagnostics authenticated fixture.',
      status: 'authenticated',
      userId: 'runtime-diagnostics-auth-fixture'
    };
  }

  private applyLegacyAuthSnapshot(snapshot: LegacyAuthSessionSnapshot): void {
    const previousUserId = this.authSnapshot.userId;
    const previousProgressionState = this.progressionState;

    this.authSnapshot = snapshot;
    this.armLegacyAuthFeedbackMessage();
    if (snapshot.email !== null) {
      if (snapshot.status === 'authenticated') {
        syncLegacyRememberedIdentityFromAuthenticatedSession(this.resolveBrowserLocalStorage(), snapshot);
      } else {
        writeLegacyRememberedIdentity(this.resolveBrowserLocalStorage(), snapshot.email);
      }
      this.authForm = {
        ...this.authForm,
        email: snapshot.email
      };
    }
    if (snapshot.status === 'authenticated') {
      this.activeAuthField = null;
      this.destroyLegacyAuthNativeInput();
    }

    if (previousUserId !== snapshot.userId) {
      this.seedSignedInProgressionFromGuest(previousProgressionState, snapshot);
      this.loadPersistedLegacyGameToggleSettings();
      this.loadPersistedMazeCycleTelemetryHistory();
      this.loadPersistedLegacyProgressionState();
      this.boardDynamicDirty = true;
      this.uiDirty = true;
      this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
      this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    }
  }

  private seedSignedInProgressionFromGuest(
    guestState: LegacyProgressionState,
    snapshot: LegacyAuthSessionSnapshot
  ): void {
    if (snapshot.userId === null) {
      return;
    }

    const storage = this.resolveBrowserLocalStorage();
    const signedInStorage = createLegacyAuthScopedStorage(storage, LEGACY_PROGRESSION_STORAGE_KEY, snapshot);
    const signedInState = readLegacyProgressionState(signedInStorage);
    const hasSignedInCycles = Object.values(signedInState.tracks).some((track) => track.completedCycles > 0);
    const hasGuestCycles = Object.values(guestState.tracks).some((track) => track.completedCycles > 0);

    if (hasSignedInCycles || !hasGuestCycles) {
      return;
    }

    writeLegacyProgressionState(signedInStorage, guestState);
  }

  private loadPersistedMazeCycleTelemetryHistory(): void {
    this.mazeCycleTelemetryHistory = readMazeCycleTelemetryHistory(this.resolveMazeCycleTelemetryStorage());
  }

  private loadPersistedLegacyProgressionState(): void {
    this.progressionState = readLegacyProgressionState(this.resolveLegacyProgressionStorage());
  }

  private resolveLegacyGameToggleStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
    return createLegacyAuthScopedStorage(
      this.resolveBrowserLocalStorage(),
      LEGACY_GAME_TOGGLE_STORAGE_KEY,
      this.authSnapshot
    );
  }

  private resolveLegacyGuestGameToggleStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
    return createLegacyAuthScopedStorage(
      this.resolveBrowserLocalStorage(),
      LEGACY_GAME_TOGGLE_STORAGE_KEY,
      { userId: null }
    );
  }

  private resolveBrowserLocalStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined {
    if (typeof window === 'undefined') {
      return undefined;
    }

    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  }

  private resolveMazeCycleTelemetryStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
    return createLegacyAuthScopedStorage(
      this.resolveBrowserLocalStorage(),
      MAZE_CYCLE_TELEMETRY_STORAGE_KEY,
      this.authSnapshot
    );
  }

  private resolveLegacyProgressionStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
    return createLegacyAuthScopedStorage(
      this.resolveBrowserLocalStorage(),
      LEGACY_PROGRESSION_STORAGE_KEY,
      this.authSnapshot
    );
  }

  private resolveLegacyProgressionStorageKey(): string {
    return resolveLegacyAuthScopedStorageKey(LEGACY_PROGRESSION_STORAGE_KEY, this.authSnapshot);
  }

  private resolveActiveLegacyProgressionTrackId(): LegacyProgressionTrackId {
    return resolveLegacyProgressionTrackIdForSurface(this.mode === 'play' ? 'play' : 'menu-demo');
  }

  private resolveActiveLegacyProgressionPalette(): LegacyProgressionPalette {
    const trackId = this.resolveActiveLegacyProgressionTrackId();
    return resolveLegacyProgressionPalette(this.progressionState.tracks[trackId], trackId);
  }

  private resolveLegacyProgressionScaleForMode(mode: RuntimeMode): number {
    const trackId: LegacyProgressionTrackId = mode === 'play' ? 'player' : 'ai-runner';
    return resolveLegacyProgressionGenerationScale(this.settings.scale, this.progressionState.tracks[trackId], {
      surface: mode === 'play' ? 'play' : 'menu-demo',
      viewport: {
        width: this.scale.width,
        height: this.scale.height
      }
    });
  }

  private resolveLegacyMazeGenerationProfileForMode(mode: RuntimeMode) {
    const trackId: LegacyProgressionTrackId = mode === 'play' ? 'player' : 'ai-runner';
    return resolveLegacyMazeGenerationProfileForProgression(this.progressionState.tracks[trackId]);
  }

  private resolveLegacyTargetComplexityForMode(mode: RuntimeMode): number {
    const trackId: LegacyProgressionTrackId = mode === 'play' ? 'player' : 'ai-runner';
    return this.progressionState.tracks[trackId].targetComplexity;
  }

  private appendLegacyPlayCyclePoint(point: LegacyPoint): void {
    this.playCyclePath.push(copyPoint(point));
    if (this.playCyclePath.length <= MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT) {
      return;
    }

    const firstPoint = this.playCyclePath[0] ? copyPoint(this.playCyclePath[0]) : copyPoint(point);
    const tail = this.playCyclePath.slice(Math.max(1, this.playCyclePath.length - (MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT - 1)));
    this.playCyclePath = [firstPoint, ...tail.map(copyPoint)];
  }

  private recordMazeCycleCompletion(surface: MazeCycleTelemetrySurface): void {
    if (surface === 'menu-demo' && this.menuDemoCycleRecorded) {
      return;
    }

    const routeDiagnostics = surface === 'menu-demo' && this.menuDemoEpisode && this.menuDemoConfig
      ? collectDemoWalkerRouteDiagnostics(this.menuDemoEpisode, this.menuDemoConfig)
      : null;
    const playerPath = surface === 'play'
      ? this.playCyclePath
      : this.trail;
    const startedAtMs = surface === 'play'
      ? this.playStartedAtMs
      : this.menuDemoCycleStartedAtMs;

    this.mazeCycleTelemetryHistory = recordMazeCycleTelemetryReceipt(
      this.resolveMazeCycleTelemetryStorage(),
      {
        averageFrameMs: this.resolveRuntimeAverageFrameMs(),
        completionTimeMs: Math.max(0, Math.round(this.time.now - startedAtMs)),
        controlMode: this.settings.controlMode,
        maze: this.maze,
        playerPath,
        resetUsed: surface === 'play' ? this.playCycleResetUsed : false,
        surface,
        aiDecisionSummary: routeDiagnostics
          ? {
            backtrackCount: routeDiagnostics.telemetry.backtrackCount,
            decisionCount: routeDiagnostics.routeLength,
            optionalRetargetCount: routeDiagnostics.telemetry.optionalRetargetCount,
            recoveryCount: routeDiagnostics.telemetry.recoveryCount,
            thinkingModel: this.menuDemoConfig.behavior.runnerThinkingModel ?? 'legacy-source',
            visitedUndoCount: routeDiagnostics.telemetry.visitedUndoCount,
            wrongBranchCount: routeDiagnostics.telemetry.wrongBranchCount
          }
          : null,
        backtracks: routeDiagnostics?.telemetry.backtrackCount,
        wrongTurns: routeDiagnostics?.telemetry.wrongBranchCount
      }
    );
    const latestReceipt = this.mazeCycleTelemetryHistory.receipts[0] ?? null;
    if (latestReceipt) {
      this.progressionState = recordLegacyProgressionCycle(
        this.resolveLegacyProgressionStorage(),
        this.progressionState,
        latestReceipt,
        this.maze
      );
      void writeLegacyRemoteCycleReceipt(this.authSnapshot, latestReceipt)
        .then((result) => {
          this.publishLegacyRemoteSyncResult(result);
        })
        .catch((error: unknown) => {
          this.publishLegacyRemoteSyncException('cycle-receipt', error);
        });
      this.syncLegacyRemoteProgressionState();
      this.boardDynamicDirty = true;
      this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    }

    if (surface === 'menu-demo') {
      this.menuDemoCycleRecorded = true;
    }
    this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
  }

  private syncLegacyRemoteProgressionState(): void {
    void writeLegacyRemoteProgressionState(this.authSnapshot, this.progressionState)
      .then((result) => {
        this.publishLegacyRemoteSyncResult(result);
      })
      .catch((error: unknown) => {
        this.publishLegacyRemoteSyncException('progression', error);
      });
  }

  private publishLegacyRemoteSyncResult(result: LegacyRemoteProgressionSyncResult): void {
    this.latestRemoteSyncResult = result;
    this.pushLegacyPlayerMessage(result.playerMessage);
    this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
  }

  private publishLegacyRemoteSyncException(
    context: 'cycle-receipt' | 'progression',
    error: unknown
  ): void {
    const technicalDetail = error instanceof Error
      ? error.message
      : String(error);
    this.publishLegacyRemoteSyncResult({
      error: technicalDetail,
      playerMessage: createLegacyPlayerMessage({
        copy: context === 'cycle-receipt'
          ? LEGACY_REMOTE_MESSAGE_COPY.cycleReceiptFailed
          : LEGACY_REMOTE_MESSAGE_COPY.progressionFailed,
        id: `remote.${context}.exception`,
        source: 'progression',
        technicalDetail,
        tone: 'warning'
      }),
      skippedReason: null,
      synced: false
    });
  }

  private handleBackAction(): void {
    const action = resolveLegacyOverlayBackAction({
      mode: this.mode,
      overlay: this.overlay,
      overlayReturn: this.overlayReturn
    });

    switch (action.kind) {
      case 'noop':
        return;
      case 'open-overlay':
        this.openOverlay(action.overlay);
        return;
      case 'close-overlay':
        this.closeOverlay();
        return;
    }
  }

  private resolveLegacyPlayTouchControlDiagnostics(): MenuSceneVisualDiagnostics['touchControls'] {
    const touchControlLayout = this.resolveLegacyPlayTouchControlLayout();
    const visible = this.shouldRenderLegacyPlayTouchControls(touchControlLayout);
    const emptyControls = {
      move_up: null,
      move_up_right: null,
      move_right: null,
      move_down_right: null,
      move_down: null,
      move_down_left: null,
      move_left: null,
      move_up_left: null,
      pause: null,
      restart_attempt: null,
      toggle_thoughts: null
    };

    if (!visible) {
      return {
        visible,
        compact: touchControlLayout.compact,
        controlMode: touchControlLayout.controlMode,
        activeControls: [],
        frame: null,
        stick: null,
        controls: emptyControls
      };
    }

    const { controls, frame } = touchControlLayout;
    return {
      visible,
      compact: touchControlLayout.compact,
      controlMode: touchControlLayout.controlMode,
      activeControls: this.resolveLegacyPlayActiveTouchControls(),
      frame: cloneVisualRect(this.hudTouchControlBounds) ?? createVisualRect(frame.left, frame.top, frame.width, frame.height),
      stick: touchControlLayout.stick === null
        ? null
        : {
          inner: createVisualRect(
            touchControlLayout.stick.inner.left,
            touchControlLayout.stick.inner.top,
            touchControlLayout.stick.inner.width,
            touchControlLayout.stick.inner.height
          ),
          outer: createVisualRect(
            touchControlLayout.stick.outer.left,
            touchControlLayout.stick.outer.top,
            touchControlLayout.stick.outer.width,
            touchControlLayout.stick.outer.height
          ),
          pull: this.playTouchStickPull === null
            ? null
            : {
              distanceRatio: this.playTouchStickPull.distanceRatio,
              intentSegment: this.playTouchStickPull.intentSegment,
              movement: this.playTouchStickPull.movement,
              movementCandidates: [...this.playTouchStickPull.movementCandidates],
              normalizedX: this.playTouchStickPull.normalizedX,
              normalizedY: this.playTouchStickPull.normalizedY
            }
        },
      controls: {
        move_up: createVisualRect(controls.move_up.left, controls.move_up.top, controls.move_up.width, controls.move_up.height),
        move_up_right: createVisualRect(controls.move_up_right.left, controls.move_up_right.top, controls.move_up_right.width, controls.move_up_right.height),
        move_right: createVisualRect(controls.move_right.left, controls.move_right.top, controls.move_right.width, controls.move_right.height),
        move_down_right: createVisualRect(controls.move_down_right.left, controls.move_down_right.top, controls.move_down_right.width, controls.move_down_right.height),
        move_down: createVisualRect(controls.move_down.left, controls.move_down.top, controls.move_down.width, controls.move_down.height),
        move_down_left: createVisualRect(controls.move_down_left.left, controls.move_down_left.top, controls.move_down_left.width, controls.move_down_left.height),
        move_left: createVisualRect(controls.move_left.left, controls.move_left.top, controls.move_left.width, controls.move_left.height),
        move_up_left: createVisualRect(controls.move_up_left.left, controls.move_up_left.top, controls.move_up_left.width, controls.move_up_left.height),
        pause: createVisualRect(controls.pause.left, controls.pause.top, controls.pause.width, controls.pause.height),
        restart_attempt: createVisualRect(
          controls.restart_attempt.left,
          controls.restart_attempt.top,
          controls.restart_attempt.width,
          controls.restart_attempt.height
        ),
        toggle_thoughts: controls.toggle_thoughts.width > 0 && controls.toggle_thoughts.height > 0
          ? createVisualRect(
            controls.toggle_thoughts.left,
            controls.toggle_thoughts.top,
            controls.toggle_thoughts.width,
            controls.toggle_thoughts.height
          )
          : null
      }
    };
  }

  private resolveVisualTextLabels(): VisualTextLabel[] {
    return this.uiTexts
      .filter((text) => text.active && text.visible && text.alpha > 0)
      .map((text) => ({
        text: text.text,
        bounds: visualRectFromBounds(text.getBounds())
      }));
  }

  private resolveLegacyMenuPathTitleDiagnostics(): MenuSceneVisualDiagnostics['title'] {
    const titlePresentation = resolveLegacyMenuTitlePresentation(
      this.layout.boardSize,
      this.layout.tileSize,
      this.layout.height > this.layout.width,
      this.layout.width,
      this.maze.source === 'menu-generated' ? 'procedural' : 'snapshot'
    );
    const titleLayout = resolveLegacyMenuPathTitleLayout(
      this.layout.titleX,
      this.layout.titleY,
      titlePresentation.fontSize
    );
    const pieceCount = titleLayout.cells.length;
    const visiblePieces = this.resolveLegacyMenuPathTitleVisiblePieces(pieceCount);
    const visibleCells = titleLayout.cells.slice(0, visiblePieces);
    const progress = this.resolveLegacyMenuPathTitleProgress();
    const sweepState = this.resolveLegacyMenuPathTitleVisibleSweepState(visibleCells, titleLayout, this.time.now);
    const visibleSweepEdge = this.resolveLegacyMenuPathTitleVisibleSweepEdge(
      visibleCells,
      titleLayout.columns,
      titleLayout.rows
    );

    return {
      animation: {
        active: this.mode === 'menu' && this.overlay === 'none',
        facetCellCount: visiblePieces,
        facetPulsePeriodMs: LEGACY_MENU_PATH_TITLE_GEM_PULSE_MS,
        phase: Number(sweepState.phase.toFixed(3)),
        scannerAttachedToVisibleEdge: sweepState.syncedToLifecycle && visibleSweepEdge !== null,
        scannerDirection: sweepState.direction,
        scannerMode: sweepState.mode,
        scannerProgress: Number(sweepState.progress.toFixed(3)),
        scannerSyncedToLifecycle: sweepState.syncedToLifecycle,
        scannerVisibleEdgeColumn: visibleSweepEdge === null
          ? null
          : Number(visibleSweepEdge.column.toFixed(3)),
        sigilOrbitCount: LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS,
        sigilOrbitPeriodMs: LEGACY_MENU_PATH_TITLE_ORBIT_MS,
        sigilOrbitPhase: Number(this.resolveLegacyMenuPathTitleOrbitPhase(this.time.now).toFixed(3)),
        sweepColumn: Number(sweepState.column.toFixed(3)),
        sweepPeriodMs: LEGACY_MENU_PATH_TITLE_SWEEP_MS
      },
      bounds: createVisualRect(titleLayout.left, titleLayout.top, titleLayout.width, titleLayout.height),
      builtFromPathPieces: true,
      pieceCount,
      progressPercent: Math.round(progress * 100),
      visible: this.mode === 'menu' && this.overlay === 'none' && this.titleGraphics.visible,
      visiblePieces
    };
  }

  private publishVisualDiagnostics(time: number, force = false): void {
    if (typeof window === 'undefined' || !this.layout) {
      return;
    }

    const playLifecycleSignature = this.resolveLegacyPlayLifecycleDiagnosticsSignature(time);
    const lifecycleChanged = playLifecycleSignature !== this.visualDiagnosticsPlayLifecycleSignature;
    if (
      !force
      && !lifecycleChanged
      && time - this.visualDiagnosticsLastPublishedAtMs < legacyTuning.menu.runtime.diagnosticsPublishIntervalMs
    ) {
      return;
    }

    this.visualDiagnosticsLastPublishedAtMs = time;
    this.visualDiagnosticsPlayLifecycleSignature = playLifecycleSignature;
    const safeBounds = createVisualRect(0, 0, this.layout.width, this.layout.height);
    const boardOffset = this.resolveBoardOffset();
    const boardBounds = createVisualRect(
      this.layout.boardLeft + boardOffset.x,
      this.layout.boardTop + boardOffset.y,
      this.layout.boardSize,
      this.layout.boardSize
    );
    const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(
      this.layout.boardLeft + boardOffset.x,
      this.layout.boardTop + boardOffset.y,
      this.layout.boardSize
    );
    const mazeRenderBounds = createVisualRect(
      mazeRenderFrame.boardLeft,
      mazeRenderFrame.boardTop,
      mazeRenderFrame.boardSize,
      mazeRenderFrame.boardSize
    );
    const drawStage = this.resolveLegacyMenuStaticDrawStage();
    const drawStageStaged = drawStage?.executionKind === 'row-slice';
    const drawRowsVisible = this.resolveLegacyMenuStaticDrawRowsVisibleForDiagnostics();
    const drawTilesVisible = this.resolveLegacyMenuStaticDrawTilesVisibleForDiagnostics();
    const drawTileCount = drawStageStaged && this.menuStaticDrawTileOrder.length > 0
      ? this.menuStaticDrawTileOrder.length
      : null;
    const drawStageProgress = resolveMenuSceneGenerationDrawStageProgress({
      rowsVisible: drawRowsVisible,
      rowCount: drawStageStaged ? this.maze.size : null,
      tilesVisible: drawTilesVisible,
      tileCount: drawTileCount
    });
    const revealOrderDiagnostics = summarizeLegacyMazeRevealOrder(
      this.menuStaticDrawTileOrder,
      this.maze.solutionPath
    );
    const titlePieceCount = this.mode === 'menu'
      ? this.resolveLegacyMenuPathTitlePieceCount()
      : 0;
    const titleVisiblePieces = this.mode === 'menu'
      ? this.resolveLegacyMenuPathTitleVisiblePieceCount()
      : 0;
    const titlePiecesRemaining = this.menuStaticDrawLifecyclePhase === 'deconstructing'
      ? titleVisiblePieces
      : Math.max(0, titlePieceCount - titleVisiblePieces);
    const touchControls = this.resolveLegacyPlayTouchControlDiagnostics();
    const overlayPanel = this.overlay === 'none' ? null : this.resolveOverlayPanelFrame(this.overlay);
    const playerMarkerMetrics = resolveLegacyPlayerMarkerRenderMetrics(
      mazeRenderFrame.tileSize,
      this.mode === 'play' ? LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO : LEGACY_PLAYER_MARKER_RADIUS_RATIO,
      this.mode === 'play' ? LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO : LEGACY_PLAYER_MARKER_HALO_RATIO,
      this.mode === 'play' ? LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO : undefined,
      this.mode === 'play' ? LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO : undefined
    );
    const progressionDiagnostics = summarizeLegacyProgressionDiagnostics(
      this.progressionState,
      this.resolveActiveLegacyProgressionTrackId(),
      this.maze,
      this.resolveLegacyProgressionStorageKey()
    );
    const progressionPalette = progressionDiagnostics.palette;
    const trailShineMotion = resolveLegacyTrailShineMotion({
      timeMs: time,
      trailLength: this.trail.length
    });
    const menuAiMemory = this.resolveLegacyMenuAiMemoryPoints();
    const canvasBounds = this.game.canvas.getBoundingClientRect();
    const canvasCssWidth = Math.max(1, Math.round(canvasBounds.width));
    const canvasCssHeight = Math.max(1, Math.round(canvasBounds.height));
    const canvasPixelWidth = Math.max(1, this.game.canvas.width);
    const canvasPixelHeight = Math.max(1, this.game.canvas.height);
    const devicePixelRatio = typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1);
    const renderResolutionDiagnostics = summarizeMazerRenderResolution({
      canvasCssHeight,
      canvasCssWidth,
      canvasPixelHeight,
      canvasPixelWidth,
      devicePixelRatio
    });
    const playLifecycle = this.resolveLegacyPlayLifecycleDiagnostics(time);
    const viewportGeometry = readMazerViewportGeometry();
    const measuredRects = [
      { id: 'board', bounds: mazeRenderBounds },
      { id: 'progression-badge', bounds: this.progressionBadgeBounds },
      { id: 'hud', bounds: this.hudBounds },
      { id: 'touch-controls', bounds: touchControls.frame },
      { id: 'overlay', bounds: overlayPanel }
    ].filter((entry): entry is { id: string; bounds: VisualRect } => entry.bounds !== null);
    const offscreenBoundsViolations = measuredRects
      .filter(({ bounds }) => (
        bounds.left < safeBounds.left
        || bounds.top < safeBounds.top
        || bounds.right > safeBounds.right
        || bounds.bottom > safeBounds.bottom
      ))
      .map(({ id }) => id);
    const overlaps = (left: VisualRect | null, right: VisualRect | null): boolean => (
      left !== null
      && right !== null
      && left.left < right.right
      && left.right > right.left
      && left.top < right.bottom
      && left.bottom > right.top
    );
    const overlapViolations = this.overlay === 'none'
      ? [
        ...(overlaps(mazeRenderBounds, this.progressionBadgeBounds) ? ['board-progression-badge'] : []),
        ...(overlaps(mazeRenderBounds, this.hudBounds) ? ['board-hud'] : []),
        ...(overlaps(mazeRenderBounds, touchControls.frame) ? ['board-touch-controls'] : [])
      ]
      : [];
    const materialSystem = summarizeCyberArcadeMaterial();

    this.visualDiagnosticsRevision += 1;
    const diagnostics: MenuSceneVisualDiagnostics = {
      materialSystem: {
        ...materialSystem,
        geometry: {
          ...materialSystem.geometry,
          sharedPanelBounds: 'snapped-at-draw-boundary'
        }
      },
      revision: this.visualDiagnosticsRevision,
      updatedAt: Math.max(0, Math.round(time)),
      viewport: {
        width: this.layout.width,
        height: this.layout.height,
        geometry: {
          revision: viewportGeometry.revision,
          layoutWidth: viewportGeometry.layout.width,
          layoutHeight: viewportGeometry.layout.height,
          visualWidth: viewportGeometry.visual.width,
          visualHeight: viewportGeometry.visual.height,
          visualOffsetLeft: viewportGeometry.visual.offsetLeft,
          visualOffsetTop: viewportGeometry.visual.offsetTop,
          visualScale: viewportGeometry.visual.scale,
          visualUsedForContent: viewportGeometry.visual.usedForContent,
          content: createVisualRect(
            viewportGeometry.content.left,
            viewportGeometry.content.top,
            viewportGeometry.content.width,
            viewportGeometry.content.height
          ),
          devicePixelRatio: viewportGeometry.devicePixelRatio,
          isLandscape: viewportGeometry.isLandscape,
          isPhoneLike: viewportGeometry.isPhoneLike
        }
        ,
        safeInsets: viewportGeometry.safeArea,
        integrity: {
          offscreenBoundsViolations,
          overlapViolations
        }
      },
      runtime: {
        mode: this.mode,
        overlay: this.overlay,
        mazeSize: this.maze.size,
        generation: {
          budget: {
            checkpointCount: this.maze.generation?.budget.checkpointCount ?? null,
            checkpointModifier: this.maze.generation?.budget.checkpointModifier ?? null,
            scale: this.maze.generation?.budget.scale ?? null,
            shortcutCount: this.maze.generation?.budget.shortcutCount ?? null,
            shortcutCountModifier: this.maze.generation?.budget.shortcutCountModifier ?? null,
            shortcutStageEnabled: this.maze.generation?.budget.shortcutStageEnabled ?? null
          },
          buildKind: this.maze.generation?.buildKind ?? null,
          seed: this.maze.seed,
          seedSource: this.mode === 'play' || !this.explicitRuntimeMazeSeed ? 'runtime-random' : 'query',
          executionPlan: (this.maze.generation?.executionPlan ?? []).map((stage) => ({
            advancesToStageId: stage.advancesToStageId,
            id: stage.id,
            name: stage.name,
            completionSignal: stage.completionSignal,
            executionKind: stage.executionKind,
            batchSize: stage.batchSize,
            batchUnit: stage.batchUnit,
            skipToStageIdWhenDisabled: stage.skipToStageIdWhenDisabled
          })),
          gate: {
            armsDelayStartOnQueue: this.maze.generation?.gate.armsDelayStartOnQueue ?? null,
            consumesWhileInitialized: this.maze.generation?.gate.consumesWhileInitialized ?? null,
            consumesWhileUninitialized: this.maze.generation?.gate.consumesWhileUninitialized ?? null,
            entryStageId: this.maze.generation?.gate.entryStageId ?? null,
            initializedResetBypassesDelayGate: this.maze.generation?.gate.initializedResetBypassesDelayGate ?? null,
            levelBuildingDelayDurationMs: this.maze.generation?.gate.levelBuildingDelayDurationMs ?? null,
            levelBuildingDelayDurationSource: this.maze.generation?.gate.levelBuildingDelayDurationSource ?? null,
            requiresLevelBuildingDelayStartedFlag: this.maze.generation?.gate.requiresLevelBuildingDelayStartedFlag ?? null,
            requiresLevelBuildingStartTime: this.maze.generation?.gate.requiresLevelBuildingStartTime ?? null,
            resetsLevelBuildingTimerAfterConsume: this.maze.generation?.gate.resetsLevelBuildingTimerAfterConsume ?? null,
            waitsForLevelBuildingDelay: this.maze.generation?.gate.waitsForLevelBuildingDelay ?? null
          },
          profile: this.maze.generation?.profile ?? null,
          stageCursor: {
            completionSignal: this.maze.generation?.stageCursor.completionSignal ?? null,
            currentStageId: this.maze.generation?.stageCursor.currentStageId ?? null,
            phase: this.maze.generation?.stageCursor.phase ?? null,
            previousStageIds: [...(this.maze.generation?.stageCursor.previousStageIds ?? [])],
            processComplete: this.maze.generation?.stageCursor.processComplete ?? null,
            remainingStageIds: [...(this.maze.generation?.stageCursor.remainingStageIds ?? [])]
          },
          drawStage: {
            batchSize: drawStage?.batchSize ?? null,
            batchUnit: drawStage?.batchUnit ?? null,
            buildPrerollActive: this.isLegacyMenuBuildPrerollActive(time),
            buildPrerollDurationMs: LEGACY_MENU_STATIC_BUILD_PREROLL_BURST_MS,
            buildPrerollProgress: this.resolveLegacyMenuBuildPrerollProgress(time),
            complete: drawStageProgress.complete,
            handoffActive: this.isLegacyMenuDeconstructHandoffActive(time),
            handoffEndsAtMs: this.menuStaticDeconstructZeroHoldStartedAtMs === null
              ? null
              : Math.round(this.resolveLegacyMenuDeconstructHandoffEndsAtMs()),
            handoffDurationMs: LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS,
            handoffProgress: this.resolveLegacyMenuDeconstructHandoffProgress(time),
            lifecyclePhase: this.menuStaticDrawLifecyclePhase,
            zeroHoldStartedAtMs: this.menuStaticDeconstructZeroHoldStartedAtMs === null
              ? null
              : Math.round(this.menuStaticDeconstructZeroHoldStartedAtMs),
          nextSeedQueued: this.isLegacyDeconstructGenerationReason(this.pendingGenerationRequest?.reason ?? null),
          nonSolutionTileCountBeforeSolutionComplete: revealOrderDiagnostics.nonSolutionTileCountBeforeSolutionComplete,
          progressPercent: drawStageProgress.progressPercent,
          revealStrategyVersion: revealOrderDiagnostics.strategyVersion,
          rowCount: drawStageProgress.rowCount,
            rowsRemaining: drawStageProgress.rowsRemaining,
            rowsVisible: drawRowsVisible,
            staged: drawStageStaged,
            titleFullyDeconstructed: titleVisiblePieces === 0,
            titlePieceCount,
            titlePiecesRemaining,
          titleVisiblePieces,
          tileCount: drawStageProgress.tileCount,
          solutionCompletedAtIndex: revealOrderDiagnostics.solutionCompletedAtIndex,
          solutionFirstRevealPrevented: revealOrderDiagnostics.solutionFirstRevealPrevented,
          solutionPrefixLength: revealOrderDiagnostics.solutionPrefixLength,
          tilesRemaining: drawStageProgress.tilesRemaining,
            tilesVisible: drawStageProgress.tilesVisible
          },
          pendingRequest: {
            budget: {
              checkpointCount: this.pendingGenerationRequest?.budget.checkpointCount ?? null,
              checkpointModifier: this.pendingGenerationRequest?.budget.checkpointModifier ?? null,
              scale: this.pendingGenerationRequest?.budget.scale ?? null,
              shortcutCount: this.pendingGenerationRequest?.budget.shortcutCount ?? null,
              shortcutCountModifier: this.pendingGenerationRequest?.budget.shortcutCountModifier ?? null,
              shortcutStageEnabled: this.pendingGenerationRequest?.budget.shortcutStageEnabled ?? null
            },
            buildKind: this.pendingGenerationRequest?.buildKind ?? null,
            reason: this.pendingGenerationRequest?.reason ?? null,
            dueAtMs: this.pendingGenerationRequest?.dueAtMs ?? null,
            queuedAtMs: this.pendingGenerationRequest?.queuedAtMs ?? null,
            seed: this.pendingGenerationRequest?.seed ?? null,
            mode: this.pendingGenerationRequest?.mode ?? null,
            executionPlan: (this.pendingGenerationRequest?.executionPlan ?? []).map((stage) => ({
              advancesToStageId: stage.advancesToStageId,
              id: stage.id,
              name: stage.name,
              completionSignal: stage.completionSignal,
              executionKind: stage.executionKind,
              batchSize: stage.batchSize,
              batchUnit: stage.batchUnit,
              skipToStageIdWhenDisabled: stage.skipToStageIdWhenDisabled
            })),
            gate: {
              armsDelayStartOnQueue: this.pendingGenerationRequest?.gate.armsDelayStartOnQueue ?? null,
              consumesWhileInitialized: this.pendingGenerationRequest?.gate.consumesWhileInitialized ?? null,
              consumesWhileUninitialized: this.pendingGenerationRequest?.gate.consumesWhileUninitialized ?? null,
              entryStageId: this.pendingGenerationRequest?.gate.entryStageId ?? null,
              initializedResetBypassesDelayGate: this.pendingGenerationRequest?.gate.initializedResetBypassesDelayGate ?? null,
              levelBuildingDelayDurationMs: this.pendingGenerationRequest?.gate.levelBuildingDelayDurationMs ?? null,
              levelBuildingDelayDurationSource: this.pendingGenerationRequest?.gate.levelBuildingDelayDurationSource ?? null,
              requiresLevelBuildingDelayStartedFlag: this.pendingGenerationRequest?.gate.requiresLevelBuildingDelayStartedFlag ?? null,
              requiresLevelBuildingStartTime: this.pendingGenerationRequest?.gate.requiresLevelBuildingStartTime ?? null,
              resetsLevelBuildingTimerAfterConsume: this.pendingGenerationRequest?.gate.resetsLevelBuildingTimerAfterConsume ?? null,
              waitsForLevelBuildingDelay: this.pendingGenerationRequest?.gate.waitsForLevelBuildingDelay ?? null
            },
            profile: this.pendingGenerationRequest?.generationProfile ?? null,
            processStageIds: [...(this.pendingGenerationRequest?.processStageIds ?? [])],
            stageCursor: {
              completionSignal: this.pendingGenerationRequest?.stageCursor.completionSignal ?? null,
              currentStageId: this.pendingGenerationRequest?.stageCursor.currentStageId ?? null,
              phase: this.pendingGenerationRequest?.stageCursor.phase ?? null,
              previousStageIds: [...(this.pendingGenerationRequest?.stageCursor.previousStageIds ?? [])],
              processComplete: this.pendingGenerationRequest?.stageCursor.processComplete ?? null,
              remainingStageIds: [...(this.pendingGenerationRequest?.stageCursor.remainingStageIds ?? [])]
            }
          },
          processStageIds: [...(this.maze.generation?.processStageIds ?? [])]
        },
        reset: {
          entry: {
            bypassesLevelBuildingDelay: this.pendingResetRequest?.entry.bypassesLevelBuildingDelay ?? null,
            clearsResetFlagOnConsume: this.pendingResetRequest?.entry.clearsResetFlagOnConsume ?? null,
            consumesWhileInitialized: this.pendingResetRequest?.entry.consumesWhileInitialized ?? null,
            entryStageId: this.pendingResetRequest?.entry.entryStageId ?? null,
            rearmsDelayStart: this.pendingResetRequest?.entry.rearmsDelayStart ?? null,
            returnsToTemplateLevel: this.pendingResetRequest?.entry.returnsToTemplateLevel ?? null
          },
          pendingAction: this.pendingResetRequest?.action ?? null,
          dueAtMs: this.pendingResetRequest?.dueAtMs ?? null,
          reason: this.pendingResetRequest?.reason ?? null
        },
        player: copyPoint(this.player),
        playLifecycle,
        goal: copyPoint(this.maze.goal),
        trailLength: this.trail.length,
        trailTail: this.trail.slice(Math.max(0, this.trail.length - 8)).map(copyPoint),
        menuDemo: {
          phase: this.menuDemoState?.phase ?? null,
          cue: this.menuDemoState?.cue ?? null,
          pathCursor: this.menuDemoState?.pathCursor ?? null,
          gate: {
            nextMoveAtMs: Math.round(this.nextDemoMoveAtMs),
            released: this.menuStaticDrawLifecyclePhase === 'settled' && this.nextDemoMoveAtMs <= time,
            waitingForBuild: this.menuStaticDrawLifecyclePhase !== 'settled'
              || this.menuStaticDrawRowsVisible !== null
              || this.menuStaticDrawTilesVisible !== null
          },
          reachedGoal: this.menuDemoState?.reachedGoal ?? false,
          prerollSteps: Math.max(0, this.menuDemoConfig?.behavior.prerollSteps ?? 0),
          runnerMistakesEnabled: this.menuDemoConfig?.behavior.enableRunnerMistakes === true,
          aiMemory: {
            choiceClass: menuAiMemory.choiceClass,
            confidence: menuAiMemory.confidence,
            optionCount: menuAiMemory.optionPoints.length,
            optionPoints: menuAiMemory.optionPoints.map(copyPoint),
            targetPoint: menuAiMemory.targetPoint ? copyPoint(menuAiMemory.targetPoint) : null,
            thoughtState: menuAiMemory.thoughtState
          },
          telemetry: this.menuDemoState?.telemetry ?? null
        }
      },
      board: {
        bounds: boardBounds,
        renderBounds: mazeRenderBounds,
        renderSafeInset: mazeRenderFrame.safeInset,
        safeBounds,
        pathVisualStyle: this.pathVisualStyle,
        tileSize: mazeRenderFrame.tileSize,
        cornerFacet: {
          alpha: Number(this.resolveLegacyBoardCornerFacetAlpha(time).toFixed(3)),
          animated: true,
          shimmerPeriodMs: LEGACY_BOARD_SIGIL_CORNER_FACET_SHIMMER_MS,
          visible: true
        },
        pathMaterial: {
          connectorSeamsEnabled: true,
          seamCoreAlphaRatio: LEGACY_PATH_CONNECTOR_SEAM_CORE_ALPHA_RATIO,
          seamEdgeAlphaRatio: LEGACY_PATH_CONNECTOR_SEAM_EDGE_ALPHA_RATIO,
          seamPadRatio: LEGACY_PATH_CONNECTOR_SEAM_PAD_RATIO
        },
        renderResolution: renderResolutionDiagnostics,
        topCenterNotch: this.resolveLegacyBoardTopCenterNotchBounds(
          this.layout.boardLeft + boardOffset.x,
          this.layout.boardTop + boardOffset.y,
          this.layout.boardSize
        )
      },
      markerStyle: {
        goalCoreColor: LEGACY_PLAY_GOAL_MARKER_CORE,
        goalEdgeColor: LEGACY_PLAY_GOAL_MARKER_EDGE,
        playerCoreColor: resolveLegacyIridescentPlayerCoreColor(),
        playerCoreRadius: playerMarkerMetrics.coreRadius,
        playerBeaconAccentColor: LEGACY_PLAY_PLAYER_BEACON_ACCENT,
        playerBeaconColor: LEGACY_PLAY_PLAYER_BEACON_COLOR,
        playerBeaconPeriodMs: LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS,
        playerHaloColor: progressionPalette.playerHaloColor,
        playerHaloRadius: playerMarkerMetrics.haloRadius,
        startCoreColor: LEGACY_PLAY_START_MARKER_CORE,
        startEdgeColor: LEGACY_PLAY_START_MARKER_EDGE,
        trailPulseEnabled: this.settings.toggleTrailPulse,
        trailPulseColor: progressionPalette.trailPulseColor,
        trailPulseEdgeColor: progressionPalette.trailPulseEdgeColor,
        trailShineEnabled: this.settings.toggleTrailPulse,
        trailShineColor: progressionPalette.trailPulseColor,
        trailShineEdgeColor: progressionPalette.trailPulseEdgeColor,
        trailShineCenterIndex: trailShineMotion.centerIndex,
        trailShineCyclePeriodMs: trailShineMotion.cyclePeriodMs,
        trailShineDirection: trailShineMotion.direction,
        trailShineProgress: trailShineMotion.distanceProgress,
        trailShineSpeedTilesPerSecond: trailShineMotion.speedTilesPerSecond,
        iridescentMaterial: this.resolveLegacyIridescentMaterialDiagnostics(time, progressionPalette),
        trailPulsePeriodMs: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS
      },
      progression: progressionDiagnostics,
      progressionBadge: {
        bounds: cloneVisualRect(this.progressionBadgeBounds),
        text: this.progressionBadgeText.visible ? this.progressionBadgeText.text : null,
        textBounds: cloneVisualRect(this.progressionBadgeTextBounds),
        textFits: this.progressionBadgeTextFits
      },
      menuCompass: {
        bounds: cloneVisualRect(this.menuCompassBounds),
        notchBounds: this.resolveLegacyBoardTopCenterNotchBounds(
          this.layout.boardLeft + boardOffset.x,
          this.layout.boardTop + boardOffset.y,
          this.layout.boardSize
        ),
        visible: this.mode === 'menu' && this.overlay === 'none' && this.menuCompassBounds !== null
      },
      remoteSync: {
        lastError: this.latestRemoteSyncResult?.error ?? null,
        lastMessage: this.latestRemoteSyncResult?.playerMessage ?? null,
        lastSkippedReason: this.latestRemoteSyncResult?.skippedReason ?? null,
        lastSynced: this.latestRemoteSyncResult?.synced ?? null
      },
      authAction: this.latestAuthActionDiagnostics,
      layout: {
        buttonHeight: this.layout.buttonHeight,
        buttonLayout: this.layout.buttonLayout,
        buttonWidth: this.layout.buttonWidth,
        centerButtonWidth: this.layout.centerButtonWidth,
        centerButtonX: this.layout.centerButtonX,
        centerButtonY: this.layout.centerButtonY,
        leftButtonX: this.layout.leftButtonX,
        leftButtonY: this.layout.leftButtonY,
        rightButtonX: this.layout.rightButtonX,
        rightButtonY: this.layout.rightButtonY,
        surface: this.mode === 'play' ? 'play' : 'menu',
        titleX: this.layout.titleX,
        titleY: this.layout.titleY
      },
      buttons: this.uiButtons
        .filter((button) => button.background.active)
        .map((button) => ({
          bounds: cloneVisualRect(button.bounds) ?? createVisualRect(
            button.background.x - (button.background.width / 2),
            button.background.y - (button.background.height / 2),
            button.background.width,
            button.background.height
          ),
          labelBounds: button.label.active && button.label.visible
            ? visualRectFromBounds(button.label.getBounds())
            : null,
          text: button.text
        })),
      title: this.resolveLegacyMenuPathTitleDiagnostics(),
      textLabels: this.resolveVisualTextLabels(),
      renderSurface: {
        ...renderResolutionDiagnostics
      },
      hud: {
        kind: this.mode === 'play' && this.overlay === 'none' ? 'legacy-play-hud' : null,
        visible: this.mode === 'play' && this.overlay === 'none',
        bounds: cloneVisualRect(this.hudBounds),
        timerBounds: cloneVisualRect(this.hudTimerBounds),
        arrowBounds: cloneVisualRect(this.hudArrowBounds),
        arrowAngleDegrees: this.hudFrame?.arrowAngleDegrees ?? null,
        timerText: this.hudFrame?.timerText ?? null,
        arrowAngleRadians: this.hudFrame?.arrowAngleRadians ?? null,
        compassSpinActive: this.hudCompassSpinActive,
        compassSpinProgress: this.hudCompassSpinProgress,
        compassVisualAngleDegrees: this.hudCompassVisualAngleDegrees,
        compassVisualAngleRadians: this.hudCompassVisualAngleRadians
      },
      touchControls,
      overlayUi: {
        backChevron: cloneVisualRect(this.overlayBackChevronBounds),
        guidePanel: cloneVisualRect(this.overlayGuideBounds),
        latestAuthMessage: this.latestAuthMessage,
        latestMessage: this.latestOverlayMessage,
        visibleMessages: this.resolveVisibleLegacyPlayerMessages(),
        panel: overlayPanel === null
          ? null
          : createVisualRect(overlayPanel.left, overlayPanel.top, overlayPanel.width, overlayPanel.height),
        scroll: {
          bottomFadeAlpha: this.overlayScrollBottomFadeAlpha,
          contentHeight: this.overlayScrollContentHeight,
          enabled: this.overlayScrollMax > 0,
          maxOffset: this.overlayScrollMax,
          offset: this.overlayScrollOffset,
          thumb: cloneVisualRect(this.overlayScrollThumbBounds),
          topFadeAlpha: this.overlayScrollTopFadeAlpha,
          track: cloneVisualRect(this.overlayScrollTrackBounds),
          viewport: cloneVisualRect(this.overlayScrollViewportBounds)
        }
      }
    };
    window[MENU_SCENE_VISUAL_DIAGNOSTICS_KEY] = diagnostics;
    window.document?.documentElement?.setAttribute(
      MENU_SCENE_VISUAL_DIAGNOSTICS_ATTRIBUTE,
      JSON.stringify(diagnostics)
    );
  }

  private clearVisualDiagnostics(): void {
    if (typeof window === 'undefined') {
      return;
    }

    delete window[MENU_SCENE_VISUAL_DIAGNOSTICS_KEY];
    window.document?.documentElement?.removeAttribute(MENU_SCENE_VISUAL_DIAGNOSTICS_ATTRIBUTE);
  }
}
