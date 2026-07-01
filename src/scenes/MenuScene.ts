import Phaser from 'phaser';
import type { DemoRunnerTelemetry, DemoWalkerConfig, DemoWalkerState } from '../domain/ai';
import type { MazeEpisode } from '../domain/maze';
import { markMazerBootStatus } from '../boot/bootStatus';
import { legacyTuning } from '../config/tuning';
import {
  LEGACY_DEFAULTS,
  MAIN_MENU_BUTTONS,
  copyLegacySettings,
  linearColorToHex,
  linearColorToNumber,
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
  createLegacyPlayMoveFlags,
  LEGACY_SIMULTANEOUS_KEY_PRESS_DELAY_MS,
  resolveLegacyPlayMoveVector,
  type LegacyPlayMoveFlags
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
  resolveLegacyMenuPathRenderFrames,
  resolveLegacyMenuPathRenderSegments
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

const BOARD_SHADOW_OFFSET = 10;
const MENU_BUTTON_ALPHA = 0.1;
const MENU_BUTTON_STROKE_ALPHA = 0.24;
const MENU_TEXT_COLOR = '#0b841d';
const TITLE_FILL_COLOR = '#1d8726';
const TITLE_SHADOW_COLOR = '#103516';
const LEGACY_BOARD_GRID_ALPHA = 0.003;
const INITIAL_MENU_DEMO_HOLD_MS = 1800;
const TRAIL_FADE_TAIL = 16;
const LEGACY_MENU_SLAB_FILL = 0x4f4a55;
const LEGACY_MENU_SLAB_EDGE = 0x14101a;
const LEGACY_MENU_SLAB_HIGHLIGHT = 0xbcb5c7;
const LEGACY_MENU_PANEL_SHADOW_ALPHA = 0.38;
const LEGACY_MENU_PATH_CORE = 0x9f99a6;
const LEGACY_MENU_PATH_EDGE = 0x100c15;
const LEGACY_MENU_PATH_EDGE_ALPHA = 0.82;
const LEGACY_MENU_PATH_RELIEF_SHADOW = 0x07050b;
const LEGACY_MENU_PATH_RELIEF_SHADOW_ALPHA = 0.34;
const LEGACY_MENU_PATH_RELIEF_OFFSET_RATIO = 0.13;
const LEGACY_MENU_WALL_FILL = 0x302a36;
const LEGACY_MENU_WALL_GRID = 0x18131d;
const LEGACY_PLAY_PATH_EDGE = 0x1a161f;
const LEGACY_PLAY_PATH_EDGE_ALPHA = 0.58;
const LEGACY_PLAY_PATH_RELIEF_SHADOW = 0x08060c;
const LEGACY_PLAY_PATH_RELIEF_SHADOW_ALPHA = 0.22;
const LEGACY_MENU_DYNAMIC_TRAIL_EDGE = 0x0a6f82;
const LEGACY_MENU_DYNAMIC_MARKER_INSET_RATIO = 0.22;
const LEGACY_MENU_DYNAMIC_TRAIL_CORE_RATIO = 0.3;
const LEGACY_MENU_DYNAMIC_TRAIL_EDGE_RATIO = 0.54;
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

    this.scale.on('resize', () => {
      this.refreshLayout();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.detachRuntimeDiagnostics();
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
    const runnerTelemetry = this.menuDemoState?.telemetry ?? {
      wrongBranchCount: 0,
      backtrackCount: 0,
      recoveryCount: 0
    };
    const trailSegmentCap = this.settings.toggleTrailFade
      ? TRAIL_FADE_TAIL
      : Math.max(this.trail.length, this.menuDemoConfig?.behavior.trailMaxLength ?? this.trail.length);

    publishMenuSceneRuntimeDiagnostics({
      revision: this.runtimeDiagnosticsRevision,
      sceneInstanceId: this.runtimeDiagnosticsSceneInstanceId,
      updatedAt: Math.max(0, Math.round(time)),
      runtimeMs: Math.max(0, Math.round(time)),
      menuDemo: {
        phase: this.menuDemoState?.phase ?? null,
        cue: this.menuDemoState?.cue ?? null,
        pathCursor: this.menuDemoState?.pathCursor ?? null,
        reachedGoal: this.menuDemoState?.reachedGoal ?? false,
        prerollSteps: Math.max(0, this.menuDemoConfig?.behavior.prerollSteps ?? 0),
        runnerMistakesEnabled: this.menuDemoConfig
          ? this.menuDemoConfig.behavior.enableRunnerMistakes === true
          : null
      },
      generation: {
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
        listenerCount: 3 + (this.runtimeVisibilityAttached ? 1 : 0),
        listenerBreakdown: {
          sceneUpdate: 1,
          sceneShutdown: 1,
          scaleResize: 1,
          visibilityAttached: this.runtimeVisibilityAttached,
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

  private installInput(): void {
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (hasPendingLegacyResetRequest(this.pendingResetRequest)) {
        this.resetLegacyPlayInputBuffer();
        return;
      }

      if (this.handleLegacyPlayMovementKeyDown(event)) {
        return;
      }

      if (event.repeat) {
        return;
      }

      if (this.overlay !== 'none' && this.handleOverlayFieldInput(event)) {
        return;
      }

      if (event.key === 'Escape') {
        this.handleBackAction();
        return;
      }

      if (event.key.toLowerCase() === 'p' && this.mode === 'play') {
        if (this.overlay === 'pause') {
          this.closeOverlay();
        } else if (this.overlay === 'none') {
          this.openOverlay('pause');
        }
        return;
      }

      if (event.key === 'Enter' && this.mode === 'menu' && this.overlay === 'none') {
        this.startPlayMode();
        return;
      }

      if (event.key.toLowerCase() === 'o' && this.mode === 'menu' && this.overlay === 'none') {
        this.openOverlay('options');
        return;
      }

      if (this.mode !== 'play' || this.overlay !== 'none') {
        return;
      }
    });

    this.input.keyboard?.on('keyup', (event: KeyboardEvent) => {
      this.handleLegacyPlayMovementKeyUp(event);
    });
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

    this.playMoveFlags[direction] = false;
    return true;
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
    this.layout = resolveLegacyMenuLayout(width, height, this.settings.scale + this.settings.camScale, this.maze.size);
    const titlePresentation = resolveLegacyMenuTitlePresentation(
      this.layout.boardSize,
      this.layout.tileSize,
      isPortrait
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

    if (nextStep.reachedGoal) {
      this.schedulePlayResetReturn();
      this.boardDynamicDirty = true;
      return;
    }

    this.boardDynamicDirty = true;
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
    const { boardLeft, boardTop, boardSize, tileSize } = this.layout;
    const isMenuMode = this.mode === 'menu';
    const pathColor = isMenuMode
      ? LEGACY_MENU_PATH_CORE
      : linearColorToNumber(this.settings.pathColor);
    const wallColor = isMenuMode
      ? LEGACY_MENU_WALL_FILL
      : linearColorToNumber(this.settings.wallColor);
    const boardFill = isMenuMode
      ? 0x18131d
      : (this.settings.darkMode ? 0x16121a : 0x4a454f);
    const boardEdge = isMenuMode ? 0x0f0b13 : (this.settings.darkMode ? 0x030205 : 0x322c35);
    const pathGlow = isMenuMode
      ? LEGACY_MENU_PATH_EDGE
      : (this.settings.darkMode ? 0xb3acb8 : 0xd0cad2);

    this.boardStaticGraphics.clear();
    this.boardStaticGraphics.fillStyle(0x000000, isMenuMode ? LEGACY_MENU_PANEL_SHADOW_ALPHA : 0.28);
    this.boardStaticGraphics.fillRect(boardLeft + BOARD_SHADOW_OFFSET, boardTop + BOARD_SHADOW_OFFSET, boardSize, boardSize);
    if (isMenuMode) {
      this.boardStaticGraphics.fillStyle(LEGACY_MENU_SLAB_FILL, 0.5);
      this.boardStaticGraphics.fillRect(boardLeft - 15, boardTop - 15, boardSize + 30, boardSize + 25);
      this.boardStaticGraphics.fillStyle(LEGACY_MENU_SLAB_EDGE, 0.92);
      this.boardStaticGraphics.fillRect(boardLeft - 11, boardTop - 9, 7, boardSize + 13);
      this.boardStaticGraphics.fillRect(boardLeft + boardSize + 4, boardTop - 3, 11, boardSize + 16);
      this.boardStaticGraphics.fillRect(boardLeft - 3, boardTop + boardSize + 4, boardSize + 18, 7);
      this.boardStaticGraphics.fillRect(boardLeft - 3, boardTop - 11, boardSize + 12, 4);
      this.boardStaticGraphics.fillStyle(0x000000, 0.34);
      this.boardStaticGraphics.fillRect(boardLeft + boardSize + 15, boardTop + 14, 7, Math.max(0, boardSize - 8));
      this.boardStaticGraphics.fillRect(boardLeft + 20, boardTop + boardSize + 11, Math.max(0, boardSize - 2), 5);
      this.boardStaticGraphics.fillStyle(LEGACY_MENU_SLAB_HIGHLIGHT, 0.12);
      this.boardStaticGraphics.fillRect(boardLeft - 12, boardTop - 12, boardSize + 18, 1);
      this.boardStaticGraphics.fillRect(boardLeft - 12, boardTop - 12, 1, boardSize + 18);
      this.boardStaticGraphics.fillStyle(LEGACY_MENU_SLAB_HIGHLIGHT, 0.07);
      this.boardStaticGraphics.fillRect(boardLeft - 7, boardTop - 6, boardSize + 10, 1);
    }
    this.boardStaticGraphics.fillStyle(boardEdge, 1);
    this.boardStaticGraphics.fillRect(boardLeft - 3, boardTop - 3, boardSize + 6, boardSize + 6);
    this.boardStaticGraphics.fillStyle(boardFill, isMenuMode ? 0.98 : 0.96);
    this.boardStaticGraphics.fillRect(boardLeft, boardTop, boardSize, boardSize);
    if (isMenuMode) {
      this.boardStaticGraphics.fillStyle(0xffffff, 0.026);
      this.boardStaticGraphics.fillRect(boardLeft + 1, boardTop + 1, boardSize - 2, 2);
      this.boardStaticGraphics.fillRect(boardLeft + 1, boardTop + 1, 2, boardSize - 2);
    }
    if (this.settings.darkMode) {
      this.boardStaticGraphics.fillStyle(0x000000, 0.12);
      this.boardStaticGraphics.fillRect(boardLeft, boardTop, boardSize, boardSize);
    }
    if (isMenuMode) {
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
          const reliefOffset = Math.max(1, Math.floor(tileSize * LEGACY_MENU_PATH_RELIEF_OFFSET_RATIO));

          this.boardStaticGraphics.fillStyle(
            isMenuMode ? LEGACY_MENU_PATH_RELIEF_SHADOW : LEGACY_PLAY_PATH_RELIEF_SHADOW,
            isMenuMode ? LEGACY_MENU_PATH_RELIEF_SHADOW_ALPHA : LEGACY_PLAY_PATH_RELIEF_SHADOW_ALPHA
          );
          for (const segment of segments.edge) {
            this.boardStaticGraphics.fillRect(
              tileX + segment.leftInset + reliefOffset,
              tileY + segment.topInset + reliefOffset,
              segment.width,
              segment.height
            );
          }

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

          if (isMenuMode && tileSize > 6) {
            this.boardStaticGraphics.fillStyle(LEGACY_MENU_WALL_GRID, 0.004);
            this.boardStaticGraphics.fillRect(
              tileX + 1,
              tileY + 1,
              Math.max(1, tileSize - 2),
              Math.max(1, tileSize - 2)
            );
          }
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
    const menuTrailKeys = this.mode === 'menu'
      ? new Set(trail.map((point) => `${point.x},${point.y}`))
      : null;
    const boardOffset = this.resolveBoardOffset();

    if (this.mode === 'menu' && this.maze.start) {
      this.fillMenuDynamicMarkerTile(this.maze.start, 0xbca86f, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 0.9);
    } else if (this.maze.start) {
      this.fillTile(this.boardDynamicGraphics, this.maze.start, 0xbca86f, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize);
    }
    if (this.mode === 'menu' && this.maze.goal) {
      this.fillMenuDynamicMarkerTile(this.maze.goal, 0xd81b2a, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 0.95);
    } else if (this.maze.goal) {
      this.fillTile(this.boardDynamicGraphics, this.maze.goal, 0xd81b2a, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize);
    }

    for (let index = 0; index < trail.length; index += 1) {
      const point = trail[index];
      if (!point) {
        continue;
      }

      const alpha = this.mode === 'play'
        ? clamp(0.25 + ((index / Math.max(1, trail.length - 1)) * 0.75), 0.25, 1)
        : clamp(0.22 + ((index / Math.max(1, trail.length - 1)) * 0.82), 0.22, 1);
      const trailColor = this.settings.darkMode ? 0x10c8f2 : 0x14b8d9;
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
          menuTrailKeys ?? new Set<string>()
        );
      } else {
        this.fillTile(this.boardDynamicGraphics, point, trailColor, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, trailAlpha, 1);
      }
    }

    if (this.mode === 'menu') {
      this.fillMenuDynamicMarkerTile(this.player, 0xf2f4f8, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 0.92);
    } else {
      this.fillTile(this.boardDynamicGraphics, this.player, 0xf2f4f8, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 1, 0);
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
      Math.max(3, Math.floor(tileSize * LEGACY_MENU_DYNAMIC_TRAIL_EDGE_RATIO)),
      LEGACY_MENU_DYNAMIC_TRAIL_EDGE,
      Math.min(0.32, alpha * 0.42)
    );
    drawTrailStroke(
      Math.max(2, Math.floor(tileSize * LEGACY_MENU_DYNAMIC_TRAIL_CORE_RATIO)),
      color,
      Math.min(0.94, alpha)
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
    const inset = Math.max(2, Math.floor(tileSize * LEGACY_MENU_DYNAMIC_MARKER_INSET_RATIO));
    this.fillTile(this.boardDynamicGraphics, point, color, originX, originY, tileSize, alpha, inset);
  }

  private drawHud(time: number): void {
    this.hudGraphics.clear();
    this.clearHudTexts();
    this.hudBounds = null;
    this.hudTimerBounds = null;
    this.hudArrowBounds = null;
    this.hudFrame = null;
    if (this.mode !== 'play' || this.overlay !== 'none') {
      this.footerText.setText('');
      return;
    }
    this.footerText.setText('');

    const boardOffset = this.resolveBoardOffset();
    const goalScreenX = this.layout.boardLeft + boardOffset.x + (this.maze.goal.x * this.layout.tileSize);
    const goalScreenY = this.layout.boardTop + boardOffset.y + (this.maze.goal.y * this.layout.tileSize);
    const playerScreenX = this.layout.boardLeft + boardOffset.x + (this.player.x * this.layout.tileSize);
    const playerScreenY = this.layout.boardTop + boardOffset.y + (this.player.y * this.layout.tileSize);
    const hudFrame = resolveLegacyPlayHudFrame({
      elapsedMs: time - this.playStartedAtMs,
      goalScreen: { x: goalScreenX, y: goalScreenY },
      layoutWidth: this.layout.width,
      playerScreen: { x: playerScreenX, y: playerScreenY }
    });

    this.hudGraphics.fillStyle(0x05050a, 0.34);
    this.hudGraphics.fillRect(
      hudFrame.timerBounds.left,
      hudFrame.timerBounds.top,
      hudFrame.timerBounds.width,
      hudFrame.timerBounds.height
    );
    this.hudGraphics.lineStyle(1, 0xdedbe6, 0.22);
    this.hudGraphics.strokeRect(
      hudFrame.timerBounds.left,
      hudFrame.timerBounds.top,
      hudFrame.timerBounds.width,
      hudFrame.timerBounds.height
    );

    const timer = this.add.text(22, 16, hudFrame.timerText, {
      fontFamily: '"Courier New", monospace',
      fontSize: '14px',
      color: '#d7f0d6'
    });
    timer.setData('hud', true);
    this.uiTexts.push(timer);

    this.hudGraphics.lineStyle(2, 0xe4efe6, 0.92);
    this.hudGraphics.beginPath();
    this.hudGraphics.moveTo(hudFrame.arrowOrigin.x, hudFrame.arrowOrigin.y);
    this.hudGraphics.lineTo(
      hudFrame.arrowTip.x,
      hudFrame.arrowTip.y
    );
    this.hudGraphics.strokePath();
    this.hudGraphics.fillStyle(0xe4efe6, 0.92);
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
    this.hudBounds = mergeVisualRects(this.hudTimerBounds, this.hudArrowBounds);
    this.hudFrame = hudFrame;
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
            this.layout.buttonY,
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
            this.layout.buttonY,
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
  }

  private applyLegacyPauseCommand(command: LegacyPauseCommand): void {
    const result = resolveLegacyPauseCommand(command, this.maze.start);

    if (result.nextPlayer !== null) {
      this.player = result.nextPlayer;
      this.trail = result.nextTrail ?? [copyPoint(result.nextPlayer)];
      this.boardDynamicDirty = true;
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

  private publishVisualDiagnostics(time: number): void {
    if (typeof window === 'undefined' || !this.layout) {
      return;
    }

    const safeBounds = createVisualRect(0, 0, this.layout.width, this.layout.height);
    const boardBounds = createVisualRect(
      this.layout.boardLeft,
      this.layout.boardTop,
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

    this.visualDiagnosticsRevision += 1;
    window[MENU_SCENE_VISUAL_DIAGNOSTICS_KEY] = {
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
      hud: {
        kind: this.mode === 'play' && this.overlay === 'none' ? 'legacy-play-hud' : null,
        visible: this.mode === 'play' && this.overlay === 'none',
        bounds: cloneVisualRect(this.hudBounds),
        timerBounds: cloneVisualRect(this.hudTimerBounds),
        arrowBounds: cloneVisualRect(this.hudArrowBounds),
        arrowAngleDegrees: this.hudFrame?.arrowAngleDegrees ?? null,
        timerText: this.hudFrame?.timerText ?? null,
        arrowAngleRadians: this.hudFrame?.arrowAngleRadians ?? null
      }
    };
  }

  private clearVisualDiagnostics(): void {
    if (typeof window === 'undefined') {
      return;
    }

    delete window[MENU_SCENE_VISUAL_DIAGNOSTICS_KEY];
  }
}
