import Phaser from 'phaser';
import {
  applyMazerCanvasBackingResolution,
  resolveMazerCanvasBackingResolution,
  summarizeMazerRenderResolution,
  type MazerRenderResolutionDiagnostics,
  type MazerRenderResolutionStatus
} from '../boot/canvasResolution';
import { MAZER_VIEWPORT_CHANGE_EVENT, readMazerViewportGeometry, syncMazerGameToViewport } from '../boot/viewportGeometry';
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
  type WorldTurnPhaseContext,
  type WorldTurnPhaseResult,
  type WorldTurnReceipt
} from '../mazer-core/world';
import { legacyTuning } from '../config/tuning';
import {
  LEGACY_DEFAULTS,
  MAIN_MENU_BUTTONS,
  copyLegacySettings,
  linearColorToHex,
  type LegacySettings
} from '../legacy-runtime/legacyDefaults';
import { resolveLegacyAdvancedOptionsVisible } from '../legacy-runtime/legacyAdvancedOptions';
import {
  isLegacyWrappedStepTransition,
  resolveLegacyPlayableShortestPath,
  type LegacyMazeGenerationProfile,
  type LegacyMazeSnapshot,
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
  resolveLegacyStaticDrawPlayTimerStartAtMs,
  shouldFreezeLegacyPlayElapsedForStaticDraw,
  shouldSettleLegacyStaticDrawStage,
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
  resolveLegacyFrozenElapsedMs,
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
  resolveLegacyMenuBoardAspectRatio,
  resolveLegacyMenuLayout,
  type LegacyMenuLayout
} from '../legacy-runtime/legacyMenuLayout';
import { shouldUseLegacyBrowserMobileParity } from '../legacy-runtime/legacyBrowserMobileParity';
import {
  resolveLegacyPathVisualStyle,
  type LegacyPathVisualStyle
} from '../legacy-runtime/legacyPathVisualStyle';
import { resolveLegacyMenuButtonChrome } from '../legacy-runtime/legacyMenuButtonChrome';
import {
  resolveLegacyHeaderControlFrame,
  resolveLegacyHeaderControlMetricFontSize,
  type LegacyHeaderControlFrame
} from '../legacy-runtime/legacyHeaderControl';
import {
  LEGACY_UI_COMPACT_BREAKPOINT,
  resolveLegacyFeatureControlLayout,
  resolveLegacyOverlayContentFlowLayout,
  resolveLegacyOverlayPanelLayout,
  resolveLegacyOverlayShellLayout,
  resolveLegacyOptionsGuideLayout,
  resolveLegacyToggleRowLayout,
  resolveLegacyTwoUpButtonLayout,
  resolveLegacyUiLabelCenterY,
  type LegacyUiLabelRole
} from '../legacy-runtime/legacyUiStandards';
import {
  isLegacyGlyphWordRenderable,
  resolveLegacyGlyphWordColumns,
  resolveLegacyGlyphWordLayout,
  resolveLegacyMenuPathTitleLayout,
  resolveLegacyMenuPathTitleOrbitPoint,
  resolveLegacyMenuTitlePresentation,
  type LegacyGlyphWordLayout,
  type LegacyMenuPathTitleCell,
  type LegacyMenuPathTitleOrbitGeometry
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
  mixLegacyIridescentColor,
  resolveLegacyIridescentPlayerCoreColor,
  resolveLegacyIridescentPlayerAccentColor,
  resolveLegacyIridescentPlayerHaloColor,
  resolveLegacyIridescentPulseColor,
  resolveLegacyIridescentTrailColor
} from '../legacy-runtime/legacyIridescentMaterial';
import {
  LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS,
  buildLegacyMazeRevealOrder,
  resolveLegacyTrailPulseSweepMotion,
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
  LEGACY_PROGRESSION_PHONE_MENU_MAX_WIDTH,
  LEGACY_PROGRESSION_STORAGE_KEY,
  createEmptyLegacyProgressionState,
  readLegacyProgressionState,
  recordLegacyProgressionCycle,
  resolveLegacyMazeGenerationProfileForProgression,
  resolveLegacyProgressionDifficultyProfile,
  resolveLegacyProgressionGenerationScale,
  resolveLegacyProgressionPalette,
  resolveLegacyProgressionTrackIdForSurface,
  summarizeLegacyProgressionDiagnostics,
  writeLegacyProgressionState,
  type LegacyProgressionDiagnostics,
  type LegacyProgressionDifficultyBand,
  type LegacyProgressionPalette,
  type LegacyProgressionState,
  type LegacyProgressionTrackId
} from '../legacy-runtime/legacyProgression';
import {
  applyLegacyStaticSlowTileEntry,
  createLegacyStaticSlowTileState,
  isLegacyStaticSlowTileDelayActive,
  recordLegacyStaticSlowTileBlockedMove,
  resolveLegacyStaticSlowTilePhase,
  resolveLegacyStaticSlowTileRemainingMs,
  type LegacyStaticSlowTileState
} from '../legacy-runtime/legacyStaticSlowTile';
import {
  createLegacyRoomCandidateMetadata,
  type LegacyRoomCandidateMetadata
} from '../legacy-runtime/legacyRoomCandidateMetadata';
import {
  LEGACY_PATROL_AGENT_COLLISION_DELAY_MS,
  LEGACY_PATROL_AGENT_COLLISION_FEEDBACK_WINDOW_MS,
  LEGACY_PATROL_AGENT_COLLISION_RECOVERY_WINDOW_MS,
  LEGACY_PATROL_AGENT_MAXIMUM_PENDING_COLLISION_INTENTS,
  LEGACY_PATROL_AGENT_ROUND_TRIP_MS,
  LEGACY_PATROL_AGENT_STEP_MS,
  LEGACY_PATROL_AGENT_TELEGRAPH_WINDOW_MS,
  advanceLegacyPatrolAgent,
  applyLegacyPatrolAgentCollision,
  clearLegacyPatrolAgentCollisionIntent,
  createLegacyPatrolAgentState,
  isLegacyPatrolAgentDelayActive,
  queueLegacyPatrolAgentCollisionIntent,
  recordLegacyPatrolAgentBlockedMove,
  resolveLegacyPatrolAgentPoint,
  resolveLegacyPatrolAgentCollisionFeedback,
  resolveLegacyPatrolAgentCollisionIntent,
  resolveLegacyPatrolAgentCollisionRecovery,
  resolveLegacyPatrolAgentRemainingMs,
  resolveLegacyPatrolAgentTelegraph,
  resolveLegacyPatrolAgentTick,
  type LegacyPatrolAgentState
} from '../legacy-runtime/legacyPatrolAgent';
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
import { resolveLegacyAuthPresentation, type LegacyAuthPresentation } from '../legacy-runtime/legacyAuthPresentation';
import { resolveLegacyAuthInputCssRect } from '../legacy-runtime/legacyAuthInputGeometry';
import {
  LEGACY_AUTH_MESSAGE_COPY,
  LEGACY_REMOTE_MESSAGE_COPY,
  createLegacyPlayerMessage,
  enqueueLegacyPlayerMessage,
  expireLegacyPlayerMessageQueue,
  resolveLegacyAuthFeedbackMessage,
  resolveLegacyAuthValidationMessage,
  type LegacyQueuedPlayerMessage,
  type LegacyPlayerMessage
} from '../legacy-runtime/legacyPlayerMessage';
import {
  hydrateLegacyRemoteAccountState,
  readLegacyBootstrappedAuthSnapshot,
  writeLegacyRemoteCycleReceipt,
  writeLegacyRemoteProgressionState,
  writeLegacyRemoteSettings,
  type LegacyRemoteProgressionSyncResult
} from '../legacy-runtime/legacyRemoteProgression';
import {
  clampLegacyOverlayScrollOffset,
  legacyOverlayScrollRectIntersectsViewport,
  resolveLegacyOverlayScrollRenderRect,
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
  resolveLegacyBleedOffDockVisualEligibility,
  resolveLegacyMenuBorderDockDirections,
  resolveLegacyMenuBorderDockRenderAreas,
  resolveLegacyMenuPathRenderFrames,
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
  resolveTouchClientPoint,
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
  iconOnly?: boolean;
  label: Phaser.GameObjects.Text;
  /** The player-facing action name published to visual QA. */
  semanticAction?: string;
  setActive(active: boolean): void;
  text: string;
  /** Only implemented by buttons with a continuous per-frame animation (e.g. the pulsating Start glow). */
  updateFrame?(time: number): void;
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
  boardWidth: number;
  boardHeight: number;
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
  accessibility: {
    reducedMotion: boolean;
    reducedMotionSource: 'os-media-query-cache';
  };
  materialSystem: {
    version: typeof CYBER_ARCADE_MATERIAL_VERSION;
    iconTarget: typeof CYBER_ARCADE_ICON_TARGET;
    surfaceRoles: string[];
    geometry: {
      fillAlignment: string;
      strokeAlignment: string;
      backingScale: string;
      sharedPanelBounds: 'snapped-at-draw-boundary';
      textTextureResolution: number;
      textTransformOwner: 'game-canvas-only';
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
    label: string | null;
    labelBounds: VisualRect | null;
    text: string | null;
    textBounds: VisualRect | null;
    textFontSize: number | null;
    textFits: boolean;
  };
  menuAiProgressionBadge: {
    bounds: VisualRect | null;
    label: string | null;
    labelBounds: VisualRect | null;
    text: string | null;
    textBounds: VisualRect | null;
    textFontSize: number | null;
    textFits: boolean;
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
    iconOnly: boolean;
    labelBounds: VisualRect | null;
    labelFontSize: number | null;
    semanticAction: string;
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
    timerText: string | null;
  };
  touchControls: {
    visible: boolean;
    compact: boolean | null;
    controlMode: ReturnType<typeof resolveTouchControlLayout>['controlMode'] | null;
    activeControls: HumanMovementActionKind[];
    frame: VisualRect | null;
    stick: {
      deadzoneRadius: number;
      inner: VisualRect;
      knobRadius: number;
      outer: VisualRect;
      pull: {
        angleRadians: number;
        distanceRatio: number;
        movement: HumanMovementActionKind;
        movementCandidates: HumanMovementActionKind[];
        normalizedX: number;
        normalizedY: number;
      } | null;
      travelRadius: number;
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
  /** Player-facing Settings action; the internal overlay id remains options. */
  openSettingsOverlay(): LegacyQaOverlayResult;
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
const LEGACY_UI_FONT_FAMILY = cyberArcadeMaterial.typography.ui;
const LEGACY_UI_MONO_FONT_FAMILY = cyberArcadeMaterial.typography.metrics;
// Unambiguously above every other depth used in the scene (everything else
// is either default 0 or the shared "3" a couple of unrelated corner
// controls also use) -- the overlay back chevron sits in the same general
// top-right corner as play mode's always-present fixed pause-cog touch
// region, and a tied/lower depth there is exactly what made the chevron
// "difficult to click": nothing else should ever be able to out-rank it.
const LEGACY_OVERLAY_BACK_CHEVRON_DEPTH = 1000;
// Higher than literally everything else, including overlays -- the boot-
// time loading screen (while the auth gate's first snapshot is still
// unresolved) has to sit above the menu front door, since that content
// keeps rendering underneath it rather than being suppressed.
const LEGACY_AUTH_GATE_LOADING_DEPTH = 5000;
// Extra forgiveness beyond the chevron's own drawn touch-target size when
// resolving which hit box a tap belongs to first -- corner buttons are
// statistically the hardest to land a precise tap on.
const LEGACY_OVERLAY_BACK_CHEVRON_PRIORITY_PADDING = 10;
const LEGACY_UI_CONTROL_RADIUS = cyberArcadeMaterial.controls.radius;
const MENU_TEXT_COLOR = toCyberArcadeCssHex(cyberArcadeMaterial.rail.white);
// Pulse period for the classic "PRESS START" blink -- see
// applyLegacyMenuBlinkPulse.
// Slowed way down from an initial 900ms -- per feedback that pace read as
// too fast/flickery for a deliberate classic-menu blink.
const LEGACY_MENU_BLINK_PULSE_MS = 2400;
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
// A trail-color wipe across the title tiles: fills bottom-left to top-right
// (combining "left to right" and "bottom to top" into one diagonal sweep
// instead of two independent passes), holds, wipes back to the tiles' own
// core/edge color in the same order, holds, and loops. Fill runs slightly
// slower than the revert -- reads as "the trail catches up to it" rather
// than a mechanically symmetric blink.
const LEGACY_MENU_TITLE_TRAIL_SWEEP_FILL_MS = 2200;
const LEGACY_MENU_TITLE_TRAIL_SWEEP_HOLD_MS = 340;
const LEGACY_MENU_TITLE_TRAIL_SWEEP_REVERT_MS = 1500;
// Fraction of the total sweep span each tile takes to transition, centered
// on the moment the sweep front reaches it -- a soft-edged band instead of
// every tile snapping instantly, so the wipe reads as a gradient front
// moving across the word rather than a hard step.
const LEGACY_MENU_TITLE_TRAIL_SWEEP_SOFT_BAND = 0.16;
// 8 so the frozen (idle) position lands exactly on the 4 corners and 4
// edge midpoints of the viewport -- see drawLegacyMenuPathTitleOrbitSigils.
const LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS = 8;
const LEGACY_MENU_PATH_TITLE_SHADOW_ALPHA = 0.44;
const LEGACY_MENU_PATH_TITLE_ACCENT_ALPHA = 0.92;
const LEGACY_BOARD_GRID_ALPHA = 0;
const INITIAL_MENU_DEMO_HOLD_MS = 1800;
const TRAIL_FADE_TAIL = 16;
const LEGACY_MENU_PANEL_SHADOW_ALPHA = 0;
// Dimmed ~22% off the raw token (which is a near-pure #E9FFF1 white) --
// players called the raw tile color "blinding" to stare at for a whole
// session. Mixed at the render layer rather than editing the token itself,
// since world.pathCore is a protected design-token path with its own
// decision-registry process; this keeps the fix scoped to how Mazer's own
// tile rendering consumes the token instead of touching the shared token.
const LEGACY_PATH_CORE_EYE_COMFORT_DIM_AMOUNT = 0.22;
const LEGACY_MENU_PATH_CORE = mixLegacyIridescentColor(cyberArcadeMaterial.path.core, 0x000000, LEGACY_PATH_CORE_EYE_COMFORT_DIM_AMOUNT);
const LEGACY_MENU_PATH_EDGE = cyberArcadeMaterial.path.edge;
const LEGACY_MENU_PATH_EDGE_ALPHA = 0.58;
const LEGACY_PLAY_PATH_CORE = mixLegacyIridescentColor(cyberArcadeMaterial.path.core, 0x000000, LEGACY_PATH_CORE_EYE_COMFORT_DIM_AMOUNT);
const LEGACY_PLAY_PATH_EDGE = cyberArcadeMaterial.path.edge;
const LEGACY_PLAY_PATH_EDGE_ALPHA = 0.58;
const LEGACY_PLAY_WALL_FILL = cyberArcadeMaterial.substrate.field;
const LEGACY_PLAY_WALL_GLASS_ALPHA = 0.18;
const LEGACY_PATH_TILE_CUE_COLOR = cyberArcadeMaterial.path.edge;
const LEGACY_PATH_TILE_CUE_ALPHA = 0.42;
const LEGACY_PATH_CONNECTOR_SEAM_PAD_RATIO = 0.16;
const LEGACY_PATH_CONNECTOR_SEAM_EDGE_ALPHA_RATIO = 0.72;
const LEGACY_PATH_CONNECTOR_SEAM_CORE_ALPHA_RATIO = 0.94;
const LEGACY_BOARD_SIGIL_BORDER_PRIMARY = cyberArcadeMaterial.rail.mint;
const LEGACY_BOARD_SIGIL_BORDER_SECONDARY = cyberArcadeMaterial.rail.cyan;
const LEGACY_BOARD_SIGIL_BACKGROUND_ALPHA = 0.12;
const LEGACY_BOARD_SIGIL_CORNER_FACET_SIZE_RATIO = 0.066;
const LEGACY_BOARD_MAZE_SAFE_INSET_RATIO = 0.018;
const LEGACY_BOARD_MAZE_SAFE_INSET_MIN = 4;
const LEGACY_BOARD_MAZE_SAFE_INSET_MAX = 7;
// Bleed-off/wrap corridors are just a small strip past the board's own
// edge -- easy to miss. A soft pulse travels from where the corridor meets
// the grid (progress 0) out to the true screen edge (progress 1), fading in
// and out via the sine envelope so the loop has no visible seam, instead of
// snapping back to the start mid-brightness.
const LEGACY_BLEED_GLOW_PERIOD_MS = 1900;
const LEGACY_BLEED_GLOW_BAND_HALF_WIDTH = 0.24;
const LEGACY_BLEED_GLOW_MAX_ALPHA = 0.5;
const LEGACY_BLEED_GLOW_STEPS = 8;
const LEGACY_PLAY_HUD_TIMER_PANE = cyberArcadeMaterial.substrate.panel;
const LEGACY_PLAY_TOUCH_BUTTON_FILL = cyberArcadeMaterial.substrate.panelRaised;
const LEGACY_PLAY_TOUCH_COG_HUB = cyberArcadeMaterial.substrate.field;
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
// Momentum/flick scrolling tuning. Below MIN_PX_PER_MS a release just stops
// (a slow, deliberate drag shouldn't keep gliding); FRICTION_PER_MS decays
// the coast velocity multiplicatively every millisecond -- ~0.994 lands
// a typical flick's glide in the same few-hundred-ms range native scroll
// views use, not an abrupt stop or an endless drift. STOP_PX_PER_MS ends
// the coast once it's too slow to produce a visible per-frame move.
const LEGACY_OVERLAY_SCROLL_MOMENTUM_MIN_PX_PER_MS = 0.12;
const LEGACY_OVERLAY_SCROLL_MOMENTUM_FRICTION_PER_MS = 0.994;
const LEGACY_OVERLAY_SCROLL_MOMENTUM_STOP_PX_PER_MS = 0.02;
const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS = LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS;
const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_WINDOW = 3.6;
const LEGACY_PLAY_TRAIL_PULSE_FRAME_INTERVAL_MS = 33;
const LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT = 2;
const LEGACY_PLAY_STICK_RETARGET_STEP_MS = 32;
const LEGACY_PLAY_STICK_RETARGET_RESCHEDULE_GRACE_MS = 16;
const LEGACY_PLAY_STICK_INITIAL_DELAY_MAX_MS = 144;
const LEGACY_PLAY_STICK_REPEAT_INTERVAL_MAX_MS = 104;
const LEGACY_PLAY_STICK_TURN_DELAY_MAX_MS = 144;
// Bumped up from 116ms -- at that duration the eased glide between tiles
// only spans ~7 frames at 60fps, which read as a quick snap-slide rather
// than smooth motion. A slower tween still feels responsive for a maze
// but gives the eye enough frames to actually perceive the glide.
const LEGACY_PLAY_PLAYER_VISUAL_MOVE_MS = 190;
const LEGACY_MENU_PLAYER_VISUAL_MOVE_MS = 150;
const LEGACY_PLAYER_MARKER_RADIUS_RATIO = 0.34;
const LEGACY_PLAYER_MARKER_HALO_RATIO = 0.54;
const LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO = 0.46;
const LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO = 0.72;
// The player's on-screen shape is a square filling this fraction of the
// tile on each axis (both menu-demo and real play use the same fill, so
// the two surfaces read identically) -- independent of the diamond-era
// radius ratios above, which only remain as inputs to the halo/locator
// metrics and diagnostics below.
const LEGACY_PLAYER_MARKER_SQUARE_FILL_RATIO = 0.85;
// The menu's demo AI is always visibly gliding between tiles on a loop, so
// its squash-and-stretch-on-move animation alone is enough to read as
// alive. The real play-mode player sits still between moves far more often
// (deciding, looking around) -- this gives it its own continuous idle
// breathing pulse so it never flattens into a static icon.
const LEGACY_PLAY_PLAYER_IDLE_BREATHE_PERIOD_MS = 1500;
const LEGACY_PLAY_PLAYER_IDLE_BREATHE_AMOUNT = 0.07;
const LEGACY_PLAY_PLAYER_BEACON_COLOR = cyberArcadeMaterial.signal.player;
const LEGACY_PLAY_PLAYER_BEACON_ACCENT = cyberArcadeMaterial.signal.playerAccent;
const LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS = 1150;
const LEGACY_PLAY_START_MARKER_CORE = cyberArcadeMaterial.signal.start;
const LEGACY_PLAY_START_MARKER_EDGE = cyberArcadeMaterial.signal.startEdge;
const LEGACY_PLAY_GOAL_MARKER_CORE = cyberArcadeMaterial.signal.goal;
const LEGACY_PLAY_GOAL_MARKER_EDGE = cyberArcadeMaterial.signal.goalEdge;
const LEGACY_PLAY_SLOW_TILE_CORE = cyberArcadeMaterial.signal.warning;
const LEGACY_PLAY_SLOW_TILE_EDGE = cyberArcadeMaterial.signal.warningEdge;
const LEGACY_PLAY_SLOW_TILE_SPENT = cyberArcadeMaterial.rail.muted;
const LEGACY_PLAY_PATROL_CORE = cyberArcadeMaterial.signal.violet;
const LEGACY_PLAY_PATROL_EDGE = cyberArcadeMaterial.signal.memory;
const LEGACY_PLAY_PATROL_TELEGRAPH = cyberArcadeMaterial.rail.mint;
const LEGACY_PLAY_PATROL_COLLISION_FEEDBACK = cyberArcadeMaterial.signal.warning;
const LEGACY_PLAY_PATROL_COLLISION_RECOVERY = cyberArcadeMaterial.rail.mint;
const LEGACY_PLAY_PATROL_PENDING_INTENT = cyberArcadeMaterial.signal.memory;
const LEGACY_MENU_AI_MEMORY_OPTION_CORE = cyberArcadeMaterial.signal.memory;
const LEGACY_MENU_AI_MEMORY_OPTION_EDGE = cyberArcadeMaterial.rail.mint;
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
  // See create()'s boot-mode handling -- true only when the URL asked to
  // launch straight into play (e.g. the "Play Mazer" home-screen shortcut)
  // but boot deferred that until the real auth session resolves instead of
  // racing it. Consumed once in applyLegacyAuthSnapshot.
  private pendingBootPlayStart = false;
  // Full auth gate: nothing (menu or play) is reachable until the player is
  // signed in. authGateAwaitingResolution covers the real async gap before
  // the very first snapshot arrives (avoids a false "please sign in" flash
  // for a returning player who actually has a valid session -- the default
  // snapshot before that first resolution is 'guest', indistinguishable
  // from a genuinely signed-out player without this flag). authGateLocked
  // is the actual gate: true once resolved to signed-out AND the auth
  // backend is configured at all -- if it isn't configured (local dev
  // without real credentials, or a genuine backend outage), locking
  // everyone out entirely would be worse than falling back to guest
  // access, so that case is deliberately left ungated.
  private authGateAwaitingResolution = true;
  private authGateLocked = false;
  private authGateGraphics!: Phaser.GameObjects.Graphics;
  private authGateLoadingText!: Phaser.GameObjects.Text;
  private authGateLoadingBlocker: Phaser.GameObjects.Rectangle | null = null;
  // Same deferred-to-update() pattern as pendingBootPlayStart above, for
  // the same reason -- applyLegacyAuthSnapshot can run synchronously mid-
  // create() (the runtime auth fixture resolves immediately), before
  // objects declared later in create() exist yet. Set here only ever
  // assigns plain fields, never touches scene objects, so it's safe
  // regardless of timing; the actual overlay/UI mutation happens once in
  // update(), which is guaranteed to run only after create() has returned.
  private pendingAuthGateTransition = false;
  private authForm: LegacyAuthFormState = createEmptyLegacyAuthFormState('login');
  private activeAuthField: LegacyAuthFieldId | null = null;
  private authNativeInput: HTMLInputElement | null = null;
  private authNativeInputField: LegacyAuthFieldId | null = null;
  private authNativeInputHandler: ((event: Event) => void) | null = null;
  private authNativeKeyDownHandler: ((event: KeyboardEvent) => void) | null = null;
  private authPasswordVisible = false;
  private authAccountHydrationSequence = 0;
  private authSubmitting = false;
  private authUnsubscribe: (() => void) | null = null;
  private mazeSeed = DEFAULT_LEGACY_RUNTIME_SEED;
  private explicitRuntimeMazeSeed = false;
  private maze!: LegacyMazeSnapshot;
  // Cache keyed by object identity -- this.maze is replaced wholesale on
  // every regeneration (never mutated in place), so a reference check is
  // enough to know the cached set still matches. Recomputing this is an
  // O(perimeter) scan; drawLegacyPathBorderDock runs it once per tile per
  // redraw, so caching keeps that from becoming O(perimeter * cellCount).
  private bleedOffDockVisualEligibilityForMaze: LegacyMazeSnapshot | null = null;
  private bleedOffDockVisualEligibilityKeys: Set<string> = new Set();
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
  private playCompletedAtMs: number | null = null;
  private playCyclePath: LegacyPoint[] = [];
  private playCycleResetUsed = false;
  private playStaticSlowTile: LegacyStaticSlowTileState | null = null;
  private playRoomCandidateMetadata: LegacyRoomCandidateMetadata | null = null;
  private playPatrolAgent: LegacyPatrolAgentState | null = null;
  private menuDemoCycleStartedAtMs = 0;
  private menuDemoCompletedAtMs: number | null = null;
  private menuDemoCycleRecorded = false;
  private mazeCycleTelemetryHistory: MazeCycleTelemetryHistory = readMazeCycleTelemetryHistory(undefined);
  private progressionState: LegacyProgressionState = readLegacyProgressionState(undefined);
  private latestAuthMessage: LegacyPlayerMessage | null = null;
  private latestRemoteSyncResult: LegacyRemoteProgressionSyncResult | null = null;
  private remoteSettingsSyncQueue: Promise<void> = Promise.resolve();
  private remoteSettingsSyncTimer: ReturnType<typeof setTimeout> | null = null;
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
  private playTouchArrowPointerId: number | null = null;
  private playTouchStickPointerId: number | null = null;
  private playTouchStickPull: TouchStickPullVector | null = null;
  // Where the floating movement stick is centered, in canvas pixels -- null
  // means no touch is currently down, so nothing is drawn. Set on touch-down
  // to wherever the player's thumb actually landed (see
  // handleLegacyPlayTouchControl) instead of a fixed on-screen position, so
  // the board never has to reserve permanent space for a control widget.
  private playFloatingStickOrigin: { x: number; y: number } | null = null;
  private playPointerStart: LegacyPlayPointerStart | null = null;
  private titleGraphics!: Phaser.GameObjects.Graphics;
  private footerText!: Phaser.GameObjects.Text;
  private progressionBadgeText!: Phaser.GameObjects.Text;
  private progressionBadgeLabelText!: Phaser.GameObjects.Text;
  private progressionBadgeBounds: VisualRect | null = null;
  private progressionBadgeLabelBounds: VisualRect | null = null;
  private progressionBadgeTextBounds: VisualRect | null = null;
  private progressionBadgeTextFits = false;
  private menuAiProgressionBadgeText!: Phaser.GameObjects.Text;
  private menuAiProgressionBadgeLabelText!: Phaser.GameObjects.Text;
  private menuAiProgressionBadgeBounds: VisualRect | null = null;
  private menuAiProgressionBadgeLabelBounds: VisualRect | null = null;
  private menuAiProgressionBadgeTextBounds: VisualRect | null = null;
  private menuAiProgressionBadgeTextFits = false;
  private progressionBadgePulseStartedAtMs: number | null = null;
  private menuSettingsCogActive = false;
  private backdropGraphics!: Phaser.GameObjects.Graphics;
  private boardStaticGraphics!: Phaser.GameObjects.Graphics;
  private boardPathGraphics!: Phaser.GameObjects.Graphics;
  private boardDynamicGraphics!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private overlayScrollGraphics: Phaser.GameObjects.Graphics | null = null;
  private overlayGuideGraphics: Phaser.GameObjects.Graphics | null = null;
  private overlayGuideMask: Phaser.Display.Masks.GeometryMask | null = null;
  private overlayGuideMaskGraphics: Phaser.GameObjects.Graphics | null = null;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private uiTexts: Phaser.GameObjects.Text[] = [];
  private uiButtons: UiButton[] = [];
  private overlayBackChevronBounds: VisualRect | null = null;
  private overlayGuideBounds: VisualRect | null = null;
  private overlayGuideExpanded = false;
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
  private overlayScrollGestureLockPointerId: number | null = null;
  // Momentum/flick scrolling -- a drag-release used to stop the content
  // dead in place, unlike literally every native scroll view, which was
  // the actual substance of "the custom scroll behavior feels weird."
  // overlayScrollVelocityPxPerMs tracks a smoothed recent drag speed while
  // a finger is down; on release, if it's above a real-flick threshold, it
  // seeds a decaying coast (see hasLegacyOverlayScrollMomentumPendingFrame)
  // instead of a hard stop.
  private overlayScrollLastMoveY = 0;
  private overlayScrollLastMoveAtMs = 0;
  private overlayScrollVelocityPxPerMs = 0;
  private overlayScrollMomentumActive = false;
  private overlayMovementSpeedSliderBounds: VisualRect | null = null;
  private viewportGeometryListener: (() => void) | null = null;
  /** Cached OS accessibility preference; never read from the render loop. */
  private legacyReducedMotionEnabled = false;
  private legacyReducedMotionMediaQuery: MediaQueryList | null = null;
  private legacyReducedMotionMediaQueryListener: ((event: MediaQueryListEvent) => void) | null = null;
  private stars: LegacyMenuBackdropStar[] = [];
  private layout!: LegacyMenuLayout;
  private hudBounds: VisualRect | null = null;
  private hudTimerBounds: VisualRect | null = null;
  private hudTouchControlBounds: VisualRect | null = null;
  private hudFrame: LegacyPlayHudFrame | null = null;
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
  private playPatrolCollisionVisualActive = false;
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
  private legacyMenuTitleAnimationNextFrameAtMs = 0;
  // Orbit sigils ease into their frozen resting positions instead of
  // snapping the instant the maze finishes building/deconstructing -- see
  // drawLegacyMenuPathTitleOrbitSigils.
  private menuOrbitSettleStartedAtMs: number | null = null;
  private menuOrbitSettlePhaseStart = 0;
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
    // Set before initializeLegacyAuth() below, not after -- the runtime
    // diagnostics auth fixture resolves synchronously inside that call
    // (no real network/storage round trip), so applyLegacyAuthSnapshot can
    // run and check this flag before this function ever reaches the line
    // that used to set it, leaving it permanently unconsumed.
    this.pendingBootPlayStart = resolveInitialRuntimeMode(runtimeSearch) === 'play';
    this.loadPersistedLegacyAuthForm();
    this.loadPersistedLegacyGameToggleSettings();
    this.loadPersistedMazeCycleTelemetryHistory();
    this.loadPersistedLegacyProgressionState();
    this.installLegacyReducedMotionPreference();
    void this.initializeLegacyAuth();
    this.initializeRuntimeDiagnostics();
    this.backdropGraphics = this.add.graphics();
    this.boardStaticGraphics = this.add.graphics();
    this.boardPathGraphics = this.add.graphics();
    this.boardDynamicGraphics = this.add.graphics();
    this.titleGraphics = this.add.graphics();
    this.overlayGraphics = this.add.graphics();
    this.hudGraphics = this.add.graphics();
    this.authGateGraphics = this.add.graphics();
    this.authGateLoadingText = this.applyLegacyUiTextCrispness(this.add.text(0, 0, 'Signing you in…', {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: '15px',
      color: '#d7fff8'
    })).setOrigin(0.5).setVisible(false).setDepth(LEGACY_AUTH_GATE_LOADING_DEPTH);

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
    this.progressionBadgeLabelText = this.applyLegacyUiTextCrispness(this.add.text(0, 0, '', {
      fontFamily: LEGACY_UI_MONO_FONT_FAMILY,
      fontSize: '9px',
      fontStyle: 'bold',
      color: '#36ff7d',
      align: 'center'
    })).setOrigin(0.5).setAlpha(0.82).setVisible(false);
    this.menuAiProgressionBadgeText = this.applyLegacyUiTextCrispness(this.add.text(0, 0, '', {
      fontFamily: LEGACY_UI_MONO_FONT_FAMILY,
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#8ac6ff',
      align: 'center'
    })).setOrigin(0.5).setAlpha(0.96).setVisible(false);
    this.menuAiProgressionBadgeLabelText = this.applyLegacyUiTextCrispness(this.add.text(0, 0, '', {
      fontFamily: LEGACY_UI_MONO_FONT_FAMILY,
      fontSize: '9px',
      fontStyle: 'bold',
      color: '#8ac6ff',
      align: 'center'
    })).setOrigin(0.5).setAlpha(0.82).setVisible(false);

    this.createStars();
    // A direct-to-play boot (pendingBootPlayStart) no longer starts play
    // synchronously here -- see that field's own comment. If the runtime
    // diagnostics auth fixture resolved synchronously above,
    // applyLegacyAuthSnapshot has already called startPlayMode() and
    // this.mode is 'play' by this point; skip the menu placeholder
    // entirely in that case rather than clobbering it. Otherwise (a still-
    // pending real async auth check, or an ordinary menu boot), generate
    // the usual menu placeholder -- immediately, no demo-hold delay, when
    // a play start is still pending, since it's about to be replaced
    // anyway the moment auth resolves.
    if (this.mode !== 'play') {
      this.applyGenerationRequest(
        createLegacyGenerationRequest({
          aspectRatio: this.resolveLegacyBoardAspectRatioForMode('menu'),
          currentSeed: this.mazeSeed,
          dueAtMs: this.time.now,
          generationProfile: this.resolveLegacyMazeGenerationProfileForMode('menu'),
          mode: 'menu',
          queuedAtMs: this.time.now,
          reason: 'boot-menu',
          scale: this.resolveLegacyProgressionScaleForMode('menu'),
          targetComplexity: this.resolveLegacyTargetComplexityForMode('menu')
        }),
        this.pendingBootPlayStart ? this.time.now : this.time.now + INITIAL_MENU_DEMO_HOLD_MS
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
      if (this.remoteSettingsSyncTimer !== null) {
        clearTimeout(this.remoteSettingsSyncTimer);
        this.remoteSettingsSyncTimer = null;
      }
      this.authUnsubscribe?.();
      this.authUnsubscribe = null;
      this.destroyLegacyAuthNativeInput();
      this.detachRuntimeDiagnostics();
      this.detachLegacyPlayFocusGuards();
      this.detachLegacyPlayKeyboardFallback();
      this.detachLegacyPlayTouchControlFallback();
      this.detachLegacyQaDiagnosticsSurface();
      this.detachLegacyReducedMotionPreference();
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
      openSettingsOverlay: (): LegacyQaOverlayResult => this.handleLegacyQaOpenSettingsOverlay(),
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
    return this.handleLegacyQaOpenSettingsOverlay();
  }

  private handleLegacyQaOpenSettingsOverlay(): LegacyQaOverlayResult {
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
    if (this.pendingAuthGateTransition) {
      this.pendingAuthGateTransition = false;
      if (this.authGateLocked && this.overlay !== 'auth') {
        this.overlay = 'auth';
        this.uiDirty = true;
        this.rebuildUi();
      } else if (!this.authGateLocked && !this.authGateAwaitingResolution && this.overlay === 'auth') {
        // Signed in successfully (or the gate was never actually locking,
        // e.g. the auth backend isn't configured) -- if the auth overlay is
        // still open because the gate put it there, let it close now that
        // there's nothing left to gate on.
        this.overlay = 'none';
        this.uiDirty = true;
        this.rebuildUi();
      }
    }
    // pendingBootPlayStart intentionally stays pending (not cleared) until
    // the auth gate has actually resolved and isn't locked -- a direct-to-
    // play boot (e.g. the "Play Mazer" home-screen shortcut) while signed
    // out should land in play mode once signed in, not before.
    if (this.pendingBootPlayStart && !this.authGateAwaitingResolution && !this.authGateLocked) {
      this.pendingBootPlayStart = false;
      this.startPlayMode();
      this.rebuildUi();
    }
    this.syncLegacyAuthGateLoadingScreen(time);
    this.recordRuntimeFrame(delta);
    this.updateStars(time, delta);
    this.expireLegacyPlayerMessages(time);
    this.advanceLegacyOverlayScrollMomentum(delta);
    for (const button of this.uiButtons) {
      button.updateFrame?.(time);
    }

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

    // The demo walker used to freeze the instant any overlay (Settings,
    // Pause, Auth) opened on the main menu -- there's no gameplay to
    // protect there, it's just ambient background motion, so it now keeps
    // playing behind the overlay instead of visibly freezing/hitching each
    // time Settings is opened or a setting is changed.
    if (
      this.mode === 'menu'
      && this.pendingGenerationRequest === null
      && this.pendingResetRequest === null
    ) {
      this.updateMenuDemo(time);
    }

    this.advanceLegacyMenuStaticDrawStage(time);
    this.advanceLegacyPatrolTimer(time);
    this.flushLegacyPatrolCollisionIntent(time);
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
    // The play HUD isn't just static chrome -- the settings cog blinks and
    // the timer ticks every second, both driven directly off `time` inside
    // drawHud. Neither had its own "pending frame" trigger here, so once
    // nothing else re-armed hudDirty (i.e. the player stood still), both
    // visibly froze until the next unrelated redraw -- which is what
    // actually made the cog's blink look "glitchy while idle, then jumps
    // when the player moves": it wasn't glitching, it just wasn't being
    // redrawn at all in between.
    if (this.mode === 'play' && this.overlay === 'none' && !this.prefersLegacyReducedMotion()) {
      this.hudDirty = true;
    }
    if (this.hasLegacyPlayTrailPulsePendingFrame(time)) {
      this.boardDynamicDirty = true;
    }
    if (this.hasLegacyBleedOffGlowPendingFrame()) {
      this.boardDynamicDirty = true;
    }
    if (this.hasLegacyPlayerVisualMotionPendingFrame(time)) {
      this.boardDynamicDirty = true;
      if (this.mode === 'play') {
        this.hudDirty = true;
      }
    }
    if (this.hasLegacyProgressionBadgePulsePendingFrame(time)) {
      this.boardDynamicDirty = true;
    }
    // The LVL number's new ambient blink (drawLegacyProgressionGlyph) is
    // purely time-driven, same as the settings cog's blink -- without this
    // it would freeze between whatever else happens to re-arm
    // boardDynamicDirty, the exact "glitchy while idle" bug the cog itself
    // had before its own always-armed fix.
    if (this.mode === 'play' && this.overlay === 'none' && !this.prefersLegacyReducedMotion()) {
      this.boardDynamicDirty = true;
    }
    const slowTilePhase = resolveLegacyStaticSlowTilePhase(
      this.playStaticSlowTile,
      time,
      this.playStartedAtMs
    );
    if (
      this.mode === 'play'
      && slowTilePhase.mode === 'timed'
      && this.playStaticSlowTile?.consumed === false
    ) {
      this.boardDynamicDirty = true;
    }
    const patrolTelegraph = resolveLegacyPatrolAgentTelegraph(
      this.playPatrolAgent,
      time,
      this.playStartedAtMs,
      this.resolveLegacyWorldTurnHostState() === 'running'
    );
    if (this.mode === 'play' && patrolTelegraph.active) {
      this.boardDynamicDirty = true;
    }
    const patrolCollisionFeedback = resolveLegacyPatrolAgentCollisionFeedback(
      this.playPatrolAgent,
      time
    );
    const patrolCollisionRecovery = resolveLegacyPatrolAgentCollisionRecovery(
      this.playPatrolAgent,
      time
    );
    this.refreshLegacyPatrolCollisionVisualState(
      patrolCollisionFeedback.active || patrolCollisionRecovery.active
    );
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
    const movingBackdropActorCount = this.settings.toggleAnimatedBackdrop && !this.prefersLegacyReducedMotion()
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
      rowCount: drawStageStaged ? this.maze.height : null,
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
      this.layout.boardWidth,
      this.layout.boardHeight
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
    const slowTilePhase = resolveLegacyStaticSlowTilePhase(
      this.playStaticSlowTile,
      time,
      this.playStartedAtMs
    );
    const patrolPoint = resolveLegacyPatrolAgentPoint(this.playPatrolAgent);
    this.legacyWorldTurnHost.setState(this.resolveLegacyWorldTurnHostState());
    const worldTurnDiagnostics = this.legacyWorldTurnHost.getDiagnostics();
    const patrolTelegraph = resolveLegacyPatrolAgentTelegraph(
      this.playPatrolAgent,
      time,
      this.playStartedAtMs,
      worldTurnDiagnostics.state === 'running'
    );
    const patrolCollisionFeedback = resolveLegacyPatrolAgentCollisionFeedback(
      this.playPatrolAgent,
      time
    );
    const patrolCollisionRecovery = resolveLegacyPatrolAgentCollisionRecovery(
      this.playPatrolAgent,
      time
    );

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
        controlMode: {
          mode: this.settings.controlMode,
          switchIsOn: resolveLegacyOverlayToggleSwitchIsOn('controlMode', this.settings),
          stateText: resolveLegacyOverlayToggleStateText('controlMode', this.settings.controlMode === 'stick') ?? 'Arrows'
        },
        darkMode: {
          enabled: this.settings.darkMode
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
          size: Math.max(this.layout.boardWidth, this.layout.boardHeight),
          tileSize: this.layout.tileSize,
          renderBounds: {
            bottom: mazeRenderFrame.boardTop + mazeRenderFrame.boardHeight,
            left: mazeRenderFrame.boardLeft,
            right: mazeRenderFrame.boardLeft + mazeRenderFrame.boardWidth,
            top: mazeRenderFrame.boardTop
          },
          renderSafeInset: mazeRenderFrame.safeInset,
          renderSize: Math.max(mazeRenderFrame.boardWidth, mazeRenderFrame.boardHeight),
          renderTileSize: mazeRenderFrame.tileSize
        },
        lifecycle: playLifecycle,
        roomCandidate: this.playRoomCandidateMetadata
          ? {
              band: this.playRoomCandidateMetadata.band,
              candidate: {
                footprintHeight: this.playRoomCandidateMetadata.candidate.footprintHeight,
                footprintWidth: this.playRoomCandidateMetadata.candidate.footprintWidth,
                solutionPathIndex: this.playRoomCandidateMetadata.candidate.solutionPathIndex,
                topLeft: { ...this.playRoomCandidateMetadata.candidate.topLeft }
              },
              candidateCount: this.playRoomCandidateMetadata.candidateCount,
              contractVersion: this.playRoomCandidateMetadata.contractVersion,
              evaluatedCandidateCount: this.playRoomCandidateMetadata.evaluatedCandidateCount,
              perimeterOpeningCount: this.playRoomCandidateMetadata.perimeterOpeningCount,
              perimeterOpenings: this.playRoomCandidateMetadata.perimeterOpenings.map((opening) => ({
                inside: { ...opening.inside },
                kind: opening.kind,
                outside: { ...opening.outside },
                side: opening.side
              })),
              routeInteriorTileCount: this.playRoomCandidateMetadata.routeInteriorTileCount,
              routeOpeningCount: this.playRoomCandidateMetadata.routeOpeningCount,
              routeOpeningEdges: this.playRoomCandidateMetadata.routeOpeningEdges.map((edge) => ({
                inside: { ...edge.inside },
                kind: edge.kind,
                outside: { ...edge.outside },
                side: edge.side
              })),
              routeThresholds: this.playRoomCandidateMetadata.routeThresholds.map((threshold) => ({
                from: { ...threshold.from },
                fromSolutionPathIndex: threshold.fromSolutionPathIndex,
                kind: threshold.kind,
                to: { ...threshold.to },
                toSolutionPathIndex: threshold.toSolutionPathIndex
              })),
              roomsEnabled: this.playRoomCandidateMetadata.roomsEnabled,
              sideClosureCount: this.playRoomCandidateMetadata.sideClosureCount,
              sideClosureEdges: this.playRoomCandidateMetadata.sideClosureEdges.map((edge) => ({
                inside: { ...edge.inside },
                kind: edge.kind,
                outside: { ...edge.outside },
                side: edge.side
              })),
              source: this.playRoomCandidateMetadata.source
            }
          : null,
        patrol: this.playPatrolAgent && patrolPoint
          ? {
              alternateRouteStepCount: this.playPatrolAgent.placement.alternateRouteStepCount,
              blockedMoveCount: this.playPatrolAgent.blockedMoveCount,
              collisionCount: this.playPatrolAgent.collisionCount,
              collisionDelayActive: isLegacyPatrolAgentDelayActive(this.playPatrolAgent, time),
              collisionDelayMs: LEGACY_PATROL_AGENT_COLLISION_DELAY_MS,
              collisionDelayUntilMs: this.playPatrolAgent.collisionDelayUntilMs,
              collisionEpisodeActive: this.playPatrolAgent.collisionEpisodeActive,
              collisionFeedbackActive: patrolCollisionFeedback.active,
              collisionFeedbackElapsedMs: patrolCollisionFeedback.elapsedMs,
              collisionFeedbackWindowMs: LEGACY_PATROL_AGENT_COLLISION_FEEDBACK_WINDOW_MS,
              collisionRecoveryActive: patrolCollisionRecovery.active,
              collisionRecoveryElapsedMs: patrolCollisionRecovery.elapsedMs,
              collisionRecoveryRemainingMs: patrolCollisionRecovery.remainingMs,
              collisionRecoveryWindowMs: LEGACY_PATROL_AGENT_COLLISION_RECOVERY_WINDOW_MS,
              contractVersion: this.playPatrolAgent.contractVersion,
              currentRouteIndex: this.playPatrolAgent.currentRouteIndex,
              elapsedInStepMs: patrolTelegraph.elapsedInStepMs ?? 0,
              lastResolvedTickIndex: this.playPatrolAgent.lastResolvedTickIndex,
              lastStepAtMs: this.playPatrolAgent.lastStepAtMs,
              maximumAgents: 1,
              maximumPendingCollisionIntents: LEGACY_PATROL_AGENT_MAXIMUM_PENDING_COLLISION_INTENTS,
              msUntilStep: patrolTelegraph.msUntilStep ?? LEGACY_PATROL_AGENT_STEP_MS,
              nextPoint: {
                screenX: mazeRenderFrame.boardLeft + (((patrolTelegraph.nextPoint?.x ?? patrolPoint.x) + 0.5) * mazeRenderFrame.tileSize),
                screenY: mazeRenderFrame.boardTop + (((patrolTelegraph.nextPoint?.y ?? patrolPoint.y) + 0.5) * mazeRenderFrame.tileSize),
                x: patrolTelegraph.nextPoint?.x ?? patrolPoint.x,
                y: patrolTelegraph.nextPoint?.y ?? patrolPoint.y
              },
              nextRouteIndex: patrolTelegraph.nextRouteIndex ?? this.playPatrolAgent.currentRouteIndex,
              pendingCollisionIntent: this.playPatrolAgent.pendingCollisionIntent
                ? { ...this.playPatrolAgent.pendingCollisionIntent }
                : null,
              pendingCollisionIntentCount: this.playPatrolAgent.pendingCollisionIntent === null ? 0 : 1,
              penaltyCount: this.playPatrolAgent.penaltyCount,
              remainingMs: resolveLegacyPatrolAgentRemainingMs(this.playPatrolAgent, time),
              roundTripMs: LEGACY_PATROL_AGENT_ROUND_TRIP_MS,
              route: this.playPatrolAgent.placement.route.map((point) => ({ ...point })),
              screenPoint: {
                screenX: mazeRenderFrame.boardLeft + ((patrolPoint.x + 0.5) * mazeRenderFrame.tileSize),
                screenY: mazeRenderFrame.boardTop + ((patrolPoint.y + 0.5) * mazeRenderFrame.tileSize),
                x: patrolPoint.x,
                y: patrolPoint.y
              },
              solutionPathIndices: [...this.playPatrolAgent.placement.solutionPathIndices],
              stepCount: this.playPatrolAgent.stepCount,
              stepMs: LEGACY_PATROL_AGENT_STEP_MS,
              telegraphActive: patrolTelegraph.active,
              telegraphWindowMs: LEGACY_PATROL_AGENT_TELEGRAPH_WINDOW_MS
            }
          : null,
        pressure: this.playStaticSlowTile
          ? {
              activeWindowMs: slowTilePhase.activeWindowMs,
              alternateRouteStepCount: this.playStaticSlowTile.placement?.alternateRouteStepCount ?? null,
              armed: slowTilePhase.armed,
              band: this.playStaticSlowTile.band,
              blockedMoveCount: this.playStaticSlowTile.blockedMoveCount,
              consumed: this.playStaticSlowTile.consumed,
              contractVersion: this.playStaticSlowTile.contractVersion,
              cycleElapsedMs: slowTilePhase.cycleElapsedMs,
              cycleMs: slowTilePhase.cycleMs,
              delayActive: isLegacyStaticSlowTileDelayActive(this.playStaticSlowTile, time),
              delayUntilMs: this.playStaticSlowTile.delayUntilMs,
              eligible: this.playStaticSlowTile.eligible,
              enteredAtMs: this.playStaticSlowTile.enteredAtMs,
              entryCount: this.playStaticSlowTile.entryCount,
              penaltyMs: this.playStaticSlowTile.penaltyMs,
              phaseActive: slowTilePhase.active,
              remainingMs: resolveLegacyStaticSlowTileRemainingMs(this.playStaticSlowTile, time),
              safeWindowMs: slowTilePhase.safeWindowMs,
              solutionPathIndex: this.playStaticSlowTile.placement?.solutionPathIndex ?? null,
              tile: this.playStaticSlowTile.placement
                ? {
                    screenX: mazeRenderFrame.boardLeft
                      + ((this.playStaticSlowTile.placement.point.x + 0.5) * mazeRenderFrame.tileSize),
                    screenY: mazeRenderFrame.boardTop
                      + ((this.playStaticSlowTile.placement.point.y + 0.5) * mazeRenderFrame.tileSize),
                    x: this.playStaticSlowTile.placement.point.x,
                    y: this.playStaticSlowTile.placement.point.y
                  }
                : null,
              timingMode: slowTilePhase.mode
            }
          : null,
        timer: {
          completedAtMs: this.playCompletedAtMs,
          elapsedMs: this.resolveLegacyPlayElapsedMs(),
          frozen: this.playCompletedAtMs !== null,
          startedAtMs: this.playStartedAtMs
        },
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
            arrowPointerActive: this.playTouchArrowPointerId !== null,
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
            stickPointerActive: this.playTouchStickPointerId !== null,
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
          mazeWidth: this.maze.width,
          mazeHeight: this.maze.height,
          walkableRows: this.maze.grid.map((row) => row.map((walkable) => (walkable ? '1' : '0')).join(''))
        },
        markerStyle: {
          goalCoreColor: LEGACY_PLAY_GOAL_MARKER_CORE,
          goalEdgeColor: LEGACY_PLAY_GOAL_MARKER_EDGE,
          playerCoreColor: resolveLegacyIridescentPlayerCoreColor(time),
          playerCoreRadius: playerMarkerMetrics.coreRadius,
          playerBeaconAccentColor: LEGACY_PLAY_PLAYER_BEACON_ACCENT,
          playerBeaconColor: LEGACY_PLAY_PLAYER_BEACON_COLOR,
          playerBeaconPeriodMs: LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS,
          playerHaloColor: progressionPalette.playerHaloColor,
          playerHaloRadius: playerMarkerMetrics.haloRadius,
          startCoreColor: LEGACY_PLAY_START_MARKER_CORE,
          startEdgeColor: LEGACY_PLAY_START_MARKER_EDGE,
          trailPulseEnabled: this.isLegacyTrailShineVisible(),
          trailPulseColor: progressionPalette.trailPulseColor,
          trailPulseEdgeColor: progressionPalette.trailPulseEdgeColor,
          trailShineEnabled: this.isLegacyTrailShineVisible(),
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
          size: Math.max(this.maze.width, this.maze.height),
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
      // Checked before anything else in this pipeline, generously padded --
      // the overlay back chevron sits in the same corner as play mode's
      // always-present fixed pause-cog touch region (handleLegacyPlayTouchControl
      // checks for that regardless of which overlay is open), and a tap
      // there was landing on whichever of the two logic paths happened to
      // run first instead of reliably resolving to the button itself.
      if (this.isPointerOnOverlayBackChevron(pointer)) {
        return;
      }
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
      this.overlayScrollGestureLockPointerId = null;
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
      this.applyOverlayToggleFieldChange('toggleTrailFade');
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
    return resolveTouchClientPoint({
      canvas: rect,
      clientX,
      clientY,
      logicalHeight: this.layout.height,
      logicalWidth: this.layout.width
    });
  }

  private resolveLegacyInputPointerPoint(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    const event = pointer.event;
    if ('changedTouches' in event) {
      const touch = event.changedTouches.item(0) ?? event.touches.item(0);
      if (touch !== null) {
        return this.resolveLegacyPlayTouchClientPoint(touch.clientX, touch.clientY);
      }
    }
    if ('clientX' in event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      return this.resolveLegacyPlayTouchClientPoint(event.clientX, event.clientY);
    }
    return { x: pointer.x, y: pointer.y };
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
    this.overlayMovementSpeedSliderBounds = null;
    this.overlayScrollGestureLockPointerId = null;
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
    if (
      this.overlay === 'none'
      || this.overlayScrollMax <= 0
      || this.overlayScrollGestureLockPointerId !== null
    ) {
      return false;
    }
    const point = this.resolveLegacyInputPointerPoint(pointer);
    if (!this.isPointInVisualRect(this.overlayScrollViewportBounds, point.x, point.y, 12)) {
      return false;
    }

    const wheelStep = Math.max(LEGACY_OVERLAY_SCROLL_WHEEL_STEP, Math.abs(deltaY) * 0.35);
    return this.setLegacyOverlayScrollOffset(this.overlayScrollOffset + (Math.sign(deltaY) * wheelStep));
  }

  // Checked first, ahead of every other pointerdown handler -- a tap here
  // should always resolve to the back button itself (Phaser's own
  // object-level pointerdown on the chevron's background still fires the
  // real onClick independently; this just guarantees nothing else in the
  // custom scroll/touch-control pipeline below gets a chance to also treat
  // the same tap as a scroll-drag start or a fixed pause-cog press).
  private isPointerOnOverlayBackChevron(pointer: Phaser.Input.Pointer): boolean {
    if (this.overlay === 'none' || this.overlayBackChevronBounds === null) {
      return false;
    }
    const point = this.resolveLegacyInputPointerPoint(pointer);
    return this.isPointInVisualRect(
      this.overlayBackChevronBounds,
      point.x,
      point.y,
      LEGACY_OVERLAY_BACK_CHEVRON_PRIORITY_PADDING
    );
  }

  private handleOverlayScrollPointerDown(pointer: Phaser.Input.Pointer): boolean {
    if (this.overlay === 'none' || this.overlayScrollMax <= 0) {
      return false;
    }
    const pointerId = this.normalizeLegacyPlayTouchPointerId(pointer.id) ?? -1;
    const point = this.resolveLegacyInputPointerPoint(pointer);
    if (this.isPointInVisualRect(this.overlayMovementSpeedSliderBounds, point.x, point.y, 2)) {
      this.releaseOverlayScrollPointer();
      this.overlayScrollGestureLockPointerId = pointerId;
      return false;
    }
    // A back-chevron tap never reaches here at all now -- isPointerOnOverlayBackChevron
    // (checked first in installInput's pointerdown handler, with generous
    // padding) claims it before the scroll rail's own hit test gets a look.
    const onViewport = this.isPointInVisualRect(this.overlayScrollViewportBounds, point.x, point.y, 0);
    const onRail = this.isPointInVisualRect(this.overlayScrollTrackBounds, point.x, point.y, 20);
    if (!onViewport && !onRail) {
      return false;
    }

    // A fresh touch-down always takes over immediately, same as flicking a
    // native scroll view mid-glide and catching it with a finger.
    this.overlayScrollMomentumActive = false;
    this.overlayScrollVelocityPxPerMs = 0;
    this.overlayScrollPointerId = pointerId;
    this.overlayScrollPointerStartY = point.y;
    this.overlayScrollPointerStartOffset = this.overlayScrollOffset;
    this.overlayScrollPointerHasMoved = false;
    this.overlayScrollLastMoveY = point.y;
    this.overlayScrollLastMoveAtMs = this.time.now;
    return true;
  }

  private handleOverlayScrollPointerMove(pointer: Phaser.Input.Pointer): boolean {
    const pointerId = this.normalizeLegacyPlayTouchPointerId(pointer.id) ?? -1;
    if (this.overlayScrollGestureLockPointerId === pointerId) {
      return false;
    }
    if (this.overlayScrollPointerId === null || this.overlayScrollPointerId !== pointerId) {
      return false;
    }

    const point = this.resolveLegacyInputPointerPoint(pointer);
    const deltaY = point.y - this.overlayScrollPointerStartY;
    if (!this.overlayScrollPointerHasMoved && Math.abs(deltaY) < LEGACY_OVERLAY_SCROLL_DRAG_START_PX) {
      return true;
    }

    this.overlayScrollPointerHasMoved = true;
    this.setLegacyOverlayScrollOffset(this.overlayScrollPointerStartOffset - deltaY);
    // Smoothed recent drag speed, in offset-px/ms (note the sign flip --
    // dragging the pointer up increases the offset, see the line above) --
    // this is what a release either seeds a momentum coast from or discards
    // as too slow to have been a real flick.
    const time = this.time.now;
    const dt = time - this.overlayScrollLastMoveAtMs;
    if (dt > 0) {
      const instantVelocity = -(point.y - this.overlayScrollLastMoveY) / dt;
      this.overlayScrollVelocityPxPerMs = (this.overlayScrollVelocityPxPerMs * 0.7) + (instantVelocity * 0.3);
    }
    this.overlayScrollLastMoveY = point.y;
    this.overlayScrollLastMoveAtMs = time;
    return true;
  }

  private handleOverlayScrollPointerUp(pointer: Phaser.Input.Pointer): boolean {
    const pointerId = this.normalizeLegacyPlayTouchPointerId(pointer.id) ?? -1;
    if (this.overlayScrollGestureLockPointerId === pointerId) {
      this.overlayScrollGestureLockPointerId = null;
      return false;
    }
    if (this.overlayScrollPointerId === null || this.overlayScrollPointerId !== pointerId) {
      return false;
    }

    this.overlayScrollMomentumActive = this.overlayScrollPointerHasMoved
      && Math.abs(this.overlayScrollVelocityPxPerMs) >= LEGACY_OVERLAY_SCROLL_MOMENTUM_MIN_PX_PER_MS;
    if (!this.overlayScrollMomentumActive) {
      this.overlayScrollVelocityPxPerMs = 0;
    }
    this.releaseOverlayScrollPointer();
    return true;
  }

  // Ongoing decaying coast after a fast drag release -- see the momentum
  // fields/constants near overlayScrollPointerHasMoved for why this exists.
  // Called unconditionally every frame (not gated behind another dirty
  // check) so it can keep running after the frame that stops being dirty.
  private advanceLegacyOverlayScrollMomentum(delta: number): void {
    if (!this.overlayScrollMomentumActive) {
      return;
    }
    if (this.overlay === 'none' || this.overlayScrollMax <= 0 || this.overlayScrollPointerId !== null) {
      this.overlayScrollMomentumActive = false;
      this.overlayScrollVelocityPxPerMs = 0;
      return;
    }

    const decay = Math.pow(LEGACY_OVERLAY_SCROLL_MOMENTUM_FRICTION_PER_MS, delta);
    this.overlayScrollVelocityPxPerMs *= decay;
    const requestedOffset = this.overlayScrollOffset + (this.overlayScrollVelocityPxPerMs * delta);
    const clampedOffset = clampLegacyOverlayScrollOffset(requestedOffset, this.overlayScrollMax);
    const hitBound = clampedOffset !== requestedOffset;
    this.setLegacyOverlayScrollOffset(clampedOffset);
    if (hitBound || Math.abs(this.overlayScrollVelocityPxPerMs) < LEGACY_OVERLAY_SCROLL_MOMENTUM_STOP_PX_PER_MS) {
      this.overlayScrollMomentumActive = false;
      this.overlayScrollVelocityPxPerMs = 0;
    }
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
    const point = this.resolveLegacyInputPointerPoint(pointer);
    if (this.handleLegacyPlayTouchControl(point.x, point.y, pointer.id)) {
      this.playPointerStart = null;
      return true;
    }

    this.playPointerStart = null;
    return false;
  }

  private handleLegacyPlayPointerMove(pointer: Phaser.Input.Pointer): boolean {
    const point = this.resolveLegacyInputPointerPoint(pointer);
    return this.handleLegacyPlayTouchControlMove(point.x, point.y, pointer.id);
  }

  private clearLegacyPlayFloatingStick(): void {
    this.playTouchStickPointerId = null;
    this.playTouchStickPull = null;
    this.playFloatingStickOrigin = null;
  }

  // A fixed-size ring centered wherever the touch actually landed, instead
  // of a fixed screen position -- resolveStickPullVector only cares about
  // outer.centerX/centerY and the radii below, so this plugs straight into
  // the exact same pull-vector math the old fixed stick used.
  private resolveLegacyPlayFloatingStickGeometry(
    origin: { x: number; y: number }
  ): NonNullable<ReturnType<typeof resolveTouchControlLayout>['stick']> {
    // Shrunk from 0.34/128-220 -- per feedback the stick read as too big and
    // visually obstructive sitting over the maze.
    const minDim = Math.max(1, Math.min(this.layout.width, this.layout.height));
    const outerSize = clamp(Math.round(minDim * 0.24), 92, 160);
    const innerSize = clamp(Math.round(outerSize * 0.34), 34, 54);
    const knobRadius = clamp(Math.round(outerSize * 0.075), 10, 16);
    const deadzoneRadius = Math.max(12, Math.round(outerSize * 0.12));
    const travelRadius = Math.round(Math.max(
      outerSize * 0.3,
      (outerSize / 2) - knobRadius - Math.max(5, Math.round(outerSize * 0.04))
    ));
    const toRect = (size: number): NonNullable<ReturnType<typeof resolveTouchControlLayout>['stick']>['outer'] => ({
      left: origin.x - (size / 2),
      top: origin.y - (size / 2),
      width: size,
      height: size,
      right: origin.x + (size / 2),
      bottom: origin.y + (size / 2),
      centerX: origin.x,
      centerY: origin.y
    });

    return {
      deadzoneRadius,
      inner: toRect(innerSize),
      knobRadius,
      outer: toRect(outerSize),
      travelRadius
    };
  }

  private handleLegacyPlayTouchControl(x: number, y: number, pointerId: number | null = null): boolean {
    if (this.mode !== 'play' || hasPendingLegacyResetRequest(this.pendingResetRequest)) {
      return false;
    }

    const touchControlLayout = this.resolveLegacyPlayTouchControlLayout();
    const control = resolveTouchControlKindAtPoint(touchControlLayout, x, y);

    if (control === 'pause') {
      if (this.overlay === 'pause') {
        this.closeOverlay();
      } else if (this.overlay === 'none') {
        this.openOverlay('pause');
      } else {
        return false;
      }
      return true;
    }

    if (this.overlay !== 'none') {
      return false;
    }

    // Every other touch starts a floating stick centered wherever the
    // player's thumb actually landed, instead of requiring them to find a
    // fixed on-screen widget -- see playFloatingStickOrigin.
    const normalizedPointerId = this.normalizeLegacyPlayTouchPointerId(pointerId);
    this.resetLegacyPlayDirectionalInputBuffer();
    this.playTouchArrowPointerId = null;
    this.playTouchStickPointerId = normalizedPointerId;
    this.playFloatingStickOrigin = { x, y };
    this.playHeldTouchMoves = [];
    this.clearLegacyPlayHeldTouchRepeat();
    this.playTouchStickPull = null;
    this.boardDynamicDirty = true;
    this.hudDirty = true;
    return true;
  }

  private handleLegacyPlayTouchControlMove(x: number, y: number, pointerId: number | null = null): boolean {
    if (this.mode !== 'play' || this.overlay !== 'none' || hasPendingLegacyResetRequest(this.pendingResetRequest)) {
      return false;
    }

    const normalizedPointerId = this.normalizeLegacyPlayTouchPointerId(pointerId);
    if (this.playTouchStickPointerId !== normalizedPointerId || this.playFloatingStickOrigin === null) {
      return false;
    }

    const stick = this.resolveLegacyPlayFloatingStickGeometry(this.playFloatingStickOrigin);
    const pullVector = resolveStickPullVector(stick, x, y, {
      allowBeyondOuter: true
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
      this.requestLegacyPlayDirectionalIntent(uniqueControls);
      if (
        this.playHeldTouchRepeatTimer === null
        && (this.playTouchArrowPointerId === normalizedPointerId || this.playTouchStickPointerId === normalizedPointerId)
      ) {
        this.scheduleLegacyPlayHeldTouchRepeat(LEGACY_PLAY_STICK_RETARGET_STEP_MS);
      }
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
    const releasedArrow = this.playTouchArrowPointerId === normalizedPointerId;
    if (releasedArrow) {
      this.playTouchArrowPointerId = null;
      this.boardDynamicDirty = true;
      this.publishInteractionDiagnostics();
    }
    const releasedStick = this.playTouchStickPointerId === normalizedPointerId;
    if (releasedStick) {
      this.clearLegacyPlayFloatingStick();
      this.boardDynamicDirty = true;
      this.hudDirty = true;
      this.publishInteractionDiagnostics();
    }
    const releasedMove = this.releaseLegacyPlayHeldTouchMove(pointerId);

    return releasedMove || releasedArrow || releasedStick;
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
    const pressureDelayMs = resolveLegacyStaticSlowTileRemainingMs(this.playStaticSlowTile, this.time.now);
    const patrolDelayMs = resolveLegacyPatrolAgentRemainingMs(this.playPatrolAgent, this.time.now);
    let movementDelayMs: number;
    switch (kind) {
      case 'initial':
        movementDelayMs = stickActive
          ? Math.min(profile.initialDelayMs, LEGACY_PLAY_STICK_INITIAL_DELAY_MAX_MS)
          : profile.initialDelayMs;
        break;
      case 'repeat':
        movementDelayMs = stickActive
          ? Math.min(profile.repeatIntervalMs, LEGACY_PLAY_STICK_REPEAT_INTERVAL_MAX_MS)
          : profile.repeatIntervalMs;
        break;
      case 'turn':
        movementDelayMs = stickActive
          ? Math.min(profile.turnDelayMs, LEGACY_PLAY_STICK_TURN_DELAY_MAX_MS)
          : profile.turnDelayMs;
        break;
      default:
        return kind satisfies never;
    }

    return Math.max(movementDelayMs, pressureDelayMs, patrolDelayMs);
  }

  private repeatLegacyPlayHeldTouchMove(): void {
    if (
      this.playHeldTouchMoves.length === 0
      || this.mode !== 'play'
      || this.overlay !== 'none'
      || hasPendingLegacyResetRequest(this.pendingResetRequest)
    ) {
      this.playHeldTouchMoves = [];
      this.playTouchArrowPointerId = null;
      this.clearLegacyPlayFloatingStick();
      this.clearLegacyPlayHeldTouchRepeat();
      this.hudDirty = true;
      this.publishInteractionDiagnostics();
      return;
    }

    const moved = this.performLegacyPlayHeldTouchMove();
    if (!moved) {
      if (this.playTouchArrowPointerId !== null || this.playTouchStickPointerId !== null) {
        this.scheduleLegacyPlayHeldTouchRepeat(this.resolveLegacyPlayHeldTouchDelay('repeat'));
        this.publishInteractionDiagnostics();
        return;
      }
      this.playHeldTouchMoves = [];
      this.playTouchArrowPointerId = null;
      this.clearLegacyPlayFloatingStick();
      this.clearLegacyPlayHeldTouchRepeat();
      this.hudDirty = true;
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

  // The player-move visual glide has to stay under the actual per-step
  // cadence or a new grid step lands mid-tween and rendering snaps/overlaps
  // instead of gliding. The fixed 190ms LEGACY_PLAY_PLAYER_VISUAL_MOVE_MS
  // only ever fit the slow end of the Move Speed range -- at the fast end
  // the repeat interval can be as low as ~78ms (or 104ms capped on the
  // stick), well under the tween's own runtime. Scaling the glide with the
  // live repeatIntervalMs (same pattern the menu-demo AI's visual motion
  // already uses) keeps it honest at every speed instead of only the one it
  // happened to be tuned for.
  private resolveLegacyPlayerVisualMoveDurationMs(): number {
    const repeatIntervalMs = this.resolveLegacyPlayMovementSpeedProfile().repeatIntervalMs;
    return clamp(Math.round(repeatIntervalMs * 0.85), 90, LEGACY_PLAY_PLAYER_VISUAL_MOVE_MS);
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

  private performLegacyPlayHeldTouchMove(): boolean {
    const candidates = resolveHumanMovementPriorityCandidates(
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
    if (this.playTouchStickPointerId !== null && this.playTouchStickPull !== null) {
      this.playDirectionalIntent.requestAnalog(
        this.playTouchStickPull.normalizedX,
        this.playTouchStickPull.normalizedY
      );
      return;
    }
    this.playDirectionalIntent.request(this.resolveLegacyPlayCardinalDirections(controls));
  }

  private synchronizeLegacyPlayDirectionalIntent(): void {
    if (this.playTouchStickPointerId !== null && this.playTouchStickPull !== null) {
      this.playDirectionalIntent.requestAnalog(
        this.playTouchStickPull.normalizedX,
        this.playTouchStickPull.normalizedY
      );
      return;
    }
    this.playDirectionalIntent.synchronize(
      this.resolveLegacyPlayCardinalDirections(this.resolveLegacyPlayActiveTouchControls())
    );
  }

  private performLegacyPlayDirectionalIntentStep(): boolean {
    const latestRequestedDirection = this.playDirectionalIntent.getDiagnostics().requestedDirections[0] ?? null;
    const step = this.playDirectionalIntent.step(this.maze, this.player, {
      assistedLaneShiftEnabled: true
    });
    if (
      step.moved
      && isLegacyPatrolAgentDelayActive(this.playPatrolAgent, this.time.now)
      && latestRequestedDirection !== null
      && step.direction !== latestRequestedDirection
    ) {
      this.playDirectionalIntent.reset();
      this.playPatrolAgent = clearLegacyPatrolAgentCollisionIntent(this.playPatrolAgent);
      this.publishInteractionDiagnostics();
      return false;
    }
    if (!step.moved) {
      this.playPatrolAgent = clearLegacyPatrolAgentCollisionIntent(this.playPatrolAgent);
      this.publishInteractionDiagnostics();
      return false;
    }
    return this.tryMovePlayer(step.deltaX, step.deltaY);
  }

  private resolveLegacyPlayTouchControlLayout(): ReturnType<typeof resolveTouchControlLayout> {
    const boardBounds = this.resolveLegacyPlayBoardBounds();
    const browserMobileParity = this.resolveLegacyBrowserMobileParity();
    // Was never threading the device safe-area insets through -- every other
    // play-mode lane (resolveLegacyMenuLayout's hud/controls lanes) gets
    // safeArea from readMazerViewportGeometry(), but this call site dropped
    // it, so resolveTouchControlLayout always saw zero insets and placed the
    // D-pad/stick/pause button as if the home indicator / notch didn't
    // exist.
    const safeArea = readMazerViewportGeometry().safeArea;

    return resolveTouchControlLayout({
      width: this.layout.width,
      height: this.layout.height
    }, {
      compact: true,
      controlMode: this.settings.controlMode,
      phonePortraitOverride: browserMobileParity,
      placement: this.layout.width >= 720 && this.layout.height >= 600
        ? 'bottom-centered'
        : undefined,
      safeInsets: safeArea,
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

    const point = this.resolveLegacyInputPointerPoint(pointer);
    const { deltaX, deltaY } = this.resolveLegacyPlayPointerMoveVector(pointerStart, point);
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
      this.layout.boardWidth,
      this.layout.boardHeight
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
      bottom: this.layout.boardTop + boardOffset.y + this.layout.boardHeight,
      left: this.layout.boardLeft + boardOffset.x,
      right: this.layout.boardLeft + boardOffset.x + this.layout.boardWidth,
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
    this.playTouchArrowPointerId = null;
    this.clearLegacyPlayFloatingStick();
    this.playMoveFlags = createLegacyPlayMoveFlags();
    this.playKeyboardRepeatGate.reset();
    this.playDirectionalIntent.reset();
    this.playPointerStart = null;
    this.playPatrolAgent = clearLegacyPatrolAgentCollisionIntent(this.playPatrolAgent);
  }

  private resetLegacyPlayDirectionalInputBuffer(): void {
    this.playMoveTimer?.remove(false);
    this.playMoveTimer = null;
    this.playMoveFlags = createLegacyPlayMoveFlags();
    this.playKeyboardRepeatGate.reset();
    this.playDirectionalIntent.reset();
    this.playPointerStart = null;
    this.playPatrolAgent = clearLegacyPatrolAgentCollisionIntent(this.playPatrolAgent);
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
    // The canvas itself is full-bleed (no safe-area reduction) so background
    // and board art reach the true device edges -- safeArea is instead
    // passed into resolveLegacyMenuLayout below, which insets just the
    // individual UI lanes (header, title, bottom actions) away from
    // notches/home-indicators without shrinking the whole canvas.
    const width = viewportGeometry.fullBleed.width;
    const height = viewportGeometry.fullBleed.height;
    // Phaser's own Scale Manager tracks canvas bounds/displayScale
    // independently of this scene, and pointer coordinates are transformed
    // through THAT state (baseSize vs the canvas's real getBoundingClientRect,
    // never the backing-store pixel count applyMazerCanvasBackingResolution
    // sets below). refreshLayout() runs from plenty of triggers that aren't
    // an actual geometry change (overlay open/close, mode switches) using a
    // cached geometry snapshot -- if Phaser's own automatic resize observer
    // independently re-measured the parent in between with a slightly
    // different value, its scale state would silently drift out of sync with
    // what we're about to apply here, offsetting every pointer/tap
    // coordinate on the canvas until the next real geometry-change event
    // self-corrected it. Only re-sync when Phaser's own state has actually
    // drifted from ours -- calling this unconditionally would fire Phaser's
    // resize event even on a no-op sync, and this scene's own
    // this.scale.on('resize', ...) listener calls refreshLayout() right back,
    // an infinite loop for the (very common) case where refreshLayout() was
    // itself invoked BY that same resize event.
    if (this.scale.width !== width || this.scale.height !== height) {
      syncMazerGameToViewport(this.game, viewportGeometry);
    }
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
      this.maze.width,
      this.maze.height,
      layoutSurface,
      {
        browserMobileParity: this.resolveLegacyBrowserMobileParity(width, height),
        menuActionMode: this.authSnapshot.status === 'authenticated' ? 'authenticated' : 'guest',
        safeArea: viewportGeometry.safeArea,
        useFloatingTouchControls: true
      }
    );
    this.footerText.setPosition(this.layout.width / 2, this.layout.footerY);

    this.boardStaticDirty = true;
    this.boardPathDirty = true;
    this.boardDynamicDirty = true;
    this.backdropDirty = true;
    this.uiDirty = true;
  }

  // Probes the current viewport's available board box (independent of any
  // maze already generated) and returns the width:height cell-count ratio a
  // freshly generated maze should target so it naturally fills that box on
  // both axes, instead of being square and then fit into a non-square box
  // after the fact (see resolveLegacyMenuBoardAspectRatio for the box math).
  private resolveLegacyBoardAspectRatioForMode(mode: RuntimeMode): number {
    const viewportGeometry = readMazerViewportGeometry();
    const width = viewportGeometry.fullBleed.width;
    const height = viewportGeometry.fullBleed.height;
    const layoutSurface = mode === 'play' ? 'play' : 'menu';
    return resolveLegacyMenuBoardAspectRatio(
      width,
      height,
      this.settings.scale + this.settings.camScale,
      layoutSurface,
      {
        browserMobileParity: this.resolveLegacyBrowserMobileParity(width, height),
        menuActionMode: this.authSnapshot.status === 'authenticated' ? 'authenticated' : 'guest',
        safeArea: viewportGeometry.safeArea,
        useFloatingTouchControls: true
      }
    );
  }

  private applyGenerationRequest(request: LegacyGenerationRequest, nextDemoMoveAtMs = 0): void {
    const generationState = consumeLegacyGenerationRequestState(request, request.budget.scale);
    this.mode = request.mode;
    this.mazeSeed = request.seed;
    this.maze = generationState.maze;
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
      this.menuDemoCompletedAtMs = null;
      this.menuDemoCycleRecorded = false;
      this.playCyclePath = [];
      this.playCycleResetUsed = false;
      this.playStaticSlowTile = null;
      this.playRoomCandidateMetadata = null;
      this.playPatrolAgent = null;
    } else {
      this.menuDemoConfig = createLegacyMenuDemoWalkerConfig(this.maze.seed);
      this.menuDemoState = null;
      this.player = generationState.initialPlayer;
      this.syncLegacyPlayerVisualMotionTo(generationState.initialPlayer);
      this.trail = generationState.initialTrail;
      this.playCyclePath = generationState.initialTrail.map(copyPoint);
      this.playCycleResetUsed = false;
      this.playCompletedAtMs = null;
      const progressionBand = resolveLegacyProgressionDifficultyProfile(
        this.progressionState.tracks.player
      ).band;
      this.playStaticSlowTile = createLegacyStaticSlowTileState(this.maze, progressionBand);
      this.playRoomCandidateMetadata = createLegacyRoomCandidateMetadata(
        this.maze,
        progressionBand,
        this.playStaticSlowTile.placement?.point ?? null
      );
      this.playPatrolAgent = this.createLegacyPlayPatrolAgent(progressionBand);
      // The decel-to-target spin itself now starts once the new maze
      // actually finishes settling (settleLegacyMenuStaticDrawStageIfComplete),
      // not here at the moment the maze data swaps in -- resolveLegacy
      // PlayCompassVisualFrame keeps the compass spinning continuously for
      // everything in between (deconstruct through build-out).
    }
    this.resetLegacyWorldTurnHost();
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
      this.playStartedAtMs = this.time.now;
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
          aspectRatio: this.resolveLegacyBoardAspectRatioForMode(mode),
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
      aspectRatio: this.resolveLegacyBoardAspectRatioForMode(mode),
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

    return this.menuStaticDrawRowsVisible ?? this.maze.height;
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

  // Row-slice builds arm BOTH the row-based counter and the tile-order-based
  // counter together (see armLegacyMenuStaticDrawStage), and they finish at
  // independent rates (different batch sizes/step intervals). The tile-order
  // one -- the interleaved, prettier reveal -- typically finishes first.
  // Preferring it exclusively while non-null, then falling back to the
  // stricter row check the instant it nulls out, meant any already-shown
  // tile in a not-yet-reached row would briefly vanish and reappear right as
  // the build finished, reading as "it rebuilds the bottom" (later rows are
  // exactly what the row check hasn't caught up to yet). A tile that either
  // check already considers revealed must stay revealed regardless of which
  // counter happens to finish first, so this is a union of both checks
  // instead of "prefer one, fall back to the other."
  private isLegacyMenuPointVisibleInStaticDraw(point: LegacyPoint): boolean {
    const tileLimit = this.resolveLegacyMenuStaticDrawTileLimit();
    const visibleByTileLimit = tileLimit === null
      || this.menuStaticDrawVisibleTileKeys.has(legacyScenePointKey(point));
    if (visibleByTileLimit) {
      return true;
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
    this.menuDemoCompletedAtMs = null;
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
        aspectRatio: this.resolveLegacyBoardAspectRatioForMode('play'),
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

  private settleLegacyMenuStaticDrawStageIfComplete(time: number): void {
    const settledPlayStartedAtMs = resolveLegacyStaticDrawPlayTimerStartAtMs({
      currentStartedAtMs: this.playStartedAtMs,
      drawPhase: this.menuStaticDrawLifecyclePhase,
      mode: this.mode,
      nowMs: time,
      rowsVisible: this.menuStaticDrawRowsVisible,
      tilesVisible: this.menuStaticDrawTilesVisible
    });
    if (!shouldSettleLegacyStaticDrawStage({
      drawPhase: this.menuStaticDrawLifecyclePhase,
      rowsVisible: this.menuStaticDrawRowsVisible,
      tilesVisible: this.menuStaticDrawTilesVisible
    })) {
      return;
    }

    this.playStartedAtMs = settledPlayStartedAtMs;
    this.menuStaticDrawLifecyclePhase = 'settled';
    this.menuStaticDeconstructStartedAtMs = null;
    this.menuStaticBuildPrerollStartedAtMs = null;
    this.refreshLegacyMenuStaticDrawVisibleTileKeys();
    this.releaseLegacyMenuDemoGateOnStaticDrawSettled(time);
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
      this.menuStaticDrawRowsVisible = Math.min(this.maze.height, this.menuStaticDrawRowsVisible + batchSize);
      this.menuStaticDrawNextRowAtMs = time + LEGACY_MENU_STATIC_DRAW_ROW_STEP_MS;
      this.boardPathDirty = true;
      this.boardDynamicDirty = true;
      if (this.menuStaticDrawRowsVisible >= this.maze.height) {
        this.menuStaticDrawRowsVisible = null;
        this.menuStaticDrawNextRowAtMs = 0;
        this.settleLegacyMenuStaticDrawStageIfComplete(time);
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
        this.settleLegacyMenuStaticDrawStageIfComplete(time);
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
        aspectRatio: this.resolveLegacyBoardAspectRatioForMode('menu'),
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
      this.menuDemoCompletedAtMs ??= time;
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
      this.menuDemoCompletedAtMs ??= time;
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
      timerStarted: this.mode === 'play'
        && !shouldFreezeLegacyPlayElapsedForStaticDraw({
          drawPhase: this.menuStaticDrawLifecyclePhase,
          rowsVisible: this.menuStaticDrawRowsVisible,
          tilesVisible: this.menuStaticDrawTilesVisible
        })
        && time >= this.playStartedAtMs,
      trailAlpha: this.resolveLegacyMenuDeconstructTrailAlpha(time),
      trailLength: this.trail.length
    });
  }

  private resolveLegacyPlayLifecycleDiagnosticsSignature(time: number): string {
    const lifecycle = this.resolveLegacyPlayLifecycleDiagnostics(time);
    const patrolTelegraph = resolveLegacyPatrolAgentTelegraph(
      this.playPatrolAgent,
      time,
      this.playStartedAtMs,
      this.resolveLegacyWorldTurnHostState() === 'running'
    );
    const patrolCollisionFeedback = resolveLegacyPatrolAgentCollisionFeedback(
      this.playPatrolAgent,
      time
    );
    const patrolCollisionRecovery = resolveLegacyPatrolAgentCollisionRecovery(
      this.playPatrolAgent,
      time
    );
    return [
      lifecycle.phase,
      lifecycle.drawPhase,
      lifecycle.inputLocked ? 'locked' : 'open',
      lifecycle.nextSeedQueued ? 'seed' : 'no-seed',
      lifecycle.timerRunning ? 'timer' : 'no-timer',
      lifecycle.playerVisible ? 'player' : 'no-player',
      lifecycle.trailVisible ? 'trail' : 'no-trail',
      patrolTelegraph.active ? 'patrol-intent' : 'no-patrol-intent',
      patrolCollisionFeedback.active ? 'patrol-impact' : 'no-patrol-impact',
      patrolCollisionRecovery.active ? 'patrol-recovery' : 'no-patrol-recovery',
      this.playPatrolAgent?.pendingCollisionIntent ? 'patrol-input-pending' : 'no-patrol-input-pending'
    ].join(':');
  }

  private createLegacyPlayPatrolAgent(
    progressionBand: LegacyProgressionDifficultyBand
  ): LegacyPatrolAgentState | null {
    const excludedPoints: LegacyPoint[] = [];
    if (this.playStaticSlowTile?.placement) {
      excludedPoints.push({ ...this.playStaticSlowTile.placement.point });
    }
    if (this.playRoomCandidateMetadata) {
      const { x, y } = this.playRoomCandidateMetadata.candidate.topLeft;
      excludedPoints.push(
        { x, y },
        { x: x + 1, y },
        { x, y: y + 1 },
        { x: x + 1, y: y + 1 }
      );
    }
    return createLegacyPatrolAgentState(this.maze, progressionBand, excludedPoints);
  }

  private createLegacyWorldTurnHost(): WorldTurnHost {
    return new WorldTurnHost({
      'player-movement': (): WorldTurnPhaseResult => this.applyLegacyWorldTurnPlayerMovement(),
      'enemy-movement': (
        context: Readonly<WorldTurnPhaseContext>
      ): WorldTurnPhaseResult => this.applyLegacyWorldTurnPatrolMovement(context),
      collisions: (): WorldTurnPhaseResult => this.applyLegacyWorldTurnPatrolCollision()
    }, {
      timedModeEnabled: this.playPatrolAgent !== null
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

  private advanceLegacyPatrolTimer(time: number): void {
    const hostState = this.resolveLegacyWorldTurnHostState();
    const tick = resolveLegacyPatrolAgentTick(
      this.playPatrolAgent,
      time,
      this.playStartedAtMs,
      hostState === 'running'
    );
    this.playPatrolAgent = tick.state;
    if (!tick.triggered) {
      return;
    }

    this.legacyWorldTurnCommandSequence += 1;
    this.legacyWorldTurnHost.setState(hostState);
    const diagnostics = this.legacyWorldTurnHost.getDiagnostics();
    const receipt = this.legacyWorldTurnHost.advance({
      expectedTurn: diagnostics.nextTurn,
      id: `${this.mazeSeed}:patrol:${tick.tickIndex}:${this.legacyWorldTurnCommandSequence}`,
      kind: 'timed-mode-tick',
      tickId: `${this.mazeSeed}:${tick.tickIndex}`
    });
    if (receipt.admitted) {
      this.boardDynamicDirty = true;
      this.publishRuntimeDiagnostics(time, true);
    }
  }

  private flushLegacyPatrolCollisionIntent(time: number): void {
    if (this.resolveLegacyWorldTurnHostState() !== 'running') {
      this.playPatrolAgent = clearLegacyPatrolAgentCollisionIntent(this.playPatrolAgent);
      return;
    }
    const resolution = resolveLegacyPatrolAgentCollisionIntent(this.playPatrolAgent, time);
    this.playPatrolAgent = resolution.state;
    if (resolution.intent === null) {
      return;
    }

    const heldTouchActive = this.playHeldTouchMoves.length > 0;
    if (heldTouchActive) {
      this.clearLegacyPlayHeldTouchRepeat();
    }
    this.tryMovePlayerFromInput(
      resolution.intent.deltaX,
      resolution.intent.deltaY,
      { releaseAfterStep: true }
    );
    if (heldTouchActive && this.playHeldTouchMoves.length > 0) {
      this.scheduleLegacyPlayHeldTouchRepeat(this.resolveLegacyPlayHeldTouchDelay('repeat'));
    }
    this.publishRuntimeDiagnostics(time, true);
  }

  private tryMovePlayer(deltaX: number, deltaY: number): boolean {
    const slowTileDelayActive = isLegacyStaticSlowTileDelayActive(
      this.playStaticSlowTile,
      this.time.now
    );
    const patrolDelayActive = isLegacyPatrolAgentDelayActive(
      this.playPatrolAgent,
      this.time.now
    );
    if (slowTileDelayActive || patrolDelayActive) {
      if (slowTileDelayActive) {
        this.playStaticSlowTile = recordLegacyStaticSlowTileBlockedMove(
          this.playStaticSlowTile,
          this.time.now
        );
      }
      if (patrolDelayActive) {
        this.playPatrolAgent = queueLegacyPatrolAgentCollisionIntent(
          this.playPatrolAgent,
          deltaX,
          deltaY,
          this.time.now
        );
        this.playPatrolAgent = recordLegacyPatrolAgentBlockedMove(
          this.playPatrolAgent,
          this.time.now
        );
      }
      this.boardDynamicDirty = true;
      this.publishRuntimeDiagnostics(this.time.now, true);
      return false;
    }

    this.playPatrolAgent = clearLegacyPatrolAgentCollisionIntent(this.playPatrolAgent);
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

  private applyLegacyWorldTurnPatrolMovement(
    context: Readonly<WorldTurnPhaseContext>
  ): WorldTurnPhaseResult {
    if (context.command.kind !== 'timed-mode-tick' || this.playPatrolAgent === null) {
      return {};
    }

    this.playPatrolAgent = advanceLegacyPatrolAgent(this.playPatrolAgent, this.time.now);
    return {
      events: [{
        type: 'patrol-agent-stepped',
        entityId: 'patrol-agent'
      }]
    };
  }

  private applyLegacyWorldTurnPatrolCollision(): WorldTurnPhaseResult {
    const collision = applyLegacyPatrolAgentCollision(
      this.playPatrolAgent,
      this.player,
      this.time.now
    );
    this.playPatrolAgent = collision.state;
    if (!collision.triggered) {
      return {};
    }

    this.boardDynamicDirty = true;
    return {
      events: [{
        type: 'patrol-agent-collision-delay',
        entityId: 'player',
        payload: {
          delayMs: collision.penaltyAppliedMs
        }
      }]
    };
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
    this.armLegacyPlayerVisualMotion(previousPlayer, nextStep.player, this.time.now, this.resolveLegacyPlayerVisualMoveDurationMs());
    this.trail = nextStep.trail;
    this.appendLegacyPlayCyclePoint(nextStep.player);
    const slowTileEntry = applyLegacyStaticSlowTileEntry(
      this.playStaticSlowTile,
      nextStep.player,
      this.time.now,
      this.playStartedAtMs
    );
    this.playStaticSlowTile = slowTileEntry.state;

    if (nextStep.reachedGoal) {
      this.playCompletedAtMs ??= this.time.now;
      this.recordMazeCycleCompletion('play');
      this.schedulePlayResetReturn();
      this.boardDynamicDirty = true;
      this.triggerLegacyHapticPulse([18, 40, 18, 40, 32]);
      return {
        accepted: true,
        events: [{ type: 'player-reached-goal', entityId: 'player' }]
      };
    }

    this.boardDynamicDirty = true;
    this.triggerLegacyHapticPulse(6);
    return {
      accepted: true,
      events: [
        { type: 'player-moved', entityId: 'player' },
        ...(slowTileEntry.triggered
          ? [{
              type: 'static-slow-tile-entered',
              entityId: 'player',
              payload: {
                penaltyMs: slowTileEntry.penaltyAppliedMs,
                phaseActive: slowTileEntry.phase?.active ?? false,
                timingMode: slowTileEntry.phase?.mode ?? 'disabled'
              }
            }]
          : [])
      ]
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
      aspectRatio: this.resolveLegacyBoardAspectRatioForMode('menu'),
      currentSeed: this.mazeSeed,
      generationProfile: this.resolveLegacyMazeGenerationProfileForMode('menu'),
      nowMs: time,
      scale: this.resolveLegacyProgressionScaleForMode('menu'),
      targetComplexity: this.resolveLegacyTargetComplexityForMode('menu')
    });
  }

  private createStars(): void {
    // The backdrop stays present as a quiet depth layer. The player's motion
    // preference controls movement, not whether the menu falls back to a blank
    // field.
    this.stars = createLegacyMenuBackdropStars().slice(0, LEGACY_MENU_STAR_COUNT);
  }

  private updateStars(time: number, delta: number): void {
    if (this.stars.length === 0 || !this.settings.toggleAnimatedBackdrop || this.prefersLegacyReducedMotion()) {
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
    this.backdropGraphics.fillStyle(cyberArcadeMaterial.substrate.field, 1);
    this.backdropGraphics.fillRect(0, 0, width, height);
    const palette = resolveLegacyMenuBackdropPalette(this.settings.darkMode);
    const backdropMotionEnabled = this.settings.toggleAnimatedBackdrop && !this.prefersLegacyReducedMotion();
    const animationTime = backdropMotionEnabled ? this.time.now : 0;
    for (const shard of resolveLegacyMenuBackdropShards(width, height, this.settings.darkMode)) {
      this.drawLegacyBackdropShard(shard, 0.36);
    }
    for (const shard of resolveLegacyMenuBackdropGlassShards(
      width,
      height,
      this.settings.darkMode,
      animationTime,
      backdropMotionEnabled
    )) {
      this.drawLegacyBackdropShard(shard, 0.74);
    }
    for (const rune of resolveLegacyMenuBackdropDriftRunes(
      width,
      height,
      this.settings.darkMode,
      animationTime,
      backdropMotionEnabled
    )) {
      this.drawLegacyBackdropRune(rune);
    }
    this.drawLegacyBackdropSigils(width, height, animationTime);
    for (const star of this.stars) {
      const pixelX = Math.round(star.x * width);
      const pixelY = Math.round(star.y * height);
      const streakLength = resolveLegacyMenuBackdropStreakLength(star);
      const coreSize = Math.max(1, Math.round(star.radius));
      const step = resolveLegacyMenuBackdropTailStep(star);
      // Deterministic per-star twinkle and color-temperature variation from
      // the star's own position (no extra persisted state needed) -- plain
      // uniform white squares with no shimmer read as flat/lifeless at a
      // real starfield's scale.
      const starSeed = ((star.x * 9973) + (star.y * 6151)) % 1;
      const twinklePhase = backdropMotionEnabled
        ? (Math.sin((animationTime / 1300) + (starSeed * Math.PI * 2)) + 1) / 2
        : 0.5;
      const twinkleAlpha = star.alpha * (0.68 + (twinklePhase * 0.32));
      const starColor = starSeed > 0.82 ? 0xbfe3ff : (starSeed < 0.16 ? 0xffe9c2 : 0xffffff);
      // The nearest, biggest stars get an extra outer bloom pass -- a single
      // halo size read as flat once depth-correlated radii introduced real
      // standout-bright stars; a wider third pass gives those a genuine glow
      // instead of just a bigger flat square.
      if (coreSize > 3) {
        this.backdropGraphics.fillStyle(starColor, twinkleAlpha * palette.starAlphaScale * 0.12);
        this.backdropGraphics.fillRect(pixelX - 4, pixelY - 4, coreSize + 8, coreSize + 8);
      }
      if (coreSize > 1) {
        this.backdropGraphics.fillStyle(starColor, twinkleAlpha * palette.starAlphaScale * 0.22);
        this.backdropGraphics.fillRect(pixelX - 2, pixelY - 2, coreSize + 4, coreSize + 4);
        this.backdropGraphics.fillStyle(starColor, twinkleAlpha * palette.starAlphaScale * 0.18);
        this.backdropGraphics.fillRect(pixelX - 1, pixelY - 1, coreSize + 2, coreSize + 2);
      }
      this.backdropGraphics.fillStyle(starColor, twinkleAlpha * palette.starAlphaScale);
      this.backdropGraphics.fillRect(pixelX, pixelY, coreSize, coreSize);
      // Fading tail instead of a uniform-alpha dashed line -- brightest
      // where it meets the star core, tapering to nothing at the far end, so
      // fast/near stars read as a warp streak rather than a dotted trail.
      for (let index = 1; index <= streakLength; index += 1) {
        const tailFade = 1 - (index / (streakLength + 1));
        this.backdropGraphics.fillStyle(starColor, twinkleAlpha * palette.starAlphaScale * 0.5 * tailFade);
        this.backdropGraphics.fillRect(
          Math.round(pixelX + (step.x * index)),
          Math.round(pixelY + (step.y * index)),
          1,
          1
        );
      }
    }

    this.backdropDirty = false;
  }

  /**
   * OS-level reduced motion is cached once and event-driven afterwards. It
   * only settles presentation state; input cadence, world turns, collisions,
   * and persisted settings remain untouched.
   */
  private installLegacyReducedMotionPreference(): void {
    this.detachLegacyReducedMotionPreference();
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    try {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.legacyReducedMotionMediaQuery = mediaQuery;
      this.legacyReducedMotionEnabled = mediaQuery.matches;
      this.legacyReducedMotionMediaQueryListener = (event) => {
        this.applyLegacyReducedMotionPreference(event.matches);
      };
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', this.legacyReducedMotionMediaQueryListener);
      } else {
        mediaQuery.addListener(this.legacyReducedMotionMediaQueryListener);
      }
    } catch {
      this.detachLegacyReducedMotionPreference();
    }
  }

  private detachLegacyReducedMotionPreference(): void {
    const mediaQuery = this.legacyReducedMotionMediaQuery;
    const listener = this.legacyReducedMotionMediaQueryListener;
    if (mediaQuery !== null && listener !== null) {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', listener);
      } else {
        mediaQuery.removeListener(listener);
      }
    }
    this.legacyReducedMotionMediaQuery = null;
    this.legacyReducedMotionMediaQueryListener = null;
  }

  private applyLegacyReducedMotionPreference(reducedMotion: boolean): void {
    if (this.legacyReducedMotionEnabled === reducedMotion) {
      return;
    }

    this.legacyReducedMotionEnabled = reducedMotion;
    this.backdropAccumulatedDeltaMs = 0;
    this.backdropNextUpdateAtMs = Number.NEGATIVE_INFINITY;
    this.legacyPlayTrailPulseNextFrameAtMs = 0;
    this.legacyMenuTitleAnimationNextFrameAtMs = Number.NEGATIVE_INFINITY;
    if (reducedMotion) {
      if (this.playerVisualMotion !== null) {
        this.syncLegacyPlayerVisualMotionTo(this.playerVisualMotion.to);
      }
    }
    this.backdropDirty = true;
    this.boardDynamicDirty = true;
    this.hudDirty = true;
    this.uiDirty = true;
    this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
  }

  private prefersLegacyReducedMotion(): boolean {
    return this.legacyReducedMotionEnabled;
  }

  private isLegacyTrailShineVisible(): boolean {
    return this.settings.toggleTrailPulse && !this.prefersLegacyReducedMotion();
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
    const { boardLeft: layoutBoardLeft, boardTop: layoutBoardTop, boardWidth, boardHeight } = this.layout;
    const boardOffset = this.resolveBoardOffset();
    const boardLeft = layoutBoardLeft + boardOffset.x;
    const boardTop = layoutBoardTop + boardOffset.y;
    const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(boardLeft, boardTop, boardWidth, boardHeight);
    const mazeLeft = mazeRenderFrame.boardLeft;
    const mazeTop = mazeRenderFrame.boardTop;
    const mazeWidth = mazeRenderFrame.boardWidth;
    const mazeHeight = mazeRenderFrame.boardHeight;
    const tileSize = mazeRenderFrame.tileSize;
    const isMenuMode = this.mode === 'menu';

    this.boardStaticGraphics.clear();
    const boardShadowAlpha = isMenuMode ? LEGACY_MENU_PANEL_SHADOW_ALPHA : 0;
    if (boardShadowAlpha > 0) {
      this.boardStaticGraphics.fillStyle(0x000000, boardShadowAlpha);
      this.boardStaticGraphics.fillRect(boardLeft + BOARD_SHADOW_OFFSET, boardTop + BOARD_SHADOW_OFFSET, boardWidth, boardHeight);
    }
    // Neither surface gets a slab backdrop, edge frame, or glass tint: the
    // maze tiles should read as floating directly on the scene, not boxed
    // in by anything, however faint -- play mode used to be the exception
    // here (a dedicated edge-frame helper plus a translucent glass fill
    // behind the whole board), which is exactly the border/background box
    // that was already removed from the menu surface.
    // Keep the board top-down: no pseudo bevel/highlight pass over the maze.
    // Dark-mode dimming is a gameplay-readability pass for the active play
    // board; menu mode has no fill/background of its own for it to dim, and
    // painting it there just reintroduces a faint boxed-in square (dark mode
    // is on by default) distinguishable from the starfield around it.
    if (this.settings.darkMode && !isMenuMode) {
      this.boardStaticGraphics.fillStyle(0x000000, 0.12);
      this.boardStaticGraphics.fillRect(boardLeft, boardTop, boardWidth, boardHeight);
    }
    if (isMenuMode && LEGACY_BOARD_GRID_ALPHA > 0) {
      this.boardStaticGraphics.lineStyle(1, 0x6c6673, LEGACY_BOARD_GRID_ALPHA);
      // Vertical lines are spaced along the width; horizontal lines along
      // the height -- these were drawn in one shared loop before, which
      // only happened to be correct while width === height.
      for (let column = 0; column <= this.maze.width; column += 1) {
        const offset = column * tileSize;
        this.boardStaticGraphics.beginPath();
        this.boardStaticGraphics.moveTo(mazeLeft + offset, mazeTop);
        this.boardStaticGraphics.lineTo(mazeLeft + offset, mazeTop + mazeHeight);
        this.boardStaticGraphics.strokePath();
      }
      for (let row = 0; row <= this.maze.height; row += 1) {
        const offset = row * tileSize;
        this.boardStaticGraphics.beginPath();
        this.boardStaticGraphics.moveTo(mazeLeft, mazeTop + offset);
        this.boardStaticGraphics.lineTo(mazeLeft + mazeWidth, mazeTop + offset);
        this.boardStaticGraphics.strokePath();
      }
    }

    // This pass fills every grid cell (not just walls) at low alpha -- on
    // menu mode it uses substrate.field, the same color as the scene
    // background, so it never added a visible wall look (the actual visible
    // corridor comes from drawBoardPaths on a separate graphics layer). All
    // it did was tint the whole square grid area a hair off from the true
    // background outside it, reading as a faint "box" distinguishable from
    // the starfield -- skip it entirely in menu mode. Play mode's gameplay
    // wall rendering is untouched.
    if (!isMenuMode) {
      for (let y = 0; y < this.maze.height; y += 1) {
        for (let x = 0; x < this.maze.width; x += 1) {
          const tileRect = this.resolveLegacyPixelTileRect(mazeLeft, mazeTop, tileSize, { x, y });
          this.boardStaticGraphics.fillStyle(LEGACY_PLAY_WALL_FILL, LEGACY_PLAY_WALL_GLASS_ALPHA);
          this.boardStaticGraphics.fillRect(tileRect.left, tileRect.top, tileRect.width, tileRect.height);
        }
      }
    }

    const showMenuTitle = this.mode === 'menu' && this.overlay === 'none';
    this.titleGraphics.setVisible(showMenuTitle);
    this.boardStaticDirty = false;
  }

  // A flat, full-bleed fill -- no inset core, no separate edge ring, no
  // seam patches bridging the gap between them. Those were the previous
  // "trench" material's job, but stacked with a per-tile facet cut it made
  // a run of connected corridor tiles read as a checkerboard of separate
  // beveled chiclets instead of one clean path. This version fills the
  // entire physical tile edge-to-edge (so adjacent tiles abut with zero
  // gap) and leaves all the accenting to the connection-aware rim in
  // drawLegacyPathTileFacet, which only lights the corridor's true outer
  // boundary. Title cells route through this same function, so they read
  // as the same material as the corridor tiles by construction.
  private drawLegacyPathMaterialTile(
    graphics: Phaser.GameObjects.Graphics,
    point: LegacyPoint,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'width' | 'height'>,
    originX: number,
    originY: number,
    tileSize: number,
    options: LegacyPathMaterialOptions
  ): void {
    if (pathSource.grid[point.y]?.[point.x] !== true) {
      return;
    }

    const tileRect = this.resolveLegacyPixelTileRect(originX, originY, tileSize, point);
    const hasTop = pathSource.grid[point.y - 1]?.[point.x] === true;
    const hasLeft = pathSource.grid[point.y]?.[point.x - 1] === true;
    const hasBottom = pathSource.grid[point.y + 1]?.[point.x] === true;
    const hasRight = pathSource.grid[point.y]?.[point.x + 1] === true;

    // Adjacent connected tiles overlap their fill by 1px into each other
    // instead of exactly abutting -- two mathematically adjacent fillRects
    // with identical rounded edges still render a faint 1px seam where they
    // meet (antialiasing partial-coverage at the shared boundary), visible
    // as thin grey lines through the corridor at larger tile sizes. A small
    // overlap guarantees solid double-covered color at every internal
    // boundary instead of a hairline gap.
    const overlap = 1;
    const fillLeft = tileRect.left - (hasLeft ? overlap : 0);
    const fillTop = tileRect.top - (hasTop ? overlap : 0);
    const fillRight = tileRect.left + tileRect.width + (hasRight ? overlap : 0);
    const fillBottom = tileRect.top + tileRect.height + (hasBottom ? overlap : 0);

    graphics.fillStyle(options.coreColor, options.coreAlpha);
    graphics.fillRect(fillLeft, fillTop, fillRight - fillLeft, fillBottom - fillTop);
    this.drawLegacyPathTileFacet(
      graphics,
      tileRect,
      options.coreAlpha,
      options.edgeColor,
      hasTop,
      hasLeft,
      hasBottom,
      hasRight
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

  // A single-tone rim-light along the corridor's true outer boundary --
  // only on edges that do NOT connect to a neighboring path tile. Drawing
  // it per physical tile unconditionally (an earlier version of this) put a
  // hard cut on every single cell, so a run of connected corridor tiles
  // read as a checkerboard of separate chiclets instead of one corridor.
  // Skipping connected edges keeps interior seams flat and lets the rim
  // trace one continuous line around the whole shape instead -- flat fill,
  // one outline, nothing else, so it reads as clean rather than busy.
  // Two passes per edge -- a soft wide halo, then a crisp core line on top
  // -- so the corridor's outer boundary reads as a lit tube with real glow
  // instead of a flat, plain outline. Still connection-aware (only drawn on
  // edges that don't border another path tile), so it stays one continuous
  // line around the shape rather than reintroducing per-tile busyness.
  private drawLegacyPathTileFacet(
    graphics: Phaser.GameObjects.Graphics,
    tileRect: LegacyPixelTileRect,
    intensity: number,
    rimColor: number,
    hasTop: boolean,
    hasLeft: boolean,
    hasBottom: boolean,
    hasRight: boolean
  ): void {
    const left = tileRect.left;
    const top = tileRect.top;
    const width = tileRect.width;
    const height = tileRect.height;
    const lineWidth = Math.max(1, Math.round(Math.min(width, height) * 0.1));
    const glowWidth = lineWidth * 3;
    const glowAlpha = Math.min(0.3, intensity * 0.32);
    const coreAlpha = Math.min(0.95, intensity + 0.1);

    const strokeEdge = (x1: number, y1: number, x2: number, y2: number): void => {
      graphics.lineStyle(glowWidth, rimColor, glowAlpha);
      graphics.beginPath();
      graphics.moveTo(x1, y1);
      graphics.lineTo(x2, y2);
      graphics.strokePath();
      graphics.lineStyle(lineWidth, rimColor, coreAlpha);
      graphics.beginPath();
      graphics.moveTo(x1, y1);
      graphics.lineTo(x2, y2);
      graphics.strokePath();
    };

    if (!hasTop) {
      strokeEdge(left, top, left + width, top);
    }
    if (!hasLeft) {
      strokeEdge(left, top, left, top + height);
    }
    if (!hasBottom) {
      strokeEdge(left, top + height, left + width, top + height);
    }
    if (!hasRight) {
      strokeEdge(left + width, top, left + width, top + height);
    }
  }

  // A normal corridor stays a tile away from the board edge (the existing
  // safeInset in resolveLegacyMazeRenderFrame). A wraparound dock corridor
  // -- one whose path genuinely continues off-grid -- bleeds past the board
  // edge to the true screen edge on every side. Play mode still caps this at
  // one tile: its board keeps a real reserved lane for the HUD/touch
  // controls that top/bottom must stay clear of, and its board was never
  // meant to be full-bleed the same way the menu's is (bleedMargin is 0 for
  // play in legacyMenuLayout.ts). The menu surface's board IS full-bleed
  // (the header icons, title, and Login/Start button float above it as an
  // overlay instead of it leaving room for them), so a menu dock consumes
  // the entire actual gap on its side rather than a fixed one-tile budget --
  // whatever slack is left over from board centering/tile-size rounding on
  // that axis, so the corridor always terminates at the true edge instead of
  // stopping short of it when that slack happens to exceed one tile (this
  // was previously capped at one tile uniformly, which worked when the
  // leftover slack was itself close to one tile but visibly fell short on
  // axes where it wasn't).
  private resolveLegacyPathBorderDockContinuation(
    direction: LegacyMenuBorderDockDirection,
    boardLeft: number,
    boardTop: number,
    boardWidth: number,
    boardHeight: number,
    _tileSize: number
  ): number {
    const edgeInset = 2;
    // Both surfaces are full-bleed now -- play's top HUD and (floating)
    // touch controls float over the board exactly like menu's header/dock
    // button do, rather than reserving fixed lanes the corridor needs to
    // stop short of. This used to special-case play mode to stop at
    // layout.lanes.hud/controls instead of the true screen edge, and cap
    // the length at one tile -- but those lanes are constructed as
    // "board edge + a few px", not "where a fixed control actually sits",
    // so the cap always won trivially and left the corridor stopping only
    // a handful of px past the board on play while menu's identical
    // corridor reached the full remaining gap to the true edge. Dropping
    // the play-only branch makes both surfaces resolve identically, which
    // is what actually reaching the screen edge (and matching between
    // menu and play) requires.
    const resolveContinuation = (availableGap: number): number => Math.max(2, availableGap);

    if (direction === 'left') {
      return resolveContinuation(boardLeft - edgeInset);
    }
    if (direction === 'right') {
      const boardRight = boardLeft + boardWidth;
      return resolveContinuation((this.layout.width - edgeInset) - boardRight);
    }
    if (direction === 'top') {
      return resolveContinuation(boardTop - edgeInset);
    }

    const boardBottom = boardTop + boardHeight;
    return resolveContinuation((this.layout.height - edgeInset) - boardBottom);
  }

  // Eligibility is keyed to the coordinate itself, computed once from the
  // full maze (this.maze) regardless of which pathSource is actually being
  // drawn (the real board, or the player-visited-only trail subset) -- a
  // subset grid can only ever be walkable where the full maze already is,
  // so a coordinate the full maze doesn't consider dock-eligible never
  // needs to render as one for a subset either.
  private resolveBleedOffDockVisualEligibility(): Set<string> {
    if (this.bleedOffDockVisualEligibilityForMaze !== this.maze) {
      this.bleedOffDockVisualEligibilityForMaze = this.maze;
      this.bleedOffDockVisualEligibilityKeys = resolveLegacyBleedOffDockVisualEligibility(this.maze);
    }
    return this.bleedOffDockVisualEligibilityKeys;
  }

  private drawLegacyPathBorderDock(
    graphics: Phaser.GameObjects.Graphics,
    point: LegacyPoint,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'width' | 'height'>,
    boardLeft: number,
    boardTop: number,
    boardWidth: number,
    boardHeight: number,
    mazeLeft: number,
    mazeTop: number,
    mazeWidth: number,
    mazeHeight: number,
    tileSize: number,
    options: LegacyPathMaterialOptions
  ): void {
    const dockDirections = resolveLegacyMenuBorderDockDirections(pathSource, point);
    if (dockDirections.length <= 0) {
      return;
    }
    // Two bleed-off openings sitting right next to each other on the same
    // edge are both fully valid, walkable, correctly-wrapping tiles -- the
    // grid topology's pairing invariant requires that. This purely decides
    // which of two close-together ones gets the decorative "poking past
    // the border" dock treatment, so they don't visually read as one
    // corridor accidentally split in two right next to itself.
    if (!this.resolveBleedOffDockVisualEligibility().has(`${point.x},${point.y}`)) {
      return;
    }

    const tileRect = this.resolveLegacyPixelTileRect(mazeLeft, mazeTop, tileSize, point);
    const materialTileSize = Math.max(1, Math.round(tileSize));
    const frames = resolveLegacyMenuPathRenderFrames(pathSource, point, materialTileSize);
    const cornerGuardSize = Math.max(
      mazeLeft - boardLeft,
      Math.round(Math.min(boardWidth, boardHeight) * LEGACY_BOARD_SIGIL_CORNER_FACET_SIZE_RATIO)
    );
    const fillDockFrame = (
      direction: LegacyMenuBorderDockDirection,
      frame: { height: number; leftInset: number; topInset: number; width: number }
    ): void => {
      const dockAreas = resolveLegacyMenuBorderDockRenderAreas(direction, frame, {
        boardLeft,
        boardTop,
        boardWidth,
        boardHeight,
        cornerGuardSize,
        continuationLength: this.resolveLegacyPathBorderDockContinuation(
          direction,
          boardLeft,
          boardTop,
          boardWidth,
          boardHeight,
          tileSize
        ),
        materialTileSize,
        mazeLeft,
        mazeTop,
        mazeWidth,
        mazeHeight,
        tileRect,
        topCenterNotch: this.resolveLegacyBoardTopCenterNotchBounds(boardLeft, boardTop, boardWidth)
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

    // The flat-filled bands above give the continuation the right two-tone
    // coloring, but nothing else about it read as a tile -- it was just a
    // plain color bar. Giving its outward-facing edges the same soft-halo +
    // crisp-line rim as every other corridor tile (drawLegacyPathTileFacet),
    // connected only on the side that meets the board's real edge tile,
    // makes it read as "one more tile poking past the border" instead.
    for (const direction of dockDirections) {
      this.drawLegacyPathBorderDockFacet(
        graphics,
        direction,
        tileRect,
        materialTileSize,
        frames.edge,
        boardLeft,
        boardTop,
        boardWidth,
        boardHeight,
        this.resolveLegacyPathBorderDockContinuation(direction, boardLeft, boardTop, boardWidth, boardHeight, tileSize),
        options.edgeColor,
        options.coreAlpha
      );
    }
  }

  private drawLegacyPathBorderDockFacet(
    graphics: Phaser.GameObjects.Graphics,
    direction: LegacyMenuBorderDockDirection,
    tileRect: LegacyPixelTileRect,
    materialTileSize: number,
    frame: { height: number; leftInset: number; topInset: number; width: number },
    boardLeft: number,
    boardTop: number,
    boardWidth: number,
    boardHeight: number,
    continuationLength: number,
    rimColor: number,
    intensity: number
  ): void {
    const bandLeft = tileRect.left + Math.round((frame.leftInset / materialTileSize) * tileRect.width);
    const bandTop = tileRect.top + Math.round((frame.topInset / materialTileSize) * tileRect.height);
    const bandRight = tileRect.left + Math.round(((frame.leftInset + frame.width) / materialTileSize) * tileRect.width);
    const bandBottom = tileRect.top + Math.round(((frame.topInset + frame.height) / materialTileSize) * tileRect.height);
    const length = Math.max(1, Math.round(continuationLength));

    let facetRect: LegacyPixelTileRect;
    let hasTop = false;
    let hasLeft = false;
    let hasBottom = false;
    let hasRight = false;

    if (direction === 'left') {
      facetRect = { height: bandBottom - bandTop, left: boardLeft - length, top: bandTop, width: length };
      hasRight = true;
    } else if (direction === 'right') {
      facetRect = { height: bandBottom - bandTop, left: boardLeft + boardWidth, top: bandTop, width: length };
      hasLeft = true;
    } else if (direction === 'top') {
      facetRect = { height: length, left: bandLeft, top: boardTop - length, width: bandRight - bandLeft };
      hasBottom = true;
    } else {
      facetRect = { height: length, left: bandLeft, top: boardTop + boardHeight, width: bandRight - bandLeft };
      hasTop = true;
    }

    if (facetRect.width <= 0 || facetRect.height <= 0) {
      return;
    }

    this.drawLegacyPathTileFacet(graphics, facetRect, intensity, rimColor, hasTop, hasLeft, hasBottom, hasRight);
  }

  private hasLegacyBleedOffGlowPendingFrame(): boolean {
    // Gated to 'settled' only -- the glow shouldn't appear while the maze
    // is still building in, and should vanish the instant deconstruction
    // starts (ahead of the trail/AI-memory coloring above it, which fade
    // out over the deconstruct duration instead of cutting immediately).
    if (this.menuStaticDrawLifecyclePhase !== 'settled') {
      return false;
    }
    const wrap = this.maze.wrapTopologyDiagnostics;
    return (wrap?.horizontal.endpointCount ?? 0) > 0 || (wrap?.vertical.endpointCount ?? 0) > 0;
  }

  // Bleed-off/wrap corridors are drawn as one more real tile past the
  // board's own edge (drawLegacyPathBorderDock), same color as every other
  // corridor tile -- which reads as "structurally there" but doesn't call
  // attention to the fact that this specific tile is special (it's the
  // player's way off the visible grid entirely). This overlays a traveling
  // green pulse on top of that base tile, from the inner end (where the
  // corridor meets the grid) out to the true screen edge, on a loop, purely
  // to draw the eye -- it never changes the corridor's own base color/shape.
  private drawLegacyBleedOffGlow(
    time: number,
    boardLeft: number,
    boardTop: number,
    boardWidth: number,
    boardHeight: number,
    mazeLeft: number,
    mazeTop: number,
    // Pixel size of the rendered maze content area (mazeRenderFrame.board-
    // Width/boardHeight) -- NOT the grid's cell counts (this.maze.width/
    // height). resolveLegacyMenuBorderDockRenderAreas uses this to compute
    // mazeRight/mazeBottom (mazeLeft/Top + this), so passing the cell count
    // here previously put mazeRight/mazeBottom a few dozen px from mazeLeft/
    // Top instead of near the board's far edge -- every dock area's "off
    // the grid" side then stretched nearly the full board width/height
    // instead of one tile, which is exactly the stray line across the
    // screen this was producing.
    mazePixelWidth: number,
    mazePixelHeight: number,
    tileSize: number,
    glowColor: number
  ): void {
    if (!this.hasLegacyBleedOffGlowPendingFrame()) {
      return;
    }

    const progress = (((time % LEGACY_BLEED_GLOW_PERIOD_MS) + LEGACY_BLEED_GLOW_PERIOD_MS) % LEGACY_BLEED_GLOW_PERIOD_MS)
      / LEGACY_BLEED_GLOW_PERIOD_MS;
    const envelope = Math.sin(Math.PI * progress);
    if (envelope <= 0.01) {
      return;
    }

    const materialTileSize = Math.max(1, Math.round(tileSize));
    const cornerGuardSize = Math.max(
      mazeLeft - boardLeft,
      Math.round(Math.min(boardWidth, boardHeight) * LEGACY_BOARD_SIGIL_CORNER_FACET_SIZE_RATIO)
    );
    const width = this.maze.width;
    const height = this.maze.height;
    // Bleed-off tiles only ever sit on the grid's own perimeter (see
    // isNonCornerBorderPoint in legacyMenuRender.ts) -- scanning just the
    // border ring instead of the full grid keeps this a per-frame-safe cost
    // even on the largest mazes.
    const perimeterPoints: LegacyPoint[] = [];
    for (let x = 0; x < width; x += 1) {
      perimeterPoints.push({ x, y: 0 }, { x, y: height - 1 });
    }
    for (let y = 1; y < height - 1; y += 1) {
      perimeterPoints.push({ x: 0, y }, { x: width - 1, y });
    }

    for (const point of perimeterPoints) {
      if (this.maze.grid[point.y]?.[point.x] !== true || !this.isLegacyMenuPointVisibleInStaticDraw(point)) {
        continue;
      }
      const dockDirections = resolveLegacyMenuBorderDockDirections(this.maze, point);
      if (dockDirections.length <= 0 || !this.resolveBleedOffDockVisualEligibility().has(`${point.x},${point.y}`)) {
        continue;
      }

      const tileRect = this.resolveLegacyPixelTileRect(mazeLeft, mazeTop, tileSize, point);
      // Deliberately NOT resolveLegacyMenuPathRenderFrames here: that frame
      // is connectivity-aware and stretches to merge with connected
      // neighbor tiles (so ordinary corridor rendering reads as one
      // continuous slab, not a grid of disconnected boxes) -- exactly the
      // wrong shape for this glow, which needs the dock's OWN tile-sized
      // footprint. Reusing the merged frame produced glow bands tens of
      // tiles tall/wide on any bleed point whose tile also happens to
      // connect to several interior neighbors, reading as a stray line
      // shooting across the board instead of a glow on the dock itself.
      const singleTileFrame = { height: materialTileSize, leftInset: 0, topInset: 0, width: materialTileSize };
      for (const direction of dockDirections) {
        const dockAreas = resolveLegacyMenuBorderDockRenderAreas(direction, singleTileFrame, {
          boardLeft,
          boardTop,
          boardWidth,
          boardHeight,
          cornerGuardSize,
          continuationLength: this.resolveLegacyPathBorderDockContinuation(
            direction,
            boardLeft,
            boardTop,
            boardWidth,
            boardHeight,
            tileSize
          ),
          materialTileSize,
          mazeLeft,
          mazeTop,
          mazeWidth: mazePixelWidth,
          mazeHeight: mazePixelHeight,
          tileRect,
          topCenterNotch: this.resolveLegacyBoardTopCenterNotchBounds(boardLeft, boardTop, boardWidth)
        });

        const isVertical = direction === 'top' || direction === 'bottom';
        for (const area of dockAreas) {
          const spanStart = isVertical
            ? (direction === 'top' ? area.bottom : area.top)
            : (direction === 'left' ? area.right : area.left);
          const spanEnd = isVertical
            ? (direction === 'top' ? area.top : area.bottom)
            : (direction === 'left' ? area.left : area.right);
          const span = spanEnd - spanStart;
          if (Math.abs(span) < 1) {
            continue;
          }

          for (let step = 0; step < LEGACY_BLEED_GLOW_STEPS; step += 1) {
            const t0 = step / LEGACY_BLEED_GLOW_STEPS;
            const t1 = (step + 1) / LEGACY_BLEED_GLOW_STEPS;
            const dist = Math.abs(((t0 + t1) / 2) - progress);
            const bandIntensity = Math.max(0, 1 - (dist / LEGACY_BLEED_GLOW_BAND_HALF_WIDTH));
            if (bandIntensity <= 0.02) {
              continue;
            }

            const alpha = LEGACY_BLEED_GLOW_MAX_ALPHA * envelope * bandIntensity;
            const p0 = spanStart + (span * t0);
            const p1 = spanStart + (span * t1);
            const lo = Math.min(p0, p1);
            const hi = Math.max(p0, p1);
            this.boardDynamicGraphics.fillStyle(glowColor, alpha);
            if (isVertical) {
              this.boardDynamicGraphics.fillRect(
                Math.round(area.left),
                Math.round(lo),
                Math.round(area.right - area.left),
                Math.round(hi - lo)
              );
            } else {
              this.boardDynamicGraphics.fillRect(
                Math.round(lo),
                Math.round(area.top),
                Math.round(hi - lo),
                Math.round(area.bottom - area.top)
              );
            }
          }
        }
      }
    }
  }

  private drawBoardPaths(time: number): void {
    const { boardLeft: layoutBoardLeft, boardTop: layoutBoardTop, boardWidth, boardHeight } = this.layout;
    const boardOffset = this.resolveBoardOffset();
    const boardLeft = layoutBoardLeft + boardOffset.x;
    const boardTop = layoutBoardTop + boardOffset.y;
    const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(boardLeft, boardTop, boardWidth, boardHeight);
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
        boardWidth,
        boardHeight,
        mazeLeft,
        mazeTop,
        mazeRenderFrame.boardWidth,
        mazeRenderFrame.boardHeight,
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
      for (let y = 0; y < this.maze.height; y += 1) {
        for (let x = 0; x < this.maze.width; x += 1) {
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

  // The title, Login, and Start words are all built from the same tile-glyph
  // material and should read as one consistent size -- Start/Login derive
  // their cell size from the primary button's own width/height (see
  // createButton's glyphCellSize), so that's the reference the title's own,
  // otherwise-independent fontSize-driven sizing gets overridden to match.
  // Only affects layout (cell/pixel size); titlePresentation's own fontSize
  // still governs unrelated things like shadow offset and alpha.
  private resolveLegacyMenuGlyphReferenceCellSize(): number {
    const glyphColumns = resolveLegacyGlyphWordColumns('Start');
    const glyphPaddingX = Math.max(10, Math.round(this.layout.centerButtonWidth * 0.1));
    const glyphPaddingY = Math.max(6, Math.round(this.layout.buttonHeight * 0.14));
    const cellSizeFromWidth = Math.floor(
      Math.max(1, this.layout.centerButtonWidth - (glyphPaddingX * 2)) / Math.max(1, glyphColumns)
    );
    const cellSizeFromHeight = Math.floor(Math.max(1, this.layout.buttonHeight - (glyphPaddingY * 2)) / 7);
    return Math.max(2, Math.min(10, cellSizeFromWidth, cellSizeFromHeight));
  }

  private resolveLegacyMenuPathTitleFontSize(): number {
    return this.resolveLegacyMenuGlyphReferenceCellSize() * 9;
  }

  private resolveLegacyMenuPathTitlePieceCount(): number {
    const titleLayout = resolveLegacyMenuPathTitleLayout(
      this.layout.titleX,
      this.layout.titleY,
      this.resolveLegacyMenuPathTitleFontSize()
    );

    return titleLayout.cells.length;
  }

  private resolveLegacyMenuPathTitleVisiblePieceCount(): number {
    return this.resolveLegacyMenuPathTitleVisiblePieces(this.resolveLegacyMenuPathTitlePieceCount());
  }

  private hasLegacyMenuTitleAnimationPendingFrame(time: number): boolean {
    // Play mode has no title text to animate, but it now shares the same
    // orbit-sigil decoration drawn by the same function -- without this,
    // the sigils would only redraw whenever boardPathDirty happened to be
    // set for some unrelated reason, freezing in place the rest of the
    // time instead of orbiting smoothly.
    if (
      (this.mode !== 'menu' && this.mode !== 'play')
      || this.overlay !== 'none'
      || this.prefersLegacyReducedMotion()
    ) {
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
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'width' | 'height'>,
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
    edgeAlpha: number,
    facing = -Math.PI / 2
  ): void {
    // "facing" points the diamond's long axis (its top vertex) toward a
    // direction of travel or, when frozen, toward the viewport center --
    // rotate all 4 vertices around the center by that angle instead of the
    // old fixed axis-aligned diamond.
    const rotate = (dx: number, dy: number): { x: number; y: number } => {
      const cos = Math.cos(facing + (Math.PI / 2));
      const sin = Math.sin(facing + (Math.PI / 2));
      return { x: centerX + (dx * cos) - (dy * sin), y: centerY + (dx * sin) + (dy * cos) };
    };
    const top = rotate(0, -radius);
    const right = rotate(radius, 0);
    const bottom = rotate(0, radius);
    const left = rotate(-radius, 0);

    // A tiny crystal-facet tile (the same flat-fill-plus-rim material as
    // the maze corridor/title cells) rotated into a diamond, instead of a
    // generic two-tone gem shape -- reads as a small maze tile orbiting the
    // screen edge rather than jewelry.
    this.titleGraphics.fillStyle(fillColor, fillAlpha);
    this.titleGraphics.fillTriangle(top.x, top.y, right.x, right.y, bottom.x, bottom.y);
    this.titleGraphics.fillTriangle(top.x, top.y, left.x, left.y, bottom.x, bottom.y);
    this.titleGraphics.lineStyle(Math.max(1, radius * 0.16), edgeColor, edgeAlpha);
    this.strokeLegacyPolyline(this.titleGraphics, [top, right, bottom, left, top]);
    // Small white catchlight on the leading upper edge, the same convention
    // every other crystal-facet element (tiles, markers, the settings gear)
    // uses for its highlight.
    this.titleGraphics.lineStyle(Math.max(1, radius * 0.14), cyberArcadeMaterial.rail.white, edgeAlpha * 0.68);
    this.strokeLegacyPolyline(this.titleGraphics, [left, top, right]);
  }

  // Eases the orbit sigils from wherever they were spinning down to their
  // frozen resting phase (0) over a fixed short window instead of snapping
  // there the instant the maze finishes building/deconstructing -- a hard
  // cut to phase 0 could jump every sigil across a large chunk of the
  // perimeter in a single frame depending on where the wall-clock spin
  // happened to be. Takes the shorter way around the loop (never more than
  // half an orbit) so the ease never reverses direction mid-travel.
  private resolveLegacyMenuPathTitleOrbitSettlePhase(time: number): number {
    const settleDurationMs = 480;
    if (this.menuOrbitSettleStartedAtMs === null) {
      this.menuOrbitSettleStartedAtMs = time;
      this.menuOrbitSettlePhaseStart = this.resolveLegacyMenuPathTitleOrbitPhase(time);
    }
    const elapsed = time - this.menuOrbitSettleStartedAtMs;
    const t = clamp(elapsed / settleDurationMs, 0, 1);
    const eased = 1 - ((1 - t) ** 3);
    const start = this.menuOrbitSettlePhaseStart;
    const shortestDelta = ((-start % 1) + 1.5) % 1 - 0.5;
    return ((start + (shortestDelta * eased)) % 1 + 1) % 1;
  }

  private drawLegacyMenuPathTitleOrbitSigils(
    titleLayout: ReturnType<typeof resolveLegacyMenuPathTitleLayout>,
    time: number,
    alphaScale: number
  ): void {
    // Only orbit while the maze is actively building or deconstructing --
    // otherwise freeze at phase 0, which (with 8 evenly-spaced sigils)
    // lands exactly on the 4 corners and 4 edge midpoints instead of
    // drifting continuously while the board sits idle.
    const isLifecycleSpinActive = this.menuStaticDrawLifecyclePhase === 'building'
      || this.menuStaticDrawLifecyclePhase === 'deconstructing';
    const orbitPhase = isLifecycleSpinActive
      ? this.resolveLegacyMenuPathTitleOrbitPhase(time)
      : this.resolveLegacyMenuPathTitleOrbitSettlePhase(time);
    if (isLifecycleSpinActive) {
      this.menuOrbitSettleStartedAtMs = null;
    }
    // Orbits the viewport's own edge instead of hugging the title glyph --
    // same relocation the deconstruct handoff burst got earlier, just for
    // the title's sparkle sigils.
    const inset = 2;
    const orbitGeometry: LegacyMenuPathTitleOrbitGeometry = {
      bottom: this.layout.height - inset,
      centerX: this.layout.width / 2,
      centerY: this.layout.height / 2,
      crownBottom: this.layout.height - inset,
      crownHalf: titleLayout.cellSize * 0.56,
      crownTop: inset,
      left: inset,
      right: this.layout.width - inset,
      top: inset
    };

    for (let index = 0; index < LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS; index += 1) {
      const orbit = (orbitPhase + (index / LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS)) % 1;
      const { x, y } = resolveLegacyMenuPathTitleOrbitPoint(orbitGeometry, orbit);
      const facing = this.resolveLegacyMenuPathTitleOrbitFacing(orbit, x, y, orbitGeometry, isLifecycleSpinActive);

      const wave = isLifecycleSpinActive
        ? 0.62 + (Math.sin((orbitPhase * Math.PI * 2) + (index * 1.38)) * 0.28)
        : 0.62;
      // Smaller than the previous pass and using the same pale-core/teal-rim
      // colors as the actual corridor and title tiles instead of the
      // warm/gem gem-tone alternation, so these read as small maze tiles
      // orbiting the edge rather than jewelry.
      const radius = Math.max(4, Math.round(6 + (wave * 3)));
      const alpha = clamp((0.22 + (wave * 0.3)) * alphaScale, 0.16, 0.56);

      this.drawLegacyMenuPathTitleDiamond(
        x,
        y,
        radius,
        LEGACY_MENU_PATH_CORE,
        alpha * 0.85,
        LEGACY_MENU_PATH_EDGE,
        alpha,
        facing
      );
    }
  }

  // Points each sigil in its direction of travel along the perimeter, but
  // banks it inward toward the viewport center while it's rounding a
  // corner (the perimeter is a sharp rectangle, not a rounded track, so
  // this is what makes the turn read as a curve instead of a snap) --
  // and while frozen (idle), every sigil just points straight at center.
  private resolveLegacyMenuPathTitleOrbitFacing(
    orbit: number,
    x: number,
    y: number,
    geometry: LegacyMenuPathTitleOrbitGeometry,
    isLifecycleSpinActive: boolean
  ): number {
    const centerFacing = Math.atan2(geometry.centerY - y, geometry.centerX - x);
    if (!isLifecycleSpinActive) {
      return centerFacing;
    }

    const perimeter = (((orbit % 1) + 1) % 1) * 4;
    const segment = Math.floor(perimeter) % 4;
    const segmentTangents = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const tangent = segmentTangents[segment] ?? 0;
    const withinSegment = perimeter - Math.floor(perimeter);
    const distanceToCorner = Math.min(withinSegment, 1 - withinSegment);
    const cornerWindow = 0.15;
    const cornerProximity = clamp(1 - (distanceToCorner / cornerWindow), 0, 1);
    const lerpAngleShortest = (from: number, to: number, t: number): number => {
      const twoPi = Math.PI * 2;
      const diff = (((to - from) % twoPi) + (twoPi * 1.5)) % twoPi - Math.PI;
      return from + (diff * t);
    };

    return lerpAngleShortest(tangent, centerFacing, cornerProximity * 0.55);
  }

  // One continuous loop: fill (0..1), hold, revert (0..1), hold. Fill and
  // revert share the same bottom-left-to-top-right ordering (see
  // resolveLegacyMenuTitleTrailCellFillAmount) -- revert isn't a mirrored
  // sweep, it's the same front erasing the color behind it.
  private resolveLegacyMenuTitleTrailSweepFrame(time: number): {
    phase: 'filling' | 'reverting';
    progress: number;
  } {
    const fillMs = LEGACY_MENU_TITLE_TRAIL_SWEEP_FILL_MS;
    const holdMs = LEGACY_MENU_TITLE_TRAIL_SWEEP_HOLD_MS;
    const revertMs = LEGACY_MENU_TITLE_TRAIL_SWEEP_REVERT_MS;
    const cycleMs = fillMs + holdMs + revertMs + holdMs;
    const cursor = ((time % cycleMs) + cycleMs) % cycleMs;

    if (cursor < fillMs) {
      return { phase: 'filling', progress: cursor / fillMs };
    }
    if (cursor < fillMs + holdMs) {
      return { phase: 'filling', progress: 1 };
    }
    if (cursor < fillMs + holdMs + revertMs) {
      return { phase: 'reverting', progress: (cursor - fillMs - holdMs) / revertMs };
    }
    return { phase: 'reverting', progress: 1 };
  }

  // 0 at the bottom-left cell, 1 at the top-right cell -- a single diagonal
  // metric that embodies "left to right" (rising with column) and "bottom
  // to top" (rising as row decreases, since row 0 is the top) at once,
  // instead of two independent sweeps.
  private resolveLegacyMenuTitleTrailCellMetric(
    cell: LegacyMenuPathTitleCell,
    columns: number,
    rows: number
  ): number {
    const maxColumn = Math.max(1, columns - 1);
    const maxRow = Math.max(1, rows - 1);
    const raw = cell.column + (maxRow - cell.row);
    return clamp(raw / (maxColumn + maxRow), 0, 1);
  }

  // How "trail-colored" this cell is right now, 0 (its own core/edge color)
  // to 1 (fully the trail color) -- soft-banded around the sweep front so
  // tiles cross-fade instead of snapping.
  private resolveLegacyMenuTitleTrailCellFillAmount(
    cellMetric: number,
    sweepFrame: { phase: 'filling' | 'reverting'; progress: number }
  ): number {
    const band = LEGACY_MENU_TITLE_TRAIL_SWEEP_SOFT_BAND;
    const edgeAmount = clamp(((sweepFrame.progress - cellMetric) / band) + 0.5, 0, 1);
    return sweepFrame.phase === 'filling' ? edgeAmount : 1 - edgeAmount;
  }

  private drawLegacyMenuPathTitle(time: number): void {
    this.titleGraphics.clear();
    // The orbit sigils (4 corners + 4 edge midpoints) are a screen-wide
    // ambient decoration, not really part of the title itself -- they now
    // render in play mode too (still gated off during overlays), even
    // though play mode has no "MAZER" wordmark to go with them, since the
    // edge diamonds were the specific thing reported missing there. The
    // actual title glyphs stay menu-only below.
    const sigilsVisible = (this.mode === 'menu' || this.mode === 'play') && this.overlay === 'none';
    this.titleGraphics.setVisible(sigilsVisible);
    if (!sigilsVisible) {
      return;
    }
    const titleTextVisible = this.mode === 'menu';

    const titlePresentation = resolveLegacyMenuTitlePresentation(
      this.layout.titleReserveHeight,
      this.layout.tileSize,
      this.layout.height > this.layout.width,
      this.layout.width,
      this.maze.source === 'menu-generated' ? 'procedural' : 'snapshot'
    );
    const titleLayout = resolveLegacyMenuPathTitleLayout(
      this.layout.titleX,
      this.layout.titleY,
      this.resolveLegacyMenuPathTitleFontSize()
    );
    const visiblePieceCount = this.resolveLegacyMenuPathTitleVisiblePieces(titleLayout.cells.length);
    const visibleCells = titleLayout.cells.slice(0, visiblePieceCount);
    const titlePathSource: Pick<LegacyMazeSnapshot, 'grid' | 'width' | 'height'> = {
      grid: titleLayout.grid,
      width: titleLayout.columns,
      height: titleLayout.rows
    };

    if (titleTextVisible && visibleCells.length > 0) {
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

    if (titleTextVisible && visibleCells.length > 0) {
      // A trail-color wipe loops across the title tiles while it's on
      // screen -- see resolveLegacyMenuTitleTrailSweepFrame's comment for
      // the fill/hold/revert/hold cycle this drives.
      const trailSweepFrame = this.resolveLegacyMenuTitleTrailSweepFrame(time);
      const trailColor = resolveLegacyIridescentTrailColor(
        0,
        1,
        time,
        this.resolveActiveLegacyProgressionPalette().trailColor
      );
      for (const cell of visibleCells) {
        const cellMetric = this.resolveLegacyMenuTitleTrailCellMetric(
          cell,
          titleLayout.columns,
          titleLayout.rows
        );
        const fillAmount = this.resolveLegacyMenuTitleTrailCellFillAmount(cellMetric, trailSweepFrame);
        const cellCoreColor = fillAmount > 0
          ? mixLegacyIridescentColor(LEGACY_MENU_PATH_CORE, trailColor, fillAmount)
          : LEGACY_MENU_PATH_CORE;
        const cellEdgeColor = fillAmount > 0
          ? mixLegacyIridescentColor(LEGACY_MENU_PATH_EDGE, trailColor, fillAmount)
          : LEGACY_MENU_PATH_EDGE;
        this.drawLegacyMenuPathTitleCell(
          cell,
          titlePathSource,
          titleLayout.left,
          titleLayout.top,
          titleLayout.cellSize,
          {
            coreAlpha: 0.92 * titlePresentation.titleAlpha,
            coreColor: cellCoreColor,
            edgeAlpha: LEGACY_MENU_PATH_EDGE_ALPHA * titlePresentation.titleAlpha,
            edgeColor: cellEdgeColor
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
    boardWidth: number,
    boardHeight: number
  ): LegacyMazeRenderFrame {
    const boardSize = Math.min(boardWidth, boardHeight);
    const safeInset = clamp(
      Math.round(boardSize * LEGACY_BOARD_MAZE_SAFE_INSET_RATIO),
      LEGACY_BOARD_MAZE_SAFE_INSET_MIN,
      LEGACY_BOARD_MAZE_SAFE_INSET_MAX
    );
    const renderWidth = Math.max(1, boardWidth - (safeInset * 2));
    const renderHeight = Math.max(1, boardHeight - (safeInset * 2));

    return {
      boardLeft: boardLeft + safeInset,
      boardTop: boardTop + safeInset,
      boardWidth: renderWidth,
      boardHeight: renderHeight,
      tileSize: Math.min(renderWidth / Math.max(1, this.maze.width), renderHeight / Math.max(1, this.maze.height)),
      safeInset
    };
  }

  private resolveLegacyBoardTopCenterNotchBounds(
    boardLeft: number,
    boardTop: number,
    boardWidth: number
  ): VisualRect {
    const inset = 2;
    const outerLeft = boardLeft - inset;
    const outerTop = boardTop - inset;
    const outerWidth = boardWidth + (inset * 2);
    const mid = Math.max(7, Math.round(boardWidth * 0.028));
    const halfWidth = Math.max(mid + 5, Math.round(boardWidth * 0.046));
    const top = Math.round(outerTop - 1);
    const bottom = Math.round(outerTop + mid + Math.max(Math.round(boardWidth * 0.04), 13));
    const centerX = outerLeft + (outerWidth / 2);

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
    viewportWidth: number,
    viewportHeight: number,
    progress: number
  ): void {
    if (progress <= 0 || progress >= 1) {
      return;
    }

    const inset = 2;
    const left = inset;
    const top = inset;
    const right = viewportWidth - inset;
    const bottom = viewportHeight - inset;
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;
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

  // Play mode's trail/pulse should only ever show the perfect route from the
  // start tile to wherever the player currently stands -- not the player's
  // raw, append-only move history (which grows to cover dead ends and
  // backtracks and was the source of both the "colored in weird" look and
  // the messy ping-pong pulse the player actually walked).
  // Restricted to tiles the player has actually stepped on -- searching the
  // full maze grid (as this originally did) can route the "perfect path"
  // through a shortcut the player never walked, which reads as the trail
  // jumping onto tiles they didn't visit. Building a visited-only grid and
  // running the same shortest-path search against that instead guarantees
  // every tile in the result is one the player's own trail already covers.
  private resolveLegacyPlayPerfectPathTrail(): LegacyPoint[] {
    const visitedGrid = this.maze.grid.map((row) => row.map(() => false));
    const markVisited = (point: LegacyPoint): void => {
      if (visitedGrid[point.y]?.[point.x] !== undefined) {
        visitedGrid[point.y]![point.x] = true;
      }
    };
    for (const point of this.trail) {
      markVisited(point);
    }
    markVisited(this.maze.start);
    markVisited(this.player);

    const result = resolveLegacyPlayableShortestPath(visitedGrid, this.maze.start, this.player);
    if (result.found && result.path.length > 0) {
      return result.path;
    }
    return [copyPoint(this.player)];
  }

  private drawDynamicBoard(time: number): void {
    const { boardLeft, boardTop, boardWidth, boardHeight } = this.layout;
    this.boardDynamicGraphics.clear();

    const trail = this.mode === 'menu'
      ? this.trail
      : buildPathTrail(this.resolveLegacyPlayPerfectPathTrail(), this.settings.toggleTrailFade ? TRAIL_FADE_TAIL : null);
    const visibleTrail = trail.filter((point) => this.isLegacyMenuPointVisibleInStaticDraw(point));
    // resolveLegacyMenuDeconstructTrailAlpha only reads menuStaticDrawLifecyclePhase
    // (shared by both surfaces, "menu" in the name is just legacy) -- it was
    // gated to menu mode here for no reason tied to the function itself, which
    // meant play mode's trail sat at full brightness through the whole
    // deconstruct animation and only vanished abruptly once the new maze
    // swapped in, instead of fading out with the tiles like the menu does.
    const menuTrailAlphaMultiplier = this.resolveLegacyMenuDeconstructTrailAlpha(time);
    const dynamicTrailPathSource = this.maze;
    const boardOffset = this.resolveBoardOffset();
    const resolvedBoardLeft = boardLeft + boardOffset.x;
    const resolvedBoardTop = boardTop + boardOffset.y;
    const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(
      resolvedBoardLeft,
      resolvedBoardTop,
      boardWidth,
      boardHeight
    );
    const mazeLeft = mazeRenderFrame.boardLeft;
    const mazeTop = mazeRenderFrame.boardTop;
    const mazeTileSize = mazeRenderFrame.tileSize;
    const progressionPalette = this.resolveActiveLegacyProgressionPalette();
    const renderedPlayerPoint = this.resolveLegacyRenderedPlayerPoint(time);

    this.drawLegacyBleedOffGlow(
      time,
      resolvedBoardLeft,
      resolvedBoardTop,
      boardWidth,
      boardHeight,
      mazeLeft,
      mazeTop,
      mazeRenderFrame.boardWidth,
      mazeRenderFrame.boardHeight,
      mazeTileSize,
      progressionPalette.trailColor
    );
    this.drawLegacyProgressionBadge();
    this.drawLegacyMenuSettingsCog(time);

    for (let index = 0; index < visibleTrail.length; index += 1) {
      const point = visibleTrail[index];
      if (!point) {
        continue;
      }
      // Never color the start/goal tiles or whichever tile the player is
      // currently standing on -- the start/goal markers already draw their
      // own glow on top (a trail fill underneath just muddies it), and
      // leaving the player's own tile uncolored reads as "you are here"
      // more clearly than a solid trail-colored square the marker sits on.
      const isStartTile = point.x === this.maze.start.x && point.y === this.maze.start.y;
      const isGoalTile = point.x === this.maze.goal.x && point.y === this.maze.goal.y;
      const isCurrentPlayerTile = point.x === renderedPlayerPoint.x && point.y === renderedPlayerPoint.y;
      if (isStartTile || isGoalTile || isCurrentPlayerTile) {
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
          resolvedTrailAlpha
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
          boardWidth,
          boardHeight,
          mazeLeft,
          mazeTop,
          mazeRenderFrame.boardWidth,
          mazeRenderFrame.boardHeight,
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
          resolvedTrailAlpha
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
          boardWidth,
          boardHeight,
          mazeLeft,
          mazeTop,
          mazeRenderFrame.boardWidth,
          mazeRenderFrame.boardHeight,
          mazeTileSize,
          dynamicTrailPathSource
        );
      }
    }

    // Start/end and the player marker are the "cast" of the maze, and all
    // three now fade out together on the exact same deconstruct timer, well
    // ahead of the tile-by-tile grid removal below -- previously the player
    // faded first but start/goal stayed at full opacity until whichever
    // moment the tile-sweep happened to reach their specific cell, often
    // one of the very last things left on screen instead of the first.
    const markerDeconstructAlpha = this.resolveLegacyMenuDeconstructPlayerAlpha(time);
    // Held back during 'building' so start/goal appear together with the
    // player once the maze finishes building out, instead of popping in
    // individually the moment the tile-by-tile reveal happens to reach
    // their own cell -- the whole "cast" places at once, same as it now
    // also all clears at once on deconstruct (see markerDeconstructAlpha
    // above).
    const markersBuiltIn = this.menuStaticDrawLifecyclePhase !== 'building';
    // Drawn after the trail (not before) so the start/goal tiles always sit
    // on top of the trail's coloring instead of getting painted over
    // whenever the trail passes through those cells.
    if (markersBuiltIn && markerDeconstructAlpha > 0 && this.maze.start && this.isLegacyMenuPointVisibleInStaticDraw(this.maze.start)) {
      this.fillPlayDynamicMarkerTile(this.maze.start, mazeLeft, mazeTop, mazeTileSize, 0.9 * markerDeconstructAlpha, 'start');
    }
    if (markersBuiltIn && markerDeconstructAlpha > 0 && this.maze.goal && this.isLegacyMenuPointVisibleInStaticDraw(this.maze.goal)) {
      this.fillPlayDynamicMarkerTile(this.maze.goal, mazeLeft, mazeTop, mazeTileSize, 0.95 * markerDeconstructAlpha, 'goal', time);
    }

    this.drawLegacyPlayStaticSlowTile(mazeLeft, mazeTop, mazeTileSize, time);
    this.drawLegacyPlayPatrolAgent(mazeLeft, mazeTop, mazeTileSize, time);

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

    if (this.isLegacyTrailShineVisible()) {
      if (menuTrailAlphaMultiplier > 0 && this.menuStaticDrawLifecyclePhase !== 'deconstructing') {
        this.drawLegacyPlayDynamicTrailPulse(
          visibleTrail,
        mazeLeft,
        mazeTop,
        resolvedBoardLeft,
        resolvedBoardTop,
        boardWidth,
        boardHeight,
        mazeRenderFrame.boardWidth,
        mazeRenderFrame.boardHeight,
        mazeTileSize,
        time,
        dynamicTrailPathSource,
          progressionPalette,
          this.mode === 'play'
        );
      }
    }

    const playerAlpha = markerDeconstructAlpha;
    if (this.mode === 'menu') {
      if (
        markersBuiltIn
        && this.menuStaticDrawLifecyclePhase !== 'deconstructing'
        && this.isLegacyMenuPointVisibleInStaticDraw(this.player)
      ) {
        this.fillLegacyPlayerMarkerTile(renderedPlayerPoint, mazeLeft, mazeTop, mazeTileSize, 0.94 * playerAlpha, false, progressionPalette, time);
      }
    } else {
      if (
        playerAlpha > 0
        && markersBuiltIn
        && this.isLegacyMenuPointVisibleInStaticDraw(this.player)
      ) {
        this.fillLegacyPlayerMarkerTile(renderedPlayerPoint, mazeLeft, mazeTop, mazeTileSize, playerAlpha, true, progressionPalette, time);
      }
    }

    this.drawLegacyPlayPatrolCollisionRecovery(mazeLeft, mazeTop, mazeTileSize, time);
    this.drawLegacyPlayPatrolPendingIntent(mazeLeft, mazeTop, mazeTileSize, time);

    if (this.mode === 'menu' || this.mode === 'play') {
      this.drawLegacyMenuDeconstructHandoffBurst(
        this.layout.width,
        this.layout.height,
        this.resolveLegacyMenuDeconstructHandoffProgress(time)
      );
      this.drawLegacyMenuDeconstructHandoffBurst(
        this.layout.width,
        this.layout.height,
        this.resolveLegacyMenuBuildPrerollProgress(time)
      );
    }
    this.boardDynamicDirty = false;
  }

  private refreshLegacyPatrolCollisionVisualState(active: boolean): void {
    const nextActive = this.mode === 'play' && active;
    if (nextActive || this.playPatrolCollisionVisualActive !== nextActive) {
      this.boardDynamicDirty = true;
    }
    this.playPatrolCollisionVisualActive = nextActive;
  }

  private drawLegacyPlayStaticSlowTile(
    mazeLeft: number,
    mazeTop: number,
    tileSize: number,
    time: number
  ): void {
    const placement = this.playStaticSlowTile?.placement;
    if (this.mode !== 'play' || placement === null || placement === undefined) {
      return;
    }

    const centerX = mazeLeft + ((placement.point.x + 0.5) * tileSize);
    const centerY = mazeTop + ((placement.point.y + 0.5) * tileSize);
    const radius = Math.max(1.5, tileSize * 0.34);
    const phase = resolveLegacyStaticSlowTilePhase(
      this.playStaticSlowTile,
      time,
      this.playStartedAtMs
    );
    const color = this.playStaticSlowTile?.consumed
      ? LEGACY_PLAY_SLOW_TILE_SPENT
      : phase.active
        ? LEGACY_PLAY_SLOW_TILE_CORE
        : LEGACY_PLAY_SLOW_TILE_EDGE;
    const edge = this.playStaticSlowTile?.consumed
      ? LEGACY_PLAY_SLOW_TILE_SPENT
      : phase.active
        ? LEGACY_PLAY_SLOW_TILE_EDGE
        : LEGACY_PLAY_SLOW_TILE_CORE;
    const alpha = this.playStaticSlowTile?.consumed
      ? 0.58
      : phase.active
        ? 0.96
        : 0.48;

    this.boardDynamicGraphics.fillStyle(color, alpha * 0.32);
    this.boardDynamicGraphics.fillCircle(centerX, centerY, radius);
    this.boardDynamicGraphics.fillStyle(color, alpha);
    this.boardDynamicGraphics.beginPath();
    this.boardDynamicGraphics.moveTo(centerX, centerY - radius);
    this.boardDynamicGraphics.lineTo(centerX + radius, centerY);
    this.boardDynamicGraphics.lineTo(centerX, centerY + radius);
    this.boardDynamicGraphics.lineTo(centerX - radius, centerY);
    this.boardDynamicGraphics.closePath();
    this.boardDynamicGraphics.fillPath();
    this.boardDynamicGraphics.lineStyle(Math.max(1, tileSize * 0.08), edge, alpha);
    this.boardDynamicGraphics.strokePath();
    this.boardDynamicGraphics.lineStyle(Math.max(1, tileSize * 0.07), cyberArcadeMaterial.substrate.field, alpha);
    this.boardDynamicGraphics.beginPath();
    this.boardDynamicGraphics.moveTo(centerX - (radius * 0.42), centerY);
    this.boardDynamicGraphics.lineTo(centerX + (radius * 0.42), centerY);
    this.boardDynamicGraphics.strokePath();
  }

  private drawLegacyPlayPatrolAgent(
    mazeLeft: number,
    mazeTop: number,
    tileSize: number,
    time: number
  ): void {
    const point = resolveLegacyPatrolAgentPoint(this.playPatrolAgent);
    if (this.mode !== 'play' || point === null) {
      return;
    }

    const telegraph = resolveLegacyPatrolAgentTelegraph(
      this.playPatrolAgent,
      time,
      this.playStartedAtMs,
      this.resolveLegacyWorldTurnHostState() === 'running'
    );
    const collisionFeedback = resolveLegacyPatrolAgentCollisionFeedback(
      this.playPatrolAgent,
      time
    );
    if (collisionFeedback.active) {
      const playerX = mazeLeft + ((this.player.x + 0.5) * tileSize);
      const playerY = mazeTop + ((this.player.y + 0.5) * tileSize);
      const elapsedRatio = (collisionFeedback.elapsedMs ?? 0)
        / LEGACY_PATROL_AGENT_COLLISION_FEEDBACK_WINDOW_MS;
      const impactRadius = Math.max(2, tileSize * (0.34 + (elapsedRatio * 0.24)));
      this.boardDynamicGraphics.lineStyle(
        Math.max(1, tileSize * 0.1),
        LEGACY_PLAY_PATROL_COLLISION_FEEDBACK,
        Math.max(0.24, 0.92 - (elapsedRatio * 0.68))
      );
      this.boardDynamicGraphics.strokeCircle(playerX, playerY, impactRadius);
    }
    if (telegraph.active && telegraph.nextPoint) {
      const targetX = mazeLeft + ((telegraph.nextPoint.x + 0.5) * tileSize);
      const targetY = mazeTop + ((telegraph.nextPoint.y + 0.5) * tileSize);
      const targetRadius = Math.max(1.5, tileSize * 0.28);
      const urgency = 1 - ((telegraph.msUntilStep ?? LEGACY_PATROL_AGENT_TELEGRAPH_WINDOW_MS)
        / LEGACY_PATROL_AGENT_TELEGRAPH_WINDOW_MS);
      const alpha = 0.34 + (urgency * 0.42);
      this.boardDynamicGraphics.lineStyle(
        Math.max(1, tileSize * 0.08),
        LEGACY_PLAY_PATROL_TELEGRAPH,
        alpha
      );
      this.boardDynamicGraphics.strokeCircle(targetX, targetY, targetRadius * 1.24);
      this.boardDynamicGraphics.beginPath();
      this.boardDynamicGraphics.moveTo(targetX, targetY - targetRadius);
      this.boardDynamicGraphics.lineTo(targetX + targetRadius, targetY);
      this.boardDynamicGraphics.lineTo(targetX, targetY + targetRadius);
      this.boardDynamicGraphics.lineTo(targetX - targetRadius, targetY);
      this.boardDynamicGraphics.closePath();
      this.boardDynamicGraphics.strokePath();
    }

    const centerX = mazeLeft + ((point.x + 0.5) * tileSize);
    const centerY = mazeTop + ((point.y + 0.5) * tileSize);
    const radius = Math.max(1.5, tileSize * 0.3);
    this.boardDynamicGraphics.fillStyle(LEGACY_PLAY_PATROL_CORE, 0.24);
    this.boardDynamicGraphics.fillCircle(centerX, centerY, radius * 1.42);
    this.boardDynamicGraphics.fillStyle(LEGACY_PLAY_PATROL_CORE, 0.94);
    this.boardDynamicGraphics.fillCircle(centerX, centerY, radius);
    this.boardDynamicGraphics.lineStyle(
      Math.max(1, tileSize * 0.08),
      LEGACY_PLAY_PATROL_EDGE,
      0.96
    );
    this.boardDynamicGraphics.beginPath();
    this.boardDynamicGraphics.moveTo(centerX, centerY - radius);
    this.boardDynamicGraphics.lineTo(centerX + radius, centerY);
    this.boardDynamicGraphics.lineTo(centerX, centerY + radius);
    this.boardDynamicGraphics.lineTo(centerX - radius, centerY);
    this.boardDynamicGraphics.closePath();
    this.boardDynamicGraphics.strokePath();
    this.boardDynamicGraphics.lineStyle(
      Math.max(1, tileSize * 0.06),
      cyberArcadeMaterial.substrate.field,
      0.94
    );
    this.boardDynamicGraphics.beginPath();
    this.boardDynamicGraphics.moveTo(centerX - (radius * 0.45), centerY);
    this.boardDynamicGraphics.lineTo(centerX + (radius * 0.45), centerY);
    this.boardDynamicGraphics.moveTo(centerX, centerY - (radius * 0.45));
    this.boardDynamicGraphics.lineTo(centerX, centerY + (radius * 0.45));
    this.boardDynamicGraphics.strokePath();
  }

  private drawLegacyPlayPatrolCollisionRecovery(
    mazeLeft: number,
    mazeTop: number,
    tileSize: number,
    time: number
  ): void {
    const collisionRecovery = resolveLegacyPatrolAgentCollisionRecovery(
      this.playPatrolAgent,
      time
    );
    if (this.mode !== 'play' || !collisionRecovery.active) {
      return;
    }

    const playerX = mazeLeft + ((this.player.x + 0.5) * tileSize);
    const playerY = mazeTop + ((this.player.y + 0.5) * tileSize);
    const recoveryRatio = (collisionRecovery.elapsedMs ?? 0)
      / LEGACY_PATROL_AGENT_COLLISION_RECOVERY_WINDOW_MS;
    const recoveryRadius = Math.max(2, tileSize * (0.58 - (recoveryRatio * 0.24)));
    this.boardDynamicGraphics.lineStyle(
      Math.max(1, tileSize * 0.08),
      LEGACY_PLAY_PATROL_COLLISION_RECOVERY,
      Math.min(0.92, 0.32 + (recoveryRatio * 0.6))
    );
    this.boardDynamicGraphics.strokeCircle(playerX, playerY, recoveryRadius);
  }

  private drawLegacyPlayPatrolPendingIntent(
    mazeLeft: number,
    mazeTop: number,
    tileSize: number,
    time: number
  ): void {
    const pendingIntent = this.playPatrolAgent?.pendingCollisionIntent ?? null;
    if (
      this.mode !== 'play'
      || pendingIntent === null
      || !isLegacyPatrolAgentDelayActive(this.playPatrolAgent, time)
      || Math.abs(pendingIntent.deltaX) + Math.abs(pendingIntent.deltaY) !== 1
    ) {
      return;
    }

    const playerX = mazeLeft + ((this.player.x + 0.5) * tileSize);
    const playerY = mazeTop + ((this.player.y + 0.5) * tileSize);
    const tipDistance = Math.max(3, tileSize * 0.48);
    const chevronDepth = Math.max(2, tileSize * 0.2);
    const chevronWidth = Math.max(2, tileSize * 0.16);
    const tipX = playerX + (pendingIntent.deltaX * tipDistance);
    const tipY = playerY + (pendingIntent.deltaY * tipDistance);
    const baseX = tipX - (pendingIntent.deltaX * chevronDepth);
    const baseY = tipY - (pendingIntent.deltaY * chevronDepth);
    const perpendicularX = -pendingIntent.deltaY * chevronWidth;
    const perpendicularY = pendingIntent.deltaX * chevronWidth;

    this.boardDynamicGraphics.lineStyle(
      Math.max(1, tileSize * 0.1),
      LEGACY_PLAY_PATROL_PENDING_INTENT,
      0.96
    );
    this.boardDynamicGraphics.beginPath();
    this.boardDynamicGraphics.moveTo(baseX + perpendicularX, baseY + perpendicularY);
    this.boardDynamicGraphics.lineTo(tipX, tipY);
    this.boardDynamicGraphics.lineTo(baseX - perpendicularX, baseY - perpendicularY);
    this.boardDynamicGraphics.strokePath();
  }

  private drawLegacyProgressionBadge(): VisualRect | null {
    // Active play exposes the player's compact level glyph. The menu demo has
    // its own independent AI level, so the menu must never imply that its
    // animated board is driven by the signed-in player's current difficulty.
    if (this.overlay !== 'none') {
      this.clearLegacyPlayerProgressionBadge();
      this.clearLegacyMenuAiProgressionBadge();
      return null;
    }

    if (this.mode === 'menu') {
      // The front door no longer surfaces the demo AI's own level -- it was
      // read as "your level" by players even though it tracks an
      // independent, invisible AI progression track, not anything the
      // player has done.
      this.clearLegacyPlayerProgressionBadge();
      this.clearLegacyMenuAiProgressionBadge();
      return null;
    }

    const playerTrack = this.progressionState.tracks.player;
    const playerBadgeBounds = this.drawLegacyProgressionGlyph(
      playerTrack,
      resolveLegacyProgressionPalette(playerTrack, 'player')
    );
    this.clearLegacyMenuAiProgressionBadge();
    return playerBadgeBounds;
  }

  private clearLegacyPlayerProgressionBadge(): void {
    this.progressionBadgeBounds = null;
    this.progressionBadgeLabelBounds = null;
    this.progressionBadgeTextBounds = null;
    this.progressionBadgeTextFits = false;
    this.progressionBadgeText.setVisible(false);
    this.progressionBadgeLabelText.setVisible(false);
  }

  // "LVL" reads immediately left of the level number as one intuitive pair
  // instead of the number centered under a label floating up in the corner.
  // The label shrinks first (via fitLegacyUiTextToWidth) if the pair would
  // overflow the small square badge frame at wider (two-digit) levels. There
  // is no background panel behind this pair any more -- a dark stroke on
  // both texts is what keeps them readable over the animated board instead.
  private layoutLegacyHeaderMetricPair(
    frame: LegacyHeaderControlFrame,
    numberText: Phaser.GameObjects.Text,
    labelText: Phaser.GameObjects.Text,
    numberScale: number
  ): void {
    const inset = Math.max(2, Math.round(frame.width * 0.04));
    const gap = Math.max(2, Math.round(frame.width * 0.06));
    const strokeThickness = Math.max(2, Math.round(frame.width * 0.09));
    numberText.setStroke('#02040a', strokeThickness);
    labelText.setStroke('#02040a', Math.max(1, Math.round(strokeThickness * 0.7)));
    const numberWidth = numberText.width * numberScale;
    const maxLabelFontSize = Math.max(9, Math.round(frame.height * 0.3));
    const availableLabelWidth = Math.max(8, frame.width - (inset * 2) - gap - numberWidth);
    this.fitLegacyUiTextToWidth(labelText, availableLabelWidth, maxLabelFontSize, 7, 1);
    const pairWidth = labelText.width + gap + numberWidth;
    const pairLeft = frame.centerX - (pairWidth / 2);
    const centerY = frame.centerY + Math.round(frame.height * 0.06);
    labelText.setPosition(pairLeft + (labelText.width / 2), centerY);
    numberText.setPosition(pairLeft + labelText.width + gap + (numberWidth / 2), centerY);
  }

  private drawLegacyProgressionGlyph(
    track: LegacyProgressionState['tracks'][LegacyProgressionTrackId],
    palette: LegacyProgressionPalette
  ): VisualRect {
    const laneTop = this.layout.lanes.hud?.top ?? 0;
    const laneHeight = this.layout.lanes.hud?.height ?? 64;
    const frame = resolveLegacyHeaderControlFrame({
      height: this.layout.height,
      hudHeight: laneHeight,
      hudTop: laneTop,
      placement: 'leading',
      width: this.layout.width
    });
    const badgePulse = this.resolveLegacyProgressionBadgePulse();
    // Same classic blink phase/rate as the play HUD's own settings cog
    // (drawLegacySettingsCogControl) -- the LVL number should read as
    // "alive" at the same cadence as the cog beside it, not sit static
    // while only its rare level-up scale pulse (badgePulse above) moves it.
    const blinkPhase = (Math.sin((this.time.now / LEGACY_MENU_BLINK_PULSE_MS) * Math.PI * 2) + 1) / 2;
    const blinkAlpha = clamp(0.22 + (blinkPhase * 0.78), 0.14, 1);
    // No panel, border, or corner brackets at all -- matches the menu
    // surface's own settings cog (zero chrome). layoutLegacyHeaderMetricPair
    // below already gives both texts a dark stroke, which is what actually
    // keeps this legible over the animated board without a background box.
    this.progressionBadgeText
      .setText(String(track.level))
      .setFontSize(resolveLegacyHeaderControlMetricFontSize(track.level, frame.width))
      .setAlign('center')
      .setLineSpacing(0)
      .setPadding(0)
      .setColor(palette.badgeColor)
      .setScale(badgePulse)
      .setAlpha(blinkAlpha)
      .setVisible(true);
    this.progressionBadgeLabelText
      .setText('LVL')
      .setColor(palette.badgeColor)
      .setVisible(true);
    this.layoutLegacyHeaderMetricPair(frame, this.progressionBadgeText, this.progressionBadgeLabelText, badgePulse);

    const badgeBounds = createVisualRect(frame.left, frame.top, frame.width, frame.height);
    const rawLabelBounds = this.progressionBadgeLabelText.getBounds();
    const rawTextBounds = this.progressionBadgeText.getBounds();
    this.progressionBadgeBounds = badgeBounds;
    this.progressionBadgeLabelBounds = createVisualRect(
      rawLabelBounds.x,
      rawLabelBounds.y,
      rawLabelBounds.width,
      rawLabelBounds.height
    );
    this.progressionBadgeTextBounds = createVisualRect(
      rawTextBounds.x,
      rawTextBounds.y,
      rawTextBounds.width,
      rawTextBounds.height
    );
    this.progressionBadgeTextFits = true;

    return badgeBounds;
  }

  private clearLegacyMenuAiProgressionBadge(): void {
    this.menuAiProgressionBadgeBounds = null;
    this.menuAiProgressionBadgeLabelBounds = null;
    this.menuAiProgressionBadgeTextBounds = null;
    this.menuAiProgressionBadgeTextFits = false;
    this.menuAiProgressionBadgeText.setVisible(false);
    this.menuAiProgressionBadgeLabelText.setVisible(false);
  }

  private drawLegacyMenuSettingsCog(time: number): void {
    if (this.mode !== 'menu' || this.overlay !== 'none') {
      return;
    }

    const laneTop = this.layout.lanes.hud?.top ?? 0;
    const frame = resolveLegacyHeaderControlFrame({
      height: this.layout.height,
      hudHeight: this.layout.lanes.hud?.height ?? 64,
      hudTop: laneTop,
      placement: 'trailing',
      width: this.layout.width
    });
    // No background panel, tint, or border -- the gear is the whole control,
    // sized to roughly match the LVL badge's visual weight instead of
    // sitting inside a chrome-bordered box (the in-play touch pause cog
    // keeps its smaller default ratio, since that one still has a panel
    // behind it to leave room inside). The Mazer signature green instead of
    // the generic white/mint touch-icon colors or cyan, matching the LVL
    // badge/player/trail green that reads as "Mazer" everywhere else.
    // Same classic blink/grow-shrink pulse as the Start/Login glyphs --
    // scales the radius ratio and multiplies every alpha in the draw call
    // (there's no single object to setScale/setAlpha on here, since the
    // gear is drawn straight onto the shared board graphics layer).
    const phase = (Math.sin((time / LEGACY_MENU_BLINK_PULSE_MS) * Math.PI * 2) + 1) / 2;
    const blinkAlpha = clamp(0.22 + (phase * 0.78) + (this.menuSettingsCogActive ? 0.08 : 0), 0.14, 1);
    const blinkScale = 0.92 + (phase * 0.08) + (this.menuSettingsCogActive ? 0.02 : 0);
    this.drawLegacySettingsCog(
      this.boardDynamicGraphics,
      frame,
      this.menuSettingsCogActive,
      0.34 * blinkScale,
      cyberArcadeMaterial.signal.player,
      cyberArcadeMaterial.rail.mint,
      blinkAlpha
    );
  }

  private hasLegacyProgressionBadgePulsePendingFrame(time: number): boolean {
    if (this.progressionBadgePulseStartedAtMs === null || this.legacyReducedMotionEnabled === true) {
      this.progressionBadgePulseStartedAtMs = null;
      return false;
    }
    if (time - this.progressionBadgePulseStartedAtMs >= 420) {
      this.progressionBadgePulseStartedAtMs = null;
      return false;
    }
    return true;
  }

  private resolveLegacyProgressionBadgePulse(): number {
    if (this.progressionBadgePulseStartedAtMs === null || this.legacyReducedMotionEnabled === true) {
      return 1;
    }
    const progress = Math.max(0, Math.min(1, (this.time.now - this.progressionBadgePulseStartedAtMs) / 420));
    return 1 + (Math.sin(progress * Math.PI) * 0.12);
  }

  private resolveLegacyPlayElapsedMs(): number {
    if (
      this.mode !== 'play'
      || shouldFreezeLegacyPlayElapsedForStaticDraw({
        drawPhase: this.menuStaticDrawLifecyclePhase,
        rowsVisible: this.menuStaticDrawRowsVisible,
        tilesVisible: this.menuStaticDrawTilesVisible
      })
    ) {
      return 0;
    }

    return resolveLegacyFrozenElapsedMs({
      completedAtMs: this.playCompletedAtMs,
      nowMs: this.time.now,
      startedAtMs: this.playStartedAtMs
    });
  }

  private resolveBoardOffset(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(0, 0);
  }

  // The trail used to fill the whole tile (drawLegacyPathMaterialTile, the
  // same connectivity-aware material every corridor tile uses), then a
  // centered diamond matching the player marker's old shape. Now that the
  // player is an 85%-fill square (LEGACY_PLAYER_MARKER_SQUARE_FILL_RATIO),
  // the trail instead colors in the border margin around that same-sized
  // square -- the strip of tile that would be visible "white space" around
  // the player if it were standing there. Drawn as two opposite-wound
  // rects in one fill path (outer tile bounds, inner square hole), which
  // the canvas nonzero winding rule renders as a hollow frame. No corridor-
  // connectivity framing is needed for a fixed-size centered hole, so this
  // doesn't touch pathSource at all.
  private drawLegacyTrailBorder(
    graphics: Phaser.GameObjects.Graphics,
    point: LegacyPoint,
    originX: number,
    originY: number,
    tileSize: number,
    coreColor: number,
    coreAlpha: number,
    edgeColor: number,
    edgeAlpha: number
  ): void {
    const left = originX + (point.x * tileSize);
    const top = originY + (point.y * tileSize);
    const innerSide = tileSize * LEGACY_PLAYER_MARKER_SQUARE_FILL_RATIO;
    const inset = Math.max(1, (tileSize - innerSide) / 2);

    graphics.fillStyle(coreColor, coreAlpha);
    graphics.beginPath();
    graphics.moveTo(left, top);
    graphics.lineTo(left + tileSize, top);
    graphics.lineTo(left + tileSize, top + tileSize);
    graphics.lineTo(left, top + tileSize);
    graphics.closePath();
    graphics.moveTo(left + inset, top + inset);
    graphics.lineTo(left + inset, top + tileSize - inset);
    graphics.lineTo(left + tileSize - inset, top + tileSize - inset);
    graphics.lineTo(left + tileSize - inset, top + inset);
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(Math.max(1, inset * 0.4), edgeColor, edgeAlpha);
    graphics.strokeRect(left + inset, top + inset, tileSize - (inset * 2), tileSize - (inset * 2));
  }

  private fillLegacyMenuDynamicPathTile(
    point: LegacyPoint,
    color: number,
    originX: number,
    originY: number,
    tileSize: number,
    alpha: number
  ): void {
    this.drawLegacyTrailBorder(
      this.boardDynamicGraphics,
      point,
      originX,
      originY,
      tileSize,
      color,
      Math.min(0.92, 0.92 * alpha),
      LEGACY_MENU_PATH_EDGE,
      Math.min(LEGACY_MENU_PATH_EDGE_ALPHA, LEGACY_MENU_PATH_EDGE_ALPHA * alpha)
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

  private drawLegacyMenuAiMemoryOverlay(
    originX: number,
    originY: number,
    tileSize: number,
    alphaMultiplier: number,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'width' | 'height'>,
    time: number
  ): void {
    const { optionPoints, targetPoint } = this.resolveLegacyMenuAiMemoryPoints();
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

    const targetPulse = 0.5 + (0.5 * Math.sin(time / 150));
    // Edges only, no fill -- the AI's current tile should read as an outline
    // marking its position, not a solid color wash over the whole cell.
    this.drawLegacyTileEdgeOutline(
      this.boardDynamicGraphics,
      targetPoint,
      originX,
      originY,
      tileSize,
      LEGACY_MENU_AI_MEMORY_TARGET_EDGE,
      clamp(0.66 + (targetPulse * 0.28), 0.58, 0.98) * alphaMultiplier
    );
  }

  private drawLegacyTileEdgeOutline(
    graphics: Phaser.GameObjects.Graphics,
    point: LegacyPoint,
    originX: number,
    originY: number,
    tileSize: number,
    color: number,
    alpha: number
  ): void {
    const tileRect = this.resolveLegacyPixelTileRect(originX, originY, tileSize, point);
    const lineWidth = Math.max(1, Math.round(Math.min(tileRect.width, tileRect.height) * 0.12));
    const inset = lineWidth / 2;
    graphics.lineStyle(lineWidth, color, alpha);
    graphics.strokeRect(
      tileRect.left + inset,
      tileRect.top + inset,
      tileRect.width - lineWidth,
      tileRect.height - lineWidth
    );
  }

  private fillLegacyPlayDynamicPathTile(
    point: LegacyPoint,
    color: number,
    originX: number,
    originY: number,
    tileSize: number,
    alpha: number
  ): void {
    this.drawLegacyTrailBorder(
      this.boardDynamicGraphics,
      point,
      originX,
      originY,
      tileSize,
      color,
      Math.min(0.96, 0.96 * alpha),
      LEGACY_PLAY_PATH_EDGE,
      Math.min(LEGACY_PLAY_PATH_EDGE_ALPHA, LEGACY_PLAY_PATH_EDGE_ALPHA * alpha)
    );
  }

  private drawLegacyPlayDynamicTrailPulse(
    trail: readonly LegacyPoint[],
    originX: number,
    originY: number,
    boardLeft: number,
    boardTop: number,
    boardWidth: number,
    boardHeight: number,
    mazeWidth: number,
    mazeHeight: number,
    tileSize: number,
    time: number,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'width' | 'height'>,
    palette: LegacyProgressionPalette,
    useOneWaySweep: boolean
  ): void {
    if (trail.length < 2) {
      return;
    }

    const pulseCenterIndex = useOneWaySweep
      ? resolveLegacyTrailPulseSweepMotion({
        timeMs: time,
        trailLength: trail.length
      }).centerIndex
      : resolveLegacyTrailShineMotion({
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
        boardWidth,
        boardHeight,
        originX,
        originY,
        mazeWidth,
        mazeHeight,
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
    boardWidth: number,
    boardHeight: number,
    mazeLeft: number,
    mazeTop: number,
    mazeWidth: number,
    mazeHeight: number,
    tileSize: number,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'width' | 'height'>
  ): void {
    this.drawLegacyPathBorderDock(
      this.boardDynamicGraphics,
      point,
      pathSource,
      boardLeft,
      boardTop,
      boardWidth,
      boardHeight,
      mazeLeft,
      mazeTop,
      mazeWidth,
      mazeHeight,
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
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'width' | 'height'>,
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
    kind: 'start' | 'goal',
    time?: number
  ): void {
    // Uses the exact same rounded tile-rect math as every corridor tile
    // (resolveLegacyPixelTileRect) instead of re-deriving one from a center
    // point, so the glow lands pixel-identical in size/position to the real
    // tile underneath it.
    const tileRect = this.resolveLegacyPixelTileRect(originX, originY, tileSize, point);
    this.drawLegacyEndpointGlow(this.boardDynamicGraphics, tileRect, alpha, kind, time);
  }

  // The actual maze tile underneath is left completely alone (drawBoardPaths
  // already renders it as a normal corridor tile) -- this just lays a soft
  // colored glow plus a small bright catchlight on top for visibility,
  // instead of recoloring the whole tile. Per feedback that restyling the
  // entire tile was more than needed; a simple glow reads as "marked" just
  // as clearly without fighting the corridor's own material underneath it.
  private drawLegacyEndpointGlow(
    graphics: Phaser.GameObjects.Graphics,
    tileRect: LegacyPixelTileRect,
    alpha: number,
    kind: 'start' | 'goal',
    time?: number
  ): void {
    const color = kind === 'goal' ? LEGACY_PLAY_GOAL_MARKER_CORE : LEGACY_PLAY_START_MARKER_CORE;
    const centerX = tileRect.left + (tileRect.width / 2);
    const centerY = tileRect.top + (tileRect.height / 2);
    const maxRadius = Math.min(tileRect.width, tileRect.height) * 0.5;
    // A slight continuous pulse on the goal marker only, for extra
    // visibility -- same sine-blink cadence as the LVL badge/settings cog.
    // Callers that don't pass `time` (e.g. the Guide overlay's static
    // legend icon) get no pulse. boardDynamicDirty is already re-armed
    // every play-mode frame (see the LVL badge's own comment on this in
    // update()), so this animates continuously for free.
    const pulse = kind === 'goal' && time !== undefined
      ? (Math.sin((time / LEGACY_MENU_BLINK_PULSE_MS) * Math.PI * 2) + 1) / 2
      : 0;
    const pulseScale = 1 + (pulse * 0.12);
    const pulseAlphaBoost = pulse * 0.12;

    graphics.fillStyle(color, Math.min(0.9, alpha + pulseAlphaBoost) * 0.22);
    graphics.fillCircle(centerX, centerY, maxRadius * 1.2 * pulseScale);
    graphics.fillStyle(color, Math.min(0.9, alpha + pulseAlphaBoost) * 0.45);
    graphics.fillCircle(centerX, centerY, maxRadius * 0.78 * pulseScale);
    graphics.fillStyle(color, Math.min(0.96, alpha + pulseAlphaBoost));
    graphics.fillCircle(centerX, centerY, maxRadius * 0.4 * pulseScale);
    graphics.fillStyle(cyberArcadeMaterial.rail.white, Math.min(0.75, alpha * 0.8));
    graphics.fillCircle(centerX - (maxRadius * 0.14), centerY - (maxRadius * 0.14), maxRadius * 0.13);
  }

  // A small bright arc on the upper-left of a circular shape, as if a
  // single light source were catching a cut facet -- same "light hits one
  // corner" convention as drawLegacyPathTileFacet, for the round settings
  // gear icon (the start/goal markers are square now and use the tile rim
  // treatment directly instead of this).
  private drawLegacyMarkerGemCatchlight(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    outerRadius: number,
    alpha: number
  ): void {
    graphics.lineStyle(Math.max(1, outerRadius * 0.16), cyberArcadeMaterial.rail.white, Math.min(0.85, alpha * 0.9));
    graphics.beginPath();
    graphics.arc(centerX, centerY, outerRadius * 0.62, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(260));
    graphics.strokePath();
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

    const playerCoreColor = resolveLegacyIridescentPlayerCoreColor(time);
    const iridescentAccentColor = resolveLegacyIridescentPlayerAccentColor(time, playerCoreColor);

    // A small squash-and-stretch along the direction of travel while the
    // player is gliding between tiles -- the square is the only shape left
    // now that the halo/beacon rings are gone, so tying ITS animation
    // directly to movement is what gives the marker any sense of motion
    // instead of a rigid icon sliding in a straight line.
    const motion = this.playerVisualMotion;
    const halfSide = (tileSize * LEGACY_PLAYER_MARKER_SQUARE_FILL_RATIO) / 2;
    let coreRadiusX = halfSide;
    let coreRadiusY = halfSide;
    if (motion !== null && motion.durationMs > 0 && time < motion.startedAtMs + motion.durationMs) {
      const progress = clamp((time - motion.startedAtMs) / motion.durationMs, 0, 1);
      const dx = motion.to.x - motion.from.x;
      const dy = motion.to.y - motion.from.y;
      const stretchAmount = Math.sin(progress * Math.PI) * 0.18;
      const along = 1 + stretchAmount;
      const across = 1 - (stretchAmount * 0.6);
      const horizontalMove = Math.abs(dx) >= Math.abs(dy);
      coreRadiusX = halfSide * (horizontalMove ? along : across);
      coreRadiusY = halfSide * (horizontalMove ? across : along);
    }

    // Continuous idle breathing pulse, on top of whatever the squash-
    // stretch above already did -- see LEGACY_PLAY_PLAYER_IDLE_BREATHE_*.
    if (showLocatorTicks && !this.prefersLegacyReducedMotion()) {
      const breathePhase = Math.sin((time / LEGACY_PLAY_PLAYER_IDLE_BREATHE_PERIOD_MS) * Math.PI * 2);
      const breatheScale = 1 + (breathePhase * LEGACY_PLAY_PLAYER_IDLE_BREATHE_AMOUNT);
      coreRadiusX *= breatheScale;
      coreRadiusY *= breatheScale;
    }

    // No more shadow disc or halo/beacon rings -- the square (which already
    // color-shifts through the midnight-rainbow cycle) is the whole marker
    // now, plus its cut-gem catchlight.
    this.boardDynamicGraphics.fillStyle(playerCoreColor, alpha);
    this.boardDynamicGraphics.fillRect(
      centerX - coreRadiusX,
      centerY - coreRadiusY,
      coreRadiusX * 2,
      coreRadiusY * 2
    );
    this.boardDynamicGraphics.lineStyle(
      Math.max(1, playerMetrics.strokeWidth * 0.58),
      showLocatorTicks ? LEGACY_PLAY_PLAYER_BEACON_ACCENT : iridescentAccentColor,
      Math.min(0.86, alpha * 0.86)
    );
    this.boardDynamicGraphics.strokeRect(
      centerX - coreRadiusX,
      centerY - coreRadiusY,
      coreRadiusX * 2,
      coreRadiusY * 2
    );
    // Same facet-catchlight convention as the tiles/endpoint markers, cut
    // into the top-left corner of the player's own square core.
    this.boardDynamicGraphics.fillStyle(cyberArcadeMaterial.rail.white, Math.min(0.6, alpha * 0.65));
    this.boardDynamicGraphics.beginPath();
    this.boardDynamicGraphics.moveTo(centerX - coreRadiusX, centerY - coreRadiusY);
    this.boardDynamicGraphics.lineTo(centerX - (coreRadiusX * 0.35), centerY - coreRadiusY);
    this.boardDynamicGraphics.lineTo(centerX - coreRadiusX, centerY - (coreRadiusY * 0.35));
    this.boardDynamicGraphics.closePath();
    this.boardDynamicGraphics.fillPath();

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

  // Movement had zero tactile feedback anywhere in the codebase (confirmed
  // no navigator.vibrate call existed before this). The Vibration API is a
  // no-op where unsupported (desktop, iOS Safari) so this is a pure
  // progressive enhancement -- guarded defensively since calling a missing
  // method (rather than just reading an undefined property) throws.
  private triggerLegacyHapticPulse(pattern: number | number[]): void {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
      return;
    }

    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers throw when vibration is blocked (no user gesture yet,
      // permissions policy, etc.) -- movement itself must never fail over a
      // missing tactile nicety.
    }
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
    if (from.x === to.x && from.y === to.y || this.prefersLegacyReducedMotion()) {
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
    const playerCoreColor = resolveLegacyIridescentPlayerCoreColor(time);
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
        pulse: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS,
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
    const alpha = rect.alpha ?? 0.9;
    const panelRect = snapCyberArcadeRect(rect);
    const { height, left, top, width } = panelRect;
    const radius = this.resolveLegacyRoundedRectRadius(width, height, rect.radius ?? 10);
    const active = rect.active ?? false;
    graphics.fillStyle(LEGACY_CYBER_PANEL_SHADOW, Math.min(0.28, alpha * 0.28));
    graphics.fillRoundedRect(left + 1, top + 2, width, height, radius);
    graphics.fillStyle(rect.fill ?? LEGACY_CYBER_PANEL_FILL, alpha);
    graphics.fillRoundedRect(left, top, width, height, radius);
    const stroke = rect.stroke ?? LEGACY_CYBER_PANEL_STROKE;
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
  }

  // The primary Start/Login action has no button shape at all -- no fill,
  // stroke, or panel -- and no rendered-font text either: the word itself is
  // built from the exact same tile material as the title and the maze
  // corridor (drawLegacyPathMaterialTile, same core/edge colors), so it
  // reads as made of the same substance as everything else on the board
  // instead of separately-rendered text. Drawn fresh every frame in LOCAL
  // coordinates (the containing Graphics object is positioned at the
  // button's x/y).
  // Mirrors the title's own build/glow/deconstruct treatment (see
  // drawLegacyMenuPathTitle) so Login/Start read as made of the same
  // animated material -- pieces reveal in the same shared lifecycle
  // progress the title uses (this.resolveLegacyMenuPathTitleProgress isn't
  // actually title-specific, just named for its original caller) and the
  // same looping green trail-color wash sweeps across whatever's currently
  // visible. Deliberately skips the title's extra flourishes (gem facets,
  // prism sweep, orbit sigils, leading-edge cursor accent) -- just the
  // three behaviors asked for: build out, glow green, deconstruct.
  private drawLegacyMenuFrontDoorGlyphButton(
    graphics: Phaser.GameObjects.Graphics,
    layout: LegacyGlyphWordLayout,
    time: number,
    active = false
  ): void {
    graphics.clear();
    const pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'width' | 'height'> = {
      grid: layout.grid,
      height: layout.rows,
      width: layout.columns
    };
    const visiblePieceCount = this.resolveLegacyMenuPathTitleVisiblePieces(layout.cells.length);
    const visibleCells = layout.cells.slice(0, visiblePieceCount);
    if (visibleCells.length <= 0) {
      return;
    }

    const trailSweepFrame = this.resolveLegacyMenuTitleTrailSweepFrame(time);
    const trailColor = resolveLegacyIridescentTrailColor(
      0,
      1,
      time,
      this.resolveActiveLegacyProgressionPalette().trailColor
    );
    for (const cell of visibleCells) {
      const cellMetric = this.resolveLegacyMenuTitleTrailCellMetric(
        { column: cell.column, order: 0, row: cell.row },
        layout.columns,
        layout.rows
      );
      const fillAmount = this.resolveLegacyMenuTitleTrailCellFillAmount(cellMetric, trailSweepFrame);
      const cellCoreColor = fillAmount > 0
        ? mixLegacyIridescentColor(LEGACY_MENU_PATH_CORE, trailColor, fillAmount)
        : LEGACY_MENU_PATH_CORE;
      const cellEdgeColor = fillAmount > 0
        ? mixLegacyIridescentColor(LEGACY_MENU_PATH_EDGE, trailColor, fillAmount)
        : LEGACY_MENU_PATH_EDGE;
      this.drawLegacyPathMaterialTile(
        graphics,
        { x: cell.column, y: cell.row },
        pathSource,
        layout.left,
        layout.top,
        layout.cellSize,
        {
          coreAlpha: active ? 1 : 0.95,
          coreColor: cellCoreColor,
          drawCue: false,
          edgeAlpha: active ? 0.94 : 0.85,
          edgeColor: cellEdgeColor
        }
      );
    }
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

  private padLegacyCompactUiText<T extends Phaser.GameObjects.Text>(text: T): T {
    this.applyLegacyUiTextCrispness(text);
    text.setPadding(8, 1, 8, 1);
    return text;
  }

  private fitLegacyUiTextToWidth<T extends Phaser.GameObjects.Text>(
    text: T,
    maxWidth: number,
    maxFontSize: number,
    minFontSize: number,
    physicalWidthSafetyRatio = 1
  ): T {
    const safeWidthRatio = Math.max(0.5, Math.min(1, physicalWidthSafetyRatio));
    const safeMaxWidth = Math.max(1, Math.floor(maxWidth * safeWidthRatio));
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
    this.hudTouchControlBounds = null;
    this.hudFrame = null;
    if (this.mode !== 'play' || this.overlay !== 'none') {
      this.footerText.setText('');
      return;
    }
    this.footerText.setText('');

    const touchControlLayout = this.resolveLegacyPlayTouchControlLayout();
    const hudFrame = resolveLegacyPlayHudFrame({
      elapsedMs: this.resolveLegacyPlayElapsedMs(),
      layoutWidth: this.layout.width,
      safeAreaTop: readMazerViewportGeometry().safeArea.top
    });

    this.hudTouchControlBounds = this.drawLegacyPlayTouchControls(time, touchControlLayout);

    this.hudTimerBounds = createVisualRect(
      hudFrame.timerBounds.left,
      hudFrame.timerBounds.top,
      hudFrame.timerBounds.width,
      hudFrame.timerBounds.height
    );
    this.hudBounds = this.hudTimerBounds;
    this.hudFrame = hudFrame;
  }

  private hasLegacyPlayTrailPulsePendingFrame(time: number): boolean {
    const active = this.isLegacyTrailShineVisible() && this.overlay === 'none' && this.trail.length > 1;
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

  // Movement no longer has a fixed on-screen widget at all -- the board is
  // full-bleed (see legacyMenuLayout.ts's useFloatingTouchControls) and a
  // stick only appears, centered exactly where the touch landed, while a
  // finger is actually down (playFloatingStickOrigin). The pause cog is the
  // one control that stays fixed, since it's a discrete tap target the
  // player needs to be able to find reliably rather than a drag surface.
  private drawLegacyPlayTouchControls(
    time: number,
    touchControlLayout = this.resolveLegacyPlayTouchControlLayout()
  ): VisualRect | null {
    if (!this.shouldRenderLegacyPlayTouchControls(touchControlLayout)) {
      return null;
    }

    const { controls } = touchControlLayout;
    // No live pressed-state tracking for this control (matches the
    // pre-existing behavior) -- always idle-colored, just now with the
    // same blink pulse as the menu cog.
    this.drawLegacySettingsCogControl(this.hudGraphics, controls.pause, false, time);

    if (this.playFloatingStickOrigin === null) {
      return createVisualRect(controls.pause.left, controls.pause.top, controls.pause.width, controls.pause.height);
    }

    const stick = this.resolveLegacyPlayFloatingStickGeometry(this.playFloatingStickOrigin);
    this.drawLegacyPlayFloatingStickGlow(stick, this.playTouchStickPull);
    this.drawLegacyPlayTouchStick(stick, this.resolveLegacyPlayHeldTouchControl(), this.playTouchStickPull);
    return createVisualRect(
      stick.outer.left,
      stick.outer.top,
      stick.outer.width,
      stick.outer.height
    );
  }

  // The visual rework: a soft halo in the player's own trail color instead
  // of the old fixed dpad's generic touch-icon palette, so the floating
  // stick reads as "this game's" control rather than a boilerplate virtual
  // joystick, and brightens slightly whenever it's actually being pulled in
  // a direction so the feedback loop between thumb and knob is legible.
  private drawLegacyPlayFloatingStickGlow(
    stick: NonNullable<ReturnType<typeof resolveTouchControlLayout>['stick']>,
    pullVector: TouchStickPullVector | null
  ): void {
    const glowColor = this.resolveActiveLegacyProgressionPalette().trailColor;
    const centerX = stick.outer.centerX;
    const centerY = stick.outer.centerY;
    const haloRadius = (stick.outer.width / 2) + Math.max(6, Math.round(stick.outer.width * 0.08));
    const pulled = pullVector !== null;
    // Lightened along with the size shrink above -- less visual weight
    // sitting over the maze while idle, still brightens on an active pull.
    this.hudGraphics.fillStyle(glowColor, pulled ? 0.12 : 0.06);
    this.hudGraphics.fillCircle(centerX, centerY, haloRadius);
    this.hudGraphics.lineStyle(pulled ? 2.5 : 1.5, glowColor, pulled ? 0.46 : 0.22);
    this.hudGraphics.strokeCircle(centerX, centerY, haloRadius);
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
    const knobRadius = stick.knobRadius;
    let knobX = centerX;
    let knobY = centerY;

    const travel = stick.travelRadius;
    if (pullVector !== null) {
      knobX += pullVector.normalizedX * travel;
      knobY += pullVector.normalizedY * travel;
    } else if (activeControl !== null) {
      const vector = resolveHumanMovementActionVector(activeControl);
      const length = Math.hypot(vector.deltaX, vector.deltaY) || 1;
      knobX += (vector.deltaX / length) * travel;
      knobY += (vector.deltaY / length) * travel;
    }

    // Fill and spokes lightened -- less visual weight sitting over the maze
    // while idle; the stroke/knob (the parts that actually carry state)
    // keep their original strength so legibility doesn't suffer.
    this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_BUTTON_FILL, 0.18);
    this.hudGraphics.fillCircle(centerX, centerY, outerRadius);
    this.hudGraphics.lineStyle(3, activeControl === null ? LEGACY_PLAY_TOUCH_BUTTON_STROKE : LEGACY_PLAY_TOUCH_ACCENT, activeControl === null ? 0.42 : 0.76);
    this.hudGraphics.strokeCircle(centerX, centerY, outerRadius);
    this.hudGraphics.lineStyle(1, LEGACY_PLAY_TOUCH_ICON, 0.11);
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      this.hudGraphics.beginPath();
      this.hudGraphics.moveTo(centerX + (Math.cos(angle) * (innerRadius + 8)), centerY + (Math.sin(angle) * (innerRadius + 8)));
      this.hudGraphics.lineTo(centerX + (Math.cos(angle) * (outerRadius - 8)), centerY + (Math.sin(angle) * (outerRadius - 8)));
      this.hudGraphics.strokePath();
    }
    this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_COG_HUB, 0.45);
    this.hudGraphics.fillCircle(centerX, centerY, innerRadius);
    this.hudGraphics.lineStyle(2, LEGACY_PLAY_TOUCH_BUTTON_STROKE, 0.38);
    this.hudGraphics.strokeCircle(centerX, centerY, innerRadius);
    // The deadzone was invisible before -- it existed only in the hit-test
    // math (resolveStickPullVector), so a small pull near center registered
    // nothing with no visual explanation why. A faint boundary ring makes
    // the dead center legible without competing with the hub/outer rings.
    this.hudGraphics.lineStyle(1, LEGACY_PLAY_TOUCH_ICON, 0.22);
    this.hudGraphics.strokeCircle(centerX, centerY, stick.deadzoneRadius);
    this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_ACCENT, activeControl === null ? 0.28 : 0.5);
    this.hudGraphics.fillCircle(knobX, knobY, knobRadius);
    this.hudGraphics.lineStyle(2, LEGACY_PLAY_TOUCH_ICON, activeControl === null ? 0.52 : 0.86);
    this.hudGraphics.strokeCircle(knobX, knobY, knobRadius);
  }

  // Matches the menu surface's own settings cog's colors and blink pulse
  // exactly. Size does NOT come along for free just from sharing the
  // radiusRatio (0.34): the menu cog draws inside resolveLegacyHeaderControl-
  // Frame's compact 36-40px icon box, while `rect` here is the real touch
  // hit-target (tuned for thumb reach, deliberately bigger for ergonomics) --
  // the same ratio applied to a bigger box drew a visibly bigger gear. Drawn
  // size is pinned to the menu cog's own formula, centered within the real
  // (unchanged) touch target, so the tap region stays generous while the
  // glyph itself matches menu.
  private drawLegacySettingsCogControl(
    graphics: Phaser.GameObjects.Graphics,
    rect: ReturnType<typeof resolveTouchControlLayout>['controls']['pause'],
    active: boolean,
    time: number
  ): void {
    const phase = (Math.sin((time / LEGACY_MENU_BLINK_PULSE_MS) * Math.PI * 2) + 1) / 2;
    const blinkAlpha = clamp(0.22 + (phase * 0.78) + (active ? 0.08 : 0), 0.14, 1);
    const blinkScale = 0.92 + (phase * 0.08) + (active ? 0.02 : 0);
    const visualSize = clamp(Math.round(Math.min(this.layout.width, this.layout.height) * 0.085), 36, 40);
    const visualRect = {
      centerX: rect.centerX,
      centerY: rect.centerY,
      width: visualSize,
      height: visualSize
    };
    this.drawLegacySettingsCog(
      graphics,
      visualRect,
      active,
      0.34 * blinkScale,
      cyberArcadeMaterial.signal.player,
      cyberArcadeMaterial.rail.mint,
      blinkAlpha
    );
  }

  // A solid filled gear silhouette (fillPath over an alternating
  // outer/inner-radius polygon) instead of a thin multi-stroke wireframe --
  // the tiles and markers are solid filled shapes with a rim highlight, and
  // the old wireframe cog was the one element on screen still built out of
  // bare line segments, which read as a mismatched, generic "tech icon"
  // instead of belonging to the same crystal-facet family.
  private drawLegacySettingsCog(
    graphics: Phaser.GameObjects.Graphics,
    rect: Pick<VisualRect, 'centerX' | 'centerY' | 'height' | 'width'>,
    active = false,
    radiusRatio = 0.2,
    idleColor: number = LEGACY_PLAY_TOUCH_ICON,
    activeColor: number = LEGACY_PLAY_TOUCH_ACCENT,
    alphaMultiplier = 1
  ): void {
    const outerRadius = Math.max(7, Math.round(Math.min(rect.width, rect.height) * radiusRatio));
    const innerRadius = Math.max(4, Math.round(outerRadius * 0.66));
    const hubRadius = Math.max(2, Math.round(outerRadius * 0.32));
    const teeth = 8;
    const pointCount = teeth * 2;
    const color = active ? activeColor : idleColor;

    graphics.fillStyle(color, (active ? 0.94 : 0.86) * alphaMultiplier);
    graphics.beginPath();
    for (let index = 0; index < pointCount; index += 1) {
      const angle = ((index / pointCount) * Math.PI * 2) - (Math.PI / 2);
      const pointRadius = index % 2 === 0 ? outerRadius : innerRadius;
      const px = rect.centerX + (Math.cos(angle) * pointRadius);
      const py = rect.centerY + (Math.sin(angle) * pointRadius);
      if (index === 0) {
        graphics.moveTo(px, py);
      } else {
        graphics.lineTo(px, py);
      }
    }
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(Math.max(1, Math.round(outerRadius * 0.08)), color, (active ? 1 : 0.9) * alphaMultiplier);
    graphics.strokePath();

    graphics.fillStyle(LEGACY_PLAY_TOUCH_COG_HUB, 0.82 * alphaMultiplier);
    graphics.fillCircle(rect.centerX, rect.centerY, hubRadius);
    graphics.lineStyle(Math.max(1, Math.round(outerRadius * 0.08)), color, (active ? 0.9 : 0.76) * alphaMultiplier);
    graphics.strokeCircle(rect.centerX, rect.centerY, hubRadius);
    // Same cut-gem catchlight as the player/start/goal markers -- ties the
    // gear into the crystal-facet family instead of reading as a plain
    // generic tech icon.
    this.drawLegacyMarkerGemCatchlight(graphics, rect.centerX, rect.centerY, outerRadius, (active ? 0.9 : 0.7) * alphaMultiplier);
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
    this.progressionBadgeText.setVisible(this.mode === 'play' && this.overlay === 'none');
    this.progressionBadgeLabelText.setVisible(this.mode === 'play' && this.overlay === 'none');
    // The menu front door no longer shows the demo AI's level badge (see
    // drawLegacyProgressionBadge) -- keep these permanently hidden here too
    // instead of relying on frame ordering against that per-frame clear.
    this.menuAiProgressionBadgeText.setVisible(false);
    this.menuAiProgressionBadgeLabelText.setVisible(false);

    if (this.overlay === 'none') {
      if (this.mode === 'menu') {
        const [startLabel] = MAIN_MENU_BUTTONS;
        const isAuthenticated = this.authSnapshot.status === 'authenticated';
        // A normal compact button (the same width the row-of-three action
        // geometry already computes), not a full-width bottom-dock bar --
        // per feedback that the wide dock-style bar didn't work.
        const primaryButtonWidth = this.layout.centerButtonWidth;

        if (!isAuthenticated) {
          this.uiButtons.push(
            this.createButton(
              this.layout.centerButtonX,
              this.layout.centerButtonY,
              primaryButtonWidth,
              this.layout.buttonHeight,
              'Login',
              () => this.openOverlay('auth'),
              { fullScreenHitArea: true }
            )
          );
        } else {
          this.uiButtons.push(
            this.createButton(
              this.layout.centerButtonX,
              this.layout.centerButtonY,
              primaryButtonWidth,
              this.layout.buttonHeight,
              startLabel,
              () => this.startPlayMode(),
              { fullScreenHitArea: true }
            )
          );
        }
        this.uiButtons.push(this.createLegacyMenuSettingsCogButton(() => this.openOverlay('options')));
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
    // Settings and pause retain the calm animated-board dimmer. Account entry
    // is intentionally opaque: credentials and account identity never share a
    // translucent surface with the moving game board behind it.
    this.overlayGraphics.fillStyle(0x02040a, this.overlay === 'auth' ? 1 : 0.82);
    this.overlayGraphics.fillRect(0, 0, this.layout.width, this.layout.height);
  }

  private resolveOverlayPanelFrame(): OverlayPanelFrame {
    return resolveLegacyOverlayPanelLayout(
      this.layout.width,
      this.layout.height,
      readMazerViewportGeometry().safeArea
    );
  }

  private visualRectToLegacyOverlayScrollRect(rect: VisualRect): LegacyOverlayScrollRect {
    return {
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width
    };
  }

  private resolveLegacyOverlayScrollRenderViewport(metrics: LegacyOverlayScrollMetrics): VisualRect {
    return this.legacyOverlayScrollRectToVisualRect(
      resolveLegacyOverlayScrollRenderRect(metrics.viewport)
    );
  }

  private resolveFeatureControlRowsContentHeight(
    panel: OverlayPanelFrame,
    options: { includeControlStyle?: boolean; includeMovementSpeed?: boolean; showDescriptions?: boolean } = {}
  ): number {
    const stacked = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
    const controlLayout = resolveLegacyFeatureControlLayout(panel.width, options.showDescriptions === true);
    const rowHeight = controlLayout.rowHeight;
    const rowGap = controlLayout.rowGap;
    const sectionHeaderHeight = stacked ? 18 : 20;
    const sectionHeaderGap = stacked ? 5 : 6;
    const sectionGap = stacked ? 12 : 14;
    const controlsGroupCount = (options.includeControlStyle !== false ? 1 : 0) + (options.includeMovementSpeed ? 1 : 0);
    const displayGroupCount = 3;
    const groupHeight = (count: number): number => (
      count > 0
        ? sectionHeaderHeight + sectionHeaderGap + (count * rowHeight) + (Math.max(0, count - 1) * rowGap)
        : 0
    );

    return 4
      + groupHeight(controlsGroupCount)
      + (controlsGroupCount > 0 ? sectionGap : 0)
      + groupHeight(displayGroupCount)
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

    const drawScrollEdgeCue = (y: number, alpha: number): void => {
      const cueHalfWidth = Math.max(5, Math.round((track.width + 8) / 2));
      const cueCenterX = track.left + (track.width / 2);
      graphics.lineStyle(1, LEGACY_CYBER_PANEL_STROKE_ALT, Math.min(0.54, alpha + 0.22));
      graphics.lineBetween(cueCenterX - cueHalfWidth, y, cueCenterX + cueHalfWidth, y);
    };

    // The geometry masks own content disappearance. Keep scroll affordances inside
    // the reserved rail gutter so a full-width fade boundary can never cross text.
    if (metrics.topFadeAlpha > 0) {
      drawScrollEdgeCue(viewport.top + 2, metrics.topFadeAlpha);
    }
    if (metrics.bottomFadeAlpha > 0) {
      drawScrollEdgeCue(viewport.top + viewport.height - 2, metrics.bottomFadeAlpha);
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
    const panel = this.resolveOverlayPanelFrame();
    const compact = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
    const showAdvancedOptions = this.shouldShowLegacyAdvancedOptions();
    const actionButtonHeight = compact ? 44 : 48;
    const shell = resolveLegacyOverlayShellLayout({
      actionHeight: actionButtonHeight,
      actionRows: 1,
      panel
    });
    let rowY = shell.contentTop;
    this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.handleBackAction()));

    if (!showAdvancedOptions) {
      const actionY = shell.actionCenterY;
      const viewportTop = rowY + (compact ? 4 : 6);
      const viewport = createVisualRect(
        shell.contentLeft,
        viewportTop,
        shell.contentWidth,
        Math.max(140, shell.contentHeight - (viewportTop - shell.contentTop))
      );
      const controlContentHeight = this.resolveFeatureControlRowsContentHeight(panel, {
        includeControlStyle: false,
        includeMovementSpeed: false
      });
      const contentFlow = resolveLegacyOverlayContentFlowLayout({
        contentTop: viewport.top,
        controlsHeight: controlContentHeight,
        guideHeight: this.resolveLegacyOptionsGuideEffectiveHeight(panel.width),
        panelWidth: panel.width
      });
      const scrollMetrics = resolveLegacyOverlayScrollMetrics({
        contentHeight: contentFlow.contentHeight,
        offset: this.overlayScrollOffset,
        viewport: this.visualRectToLegacyOverlayScrollRect(viewport)
      });
      this.applyLegacyOverlayScrollMetrics(scrollMetrics);
      const renderViewport = this.resolveLegacyOverlayScrollRenderViewport(scrollMetrics);
      this.createLegacyOptionsInfoSection(contentFlow.guideTop, panel, {
        exactTop: true,
        rightGutter: LEGACY_OVERLAY_SCROLL_RIGHT_GUTTER,
        scrollOffset: scrollMetrics.offset,
        viewport: renderViewport
      });
      this.createFeatureControlRows(contentFlow.controlsTop, panel, {
        includeControlStyle: false,
        includeMovementSpeed: false,
        rightGutter: LEGACY_OVERLAY_SCROLL_RIGHT_GUTTER,
        scrollOffset: scrollMetrics.offset,
        viewport: renderViewport
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

    rowY = this.createFeatureControlRows(rowY, panel, { includeControlStyle: false, includeMovementSpeed: false });

    if (showAdvancedOptions && !compact) {
      rowY = this.createColorInputRow('Path RGB 0-255', ['pathR', 'pathG', 'pathB'], rowY, panel, this.settings.pathColor);
      rowY = this.createColorInputRow('Wall RGB 0-255', ['wallR', 'wallG', 'wallB'], rowY, panel, this.settings.wallColor);
    }

    this.createLegacyOptionsAccountActionRow(panel);
  }

  // The Guide card's actual on-screen height depends on overlayGuideExpanded
  // -- callers computing where content below it should start must use this
  // instead of the layout's cardHeight (which is always the expanded size),
  // or they'd reserve extra space above the toggle list while collapsed.
  private resolveLegacyOptionsGuideEffectiveHeight(panelWidth: number): number {
    const guideLayout = resolveLegacyOptionsGuideLayout(panelWidth, 3);
    return this.overlayGuideExpanded ? guideLayout.cardHeight : guideLayout.collapsedHeight;
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
    const compact = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
    const guideLayout = resolveLegacyOptionsGuideLayout(panel.width, 3);
    const expanded = this.overlayGuideExpanded;
    const cardHeight = expanded ? guideLayout.cardHeight : guideLayout.collapsedHeight;
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
    const cardIntersectsViewport = viewport === null
      || (cardTop < viewport.bottom - 2 && cardTop + cardHeight > viewport.top + 2);

    if (!cardIntersectsViewport) {
      this.overlayGuideBounds = null;
      return contentCardTop + cardHeight + (options.exactTop === true ? 0 : (compact ? 14 : 16));
    }

    const guideGraphics = this.add.graphics();
    this.overlayGuideGraphics = guideGraphics;
    if (viewport !== null) {
      const maskGraphics = this.make.graphics({ x: 0, y: 0 }, false);
      maskGraphics.fillStyle(0xffffff, 1);
      maskGraphics.fillRect(viewport.left, viewport.top, viewport.width, viewport.height);
      const guideMask = maskGraphics.createGeometryMask();
      guideGraphics.setMask(guideMask);
      this.overlayGuideMaskGraphics = maskGraphics;
      this.overlayGuideMask = guideMask;
    }

    const inset = guideLayout.inset;
    const headerCenterY = cardTop + Math.round(guideLayout.collapsedHeight / 2);
    const titleY = expanded ? cardTop + guideLayout.titleOffset : headerCenterY;
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
    if (visibleCardHeight < 30) {
      this.overlayGuideBounds = null;
      return contentCardTop + cardHeight + (options.exactTop === true ? 0 : (compact ? 14 : 16));
    }
    this.overlayGuideBounds = createVisualRect(cardLeft, visibleCardTop, cardWidth, visibleCardHeight);

    this.drawLegacyCyberPanel(guideGraphics, {
      active: true,
      alpha: 0.66,
      fill: LEGACY_PLAY_HUD_TIMER_PANE,
      height: cardHeight,
      left: cardLeft,
      radius: 12,
      top: cardTop,
      width: cardWidth
    });
    guideGraphics.lineStyle(1, LEGACY_PLAY_TOUCH_ACCENT, 0.62);
    guideGraphics.strokeRoundedRect(cardLeft + 4, cardTop + 4, cardWidth - 8, cardHeight - 8, 9);

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
      const label = this.fitLegacyUiTextToWidth(this.padLegacyCompactUiText(this.add.text(x, y, copy, {
        align: 'left',
        color,
        fontFamily: LEGACY_UI_FONT_FAMILY,
        fontSize: `${fontSize}px`
      })), width, fontSize, minFontSize, guideLayout.textWidthSafetyRatio)
        .setOrigin(originX, 0.5)
        .setAlpha(alpha);
      const bounds = visualRectFromBounds(label.getBounds());
      if (viewport !== null && !legacyOverlayScrollRectIntersectsViewport(bounds, viewport)) {
        label.destroy();
        return null;
      }
      if (this.overlayGuideMask !== null) {
        label.setMask(this.overlayGuideMask);
      }
      this.uiTexts.push(label);
      return label;
    };

    const chevronX = cardLeft + cardWidth - inset - 5;
    const drawHeaderChevron = (): void => {
      const chevronSize = 4;
      guideGraphics.lineStyle(1.6, cyberArcadeMaterial.rail.cyan, 0.85);
      guideGraphics.beginPath();
      if (expanded) {
        guideGraphics.moveTo(chevronX - chevronSize, headerCenterY + Math.round(chevronSize * 0.4));
        guideGraphics.lineTo(chevronX, headerCenterY - Math.round(chevronSize * 0.4));
        guideGraphics.lineTo(chevronX + chevronSize, headerCenterY + Math.round(chevronSize * 0.4));
      } else {
        guideGraphics.moveTo(chevronX - chevronSize, headerCenterY - Math.round(chevronSize * 0.4));
        guideGraphics.lineTo(chevronX, headerCenterY + Math.round(chevronSize * 0.4));
        guideGraphics.lineTo(chevronX + chevronSize, headerCenterY - Math.round(chevronSize * 0.4));
      }
      guideGraphics.strokePath();
    };
    drawHeaderChevron();

    addText(
      'GUIDE',
      expanded ? cardCenterX : detailLeft,
      titleY,
      cardWidth - (inset * 2) - (expanded ? 0 : 28),
      toCyberArcadeCssHex(cyberArcadeMaterial.rail.mint),
      guideTitleFontSize,
      expanded ? 0.5 : 0,
      1,
      guideRowMinFontSize
    );

    // Collapsed by default -- a tap-to-expand header row is enough of a
    // reference that it doesn't need to permanently occupy space above the
    // toggle list every time Settings/Pause opens.
    const headerButton = this.createLegacyOptionsGuideHeaderButton(cardCenterX, headerCenterY, cardWidth, guideLayout.collapsedHeight);
    this.uiButtons.push(headerButton);

    if (!expanded) {
      return contentCardTop + cardHeight + (options.exactTop === true ? 0 : (compact ? 14 : 16));
    }

    // Two-line "rail" under the title instead of one flat divider -- a
    // bright inset line plus a fainter full-width line reads as a small
    // HUD console header rather than a plain section break.
    guideGraphics.lineStyle(1.5, cyberArcadeMaterial.rail.cyan, 0.5);
    guideGraphics.lineBetween(cardCenterX - 22, titleRuleY, cardCenterX + 22, titleRuleY);
    guideGraphics.lineStyle(1, LEGACY_CYBER_PANEL_STROKE_ALT, 0.2);
    guideGraphics.lineBetween(cardLeft + inset, titleRuleY + 3, cardLeft + cardWidth - inset, titleRuleY + 3);

    const legendCopyColor = toCyberArcadeCssHex(cyberArcadeMaterial.rail.white);

    // Each row gets a colored icon badge (fill disc + accent ring) behind its
    // glyph instead of a bare icon on the panel background -- ties the
    // legend visually to the same accent-badge language as the toggle rows,
    // and the ring color doubles as the row's semantic color-key.
    const drawLegendBadge = (glyphX: number, glyphY: number, badgeRadius: number, accentColor: number): void => {
      guideGraphics.fillStyle(accentColor, 0.16);
      guideGraphics.fillCircle(glyphX, glyphY, badgeRadius);
      guideGraphics.lineStyle(1.2, accentColor, 0.7);
      guideGraphics.strokeCircle(glyphX, glyphY, badgeRadius);
    };

    const drawLegendRow = (
      index: number,
      kind: 'start' | 'end' | 'move',
      title: string,
      copy: string,
      accentColor: number
    ): void => {
      const rowTop = legendTop + (index * rowHeight);
      const glyphX = detailLeft + (compact ? 14 : 16);
      const glyphY = rowTop + (rowHeight / 2);
      const labelX = detailLeft + (compact ? 28 : 34);
      const titleColor = toCyberArcadeCssHex(accentColor);
      if (compact) {
        drawLegendBadge(glyphX, glyphY, 11, accentColor);
        this.drawLegacyOptionsGuideGlyph(kind, glyphX, glyphY, 12, guideGraphics);
        addText(
          `${title}: ${copy}`,
          labelX,
          glyphY,
          Math.max(96, detailRight - labelX),
          titleColor,
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
      drawLegendBadge(glyphX, glyphY, 12, accentColor);
      this.drawLegacyOptionsGuideGlyph(kind, glyphX, glyphY, 13, guideGraphics);
      addText(title, labelX, glyphY, labelWidth, titleColor, guideRowFontSize, 0, 1, guideRowMinFontSize);
      addText(
        copy,
        copyX,
        glyphY,
        copyWidth,
        legendCopyColor,
        guideRowFontSize,
        0,
        0.92,
        compact ? 11 : guideRowMinFontSize
      );
    };

    let legendRowIndex = 0;
    drawLegendRow(legendRowIndex, 'start', 'Start', 'begin at gold', cyberArcadeMaterial.signal.start);
    legendRowIndex += 1;
    drawLegendRow(legendRowIndex, 'end', 'Exit', 'finish at red', cyberArcadeMaterial.signal.goal);
    legendRowIndex += 1;
    drawLegendRow(
      legendRowIndex,
      'move',
      'Move',
      'touch and drag anywhere',
      cyberArcadeMaterial.rail.mint
    );
    return contentCardTop + cardHeight + (options.exactTop === true ? 0 : (compact ? 14 : 16));
  }

  // Invisible tap target spanning the Guide card's header row -- toggles
  // overlayGuideExpanded and marks the UI dirty so the next rebuild redraws
  // the card (and reflows everything below it) at the new height.
  private createLegacyOptionsGuideHeaderButton(
    centerX: number,
    centerY: number,
    width: number,
    height: number
  ): UiButton {
    const background = this.add.rectangle(centerX, centerY, width, height, 0x000000, 0);
    background.setInteractive({ useHandCursor: true });
    const label = this.padLegacyUiText(this.add.text(centerX, centerY, '', {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: '1px',
      color: MENU_TEXT_COLOR
    })).setOrigin(0.5).setAlpha(0);
    let pressStart: { x: number; y: number } | null = null;
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
        this.overlayGuideExpanded = !this.overlayGuideExpanded;
        this.uiDirty = true;
      }
    });
    background.on('pointerout', () => {
      pressStart = null;
    });

    return {
      background,
      bounds: createVisualRect(centerX - (width / 2), centerY - (height / 2), width, height),
      label,
      setActive: () => undefined,
      text: 'Guide',
      destroy: () => {
        background.destroy();
        label.destroy();
      }
    };
  }

  private drawLegacyOptionsGuideGlyph(
    kind: 'start' | 'end' | 'move',
    centerX: number,
    centerY: number,
    size: number,
    graphics: Phaser.GameObjects.Graphics = this.overlayGraphics
  ): void {
    if (kind === 'move') {
      this.drawLegacyOptionsGuideMoveGlyph(graphics, centerX, centerY, size);
      return;
    }
    // Was drawLegacyEndpointMarker -- a flat colored-in tile, a completely
    // different shape from the soft circular glow the real start/goal
    // markers actually render as in game (drawLegacyEndpointGlow). Per
    // feedback that the Guide's icons don't match what the app actually
    // shows: use the exact same glow now, so the legend always reflects
    // reality and future changes to the real marker auto-propagate here.
    this.drawLegacyEndpointGlow(
      graphics,
      { height: size * 2, left: centerX - size, top: centerY - size, width: size * 2 },
      0.94,
      kind === 'start' ? 'start' : 'goal'
    );
  }

  // A miniature version of the real floating movement stick (ring + knob,
  // same color language as drawLegacyPlayTouchStick) instead of a bespoke
  // arrow-cross glyph that looked nothing like the actual on-screen
  // control -- same "Guide should reflect reality" fix as the start/goal
  // glow above. Genuinely re-rendering the real stick at legend-icon scale
  // isn't practical (its own geometry is derived from the live viewport
  // size, not a size parameter), so this hand-draws the same shape/colors
  // at the small scale instead of sharing the draw call directly.
  private drawLegacyOptionsGuideMoveGlyph(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    size: number
  ): void {
    const outerRadius = size * 0.86;
    const knobRadius = size * 0.34;
    graphics.fillStyle(LEGACY_PLAY_TOUCH_BUTTON_FILL, 0.28);
    graphics.fillCircle(centerX, centerY, outerRadius);
    graphics.lineStyle(Math.max(1, size * 0.1), LEGACY_PLAY_TOUCH_BUTTON_STROKE, 0.55);
    graphics.strokeCircle(centerX, centerY, outerRadius);
    graphics.fillStyle(LEGACY_PLAY_TOUCH_ACCENT, 0.38);
    graphics.fillCircle(centerX, centerY, knobRadius);
    graphics.lineStyle(Math.max(1, size * 0.08), LEGACY_PLAY_TOUCH_ICON, 0.72);
    graphics.strokeCircle(centerX, centerY, knobRadius);
  }

  private createLegacyOptionsAccountActionRow(
    panel: OverlayPanelFrame,
    options: {
      contentCenterY?: number | null;
      scrollOffset?: number;
      viewport?: VisualRect | null;
    } = {}
  ): void {
    const compact = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
    const label = 'Account';
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
    const action = (): void => this.openOverlay('auth');

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
    const panel = this.resolveOverlayPanelFrame();
    const stacked = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
    const actionButtonHeight = stacked ? cyberArcadeMaterial.controls.minimumTouchTarget : 48;
    const shell = resolveLegacyOverlayShellLayout({
      actionHeight: actionButtonHeight,
      // Down from 3 -- Reset (reset-player) was removed from the game
      // entirely, and Reset Progress moved into the account screen with
      // the rest of the account actions (it resets account-level
      // progression, not just the current attempt, so it belongs there).
      // Account now pairs with Menu in the one remaining row instead of
      // getting its own row underneath.
      actionRows: 1,
      panel
    });
    this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.applyLegacyPauseCommand('resume')));
    const actionY = shell.actionCenterY;
    const viewportTop = shell.contentTop;
    const viewport = createVisualRect(
      shell.contentLeft,
      viewportTop,
      shell.contentWidth,
      Math.max(120, shell.contentHeight)
    );
    const controlContentHeight = this.resolveFeatureControlRowsContentHeight(panel, {
      includeMovementSpeed: true
    });
    const contentFlow = resolveLegacyOverlayContentFlowLayout({
      contentTop: viewport.top,
      controlsHeight: controlContentHeight,
      guideHeight: this.resolveLegacyOptionsGuideEffectiveHeight(panel.width),
      panelWidth: panel.width
    });
    const scrollMetrics = resolveLegacyOverlayScrollMetrics({
      contentHeight: contentFlow.contentHeight,
      offset: this.overlayScrollOffset,
      viewport: this.visualRectToLegacyOverlayScrollRect(viewport)
    });
    this.applyLegacyOverlayScrollMetrics(scrollMetrics);
    const renderViewport = this.resolveLegacyOverlayScrollRenderViewport(scrollMetrics);
    this.createLegacyOptionsInfoSection(contentFlow.guideTop, panel, {
      exactTop: true,
      rightGutter: LEGACY_OVERLAY_SCROLL_RIGHT_GUTTER,
      scrollOffset: scrollMetrics.offset,
      viewport: renderViewport
    });
    this.createFeatureControlRows(contentFlow.controlsTop, panel, {
      includeMovementSpeed: true,
      rightGutter: LEGACY_OVERLAY_SCROLL_RIGHT_GUTTER,
      scrollOffset: scrollMetrics.offset,
      viewport: renderViewport
    });
    this.drawLegacyOverlayScrollFacade(scrollMetrics);

    const accountAction = (): void => this.openOverlay('auth');
    const mainMenuAction = (): void => this.applyLegacyPauseCommand('return-menu');

    if (stacked) {
      const compactRow = resolveLegacyTwoUpButtonLayout(panel.centerX, panel.width, 128, 64, 14);
      this.uiButtons.push(
        this.createButton(compactRow.leftX, actionY, compactRow.buttonWidth, actionButtonHeight, 'Account', accountAction, { labelRole: 'overlay-action' }),
        this.createButton(compactRow.rightX, actionY, compactRow.buttonWidth, actionButtonHeight, 'Menu', mainMenuAction)
      );
      return;
    }

    const desktopRow = resolveLegacyTwoUpButtonLayout(panel.centerX, panel.width, 140, 72, 14);
    this.uiButtons.push(
      this.createButton(desktopRow.leftX, actionY, desktopRow.buttonWidth, actionButtonHeight, 'Account', accountAction, { labelRole: 'overlay-action' }),
      this.createButton(desktopRow.rightX, actionY, desktopRow.buttonWidth, actionButtonHeight, 'Menu', mainMenuAction)
    );
  }

  private buildProgressionResetConfirmationOverlay(): void {
    const panel = this.resolveOverlayPanelFrame();
    const compact = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
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
    const panel = this.resolveOverlayPanelFrame();
    const stacked = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
    const centerX = panel.centerX;
    const presentation = resolveLegacyAuthPresentation({
      mode: this.authForm.mode,
      rememberedIdentity: readLegacyRememberedIdentityState(this.resolveBrowserLocalStorage()),
      snapshot: this.authSnapshot
    });
    let rowY = panel.top + (stacked ? 150 : 168);

    // No way out while the full auth gate has this locked -- handleBackAction
    // already refuses to close it too (defense in depth for Escape), but
    // the button itself shouldn't even suggest there's a way back.
    if (!(this.authGateLocked && this.overlay === 'auth')) {
      this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.handleBackAction()));
    }
    this.createOverlayTitle(presentation.title, panel.top + (stacked ? 46 : 54));

    const accountLabel = resolveLegacyAuthAccountLabel(this.authSnapshot);
    this.createAuthInfoText(
      presentation.helper,
      panel.top + (stacked ? 90 : 104),
      panel,
      '#b7f2ff',
      stacked ? 13 : 15
    );

    if (this.authSnapshot.status === 'authenticated') {
      this.buildAuthenticatedAccountSection(panel, stacked, centerX, rowY, accountLabel);
      return;
    }

    this.buildAuthCredentialsForm(panel, stacked, centerX, rowY, presentation);
    this.latestAuthMessage = this.resolveLegacyCurrentAuthMessage();
  }

  private buildAuthenticatedAccountSection(
    panel: OverlayPanelFrame,
    stacked: boolean,
    centerX: number,
    startY: number,
    accountLabel: string
  ): void {
    const panelBottom = panel.top + panel.height;
    const buttonHeight = stacked ? 46 : 50;
    const buttonWidth = Math.min(panel.width - 72, stacked ? 260 : 320);
    let rowY = startY;

    this.createAuthAccountSummaryCard(`Signed in as ${accountLabel}`, rowY, panel);
    rowY += stacked ? 64 : 72;
    const detail = this.authSnapshot.email ?? this.authSnapshot.userId ?? '';
    if (detail.length > 0) {
      this.createAuthInfoText(detail, rowY, panel, '#d7f7ee', stacked ? 14 : 16);
      rowY += stacked ? 46 : 54;
    }

    this.uiButtons.push(
      // Reset Progress used to live in the play-mode pause overlay's action
      // row; it's account-level data (resets the signed-in player's whole
      // progression, not just the current attempt), so it belongs on the
      // account screen with the rest of the account actions instead.
      this.createLegacyAuthActionButton(
        centerX,
        panelBottom - (stacked ? 170 : 184),
        buttonWidth,
        buttonHeight,
        'Reset Progress',
        () => this.openOverlay('confirm-progression-reset'),
        'danger'
      ),
      this.createLegacyAuthActionButton(
        centerX,
        panelBottom - (stacked ? 116 : 126),
        buttonWidth,
        buttonHeight,
        'Log out',
        () => { void this.handleLegacyAuthSignOut(); },
        'danger'
      ),
      this.createLegacyAuthActionButton(
        centerX,
        panelBottom - (stacked ? 62 : 68),
        buttonWidth,
        buttonHeight,
        'Done',
        () => this.closeOverlay(),
        'secondary'
      )
    );
  }

  private buildAuthCredentialsForm(
    panel: OverlayPanelFrame,
    stacked: boolean,
    centerX: number,
    startY: number,
    presentation: LegacyAuthPresentation
  ): void {
    const fieldWidth = Math.min(panel.width - 56, stacked ? 330 : 420);
    const fieldHeight = stacked ? 48 : 52;
    const buttonHeight = stacked ? 46 : 50;
    const buttonWidth = Math.min(panel.width - 72, stacked ? 260 : 320);
    let rowY = startY;

    this.createAuthFieldBox(
      centerX,
      rowY,
      fieldWidth,
      fieldHeight,
      'email',
      this.authForm.email || 'Email address',
      this.authForm.email.length === 0
    );
    rowY += stacked ? 66 : 72;
    this.createAuthFieldBox(centerX, rowY, fieldWidth, fieldHeight, 'password', this.maskLegacyAuthPassword(), this.authForm.password.length === 0);
    rowY += stacked ? 66 : 72;

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
      rowY += stacked ? 66 : 72;
    }

    const primaryLabel = this.authSubmitting
      ? 'Working'
      : presentation.primaryActionLabel;
    const secondaryModeLabel = presentation.alternateActionLabel;
    const bottomButtonGap = stacked ? 54 : 58;
    const bottomStartY = rowY + (stacked ? 24 : 28);

    this.uiButtons.push(
      this.createLegacyAuthActionButton(
        centerX,
        bottomStartY,
        buttonWidth,
        buttonHeight,
        primaryLabel,
        () => { void this.handleLegacyAuthSubmit(); },
        'primary'
      ),
      this.createLegacyAuthActionButton(
        centerX,
        bottomStartY + bottomButtonGap,
        buttonWidth,
        buttonHeight,
        secondaryModeLabel,
        () => this.setLegacyAuthFormMode(this.authForm.mode === 'signup' ? 'login' : 'signup'),
        'secondary'
      ),
      this.createLegacyAuthActionButton(
        centerX,
        bottomStartY + (bottomButtonGap * 2),
        buttonWidth,
        buttonHeight,
        presentation.recoveryActionLabel,
        () => { void this.handleLegacyAuthPasswordReset(); },
        'secondary'
      )
    );
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
      fontSize: `${fontSize ?? (panel.width < LEGACY_UI_COMPACT_BREAKPOINT ? 16 : 18)}px`,
      wordWrap: { width: maxWidth, useAdvancedWrap: true }
    })), maxWidth, fontSize ?? 18, 11).setOrigin(0.5);
    this.uiTexts.push(label);
  }

  private createAuthAccountSummaryCard(
    copy: string,
    y: number,
    panel: OverlayPanelFrame
  ): void {
    const stacked = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
    const width = Math.min(panel.width - 56, stacked ? 330 : 420);
    const height = stacked ? 56 : 62;
    const background = this.add.rectangle(panel.centerX, y, width, height, 0x07131d, 1);
    background.setStrokeStyle(2, LEGACY_PLAY_TOUCH_ACCENT, 0.76);
    const eyebrow = this.padLegacyCompactUiText(this.add.text(panel.centerX - (width / 2) + 16, y - (height * 0.24), 'ACCOUNT', {
      color: '#72e0bf',
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${stacked ? 9 : 10}px`
    })).setOrigin(0, 0.5);
    const label = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(panel.centerX - (width / 2) + 16, y + (height * 0.13), copy, {
      color: '#ecfff5',
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${stacked ? 15 : 17}px`
    })), width - 32, stacked ? 15 : 17, 12).setOrigin(0, 0.5);
    this.uiTexts.push(eyebrow);
    this.uiButtons.push({
      background,
      bounds: createVisualRect(panel.centerX - (width / 2), y - (height / 2), width, height),
      label,
      setActive: () => undefined,
      text: 'Account',
      destroy: () => {
        background.destroy();
        label.destroy();
      }
    });
  }

  private createLegacyAuthActionButton(
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    onClick: () => void,
    tone: 'primary' | 'secondary' | 'danger'
  ): UiButton {
    const chrome = this.add.graphics();
    const colors = tone === 'primary'
      ? { fill: 0x063a28, stroke: LEGACY_PLAY_TOUCH_ACCENT, text: '#ecfff5' }
      : tone === 'danger'
        ? { fill: 0x260f1a, stroke: cyberArcadeMaterial.signal.goal, text: '#ffdce6' }
        : { fill: 0x07131d, stroke: LEGACY_PLAY_TOUCH_BUTTON_STROKE, text: '#d7f7ee' };
    const draw = (active: boolean): void => {
      chrome.clear();
      this.drawLegacyCyberPanel(chrome, {
        active: active || tone === 'primary',
        alpha: 1,
        fill: colors.fill,
        height,
        left: x - (width / 2),
        radius: LEGACY_UI_CONTROL_RADIUS,
        stroke: colors.stroke,
        strokeAlt: colors.stroke,
        top: y - (height / 2),
        width
      });
    };
    draw(false);

    const background = this.add.rectangle(x, y, width, height, 0x000000, 0.001);
    background.setInteractive({ useHandCursor: true });
    const fontSize = Math.max(15, Math.min(22, Math.round(height * 0.4)));
    const label = this.fitLegacyUiTextToWidth(this.padLegacyCompactUiText(this.add.text(
      x,
      resolveLegacyUiLabelCenterY(y, fontSize, 'button'),
      text,
      { color: colors.text, fontFamily: LEGACY_UI_FONT_FAMILY, fontSize: `${fontSize}px` }
    )), width - 32, fontSize, 12).setOrigin(0.5).setAlpha(0.96);
    this.uiTexts.push(label);

    const setActive = (active: boolean): void => {
      draw(active);
      label.setAlpha(active ? 1 : 0.96);
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
        chrome.destroy();
        background.destroy();
        label.destroy();
      }
    };
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
    const fieldLabel = fieldId === 'displayName'
      ? 'DISPLAY NAME'
      : fieldId === 'password'
        ? 'PASSWORD'
        : 'EMAIL';
    const hasPasswordToggle = fieldId === 'password';
    const contentLeft = x - (width / 2) + 16;
    const contentRightInset = hasPasswordToggle ? 54 : 16;
    const valueWidth = width - 16 - contentRightInset;
    const background = this.add.rectangle(x, y, width, height, 0x07131d, 1);
    background.setStrokeStyle(2, isActive ? LEGACY_PLAY_TOUCH_ACCENT : LEGACY_PLAY_TOUCH_BUTTON_STROKE, isActive ? 0.95 : 0.68);
    background.setInteractive({ useHandCursor: true });
    background.on('pointerdown', () => this.selectLegacyAuthField(fieldId, { height, width, x, y }));
    if (isActive) {
      this.positionLegacyAuthNativeInput(fieldId, { height, width, x, y });
    }

    const eyebrow = this.padLegacyCompactUiText(this.add.text(contentLeft, y - (height * 0.25), fieldLabel, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${Math.max(8, Math.min(10, Math.round(height * 0.19)))}px`,
      color: isActive ? '#72e0bf' : '#9bcdbd'
    })).setOrigin(0, 0.5);
    this.uiTexts.push(eyebrow);
    const label = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(contentLeft, y + (height * 0.14), value, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${Math.max(14, Math.min(19, Math.round(height * 0.34)))}px`,
      color: placeholder ? '#7894a0' : (isActive ? '#72e0bf' : '#ecfff5')
    })), valueWidth, Math.max(14, Math.min(19, Math.round(height * 0.34))), 10).setOrigin(0, 0.5);
    const caret = isActive
      ? this.add.rectangle(
        placeholder ? contentLeft + 5 : Math.min(x + (width / 2) - contentRightInset + 2, label.x + label.displayWidth + 6),
        y + (height * 0.14),
        Math.max(2, Math.round(width * 0.006)),
        Math.max(16, Math.round(height * 0.34)),
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
    if (hasPasswordToggle) {
      this.uiButtons.push(this.createLegacyAuthPasswordVisibilityButton(
        x + (width / 2) - 27,
        y,
        Math.max(34, Math.round(height * 0.76))
      ));
    }
  }

  private createLegacyAuthPasswordVisibilityButton(x: number, y: number, size: number): UiButton {
    const icon = this.add.graphics();
    const drawIcon = (active: boolean): void => {
      icon.clear();
      icon.lineStyle(2, LEGACY_PLAY_TOUCH_ACCENT, active ? 1 : 0.82);
      icon.strokeEllipse(x, y, size * 0.58, size * 0.36);
      icon.strokeCircle(x, y, Math.max(2, size * 0.105));
      if (!this.authPasswordVisible) {
        icon.lineBetween(x - (size * 0.3), y - (size * 0.3), x + (size * 0.3), y + (size * 0.3));
      }
    };
    drawIcon(false);
    const background = this.add.rectangle(x, y, size, size, 0x000000, 0.001);
    background.setInteractive({ useHandCursor: true });
    const label = this.add.text(x, y, '', { fontFamily: LEGACY_UI_FONT_FAMILY, fontSize: '1px' }).setVisible(false);
    const setActive = (active: boolean): void => {
      drawIcon(active);
    };
    background.on('pointerover', () => setActive(true));
    background.on('pointerout', () => setActive(false));
    background.on('pointerdown', () => this.toggleLegacyAuthPasswordVisibility());

    return {
      background,
      bounds: createVisualRect(x - (size / 2), y - (size / 2), size, size),
      label,
      setActive,
      text: this.authPasswordVisible ? 'Hide password' : 'Show password',
      destroy: () => {
        icon.destroy();
        background.destroy();
        label.destroy();
      }
    };
  }

  private createFeatureControlRows(
    y: number,
    panel: OverlayPanelFrame,
    options: {
      includeControlStyle?: boolean;
      includeMovementSpeed?: boolean;
      rightGutter?: number;
      scrollOffset?: number;
      showDescriptions?: boolean;
      viewport?: VisualRect | null;
    } = {}
  ): number {
    const stacked = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
    const left = panel.left + 28;
    const width = panel.width - 56 - (options.rightGutter ?? 0);
    const showDescriptions = options.showDescriptions === true;
    const controlLayout = resolveLegacyFeatureControlLayout(panel.width, showDescriptions);
    const rowHeight = controlLayout.rowHeight;
    const rowGap = controlLayout.rowGap;
    const sectionHeaderHeight = stacked ? 18 : 20;
    const sectionHeaderGap = stacked ? 5 : 6;
    const sectionGap = stacked ? 12 : 14;
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
      // Which section this row renders under -- filtered below by tag
      // instead of by array position, so reordering this list can never
      // silently move a row into the wrong section.
      section: 'controls' | 'display';
      stateText: string;
    }> = [
      // Control Style (arrows vs stick) used to live here -- now that play
      // touch movement is always the floating stick that spawns wherever
      // the player touches down (see playFloatingStickOrigin), there's only
      // one control scheme, so a toggle between two options no longer means
      // anything to surface.
      {
        checked: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailFade', this.settings),
        description: this.settings.toggleTrailFade
          ? 'Old trail fades.'
          : 'Trail stays.',
        label: 'Trail Fade',
        offLabel: 'Off',
        onClick: () => this.applyOverlayToggleFieldChange('toggleTrailFade'),
        onLabel: 'On',
        section: 'display',
        stateText: resolveLegacyOverlayToggleStateText('toggleTrailFade', this.settings.toggleTrailFade) ?? 'Off'
      },
      {
        checked: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailPulse', this.settings),
        description: this.settings.toggleTrailPulse
          ? 'Slow white shine.'
          : 'No trail shine.',
        label: 'Trail Shine',
        offLabel: 'Off',
        onClick: () => this.applyOverlayToggleFieldChange('toggleTrailPulse'),
        onLabel: 'On',
        section: 'display',
        stateText: resolveLegacyOverlayToggleStateText('toggleTrailPulse', this.settings.toggleTrailPulse) ?? 'Off'
      },
      {
        checked: resolveLegacyOverlayToggleSwitchIsOn('toggleAnimatedBackdrop', this.settings),
        description: this.settings.toggleAnimatedBackdrop
          ? 'Moving background.'
          : 'Background still.',
        label: 'Animated Background',
        offLabel: 'Still',
        onClick: () => this.applyOverlayToggleFieldChange('toggleAnimatedBackdrop'),
        onLabel: 'Animated',
        section: 'display',
        stateText: resolveLegacyOverlayToggleStateText('toggleAnimatedBackdrop', this.settings.toggleAnimatedBackdrop) ?? 'Still'
      }
    ];
    // Control Style only matters once a game is actually in progress -- the
    // main-menu Settings overlay (as opposed to in-game Pause) hides it so
    // players aren't shown a played-game setting before they've played.
    const includeControlStyle = options.includeControlStyle !== false;
    const controlsSection = controls.filter((control) => (
      control.section === 'controls' && (includeControlStyle || control.label !== 'Control Style')
    ));
    const displaySection = controls.filter((control) => control.section === 'display');
    const hasControlsSection = controlsSection.length > 0 || options.includeMovementSpeed === true;

    const addSectionHeading = (copy: string, contentTop: number): number => {
      const centerY = contentTop + Math.round(sectionHeaderHeight / 2);
      const renderY = toRenderY(centerY);
      if (isVisible(renderY, sectionHeaderHeight)) {
        const label = this.fitLegacyUiTextToWidth(this.padLegacyCompactUiText(this.add.text(left, renderY, copy.toUpperCase(), {
          color: '#72e0bf',
          fontFamily: LEGACY_UI_FONT_FAMILY,
          fontSize: `${stacked ? 11 : 12}px`
        })), width, stacked ? 11 : 12, 10).setOrigin(0, 0.5).setAlpha(0.9);
        this.uiTexts.push(label);
        this.overlayGraphics.lineStyle(1, LEGACY_CYBER_PANEL_STROKE_ALT, 0.32);
        this.overlayGraphics.lineBetween(left, renderY + Math.round(sectionHeaderHeight / 2), left + width, renderY + Math.round(sectionHeaderHeight / 2));
      }
      return contentTop + sectionHeaderHeight + sectionHeaderGap;
    };

    const addToggleRow = (control: typeof controls[number], contentTop: number): number => {
      const rowCenterY = contentTop + Math.round(rowHeight / 2);
      const renderY = toRenderY(rowCenterY);
      if (isVisible(renderY, rowHeight)) {
        this.uiButtons.push(
          this.createToggleSwitchRow({
            checked: control.checked,
            compact: stacked,
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
      }
      return contentTop + rowHeight;
    };

    let contentTop = y + (stacked ? 4 : 6);
    if (hasControlsSection) {
      contentTop = addSectionHeading('Controls', contentTop);
      controlsSection.forEach((control, index) => {
        contentTop = addToggleRow(control, contentTop);
        if (index < controlsSection.length - 1 || options.includeMovementSpeed === true) {
          contentTop += rowGap;
        }
      });

      if (options.includeMovementSpeed === true) {
        const sliderY = contentTop + Math.round(rowHeight / 2);
        const sliderRenderY = toRenderY(sliderY);
        if (isVisible(sliderRenderY, rowHeight)) {
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
        contentTop += rowHeight;
      }

      contentTop += sectionGap;
    }
    contentTop = addSectionHeading('Display', contentTop);
    displaySection.forEach((control, index) => {
      contentTop = addToggleRow(control, contentTop);
      if (index < displaySection.length - 1) {
        contentTop += rowGap;
      }
    });

    return contentTop + 4;
  }

  // Toggle rows are drawn as their own rounded cyber-panel (matching the
  // Quick Play card's chrome) with a left accent bar that reads ON/OFF at a
  // glance, instead of the old plain flat rectangle. The interactive hit
  // target stays a separate invisible Rectangle on top so pointer events
  // work exactly as before -- Phaser's Rectangle game object can't have
  // rounded corners, so the visual panel is a Graphics draw redone on every
  // hover/press state change instead of a fillStyle() call.
  private createToggleSwitchRow(input: {
    checked: boolean;
    compact: boolean;
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
    const top = input.y - (input.height / 2);
    const onColor = cyberArcadeMaterial.signal.player;
    const offColor = cyberArcadeMaterial.rail.muted;
    const accentColor = input.checked ? onColor : offColor;
    const stateColor = input.checked ? toCyberArcadeCssHex(onColor) : toCyberArcadeCssHex(offColor);
    const hasDescription = Boolean(input.description);
    const uiLayout = resolveLegacyToggleRowLayout(input.width, input.height, hasDescription, input.compact);
    const accentBarWidth = 3;
    const rowPaddingX = uiLayout.rowPaddingX;
    const trackWidth = uiLayout.trackWidth + 4;
    const trackHeight = uiLayout.trackHeight + 2;
    const trackX = left + input.width - rowPaddingX - Math.round(trackWidth / 2);
    const trackLeft = trackX - Math.round(trackWidth / 2);
    const trackGap = uiLayout.trackGap;
    const showStateLabel = uiLayout.showStateLabel;
    const stateLaneWidth = uiLayout.stateLaneWidth;
    const stateLabelRight = trackLeft - trackGap;
    const labelX = left + rowPaddingX + accentBarWidth;
    const labelRight = showStateLabel
      ? stateLabelRight - stateLaneWidth - trackGap
      : stateLabelRight - trackGap;
    const labelMaxWidth = Math.max(54, labelRight - labelX);
    const titleY = resolveLegacyUiLabelCenterY(
      input.y + (hasDescription ? -Math.round(input.height * 0.2) : 0),
      uiLayout.labelFontSize,
      'toggle-title'
    );
    const displayStateText = input.stateText || (input.checked ? input.onLabel : input.offLabel);
    const visibleLabelText = showStateLabel || !displayStateText
      ? input.label
      : `${input.label}: ${displayStateText}`;

    const panelGraphics = this.add.graphics();
    const drawPanel = (active: boolean): void => {
      panelGraphics.clear();
      this.drawLegacyCyberPanel(panelGraphics, {
        active,
        alpha: input.checked ? 0.62 : 0.46,
        fill: input.checked ? 0x0f2c22 : LEGACY_CYBER_PANEL_FILL,
        height: input.height,
        left,
        radius: 10,
        stroke: accentColor,
        top,
        width: input.width
      });
      panelGraphics.fillStyle(accentColor, input.checked ? 0.95 : 0.5);
      panelGraphics.fillRoundedRect(left + 5, top + 6, accentBarWidth, input.height - 12, accentBarWidth / 2);
    };
    drawPanel(false);

    const background = this.add.rectangle(input.x, input.y, input.width, input.height, 0x000000, 0);
    background.setInteractive({ useHandCursor: true });

    const label = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(labelX, titleY, visibleLabelText, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${uiLayout.labelFontSize}px`,
      color: toCyberArcadeCssHex(cyberArcadeMaterial.rail.white)
    })), labelMaxWidth, uiLayout.labelFontSize, 11).setOrigin(0, 0.5).setAlpha(0.96);

    const stateLabel = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(stateLabelRight, titleY, displayStateText || input.stateText, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${uiLayout.stateFontSize}px`,
      fontStyle: 'bold',
      color: stateColor
    })), stateLaneWidth, uiLayout.stateFontSize, 9)
      .setOrigin(1, 0.5)
      .setAlpha(showStateLabel ? 1 : 0)
      .setVisible(showStateLabel);
    this.uiTexts.push(label);
    if (showStateLabel) {
      this.uiTexts.push(stateLabel);
    }

    const descriptionFontSize = Math.max(9, Math.min(10, Math.round(input.height * 0.16)));
    const descriptionMaxWidth = Math.max(72, labelRight - labelX);
    const description = hasDescription
      ? this.fitLegacyUiTextToWidth(this.padLegacyCompactUiText(this.add.text(labelX, input.y + Math.round(input.height * 0.18), input.description!, {
        color: toCyberArcadeCssHex(cyberArcadeMaterial.rail.muted),
        fontFamily: LEGACY_UI_FONT_FAMILY,
        fontSize: `${descriptionFontSize}px`
      })), descriptionMaxWidth, descriptionFontSize, 9, 0.9)
        .setOrigin(0, 0.5)
        .setAlpha(0.88)
      : null;
    if (description) {
      this.uiTexts.push(description);
    }

    // Soft glow ring behind the track when ON -- a second, larger, low-alpha
    // ellipse instead of a real blur filter (canvas renderer has none).
    const trackGlow = this.add.ellipse(trackX, titleY, trackWidth + 10, trackHeight + 10, onColor, input.checked ? 0.16 : 0);
    const track = this.add.ellipse(trackX, titleY, trackWidth, trackHeight, input.checked ? 0x0f2c22 : 0x050c11, 0.95);
    track.setStrokeStyle(2, accentColor, input.checked ? 0.85 : 0.55);
    const knobTravel = Math.round((trackWidth - trackHeight) / 2) - 1;
    const knobRadius = Math.round((trackHeight - 6) / 2);
    const knobX = trackX + (input.checked ? knobTravel : -knobTravel);
    const knobGlow = this.add.circle(knobX, titleY, knobRadius + 4, onColor, input.checked ? 0.3 : 0);
    // A layered "glass bead" instead of a single flat-filled circle: a soft
    // drop shadow offset low-right for depth, a base fill, then a bright
    // specular highlight crescent up-left -- the same lit-gem language as
    // the title, Start button, and header badges, and legible in the OFF
    // state (a plain rail.edge fill there used to read as nearly invisible
    // against the dark track).
    const knobGraphics = this.add.graphics();
    knobGraphics.setPosition(knobX, titleY);
    const drawKnob = (active: boolean): void => {
      knobGraphics.clear();
      const baseColor = input.checked ? onColor : cyberArcadeMaterial.rail.muted;
      knobGraphics.fillStyle(0x000000, 0.35);
      knobGraphics.fillCircle(1.4, 1.8, knobRadius);
      knobGraphics.fillStyle(baseColor, 1);
      knobGraphics.fillCircle(0, 0, knobRadius);
      knobGraphics.fillStyle(cyberArcadeMaterial.rail.white, active ? 0.55 : 0.4);
      knobGraphics.fillCircle(
        -Math.round(knobRadius * 0.32),
        -Math.round(knobRadius * 0.32),
        Math.max(1, Math.round(knobRadius * 0.4))
      );
      knobGraphics.lineStyle(1, cyberArcadeMaterial.rail.white, input.checked ? 0.9 : 0.55);
      knobGraphics.strokeCircle(0, 0, knobRadius);
    };
    drawKnob(false);
    let pressStart: { x: number; y: number } | null = null;

    const setActive = (active: boolean): void => {
      drawPanel(active);
      track.setStrokeStyle(2, accentColor, active ? 1 : (input.checked ? 0.85 : 0.55));
      trackGlow.setAlpha(input.checked ? (active ? 0.26 : 0.16) : 0);
      drawKnob(active);
      knobGraphics.setScale(active ? 1.1 : 1);
      knobGlow.setAlpha(input.checked ? (active ? 0.42 : 0.3) : (active ? 0.14 : 0));
      label.setAlpha(active ? 1 : 0.96);
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
      bounds: createVisualRect(left, top, input.width, input.height),
      label,
      setActive,
      text: input.label,
      destroy: () => {
        background.destroy();
        panelGraphics.destroy();
        label.destroy();
        stateLabel.destroy();
        description?.destroy();
        trackGlow.destroy();
        track.destroy();
        knobGlow.destroy();
        knobGraphics.destroy();
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
    this.overlayMovementSpeedSliderBounds = createVisualRect(left, input.y - (input.height / 2), input.width, input.height);

    const labelFontSize = Math.max(16, Math.min(20, Math.round(input.height * 0.3)));
    const stateFontSize = Math.max(11, Math.min(13, Math.round(input.height * 0.2)));
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
    background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.overlayScrollGestureLockPointerId = this.normalizeLegacyPlayTouchPointerId(pointer.id) ?? -1;
      this.releaseOverlayScrollPointer();
      commitPointerSpeed(pointer.x);
    });
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
    input.inputMode = fieldId === 'email' ? 'email' : 'text';
    input.enterKeyHint = fieldId === 'password' ? 'done' : 'next';
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

    input.type = fieldId === 'password'
      ? (this.authPasswordVisible ? 'text' : 'password')
      : fieldId === 'email' ? 'email' : 'text';
    input.value = this.authForm[fieldId];
    const rect = canvas.getBoundingClientRect();
    const cssRect = resolveLegacyAuthInputCssRect(bounds, rect, this.layout);
    input.style.left = `${cssRect.left}px`;
    input.style.top = `${cssRect.top}px`;
    // Keep the canvas eye control outside the native input hit target so the
    // password visibility affordance remains tappable on mobile browsers.
    const passwordToggleReserve = fieldId === 'password'
      ? Math.max(30, Math.round(cssRect.height * 0.92))
      : 0;
    input.style.width = `${Math.max(1, cssRect.width - passwordToggleReserve)}px`;
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
    this.authPasswordVisible = false;
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
      return 'Enter password';
    }

    return this.authPasswordVisible
      ? this.authForm.password
      : '*'.repeat(Math.min(24, this.authForm.password.length));
  }

  private toggleLegacyAuthPasswordVisibility(): void {
    this.authPasswordVisible = !this.authPasswordVisible;
    if (this.authNativeInput && this.authNativeInputField === 'password') {
      this.authNativeInput.type = this.authPasswordVisible ? 'text' : 'password';
    }
    this.uiDirty = true;
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

  private commitOverlayField(fieldId: LegacyOptionFieldId): void {
    const result = applyLegacyOverlayFieldCommit(this.settings, this.optionFieldDrafts, fieldId);

    this.settings = result.settings;
    this.optionFieldDrafts = result.drafts;
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
      this.commitOverlayField(fieldId);
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

  private createOverlayTitle(text: string, y: number): void {
    const fontSize = this.layout.width < LEGACY_UI_COMPACT_BREAKPOINT ? 24 : (this.layout.width < 480 ? 28 : 34);
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
    const stacked = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
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
    const stacked = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
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
    const size = Math.max(
      cyberArcadeMaterial.controls.minimumTouchTarget,
      this.layout.width < 480 ? 42 : 46
    );
    // Always top-right, tucked into the corner with a small fixed margin --
    // matches the app-wide back-button placement pattern (no title text to
    // vertically align against, so it hugs the panel edge instead).
    const x = panel.left + panel.width - Math.round(size * 0.86);
    const y = panel.top + 8 + Math.round(size / 2);
    const chrome = this.add.graphics();
    // No ring, panel, or background tint behind the arrow -- just the
    // chevron itself. The invisible hit rectangle below still uses the full
    // accessible touch-target size, but the visible glyph is drawn much
    // smaller within it -- per feedback the enlarged arrow read as way too
    // big next to the rest of the UI.
    const drawChevronChrome = (active: boolean): void => {
      chrome.clear();
      const chevronInset = Math.round(size * 0.22);
      const chevronLeft = x - Math.round(size * 0.03);
      chrome.lineStyle(Math.max(2.5, Math.round(size * 0.075)), active ? LEGACY_PLAY_TOUCH_ACCENT : LEGACY_PLAY_TOUCH_ICON, active ? 1 : 0.94);
      chrome.beginPath();
      chrome.moveTo(chevronLeft + chevronInset, y - chevronInset);
      chrome.lineTo(chevronLeft - chevronInset, y);
      chrome.lineTo(chevronLeft + chevronInset, y + chevronInset);
      chrome.strokePath();
    };

    drawChevronChrome(false);
    // The actual clickable rect is deliberately bigger than the drawn icon
    // AND biased upward (more slack above than below) -- repeated feedback
    // that taps aimed right at the visible chevron were missing and only
    // registered a bit below it, on real devices this can't be reproduced
    // on here to pin down exactly (a coordinate-mapping quirk this
    // environment doesn't hit). Generously over-covering upward is a real
    // fix for that specific symptom regardless of the exact root cause.
    const hitPadTop = 24;
    const hitPadBottom = 8;
    const hitPadSides = 10;
    const hitLeft = x - (size / 2) - hitPadSides;
    const hitTop = y - (size / 2) - hitPadTop;
    const hitWidth = size + (hitPadSides * 2);
    const hitHeight = size + hitPadTop + hitPadBottom;
    const background = this.add.rectangle(
      hitLeft + (hitWidth / 2),
      hitTop + (hitHeight / 2),
      hitWidth,
      hitHeight,
      0x000000,
      0.001
    );
    chrome.setDepth(LEGACY_OVERLAY_BACK_CHEVRON_DEPTH);
    background.setDepth(LEGACY_OVERLAY_BACK_CHEVRON_DEPTH);
    background.setInteractive({ useHandCursor: true });
    const label = this.padLegacyUiText(this.add.text(x, y, '', {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: '1px',
      color: MENU_TEXT_COLOR
    })).setOrigin(0.5).setAlpha(0).setDepth(3);
    this.overlayBackChevronBounds = createVisualRect(hitLeft, hitTop, hitWidth, hitHeight);

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
    options: { fullScreenHitArea?: boolean; labelRole?: LegacyUiLabelRole } = {}
  ): UiButton {
    const isMenuFrontDoor = this.mode === 'menu' && this.overlay === 'none';
    // Both the Start and Login front-door actions share the same borderless
    // pulsing-glow treatment (drawLegacyMenuPulsingStartGlow) instead of the
    // bordered cyber panel every other button keeps -- ties the primary menu
    // action into the title wordmark's crystal/glow language regardless of
    // which label is showing (signed-out vs signed-in).
    const isPrimaryFrontDoorButton = isMenuFrontDoor && (text === 'Start' || text === 'Login');
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
    // Every other button keeps the filled/bordered cyber panel. The primary
    // Start button has neither -- it's just a pulsating white glow ring (see
    // drawLegacyMenuPulsingStartGlow), redrawn continuously via updateFrame.
    const drawButtonPanel = (active: boolean): void => {
      panel.clear();
      this.drawLegacyCyberPanel(panel, {
        active,
        alpha: active
          ? Math.max(frontDoorChrome?.hoverAlpha ?? 0.68, 0.68)
          : baseAlpha,
        fill: active
          ? frontDoorChrome?.hoverFillColor ?? cyberArcadeMaterial.substrate.panelActive
          : frontDoorChrome?.fillColor ?? LEGACY_CYBER_PANEL_FILL,
        height,
        left: x - (width / 2),
        radius: LEGACY_UI_CONTROL_RADIUS,
        stroke: frontDoorChrome?.strokeColor,
        strokeAlt: cyberArcadeMaterial.rail.mint,
        top: y - (height / 2),
        width
      });
    };
    let primaryButtonActive = false;
    if (!isPrimaryFrontDoorButton) {
      drawButtonPanel(false);
    }
    // The primary front-door button has no panel shape at all -- the word
    // itself is drawn onto `panel` as tile glyphs instead (see
    // drawLegacyMenuFrontDoorGlyphButton, wired up below once the button's
    // final width/height are known).

    // The primary front-door action (Login/Start) can optionally trade its
    // normal button-sized tap target for the entire screen -- there's no
    // maze interaction to protect on the front door, so tapping anywhere
    // (background stars, the demo maze, empty space) should log in/start
    // instead of requiring a precise tap on the small glyph word. Explicitly
    // left at the default (lower) depth so the settings gear's own hit
    // rectangle -- set to a higher depth below -- still wins on overlap.
    const background = options.fullScreenHitArea === true
      ? this.add.rectangle(this.layout.width / 2, this.layout.height / 2, this.layout.width, this.layout.height, 0x000000, 0.001)
      : this.add.rectangle(x, y, width, height, 0x000000, 0.001);
    background.setInteractive({ useHandCursor: true });
    const textFitSize = Math.floor((width * (isMenuFrontDoor ? 1.08 : 1.45)) / Math.max(4, text.length));
    const buttonFontSize = frontDoorChrome?.fontSize ?? Math.max(
      18,
      Math.min(40, Math.min(Math.round(height * 0.46), textFitSize))
    );
    const buttonTextColor = isPrimaryFrontDoorButton
      ? MENU_TEXT_COLOR
      : frontDoorChrome?.textColor ?? MENU_TEXT_COLOR;

    const labelY = resolveLegacyUiLabelCenterY(y, buttonFontSize, options.labelRole ?? 'button');
    const label = this.padLegacyCompactUiText(this.add.text(x, labelY, text, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${buttonFontSize}px`,
      color: buttonTextColor
    })).setOrigin(0.5).setAlpha(frontDoorChrome?.labelAlpha ?? 0.92);
    const buttonHorizontalInset = Math.max(10, Math.min(18, Math.round(width * 0.08)));
    this.fitLegacyUiTextToWidth(
      label,
      Math.max(44, width - (buttonHorizontalInset * 2)),
      buttonFontSize,
      isMenuFrontDoor ? 15 : 13,
      0.96
    );
    this.uiTexts.push(label);
    // The rendered-font label stays in the scene graph (bounds/diagnostics
    // still read from it) but is invisible -- the visible word is the tile
    // glyphs drawn onto `panel` below.
    let glyphLayout: LegacyGlyphWordLayout | null = null;
    if (isPrimaryFrontDoorButton && isLegacyGlyphWordRenderable(text)) {
      label.setAlpha(0);
      const glyphColumns = resolveLegacyGlyphWordColumns(text);
      const glyphPaddingX = Math.max(10, Math.round(width * 0.1));
      const glyphPaddingY = Math.max(6, Math.round(height * 0.14));
      const cellSizeFromWidth = Math.floor(Math.max(1, width - (glyphPaddingX * 2)) / Math.max(1, glyphColumns));
      const cellSizeFromHeight = Math.floor(Math.max(1, height - (glyphPaddingY * 2)) / 7);
      const glyphCellSize = Math.max(2, Math.min(10, cellSizeFromWidth, cellSizeFromHeight));
      // Drawn in local coordinates around (0,0) with `panel` itself
      // positioned at (x, y) -- setScale on the graphics object then scales
      // around its own (x, y) origin correctly for the blink/grow-shrink
      // pulse, instead of scaling around the scene's (0,0) corner.
      panel.setPosition(x, y);
      glyphLayout = resolveLegacyGlyphWordLayout(text, 0, 0, glyphCellSize);
      this.drawLegacyMenuFrontDoorGlyphButton(panel, glyphLayout, 0, false);
    }

    const setActive = (active: boolean): void => {
      background.setFillStyle(
        0x000000,
        0.001
      );
      if (isPrimaryFrontDoorButton) {
        primaryButtonActive = active;
      } else {
        drawButtonPanel(active);
      }
      if (!glyphLayout) {
        label.setAlpha(
          active ? (frontDoorChrome?.hoverLabelAlpha ?? 0.98) : (frontDoorChrome?.labelAlpha ?? 0.92)
        );
      }
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
      updateFrame: glyphLayout
        ? (time: number) => {
          this.drawLegacyMenuFrontDoorGlyphButton(panel, glyphLayout!, time, primaryButtonActive);
        }
        : undefined,
      destroy: () => {
        panel.destroy();
        background.destroy();
        label.destroy();
      }
    };
  }

  private createLegacyMenuSettingsCogButton(onClick: () => void): UiButton {
    const laneTop = this.layout.lanes.hud?.top ?? 0;
    const pauseRect = resolveLegacyHeaderControlFrame({
      height: this.layout.height,
      hudHeight: this.layout.lanes.hud?.height ?? 64,
      hudTop: laneTop,
      placement: 'trailing',
      width: this.layout.width
    });
    this.menuSettingsCogActive = false;

    const background = this.add.rectangle(
      pauseRect.centerX,
      pauseRect.centerY,
      pauseRect.width,
      pauseRect.height,
      0x000000,
      0.001
    );
    background.setInteractive({ useHandCursor: true });
    // The front-door Login/Start hit target now spans the full screen (see
    // createButton's fullScreenHitArea) and would otherwise swallow taps on
    // the gear -- a higher depth keeps this smaller, precise hit rectangle
    // topmost so settings still opens instead of falling through to login.
    background.setDepth(3);
    const label = this.add.text(pauseRect.centerX, pauseRect.centerY, '', {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: '18px'
    }).setOrigin(0.5).setVisible(false);
    const setActive = (active: boolean): void => {
      if (this.menuSettingsCogActive === active) {
        return;
      }
      this.menuSettingsCogActive = active;
      this.boardDynamicDirty = true;
    };
    background.on('pointerover', () => setActive(true));
    background.on('pointerout', () => setActive(false));
    background.on('pointerdown', onClick);

    return {
      background,
      bounds: createVisualRect(pauseRect.left, pauseRect.top, pauseRect.width, pauseRect.height),
      iconOnly: true,
      label,
      semanticAction: 'Settings',
      setActive,
      text: 'Settings',
      destroy: () => {
        background.destroy();
        label.destroy();
      }
    };
  }

  private clearUi(): void {
    this.overlayScrollGraphics?.destroy();
    this.overlayScrollGraphics = null;
    this.overlayMovementSpeedSliderBounds = null;

    this.overlayGuideGraphics?.clearMask(false);
    this.overlayGuideMask?.destroy();
    this.overlayGuideMask = null;
    this.overlayGuideMaskGraphics?.destroy();
    this.overlayGuideMaskGraphics = null;

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
      this.playCompletedAtMs = null;
      const progressionBand = resolveLegacyProgressionDifficultyProfile(
        this.progressionState.tracks.player
      ).band;
      this.playStaticSlowTile = createLegacyStaticSlowTileState(this.maze, progressionBand);
      this.playRoomCandidateMetadata = createLegacyRoomCandidateMetadata(
        this.maze,
        progressionBand,
        this.playStaticSlowTile.placement?.point ?? null
      );
      this.playPatrolAgent = this.createLegacyPlayPatrolAgent(progressionBand);
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
    const progressionBand = resolveLegacyProgressionDifficultyProfile(
      this.progressionState.tracks.player
    ).band;
    this.playStaticSlowTile = createLegacyStaticSlowTileState(this.maze, progressionBand);
    this.playRoomCandidateMetadata = createLegacyRoomCandidateMetadata(
      this.maze,
      progressionBand,
      this.playStaticSlowTile.placement?.point ?? null
    );
    this.playPatrolAgent = null;
    this.resetLegacyWorldTurnHost();
    this.setLatestOverlayMessage(createLegacyPlayerMessage({
      copy: 'Player progression reset. AI progression was kept.',
      id: 'progression.player.reset',
      source: 'progression',
      tone: 'success'
    }));
    this.syncLegacyRemoteProgressionState('replace');
    this.openOverlay('pause');
    this.boardDynamicDirty = true;
    this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
  }

  private applyOverlayToggleFieldChange(fieldId: LegacyOverlayToggleFieldId): void {
    const result = applyLegacyOverlayToggleField(this.settings, fieldId);
    this.settings = writeLegacyGameToggleSettings(this.resolveLegacyGameToggleStorage(), result.settings);
    this.syncLegacyRemoteSettings();
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
    this.syncLegacyRemoteSettings();
    if (this.playHeldTouchMoves.length > 0 && this.playHeldTouchRepeatTimer !== null) {
      this.scheduleLegacyPlayHeldTouchRepeat(this.resolveLegacyPlayHeldTouchDelay('repeat'));
    }
    this.uiDirty = true;
    if (this.mode === 'play') {
      this.publishInteractionDiagnostics();
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
    this.authSnapshot = readLegacyBootstrappedAuthSnapshot() ?? createLegacyGuestAuthSnapshot();
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
    const previousMenuActionMode = this.authSnapshot.status === 'authenticated' ? 'authenticated' : 'guest';
    const previousUserId = this.authSnapshot.userId;

    this.authSnapshot = snapshot;
    this.authGateAwaitingResolution = false;
    this.authGateLocked = snapshot.status === 'guest' && snapshot.configured === true;
    this.pendingAuthGateTransition = true;
    const menuActionMode = snapshot.status === 'authenticated' ? 'authenticated' : 'guest';
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
      const hydrationSequence = ++this.authAccountHydrationSequence;
      this.loadPersistedLegacyGameToggleSettings();
      this.loadPersistedMazeCycleTelemetryHistory();
      this.loadPersistedLegacyProgressionState();
      if (snapshot.status === 'authenticated' && snapshot.userId) {
        void this.hydrateLegacyAccountDataAfterAuth(snapshot, hydrationSequence);
      }
      this.boardDynamicDirty = true;
      this.uiDirty = true;
      this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
      this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    }
    if (
      previousMenuActionMode !== menuActionMode
      && this.layout !== undefined
      && this.footerText !== undefined
    ) {
      this.refreshLayout();
    }
    // Deliberately NOT calling startPlayMode() here -- the runtime
    // diagnostics auth fixture resolves synchronously, which meant this
    // could run in the middle of create() itself, before footerText and
    // other scene objects refreshLayout() touches even exist yet (a hard
    // crash that silently aborted the rest of boot). update() can't fire
    // until create() has fully returned, so consuming the flag there
    // instead guarantees everything it needs already exists.
  }

  private async hydrateLegacyAccountDataAfterAuth(
    snapshot: LegacyAuthSessionSnapshot,
    hydrationSequence: number
  ): Promise<void> {
    let result: Awaited<ReturnType<typeof hydrateLegacyRemoteAccountState>>;
    try {
      result = await hydrateLegacyRemoteAccountState(snapshot, this.resolveBrowserLocalStorage());
    } catch {
      // The account-scoped local cache remains usable when the provider cannot
      // be reached. Do not turn a background refresh into a player-facing toast.
      return;
    }
    if (
      hydrationSequence !== this.authAccountHydrationSequence
      || snapshot.status !== this.authSnapshot.status
      || snapshot.userId !== this.authSnapshot.userId
    ) {
      return;
    }

    if (result.progressionState) {
      this.progressionState = result.progressionState;
    }
    if (result.settings) {
      this.settings = result.settings;
      this.optionFieldDrafts = createLegacyOptionFieldDrafts(result.settings);
      this.backdropDirty = true;
      this.boardPathDirty = true;
      this.boardStaticDirty = true;
      this.hudDirty = true;
    }
    this.boardDynamicDirty = true;
    this.uiDirty = true;
    this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
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
    const browserMobileParity = this.resolveLegacyBrowserMobileParity(this.scale.width, this.scale.height);
    return resolveLegacyProgressionGenerationScale(this.settings.scale, this.progressionState.tracks[trackId], {
      surface: mode === 'play' ? 'play' : 'menu-demo',
      viewport: {
        width: browserMobileParity ? LEGACY_PROGRESSION_PHONE_MENU_MAX_WIDTH : this.scale.width,
        height: this.scale.height
      }
    });
  }

  private resolveLegacyBrowserMobileParity(
    width = this.layout?.width ?? this.scale.width,
    height = this.layout?.height ?? this.scale.height
  ): boolean {
    return shouldUseLegacyBrowserMobileParity({ width, height });
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
    const completedAtMs = surface === 'play'
      ? this.playCompletedAtMs
      : this.menuDemoCompletedAtMs;

    this.mazeCycleTelemetryHistory = recordMazeCycleTelemetryReceipt(
      this.resolveMazeCycleTelemetryStorage(),
      {
        averageFrameMs: this.resolveRuntimeAverageFrameMs(),
        completionTimeMs: resolveLegacyFrozenElapsedMs({
          completedAtMs,
          nowMs: this.time.now,
          startedAtMs
        }),
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
      this.progressionBadgePulseStartedAtMs = this.legacyReducedMotionEnabled === true
        ? null
        : this.time.now;
      void writeLegacyRemoteCycleReceipt(this.authSnapshot, latestReceipt)
        .then((result) => {
          this.publishLegacyRemoteSyncResult(result);
        })
        .catch((error: unknown) => {
          this.publishLegacyRemoteSyncException('cycle-receipt', error);
        });
      this.syncLegacyRemoteProgressionState();
      this.boardDynamicDirty = true;
      this.uiDirty = true;
      this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    }

    if (surface === 'menu-demo') {
      this.menuDemoCycleRecorded = true;
    }
    this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
  }

  private syncLegacyRemoteProgressionState(mode: 'advance' | 'replace' = 'advance'): void {
    void writeLegacyRemoteProgressionState(this.authSnapshot, this.progressionState, undefined, mode)
      .then((result) => {
        if (result.progressionState) {
          this.progressionState = writeLegacyProgressionState(
            this.resolveLegacyProgressionStorage(),
            result.progressionState
          );
          this.boardDynamicDirty = true;
          this.uiDirty = true;
        }
        this.publishLegacyRemoteSyncResult(result);
      })
      .catch((error: unknown) => {
        this.publishLegacyRemoteSyncException('progression', error);
      });
  }

  private syncLegacyRemoteSettings(): void {
    if (this.remoteSettingsSyncTimer !== null) {
      clearTimeout(this.remoteSettingsSyncTimer);
    }
    this.remoteSettingsSyncTimer = setTimeout(() => {
      this.remoteSettingsSyncTimer = null;
      const snapshot = { ...this.authSnapshot };
      const settings = copyLegacySettings(this.settings);
      this.remoteSettingsSyncQueue = this.remoteSettingsSyncQueue.then(() => (
        this.flushLegacyRemoteSettings(snapshot, settings)
      ));
    }, 240);
  }

  private async flushLegacyRemoteSettings(
    snapshot: LegacyAuthSessionSnapshot,
    settings: LegacySettings
  ): Promise<void> {
    await writeLegacyRemoteSettings(snapshot, settings)
      .then((result) => {
        if (result.settings) {
          this.settings = writeLegacyGameToggleSettings(
            this.resolveLegacyGameToggleStorage(),
            result.settings
          );
          this.optionFieldDrafts = createLegacyOptionFieldDrafts(this.settings);
          this.boardStaticDirty = true;
          this.boardPathDirty = true;
          this.boardDynamicDirty = true;
          this.backdropDirty = true;
          this.uiDirty = true;
        }
        this.publishLegacyRemoteSyncResult(result);
      })
      .catch((error: unknown) => {
        this.publishLegacyRemoteSyncException('settings', error);
      });
  }

  private publishLegacyRemoteSyncResult(result: LegacyRemoteProgressionSyncResult): void {
    this.latestRemoteSyncResult = result;
    // Sync is deliberately silent for players. The full outcome remains in
    // diagnostics so failed writes can be observed and retried without turning
    // routine local persistence or cloud availability into gameplay chrome.
    this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
  }

  private publishLegacyRemoteSyncException(
    context: 'cycle-receipt' | 'progression' | 'settings',
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
          : context === 'settings'
            ? LEGACY_REMOTE_MESSAGE_COPY.settingsFailed
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
    // Full auth gate: no back-chevron, no Escape key, no route around this
    // -- the account overlay can only close by actually signing in (see
    // pendingAuthGateTransition in update()).
    if (this.authGateLocked && this.overlay === 'auth') {
      return;
    }
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

  // Covers the real gap before the very first auth snapshot arrives (see
  // authGateAwaitingResolution's own comment for why that's tracked
  // separately from authSnapshot.status itself). A full-screen, maximum-
  // depth interactive rectangle blocks every click from reaching whatever
  // the menu front door is doing underneath -- simplest way to guarantee
  // nothing is reachable during this window without auditing every place
  // create()'s own boot sequence might otherwise make a button clickable.
  private syncLegacyAuthGateLoadingScreen(time: number): void {
    if (!this.authGateAwaitingResolution) {
      if (this.authGateLoadingBlocker !== null) {
        this.authGateLoadingBlocker.destroy();
        this.authGateLoadingBlocker = null;
      }
      this.authGateLoadingText.setVisible(false);
      this.authGateGraphics.clear();
      return;
    }

    const width = this.layout.width;
    const height = this.layout.height;
    if (this.authGateLoadingBlocker === null) {
      this.authGateLoadingBlocker = this.add.rectangle(0, 0, width, height, 0x000000, 0.001).setOrigin(0, 0);
      this.authGateLoadingBlocker.setInteractive();
      this.authGateLoadingBlocker.setDepth(LEGACY_AUTH_GATE_LOADING_DEPTH);
    } else {
      this.authGateLoadingBlocker.setSize(width, height);
    }

    const centerX = width / 2;
    const centerY = height / 2;
    this.authGateGraphics.clear();
    this.authGateGraphics.setDepth(LEGACY_AUTH_GATE_LOADING_DEPTH - 1);
    this.authGateGraphics.fillStyle(0x02080f, 0.96);
    this.authGateGraphics.fillRect(0, 0, width, height);

    const pulse = 0.5 + (0.5 * Math.sin(time / 420));
    const radius = 16 + (pulse * 4);
    this.authGateGraphics.fillStyle(cyberArcadeMaterial.signal.player, 0.82 + (pulse * 0.14));
    this.authGateGraphics.beginPath();
    this.authGateGraphics.moveTo(centerX, centerY - radius);
    this.authGateGraphics.lineTo(centerX + radius, centerY);
    this.authGateGraphics.lineTo(centerX, centerY + radius);
    this.authGateGraphics.lineTo(centerX - radius, centerY);
    this.authGateGraphics.closePath();
    this.authGateGraphics.fillPath();
    this.authGateGraphics.lineStyle(2, cyberArcadeMaterial.rail.cyan, 0.5 + (pulse * 0.3));
    this.authGateGraphics.strokePath();

    this.authGateLoadingText.setPosition(centerX, centerY + radius + 26);
    this.authGateLoadingText.setVisible(true);
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
          deadzoneRadius: touchControlLayout.stick.deadzoneRadius,
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
          knobRadius: touchControlLayout.stick.knobRadius,
          pull: this.playTouchStickPull === null
            ? null
            : {
              angleRadians: this.playTouchStickPull.angleRadians,
              distanceRatio: this.playTouchStickPull.distanceRatio,
              movement: this.playTouchStickPull.movement,
              movementCandidates: [...this.playTouchStickPull.movementCandidates],
              normalizedX: this.playTouchStickPull.normalizedX,
              normalizedY: this.playTouchStickPull.normalizedY
            },
          travelRadius: touchControlLayout.stick.travelRadius
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
    const titleLayout = resolveLegacyMenuPathTitleLayout(
      this.layout.titleX,
      this.layout.titleY,
      this.resolveLegacyMenuPathTitleFontSize()
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
      this.layout.boardWidth,
      this.layout.boardHeight
    );
    const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(
      this.layout.boardLeft + boardOffset.x,
      this.layout.boardTop + boardOffset.y,
      this.layout.boardWidth,
      this.layout.boardHeight
    );
    const mazeRenderBounds = createVisualRect(
      mazeRenderFrame.boardLeft,
      mazeRenderFrame.boardTop,
      mazeRenderFrame.boardWidth,
      mazeRenderFrame.boardHeight
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
      rowCount: drawStageStaged ? this.maze.height : null,
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
    const overlayPanel = this.overlay === 'none' ? null : this.resolveOverlayPanelFrame();
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
      { id: 'menu-ai-progression-badge', bounds: this.menuAiProgressionBadgeBounds },
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
          ...(overlaps(mazeRenderBounds, this.menuAiProgressionBadgeBounds) ? ['board-menu-ai-progression-badge'] : []),
          ...(overlaps(this.progressionBadgeBounds, this.menuAiProgressionBadgeBounds) ? ['player-menu-ai-progression-badge'] : []),
          ...(overlaps(mazeRenderBounds, this.hudBounds) ? ['board-hud'] : []),
        ...(overlaps(mazeRenderBounds, touchControls.frame) ? ['board-touch-controls'] : [])
      ]
      : [];
    const materialSystem = summarizeCyberArcadeMaterial();

    this.visualDiagnosticsRevision += 1;
    const diagnostics: MenuSceneVisualDiagnostics = {
      accessibility: {
        reducedMotion: this.prefersLegacyReducedMotion(),
        reducedMotionSource: 'os-media-query-cache'
      },
      materialSystem: {
        ...materialSystem,
        geometry: {
          ...materialSystem.geometry,
          sharedPanelBounds: 'snapped-at-draw-boundary',
          textTextureResolution: this.resolveLegacyUiTextResolution(),
          textTransformOwner: 'game-canvas-only'
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
        mazeSize: Math.max(this.maze.width, this.maze.height),
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
          alpha: 0,
          animated: false,
          shimmerPeriodMs: 0,
          visible: false
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
          this.layout.boardWidth
        )
      },
      markerStyle: {
        goalCoreColor: LEGACY_PLAY_GOAL_MARKER_CORE,
        goalEdgeColor: LEGACY_PLAY_GOAL_MARKER_EDGE,
        playerCoreColor: resolveLegacyIridescentPlayerCoreColor(time),
        playerCoreRadius: playerMarkerMetrics.coreRadius,
        playerBeaconAccentColor: LEGACY_PLAY_PLAYER_BEACON_ACCENT,
        playerBeaconColor: LEGACY_PLAY_PLAYER_BEACON_COLOR,
        playerBeaconPeriodMs: LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS,
        playerHaloColor: progressionPalette.playerHaloColor,
        playerHaloRadius: playerMarkerMetrics.haloRadius,
        startCoreColor: LEGACY_PLAY_START_MARKER_CORE,
        startEdgeColor: LEGACY_PLAY_START_MARKER_EDGE,
          trailPulseEnabled: this.isLegacyTrailShineVisible(),
        trailPulseColor: progressionPalette.trailPulseColor,
        trailPulseEdgeColor: progressionPalette.trailPulseEdgeColor,
          trailShineEnabled: this.isLegacyTrailShineVisible(),
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
        label: this.progressionBadgeLabelText.visible ? this.progressionBadgeLabelText.text : null,
        labelBounds: cloneVisualRect(this.progressionBadgeLabelBounds),
        text: this.progressionBadgeText.visible ? this.progressionBadgeText.text : null,
        textBounds: cloneVisualRect(this.progressionBadgeTextBounds),
        textFontSize: Number.isFinite(Number.parseFloat(String(this.progressionBadgeText.style.fontSize)))
          ? Number.parseFloat(String(this.progressionBadgeText.style.fontSize))
          : null,
        textFits: this.progressionBadgeTextFits
      },
      menuAiProgressionBadge: {
        bounds: cloneVisualRect(this.menuAiProgressionBadgeBounds),
        label: this.menuAiProgressionBadgeLabelText.visible ? this.menuAiProgressionBadgeLabelText.text : null,
        labelBounds: cloneVisualRect(this.menuAiProgressionBadgeLabelBounds),
        text: this.menuAiProgressionBadgeText.visible ? this.menuAiProgressionBadgeText.text : null,
        textBounds: cloneVisualRect(this.menuAiProgressionBadgeTextBounds),
        textFontSize: Number.isFinite(Number.parseFloat(String(this.menuAiProgressionBadgeText.style.fontSize)))
          ? Number.parseFloat(String(this.menuAiProgressionBadgeText.style.fontSize))
          : null,
        textFits: this.menuAiProgressionBadgeTextFits
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
          iconOnly: button.iconOnly === true,
          labelBounds: button.label.active && button.label.visible
            ? visualRectFromBounds(button.label.getBounds())
            : null,
          labelFontSize: Number.isFinite(Number.parseFloat(String(button.label.style.fontSize)))
            ? Number.parseFloat(String(button.label.style.fontSize))
            : null,
          semanticAction: button.semanticAction ?? button.text,
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
        timerText: this.hudFrame?.timerText ?? null
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
