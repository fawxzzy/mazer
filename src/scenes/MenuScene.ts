import Phaser from 'phaser';
import {
  collectDemoWalkerRouteDiagnostics,
  type DemoRunnerTelemetry,
  type DemoWalkerConfig,
  type DemoWalkerState
} from '../domain/ai';
import type { MazeEpisode } from '../domain/maze';
import { markMazerBootStatus } from '../boot/bootStatus';
import { legacyTuning } from '../config/tuning';
import {
  LEGACY_DEFAULTS,
  MAIN_MENU_BUTTONS,
  copyLegacySettings,
  linearColorToHex,
  type LegacySettings
} from '../legacy-runtime/legacyDefaults';
import {
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
  consumeLegacyGenerationRequestState,
  createLegacyGenerationRequest,
  shouldConsumeLegacyGenerationRequest,
  type LegacyGenerationRequest,
} from '../legacy-runtime/legacyGenerationLifecycle';
import {
  createLegacyResetRequest,
  hasPendingLegacyResetRequest,
  shouldConsumeLegacyResetRequest,
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
  resolveLegacyPlayDiagonalSequenceSteps,
  resolveLegacyPointerMoveVector,
  resolveLegacyPlayMoveVector,
  isSameLegacyPlayPointer,
  type LegacyPlayMoveFlags,
  type LegacyPlayPointerStart
} from '../legacy-runtime/legacyPlayStep';
import {
  resolveLegacyCompassSpinFrame,
  resolveLegacyPlayHudFrame,
  type LegacyPlayHudFrame
} from '../legacy-runtime/legacyPlayHud';
import {
  advanceLegacyMenuDemoFrame,
  createLegacyMenuDemoBootstrap,
  type LegacyMenuDemoAdvance
} from '../legacy-runtime/legacyMenuDemoLifecycle';
import {
  resolveLegacyMenuLayout,
  type LegacyMenuLayout
} from '../legacy-runtime/legacyMenuLayout';
import {
  resolveLegacyPathVisualStyle,
  type LegacyPathVisualStyle
} from '../legacy-runtime/legacyPathVisualStyle';
import { resolveLegacyMenuButtonChrome } from '../legacy-runtime/legacyMenuButtonChrome';
import {
  resolveLegacyMenuPathTitleLayout,
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
  readLegacyGameToggleSettings,
  writeLegacyGameToggleSettings
} from '../legacy-runtime/legacyGameTogglePreferences';
import {
  MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT,
  readMazeCycleTelemetryHistory,
  recordMazeCycleTelemetryReceipt,
  summarizeMazeCycleTelemetryDiagnostics,
  type MazeCycleTelemetryHistory,
  type MazeCycleTelemetrySurface
} from '../legacy-runtime/mazeCycleTelemetry';
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
} from '../legacy-runtime/legacyDemoWalker';
import {
  resolveLegacyEndpointMarkerRenderMetrics,
  resolveLegacyMenuPathRenderFrames,
  resolveLegacyMenuPathRenderSegments,
  resolveLegacyPlayerLocatorRenderMetrics,
  resolveLegacyPlayerMarkerRenderMetrics
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
  isMovementActionKind,
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
  label: Phaser.GameObjects.Text;
  setActive(active: boolean): void;
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

interface MenuSceneVisualDiagnostics {
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
  };
  markerStyle: {
    goalCoreColor: number;
    goalEdgeColor: number;
    playerCoreColor: number;
    playerCoreRadius: number;
    playerHaloColor: number;
    playerHaloRadius: number;
    startCoreColor: number;
    startEdgeColor: number;
    trailPulseEnabled: boolean;
    trailPulseColor: number;
    trailPulseEdgeColor: number;
    trailPulsePeriodMs: number;
  };
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
  title: {
    animation: {
      active: boolean;
      facetCellCount: number;
      facetPulsePeriodMs: number;
      phase: number;
      scannerDirection: LegacyMenuPathTitleSweepState['direction'];
      scannerMode: LegacyMenuPathTitleSweepMode;
      scannerProgress: number;
      scannerSyncedToLifecycle: boolean;
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
    panel: VisualRect | null;
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
      pathCursor: number | null;
      phase: DemoWalkerState['phase'] | null;
      prerollSteps: number;
      reachedGoal: boolean;
      runnerMistakesEnabled: boolean;
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
        progressPercent: number | null;
        rowCount: number | null;
        rowsRemaining: number | null;
        rowsVisible: number | null;
        staged: boolean;
        titleFullyDeconstructed: boolean;
        titlePieceCount: number;
        titlePiecesRemaining: number;
        titleVisiblePieces: number;
        tileCount?: number | null;
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
    trailLength: number;
    trailTail: LegacyPoint[];
  };
  revision: number;
  updatedAt: number;
  viewport: {
    height: number;
    safeInsets: {
      bottom: number;
      left: number;
      right: number;
      top: number;
    };
    width: number;
  };
}

declare global {
  interface Window {
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
const MENU_TEXT_COLOR = '#ecfff5';
const LEGACY_MENU_PATH_TITLE_SHADOW = 0x02070d;
const LEGACY_MENU_PATH_TITLE_ACCENT = 0x36ff7d;
const LEGACY_MENU_PATH_TITLE_PRISM = 0xb7f2ff;
const LEGACY_MENU_PATH_TITLE_RUNE = 0xfff05a;
const LEGACY_MENU_PATH_TITLE_GEM = 0x8fffe8;
const LEGACY_MENU_PATH_TITLE_FACET_WARM = 0xffd36a;
const LEGACY_MENU_PATH_TITLE_SWEEP_MS = 2600;
const LEGACY_MENU_PATH_TITLE_SWEEP_OVERSCAN_COLUMNS = 3;
const LEGACY_MENU_PATH_TITLE_GEM_PULSE_MS = 3400;
const LEGACY_MENU_PATH_TITLE_ORBIT_MS = 6200;
const LEGACY_MENU_PATH_TITLE_FRAME_MS = 66;
const LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS = 6;
const LEGACY_MENU_PATH_TITLE_SHADOW_ALPHA = 0.44;
const LEGACY_MENU_PATH_TITLE_ACCENT_ALPHA = 0.92;
const LEGACY_BOARD_GRID_ALPHA = 0;
const INITIAL_MENU_DEMO_HOLD_MS = 1800;
const TRAIL_FADE_TAIL = 16;
const LEGACY_MENU_SLAB_FILL = 0x101824;
const LEGACY_MENU_PANEL_SHADOW_ALPHA = 0;
const LEGACY_MENU_PATH_CORE = 0xe7fff4;
const LEGACY_MENU_PATH_EDGE = 0x0d3c4f;
const LEGACY_MENU_PATH_EDGE_ALPHA = 0.58;
const LEGACY_MENU_WALL_FILL = 0x07111d;
const LEGACY_MENU_WALL_GLASS_ALPHA = 0.18;
const LEGACY_MENU_BOARD_GLASS_ALPHA = 0.1;
const LEGACY_PLAY_PATH_CORE = 0xe7fff4;
const LEGACY_PLAY_PATH_EDGE = 0x0d3c4f;
const LEGACY_PLAY_PATH_EDGE_ALPHA = 0.58;
const LEGACY_PLAY_WALL_FILL = 0x07111d;
const LEGACY_PLAY_WALL_GLASS_ALPHA = 0.18;
const LEGACY_PLAY_BOARD_GLASS_ALPHA = 0.1;
const LEGACY_PLAY_BOARD_FILL = 0x08111d;
const LEGACY_PLAY_BOARD_EDGE = 0x031022;
const LEGACY_PATH_TILE_CUE_COLOR = 0x0d3c4f;
const LEGACY_PATH_TILE_CUE_ALPHA = 0.42;
const LEGACY_BOARD_SIGIL_BORDER_PRIMARY = 0x72e0bf;
const LEGACY_BOARD_SIGIL_BORDER_SECONDARY = 0xb7f2ff;
const LEGACY_BOARD_SIGIL_BORDER_SHADOW = 0x02070d;
const LEGACY_BOARD_SIGIL_BORDER_ALPHA = 0.82;
const LEGACY_BOARD_SIGIL_BACKGROUND_ALPHA = 0.12;
const LEGACY_BOARD_SIGIL_CORNER_FACET_BASE = 0x10293a;
const LEGACY_BOARD_SIGIL_CORNER_FACET_GLOW = 0xb7f2ff;
const LEGACY_BOARD_SIGIL_CORNER_FACET_IRIS = 0x72e0bf;
const LEGACY_BOARD_SIGIL_CORNER_FACET_PRISM = 0xffd66b;
const LEGACY_BOARD_SIGIL_CORNER_FACET_HOTSPOT = 0xffffff;
const LEGACY_BOARD_SIGIL_CORNER_FACET_ALPHA = 0.34;
const LEGACY_BOARD_SIGIL_CORNER_FACET_SIZE_RATIO = 0.066;
const LEGACY_BOARD_SIGIL_CORNER_FACET_SHIMMER_MS = 1600;
const LEGACY_BOARD_SIGIL_CORNER_FACET_FRAME_MS = 50;
const LEGACY_BOARD_MAZE_SAFE_INSET_RATIO = 0.018;
const LEGACY_BOARD_MAZE_SAFE_INSET_MIN = 4;
const LEGACY_BOARD_MAZE_SAFE_INSET_MAX = 7;
const LEGACY_PLAY_HUD_TIMER_PANE = 0x07131d;
const LEGACY_PLAY_HUD_TIMER_PANE_ALPHA = 0.68;
const LEGACY_PLAY_HUD_TIMER_TEXT = '#ecfff5';
const LEGACY_PLAY_HUD_TIMER_SHADOW = '#081208';
const LEGACY_PLAY_HUD_ARROW = 0xff263f;
const LEGACY_PLAY_HUD_ARROW_TAIL = 0xecfff5;
const LEGACY_PLAY_HUD_ARROW_SHADOW = 0x06080a;
const LEGACY_PLAY_TOUCH_FRAME_FILL = 0x06121c;
const LEGACY_PLAY_TOUCH_BUTTON_FILL = 0x0c2633;
const LEGACY_PLAY_TOUCH_BUTTON_STROKE = 0xb7f2ff;
const LEGACY_PLAY_TOUCH_ICON = 0xecfff5;
const LEGACY_PLAY_TOUCH_ACCENT = 0x72e0bf;
const LEGACY_CYBER_PANEL_FILL = 0x07131d;
const LEGACY_CYBER_PANEL_STROKE = 0x72e0bf;
const LEGACY_CYBER_PANEL_STROKE_ALT = 0xb7f2ff;
const LEGACY_CYBER_PANEL_SHADOW = 0x02070d;
const LEGACY_OVERLAY_SCROLL_WHEEL_STEP = 42;
const LEGACY_OVERLAY_SCROLL_DRAG_START_PX = 3;
const LEGACY_OVERLAY_SCROLL_RIGHT_GUTTER = 20;
const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_COLOR = 0x36ff7d;
const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_EDGE = 0xecfff5;
const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS = 2600;
const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_WINDOW = 3.6;
const LEGACY_PLAY_TRAIL_PULSE_FRAME_INTERVAL_MS = 50;
const LEGACY_PLAY_DIAGONAL_SPRINT_STEP_MS = 56;
const LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT = 2;
const LEGACY_PLAY_STICK_RETARGET_STEP_MS = 64;
const LEGACY_PLAY_STICK_RETARGET_RESCHEDULE_GRACE_MS = 16;
const LEGACY_PLAY_STICK_INITIAL_DELAY_MAX_MS = 144;
const LEGACY_PLAY_STICK_REPEAT_INTERVAL_MAX_MS = 104;
const LEGACY_PLAY_STICK_TURN_DELAY_MAX_MS = 144;
const LEGACY_PLAY_COMPASS_SPIN_DURATION_MS = 1800;
const LEGACY_PLAY_COMPASS_SPIN_TURNS = 3.25;
const LEGACY_PLAYER_MARKER_SHADOW = 0x00131f;
const LEGACY_PLAYER_MARKER_HALO = 0x00b84a;
const LEGACY_PLAYER_MARKER_CORE = 0x36ff7d;
const LEGACY_PLAYER_MARKER_RADIUS_RATIO = 0.34;
const LEGACY_PLAYER_MARKER_HALO_RATIO = 0.54;
const LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO = 0.34;
const LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO = 0.46;
const LEGACY_PLAY_START_MARKER_CORE = 0xfff05a;
const LEGACY_PLAY_START_MARKER_EDGE = 0xffc629;
const LEGACY_PLAY_GOAL_MARKER_CORE = 0xff263f;
const LEGACY_PLAY_GOAL_MARKER_EDGE = 0xd81b2a;
const LEGACY_MENU_STATIC_DRAW_ROW_STEP_MS = 64;
const LEGACY_MENU_STATIC_DRAW_TILE_STEP_MS = 44;
const LEGACY_MENU_STATIC_DECONSTRUCT_TILE_STEP_MS = 34;
const LEGACY_MENU_STATIC_DRAW_TARGET_TICKS = 96;
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
const cloneLegacyScenePoint = (point: LegacyPoint): LegacyPoint => ({ x: point.x, y: point.y });

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
  private pendingResetRequest: LegacyResetRequest | null = null;
  private pendingOverlayMazeRebuild = false;
  private playMoveFlags: LegacyPlayMoveFlags = createLegacyPlayMoveFlags();
  private playMoveTimer: Phaser.Time.TimerEvent | null = null;
  private playDiagonalMoveQueue: Array<{ deltaX: number; deltaY: number }> = [];
  private playDiagonalMoveTimer: Phaser.Time.TimerEvent | null = null;
  private playHeldTouchMoves: LegacyPlayHeldTouchMove[] = [];
  private playHeldTouchSequence = 0;
  private playHeldTouchRepeatTimer: Phaser.Time.TimerEvent | null = null;
  private playHeldTouchRepeatDueAtMs: number | null = null;
  private playTouchStickPointerId: number | null = null;
  private playTouchStickPull: TouchStickPullVector | null = null;
  private playPointerStart: LegacyPlayPointerStart | null = null;
  private titleGraphics!: Phaser.GameObjects.Graphics;
  private footerText!: Phaser.GameObjects.Text;
  private backdropGraphics!: Phaser.GameObjects.Graphics;
  private boardStaticGraphics!: Phaser.GameObjects.Graphics;
  private boardPathGraphics!: Phaser.GameObjects.Graphics;
  private boardDynamicGraphics!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private overlayScrollGraphics: Phaser.GameObjects.Graphics | null = null;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private uiTexts: Phaser.GameObjects.Text[] = [];
  private uiButtons: UiButton[] = [];
  private overlayBackChevronBounds: VisualRect | null = null;
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
    this.loadPersistedLegacyGameToggleSettings();
    this.loadPersistedMazeCycleTelemetryHistory();
    this.initializeRuntimeDiagnostics();
    this.backdropGraphics = this.add.graphics();
    this.boardStaticGraphics = this.add.graphics();
    this.boardPathGraphics = this.add.graphics();
    this.boardDynamicGraphics = this.add.graphics();
    this.titleGraphics = this.add.graphics();
    this.overlayGraphics = this.add.graphics();
    this.hudGraphics = this.add.graphics();

    this.footerText = this.add.text(0, 0, '', {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: '18px',
      color: '#d7d6de',
      align: 'center'
    }).setOrigin(0.5).setAlpha(0.92);

    this.createStars();
    if (resolveInitialRuntimeMode(runtimeSearch) === 'play') {
      this.startPlayMode();
    } else {
      this.applyGenerationRequest(
        createLegacyGenerationRequest({
          currentSeed: this.mazeSeed,
          dueAtMs: this.time.now,
          mode: 'menu',
          queuedAtMs: this.time.now,
          reason: 'boot-menu',
          scale: this.settings.scale
        }),
        this.time.now + INITIAL_MENU_DEMO_HOLD_MS
      );
    }
    this.installInput();
    this.installLegacyPlayFocusGuards();

    this.scale.on('resize', () => {
      this.refreshLayout();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.detachRuntimeDiagnostics();
      this.detachLegacyPlayFocusGuards();
      this.detachLegacyPlayKeyboardFallback();
      this.detachLegacyPlayTouchControlFallback();
      this.clearVisualDiagnostics();
      clearMenuSceneRuntimeDiagnostics();
    });
    this.publishVisualDiagnostics(this.time.now, true);
    this.publishRuntimeDiagnostics(this.time.now, true);
  }

  public update(time: number, delta: number): void {
    this.recordRuntimeFrame(delta);
    this.updateStars(time, delta);

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
    if (this.hasLegacyBoardCornerShimmerPendingFrame(time)) {
      this.boardDynamicDirty = true;
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

    if (
      !force
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
    const drawStageStaged = this.mode === 'menu' && drawStage?.executionKind === 'row-slice';
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
    const runnerTelemetry = routeDiagnostics?.telemetry ?? this.menuDemoState?.telemetry ?? {
      wrongBranchCount: 0,
      backtrackCount: 0,
      recoveryCount: 0
    };
    const movementSpeedProfile = resolveLegacyMovementSpeedProfile(this.settings.movementSpeed);
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
    const playerMarkerMetrics = resolveLegacyPlayerMarkerRenderMetrics(
      mazeRenderFrame.tileSize,
      this.mode === 'play' ? LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO : LEGACY_PLAYER_MARKER_RADIUS_RATIO,
      this.mode === 'play' ? LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO : LEGACY_PLAYER_MARKER_HALO_RATIO
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
        inputBuffer: {
          held: {
            down: this.playMoveFlags.down,
            left: this.playMoveFlags.left,
            right: this.playMoveFlags.right,
            up: this.playMoveFlags.up
          },
          pendingTimerActive: this.playMoveTimer !== null,
          pointerStartActive: this.playPointerStart !== null,
          touchSprint: {
            activeControls: this.playHeldTouchMoves.map((move) => move.control),
            heldControl: this.resolveLegacyPlayHeldTouchControl(),
            movementSpeed: normalizeLegacyMovementSpeed(this.settings.movementSpeed),
            movementSpeedLabel: formatLegacyMovementSpeedPercent(this.settings.movementSpeed),
            repeatInitialDelayMs: movementSpeedProfile.initialDelayMs,
            repeatIntervalMs: movementSpeedProfile.repeatIntervalMs,
            stickInitialDelayMaxMs: LEGACY_PLAY_STICK_INITIAL_DELAY_MAX_MS,
            stickRepeatIntervalMaxMs: LEGACY_PLAY_STICK_REPEAT_INTERVAL_MAX_MS,
            stickRetargetDelayMs: LEGACY_PLAY_STICK_RETARGET_STEP_MS,
            stickTurnDelayMaxMs: LEGACY_PLAY_STICK_TURN_DELAY_MAX_MS,
            turnDelayMs: movementSpeedProfile.turnDelayMs,
            pendingStepCount: this.playDiagonalMoveQueue.length,
            repeatTimerActive: this.playHeldTouchRepeatTimer !== null,
            stepTimerActive: this.playDiagonalMoveTimer !== null
          },
          resolvedVector: resolveLegacyPlayMoveVector(this.playMoveFlags),
          simultaneousDelayMs: LEGACY_SIMULTANEOUS_KEY_PRESS_DELAY_MS
        },
        player: {
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
          playerCoreColor: LEGACY_PLAYER_MARKER_CORE,
          playerCoreRadius: playerMarkerMetrics.coreRadius,
          playerHaloColor: LEGACY_PLAYER_MARKER_HALO,
          playerHaloRadius: playerMarkerMetrics.haloRadius,
          startCoreColor: LEGACY_PLAY_START_MARKER_CORE,
          startEdgeColor: LEGACY_PLAY_START_MARKER_EDGE,
          trailPulseEnabled: this.settings.toggleTrailPulse,
          trailPulseColor: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_COLOR,
          trailPulseEdgeColor: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_EDGE,
          trailPulsePeriodMs: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS
        }
      },
      menuDemo: {
        phase: this.menuDemoState?.phase ?? null,
        cue: this.menuDemoState?.cue ?? null,
        pathCursor: this.menuDemoState?.pathCursor ?? null,
        reachedGoal: this.menuDemoState?.reachedGoal ?? false,
        prerollSteps: Math.max(0, this.menuDemoConfig?.behavior.prerollSteps ?? 0),
        runnerMistakesEnabled: this.menuDemoConfig
          ? this.menuDemoConfig.behavior.enableRunnerMistakes === true
          : null,
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
          seedSource: this.explicitRuntimeMazeSeed ? 'query' : 'runtime-random',
          solutionPathLength: this.maze.solutionPath.length,
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
          nextSeedQueued: this.mode === 'menu' && this.pendingGenerationRequest?.reason === 'menu-demo-goal-reset',
          progressPercent: drawStageProgress.progressPercent,
          rowCount: drawStageProgress.rowCount,
          rowsRemaining: drawStageProgress.rowsRemaining,
          rowsVisible: drawRowsVisible,
          staged: drawStageStaged,
          titleFullyDeconstructed: titleVisiblePieces === 0,
          titlePieceCount,
          titlePiecesRemaining,
          titleVisiblePieces,
          tileCount: drawStageProgress.tileCount,
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
          recoveryCount: runnerTelemetry.recoveryCount
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

    if (this.overlay !== 'none' && this.handleOverlayFieldInput(event)) {
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

    if (lowerKey === 'r' && this.mode === 'play' && (this.overlay === 'none' || this.overlay === 'pause')) {
      event.preventDefault();
      this.applyLegacyPauseCommand('reset-player');
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
    this.overlayScrollTrackBounds = this.legacyOverlayScrollRectToVisualRect(metrics.track);
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
    const wasHeld = this.playMoveFlags[direction];
    this.playMoveFlags[direction] = true;
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
    this.playMoveFlags[direction] = false;
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
        if (this.overlay === 'none' || this.overlay === 'pause') {
          this.applyLegacyPauseCommand('reset-player');
          return true;
        }
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
    const profile = resolveLegacyMovementSpeedProfile(this.settings.movementSpeed);
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

    if (this.playDiagonalMoveTimer !== null || this.playDiagonalMoveQueue.length > 0) {
      this.scheduleLegacyPlayHeldTouchRepeat(LEGACY_PLAY_DIAGONAL_SPRINT_STEP_MS);
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

  private performLegacyPlayTouchMove(control: HumanMovementActionKind): boolean {
    switch (control) {
      case 'move_up':
        return this.tryMovePlayer(0, -1);
      case 'move_up_right':
        return this.startLegacyPlayDiagonalSprint(1, -1);
      case 'move_right':
        return this.tryMovePlayer(1, 0);
      case 'move_down_right':
        return this.startLegacyPlayDiagonalSprint(1, 1);
      case 'move_down':
        return this.tryMovePlayer(0, 1);
      case 'move_down_left':
        return this.startLegacyPlayDiagonalSprint(-1, 1);
      case 'move_left':
        return this.tryMovePlayer(-1, 0);
      case 'move_up_left':
        return this.startLegacyPlayDiagonalSprint(-1, -1);
      default:
        return control satisfies never;
    }
  }

  private performLegacyPlayHeldTouchMove(): boolean {
    const candidates = resolveHumanMovementPriorityCandidates(
      this.playHeldTouchMoves.map((move) => move.control),
      LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT
    );

    for (const control of candidates) {
      if (this.performLegacyPlayTouchMove(control)) {
        return true;
      }
    }

    return false;
  }

  private resolveLegacyPlayTouchControlLayout(): ReturnType<typeof resolveTouchControlLayout> {
    const boardBounds = this.resolveLegacyPlayBoardBounds();

    return resolveTouchControlLayout({
      width: this.layout.width,
      height: this.layout.height
    }, {
      compact: this.layout.width < 720 || this.layout.height < 720,
      controlMode: this.settings.controlMode,
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
    return this.mode === 'play' && this.overlay === 'none' && touchControlLayout.compact;
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
    this.tryMovePlayer(deltaX, deltaY);
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
    this.playDiagonalMoveTimer?.remove(false);
    this.playDiagonalMoveTimer = null;
    this.playDiagonalMoveQueue = [];
    this.clearLegacyPlayHeldTouchRepeat();
    this.playHeldTouchMoves = [];
    this.playTouchStickPointerId = null;
    this.playTouchStickPull = null;
    this.playMoveFlags = createLegacyPlayMoveFlags();
    this.playPointerStart = null;
  }

  private resetLegacyPlayDirectionalInputBuffer(): void {
    this.playMoveTimer?.remove(false);
    this.playMoveTimer = null;
    this.playDiagonalMoveTimer?.remove(false);
    this.playDiagonalMoveTimer = null;
    this.playDiagonalMoveQueue = [];
    this.playMoveFlags = createLegacyPlayMoveFlags();
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

    this.tryMovePlayer(deltaX, deltaY);
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

  private refreshLayout(): void {
    const width = this.scale.width;
    const height = this.scale.height;
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
    const generationState = consumeLegacyGenerationRequestState(request, this.settings.scale);
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
      this.trail = bootstrap.trail;
      this.menuDemoCycleStartedAtMs = this.time.now;
      this.menuDemoCycleRecorded = false;
      this.playCyclePath = [];
      this.playCycleResetUsed = false;
    } else {
      this.menuDemoConfig = createLegacyMenuDemoWalkerConfig(this.maze.seed);
      this.menuDemoState = null;
      this.player = generationState.initialPlayer;
      this.trail = generationState.initialTrail;
      this.playCyclePath = generationState.initialTrail.map(copyPoint);
      this.playCycleResetUsed = false;
      if (generationState.startsPlayTimer) {
        this.playStartedAtMs = this.time.now;
      }
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
    }
  }

  private shouldDelayLegacyMenuDeconstructRebuild(request: LegacyGenerationRequest, time: number): boolean {
    if (
      request.reason !== 'menu-demo-goal-reset'
      || this.mode !== 'menu'
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
    this.applyGenerationRequest(
        createLegacyGenerationRequest({
          currentSeed: this.mazeSeed,
          dueAtMs: this.time.now,
          mode: this.mode,
          queuedAtMs: this.time.now,
          reason: this.mode === 'play' ? 'play-start' : 'boot-menu',
          scale: this.settings.scale
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

  private queueGenerationRequest(
    reason: LegacyGenerationRequest['reason'],
    delayMs = 0,
    options: {
      mode?: RuntimeMode;
      stepSeed?: boolean;
    } = {}
  ): void {
    const mode = options.mode ?? this.mode;
    this.pendingGenerationRequest = createLegacyGenerationRequest({
      currentSeed: this.mazeSeed,
      dueAtMs: this.time.now + Math.max(0, delayMs),
      mode,
      queuedAtMs: this.time.now,
      reason,
      scale: this.settings.scale,
      stepSeed: options.stepSeed === true
    });
  }

  private resolveLegacyMenuStaticDrawStage(): RuntimeGenerationStage | null {
    return this.maze.generation?.executionPlan.find((stage) => stage.id === 6) ?? null;
  }

  private resolveLegacyMenuStaticDrawRowsVisibleForDiagnostics(): number | null {
    const drawStage = this.resolveLegacyMenuStaticDrawStage();
    if (this.mode !== 'menu' || drawStage?.executionKind !== 'row-slice') {
      return null;
    }

    return this.menuStaticDrawRowsVisible ?? this.maze.size;
  }

  private resolveLegacyMenuStaticDrawTilesVisibleForDiagnostics(): number | null {
    if (this.mode !== 'menu' || this.menuStaticDrawTileOrder.length <= 0) {
      return null;
    }

    return this.menuStaticDrawTilesVisible ?? this.menuStaticDrawTileOrder.length;
  }

  private resolveLegacyMenuStaticDrawRowLimit(): number | null {
    return this.mode === 'menu' && this.menuStaticDrawRowsVisible !== null
      ? this.menuStaticDrawRowsVisible
      : null;
  }

  private resolveLegacyMenuStaticDrawTileLimit(): number | null {
    return this.mode === 'menu' && this.menuStaticDrawTilesVisible !== null
      ? this.menuStaticDrawTilesVisible
      : null;
  }

  private isLegacyMenuPointVisibleInStaticDraw(point: LegacyPoint): boolean {
    if (this.mode !== 'menu') {
      return true;
    }

    const tileLimit = this.resolveLegacyMenuStaticDrawTileLimit();
    if (tileLimit !== null) {
      return this.menuStaticDrawVisibleTileKeys.has(legacyScenePointKey(point));
    }

    const rowLimit = this.resolveLegacyMenuStaticDrawRowLimit();
    return rowLimit === null || point.y < rowLimit;
  }

  private buildLegacyMenuStaticDrawTileOrder(): LegacyPoint[] {
    const orderedTiles: LegacyPoint[] = [];
    const seen = new Set<string>();
    const solutionKeys = new Set(this.maze.solutionPath.map(legacyScenePointKey));
    const appendTile = (point: LegacyPoint | undefined): void => {
      if (!point || this.maze.grid[point.y]?.[point.x] !== true) {
        return;
      }
      const key = legacyScenePointKey(point);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      orderedTiles.push(cloneLegacyScenePoint(point));
    };

    appendTile(this.maze.generationBuildTrace?.start ?? this.maze.start);
    appendTile(this.maze.generationBuildTrace?.finalGoal ?? this.maze.goal);

    for (const point of this.maze.solutionPath) {
      appendTile(point);
    }

    for (const point of this.maze.generationBuildTrace?.pathTiles ?? []) {
      if (!solutionKeys.has(legacyScenePointKey(point))) {
        appendTile(point);
      }
    }

    for (const point of this.maze.generationBuildTrace?.shortcutTiles ?? []) {
      appendTile(point);
    }

    for (const point of this.maze.generationBuildTrace?.reinforcementShortcutTiles ?? []) {
      appendTile(point);
    }

    for (let y = 0; y < this.maze.size; y += 1) {
      for (let x = 0; x < this.maze.size; x += 1) {
        if (this.maze.grid[y]?.[x] !== true) {
          continue;
        }
        appendTile({ x, y });
      }
    }

    return orderedTiles;
  }

  private resolveLegacyMenuStaticDrawDemoGateAtMs(): number {
    const drawStage = this.resolveLegacyMenuStaticDrawStage();
    if (this.mode !== 'menu' || drawStage?.executionKind !== 'row-slice') {
      return this.time.now;
    }

    const batchSize = Math.max(1, this.resolveLegacyMenuStaticDrawTileBatchSize());
    const tileTicks = Math.ceil(Math.max(1, this.menuStaticDrawTileOrder.length) / batchSize);
    return this.time.now + (tileTicks * LEGACY_MENU_STATIC_DRAW_TILE_STEP_MS) + LEGACY_MENU_STATIC_DRAW_SETTLE_MS;
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

  private resolveLegacyMenuDeconstructHandoffProgress(time: number): number {
    if (
      this.menuStaticDrawLifecyclePhase !== 'deconstructing'
      || !this.isLegacyMenuDeconstructVisualHandoffReady()
      || this.menuStaticDeconstructZeroHoldStartedAtMs === null
      || this.pendingGenerationRequest?.reason !== 'menu-demo-goal-reset'
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
    const pendingDueAtMs = this.pendingGenerationRequest?.reason === 'menu-demo-goal-reset'
      ? this.pendingGenerationRequest.dueAtMs
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
      && this.pendingGenerationRequest?.reason === 'menu-demo-goal-reset'
      && time < this.resolveLegacyMenuDeconstructHandoffEndsAtMs();
  }

  private isLegacyMenuDeconstructVisualHandoffReady(): boolean {
    return this.menuStaticDrawTilesVisible === 0
      && this.resolveLegacyMenuPathTitleVisiblePieceCount() === 0;
  }

  private deferLegacyMenuDeconstructRebuildUntil(dueAtMs: number): void {
    if (this.pendingGenerationRequest?.reason !== 'menu-demo-goal-reset') {
      return;
    }

    if (this.pendingGenerationRequest.dueAtMs >= dueAtMs) {
      return;
    }

    this.pendingGenerationRequest = {
      ...this.pendingGenerationRequest,
      dueAtMs
    };
  }

  private resolveLegacyMenuBuildPrerollProgress(time: number): number {
    if (
      this.mode !== 'menu'
      || this.menuStaticDrawLifecyclePhase !== 'building'
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

  private resolveLegacyMenuStaticDrawTileBatchSize(): number {
    return Math.max(1, Math.ceil(this.menuStaticDrawTileOrder.length / LEGACY_MENU_STATIC_DRAW_TARGET_TICKS));
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
    if (this.mode === 'menu' && drawStage?.executionKind === 'row-slice') {
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
    if (this.mode !== 'menu' || this.menuStaticDrawLifecyclePhase === 'deconstructing') {
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
    this.queueGenerationRequest(
      'menu-demo-goal-reset',
      this.resolveLegacyMenuStaticDeconstructDurationMs() + LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS,
      {
        mode: 'menu',
        stepSeed: true
      }
    );
    this.boardPathDirty = true;
    this.boardDynamicDirty = true;
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
          this.titleGraphics.clear();
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
        mode: 'menu',
        queuedAtMs: this.time.now,
        reason: 'menu-return',
        scale: this.settings.scale
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
    this.player = nextFrame.player;
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

  private tryMovePlayer(deltaX: number, deltaY: number): boolean {
    if (hasPendingLegacyResetRequest(this.pendingResetRequest)) {
      return false;
    }

    const nextStep = advanceLegacyPlayStep({
      maze: this.maze,
      player: this.player,
      trail: this.trail,
      deltaX,
      deltaY,
      toggleTrailFade: this.settings.toggleTrailFade,
      trailFadeTail: TRAIL_FADE_TAIL
    });
    if (!nextStep.moved) {
      return false;
    }

    this.player = nextStep.player;
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
      this.publishInteractionDiagnostics();
      return true;
    }

    this.boardDynamicDirty = true;
    this.publishInteractionDiagnostics();
    return true;
  }

  private startLegacyPlayDiagonalSprint(deltaX: number, deltaY: number): boolean {
    if (hasPendingLegacyResetRequest(this.pendingResetRequest)) {
      return false;
    }

    const plan = resolveLegacyPlayDiagonalSequenceSteps({
      maze: this.maze,
      player: this.player,
      trail: this.trail,
      deltaX,
      deltaY,
      toggleTrailFade: this.settings.toggleTrailFade,
      trailFadeTail: TRAIL_FADE_TAIL,
      maxSteps: 1
    });
    if (!plan.moved || plan.steps.length === 0) {
      return false;
    }

    this.playDiagonalMoveTimer?.remove(false);
    this.playDiagonalMoveTimer = null;
    this.playDiagonalMoveQueue = [...plan.steps];
    return this.consumeLegacyPlayDiagonalSprintStep();
  }

  private consumeLegacyPlayDiagonalSprintStep(): boolean {
    this.playDiagonalMoveTimer?.remove(false);
    this.playDiagonalMoveTimer = null;

    if (
      this.mode !== 'play'
      || this.overlay !== 'none'
      || hasPendingLegacyResetRequest(this.pendingResetRequest)
    ) {
      this.playDiagonalMoveQueue = [];
      return false;
    }

    const nextDelta = this.playDiagonalMoveQueue.shift() ?? null;
    if (nextDelta === null) {
      return false;
    }

    const moved = this.tryMovePlayer(nextDelta.deltaX, nextDelta.deltaY);
    if (!moved || hasPendingLegacyResetRequest(this.pendingResetRequest)) {
      this.playDiagonalMoveQueue = [];
      return moved;
    }

    if (this.playDiagonalMoveQueue.length > 0) {
      this.playDiagonalMoveTimer = this.time.delayedCall(LEGACY_PLAY_DIAGONAL_SPRINT_STEP_MS, () => {
        this.consumeLegacyPlayDiagonalSprintStep();
      });
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

    this.pendingGenerationRequest = createLegacyMenuResetGenerationRequest({
      currentSeed: this.mazeSeed,
      nowMs: time,
      scale: this.settings.scale
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

    const elapsedMs = this.backdropAccumulatedDeltaMs;
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
      const left = tileRect.left + Math.round((frame.leftInset / materialTileSize) * tileRect.width);
      const top = tileRect.top + Math.round((frame.topInset / materialTileSize) * tileRect.height);
      const right = tileRect.left + Math.round(((frame.leftInset + frame.width) / materialTileSize) * tileRect.width);
      const bottom = tileRect.top + Math.round(((frame.topInset + frame.height) / materialTileSize) * tileRect.height);

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
          drawCue: this.pathVisualStyle === 'hybrid',
          edgeAlpha: isMenuMode ? LEGACY_MENU_PATH_EDGE_ALPHA : LEGACY_PLAY_PATH_EDGE_ALPHA,
          edgeColor: isMenuMode ? pathGlow : LEGACY_PLAY_PATH_EDGE
        }
      );
    };

    const tileLimit = this.resolveLegacyMenuStaticDrawTileLimit();
    if (isMenuMode && tileLimit !== null) {
      for (let index = 0; index < Math.min(tileLimit, this.menuStaticDrawTileOrder.length); index += 1) {
        const point = this.menuStaticDrawTileOrder[index];
        if (point) {
          drawPathPoint(point);
        }
      }
    } else {
      for (let y = 0; y < this.maze.size; y += 1) {
        for (let x = 0; x < this.maze.size; x += 1) {
          if (isMenuMode && !this.isLegacyMenuPointVisibleInStaticDraw({ x, y })) {
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
    return (time % LEGACY_MENU_PATH_TITLE_SWEEP_MS) / LEGACY_MENU_PATH_TITLE_SWEEP_MS;
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
      direction: mode === 'build' ? 'forward' : mode === 'deconstruct' ? 'reverse' : 'idle',
      mode,
      phase: syncedToLifecycle ? progress : idlePhase,
      progress,
      syncedToLifecycle
    };
  }

  private resolveLegacyMenuPathTitleSweepColumn(columns: number, rows: number, time: number): number {
    return this.resolveLegacyMenuPathTitleSweepState(columns, rows, time).column;
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
    titleLayout: ReturnType<typeof resolveLegacyMenuPathTitleLayout>,
    time: number,
    alphaScale: number
  ): void {
    const sweepState = this.resolveLegacyMenuPathTitleSweepState(titleLayout.columns, titleLayout.rows, time);
    const pulsePhase = this.resolveLegacyMenuPathTitleAnimationPhase(time);
    const pulseBoost = sweepState.syncedToLifecycle ? 1.12 : 1;
    const pulse = (0.55 + (Math.sin((pulsePhase * Math.PI * 2) + 0.4) * 0.22)) * pulseBoost;
    const railAlpha = clamp((0.28 + pulse * 0.3) * alphaScale, 0.16, 0.58);
    const railGap = Math.max(5, Math.round(titleLayout.cellSize * 0.8));
    const notch = Math.max(3, Math.round(titleLayout.cellSize * 0.46));
    const left = titleLayout.left - railGap;
    const right = titleLayout.left + titleLayout.width + railGap;
    const top = titleLayout.top - railGap;
    const bottom = titleLayout.top + titleLayout.height + railGap;
    const centerX = titleLayout.left + (titleLayout.width / 2);
    const crest = Math.max(5, Math.round(titleLayout.cellSize * 0.68));

    this.titleGraphics.lineStyle(1, LEGACY_MENU_PATH_EDGE, railAlpha);
    this.strokeLegacyPolyline(this.titleGraphics, [
      { x: left, y: top + notch },
      { x: left + notch, y: top },
      { x: centerX - crest, y: top },
      { x: centerX, y: top - Math.round(crest * 0.55) },
      { x: centerX + crest, y: top },
      { x: right - notch, y: top },
      { x: right, y: top + notch }
    ]);
    this.strokeLegacyPolyline(this.titleGraphics, [
      { x: left, y: bottom - notch },
      { x: left + notch, y: bottom },
      { x: centerX - crest, y: bottom },
      { x: centerX, y: bottom + Math.round(crest * 0.55) },
      { x: centerX + crest, y: bottom },
      { x: right - notch, y: bottom },
      { x: right, y: bottom - notch }
    ]);

    const crownHalf = Math.max(4, Math.round(titleLayout.cellSize * 0.56));
    const crownTop = top - Math.round(crest * 0.9);
    const crownBottom = bottom + Math.round(crest * 0.9);
    this.titleGraphics.lineStyle(1, LEGACY_MENU_PATH_TITLE_ACCENT, railAlpha * 1.12);
    this.strokeLegacyPolyline(this.titleGraphics, [
      { x: centerX, y: crownTop - crownHalf },
      { x: centerX + crownHalf, y: crownTop },
      { x: centerX, y: crownTop + crownHalf },
      { x: centerX - crownHalf, y: crownTop },
      { x: centerX, y: crownTop - crownHalf }
    ]);
    this.strokeLegacyPolyline(this.titleGraphics, [
      { x: centerX, y: crownBottom - crownHalf },
      { x: centerX + crownHalf, y: crownBottom },
      { x: centerX, y: crownBottom + crownHalf },
      { x: centerX - crownHalf, y: crownBottom },
      { x: centerX, y: crownBottom - crownHalf }
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
    const sweepState = this.resolveLegacyMenuPathTitleSweepState(titleLayout.columns, titleLayout.rows, time);
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
    const railGap = Math.max(7, Math.round(titleLayout.cellSize * 1.08));
    const left = titleLayout.left - railGap;
    const right = titleLayout.left + titleLayout.width + railGap;
    const top = titleLayout.top - railGap;
    const bottom = titleLayout.top + titleLayout.height + railGap;
    const centerX = titleLayout.left + (titleLayout.width / 2);
    const centerY = titleLayout.top + (titleLayout.height / 2);

    for (let index = 0; index < LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS; index += 1) {
      const orbit = (orbitPhase + (index / LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS)) % 1;
      const perimeter = orbit * 4;
      let x = left;
      let y = top;

      if (perimeter < 1) {
        x = left + ((right - left) * perimeter);
        y = top;
      } else if (perimeter < 2) {
        x = right;
        y = top + ((bottom - top) * (perimeter - 1));
      } else if (perimeter < 3) {
        x = right - ((right - left) * (perimeter - 2));
        y = bottom;
      } else {
        x = left;
        y = bottom - ((bottom - top) * (perimeter - 3));
      }

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
          x: x + ((centerX - x) * 0.12),
          y: y + ((centerY - y) * 0.12)
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
    if (visibleCells.length <= 0) {
      return;
    }
    const titlePathSource: Pick<LegacyMazeSnapshot, 'grid' | 'size'> = {
      grid: titleLayout.grid,
      size: titleLayout.columns
    };

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

    this.drawLegacyMenuPathTitleSigilRails(titleLayout, time, titlePresentation.titleAlpha);

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
    return LEGACY_BOARD_SIGIL_CORNER_FACET_ALPHA + (wave * 0.085) + (glint * 0.04);
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
    const baseAlpha = clamp(this.resolveLegacyBoardCornerFacetAlpha(time), 0.3, 0.58);
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
      const prismAlpha = clamp(baseAlpha * (0.45 + (wave * 0.5)), 0.16, 0.5);
      const glintAlpha = clamp(baseAlpha * (0.95 + (wave * 0.75)), 0.26, 0.74);

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
      this.boardDynamicGraphics.lineStyle(1, LEGACY_BOARD_SIGIL_CORNER_FACET_HOTSPOT, glintAlpha * 0.46);
      this.strokeLegacyPolyline(this.boardDynamicGraphics, [
        { x: originX, y: originY },
        { x: cornerGlyph.x + (cornerGlyph.sx * (corner * 0.32)), y: cornerGlyph.y + (cornerGlyph.sy * (corner * 0.32)) }
      ]);
      this.boardDynamicGraphics.lineStyle(1, LEGACY_BOARD_SIGIL_CORNER_FACET_IRIS, baseAlpha * 0.62);
      this.strokeLegacyPolyline(this.boardDynamicGraphics, [
        { x: cornerGlyph.x + (cornerGlyph.sx * (corner * 0.34)), y: cornerGlyph.y + (cornerGlyph.sy * (corner * 0.76)) },
        { x: cornerGlyph.x + (cornerGlyph.sx * (corner * 0.76)), y: cornerGlyph.y + (cornerGlyph.sy * (corner * 0.34)) }
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
    const visibleTrail = this.mode === 'menu'
      ? trail.filter((point) => this.isLegacyMenuPointVisibleInStaticDraw(point))
      : trail;
    const menuTrailAlphaMultiplier = this.mode === 'menu'
      ? this.resolveLegacyMenuDeconstructTrailAlpha(time)
      : 1;
    const dynamicTrailPathSource = this.resolveLegacyPointPathSource(visibleTrail);
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

    this.drawLegacyBoardCornerFacetShimmer(resolvedBoardLeft, resolvedBoardTop, boardSize, time);

    if (this.maze.start && (this.mode !== 'menu' || this.isLegacyMenuPointVisibleInStaticDraw(this.maze.start))) {
      this.fillPlayDynamicMarkerTile(this.maze.start, LEGACY_PLAY_START_MARKER_EDGE, mazeLeft, mazeTop, mazeTileSize, 0.9, 'start');
    }
    if (this.maze.goal && (this.mode !== 'menu' || this.isLegacyMenuPointVisibleInStaticDraw(this.maze.goal))) {
      this.fillPlayDynamicMarkerTile(this.maze.goal, 0xd81b2a, mazeLeft, mazeTop, mazeTileSize, 0.95, 'goal');
    }

    for (let index = 0; index < visibleTrail.length; index += 1) {
      const point = visibleTrail[index];
      if (!point) {
        continue;
      }

      const alpha = this.mode === 'play'
        ? clamp(0.34 + ((index / Math.max(1, visibleTrail.length - 1)) * 0.66), 0.34, 1)
        : clamp(0.22 + ((index / Math.max(1, visibleTrail.length - 1)) * 0.82), 0.22, 1);
      const trailColor = this.settings.darkMode ? 0x9cffd2 : 0x66eebf;
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
      }
    }

    if (this.settings.toggleTrailPulse) {
      if (menuTrailAlphaMultiplier > 0 && this.menuStaticDrawLifecyclePhase !== 'deconstructing') {
        this.drawLegacyPlayDynamicTrailPulse(
          visibleTrail,
          mazeLeft,
          mazeTop,
          mazeTileSize,
          time,
          dynamicTrailPathSource
        );
      }
    }

    if (this.mode === 'menu') {
      if (
        this.menuStaticDrawLifecyclePhase !== 'deconstructing'
        && this.isLegacyMenuPointVisibleInStaticDraw(this.player)
      ) {
        this.fillLegacyPlayerMarkerTile(this.player, mazeLeft, mazeTop, mazeTileSize, 0.94, false);
      }
    } else {
      this.fillLegacyPlayerMarkerTile(this.player, mazeLeft, mazeTop, mazeTileSize, 1, true);
    }

    if (this.mode === 'menu') {
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
    tileSize: number,
    time: number,
    pathSource: Pick<LegacyMazeSnapshot, 'grid' | 'size'>
  ): void {
    if (trail.length < 2) {
      return;
    }

    const maxPulseIndex = Math.max(1, trail.length - 1);
    const phase = (time % LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS) / LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS;
    const pulseDistanceFromPlayer = phase * maxPulseIndex;
    const pulseCenterIndex = (trail.length - 1) - pulseDistanceFromPlayer;

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
      this.fillLegacyDynamicPathTile(
        point,
        LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_COLOR,
        originX,
        originY,
        tileSize,
        alpha,
        pathSource,
        LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_EDGE,
        LEGACY_PLAY_PATH_EDGE_ALPHA,
        0.96
      );
    }
  }

  private resolveLegacyPointPathSource(points: readonly LegacyPoint[]): Pick<LegacyMazeSnapshot, 'grid' | 'size'> {
    const size = this.maze.size;
    const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => false));

    for (const point of points) {
      if (point.x < 0 || point.y < 0 || point.x >= size || point.y >= size) {
        continue;
      }
      grid[point.y][point.x] = true;
    }

    return { grid, size };
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
    color: number,
    originX: number,
    originY: number,
    tileSize: number,
    alpha: number,
    kind: 'start' | 'goal'
  ): void {
    const centerX = originX + ((point.x + 0.5) * tileSize);
    const centerY = originY + ((point.y + 0.5) * tileSize);
    const markerMetrics = resolveLegacyEndpointMarkerRenderMetrics(tileSize);
    const shadowRadius = Math.min(tileSize * 0.52, markerMetrics.outerRadius + markerMetrics.strokeWidth);

    this.boardDynamicGraphics.fillStyle(LEGACY_PLAYER_MARKER_SHADOW, Math.min(0.48, alpha * 0.48));
    this.boardDynamicGraphics.fillCircle(centerX, centerY, shadowRadius);
    this.boardDynamicGraphics.lineStyle(markerMetrics.strokeWidth, kind === 'goal' ? LEGACY_PLAY_GOAL_MARKER_EDGE : color, Math.min(0.96, alpha));
    this.boardDynamicGraphics.strokeCircle(centerX, centerY, markerMetrics.outerRadius);

    if (kind === 'goal') {
      this.boardDynamicGraphics.fillStyle(LEGACY_PLAY_GOAL_MARKER_EDGE, Math.min(0.86, alpha * 0.86));
      this.boardDynamicGraphics.beginPath();
      this.boardDynamicGraphics.moveTo(centerX, centerY - markerMetrics.outerRadius);
      this.boardDynamicGraphics.lineTo(centerX + markerMetrics.outerRadius, centerY);
      this.boardDynamicGraphics.lineTo(centerX, centerY + markerMetrics.outerRadius);
      this.boardDynamicGraphics.lineTo(centerX - markerMetrics.outerRadius, centerY);
      this.boardDynamicGraphics.closePath();
      this.boardDynamicGraphics.fillPath();
      this.boardDynamicGraphics.fillStyle(LEGACY_PLAY_GOAL_MARKER_CORE, alpha);
      this.boardDynamicGraphics.fillCircle(centerX, centerY, markerMetrics.coreRadius);
      return;
    }

    this.boardDynamicGraphics.fillStyle(LEGACY_PLAY_START_MARKER_CORE, alpha);
    this.boardDynamicGraphics.fillCircle(centerX, centerY, markerMetrics.coreRadius);
  }

  private fillLegacyPlayerMarkerTile(
    point: LegacyPoint,
    originX: number,
    originY: number,
    tileSize: number,
    alpha: number,
    showLocatorTicks: boolean
  ): void {
    const centerX = originX + ((point.x + 0.5) * tileSize);
    const centerY = originY + ((point.y + 0.5) * tileSize);
    const playerMetrics = resolveLegacyPlayerMarkerRenderMetrics(
      tileSize,
      showLocatorTicks ? LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO : LEGACY_PLAYER_MARKER_RADIUS_RATIO,
      showLocatorTicks ? LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO : LEGACY_PLAYER_MARKER_HALO_RATIO
    );

    const shadowRadius = Math.min(tileSize * 0.5, playerMetrics.haloRadius + playerMetrics.strokeWidth);

    this.boardDynamicGraphics.fillStyle(LEGACY_PLAYER_MARKER_SHADOW, Math.min(0.36, alpha * 0.36));
    this.boardDynamicGraphics.fillCircle(centerX, centerY, shadowRadius);
    this.boardDynamicGraphics.lineStyle(playerMetrics.strokeWidth, LEGACY_PLAYER_MARKER_HALO, Math.min(0.95, alpha * 0.95));
    this.boardDynamicGraphics.strokeCircle(centerX, centerY, playerMetrics.haloRadius + playerMetrics.strokeWidth);
    this.boardDynamicGraphics.fillStyle(LEGACY_PLAYER_MARKER_HALO, Math.min(0.92, alpha * 0.92));
    this.boardDynamicGraphics.fillCircle(centerX, centerY, playerMetrics.haloRadius);
    this.boardDynamicGraphics.fillStyle(LEGACY_PLAYER_MARKER_CORE, alpha);
    this.boardDynamicGraphics.beginPath();
    this.boardDynamicGraphics.moveTo(centerX, centerY - playerMetrics.coreRadius);
    this.boardDynamicGraphics.lineTo(centerX + playerMetrics.coreRadius, centerY);
    this.boardDynamicGraphics.lineTo(centerX, centerY + playerMetrics.coreRadius);
    this.boardDynamicGraphics.lineTo(centerX - playerMetrics.coreRadius, centerY);
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

    this.boardDynamicGraphics.lineStyle(locatorMetrics.strokeWidth, LEGACY_PLAYER_MARKER_CORE, Math.min(0.92, alpha * 0.92));
    drawLocatorTick(centerX - locatorMetrics.outerRadius, centerY, centerX - locatorMetrics.innerRadius, centerY);
    drawLocatorTick(centerX + locatorMetrics.innerRadius, centerY, centerX + locatorMetrics.outerRadius, centerY);
    drawLocatorTick(centerX, centerY - locatorMetrics.outerRadius, centerX, centerY - locatorMetrics.innerRadius);
    drawLocatorTick(centerX, centerY + locatorMetrics.innerRadius, centerX, centerY + locatorMetrics.outerRadius);
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
      top: number;
      width: number;
    }
  ): void {
    const alpha = rect.alpha ?? 0.48;
    const radius = this.resolveLegacyRoundedRectRadius(rect.width, rect.height, rect.radius ?? 10);
    const active = rect.active ?? false;
    const corner = Math.max(7, Math.min(16, Math.round(Math.min(rect.width, rect.height) * 0.28)));
    const inset = 4;

    graphics.fillStyle(LEGACY_CYBER_PANEL_SHADOW, Math.min(0.42, alpha * 0.42));
    graphics.fillRoundedRect(rect.left + 2, rect.top + 3, rect.width, rect.height, radius);
    graphics.fillStyle(rect.fill ?? LEGACY_CYBER_PANEL_FILL, alpha);
    graphics.fillRoundedRect(rect.left, rect.top, rect.width, rect.height, radius);
    graphics.lineStyle(active ? 2 : 1, LEGACY_CYBER_PANEL_STROKE, active ? 0.86 : 0.5);
    graphics.strokeRoundedRect(rect.left, rect.top, rect.width, rect.height, radius);
    graphics.lineStyle(1, LEGACY_CYBER_PANEL_STROKE_ALT, active ? 0.34 : 0.2);
    graphics.strokeRoundedRect(
      rect.left + inset,
      rect.top + inset,
      Math.max(1, rect.width - (inset * 2)),
      Math.max(1, rect.height - (inset * 2)),
      Math.max(2, radius - 4)
    );

    graphics.lineStyle(active ? 2 : 1, active ? LEGACY_CYBER_PANEL_STROKE_ALT : LEGACY_CYBER_PANEL_STROKE, active ? 0.9 : 0.62);
    graphics.beginPath();
    graphics.moveTo(rect.left + inset, rect.top + corner);
    graphics.lineTo(rect.left + inset, rect.top + inset);
    graphics.lineTo(rect.left + corner, rect.top + inset);
    graphics.moveTo(rect.left + rect.width - corner, rect.top + inset);
    graphics.lineTo(rect.left + rect.width - inset, rect.top + inset);
    graphics.lineTo(rect.left + rect.width - inset, rect.top + corner);
    graphics.moveTo(rect.left + inset, rect.top + rect.height - corner);
    graphics.lineTo(rect.left + inset, rect.top + rect.height - inset);
    graphics.lineTo(rect.left + corner, rect.top + rect.height - inset);
    graphics.moveTo(rect.left + rect.width - corner, rect.top + rect.height - inset);
    graphics.lineTo(rect.left + rect.width - inset, rect.top + rect.height - inset);
    graphics.lineTo(rect.left + rect.width - inset, rect.top + rect.height - corner);
    graphics.strokePath();
  }

  private resolveLegacyRoundedRectRadius(width: number, height: number, requestedRadius?: number): number {
    const safeWidth = Math.max(1, Math.abs(width));
    const safeHeight = Math.max(1, Math.abs(height));
    const maxRadius = Math.max(1, Math.floor(Math.min(safeWidth, safeHeight) / 2));
    const requested = requestedRadius ?? maxRadius;

    return Math.max(1, Math.min(maxRadius, Math.round(requested)));
  }

  private padLegacyUiText<T extends Phaser.GameObjects.Text>(text: T): T {
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
    const playerScreenX = mazeRenderFrame.boardLeft + ((this.player.x + 0.5) * mazeRenderFrame.tileSize);
    const playerScreenY = mazeRenderFrame.boardTop + ((this.player.y + 0.5) * mazeRenderFrame.tileSize);
    const touchControlLayout = this.resolveLegacyPlayTouchControlLayout();
    const touchCompassBounds = this.resolveLegacyPlayTouchCompassBounds(touchControlLayout);
    const hudFrame = resolveLegacyPlayHudFrame({
      compassBounds: touchCompassBounds ?? undefined,
      elapsedMs: time - this.playStartedAtMs,
      goalScreen: { x: goalScreenX, y: goalScreenY },
      layoutWidth: this.layout.width,
      playerScreen: { x: playerScreenX, y: playerScreenY }
    });

    this.drawLegacyCyberPanel(this.hudGraphics, {
      active: true,
      alpha: LEGACY_PLAY_HUD_TIMER_PANE_ALPHA,
      fill: LEGACY_PLAY_HUD_TIMER_PANE,
      height: hudFrame.timerBounds.height,
      left: hudFrame.timerBounds.left,
      radius: 10,
      top: hudFrame.timerBounds.top,
      width: hudFrame.timerBounds.width
    });

    const timerShadow = this.add.text(hudFrame.timerBounds.centerX + 1, hudFrame.timerBounds.centerY + 1, hudFrame.timerText, {
      fontFamily: LEGACY_UI_MONO_FONT_FAMILY,
      fontSize: '23px',
      fontStyle: 'bold',
      color: LEGACY_PLAY_HUD_TIMER_SHADOW
    }).setOrigin(0.5);
    timerShadow.setData('hud', true);
    timerShadow.setAlpha(0.7);
    this.uiTexts.push(timerShadow);

    const timer = this.add.text(hudFrame.timerBounds.centerX, hudFrame.timerBounds.centerY, hudFrame.timerText, {
      fontFamily: LEGACY_UI_MONO_FONT_FAMILY,
      fontSize: '23px',
      fontStyle: 'bold',
      color: LEGACY_PLAY_HUD_TIMER_TEXT
    }).setOrigin(0.5);
    timer.setData('hud', true);
    this.uiTexts.push(timer);

    this.hudTouchControlBounds = this.drawLegacyPlayTouchControls(touchControlLayout);
    this.drawLegacyPlayCompass(hudFrame, {
      showPane: touchControlLayout.controlMode !== 'stick'
    });
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
      this.drawLegacyPlayTouchButton(controls.restart_attempt, true, false);
      this.drawLegacyPlayTouchPauseIcon(controls.pause);
      this.drawLegacyPlayTouchLabel(controls.pause, 'PAUSE');
      this.drawLegacyPlayTouchRestartIcon(controls.restart_attempt);
      this.drawLegacyPlayTouchLabel(controls.restart_attempt, 'RESET');
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
    this.drawLegacyPlayTouchButton(controls.restart_attempt, true, false);

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
    this.drawLegacyPlayTouchRestartIcon(controls.restart_attempt);
    this.drawLegacyPlayTouchLabel(controls.restart_attempt, 'RESET');

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
      fill: active ? 0x123a2d : LEGACY_PLAY_TOUCH_BUTTON_FILL,
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

  private drawLegacyPlayTouchRestartIcon(
    rect: ReturnType<typeof resolveTouchControlLayout>['controls']['restart_attempt']
  ): void {
    const radius = Math.round(Math.min(rect.width, rect.height) * 0.18);
    const tipSize = Math.max(7, Math.round(radius * 0.42));
    const iconCenterY = rect.top + Math.round(rect.height * 0.3);
    const tipX = rect.centerX + Math.round(radius * 0.8);
    const tipY = iconCenterY - Math.round(radius * 0.76);

    this.hudGraphics.lineStyle(Math.max(3, Math.round(rect.width * 0.05)), LEGACY_PLAY_TOUCH_ICON, 0.82);
    this.hudGraphics.beginPath();
    this.hudGraphics.arc(rect.centerX, iconCenterY, radius, Phaser.Math.DegToRad(36), Phaser.Math.DegToRad(324), false);
    this.hudGraphics.strokePath();
    this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_ICON, 0.82);
    this.hudGraphics.fillTriangle(tipX, tipY, tipX + tipSize, tipY - 1, tipX + 2, tipY + tipSize);
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
    this.overlayScrollViewportBounds = null;
    this.overlayScrollTrackBounds = null;
    this.overlayScrollThumbBounds = null;
    this.overlayScrollContentHeight = 0;
    this.overlayScrollMax = 0;
    this.overlayScrollTopFadeAlpha = 0;
    this.overlayScrollBottomFadeAlpha = 0;

    if (this.overlay === 'none') {
      if (this.mode === 'menu') {
        const [startLabel, optionsLabel] = MAIN_MENU_BUTTONS;
        this.uiButtons.push(
          this.createButton(
            this.layout.leftButtonX,
            this.layout.leftButtonY,
            this.layout.buttonWidth,
            this.layout.buttonHeight,
            startLabel,
            () => this.startPlayMode()
          ),
          this.createButton(
            this.layout.rightButtonX,
            this.layout.rightButtonY,
            this.layout.buttonWidth,
            this.layout.buttonHeight,
            optionsLabel,
            () => this.openOverlay('options')
          )
        );
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
    const maxCompactHeight = kind === 'pause' ? 820 : this.layout.height - 32;
    const maxDesktopHeight = kind === 'pause' ? 700 : 620;
    const height = Math.min(compact ? maxCompactHeight : maxDesktopHeight, this.layout.height - 32);
    const left = Math.round((this.layout.width - width) / 2);
    const top = Math.round((this.layout.height - height) / 2);

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

  private resolveFeatureControlRowsContentHeight(panel: OverlayPanelFrame): number {
    const stacked = panel.width < 420;
    const rowHeight = stacked ? 46 : 48;
    const rowGap = stacked ? 8 : 10;
    const headingGap = stacked ? 28 : 32;
    const toggleRowCount = 6;

    return headingGap + (toggleRowCount * (rowHeight + rowGap)) + rowHeight + (stacked ? 10 : 6);
  }

  private drawLegacyOverlayScrollFacade(metrics: LegacyOverlayScrollMetrics): void {
    if (!metrics.enabled) {
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
    fillScrollPill(track.left - 3, track.top - 2, track.width + 6, track.height + 4, LEGACY_CYBER_PANEL_SHADOW, 0.46);
    fillScrollPill(track.left - 1, track.top, track.width + 2, track.height, LEGACY_CYBER_PANEL_STROKE_ALT, 0.34);
    fillScrollPill(thumb.left - 2, thumb.top, thumb.width + 4, thumb.height, LEGACY_PLAY_TOUCH_ACCENT, 0.92);
    fillScrollPill(
      thumb.left,
      thumb.top + 2,
      Math.max(1, thumb.width),
      Math.max(1, thumb.height - 4),
      LEGACY_PLAY_TOUCH_ICON,
      0.38
    );
  }

  private buildOptionsOverlay(): void {
    const panel = this.resolveOverlayPanelFrame('options');
    const compact = panel.width < 420;
    let rowY = panel.top + 92;
    this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.handleBackAction()));
    this.createOverlayTitle('Options', panel.top + 44);

    rowY = this.createInputRow('Maze Scale', 'scale', rowY, panel);
    rowY = this.createInputRow('Camera Scale', 'camScale', rowY, panel);
    rowY = this.createFeatureControlRows(rowY, panel);
    if (!compact) {
      rowY = this.createColorInputRow('Path RGB 0-255', ['pathR', 'pathG', 'pathB'], rowY, panel, this.settings.pathColor);
      rowY = this.createColorInputRow('Wall RGB 0-255', ['wallR', 'wallG', 'wallB'], rowY, panel, this.settings.wallColor);
    }
  }

  private buildPauseOverlay(): void {
    const panel = this.resolveOverlayPanelFrame('pause');
    this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.applyLegacyPauseCommand('resume')));
    this.createOverlayTitle('Paused', panel.top + 54);
    const stacked = panel.width < 420;
    const actionWidth = stacked ? Math.min(132, Math.floor((panel.width - 76) / 2)) : 132;
    const actionGap = stacked ? 14 : Math.round(panel.width * 0.18);
    const actionY = panel.top + panel.height - (stacked ? 54 : 62);
    const viewportTop = panel.top + (stacked ? 98 : 112);
    const viewportBottom = actionY - (stacked ? 42 : 48);
    const viewport = createVisualRect(
      panel.left + 24,
      viewportTop,
      panel.width - 48,
      Math.max(120, viewportBottom - viewportTop)
    );
    const contentHeight = 18 + this.resolveFeatureControlRowsContentHeight(panel) + 12;
    const scrollMetrics = resolveLegacyOverlayScrollMetrics({
      contentHeight,
      offset: this.overlayScrollOffset,
      viewport: this.visualRectToLegacyOverlayScrollRect(viewport)
    });
    this.applyLegacyOverlayScrollMetrics(scrollMetrics);
    this.createFeatureControlRows(viewport.top + 18, panel, {
      rightGutter: LEGACY_OVERLAY_SCROLL_RIGHT_GUTTER,
      scrollOffset: scrollMetrics.offset,
      viewport
    });
    this.drawLegacyOverlayScrollFacade(scrollMetrics);

    if (stacked) {
      const centerOffset = (actionWidth / 2) + (actionGap / 2);
      this.uiButtons.push(
        this.createButton(panel.centerX - centerOffset, actionY, actionWidth, 50, 'Reset', () => this.applyLegacyPauseCommand('reset-player')),
        this.createButton(panel.centerX + centerOffset, actionY, actionWidth, 50, 'Main Menu', () => this.applyLegacyPauseCommand('return-menu'))
      );
      return;
    }

    this.uiButtons.push(
      this.createButton(panel.centerX - actionGap, actionY, actionWidth, 54, 'Reset', () => this.applyLegacyPauseCommand('reset-player')),
      this.createButton(panel.centerX + actionGap, actionY, 144, 54, 'Main Menu', () => this.applyLegacyPauseCommand('return-menu'))
    );
  }

  private createFeatureControlRows(
    y: number,
    panel: OverlayPanelFrame,
    options: {
      rightGutter?: number;
      scrollOffset?: number;
      viewport?: VisualRect | null;
    } = {}
  ): number {
    const stacked = panel.width < 420;
    const left = panel.left + 28;
    const width = panel.width - 56 - (options.rightGutter ?? 0);
    const rowHeight = stacked ? 46 : 48;
    const rowGap = stacked ? 8 : 10;
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
      label: string;
      offLabel: string;
      onClick: () => void;
      onLabel: string;
      stateText: string;
    }> = [
      {
        checked: resolveLegacyOverlayToggleSwitchIsOn('toggleCameraFollow', this.settings),
        label: 'Camera Follow',
        offLabel: 'Off',
        onClick: () => this.applyLegacyOverlayToggleField('toggleCameraFollow'),
        onLabel: 'On',
        stateText: resolveLegacyOverlayToggleStateText('toggleCameraFollow', this.settings.toggleCameraFollow) ?? 'Off'
      },
      {
        checked: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailFade', this.settings),
        label: 'Trail Fade',
        offLabel: 'Off',
        onClick: () => this.applyLegacyOverlayToggleField('toggleTrailFade'),
        onLabel: 'On',
        stateText: resolveLegacyOverlayToggleStateText('toggleTrailFade', this.settings.toggleTrailFade) ?? 'Off'
      },
      {
        checked: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailPulse', this.settings),
        label: 'Trail Pulse',
        offLabel: 'Off',
        onClick: () => this.applyLegacyOverlayToggleField('toggleTrailPulse'),
        onLabel: 'On',
        stateText: resolveLegacyOverlayToggleStateText('toggleTrailPulse', this.settings.toggleTrailPulse) ?? 'Off'
      },
      {
        checked: resolveLegacyOverlayToggleSwitchIsOn('toggleAnimatedBackdrop', this.settings),
        label: 'Animated BG',
        offLabel: 'Stagnant',
        onClick: () => this.applyLegacyOverlayToggleField('toggleAnimatedBackdrop'),
        onLabel: 'Animated',
        stateText: resolveLegacyOverlayToggleStateText('toggleAnimatedBackdrop', this.settings.toggleAnimatedBackdrop) ?? 'Stagnant'
      },
      {
        checked: resolveLegacyOverlayToggleSwitchIsOn('darkMode', this.settings),
        label: 'Dark Mode',
        offLabel: 'Off',
        onClick: () => this.applyLegacyOverlayToggleField('darkMode'),
        onLabel: 'On',
        stateText: resolveLegacyOverlayToggleStateText('darkMode', this.settings.darkMode) ?? 'Off'
      },
      {
        checked: resolveLegacyOverlayToggleSwitchIsOn('controlMode', this.settings),
        label: 'Controls',
        offLabel: 'Arrows',
        onClick: () => this.applyLegacyOverlayToggleField('controlMode'),
        onLabel: 'Stick',
        stateText: resolveLegacyOverlayToggleStateText('controlMode', this.settings.controlMode === 'stick') ?? 'Arrows'
      }
    ];

    const labelY = toRenderY(y);
    if (isVisible(labelY, 30)) {
      const label = this.padLegacyUiText(this.add.text(left, labelY, 'Game Toggles', {
        fontFamily: LEGACY_UI_FONT_FAMILY,
        fontSize: stacked ? '18px' : '20px',
        color: '#72e0bf'
      })).setOrigin(0, 0.5);
      this.uiTexts.push(label);
    }

    const gridTop = y + (stacked ? 28 : 32);
    controls.forEach((control, index) => {
      const rowCenterY = gridTop + (index * (rowHeight + rowGap)) + Math.round(rowHeight / 2);
      const renderY = toRenderY(rowCenterY);
      if (!isVisible(renderY, rowHeight)) {
        return;
      }

      this.uiButtons.push(
        this.createToggleSwitchRow({
          checked: control.checked,
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

    return sliderY + Math.round(rowHeight / 2) + (stacked ? 10 : 6);
  }

  private createToggleSwitchRow(input: {
    checked: boolean;
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
    const rowPaddingX = Math.max(12, Math.min(18, Math.round(input.width * 0.055)));
    const trackWidth = 42;
    const trackHeight = 24;
    const trackX = left + input.width - rowPaddingX - Math.round(trackWidth / 2);
    const trackLeft = trackX - Math.round(trackWidth / 2);
    const trackGap = 10;
    const showStateLabel = input.width >= 320;
    const stateLaneWidth = showStateLabel
      ? Math.max(54, Math.min(92, Math.round(input.width * 0.24)))
      : 0;
    const stateLabelRight = trackLeft - trackGap;
    const labelX = left + rowPaddingX;
    const labelRight = showStateLabel
      ? stateLabelRight - stateLaneWidth - trackGap
      : stateLabelRight - trackGap;
    const labelMaxWidth = Math.max(54, labelRight - labelX);
    const labelFontSize = Math.max(15, Math.min(20, Math.round(input.height * 0.4)));
    const stateFontSize = Math.max(11, Math.min(13, Math.round(input.height * 0.28)));
    const background = this.add.rectangle(input.x, input.y, input.width, input.height, rowFill, input.checked ? 0.62 : 0.5);
    background.setStrokeStyle(1, rowStroke, input.checked ? 0.56 : 0.38);
    background.setInteractive({ useHandCursor: true });

    const label = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(labelX, input.y, input.label, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${labelFontSize}px`,
      color: '#ecfff5'
    })), labelMaxWidth, labelFontSize, 11).setOrigin(0, 0.5).setAlpha(0.94);

    const displayStateText = input.stateText || (input.checked ? input.onLabel : input.offLabel);
    const stateLabel = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(stateLabelRight, input.y, displayStateText || input.stateText, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${stateFontSize}px`,
      color: stateColor
    })), stateLaneWidth, stateFontSize, 9)
      .setOrigin(1, 0.5)
      .setAlpha(showStateLabel ? 0.92 : 0)
      .setVisible(showStateLabel);
    this.uiTexts.push(label);
    if (showStateLabel) {
      this.uiTexts.push(stateLabel);
    }

    const track = this.add.ellipse(trackX, input.y, trackWidth, trackHeight, input.checked ? 0x123a2d : 0x07131d, 0.9);
    track.setStrokeStyle(2, rowStroke, input.checked ? 0.66 : 0.52);
    const knobX = trackX + (input.checked ? 9 : -9);
    const knob = this.add.circle(knobX, input.y, 8, input.checked ? LEGACY_PLAY_TOUCH_ACCENT : LEGACY_PLAY_TOUCH_BUTTON_STROKE, 0.98);
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
      label,
      setActive,
      destroy: () => {
        background.destroy();
        label.destroy();
        stateLabel.destroy();
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

    const label = this.padLegacyUiText(this.add.text(left + 16, input.y, input.label, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${Math.max(16, Math.min(20, Math.round(input.height * 0.4)))}px`,
      color: '#ecfff5'
    })).setOrigin(0, 0.5).setAlpha(0.94);

    const stateLabel = this.padLegacyUiText(this.add.text(left + input.width - 16, input.y, input.stateText, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${Math.max(11, Math.min(13, Math.round(input.height * 0.28)))}px`,
      color: '#72e0bf'
    })).setOrigin(1, 0.5).setAlpha(0.92);
    this.uiTexts.push(label, stateLabel);

    const trackLeft = left + Math.max(132, Math.round(input.width * 0.42));
    const trackRight = left + input.width - 72;
    const trackWidth = Math.max(44, trackRight - trackLeft);
    const normalizedValue = quantizeLegacyMovementSpeed(input.value);
    const track = this.add.rectangle(
      trackLeft + Math.round(trackWidth / 2),
      input.y,
      trackWidth,
      6,
      0x07131d,
      0.86
    );
    track.setStrokeStyle(1, LEGACY_PLAY_TOUCH_BUTTON_STROKE, 0.46);
    const fill = this.add.rectangle(
      trackLeft + Math.round((trackWidth * normalizedValue) / 2),
      input.y,
      Math.max(4, Math.round(trackWidth * normalizedValue)),
      6,
      LEGACY_PLAY_TOUCH_ACCENT,
      0.72
    );
    const knob = this.add.circle(
      trackLeft + Math.round(trackWidth * normalizedValue),
      input.y,
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
      label,
      setActive,
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
    const label = this.padLegacyUiText(this.add.text(this.layout.width / 2, y, text, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${this.layout.width < 480 ? 30 : 34}px`,
      color: '#6bc96f'
    })).setOrigin(0.5);
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
      label,
      setActive: () => undefined,
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
        fill: active ? 0x123a2d : LEGACY_CYBER_PANEL_FILL,
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
    background.setInteractive({ useHandCursor: true });
    const label = this.padLegacyUiText(this.add.text(x, y, '', {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: '1px',
      color: MENU_TEXT_COLOR
    })).setOrigin(0.5).setAlpha(0);
    this.overlayBackChevronBounds = createVisualRect(x - (size / 2), y - (size / 2), size, size);

    const setActive = (active: boolean): void => {
      drawChevronChrome(active);
    };

    background.on('pointerover', () => setActive(true));
    background.on('pointerout', () => setActive(false));
    background.on('pointerdown', onClick);

    return {
      background,
      label,
      setActive,
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
    onClick: () => void
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
        fill: active ? 0x123a2d : LEGACY_CYBER_PANEL_FILL,
        height,
        left: x - (width / 2),
        radius: isMenuFrontDoor ? 8 : 10,
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
    const buttonTextColor = frontDoorChrome?.textColor ?? MENU_TEXT_COLOR;

    const label = this.padLegacyUiText(this.add.text(x, y, text, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${buttonFontSize}px`,
      color: buttonTextColor
    })).setOrigin(0.5).setAlpha(frontDoorChrome?.labelAlpha ?? 0.92);
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
      label,
      setActive,
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
  }

  private openOverlay(kind: OverlayKind): void {
    if (kind === 'options' || kind === 'pause') {
      this.optionFieldDrafts = createLegacyOptionFieldDrafts(this.settings);
      this.pendingOverlayMazeRebuild = false;
    }
    this.resetLegacyOverlayScrollState();
    this.activeInputField = null;
    if (this.mode === 'play') {
      this.resetLegacyPlayInputBuffer();
      this.clearPlayHudImmediately();
    }
    this.overlay = kind;
    this.overlayReturn = 'none';
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
    this.resetLegacyOverlayScrollState();
    this.overlay = 'none';
    this.overlayReturn = 'none';
    const showMenuTitle = this.mode === 'menu';
    this.titleGraphics.setVisible(showMenuTitle);
    this.activeInputField = null;
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

  private applyLegacyPauseCommand(command: LegacyPauseCommand): void {
    const result = resolveLegacyPauseCommand(command, this.maze.start, this.trail);

    if (result.nextPlayer !== null) {
      this.player = result.nextPlayer;
      this.trail = result.nextTrail ?? [copyPoint(result.nextPlayer)];
      this.boardDynamicDirty = true;
      if (command === 'reset-player' && this.mode === 'play') {
        this.playCycleResetUsed = true;
        this.appendLegacyPlayCyclePoint(result.nextPlayer);
        this.startLegacyPlayCompassSpin(this.time.now);
      }
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

  private applyLegacyOverlayToggleField(fieldId: LegacyOverlayToggleFieldId): void {
    const result = applyLegacyOverlayToggleField(this.settings, fieldId);
    this.settings = writeLegacyGameToggleSettings(this.resolveLegacyGameToggleStorage(), result.settings);
    if (fieldId === 'controlMode') {
      this.resetLegacyPlayInputBuffer();
      this.hudDirty = true;
    }
    if (fieldId === 'toggleTrailPulse') {
      this.legacyPlayTrailPulseNextFrameAtMs = 0;
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
    if (this.playHeldTouchMoves.length > 0 && this.playHeldTouchRepeatTimer !== null) {
      this.scheduleLegacyPlayHeldTouchRepeat(this.resolveLegacyPlayHeldTouchDelay('repeat'));
    }
    this.uiDirty = true;
    if (this.mode === 'play') {
      this.publishInteractionDiagnostics();
    }
  }

  private loadPersistedLegacyGameToggleSettings(): void {
    this.settings = readLegacyGameToggleSettings(this.resolveLegacyGameToggleStorage(), this.settings);
    this.optionFieldDrafts = createLegacyOptionFieldDrafts(this.settings);
  }

  private loadPersistedMazeCycleTelemetryHistory(): void {
    this.mazeCycleTelemetryHistory = readMazeCycleTelemetryHistory(this.resolveMazeCycleTelemetryStorage());
  }

  private resolveLegacyGameToggleStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
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
    if (typeof window === 'undefined') {
      return undefined;
    }

    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
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
        backtracks: routeDiagnostics?.telemetry.backtrackCount,
        wrongTurns: routeDiagnostics?.telemetry.wrongBranchCount
      }
    );

    if (surface === 'menu-demo') {
      this.menuDemoCycleRecorded = true;
    }
    this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
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
    const progress = this.resolveLegacyMenuPathTitleProgress();
    const sweepState = this.resolveLegacyMenuPathTitleSweepState(titleLayout.columns, titleLayout.rows, this.time.now);
    const sweepColumn = this.resolveLegacyMenuPathTitleSweepColumn(titleLayout.columns, titleLayout.rows, this.time.now);

    return {
      animation: {
        active: this.mode === 'menu' && this.overlay === 'none',
        facetCellCount: this.resolveLegacyMenuPathTitleVisiblePieces(pieceCount),
        facetPulsePeriodMs: LEGACY_MENU_PATH_TITLE_GEM_PULSE_MS,
        phase: Number(sweepState.phase.toFixed(3)),
        scannerDirection: sweepState.direction,
        scannerMode: sweepState.mode,
        scannerProgress: Number(sweepState.progress.toFixed(3)),
        scannerSyncedToLifecycle: sweepState.syncedToLifecycle,
        sigilOrbitCount: LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS,
        sigilOrbitPeriodMs: LEGACY_MENU_PATH_TITLE_ORBIT_MS,
        sigilOrbitPhase: Number(this.resolveLegacyMenuPathTitleOrbitPhase(this.time.now).toFixed(3)),
        sweepColumn: Number(sweepColumn.toFixed(3)),
        sweepPeriodMs: LEGACY_MENU_PATH_TITLE_SWEEP_MS
      },
      bounds: createVisualRect(titleLayout.left, titleLayout.top, titleLayout.width, titleLayout.height),
      builtFromPathPieces: true,
      pieceCount,
      progressPercent: Math.round(progress * 100),
      visible: this.mode === 'menu' && this.overlay === 'none' && this.titleGraphics.visible,
      visiblePieces: this.resolveLegacyMenuPathTitleVisiblePieces(pieceCount)
    };
  }

  private publishVisualDiagnostics(time: number, force = false): void {
    if (typeof window === 'undefined' || !this.layout) {
      return;
    }

    if (
      !force
      && time - this.visualDiagnosticsLastPublishedAtMs < legacyTuning.menu.runtime.diagnosticsPublishIntervalMs
    ) {
      return;
    }

    this.visualDiagnosticsLastPublishedAtMs = time;
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
    const drawStageStaged = this.mode === 'menu' && drawStage?.executionKind === 'row-slice';
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
      this.mode === 'play' ? LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO : LEGACY_PLAYER_MARKER_HALO_RATIO
    );
    const canvasBounds = this.game.canvas.getBoundingClientRect();
    const canvasCssWidth = Math.max(1, Math.round(canvasBounds.width));
    const canvasCssHeight = Math.max(1, Math.round(canvasBounds.height));
    const canvasPixelWidth = Math.max(1, this.game.canvas.width);
    const canvasPixelHeight = Math.max(1, this.game.canvas.height);
    const devicePixelRatio = typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1);
    const renderResolutionRatio = Math.round((canvasPixelWidth / canvasCssWidth) * 100) / 100;
    const renderResolutionTargetRatio = Math.round(Math.min(devicePixelRatio, 2) * 100) / 100;
    const renderResolutionDeficit = Math.round(Math.max(0, renderResolutionTargetRatio - renderResolutionRatio) * 100) / 100;

    this.visualDiagnosticsRevision += 1;
    const diagnostics: MenuSceneVisualDiagnostics = {
      revision: this.visualDiagnosticsRevision,
      updatedAt: Math.max(0, Math.round(time)),
      viewport: {
        width: this.layout.width,
        height: this.layout.height,
        safeInsets: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
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
            nextSeedQueued: this.mode === 'menu' && this.pendingGenerationRequest?.reason === 'menu-demo-goal-reset',
            progressPercent: drawStageProgress.progressPercent,
            rowCount: drawStageProgress.rowCount,
            rowsRemaining: drawStageProgress.rowsRemaining,
            rowsVisible: drawRowsVisible,
            staged: drawStageStaged,
            titleFullyDeconstructed: titleVisiblePieces === 0,
            titlePieceCount,
            titlePiecesRemaining,
            titleVisiblePieces,
            tileCount: drawStageProgress.tileCount,
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
        goal: copyPoint(this.maze.goal),
        trailLength: this.trail.length,
        trailTail: this.trail.slice(Math.max(0, this.trail.length - 8)).map(copyPoint),
        menuDemo: {
          phase: this.menuDemoState?.phase ?? null,
          cue: this.menuDemoState?.cue ?? null,
          pathCursor: this.menuDemoState?.pathCursor ?? null,
          reachedGoal: this.menuDemoState?.reachedGoal ?? false,
          prerollSteps: Math.max(0, this.menuDemoConfig?.behavior.prerollSteps ?? 0),
          runnerMistakesEnabled: this.menuDemoConfig?.behavior.enableRunnerMistakes === true,
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
        }
      },
      markerStyle: {
        goalCoreColor: LEGACY_PLAY_GOAL_MARKER_CORE,
        goalEdgeColor: LEGACY_PLAY_GOAL_MARKER_EDGE,
        playerCoreColor: LEGACY_PLAYER_MARKER_CORE,
        playerCoreRadius: playerMarkerMetrics.coreRadius,
        playerHaloColor: LEGACY_PLAYER_MARKER_HALO,
        playerHaloRadius: playerMarkerMetrics.haloRadius,
        startCoreColor: LEGACY_PLAY_START_MARKER_CORE,
        startEdgeColor: LEGACY_PLAY_START_MARKER_EDGE,
        trailPulseEnabled: this.settings.toggleTrailPulse,
        trailPulseColor: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_COLOR,
        trailPulseEdgeColor: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_EDGE,
        trailPulsePeriodMs: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS
      },
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
      title: this.resolveLegacyMenuPathTitleDiagnostics(),
      textLabels: this.resolveVisualTextLabels(),
      renderSurface: {
        canvasCssHeight,
        canvasCssWidth,
        canvasPixelHeight,
        canvasPixelWidth,
        devicePixelRatio,
        renderResolutionDeficit,
        renderResolutionTargetRatio,
        renderResolutionRatio,
        undersampledForDevicePixelRatio: renderResolutionDeficit > 0.05
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
