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
  resolveLegacyNestedOverlayOpen,
  resolveLegacyOverlayBackAction,
  type LegacyOverlayKind,
  type LegacyRuntimeMode
} from '../legacy-runtime/legacyOverlayRouting';
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
  createLegacyPlayPointerStart,
  createLegacyPlayMoveFlags,
  LEGACY_SIMULTANEOUS_KEY_PRESS_DELAY_MS,
  isPointInsideLegacyBoardBounds,
  resolveLegacyPointerMoveVector,
  resolveLegacyPlayMoveVector,
  isSameLegacyPlayPointer,
  type LegacyPlayMoveFlags,
  type LegacyPlayPointerStart
} from '../legacy-runtime/legacyPlayStep';
import {
  resolveLegacyPlayHudFrame,
  type LegacyPlayHudFrame
} from '../legacy-runtime/legacyPlayHud';
import {
  advanceLegacyMenuDemoFrame,
  createLegacyMenuDemoGoalResetRequest,
  createLegacyMenuDemoBootstrap
} from '../legacy-runtime/legacyMenuDemoLifecycle';
import {
  resolveLegacyMenuLayout,
  type LegacyMenuLayout
} from '../legacy-runtime/legacyMenuLayout';
import { resolveLegacyMenuButtonChrome } from '../legacy-runtime/legacyMenuButtonChrome';
import { resolveLegacyMenuTitlePresentation } from '../legacy-runtime/legacyMenuTitle';
import {
  LEGACY_MENU_STAR_COUNT,
  advanceLegacyMenuBackdropStars,
  createLegacyMenuBackdropStars,
  resolveLegacyMenuBackdropOrbs,
  resolveLegacyMenuBackdropPalette,
  resolveLegacyMenuBackdropStreakLength,
  resolveLegacyMenuBackdropTailStep,
  type LegacyMenuBackdropStar
} from '../legacy-runtime/legacyMenuBackdrop';
import { performLegacyBrowserSafeExit } from '../legacy-runtime/legacyExit';
import {
  createLegacyOptionFieldDrafts,
  type LegacyOptionFieldDrafts,
  type LegacyOptionFieldId
} from '../legacy-runtime/legacyOptionFields';
import { applyLegacyOverlayFieldCommit } from '../legacy-runtime/legacyOverlayFieldCommit';
import {
  applyLegacyOverlayToggleField,
  resolveLegacyOverlayToggleStateText,
  type LegacyOverlayToggleFieldId,
  type LegacyOverlayToggleStateText
} from '../legacy-runtime/legacyOverlayToggleFields';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig,
} from '../legacy-runtime/legacyDemoWalker';
import {
  resolveLegacyDynamicMarkerInset,
  resolveLegacyDynamicTrailStrokeWidth,
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
import { resolveTouchControlKindAtPoint, resolveTouchControlLayout } from '../input-human/touch';

type RuntimeMode = LegacyRuntimeMode;
type OverlayKind = LegacyOverlayKind;
type RuntimeGenerationStage = NonNullable<LegacyMazeSnapshot['generation']>['executionPlan'][number];

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

interface MenuSceneVisualDiagnostics {
  board: {
    bounds: VisualRect;
    safeBounds: VisualRect;
    tileSize: number;
  };
  markerStyle: {
    goalCoreColor: number;
    goalEdgeColor: number;
    playerCoreColor: number;
    playerCoreRadius: number;
    playerHaloColor: number;
    playerHaloRadius: number;
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
  hud: {
    kind: 'legacy-play-hud' | null;
    visible: boolean;
    bounds: VisualRect | null;
    timerBounds: VisualRect | null;
    arrowBounds: VisualRect | null;
    arrowAngleDegrees: number | null;
    timerText: string | null;
    arrowAngleRadians: number | null;
  };
  touchControls: {
    visible: boolean;
    compact: boolean | null;
    frame: VisualRect | null;
    controls: {
      move_up: VisualRect | null;
      move_right: VisualRect | null;
      move_down: VisualRect | null;
      move_left: VisualRect | null;
      pause: VisualRect | null;
      restart_attempt: VisualRect | null;
      toggle_thoughts: VisualRect | null;
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
        complete: boolean | null;
        progressPercent: number | null;
        rowCount: number | null;
        rowsRemaining: number | null;
        rowsVisible: number | null;
        staged: boolean;
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
const MENU_BUTTON_ALPHA = 0.1;
const MENU_BUTTON_STROKE_ALPHA = 0.24;
const MENU_TEXT_COLOR = '#0b841d';
const TITLE_FILL_COLOR = '#1d8726';
const TITLE_SHADOW_COLOR = '#103516';
const LEGACY_BOARD_GRID_ALPHA = 0;
const INITIAL_MENU_DEMO_HOLD_MS = 1800;
const TRAIL_FADE_TAIL = 16;
const LEGACY_MENU_SLAB_FILL = 0x101824;
const LEGACY_MENU_PANEL_SHADOW_ALPHA = 0;
const LEGACY_MENU_PATH_CORE = 0xe6f2eb;
const LEGACY_MENU_PATH_EDGE = 0x304158;
const LEGACY_MENU_PATH_EDGE_ALPHA = 0.9;
const LEGACY_MENU_WALL_FILL = 0x0d1724;
const LEGACY_PLAY_PATH_CORE = 0xe7fff4;
const LEGACY_PLAY_PATH_EDGE = 0x0d3c4f;
const LEGACY_PLAY_PATH_EDGE_ALPHA = 0.9;
const LEGACY_PLAY_WALL_FILL = 0x07111d;
const LEGACY_PLAY_BOARD_FILL = 0x08111d;
const LEGACY_PLAY_BOARD_EDGE = 0x031022;
const LEGACY_PLAY_HUD_TIMER_PANE = 0x05050a;
const LEGACY_PLAY_HUD_TIMER_PANE_ALPHA = 0.18;
const LEGACY_PLAY_HUD_TIMER_TEXT = '#d7f0d6';
const LEGACY_PLAY_HUD_TIMER_SHADOW = '#081208';
const LEGACY_PLAY_HUD_ARROW = 0xe4efe6;
const LEGACY_PLAY_HUD_ARROW_SHADOW = 0x06080a;
const LEGACY_PLAY_TOUCH_FRAME_FILL = 0x06121c;
const LEGACY_PLAY_TOUCH_BUTTON_FILL = 0x0c2633;
const LEGACY_PLAY_TOUCH_BUTTON_STROKE = 0xb7f2ff;
const LEGACY_PLAY_TOUCH_ICON = 0xecfff5;
const LEGACY_PLAY_TOUCH_ACCENT = 0x72e0bf;
const LEGACY_MENU_DYNAMIC_TRAIL_EDGE = 0x0a6f82;
const LEGACY_MENU_DYNAMIC_MARKER_INSET_RATIO = 0.22;
const LEGACY_MENU_DYNAMIC_TRAIL_CORE_RATIO = 0.3;
const LEGACY_MENU_DYNAMIC_TRAIL_EDGE_RATIO = 0.54;
const LEGACY_PLAY_DYNAMIC_TRAIL_EDGE = 0x005466;
const LEGACY_PLAY_DYNAMIC_TRAIL_CORE_RATIO = 0.2;
const LEGACY_PLAY_DYNAMIC_TRAIL_EDGE_RATIO = 0.36;
const LEGACY_PLAYER_MARKER_SHADOW = 0x00131f;
const LEGACY_PLAYER_MARKER_HALO = 0x00b84a;
const LEGACY_PLAYER_MARKER_CORE = 0x36ff7d;
const LEGACY_PLAYER_MARKER_RADIUS_RATIO = 0.34;
const LEGACY_PLAYER_MARKER_HALO_RATIO = 0.54;
const LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO = 0.34;
const LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO = 0.46;
const LEGACY_PLAY_START_MARKER_CORE = 0xfff1a6;
const LEGACY_PLAY_GOAL_MARKER_CORE = 0xff263f;
const LEGACY_PLAY_GOAL_MARKER_EDGE = 0xd81b2a;
const LEGACY_MENU_STATIC_DRAW_ROW_STEP_MS = 42;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

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
  private mazeSeed = 3749;
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
  private pendingResetRequest: LegacyResetRequest | null = null;
  private pendingOverlayMazeRebuild = false;
  private playMoveFlags: LegacyPlayMoveFlags = createLegacyPlayMoveFlags();
  private playMoveTimer: Phaser.Time.TimerEvent | null = null;
  private playPointerStart: LegacyPlayPointerStart | null = null;
  private titleText!: Phaser.GameObjects.Text;
  private titleShadow!: Phaser.GameObjects.Text;
  private footerText!: Phaser.GameObjects.Text;
  private backdropGraphics!: Phaser.GameObjects.Graphics;
  private boardStaticGraphics!: Phaser.GameObjects.Graphics;
  private boardDynamicGraphics!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private uiTexts: Phaser.GameObjects.Text[] = [];
  private uiButtons: UiButton[] = [];
  private stars: LegacyMenuBackdropStar[] = [];
  private layout!: LegacyMenuLayout;
  private hudBounds: VisualRect | null = null;
  private hudTimerBounds: VisualRect | null = null;
  private hudArrowBounds: VisualRect | null = null;
  private hudTouchControlBounds: VisualRect | null = null;
  private hudFrame: LegacyPlayHudFrame | null = null;
  private boardStaticDirty = true;
  private boardDynamicDirty = true;
  private backdropDirty = true;
  private uiDirty = true;
  private menuStaticDrawRowsVisible: number | null = null;
  private menuStaticDrawNextRowAtMs = 0;
  private visualDiagnosticsRevision = 0;
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
  private runtimeFeedDiagnostics = summarizeMenuSceneRuntimeFeed({ nowMs: 0 });

  public constructor() {
    super('MenuScene');
  }

  public create(): void {
    markMazerBootStatus('menu-scene-create');
    this.initializeRuntimeDiagnostics();
    this.backdropGraphics = this.add.graphics();
    this.boardStaticGraphics = this.add.graphics();
    this.boardDynamicGraphics = this.add.graphics();
    this.overlayGraphics = this.add.graphics();
    this.hudGraphics = this.add.graphics();

    this.titleShadow = this.add.text(0, 0, 'Mazer', {
      fontFamily: '"Courier New", monospace',
      fontSize: '96px',
      fontStyle: 'bold',
      color: TITLE_SHADOW_COLOR
    }).setOrigin(0.5).setAlpha(0.76);
    this.titleText = this.add.text(0, 0, 'Mazer', {
      fontFamily: '"Courier New", monospace',
      fontSize: '96px',
      fontStyle: 'bold',
      color: TITLE_FILL_COLOR
    }).setOrigin(0.5).setAlpha(0.88);
    this.footerText = this.add.text(0, 0, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      color: '#d7d6de',
      align: 'center'
    }).setOrigin(0.5).setAlpha(0.92);

    this.createStars();
    if (resolveInitialRuntimeMode(typeof window === 'undefined' ? '' : window.location.search) === 'play') {
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
    this.publishVisualDiagnostics(this.time.now);
    this.publishRuntimeDiagnostics(this.time.now, true);
  }

  public update(time: number, delta: number): void {
    this.recordRuntimeFrame(delta);
    this.updateStars(delta);

    const pendingReset = this.pendingResetRequest;
    if (pendingReset !== null && shouldConsumeLegacyResetRequest(pendingReset, time)) {
      this.pendingResetRequest = null;
      this.consumeResetRequest(pendingReset, time);
      return;
    }

    const nextRequest = this.pendingGenerationRequest;
    if (nextRequest !== null && shouldConsumeLegacyGenerationRequest(nextRequest, time)) {
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

    if (this.backdropDirty) {
      this.drawBackdrop();
    }
    if (this.boardStaticDirty) {
      this.drawStaticBoard();
    }
    if (this.boardDynamicDirty) {
      this.drawDynamicBoard();
      this.drawHud(time);
    }
    if (this.uiDirty) {
      this.rebuildUi();
    }

    this.publishVisualDiagnostics(time);
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

    const averageFrameMs = this.runtimeFrameCount > 0
      ? Number((this.runtimeFrameTotalMs / this.runtimeFrameCount).toFixed(3))
      : 0;
    const starCount = this.stars.length;
    const telemetrySummary = summarizeTelemetrySemantics([]);
    const drawStage = this.resolveLegacyMenuStaticDrawStage();
    const drawStageStaged = this.mode === 'menu' && drawStage?.executionKind === 'row-slice';
    const drawRowsVisible = this.resolveLegacyMenuStaticDrawRowsVisibleForDiagnostics();
    const drawStageProgress = resolveMenuSceneGenerationDrawStageProgress({
      rowsVisible: drawRowsVisible,
      rowCount: drawStageStaged ? this.maze.size : null
    });
    const routeDiagnostics = this.menuDemoEpisode && this.menuDemoConfig
      ? collectDemoWalkerRouteDiagnostics(this.menuDemoEpisode, this.menuDemoConfig)
      : null;
    const runnerTelemetry = routeDiagnostics?.telemetry ?? this.menuDemoState?.telemetry ?? {
      wrongBranchCount: 0,
      backtrackCount: 0,
      recoveryCount: 0
    };
    const trailSegmentCap = this.settings.toggleTrailFade
      ? TRAIL_FADE_TAIL
      : Math.max(this.trail.length, this.menuDemoConfig?.behavior.trailMaxLength ?? this.trail.length);
    const boardOffset = this.resolveBoardOffset();
    const boardBounds = this.resolveLegacyPlayBoardBounds();
    const playerMarkerMetrics = resolveLegacyPlayerMarkerRenderMetrics(
      this.layout.tileSize,
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
      play: {
        board: {
          ...boardBounds,
          size: this.layout.boardSize,
          tileSize: this.layout.tileSize
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
          resolvedVector: resolveLegacyPlayMoveVector(this.playMoveFlags),
          simultaneousDelayMs: LEGACY_SIMULTANEOUS_KEY_PRESS_DELAY_MS
        },
        player: {
          x: this.player.x,
          y: this.player.y,
          screenX: this.layout.boardLeft + boardOffset.x + ((this.player.x + 0.5) * this.layout.tileSize),
          screenY: this.layout.boardTop + boardOffset.y + ((this.player.y + 0.5) * this.layout.tileSize)
        },
        goal: {
          x: this.maze.goal.x,
          y: this.maze.goal.y,
          screenX: this.layout.boardLeft + boardOffset.x + ((this.maze.goal.x + 0.5) * this.layout.tileSize),
          screenY: this.layout.boardTop + boardOffset.y + ((this.maze.goal.y + 0.5) * this.layout.tileSize)
        },
        markerStyle: {
          goalCoreColor: LEGACY_PLAY_GOAL_MARKER_CORE,
          goalEdgeColor: LEGACY_PLAY_GOAL_MARKER_EDGE,
          playerCoreColor: LEGACY_PLAYER_MARKER_CORE,
          playerCoreRadius: playerMarkerMetrics.coreRadius,
          playerHaloColor: LEGACY_PLAYER_MARKER_HALO,
          playerHaloRadius: playerMarkerMetrics.haloRadius
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
          buildKind: this.maze.generation?.buildKind ?? null,
          source: this.maze.source,
          size: this.maze.size,
          seed: this.maze.seed,
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
          complete: drawStageProgress.complete,
          progressPercent: drawStageProgress.progressPercent,
          rowCount: drawStageProgress.rowCount,
          rowsRemaining: drawStageProgress.rowsRemaining,
          rowsVisible: drawRowsVisible,
          staged: drawStageStaged
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
      resources: {
        activeTweens: 0,
        activeTimers: 0,
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
          nearStars: 0,
          twinkles: 0,
          veils: 0,
          driftMotes: 0,
          moving: starCount,
          movingCap: starCount,
          signatureCap: starCount
        }
      }
    });
  }

  private publishInteractionDiagnostics(): void {
    const now = this.time.now;
    this.publishVisualDiagnostics(now);
    this.publishRuntimeDiagnostics(now, true);
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
      this.handleLegacyPlayPointerDown(pointer);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.handleLegacyPlayPointerUp(pointer);
    });
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {
      this.handleLegacyPlayPointerUp(pointer);
    });
    this.input.on('gameout', () => {
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
      if (event.pointerType === 'touch') {
        return;
      }

      if (!this.handleLegacyPlayTouchControlClientPoint(event.clientX, event.clientY)) {
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
    this.legacyPlayTouchControlPointerDownHandler = null;
  }

  private handleLegacyPlayTouchControlClientPoint(clientX: number, clientY: number): boolean {
    const rect = this.game.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    return this.handleLegacyPlayTouchControl(
      ((clientX - rect.left) / width) * this.layout.width,
      ((clientY - rect.top) / height) * this.layout.height
    );
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
    this.playMoveFlags[direction] = true;
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
    this.playMoveFlags[direction] = false;
    return true;
  }

  private handleLegacyPlayPointerDown(pointer: Phaser.Input.Pointer): boolean {
    if (this.handleLegacyPlayTouchControl(pointer.x, pointer.y)) {
      this.playPointerStart = null;
      return true;
    }

    if (this.mode !== 'play' || this.overlay !== 'none' || hasPendingLegacyResetRequest(this.pendingResetRequest)) {
      this.playPointerStart = null;
      return false;
    }
    if (this.playPointerStart !== null && !isSameLegacyPlayPointer(this.playPointerStart, pointer)) {
      return false;
    }
    if (!this.isLegacyPlayPointerInsideBoard(pointer.x, pointer.y)) {
      this.playPointerStart = null;
      return false;
    }

    this.playPointerStart = createLegacyPlayPointerStart(pointer);
    return true;
  }

  private handleLegacyPlayTouchControl(x: number, y: number): boolean {
    if (this.mode !== 'play' || hasPendingLegacyResetRequest(this.pendingResetRequest)) {
      return false;
    }

    const control = resolveTouchControlKindAtPoint(
      this.resolveLegacyPlayTouchControlLayout(),
      x,
      y
    );

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
        if (this.overlay === 'none' || this.overlay === 'pause') {
          this.applyLegacyOverlayToggleField('toggleTrailFade');
          return true;
        }
        return false;
      case 'move_up':
      case 'move_right':
      case 'move_down':
      case 'move_left':
      case null:
        return false;
      default:
        return control satisfies never;
    }
  }

  private resolveLegacyPlayTouchControlLayout(): ReturnType<typeof resolveTouchControlLayout> {
    const boardBounds = this.resolveLegacyPlayBoardBounds();

    return resolveTouchControlLayout({
      width: this.layout.width,
      height: this.layout.height
    }, {
      compact: this.layout.width < 720 || this.layout.height < 720,
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
    return resolveLegacyPointerMoveVector({
      boardBounds,
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
      playerScreenX: this.layout.boardLeft + boardOffset.x + ((this.player.x + 0.5) * this.layout.tileSize),
      playerScreenY: this.layout.boardTop + boardOffset.y + ((this.player.y + 0.5) * this.layout.tileSize),
      tileSize: this.layout.tileSize
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

  private isLegacyPlayPointerInsideBoard(x: number, y: number): boolean {
    return isPointInsideLegacyBoardBounds(x, y, this.resolveLegacyPlayBoardBounds());
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
    const isPortrait = height > width;
    const layoutSurface = this.mode === 'play' ? 'play' : 'menu';
    this.layout = resolveLegacyMenuLayout(
      width,
      height,
      this.settings.scale + this.settings.camScale,
      this.maze.size,
      layoutSurface
    );
    const titlePresentation = resolveLegacyMenuTitlePresentation(
      this.layout.boardSize,
      this.layout.tileSize,
      isPortrait,
      width,
      this.maze.source === 'menu-generated' ? 'procedural' : 'snapshot'
    );

    this.titleShadow
      .setPosition(
        this.layout.titleX + titlePresentation.shadowOffsetX,
        this.layout.titleY + titlePresentation.shadowOffsetY
      )
      .setFontSize(titlePresentation.fontSize)
      .setAlpha(titlePresentation.shadowAlpha);
    this.titleText
      .setPosition(this.layout.titleX, this.layout.titleY)
      .setFontSize(titlePresentation.fontSize)
      .setAlpha(titlePresentation.titleAlpha);
    this.footerText.setPosition(this.layout.width / 2, this.layout.footerY);

    this.boardStaticDirty = true;
    this.boardDynamicDirty = true;
    this.backdropDirty = true;
    this.uiDirty = true;
  }

  private applyGenerationRequest(request: LegacyGenerationRequest, nextDemoMoveAtMs = 0): void {
    const generationState = consumeLegacyGenerationRequestState(request, this.settings.scale);
    this.mode = request.mode;
    this.mazeSeed = request.seed;
    this.maze = generationState.maze;
    this.titleText.setVisible(generationState.titleVisible);
    this.titleShadow.setVisible(generationState.titleVisible);
    this.menuDemoEpisode = this.mode === 'menu' ? createLegacyDemoWalkerEpisode(this.maze) : null;
    if (this.mode === 'menu') {
      const bootstrap = createLegacyMenuDemoBootstrap(this.maze, this.settings.toggleTrailFade, TRAIL_FADE_TAIL);
      this.menuDemoEpisode = bootstrap.episode;
      this.menuDemoConfig = bootstrap.config;
      this.menuDemoState = bootstrap.state;
      this.player = bootstrap.player;
      this.trail = bootstrap.trail;
    } else {
      this.menuDemoConfig = createLegacyMenuDemoWalkerConfig(this.maze.seed);
      this.menuDemoState = null;
      this.player = generationState.initialPlayer;
      this.trail = generationState.initialTrail;
      if (generationState.startsPlayTimer) {
        this.playStartedAtMs = this.time.now;
      }
    }
    this.nextDemoMoveAtMs = nextDemoMoveAtMs;
    this.optionFieldDrafts = createLegacyOptionFieldDrafts(this.settings);
    this.activeInputField = null;
    this.refreshLayout();
    this.boardStaticDirty = true;
    this.boardDynamicDirty = true;
    this.uiDirty = true;
    this.armLegacyMenuStaticDrawStage();
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

  private armLegacyMenuStaticDrawStage(): void {
    const drawStage = this.resolveLegacyMenuStaticDrawStage();
    if (this.mode === 'menu' && drawStage?.executionKind === 'row-slice') {
      this.menuStaticDrawRowsVisible = 0;
      this.menuStaticDrawNextRowAtMs = this.time.now;
      return;
    }

    this.menuStaticDrawRowsVisible = null;
    this.menuStaticDrawNextRowAtMs = 0;
  }

  private advanceLegacyMenuStaticDrawStage(time: number): void {
    if (this.menuStaticDrawRowsVisible === null) {
      return;
    }
    if (time < this.menuStaticDrawNextRowAtMs) {
      return;
    }

    const drawStage = this.resolveLegacyMenuStaticDrawStage();
    const batchSize = Math.max(1, drawStage?.batchSize ?? 1);
    this.menuStaticDrawRowsVisible = Math.min(this.maze.size, this.menuStaticDrawRowsVisible + batchSize);
    this.menuStaticDrawNextRowAtMs = time + LEGACY_MENU_STATIC_DRAW_ROW_STEP_MS;
    this.boardStaticDirty = true;
    this.boardDynamicDirty = true;
    if (this.menuStaticDrawRowsVisible >= this.maze.size) {
      this.menuStaticDrawRowsVisible = null;
      this.menuStaticDrawNextRowAtMs = 0;
    }
  }

  private enterMenuMode(): void {
    this.resetLegacyPlayInputBuffer();
    this.mode = 'menu';
    this.pendingOverlayMazeRebuild = false;
    this.pendingResetRequest = null;
    this.overlay = 'none';
    this.overlayReturn = 'none';
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
    this.rebuildMaze();
    this.boardStaticDirty = true;
    this.boardDynamicDirty = true;
    this.uiDirty = true;
  }

  private updateMenuDemo(time: number): void {
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
    this.menuDemoState = nextFrame.state;
    this.player = nextFrame.player;
    this.trail = nextFrame.trail;
    this.nextDemoMoveAtMs = time + nextFrame.delayMs;
    if (nextFrame.shouldRegenerateMaze) {
      this.pendingResetRequest = createLegacyMenuDemoGoalResetRequest(time);
      return;
    }
    this.boardDynamicDirty = true;
  }

  private tryMovePlayer(deltaX: number, deltaY: number): void {
    if (hasPendingLegacyResetRequest(this.pendingResetRequest)) {
      return;
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
      return;
    }

    this.player = nextStep.player;
    this.trail = nextStep.trail;
    if (this.settings.toggleCameraFollow) {
      this.boardStaticDirty = true;
    }

    if (nextStep.reachedGoal) {
      this.schedulePlayResetReturn();
      this.boardDynamicDirty = true;
      this.publishInteractionDiagnostics();
      return;
    }

    this.boardDynamicDirty = true;
    this.publishInteractionDiagnostics();
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

  private updateStars(delta: number): void {
    advanceLegacyMenuBackdropStars(this.stars, delta, this.settings.darkMode);
    this.backdropDirty = true;
  }

  private drawBackdrop(): void {
    const { width, height } = this.layout;
    this.backdropGraphics.clear();
    const palette = resolveLegacyMenuBackdropPalette(this.settings.darkMode);
    const hazeOrbs = resolveLegacyMenuBackdropOrbs(width, height, this.settings.darkMode);

    this.backdropGraphics.fillStyle(palette.fieldColor, 1);
    this.backdropGraphics.fillRect(0, 0, width, height);
    for (const orb of hazeOrbs) {
      this.backdropGraphics.fillStyle(orb.color, orb.alpha);
      this.backdropGraphics.fillCircle(orb.x, orb.y, orb.radius);
    }

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
        this.backdropGraphics.fillRect(pixelX + (stepX * index), pixelY + (stepY * index), 1, 1);
      }
    }
    if (palette.overlayAlpha > 0) {
      this.backdropGraphics.fillStyle(0x000000, palette.overlayAlpha);
      this.backdropGraphics.fillRect(0, 0, width, height);
    }

    this.backdropDirty = false;
  }

  private drawStaticBoard(): void {
    const { boardLeft: layoutBoardLeft, boardTop: layoutBoardTop, boardSize, tileSize } = this.layout;
    const boardOffset = this.resolveBoardOffset();
    const boardLeft = layoutBoardLeft + boardOffset.x;
    const boardTop = layoutBoardTop + boardOffset.y;
    const isMenuMode = this.mode === 'menu';
    const pathColor = isMenuMode
      ? LEGACY_MENU_PATH_CORE
      : LEGACY_PLAY_PATH_CORE;
    const wallColor = isMenuMode
      ? LEGACY_MENU_WALL_FILL
      : LEGACY_PLAY_WALL_FILL;
    const boardFill = isMenuMode
      ? 0x0d1520
      : LEGACY_PLAY_BOARD_FILL;
    const boardEdge = isMenuMode ? 0x050a10 : LEGACY_PLAY_BOARD_EDGE;
    const pathGlow = isMenuMode
      ? LEGACY_MENU_PATH_EDGE
      : LEGACY_PLAY_PATH_EDGE;

    this.boardStaticGraphics.clear();
    const boardShadowAlpha = isMenuMode ? LEGACY_MENU_PANEL_SHADOW_ALPHA : 0;
    if (boardShadowAlpha > 0) {
      this.boardStaticGraphics.fillStyle(0x000000, boardShadowAlpha);
      this.boardStaticGraphics.fillRect(boardLeft + BOARD_SHADOW_OFFSET, boardTop + BOARD_SHADOW_OFFSET, boardSize, boardSize);
    }
    if (isMenuMode) {
      this.boardStaticGraphics.fillStyle(LEGACY_MENU_SLAB_FILL, 0.58);
      this.boardStaticGraphics.fillRect(boardLeft - 2, boardTop - 2, boardSize + 4, boardSize + 4);
    }
    this.boardStaticGraphics.fillStyle(boardEdge, 1);
    this.boardStaticGraphics.fillRect(boardLeft - 1, boardTop - 1, boardSize + 2, boardSize + 2);
    this.boardStaticGraphics.fillStyle(boardFill, isMenuMode ? 0.98 : 0.96);
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
        this.boardStaticGraphics.moveTo(boardLeft + offset, boardTop);
        this.boardStaticGraphics.lineTo(boardLeft + offset, boardTop + boardSize);
        this.boardStaticGraphics.moveTo(boardLeft, boardTop + offset);
        this.boardStaticGraphics.lineTo(boardLeft + boardSize, boardTop + offset);
        this.boardStaticGraphics.strokePath();
      }
    }

    const staticDrawRowLimit = isMenuMode && this.menuStaticDrawRowsVisible !== null
      ? this.menuStaticDrawRowsVisible
      : this.maze.size;

    for (let y = 0; y < staticDrawRowLimit; y += 1) {
      for (let x = 0; x < this.maze.size; x += 1) {
        const tileX = boardLeft + (x * tileSize);
        const tileY = boardTop + (y * tileSize);
        const walkable = this.maze.grid[y]?.[x] === true;

        if (walkable) {
          const segments = resolveLegacyMenuPathRenderSegments(this.maze, { x, y }, tileSize);
          const frames = resolveLegacyMenuPathRenderFrames(this.maze, { x, y }, tileSize);
          this.boardStaticGraphics.fillStyle(
            isMenuMode ? pathGlow : LEGACY_PLAY_PATH_EDGE,
            isMenuMode ? LEGACY_MENU_PATH_EDGE_ALPHA : LEGACY_PLAY_PATH_EDGE_ALPHA
          );
          for (const segment of segments.edge) {
            this.boardStaticGraphics.fillRect(
              tileX + segment.leftInset,
              tileY + segment.topInset,
              segment.width,
              segment.height
            );
          }
          this.boardStaticGraphics.fillStyle(pathColor, isMenuMode ? 0.92 : 0.96);
          this.boardStaticGraphics.fillRect(
            tileX + frames.core.leftInset,
            tileY + frames.core.topInset,
            frames.core.width,
            frames.core.height
          );
        } else {
          this.boardStaticGraphics.fillStyle(wallColor, isMenuMode ? 0.94 : 1);
          this.boardStaticGraphics.fillRect(tileX, tileY, tileSize, tileSize);

          // Keep wall cells flat: the generated topology should read cleanly without fake bevel/depth.
        }
      }
    }

    this.titleText.setVisible(this.mode === 'menu');
    this.titleShadow.setVisible(this.mode === 'menu');
    this.boardStaticDirty = false;
  }

  private drawDynamicBoard(): void {
    const { boardLeft, boardTop, tileSize } = this.layout;
    this.boardDynamicGraphics.clear();

    const trail = this.mode === 'menu'
      ? this.trail
      : buildPathTrail(this.trail, this.settings.toggleTrailFade ? TRAIL_FADE_TAIL : null);
    const dynamicTrailKeys = new Set(trail.map((point) => `${point.x},${point.y}`));
    const boardOffset = this.resolveBoardOffset();

    if (this.mode === 'menu' && this.maze.start) {
      this.fillMenuDynamicMarkerTile(this.maze.start, 0xbca86f, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 0.9);
    } else if (this.maze.start) {
      this.fillPlayDynamicMarkerTile(this.maze.start, 0xbca86f, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 0.9, 'start');
    }
    if (this.mode === 'menu' && this.maze.goal) {
      this.fillMenuDynamicMarkerTile(this.maze.goal, 0xd81b2a, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 0.95);
    } else if (this.maze.goal) {
      this.fillPlayDynamicMarkerTile(this.maze.goal, 0xd81b2a, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 0.95, 'goal');
    }

    for (let index = 0; index < trail.length; index += 1) {
      const point = trail[index];
      if (!point) {
        continue;
      }

      const alpha = this.mode === 'play'
        ? clamp(0.34 + ((index / Math.max(1, trail.length - 1)) * 0.66), 0.34, 1)
        : clamp(0.22 + ((index / Math.max(1, trail.length - 1)) * 0.82), 0.22, 1);
      const trailColor = this.mode === 'play'
        ? (this.settings.darkMode ? 0x42e6ff : 0x23d5ff)
        : (this.settings.darkMode ? 0x10c8f2 : 0x14b8d9);
      const trailAlpha = this.settings.darkMode && this.mode === 'menu'
        ? clamp(alpha + 0.08, 0, 1)
        : alpha;
      if (this.mode === 'menu') {
        this.fillLegacyMenuDynamicPathTile(
          point,
          trailColor,
          boardLeft + boardOffset.x,
          boardTop + boardOffset.y,
          tileSize,
          trailAlpha,
          dynamicTrailKeys
        );
      } else {
        this.fillLegacyPlayDynamicPathTile(
          point,
          trailColor,
          boardLeft + boardOffset.x,
          boardTop + boardOffset.y,
          tileSize,
          trailAlpha,
          dynamicTrailKeys
        );
      }
    }

    if (this.mode === 'menu') {
      this.fillLegacyPlayerMarkerTile(this.player, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 0.94, false);
    } else {
      this.fillLegacyPlayerMarkerTile(this.player, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 1, true);
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

  private fillTile(
    graphics: Phaser.GameObjects.Graphics,
    point: LegacyPoint,
    color: number,
    originX: number,
    originY: number,
    tileSize: number,
    alpha = 1,
    inset = 0
  ): void {
    graphics.fillStyle(color, alpha);
    graphics.fillRect(
      originX + (point.x * tileSize) + inset,
      originY + (point.y * tileSize) + inset,
      Math.max(1, tileSize - (inset * 2)),
      Math.max(1, tileSize - (inset * 2))
    );
  }

  private fillLegacyMenuDynamicPathTile(
    point: LegacyPoint,
    color: number,
    originX: number,
    originY: number,
    tileSize: number,
    alpha: number,
    trailKeys: Set<string>
  ): void {
    this.fillLegacyDynamicPathTile(
      point,
      color,
      originX,
      originY,
      tileSize,
      alpha,
      trailKeys,
      LEGACY_MENU_DYNAMIC_TRAIL_EDGE,
      LEGACY_MENU_DYNAMIC_TRAIL_EDGE_RATIO,
      LEGACY_MENU_DYNAMIC_TRAIL_CORE_RATIO,
      0.42,
      0.94
    );
  }

  private fillLegacyPlayDynamicPathTile(
    point: LegacyPoint,
    color: number,
    originX: number,
    originY: number,
    tileSize: number,
    alpha: number,
    trailKeys: Set<string>
  ): void {
    this.fillLegacyDynamicPathTile(
      point,
      color,
      originX,
      originY,
      tileSize,
      alpha,
      trailKeys,
      LEGACY_PLAY_DYNAMIC_TRAIL_EDGE,
      LEGACY_PLAY_DYNAMIC_TRAIL_EDGE_RATIO,
      LEGACY_PLAY_DYNAMIC_TRAIL_CORE_RATIO,
      0.34,
      0.86
    );
  }

  private fillLegacyDynamicPathTile(
    point: LegacyPoint,
    color: number,
    originX: number,
    originY: number,
    tileSize: number,
    alpha: number,
    trailKeys: Set<string>,
    edgeColor: number,
    edgeRatio: number,
    coreRatio: number,
    edgeAlphaScale: number,
    coreAlphaMax: number
  ): void {
    const tileX = originX + (point.x * tileSize);
    const tileY = originY + (point.y * tileSize);
    const connectedLeft = trailKeys.has(`${point.x - 1},${point.y}`);
    const connectedRight = trailKeys.has(`${point.x + 1},${point.y}`);
    const connectedTop = trailKeys.has(`${point.x},${point.y - 1}`);
    const connectedBottom = trailKeys.has(`${point.x},${point.y + 1}`);
    const drawTrailStroke = (width: number, colorValue: number, colorAlpha: number): void => {
      const inset = Math.max(0, Math.floor((tileSize - width) / 2));
      const centerSpan = Math.max(1, tileSize - (inset * 2));
      this.boardDynamicGraphics.fillStyle(colorValue, colorAlpha);
      this.boardDynamicGraphics.fillRect(tileX + inset, tileY + inset, centerSpan, centerSpan);

      if (connectedLeft) {
        this.boardDynamicGraphics.fillRect(tileX, tileY + inset, inset + centerSpan, centerSpan);
      }
      if (connectedRight) {
        this.boardDynamicGraphics.fillRect(tileX + inset, tileY + inset, tileSize - inset, centerSpan);
      }
      if (connectedTop) {
        this.boardDynamicGraphics.fillRect(tileX + inset, tileY, centerSpan, inset + centerSpan);
      }
      if (connectedBottom) {
        this.boardDynamicGraphics.fillRect(tileX + inset, tileY + inset, centerSpan, tileSize - inset);
      }
    };

    drawTrailStroke(
      resolveLegacyDynamicTrailStrokeWidth(tileSize, edgeRatio, 3),
      edgeColor,
      Math.min(0.32, alpha * edgeAlphaScale)
    );
    drawTrailStroke(
      resolveLegacyDynamicTrailStrokeWidth(tileSize, coreRatio, 2),
      color,
      Math.min(coreAlphaMax, alpha)
    );
  }

  private fillMenuDynamicMarkerTile(
    point: LegacyPoint,
    color: number,
    originX: number,
    originY: number,
    tileSize: number,
    alpha: number
  ): void {
    const inset = resolveLegacyDynamicMarkerInset(tileSize, LEGACY_MENU_DYNAMIC_MARKER_INSET_RATIO);
    this.fillTile(this.boardDynamicGraphics, point, color, originX, originY, tileSize, alpha, inset);
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

  private drawHud(time: number): void {
    this.hudGraphics.clear();
    this.clearHudTexts();
    this.hudBounds = null;
    this.hudTimerBounds = null;
    this.hudArrowBounds = null;
    this.hudTouchControlBounds = null;
    this.hudFrame = null;
    if (this.mode !== 'play' || this.overlay !== 'none') {
      this.footerText.setText('');
      return;
    }
    this.footerText.setText('');

    const boardOffset = this.resolveBoardOffset();
    const goalScreenX = this.layout.boardLeft + boardOffset.x + ((this.maze.goal.x + 0.5) * this.layout.tileSize);
    const goalScreenY = this.layout.boardTop + boardOffset.y + ((this.maze.goal.y + 0.5) * this.layout.tileSize);
    const playerScreenX = this.layout.boardLeft + boardOffset.x + ((this.player.x + 0.5) * this.layout.tileSize);
    const playerScreenY = this.layout.boardTop + boardOffset.y + ((this.player.y + 0.5) * this.layout.tileSize);
    const hudFrame = resolveLegacyPlayHudFrame({
      elapsedMs: time - this.playStartedAtMs,
      goalScreen: { x: goalScreenX, y: goalScreenY },
      layoutWidth: this.layout.width,
      playerScreen: { x: playerScreenX, y: playerScreenY }
    });

    this.hudGraphics.fillStyle(LEGACY_PLAY_HUD_TIMER_PANE, LEGACY_PLAY_HUD_TIMER_PANE_ALPHA);
    this.hudGraphics.fillRect(
      hudFrame.timerBounds.left,
      hudFrame.timerBounds.top,
      hudFrame.timerBounds.width,
      hudFrame.timerBounds.height
    );

    const timerShadow = this.add.text(23, 17, hudFrame.timerText, {
      fontFamily: '"Courier New", monospace',
      fontSize: '14px',
      color: LEGACY_PLAY_HUD_TIMER_SHADOW
    });
    timerShadow.setData('hud', true);
    timerShadow.setAlpha(0.64);
    this.uiTexts.push(timerShadow);

    const timer = this.add.text(22, 16, hudFrame.timerText, {
      fontFamily: '"Courier New", monospace',
      fontSize: '14px',
      color: LEGACY_PLAY_HUD_TIMER_TEXT
    });
    timer.setData('hud', true);
    this.uiTexts.push(timer);

    this.hudGraphics.lineStyle(3, LEGACY_PLAY_HUD_ARROW_SHADOW, 0.36);
    this.hudGraphics.beginPath();
    this.hudGraphics.moveTo(hudFrame.arrowOrigin.x + 1, hudFrame.arrowOrigin.y + 1);
    this.hudGraphics.lineTo(
      hudFrame.arrowTip.x + 1,
      hudFrame.arrowTip.y + 1
    );
    this.hudGraphics.strokePath();
    this.hudGraphics.fillStyle(LEGACY_PLAY_HUD_ARROW_SHADOW, 0.36);
    this.hudGraphics.fillTriangle(
      hudFrame.arrowTip.x + 1,
      hudFrame.arrowTip.y + 1,
      hudFrame.arrowLeft.x + 1,
      hudFrame.arrowLeft.y + 1,
      hudFrame.arrowRight.x + 1,
      hudFrame.arrowRight.y + 1
    );

    this.hudGraphics.lineStyle(2, LEGACY_PLAY_HUD_ARROW, 0.9);
    this.hudGraphics.beginPath();
    this.hudGraphics.moveTo(hudFrame.arrowOrigin.x, hudFrame.arrowOrigin.y);
    this.hudGraphics.lineTo(
      hudFrame.arrowTip.x,
      hudFrame.arrowTip.y
    );
    this.hudGraphics.strokePath();
    this.hudGraphics.fillStyle(LEGACY_PLAY_HUD_ARROW, 0.9);
    this.hudGraphics.fillTriangle(
      hudFrame.arrowTip.x,
      hudFrame.arrowTip.y,
      hudFrame.arrowLeft.x,
      hudFrame.arrowLeft.y,
      hudFrame.arrowRight.x,
      hudFrame.arrowRight.y
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
    this.hudTouchControlBounds = this.drawLegacyPlayTouchControls();
    this.hudBounds = mergeVisualRects(this.hudTimerBounds, this.hudArrowBounds);
    this.hudFrame = hudFrame;
  }

  private drawLegacyPlayTouchControls(): VisualRect | null {
    const touchControlLayout = this.resolveLegacyPlayTouchControlLayout();
    if (!this.shouldRenderLegacyPlayTouchControls(touchControlLayout)) {
      return null;
    }

    const { controls, frame } = touchControlLayout;
    for (const touchFrame of touchControlLayout.frames ?? [frame]) {
      this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_FRAME_FILL, 0.28);
      this.hudGraphics.fillRoundedRect(touchFrame.left, touchFrame.top, touchFrame.width, touchFrame.height, 18);
      this.hudGraphics.lineStyle(1, LEGACY_PLAY_TOUCH_BUTTON_STROKE, 0.18);
      this.hudGraphics.strokeRoundedRect(touchFrame.left, touchFrame.top, touchFrame.width, touchFrame.height, 18);
    }

    this.drawLegacyPlayTouchButton(controls.move_up, false);
    this.drawLegacyPlayTouchButton(controls.move_right, false);
    this.drawLegacyPlayTouchButton(controls.move_down, false);
    this.drawLegacyPlayTouchButton(controls.move_left, false);
    this.drawLegacyPlayTouchButton(controls.pause, true);
    this.drawLegacyPlayTouchButton(controls.restart_attempt, true);
    this.drawLegacyPlayTouchButton(controls.toggle_thoughts, true);

    this.drawLegacyPlayTouchArrow(controls.move_up, 'up');
    this.drawLegacyPlayTouchArrow(controls.move_right, 'right');
    this.drawLegacyPlayTouchArrow(controls.move_down, 'down');
    this.drawLegacyPlayTouchArrow(controls.move_left, 'left');
    this.drawLegacyPlayTouchPauseIcon(controls.pause);
    this.drawLegacyPlayTouchRestartIcon(controls.restart_attempt);
    this.drawLegacyPlayTouchTrailIcon(controls.toggle_thoughts);

    return createVisualRect(frame.left, frame.top, frame.width, frame.height);
  }

  private drawLegacyPlayTouchButton(
    rect: ReturnType<typeof resolveTouchControlLayout>['controls']['move_up'],
    accented: boolean
  ): void {
    this.hudGraphics.fillStyle(accented ? LEGACY_PLAY_TOUCH_ACCENT : LEGACY_PLAY_TOUCH_BUTTON_FILL, accented ? 0.22 : 0.34);
    this.hudGraphics.fillRoundedRect(rect.left, rect.top, rect.width, rect.height, 14);
    this.hudGraphics.lineStyle(2, accented ? LEGACY_PLAY_TOUCH_ACCENT : LEGACY_PLAY_TOUCH_BUTTON_STROKE, accented ? 0.5 : 0.42);
    this.hudGraphics.strokeRoundedRect(rect.left, rect.top, rect.width, rect.height, 14);
  }

  private drawLegacyPlayTouchArrow(
    rect: ReturnType<typeof resolveTouchControlLayout>['controls']['move_up'],
    direction: 'up' | 'right' | 'down' | 'left'
  ): void {
    const size = Math.round(Math.min(rect.width, rect.height) * 0.28);
    const cx = rect.centerX;
    const cy = rect.centerY;

    this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_ICON, 0.86);
    switch (direction) {
      case 'up':
        this.hudGraphics.fillTriangle(cx, cy - size, cx - size, cy + size, cx + size, cy + size);
        break;
      case 'right':
        this.hudGraphics.fillTriangle(cx + size, cy, cx - size, cy - size, cx - size, cy + size);
        break;
      case 'down':
        this.hudGraphics.fillTriangle(cx, cy + size, cx - size, cy - size, cx + size, cy - size);
        break;
      case 'left':
        this.hudGraphics.fillTriangle(cx - size, cy, cx + size, cy - size, cx + size, cy + size);
        break;
      default:
        direction satisfies never;
    }
  }

  private drawLegacyPlayTouchPauseIcon(
    rect: ReturnType<typeof resolveTouchControlLayout>['controls']['pause']
  ): void {
    const barWidth = Math.max(5, Math.round(rect.width * 0.1));
    const barHeight = Math.round(rect.height * 0.42);
    const gap = Math.round(rect.width * 0.16);
    const top = rect.centerY - Math.round(barHeight / 2);

    this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_ICON, 0.86);
    this.hudGraphics.fillRoundedRect(rect.centerX - gap - barWidth, top, barWidth, barHeight, 2);
    this.hudGraphics.fillRoundedRect(rect.centerX + gap, top, barWidth, barHeight, 2);
  }

  private drawLegacyPlayTouchRestartIcon(
    rect: ReturnType<typeof resolveTouchControlLayout>['controls']['restart_attempt']
  ): void {
    const radius = Math.round(Math.min(rect.width, rect.height) * 0.23);
    const tipSize = Math.max(7, Math.round(radius * 0.42));
    const tipX = rect.centerX + Math.round(radius * 0.8);
    const tipY = rect.centerY - Math.round(radius * 0.76);

    this.hudGraphics.lineStyle(Math.max(3, Math.round(rect.width * 0.05)), LEGACY_PLAY_TOUCH_ICON, 0.82);
    this.hudGraphics.beginPath();
    this.hudGraphics.arc(rect.centerX, rect.centerY, radius, Phaser.Math.DegToRad(36), Phaser.Math.DegToRad(324), false);
    this.hudGraphics.strokePath();
    this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_ICON, 0.82);
    this.hudGraphics.fillTriangle(tipX, tipY, tipX + tipSize, tipY - 1, tipX + 2, tipY + tipSize);
  }

  private drawLegacyPlayTouchTrailIcon(
    rect: ReturnType<typeof resolveTouchControlLayout>['controls']['toggle_thoughts']
  ): void {
    const radius = Math.max(3, Math.round(rect.width * 0.07));
    const left = rect.centerX - Math.round(rect.width * 0.22);
    const mid = rect.centerX;
    const right = rect.centerX + Math.round(rect.width * 0.22);
    const top = rect.centerY - Math.round(rect.height * 0.16);
    const bottom = rect.centerY + Math.round(rect.height * 0.16);

    this.hudGraphics.lineStyle(Math.max(3, Math.round(rect.width * 0.05)), LEGACY_PLAY_TOUCH_ICON, 0.78);
    this.hudGraphics.beginPath();
    this.hudGraphics.moveTo(left, bottom);
    this.hudGraphics.lineTo(mid, top);
    this.hudGraphics.lineTo(right, bottom);
    this.hudGraphics.strokePath();
    this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_ICON, 0.84);
    this.hudGraphics.fillCircle(left, bottom, radius);
    this.hudGraphics.fillCircle(mid, top, radius);
    this.hudGraphics.fillCircle(right, bottom, radius);
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

    if (this.overlay === 'none') {
      if (this.mode === 'menu') {
        const [leftLabel, centerLabel, rightLabel] = MAIN_MENU_BUTTONS;
        this.uiButtons.push(
          this.createButton(
            this.layout.leftButtonX,
            this.layout.leftButtonY,
            this.layout.buttonWidth,
            this.layout.buttonHeight,
            leftLabel,
            () => this.performLegacyExit()
          ),
          this.createButton(
            this.layout.centerButtonX,
            this.layout.centerButtonY,
            this.layout.centerButtonWidth,
            this.layout.buttonHeight,
            centerLabel,
            () => this.startPlayMode()
          ),
          this.createButton(
            this.layout.rightButtonX,
            this.layout.rightButtonY,
            this.layout.buttonWidth,
            this.layout.buttonHeight,
            rightLabel,
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
      case 'features':
        this.buildFeaturesOverlay();
        break;
      case 'gameModes':
        this.buildGameModesOverlay();
        break;
      case 'pause':
        this.buildPauseOverlay();
        break;
    }

    this.uiDirty = false;
  }

  private drawOverlayPanel(): void {
    const panel = this.resolveOverlayPanelFrame();

    this.overlayGraphics.fillStyle(0x06060b, 0.76);
    this.overlayGraphics.fillRect(0, 0, this.layout.width, this.layout.height);
    this.overlayGraphics.fillStyle(0x18151f, 0.96);
    this.overlayGraphics.fillRoundedRect(panel.left, panel.top, panel.width, panel.height, 12);
    this.overlayGraphics.lineStyle(2, 0x5f5866, 0.92);
    this.overlayGraphics.strokeRoundedRect(panel.left, panel.top, panel.width, panel.height, 12);
  }

  private resolveOverlayPanelFrame(): OverlayPanelFrame {
    const width = Math.min(720, this.layout.width - 40);
    const height = Math.min(620, this.layout.height - 72);
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

  private buildOptionsOverlay(): void {
    const panel = this.resolveOverlayPanelFrame();
    let rowY = panel.top + 72;
    this.createOverlayTitle('Options', panel.top + 54);

    rowY = this.createInputRow('Maze Scale', 'scale', rowY, panel);
    rowY = this.createInputRow('Camera Scale', 'camScale', rowY, panel);
    rowY = this.createColorInputRow('Path RGB', ['pathR', 'pathG', 'pathB'], rowY, panel, this.settings.pathColor);
    rowY = this.createColorInputRow('Wall RGB', ['wallR', 'wallG', 'wallB'], rowY, panel, this.settings.wallColor);

    const buttonY = panel.top + panel.height - 140;
    const utilityButtonWidth = panel.width < 420 ? 124 : 170;
    this.uiButtons.push(
      this.createButton(panel.centerX - Math.round(panel.width * 0.24), buttonY, utilityButtonWidth, 54, 'Features', () => this.openNestedOverlay('features', 'options')),
      this.createButton(panel.centerX + Math.round(panel.width * 0.24), buttonY, utilityButtonWidth, 54, 'Game Modes', () => this.openNestedOverlay('gameModes', 'options')),
      this.createButton(panel.centerX, buttonY + 76, Math.min(180, panel.width - 96), 54, 'Back', () => this.handleBackAction())
    );
  }

  private buildFeaturesOverlay(): void {
    const panel = this.resolveOverlayPanelFrame();
    let rowY = panel.top + 54;
    this.createOverlayTitle('Features', rowY);
    rowY += 72;

    rowY = this.createToggleRow(
      'Camera Follow',
      this.settings.toggleCameraFollow,
      rowY,
      panel,
      {
        stateText: resolveLegacyOverlayToggleStateText('toggleCameraFollow', this.settings.toggleCameraFollow)
      },
      () => this.applyLegacyOverlayToggleField('toggleCameraFollow')
    );

    rowY = this.createToggleRow(
      'Trail Fade',
      this.settings.toggleTrailFade,
      rowY,
      panel,
      {
        stateText: resolveLegacyOverlayToggleStateText('toggleTrailFade', this.settings.toggleTrailFade)
      },
      () => this.applyLegacyOverlayToggleField('toggleTrailFade')
    );

    this.uiButtons.push(
      this.createButton(panel.centerX, panel.top + panel.height - 120, Math.min(180, panel.width - 96), 54, 'Back', () => this.handleBackAction())
    );
  }

  private buildGameModesOverlay(): void {
    const panel = this.resolveOverlayPanelFrame();
    let rowY = panel.top + 54;
    this.createOverlayTitle('Game Modes', rowY);
    rowY += 72;

    this.createToggleRow(
      'Dark Mode',
      this.settings.darkMode,
      rowY,
      panel,
      {
        stateText: null
      },
      () => this.applyLegacyOverlayToggleField('darkMode')
    );

    this.uiButtons.push(
      this.createButton(panel.centerX, panel.top + panel.height - 120, Math.min(180, panel.width - 96), 54, 'Back', () => this.handleBackAction())
    );
  }

  private buildPauseOverlay(): void {
    const panel = this.resolveOverlayPanelFrame();
    let rowY = panel.top + 54;
    this.createOverlayTitle('Paused', rowY);
    rowY += 72;

    this.createInputRow('Camera Scale', 'camScale', rowY, panel);

    const stacked = panel.width < 420;
    if (stacked) {
      this.uiButtons.push(
        this.createButton(panel.centerX - 78, panel.top + panel.height - 196, 132, 54, 'Back', () => this.applyLegacyPauseCommand('resume')),
        this.createButton(panel.centerX + 78, panel.top + panel.height - 196, 132, 54, 'Reset', () => this.applyLegacyPauseCommand('reset-player')),
        this.createButton(panel.centerX, panel.top + panel.height - 120, Math.min(180, panel.width - 96), 54, 'Main Menu', () => this.applyLegacyPauseCommand('return-menu')),
        this.createButton(panel.centerX, panel.top + panel.height - 56, Math.min(180, panel.width - 96), 46, 'Features', () => this.openNestedOverlay('features', 'pause'))
      );
      return;
    }

    this.uiButtons.push(
      this.createButton(panel.centerX - Math.round(panel.width * 0.28), panel.top + panel.height - 196, 132, 54, 'Back', () => this.applyLegacyPauseCommand('resume')),
      this.createButton(panel.centerX, panel.top + panel.height - 196, 132, 54, 'Reset', () => this.applyLegacyPauseCommand('reset-player')),
      this.createButton(panel.centerX + Math.round(panel.width * 0.28), panel.top + panel.height - 196, 144, 54, 'Main Menu', () => this.applyLegacyPauseCommand('return-menu')),
      this.createButton(panel.centerX, panel.top + panel.height - 120, Math.min(180, panel.width - 96), 54, 'Features', () => this.openNestedOverlay('features', 'pause'))
    );
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
      ? ['camScale']
      : ['scale', 'camScale', 'pathR', 'pathG', 'pathB', 'wallR', 'wallG', 'wallB'];

    for (const fieldId of fieldIds) {
      this.commitOverlayField(fieldId);
    }

    if (this.pendingOverlayMazeRebuild) {
      this.queueGenerationRequest('overlay-rebuild', 0, { stepSeed: true });
      this.pendingOverlayMazeRebuild = false;
      this.boardStaticDirty = true;
      this.boardDynamicDirty = true;
    }
    if (this.settings.scale !== previousScale) {
      this.refreshLayout();
    }

    this.activeInputField = null;
  }

  private createOverlayTitle(text: string, y: number): void {
    const label = this.add.text(this.layout.width / 2, y, text, {
      fontFamily: '"Courier New", monospace',
      fontSize: '34px',
      color: '#6bc96f'
    }).setOrigin(0.5);
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
    const rowLabel = this.add.text(labelX, y, label, {
      fontFamily: '"Courier New", monospace',
      fontSize: stacked ? '20px' : '22px',
      color: '#d9d8df'
    }).setOrigin(0, 0.5);

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

    const rowLabel = this.add.text(panel.left + 28, y, label, {
      fontFamily: '"Courier New", monospace',
      fontSize: '20px',
      color: '#d9d8df'
    }).setOrigin(0, 0.5);
    const swatchLabel = this.add.text(panel.left + panel.width - 72, y, swatch, {
      fontFamily: '"Courier New", monospace',
      fontSize: stacked ? '16px' : '18px',
      color: swatch
    }).setOrigin(0.5);

    this.uiTexts.push(rowLabel, swatchLabel);
    const startX = stacked ? panel.left + 58 : panel.left + Math.round(panel.width * 0.46);
    const spacing = stacked ? Math.round((panel.width - 116) / 2) : 122;
    const inputY = stacked ? y + 38 : y;
    const channelLabelY = stacked ? y + 14 : y - 24;

    for (const [index, fieldId] of fieldIds.entries()) {
      const caption = this.add.text(startX + (spacing * index), channelLabelY, ['R', 'G', 'B'][index] ?? '', {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: '#6bc96f'
      }).setOrigin(0.5);
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
    const background = this.add.rectangle(x, y, width, height, 0xffffff, isActive ? 0.18 : 0.08);
    background.setStrokeStyle(2, isActive ? 0x6bc96f : 0xb8b1c1, isActive ? 0.95 : 0.32);
    background.setInteractive({ useHandCursor: true });
    background.on('pointerdown', () => this.selectOverlayField(fieldId));

    const label = this.add.text(x, y, value, {
      fontFamily: '"Courier New", monospace',
      fontSize: `${Math.max(14, Math.min(22, Math.round(height * 0.38)))}px`,
      color: isActive ? '#7cf58f' : '#f0f0f4'
    }).setOrigin(0.5);

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

  private createToggleRow(
    label: string,
    value: boolean,
    y: number,
    panel: OverlayPanelFrame,
    options: {
      stateText: LegacyOverlayToggleStateText | null;
    },
    onToggle: () => void
  ): number {
    const stacked = panel.width < 420;
    const rowLabel = this.add.text(panel.left + 28, y, label, {
      fontFamily: '"Courier New", monospace',
      fontSize: stacked ? '20px' : '22px',
      color: '#d9d8df'
    }).setOrigin(0, 0.5);
    const toggleX = stacked ? panel.left + panel.width - 52 : panel.left + Math.round(panel.width * 0.82);
    this.uiTexts.push(rowLabel);
    if (options.stateText !== null) {
      const stateText = this.add.text(
        stacked ? toggleX - 76 : toggleX - 78,
        stacked ? y + 32 : y,
        options.stateText,
        {
          fontFamily: '"Courier New", monospace',
          fontSize: stacked ? '18px' : '22px',
          color: '#6bc96f'
        }
      ).setOrigin(0.5);
      this.uiTexts.push(stateText);
    }
    this.uiButtons.push(
      this.createToggleCheckbox(toggleX, stacked ? y + 32 : y, stacked ? 30 : 32, value, onToggle)
    );

    return y + (stacked ? 84 : 64);
  }

  private createToggleCheckbox(
    x: number,
    y: number,
    size: number,
    checked: boolean,
    onToggle: () => void
  ): UiButton {
    const background = this.add.rectangle(x, y, size, size, 0xffffff, 0.08);
    background.setStrokeStyle(2, 0xb8b1c1, 0.58);
    background.setInteractive({ useHandCursor: true });

    const label = this.add.text(x, y, checked ? 'x' : '', {
      fontFamily: '"Courier New", monospace',
      fontSize: `${Math.max(16, Math.round(size * 0.7))}px`,
      color: '#6bc96f'
    }).setOrigin(0.5).setAlpha(checked ? 1 : 0.34);

    const setActive = (active: boolean): void => {
      background.setFillStyle(0xffffff, active ? 0.14 : 0.08);
      background.setStrokeStyle(2, active ? 0xffffff : 0xb8b1c1, active ? 0.86 : 0.58);
      label.setAlpha(checked ? (active ? 1 : 0.96) : (active ? 0.5 : 0.34));
    };

    background.on('pointerover', () => setActive(true));
    background.on('pointerout', () => setActive(false));
    background.on('pointerdown', onToggle);

    return {
      background,
      label,
      setActive,
      destroy: () => {
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
    const baseAlpha = frontDoorChrome?.baseAlpha ?? MENU_BUTTON_ALPHA;
    const baseStroke = frontDoorChrome?.baseStroke ?? MENU_BUTTON_STROKE_ALPHA;
    const fillColor = frontDoorChrome?.fillColor ?? 0xffffff;
    const strokeColor = frontDoorChrome?.strokeColor ?? 0xb8b1c1;
    const background = this.add.rectangle(x, y, width, height, fillColor, baseAlpha);
    background.setStrokeStyle(frontDoorChrome?.strokeWidth ?? 2, strokeColor, baseStroke);
    background.setInteractive({ useHandCursor: true });
    const textFitSize = Math.floor((width * 1.45) / Math.max(4, text.length));
    const buttonFontSize = frontDoorChrome?.fontSize ?? Math.max(
      18,
      Math.min(40, Math.min(Math.round(height * 0.46), textFitSize))
    );
    const buttonTextColor = frontDoorChrome?.textColor ?? MENU_TEXT_COLOR;

    const label = this.add.text(x, y, text, {
      fontFamily: '"Courier New", monospace',
      fontSize: `${buttonFontSize}px`,
      color: buttonTextColor
    }).setOrigin(0.5).setAlpha(frontDoorChrome?.labelAlpha ?? 0.92);

    const setActive = (active: boolean): void => {
      background.setFillStyle(
        active
          ? (frontDoorChrome?.hoverFillColor ?? 0xffffff)
          : fillColor,
        active
          ? (frontDoorChrome?.hoverAlpha ?? 0.28)
          : baseAlpha
      );
      background.setStrokeStyle(
        frontDoorChrome?.strokeWidth ?? 2,
        0xffffff,
        active
          ? (frontDoorChrome?.hoverStroke ?? 0.36)
          : baseStroke
      );
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
        background.destroy();
        label.destroy();
      }
    };
  }

  private clearUi(): void {
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

  private openNestedOverlay(kind: OverlayKind, returnTo: OverlayKind): void {
    const nextOverlayState = resolveLegacyNestedOverlayOpen(
      kind as Extract<OverlayKind, 'features' | 'gameModes'>,
      returnTo as Extract<OverlayKind, 'options' | 'pause'>
    );
    this.activeInputField = null;
    if (this.mode === 'play') {
      this.clearPlayHudImmediately();
    }
    this.overlay = nextOverlayState.overlay;
    this.overlayReturn = nextOverlayState.overlayReturn;
    this.boardDynamicDirty = true;
    this.uiDirty = true;
  }

  private openOverlay(kind: OverlayKind): void {
    if (kind === 'options' || kind === 'pause') {
      this.optionFieldDrafts = createLegacyOptionFieldDrafts(this.settings);
      this.pendingOverlayMazeRebuild = false;
    }
    this.activeInputField = null;
    if (this.mode === 'play') {
      this.resetLegacyPlayInputBuffer();
      this.clearPlayHudImmediately();
    }
    this.overlay = kind;
    this.overlayReturn = 'none';
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
    this.overlay = 'none';
    this.overlayReturn = 'none';
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
    this.settings = result.settings;

    if (result.affectsBackdrop) {
      this.backdropDirty = true;
    }
    if (result.affectsBoardStatic) {
      this.boardStaticDirty = true;
    }
    if (result.affectsBoardDynamic) {
      this.boardDynamicDirty = true;
    }

    this.uiDirty = true;
    if (this.mode === 'play') {
      this.publishInteractionDiagnostics();
    }
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
      case 'return-parent':
        this.overlay = action.overlay;
        this.overlayReturn = action.overlayReturn;
        this.boardDynamicDirty = true;
        this.uiDirty = true;
        return;
      case 'close-overlay':
        this.closeOverlay();
        return;
    }
  }

  private performLegacyExit(): void {
    performLegacyBrowserSafeExit(typeof window === 'undefined' ? undefined : window);
  }

  private resolveLegacyPlayTouchControlDiagnostics(): MenuSceneVisualDiagnostics['touchControls'] {
    const touchControlLayout = this.resolveLegacyPlayTouchControlLayout();
    const visible = this.shouldRenderLegacyPlayTouchControls(touchControlLayout);
    const emptyControls = {
      move_up: null,
      move_right: null,
      move_down: null,
      move_left: null,
      pause: null,
      restart_attempt: null,
      toggle_thoughts: null
    };

    if (!visible) {
      return {
        visible,
        compact: touchControlLayout.compact,
        frame: null,
        controls: emptyControls
      };
    }

    const { controls, frame } = touchControlLayout;
    return {
      visible,
      compact: touchControlLayout.compact,
      frame: cloneVisualRect(this.hudTouchControlBounds) ?? createVisualRect(frame.left, frame.top, frame.width, frame.height),
      controls: {
        move_up: createVisualRect(controls.move_up.left, controls.move_up.top, controls.move_up.width, controls.move_up.height),
        move_right: createVisualRect(controls.move_right.left, controls.move_right.top, controls.move_right.width, controls.move_right.height),
        move_down: createVisualRect(controls.move_down.left, controls.move_down.top, controls.move_down.width, controls.move_down.height),
        move_left: createVisualRect(controls.move_left.left, controls.move_left.top, controls.move_left.width, controls.move_left.height),
        pause: createVisualRect(controls.pause.left, controls.pause.top, controls.pause.width, controls.pause.height),
        restart_attempt: createVisualRect(
          controls.restart_attempt.left,
          controls.restart_attempt.top,
          controls.restart_attempt.width,
          controls.restart_attempt.height
        ),
        toggle_thoughts: createVisualRect(
          controls.toggle_thoughts.left,
          controls.toggle_thoughts.top,
          controls.toggle_thoughts.width,
          controls.toggle_thoughts.height
        )
      }
    };
  }

  private publishVisualDiagnostics(time: number): void {
    if (typeof window === 'undefined' || !this.layout) {
      return;
    }

    const safeBounds = createVisualRect(0, 0, this.layout.width, this.layout.height);
    const boardOffset = this.resolveBoardOffset();
    const boardBounds = createVisualRect(
      this.layout.boardLeft + boardOffset.x,
      this.layout.boardTop + boardOffset.y,
      this.layout.boardSize,
      this.layout.boardSize
    );
    const drawStage = this.resolveLegacyMenuStaticDrawStage();
    const drawStageStaged = this.mode === 'menu' && drawStage?.executionKind === 'row-slice';
    const drawRowsVisible = this.resolveLegacyMenuStaticDrawRowsVisibleForDiagnostics();
    const drawStageProgress = resolveMenuSceneGenerationDrawStageProgress({
      rowsVisible: drawRowsVisible,
      rowCount: drawStageStaged ? this.maze.size : null
    });
    const touchControls = this.resolveLegacyPlayTouchControlDiagnostics();
    const playerMarkerMetrics = resolveLegacyPlayerMarkerRenderMetrics(
      this.layout.tileSize,
      this.mode === 'play' ? LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO : LEGACY_PLAYER_MARKER_RADIUS_RATIO,
      this.mode === 'play' ? LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO : LEGACY_PLAYER_MARKER_HALO_RATIO
    );

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
            complete: drawStageProgress.complete,
            progressPercent: drawStageProgress.progressPercent,
            rowCount: drawStageProgress.rowCount,
            rowsRemaining: drawStageProgress.rowsRemaining,
            rowsVisible: drawRowsVisible,
            staged: drawStageStaged
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
        safeBounds,
        tileSize: this.layout.tileSize
      },
      markerStyle: {
        goalCoreColor: LEGACY_PLAY_GOAL_MARKER_CORE,
        goalEdgeColor: LEGACY_PLAY_GOAL_MARKER_EDGE,
        playerCoreColor: LEGACY_PLAYER_MARKER_CORE,
        playerCoreRadius: playerMarkerMetrics.coreRadius,
        playerHaloColor: LEGACY_PLAYER_MARKER_HALO,
        playerHaloRadius: playerMarkerMetrics.haloRadius
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
      hud: {
        kind: this.mode === 'play' && this.overlay === 'none' ? 'legacy-play-hud' : null,
        visible: this.mode === 'play' && this.overlay === 'none',
        bounds: cloneVisualRect(this.hudBounds),
        timerBounds: cloneVisualRect(this.hudTimerBounds),
        arrowBounds: cloneVisualRect(this.hudArrowBounds),
        arrowAngleDegrees: this.hudFrame?.arrowAngleDegrees ?? null,
        timerText: this.hudFrame?.timerText ?? null,
        arrowAngleRadians: this.hudFrame?.arrowAngleRadians ?? null
      },
      touchControls
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
