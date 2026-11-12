import Phaser from 'phaser';
import {
  MAZER_HUD_LEADERBOARD_TEXTURE_KEY,
  MAZER_HUD_PROFILE_TEXTURE_KEY,
  MAZER_HUD_SETTINGS_TEXTURE_KEY,
  MAZER_TILE_FONT_TEXTURE_KEY,
} from './BootScene';
import {
  applyMazerCanvasBackingResolution,
  MAZER_CANVAS_RESOLUTION_MAX,
  resolveMazerCanvasBackingResolution,
  resolveMazerCanvasResolution,
  summarizeMazerRenderResolution,
  type MazerRenderResolutionDiagnostics,
  type MazerRenderResolutionStatus
} from '../boot/canvasResolution';
import {
  BoardTileLayer,
  buildRankGrid,
  isBoardCellRevealed,
  type BoardTileReveal,
  resolveBoardTileStyleFromSearch
} from '../render/boardTileLayer';
import { centerOfCell, drawBoardMarkers, type BoardTileDock } from '../render/boardTileBake';
import {
  resolveBleedGlowColor,
  resolveBleedGlowEnvelope,
  resolveBleedGlowProgress,
  resolveBleedGlowRects
} from '../render/bleedGlow';
import { BOARD_MARKER_MIN_CSS, BOARD_TILE_GEOMETRY, boardMaterial, type BoardTileStyleId } from '../render/boardTileStyle';
import { drawGoalBeacon } from '../render/goalBeacon';
import { alignBoundsToWholePixels, alignCameraToWholePixels } from '../render/pixelAlignment';
import { PlayerLocatorState } from '../render/playerLocator';
import {
  PLAYER_MARKER,
  createPlayerMarkerFrame,
  drawPlayerMarker,
  resolvePlayerMarkerCenter,
  resolvePlayerMarkerFrame,
  type PlayerMarkerFrame
} from '../render/playerMarker';
import { PlayerGlide } from '../render/playerGlide';
import {
  WALL_BUMP_DURATION_MS,
  resolvePlayerGlideDurationMs,
  resolveWallBumpNudge,
  shouldBuzzWallBump
} from '../render/playerMotionTiming';
import { drawTrailLayersToCanvasContext, type TrailLayerSegment } from '../render/trailLayersCanvas';
import {
  TRAIL_FADE_ALPHA_MIN,
  TRAIL_GLOW_ALPHA_RATIO,
  TRAIL_UNDERLAY_ALPHA,
  TRAIL_UNDERLAY_PAD_MIN_CSS,
  TRAIL_WIDTH_RATIO,
  resolveTrailWidths
} from '../render/trailLegibility';
import {
  resolveIridescentRestingCore,
  resolveTrailBreath,
  resolveTrailGlowAlphaScale,
  resolveTrailWidthScale,
  sampleIridescentTrail
} from '../render/trailIridescence';
import {
  createBackdropStarRandom,
  resolveBackdropStarDraw,
  resolveBackdropTwinkleAlpha,
  resolveBackdropTwinkleSize
} from '../render/backdropStars';
import { drawChipCell, resolveChipGridGeometry } from '../render/chipTileGraphics';
import { PhaserGraphicsTileContext } from '../render/phaserTileContext';
import { MAZER_VIEWPORT_CHANGE_EVENT, readMazerViewportGeometry, syncMazerGameToViewport } from '../boot/viewportGeometry';
import {
  advanceTrailShineState,
  buildContinuousTrailPath,
  resampleTrailVertices
} from '../render/navigationCoreTrail';
import { resolveTrailGridPathWithHead } from '../render/trailHeadPath';
import {
  computeTrailCanvasBounds,
  drawTrailToCanvasContext
} from '../render/navigationCoreTrailCanvas';
import {
  computePlayerGlowCanvasBounds,
  drawPlayerGlowToCanvasContext
} from '../render/navigationCorePlayerGlowCanvas';
import { resolveTeleportAnchorCandidates, type TeleportRect, type TeleportViewportBounds } from '../render/teleportAnchorPose';
import {
  EDGE_STATION_COUNT,
  drawEdgeBeams,
  drawEdgeMarker,
  drawEdgeMarkers,
  resolveEdgeMarkerStates,
  resolveEdgeRingEnergies,
  resolveEdgeStations,
  resolveWrapEndStationIds,
  resolveWrapFlashStationIds,
  type EdgeRingLifecycle,
  type EdgeStation,
  type EdgeWrapFlash
} from '../render/edgeMarkers';
import {
  INTRO_LASER_MS,
  INTRO_POP_MS,
  INTRO_SKIP_GRACE_MS,
  isEdgePathCellShown,
  type IntroState,
  type OutroState,
  OUTRO_HANDOFF_MS,
  OUTRO_PLAYER_REMOVE_MS,
  OUTRO_TRAIL_FADE_MS,
  resolveIntro,
  resolveIntroDeconstruct,
  resolveIntroInputUnlockMs,
  resolveIntroLaserStartMs,
  resolveOutroTilesEndMs,
  resolveSpawnLaser,
  skipIntroElapsedMs
} from '../render/introTimeline';
import {
  selectTeleportPrimaryAnchor,
  type TeleportAnchorId,
  type TeleportAnchorRejection,
  type TeleportAnchorSelectionOutcome
} from '../render/teleportPrimaryAnchor';
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
  copyLegacySettings,
  type LegacySettings
} from '../legacy-runtime/legacyDefaults';
import {
  isLegacyWrappedStepTransition,
  resolveLegacyPlayableShortestPath,
  resolveLegacyShortestPath,
  type LegacyMazeGenerationProfile,
  type LegacyMazeSnapshot,
  type LegacyPoint,
  type LegacyShortestPathResult
} from '../legacy-runtime/legacyMaze';
import { resolveInitialRuntimeMode } from '../legacy-runtime/legacyLaunchMode';
import {
  LEGACY_LEVEL_PREVIEW_CHECKPOINTS,
  LEGACY_LEVEL_PREVIEW_MAX_LEVEL,
  LEGACY_LEVEL_PREVIEW_MIN_LEVEL,
  buildLegacyLevelPreviewExitUrl,
  clampLegacyLevelPreviewLevel,
  createLegacyLevelPreviewAuthSnapshot,
  createLegacyLevelPreviewProgressionState,
  createLegacyLevelPreviewStorage,
  formatLegacyLevelPreviewBadge,
  resolveLegacyLevelPreviewLevel,
  type LegacyLevelPreviewStorage
} from '../legacy-runtime/legacyLevelPreview';
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
  createLegacyRuntimeMazeForMode,
  consumeLegacyGenerationRequestState,
  createLegacyGenerationRequest,
  shouldConsumeLegacyGenerationRequest,
  stepLegacyGenerationSeed,
  type LegacyGenerationMode,
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
  INITIAL_LEGACY_PAGE_VISIBILITY_STATE,
  consumeLegacyResumeFrame,
  isLegacyLifecycleHeld,
  reduceLegacyPageVisibilityOnLeave,
  reduceLegacyPageVisibilityOnReturn,
  resolveLegacyLifecycleHoldMs,
  shouldAutoPauseLegacyRun,
  type LegacyPageLeaveSignal,
  type LegacyPageReturnSignal,
  type LegacyPageVisibilityState
} from '../legacy-runtime/legacyLifecycleHold';
import {
  isLegacyLandscapeViewport,
  resolveLegacyOrientationFlip,
  shouldShowLegacyRotateNotice
} from '../legacy-runtime/legacyOrientationFlip';
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
import { resolveLegacyFrozenElapsedMs } from '../legacy-runtime/legacyPlayHud';
import {
  resolveLegacyPlayerTransferVisualState,
  type LegacyPlayerTransferVisualState
} from '../legacy-runtime/legacyPlayerTransfer';
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
import { resolveLegacyHeaderControlFrame } from '../legacy-runtime/legacyHeaderControl';
import { resolveLegacyMinHitRect } from '../legacy-runtime/legacyHitTarget';
import {
  resolveLegacyTapRecoveryTarget,
  shouldRecoverLegacyTapAfterUiRebuild
} from '../legacy-runtime/legacyUiTapRecovery';
import {
  LEGACY_HEADER_IDENTITY_LABEL_NAME,
  LEGACY_HEADER_IDENTITY_LABEL_PADDING_Y_PX,
  resolveLegacyHeaderIdentityPlacement
} from '../legacy-runtime/legacyHeaderIdentityPlacement';
import {
  LEGACY_UI_COMPACT_BREAKPOINT,
  resolveLegacyOverlayPanelLayout,
  resolveLegacyUiLabelCenterY,
  type LegacyUiLabelRole
} from '../legacy-runtime/legacyUiStandards';
import {
  LEGACY_SETTINGS_SIZES,
  buildLegacySettingsSheetPlan,
  isLegacySettingsItemFullyVisible,
  resolveLegacySettingsItemScreenRect,
  type LegacySettingsCommand,
  type LegacySettingsContext,
  type LegacySettingsPlanItem,
  type LegacySettingsRect,
  type LegacySettingsSheetPlan
} from '../legacy-runtime/legacySettingsSheetPlan';
import {
  IDLE_LEGACY_QUIT_CONFIRM_STATE,
  hasLegacyQuitConfirmExpired,
  isLegacyQuitConfirmArmed,
  pressLegacyQuitConfirm,
  type LegacyQuitConfirmState
} from '../legacy-runtime/legacyQuitConfirm';
import {
  buildLegacyGuideSheetModel,
  type LegacyGuideGlyph,
  type LegacyGuideIconSpec
} from '../legacy-runtime/legacyGuideContent';
import {
  LEGACY_GUIDE_SHEET_SIZES,
  buildLegacyGuideSheetPlan,
  resolveLegacyGuideKeyboardLineHeight,
  resolveLegacyGuideRowHeight
} from '../legacy-runtime/legacyGuideSheetPlan';
import {
  INITIAL_LEGACY_PROGRESSION_RESET_STATE,
  LEGACY_PROGRESSION_RESET_ARM_DELAY_MS,
  LEGACY_PROGRESSION_RESET_COPY,
  applyLegacyProgressionResetLocalEffects,
  buildLegacyProgressionResetConfirmView,
  classifyLegacyProgressionResetFailure,
  reduceLegacyProgressionReset,
  resolveLegacyProgressionResetStatusLine,
  resolveLegacyProgressionResetStrategy,
  type LegacyProgressionResetEvent,
  type LegacyProgressionResetState,
  type LegacyProgressionResetStrategy
} from '../legacy-runtime/legacyProgressionResetFlow';
import {
  isLegacyGlyphWordRenderable,
  resolveLegacyGlyphWordColumns,
  resolveLegacyGlyphWordLayout,
  resolveLegacyMenuPathTitleLayout,
  resolveLegacyMenuTitleFontSize,
  resolveLegacyMenuTitlePresentation,
  type LegacyGlyphWordLayout,
  type LegacyMenuPathTitleCell
} from '../legacy-runtime/legacyMenuTitle';
import {
  LEGACY_MENU_BACKDROP_STAR_MOTION,
  LEGACY_MENU_STAR_COUNT,
  advanceLegacyMenuBackdropStars,
  createLegacyMenuBackdropStars,
  resolveLegacyMenuBackdropPalette,
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
  scrubRemovedCameraZoomFromGameToggleStorage,
  writeLegacyGameToggleSettings
} from '../legacy-runtime/legacyGameTogglePreferences';
import {
  LEGACY_HAPTIC_PATTERNS,
  triggerLegacyHaptic,
  type LegacyHapticPattern
} from '../legacy-runtime/legacyHaptics';
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
  compareLegacyProgressionOrdinals,
  createEmptyLegacyProgressionState,
  readLegacyProgressionState,
  recordLegacyProgressionCycle,
  resolveLegacyMazeGenerationProfileForProgression,
  resolveLegacyProgressionGenerationScale,
  resolveLegacyProgressionLevel,
  resolveLegacyProgressionOrdinalSeedComponent,
  resolveLegacyProgressionPalette,
  resolveLegacyProgressionScaleDetail,
  resolveLegacyProgressionTrackIdForSurface,
  summarizeLegacyProgressionDiagnostics,
  writeLegacyProgressionState,
  type LegacyProgressionDiagnostics,
  type LegacyProgressionGenerationScaleOptions,
  type LegacyProgressionPalette,
  type LegacyProgressionState,
  type LegacyProgressionTrackId
} from '../legacy-runtime/legacyProgression';
import { resolveLegacyGenerationTrack } from '../legacy-runtime/legacyMenuDemoTrack';
import {
  LEGACY_USERNAME_PATTERN,
  checkLegacyUsernameAvailable,
  clearLegacyPasswordRecoveryUrl,
  createEmptyLegacyAuthFormState,
  createLegacyAuthScopedStorage,
  createLegacyGuestAuthSnapshot,
  readLegacyAccountUsername,
  readLegacyAuthSessionSnapshot,
  readLegacyRememberedIdentity,
  readLegacyRememberedIdentityState,
  readLegacyPasswordRecoveryBootUrlState,
  normalizeLegacyAuthEmail,
  resolveLegacyPasswordRecoveryEnterAction,
  resolveLegacyPasswordUpdateSubmitState,
  resolveLegacyAuthInvalidFields,
  resolveLegacyAuthScopedStorageKey,
  resolveLegacyAuthSubmitState,
  saveLegacyAccountUsername,
  signInLegacyAuth,
  signOutLegacyAuth,
  signUpLegacyAuth,
  subscribeLegacyAuthState,
  syncLegacyRememberedIdentityFromAuthenticatedSession,
  updateLegacyPassword,
  writeLegacyRememberedIdentity,
  type LegacyAuthFieldId,
  type LegacyAuthFormState,
  type LegacyAuthSessionSnapshot,
  type LegacyAuthStatus
} from '../legacy-runtime/legacyAuth';
import {
  MAZER_OAUTH_SAFE_ERROR_MESSAGE,
  beginMazerOAuthAuthorization,
  installMazerOAuthPageShowRecovery,
  navigateToMazerAccountPortal,
  navigateToMazerLegalPortal
} from '../legacy-runtime/legacyAccountPortal';
import {
  createLegacyPasswordRecoveryState,
  resolveLegacyPasswordRecoveryEntry,
  resolveLegacyPasswordRecoveryPresentation,
  type LegacyPasswordRecoveryState
} from '../legacy-runtime/legacyAuthPresentation';
import { resolveLegacyAuthInputCssRect } from '../legacy-runtime/legacyAuthInputGeometry';
import {
  fetchLegacyLeaderboardPage,
  fetchLegacyLeaderboardSelfRank,
  type LegacyLeaderboardEntry,
  type LegacyLeaderboardSelfRank
} from '../legacy-runtime/legacyLeaderboard';
import {
  buildLegacyLeaderboardOverlayPlan,
  resolveLegacyLeaderboardRowScreenRect,
  type LegacyLeaderboardOverlayPlan
} from '../legacy-runtime/legacyLeaderboardOverlayPlan';
import {
  buildLegacyLeaderboardViewModel,
  resolveLegacyLeaderboardRequest,
  resolveLegacyLeaderboardTierColor,
  LEGACY_LEADERBOARD_COPY,
  type LegacyLeaderboardActionId,
  type LegacyLeaderboardStateKind,
  type LegacyLeaderboardUsernameGate,
  type LegacyLeaderboardViewModel,
  type LegacyLeaderboardViewState
} from '../legacy-runtime/legacyLeaderboardView';
import { readLegacyLeaderboardFixtureShape } from '../legacy-runtime/legacyLeaderboardFixture';
import {
  LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS,
  buildLegacyAuthScreenViewModel,
  resolveLegacyAuthLoadingCopy,
  resolveLegacyAuthScreenLayout,
  type LegacyAuthScreenLink,
  type LegacyAuthScreenRect
} from '../legacy-runtime/legacyAuthScreenView';
import {
  hasLegacyStoredAuthSession,
  resolveLegacyAuthGateInitialState
} from '../legacy-runtime/legacyAuthGateResolution';
import {
  LEGACY_GUEST_PLAY_ACCESS_ENABLED,
  isLegacyPlayAccessAllowed
} from '../legacy-runtime/legacyGuestAccess';
import {
  LEGACY_AUTH_MESSAGE_COPY,
  LEGACY_REMOTE_MESSAGE_COPY,
  createLegacyPlayerMessage,
  enqueueLegacyPlayerMessage,
  resolveLegacyUsernameSaveFailureMessage,
  type LegacyUsernameSaveFailureKind,
  expireLegacyPlayerMessageQueue,
  isLegacyOAuthFailureCopy,
  resolveLegacyAuthFeedbackMessage,
  resolveLegacyOAuthFailureCopy,
  resolveLegacyPasswordRecoveryError,
  resolveLegacyAuthValidationMessage,
  type LegacyQueuedPlayerMessage,
  type LegacyPlayerMessage
} from '../legacy-runtime/legacyPlayerMessage';
import { resolveLegacyPlayerMessageToastFrame } from '../legacy-runtime/legacyPlayerMessageToast';
import {
  hydrateLegacyRemoteAccountState,
  isLegacyRuntimeDiagnosticsAuthFixtureRoute,
  isLegacyRemoteAccountProviderEligible,
  isLegacyRemoteProgressionEnabled,
  isLegacyRemoteCompletionContextCurrent,
  LEGACY_RUNTIME_DIAGNOSTICS_AUTH_FIXTURE_USER_ID,
  readLegacyBootstrappedAccountState,
  readLegacyBootstrappedAuthSnapshot,
  replayLegacyRemoteCompletions,
  writeLegacyRemoteCompletion,
  writeLegacyRemoteProgressionState,
  writeLegacyRemoteSettings,
  type LegacyRemoteProgressionSyncResult
} from '../legacy-runtime/legacyRemoteProgression';
import {
  createLegacyOfflineCompletionFlush,
  type LegacyOfflineCompletionFlush
} from '../legacy-runtime/legacyOfflineCompletionFlush';
import {
  clampLegacyOverlayScrollOffset,
  resolveLegacyOverlayScrollMetrics,
  type LegacyOverlayScrollMetrics,
  type LegacyOverlayScrollRect
} from '../legacy-runtime/legacyOverlayScroll';
import {
  formatLegacyMovementSpeedPercent,
  normalizeLegacyMovementSpeed,
  resolveLegacyMovementSpeedProfile,
  scaleLegacyMovementDelayMs
} from '../legacy-runtime/legacyMovementSpeed';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig,
  resolveLegacyPointFromDemoIndex,
} from '../legacy-runtime/legacyDemoWalker';
import {
  resolveLegacyBleedOffDockVisualEligibility,
  resolveLegacyMenuBorderDockDirections,
  resolveLegacyMenuBorderDockRenderFrames,
  resolveLegacyMenuBorderDockRenderAreas,
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
import {
  UiLegacyBridge,
  type LegacyRuntimeFacts,
  type UiLegacyBridgeAdapter,
  type UiLegacyBridgeDiagnostics,
  type UiLegacyBridgeDispatchResult
} from '../state/uiLegacyBridge';
import type { UiStateSnapshot } from '../state/uiState';
import type { UiViewModels } from '../state/uiViewModels';
import type { UiCommand } from '../state/uiCommands';
import { PLATFORM_PROFILES, type UiPlatformProfile } from '../state/uiProfiles';
import { dismissInstallSurface, getInstallSurfaceState, promptInstallSurface } from '../boot/installSurface';

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
    implicitZoomApplied: false;
    renderBounds: VisualRect;
    renderSafeInset: number;
    safeBounds: VisualRect;
    pathVisualStyle: LegacyPathVisualStyle;
    tileSize: number;
    visualScale: {
      x: number;
      y: number;
    };
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
    completionSyncState: LegacyRemoteProgressionSyncResult['completionSyncState'] | null;
    lastError: string | null;
    lastMessage: LegacyPlayerMessage | null;
    lastSkippedReason: LegacyRemoteProgressionSyncResult['skippedReason'] | null;
    lastSynced: boolean | null;
    pendingCompletionCount: number;
    recoveredCompletionCount: number;
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
    playerTransfer: LegacyPlayerTransferVisualState;
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
  invalidFields: LegacyAuthFieldId[];
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

// Wave 4D-B QA-only diagnostic surface: exercises the REAL Teleport System
// v1 primary-anchor selector (src/render/teleportPrimaryAnchor.ts) and pose/
// clearance adapter (src/render/teleportAnchorPose.ts) against this scene's
// own real layout, safe-area, and HUD-control geometry, and energizes the
// selected identity's station in the ONE procedural edge-marker system
// (render/edgeMarkers.ts) -- there is no separate preview/shell art any more.
// See resolveLegacyTeleportAnchorPreviewResult. This is staging for real
// Teleport integration only.
//
// This is a bounded PREVIEW SESSION, not a stateless probe: calling
// previewTeleportPrimaryAnchor again with the same target/layout still
// legally eligible retains the previously selected anchor (the real
// selector's own retention rule), matching how a real transfer would keep
// its primary through outbound/stored/delivering. Pass newSession: true to
// deliberately start a fresh selection instead (a genuinely new transfer).
interface LegacyTeleportAnchorPreviewResult {
  outcome: TeleportAnchorSelectionOutcome;
  selectedId: TeleportAnchorId | null;
  reason: string;
  rejected: ReadonlyArray<TeleportAnchorRejection>;
  /** Real-space pose of the selected anchor, or null when outcome is 'unavailable'/'invalid-input'. */
  pose: {
    anchorX: number;
    anchorY: number;
    rotation: number;
    portX: number;
    portY: number;
    footprint: TeleportRect;
  } | null;
}

// Real, measured frame-time evidence for Navigation Core v1's continuous
// trail (Wave 4D-A's own frame-time measurement requirement) -- populated
// at the end of every drawLegacyContinuousPlayTrail call, not estimated.
// vertexCountBeforeResample/afterResample and strokeSegmentCount answer
// "how much geometry" (a long visible route should scale these up
// predictably); geometryBuildMs/drawMs/totalMs answer "how long did it
// actually take" this frame, for a caller to aggregate p50/p95/max over a
// real capture window.
interface LegacyTrailPerfDiagnostics {
  vertexCountBeforeResample: number;
  vertexCountAfterResample: number;
  strokeSegmentCount: number;
  geometryBuildMs: number;
  drawMs: number;
  totalMs: number;
  totalLengthPx: number;
  tileSize: number;
  shineEnabled: boolean;
  trailFadeEnabled: boolean;
}

interface LegacyQaDiagnosticsApi {
  movePlayPlayer(move: string): LegacyQaMoveResult;
  getTrailPerfDiagnostics(): LegacyTrailPerfDiagnostics | null;
  /** Player-facing Settings action; the internal overlay id remains options. */
  openSettingsOverlay(): LegacyQaOverlayResult;
  openOptionsOverlay(): LegacyQaOverlayResult;
  openPauseOverlay(): LegacyQaOverlayResult;
  startGuestPlayMode(): LegacyQaOverlayResult;
  startPlayMode(): LegacyQaOverlayResult;
  // Wave 3A bridge QA surface -- calls the same live UiLegacyBridge instance
  // the real scene uses, not a test-only duplicate.
  getUiStateSnapshot(): UiStateSnapshot | null;
  getUiViewModels(): UiViewModels | null;
  dispatchUiCommand(command: unknown): UiLegacyBridgeDispatchResult;
  getUiBridgeDiagnostics(): UiLegacyBridgeDiagnostics | null;
  // Wave 4D-B QA-only Teleport anchor-pose preview -- see
  // LegacyTeleportAnchorPreviewResult's own comment above.
  previewTeleportPrimaryAnchor(targetX: number, targetY: number, newSession?: boolean): LegacyTeleportAnchorPreviewResult;
  endTeleportPrimaryAnchorPreview(): void;
  // Exposes the REAL production wrap-aware solver (resolveLegacyPlayableShortestPath,
  // the same one this scene's own AI/telemetry code already calls) to
  // external real-browser test/evidence scripts, so they drive a genuine
  // shortest route rather than maintaining their own separate (and, until
  // this method existed, non-wrap-aware) BFS -- review 5146800659's own
  // request, continuing 5144999445. From is the real current player
  // position by default; to is always the real current goal.
  resolveShortestPathToGoal(from?: LegacyPoint): LegacyShortestPathResult;
  // Retired with the old diamond/conduit presentation (the one procedural edge
  // system replaced it): always null, kept so external QA scripts do not throw.
  getGameplayTransferPresentationDiagnostics(): null;
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
const LEGACY_AUTH_UI_FONT_FAMILY = '"Segoe UI Variable", "Helvetica Neue", Arial, sans-serif';
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
// Player message toast: above the auth gate so errors raised on it stay readable.
const LEGACY_PLAYER_MESSAGE_TOAST_DEPTH = LEGACY_AUTH_GATE_LOADING_DEPTH + 10;
const LEGACY_PLAYER_MESSAGE_TOAST_ROW_POOL = 3;
// Mirrors Fitness's own login-pending timeout: if the Supabase call never
// settles (seen live -- the button flips to "Working" and never recovers,
// with no thrown error to catch), the submit button must still come back
// to life so the player isn't permanently stuck. A late response that
// eventually does arrive is still applied when it lands (see
// handleLegacyAuthSubmit's attempt-id guard) -- this only bounds how long
// the UI waits before letting the player try again.
const LEGACY_AUTH_SUBMIT_TIMEOUT_MS = 12000;
const LEGACY_AUTH_BOTTOM_FEEDBACK_DURATION_MS = 5000;
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
// Shared by the Options/Pause overlay's Account ring (drawLegacyProfileIcon)
// and its own Home button's ring (the Home button is gone; Pause is now a card)
// -- previously two independently hand-copied formulas that could silently
// drift apart despite existing specifically to make those two icons read as
// a matched pair. Restrained consistency pass (owner-directed refinement,
// not a reversal of the original ring-vs-no-ring split): the menu header's
// own bare-glyph treatment and the overlay's ringed treatment are both kept
// -- the compact 3-icon menu row and the paired Account/Home overlay row
// have different real layout needs -- but the ring itself was bold enough
// (a wide, near-opaque stroke) to read as a genuinely different icon family
// rather than a restrained accent on the same glyph, which is what drove
// the "not the same... set up" report. Toned down (thinner stroke, softer
// alpha) so the glyph/color/texture stay the visually dominant, consistent
// element across Menu/Options/Pause, and the ring reads as a light halo
// tying Account+Home together rather than a competing badge outline. The
// ring carries no state of its own (confirmed: it's the same idle pulse
// regardless of auth/session status) -- there is no meaning to preserve
// beyond the pairing itself, which this keeps.
const LEGACY_OVERLAY_ICON_RING_WIDTH_RATIO = 0.06;
const LEGACY_OVERLAY_ICON_RING_ALPHA_FACTOR = 0.5;
const LEGACY_MENU_PATH_TITLE_SHADOW = cyberArcadeMaterial.substrate.shadow;
const LEGACY_MENU_PATH_TITLE_ACCENT = cyberArcadeMaterial.signal.player;
const LEGACY_MENU_PATH_TITLE_PRISM = cyberArcadeMaterial.rail.cyan;
const LEGACY_MENU_PATH_TITLE_RUNE = cyberArcadeMaterial.signal.start;
const LEGACY_MENU_PATH_TITLE_GEM = cyberArcadeMaterial.signal.playerAccent;
const LEGACY_MENU_PATH_TITLE_FACET_WARM = cyberArcadeMaterial.signal.warning;
const LEGACY_MENU_PATH_TITLE_SWEEP_MS = 2600;
const LEGACY_MENU_PATH_TITLE_SWEEP_OVERSCAN_COLUMNS = 3;
const LEGACY_MENU_PATH_TITLE_GEM_PULSE_MS = 3400;
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
const LEGACY_PLAY_WALL_FILL = cyberArcadeMaterial.substrate.field;
const LEGACY_PLAY_WALL_GLASS_ALPHA = 0.18;
// Navigation Core v1's continuous play trail (src/render/navigationCoreTrail.ts) --
// every ratio taken from the frozen reference where it gives one (16% width,
// tile*0.3 player trim); the rest (color cycle pacing, shine speed, quiet-gap
// length) are this integration's own reasonable choices where the reference
// only describes the qualitative behavior, documented here rather than left
// as unexplained magic numbers.
const LEGACY_PLAY_TRAIL_WIDTH_RATIO = TRAIL_WIDTH_RATIO;
// Dark underlay beneath the trail on the Chip floor (amendment open item A8): bg.canvas at this alpha, a pad
// of at least this many css px each side of the core (it widens with the core, see resolveTrailWidths).
// Width, underlay, core lift and fade floor live in src/render/trailLegibility.ts;
// tests/render/trailLegibility.test.ts pins every energy stop's contrast against the real chip, rim and gap.
const LEGACY_TRAIL_UNDERLAY_ALPHA = TRAIL_UNDERLAY_ALPHA;
const LEGACY_TRAIL_UNDERLAY_PAD_CSS = TRAIL_UNDERLAY_PAD_MIN_CSS;
// Amendment 6.2's neon-tube glow refinement: a soft outer spectral glow
// pass drawn from the same canonical geometry/color as the crisp core,
// wider but bounded well under the player/goal markers' own glow alpha
// (compare PLAYER_MARKER.glow.wideAlpha, src/render/playerMarker.ts) so
// the trail never reads brighter than the things it's leading to. Both
// ratios scale with tileSize like everything else here, so the glow stays
// a crisp accent rather than a blurred bar at compact/mobile tile sizes.
// OWNER-AUTHORIZED VISUAL AMENDMENT (2026-09-09, with the calmer
// NAVIGATION_CORE_TRAIL_ENERGY_STOPS palette): dropped from 0.22 -> 0.15
// so the glow reads as a soft halo supporting the crisp core rather than
// a wide translucent wash bleeding across the corridor floor. Still
// scales with tileSize like everything else here.
const LEGACY_PLAY_TRAIL_GLOW_ALPHA_RATIO = TRAIL_GLOW_ALPHA_RATIO;
const LEGACY_PLAY_TRAIL_CORNER_RADIUS_RATIO = 0.16;
const LEGACY_PLAY_TRAIL_PLAYER_TRIM_RATIO = 0.3;
// OWNER-AUTHORIZED VISUAL AMENDMENT (direct product-owner instruction, 2026-11-10: "the player trail
// should be iridescent like midnight sun type color color shifting and it should have a pulse too").
// Supersedes the 2026-09-09 calm blue/violet energy palette: the trail is now an oil-slick / aurora sweep
// (cyan, sky blue, violet, orchid, apricot) that shifts along its length and slowly over time, with a
// travelling brightness pulse and a gentle breath. The palette, the pulse and their contrast contract live
// in src/render/trailIridescence.ts (pure, no allocation, reduced motion freezes it to a static gradient);
// the shared 4D-A module src/render/navigationCoreTrail.ts and the frozen reference are untouched.
// Fine resampling interval for color/alpha continuity -- see
// resampleTrailVertices's own header for why Canvas-mode Phaser Graphics
// needs this at all (no per-vertex gradient stroke).
const LEGACY_PLAY_TRAIL_RESAMPLE_INTERVAL_PX = 4;
// The frozen reference's own numbers: shine body ~9.5% of visible path
// length, whole-shine fade-in/fade-out over ~4% of the PATH'S TOTAL
// length (travel envelope) -- not 4% of the shine's own ~9.5% body. That
// distinction matters: 0.095 * 0.04 would be 0.38% of the path, ~10x too
// short, and reads as an on/off flick instead of a smooth emerge/vanish.
// See advanceTrailShineState's own TrailShineOptions.travelEnvelopeRatio.
const LEGACY_PLAY_TRAIL_SHINE_LENGTH_RATIO = 0.095;
const LEGACY_PLAY_TRAIL_SHINE_TRAVEL_ENVELOPE_RATIO = 0.04;
// Additional quiet-interval length once the shine reaches the player, as a
// fraction of the trail's own current length, before it restarts at the
// origin -- the reference asks for "a quiet interval" without giving an
// exact number.
const LEGACY_PLAY_TRAIL_SHINE_QUIET_GAP_RATIO = 0.35;
const LEGACY_PLAY_TRAIL_SHINE_SPEED_TILES_PER_SEC = 4.2;
// Below this trail length (in tiles), suppress the shine entirely rather
// than an unstable sliver or a rapid, distracting loop -- the frozen
// contract's explicit "very short trail" case.
const LEGACY_PLAY_TRAIL_SHINE_MIN_TILES = 3;
const LEGACY_PLAY_TRAIL_SHINE_HIGHLIGHT_COLOR = 0xffffff;
const LEGACY_PLAY_TRAIL_AGE_ALPHA_MIN = TRAIL_FADE_ALPHA_MIN;
const LEGACY_PLAY_TRAIL_AGE_ALPHA_MAX = 1;
const LEGACY_PATH_TILE_CUE_COLOR = cyberArcadeMaterial.path.edge;
const LEGACY_PATH_TILE_CUE_ALPHA = 0.42;
const LEGACY_PATH_CONNECTOR_SEAM_PAD_RATIO = 0.16;
const LEGACY_PATH_CONNECTOR_SEAM_EDGE_ALPHA_RATIO = 0.72;
const LEGACY_PATH_CONNECTOR_SEAM_CORE_ALPHA_RATIO = 0.94;
const LEGACY_BOARD_MAZE_SAFE_INSET_RATIO = 0.018;
const LEGACY_BOARD_MAZE_SAFE_INSET_MIN = 4;
const LEGACY_BOARD_MAZE_SAFE_INSET_MAX = 7;
// Bleed-off/wrap corridors are just a small strip past the board's own
// edge -- easy to miss. A soft pulse travels from where the corridor meets
// the grid (progress 0) out to the true screen edge (progress 1), fading in
// and out via the sine envelope so the loop has no visible seam, instead of
// snapping back to the start mid-brightness.
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
const LEGACY_PLAY_TRAIL_PULSE_FRAME_INTERVAL_MS = 33;
const LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT = 2;
const LEGACY_PLAY_TOUCH_STICK_ANCHOR_ORBIT_MS = 3200;
const LEGACY_PLAY_STICK_RETARGET_STEP_MS = 32;
const LEGACY_PLAY_STICK_RETARGET_RESCHEDULE_GRACE_MS = 16;
// Stick caps follow the same owner-requested step-rate factor as the profile, or stick players would see no change.
const LEGACY_PLAY_STICK_INITIAL_DELAY_MAX_MS = scaleLegacyMovementDelayMs(144);
const LEGACY_PLAY_STICK_REPEAT_INTERVAL_MAX_MS = scaleLegacyMovementDelayMs(104);
const LEGACY_PLAY_STICK_TURN_DELAY_MAX_MS = scaleLegacyMovementDelayMs(144);
// Diagnostics only (markerStyle.playerCoreRadius / playerHaloRadius): the diamond-era radius ratios the runtime
// diagnostics have always reported. The marker itself is drawn from src/render/playerMarker.ts (one shape for the
// human player, the menu demo's AI and the Guide icon), not from these.
const LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO = 0.46;
const LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO = 0.72;
const LEGACY_PLAY_PLAYER_BEACON_COLOR = cyberArcadeMaterial.signal.player;
const LEGACY_PLAY_PLAYER_BEACON_ACCENT = cyberArcadeMaterial.signal.playerAccent;
const LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS = 1150;
const LEGACY_PLAY_START_MARKER_CORE = cyberArcadeMaterial.signal.start;
const LEGACY_PLAY_START_MARKER_EDGE = cyberArcadeMaterial.signal.startEdge;
const LEGACY_PLAY_GOAL_MARKER_CORE = cyberArcadeMaterial.signal.goal;
const LEGACY_PLAY_GOAL_MARKER_EDGE = cyberArcadeMaterial.signal.goalEdge;
// Colour-cycle period of the dot-matrix wordmarks (drawLegacyGlyphWordTileBlock). The goal marker no
// longer rotates: Chip draws it as a static badge with an optional ring-alpha pulse.
const LEGACY_GOAL_STAR_RING_SPIN_PERIOD_MS = 5200;
// Wordmark chips: the fill keeps nearly all of the rainbow hue (a small pull toward the canvas), and
// the one lit rim is the same hue lightened toward white, so small cells stay solid and legible.
const LEGACY_WORDMARK_CHIP_FILL_CANVAS_MIX = 0.12;
const LEGACY_WORDMARK_CHIP_RIM_LIGHTEN = 0.4;
// One frame's worth of defer (at 60fps) for the goal-reached maze precompute
// (applyLegacyWorldTurnPlayerMovement) -- just enough for the arrival
// frame's render to happen before the still-blocking build runs, with
// enormous margin left in the 340ms ACTIVE_PLAY_GOAL_RESET_HOLD_MS window
// this needs to finish inside. See that call site's own comment.
const LEGACY_PLAY_GOAL_DECONSTRUCT_PRECOMPUTE_DEFER_MS = 16;
// Comfortably covers every string this renders today (level numbers are at
// most a handful of digits) with real headroom.
const LEGACY_TILE_FONT_GLYPH_POOL_SIZE = 8;
// The literal "MAZER" wordmark, rendered with the real tile-font raster
// asset (see drawLegacyMenuPathTitle) instead of the maze-path dot-cell
// glyph it used to be drawn from exclusively.
const LEGACY_TITLE_WORD = 'MAZER';
// "MAZER", "START", and "LOGIN" are all exactly 5 characters -- covers the
// title wordmark and both primary front-door button labels with no waste.
const LEGACY_WORDMARK_TILE_FONT_GLYPH_POOL_SIZE = 5;
// drawLegacyWordmarkAmbientSparkles: how many independent sparkle "slots"
// twinkle around a wordmark's outside edge, how long (roughly) each slot's
// own appear/vanish cycle takes, and what fraction of that cycle it spends
// actually visible (centered pulse, eased in/out either side) -- see that
// method's own header comment for the full random-position/twinkle design.
const LEGACY_WORDMARK_SPARKLE_COUNT = 9;
const LEGACY_WORDMARK_SPARKLE_CYCLE_MS = 2400;
const LEGACY_WORDMARK_SPARKLE_PULSE_HALF_WIDTH = 0.22;
// Sizes the two dead-but-still-allocated raster tile-font Image pools
// (titleTileFontImagePool, and the per-button pool created in createButton)
// -- both are always hidden now that title/Start/Login/the level number all
// render through drawLegacyGlyphWordTileBlock instead (see that method's
// own header comment for why: the raster atlas could only ever be cropped
// into chunks, never actually sampled as one repeatable square tile).
const LEGACY_TILE_FONT_SUB_TILE_COLUMNS = 4;
const LEGACY_TILE_FONT_SUB_TILE_ROWS = 5;
const LEGACY_TILE_FONT_TILES_PER_GLYPH = LEGACY_TILE_FONT_SUB_TILE_COLUMNS * LEGACY_TILE_FONT_SUB_TILE_ROWS;
// Real HUD icon source art (see docs/assets/mazer-vfx-source-provenance.md):
// three 1254x1254 transparent PNGs, each with a different amount of
// transparent padding baked in around its own glyph. Measured directly from
// each file's alpha channel with a visibility threshold of alpha > 1, not
// eyeballed. Alpha == 1 contains a sparse wide noise envelope that is
// invisible at HUD scale but would shrink the actual glyph by almost half.
// applyLegacyHudIconFrame below crops to these meaningful visible bounds and
// scales uniformly off the LONGER of the two, so a `desiredSize` passed by any
// caller means the same optical size regardless of which icon it is.
interface LegacyHudIconSourceMetrics {
  bboxHeight: number;
  bboxWidth: number;
  bboxX: number;
  bboxY: number;
}
const MAZER_HUD_PROFILE_ICON_METRICS: LegacyHudIconSourceMetrics = { bboxHeight: 729, bboxWidth: 615, bboxX: 320, bboxY: 268 };
const MAZER_HUD_LEADERBOARD_ICON_METRICS: LegacyHudIconSourceMetrics = { bboxHeight: 524, bboxWidth: 692, bboxX: 281, bboxY: 359 };
const MAZER_HUD_SETTINGS_ICON_METRICS: LegacyHudIconSourceMetrics = { bboxHeight: 828, bboxWidth: 807, bboxX: 221, bboxY: 204 };
// Wave 4D-B QA-only Teleport anchor-pose preview: the logical anchor footprint
// side (32 px) the pure pose/clearance resolver is asked about. Nothing is
// rendered at this size any more; the diamonds are the procedural kites.
const TELEPORT_ANCHOR_PREVIEW_SHELL_CANVAS_SIDE_PX = 32;
// resolveTeleportAnchorPoses's own inset default (2px) lets a ~32px footprint
// bleed off-canvas at a corner. The footprint's rotated-square bound grows up
// to SIDE * sqrt(2) at a 45-degree-facing rotation, so half of THAT worst case
// is the minimum inset that keeps the whole footprint inside the viewport at
// every target-facing angle.
const TELEPORT_ANCHOR_PREVIEW_VIEWPORT_INSET_PX = (TELEPORT_ANCHOR_PREVIEW_SHELL_CANVAS_SIDE_PX * Math.SQRT2) / 2;

const LEGACY_MENU_AI_MEMORY_OPTION_CORE = cyberArcadeMaterial.signal.memory;
const LEGACY_MENU_AI_MEMORY_OPTION_EDGE = cyberArcadeMaterial.rail.mint;
// The build/deconstruct/arrival cadence is NOT defined here any more: it is a
// pure function of elapsed time in src/render/introTimeline.ts (see
// resolveIntro / resolveIntroDeconstruct). Only the preroll window used by the
// title wipe and the pre-existing handoff beat remain scene-local.
const LEGACY_MENU_STATIC_BUILD_PREROLL_BURST_MS = 500;
const LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS = OUTRO_HANDOFF_MS;
const LEGACY_MENU_DECONSTRUCT_PLAYER_REMOVE_MS = OUTRO_PLAYER_REMOVE_MS;
const LEGACY_MENU_DECONSTRUCT_TRAIL_FADE_MS = OUTRO_TRAIL_FADE_MS;
// Mirrors ACTIVE_PLAY_GOAL_RESET_HOLD_MS's own value and purpose exactly
// (legacyPlayLifecycle.ts), for the menu demo's own goal-arrival precompute
// -- see updateMenuDemo's own comment on pendingMenuDemoDeconstructArmAtMs
// for why the demo walker needed its own hold instead of reusing that
// constant's mechanism directly (a different, DOM-free state machine with
// no shared request/consume plumbing to play mode's).
const LEGACY_MENU_DEMO_GOAL_RESET_HOLD_MS = 340;
// The one spawn laser (beam travel, then the landing poof the marker pops in
// under) shares its clock with the intro timeline.
const LEGACY_PLAYER_SPAWN_BEAM_TRAVEL_MS = INTRO_LASER_MS;
const LEGACY_PLAYER_SPAWN_FLASH_MS = INTRO_POP_MS;
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

export class MenuScene extends Phaser.Scene {
  private settings: LegacySettings = copyLegacySettings(LEGACY_DEFAULTS);
  private optionFieldDrafts: LegacyOptionFieldDrafts = createLegacyOptionFieldDrafts(LEGACY_DEFAULTS);
  private activeInputField: LegacyOptionFieldId | null = null;
  private authSnapshot: LegacyAuthSessionSnapshot = createLegacyGuestAuthSnapshot();
  // Game-loop frame in which rebuildUi last recreated the buttons. Phaser's
  // hit-test list lags a rebuild by a step (see legacyUiTapRecovery.ts), so a
  // tap processed right after one is routed by recoverTapAfterUiRebuild.
  private uiRebuiltAtFrame: number | null = null;
  // See create()'s boot-mode handling -- true only when the URL asked to
  // launch straight into play (e.g. the "Play Mazer" home-screen shortcut)
  // but boot deferred that until the real auth session resolves instead of
  // racing it. Consumed once in applyLegacyAuthSnapshot.
  private pendingBootPlayStart = false;
  // Login is the default entry boundary. A player may explicitly choose the
  // local guest lane from that screen, but an unresolved/signed-out snapshot
  // must never silently turn into game access just because the local guest
  // runtime exists.
  // authGateAwaitingResolution covers the real async gap before
  // the very first snapshot arrives (avoids a false "please sign in" flash
  // for a returning player who actually has a valid session -- the default
  // snapshot before that first resolution is 'guest', indistinguishable
  // from a genuinely signed-out player without this flag). authGateLocked
  // is the actual gate: true until a valid account session arrives or the
  // player has pressed the explicit local-guest action for this runtime.
  // It intentionally resets on reload; guest play is not an implicit
  // replacement for account entry.
  private authGateAwaitingResolution = true;
  private authGateLocked = false;
  private guestPlayGranted = false;
  private authGateGraphics!: Phaser.GameObjects.Graphics;
  private playerMessageToastGraphics!: Phaser.GameObjects.Graphics;
  private playerMessageToastTexts: Phaser.GameObjects.Text[] = [];
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
  private passwordRecoveryState: LegacyPasswordRecoveryState = createLegacyPasswordRecoveryState();
  private passwordRecoveryUrlState = readLegacyPasswordRecoveryBootUrlState();
  private passwordRecoveryFeedback: string | null = null;
  private activeAuthField: LegacyAuthFieldId | null = null;
  private authNativeInput: HTMLInputElement | null = null;
  private authNativeInputField: LegacyAuthFieldId | null = null;
  private authNativeInputHandler: ((event: Event) => void) | null = null;
  private authNativeKeyDownHandler: ((event: KeyboardEvent) => void) | null = null;
  private authPasswordVisible = false;
  private authAccountHydrationSequence = 0;
  private authSubmitting = false;
  // OAuth hand-off bookkeeping for the bounded `Opening…` dock label: -1 =
  // started, not yet stamped by update(); null = no hand-off in flight.
  private authOpeningStartedAtMs: number | null = null;
  private authOpeningTimedOut = false;
  // True only when the gate was raised because a session is being resolved
  // (see legacyAuthGateResolution.ts); drives the loading-cover copy.
  private authGateHasSessionEvidence = false;
  private authSubmitAttemptId = 0;
  private authInvalidFields: ReadonlySet<LegacyAuthFieldId> = new Set();
  // Check-only (never auto-saves -- there's no account to save to yet
  // until sign-up actually succeeds). A signup with a checked-available
  // username saves it right after account creation in
  // applyLegacyAuthSubmitResult; anything else (empty, unchecked, taken,
  // invalid) is silently skipped and can be set later from the account
  // screen instead.
  private authUsernameStatus: 'available' | 'checking' | 'error' | 'idle' | 'taken' = 'idle';
  private authUsernameSequence = 0;
  private authUsernameDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private menuLeaderboardActive = false;
  private menuProfileActive = false;
  // Pause card: the collapsible Settings section (collapsed on every open).
  private pauseSettingsExpanded = false;
  // Level Preview (dev/QA route ?previewLevel=N; see legacyLevelPreview.ts).
  // Null on every ordinary boot. When set, the scene runs against an
  // in-memory sandbox storage and the remote-ineligible fixture session, so
  // nothing reaches the real account, progression keys or Supabase.
  private levelPreviewLevel: number | null = null;
  private levelPreviewStorage: LegacyLevelPreviewStorage | null = null;
  private previewLevelsExpanded = false;
  private leaderboardStatus: 'empty' | 'error' | 'idle' | 'loading' | 'ready' = 'idle';
  private leaderboardErrorMessage: string | null = null;
  private leaderboardEntries: readonly LegacyLeaderboardEntry[] = [];
  private leaderboardSelfRank: LegacyLeaderboardSelfRank | null = null;
  private leaderboardSequence = 0;
  // Deliberately NOT part of authForm/LegacyAuthFieldId -- that state
  // machine is scoped to the signed-out sign-in/sign-up credential form
  // (its Enter key submits sign-in, its fields reset on sign-in/out). The
  // account-screen username field edits an already-signed-in profile, a
  // different concern with its own save/availability-check lifecycle, so
  // it gets its own small parallel state instead of conflating the two.
  private accountUsernameDraft = '';
  private accountUsernameSavedValue = '';
  private accountUsernameLoadedForUserId: string | null = null;
  private accountUsernameHydrationPending = false;
  private accountUsernameHydrationError = false;
  private accountUsernameActive = false;
  private accountUsernameSequence = 0;
  private accountUsernameDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private accountUsernameNativeInput: HTMLInputElement | null = null;
  private accountUsernameNativeInputHandler: ((event: Event) => void) | null = null;
  private accountUsernameNativeKeyDownHandler: ((event: KeyboardEvent) => void) | null = null;
  private authUnsubscribe: (() => void) | null = null;
  private mazeSeed = DEFAULT_LEGACY_RUNTIME_SEED;
  private explicitRuntimeMazeSeed = false;
  private maze!: LegacyMazeSnapshot;
  // Cache keyed by object identity -- this.maze is replaced wholesale on
  // every regeneration (never mutated in place), so a reference check is
  // enough to know the cached set still matches. Recomputing this is an
  // O(perimeter) scan; ensureBoardTileMazeCaches and the reveal mask read it every
  // redraw, so caching keeps that from becoming O(perimeter * cellCount).
  private bleedOffDockVisualEligibilityForMaze: LegacyMazeSnapshot | null = null;
  private bleedOffDockVisualEligibilityKeys: Set<string> = new Set();
  private player!: LegacyPoint;
  private trail: LegacyPoint[] = [];
  private mode: RuntimeMode = 'menu';
  private overlay: OverlayKind = 'none';
  private overlayReturn: OverlayKind = 'none';
  // Wave 3A live command/state bridge -- see src/state/uiLegacyBridge.ts.
  // Null only before create() installs it and after shutdown destroys it.
  private uiBridge: UiLegacyBridge | null = null;
  private pendingGenerationRequest: LegacyGenerationRequest | null = null;
  private menuDemoEpisode: MazeEpisode | null = null;
  private menuDemoState: DemoWalkerState | null = null;
  private menuDemoConfig!: DemoWalkerConfig;
  private nextDemoMoveAtMs = 0;
  private playStartedAtMs = 0;
  private playCompletedAtMs: number | null = null;
  private playCyclePath: LegacyPoint[] = [];
  private playCycleResetUsed = false;
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
  // Board layers share one untransformed container for stable draw ordering.
  // The board size is frozen by product decision (no user zoom setting): the
  // container itself must remain at 1x so a fresh maze never applies an
  // implicit zoom or desynchronizes visual and input coordinates.
  private boardZoomContainer!: Phaser.GameObjects.Container;
  // Was a Phaser.GameObjects.Text rendered in a plain web font -- now built
  // from the same tile-block glyph material as the title and Start/Login
  // (see drawLegacyLevelAnnouncerNumberGlyph), redrawn fresh into this
  // Graphics object every frame in local coordinates exactly like
  // drawLegacyMenuFrontDoorGlyphButton's own `panel`.
  private levelAnnouncerNumberGraphics!: Phaser.GameObjects.Graphics;
  // Pool of reusable Image GameObjects rendering the level number from the
  // real Mazer tile-font raster asset (drawLegacyTileFontWord) when it's
  // available -- levelAnnouncerNumberGraphics becomes twinkle-sparkles-only
  // in that case, falling back to its own procedural glyph rendering only
  // if the tile-font texture failed to load.
  private levelAnnouncerNumberGlyphPool: Phaser.GameObjects.Image[] = [];
  // Wave 4D-B QA-only Teleport anchor-pose preview state -- see
  // resolveLegacyTeleportAnchorPreviewResult. null means no preview is active.
  // Reviewer-caught defect fixed: this used to be a bare target point with
  // every resolution forced to heldAnchorId: null (a stateless "what would
  // selection choose right now" probe only). It is now a real bounded
  // session carrying the currently-held anchor id too, so a target/layout
  // change WITHIN one session genuinely exercises the selector's own
  // retention rule (held anchor kept unless it becomes ineligible or
  // disappears) instead of silently re-selecting fresh every call.
  private teleportAnchorPreviewSession: { target: { x: number; y: number }; heldAnchorId: TeleportAnchorId | null } | null = null;
  // Pool rendering the literal "MAZER" wordmark from the real tile-font
  // raster asset (see LEGACY_TITLE_WORD / drawLegacyMenuPathTitle) -- falls
  // back to the original maze-path dot-cell glyph only if the asset never
  // loaded.
  private titleTileFontImagePool: Phaser.GameObjects.Image[] = [];
  private levelAnnouncerLabelText!: Phaser.GameObjects.Text;
  // Pause > Quit to Menu two-step confirm (legacyQuitConfirm.ts).
  private quitConfirmState: LegacyQuitConfirmState = IDLE_LEGACY_QUIT_CONFIRM_STATE;
  private levelAnnouncerWasVisible = false;
  // One-more-redraw falling-edge tracker for the arrival laser (see update()).
  private playerSpawnBurstWasActiveForRedraw = false;
  private levelAnnouncerBuildFadeOutArmed = false;
  private playerSpawnBurstStartedAtMs: number | null = null;
  private playerTransferEnergyArmed = false;
  private playerTransferEnergyOutboundStartedAtMs: number | null = null;
  private playerTransferEnergyDeliveryStartedAtMs: number | null = null;
  // Built at the goal-reached instant (see precomputeLegacyDeconstructResetMaze),
  // well before armLegacyMenuStaticDeconstructStage runs -- that arm call is
  // itself what starts the outbound player-transfer-energy timer and the
  // bleed-dock corridor's own clock, both short (a few hundred ms)
  // wall-clock-timed animation windows. Generating the next maze
  // synchronously INSIDE that same arm call (as it used to) could burn more
  // wall-clock time than either window's own duration, so the very first
  // frame rendered afterward was already past them -- the outbound laser
  // never visibly flies, the deceleration never visibly plays, both just
  // "jump" to their post-window resting state. Precomputing this early
  // means the arm call consumes an already-built maze and does no
  // synchronous work of its own.
  private pendingLegacyDeconstructResetMaze: { mode: LegacyGenerationMode; seed: number; maze: LegacyMazeSnapshot } | null = null;
  // The menu demo's own equivalent of play mode's schedulePlayResetReturn
  // hold, for the identical reason (see pendingLegacyDeconstructResetMaze's
  // own comment just above). shouldStartLegacyMenuDeconstructOnGoalArrival
  // deliberately skips the demo walker's own 3-second ambient goalHoldMs
  // "celebration" hold when a live maze is already showing (that long a
  // frozen-looking pause would read as a stalled background loop, not a
  // deliberate one) -- so unlike play mode, there is no existing hold to
  // precompute the next maze behind. This field parks the actual
  // deconstruct-arm call (which starts the outbound laser/corridor's own
  // wall-clock timers) for LEGACY_MENU_DEMO_GOAL_RESET_HOLD_MS after
  // updateMenuDemo calls precomputeLegacyDeconstructResetMaze at the
  // goal-reached instant, giving the synchronous build real wall-clock
  // room to finish before anything that would eat into it fires -- see
  // updateMenuDemo's own two use sites for exactly where this is set and
  // consumed.
  private pendingMenuDemoDeconstructArmAtMs: number | null = null;
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
  private menuSettingsCogActive = false;
  private backdropGraphics!: Phaser.GameObjects.Graphics;
  private boardStaticGraphics!: Phaser.GameObjects.Graphics;
  private boardPathGraphics!: Phaser.GameObjects.Graphics;
  // Z-order anchor for the board layer (edgeMarkers.test pins it). The board's tiles are NOT drawn
  // here any more: boardTileLayer.image (the baked Chip/Trace board) sits right after it.
  // Board tile style flag: Chip by default, ?tileStyle=trace for the alternate.
  private boardTileStyle: BoardTileStyleId = 'chip';
  private boardTileLayer!: BoardTileLayer;
  private boardTileLayerTextureKey: string | null = null;
  private boardTileRankOrder: LegacyPoint[] | null = null;
  private boardTileRankGrid: Int32Array | null = null;
  private boardTileDockMaze: LegacyMazeSnapshot | null = null;
  private boardTileDocks: BoardTileDock[] = [];
  private boardTileDockOwners: Uint8Array | null = null;
  // Real HUD icon art (see docs/assets/mazer-vfx-source-provenance.md) for
  // the two menu-header icons drawn every frame into the permanent
  // boardDynamicGraphics/boardZoomContainer space -- one persistent Image
  // each, same lifetime as boardDynamicGraphics itself. The profile icon's
  // own Image(s) are NOT scene-level fields: that glyph is drawn from
  // per-button closure (createLegacyMenuProfileButton) whose
  // graphics/background/label are
  // already created and destroyed alongside each button instance, so its
  // Image lives and dies with that same closure instead.
  private headerSettingsIconImage!: Phaser.GameObjects.Image;
  private headerLeaderboardIconImage!: Phaser.GameObjects.Image;
  // Same real settings icon as the menu header, for active play's own pause/
  // settings touch control (drawLegacySettingsCogControl) -- top-level, not
  // boardZoomContainer, matching hudGraphics' own coordinate space.
  private touchSettingsCogIconImage!: Phaser.GameObjects.Image;
  private boardDynamicGraphics!: Phaser.GameObjects.Graphics;
  // Goal beacon (halo + ping): its own layer UNDER the trail canvas so the trail always sits on top of it.
  private goalBeaconGraphics!: Phaser.GameObjects.Graphics;
  // Find-me ping scheduler for the play-mode player locator (src/render/playerLocator.ts).
  private readonly playerLocatorState = new PlayerLocatorState();
  // Scratch records for the player marker (one geometry for play, the demo AI and the Guide): no per-frame allocation.
  private readonly playerMarkerFrameScratch = createPlayerMarkerFrame();
  private readonly playerMarkerCenterScratch = { x: 0, y: 0 };
  // Navigation Core v1's continuous play trail is composited on a real 2D
  // canvas (src/render/navigationCoreTrailCanvas.ts), not stroked as
  // Phaser Graphics vector paths -- the game runs Phaser.CANVAS
  // (postFX/preFX blur is WebGL-only), and a raw CanvasRenderingContext2D
  // gives real round line joins on a single continuous path plus a genuine
  // shadowBlur halo, neither of which a Graphics stroke call exposes.
  // Sized to this one trail's own bounding box (plus glow padding), not a
  // full-board canvas -- resized/repositioned only when that box actually
  // changes. Lives in boardZoomContainer, positioned just before
  // boardDynamicGraphics so the player/goal markers drawn into that
  // Graphics object still render on top of it. Hidden (not destroyed) by
  // drawLegacyContinuousPlayTrail on every early-return path, so a
  // menu-mode frame or an empty/degenerate trail never leaves stale pixels
  // showing. The texture key is unique per scene instance (see create())
  // so a scene restart doesn't collide with a still-registered previous
  // instance's texture.
  private trailCanvasTextureKey: string | null = null;
  private trailCanvasTexture: Phaser.Textures.CanvasTexture | null = null;
  private trailCanvasImage: Phaser.GameObjects.Image | null = null;
  // Backing PIXEL dimensions (logical size * resolution), not the Image's
  // own logical display size -- see drawTrailCanvasSegments's own comment.
  private trailCanvasWidth = 0;
  private trailCanvasHeight = 0;
  private trailCanvasResolution = 0;
  // Same real-2D-canvas compositor pattern as trailCanvasImage above, for
  // the player marker's own two drop-shadow glow layers (see
  // navigationCorePlayerGlowCanvas.ts's own header comment for why a
  // Graphics-only approximation reads as nested solid bodies instead of
  // light). The human's marker in play and the AI's in the menu demo share it
  // (one marker, src/render/playerMarker.ts). Sized to the player's own
  // current shape bounds plus glow padding, not a full-board canvas --
  // redrawn every frame fillLegacyPlayerMarkerTile runs (the idle breathing
  // pulse means that's effectively every dirty frame, same redraw cadence
  // the trail already pays). Positioned just before boardDynamicGraphics so
  // the crisp core+stroke drawn into that Graphics object still render on
  // top of it. Hidden (not destroyed) on every path that also hides
  // trailCanvasImage, so a frame that draws no player never leaves a stale
  // glow showing.
  private playerGlowCanvasTextureKey: string | null = null;
  private playerGlowCanvasTexture: Phaser.Textures.CanvasTexture | null = null;
  private playerGlowCanvasImage: Phaser.GameObjects.Image | null = null;
  private playerGlowCanvasWidth = 0;
  private playerGlowCanvasHeight = 0;
  private playerGlowCanvasResolution = 0;
  // Confirmed real defect (review 5147427468, continuing 5144999445 /
  // 5146800659): the gameplay transfer's own outbound/delivery elapsed
  // computation (time - startedAtMs) is not itself pause-aware --
  // scene.time.now keeps advancing in real wall-clock terms regardless
  // of the pause overlay (this.scene.pause() is never called anywhere in
  // this codebase), so a real pause let phase genuinely advance
  // (confirmed live: outbound -> stored while "paused"), and a real
  // resume could reveal a jump or even a fully completed/reset transfer
  // the player never saw run. These two fields implement a narrowly
  // scoped pause-aware elapsed-time correction at this exact boundary --
  // NOT a second gameplay state machine or a second clock:
  // resolveLegacyPlayerTransferVisualState (the one authoritative
  // lifecycle) is untouched; only the ELAPSED-MS INPUTS this scene feeds
  // it are compensated for real time spent paused, the same
  // accumulate-while-unpaused/freeze-while-paused shape already
  // established for the material animation clock
  // (advanceLegacyGameplayTransferAnimationClock), applied here to the
  // lifecycle's own elapsed inputs instead of a presentation-only value.
  // Updated exactly once per frame (updateGameplayTransferPauseTracking,
  // called alongside settleLegacyPlayerTransferEnergy, itself already
  // unconditional every frame) and consumed by every real elapsed-ms
  // computation this scene derives for the transfer AND the initial
  // arrival (resolveLegacyPlayerSpawnBurstState) alike, since pause is
  // one real, global UI state affecting both identically. Reset to zero
  // at every genuine new session boundary (the same three sites the
  // other sticky gameplay-transfer fields already reset at) so a pause
  // from an unrelated, already-finished session never bleeds into a
  // later one.
  private gameplayTransferPausedDurationMs = 0;
  private gameplayTransferPauseStartedAtMs: number | null = null;
  // The most recent `time` value observed while NOT paused. Confirmed
  // real one-frame boundary defect (ChatGPT-assisted review 5147427468):
  // overlay flips to 'pause' synchronously (a QA/UI command, not itself a
  // frame tick), so the first real frame where updateGameplayTransferPauseTracking
  // observes `paused === true` already has a NEW, larger `time` than the
  // last frame rendered while unpaused. Anchoring gameplayTransferPauseStartedAtMs
  // at THAT frame's own `time` (the original implementation) let exactly
  // one real frame's worth of elapsed-ms slip through unfrozen before the
  // freeze took hold on the frame after -- pause looked "frozen" from the
  // second paused frame onward, but the very first paused sample still
  // differed from the last pre-pause sample. Anchoring at this field's
  // last pre-pause value instead means the pause boundary itself
  // contributes zero elapsed-ms, matching "frozen identically" from the
  // first paused frame, not the second.
  private gameplayTransferLastUnpausedTimeMs: number | null = null;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private overlayScrollGraphics: Phaser.GameObjects.Graphics | null = null;
  private overlayGuideGraphics: Phaser.GameObjects.Graphics | null = null;
  private overlayGuideMask: Phaser.Display.Masks.GeometryMask | null = null;
  private overlayGuideMaskGraphics: Phaser.GameObjects.Graphics | null = null;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  // Deliberately its own layer, outside boardZoomContainer (so screen-corner
  // coordinates stay the true corners regardless of board zoom) and never
  // touched by drawHud's own unconditional clear (which is play-mode-only
  // and would wipe anything drawn here before it ever showed in menu mode).
  // Cleared and redrawn every frame from within drawDynamicBoard, which
  // already runs in both modes.
  private playerSpawnBurstGraphics!: Phaser.GameObjects.Graphics;
  // The one spawn/outbound laser (edgeMarkers.ts drawSpawnLaser).
  private spawnLaserGraphics!: Phaser.GameObjects.Graphics;
  // The eight edge diamonds: lowest depth in boardZoomContainer (see drawLegacyEdgeMarkers).
  private edgeMarkerGraphics!: Phaser.GameObjects.Graphics;
  private uiTexts: Phaser.GameObjects.Text[] = [];
  private uiGraphics: Phaser.GameObjects.Graphics[] = [];
  private uiButtons: UiButton[] = [];
  private overlayBackChevronBounds: VisualRect | null = null;
  private overlayBackChevronAction: (() => void) | null = null;
  // Menu Settings only: the card rect; a tap outside it (the dimmed scrim) closes the sheet.
  private overlayScrimCloseBounds: VisualRect | null = null;
  private overlayGuideBounds: VisualRect | null = null;
  // The Guide is a sub-view of the options/pause sheet, not its own overlay (Pause must keep holding the run).
  private settingsGuideOpen = false;
  private progressionResetState: LegacyProgressionResetState = INITIAL_LEGACY_PROGRESSION_RESET_STATE;
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
  private oauthPageShowCleanup: (() => void) | null = null;
  private offlineCompletionFlush: LegacyOfflineCompletionFlush | null = null;
  /** Cached OS accessibility preference; never read from the render loop. */
  private legacyReducedMotionEnabled = false;
  private legacyReducedMotionMediaQuery: MediaQueryList | null = null;
  private legacyReducedMotionMediaQueryListener: ((event: MediaQueryListEvent) => void) | null = null;
  private stars: LegacyMenuBackdropStar[] = [];
  private layout!: LegacyMenuLayout;
  private hudTouchControlBounds: VisualRect | null = null;
  private readonly playerGlide = new PlayerGlide();
  // Blocked-move feedback (MAZER-MOTION-003): a short whole-pixel nudge toward the wall plus a light buzz.
  private wallBump: { startedAtMs: number; deltaX: number; deltaY: number } | null = null;
  private lastWallBumpBuzzAtMs: number | null = null;
  private lastPlayerVisualMotionSnapReason: LegacyPlayerVisualMotionSnapReason = null;
  // One shared, PAUSABLE animation clock for Navigation Core v1's continuous
  // trail (base spectral color phase + shared shine distance + its quiet
  // interval) -- deliberately not driven directly from Phaser's raw scene
  // time, which keeps ticking while Pause is open or another overlay covers
  // the board. trailAnimationElapsedMs only accumulates real elapsed time
  // while Active Play is genuinely visible (resolveLegacyTrailAnimationClock's
  // own gate) and reduced motion is off; it freezes otherwise, so Pause
  // freezes the exact visual phase and Resume continues from it instead of
  // jumping to wherever an uninterrupted clock would now say it should be.
  // trailAnimationLastRealMs is the bookkeeping checkpoint (the real
  // timestamp last seen while actively accumulating) -- reset to null
  // whenever accumulation stops, so the next active frame adds only its own
  // real delta instead of the whole paused/reduced-motion gap.
  private trailAnimationElapsedMs = 0;
  private trailAnimationLastRealMs: number | null = null;
  // The continuous play trail's shared shine lap-start timestamp, expressed
  // in trailAnimationElapsedMs units (not raw scene time) -- see
  // advanceTrailShineState's own header for why this must be explicit,
  // caller-persisted state rather than a value derived fresh each frame.
  // Reset to 0 wherever this.trail itself resets to a fresh run, so a new
  // maze/run never inherits the previous run's shine phase.
  private trailShineLapStartedAtMs = 0;
  // The lap-in-progress's own wrap threshold, locked in at lap start -- see
  // advanceTrailShineState's own header for why this must survive a mid-lap
  // path-length shrink (backtracking, or a Trail Fade origin advance)
  // untouched instead of being recomputed from the live length every call.
  // 0 is the "no lap established yet" sentinel, matching lapStartedAtMs's
  // own use of 0 -- the function computes a fresh cycle length on the first
  // real call. Reset alongside trailShineLapStartedAtMs at the same
  // fresh-run sites.
  private trailShineLapCycleLength = 0;
  // Trail Fade bounds this.trail to its most recent TRAIL_FADE_TAIL points,
  // so the visible path's own origin (resolveLegacyPlayPerfectPathTrail's
  // first point) slides forward over time instead of staying pinned at
  // maze.start. Without correction, every cell's color would re-derive from
  // "distance since the CURRENT origin," so the whole gradient would visibly
  // rebase every time the origin advances. trailOriginAdvanceDistancePx
  // accumulates how far that origin has physically moved (in path-length
  // px, measured via the real floor grid, not assumed to be exactly one
  // tile) since the run started, and is added to the color-phase distance
  // (see drawLegacyContinuousPlayTrail) so a given physical trail cell keeps
  // its own apparent color as the window slides -- color is periodic over
  // distance, so this is a phase realignment, not a length change. Shine
  // timing is untouched: it only ever cares about position along the
  // CURRENTLY visible path. lastTrailOriginPoint is the checkpoint used to
  // detect an origin change frame-to-frame. Both reset alongside
  // trailShineLapStartedAtMs at the same fresh-run sites.
  private trailOriginAdvanceDistancePx = 0;
  // The trail head's colour clock, recorded by the trail draw so the edge diamonds' border reads the SAME palette
  // sample (trailPalette.ts): physical distance of the player's end of the trail in tiles, the trail's pausable
  // animation time, and whether the trail is animated (Trail Shine on, no reduced motion). Null when no trail was
  // drawn this frame; the diamonds then use distance 0 on the scene clock.
  private trailPaletteHead: { distanceTiles: number; timeMs: number; animated: boolean } | null = null;
  private lastTrailOriginPoint: LegacyPoint | null = null;
  // See LegacyTrailPerfDiagnostics's own header comment. Overwritten every
  // drawLegacyContinuousPlayTrail call in play mode; null until the first
  // one runs (or if the trail is empty/off-screen that frame).
  private lastTrailPerfDiagnostics: LegacyTrailPerfDiagnostics | null = null;
  // A one-way latch for the start marker's pre-spawn -> post-spawn
  // transition -- must not flip back to false just because the player
  // revisits the start tile later. Flipped only from
  // markLegacyPlayerLeftStartIfApplicable(), called at the authoritative
  // accepted-movement commit boundary (applyLegacyWorldTurnPlayerMovement
  // for real play, the equivalent menu-demo step commit) right after
  // this.player is updated -- never from rendering. Rendering
  // (fillPlayDynamicMarkerTile) only ever reads this field. Reset alongside
  // trailShineLapStartedAtMs at the same fresh-run sites.
  private hasPlayerEverLeftStart = false;
  private boardStaticDirty = true;
  private boardPathDirty = true;
  private boardDynamicDirty = true;
  private hudDirty = true;
  private backdropDirty = true;
  private uiDirty = true;
  private menuStaticDrawLifecyclePhase: LegacyMenuStaticDrawLifecyclePhase = 'idle';
  private menuStaticDrawRowsVisible: number | null = null;
  private menuStaticDrawTileOrder: LegacyPoint[] = [];
  private menuStaticDrawVisibleTileKeys = new Set<string>();
  private menuStaticDrawTilesVisible: number | null = null;
  private menuStaticDeconstructStartedAtMs: number | null = null;
  private menuStaticDeconstructZeroHoldStartedAtMs: number | null = null;
  private menuStaticBuildPrerollStartedAtMs: number | null = null;
  // menuStaticBuildPrerollStartedAtMs nulls out ~500ms into 'building' (see
  // advanceLegacyMenuStaticDrawStage) -- it's a preroll-window flag, not a
  // "when did this build start" anchor. introStartedAtMs IS that anchor: the
  // single clock the whole intro (tile reveal, level digit, bleed docks, spawn
  // laser, input unlock) is derived from via resolveIntro (introTimeline.ts).
  // It is a plain timestamp, never a counter, so frame rate cannot change how
  // long the intro takes. Persists after settle (the landing poof still reads
  // it) and is cleared by the next deconstruct/arm.
  private introStartedAtMs: number | null = null;
  // ONE atomic switch for every wrap/bleed edge-path element: the dock strips,
  // the dock-owning border cells and their facets/images all key off it
  // (resolveIntro / resolveIntroDeconstruct bleedProgress, strictly 0 or 1).
  // Root cause of the reported "one square left behind": the border cell was
  // drawn by the BFS tile reveal (and removed in reverse-BFS order, so it
  // outlived the strips), while the strips grew/retracted on a separate clock
  // and a zero-length strip was clamped to 1 px by
  // resolveLegacyMenuBorderDockRenderAreas / ...FacetRect, which still drew a
  // halo + rim + bleed image around that sliver.
  private legacyEdgePathsVisible = true;
  // Owner-reported (ChatGPT-assisted review 5173052153): a Play-mode pause
  // froze the transfer's own clocks but NOT the coupled maze
  // reveal/deconstruct/handoff lifecycle -- the submitted pause recording
  // showed corridor tiles disappearing while the pause menu stayed open.
  // holdLegacyPlayMazeLifecycleDuringPause uses this to shift every one of
  // that lifecycle's absolute-time deadlines/anchors forward by exactly
  // the real frame elapsed while paused, so it holds still without
  // touching `time` or pausing the whole scene. Null until the first
  // real frame.
  private legacyPlayMazeLifecyclePrevFrameMs: number | null = null;
  private legacyPlayTrailPulseNextFrameAtMs = 0;
  private legacyMenuTitleAnimationNextFrameAtMs = 0;
  // Edge markers (edgeMarkers.ts): the one-shot wrap flash and the station the
  // spawn laser is currently leaving from (energized while it fires).
  private edgeMarkerWrapFlash: EdgeWrapFlash | null = null;
  // Stations whose beam is in flight right now (they brighten), and whether any was last frame.
  // Ids whose beam is in flight THIS frame. Deliberately not private: the QA
  // verify scripts (scripts/analysis/verify-*teleport*.mjs) read it. The diamond
  // lighting itself comes from edgeRing, not from this.
  edgeBeamFiringIds: ReadonlySet<number> = new Set<number>();
  private edgeBeamWasFiring = false;
  // Ring lighting + spin of the current frame (resolveLegacyEdgeRing) and whether
  // the previous frame had a lifecycle (one more redraw clears the last lit frame).
  private edgeRing: { lifecycle: EdgeRingLifecycle | null; spinRad: number } = { lifecycle: null, spinRad: 0 };
  private edgeRingActive = false;
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
  private legacyPlayPageHideHandler: (() => void) | null = null;
  private legacyPlayPageShowHandler: (() => void) | null = null;
  // Page visibility for the lifecycle hold (legacyLifecycleHold.ts): hidden
  // tab/background/page-hide, plus the one resume frame whose delta is the
  // whole hidden gap. legacyLifecycleHeldThisFrame is the per-frame verdict
  // (set in holdLegacyPlayMazeLifecycleDuringPause) the transfer pause
  // tracker reads so both clocks agree.
  private legacyPageVisibility: LegacyPageVisibilityState = INITIAL_LEGACY_PAGE_VISIBILITY_STATE;
  // MAZER-FLOW-008: last seen viewport aspect, and whether the open Pause sheet
  // came from an aspect flip (drives the "rotate back" notice). The origin is
  // the aspect the run was in before the flip; null = no flip pause.
  private legacyViewportLandscape: boolean | null = null;
  private orientationFlipOriginLandscape: boolean | null = null;
  private legacyLifecycleHeldThisFrame = false;
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
    this.levelPreviewLevel = resolveLegacyLevelPreviewLevel(runtimeSearch);
    this.levelPreviewStorage = this.levelPreviewLevel === null ? null : createLegacyLevelPreviewStorage();
    if (this.levelPreviewLevel !== null) {
      this.pendingBootPlayStart = true;
    }
    this.passwordRecoveryUrlState = readLegacyPasswordRecoveryBootUrlState();
    this.passwordRecoveryState = resolveLegacyPasswordRecoveryEntry(
      createLegacyPasswordRecoveryState(),
      {
        authenticated: false,
        bootstrapComplete: false,
        event: 'BOOTSTRAP_PATH',
        hasProviderError: this.passwordRecoveryUrlState.hasProviderError,
        pathRequested: this.passwordRecoveryUrlState.requested
      }
    );
    if (this.passwordRecoveryState.phase === 'error') {
      clearLegacyPasswordRecoveryUrl('invalid');
    }
    this.loadPersistedLegacyAuthForm();
    this.loadPersistedLegacyGameToggleSettings();
    this.loadPersistedMazeCycleTelemetryHistory();
    this.loadPersistedLegacyProgressionState();
    this.applyBootstrappedLegacyAccountState();
    this.installLegacyReducedMotionPreference();
    // Only raise the `Signing you in…` cover when a session is actually being
    // resolved; a first-time signed-out visitor goes straight to Welcome.
    const authGateInitialState = resolveLegacyAuthGateInitialState({
      authFixtureRoute: isLegacyRuntimeDiagnosticsAuthFixtureRoute(runtimeSearch) || this.levelPreviewLevel !== null,
      bootstrappedAuthenticated: readLegacyBootstrappedAuthSnapshot()?.status === 'authenticated',
      callbackInProgress: false,
      hasStoredSession: hasLegacyStoredAuthSession(this.resolveBrowserLocalStorage())
    });
    this.authGateAwaitingResolution = authGateInitialState.awaitingResolution;
    this.authGateHasSessionEvidence = authGateInitialState.awaitingResolution;
    if (authGateInitialState.locked) {
      this.authGateLocked = true;
      this.pendingAuthGateTransition = true;
    }
    void this.initializeLegacyAuth();
    this.initializeRuntimeDiagnostics();
    this.backdropGraphics = this.add.graphics();
    // See src/render/pixelAlignment.ts: no half-pixel camera offset on odd-sized viewports.
    alignCameraToWholePixels(this.cameras.main);
    this.boardZoomContainer = this.add.container(0, 0);
    this.edgeMarkerGraphics = this.add.graphics();
    this.boardStaticGraphics = this.add.graphics();
    this.boardPathGraphics = this.add.graphics();
    // The board's tiles: one baked Chip (default) or Trace (?tileStyle=trace) canvas, shown through
    // one Image that drawBoardPaths re-places and, only while the reveal changes, re-masks. The old
    // floor texture sprite, its GeometryMask and the pooled bleed-strip images are gone with the old
    // pale-mint tile; BootScene still generates the textures (it is not edited here).
    this.boardTileStyle = resolveBoardTileStyleFromSearch(
      typeof window === 'undefined' ? '' : window.location.search
    );
    this.boardTileLayerTextureKey = `legacy-board-tile-layer-${nextMenuSceneInstanceId()}`;
    this.boardTileLayer = new BoardTileLayer(this, this.boardTileLayerTextureKey);
    // Navigation Core v1's continuous play trail -- a real 2D canvas, not a
    // Graphics object (see the field's own comment for why). 1x1 initially;
    // drawLegacyContinuousPlayTrail resizes/repositions/redraws it every
    // frame it actually has a trail to show, and hides it otherwise.
    this.trailCanvasTextureKey = `legacy-nav-core-trail-${nextMenuSceneInstanceId()}`;
    this.trailCanvasTexture = this.textures.createCanvas(this.trailCanvasTextureKey, 1, 1);
    this.trailCanvasImage = this.add.image(0, 0, this.trailCanvasTextureKey).setOrigin(0, 0).setVisible(false);
    // Same real-2D-canvas approach as the trail above, for the play-mode
    // player marker's own drop-shadow glow layers -- see the field's own
    // comment.
    this.playerGlowCanvasTextureKey = `legacy-nav-core-player-glow-${nextMenuSceneInstanceId()}`;
    this.playerGlowCanvasTexture = this.textures.createCanvas(this.playerGlowCanvasTextureKey, 1, 1);
    this.playerGlowCanvasImage = this.add.image(0, 0, this.playerGlowCanvasTextureKey).setOrigin(0, 0).setVisible(false);
    // Same real-2D-canvas approach as the player glow above, for the goal
    // star's own ambient halo -- see the field's own comment.
    this.boardDynamicGraphics = this.add.graphics();
    this.goalBeaconGraphics = this.add.graphics();
    this.titleGraphics = this.add.graphics();
    this.headerSettingsIconImage = this.add.image(0, 0, MAZER_HUD_SETTINGS_TEXTURE_KEY).setOrigin(0.5, 0.5).setVisible(false);
    this.headerLeaderboardIconImage = this.add.image(0, 0, MAZER_HUD_LEADERBOARD_TEXTURE_KEY).setOrigin(0.5, 0.5).setVisible(false);
    this.boardZoomContainer.add([
      // First child = lowest depth: the diamonds sit under the board, the title,
      // the header icons and every other menu element.
      this.edgeMarkerGraphics,
      this.boardStaticGraphics,
      this.boardPathGraphics,
      this.boardTileLayer.image,
      this.goalBeaconGraphics,
      // Before boardDynamicGraphics: the play trail's canvas-composited
      // core/glow render here, underneath the start/goal/player markers
      // drawn into boardDynamicGraphics right after it. The player marker's
      // own canvas-composited glow sits right after the trail's, same
      // reason -- both must render before the crisp shapes Graphics draws.
      this.trailCanvasImage,
      this.playerGlowCanvasImage,
      this.boardDynamicGraphics,
      // Same boardZoomContainer/boardDynamicGraphics-relative coordinate
      // space the settings-cog/leaderboard header icons were previously
      // drawn straight into (this replaces those procedural draws with the
      // real HUD icon art) -- must stay in this container so the header
      // frame math (screen-fixed coordinates, computed the same way
      // whether or not the board is currently zoomed) keeps landing right.
      this.headerSettingsIconImage,
      this.headerLeaderboardIconImage,
      this.titleGraphics
    ]);
    this.overlayGraphics = this.add.graphics();
    this.hudGraphics = this.add.graphics();
    this.touchSettingsCogIconImage = this.add.image(0, 0, MAZER_HUD_SETTINGS_TEXTURE_KEY).setOrigin(0.5, 0.5).setVisible(false);
    this.playerSpawnBurstGraphics = this.add.graphics();
    this.spawnLaserGraphics = this.add.graphics();
    this.authGateGraphics = this.add.graphics();
    this.playerMessageToastGraphics = this.add.graphics()
      .setDepth(LEGACY_PLAYER_MESSAGE_TOAST_DEPTH)
      .setVisible(false);
    this.playerMessageToastTexts = Array.from({ length: LEGACY_PLAYER_MESSAGE_TOAST_ROW_POOL }, () => (
      this.applyLegacyUiTextCrispness(this.add.text(0, 0, '', {
        fontFamily: LEGACY_UI_FONT_FAMILY,
        fontSize: '14px',
        color: '#ffffff',
        align: 'center'
      })).setOrigin(0.5, 0).setDepth(LEGACY_PLAYER_MESSAGE_TOAST_DEPTH + 1).setVisible(false)
    ));
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
    // Centered, between-mazes announcement (drawLegacyLevelAnnouncer) --
    // font sizes here are placeholders, both get resized every frame to
    // scale with the viewport. Deliberately NOT added to boardZoomContainer:
    // this is UI, not board content, and must read at a fixed, legible size
    // regardless of the current zoom level.
    this.levelAnnouncerLabelText = this.applyLegacyUiTextCrispness(this.add.text(0, 0, 'LEVEL', {
      fontFamily: LEGACY_UI_MONO_FONT_FAMILY,
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#36ff7d',
      align: 'center'
    })).setOrigin(0.5).setVisible(false);
    this.levelAnnouncerNumberGraphics = this.add.graphics().setVisible(false);
    this.levelAnnouncerNumberGlyphPool = Array.from(
      { length: LEGACY_TILE_FONT_GLYPH_POOL_SIZE * LEGACY_TILE_FONT_TILES_PER_GLYPH },
      () => this.add.image(0, 0, MAZER_TILE_FONT_TEXTURE_KEY).setOrigin(0.5, 0.5).setVisible(false)
    );
    // Added to boardZoomContainer: the title wordmark lives in that same local
    // coordinate space (titleGraphics is a member of it too) and must scale with it.
    this.titleTileFontImagePool = Array.from(
      { length: LEGACY_WORDMARK_TILE_FONT_GLYPH_POOL_SIZE * LEGACY_TILE_FONT_TILES_PER_GLYPH },
      () => this.add.image(0, 0, MAZER_TILE_FONT_TEXTURE_KEY).setOrigin(0.5, 0.5).setVisible(false)
    );
    this.boardZoomContainer.add(this.titleTileFontImagePool);
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
      const menuGenerationScale = this.resolveLegacyProgressionScaleForMode('menu');
      this.applyGenerationRequest(
        createLegacyGenerationRequest({
          aspectRatio: this.resolveLegacyBoardAspectRatioForMode('menu', menuGenerationScale),
          currentSeed: this.mazeSeed,
          dueAtMs: this.time.now,
          generationProfile: this.resolveLegacyMazeGenerationProfileForMode('menu'),
          mode: 'menu',
          queuedAtMs: this.time.now,
          reason: 'boot-menu',
          scale: menuGenerationScale,
          targetComplexity: this.resolveLegacyTargetComplexityForMode('menu')
        }),
        this.pendingBootPlayStart ? this.time.now : this.time.now + INITIAL_MENU_DEMO_HOLD_MS
      );
    }
    this.installInput();
    this.installLegacyPlayFocusGuards();
    this.uiBridge = new UiLegacyBridge(this.createUiBridgeAdapter(), this.resolveUiPlatformProfile());
    this.installLegacyQaDiagnosticsSurface();

    this.scale.on('resize', () => {
      this.refreshLayout();
    });
    if (typeof window !== 'undefined') {
      this.viewportGeometryListener = () => this.refreshLayout();
      window.addEventListener(MAZER_VIEWPORT_CHANGE_EVENT, this.viewportGeometryListener);
      this.oauthPageShowCleanup = installMazerOAuthPageShowRecovery(window, () => {
        this.authSubmitting = false;
        this.uiDirty = true;
      });
      this.installLegacyOfflineCompletionFlush();
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // The CanvasTexture is registered in the game-level TextureManager,
      // which outlives this scene instance -- unlike a plain Graphics
      // object or Image (which Phaser destroys along with the scene), a
      // leftover canvas texture would both leak and collide with a future
      // scene instance's own key if left registered.
      if (this.trailCanvasTextureKey !== null && this.textures.exists(this.trailCanvasTextureKey)) {
        this.textures.remove(this.trailCanvasTextureKey);
      }
      this.trailCanvasTexture = null;
      this.trailCanvasImage = null;
      this.trailCanvasTextureKey = null;
      if (this.playerGlowCanvasTextureKey !== null && this.textures.exists(this.playerGlowCanvasTextureKey)) {
        this.textures.remove(this.playerGlowCanvasTextureKey);
      }
      this.playerGlowCanvasTexture = null;
      this.playerGlowCanvasImage = null;
      this.playerGlowCanvasTextureKey = null;
      if (this.boardTileLayerTextureKey !== null && this.textures.exists(this.boardTileLayerTextureKey)) {
        this.textures.remove(this.boardTileLayerTextureKey);
      }
      this.boardTileLayerTextureKey = null;
      if (this.remoteSettingsSyncTimer !== null) {
        clearTimeout(this.remoteSettingsSyncTimer);
        this.remoteSettingsSyncTimer = null;
      }
      this.authUnsubscribe?.();
      this.authUnsubscribe = null;
      this.destroyLegacyAuthNativeInput();
      this.destroyAccountUsernameNativeInput();
      if (this.accountUsernameDebounceTimer !== null) {
        clearTimeout(this.accountUsernameDebounceTimer);
        this.accountUsernameDebounceTimer = null;
      }
      this.detachRuntimeDiagnostics();
      this.detachLegacyPlayFocusGuards();
      this.detachLegacyPlayKeyboardFallback();
      this.detachLegacyPlayTouchControlFallback();
      this.detachLegacyQaDiagnosticsSurface();
      this.uiBridge?.destroy();
      this.uiBridge = null;
      this.detachLegacyReducedMotionPreference();
      if (this.viewportGeometryListener !== null && typeof window !== 'undefined') {
        window.removeEventListener(MAZER_VIEWPORT_CHANGE_EVENT, this.viewportGeometryListener);
        this.viewportGeometryListener = null;
      }
      this.oauthPageShowCleanup?.();
      this.oauthPageShowCleanup = null;
      this.offlineCompletionFlush?.dispose();
      this.offlineCompletionFlush = null;
      this.clearVisualDiagnostics();
      clearMenuSceneRuntimeDiagnostics();
    });
    this.publishVisualDiagnostics(this.time.now, true);
    this.publishRuntimeDiagnostics(this.time.now, true);
  }

  /**
   * Real legacy facts for the Wave 3A bridge's projection.
   *
   * Real, live-sourced fields: mode, overlay, overlayReturn, authPhase
   * (LegacyAuthStatus's full 'guest'/'authenticated'/'unavailable' domain),
   * controlMode (settings.controlMode), motionMode (prefers-reduced-motion),
   * installPhase (the real boot-time installSurface module's own state),
   * and gamePhase (menuStaticDrawLifecyclePhase / playCompletedAtMs /
   * isLegacyPlayLifecycleInputLocked() -- covers generating/paused/complete/
   * input-locked/active/idle; 'preroll'/'ready'/'reset-pending'/'failed'
   * have no confidently-identified real signal yet).
   *
   * connectionPhase and effectsQuality have no real distinct live signal in
   * the current runtime at all (no online/offline tracking; no per-effect
   * quality tier, only a boolean animated-backdrop toggle that isn't the
   * same concept) -- both are named in `placeholderFields` so
   * UiLegacyBridge diagnostics can report their provenance honestly instead
   * of implying they are real projected state.
   */
  private resolveUiBridgeFacts(): LegacyRuntimeFacts {
    const authPhase: UiStateSnapshot['authPhase'] =
      this.authSnapshot.status === 'authenticated'
        ? 'authenticated'
        : this.authSnapshot.status === 'guest'
          ? 'guest'
          : 'failed';
    const reducedMotionPreferred = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const installSurfaceState = getInstallSurfaceState();
    const installPhase: UiStateSnapshot['installPhase'] = installSurfaceState.installed
      ? 'installed'
      : installSurfaceState.mode === 'available'
        ? 'available'
        : installSurfaceState.mode === 'manual' || installSurfaceState.mode === 'ios-open-in-browser'
          ? 'manual'
          : 'hidden';
    return {
      mode: this.mode,
      overlay: this.overlay,
      overlayReturn: this.overlayReturn,
      gamePhase: this.resolveUiBridgeGamePhase(),
      authPhase,
      connectionPhase: 'online',
      installPhase,
      controlMode: this.settings.controlMode,
      motionMode: reducedMotionPreferred ? 'reduced' : 'system',
      effectsQuality: 'balanced',
      placeholderFields: ['connectionPhase', 'effectsQuality']
    };
  }

  private resolveUiBridgeGamePhase(): UiStateSnapshot['gamePhase'] {
    if (this.overlay === 'pause') {
      return 'paused';
    }
    if (this.menuStaticDrawLifecyclePhase === 'building' || this.menuStaticDrawLifecyclePhase === 'deconstructing') {
      return 'generating';
    }
    if (this.mode === 'play') {
      if (this.playCompletedAtMs !== null) {
        return 'complete';
      }
      if (this.isLegacyPlayLifecycleInputLocked()) {
        return 'input-locked';
      }
      return 'active';
    }
    return 'idle';
  }

  /** True mobile/touch context picks the 'mobile' shared platform profile
   * instead of always defaulting to 'web' -- checked once at bridge
   * construction time since the profile is passed into the constructor, not
   * re-read per frame. */
  private resolveUiPlatformProfile(): UiPlatformProfile {
    if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) {
      return PLATFORM_PROFILES.mobile;
    }
    return PLATFORM_PROFILES.web;
  }

  /**
   * Maps shared UiCommand verbs to the same existing MenuScene methods (or a
   * real boot-time seam, for install commands) the current UI already
   * calls -- this adds no new behavior, it only names the seam and reports
   * whether the real operation actually accepted. A command with no real
   * runtime equivalent found (CANCEL_GENERATION, SET_PREFERENCE, SUBMIT_AUTH,
   * APPLY_UPDATE, RETRY_SYSTEM_ACTION, RELEASE_DIRECTIONAL_INTENT) is
   * intentionally omitted so UiLegacyBridge.dispatch() fails closed instead
   * of silently no-op-ing or mapping to an unrelated action.
   */
  private createUiBridgeAdapter(): UiLegacyBridgeAdapter {
    return {
      getFacts: (): LegacyRuntimeFacts => this.resolveUiBridgeFacts(),
      openSettings: (): boolean => { this.openOverlay('options'); return true; },
      openAccount: (): boolean => { this.openSharedAccountSurface(); return true; },
      openLeaderboard: (): boolean => { this.openOverlay('leaderboard'); return true; },
      openResetProgressConfirmation: (): boolean => { this.openOverlay('confirm-progression-reset'); return true; },
      closeTopOverlay: (): boolean => { this.handleBackAction(); return true; },
      startRun: (): boolean => {
        if (!this.hasLegacyPlayAccess()) {
          return false;
        }
        this.startPlayMode();
        return true;
      },
      pauseRun: (): boolean => {
        if (this.mode !== 'play' || this.overlay === 'pause') {
          return false;
        }
        this.openOverlay('pause');
        return true;
      },
      resumeRun: (): boolean => {
        if (this.overlay !== 'pause') {
          return false;
        }
        this.applyLegacyPauseCommand('resume');
        return true;
      },
      resetRun: (): boolean => {
        if (this.mode !== 'play') {
          return false;
        }
        this.applyLegacyPauseCommand('reset-player');
        return true;
      },
      resetProgress: (): boolean => { void this.resetLegacyPlayerProgression(); return true; },
      returnHome: (): boolean => { this.enterMenuMode(); return true; },
      logOut: (): boolean => { void this.handleLegacyAuthSignOut(); return true; },
      setControlMode: (mode): boolean => {
        if (mode !== 'stick' && mode !== 'arrows') {
          return false;
        }
        if (this.settings.controlMode !== mode) {
          this.applyOverlayToggleFieldChange('controlMode');
        }
        return true;
      },
      installApp: (): boolean => {
        if (getInstallSurfaceState().mode !== 'available') {
          return false;
        }
        void promptInstallSurface();
        return true;
      },
      dismissInstall: (): boolean => {
        if (getInstallSurfaceState().mode === 'hidden') {
          return false;
        }
        dismissInstallSurface();
        return true;
      },
      dispatchDirectionalIntent: (intent): boolean => {
        if (this.mode !== 'play' || this.overlay !== 'none') {
          return false;
        }
        return this.handleLegacyQaPlayMove(`move_${intent}`).accepted;
      }
    };
  }

  /**
   * UI event -> bridge.dispatch(command) -> adapter -> low-level runtime
   * operation. Every live click handler this wave converts calls this
   * instead of the low-level method directly; the adapter methods
   * themselves still call the low-level methods directly (never back into
   * the bridge), so there is no dispatch recursion. Falls back to the
   * direct low-level call only if the bridge is not yet installed or
   * legitimately rejects the command -- the low-level methods carry their
   * own guards (e.g. startPlayMode()'s own hasLegacyPlayAccess() check), so
   * this fallback is idempotent with the bridge's own rejection, not a way
   * to bypass it.
   */
  private dispatchUiBridgeCommand(command: UiCommand, fallback: () => void): void {
    if (!this.uiBridge || !this.uiBridge.dispatch(command).ok) {
      fallback();
    }
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
      startGuestPlayMode: (): LegacyQaOverlayResult => this.handleLegacyQaStartGuestPlayMode(),
      startPlayMode: (): LegacyQaOverlayResult => this.handleLegacyQaStartPlayMode(),
      getUiStateSnapshot: (): UiStateSnapshot | null => this.uiBridge?.getSnapshot() ?? null,
      getUiViewModels: (): UiViewModels | null => this.uiBridge?.getViewModels() ?? null,
      dispatchUiCommand: (command: unknown): UiLegacyBridgeDispatchResult => (
        this.uiBridge?.dispatch(command) ?? { ok: false, reason: 'bridge-not-installed' }
      ),
      getUiBridgeDiagnostics: (): UiLegacyBridgeDiagnostics | null => this.uiBridge?.getDiagnostics() ?? null,
      getTrailPerfDiagnostics: (): LegacyTrailPerfDiagnostics | null => this.lastTrailPerfDiagnostics,
      previewTeleportPrimaryAnchor: (targetX: number, targetY: number, newSession?: boolean): LegacyTeleportAnchorPreviewResult => (
        this.handleLegacyQaPreviewTeleportPrimaryAnchor(targetX, targetY, newSession === true)
      ),
      endTeleportPrimaryAnchorPreview: (): void => this.handleLegacyQaEndTeleportPrimaryAnchorPreview(),
      resolveShortestPathToGoal: (from?: LegacyPoint): LegacyShortestPathResult => (
        resolveLegacyPlayableShortestPath(this.maze.grid, from ?? this.player, this.maze.goal)
      ),
      // The conduit/shell presentation was retired with the old diamond art; kept as a
      // null-returning shim so QA scripts that call it do not throw.
      getGameplayTransferPresentationDiagnostics: () => null
    };
  }

  private detachLegacyQaDiagnosticsSurface(): void {
    // Scene teardown/shutdown, not a live end-of-preview call -- clears the
    // session so a later scene recreate starts fresh (matching this field's
    // own initializer), but deliberately does NOT also force a presentation
    // update here: the scene's own game objects may already be mid-
    // destruction at this point, and there is nothing left to "restore"
    // visually once the scene itself is going away.
    this.teleportAnchorPreviewSession = null;
    if (typeof window === 'undefined') {
      return;
    }

    delete window.__MAZER_QA__;
  }

  // Real HUD/control exclusion rectangles this scene actually has right
  // now -- the same this.uiButtons array Phaser's own hit-testing uses for
  // every currently-active clickable control (Account/profile, Settings
  // cog, Start, and any overlay buttons when one is open), so this is never
  // a copied/representative coordinate: an inactive control (destroyed or
  // not yet created) contributes no rectangle, matching its own real
  // interactive lifecycle rather than a static guess. In menu mode, the
  // title's own real layout region is also protected (resolveLegacyMenuPathTitleLayout,
  // the same function the title's own rendering uses). Device safe-area
  // strips (readMazerViewportGeometry) are included too, unioned with the
  // above rather than replaced by it.
  //
  // Reviewer-caught defect fixed: play mode's touch controls DO have real
  // discrete bounds in this codebase -- resolveLegacyPlayTouchControlLayout's
  // own `controls.pause` (the fixed pause-button hit region, real whenever
  // shouldRenderLegacyPlayTouchControls is true) and, only while a drag is
  // genuinely active, resolveLegacyPlayFloatingStickGeometry's own `outer`
  // rect for the floating stick actually mounted at playFloatingStickOrigin.
  // Neither of these is "the whole gesture-capture surface" (which spans
  // the entire canvas and correctly stays OUT of this exclusion set --
  // excluding it would make every anchor ineligible during play for no
  // real reason): a fixed button and a transient stick both have real,
  // bounded footprints; the surface that merely detects where a drag
  // started does not.
  private resolveLegacyTeleportAnchorPreviewExclusions(viewport: TeleportViewportBounds): TeleportRect[] {
    const safeArea = readMazerViewportGeometry().safeArea;
    const exclusions: TeleportRect[] = [
      { x: 0, y: 0, width: viewport.width, height: safeArea.top },
      { x: 0, y: viewport.height - safeArea.bottom, width: viewport.width, height: safeArea.bottom },
      { x: 0, y: 0, width: safeArea.left, height: viewport.height },
      { x: viewport.width - safeArea.right, y: 0, width: safeArea.right, height: viewport.height }
    ];

    for (const button of this.uiButtons) {
      exclusions.push({
        x: button.bounds.left,
        y: button.bounds.top,
        width: button.bounds.width,
        height: button.bounds.height
      });
    }

    if (this.mode === 'menu') {
      const titleLayout = resolveLegacyMenuPathTitleLayout(
        this.layout.titleX,
        this.layout.titleY,
        this.resolveLegacyMenuPathTitleFontSize()
      );
      exclusions.push({ x: titleLayout.left, y: titleLayout.top, width: titleLayout.width, height: titleLayout.height });
    }

    if (this.shouldRenderLegacyPlayTouchControls()) {
      const touchControlLayout = this.resolveLegacyPlayTouchControlLayout();
      const pause = touchControlLayout.controls.pause;
      exclusions.push({ x: pause.left, y: pause.top, width: pause.width, height: pause.height });
      if (this.playFloatingStickOrigin !== null) {
        const stick = this.resolveLegacyPlayFloatingStickGeometry(this.playFloatingStickOrigin);
        exclusions.push({ x: stick.outer.left, y: stick.outer.top, width: stick.outer.width, height: stick.outer.height });
      }
    }

    // A zero-width/height rectangle (e.g. a fully-collapsed safe-area
    // inset) contributes no real exclusion rather than a degenerate
    // zero-area one that could never intersect anything anyway but is
    // needless noise in a returned rejection reason.
    return exclusions.filter((rect) => rect.width > 0 && rect.height > 0);
  }

  // Wave 4D-B QA-only Teleport anchor-pose preview. Resolves REAL candidate
  // poses/eligibility (src/render/teleportAnchorPose.ts) from this scene's
  // own real viewport bounds, real device safe-area insets, real active
  // HUD-control bounds, and (in menu mode) the real title region -- never
  // the reference sheet's illustrative 390x844 layout -- then feeds them
  // into the REAL selector (src/render/teleportPrimaryAnchor.ts), retaining
  // `heldAnchorId` across calls in the same session (see
  // teleportAnchorPreviewSession's own field comment) unless `newSession`
  // is requested.
  private resolveLegacyTeleportAnchorPreviewResult(
    target: { x: number; y: number },
    heldAnchorId: TeleportAnchorId | null
  ): {
    result: ReturnType<typeof selectTeleportPrimaryAnchor>;
    poseById: Map<TeleportAnchorId, { anchorX: number; anchorY: number; rotation: number; portX: number; portY: number; footprint: TeleportRect }>;
  } {
    const viewport = { width: this.layout.width, height: this.layout.height };
    const exclusions = this.resolveLegacyTeleportAnchorPreviewExclusions(viewport);

    const candidates = resolveTeleportAnchorCandidates(
      viewport,
      target,
      TELEPORT_ANCHOR_PREVIEW_SHELL_CANVAS_SIDE_PX,
      exclusions,
      TELEPORT_ANCHOR_PREVIEW_VIEWPORT_INSET_PX
    );
    const result = selectTeleportPrimaryAnchor({ candidates, target, heldAnchorId });
    const poseById = new Map(candidates.map((candidate) => [candidate.id, {
      anchorX: candidate.pose.anchorX,
      anchorY: candidate.pose.anchorY,
      rotation: candidate.pose.rotation,
      portX: candidate.pose.portX,
      portY: candidate.pose.portY,
      footprint: candidate.pose.footprint
    }]));
    return { result, poseById };
  }

  // The QA anchor preview is drawn by the ONE edge-marker system: the held
  // anchor id simply energizes that station's procedural diamond. Begin/update/
  // end redraw synchronously (drawLegacyMenuPathTitle -> drawLegacyEdgeMarkers)
  // so the result is applied THIS call even when no animation frame is pending
  // (reduced motion, settled scene).
  private applyLegacyTeleportAnchorPreviewPresentationUpdate(): void {
    this.drawLegacyMenuPathTitle(this.time.now);
  }

  private handleLegacyQaPreviewTeleportPrimaryAnchor(targetX: number, targetY: number, newSession: boolean): LegacyTeleportAnchorPreviewResult {
    const target = { x: targetX, y: targetY };
    const heldAnchorId = (newSession || !this.teleportAnchorPreviewSession) ? null : this.teleportAnchorPreviewSession.heldAnchorId;
    const { result, poseById } = this.resolveLegacyTeleportAnchorPreviewResult(target, heldAnchorId);
    this.teleportAnchorPreviewSession = { target, heldAnchorId: result.selectedId };
    this.applyLegacyTeleportAnchorPreviewPresentationUpdate();
    const pose = result.selectedId === null ? null : (poseById.get(result.selectedId) ?? null);
    return {
      outcome: result.outcome,
      selectedId: result.selectedId,
      reason: result.reason,
      rejected: result.rejected,
      pose
    };
  }

  private handleLegacyQaEndTeleportPrimaryAnchorPreview(): void {
    this.teleportAnchorPreviewSession = null;
    this.applyLegacyTeleportAnchorPreviewPresentationUpdate();
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

    if (!this.hasLegacyPlayAccess()) {
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
      // Real, confirmed regression (found while restoring a broken visual
      // verification harness, not invented to satisfy the harness): the
      // `this.authGateLocked` disjunct below -- the one that actually OPENS
      // the forced auth gate for the ordinary "freshly loaded, signed out"
      // case -- was removed in c59c2a27 ("fix: complete shared account
      // consumer contract", PR #350) and never replaced. `authGateLocked`
      // was still computed correctly by applyLegacyAuthSnapshot on every
      // real boot, and pendingAuthGateTransition still got set, but nothing
      // in this handler ever consumed a plain "locked, not already on the
      // auth surface" state afterward -- so a signed-out visitor settled
      // into mode:'menu', overlay:'none' with a fully interactive,
      // unauthenticated menu, contradicting this app's own documented
      // policy (docs/current-truth.md: "gameplay and ambient board
      // simulation remain halted" pre-auth, "no guest bypass") and silently
      // defeating the actual product gate. Confirmed live via headless
      // Playwright with no auth fixture: mode/overlay settled at
      // 'menu'/'none' within ~400ms and stayed there for the remainder of a
      // 32s observation window -- not a slow-resolving race, a genuinely
      // missing transition. Also confirmed the restored condition correctly
      // locks the gate when authSnapshot.status === 'unavailable' (Supabase
      // not configured in this environment), same as a real signed-out
      // guest -- authGateLocked's own computation already treats the two
      // alike. Two later commits (d124dd1b, then 4a50dcfb) added and then
      // correctly relocated a NARROWER case -- forcing the gate when an
      // already-authenticated account signs out mid-Play -- into
      // applyLegacyAuthSnapshot's own accountOwnerChangedDuringPlay branch
      // (which still exists and is unrelated to this restoration); neither
      // ever restored the general case this disjunct covers.
      //
      // c59c2a27's own diff shows the original code used a SEPARATE else-if
      // branch (an exact duplicate call to enterForcedLegacyAuthOverlay()),
      // not this combined condition -- but tests/scenes/menu-render-frame
      // .test.ts's 'tears down the persistent play HUD before forced auth
      // and recovery overlays' test (added ed58a9e9, before c59c2a27) pins
      // update() to call enterForcedLegacyAuthOverlay() exactly once, so a
      // literal two-branch revert fails that architectural contract. Both
      // branches always did the exact same thing (enter the forced overlay,
      // mark UI dirty, rebuild), so merging their conditions with `||`
      // behind the shared `overlay !== 'auth'` guard is a pure, safe
      // simplification -- not a behavior change -- that keeps a single
      // call site, matching the test's actual intent (one place responsible
      // for the HUD teardown that enterForcedLegacyAuthOverlay() performs).
      if (
        (this.isLegacyPasswordRecoveryActive() || this.authGateLocked)
        && this.overlay !== 'auth'
      ) {
        this.enterForcedLegacyAuthOverlay();
        this.uiDirty = true;
        this.rebuildUi();
      } else if (!this.authGateLocked && !this.authGateAwaitingResolution && this.overlay === 'auth') {
        if (this.isLegacyPasswordRecoveryActive()) {
          this.uiDirty = true;
          this.rebuildUi();
        } else {
          // Signed in successfully (or a guest-play grant was issued) -- if
          // the auth overlay is still open because the gate put it there,
          // let it close now that there's nothing left to gate on. An
          // unconfigured backend (authSnapshot.status === 'unavailable')
          // does NOT reach this branch: authGateLocked stays true for it
          // (see applyLegacyAuthSnapshot), same as a real signed-out guest --
          // confirmed live, the gate correctly locks either way.
          this.overlay = 'none';
          this.uiDirty = true;
          this.rebuildUi();
        }
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
    this.syncLegacyAuthOpeningTimeout(time);
    this.syncLegacyAuthGateLoadingScreen(time);
    this.recordRuntimeFrame(delta);
    if (this.overlay === 'auth') {
      // Auth owns the full screen. The level announcer sits above the normal
      // overlay depth, so freezing simulation alone can strand its current
      // frame over an input field. Hide both announcer layers explicitly.
      this.levelAnnouncerLabelText.setVisible(false);
      this.levelAnnouncerNumberGraphics.setVisible(false);
      // Bug fix: every call site that hides the level-announcer's number
      // used to only hide levelAnnouncerNumberGraphics -- the tile-font
      // Image pool (drawLegacyTileFontWord) added alongside it was never
      // included, so the number kept showing (e.g. over the auth/login
      // overlay) whenever it happened to already be visible the instant one
      // of these paths ran.
      this.levelAnnouncerNumberGlyphPool.forEach((image) => image.setVisible(false));
      this.expireLegacyPlayerMessages(time);
      this.drawLegacyPlayerMessageToast(time);
      for (const button of this.uiButtons) {
        button.updateFrame?.(time);
      }
      const uiRebuilt = this.uiDirty;
      if (uiRebuilt) {
        this.rebuildUi();
      }
      this.publishVisualDiagnostics(time, uiRebuilt);
      this.publishRuntimeDiagnostics(time);
      return;
    }
    this.updateStars(time, delta);
    this.expireLegacyPlayerMessages(time);
    this.drawLegacyPlayerMessageToast(time);
    this.advanceLegacyOverlayScrollMomentum(delta);
    for (const button of this.uiButtons) {
      button.updateFrame?.(time);
    }

    this.holdLegacyPlayMazeLifecycleDuringPause(time);
    this.updateLegacyFlowFeedback(time);

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

    // Real Auth resolves asynchronously after the menu placeholder is built.
    // Keep that placeholder inert until access resolves, including a pending
    // direct-to-play boot, so it cannot record an incidental AI completion.
    // The demo walker keeps moving behind non-auth menu overlays -- there's no gameplay to
    // protect there, it's just ambient background motion, so it now keeps
    // playing behind Settings instead of visibly freezing/hitching each time a
    // setting changes. Auth returns above: no game or ambient simulation runs
    // behind the forced account screen.
    if (
      this.mode === 'menu'
      && !this.authGateAwaitingResolution
      && !this.authGateLocked
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
    // Player locator: a find-me ping on spawn / unpause / next level and after the player idles. It only forces
    // redraws while a ping is on screen (plus the one that clears it).
    this.updateLegacyPlayerLocator(time);
    if (this.playerLocatorState.needsRedraw()) {
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
    // The centered level announcer is purely time-driven, same class of bug
    // as the settings cog's blink above -- without this it would freeze
    // between whatever else happens to re-arm boardDynamicDirty. Its alpha
    // is a pure function of external phase state this code doesn't control
    // the transition frame of -- the
    // read right here can already see 0 the instant phase flips away from
    // 'deconstructing', with no draw ever having run to actually hide the
    // text that was left visible. levelAnnouncerWasVisible carries the
    // previous check's answer forward one extra frame so that exact
    // fade-to-invisible transition still gets drawn instead of freezing the
    // text on screen indefinitely.
    const levelAnnouncerActive = this.resolveLegacyLevelAnnouncerVisualState(time).alpha > 0;
    if (
      levelAnnouncerActive
      || this.levelAnnouncerWasVisible
    ) {
      this.boardDynamicDirty = true;
    }
    this.levelAnnouncerWasVisible = levelAnnouncerActive;
    // The spawn burst and completion transfer share the existing spawn clock
    // (the transfer state now only drives the player's departure fade).
    this.settleLegacyPlayerTransferEnergy(time);
    // drawDynamicBoard is dirty-flag-gated, so the laser graphics (cleared at
    // the top of every drawDynamicBoard) need exactly one more redraw on the
    // falling edge (was active last frame, isn't now) or the last beam frame
    // would stay on screen: same for the departure beams (edgeBeamWasFiring).
    const spawnBurstActiveNow = this.resolveLegacyPlayerSpawnBurstState(time).active;
    if (
      spawnBurstActiveNow
      || this.resolveLegacyPlayerTransferState(time).active
      || this.playerSpawnBurstWasActiveForRedraw
      || this.edgeBeamWasFiring
      || this.edgeRingActive
    ) {
      this.boardDynamicDirty = true;
    }
    this.playerSpawnBurstWasActiveForRedraw = spawnBurstActiveNow;
    // Menu mode's settings cog (drawLegacyMenuSettingsCog) has the exact
    // same time-driven blink as play mode's, but it's drawn inside
    // drawBoardPaths, gated by boardPathDirty -- a flag neither of the two
    // play-mode fixes above ever re-arms. The menu demo AI's own movement
    // keeps it mostly covered, but during any hold/pause between moves
    // nothing else touches boardPathDirty, so the cog freezes and then
    // jumps on the next AI-move redraw -- the identical "glitchy while
    // idle" symptom the play-mode cog had before its own fix, just gated
    // on a dirty flag that fix never covered.
    if (this.mode === 'menu' && this.overlay === 'none' && !this.prefersLegacyReducedMotion()) {
      this.boardPathDirty = true;
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
    const backdropSignatureCount = starCount;
    const movingBackdropActorCount = this.settings.toggleAnimatedBackdrop && !this.prefersLegacyReducedMotion()
      ? starCount
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
    const diagnosticsPlayerTrack = this.progressionState.tracks.player;
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
      LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO,
      LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO,
      LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO,
      LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO
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
        invalidFields: [...this.authInvalidFields],
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
            progressionCompletedCycles: diagnosticsPlayerTrack.completedCycles,
            // Diagnostics only: progression evidence exists. It no longer affects speed (constant-speed owner request).
            progressionContextApplied: compareLegacyProgressionOrdinals(diagnosticsPlayerTrack.completedCycles, '0') > 0,
            progressionLevel: resolveLegacyProgressionLevel(diagnosticsPlayerTrack.targetComplexity),
            progressionPaceScore: diagnosticsPlayerTrack.paceScore,
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
          shards: 0,
          glassShards: 0,
          driftRunes: 0,
          sigils: 0,
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
      this.handleLegacyPageLeave('window-blur');
    };
    this.legacyPlayVisibilityChangeHandler = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        this.handleLegacyPlayInputFocusLoss();
        this.handleLegacyPageLeave('visibility-hidden');
      } else {
        this.handleLegacyPageReturn('visibility-visible');
      }
    };
    this.legacyPlayPageHideHandler = () => {
      this.handleLegacyPlayInputFocusLoss();
      this.handleLegacyPageLeave('page-hide');
    };
    this.legacyPlayPageShowHandler = () => {
      this.handleLegacyPageReturn('page-show');
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.legacyPlayWindowBlurHandler);
      window.addEventListener('pagehide', this.legacyPlayPageHideHandler);
      window.addEventListener('pageshow', this.legacyPlayPageShowHandler);
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
    if (typeof window !== 'undefined' && this.legacyPlayPageHideHandler !== null) {
      window.removeEventListener('pagehide', this.legacyPlayPageHideHandler);
    }
    if (typeof window !== 'undefined' && this.legacyPlayPageShowHandler !== null) {
      window.removeEventListener('pageshow', this.legacyPlayPageShowHandler);
    }
    if (typeof document !== 'undefined' && this.legacyPlayVisibilityChangeHandler !== null) {
      document.removeEventListener('visibilitychange', this.legacyPlayVisibilityChangeHandler);
    }
    this.legacyPlayWindowBlurHandler = null;
    this.legacyPlayVisibilityChangeHandler = null;
    this.legacyPlayPageHideHandler = null;
    this.legacyPlayPageShowHandler = null;
    this.legacyPlayFocusGuardAttached = false;
  }

  // A tap Phaser did not route to any object because the buttons were rebuilt
  // in the previous step (its hit-test list only refreshes in preUpdate, after
  // the queued pointer events are processed). Re-targets it to the current
  // front-door buttons so the tap is accepted instead of silently dropped.
  private recoverTapAfterUiRebuild(pointer: Phaser.Input.Pointer, overCount: number): boolean {
    if (!shouldRecoverLegacyTapAfterUiRebuild({
      currentFrame: this.game.getFrame(),
      mode: this.mode,
      overCount,
      overlay: this.overlay,
      rebuildFrame: this.uiRebuiltAtFrame
    })) {
      return false;
    }

    const candidates = this.uiButtons.flatMap((button, index) => {
      if (!button.background.active || !button.background.visible || button.background.input?.enabled !== true) {
        return [];
      }
      const rect = button.background.getBounds();
      return [{
        bottom: rect.bottom,
        depth: button.background.depth,
        index,
        left: rect.left,
        right: rect.right,
        top: rect.top
      }];
    });
    const targetIndex = resolveLegacyTapRecoveryTarget(pointer.x, pointer.y, candidates);
    const target = targetIndex === null ? undefined : this.uiButtons[targetIndex];
    if (target === undefined) {
      return false;
    }

    target.background.emit('pointerdown', pointer, pointer.x, pointer.y, pointer.event);
    return true;
  }

  private installInput(): void {
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      this.handleLegacyKeyboardDown(event);
    });

    this.input.keyboard?.on('keyup', (event: KeyboardEvent) => {
      this.handleLegacyPlayMovementKeyUp(event);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[] = []) => {
      if (this.recoverTapAfterUiRebuild(pointer, currentlyOver.length)) {
        return;
      }
      if (this.handleOverlayBackChevronPointerDown(pointer)) {
        return;
      }
      if (this.handleOverlayScrimPointerDown(pointer, currentlyOver.length)) {
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
    // Swallow gameplay keys during the goal-reset chain, but never while an
    // overlay is open: a run paused inside the goal hold (cog tap, or the
    // hidden-tab auto-pause) must still be resumable from the keyboard.
    // Swallowing P/Esc there left the pause card with no keyboard way out.
    if (this.overlay === 'none' && hasPendingLegacyResetRequest(this.pendingResetRequest)) {
      this.resetLegacyPlayInputBuffer();
      return true;
    }

    // Any key (movement, Enter, ...) skips a still-running Play intro.
    this.skipLegacyIntroIfBuilding(this.time.now);

    if (this.handleLegacyPlayMovementKeyDown(event)) {
      return true;
    }

    if (event.repeat) {
      return false;
    }

    if (
      this.overlay !== 'none'
      && (this.handleOverlayFieldInput(event) || this.handleLegacyAuthFieldInput(event) || this.handleAccountUsernameFieldInput(event))
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

    if (lowerKey === 'q' && this.mode === 'play' && this.overlay === 'pause' && !this.settingsGuideOpen) {
      event.preventDefault();
      this.pressLegacyQuitToMenu();
      return true;
    }

    if (lowerKey === 't' && this.mode === 'play' && (this.overlay === 'none' || this.overlay === 'pause')) {
      event.preventDefault();
      this.applyOverlayToggleFieldChange('toggleTrailFade');
      return true;
    }

    if (event.key === 'Enter' && this.mode === 'menu' && this.overlay === 'none') {
      event.preventDefault();
      if (this.hasLegacyPlayAccess()) {
        this.startPlayMode();
      }
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

  // One scene-level route owns the back action. Phaser's object hit testing
  // and the fixed pause-control fallback disagree on the top-right canvas
  // edge on some real devices, so leaving the callback on the invisible
  // rectangle made the visible arrow's upper half unreliable.
  private handleOverlayBackChevronPointerDown(pointer: Phaser.Input.Pointer): boolean {
    if (
      this.overlay === 'none'
      || this.overlayBackChevronBounds === null
      || this.overlayBackChevronAction === null
    ) {
      return false;
    }
    const point = this.resolveLegacyInputPointerPoint(pointer);
    if (!this.isPointInVisualRect(
      this.overlayBackChevronBounds,
      point.x,
      point.y,
      LEGACY_OVERLAY_BACK_CHEVRON_PRIORITY_PADDING
    )) {
      return false;
    }
    this.overlayBackChevronAction();
    return true;
  }

  // Menu Settings and the Leaderboard have no Close pill: besides the primary Back to Menu row and
  // Escape, a tap on the dimmed scrim outside the card closes them. Only the
  // un-covered scrim counts (nothing under the pointer, outside the card), and
  // never the Guide sub-view, which keeps its own Got it exit.
  private handleOverlayScrimPointerDown(pointer: Phaser.Input.Pointer, objectsUnderPointer: number): boolean {
    if (
      (this.overlay !== 'options' && this.overlay !== 'leaderboard')
      || this.settingsGuideOpen
      || this.overlayScrimCloseBounds === null
      || objectsUnderPointer > 0
    ) {
      return false;
    }
    const point = this.resolveLegacyInputPointerPoint(pointer);
    if (this.isPointInVisualRect(this.overlayScrimCloseBounds, point.x, point.y)) {
      return false;
    }
    this.handleBackAction();
    return true;
  }

  private handleLegacyQaStartGuestPlayMode(): LegacyQaOverlayResult {
    const base = {
      mode: this.mode,
      overlay: this.overlay
    };

    if (this.mode !== 'menu' || this.overlay !== 'auth') {
      return {
        ...base,
        accepted: false,
        reason: this.mode !== 'menu' ? 'not-menu-mode' : 'auth-overlay-required'
      };
    }

    if (
      this.authSubmitting
      || this.authGateAwaitingResolution
      || this.authSnapshot.status === 'authenticated'
      || !LEGACY_GUEST_PLAY_ACCESS_ENABLED
    ) {
      return {
        ...base,
        accepted: false,
        reason: 'guest-action-unavailable'
      };
    }

    // The diagnostics bridge intentionally calls the same user-facing action
    // as the visible guest button; it never grants access on its own.
    this.handleLegacyGuestPlay();
    return {
      accepted: true,
      mode: this.mode,
      overlay: this.overlay,
      reason: null
    };
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
    // A tap skips a still-running Play intro.
    this.skipLegacyIntroIfBuilding(this.time.now);
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
    // The fixed play controls must not intercept an overlay action. In
    // particular, the pause cog's top-right footprint overlaps the Settings
    // back chevron; letting this handler run first made a tap on the visible
    // arrow register only below it on real devices.
    if (
      this.mode !== 'play'
      || this.overlay !== 'none'
      || hasPendingLegacyResetRequest(this.pendingResetRequest)
    ) {
      return false;
    }

    const touchControlLayout = this.resolveLegacyPlayTouchControlLayout();
    const control = resolveTouchControlKindAtPoint(touchControlLayout, x, y);

    if (control === 'pause') {
      this.openOverlay('pause');
      return true;
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

    return movementDelayMs;
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
    // Constant speed: only the Move Speed setting matters (progression never changes it).
    return resolveLegacyMovementSpeedProfile(this.settings.movementSpeed);
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
    // Derived from the live repeat interval (stick-capped) and never longer than it; see playerMotionTiming.ts.
    return resolvePlayerGlideDurationMs({
      repeatIntervalMs: this.resolveLegacyPlayMovementSpeedProfile().repeatIntervalMs,
      stickActive: this.playTouchStickPointerId !== null,
      stickRepeatIntervalMaxMs: LEGACY_PLAY_STICK_REPEAT_INTERVAL_MAX_MS
    });
  }

  private armLegacyWallBump(deltaX: number, deltaY: number): void {
    if (this.prefersLegacyReducedMotion() || (deltaX === 0 && deltaY === 0)) {
      return;
    }
    const now = this.time.now;
    this.wallBump = { startedAtMs: now, deltaX, deltaY };
    this.boardDynamicDirty = true;
    if (shouldBuzzWallBump(now, this.lastWallBumpBuzzAtMs, false)) {
      this.lastWallBumpBuzzAtMs = now;
      this.triggerLegacyHapticPulse(LEGACY_HAPTIC_PATTERNS.wallBump);
    }
  }

  private resolveLegacyWallBumpNudge(time: number): { x: number; y: number } {
    const bump = this.wallBump;
    if (bump === null) {
      return { x: 0, y: 0 };
    }
    if (time - bump.startedAtMs >= WALL_BUMP_DURATION_MS) {
      this.wallBump = null;
      return { x: 0, y: 0 };
    }
    return resolveWallBumpNudge(time - bump.startedAtMs, bump.deltaX, bump.deltaY, this.prefersLegacyReducedMotion());
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
    const step = this.playDirectionalIntent.step(this.maze, this.player, {
      assistedLaneShiftEnabled: true
    });
    if (!step.moved) {
      if (step.decision === 'stopped-at-dead-end' || step.decision === 'stopped-at-assist-limit') {
        // The held direction is walled: nudge toward the wall (MAZER-MOTION-003).
        const blocked = this.playDirectionalIntent.getDiagnostics().activeDirection;
        if (blocked !== null) {
          this.armLegacyWallBump(
            blocked === 'right' ? 1 : blocked === 'left' ? -1 : 0,
            blocked === 'down' ? 1 : blocked === 'up' ? -1 : 0
          );
        }
      }
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

  // The page went away (tab hidden, app backgrounded, page-hide, window
  // blur). A live run pauses itself; it never resumes by itself -- the player
  // taps Resume. Only opens Pause when no overlay is open, so two overlays
  // can never stack, and the lifecycle hold (see
  // holdLegacyPlayMazeLifecycleDuringPause) then freezes the intro/outro,
  // reset/generation deadlines and the run timer for the whole interval.
  private handleLegacyPageLeave(signal: LegacyPageLeaveSignal): void {
    this.legacyPageVisibility = reduceLegacyPageVisibilityOnLeave(this.legacyPageVisibility, signal);
    if (shouldAutoPauseLegacyRun({ mode: this.mode, overlay: this.overlay })) {
      this.openOverlay('pause');
    }
  }

  private handleLegacyPageReturn(signal: LegacyPageReturnSignal): void {
    this.legacyPageVisibility = reduceLegacyPageVisibilityOnReturn(this.legacyPageVisibility, signal);
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
      if (this.isLegacyPasswordRecoveryActive()) {
        void this.handleLegacyPasswordRecoveryPrimaryAction();
      } else {
        void this.handleLegacyAuthSubmit();
      }
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
      this.settings.scale,
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
    // MAZER-FLOW-008: the layout above is the refit of the unchanged maze. An
    // aspect flip mid-run pauses; the sheet then asks to rotate back if the
    // refit corridor (one tile) is too thin. The maze regenerates next level.
    const orientationFlip = resolveLegacyOrientationFlip({
      mode: this.mode,
      nextLandscape: isLegacyLandscapeViewport(width, height),
      overlay: this.overlay,
      previousLandscape: this.legacyViewportLandscape
    });
    this.legacyViewportLandscape = isLegacyLandscapeViewport(width, height);
    if (orientationFlip.autoPause) {
      this.openOverlay('pause');
      this.orientationFlipOriginLandscape = !isLegacyLandscapeViewport(width, height);
    }
    this.footerText.setPosition(this.layout.width / 2, this.layout.footerY);

    this.boardStaticDirty = true;
    this.boardPathDirty = true;
    this.boardDynamicDirty = true;
    this.backdropDirty = true;
    this.uiDirty = true;
    // A geometry change is a real state change: the next diagnostics publish
    // must not wait out the throttle (it used to report the previous
    // orientation's board and player screen coordinates for up to 1.5 s).
    this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
  }

  // Probes the current viewport's available board box (independent of any
  // maze already generated) and returns the width:height cell-count ratio a
  // freshly generated maze should target so it naturally fills that box on
  // both axes, instead of being square and then fit into a non-square box
  // after the fact (see resolveLegacyMenuBoardAspectRatio for the box math).
  // knownCellScale should be this same mode's resolveLegacyProgressionScaleForMode()
  // result, computed by the caller first. Without it this returns only the
  // pre-generation estimate (a guess at the eventual bleedMargin using a
  // rough cell-count stand-in) -- the same guess resolveLegacyMenuLayout's
  // own real, post-generation margin can drift away from on narrow
  // viewports with a real safe-area-bottom inset, since the estimate has no
  // way to know the box's real proportions ahead of generation. With it,
  // this refines once more: seed a candidate mazeWidth/mazeHeight from that
  // estimate (the exact same conversion real generation itself performs,
  // see resolveLegacyMazeDimensionsForScale), run those candidates through
  // the REAL resolveLegacyMenuLayout, and return the actual resulting
  // board's own proportions instead of the estimate -- self-consistent
  // with what will really be drawn, not a guess about it. Omit
  // knownCellScale only where scale genuinely isn't known yet (e.g. scale's
  // own internal viewport cap search, which needs an aspect ratio to seed
  // ITS candidate search before it has resolved a real scale itself).
  private resolveLegacyBoardAspectRatioForMode(mode: RuntimeMode, knownCellScale?: number): number {
    const viewportGeometry = readMazerViewportGeometry();
    const width = viewportGeometry.fullBleed.width;
    const height = viewportGeometry.fullBleed.height;
    const layoutSurface = mode === 'play' ? 'play' : 'menu';
    const boardScale = this.settings.scale;
    const layoutOptions = {
      browserMobileParity: this.resolveLegacyBrowserMobileParity(width, height),
      knownCellScale,
      menuActionMode: this.authSnapshot.status === 'authenticated' ? 'authenticated' : 'guest',
      safeArea: viewportGeometry.safeArea,
      useFloatingTouchControls: true
    } as const;
    const seedAspectRatio = resolveLegacyMenuBoardAspectRatio(width, height, boardScale, layoutSurface, layoutOptions);

    if (knownCellScale === undefined) {
      return seedAspectRatio;
    }

    const ratioRoot = Math.sqrt(seedAspectRatio);
    const candidateWidth = Math.max(1, Math.round(knownCellScale * ratioRoot));
    const candidateHeight = Math.max(1, Math.round(knownCellScale / ratioRoot));
    const candidateLayout = resolveLegacyMenuLayout(width, height, boardScale, candidateWidth, candidateHeight, layoutSurface, layoutOptions);
    if (candidateLayout.boardWidth <= 0 || candidateLayout.boardHeight <= 0) {
      return seedAspectRatio;
    }

    return clamp(candidateLayout.boardWidth / candidateLayout.boardHeight, 0.45, 2.2);
  }

  private applyGenerationRequest(request: LegacyGenerationRequest, nextDemoMoveAtMs = 0): void {
    // The authoritative maze-install boundary -- every path that replaces
    // the active menu episode (menu-return, overlay-rebuild, missing-
    // episode recovery, boot-menu, and the legitimate menu-demo-goal-reset
    // itself) funnels through here, so this is where stale deferred menu-
    // demo transition state actually needs to be invalidated, not at each
    // individual call site that might replace a maze. enterMenuMode's and
    // startPlayMode's own calls (PR #316) stay as defense in depth for the
    // one instant between a mode switch and its own generation request
    // reaching this method, not because this call alone is insufficient.
    //
    // Safe for the legitimate menu-demo-goal-reset request too: by the
    // time that request reaches here, armLegacyMenuStaticDeconstructStage
    // already consumed both pendingMenuDemoDeconstructArmAtMs (nulled
    // before it's even called, in updateMenuDemo) and
    // pendingLegacyDeconstructResetMaze (nulled by
    // consumeLegacyDeconstructResetMaze, called from inside
    // armLegacyMenuStaticDeconstructStage) -- this call is a no-op for that
    // path, not a discard of the maze this very call is about to install.
    this.clearPendingLegacyMenuDemoResetTransition();
    const generationState = consumeLegacyGenerationRequestState(request, request.budget.scale);
    this.mode = request.mode;
    this.mazeSeed = request.seed;
    this.maze = generationState.maze;
    this.titleGraphics.setVisible(generationState.titleVisible);
    this.menuDemoEpisode = this.mode === 'menu' ? createLegacyDemoWalkerEpisode(this.maze) : null;
    if (this.mode === 'menu') {
      // MAZER-FLOW-007: the menu demo is an independent attract loop. Its
      // board and the AI walker's simulated skill both come from the
      // ai-runner track (one level per completed demo maze), never from the
      // PLAYER's track -- see resolveLegacyGenerationTrack.
      const menuTrack = resolveLegacyGenerationTrack(this.progressionState, 'menu');
      const bootstrap = createLegacyMenuDemoBootstrap(
        this.maze,
        this.settings.toggleTrailFade,
        TRAIL_FADE_TAIL,
        {
          aiSkillLevel: resolveLegacyProgressionLevel(menuTrack.targetComplexity),
          aiSkillRank: menuTrack.rank
        }
      );
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
    } else {
      this.menuDemoConfig = createLegacyMenuDemoWalkerConfig(this.maze.seed);
      this.menuDemoState = null;
      this.player = generationState.initialPlayer;
      this.syncLegacyPlayerVisualMotionTo(generationState.initialPlayer);
      this.trail = generationState.initialTrail;
      this.trailAnimationElapsedMs = 0;
      this.trailAnimationLastRealMs = null;
      this.trailShineLapStartedAtMs = 0;
      this.trailShineLapCycleLength = 0;
      this.trailOriginAdvanceDistancePx = 0;
      this.lastTrailOriginPoint = null;
      this.hasPlayerEverLeftStart = false;
      this.playCyclePath = generationState.initialTrail.map(copyPoint);
      this.playCycleResetUsed = false;
      this.playCompletedAtMs = null;
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
      ? this.explicitRuntimeMazeSeed
        ? this.mazeSeed
        : this.createFreshLegacyPlayGenerationSeed()
      : undefined;
    const generationScale = this.resolveLegacyProgressionScaleForMode(mode);
    this.applyGenerationRequest(
        createLegacyGenerationRequest({
          aspectRatio: this.resolveLegacyBoardAspectRatioForMode(mode, generationScale),
          currentSeed: this.mazeSeed,
          dueAtMs: this.time.now,
          generationProfile: this.resolveLegacyMazeGenerationProfileForMode(mode),
          mode,
          queuedAtMs: this.time.now,
          reason: mode === 'play' ? 'play-start' : 'boot-menu',
          scale: generationScale,
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
    const completedCyclesSeed = resolveLegacyProgressionOrdinalSeedComponent(playerTrack.completedCycles, 1_000_003);
    const levelSeed = resolveLegacyProgressionOrdinalSeedComponent(playerTrack.level, 1_000_033);
    const progressionSalt = (
      (playerTrack.targetComplexity * 1009)
      + (completedCyclesSeed * 9176)
      + (levelSeed * 313)
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

  // Salted from the menu demo's own ai-runner track (MAZER-FLOW-007), so each
  // completed demo maze moves the salt along with the demo's level. Keeps a
  // distinct multiplier set (and its own createLegacyRuntimeRandomSeed call)
  // from createFreshLegacyPlayGenerationSeed so the demo generates a different
  // maze instance than whatever the player's live board is.
  private createFreshLegacyMenuGenerationSeed(): number {
    const menuTrack = resolveLegacyGenerationTrack(this.progressionState, 'menu');
    const completedCyclesSeed = resolveLegacyProgressionOrdinalSeedComponent(menuTrack.completedCycles, 1_000_003);
    const levelSeed = resolveLegacyProgressionOrdinalSeedComponent(menuTrack.level, 1_000_033);
    const progressionSalt = (
      (menuTrack.targetComplexity * 1151)
      + (completedCyclesSeed * 7219)
      + (levelSeed * 433)
      + (menuTrack.paceScore * 41)
    );
    const seed = createLegacyRuntimeRandomSeed({
      nowMs: Math.round(this.time.now + progressionSalt),
      previousSeed: this.mazeSeed
    });

    return seed === this.mazeSeed || seed === menuTrack.lastMazeSeed
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
      precompute?: boolean;
      precomputedMazeOverride?: LegacyMazeSnapshot;
      seedOverride?: number;
      stepSeed?: boolean;
    } = {}
  ): void {
    const mode = options.mode ?? this.mode;
    const generationScale = this.resolveLegacyProgressionScaleForMode(mode);
    this.pendingGenerationRequest = createLegacyGenerationRequest({
      aspectRatio: this.resolveLegacyBoardAspectRatioForMode(mode, generationScale),
      currentSeed: this.mazeSeed,
      dueAtMs: this.time.now + Math.max(0, delayMs),
      generationProfile: this.resolveLegacyMazeGenerationProfileForMode(mode),
      mode,
      ...(options.precompute !== undefined ? { precompute: options.precompute } : {}),
      ...(options.precomputedMazeOverride !== undefined ? { precomputedMazeOverride: options.precomputedMazeOverride } : {}),
      queuedAtMs: this.time.now,
      reason,
      scale: generationScale,
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
  // Border cells that own a wrap/bleed dock belong to the atomic edge-path
  // group: they are shown/hidden together with the dock strips, never by the
  // gradual BFS reveal/dissolve.
  private isLegacyEdgePathCellShown(point: LegacyPoint): boolean {
    return isEdgePathCellShown(
      this.legacyEdgePathsVisible,
      this.resolveBleedOffDockVisualEligibility().has(legacyScenePointKey(point))
    );
  }

  private isLegacyMenuPointVisibleInStaticDraw(point: LegacyPoint): boolean {
    if (!this.isLegacyEdgePathCellShown(point)) {
      return false;
    }
    const tileLimit = this.resolveLegacyMenuStaticDrawTileLimit();
    const visibleByTileLimit = tileLimit === null
      || this.menuStaticDrawVisibleTileKeys.has(legacyScenePointKey(point));
    if (visibleByTileLimit) {
      return true;
    }

    // A null row limit means the row counter is not part of this stage (the deconstruct), not "show all":
    // see isBoardCellRevealed. Markers/player on a dissolved tile must go with it.
    const rowLimit = this.resolveLegacyMenuStaticDrawRowLimit();
    return rowLimit !== null && point.y < rowLimit;
  }

  private buildLegacyMenuStaticDrawTileOrder(): LegacyPoint[] {
    return buildLegacyMazeRevealOrder(this.maze);
  }

  private resolveLegacyMenuStaticDrawDemoGateAtMs(): number {
    const drawStage = this.resolveLegacyMenuStaticDrawStage();
    if (drawStage?.executionKind !== 'row-slice') {
      return this.time.now;
    }

    // The demo walker waits for the same instant the intro unlocks input
    // (the reveal end, a pure function of the tile count).
    return this.time.now + resolveIntroInputUnlockMs(this.prefersLegacyReducedMotion(), this.menuStaticDrawTileOrder.length);
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

  // Tiles are gone resolveOutroTilesEndMs(N) after the arm instant (a pure
  // function of the tile count, see resolveIntroDeconstruct); the handoff beat
  // is added by callers.
  private resolveLegacyMenuStaticDeconstructDurationMs(): number {
    return this.prefersLegacyReducedMotion() ? 0 : resolveOutroTilesEndMs(this.menuStaticDrawTileOrder.length);
  }

  // The one place the building phase's time-derived presentation state is
  // resolved: tiles, level digit, bleed docks, spawn laser and input unlock
  // all read this instead of keeping their own counters or estimates. Null
  // outside a real row-slice build.
  private resolveLegacyIntroState(time: number): IntroState | null {
    if (this.menuStaticDrawLifecyclePhase !== 'building' || this.introStartedAtMs === null) {
      return null;
    }

    return resolveIntro(time - this.introStartedAtMs, {
      digitAlreadyVisible: this.levelAnnouncerBuildFadeOutArmed,
      reducedMotion: this.prefersLegacyReducedMotion(),
      tileCount: this.menuStaticDrawTileOrder.length
    });
  }

  // The same intro clock, but still resolvable after the build has settled so
  // the diamond ring's fade-out (RING_ENERGY_FADE_MS after the reveal end) and
  // the wrap-end lighting window (reveal end .. done) play out and the LAST
  // redraw clears them. Null once the intro is over or the maze deconstructs.
  private resolveLegacyEdgeRingIntroState(time: number): IntroState | null {
    if (
      this.introStartedAtMs === null
      || (this.menuStaticDrawLifecyclePhase !== 'building' && this.menuStaticDrawLifecyclePhase !== 'settled')
    ) {
      return null;
    }

    return resolveIntro(time - this.introStartedAtMs, {
      digitAlreadyVisible: this.levelAnnouncerBuildFadeOutArmed,
      reducedMotion: this.prefersLegacyReducedMotion(),
      tileCount: this.menuStaticDrawTileOrder.length
    });
  }

  // The deconstruct mirror of resolveLegacyIntroState (<= 900 ms with the
  // handoff beat), measured from the arm instant.
  private resolveLegacyOutroState(time: number): OutroState | null {
    if (this.menuStaticDrawLifecyclePhase !== 'deconstructing' || this.menuStaticDeconstructStartedAtMs === null) {
      return null;
    }

    return resolveIntroDeconstruct(time - this.menuStaticDeconstructStartedAtMs, {
      reducedMotion: this.prefersLegacyReducedMotion(),
      tileCount: this.menuStaticDrawTileOrder.length
    });
  }

  private resolveLegacyMenuDeconstructTrailAlpha(time: number): number {
    if (this.menuStaticDrawLifecyclePhase !== 'deconstructing' || this.menuStaticDeconstructStartedAtMs === null) {
      return 1;
    }

    const fadeElapsedMs = time
      - this.menuStaticDeconstructStartedAtMs
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

    const removeElapsedMs = time - this.menuStaticDeconstructStartedAtMs;
    if (removeElapsedMs <= 0) {
      return 1;
    }

    return clamp(1 - (removeElapsedMs / LEGACY_MENU_DECONSTRUCT_PLAYER_REMOVE_MS), 0, 1);
  }

  // Deliberately does NOT require pendingGenerationRequest to already carry
  // a deconstruct reason (resolveLegacyMenuDeconstructHandoffEndsAtMs below
  // still factors it in when present, via Math.max) -- the follow-up
  // generation request isn't always queued in the same frame tiles hit
  // zero, and gating the animation on its presence meant the burst sat
  // frozen at progress 0 for however long that gap lasted, then jumped
  // straight to whatever the elapsed-time formula already worked out to
  // the instant the request appeared, instead of ticking up smoothly the
  // whole time. menuStaticDeconstructZeroHoldStartedAtMs is only ever set
  // from the one call site that means "tile removal just hit zero", so it's
  // sufficient on its own to know this hold has genuinely started.
  private resolveLegacyMenuDeconstructHandoffProgress(time: number): number {
    if (
      this.menuStaticDrawLifecyclePhase !== 'deconstructing'
      || !this.isLegacyMenuDeconstructVisualHandoffReady()
      || this.menuStaticDeconstructZeroHoldStartedAtMs === null
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
      // Each completed build owns one fresh inbound volley. Leaving the old
      // timestamp in place makes every maze after the first inherit an
      // already-expired burst, so no lasers are visible at the real final
      // construction step.
      this.playerSpawnBurstStartedAtMs = null;
      this.menuStaticDrawLifecyclePhase = 'building';
      this.legacyEdgePathsVisible = false;
      this.menuStaticDeconstructStartedAtMs = null;
      this.menuStaticDeconstructZeroHoldStartedAtMs = null;
      this.menuStaticBuildPrerollStartedAtMs = buildPrerollStartedAtMs;
      this.introStartedAtMs = buildPrerollStartedAtMs;
      // The row counter is retired as a REVEAL (the BFS tile order is the one
      // reveal); rowsVisible stays 0 for the whole build purely as the
      // "staged build still in progress" flag its many readers key on, and is
      // nulled at the input-unlock instant by advanceLegacyMenuStaticDrawStage.
      this.menuStaticDrawRowsVisible = 0;
      this.menuStaticDrawTileOrder = this.buildLegacyMenuStaticDrawTileOrder();
      this.menuStaticDrawTilesVisible = 0;
      this.refreshLegacyMenuStaticDrawVisibleTileKeys();
      this.titleGraphics.clear();
      return;
    }

    this.menuStaticDrawLifecyclePhase = 'idle';
    this.legacyEdgePathsVisible = true;
    this.menuStaticDrawRowsVisible = null;
    this.menuStaticDrawTileOrder = [];
    this.menuStaticDrawVisibleTileKeys.clear();
    this.menuStaticDrawTilesVisible = null;
    this.menuStaticDeconstructStartedAtMs = null;
    this.menuStaticDeconstructZeroHoldStartedAtMs = null;
    this.menuStaticBuildPrerollStartedAtMs = null;
    this.introStartedAtMs = null;
  }

  // Call at the goal-reached instant (before armLegacyPlayerTransferEnergy /
  // armLegacyMenuStaticDeconstructStage), NOT inside the arm call itself --
  // see pendingLegacyDeconstructResetMaze's own comment for why the timing
  // matters here specifically. Mirrors exactly the scale/profile/aspect
  // ratio/targetComplexity/seed resolution armLegacyMenuStaticDeconstructStage's
  // own branches use, so the maze this builds is not a second, possibly-
  // different generation -- it's the one that call would have built anyway,
  // just started earlier. Every one of those resolvers reads only
  // progressionState / settings / current viewport / the OLD (still active)
  // maze's own tile order, none of which change in the few hundred ms
  // between this call and the arm call consuming its result.
  private precomputeLegacyDeconstructResetMaze(mode: LegacyGenerationMode): void {
    const scale = this.resolveLegacyProgressionScaleForMode(mode);
    const profile = this.resolveLegacyMazeGenerationProfileForMode(mode);
    const aspectRatio = this.resolveLegacyBoardAspectRatioForMode(mode, scale);
    const targetComplexity = this.resolveLegacyTargetComplexityForMode(mode);
    const seed = mode === 'play'
      ? this.createFreshLegacyPlayGenerationSeed()
      : this.createFreshLegacyMenuGenerationSeed();
    // candidateCount: 1 deliberately deviates from the normal default
    // candidate-search selection (3-9 full candidate builds, picked by
    // closest-to-target complexity -- see
    // resolveLegacyGenerationDefaultCandidateCount) ONLY for this call site.
    // This precompute exists specifically to cover a time-critical instant
    // (the player just touched the goal, or the menu demo bot just did) --
    // measured (scripts/analysis/ad-hoc-bench-goal-freeze.mjs, not
    // committed) at 100-150ms with the normal default candidate search at
    // real play scales, an unmissable freeze against the one-frame defer
    // this feeds (see LEGACY_PLAY_GOAL_DECONSTRUCT_PRECOMPUTE_DEFER_MS's own
    // comment). A single candidate measured at roughly 10-30ms typical --
    // still occasionally spikes into the retry path, but a small fraction of
    // the default search's cost either way. The very first maze of a play
    // session (startPlayMode) and the menu's own initial generation are
    // deliberately NOT touched by this -- those happen during a build/
    // reveal animation the player is already watching, not mid-motion, so
    // full candidate-search quality is worth its cost there.
    const maze = createLegacyRuntimeMazeForMode(
      mode,
      scale,
      seed,
      profile,
      { candidateCount: 1, targetComplexity },
      aspectRatio
    );
    this.pendingLegacyDeconstructResetMaze = { mode, seed, maze };
  }

  // Consumes (and clears) a maze precomputeLegacyDeconstructResetMaze already
  // built for this exact mode, if one is waiting. Returns null when none
  // matches, so callers fall back to their own precompute:true path -- a
  // safety net for any deconstruct-triggered reset that didn't call the
  // early precompute (there shouldn't be one, but this keeps that a
  // graceful fallback instead of a silent behavior change if one is ever
  // missed).
  private consumeLegacyDeconstructResetMaze(mode: LegacyGenerationMode): { seed: number; maze: LegacyMazeSnapshot } | null {
    const pending = this.pendingLegacyDeconstructResetMaze;
    if (!pending || pending.mode !== mode) {
      return null;
    }
    this.pendingLegacyDeconstructResetMaze = null;
    return { seed: pending.seed, maze: pending.maze };
  }

  // A menu-demo goal-arrival precompute (see updateMenuDemo's own
  // pendingMenuDemoDeconstructArmAtMs comment) owns the mode it was
  // scheduled for -- 'menu'. Neither field self-invalidates on a mode
  // switch: if the player presses Start inside the 340ms hold window,
  // switches to play, and later returns to the menu, a stale pending arm
  // would otherwise fire on the very next update() the return-to-menu
  // gate (nextDemoMoveAtMs, reset fresh by enterMenuMode's own
  // applyGenerationRequest call) happens to allow through -- deconstructing
  // the brand-new menu maze enterMenuMode just built, unprompted by any
  // real goal arrival, and possibly consuming an equally stale precomputed
  // maze along with it. Call this from every place that installs a new
  // mode/episode the pending fields could otherwise leak across
  // (startPlayMode, enterMenuMode) so a superseded transition can never
  // fire late.
  private clearPendingLegacyMenuDemoResetTransition(): void {
    this.pendingMenuDemoDeconstructArmAtMs = null;
    if (this.pendingLegacyDeconstructResetMaze?.mode === 'menu') {
      this.pendingLegacyDeconstructResetMaze = null;
    }
  }

  private armLegacyMenuStaticDeconstructStage(time: number): void {
    if (this.menuStaticDrawLifecyclePhase === 'deconstructing') {
      return;
    }

    if (this.menuStaticDrawTileOrder.length <= 0) {
      this.menuStaticDrawTileOrder = this.buildLegacyMenuStaticDrawTileOrder();
    }

    this.menuStaticDrawLifecyclePhase = 'deconstructing';
    this.legacyEdgePathsVisible = true;
    this.menuStaticDeconstructStartedAtMs = time;
    // The wrap/bleed edge paths (dock strips + their border cells) vanish ALL
    // AT ONCE at OUTRO_EDGE_PATHS_OFF_MS of this same deconstruct clock
    // (resolveIntroDeconstruct.bleedProgress), and the outbound transfer laser
    // arms on that same instant/clock below -- no retraction animation, so no
    // partial dock or lone border square can be left behind.
    if (this.playerTransferEnergyArmed && this.playerTransferEnergyOutboundStartedAtMs === null) {
      this.playerTransferEnergyOutboundStartedAtMs = time;
      // Fresh session boundary for the real transfer's own pause-offset
      // accumulator (see gameplayTransferPausedDurationMs's own field
      // comment) -- a pause from some earlier, already-finished session
      // must never bleed into this new one.
      this.gameplayTransferPausedDurationMs = 0;
      this.gameplayTransferPauseStartedAtMs = null;
      this.gameplayTransferLastUnpausedTimeMs = null;
    }
    this.menuStaticDeconstructZeroHoldStartedAtMs = null;
    this.menuStaticBuildPrerollStartedAtMs = null;
    this.introStartedAtMs = null;
    this.menuStaticDrawRowsVisible = null;
    this.menuStaticDrawTilesVisible = this.menuStaticDrawTileOrder.length;
    this.refreshLegacyMenuStaticDrawVisibleTileKeys();
    this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    if (this.mode === 'play') {
      const playGenerationScale = this.resolveLegacyProgressionScaleForMode('play');
      // precomputeLegacyDeconstructResetMaze (called at the goal-reached
      // instant, well before this arm call) should already have this ready
      // -- consuming it here means this call does no synchronous generation
      // work of its own, which is what keeps the outbound player-transfer-
      // energy timer and the corridor clock (armed a few lines up) from
      // having their own short wall-clock windows eaten by a build that
      // used to happen right here. precompute: true stays as a fallback for
      // the (should never happen) case where nothing was precomputed.
      const precomputed = this.consumeLegacyDeconstructResetMaze('play');
      this.pendingGenerationRequest = createLegacyPlayResetGenerationRequest({
        aspectRatio: this.resolveLegacyBoardAspectRatioForMode('play', playGenerationScale),
        currentSeed: this.mazeSeed,
        generationProfile: this.resolveLegacyMazeGenerationProfileForMode('play'),
        nowMs: time + this.resolveLegacyMenuStaticDeconstructDurationMs() + LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS,
        ...(precomputed
          ? { precomputedMazeOverride: precomputed.maze, seedOverride: precomputed.seed }
          : { precompute: true, seedOverride: this.createFreshLegacyPlayGenerationSeed() }),
        scale: playGenerationScale,
        targetComplexity: this.resolveLegacyTargetComplexityForMode('play')
      });
    } else {
      const precomputed = this.consumeLegacyDeconstructResetMaze('menu');
      this.queueGenerationRequest(
        'menu-demo-goal-reset',
        this.resolveLegacyMenuStaticDeconstructDurationMs() + LEGACY_MENU_STATIC_DECONSTRUCT_REBUILD_HANDOFF_MS,
        {
          mode: 'menu',
          ...(precomputed
            ? { precomputedMazeOverride: precomputed.maze, seedOverride: precomputed.seed }
            : { precompute: true, seedOverride: this.createFreshLegacyMenuGenerationSeed() }),
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
    const settlingFromBuild = this.menuStaticDrawLifecyclePhase === 'building';
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
    this.legacyEdgePathsVisible = true;
    if (settlingFromBuild) {
      // Normal builds arm the laser from the intro clock on their first
      // frame. This fallback only covers a settle that never went through
      // the intro (laser treated as landing right now).
      this.armLegacyPlayerArrivalForFinalBuildStep(time, -INTRO_LASER_MS);
    }
    this.menuStaticDeconstructStartedAtMs = null;
    this.menuStaticBuildPrerollStartedAtMs = null;
    this.refreshLegacyMenuStaticDrawVisibleTileKeys();
    this.releaseLegacyMenuDemoGateOnStaticDrawSettled(time);
  }

  // Owner-reported (ChatGPT-assisted review 5173052153, anchored to head
  // 1092acc8): the round-7 pause fix froze the transfer's own outbound/
  // delivery clocks (resolveGameplayTransferPausedOffsetMs) but the
  // coupled Play-mode maze reveal/deconstruct/handoff lifecycle kept
  // advancing -- the submitted pause recording shows corridor tiles
  // visibly disappearing between two frames while the pause menu stays
  // open, and a next-maze generation request could be consumed behind the
  // frozen screenshot. This holds that whole lifecycle still for the
  // duration of a Play-mode pause WITHOUT touching `time`, calling
  // this.scene.pause(), or otherwise freezing the scene (Resume UI keeps
  // working): every pending absolute-time deadline and every phase anchor
  // the lifecycle derives progress from is shifted forward by exactly the
  // real frame that elapsed while paused, so every `time >= deadline` /
  // `time - anchor` comparison in advanceLegacyMenuStaticDrawStage, the
  // bleed-dock/handoff/preroll resolvers, and the pending-request
  // consumers yields the same result it did on the last unpaused frame,
  // and on resume each deadline is still exactly as far in the future as
  // when the pause began -- unpaused durations and ordering are unchanged.
  // The same hold now also covers a hidden page / the resume frame after one
  // (legacyLifecycleHold.ts), in both modes, and moves the run timer anchors
  // (playStartedAtMs/playCompletedAtMs) so paused time never counts toward
  // completion time. The rules live in the pure module and its tests.
  // Menu mode never reaches overlay === 'pause', so the demo AI's own
  // goal-reset choreography is completely untouched. The transfer's OWN
  // anchors (playerTransferEnergyOutboundStartedAtMs etc.) are
  // deliberately NOT shifted here -- they are already compensated by
  // resolveGameplayTransferPausedOffsetMs at read time, and shifting them
  // too would double-count.
  private holdLegacyPlayMazeLifecycleDuringPause(time: number): void {
    const previousFrameMs = this.legacyPlayMazeLifecyclePrevFrameMs;
    this.legacyPlayMazeLifecyclePrevFrameMs = time;
    const holdInput = {
      mode: this.mode,
      overlay: this.overlay,
      pageVisibility: this.legacyPageVisibility
    };
    this.legacyLifecycleHeldThisFrame = isLegacyLifecycleHeld(holdInput);
    const frameDeltaMs = previousFrameMs === null
      ? 0
      : resolveLegacyLifecycleHoldMs({ ...holdInput, frameDeltaMs: time - previousFrameMs });
    this.legacyPageVisibility = consumeLegacyResumeFrame(this.legacyPageVisibility);
    if (frameDeltaMs <= 0) {
      return;
    }
    if (this.menuStaticDeconstructStartedAtMs !== null) {
      this.menuStaticDeconstructStartedAtMs += frameDeltaMs;
    }
    if (this.menuStaticDeconstructZeroHoldStartedAtMs !== null) {
      this.menuStaticDeconstructZeroHoldStartedAtMs += frameDeltaMs;
    }
    if (this.menuStaticBuildPrerollStartedAtMs !== null) {
      this.menuStaticBuildPrerollStartedAtMs += frameDeltaMs;
    }
    if (this.introStartedAtMs !== null) {
      this.introStartedAtMs += frameDeltaMs;
    }
    if (this.pendingGenerationRequest !== null) {
      this.pendingGenerationRequest = {
        ...this.pendingGenerationRequest,
        dueAtMs: this.pendingGenerationRequest.dueAtMs + frameDeltaMs
      };
    }
    if (this.pendingResetRequest !== null) {
      this.pendingResetRequest = {
        ...this.pendingResetRequest,
        dueAtMs: this.pendingResetRequest.dueAtMs + frameDeltaMs
      };
    }
    if (this.mode === 'play') {
      // The run timer feeds completion time (pace scoring): a paused or
      // hidden interval must not count. Start and completion move together
      // so an already-completed run keeps its elapsed value.
      this.playStartedAtMs += frameDeltaMs;
      if (this.playCompletedAtMs !== null) {
        this.playCompletedAtMs += frameDeltaMs;
      }
    } else {
      // Menu mode only holds for a hidden page (its overlays never hold):
      // keep the demo walker's step/goal-reset schedule and cycle clock from
      // catching up in one burst on return.
      this.nextDemoMoveAtMs += frameDeltaMs;
      if (this.pendingMenuDemoDeconstructArmAtMs !== null) {
        this.pendingMenuDemoDeconstructArmAtMs += frameDeltaMs;
      }
      this.menuDemoCycleStartedAtMs += frameDeltaMs;
      if (this.menuDemoCompletedAtMs !== null) {
        this.menuDemoCompletedAtMs += frameDeltaMs;
      }
    }
  }

  // Every presentation value the build and deconstruct show is DERIVED from
  // elapsed time here (introTimeline.ts) -- never stepped one batch per
  // frame. A slow frame therefore catches up in one jump instead of
  // stretching the intro, and the tile reveal, bleed docks, level digit,
  // spawn laser and input unlock can never drift apart.
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

    const intro = this.resolveLegacyIntroState(time);
    if (intro !== null && this.introStartedAtMs !== null) {
      // The laser and the real-transfer delivery are pinned to the same
      // intro instant (the BUILD end, resolveIntroLaserStartMs) the moment the build begins,
      // so the beams can neither fire before the maze is complete nor land after input unlocks.
      if (
        (this.playerSpawnBurstStartedAtMs === null && !this.prefersLegacyReducedMotion())
        || (this.playerTransferEnergyArmed && this.playerTransferEnergyDeliveryStartedAtMs === null)
      ) {
        this.armLegacyPlayerArrivalForFinalBuildStep(time, (this.introStartedAtMs + resolveIntroLaserStartMs(this.menuStaticDrawTileOrder.length)) - time);
      }
      this.syncLegacyEdgePathsVisible(intro.bleedProgress === 1);
      if (this.menuStaticDrawTilesVisible !== null && intro.tilesVisible !== this.menuStaticDrawTilesVisible) {
        this.menuStaticDrawTilesVisible = intro.tilesVisible;
        this.refreshLegacyMenuStaticDrawVisibleTileKeys();
        this.boardPathDirty = true;
        this.boardDynamicDirty = true;
      }
      if (this.menuStaticDrawTilesVisible !== null && intro.tilesVisible >= this.menuStaticDrawTileOrder.length) {
        this.menuStaticDrawTilesVisible = null;
        this.refreshLegacyMenuStaticDrawVisibleTileKeys();
        this.boardPathDirty = true;
        this.boardDynamicDirty = true;
      }
      if (intro.inputUnlocked) {
        this.menuStaticDrawTilesVisible = null;
        this.menuStaticDrawRowsVisible = null;
        this.boardPathDirty = true;
        this.boardDynamicDirty = true;
        this.settleLegacyMenuStaticDrawStageIfComplete(time);
      }
      return;
    }

    const outro = this.resolveLegacyOutroState(time);
    if (outro !== null) {
      this.syncLegacyEdgePathsVisible(outro.bleedProgress === 1);
    }
    if (outro !== null && this.menuStaticDrawTilesVisible !== null && outro.tilesVisible !== this.menuStaticDrawTilesVisible) {
      this.menuStaticDrawTilesVisible = outro.tilesVisible;
      this.refreshLegacyMenuStaticDrawVisibleTileKeys();
      this.boardPathDirty = true;
      this.boardDynamicDirty = true;
      if (this.menuStaticDrawTilesVisible <= 0) {
        this.menuStaticDrawTilesVisible = 0;
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
    }
  }

  private syncLegacyEdgePathsVisible(visible: boolean): void {
    if (this.legacyEdgePathsVisible === visible) {
      return;
    }
    this.legacyEdgePathsVisible = visible;
    this.boardPathDirty = true;
    this.boardDynamicDirty = true;
  }

  // Skip (tap / key / Enter while the Play intro is still running): jumps the
  // intro clock to its final state. The grace window ignores the very press
  // that started the intro.
  private skipLegacyIntroIfBuilding(time: number): boolean {
    if (this.mode !== 'play' || this.overlay !== 'none' || this.introStartedAtMs === null) {
      return false;
    }
    if (this.menuStaticDrawLifecyclePhase !== 'building') {
      return false;
    }
    const elapsedMs = time - this.introStartedAtMs;
    if (elapsedMs < INTRO_SKIP_GRACE_MS) {
      return false;
    }

    const reducedMotion = this.prefersLegacyReducedMotion();
    const skippedElapsedMs = skipIntroElapsedMs(elapsedMs, { reducedMotion, tileCount: this.menuStaticDrawTileOrder.length });
    if (skippedElapsedMs <= elapsedMs) {
      return false;
    }
    this.introStartedAtMs = time - skippedElapsedMs;
    const laserStartedAtMs = this.resolveLegacyIntroLaserStartAtMs();
    if (laserStartedAtMs !== null && this.playerSpawnBurstStartedAtMs !== null) {
      this.playerSpawnBurstStartedAtMs = laserStartedAtMs;
    }
    if (laserStartedAtMs !== null && this.playerTransferEnergyDeliveryStartedAtMs !== null) {
      this.playerTransferEnergyDeliveryStartedAtMs = laserStartedAtMs;
    }
    this.advanceLegacyMenuStaticDrawStage(time);
    return true;
  }

  // The beams leave their diamonds only once the BUILD is complete: an exact point on the intro clock
  // (resolveIntroLaserStartMs, a pure function of the tile count), never a frame-stepped estimate.
  private resolveLegacyIntroLaserStartAtMs(): number | null {
    return this.introStartedAtMs === null
      ? null
      : this.introStartedAtMs + resolveIntroLaserStartMs(this.menuStaticDrawTileOrder.length);
  }

  // msUntilLaserStart is positive until the intro's laser instant, negative
  // after it. The beam start is an exact point on the intro clock, so arming
  // earlier or later (slow frames) cannot move it.
  private armLegacyPlayerArrivalForFinalBuildStep(time: number, msUntilLaserStart: number): void {
    // A genuinely new arrival (burst not yet armed, no armed transfer) is a new
    // pause-offset session: reset the accumulator so a pause from an earlier,
    // already-finished session can never bleed into this one. An armed
    // transfer owns that accumulator itself (reset at its outbound start).
    if (this.playerSpawnBurstStartedAtMs === null && !this.playerTransferEnergyArmed) {
      this.gameplayTransferPausedDurationMs = 0;
      this.gameplayTransferPauseStartedAtMs = null;
      this.gameplayTransferLastUnpausedTimeMs = null;
    }
    const laserStartedAtMs = time + msUntilLaserStart;
    // Reduced motion has no laser: leaving the burst unarmed keeps the
    // player marker visible the instant the board crossfade finishes.
    if (!this.prefersLegacyReducedMotion()) {
      this.playerSpawnBurstStartedAtMs ??= laserStartedAtMs;
    }
    if (this.playerTransferEnergyArmed) {
      // The inbound transfer beam fires from the same intro instant as the
      // spawn laser (the edge paths switch on at the reveal end,
      // long after it), so there is one arrival clock, not two.
      this.playerTransferEnergyDeliveryStartedAtMs ??= laserStartedAtMs;
    }
  }

  private enterMenuMode(): void {
    if (this.levelPreviewLevel !== null) {
      // Preview has no menu of its own: every route back to the menu leaves it.
      this.exitLegacyLevelPreview();
      return;
    }
    // drawLegacyContinuousPlayTrail (which hides this image on every one of
    // its own early-return paths) only ever runs from drawDynamicBoard's
    // play-mode branch -- once mode flips to 'menu' here, that branch (and
    // so that hide-on-nothing-to-draw guard) stops running entirely, and
    // drawDynamicBoard itself is dirty-flag-gated, not called every frame
    // regardless. Without this, a trail still visible the instant play mode
    // ends would stay stuck on screen, frozen, showing through/behind the
    // menu that regenerates underneath it. The player marker's own glow
    // canvas is only (re)drawn by drawDynamicBoard (via
    // fillLegacyPlayerMarkerTile), so it is exactly as exposed to this same
    // ghost-image risk -- hidden here too.
    this.trailCanvasImage?.setVisible(false);
    this.playerGlowCanvasImage?.setVisible(false);
    this.resetLegacyPlayInputBuffer();
    this.clearPlayHudImmediately();
    this.resetLegacyPlayerTransferEnergy();
    // A delayed request owns the mode it was created for. If it survives a
    // mode switch, update() can later consume it and overwrite the new surface.
    this.pendingGenerationRequest = null;
    this.clearPendingLegacyMenuDemoResetTransition();
    // Guest play is an active, local-only session—not a durable account
    // state. Returning to the menu ends that session so a later launch/menu
    // view always returns to the login boundary instead of presenting an
    // implicit guest continuation.
    if (this.authSnapshot.status !== 'authenticated') {
      this.revokeLegacyGuestPlayGrant();
    }
    this.mode = 'menu';
    this.pendingOverlayMazeRebuild = false;
    this.pendingResetRequest = null;
    this.overlay = 'none';
    this.overlayReturn = 'none';
    this.refreshRuntimeMazeSeedIfUnpinned();
    const menuReturnGenerationScale = this.resolveLegacyProgressionScaleForMode('menu');
    this.applyGenerationRequest(
      createLegacyGenerationRequest({
        aspectRatio: this.resolveLegacyBoardAspectRatioForMode('menu', menuReturnGenerationScale),
        currentSeed: this.mazeSeed,
        dueAtMs: this.time.now,
        generationProfile: this.resolveLegacyMazeGenerationProfileForMode('menu'),
        mode: 'menu',
        queuedAtMs: this.time.now,
        reason: 'menu-return',
        scale: menuReturnGenerationScale,
        targetComplexity: this.resolveLegacyTargetComplexityForMode('menu')
      }),
      this.time.now + INITIAL_MENU_DEMO_HOLD_MS
    );
    this.uiBridge?.refreshProjection('mode-change');
  }

  private startPlayMode(): void {
    if (!this.hasLegacyPlayAccess()) {
      return;
    }
    this.resetLegacyPlayInputBuffer();
    this.resetLegacyPlayerTransferEnergy();
    // Cancel any delayed menu-demo rebuild before installing the immediate
    // play request. This is the Start -> loading -> menu race.
    this.pendingGenerationRequest = null;
    this.clearPendingLegacyMenuDemoResetTransition();
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
    this.uiBridge?.refreshProjection('mode-change');
  }

  private updateMenuDemo(time: number): void {
    if (
      this.menuStaticDrawLifecyclePhase !== 'settled'
      || this.menuStaticDrawRowsVisible !== null
      || this.menuStaticDrawTilesVisible !== null
    ) {
      return;
    }
    // The player marker itself stays hidden until the spawn burst's beams
    // land (see markerRevealAlpha in resolveLegacyPlayerSpawnBurstState) --
    // but without this, the demo walker's own move timer was free to fire
    // the instant the phase settled, stepping the AI before its marker had
    // even appeared. Hold only until the beams arrive and reveal the marker;
    // the trailing impact flash is visible activity and must not add a stale
    // post-spawn pause after the player is already on screen.
    if (this.resolveLegacyPlayerSpawnBurstState(time).markerRevealAlpha <= 0) {
      return;
    }
    if (time < this.nextDemoMoveAtMs) {
      return;
    }

    // The goal-arrival branch below parks the actual deconstruct-arm call
    // here instead of firing it on the same frame the goal was reached --
    // see pendingMenuDemoDeconstructArmAtMs's own comment. nextDemoMoveAtMs
    // is set to the same hold-end instant when this is scheduled, so the
    // gate just above ordinarily already guarantees the hold has elapsed
    // by the time this is reached -- but nextDemoMoveAtMs can legitimately
    // be reset for an unrelated reason in between (e.g. enterMenuMode's own
    // return-to-menu hold), so re-checking time here directly, instead of
    // trusting that gate alone, is what actually prevents a stale pending
    // arm from firing early against a maze it was never scheduled for.
    // clearPendingLegacyMenuDemoResetTransition (called from every mode
    // transition that could otherwise leak this field across) is the
    // primary fix; this check is defense in depth, not a substitute for it.
    if (this.pendingMenuDemoDeconstructArmAtMs !== null && time >= this.pendingMenuDemoDeconstructArmAtMs) {
      this.pendingMenuDemoDeconstructArmAtMs = null;
      this.armLegacyMenuStaticDeconstructStage(time);
      this.boardDynamicDirty = true;
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
      this.armLegacyPlayerTransferEnergy(time);
      this.armLegacyMenuStaticDeconstructStage(time);
      this.boardDynamicDirty = true;
      return;
    }

    this.menuDemoState = nextFrame.state;
    const previousPlayer = copyPoint(this.player);
    this.player = nextFrame.player;
    this.markLegacyPlayerLeftStartIfApplicable(this.maze.start);
    this.armLegacyPlayerVisualMotion(
      previousPlayer,
      nextFrame.player,
      time,
      nextFrame.delayMs
    );
    this.trail = nextFrame.trail;
    this.nextDemoMoveAtMs = time + nextFrame.delayMs;
    if (this.shouldStartLegacyMenuDeconstructOnGoalArrival(nextFrame)) {
      this.menuDemoCompletedAtMs ??= time;
      this.recordMazeCycleCompletion('menu-demo');
      this.armLegacyPlayerTransferEnergy(time);
      // Build the next maze right now, at the goal-reached instant --
      // mirrors applyLegacyWorldTurnPlayerMovement's own play-mode
      // precompute exactly (see its own comment), just with a purpose-
      // built hold instead of reusing schedulePlayResetReturn's, since the
      // demo walker has its own separate state machine with no shared
      // request/consume plumbing to play mode's. Deferring the actual arm
      // call (armLegacyPlayerTransferEnergy above already fired -- only
      // the outbound laser/corridor's own wall-clock timers, armed inside
      // armLegacyMenuStaticDeconstructStage, are what needed the delay)
      // to fire once LEGACY_MENU_DEMO_GOAL_RESET_HOLD_MS elapses (see the
      // pendingMenuDemoDeconstructArmAtMs check near the top of this
      // function) gives the synchronous build real wall-clock room to
      // finish before those timers start, instead of running inside the
      // same call that arms them.
      this.precomputeLegacyDeconstructResetMaze('menu');
      this.pendingMenuDemoDeconstructArmAtMs = time + LEGACY_MENU_DEMO_GOAL_RESET_HOLD_MS;
      this.nextDemoMoveAtMs = this.pendingMenuDemoDeconstructArmAtMs;
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
    }, {
      timedModeEnabled: false
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

  // The one authoritative place hasPlayerEverLeftStart may flip from false
  // to true -- called right after this.player is updated at an accepted
  // movement commit (both the real play step below and the menu-demo's own
  // step commit), never from rendering. A pure position comparison against
  // whichever point currently owns "start" for that surface; the one-way
  // latch semantics (never flips back) live on the field itself.
  private markLegacyPlayerLeftStartIfApplicable(startPoint: LegacyPoint): void {
    if (this.hasPlayerEverLeftStart) {
      return;
    }
    if (this.player.x !== startPoint.x || this.player.y !== startPoint.y) {
      this.hasPlayerEverLeftStart = true;
    }
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
      this.armLegacyWallBump(move.deltaX, move.deltaY);
      return { accepted: false };
    }

    const previousPlayer = copyPoint(this.player);
    this.player = nextStep.player;
    this.markLegacyPlayerLeftStartIfApplicable(this.maze.start);
    this.armLegacyPlayerVisualMotion(previousPlayer, nextStep.player, this.time.now, this.resolveLegacyPlayerVisualMoveDurationMs());
    this.trail = nextStep.trail;
    this.appendLegacyPlayCyclePoint(nextStep.player);

    if (nextStep.reachedGoal) {
      this.playCompletedAtMs ??= this.time.now;
      this.recordMazeCycleCompletion('play');
      this.armLegacyPlayerTransferEnergy(this.time.now);
      // Build the next maze at the goal-reached instant -- but deferred by
      // one frame (this.time.delayedCall, not called inline here), not
      // literally synchronous on this exact frame. createLegacyRuntimeMazeForMode
      // is genuinely slow (up to ~170ms for a complex maze -- see Generation
      // V2 Wave 1.5's own measured convergence data), and calling it inline,
      // in the same call stack as the touch/step that just landed the player
      // on the goal tile, blocked the main thread before THIS frame (the one
      // showing the player arriving) could even paint -- the reported
      // "freezes right as you touch the end tile" glitch. Deferring by one
      // frame lets the arrival frame render first; the still-blocking build
      // then runs a frame later, which schedulePlayResetReturn's
      // ACTIVE_PLAY_GOAL_RESET_HOLD_MS hold (340ms, many real frames) has
      // enormous margin to absorb -- unchanged from the original reasoning
      // below, just shifted off the exact touch frame:
      // schedulePlayResetReturn below holds for ACTIVE_PLAY_GOAL_RESET_HOLD_MS
      // before armLegacyMenuStaticDeconstructStage ever runs and consumes
      // this. That gives the build real wall-clock room to finish well
      // before it's needed, instead of running inside
      // armLegacyMenuStaticDeconstructStage itself, which eats directly into
      // the outbound player-transfer-energy timer and corridor clock it
      // arms in that same call -- both short (a few hundred ms), wall-clock-
      // timed animation windows that a stall inside that call can (and
      // does, for anything but a trivial maze) consume entirely, making the
      // laser and the deconstruct-to-build deceleration both skip straight
      // to their post-window state instead of visibly playing.
      // consumeLegacyDeconstructResetMaze's own existing "didn't call the
      // early precompute" fallback covers the (now even less likely) case
      // where this deferred call hasn't finished by the time it's needed.
      this.time.delayedCall(LEGACY_PLAY_GOAL_DECONSTRUCT_PRECOMPUTE_DEFER_MS, () => {
        this.precomputeLegacyDeconstructResetMaze('play');
      });
      this.schedulePlayResetReturn();
      this.boardDynamicDirty = true;
      this.triggerLegacyHapticPulse([...LEGACY_HAPTIC_PATTERNS.goal]);
      return {
        accepted: true,
        events: [{ type: 'player-reached-goal', entityId: 'player' }]
      };
    }

    this.boardDynamicDirty = true;
    this.triggerLegacyHapticPulse(LEGACY_HAPTIC_PATTERNS.step);
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

    const menuResetGenerationScale = this.resolveLegacyProgressionScaleForMode('menu');
    this.pendingGenerationRequest = createLegacyMenuResetGenerationRequest({
      aspectRatio: this.resolveLegacyBoardAspectRatioForMode('menu', menuResetGenerationScale),
      currentSeed: this.mazeSeed,
      generationProfile: this.resolveLegacyMazeGenerationProfileForMode('menu'),
      nowMs: time,
      scale: menuResetGenerationScale,
      targetComplexity: this.resolveLegacyTargetComplexityForMode('menu')
    });
  }

  private createStars(): void {
    // The backdrop stays present as a quiet depth layer. The player's motion
    // preference controls movement, not whether the menu falls back to a blank
    // field.
    this.stars = createLegacyMenuBackdropStars(createBackdropStarRandom()).slice(0, LEGACY_MENU_STAR_COUNT);
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
    for (const star of this.stars) {
      const pixelX = Math.round(star.x * width);
      const pixelY = Math.round(star.y * height);
      const coreSize = Math.max(1, Math.round(star.radius));
      // Confirmed real defect (owner-reported: background stars "switch
      // colors like a strobe" instead of smoothly twinkling): this used to
      // be derived fresh every frame from the star's own (continuously
      // drifting) position -- `((star.x * 9973) + (star.y * 6151)) % 1` --
      // which looks like a stable position-keyed hash but isn't: measured
      // live, a star moving at its own ordinary drift speed produced an
      // uncorrelated new value on almost every real frame, silently
      // re-randomizing the twinkle period, the color bucket below, and the
      // sparkle hue every frame instead of giving each star one fixed
      // identity. Now reads the star's own persisted seed (legacyMenuBackdrop.ts's
      // own field doc has the measured trace) -- stable for the star's
      // whole life, reassigned only at genuine rebirth.
      const starSeed = star.seed;
      // Was a small (68-100%) alpha-only wobble on a shared 1300ms period --
      // reported as flickering badly, and asked to "make their size animate
      // too and fade in and out." Each star gets its own period (+-25%,
      // seeded off starSeed so they don't all pulse in lockstep) and a much
      // wider swing (down to near-invisible, not just dimmer) eased through
      // smoothstep so it lingers at the bright/dim ends and passes quickly
      // through the middle -- reads as a genuine twinkle in and out, not a
      // constant shimmer. sizeMultiplier rides the same eased cycle so a
      // star visibly shrinks as it dims, not just fades.
      const twinklePeriodMs = 2200 * (0.75 + (starSeed * 0.5));
      const twinkleRaw = backdropMotionEnabled
        ? (Math.sin(((animationTime / twinklePeriodMs) + starSeed) * Math.PI * 2) + 1) / 2
        : 0.5;
      const twinklePhase = twinkleRaw * twinkleRaw * (3 - (2 * twinkleRaw));
      // A star never fully vanishes at the dim end of its twinkle (see backdropStars.ts).
      const twinkleAlpha = star.alpha * resolveBackdropTwinkleAlpha(twinklePhase);
      const sizeMultiplier = resolveBackdropTwinkleSize(twinklePhase);
      const starColor = starSeed > 0.82 ? 0xbfe3ff : (starSeed < 0.16 ? 0xffe9c2 : 0xffffff);
      // The coloured four-point sparkles that the nearest, biggest stars used to get are retired for good (owner,
      // 2026-11-10: "no more stagnant stars in the background"), but every star is still drawn: the nearest ones
      // as brighter "hero" dots with a soft round halo, the rest as dots; see src/render/backdropStars.ts.
      const starDraw = resolveBackdropStarDraw(coreSize);
      // Round, not square: the vast majority of stars (every one below the
      // sparkle threshold above -- the bulk of the field) used to be a flat
      // fillRect square, which reads as a blocky pixel rather than a point
      // of light ("the stars in the starfield kinda suck"). A soft circle
      // with the same two-pass halo underneath is a small, cheap change
      // that makes every single star in the field read as an actual star
      // instead of a tiny tile.
      const starRadius = (coreSize / 2) * sizeMultiplier;
      if (starDraw === 'hero') {
        this.backdropGraphics.fillStyle(starColor, twinkleAlpha * palette.starAlphaScale * 0.1);
        this.backdropGraphics.fillCircle(pixelX, pixelY, starRadius + 5);
        this.backdropGraphics.fillStyle(starColor, twinkleAlpha * palette.starAlphaScale * 0.16);
        this.backdropGraphics.fillCircle(pixelX, pixelY, starRadius + 3);
        this.backdropGraphics.fillStyle(starColor, twinkleAlpha * palette.starAlphaScale * 0.24);
        this.backdropGraphics.fillCircle(pixelX, pixelY, starRadius + 1.5);
      } else if (coreSize > 1) {
        this.backdropGraphics.fillStyle(starColor, twinkleAlpha * palette.starAlphaScale * 0.18);
        this.backdropGraphics.fillCircle(pixelX, pixelY, starRadius + 1.5);
      }
      this.backdropGraphics.fillStyle(starColor, twinkleAlpha * palette.starAlphaScale);
      this.backdropGraphics.fillCircle(pixelX, pixelY, Math.max(0.6, starRadius));
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
      this.syncLegacyPlayerVisualMotionTo(this.playerGlide.getTarget());
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

    // A Navigation Core v1 review (see
    // docs/assets/reference/navigation-core-v1/README.md) traced the maze's
    // "checkerboard of separate chiclets" seam artifact to exactly this
    // line, empirically -- by A/B-disabling this method's own fill and
    // drawLegacyPathTileFacet independently against the real running
    // renderer (not by inspecting source alone): resolveLegacyPixelTileRect
    // already rounds every tile's edges from the same shared originX/originY
    // + tileSize formula, so two connected tiles' shared edge is always the
    // exact same integer pixel coordinate -- there is no sub-pixel gap for a
    // 1px overlap to correct. The overlap this comment used to describe
    // ("guarantees solid double-covered color... instead of a hairline
    // gap") instead double-composited this coreAlpha (< 1, a deliberately
    // translucent "glass" material) fill onto itself in that 1px strip,
    // which is what actually produced a visible brighter seam line at every
    // internal tile boundary -- confirmed by removing the overlap entirely
    // (exact abutment only) while leaving drawLegacyPathTileFacet
    // unchanged: the seam disappeared and the rim-light still correctly
    // traces only the corridor's true outer boundary. Do not reintroduce an
    // overlap here without re-verifying against the live renderer first.
    graphics.fillStyle(options.coreColor, options.coreAlpha);
    graphics.fillRect(tileRect.left, tileRect.top, tileRect.width, tileRect.height);
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
  // edge to the true screen edge on every side, on both surfaces (see the
  // comment on this function's own body below -- play used to special-case
  // stopping short at a fixed one-tile budget, since dropped so both
  // surfaces resolve identically). Both consume the entire actual gap on
  // their side rather than a fixed budget -- whatever slack is left over
  // from board centering/tile-size rounding on that axis, so the corridor
  // always terminates at the true edge instead of stopping short of it when
  // that slack happens to exceed one tile.
  private resolveLegacyPathBorderDockContinuation(
    direction: LegacyMenuBorderDockDirection,
    boardLeft: number,
    boardTop: number,
    boardWidth: number,
    boardHeight: number,
    tileSize: number
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
    // Always the full length: an edge path is either absent (the dock is not
    // drawn at all, see the atomic dock group in resolveBoardTileReveal) or
    // complete -- there is no half-grown length, so no sliver can ever be left
    // behind. The Chip dock is four diminishing chip slices plus a lintel, about
    // dockDefaultLengthTiles tiles long (the length the bake uses), not a strip
    // to the screen edge, so the wrap-glow pulse is capped to the same extent.
    const resolveContinuation = (availableGap: number): number => Math.max(
      2,
      Math.min(availableGap, tileSize * BOARD_TILE_GEOMETRY.dockDefaultLengthTiles)
    );

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

  // Bleed-off/wrap corridors are drawn as a short Chip dock past the
  // board's own edge (four diminishing chip slices plus a lintel, part of the
  // baked board) -- which reads as "structurally there" but doesn't call
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

    const progress = resolveBleedGlowProgress(time);
    if (resolveBleedGlowEnvelope(progress) <= 0.01) {
      return;
    }
    const backingScale = this.resolveBoardTileBackingScale();

    const materialTileSize = Math.max(1, Math.round(tileSize));
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
      for (const direction of dockDirections) {
        const dockFrame = resolveLegacyMenuBorderDockRenderFrames(direction, materialTileSize).edge;
        const dockAreas = resolveLegacyMenuBorderDockRenderAreas(direction, dockFrame, {
          boardLeft,
          boardTop,
          boardWidth,
          boardHeight,
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

        // Geometry, colour and centring live in src/render/bleedGlow.ts: the lane is centred on the device-snapped
        // cell centre (the chip's own centre line) and painted in the trail's colour at the head.
        const [cellCentreX, cellCentreY] = centerOfCell(point, tileSize, backingScale, mazeLeft, mazeTop);
        for (const area of dockAreas) {
          for (const rect of resolveBleedGlowRects({
            direction,
            area,
            cellCentre: { x: cellCentreX, y: cellCentreY },
            tileSize,
            progress
          })) {
            this.boardDynamicGraphics.fillStyle(glowColor, rect.alpha);
            this.boardDynamicGraphics.fillRect(rect.x, rect.y, rect.width, rect.height);
          }
        }
      }
    }
  }

  // The board's floor. One baked Chip (default) / Trace (alternate) canvas per bake hash -- the bake
  // runs only when the maze, tile size, backing scale, docks or style change, never per frame. The
  // tile-by-tile build/deconstruct reveal is a rank-based mask over that bake: a cell is shown while its
  // rank in the reveal order is below the live tile limit (see composeBoardTileReveal), so the lifecycle
  // timeline's pacing is unchanged. The composite is redrawn only on frames where the reveal key changed.
  private drawBoardPaths(time: number): void {
    const { boardLeft: layoutBoardLeft, boardTop: layoutBoardTop, boardWidth, boardHeight } = this.layout;
    const boardOffset = this.resolveBoardOffset();
    const boardLeft = layoutBoardLeft + boardOffset.x;
    const boardTop = layoutBoardTop + boardOffset.y;
    const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(boardLeft, boardTop, boardWidth, boardHeight);

    // Retained as the z-order anchor only (see its field comment); nothing is drawn into it.
    this.boardPathGraphics.clear();
    this.ensureBoardTileMazeCaches();
    this.boardTileLayer.update({
      grid: this.maze.grid,
      width: this.maze.width,
      height: this.maze.height,
      tileSize: mazeRenderFrame.tileSize,
      devicePixelRatio: this.resolveBoardTileBackingScale(),
      style: this.boardTileStyle,
      docks: this.boardTileDocks,
      start: this.maze.start ? { x: this.maze.start.x, y: this.maze.start.y } : undefined,
      goal: this.maze.goal ? { x: this.maze.goal.x, y: this.maze.goal.y } : undefined,
      boardLeft: mazeRenderFrame.boardLeft,
      boardTop: mazeRenderFrame.boardTop,
      reveal: this.resolveBoardTileReveal(),
      visible: true
    });

    this.drawLegacyMenuPathTitle(time);
    this.boardPathDirty = false;
  }

  // Backing scale for the baked board: the scene canvas resolution times the board zoom, the same
  // product every other scene canvas (trail, glow) uses, so the bake is 1:1 with device pixels.
  private resolveBoardTileBackingScale(): number {
    const zoomScale = Math.max(1, this.boardZoomContainer.scaleX, this.boardZoomContainer.scaleY);
    return Math.min(MAZER_CANVAS_RESOLUTION_MAX * 2, resolveMazerCanvasResolution() * zoomScale);
  }

  // Per-maze caches the reveal mask needs: the wrap docks (border cells the scene already treats as
  // dock owners), a dock-owner mask, and the rank grid built from the scene's reveal order. Rebuilt
  // only when the maze or its reveal-order array is replaced.
  private ensureBoardTileMazeCaches(): void {
    if (this.boardTileDockMaze !== this.maze) {
      this.boardTileDockMaze = this.maze;
      const docks: BoardTileDock[] = [];
      const owners = new Uint8Array(this.maze.width * this.maze.height);
      const eligible = this.resolveBleedOffDockVisualEligibility();
      for (let y = 0; y < this.maze.height; y += 1) {
        for (let x = 0; x < this.maze.width; x += 1) {
          if (!eligible.has(legacyScenePointKey({ x, y }))) {
            continue;
          }
          const sides = resolveLegacyMenuBorderDockDirections(this.maze, { x, y });
          for (const side of sides) {
            docks.push({ x, y, side });
          }
          if (sides.length > 0) {
            owners[(y * this.maze.width) + x] = 1;
          }
        }
      }
      this.boardTileDocks = docks;
      this.boardTileDockOwners = owners;
      this.boardTileRankOrder = null;
    }
    if (this.boardTileRankOrder !== this.menuStaticDrawTileOrder) {
      this.boardTileRankOrder = this.menuStaticDrawTileOrder;
      this.boardTileRankGrid = buildRankGrid(this.menuStaticDrawTileOrder, this.maze.width, this.maze.height);
    }
  }

  private resolveBoardTileReveal(): BoardTileReveal {
    const tileLimit = this.resolveLegacyMenuStaticDrawTileLimit();
    const rowLimit = this.resolveLegacyMenuStaticDrawRowLimit();
    const edgeShown = this.legacyEdgePathsVisible;
    if (tileLimit === null && rowLimit === null && edgeShown) {
      return { kind: 'all' };
    }
    const width = this.maze.width;
    const ranks = this.boardTileRankGrid;
    const owners = this.boardTileDockOwners;
    return {
      kind: 'cells',
      key: `${tileLimit ?? 'n'}|${rowLimit ?? 'n'}`,
      docksVisible: edgeShown,
      isVisible: (x, y) => {
        const index = (y * width) + x;
        if (!edgeShown && owners !== null && owners[index] === 1) {
          return false;
        }
        return isBoardCellRevealed(tileLimit, rowLimit, ranks === null ? -1 : ranks[index]!, y);
      }
    };
  }

  private resolveLegacyMenuPathTitleProgress(): number {
    if (this.mode !== 'menu') {
      return 0;
    }

    const tileLimit = this.resolveLegacyMenuStaticDrawTileLimit();
    if (tileLimit !== null && this.menuStaticDrawTileOrder.length > 0) {
      return clamp(tileLimit / this.menuStaticDrawTileOrder.length, 0, 1);
    }

    // The tile-order reveal (what this progress value tracks) and the
    // row-slice reveal are armed together but finish at independent rates
    // -- see isLegacyMenuPointVisibleInStaticDraw's own comment on this
    // same race for the board tiles. The tile-order one typically finishes
    // first, nulling tileLimit above while menuStaticDrawLifecyclePhase is
    // still 'building' until the slower row counter also catches up.
    // Falling straight through to the phase check in that window read the
    // title as "not built yet" for however many frames the gap lasted,
    // then snapping back to fully built once the phase actually settled --
    // exactly the reported "flickers, disappears for a second, then the
    // full word appears" bug. Once tileLimit itself has gone null, the
    // tile-order reveal is done regardless of what the still-catching-up
    // row counter or phase flag say. (Both counters are always armed
    // together, so rowsVisible being non-null here can only mean the tile
    // counter just finished mid-build, never "build never started".)
    if (this.menuStaticDrawTilesVisible === null && this.menuStaticDrawRowsVisible !== null) {
      return 1;
    }

    return this.menuStaticDrawLifecyclePhase === 'building' ? 0 : 1;
  }

  private resolveLegacyMenuPathTitleFontSize(): number {
    // Layout owns the header-fit decision. Rendering must consume the same
    // reserve-derived value rather than a Start-button size, or a narrow
    // header can be approved as one line and then visibly overflow at draw.
    return resolveLegacyMenuTitleFontSize(this.layout.titleReserveHeight);
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
    // The eight edge diamonds (4 corners + 4 edge midpoints) are a screen-wide
    // ambient decoration, not really part of the title itself -- they render
    // in play mode too (still gated off during most overlays), in their own
    // lower-depth Graphics (edgeMarkerGraphics).
    const edgeMarkersVisible = (this.mode === 'menu' || this.mode === 'play')
      && this.overlay === 'none';
    this.titleGraphics.setVisible(edgeMarkersVisible);
    this.edgeMarkerGraphics.setVisible(edgeMarkersVisible);
    if (!edgeMarkersVisible) {
      this.edgeMarkerGraphics.setVisible(false);
      this.titleTileFontImagePool.forEach((image) => image.setVisible(false));
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

    // drawLegacyGlyphWordTileBlock: the actual "MAZER" wordmark is sampled
    // from ONE real corridor-material square tile and rebuilt letter by
    // letter from a 5x7 bitmap grid -- the same real tile the maze itself is
    // built from, tile-by-tile reveal included -- not the old raster
    // tile-font atlas (a pre-drawn glyph image merely cropped into chunks,
    // never actually made of discrete tiles). No asset load to fail, so
    // (unlike the old raster path) this never needs a fallback: the
    // hand-drawn maze-path-cell wordmark below (gem facets, prism sweep) is
    // therefore permanently unreachable dead code, kept in place rather than
    // torn out in the same pass as this rewrite.
    let renderedTitleWithTileFont = false;
    if (titleTextVisible) {
      const titleCenterX = titleLayout.left + (titleLayout.width / 2);
      const titleCenterY = titleLayout.top + (titleLayout.height / 2);
      // resolveLegacyGlyphWordLayout's bitmap grid is always 7 rows tall
      // (LEGACY_GLYPH_LETTER_ROWS in legacyMenuTitle.ts) -- deriving the
      // per-tile pixel size from the title's own already-computed height
      // keeps this the same overall footprint the raster path used to fill.
      const titleGlyphCellSize = Math.max(1, Math.round(titleLayout.height / 7));
      const titleGlyphLayout = resolveLegacyGlyphWordLayout(LEGACY_TITLE_WORD, titleCenterX, titleCenterY, titleGlyphCellSize);
      this.drawLegacyGlyphWordTileBlock(
        this.titleGraphics,
        titleGlyphLayout,
        time,
        titlePresentation.titleAlpha,
        this.resolveLegacyMenuPathTitleProgress()
      );
      renderedTitleWithTileFont = true;
      this.drawLegacyWordmarkAmbientSparkles(
        this.titleGraphics,
        titleCenterX,
        titleCenterY,
        titleGlyphLayout.width / 2,
        titleGlyphLayout.height / 2,
        time,
        titlePresentation.titleAlpha
      );
    }
    this.titleTileFontImagePool.forEach((image) => image.setVisible(false));

    if (!renderedTitleWithTileFont && titleTextVisible && visibleCells.length > 0) {
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

    this.drawLegacyEdgeMarkers(time);

    if (!renderedTitleWithTileFont) {
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
      // Whole css px: the baked board is an Image, and Phaser (roundPixels) floors an Image's position, so a
      // fractional board origin put the board up to one css px away from the player, trail and markers.
      boardLeft: Math.round(boardLeft + safeInset),
      boardTop: Math.round(boardTop + safeInset),
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

  private armLegacyPlayerTransferEnergy(_time: number): void {
    this.playerTransferEnergyArmed = true;
    this.playerTransferEnergyOutboundStartedAtMs = null;
    this.playerTransferEnergyDeliveryStartedAtMs = null;
    this.boardDynamicDirty = true;
  }

  private resetLegacyPlayerTransferEnergy(): void {
    this.playerTransferEnergyArmed = false;
    this.playerTransferEnergyOutboundStartedAtMs = null;
    this.playerTransferEnergyDeliveryStartedAtMs = null;
    // "Completion/reset clears the session" -- a genuinely new transfer
    // always starts fresh (Playbook: a stable transfer identity outlives
    // changes to target pose, but not a full reset). This is the ONLY
    // place gameplayTransferPrimaryId is cleared; it is retained across
    // outbound/stored/delivering by every other call site.
    this.gameplayTransferPausedDurationMs = 0;
    this.gameplayTransferPauseStartedAtMs = null;
    this.gameplayTransferLastUnpausedTimeMs = null;
  }

  // Updates the shared pause-tracking accumulator exactly once per real
  // frame -- called from the same place settleLegacyPlayerTransferEnergy
  // already runs unconditionally every frame, so this is guaranteed
  // single-fire regardless of how many places read the resulting offset
  // afterward this same frame. See gameplayTransferPausedDurationMs's own
  // field comment for the real defect this fixes.
  private updateGameplayTransferPauseTracking(time: number): void {
    const paused = this.overlay === 'pause' || this.legacyLifecycleHeldThisFrame;
    if (paused && this.gameplayTransferPauseStartedAtMs === null) {
      // Anchor at the last real pre-pause time, not this frame's own
      // `time` -- see gameplayTransferLastUnpausedTimeMs's own field
      // comment for the one-frame boundary defect this avoids. Falls
      // back to `time` only if somehow no prior unpaused frame was ever
      // observed (cannot happen in practice: this tracker itself always
      // records an unpaused time before any pause can begin).
      this.gameplayTransferPauseStartedAtMs = this.gameplayTransferLastUnpausedTimeMs ?? time;
    } else if (!paused && this.gameplayTransferPauseStartedAtMs !== null) {
      this.gameplayTransferPausedDurationMs += time - this.gameplayTransferPauseStartedAtMs;
      this.gameplayTransferPauseStartedAtMs = null;
    }
    if (!paused) {
      this.gameplayTransferLastUnpausedTimeMs = time;
    }
  }

  // Real ms of wall-clock time this transfer/arrival session has spent
  // paused so far, INCLUDING any pause still ongoing right now -- the
  // amount every real elapsed-ms input this scene derives for the
  // transfer and the initial arrival subtracts, so a paused interval
  // costs the lifecycle nothing and resuming continues exactly where it
  // left off rather than jumping ahead or racing to catch up.
  private resolveGameplayTransferPausedOffsetMs(time: number): number {
    return this.gameplayTransferPausedDurationMs
      + (this.gameplayTransferPauseStartedAtMs !== null ? time - this.gameplayTransferPauseStartedAtMs : 0);
  }

  private resolveLegacyPlayerTransferState(time: number): LegacyPlayerTransferVisualState {
    const pausedOffsetMs = this.resolveGameplayTransferPausedOffsetMs(time);
    return resolveLegacyPlayerTransferVisualState({
      armed: this.playerTransferEnergyArmed,
      deliveryElapsedMs: this.playerTransferEnergyDeliveryStartedAtMs === null
        ? null
        : time - this.playerTransferEnergyDeliveryStartedAtMs - pausedOffsetMs,
      deliveryFlashMs: LEGACY_PLAYER_SPAWN_FLASH_MS,
      deliveryTravelMs: LEGACY_PLAYER_SPAWN_BEAM_TRAVEL_MS,
      nowMs: time,
      outboundElapsedMs: this.playerTransferEnergyOutboundStartedAtMs === null
        ? null
        : time - this.playerTransferEnergyOutboundStartedAtMs - pausedOffsetMs,
      reducedMotion: this.prefersLegacyReducedMotion()
    });
  }

  private settleLegacyPlayerTransferEnergy(time: number): void {
    this.updateGameplayTransferPauseTracking(time);
    if (this.resolveLegacyPlayerTransferState(time).phase === 'complete') {
      this.resetLegacyPlayerTransferEnergy();
    }
  }

  // Edge stations in screen space (corners + edge midpoints), the one place
  // every edge-anchored effect (markers, arrival beams, departure beams)
  // asks. The stations are fixed positions that depend on the viewport size
  // ONLY (no safe area, no header-control avoidance): the kites sit behind all UI.
  private resolveLegacyEdgeStations(): ReadonlyArray<EdgeStation> {
    return resolveEdgeStations({ width: this.layout.width, height: this.layout.height });
  }

  // All 8 beams, both directions, in one place. Drawn into spawnLaserGraphics
  // (top-level, above the board, cleared every drawDynamicBoard).
  private drawLegacyEdgeLasers(
    time: number,
    mazeLeft: number,
    mazeTop: number,
    mazeTileSize: number,
    playerPoint: LegacyPoint,
    spawnBurst: ReturnType<typeof this.resolveLegacyPlayerSpawnBurstState>
  ): void {
    let firingIds: ReadonlySet<number> = new Set<number>();
    if (!this.prefersLegacyReducedMotion() && this.overlay === 'none') {
      const boardRelativeX = mazeLeft + ((playerPoint.x + 0.5) * mazeTileSize);
      const boardRelativeY = mazeTop + ((playerPoint.y + 0.5) * mazeTileSize);
      const focus = {
        x: this.boardZoomContainer.x + (boardRelativeX * this.boardZoomContainer.scaleX),
        y: this.boardZoomContainer.y + (boardRelativeY * this.boardZoomContainer.scaleY)
      };
      const outro = this.resolveLegacyOutroState(time);
      if (outro !== null) {
        firingIds = drawEdgeBeams(this.spawnLaserGraphics, {
          direction: 'outward',
          focus,
          laserProgress: outro.laserProgress,
          spawnPop: 0,
          stations: this.resolveLegacyEdgeStations()
        }).firingIds;
      } else if (spawnBurst.active) {
        firingIds = drawEdgeBeams(this.spawnLaserGraphics, {
          direction: 'inward',
          focus,
          laserProgress: spawnBurst.travelProgress,
          spawnPop: spawnBurst.flashProgress,
          stations: this.resolveLegacyEdgeStations()
        }).firingIds;
      }
    }
    // The diamonds lighting + spin are derived from the intro / outro
    // timelines, so the markers redraw on EVERY frame while a lifecycle is
    // active and once more when it ends (the final frame clears the lighting:
    // no stale lit frames survive into play).
    const firing = firingIds.size > 0;
    this.edgeBeamFiringIds = firingIds;
    const ring = this.resolveLegacyEdgeRing(time, spawnBurst);
    const ringActive = ring.lifecycle !== null;
    this.edgeRing = ring;
    if (firing || this.edgeBeamWasFiring || ringActive || this.edgeRingActive) {
      this.drawLegacyEdgeMarkers(time);
    }
    this.edgeBeamWasFiring = firing;
    this.edgeRingActive = ringActive;
  }

  // Ring lighting + spin for this frame: the departure (outro) or arrival
  // (intro) timeline, or null at rest / in reduced motion / under an overlay.
  private resolveLegacyEdgeRing(
    time: number,
    spawnBurst: ReturnType<typeof this.resolveLegacyPlayerSpawnBurstState>
  ): { lifecycle: EdgeRingLifecycle | null; spinRad: number } {
    if (this.prefersLegacyReducedMotion() || this.overlay !== 'none') {
      return { lifecycle: null, spinRad: 0 };
    }
    const outro = this.resolveLegacyOutroState(time);
    if (outro !== null && !outro.done) {
      return {
        lifecycle: { direction: 'outward', laserProgress: outro.laserProgress, ringEnergy: outro.ringEnergy },
        spinRad: outro.ringSpinRad
      };
    }
    const intro = this.resolveLegacyEdgeRingIntroState(time);
    if (intro !== null && !intro.done) {
      return {
        lifecycle: { direction: 'inward', laserProgress: intro.laserProgress, ringEnergy: intro.ringEnergy },
        spinRad: intro.ringSpinRad
      };
    }
    if (outro === null && intro === null && spawnBurst.active) {
      // Arrival without an intro clock (never expected): keep the beams diamonds lit while they fly.
      return {
        lifecycle: { direction: 'inward', laserProgress: spawnBurst.travelProgress, ringEnergy: 1 },
        spinRad: 0
      };
    }
    return { lifecycle: null, spinRad: 0 };
  }

  // The eight calm edge markers (edgeMarkers.ts), drawn into their OWN
  // Graphics that sits at the lowest depth inside boardZoomContainer: above the
  // starfield backdrop, below the board, the title wordmark, the header icons,
  // every button/label, the level announcer and every overlay.
  private drawLegacyEdgeMarkers(time: number): void {
    this.edgeMarkerGraphics.clear();
    if (!this.edgeMarkerGraphics.visible) {
      return;
    }

    const reducedMotion = this.prefersLegacyReducedMotion();
    const energizedIds = new Set<number>();
    const introState = this.resolveLegacyEdgeRingIntroState(time);
    if (
      (introState !== null && introState.bleedProgress === 1 && !introState.done)
      || this.playerTransferEnergyArmed
    ) {
      this.resolveLegacyWrapEndStationIds().forEach((id) => energizedIds.add(id));
    }
    // QA teleport-anchor preview: the held anchor id energizes ITS station's diamond.
    const previewId = this.teleportAnchorPreviewSession?.heldAnchorId;
    if (previewId !== undefined && previewId !== null) {
      energizedIds.add(previewId);
    }

    drawEdgeMarkers(
      this.edgeMarkerGraphics,
      this.resolveLegacyEdgeStations(),
      resolveEdgeMarkerStates({
        energizedIds,
        flash: this.edgeMarkerWrapFlash,
        reducedMotion,
        ringEnergies: resolveEdgeRingEnergies(this.edgeRing.lifecycle),
        spinRad: this.edgeRing.spinRad,
        timeMs: time,
        // The border is the live trail colour: the trail head's own palette sample (trailPalette.ts).
        ...(this.trailPaletteHead
          ? {
            trailHeadDistanceTiles: this.trailPaletteHead.distanceTiles,
            trailTimeMs: this.trailPaletteHead.timeMs,
            trailAnimated: this.trailPaletteHead.animated
          }
          : {})
      })
    );
  }

  private resolveLegacyWrapEndStationIds(): ReadonlySet<number> {
    return resolveWrapEndStationIds(this.resolveBleedOffDockVisualEligibility(), this.maze);
  }

  // Play mode's trail/pulse should only ever show the perfect route from the
  // route's own origin to wherever the player currently stands -- not the
  // player's raw, append-only move history (which grows to cover dead ends
  // and backtracks and was the source of both the "colored in weird" look
  // and the messy ping-pong pulse the player actually walked).
  // Restricted to tiles the player has actually stepped on -- searching the
  // full maze grid (as this originally did) can route the "perfect path"
  // through a shortcut the player never walked, which reads as the trail
  // jumping onto tiles they didn't visit. Building a visited-only grid and
  // running the same shortest-path search against that instead guarantees
  // every tile in the result is one the player's own trail already covers.
  //
  // The route's origin is this.trail's own first point, not always
  // maze.start: Trail Fade bounds this.trail to its most recent
  // TRAIL_FADE_TAIL points (see advanceLegacyPlayStep), so once the player
  // has moved further than that from start, maze.start is no longer even in
  // the visited set. Searching from maze.start regardless (the original bug)
  // made the shortest-path search fail entirely once that gap opened, which
  // collapsed the whole visible trail to a single point at the player -- not
  // merely a shorter trail, an invisible one. Using this.trail's own first
  // (oldest still-retained) point as the origin instead is always reachable
  // by construction, since every consecutive pair in this.trail is a real
  // accepted move (grid-adjacent), so a path through the visited set from
  // that origin to the player always exists.
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

    const origin = this.trail.length > 0 ? this.trail[0]! : this.maze.start;
    const result = resolveLegacyPlayableShortestPath(visitedGrid, origin, this.player);
    if (result.found && result.path.length > 0) {
      return result.path;
    }
    return [copyPoint(this.player)];
  }

  private drawDynamicBoard(time: number): void {
    const { boardLeft, boardTop, boardWidth, boardHeight } = this.layout;
    this.boardDynamicGraphics.clear();
    this.goalBeaconGraphics.clear();
    this.playerSpawnBurstGraphics.clear();
    this.spawnLaserGraphics.clear();
    // Same "hidden by default, shown only if actually redrawn this frame"
    // convention as trailCanvasImage (see drawLegacyContinuousPlayTrail) --
    // fillLegacyPlayerMarkerTile (the only thing that draws into this image)
    // is itself gated behind playerAlpha > 0 / markersBuiltIn / on-screen
    // checks further down, so there are real dirty frames where it never
    // runs at all.
    this.playerGlowCanvasImage?.setVisible(false);

    // resolveLegacyPlayPerfectPathTrail only ever reads this.maze/this.trail/
    // this.player -- the exact same shared fields the menu demo AI already
    // populates every step, so it was never actually play-specific, just
    // wired to only run there. The menu AI's own raw movement history could
    // include backtracking/dead-ends the player never needed on the real
    // shortest route back to start; deriving the same shortest-path-through-
    // visited-tiles trail for both surfaces carries play's exact trail
    // behavior over to the menu demo, as asked.
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
      resolveBleedGlowColor(this.trailPaletteHead, time, this.prefersLegacyReducedMotion())
    );
    this.drawLegacyProgressionBadge();
    this.drawLegacyLevelAnnouncer(time);

    // ONE trail renderer for both surfaces: the menu AI demo and the human
    // player draw the same Navigation Core continuous path through the same
    // function (the AI memory overlay below is a separate layer on top).
    this.drawLegacyContinuousPlayTrail(time, mazeLeft, mazeTop, mazeTileSize, this.resolveLegacyRenderedTrailHeadPoint(time), menuTrailAlphaMultiplier);

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
    // The beams fire after the build is complete and land at resolveIntroLaserEndMs
    // (== input unlock), so the cast (player/start/goal) appears at landing.
    const markersBuiltIn = this.menuStaticDrawLifecyclePhase !== 'building'
      || (this.resolveLegacyIntroState(time)?.laserProgress ?? 0) >= 1;
    const playerSpawnBurst = this.resolveLegacyPlayerSpawnBurstState(time);
    const playerTransferEnergy = this.resolveLegacyPlayerTransferState(time);
    // Drawn after the trail (not before) so the start/goal tiles always sit
    // on top of the trail's coloring instead of getting painted over
    // whenever the trail passes through those cells.
    if (markersBuiltIn && markerDeconstructAlpha > 0 && this.maze.start && this.isLegacyMenuPointVisibleInStaticDraw(this.maze.start)) {
      this.fillPlayDynamicMarkerTile(this.maze.start, mazeLeft, mazeTop, mazeTileSize, 0.9 * markerDeconstructAlpha, 'start', time);
    }
    if (markersBuiltIn && markerDeconstructAlpha > 0 && this.maze.goal && this.isLegacyMenuPointVisibleInStaticDraw(this.maze.goal)) {
      this.fillPlayDynamicMarkerTile(this.maze.goal, mazeLeft, mazeTop, mazeTileSize, 0.95 * markerDeconstructAlpha, 'goal', time);
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

    // The trail shine is drawn inside drawLegacyContinuousPlayTrail above for both surfaces.

    // Held at 0 through the beam-travel half of the spawn burst so the
    // marker itself pops in exactly as the beams converge (under the
    // flash, see drawLegacyEdgeLasers below), instead of sitting
    // there fully visible the whole time the beams are still arriving.
    const transferPlayerAlpha = playerTransferEnergy.phase === 'pending'
      ? 1
      : playerTransferEnergy.phase === 'outbound'
        ? 1 - playerTransferEnergy.outboundProgress
        : 0;
    const playerAlpha = this.menuStaticDrawLifecyclePhase === 'deconstructing' && this.playerTransferEnergyArmed
      ? transferPlayerAlpha
      : markerDeconstructAlpha * playerSpawnBurst.markerRevealAlpha;
    if (this.mode === 'menu') {
      if (
        markersBuiltIn
        && (
          this.menuStaticDrawLifecyclePhase !== 'deconstructing'
          || playerTransferEnergy.phase === 'pending'
          || playerTransferEnergy.phase === 'outbound'
        )
        && this.isLegacyMenuPointVisibleInStaticDraw(this.player)
      ) {
        this.fillLegacyPlayerMarkerTile(renderedPlayerPoint, mazeLeft, mazeTop, mazeTileSize, playerAlpha, time);
      }
    } else {
      if (
        playerAlpha > 0
        && markersBuiltIn
        && this.isLegacyMenuPointVisibleInStaticDraw(this.player)
      ) {
        this.fillLegacyPlayerMarkerTile(renderedPlayerPoint, mazeLeft, mazeTop, mazeTileSize, playerAlpha, time);
      }
    }
    // ONE laser system for both modes and both directions (edgeMarkers.ts):
    // ARRIVAL -- every diamond fires a beam inward to the spawn tile as the
    // maze starts to appear; DEPARTURE -- the player fires a beam outward to
    // every diamond, then the maze deconstructs. Both are pure projections of
    // the master timeline (introTimeline.ts).
    this.drawLegacyEdgeLasers(time, mazeLeft, mazeTop, mazeTileSize, renderedPlayerPoint, playerSpawnBurst);

    // Drawn last, after the trail/board content above -- the bleed-off dock
    // corridors reach the true screen edge (including the corners these
    // icons occupy), so the player's trail can visibly reach the exact same
    // pixels the settings cog and leaderboard icon sit on. Both are drawn
    // to this same boardDynamicGraphics layer (see their own comments for
    // why -- no separate depth-ordered GameObject for either), so draw
    // ORDER is what keeps them on top instead of getting painted over by
    // trail that reaches that corner, not a z-index.
    this.drawLegacyMenuSettingsCog(time);
    this.drawLegacyMenuLeaderboardIcon(time);
    this.boardDynamicDirty = false;
  }

  // Permanently retired in favor of drawLegacyLevelAnnouncer's centered,
  // between-mazes announcement -- a persistent corner number read as
  // background chrome and competed with the header's other icons for
  // attention every single frame, instead of only mattering at the one
  // moment (a level actually changing) it's genuinely informative. Left as
  // an always-hidden no-op rather than deleted outright: the text objects,
  // bounds, and pulse state it manages are still read by diagnostics/
  // collision-avoidance call sites elsewhere that don't need to change just
  // because this stopped drawing.
  private drawLegacyProgressionBadge(): VisualRect | null {
    this.clearLegacyPlayerProgressionBadge();
    this.clearLegacyMenuAiProgressionBadge();
    return null;
  }

  // The centered level digit is a pure projection of the intro/outro
  // timelines (introTimeline.ts): it fades/scales in across the first part of
  // the deconstruct (or, on a cold start with nothing to deconstruct from,
  // across the first 200 ms of the intro itself), holds at full opacity, and
  // fades out so it is gone at the exact instant the spawn laser lands and
  // input unlocks. levelAnnouncerBuildFadeOutArmed records that THIS build's
  // fade-in already happened during a preceding deconstruct.
  private resolveLegacyLevelAnnouncerVisualState(time: number): { alpha: number; scale: number; revealProgress: number } {
    const HIDDEN = { alpha: 0, scale: 1, revealProgress: 0 };
    if (this.overlay !== 'none') {
      return HIDDEN;
    }

    const phase = this.menuStaticDrawLifecyclePhase;

    const outro = this.resolveLegacyOutroState(time);
    if (outro !== null) {
      // Fades in during the deconstruct so it is already fully up when the
      // next intro starts (the intro then only has to fade it OUT).
      this.levelAnnouncerBuildFadeOutArmed = true;
      return this.applyLegacyLevelAnnouncerPulse(outro.digitAlpha, outro.digitScale);
    }

    const intro = this.resolveLegacyIntroState(time);
    if (intro !== null) {
      if (intro.digitAlpha <= 0) {
        this.levelAnnouncerBuildFadeOutArmed = false;
        return HIDDEN;
      }
      return this.applyLegacyLevelAnnouncerPulse(intro.digitAlpha, intro.digitScale);
    }

    if (phase !== 'building') {
      this.levelAnnouncerBuildFadeOutArmed = false;
    }
    return HIDDEN;
  }

  // The digit no longer breathes on a separate 3.6 s pulse (a third motion
  // clock competing with the intro's): alpha, scale and the tile-by-tile
  // sweep (revealProgress) all follow the one timeline-derived envelope.
  private applyLegacyLevelAnnouncerPulse(
    alpha: number,
    scale: number
  ): { alpha: number; scale: number; revealProgress: number } {
    return { alpha, revealProgress: alpha, scale };
  }

  // Centered, between-mazes level announcement -- replaces the old
  // persistent top-left badge (drawLegacyProgressionBadge, now retired).
  // Shared by both surfaces: menu's demo AI and real play both drive the
  // same menuStaticDrawLifecyclePhase transition, so this needs no mode
  // branch of its own beyond picking which track's level to show.
  private drawLegacyLevelAnnouncer(time: number): void {
    const { alpha, scale, revealProgress } = this.resolveLegacyLevelAnnouncerVisualState(time);
    this.levelAnnouncerLabelText.setVisible(false);
    if (alpha <= 0) {
      this.levelAnnouncerNumberGraphics.setVisible(false);
      // Bug fix: every call site that hides the level-announcer's number
      // used to only hide levelAnnouncerNumberGraphics -- the tile-font
      // Image pool (drawLegacyTileFontWord) added alongside it was never
      // included, so the number kept showing (e.g. over the auth/login
      // overlay) whenever it happened to already be visible the instant one
      // of these paths ran.
      this.levelAnnouncerNumberGlyphPool.forEach((image) => image.setVisible(false));
      this.levelAnnouncerNumberGlyphPool.forEach((image) => image.setVisible(false));
      return;
    }

    const trackId = this.resolveActiveLegacyProgressionTrackId();
    const track = this.progressionState.tracks[trackId];
    const centerX = this.layout.width / 2;
    const centerY = this.layout.height / 2;
    const numberFontSize = Math.round(Math.min(this.layout.width, this.layout.height) * 0.16);
    const levelDigits = String(track.level);

    // drawLegacyGlyphWordTileBlock -- same real corridor-tile material the
    // maze itself, the title, and Start/Login are all built from, not the
    // raster tile-font atlas (a pre-drawn glyph image merely cropped into
    // sub-tile chunks -- never actually made of discrete square tiles).
    // Bug fix: revealProgress was computed by resolveLegacyLevelAnnouncerVisualState
    // (its own fade-in window) but never actually passed down to the glyph
    // renderer -- drawLegacyLevelAnnouncerNumberGlyph hardcoded a full,
    // instant reveal, so the number always just faded in as one flat block
    // (via the whole-Graphics alpha below) instead of building tile-by-tile
    // the way the title/Start/Login words next to it do. Reported directly:
    // "is the level tiles not building out the number like it does for
    // title text tiles". Threading the same revealProgress this banner
    // already computes for its own fade timing through to the shared
    // tile-block renderer is the same wiring the title's own call site
    // already uses (this.resolveLegacyMenuPathTitleProgress()) -- no new
    // reveal math, just no longer discarding the value already computed.
    this.levelAnnouncerNumberGlyphPool.forEach((image) => image.setVisible(false));
    const cellSize = Math.max(2, Math.round(numberFontSize / 9));
    const glyphLayout = resolveLegacyGlyphWordLayout(levelDigits, 0, 0, cellSize);
    this.drawLegacyLevelAnnouncerNumberGlyph(this.levelAnnouncerNumberGraphics, glyphLayout, time, revealProgress);
    this.levelAnnouncerNumberGraphics
      .setPosition(centerX, centerY)
      .setScale(scale)
      .setAlpha(alpha)
      .setVisible(true);
  }

  // Renders the level-announcer's number as tile-block glyph cells (same
  // corridor material every other glyph word on screen is built from) with
  // a rainbow sampled across the word's own column span -- the same
  // midnight-rainbow material (and cycle speed) the trail already carries
  // elsewhere, spread across the digits instead of flashing every cell the
  // same color in lockstep, so it reads as one continuous rainbow sweep
  // across the number. Preserves the plain rendered-text predecessor's
  // deliberate "rainbow, not difficulty-tier color" choice (see this
  // method's caller) while switching only the glyph shape to tile-block.
  //
  // Also draws two small twinkling sparkle accents flanking the number,
  // vertically centered on it (local y = 0 is exactly the glyph word's own
  // vertical center, since resolveLegacyGlyphWordLayout centers the layout
  // around local (0, 0)) -- drawn into this same Graphics object so they
  // inherit the caller's position/scale/alpha transform for free instead of
  // needing their own separately-computed one.
  // The one shared renderer for every tile-block word on screen (title,
  // Start/Login, and the level number): samples ONE square tile -- the same
  // corridor material function the maze itself is built from
  // (drawLegacyPathMaterialTile) -- and rebuilds the word's letters/digits
  // piece by piece from a 5x7 bitmap grid (resolveLegacyGlyphWordLayout),
  // exactly the way the maze itself is built from repeated square tiles.
  // Replaced three separate, inconsistent renderers: the raster tile-font
  // atlas (a pre-drawn glyph image merely cropped into sub-tile chunks, not
  // actually made of discrete tiles -- couldn't be "sampled as a singular
  // square" because there wasn't one), and two earlier hand-tuned dot-cell
  // fallbacks (title's own prism-sweep gem cells, buttons' own trail-wipe
  // cells) that used this same material but a flat two-tone palette instead
  // of a rainbow.
  //
  // Color: every cell samples the exact same full-hue HSV rainbow formula
  // the level number always used (time-shifting hue keyed off the cell's
  // absolute column across the WHOLE word) -- continuous across letter
  // boundaries, not one flat color per letter, so it reads as a shifting
  // mirage sweeping across the word instead of color-blocked letters.
  // Reveal: revealProgress (default 1, i.e. fully drawn -- the level number
  // never animates in) gates how many cells from the front of `layout.cells`
  // are drawn at all, via the same ceil-based piece count title/buttons
  // already used for their own tile-by-tile build -- a cell is either fully
  // drawn or not drawn, never partially faded, matching the maze's own
  // reveal.
  // Tile art (Chip): each cell is a chip drawn by chipTileGraphics.drawChipCell from the board's own
  // computeChipGeometry (rounded outer corners, joins merged, one lit rim on exposed sides), replacing
  // the flat pale-mint material tile and its black border stroke. `clearFirst` is false for the Guide's
  // level numeral, which draws into the shared overlay graphics.
  private drawLegacyGlyphWordTileBlock(
    graphics: Phaser.GameObjects.Graphics,
    layout: LegacyGlyphWordLayout,
    time: number,
    alpha: number,
    revealProgress: number = 1,
    clearFirst: boolean = true
  ): void {
    if (clearFirst) {
      graphics.clear();
    }
    if (layout.cells.length <= 0 || alpha <= 0) {
      return;
    }
    // Chip geometry (the board's own: rounded convex corners, joins merged, one lit rim on exposed
    // sides) computed once per wordmark grid; per-cell colour stays the rainbow sweep. See the two
    // LEGACY_WORDMARK_CHIP_* constants for the rim/fill split.
    const geometry = resolveChipGridGeometry({
      grid: layout.grid,
      columns: layout.columns,
      rows: layout.rows,
      left: layout.left,
      top: layout.top,
      cellSize: layout.cellSize
    });
    const visibleCellCount = clamp(Math.ceil(layout.cells.length * clamp(revealProgress, 0, 1)), 0, layout.cells.length);
    for (let index = 0; index < visibleCellCount; index += 1) {
      const cell = layout.cells[index];
      const cellColor = Phaser.Display.Color.HSVToRGB(
        (time / LEGACY_GOAL_STAR_RING_SPIN_PERIOD_MS) + (cell.column / Math.max(1, layout.columns)),
        0.8,
        1
      ).color;
      drawChipCell(
        graphics,
        geometry,
        layout.left,
        layout.top,
        cell.column,
        cell.row,
        {
          rim: mixLegacyIridescentColor(cellColor, boardMaterial.white, LEGACY_WORDMARK_CHIP_RIM_LIGHTEN),
          fill: mixLegacyIridescentColor(cellColor, boardMaterial.void, LEGACY_WORDMARK_CHIP_FILL_CANVAS_MIX)
        },
        alpha
      );
    }
  }

  private drawLegacyLevelAnnouncerNumberGlyph(
    graphics: Phaser.GameObjects.Graphics,
    layout: LegacyGlyphWordLayout,
    time: number,
    revealProgress: number = 1
  ): void {
    this.drawLegacyGlyphWordTileBlock(graphics, layout, time, 1, revealProgress);
    // Matches the title's own call site (drawn unconditionally alongside its
    // tile-block build, not gated on reveal completion) -- the sparkles are a
    // constant ambient accent independent of how much of the word has
    // dropped in yet.
    this.drawLegacyWordmarkAmbientSparkles(graphics, layout.left + (layout.width / 2), 0, layout.width / 2, layout.height / 2, time, 1);
  }

  // A small 4-point sparkle/glint glyph, used for the level-announcer's
  // twinkling accents, the title's orbit-sigil twinkles, and the goal
  // star's own surface glints. Was a single flat crossed-diamond shape at
  // one ambient fillStyle -- reworked (per feedback it read as "weak"
  // next to the rest of the UI) into three layered passes matching how a
  // real sparkle/glint actually reads: a soft wide glow halo, a crisp core
  // cross, and a tiny hot white catchlight where the rays cross. Takes
  // color/alpha directly now instead of relying on the caller's ambient
  // fillStyle, since it needs its own alpha ramp across the three passes.
  private drawLegacyFourPointSparkle(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    size: number,
    color: number,
    alpha: number
  ): void {
    const buildCross = (scale: number): void => {
      const armLength = size * scale;
      graphics.fillPoints([
        new Phaser.Math.Vector2(centerX, centerY - armLength),
        new Phaser.Math.Vector2(centerX + (armLength * 0.22), centerY),
        new Phaser.Math.Vector2(centerX, centerY + armLength),
        new Phaser.Math.Vector2(centerX - (armLength * 0.22), centerY)
      ], true);
      graphics.fillPoints([
        new Phaser.Math.Vector2(centerX - armLength, centerY),
        new Phaser.Math.Vector2(centerX, centerY - (armLength * 0.22)),
        new Phaser.Math.Vector2(centerX + armLength, centerY),
        new Phaser.Math.Vector2(centerX, centerY + (armLength * 0.22))
      ], true);
    };
    graphics.fillStyle(color, alpha * 0.35);
    buildCross(1.8);
    graphics.fillStyle(color, alpha);
    buildCross(1);
    graphics.fillStyle(cyberArcadeMaterial.rail.white, alpha);
    graphics.fillCircle(centerX, centerY, size * 0.16);
  }

  // Deterministic pseudo-random unit float (0..1) from any real-numbered
  // seed -- same "multiply by a big irrational-ish constant, take the
  // fractional part" trick GLSL shaders use for a cheap hash, used here
  // (not Math.random()) so a sparkle slot's position/timing stay perfectly
  // stable frame-to-frame given the same (slot, cycle) seed instead of
  // jittering every draw call.
  private resolveLegacyPseudoRandomUnit(seed: number): number {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  // A point at fraction `t` (0..1) around the perimeter of a `width` x
  // `height` rectangle centered on the origin, walking clockwise from the
  // top-left corner -- used to scatter sparkles anywhere around a
  // wordmark's outside edge rather than pinning them to fixed left/right
  // spots.
  private resolveLegacyWordmarkSparklePerimeterPoint(
    t: number,
    width: number,
    height: number
  ): { x: number; y: number } {
    const perimeter = Math.max(1, (width * 2) + (height * 2));
    let distance = clamp(t, 0, 1) * perimeter;
    const halfW = width / 2;
    const halfH = height / 2;
    if (distance <= width) {
      return { x: -halfW + distance, y: -halfH };
    }
    distance -= width;
    if (distance <= height) {
      return { x: halfW, y: -halfH + distance };
    }
    distance -= height;
    if (distance <= width) {
      return { x: halfW - distance, y: halfH };
    }
    distance -= width;
    return { x: -halfW, y: halfH - distance };
  }

  // Small rainbow sparkles that twinkle in and out at random points around
  // a wordmark's outside edge (title, Start/Login button) -- replaces the
  // old two fixed sparkles pinned one to each side at a size scaled off the
  // whole word's half-width (huge on a long word). Reported as needing to
  // be "a lot smaller" and to "twinkle in and out randomly at random
  // positions around the outside of the text" instead of two fixed spots
  // constantly pulsing in place.
  //
  // Stateless: no sparkle objects persist between frames. Each of
  // LEGACY_WORDMARK_SPARKLE_COUNT independent "slots" derives its own cycle
  // length, phase offset, and per-cycle perimeter position + color purely
  // from (slot index, current cycle number) via resolveLegacyPseudoRandomUnit
  // -- deterministic given those two integers, so a slot holds still for its
  // entire blip and only jumps to a new random spot the next time its own
  // cycle rolls over, rather than drifting every frame the way a
  // time-seeded random would.
  private drawLegacyWordmarkAmbientSparkles(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    halfWidth: number,
    halfHeight: number,
    time: number,
    alpha: number,
    slotCount: number = LEGACY_WORDMARK_SPARKLE_COUNT,
    seedSalt: number = 0
  ): void {
    if (this.prefersLegacyReducedMotion() || alpha <= 0 || halfWidth <= 0 || halfHeight <= 0) {
      return;
    }
    const margin = Math.max(4, halfHeight * 0.35);
    const perimeterWidth = (halfWidth * 2) + (margin * 2);
    const perimeterHeight = (halfHeight * 2) + (margin * 2);
    // Small relative to a single glyph's own height, not the whole word's
    // half-width -- the previous formula (halfWidth * 0.14) grew with word
    // length and read as oversized jewelry on "MAZER"; this stays tiny
    // regardless of how many letters are in the word.
    const baseSize = Math.max(1.5, halfHeight * 0.13);

    for (let slot = 0; slot < slotCount; slot += 1) {
      // seedSalt lets multiple independent callers (each orbit diamond, in
      // addition to the one wordmark) share this same method without their
      // sparkle patterns all landing in lockstep -- every seed below mixes
      // it in, so two callers with different salts get fully independent
      // positions/timing/color even at the same `time` and `slot` index.
      const slotSeed = ((slot + 1) * 91.7) + (seedSalt * 13.37);
      const periodMs = LEGACY_WORDMARK_SPARKLE_CYCLE_MS * (0.7 + (this.resolveLegacyPseudoRandomUnit(slotSeed) * 0.9));
      const phaseOffsetMs = this.resolveLegacyPseudoRandomUnit(slotSeed + 0.31) * periodMs;
      const cycleTime = time + phaseOffsetMs;
      const cycleIndex = Math.floor(cycleTime / periodMs);
      const cyclePhase = (cycleTime - (cycleIndex * periodMs)) / periodMs;

      // Fully invisible outside a short pulse window centered in the
      // cycle, eased in/out with a cosine -- the actual "twinkle in and
      // out" (as opposed to the old sparkles' constant partial-visibility
      // sine pulse that never fully vanished).
      const distanceFromPulseCenter = Math.abs(cyclePhase - 0.5);
      if (distanceFromPulseCenter >= LEGACY_WORDMARK_SPARKLE_PULSE_HALF_WIDTH) {
        continue;
      }
      const pulseLinear = 1 - (distanceFromPulseCenter / LEGACY_WORDMARK_SPARKLE_PULSE_HALF_WIDTH);
      const pulseEased = 0.5 - (0.5 * Math.cos(pulseLinear * Math.PI));

      // A fresh pseudo-random perimeter position + hue + size each time
      // this slot's cycle rolls over (keyed by cycleIndex, not time) --
      // "random positions," plural, not one fixed spot reused every cycle.
      const positionSeed = (slot * 733) + (cycleIndex * 17.13) + 4.1 + (seedSalt * 5.51);
      const perimeterT = this.resolveLegacyPseudoRandomUnit(positionSeed);
      const { x: offsetX, y: offsetY } = this.resolveLegacyWordmarkSparklePerimeterPoint(
        perimeterT,
        perimeterWidth,
        perimeterHeight
      );
      const hue = this.resolveLegacyPseudoRandomUnit(positionSeed + 0.5);
      const sizeJitter = 0.75 + (this.resolveLegacyPseudoRandomUnit(positionSeed + 0.77) * 0.5);
      const color = Phaser.Display.Color.HSVToRGB(hue, 0.85, 1).color;

      this.drawLegacyFourPointSparkle(
        graphics,
        centerX + offsetX,
        centerY + offsetY,
        baseSize * sizeJitter,
        color,
        alpha * pulseEased
      );
    }
  }

  // markerRevealAlpha is 0 for the whole beam-travel span (the marker
  // itself stays invisible while the beams are still en route) then snaps
  // to 1 the instant the flash starts -- the flash's own brightness is what
  // sells the "impact" moment the marker pops in under, not a separate fade
  // curve of its own.
  private resolveLegacyPlayerSpawnBurstState(time: number): {
    active: boolean;
    flashProgress: number;
    markerRevealAlpha: number;
    travelProgress: number;
  } {
    if (this.playerSpawnBurstStartedAtMs === null) {
      return { active: false, flashProgress: 0, markerRevealAlpha: 1, travelProgress: 1 };
    }

    // Same pause-aware correction resolveLegacyPlayerTransferState applies
    // (see gameplayTransferPausedDurationMs's own field comment) -- safe
    // to apply unconditionally here too: the pause overlay can only ever
    // be opened from real Play mode (handleLegacyQaOpenPauseOverlay's own
    // 'not-play-mode' guard), so this offset is always exactly 0 for
    // Menu mode's own ambient choreography, which this same resolver also
    // serves.
    const elapsedMs = time - this.playerSpawnBurstStartedAtMs - this.resolveGameplayTransferPausedOffsetMs(time);
    const totalMs = LEGACY_PLAYER_SPAWN_BEAM_TRAVEL_MS + LEGACY_PLAYER_SPAWN_FLASH_MS;
    if (elapsedMs < 0) {
      // Armed but the beams have not left yet (they leave when the BUILD completes, a long way into the
      // intro): the player has not arrived, so its marker stays hidden until the landing.
      return { active: false, flashProgress: 0, markerRevealAlpha: 0, travelProgress: 0 };
    }
    if (elapsedMs >= totalMs) {
      return { active: false, flashProgress: 0, markerRevealAlpha: 1, travelProgress: 1 };
    }

    // The laser is a pure function of time since it left its station
    // (introTimeline.ts), so menu and play can never disagree about it.
    const laser = resolveSpawnLaser(elapsedMs);
    return {
      active: true,
      flashProgress: laser.spawnPop,
      markerRevealAlpha: laser.markerRevealed ? 1 : 0,
      travelProgress: laser.laserProgress
    };
  }

  private clearLegacyPlayerProgressionBadge(): void {
    this.progressionBadgeBounds = null;
    this.progressionBadgeLabelBounds = null;
    this.progressionBadgeTextBounds = null;
    this.progressionBadgeTextFits = false;
    this.progressionBadgeText.setVisible(false);
    this.progressionBadgeLabelText.setVisible(false);
  }

  private clearLegacyMenuAiProgressionBadge(): void {
    this.menuAiProgressionBadgeBounds = null;
    this.menuAiProgressionBadgeLabelBounds = null;
    this.menuAiProgressionBadgeTextBounds = null;
    this.menuAiProgressionBadgeTextFits = false;
    this.menuAiProgressionBadgeText.setVisible(false);
    this.menuAiProgressionBadgeLabelText.setVisible(false);
    if (this.overlay === 'auth') {
      this.levelAnnouncerLabelText.setVisible(false);
      this.levelAnnouncerNumberGraphics.setVisible(false);
      // Bug fix: every call site that hides the level-announcer's number
      // used to only hide levelAnnouncerNumberGraphics -- the tile-font
      // Image pool (drawLegacyTileFontWord) added alongside it was never
      // included, so the number kept showing (e.g. over the auth/login
      // overlay) whenever it happened to already be visible the instant one
      // of these paths ran.
      this.levelAnnouncerNumberGlyphPool.forEach((image) => image.setVisible(false));
    }
  }

  private drawLegacyMenuSettingsCog(time: number): void {
    if (this.mode !== 'menu' || this.overlay !== 'none') {
      this.headerSettingsIconImage.setVisible(false);
      return;
    }

    const laneTop = this.layout.lanes.hud?.top ?? 0;
    const frame = resolveLegacyHeaderControlFrame({
      height: this.layout.height,
      hudHeight: this.layout.lanes.hud?.height ?? 64,
      hudTop: laneTop,
      placement: 'trailing',
      safeArea: this.layout.headerSafeInset,
      sizeScale: this.layout.headerIconScale,
      width: this.layout.width
    });
    // Same classic blink/grow-shrink pulse the procedural gear had (and the
    // Start/Login glyphs share) -- applied to the real settings icon
    // (MAZER_HUD_SETTINGS_TEXTURE_KEY) via applyLegacyHudIconFrame instead
    // of the hand-drawn thin-line gear this replaced.
    const phase = (Math.sin((time / LEGACY_MENU_BLINK_PULSE_MS) * Math.PI * 2) + 1) / 2;
    const blinkAlpha = clamp(0.22 + (phase * 0.78) + (this.menuSettingsCogActive ? 0.08 : 0), 0.14, 1);
    const blinkScale = 0.92 + (phase * 0.08) + (this.menuSettingsCogActive ? 0.02 : 0);
    // 1.15x, not 0.68x (the old gear's own outer-diameter ratio) -- the real
    // icon reads noticeably smaller than the equivalent-diameter procedural
    // gear at the same bounding size (reported "icons are too small"), so
    // this is deliberately bigger than the old shape's own footprint.
    const desiredSize = Math.min(frame.width, frame.height) * 1.15 * blinkScale;
    this.applyLegacyHudIconFrame(
      this.headerSettingsIconImage,
      MAZER_HUD_SETTINGS_ICON_METRICS,
      frame.centerX,
      frame.centerY,
      desiredSize,
      blinkAlpha
    );
  }

  // Shares the settings cog's header slot on the same (trailing) side via
  // slot 1, flowing inward from it with the header-control system's own
  // built-in spacing -- the LVL badge already occupies the leading side, so
  // pairing leaderboard with settings on the trailing side (rather than the
  // brief's abstract leading/trailing split) is the one that doesn't
  // collide with existing, load-bearing UI.
  private drawLegacyMenuLeaderboardIcon(time: number): void {
    if (this.mode !== 'menu' || this.overlay !== 'none') {
      this.headerLeaderboardIconImage.setVisible(false);
      return;
    }

    const laneTop = this.layout.lanes.hud?.top ?? 0;
    const frame = resolveLegacyHeaderControlFrame({
      height: this.layout.height,
      hudHeight: this.layout.lanes.hud?.height ?? 64,
      hudTop: laneTop,
      placement: 'trailing',
      safeArea: this.layout.headerSafeInset,
      sizeScale: this.layout.headerIconScale,
      slot: 1,
      width: this.layout.width
    });
    // Same blink/grow-shrink pulse the procedural bar-chart glyph had --
    // applied to the real leaderboard icon (MAZER_HUD_LEADERBOARD_TEXTURE_KEY)
    // via applyLegacyHudIconFrame instead of the three hand-drawn bars this
    // replaced.
    const phase = (Math.sin((time / LEGACY_MENU_BLINK_PULSE_MS) * Math.PI * 2) + 1) / 2;
    const blinkAlpha = clamp(0.22 + (phase * 0.78) + (this.menuLeaderboardActive ? 0.08 : 0), 0.14, 1);
    const blinkScale = 0.92 + (phase * 0.08) + (this.menuLeaderboardActive ? 0.02 : 0);
    const desiredSize = Math.min(frame.width, frame.height) * 1.15 * blinkScale;
    this.applyLegacyHudIconFrame(
      this.headerLeaderboardIconImage,
      MAZER_HUD_LEADERBOARD_ICON_METRICS,
      frame.centerX,
      frame.centerY,
      desiredSize,
      blinkAlpha
    );
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
    // The AI's committed-target tile is intentionally not marked: the red
    // square drawn one step ahead of the demo walker was removed per owner
    // request (2026-11-05). Option tiles still render.
    const { optionPoints } = this.resolveLegacyMenuAiMemoryPoints();
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
  }

  // Advances trailAnimationElapsedMs -- the one shared, PAUSABLE clock for
  // the continuous trail's color phase, shared shine distance, and quiet
  // interval -- by this frame's real delta, but ONLY while Active Play is
  // genuinely visible (mode==='play' and no overlay covering the board) and
  // reduced motion is off. Otherwise leaves the accumulated total exactly
  // where it is and clears the real-time checkpoint, so the next active
  // frame adds only its own delta instead of the whole paused/reduced-
  // motion gap -- this is what makes Pause freeze the exact visual phase
  // and Resume continue from it rather than jumping to wherever an
  // uninterrupted clock would now say it should be. Deliberately keyed only
  // to mode/overlay/reduced-motion -- viewport resize, board zoom, Trail
  // Fade changes, and ordinary path extension never touch it.
  // mode/overlay alone aren't enough to mean "settled, visible, interactive
  // gameplay" -- they're also true during portions of maze build/deconstruct,
  // a pending reset/generation request, and a staged reveal, all of which
  // isLegacyPlayLifecycleInputLocked() already tracks (the same lock that
  // gates real input) for exactly this reason. Without it, a trail that
  // materializes mid-transition could start its color/shine phase already
  // advanced by whatever time passed while the player couldn't see or
  // control it.
  private advanceLegacyTrailAnimationClock(time: number): number {
    // BOTH surfaces run this clock. It used to be play-only, so on the main menu (the AI demo) the trail's time
    // term sat at 0 forever: its colour changed only with distance walked and never with time, while the title,
    // the level numeral and the stars all shift. Owner, 2026-11-11: "why is the color of the trail not color
    // shifting like everything else we have ... the colors is still and not changing".
    const isTrailVisibleAndLive = (this.mode === 'play' || this.mode === 'menu')
      && this.overlay === 'none'
      && !this.isLegacyPlayLifecycleInputLocked();
    if (isTrailVisibleAndLive && !this.prefersLegacyReducedMotion()) {
      if (this.trailAnimationLastRealMs !== null) {
        this.trailAnimationElapsedMs += Math.max(0, time - this.trailAnimationLastRealMs);
      }
      this.trailAnimationLastRealMs = time;
    } else {
      this.trailAnimationLastRealMs = null;
    }
    return this.trailAnimationElapsedMs;
  }

  // Navigation Core v1's continuous play trail -- one logically continuous
  // path instead of the old per-cell hollow-frame/texture-overlay/pulse-
  // window trio (still used by the menu's own ambient demo above,
  // deliberately unchanged). Builds fresh from
  // resolveLegacyPlayPerfectPathTrail() every call rather than caching the
  // committed geometry separately from the live head segment -- see
  // Wave 4D-A's own frame-time measurement (docs/current-truth.md) for why
  // that's an acceptable simplification at today's path lengths rather than
  // premature caching.
  //
  // Renders one canonical geometry through three bounded passes -- a soft
  // outer spectral glow, the crisp 16%-tile core, then the tapered shared
  // shine blended into the core -- all from the same per-point color/alpha,
  // never independent per-cell effects or separately clocked layers.
  private drawLegacyContinuousPlayTrail(
    time: number,
    originX: number,
    originY: number,
    tileSize: number,
    renderedPlayerPoint: LegacyPoint,
    alphaMultiplier: number
  ): void {
    const animationTime = this.advanceLegacyTrailAnimationClock(time);
    this.trailPaletteHead = null;
    // Hidden by default -- every early return below (nothing to draw this
    // frame) must leave the canvas image hidden, not showing stale pixels
    // from the last frame that actually had a trail. Only re-shown once a
    // real geometry is about to be drawn into it, further down.
    this.trailCanvasImage?.setVisible(false);
    if (alphaMultiplier <= 0 || tileSize <= 0) {
      return;
    }
    const perfectPath = this.resolveLegacyPlayPerfectPathTrail();
    if (perfectPath.length === 0) {
      return;
    }
    // Trail Fade slides the route's origin forward over time (see
    // resolveLegacyPlayPerfectPathTrail); track how far it's actually moved,
    // in real path-length px over the true floor grid, so the color phase
    // below can stay stable on a given physical cell instead of visibly
    // rebasing every time the origin advances.
    const currentOrigin = perfectPath[0]!;
    if (
      this.lastTrailOriginPoint
      && (this.lastTrailOriginPoint.x !== currentOrigin.x || this.lastTrailOriginPoint.y !== currentOrigin.y)
    ) {
      const originAdvance = resolveLegacyShortestPath(this.maze.grid, this.lastTrailOriginPoint, currentOrigin, 'direct-floor');
      if (originAdvance.found && originAdvance.stepCount !== null) {
        this.trailOriginAdvanceDistancePx += originAdvance.stepCount * tileSize;
      }
    }
    this.lastTrailOriginPoint = copyPoint(currentOrigin);
    // The perfect-path's own final point is always this.player (the
    // logical, already-arrived tile) -- replaced here with the caller's
    // rendered/interpolated player point so the trail visibly extends
    // during a glide instead of popping to full length the instant a move
    // commits. See navigationCoreTrail.ts's BuildContinuousTrailPathOptions
    // for why this must be the interpolated point, not the logical one.
    // The tile the player just left (the trail array appends one point per accepted move): tells a forward step
    // from a step back over the trail, which must keep the arrival tile in the drawn path (trailHeadPath.ts).
    const previousTrailTile = this.trail.length > 1 ? this.trail[this.trail.length - 2]! : null;
    const gridPath = resolveTrailGridPathWithHead(perfectPath, previousTrailTile, renderedPlayerPoint);

    // Real, measured frame-time evidence (Wave 4D-A's own frame-time
    // measurement requirement) -- geometryBuildMs covers path building +
    // corner rounding + resampling; drawMs (below) covers the actual
    // stroke calls. performance.now() unconditionally: this method only
    // ever runs in a real browser Scene.
    const perfBuildStartedAtMs = performance.now();
    const geometry = buildContinuousTrailPath({
      gridPath,
      originX,
      originY,
      tileSize,
      cornerRadiusRatio: LEGACY_PLAY_TRAIL_CORNER_RADIUS_RATIO,
      playerTrimRatio: LEGACY_PLAY_TRAIL_PLAYER_TRIM_RATIO
    });
    if (geometry.totalLength <= 0 || geometry.vertices.length < 2) {
      return;
    }
    const vertices = resampleTrailVertices(geometry.vertices, LEGACY_PLAY_TRAIL_RESAMPLE_INTERVAL_PX);
    const perfBuildEndedAtMs = performance.now();

    // Trail Shine setting + reduced motion share this one gate (see
    // isLegacyTrailShineVisible's own definition) -- reduced motion keeps
    // the connected base trail fully visible, it just never gets the
    // traveling highlight. Driven by the pausable animationTime, not raw
    // scene time, so Pause freezes it and reduced motion holds it static
    // rather than snapping to a random phase whenever it's re-enabled.
    const shineEnabled = this.isLegacyTrailShineVisible();
    let shineState: ReturnType<typeof advanceTrailShineState> | null = null;
    if (shineEnabled) {
      shineState = advanceTrailShineState(
        geometry.totalLength,
        animationTime,
        this.trailShineLapStartedAtMs,
        this.trailShineLapCycleLength,
        {
          speedPxPerMs: (tileSize * LEGACY_PLAY_TRAIL_SHINE_SPEED_TILES_PER_SEC) / 1000,
          lengthRatio: LEGACY_PLAY_TRAIL_SHINE_LENGTH_RATIO,
          travelEnvelopeRatio: LEGACY_PLAY_TRAIL_SHINE_TRAVEL_ENVELOPE_RATIO,
          quietGapRatio: LEGACY_PLAY_TRAIL_SHINE_QUIET_GAP_RATIO,
          minTotalLengthForShine: tileSize * LEGACY_PLAY_TRAIL_SHINE_MIN_TILES
        }
      );
      this.trailShineLapStartedAtMs = shineState.lapStartedAtMs;
      this.trailShineLapCycleLength = shineState.lapCycleLength;
    }

    // Iridescent colour and pulse (src/render/trailIridescence.ts). The Trail Shine setting is the trail's
    // animation switch: off, or reduced motion, freezes it to the static iridescent gradient (no time term,
    // no wave, constant breath), which is exactly what shineEnabled already means.
    const trailAnimated = shineEnabled;
    this.trailPaletteHead = {
      distanceTiles: (geometry.totalLength + this.trailOriginAdvanceDistancePx) / tileSize,
      timeMs: animationTime,
      animated: trailAnimated
    };
    const trailBreath = resolveTrailBreath(animationTime, !trailAnimated);
    const widthScale = resolveTrailWidthScale(trailBreath);
    const restingWidths = resolveTrailWidths(tileSize);
    const coreWidth = restingWidths.coreWidth * widthScale;
    const glowWidth = restingWidths.glowWidth * widthScale;
    const underlayWidth = restingWidths.underlayWidth * widthScale;
    const glowAlphaScale = resolveTrailGlowAlphaScale(trailBreath);
    // Trail Fade OFF: the full retained trail stays at one stable, uniform
    // base alpha (still subject to lifecycle/deconstruction alpha via
    // alphaMultiplier) -- no age gradient. Trail Fade ON: the existing
    // smooth age/distance opacity, continuous by distance so there is no
    // per-cell alpha step.
    const trailFadeEnabled = this.settings.toggleTrailFade;
    let perfStrokeSegmentCount = 0;

    // Style is computed once per segment, then drawn in two SEPARATE
    // complete passes over every segment (all glow, then all core) rather
    // than interleaved glow-then-core-then-next-segment's-glow. Interleaving
    // meant a LATER segment's wide, soft glow stroke was composited on top
    // of an EARLIER segment's already-drawn crisp core -- most visible
    // right where the path bends, where consecutive short resampled
    // segments change direction quickly and their round-capped strokes
    // overlap. Splitting into two full passes means every core stroke ends
    // up on top of every glow stroke, with no draw-order dependency on
    // segment index.
    const segments = [];
    for (let i = 1; i < vertices.length; i += 1) {
      const previous = vertices[i - 1]!;
      const current = vertices[i]!;
      // A subpath break is a topology discontinuity (e.g. a wraparound
      // crossing) -- distance/color/shine still read continuously across
      // it (see navigationCoreTrail.ts), but no line is drawn between the
      // two sides.
      if (current.newSubpath) {
        continue;
      }
      perfStrokeSegmentCount += 1;

      const midDistance = (previous.distance + current.distance) / 2;
      const ageAlpha = trailFadeEnabled
        ? clamp(
          LEGACY_PLAY_TRAIL_AGE_ALPHA_MIN
            + ((midDistance / geometry.totalLength) * (LEGACY_PLAY_TRAIL_AGE_ALPHA_MAX - LEGACY_PLAY_TRAIL_AGE_ALPHA_MIN)),
          LEGACY_PLAY_TRAIL_AGE_ALPHA_MIN,
          LEGACY_PLAY_TRAIL_AGE_ALPHA_MAX
        )
        : LEGACY_PLAY_TRAIL_AGE_ALPHA_MAX;

      // Color phase uses the physically-stable distance (mid-distance along
      // the CURRENT window plus how far the window's own origin has already
      // advanced), not the raw window-relative midDistance ageAlpha above
      // uses -- otherwise a Trail-Fade-truncated cell's color would jump
      // every time the origin slides forward. The sweep is periodic over
      // distance, so this is a phase realignment, not a length change.
      const colorPhaseTiles = (midDistance + this.trailOriginAdvanceDistancePx) / tileSize;
      const sample = sampleIridescentTrail(colorPhaseTiles, animationTime, !trailAnimated);
      const baseColor = sample.glow;
      let coreColor = sample.core;
      let coreAlpha = ageAlpha * alphaMultiplier;

      if (shineState && shineState.visible && shineState.halfLength > 0) {
        const distanceFromShineCenter = Math.abs(midDistance - shineState.centerDistance);
        if (distanceFromShineCenter <= shineState.halfLength) {
          const taper = 1 - clamp(distanceFromShineCenter / shineState.halfLength, 0, 1);
          const highlightStrength = taper * shineState.envelopeAlpha;
          // OWNER-AUTHORIZED VISUAL AMENDMENT (2026-09-09): the shine was
          // reported as not visibly reading as a traveling highlight. Its
          // own math was correct (verified live: clock advances, envelope
          // fades, position travels the whole path), but an 0.85 white
          // mix riding a FULLY-SATURATED rainbow base barely registered.
          // Now that the base palette is calm (see
          // NAVIGATION_CORE_TRAIL_ENERGY_STOPS) a soft highlight reads
          // clearly; nudged the mix/alpha up slightly so it still lands
          // as a definite travelling light without becoming a hard flash.
          coreColor = mixLegacyIridescentColor(coreColor, LEGACY_PLAY_TRAIL_SHINE_HIGHLIGHT_COLOR, highlightStrength * 0.92);
          coreAlpha = Math.min(1, coreAlpha + (highlightStrength * 0.58));
        }
      }

      segments.push({ previous, current, baseColor, coreColor, coreAlpha });
    }

    // Composited on the real 2D canvas (src/render/navigationCoreTrailCanvas.ts),
    // not stroked as Phaser Graphics vector paths -- see trailCanvasImage's
    // own field comment for why (Phaser.CANVAS has no WebGL-only postFX
    // blur to reach for, and a raw CanvasRenderingContext2D gives real round
    // joins on one continuous path plus a genuine shadowBlur halo, neither
    // of which a Graphics stroke call exposes).
    const canvasSegments: TrailLayerSegment[] = segments.map((segment) => ({
      previous: segment.previous,
      current: segment.current,
      glowColor: segment.baseColor,
      coreColor: segment.coreColor,
      alpha: segment.coreAlpha,
      // The dark ground follows the lifecycle fade only, never the age fade (keeps the core's contrast).
      underlayAlpha: alphaMultiplier
    }));
    this.drawTrailCanvasSegments(canvasSegments, coreWidth, glowWidth, underlayWidth, glowAlphaScale);

    const perfDrawEndedAtMs = performance.now();
    this.lastTrailPerfDiagnostics = {
      vertexCountBeforeResample: geometry.vertices.length,
      vertexCountAfterResample: vertices.length,
      strokeSegmentCount: perfStrokeSegmentCount,
      geometryBuildMs: perfBuildEndedAtMs - perfBuildStartedAtMs,
      drawMs: perfDrawEndedAtMs - perfBuildEndedAtMs,
      totalMs: perfDrawEndedAtMs - perfBuildStartedAtMs,
      totalLengthPx: geometry.totalLength,
      tileSize,
      shineEnabled,
      trailFadeEnabled
    };
  }

  // Resizes/repositions the trail's own canvas (only when its bounding box
  // or the required backing resolution actually changed -- not
  // unconditionally every frame), clears it, draws into it via the pure
  // Canvas-2D compositor, and shows the backing image at the right spot in
  // boardZoomContainer. A no-op (leaves the image hidden, per
  // drawLegacyContinuousPlayTrail's own default-hidden behavior at the top
  // of that method) if there's nothing to draw or the canvas texture
  // failed to initialize.
  //
  // Backing resolution: the texture's own pixel buffer is sized at
  // logical-size * resolution (the same devicePixelRatio-derived policy
  // src/boot/canvasResolution.ts already applies to the game's main
  // canvas, times the board container's own current zoom scale, so a
  // future zoom feature doesn't undersample this layer either), then the
  // Image's DISPLAY size is set back to the logical size -- exactly the
  // "render at N x display resolution, then downscale" supersampling
  // pattern, so the trail stays crisp at DPR3 and compact/fractional tile
  // sizes instead of the canvas's pixel buffer being 1:1 with logical
  // board-space units and reading as soft/blurry next to the rest of the
  // (resolution-aware) scene.
  private drawTrailCanvasSegments(
    segments: readonly TrailLayerSegment[],
    coreWidth: number,
    glowWidth: number,
    underlayWidth: number,
    glowAlphaScale: number
  ): void {
    if (!this.trailCanvasTexture || !this.trailCanvasImage || segments.length === 0) {
      return;
    }
    const padding = Math.ceil(glowWidth);
    const rawBounds = computeTrailCanvasBounds(segments, padding);
    if (!rawBounds || rawBounds.width <= 0 || rawBounds.height <= 0) {
      return;
    }
    // Whole-pixel origin: Phaser (roundPixels) floors an Image's position, so a fractional one made the trail jump a
    // css px each time the head crossed an integer. See src/render/pixelAlignment.ts.
    const bounds = alignBoundsToWholePixels(rawBounds);
    const width = Math.max(1, Math.ceil(bounds.width));
    const height = Math.max(1, Math.ceil(bounds.height));
    const zoomScale = Math.max(1, this.boardZoomContainer.scaleX, this.boardZoomContainer.scaleY);
    const resolution = Math.min(
      MAZER_CANVAS_RESOLUTION_MAX * 2,
      resolveMazerCanvasResolution() * zoomScale
    );
    const backingWidth = Math.max(1, Math.ceil(width * resolution));
    const backingHeight = Math.max(1, Math.ceil(height * resolution));
    if (
      backingWidth !== this.trailCanvasWidth
      || backingHeight !== this.trailCanvasHeight
      || resolution !== this.trailCanvasResolution
    ) {
      this.trailCanvasTexture.setSize(backingWidth, backingHeight);
      this.trailCanvasWidth = backingWidth;
      this.trailCanvasHeight = backingHeight;
      this.trailCanvasResolution = resolution;
    } else {
      this.trailCanvasTexture.clear(0, 0, backingWidth, backingHeight, false);
    }
    // Idempotent (setTransform, not scale/save/restore) -- context state
    // otherwise persists across frames and would compound every call. Path
    // geometry (coordinates, lineWidth) stays in LOGICAL board-space units --
    // the transform matrix scales those up to the higher-resolution backing
    // buffer, so multiplying them by `resolution` again here would double-
    // scale them.
    //
    // shadowBlur is the one exception, verified empirically (not assumed):
    // held a shape's own DEVICE-pixel footprint constant while sweeping
    // setTransform's scale from 1 to 4 with shadowBlur set to a fixed value
    // each time -- the rendered halo's device-pixel width was bit-for-bit
    // identical (31px) at every scale. shadowBlur is a raw device-pixel
    // radius that the CTM does not touch, unlike every other value here. So
    // it needs the opposite treatment: passing the logical glow radius
    // through unscaled would make the glow read `resolution` times TIGHTER
    // than intended once the backing buffer is downscaled back to the
    // Image's logical display size (exactly the bug a reviewer flagged after
    // this comment previously claimed shadowBlur followed the transform like
    // everything else) -- multiply it by `resolution` explicitly so the
    // device-pixel blur, once downscaled for display, reads as the same
    // logical radius regardless of backing resolution.
    this.trailCanvasTexture.context.setTransform(resolution, 0, 0, resolution, 0, 0);
    const trailDrawOptions = {
      originX: bounds.left,
      originY: bounds.top,
      coreWidth,
      glowWidth,
      glowAlphaRatio: LEGACY_PLAY_TRAIL_GLOW_ALPHA_RATIO * glowAlphaScale,
      glowBlurPx: Math.max(2, glowWidth * 0.5) * resolution
    };
    if (this.boardTileStyle === 'chip') {
      // Open item A8 of the Chip amendment: several energy stops fall under 3:1 on the mid-tone chip, so
      // the trail sits on a dark underlay (bg.canvas, wider than the core: resolveTrailWidths). Layering,
      // bottom to top: neon bloom, dark underlay, crisp core (src/render/trailLayersCanvas.ts). Same path and
      // colours as the single compositor; the underlay follows the lifecycle fade only (underlayAlpha), the
      // core also follows the trail's age fade.
      drawTrailLayersToCanvasContext(this.trailCanvasTexture.context, segments, {
        ...trailDrawOptions,
        underlayWidth,
        underlayColor: boardMaterial.void,
        underlayAlpha: LEGACY_TRAIL_UNDERLAY_ALPHA
      });
    } else {
      drawTrailToCanvasContext(this.trailCanvasTexture.context, segments, trailDrawOptions);
    }
    this.trailCanvasTexture.refresh();
    this.trailCanvasImage.setPosition(bounds.left, bounds.top);
    this.trailCanvasImage.setDisplaySize(width, height);
    this.trailCanvasImage.setVisible(true);
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

  // Start and goal END MARKERS: the Chip marker draw code (drawBoardMarkers), painted through the Phaser
  // graphics adapter -- the exact function the in-app Guide icons call. The glyph (goal star / start play arrow)
  // sits directly on the baked tile with no box behind it, centred from the layer's device-snapped board origin
  // and tile geometry (boardTileLayer.endpointTiles; the start tile carries the arrow's direction, the first step
  // of the solution path). They are drawn in boardDynamicGraphics, over the trail. Start is hidden while the player
  // stands on it (the player marker is the start). The goal beacon (a halo, goalBeaconGraphics) is separate.
  private fillPlayDynamicMarkerTile(
    point: LegacyPoint,
    originX: number,
    originY: number,
    tileSize: number,
    alpha: number,
    kind: 'start' | 'goal',
    time?: number
  ): void {
    if (kind === 'start' && this.player.x === point.x && this.player.y === point.y) {
      return;
    }
    const origin = this.boardTileLayer.snappedOrigin ?? { x: originX, y: originY };
    const underContext = new PhaserGraphicsTileContext(this.goalBeaconGraphics);
    underContext.opacity = Math.min(1, alpha);
    const context = new PhaserGraphicsTileContext(this.boardDynamicGraphics);
    context.opacity = Math.min(1, alpha);
    const phase = time !== undefined ? (Math.sin((time / LEGACY_MENU_BLINK_PULSE_MS) * Math.PI * 2) + 1) / 2 : 0;
    const backingScale = this.resolveBoardTileBackingScale();
    if (kind === 'goal') {
      drawGoalBeacon(underContext, {
        goal: point,
        tileSize,
        devicePixelRatio: backingScale,
        originX: origin.x,
        originY: origin.y,
        timeMs: time ?? 0,
        reducedMotion: this.prefersLegacyReducedMotion(),
        minBadgeDiameterCss: BOARD_MARKER_MIN_CSS.goalBadgeDiameterCss,
        opacity: Math.min(1, alpha)
      });
    }
    const endpointTiles = this.boardTileLayer.endpointTiles;
    const markerInput = {
      // Honoured by the Trace style only: the Chip end tile is drawn at exactly the tile's size.
      minimumMarkerSizes: BOARD_MARKER_MIN_CSS,
      style: this.boardTileStyle,
      tileSize,
      devicePixelRatio: backingScale,
      originX: origin.x,
      originY: origin.y,
      start: kind === 'start' ? point : undefined,
      goal: kind === 'goal' ? point : undefined,
      startTile: endpointTiles.start,
      goalTile: endpointTiles.goal,
      phase,
      reducedMotion: this.prefersLegacyReducedMotion()
    };
    // The player standing on the goal covers the star; the star's keyline would poke out around the player's rounded
    // square as dark spikes, so (like the start marker) the goal glyph yields to the player. The beacon stays.
    if (kind === 'goal' && this.player.x === point.x && this.player.y === point.y) {
      return;
    }
    // Chip: the star / play arrow straight onto the baked tile (no pad, no badge: nothing is painted under the trail
    // any more); Trace: its own marker artwork. Both go through the same call.
    drawBoardMarkers(context, markerInput);
  }

  // Retired: drawLegacyMarkerGemCatchlight used to draw a short diagonal
  // highlight arc here, calibrated for round gem-shaped markers. Applied to
  // the settings cog, leaderboard bars, and header house icon, it read as a
  // stray diagonal white line in each icon's corner (reported and removed
  // from all three call sites).

  // The player marker for BOTH surfaces: the human's in play and the AI's in the menu demo go through the same
  // geometry (src/render/playerMarker.ts) and the same glow canvas, so they are the same marker for the same state.
  // Only the find-me ping differs: playerLocatorState only ever runs in play, so in the menu its start is -1.
  // Centred on the device-snapped tile centre, like the baked tile and the end glyphs (the board layer's snapped origin).
  private fillLegacyPlayerMarkerTile(
    point: LegacyPoint,
    baseOriginX: number,
    baseOriginY: number,
    tileSize: number,
    alpha: number,
    time: number
  ): void {
    const bumpNudge = this.resolveLegacyWallBumpNudge(time);
    const snappedOrigin = this.boardTileLayer.snappedOrigin ?? { x: baseOriginX, y: baseOriginY };
    const backingScale = this.resolveBoardTileBackingScale();
    const center = resolvePlayerMarkerCenter(
      point.x,
      point.y,
      tileSize,
      backingScale,
      snappedOrigin.x + bumpNudge.x,
      snappedOrigin.y + bumpNudge.y,
      this.playerMarkerCenterScratch
    );
    const playerCoreColor = resolveLegacyIridescentPlayerCoreColor(time);
    // Squash-and-stretch along the direction of travel while gliding, smoothed with the glide (no per-step pulse).
    const motionPose = this.playerGlide.getMotionPose(time);
    const reducedMotion = this.prefersLegacyReducedMotion();
    const frame = resolvePlayerMarkerFrame({
      centerX: center.x,
      centerY: center.y,
      tileSize,
      devicePixelRatio: backingScale,
      timeMs: time,
      reducedMotion,
      motionAmount: motionPose.amount,
      headingX: motionPose.headingX,
      headingY: motionPose.headingY
    }, this.playerMarkerFrameScratch);
    // Soft shadowBlur glow (a canvas image under the Graphics), then locator, block and accent stroke.
    this.drawPlayerGlowCanvas(frame, tileSize, alpha, playerCoreColor);
    drawPlayerMarker(this.boardDynamicGraphics, frame, {
      tileSize,
      devicePixelRatio: backingScale,
      alpha,
      timeMs: time,
      coreColor: playerCoreColor,
      pingStartMs: this.playerLocatorState.activePingStartMs,
      reducedMotion
    });
  }

  // Real shadowBlur glow for the play-mode player marker's two drop-shadow
  // layers -- see navigationCorePlayerGlowCanvas.ts's own header comment and
  // drawTrailCanvasSegments's sibling comment on the DPR/zoom-aware backing
  // resolution and the shadowBlur*resolution correction (Canvas 2D
  // shadowBlur is a raw device-pixel radius the context transform does not
  // touch, verified empirically -- see that method's own comment). Sized to
  // the player's own current shape bounds (already computed by the caller,
  // including squash-stretch and idle breathing) plus enough padding that
  // the wider of the two blur passes is never clipped at the canvas edge.
  private drawPlayerGlowCanvas(
    frame: PlayerMarkerFrame,
    tileSize: number,
    alpha: number,
    playerCoreColor: number
  ): void {
    if (!this.playerGlowCanvasTexture || !this.playerGlowCanvasImage) {
      return;
    }
    const shapeLeft = frame.centerX - frame.coreHalfWidth;
    const shapeTop = frame.centerY - frame.coreHalfHeight;
    const shapeWidth = frame.coreHalfWidth * 2;
    const shapeHeight = frame.coreHalfHeight * 2;
    const wideGlowBlurPx = tileSize * PLAYER_MARKER.glow.wideBlurTileRatio;
    const tightGlowBlurPx = tileSize * PLAYER_MARKER.glow.tightBlurTileRatio;
    // A blurred shape's own visible falloff reaches well past its own
    // nominal blur radius (a Gaussian tail, not a hard cutoff at
    // shadowBlur's own value) -- 2.5x the wider pass's radius is a
    // generous, empirically-checked margin (see the trail canvas's own
    // padding comment for the same reasoning applied to glowWidth there).
    const padding = Math.ceil(wideGlowBlurPx * 2.5);
    // Whole-pixel origin, same reason as the trail image (src/render/pixelAlignment.ts).
    const bounds = alignBoundsToWholePixels(
      computePlayerGlowCanvasBounds(shapeLeft, shapeTop, shapeWidth, shapeHeight, padding)
    );
    const width = Math.max(1, Math.ceil(bounds.width));
    const height = Math.max(1, Math.ceil(bounds.height));
    const zoomScale = Math.max(1, this.boardZoomContainer.scaleX, this.boardZoomContainer.scaleY);
    const resolution = Math.min(
      MAZER_CANVAS_RESOLUTION_MAX * 2,
      resolveMazerCanvasResolution() * zoomScale
    );
    const backingWidth = Math.max(1, Math.ceil(width * resolution));
    const backingHeight = Math.max(1, Math.ceil(height * resolution));
    if (
      backingWidth !== this.playerGlowCanvasWidth
      || backingHeight !== this.playerGlowCanvasHeight
      || resolution !== this.playerGlowCanvasResolution
    ) {
      this.playerGlowCanvasTexture.setSize(backingWidth, backingHeight);
      this.playerGlowCanvasWidth = backingWidth;
      this.playerGlowCanvasHeight = backingHeight;
      this.playerGlowCanvasResolution = resolution;
    } else {
      this.playerGlowCanvasTexture.clear(0, 0, backingWidth, backingHeight, false);
    }
    this.playerGlowCanvasTexture.context.setTransform(resolution, 0, 0, resolution, 0, 0);
    drawPlayerGlowToCanvasContext(this.playerGlowCanvasTexture.context, {
      originX: bounds.left,
      originY: bounds.top,
      shapeLeft,
      shapeTop,
      shapeWidth,
      shapeHeight,
      cornerRadius: frame.coreCornerRadius,
      wideGlowColor: playerCoreColor,
      wideGlowAlpha: PLAYER_MARKER.glow.wideAlpha * alpha,
      wideGlowBlurPx: wideGlowBlurPx * resolution,
      tightGlowColor: PLAYER_MARKER.accentColor,
      tightGlowAlpha: PLAYER_MARKER.glow.tightAlpha * alpha,
      tightGlowBlurPx: tightGlowBlurPx * resolution
    });
    this.playerGlowCanvasTexture.refresh();
    this.playerGlowCanvasImage.setPosition(bounds.left, bounds.top);
    this.playerGlowCanvasImage.setDisplaySize(width, height);
    this.playerGlowCanvasImage.setVisible(true);
  }

  // Single shared entry point for vibration (src/legacy-runtime/legacyHaptics.ts). Honours Settings > Haptics and
  // reduced motion, and is a no-op where navigator.vibrate is missing (iOS Safari, most desktops).
  private triggerLegacyHapticPulse(pattern: LegacyHapticPattern): void {
    triggerLegacyHaptic({
      enabled: this.settings.hapticsEnabled,
      pattern,
      reducedMotion: this.prefersLegacyReducedMotion()
    });
  }

  private syncLegacyPlayerVisualMotionTo(
    point: LegacyPoint,
    snapReason: LegacyPlayerVisualMotionSnapReason = null
  ): void {
    this.playerGlide.snapTo(point, this.time.now);
    this.lastPlayerVisualMotionSnapReason = snapReason;
  }

  private armLegacyPlayerVisualMotion(
    from: LegacyPoint,
    to: LegacyPoint,
    time: number,
    durationMs: number
  ): void {
    const wrapFlash = resolveWrapFlashStationIds(from, to, this.maze);
    if (wrapFlash !== null && !this.prefersLegacyReducedMotion()) {
      // Flash the exit edge and its paired destination edge once (~120 ms).
      this.edgeMarkerWrapFlash = { ids: [wrapFlash.sourceId, wrapFlash.destinationId], startedAtMs: time };
      this.legacyMenuTitleAnimationNextFrameAtMs = 0;
      this.boardPathDirty = true;
    }
    if (from.x === to.x && from.y === to.y || this.prefersLegacyReducedMotion()) {
      this.syncLegacyPlayerVisualMotionTo(to);
      return;
    }

    if (this.isLegacyPlayerVisualWrapMove(from, to)) {
      this.syncLegacyPlayerVisualMotionTo(to, 'wrapped-step');
      return;
    }

    // durationMs is the expected step cadence; the glide keeps one steady speed across consecutive steps.
    this.playerGlide.step(from, to, time, durationMs);
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
    return this.playerGlide.isMoving(time) || this.wallBump !== null;
  }

  private resolveLegacyRenderedPlayerPoint(time: number): LegacyPoint {
    // At rest the logical tile is the truth (the glide only owns the in-between frames).
    return this.playerGlide.isMoving(time) ? this.playerGlide.sample(time) : copyPoint(this.player);
  }

  private resolveLegacyRenderedTrailHeadPoint(time: number): LegacyPoint {
    return this.playerGlide.isMoving(time) ? this.playerGlide.sampleTrailHead(time) : copyPoint(this.player);
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
    // drawLegacyGlyphWordTileBlock: same real corridor-tile material and
    // full-hue rainbow mirage every other tile-block word on screen uses
    // (see that method's own header comment) -- replaces this button's own
    // separate flat progression-palette + trail-wipe coloring so Start/Login
    // reads as the same material as the title and level number instead of a
    // third, visually distinct treatment.
    const visiblePieceCount = this.resolveLegacyMenuPathTitleVisiblePieces(layout.cells.length);
    const revealProgress = layout.cells.length > 0 ? visiblePieceCount / layout.cells.length : 1;
    this.drawLegacyGlyphWordTileBlock(graphics, layout, time, active ? 1 : 0.95, revealProgress);
    this.drawLegacyWordmarkAmbientSparkles(
      graphics,
      layout.left + (layout.width / 2),
      layout.top + (layout.height / 2),
      layout.width / 2,
      layout.height / 2,
      time,
      active ? 1 : 0.92
    );
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

  // Per-frame flow feedback: reverts an expired "Tap again to quit" row.
  private updateLegacyFlowFeedback(time: number): void {
    if (hasLegacyQuitConfirmExpired(this.quitConfirmState, time)) {
      this.quitConfirmState = IDLE_LEGACY_QUIT_CONFIRM_STATE;
      this.uiDirty = true;
    }
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
    this.hudTouchControlBounds = null;
    if (this.mode !== 'play' || this.overlay !== 'none') {
      this.touchSettingsCogIconImage.setVisible(false);
      this.footerText.setText('');
      return;
    }
    this.footerText.setText('');
    this.drawLegacyLevelPreviewBadge();

    const touchControlLayout = this.resolveLegacyPlayTouchControlLayout();
    this.hudTouchControlBounds = this.drawLegacyPlayTouchControls(time, touchControlLayout);
  }

  // Level Preview only: a small, quiet "PREVIEW L100" tag in the footer slot
  // (unused in play). The level is read from the live player track, so it
  // follows goal-to-goal advances as well as jumps.
  private drawLegacyLevelPreviewBadge(): void {
    if (this.levelPreviewLevel === null) {
      return;
    }
    this.footerText
      .setText(formatLegacyLevelPreviewBadge(this.progressionState.tracks.player.level))
      .setPosition(this.layout.width / 2, this.layout.footerY - 22)
      .setFontSize(12)
      .setColor('#72e0bf')
      .setAlpha(0.6);
  }

  // Level Preview only. The sandbox progression is replaced outright (never
  // merged, never persisted beyond the in-memory store) and play restarts on a
  // fresh maze built by the unchanged real generation path.
  private jumpLegacyLevelPreview(level: number): void {
    if (this.levelPreviewLevel === null) {
      return;
    }
    const next = clampLegacyLevelPreviewLevel(level);
    this.levelPreviewLevel = next;
    this.progressionState = writeLegacyProgressionState(
      this.resolveLegacyProgressionStorage(),
      createLegacyLevelPreviewProgressionState(next)
    );
    this.previewLevelsExpanded = false;
    this.closeOverlay();
    this.startPlayMode();
    this.hudDirty = true;
  }

  // Leaving preview is a full reload of the URL without the preview param:
  // the ordinary app then boots from scratch on the real session and storage.
  private exitLegacyLevelPreview(): void {
    if (typeof window === 'undefined') {
      return;
    }
    window.location.replace(buildLegacyLevelPreviewExitUrl(window.location.href));
  }

  private updateLegacyPlayerLocator(time: number): void {
    const live = this.mode === 'play'
      && this.overlay === 'none'
      && (this.menuStaticDrawLifecyclePhase === 'idle' || this.menuStaticDrawLifecyclePhase === 'settled')
      && this.resolveLegacyPlayerSpawnBurstState(time).markerRevealAlpha >= 1;
    this.playerLocatorState.update(time, live, this.player?.x ?? -1, this.player?.y ?? -1, this.prefersLegacyReducedMotion());
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
      this.touchSettingsCogIconImage.setVisible(false);
      return null;
    }

    const { controls } = touchControlLayout;
    // No live pressed-state tracking for this control (matches the
    // pre-existing behavior) -- always idle-colored, just now with the
    // same blink pulse as the menu cog.
    this.drawLegacySettingsCogControl(controls.pause, false, time);

    if (this.playFloatingStickOrigin === null) {
      return createVisualRect(controls.pause.left, controls.pause.top, controls.pause.width, controls.pause.height);
    }

    const stick = this.resolveLegacyPlayFloatingStickGeometry(this.playFloatingStickOrigin);
    this.drawLegacyPlayTouchStick(stick, this.resolveLegacyPlayHeldTouchControl(), this.playTouchStickPull, time);
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
  // Just the knob now -- no stationary outer ring, spokes, hub, deadzone
  // ring, or glow halo. The knob still appears exactly where the touch
  // landed (stick.outer is centered there, per
  // resolveLegacyPlayFloatingStickGeometry) and still travels with the
  // drag exactly as before; only the always-visible chrome around it is
  // gone.
  private drawLegacyPlayTouchStick(
    stick: NonNullable<ReturnType<typeof resolveTouchControlLayout>['stick']>,
    activeControl: HumanMovementActionKind | null,
    pullVector: TouchStickPullVector | null,
    time: number
  ): void {
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

    // The anchor (where the touch first landed, i.e. "home" for the knob)
    // has no chrome of its own once the knob drags away from it -- add back
    // a quiet marker: a small static dot plus one tiny tick slowly orbiting
    // it, so the anchor point stays legible without competing with the knob
    // itself for attention.
    // The accent color, not the same grey as the knob below -- against a
    // grey knob (especially once it's resting right back on the anchor)
    // a grey-on-grey dot was nearly invisible.
    const anchorDotRadius = Math.max(2, Math.round(knobRadius * 0.16));
    this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_ACCENT, 0.62);
    this.hudGraphics.fillCircle(centerX, centerY, anchorDotRadius);
    const anchorOrbitRadius = anchorDotRadius * 2.6;
    const anchorOrbitAngle = (time / LEGACY_PLAY_TOUCH_STICK_ANCHOR_ORBIT_MS) * Math.PI * 2;
    this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_ACCENT, 0.55);
    this.hudGraphics.fillCircle(
      centerX + (Math.cos(anchorOrbitAngle) * anchorOrbitRadius),
      centerY + (Math.sin(anchorOrbitAngle) * anchorOrbitRadius),
      Math.max(1, Math.round(anchorDotRadius * 0.6))
    );

    // Grey, not the green accent -- a quiet neutral knob instead of a
    // colored control competing with the maze/trail for attention.
    this.hudGraphics.fillStyle(LEGACY_PLAY_TOUCH_BUTTON_FILL, activeControl === null ? 0.55 : 0.78);
    this.hudGraphics.fillCircle(knobX, knobY, knobRadius);
    this.hudGraphics.lineStyle(2, LEGACY_PLAY_TOUCH_ICON, activeControl === null ? 0.52 : 0.86);
    this.hudGraphics.strokeCircle(knobX, knobY, knobRadius);
  }

  // Matches the menu surface's own real settings icon (same texture,
  // applyLegacyHudIconFrame, same blink pulse) instead of the procedural
  // gear it used to share via drawLegacySettingsCog -- reported as "played
  // game screen never got the ui updates like for icons": this in-play
  // pause/settings touch control was the one icon on the active-play screen
  // that got missed when the menu header/overlay icons were replaced.
  // `rect` here is the real touch hit-target (tuned for thumb reach,
  // deliberately bigger than the menu's compact header box) -- the glyph's
  // own display size is still pinned to the same visual footprint the menu
  // cog uses, not the (bigger) hit target, centered within it.
  private drawLegacySettingsCogControl(
    rect: ReturnType<typeof resolveTouchControlLayout>['controls']['pause'],
    active: boolean,
    time: number
  ): void {
    const phase = (Math.sin((time / LEGACY_MENU_BLINK_PULSE_MS) * Math.PI * 2) + 1) / 2;
    const blinkAlpha = clamp(0.22 + (phase * 0.78) + (active ? 0.08 : 0), 0.14, 1);
    const blinkScale = 0.92 + (phase * 0.08) + (active ? 0.02 : 0);
    const visualSize = clamp(Math.round(Math.min(this.layout.width, this.layout.height) * 0.085), 36, 40);
    this.applyLegacyHudIconFrame(
      this.touchSettingsCogIconImage,
      MAZER_HUD_SETTINGS_ICON_METRICS,
      rect.centerX,
      rect.centerY,
      visualSize * 1.15 * blinkScale,
      blinkAlpha
    );
  }

  // A solid filled gear silhouette (fillPath over an alternating
  // outer/inner-radius polygon) instead of a thin multi-stroke wireframe --
  // the tiles and markers are solid filled shapes with a rim highlight, and
  // the old wireframe cog was the one element on screen still built out of
  // bare line segments, which read as a mismatched, generic "tech icon"
  // instead of belonging to the same crystal-facet family.
  // Crops `image` to the icon's own real visible bounds (see
  // LegacyHudIconSourceMetrics's own header comment) and scales it so the
  // LONGER of its two visible dimensions equals `desiredSize`, uniformly
  // (never stretched) -- so passing the same desiredSize for two different
  // HUD icons gives them the same optical footprint regardless of how much
  // transparent padding either source PNG happens to carry.
  private applyLegacyHudIconFrame(
    image: Phaser.GameObjects.Image,
    metrics: LegacyHudIconSourceMetrics,
    centerX: number,
    centerY: number,
    desiredSize: number,
    alpha: number
  ): void {
    if (alpha <= 0) {
      image.setVisible(false);
      return;
    }
    const scale = desiredSize / Math.max(metrics.bboxWidth, metrics.bboxHeight);
    image
      .setCrop(metrics.bboxX, metrics.bboxY, metrics.bboxWidth, metrics.bboxHeight)
      .setDisplaySize(metrics.bboxWidth * scale, metrics.bboxHeight * scale)
      .setPosition(centerX, centerY)
      .setAlpha(alpha)
      .setVisible(true);
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
    this.touchSettingsCogIconImage.setVisible(false);
    this.hudTouchControlBounds = null;
    this.clearHudTexts();
    this.footerText.setText('');
  }

  private enterForcedLegacyAuthOverlay(): void {
    // Forced auth transitions bypass openOverlay() and return through update's
    // auth-only branch before drawHud() can clear persistent HUD images.
    if (this.mode === 'play') {
      this.clearPlayHudImmediately();
    }
    this.overlay = 'auth';
  }

  private rebuildUi(): void {
    this.uiRebuiltAtFrame = this.game.getFrame();
    this.overlayGraphics.clear();
    this.clearUi();
    this.overlayBackChevronBounds = null;
    this.overlayBackChevronAction = null;
    this.overlayScrimCloseBounds = null;
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
        const playAccessAllowed = this.hasLegacyPlayAccess();
        // A normal compact button (the same width the row-of-three action
        // geometry already computes), not a full-width bottom-dock bar --
        // per feedback that the wide dock-style bar didn't work.
        const primaryButtonWidth = this.layout.centerButtonWidth;

        if (!playAccessAllowed) {
          this.uiButtons.push(
            this.createButton(
              this.layout.centerButtonX,
              this.layout.centerButtonY,
              primaryButtonWidth,
              this.layout.buttonHeight,
              'Login',
              () => this.dispatchUiBridgeCommand({ type: 'NAVIGATE', surface: 'account' }, () => this.openSharedAccountSurface()),
              { fullScreenHitArea: true }
            )
          );
          this.createLegacySignedOutOAuthFailure();
        } else {
          this.uiButtons.push(
            this.createButton(
              this.layout.centerButtonX,
              this.layout.centerButtonY,
              primaryButtonWidth,
              this.layout.buttonHeight,
              startLabel,
              () => this.dispatchUiBridgeCommand({ type: 'START_RUN' }, () => this.startPlayMode()),
              { fullScreenHitArea: true }
            )
          );
        }
        this.uiButtons.push(this.createLegacyMenuSettingsCogButton(
          () => this.dispatchUiBridgeCommand({ type: 'NAVIGATE', surface: 'settings' }, () => this.openOverlay('options'))
        ));
        this.uiButtons.push(this.createLegacyMenuLeaderboardButton(
          () => this.dispatchUiBridgeCommand({ type: 'NAVIGATE', surface: 'leaderboard' }, () => this.openOverlay('leaderboard'))
        ));
        this.uiButtons.push(this.createLegacyMenuProfileButton(
          () => this.dispatchUiBridgeCommand({ type: 'NAVIGATE', surface: 'account' }, () => this.openSharedAccountSurface())
        ));
        this.createLegacyHeaderIdentityLabel();
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
      case 'leaderboard':
        this.buildLeaderboardOverlay();
        break;
    }

    this.uiDirty = false;
  }

  private drawOverlayPanel(): void {
    // Same calm animated-backdrop dimmer every overlay uses -- the auth
    // screen used to be fully opaque here specifically so credentials never
    // shared a surface with the moving maze board, but the board itself
    // isn't part of this dimmer (just the ambient starfield/sigil backdrop),
    // so matching the rest of the app's translucency doesn't reintroduce
    // that concern.
    // Auth is an intentionally opaque application surface. It must not compete
    // with the animated maze/menu content underneath the input controls.
    this.overlayGraphics.fillStyle(this.overlay === 'auth' ? cyberArcadeMaterial.substrate.field : 0x02040a, this.overlay === 'auth' ? 1 : 0.82);
    this.overlayGraphics.fillRect(0, 0, this.layout.width, this.layout.height);
  }

  private resolveOverlayPanelFrame(): OverlayPanelFrame {
    return resolveLegacyOverlayPanelLayout(
      this.layout.width,
      this.layout.height,
      readMazerViewportGeometry().safeArea
    );
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

  // One shared Settings sheet for BOTH surfaces (owner decision 2026-11-06:
  // the in-game Pause > Settings look is canonical and the main-menu Settings
  // sheet must match it). buildOptionsOverlay (menu) and buildPauseOverlay
  // (play) are thin entries into the same painter; every row, size and
  // position comes from buildLegacySettingsSheetPlan
  // (legacySettingsSheetPlan.ts), so the two contexts cannot drift apart. The
  // Guide ("How to play") is a sub-view of the same overlay (settingsGuideOpen),
  // not a second overlay, so Pause keeps holding the run while it is open.
  private buildOptionsOverlay(): void {
    this.buildLegacySettingsSheetOverlay('menu');
  }

  private buildPauseOverlay(): void {
    this.buildLegacySettingsSheetOverlay('pause');
  }

  private buildLegacySettingsSheetOverlay(context: LegacySettingsContext): void {
    if (this.settingsGuideOpen) {
      this.buildLegacyGuideSheetOverlay(context);
      return;
    }
    const plan = buildLegacySettingsSheetPlan({
      context,
      height: this.layout.height,
      safeArea: readMazerViewportGeometry().safeArea,
      levelPreview: context === 'pause' && this.levelPreviewLevel !== null
        ? {
          checkpoints: LEGACY_LEVEL_PREVIEW_CHECKPOINTS,
          level: Number(this.progressionState.tracks.player.level),
          maxLevel: LEGACY_LEVEL_PREVIEW_MAX_LEVEL,
          minLevel: LEGACY_LEVEL_PREVIEW_MIN_LEVEL
        }
        : undefined,
      previewLevelsExpanded: this.previewLevelsExpanded,
      quitConfirmArmed: context === 'pause' && isLegacyQuitConfirmArmed(this.quitConfirmState, this.time.now),
      rotatePrompt: context === 'pause' && shouldShowLegacyRotateNotice({
        corridorPx: this.layout.tileSize,
        currentLandscape: isLegacyLandscapeViewport(this.layout.width, this.layout.height),
        originLandscape: this.orientationFlipOriginLandscape
      }),
      settingsExpanded: this.pauseSettingsExpanded,
      signedIn: this.authSnapshot.status === 'authenticated',
      width: this.layout.width
    });
    this.overlayMovementSpeedSliderBounds = null;

    // No Close pill / X / back arrow: the primary top row (Resume in pause,
    // Back to Menu in the menu) is the exit. In the menu a tap on the scrim
    // outside the card also closes the sheet (handleOverlayScrimPointerDown).
    this.overlayScrimCloseBounds = context === 'menu'
      ? createVisualRect(plan.card.left, plan.card.top, plan.card.width, plan.card.height)
      : null;
    this.drawLegacySheetCard(plan.card);
    this.createOverlayTitle(plan.title.text, plan.title.centerY);

    const scrollMetrics = this.applyLegacySheetScroll(plan.scrollRailViewport, plan.contentHeight, plan.scrollable);
    const scrollOffset = scrollMetrics?.offset ?? 0;
    for (const item of plan.items) {
      if (isLegacySettingsItemFullyVisible(plan, item, scrollOffset)) {
        this.paintLegacySettingsItem(plan, item, scrollOffset);
      }
    }
    if (scrollMetrics !== null) {
      this.drawLegacyOverlayScrollFacade(scrollMetrics);
    }
  }

  // Pause > Quit to Menu (tap, click or Q). With no move made on this maze it
  // quits at once; after a move the first press arms the row ("Tap again to
  // quit", reverts after LEGACY_QUIT_CONFIRM_TIMEOUT_MS) and the second quits.
  private pressLegacyQuitToMenu(): void {
    const press = pressLegacyQuitConfirm(this.quitConfirmState, {
      movesMade: this.playCyclePath.length > 1,
      nowMs: this.time.now
    });
    this.quitConfirmState = press.state;
    this.uiDirty = true;
    if (press.outcome === 'armed') {
      return;
    }
    this.dispatchUiBridgeCommand({ type: 'RETURN_HOME' }, () => this.applyLegacyPauseCommand('return-menu'));
  }

  private runLegacySettingsCommand(command: LegacySettingsCommand): void {
    switch (command.type) {
      case 'RESUME_RUN':
        this.dispatchUiBridgeCommand({ type: 'RESUME_RUN' }, () => this.applyLegacyPauseCommand('resume'));
        return;
      case 'RETURN_HOME':
        this.pressLegacyQuitToMenu();
        return;
      case 'CLOSE_OVERLAY':
        this.handleBackAction();
        return;
      case 'TOGGLE_SETTINGS_GROUP':
        this.pauseSettingsExpanded = !this.pauseSettingsExpanded;
        this.resetLegacyOverlayScrollState();
        this.uiDirty = true;
        return;
      case 'PREVIEW_JUMP':
        this.jumpLegacyLevelPreview(command.level);
        return;
      case 'TOGGLE_PREVIEW_LEVELS':
        this.previewLevelsExpanded = !this.previewLevelsExpanded;
        this.resetLegacyOverlayScrollState();
        this.uiDirty = true;
        return;
      case 'OPEN_GUIDE':
        this.settingsGuideOpen = true;
        this.resetLegacyOverlayScrollState();
        this.uiDirty = true;
        return;
      case 'BEGIN_RESET_PROGRESS':
        this.openOverlay('confirm-progression-reset');
        return;
      case 'SIGN_OUT':
        void this.handleLegacyAuthSignOut();
        return;
    }
  }

  // The card both sheets share: near-black (bg.canvas) so it reads as the
  // darkest layer on the dimmed board, same chrome the Pause card always had.
  private drawLegacySheetCard(card: LegacySettingsRect): void {
    this.drawLegacyCyberPanel(this.overlayGraphics, {
      alpha: 0.96,
      fill: cyberArcadeMaterial.substrate.field,
      height: card.height,
      left: card.left,
      radius: LEGACY_UI_CONTROL_RADIUS + 4,
      stroke: LEGACY_CYBER_PANEL_STROKE,
      top: card.top,
      width: card.width
    });
  }

  // Applies the scroll rail metrics for a sheet body and returns them, or null
  // (and clears any stale rail state) when the body fits.
  private applyLegacySheetScroll(
    bodyViewport: LegacySettingsRect,
    contentHeight: number,
    scrollable: boolean
  ): LegacyOverlayScrollMetrics | null {
    if (!scrollable) {
      this.overlayScrollOffset = 0;
      this.overlayScrollMax = 0;
      this.overlayScrollContentHeight = 0;
      this.overlayScrollTopFadeAlpha = 0;
      this.overlayScrollBottomFadeAlpha = 0;
      this.overlayScrollViewportBounds = null;
      this.overlayScrollTrackBounds = null;
      this.overlayScrollThumbBounds = null;
      return null;
    }
    const metrics = resolveLegacyOverlayScrollMetrics({
      contentHeight,
      offset: this.overlayScrollOffset,
      viewport: bodyViewport
    });
    this.applyLegacyOverlayScrollMetrics(metrics);
    return metrics;
  }

  private paintLegacySettingsItem(
    plan: LegacySettingsSheetPlan,
    item: LegacySettingsPlanItem,
    scrollOffset: number
  ): void {
    const model = item.model;
    const rect = resolveLegacySettingsItemScreenRect(plan, item, scrollOffset);
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const run = (): void => {
      if (model.command !== null) {
        this.runLegacySettingsCommand(model.command);
      }
    };

    switch (model.kind) {
      case 'heading':
        this.createLegacySheetHeading(rect, model.label, item.stateFontSize);
        return;
      case 'action':
        this.uiButtons.push(this.createLegacyAuthActionButton(
          centerX,
          centerY,
          rect.width,
          rect.height,
          model.label,
          run,
          model.emphasis === 'primary'
            ? 'primary'
            : model.emphasis === 'danger'
              ? 'danger'
              : model.emphasis === 'danger-outline'
                ? 'danger-outline'
                : 'secondary'
        ));
        return;
      case 'disclosure':
        this.uiButtons.push(this.createLegacySheetDisclosureButton(
          rect,
          model.label,
          run,
          (model.id === 'preview-jump-disclosure' ? plan.previewLevelsExpanded : plan.settingsExpanded) ? 'up' : 'down'
        ));
        return;
      case 'nav':
        this.uiButtons.push(this.createLegacySheetDisclosureButton(rect, model.label, run, 'right'));
        return;
      case 'toggle': {
        const fieldId = model.settingKey as LegacyOverlayToggleFieldId;
        const checked = resolveLegacyOverlayToggleSwitchIsOn(fieldId, this.settings);
        this.uiButtons.push(this.createToggleSwitchRow({
          checked,
          item,
          label: model.label,
          onClick: () => this.applyOverlayToggleFieldChange(fieldId),
          rect,
          stateText: resolveLegacyOverlayToggleStateText(fieldId, checked)
            ?? (checked ? (model.onLabel ?? '') : (model.offLabel ?? ''))
        }));
        return;
      }
    }
  }

  // Section heading ("DISPLAY", "ACCOUNT"): small caps label plus a hairline.
  private createLegacySheetHeading(rect: LegacySettingsRect, copy: string, fontSize: number): void {
    const centerY = rect.top + Math.round(rect.height / 2);
    const label = this.padLegacyCompactUiText(this.add.text(rect.left - 8, centerY, copy.toUpperCase(), {
      color: '#72e0bf',
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${fontSize}px`
    })).setOrigin(0, 0.5).setAlpha(0.9);
    this.uiTexts.push(label);
    this.overlayGraphics.lineStyle(1, LEGACY_CYBER_PANEL_STROKE_ALT, 0.32);
    this.overlayGraphics.lineBetween(rect.left, rect.top + rect.height - 2, rect.left + rect.width, rect.top + rect.height - 2);
  }

  // Full-width secondary row with a trailing chevron: the Settings disclosure
  // (down/up) in Pause and the How to play row (right) in both contexts.
  private createLegacySheetDisclosureButton(
    rect: LegacySettingsRect,
    label: string,
    onClick: () => void,
    chevron: 'down' | 'right' | 'up'
  ): UiButton {
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const button = this.createLegacyAuthActionButton(
      centerX,
      centerY,
      rect.width,
      rect.height,
      label,
      onClick,
      'secondary',
      19
    );
    const graphics = this.add.graphics();
    const chevronX = rect.left + rect.width - 24;
    graphics.lineStyle(2, LEGACY_CYBER_PANEL_STROKE, 0.9);
    graphics.beginPath();
    if (chevron === 'right') {
      graphics.moveTo(chevronX - 3, centerY - 6);
      graphics.lineTo(chevronX + 3, centerY);
      graphics.lineTo(chevronX - 3, centerY + 6);
    } else {
      const direction = chevron === 'up' ? -1 : 1;
      graphics.moveTo(chevronX - 6, centerY - (3 * direction));
      graphics.lineTo(chevronX, centerY + (3 * direction));
      graphics.lineTo(chevronX + 6, centerY - (3 * direction));
    }
    graphics.strokePath();
    const destroyButton = button.destroy;
    button.destroy = () => {
      graphics.destroy();
      destroyButton();
    };
    return button;
  }

  // Text that wraps to `maxLines` and only then shrinks (never below
  // `minFontSize`); it never merges a state word into the label.
  private addLegacySheetWrappedText(
    copy: string,
    left: number,
    centerY: number,
    width: number,
    color: string,
    fontSize: number,
    minFontSize: number,
    maxLines: number,
    options: { alpha?: number; bold?: boolean; originX?: number } = {}
  ): Phaser.GameObjects.Text {
    const text = this.padLegacyCompactUiText(this.add.text(left, centerY, copy, {
      align: options.originX === 1 ? 'right' : 'left',
      color,
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${fontSize}px`,
      fontStyle: options.bold === true ? 'bold' : 'normal',
      wordWrap: { useAdvancedWrap: true, width: Math.max(1, width - 16) }
    })).setOrigin(options.originX ?? 0, 0.5).setAlpha(options.alpha ?? 0.96);
    for (let size = fontSize; size >= minFontSize; size -= 1) {
      text.setFontSize(size);
      text.setWordWrapWidth(Math.max(1, width - 16), true);
      if (text.getWrappedText().length <= maxLines && text.width <= width + 0.5) {
        break;
      }
    }
    this.uiTexts.push(text);
    return text;
  }

  // Row geometry (label / state / switch columns) comes from the shared plan;
  // the state word is its own element and the label wraps instead of shrinking.
  private createToggleSwitchRow(input: {
    checked: boolean;
    item: LegacySettingsPlanItem;
    label: string;
    onClick: () => void;
    rect: LegacySettingsRect;
    stateText: string;
  }): UiButton {
    const { rect, item } = input;
    const parts = item.parts;
    const left = rect.left;
    const top = rect.top;
    const onColor = cyberArcadeMaterial.signal.player;
    const offColor = cyberArcadeMaterial.rail.muted;
    const accentColor = input.checked ? onColor : offColor;
    const stateColor = toCyberArcadeCssHex(accentColor);
    const accentBarWidth = 3;
    const centerY = top + (rect.height / 2);

    const panelGraphics = this.add.graphics();
    const drawPanel = (active: boolean): void => {
      panelGraphics.clear();
      this.drawLegacyCyberPanel(panelGraphics, {
        active,
        alpha: input.checked ? 0.62 : 0.46,
        fill: input.checked ? 0x0f2c22 : LEGACY_CYBER_PANEL_FILL,
        height: rect.height,
        left,
        radius: 10,
        stroke: accentColor,
        top,
        width: rect.width
      });
      panelGraphics.fillStyle(accentColor, input.checked ? 0.95 : 0.5);
      panelGraphics.fillRoundedRect(left + 5, top + 6, accentBarWidth, rect.height - 12, accentBarWidth / 2);
    };
    drawPanel(false);

    const background = this.add.rectangle(left + (rect.width / 2), centerY, rect.width, rect.height, 0x000000, 0);
    background.setInteractive({ useHandCursor: true });

    const label = this.addLegacySheetWrappedText(
      input.label,
      left + parts.label.left - 8,
      centerY,
      parts.label.width + 16,
      toCyberArcadeCssHex(cyberArcadeMaterial.rail.white),
      item.labelFontSize,
      LEGACY_SETTINGS_SIZES.labelMinFontSize,
      item.labelMaxLines
    );
    const stateRect = parts.state;
    const stateLabel = stateRect === null
      ? null
      : this.addLegacySheetWrappedText(
        input.stateText,
        left + stateRect.left + stateRect.width + 8,
        centerY,
        stateRect.width + 16,
        stateColor,
        item.stateFontSize,
        item.stateFontSize,
        1,
        { alpha: 1, bold: true, originX: 1 }
      );

    const switchRect = parts.switchControl ?? {
      height: LEGACY_SETTINGS_SIZES.switchHeight,
      left: rect.width - LEGACY_SETTINGS_SIZES.rowPadding - LEGACY_SETTINGS_SIZES.switchWidth,
      top: Math.round((rect.height - LEGACY_SETTINGS_SIZES.switchHeight) / 2),
      width: LEGACY_SETTINGS_SIZES.switchWidth
    };
    const trackWidth = switchRect.width;
    const trackHeight = switchRect.height;
    const trackX = left + switchRect.left + (trackWidth / 2);
    const trackY = top + switchRect.top + (trackHeight / 2);
    const trackGlow = this.add.ellipse(trackX, trackY, trackWidth + 10, trackHeight + 10, onColor, input.checked ? 0.16 : 0);
    const track = this.add.ellipse(trackX, trackY, trackWidth, trackHeight, input.checked ? 0x0f2c22 : 0x050c11, 0.95);
    track.setStrokeStyle(2, accentColor, input.checked ? 0.85 : 0.55);
    const knobTravel = Math.round((trackWidth - trackHeight) / 2) - 1;
    const knobRadius = Math.round((trackHeight - 6) / 2);
    const knobX = trackX + (input.checked ? knobTravel : -knobTravel);
    const knobGlow = this.add.circle(knobX, trackY, knobRadius + 4, onColor, input.checked ? 0.3 : 0);
    // A layered "glass bead": soft drop shadow, base fill, then a specular
    // crescent up-left -- legible in the OFF state against the dark track.
    const knobGraphics = this.add.graphics();
    knobGraphics.setPosition(knobX, trackY);
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
      stateLabel?.setAlpha(active ? 1 : 0.92);
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
      bounds: createVisualRect(left, top, rect.width, rect.height),
      label,
      setActive,
      text: input.label,
      destroy: () => {
        background.destroy();
        panelGraphics.destroy();
        label.destroy();
        stateLabel?.destroy();
        trackGlow.destroy();
        track.destroy();
        knobGlow.destroy();
        knobGraphics.destroy();
      }
    };
  }

  // The Guide ("How to play"): one sheet for both menu and pause, painted from
  // buildLegacyGuideSheetModel (legacyGuideContent.ts) and laid out by
  // buildLegacyGuideSheetPlan. Icons call the board's own draw functions where
  // the content module says they are shared (goal star, perimeter diamond).
  private buildLegacyGuideSheetOverlay(context: LegacySettingsContext): void {
    const model = buildLegacyGuideSheetModel(context, { hasKeyboard: this.resolveLegacyGuideHasKeyboard() });
    const sizes = LEGACY_GUIDE_SHEET_SIZES;
    const safeArea = readMazerViewportGeometry().safeArea;
    const measure = (itemWidth: number): number[] => {
      // Measure at the exact wrap width the painter uses: it passes the column width plus the
      // 16 px text padding that addLegacySheetWrappedText and measureLegacySheetWrappedLines both subtract.
      const copyWidth = Math.max(1, itemWidth - sizes.badgeSize - sizes.badgeTextGap) + 16;
      const heights = model.rows.map((row) => resolveLegacyGuideRowHeight(
        this.measureLegacySheetWrappedLines(row.text, copyWidth, sizes.copyFontSize)
      ));
      if (model.keyboardLine !== null) {
        heights.push(resolveLegacyGuideKeyboardLineHeight(
          this.measureLegacySheetWrappedLines(model.keyboardLine, itemWidth + 16, sizes.copyFontSize)
        ));
      }
      return heights;
    };
    const planInput = { height: this.layout.height, safeArea, width: this.layout.width };
    let plan = buildLegacyGuideSheetPlan({ ...planInput, itemHeights: measure(Number.MAX_SAFE_INTEGER) });
    // Measure at the real column width (the rail gutter narrows it when the
    // body scrolls), then re-plan from the real heights.
    plan = buildLegacyGuideSheetPlan({ ...planInput, itemHeights: measure(plan.itemWidth) });
    plan = buildLegacyGuideSheetPlan({ ...planInput, itemHeights: measure(plan.itemWidth) });
    const heights = measure(plan.itemWidth);

    this.overlayMovementSpeedSliderBounds = null;
    this.drawLegacySheetCard(plan.card);
    this.createOverlayTitle(plan.title.text, plan.title.centerY);
    this.overlayGuideBounds = createVisualRect(plan.card.left, plan.card.top, plan.card.width, plan.card.height);

    const scrollMetrics = this.applyLegacySheetScroll(plan.scrollRailViewport, plan.contentHeight, plan.scrollable);
    const scrollOffset = scrollMetrics?.offset ?? 0;
    const viewport = plan.bodyViewport;
    const playerPalette = resolveLegacyProgressionPalette(this.progressionState.tracks.player, 'player');
    const accentFor = (glyph: LegacyGuideGlyph): number => {
      switch (glyph) {
        case 'goal-star': return cyberArcadeMaterial.signal.goal;
        case 'start-marker': return cyberArcadeMaterial.signal.start;
        case 'player-block': return cyberArcadeMaterial.signal.player;
        case 'touch-stick': return cyberArcadeMaterial.rail.mint;
        case 'trail-swatch': return playerPalette.trailColor;
        case 'edge-marker': return cyberArcadeMaterial.rail.cyan;
        case 'level-numeral': return playerPalette.playerCoreColor;
      }
    };
    // The body scrolls under a geometry mask (the guide is pure text and icons), so a row that is
    // partly scrolled out is clipped at the viewport edge instead of vanishing.
    let guideGraphics: Phaser.GameObjects.Graphics = this.overlayGraphics;
    let guideMask: Phaser.Display.Masks.GeometryMask | null = null;
    if (plan.scrollable) {
      guideGraphics = this.add.graphics();
      this.overlayGuideGraphics = guideGraphics;
      const maskGraphics = this.make.graphics({ x: 0, y: 0 }, false);
      maskGraphics.fillStyle(0xffffff, 1);
      maskGraphics.fillRect(viewport.left, viewport.top, viewport.width, viewport.height);
      guideMask = maskGraphics.createGeometryMask();
      guideGraphics.setMask(guideMask);
      this.overlayGuideMaskGraphics = maskGraphics;
      this.overlayGuideMask = guideMask;
    }
    const masked = <T extends Phaser.GameObjects.Text>(text: T): T => {
      if (guideMask !== null) {
        text.setMask(guideMask);
      }
      return text;
    };
    const itemVisible = (index: number): boolean => {
      const top = viewport.top + (plan.itemTops[index] ?? 0) - scrollOffset;
      const height = heights[index] ?? 0;
      return top < viewport.top + viewport.height && top + height > viewport.top;
    };

    model.rows.forEach((row, index) => {
      if (!itemVisible(index)) {
        return;
      }
      const rowTop = viewport.top + (plan.itemTops[index] ?? 0) - scrollOffset;
      const rowHeight = heights[index] ?? sizes.rowMinHeight;
      const accent = accentFor(row.icon.glyph);
      const badgeCenterX = viewport.left + (sizes.badgeSize / 2);
      const badgeCenterY = rowTop + (rowHeight / 2);
      this.drawLegacyGuideIcon(row.icon, badgeCenterX, badgeCenterY, accent, guideGraphics);
      const textLeft = viewport.left + sizes.badgeSize + sizes.badgeTextGap;
      const textWidth = Math.max(1, plan.itemWidth - sizes.badgeSize - sizes.badgeTextGap);
      const copyLines = Math.max(1, Math.round((rowHeight - (sizes.rowPaddingY * 2) - sizes.headingLineHeight) / sizes.copyLineHeight));
      const blockHeight = sizes.headingLineHeight + (copyLines * sizes.copyLineHeight);
      const blockTop = rowTop + ((rowHeight - blockHeight) / 2);
      masked(this.addLegacySheetWrappedText(
        row.heading,
        textLeft - 8,
        blockTop + (sizes.headingLineHeight / 2),
        textWidth + 16,
        toCyberArcadeCssHex(accent),
        sizes.headingFontSize,
        sizes.headingFontSize,
        1,
        { alpha: 1, bold: true }
      ));
      masked(this.addLegacySheetWrappedText(
        row.text,
        textLeft - 8,
        blockTop + sizes.headingLineHeight + ((copyLines * sizes.copyLineHeight) / 2),
        textWidth + 16,
        toCyberArcadeCssHex(cyberArcadeMaterial.rail.white),
        sizes.copyFontSize,
        sizes.copyFontSize,
        copyLines + 1,
        { alpha: 0.92 }
      ));
    });

    if (model.keyboardLine !== null) {
      const index = model.rows.length;
      if (itemVisible(index)) {
        const top = viewport.top + (plan.itemTops[index] ?? 0) - scrollOffset;
        masked(this.addLegacySheetWrappedText(
          model.keyboardLine,
          viewport.left - 8,
          top + ((heights[index] ?? 0) / 2),
          plan.itemWidth + 16,
          toCyberArcadeCssHex(cyberArcadeMaterial.rail.muted),
          sizes.copyFontSize,
          sizes.copyFontSize,
          3,
          { alpha: 0.92 }
        ));
      }
    }

    if (scrollMetrics !== null) {
      this.drawLegacyOverlayScrollFacade(scrollMetrics);
    }

    this.uiButtons.push(this.createLegacyAuthActionButton(
      plan.footer.left + (plan.footer.width / 2),
      plan.footer.top + (plan.footer.height / 2),
      plan.footer.width,
      plan.footer.height,
      model.closeLabel,
      () => this.closeLegacyGuideSheet(),
      'primary'
    ));
  }

  private closeLegacyGuideSheet(): void {
    if (!this.settingsGuideOpen) {
      return;
    }
    this.settingsGuideOpen = false;
    this.overlayGuideBounds = null;
    this.resetLegacyOverlayScrollState();
    this.uiDirty = true;
  }

  private resolveLegacyGuideHasKeyboard(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    try {
      return window.matchMedia('(pointer: fine)').matches && window.matchMedia('(hover: hover)').matches;
    } catch {
      return false;
    }
  }

  private measureLegacySheetWrappedLines(copy: string, width: number, fontSize: number): number {
    const probe = this.add.text(0, 0, copy, {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: `${fontSize}px`,
      wordWrap: { useAdvancedWrap: true, width: Math.max(1, Math.min(width, 4096) - 16) }
    });
    const lines = probe.getWrappedText().length;
    probe.destroy();
    return Math.max(1, lines);
  }

  // Icon badge + glyph for one guide row. Each glyph names the draw function it
  // shares with the board (legacyGuideContent.ts `boardDraw`):
  //   goal-star / start-marker -> drawBoardMarkers via the Phaser graphics adapter (shared)
  //   trail-swatch -> chip tiles from computeChipGeometry (shared geometry); level-numeral -> the wordmark chip draw
  //   edge-marker  -> drawEdgeMarker (shared)
  //   touch-stick / player-block -> guide-local
  //   miniatures of the same shapes and tokens (see the status/reasonId there).
  private drawLegacyGuideIcon(
    icon: LegacyGuideIconSpec,
    centerX: number,
    centerY: number,
    accentColor: number,
    graphics: Phaser.GameObjects.Graphics
  ): void {
    const badgeRadius = LEGACY_GUIDE_SHEET_SIZES.badgeSize / 2;
    if (icon.badge === 'square') {
      const half = badgeRadius * 0.92;
      // Rounded at the legacy inset radius (9) so the square badges sit in the
      // same corner language as the sheet's inner keyline did.
      graphics.fillStyle(accentColor, 0.16);
      graphics.fillRoundedRect(centerX - half, centerY - half, half * 2, half * 2, 9);
      graphics.lineStyle(1.2, accentColor, 0.7);
      graphics.strokeRoundedRect(centerX - half, centerY - half, half * 2, half * 2, 9);
    } else {
      graphics.fillStyle(accentColor, 0.16);
      graphics.fillCircle(centerX, centerY, badgeRadius);
      graphics.lineStyle(1.2, accentColor, 0.7);
      graphics.strokeCircle(centerX, centerY, badgeRadius);
    }

    switch (icon.glyph) {
      case 'goal-star':
        this.drawLegacyGuideBoardMarker(graphics, 'goal', centerX, centerY, Math.round(badgeRadius * 1.5));
        return;
      case 'start-marker':
        this.drawLegacyGuideBoardMarker(graphics, 'start', centerX, centerY, Math.round(badgeRadius * 1.5));
        return;
      case 'player-block':
        this.drawLegacyOptionsGuidePlayerGlyph(graphics, centerX, centerY, badgeRadius * 1.5);
        return;
      case 'touch-stick':
        this.drawLegacyOptionsGuideMoveGlyph(graphics, centerX, centerY, badgeRadius * 0.9);
        return;
      case 'trail-swatch':
        this.drawLegacyOptionsGuideTrailGlyph(graphics, centerX, centerY, badgeRadius);
        return;
      case 'edge-marker':
        drawEdgeMarker(
          graphics,
          { id: 1, inwardAngle: Math.PI / 2, isCorner: false, side: 'top', x: centerX, y: centerY },
          { alpha: 0.95, energized: false, energy: 0, flash: 0, hidden: false, id: 1, spinRad: 0 }
        );
        return;
      case 'level-numeral': {
        // The same dot-matrix chip renderer the level announcer and wordmarks use, at icon scale.
        const word = String(this.progressionState.tracks.player.level);
        const columns = resolveLegacyGlyphWordLayout(word, 0, 0, 1).columns;
        const cellSize = clamp(Math.floor((badgeRadius * 2 - 3) / Math.max(7, columns)), 2, 5);
        const layout = resolveLegacyGlyphWordLayout(word, centerX, centerY, cellSize);
        this.drawLegacyGlyphWordTileBlock(graphics, layout, 0, 1, 1, false);
        return;
      }
    }
  }

  // The player marker at guide scale: the same shared frame + draw as the board (src/render/playerMarker.ts), frozen
  // (no ping, reduced motion, centred in its cell). The soft shadowBlur glow is a canvas image the board composites
  // underneath, so the icon has the locator, block and stroke only.
  private drawLegacyOptionsGuidePlayerGlyph(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    tileSize: number
  ): void {
    const devicePixelRatio = this.resolveBoardTileBackingScale();
    const frame = resolvePlayerMarkerFrame({
      centerX,
      centerY,
      tileSize,
      devicePixelRatio,
      timeMs: 0,
      reducedMotion: true,
      motionAmount: 0,
      headingX: 0,
      headingY: 0
    }, this.playerMarkerFrameScratch);
    drawPlayerMarker(graphics, frame, {
      tileSize,
      devicePixelRatio,
      alpha: 1,
      timeMs: 0,
      coreColor: resolveLegacyIridescentPlayerCoreColor(0),
      pingStartMs: -1,
      reducedMotion: true
    });
  }

  // A miniature of the real floating movement stick (ring + knob, same colors
  // as drawLegacyPlayTouchStick). That draw derives its geometry from the live
  // viewport, so it cannot be called at icon scale; this is guide-local.
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

  // Chip tile under a Guide marker icon (single cell), then the marker itself drawn by the board's own
  // drawBoardMarkers through the Phaser graphics adapter. Static: reduced motion, no ring pulse.
  private drawLegacyGuideBoardMarker(
    graphics: Phaser.GameObjects.Graphics,
    kind: 'start' | 'goal',
    centerX: number,
    centerY: number,
    size: number
  ): void {
    const left = centerX - (size / 2);
    const top = centerY - (size / 2);
    this.drawLegacyGuideChipCells(graphics, [[true]], 1, 1, left, top, size, [{ column: 0, row: 0 }]);
    const context = new PhaserGraphicsTileContext(graphics);
    drawBoardMarkers(context, {
      style: this.boardTileStyle,
      tileSize: size,
      devicePixelRatio: this.resolveBoardTileBackingScale(),
      originX: left,
      originY: top,
      start: kind === 'start' ? { x: 0, y: 0 } : undefined,
      goal: kind === 'goal' ? { x: 0, y: 0 } : undefined,
      phase: 0,
      reducedMotion: true
    });
  }

  // Board-coloured chip cells for Guide swatches: the same computeChipGeometry the board bake uses.
  private drawLegacyGuideChipCells(
    graphics: Phaser.GameObjects.Graphics,
    grid: boolean[][],
    columns: number,
    rows: number,
    left: number,
    top: number,
    cellSize: number,
    cells: Array<{ column: number; row: number }>
  ): void {
    const geometry = resolveChipGridGeometry({ grid, columns, rows, left, top, cellSize });
    const colors = this.boardTileStyle === 'trace'
      ? { rim: boardMaterial.channelBorder, fill: boardMaterial.channel }
      : { rim: boardMaterial.rim, fill: boardMaterial.chip };
    for (const cell of cells) {
      drawChipCell(graphics, geometry, left, top, cell.column, cell.row, colors, 1);
    }
  }

  // Trail legend: three chip tiles in an L (the board's own tile geometry) with a trail line over a dark
  // underlay, the same layering the board trail uses, in the board trail's iridescent colours (resting
  // sweep, frozen: no time term and no pulse, so the legend is static).
  private drawLegacyOptionsGuideTrailGlyph(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    badgeRadius: number
  ): void {
    const cellSize = Math.max(6, Math.round(badgeRadius * 0.85));
    const left = Math.round(centerX - cellSize);
    const top = Math.round(centerY - cellSize);
    const grid = [[true, false], [true, true]];
    this.drawLegacyGuideChipCells(graphics, grid, 2, 2, left, top, cellSize, [
      { column: 0, row: 0 },
      { column: 0, row: 1 },
      { column: 1, row: 1 }
    ]);
    const points = [
      { x: left + (cellSize * 0.5), y: top + (cellSize * 0.5) },
      { x: left + (cellSize * 0.5), y: top + (cellSize * 1.5) },
      { x: left + (cellSize * 1.5), y: top + (cellSize * 1.5) }
    ];
    const coreWidth = Math.max(2, cellSize * LEGACY_PLAY_TRAIL_WIDTH_RATIO);
    // Four sub-strokes (two per leg) so the legend shows the colour shifting along the line.
    const legs: Array<[{ x: number; y: number }, { x: number; y: number }, number]> = [];
    for (let leg = 0; leg < 2; leg += 1) {
      const from = points[leg]!;
      const to = points[leg + 1]!;
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      legs.push([from, mid, (leg * 2) + 0.5], [mid, to, (leg * 2) + 1.5]);
    }
    const layers = [
      { width: coreWidth + (2 * LEGACY_TRAIL_UNDERLAY_PAD_CSS), alpha: LEGACY_TRAIL_UNDERLAY_ALPHA, core: false },
      { width: coreWidth, alpha: 1, core: true }
    ] as const;
    for (const layer of layers) {
      for (const [from, to, distanceTiles] of legs) {
        const color = layer.core ? resolveIridescentRestingCore(distanceTiles * 1.6, 0) : boardMaterial.void;
        graphics.lineStyle(layer.width, color, layer.alpha);
        graphics.beginPath();
        graphics.moveTo(from.x, from.y);
        graphics.lineTo(to.x, to.y);
        graphics.strokePath();
      }
    }
  }

  // Leaderboard sheet (redesign 2026-11-06): the scene only paints the plan
  // built from the pure view-model (legacyLeaderboardView.ts) and layout
  // (legacyLeaderboardOverlayPlan.ts). Same card, title, primary `Back to Menu`
  // exit, masked scroll body and rail as the Settings sheet; the top N rows
  // scroll, the You row stays pinned. Menu context only (not reachable from
  // pause). Static: no animation, so nothing to gate for reduced motion.
  private resolveLegacyLeaderboardViewState(): LegacyLeaderboardViewState {
    const fixtureShape = readLegacyLeaderboardFixtureShape();
    const signedIn = this.authSnapshot.status === 'authenticated' && fixtureShape !== 'signed-out';
    let usernameGate: LegacyLeaderboardUsernameGate = 'ok';
    if (this.authSnapshot.status === 'authenticated') {
      this.loadAccountUsernameIfNeeded();
      if (this.accountUsernameHydrationPending) {
        usernameGate = 'loading';
      } else if (this.accountUsernameHydrationError) {
        usernameGate = 'unavailable';
      }
    }
    // A named username is the only thing that puts a row on the public page
    // (mazer_leaderboard_page filters to it), so an unnamed player gets one
    // clear reason plus the action that unlocks it instead of a list they can
    // never appear in.
    if (usernameGate === 'ok' && this.accountUsernameSavedValue.length <= 0) {
      usernameGate = 'needs-username';
    }
    const deviceOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return {
      entries: this.leaderboardEntries,
      errorMessage: this.leaderboardErrorMessage,
      online: !deviceOffline && fixtureShape !== 'offline',
      selfRank: this.leaderboardSelfRank,
      selfUsername: this.accountUsernameSavedValue,
      signedIn,
      status: this.leaderboardStatus,
      usernameGate
    };
  }

  private runLegacyLeaderboardAction(id: LegacyLeaderboardActionId): void {
    switch (id) {
      case 'retry-username':
        this.accountUsernameLoadedForUserId = null;
        this.accountUsernameHydrationError = false;
        this.uiDirty = true;
        return;
      case 'retry-page':
        void this.loadLeaderboard();
        return;
      case 'go-to-account':
      case 'sign-in':
        this.dispatchUiBridgeCommand({ type: 'NAVIGATE', surface: 'account' }, () => this.openSharedAccountSurface());
        return;
    }
  }

  // One text cell. `x` is the visible glyph edge for the origin (left edge,
  // centre or right edge): the compact text padding (8 px each side) is
  // compensated here so columns line up with the plan.
  private addLegacyLeaderboardText(
    x: number,
    y: number,
    text: string,
    color: number,
    fontSize: number,
    originX: number,
    maxWidth: number,
    options: { alpha?: number; bold?: boolean; mask?: Phaser.Display.Masks.GeometryMask | null } = {}
  ): Phaser.GameObjects.Text {
    const pad = 8;
    const compensatedX = originX === 0 ? x - pad : originX === 1 ? x + pad : x;
    const label = this.fitLegacyUiTextToWidth(
      this.padLegacyCompactUiText(this.add.text(compensatedX, y, text, {
        color: toCyberArcadeCssHex(color),
        fontFamily: LEGACY_UI_FONT_FAMILY,
        fontSize: `${fontSize}px`,
        fontStyle: options.bold === true ? 'bold' : 'normal'
      })),
      maxWidth + (pad * 2),
      fontSize,
      Math.min(fontSize, 11)
    ).setOrigin(originX, 0.5).setAlpha(options.alpha ?? 1);
    if (options.mask) {
      label.setMask(options.mask);
    }
    this.uiTexts.push(label);
    return label;
  }

  private buildLeaderboardOverlay(): void {
    const view = buildLegacyLeaderboardViewModel(this.resolveLegacyLeaderboardViewState());
    const plan = buildLegacyLeaderboardOverlayPlan(
      view,
      this.layout.width,
      this.layout.height,
      readMazerViewportGeometry().safeArea,
      {
        measureBodyLines: (text, maxWidth, fontSize) => this.measureLegacySheetWrappedLines(text, maxWidth, fontSize)
      }
    );
    // Exit: no X, no back arrow. The primary top row (same row as Settings'
    // Back to Menu), Escape (handleBackAction) and a tap on the scrim outside
    // the card (handleOverlayScrimPointerDown) all close the sheet.
    this.overlayScrimCloseBounds = createVisualRect(plan.card.left, plan.card.top, plan.card.width, plan.card.height);
    this.drawLegacySheetCard(plan.card);
    this.createOverlayTitle(plan.title.text, plan.title.centerY);
    this.uiButtons.push(this.createLegacyAuthActionButton(
      plan.exit.left + (plan.exit.width / 2),
      plan.exit.top + (plan.exit.height / 2),
      plan.exit.width,
      plan.exit.height,
      plan.exitLabel,
      () => this.handleBackAction(),
      'primary'
    ));

    const list = plan.list;
    const scrollMetrics = this.applyLegacySheetScroll(
      list?.railViewport ?? plan.card,
      list?.contentHeight ?? 0,
      list?.scrollable ?? false
    );
    const scrollOffset = scrollMetrics?.offset ?? 0;

    if (plan.columnHeader !== null) {
      this.paintLegacyLeaderboardColumnHeader(plan, view);
    }
    if (list !== null) {
      this.paintLegacyLeaderboardList(plan, scrollOffset);
    }
    if (scrollMetrics !== null) {
      this.drawLegacyOverlayScrollFacade(scrollMetrics);
    }
    if (plan.selfRow !== null) {
      this.paintLegacyLeaderboardSelfRow(plan.selfRow);
    }
    if (plan.stateBlock !== null) {
      this.paintLegacyLeaderboardState(plan.stateBlock);
    }
  }

  private paintLegacyLeaderboardColumnHeader(
    plan: LegacyLeaderboardOverlayPlan,
    view: LegacyLeaderboardViewModel
  ): void {
    const header = plan.columnHeader;
    if (header === null) {
      return;
    }
    const material = cyberArcadeMaterial;
    if (view.columns !== null) {
      this.addLegacyLeaderboardText(header.rankCenterX, header.centerY, view.columns.rank, material.rail.muted, 11, 0.5, 52, { bold: true });
      this.addLegacyLeaderboardText(header.playerLeft, header.centerY, view.columns.player, material.rail.muted, 11, 0, 140, { bold: true });
      this.addLegacyLeaderboardText(header.levelRight, header.centerY, view.columns.level, material.rail.muted, 11, 1, 64, { bold: true });
    } else {
      this.addLegacyLeaderboardText(
        header.rect.left + (header.rect.width / 2),
        header.centerY,
        LEGACY_LEADERBOARD_COPY.loading,
        material.rail.cyan,
        13,
        0.5,
        header.rect.width
      );
    }
    this.overlayGraphics.lineStyle(1, LEGACY_CYBER_PANEL_STROKE_ALT, 0.4);
    this.overlayGraphics.lineBetween(header.rect.left, header.ruleY, header.rect.left + header.rect.width, header.ruleY);
  }

  private paintLegacyLeaderboardList(
    plan: LegacyLeaderboardOverlayPlan,
    scrollOffset: number
  ): void {
    const list = plan.list;
    if (list === null || list.viewport.height <= 0) {
      return;
    }
    const material = cyberArcadeMaterial;
    const viewport = list.viewport;
    // The body scrolls under a geometry mask, so a row that is partly scrolled out is clipped at
    // the viewport edge (same technique as the Guide sheet).
    let graphics: Phaser.GameObjects.Graphics = this.overlayGraphics;
    let mask: Phaser.Display.Masks.GeometryMask | null = null;
    if (list.scrollable) {
      graphics = this.add.graphics();
      this.overlayGuideGraphics = graphics;
      const maskGraphics = this.make.graphics({ x: 0, y: 0 }, false);
      maskGraphics.fillStyle(0xffffff, 1);
      maskGraphics.fillRect(viewport.left, viewport.top, viewport.width, viewport.height);
      mask = maskGraphics.createGeometryMask();
      graphics.setMask(mask);
      this.overlayGuideMaskGraphics = maskGraphics;
      this.overlayGuideMask = mask;
    }

    for (const rect of list.skeletonRows) {
      const top = viewport.top + rect.top;
      graphics.fillStyle(material.rail.edge, 0.2);
      graphics.fillRoundedRect(viewport.left + 8 + 8, top + (rect.height / 2) - 6, 32, 12, 6);
      graphics.fillRoundedRect(viewport.left + 64, top + (rect.height / 2) - 6, Math.round(viewport.width * 0.36), 12, 6);
      graphics.fillRoundedRect(viewport.left + viewport.width - 12 - 36, top + (rect.height / 2) - 6, 36, 12, 6);
      graphics.lineStyle(1, LEGACY_CYBER_PANEL_STROKE_ALT, 0.18);
      graphics.lineBetween(viewport.left + 8, top + rect.height + 9.5, viewport.left + viewport.width - 8, top + rect.height + 9.5);
    }

    list.rows.forEach((row, index) => {
      const rect = resolveLegacyLeaderboardRowScreenRect(plan, row, scrollOffset);
      if (rect.top + rect.height <= viewport.top || rect.top >= viewport.top + viewport.height) {
        return;
      }
      const model = row.model;
      const centerY = rect.top + (rect.height / 2);
      const tierColor = resolveLegacyLeaderboardTierColor(model.tier);
      if (model.emphasized) {
        graphics.fillStyle(tierColor, 0.1);
        graphics.fillRoundedRect(rect.left, rect.top + 1, rect.width, rect.height - 2, 8);
        graphics.fillStyle(tierColor, 0.95);
        graphics.fillRoundedRect(rect.left, rect.top + 8, 3, rect.height - 16, 1.5);
      }
      if (model.isOwn) {
        graphics.fillStyle(material.rail.mint, 0.14);
        graphics.fillRoundedRect(rect.left, rect.top + 1, rect.width, rect.height - 2, 8);
        graphics.lineStyle(1, material.rail.mint, 0.7);
        graphics.strokeRoundedRect(rect.left + 0.5, rect.top + 1.5, rect.width - 1, rect.height - 3, 8);
      }
      if (index < list.rows.length - 1 && !model.isOwn) {
        graphics.lineStyle(1, LEGACY_CYBER_PANEL_STROKE_ALT, 0.26);
        graphics.lineBetween(rect.left + 8, rect.top + rect.height - 0.5, rect.left + rect.width - 8, rect.top + rect.height - 0.5);
      }
      const rankColor = model.emphasized ? tierColor : model.isOwn ? material.rail.mint : material.rail.muted;
      const nameColor = model.isOwn ? material.rail.mint : material.rail.white;
      this.addLegacyLeaderboardText(rect.left + row.rankCenterX, centerY, model.rankText, rankColor, model.emphasized ? 17 : 14, 0.5, 52, {
        bold: model.emphasized || model.isOwn,
        mask
      });
      const nameWidth = model.isOwn ? row.nameMaxWidth - 38 : row.nameMaxWidth;
      const name = this.addLegacyLeaderboardText(rect.left + row.nameLeft, centerY, model.usernameText, nameColor, 15, 0, nameWidth, {
        bold: model.emphasized || model.isOwn,
        mask
      });
      this.addLegacyLeaderboardText(rect.left + row.levelRight, centerY, model.levelText, nameColor, 15, 1, row.levelMaxWidth, {
        bold: model.emphasized || model.isOwn,
        mask
      });
      if (model.isOwn) {
        const pillLeft = rect.left + row.nameLeft + Math.max(0, name.width - 16) + 8;
        graphics.fillStyle(material.rail.mint, 0.22);
        graphics.fillRoundedRect(pillLeft, centerY - 8, 30, 16, 8);
        this.addLegacyLeaderboardText(pillLeft + 15, centerY, LEGACY_LEADERBOARD_COPY.you.toUpperCase(), material.rail.mint, 10, 0.5, 28, { bold: true, mask });
      }
    });
  }

  // The pinned You row: always visible under the list once the player has a
  // rank, including when they are outside the loaded top N.
  private paintLegacyLeaderboardSelfRow(self: NonNullable<LegacyLeaderboardOverlayPlan['selfRow']>): void {
    const material = cyberArcadeMaterial;
    const graphics = this.overlayGraphics;
    const rect = self.rect;
    const model = self.model;
    graphics.fillStyle(material.substrate.fieldRaised, 1);
    graphics.fillRoundedRect(rect.left, rect.top, rect.width, rect.height, 10);
    graphics.lineStyle(1.5, material.rail.mint, 0.75);
    graphics.strokeRoundedRect(rect.left + 0.5, rect.top + 0.5, rect.width - 1, rect.height - 1, 10);
    const centerY = rect.top + (rect.height / 2);
    this.addLegacyLeaderboardText(rect.left + self.rankCenterX, centerY, model.rankText, material.rail.mint, 19, 0.5, 52, { bold: true });
    if (model.usernameText !== null) {
      this.addLegacyLeaderboardText(rect.left + self.nameLeft, centerY - 10, model.label.toUpperCase(), material.rail.mint, 11, 0, self.nameMaxWidth, { bold: true, alpha: 0.9 });
      this.addLegacyLeaderboardText(rect.left + self.nameLeft, centerY + 9, model.usernameText, material.rail.white, 15, 0, self.nameMaxWidth, { bold: true });
    } else {
      this.addLegacyLeaderboardText(rect.left + self.nameLeft, centerY, model.label, material.rail.mint, 17, 0, self.nameMaxWidth, { bold: true });
    }
    this.addLegacyLeaderboardText(rect.left + self.levelRight, centerY, model.levelText, material.rail.mint, 19, 1, self.levelMaxWidth, { bold: true });
  }

  // A designed state (gate, signed out, offline, error, empty): glyph, heading,
  // one line, at most one action. Never the raw error text.
  private paintLegacyLeaderboardState(block: NonNullable<LegacyLeaderboardOverlayPlan['stateBlock']>): void {
    const material = cyberArcadeMaterial;
    const model = block.model;
    const tone = model.tone === 'error' ? material.signal.goal : model.tone === 'info' ? material.rail.cyan : material.rail.mint;
    this.drawLegacyLeaderboardStateGlyph(model.kind, block.centerX, block.iconCenterY, 48, tone);
    if (model.heading !== null && block.headingCenterY !== null) {
      this.addLegacyLeaderboardText(block.centerX, block.headingCenterY, model.heading, material.rail.white, 18, 0.5, block.bodyMaxWidth, { bold: true });
    }
    const body = this.padLegacyCompactUiText(this.add.text(block.centerX, block.bodyTop, model.text, {
      align: 'center',
      color: toCyberArcadeCssHex(model.tone === 'error' || model.tone === 'info' ? material.rail.white : material.rail.muted),
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: '15px',
      wordWrap: { useAdvancedWrap: true, width: Math.max(1, block.bodyMaxWidth - 16) }
    })).setOrigin(0.5, 0).setAlpha(0.94);
    this.uiTexts.push(body);
    if (block.action !== null && model.action !== null) {
      const action = model.action;
      this.uiButtons.push(this.createLegacyAuthActionButton(
        block.action.left + (block.action.width / 2),
        block.action.top + (block.action.height / 2),
        block.action.width,
        block.action.height,
        action.label,
        () => this.runLegacyLeaderboardAction(action.id),
        'primary'
      ));
    }
  }

  private drawLegacyLeaderboardStateGlyph(
    kind: LegacyLeaderboardStateKind,
    cx: number,
    cy: number,
    size: number,
    color: number
  ): void {
    const g = this.overlayGraphics;
    const r = size / 2;
    g.fillStyle(color, 0.12);
    g.fillCircle(cx, cy, r);
    g.lineStyle(1.5, color, 0.7);
    g.strokeCircle(cx, cy, r - 0.75);
    g.lineStyle(2.5, color, 0.95);
    g.fillStyle(color, 0.95);
    switch (kind) {
      case 'empty': {
        // Three ascending bars: the leaderboard motif.
        const barW = 6;
        const base = cy + 10;
        g.fillRoundedRect(cx - 13, base - 8, barW, 8, 2);
        g.fillRoundedRect(cx - 3, base - 16, barW, 16, 2);
        g.fillRoundedRect(cx + 7, base - 12, barW, 12, 2);
        return;
      }
      case 'offline': {
        g.beginPath();
        g.arc(cx, cy + 7, 15, Math.PI * 1.2, Math.PI * 1.8);
        g.strokePath();
        g.beginPath();
        g.arc(cx, cy + 7, 9, Math.PI * 1.2, Math.PI * 1.8);
        g.strokePath();
        g.fillCircle(cx, cy + 8, 2.5);
        g.lineBetween(cx - 14, cy - 12, cx + 14, cy + 14);
        return;
      }
      case 'signed-out':
      case 'needs-username': {
        g.strokeCircle(cx, cy - 6, 5.5);
        g.beginPath();
        g.arc(cx, cy + 15, 12, Math.PI * 1.15, Math.PI * 1.85);
        g.strokePath();
        return;
      }
      case 'profile-loading': {
        g.fillCircle(cx - 10, cy, 3);
        g.fillCircle(cx, cy, 3);
        g.fillCircle(cx + 10, cy, 3);
        return;
      }
      default: {
        // error / unreachable / not-set-up / profile-unavailable: an exclamation mark.
        g.lineBetween(cx, cy - 12, cx, cy + 3);
        g.fillCircle(cx, cy + 10, 2.5);
      }
    }
  }

  // Reset progress confirmation, painted from the pure flow in
  // legacyProgressionResetFlow.ts: step 1 is the confirm card (level shown,
  // one consequence line, Cancel first and default, the destructive button
  // armed after LEGACY_PROGRESSION_RESET_ARM_DELAY_MS); step 2 is the result
  // (working, done, failed or blocked) on the same card. Back, Escape and
  // Cancel all route through handleBackAction, which returns to the sheet the
  // confirm was opened from (Settings, Account or Pause).
  private buildProgressionResetConfirmationOverlay(): void {
    const state = this.progressionResetState;
    if (state.phase === 'idle' || state.phase === 'cancelled') {
      this.uiDirty = true;
      return;
    }
    const panel = this.resolveOverlayPanelFrame();
    const compact = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
    const sizes = LEGACY_SETTINGS_SIZES;
    const copy = LEGACY_PROGRESSION_RESET_COPY;
    const cardPadding = compact ? sizes.cardPaddingCompact : sizes.cardPaddingRegular;
    const titleHeight = compact ? sizes.titleHeightCompact : sizes.titleHeightRegular;
    const titleGap = compact ? sizes.titleGapCompact : sizes.titleGapRegular;
    const cardWidth = Math.min(compact ? 360 : 400, Math.max(1, panel.width - (compact ? 16 : 48)));
    const innerWidth = cardWidth - (cardPadding * 2);
    const bodyFontSize = 16;
    const bodyLineHeight = 22;
    const levelLineHeight = 40;
    const blockGap = 16;
    const buttonHeight = sizes.actionHeight;
    const buttonGap = sizes.sectionGap;

    const confirmView = state.phase === 'confirm' || state.phase === 'working'
      ? buildLegacyProgressionResetConfirmView(state, this.time.now)
      : null;
    const statusLine = state.phase === 'blocked' || state.phase === 'done' || state.phase === 'failed'
      ? resolveLegacyProgressionResetStatusLine(state)
      : null;
    const bodyCopy = confirmView?.consequence ?? statusLine ?? '';
    const levelLine = confirmView?.levelLine
      ?? (state.phase === 'failed' ? `Level ${state.level} → Level 1` : null);
    const title = confirmView?.title ?? copy.menuButton;
    const bodyLines = this.measureLegacySheetWrappedLines(bodyCopy, innerWidth, bodyFontSize);
    const buttonCount = confirmView === null ? 1 : 2;
    const contentHeight = (levelLine === null ? 0 : levelLineHeight + 8)
      + (bodyLines * bodyLineHeight)
      + blockGap
      + (buttonCount * buttonHeight)
      + ((buttonCount - 1) * buttonGap);
    const headerReserve = 46 + (compact ? 6 : 8);
    const availableHeight = Math.max(1, panel.height - headerReserve);
    const cardHeight = Math.min(availableHeight, (cardPadding * 2) + titleHeight + titleGap + contentHeight);
    const cardLeft = Math.round(panel.centerX - (cardWidth / 2));
    const cardTop = Math.round(panel.top + headerReserve + ((availableHeight - cardHeight) / 2));

    this.drawLegacySheetCard({ height: cardHeight, left: cardLeft, top: cardTop, width: cardWidth });
    this.createOverlayTitle(title, cardTop + cardPadding + Math.round(titleHeight / 2));

    let cursorY = cardTop + cardPadding + titleHeight + titleGap;
    if (levelLine !== null) {
      this.addLegacySheetWrappedText(
        levelLine,
        panel.centerX,
        cursorY + (levelLineHeight / 2),
        innerWidth,
        '#ecfff5',
        28,
        20,
        1,
        { alpha: 1, bold: true, originX: 0.5 }
      );
      cursorY += levelLineHeight + 8;
    }
    const bodyColor = state.phase === 'failed' || state.phase === 'blocked'
      ? '#ffb4c4'
      : state.phase === 'done' ? '#72e0bf' : '#d9fff5';
    const body = this.addLegacySheetWrappedText(
      bodyCopy,
      panel.centerX,
      cursorY + ((bodyLines * bodyLineHeight) / 2),
      innerWidth,
      bodyColor,
      bodyFontSize,
      14,
      bodyLines + 1,
      { alpha: 0.96, originX: 0.5 }
    );
    body.setAlign('center');
    cursorY += (bodyLines * bodyLineHeight) + blockGap;

    const buttonLeftCenter = cardLeft + (cardWidth / 2);
    const addButton = (
      label: string,
      tone: 'danger' | 'primary',
      onClick: () => void,
      disabled: boolean
    ): void => {
      this.uiButtons.push(this.createLegacyAuthActionButton(
        buttonLeftCenter,
        cursorY + (buttonHeight / 2),
        innerWidth,
        buttonHeight,
        label,
        onClick,
        tone,
        undefined,
        { disabled }
      ));
      cursorY += buttonHeight + buttonGap;
    };

    if (confirmView !== null) {
      const [cancelButton, confirmButton] = confirmView.buttons;
      addButton(cancelButton.label, 'primary', () => this.handleBackAction(), state.phase === 'working');
      addButton(
        state.phase === 'working' ? copy.working : confirmButton.label,
        'danger',
        () => this.confirmLegacyProgressionReset(),
        !confirmButton.enabled
      );
      return;
    }
    addButton(
      state.phase === 'done' ? copy.doneButton : copy.close,
      'primary',
      () => this.handleBackAction(),
      false
    );
  }

  private confirmLegacyProgressionReset(): void {
    const next = reduceLegacyProgressionReset(this.progressionResetState, { nowMs: this.time.now, type: 'confirm' });
    if (next.phase !== 'working') {
      // Not armed yet (or already working): a ghost/double tap does nothing.
      return;
    }
    this.progressionResetState = next;
    this.uiDirty = true;
    if (!this.uiBridge || !this.uiBridge.dispatch({ type: 'RESET_PROGRESS' }).ok) {
      void this.resetLegacyPlayerProgression();
    }
  }

  private resolveLegacyProgressionResetStrategy(): LegacyProgressionResetStrategy {
    return resolveLegacyProgressionResetStrategy({
      online: typeof navigator === 'undefined' || navigator.onLine !== false,
      remoteProgressionEnabled: isLegacyRemoteProgressionEnabled(),
      sessionPending: this.authGateAwaitingResolution,
      userId: isLegacyRemoteAccountProviderEligible(this.authSnapshot) ? this.authSnapshot.userId : null
    });
  }

  private reduceLegacyProgressionResetState(event: LegacyProgressionResetEvent): void {
    const next = reduceLegacyProgressionReset(this.progressionResetState, event);
    if (next !== this.progressionResetState) {
      this.progressionResetState = next;
      this.uiDirty = true;
    }
  }

  // Enters the confirm flow. Called from openOverlay('confirm-progression-reset')
  // so every entry point (Settings row, Account link, QA/bridge) shares the
  // same strategy, run-active guard and arm timer.
  private requestLegacyProgressionReset(): void {
    this.progressionResetState = reduceLegacyProgressionReset(INITIAL_LEGACY_PROGRESSION_RESET_STATE, {
      level: this.progressionState.tracks.player.level,
      nowMs: this.time.now,
      runActive: this.mode === 'play',
      strategy: this.resolveLegacyProgressionResetStrategy(),
      type: 'request'
    });
    if (this.progressionResetState.phase === 'confirm') {
      // Redraw once the destructive button arms.
      this.time.delayedCall(LEGACY_PROGRESSION_RESET_ARM_DELAY_MS + 40, () => {
        if (this.overlay === 'confirm-progression-reset') {
          this.uiDirty = true;
        }
      });
    }
  }

  private buildAuthOverlay(): void {
    const panel = this.resolveOverlayPanelFrame();
    const stacked = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
    const centerX = panel.centerX;
    if (this.isLegacyPasswordRecoveryActive()) {
      this.buildPasswordRecoveryOverlay(panel, stacked);
      return;
    }
    const rowY = panel.top + (panel.height * 0.42);

    // No way out while the full auth gate has this locked -- handleBackAction
    // already refuses to close it too (defense in depth for Escape), but
    // the button itself shouldn't even suggest there's a way back.
    if (!(this.authGateLocked && this.overlay === 'auth')) {
      this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.handleBackAction()));
    }
    this.createAuthWordmark(panel.top + (stacked ? 42 : 48));
    this.createOverlayTitle(this.buildLegacyAuthScreenModel().title ?? 'Account', panel.top + (stacked ? 103 : 110));

    if (this.authSnapshot.status === 'authenticated') {
      this.buildAuthenticatedAccountSection(panel, stacked, rowY);
      return;
    }

    this.buildSharedAccountEntrySection(panel, stacked, centerX);
    this.latestAuthMessage = this.resolveLegacyCurrentAuthMessage();
  }

  private buildLegacyAuthScreenModel(): ReturnType<typeof buildLegacyAuthScreenViewModel> {
    return buildLegacyAuthScreenViewModel({
      awaitingResolution: false,
      compact: this.layout.width < LEGACY_UI_COMPACT_BREAKPOINT,
      errorMessage: this.authSnapshot.error,
      hasCallbackInProgress: false,
      status: this.authSnapshot.status,
      submitting: this.authSubmitting || this.authOpeningTimedOut,
      submittingElapsedMs: this.authOpeningTimedOut ? LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS : 0
    });
  }

  // Welcome entry card (shared auth-surface family anatomy): marker + title
  // are drawn by buildAuthOverlay; this draws the optional status banner, the
  // `Create Account | Reset Password` rail, the legal row and ONE full-width
  // bottom-dock `Sign in`. No subtitle, no guest/skip/close action.
  private buildSharedAccountEntrySection(
    panel: OverlayPanelFrame,
    stacked: boolean,
    centerX: number
  ): void {
    const model = this.buildLegacyAuthScreenModel();
    const layout = resolveLegacyAuthScreenLayout(this.layout.width, this.layout.height, readMazerViewportGeometry().safeArea);
    const material = cyberArcadeMaterial;

    const infoCopy = this.authSnapshot.status === 'unavailable' ? '' : (this.authSnapshot.info?.trim() ?? '');
    const banner = model.banner ?? (infoCopy.length > 0 ? { copy: infoCopy, tone: 'info' as const } : null);
    if (banner !== null) {
      this.createAuthInfoText(
        banner.copy,
        layout.body.top + (layout.body.height / 2),
        panel,
        toCyberArcadeCssHex(banner.tone === 'error' ? material.signal.goal : material.rail.muted),
        stacked ? 14 : 16
      );
    }

    const drawLinkRow = (
      row: typeof layout.rail,
      links: readonly LegacyAuthScreenLink<string>[],
      color: number
    ): void => {
      links.forEach((link, index) => {
        const rect = row.items[index];
        if (rect) {
          this.createAuthScreenLink(rect, index === 0 ? 'end' : 'start', link.label, color, link.disabled, () => this.runLegacyAuthScreenRoute(link.route));
        }
      });
      this.overlayGraphics.lineStyle(1, color, 0.55);
      this.overlayGraphics.lineBetween(centerX, row.divider.top, centerX, row.divider.top + row.divider.height);
    };
    drawLinkRow(layout.rail, model.secondaryRail, material.rail.cyan);
    drawLinkRow(layout.legal, model.legalRow, material.rail.muted);

    const dock = model.primaryDock;
    if (dock !== null) {
      this.uiButtons.push(this.createLegacyAuthActionButton(
        layout.dock.left + (layout.dock.width / 2),
        layout.dock.top + (layout.dock.height / 2),
        layout.dock.width,
        layout.dock.height,
        dock.label,
        () => this.runLegacyAuthScreenRoute('oauth-authorize'),
        'primary'
      ));
    }
  }

  private runLegacyAuthScreenRoute(route: LegacyAuthScreenLink<string>['route']): void {
    switch (route) {
      // Create Account shares the OAuth hand-off: the account host has no
      // sign-up deep link (LoginPanel keeps `intent` in React state only).
      case 'oauth-authorize':
        void this.handleSharedAccountAuthorization();
        return;
      case 'account-host-reset':
        this.navigateToSharedAccountRoute('reset-password');
        return;
      case 'legal-privacy':
        navigateToMazerLegalPortal('privacy');
        return;
      case 'legal-terms':
        navigateToMazerLegalPortal('terms');
        return;
    }
  }

  // A text link with a full-rect (44px tall) hit area. `end` right-aligns the
  // label to the rect so the left item of a `A | B` row hugs the divider.
  private createAuthScreenLink(
    rect: LegacyAuthScreenRect,
    align: 'end' | 'start',
    text: string,
    color: number,
    disabled: boolean,
    onClick: () => void
  ): void {
    const fontSize = this.layout.width < LEGACY_UI_COMPACT_BREAKPOINT ? 14 : 15;
    const x = align === 'end' ? rect.left + rect.width - 20 : rect.left + 20;
    const y = rect.top + (rect.height / 2);
    const label = this.fitLegacyUiTextToWidth(
      this.padLegacyCompactUiText(this.add.text(x, y, text, {
        color: toCyberArcadeCssHex(color),
        fontFamily: LEGACY_AUTH_UI_FONT_FAMILY,
        fontSize: `${fontSize}px`
      })),
      rect.width - 12,
      fontSize,
      11
    ).setOrigin(align === 'end' ? 1 : 0, 0.5).setAlpha(disabled ? 0.4 : 0.9);
    this.uiTexts.push(label);

    const background = this.add.rectangle(rect.left + (rect.width / 2), y, rect.width, rect.height, 0x000000, 0.001);
    const setActive = (active: boolean): void => {
      label.setAlpha(disabled ? 0.4 : (active ? 1 : 0.9));
    };
    if (!disabled) {
      background.setInteractive({ useHandCursor: true });
      background.on('pointerover', () => setActive(true));
      background.on('pointerout', () => setActive(false));
      background.on('pointerdown', onClick);
    }
    this.uiButtons.push({
      background,
      bounds: createVisualRect(rect.left, rect.top, rect.width, rect.height),
      label,
      setActive,
      text,
      destroy: () => {
        background.destroy();
        label.destroy();
      }
    });
  }

  private isLegacyPasswordRecoveryActive(): boolean {
    return this.passwordRecoveryState.phase !== 'inactive';
  }

  private buildPasswordRecoveryOverlay(panel: OverlayPanelFrame, stacked: boolean): void {
    const presentation = resolveLegacyPasswordRecoveryPresentation(this.passwordRecoveryState);
    const fieldWidth = Math.min(panel.width - 32, 280);
    const fieldHeight = 54;
    const startY = panel.top + (panel.height * 0.42);

    this.createAuthWordmark(panel.top + (stacked ? 42 : 48));
    this.createOverlayTitle(presentation.title, panel.top + (stacked ? 103 : 110));

    if (this.passwordRecoveryState.phase === 'ready' || this.passwordRecoveryState.phase === 'submitting') {
      this.createAuthFieldBox(
        panel.centerX,
        startY,
        fieldWidth,
        fieldHeight,
        'password',
        this.authForm.password.length === 0 ? '' : this.maskLegacyAuthPassword('password'),
        this.authForm.password.length === 0
      );
      this.createAuthFieldBox(
        panel.centerX,
        startY + 68,
        fieldWidth,
        fieldHeight,
        'confirmPassword',
        this.authForm.confirmPassword.length === 0 ? '' : this.maskLegacyAuthPassword('confirmPassword'),
        this.authForm.confirmPassword.length === 0
      );
    }

    const helper = this.passwordRecoveryFeedback ?? presentation.helper;
    if (helper) {
      this.createAuthInfoText(
        helper,
        this.passwordRecoveryState.phase === 'ready' || this.passwordRecoveryState.phase === 'submitting'
          ? startY + 124
          : startY,
        panel,
        this.passwordRecoveryState.phase === 'error' || this.passwordRecoveryFeedback ? '#ff9d9d' : '#d7f7ee',
        stacked ? 13 : 14
      );
    }

    if (presentation.primaryActionLabel) {
      this.createLegacyBottomActionBar(
        panel,
        stacked,
        {
          onClick: () => { void this.handleLegacyPasswordRecoveryPrimaryAction(); },
          text: presentation.primaryActionLabel,
          tone: 'primary'
        }
      );
    }
  }

  private buildAuthenticatedAccountSection(
    panel: OverlayPanelFrame,
    stacked: boolean,
    startY: number
  ): void {
    const accountLabel = this.authSnapshot.displayName ?? this.authSnapshot.email ?? 'Connected account';
    this.createAuthInfoText(
      `${accountLabel}\nManage your profile and account from the shared Fawxzzy account portal.`,
      startY,
      panel,
      '#d7f7ee',
      stacked ? 14 : 16
    );

    // Match the auth-screen hierarchy: the lower-frequency destructive action
    // is a compact text control above one full-width primary dock action.
    this.createAuthFooterLink(
      panel.centerX,
      panel.top + panel.height - 104,
      'Reset progress',
      () => this.dispatchUiBridgeCommand(
        { type: 'OPEN_MODAL', modal: 'confirm-reset-progress' },
        () => this.openOverlay('confirm-progression-reset')
      ),
      '#ff9bb5'
    );
    this.createLegacyBottomActionBar(
      panel,
      stacked,
      { onClick: () => this.navigateToSharedAccountRoute('account'), text: 'Account', tone: 'primary' },
      { onClick: () => { void this.handleLegacyAuthSignOut(); }, text: 'Sign out', tone: 'danger' }
    );
  }

  private loadAccountUsernameIfNeeded(): void {
    const userId = this.authSnapshot.userId;
    if (userId === null || this.accountUsernameLoadedForUserId === userId) {
      return;
    }

    this.accountUsernameLoadedForUserId = userId;
    this.accountUsernameHydrationPending = true;
    this.accountUsernameHydrationError = false;
    // The QA fixture (?runtimeDiagnostics=1&authFixture=authenticated) is a
    // synthetic, front-end-only identity with no real row behind it -- a
    // real readLegacyAccountUsername call always fails for it (there's
    // nothing on the server to check), which used to show "Could not load
    // your username" and leave the leaderboard gate (see
    // buildLeaderboardOverlay) permanently blocking QA screenshots/testing
    // of anything past it. Seed a fixed local value instead of hitting the
    // network at all -- purely cosmetic/local, never actually persisted or
    // validated anywhere real.
    if (userId === LEGACY_RUNTIME_DIAGNOSTICS_AUTH_FIXTURE_USER_ID) {
      this.accountUsernameDraft = 'qa-player';
      this.accountUsernameSavedValue = 'qa-player';
      this.accountUsernameHydrationPending = false;
      this.uiDirty = true;
      return;
    }

    this.accountUsernameSequence += 1;
    const sequence = this.accountUsernameSequence;

    void readLegacyAccountUsername(userId).then((result) => {
      // The user may have signed out, switched accounts, or started typing
      // (which bumps the sequence itself) while this was in flight -- a
      // stale response must never stomp newer state.
      if (sequence !== this.accountUsernameSequence || this.authSnapshot.userId !== userId) {
        return;
      }

      this.accountUsernameHydrationPending = false;
      if (result.error) {
        this.accountUsernameHydrationError = true;
        this.uiDirty = true;
        return;
      }

      this.accountUsernameDraft = result.username ?? '';
      this.accountUsernameSavedValue = result.username ?? '';
      if (this.accountUsernameNativeInput) {
        this.accountUsernameNativeInput.value = this.accountUsernameDraft;
      }
      this.uiDirty = true;
    }).catch(() => {
      if (sequence !== this.accountUsernameSequence || this.authSnapshot.userId !== userId) {
        return;
      }
      this.accountUsernameHydrationPending = false;
      this.accountUsernameHydrationError = true;
      this.uiDirty = true;
    });
  }

  private handleAccountUsernameChange(nextValue: string): void {
    this.accountUsernameDraft = nextValue;
    this.uiDirty = true;
    this.scheduleAccountUsernameEvaluation();
  }

  private scheduleAccountUsernameEvaluation(): void {
    if (this.accountUsernameDebounceTimer !== null) {
      clearTimeout(this.accountUsernameDebounceTimer);
      this.accountUsernameDebounceTimer = null;
    }
    // Bumped unconditionally (even on the early-return branches below) so
    // any in-flight check/save from a previous keystroke is invalidated
    // the instant the field changes again, not just when a new debounced
    // check is actually scheduled.
    this.accountUsernameSequence += 1;
    const sequence = this.accountUsernameSequence;

    const candidate = this.accountUsernameDraft.trim();
    if (candidate.length === 0 || candidate === this.accountUsernameSavedValue) {
      this.uiDirty = true;
      return;
    }

    if (!LEGACY_USERNAME_PATTERN.test(candidate)) {
      this.uiDirty = true;
      return;
    }

    this.uiDirty = true;

    this.accountUsernameDebounceTimer = setTimeout(() => {
      this.accountUsernameDebounceTimer = null;
      void this.evaluateAndSaveAccountUsername(candidate, sequence);
    }, 700);
  }

  private async evaluateAndSaveAccountUsername(candidate: string, sequence: number): Promise<void> {
    const userId = this.authSnapshot.userId;
    if (userId === null) {
      return;
    }

    // mazer_is_username_available checks the whole table, including the
    // caller's own existing row -- it has no way to know which row is
    // "self". That's fine for a brand-new name, but a case-only rename
    // (e.g. "bob" -> "Bob") always case-insensitively matches the caller's
    // own current row and would be misreported as taken, permanently
    // blocking the save client-side even though mazer_set_username below
    // would happily apply it. Skip the availability gate for that one case;
    // the unique index (and the RPC's own error handling) is still the
    // real collision authority for every other candidate.
    const isSelfCaseOnlyRename = candidate.toLowerCase() === this.accountUsernameSavedValue.toLowerCase();
    const availability = isSelfCaseOnlyRename
      ? { available: true, error: null }
      : await checkLegacyUsernameAvailable(candidate);
    if (sequence !== this.accountUsernameSequence) {
      return;
    }

    if (availability.error) {
      this.reportAccountUsernameSaveFailure('try-again', availability.error);
      this.uiDirty = true;
      return;
    }

    if (availability.available === false) {
      this.reportAccountUsernameSaveFailure('taken', null);
      this.uiDirty = true;
      return;
    }

    this.uiDirty = true;
    const saveResult = await saveLegacyAccountUsername(userId, candidate);
    if (sequence !== this.accountUsernameSequence) {
      return;
    }

    if (!saveResult.ok) {
      this.reportAccountUsernameSaveFailure(saveResult.failure ?? 'failed', saveResult.error);
      this.uiDirty = true;
      return;
    }

    this.accountUsernameSavedValue = candidate;
    this.uiDirty = true;
  }

  // A username save that did not land is told to the player in plain words;
  // the provider text stays in the message's technicalDetail.
  private reportAccountUsernameSaveFailure(
    kind: LegacyUsernameSaveFailureKind,
    technicalDetail: string | null
  ): void {
    this.pushLegacyPlayerMessage(resolveLegacyUsernameSaveFailureMessage(kind, technicalDetail));
  }

  private destroyAccountUsernameNativeInput(): void {
    if (this.accountUsernameNativeInput) {
      if (this.accountUsernameNativeInputHandler) {
        this.accountUsernameNativeInput.removeEventListener('input', this.accountUsernameNativeInputHandler);
      }
      if (this.accountUsernameNativeKeyDownHandler) {
        this.accountUsernameNativeInput.removeEventListener('keydown', this.accountUsernameNativeKeyDownHandler);
      }
      this.accountUsernameNativeInput.remove();
    }
    this.accountUsernameNativeInput = null;
    this.accountUsernameNativeInputHandler = null;
    this.accountUsernameNativeKeyDownHandler = null;
  }

  // Desktop keyboard fallback, mirroring handleLegacyAuthFieldInput --
  // the native shadow input above is the primary mechanism (real mobile
  // keyboards/autofill), this covers keydown events reaching the canvas
  // directly.
  private handleAccountUsernameFieldInput(event: KeyboardEvent): boolean {
    if (this.overlay !== 'auth' || !this.accountUsernameActive) {
      return false;
    }

    if (event.key === 'Enter' || event.key === 'Escape') {
      this.accountUsernameActive = false;
      this.uiDirty = true;
      return true;
    }

    if (event.key === 'Backspace') {
      this.handleAccountUsernameChange(this.accountUsernameDraft.slice(0, -1));
      return true;
    }

    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }

    if (this.accountUsernameDraft.length >= 15) {
      return true;
    }

    this.handleAccountUsernameChange(`${this.accountUsernameDraft}${event.key}`);
    return true;
  }

  private createAuthFooterLink(
    x: number,
    y: number,
    text: string,
    onClick: () => void,
    color = '#72e0bf'
  ): void {
    const fontSize = this.layout.width < LEGACY_UI_COMPACT_BREAKPOINT ? 13 : 14;
    const label = this.padLegacyCompactUiText(this.add.text(x, y, text, {
      fontFamily: LEGACY_AUTH_UI_FONT_FAMILY,
      fontSize: `${fontSize}px`,
      color
    })).setOrigin(0.5).setAlpha(0.82);
    this.uiTexts.push(label);

    const hitWidth = label.displayWidth + 24;
    const hitHeight = label.displayHeight + 16;
    const background = this.add.rectangle(x, y, hitWidth, hitHeight, 0x000000, 0.001);
    background.setInteractive({ useHandCursor: true });
    const setActive = (active: boolean): void => {
      label.setAlpha(active ? 1 : 0.82);
    };
    background.on('pointerover', () => setActive(true));
    background.on('pointerout', () => setActive(false));
    background.on('pointerdown', onClick);

    this.uiButtons.push({
      background,
      bounds: createVisualRect(x - (hitWidth / 2), y - (hitHeight / 2), hitWidth, hitHeight),
      label,
      setActive,
      text,
      destroy: () => {
        background.destroy();
        label.destroy();
      }
    });
  }

  private resolveLegacyCurrentAuthMessage(): LegacyPlayerMessage | null {
    const feedbackMessage = resolveLegacyAuthFeedbackMessage(
      this.authSnapshot.error,
      this.authSnapshot.info,
      this.authSnapshot.errorCode
    );
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
    const message = resolveLegacyAuthFeedbackMessage(
      this.authSnapshot.error,
      this.authSnapshot.info,
      this.authSnapshot.errorCode
    );
    this.latestAuthFeedbackMessageExpiresAtMs = message
      ? this.time.now + LEGACY_AUTH_BOTTOM_FEEDBACK_DURATION_MS
      : Number.NEGATIVE_INFINITY;
    this.pushLegacyPlayerMessage(message);
  }

  private clearLegacyAuthFeedbackMessage(): void {
    this.authSnapshot = {
      ...this.authSnapshot,
      error: null,
      errorCode: null,
      info: null
    };
    this.latestAuthFeedbackMessageExpiresAtMs = Number.NEGATIVE_INFINITY;
    this.latestAuthMessage = this.resolveLegacyCurrentAuthMessage();
    this.clearQueuedLegacyPlayerMessagesBySource('auth');
  }

  /**
   * Draws the queued player messages as a fading toast stack (MAZER-UI-018).
   * Rows come from the pure resolver; positions are rounded to whole pixels.
   */
  private drawLegacyPlayerMessageToast(time: number): void {
    const width = this.layout?.width ?? this.scale.width;
    const frame = resolveLegacyPlayerMessageToastFrame(this.playerMessageQueue, time, width);
    const graphics = this.playerMessageToastGraphics;
    graphics.clear();
    if (frame.rows.length === 0) {
      graphics.setVisible(false);
      for (const text of this.playerMessageToastTexts) {
        text.setVisible(false);
      }
      return;
    }

    graphics.setVisible(true);
    const safeArea = readMazerViewportGeometry().safeArea;
    const padX = 14;
    const padY = 8;
    let y = Math.round(safeArea.top + 156);
    this.playerMessageToastTexts.forEach((text, index) => {
      const row = frame.rows[index];
      if (!row) {
        text.setVisible(false);
        return;
      }

      text.setWordWrapWidth(frame.maxWidth - (padX * 2));
      text.setText(row.copy);
      text.setColor(row.color);
      const boxWidth = Math.round(Math.min(frame.maxWidth, text.width + (padX * 2)));
      const boxHeight = Math.round(text.height + (padY * 2));
      const left = Math.round((width - boxWidth) / 2);
      const color = Phaser.Display.Color.HexStringToColor(row.color).color;
      graphics.fillStyle(0x070b14, 0.92 * row.alpha);
      graphics.fillRoundedRect(left, y, boxWidth, boxHeight, 10);
      graphics.lineStyle(2, color, 0.9 * row.alpha);
      graphics.strokeRoundedRect(left, y, boxWidth, boxHeight, 10);
      text.setPosition(Math.round(left + (boxWidth / 2)), y + padY).setAlpha(row.alpha).setVisible(true);
      y += boxHeight + 8;
    });
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

  private createLegacyAuthActionButton(
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    onClick: () => void,
    tone: 'primary' | 'secondary' | 'danger' | 'danger-outline',
    fontSizeOverride?: number,
    options: { disabled?: boolean } = {}
  ): UiButton {
    const chrome = this.add.graphics();
    const explicitlyDisabled = options.disabled === true;
    const unifiedAuthDockButton = this.overlay === 'auth' && (tone === 'primary' || tone === 'danger');
    const unifiedAuthPrimary = unifiedAuthDockButton && tone === 'primary';
    const unifiedAuthDanger = unifiedAuthDockButton && tone === 'danger';
    // Keep the primary auth action available so an attempted empty/invalid
    // submit can reveal the field-level red outline contract. The only hard
    // disabled state is an in-flight provider request, which prevents double
    // submission without hiding validation feedback behind an inert control.
    const unifiedAuthDisabled = unifiedAuthPrimary && this.authSubmitting;
    const colors = unifiedAuthDockButton
      ? unifiedAuthDanger
        ? { fill: 0xfff4f6, stroke: cyberArcadeMaterial.signal.goal, text: '#29030d' }
        : { fill: 0xf4f4f5, stroke: LEGACY_PLAY_TOUCH_ACCENT, text: '#050505' }
      : tone === 'primary'
      ? { fill: 0x063a28, stroke: LEGACY_PLAY_TOUCH_ACCENT, text: '#ecfff5' }
      : tone === 'danger'
        ? { fill: 0x260f1a, stroke: cyberArcadeMaterial.signal.goal, text: '#ffdce6' }
        : tone === 'danger-outline'
          // Outline-only danger: the dark field with a red edge, no maroon fill,
          // so it reads as a lesser alarm than the filled Sign out button.
          ? { fill: 0x07131d, stroke: cyberArcadeMaterial.signal.goal, text: '#ffdce6' }
          : { fill: 0x07131d, stroke: LEGACY_PLAY_TOUCH_BUTTON_STROKE, text: '#d7f7ee' };
    const draw = (active: boolean): void => {
      chrome.clear();
      if (unifiedAuthDockButton) {
        const surfaceAlpha = unifiedAuthDisabled ? 0.68 : (active ? 0.94 : 1);
        const left = x - (width / 2);
        const top = y - (height / 2);
        const radius = height / 2;
        const accentColor = unifiedAuthDanger ? cyberArcadeMaterial.signal.goal : LEGACY_PLAY_TOUCH_ACCENT;
        chrome.fillStyle(accentColor, (active ? 0.08 : 0.035) * surfaceAlpha);
        chrome.fillRoundedRect(left - 2, top + 7, width + 4, height + 4, radius + 2);
        chrome.fillStyle(accentColor, (active ? 0.12 : 0.065) * surfaceAlpha);
        chrome.fillRoundedRect(left, top + 4, width, height + 1, radius);
        const gradientStart = unifiedAuthDanger
          ? { blue: 0xf6, green: 0xf4, red: 0xff }
          : { blue: 0xf4, green: 0xf4, red: 0xe5 };
        const gradientEnd = unifiedAuthDanger
          ? { blue: 0xc3, green: 0xb4, red: 0xff }
          // Pale cyan, matching the account host's dock (#e5f4f4 -> ~#97f1eb).
          : { blue: 0xe4, green: 0xef, red: 0x59 };
        for (let bandTop = 0; bandTop < height; bandTop += 1) {
          const bandCenterY = bandTop + 0.5;
          const gradientProgress = Math.min(1, (bandCenterY / height) / 1.8);
          const mixChannel = (start: number, end: number): number => Math.round(start + ((end - start) * gradientProgress));
          const bandColor = (
            (mixChannel(gradientStart.red, gradientEnd.red) << 16)
            | (mixChannel(gradientStart.green, gradientEnd.green) << 8)
            | mixChannel(gradientStart.blue, gradientEnd.blue)
          );
          const circleY = bandCenterY - radius;
          const edgeInset = radius - Math.sqrt(Math.max(0, (radius * radius) - (circleY * circleY)));
          chrome.fillStyle(bandColor, surfaceAlpha);
          chrome.fillRect(left + edgeInset, top + bandTop, width - (edgeInset * 2), 1.25);
        }
        chrome.lineStyle(1, accentColor, 0.32 * surfaceAlpha);
        chrome.strokeRoundedRect(left, top, width, height, radius);
        chrome.lineStyle(1, 0xffffff, 0.82 * surfaceAlpha);
        chrome.beginPath();
        chrome.moveTo(left + radius, top + 1);
        chrome.lineTo(left + width - radius, top + 1);
        chrome.strokePath();
        return;
      }
      this.drawLegacyCyberPanel(chrome, {
        active: !explicitlyDisabled && (active || tone === 'primary'),
        alpha: explicitlyDisabled ? 0.42 : 1,
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
    const inert = unifiedAuthDisabled || explicitlyDisabled;
    if (!inert) {
      background.setInteractive({ useHandCursor: true });
    }
    const fontSize = fontSizeOverride ?? (unifiedAuthDockButton ? 19 : Math.max(15, Math.min(22, Math.round(height * 0.4))));
    const label = this.fitLegacyUiTextToWidth(this.padLegacyCompactUiText(this.add.text(
      x,
      resolveLegacyUiLabelCenterY(y, fontSize, 'button'),
      text,
      {
        color: colors.text,
        fontFamily: unifiedAuthDockButton ? LEGACY_AUTH_UI_FONT_FAMILY : LEGACY_UI_FONT_FAMILY,
        fontSize: `${fontSize}px`,
        fontStyle: unifiedAuthDockButton ? '600' : 'normal',
        letterSpacing: unifiedAuthDockButton ? fontSize * 0.01 : 0
      }
    )), width - 32, fontSize, 12).setOrigin(0.5).setAlpha(explicitlyDisabled ? 0.45 : (unifiedAuthDisabled ? 0.68 : 0.96));
    this.uiTexts.push(label);

    const setActive = (active: boolean): void => {
      if (inert) {
        return;
      }
      draw(active);
      label.setAlpha(active ? 1 : 0.96);
    };
    if (!inert) {
      background.on('pointerover', () => setActive(true));
      background.on('pointerout', () => setActive(false));
      background.on('pointerdown', onClick);
    }

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

  // Fitness's bottom action bar: one or two pill buttons pinned to the very
  // bottom edge of the surface, a smaller "secondary" action on the left
  // and a larger "primary" action on the right (a single action just fills
  // the full width). Reuses createLegacyAuthActionButton for the actual
  // pill chrome -- this only owns the shared bottom-anchored split layout.
  private createLegacyBottomActionBar(
    panel: OverlayPanelFrame,
    stacked: boolean,
    primary: { onClick: () => void; text: string; tone: 'danger' | 'primary' | 'secondary' },
    secondary: { onClick: () => void; text: string; tone: 'danger' | 'primary' | 'secondary' } | null = null
  ): void {
    const panelBottom = panel.top + panel.height;
    const barHeight = this.overlay === 'auth' ? 56 : (stacked ? 48 : 52);
    const barY = panelBottom - (this.overlay === 'auth' ? 16 : (stacked ? 20 : 24)) - (barHeight / 2);
    const sideMargin = this.overlay === 'auth' ? 16 : (stacked ? 20 : 28);
    const barLeft = panel.left + sideMargin;
    const barWidth = panel.width - (sideMargin * 2);

    if (secondary === null) {
      this.uiButtons.push(this.createLegacyAuthActionButton(
        barLeft + (barWidth / 2),
        barY,
        barWidth,
        barHeight,
        primary.text,
        primary.onClick,
        primary.tone
      ));
      return;
    }

    const gap = 10;
    const secondaryWidth = Math.round(barWidth * 0.34);
    const primaryWidth = barWidth - secondaryWidth - gap;
    const secondaryX = barLeft + (secondaryWidth / 2);
    const primaryX = barLeft + secondaryWidth + gap + (primaryWidth / 2);

    // Both buttons share one font size, not each fit independently to its
    // own width -- the secondary slot is much narrower than the primary
    // one, so independently-fit text (e.g. "Account" squeezed into the
    // narrow slot next to "Menu" sitting comfortably at full size in the
    // wide one) reads as visibly inconsistent even though both start from
    // the same height-based base size. Measured against each button's own
    // width via a throwaway text object, then the smaller (more
    // constrained) of the two wins for both.
    const baseFontSize = Math.max(15, Math.min(22, Math.round(barHeight * 0.4)));
    const measureFitFontSize = (text: string, availableWidth: number): number => {
      const probe = this.add.text(0, 0, text, {
        fontFamily: LEGACY_UI_FONT_FAMILY,
        fontSize: `${baseFontSize}px`
      });
      this.fitLegacyUiTextToWidth(probe, availableWidth - 32, baseFontSize, 12);
      const fitSize = String(probe.style.fontSize);
      probe.destroy();
      return Number.parseInt(fitSize, 10) || baseFontSize;
    };
    const sharedFontSize = Math.min(
      measureFitFontSize(secondary.text, secondaryWidth),
      measureFitFontSize(primary.text, primaryWidth)
    );

    this.uiButtons.push(
      this.createLegacyAuthActionButton(secondaryX, barY, secondaryWidth, barHeight, secondary.text, secondary.onClick, secondary.tone, sharedFontSize),
      this.createLegacyAuthActionButton(primaryX, barY, primaryWidth, barHeight, primary.text, primary.onClick, primary.tone, sharedFontSize)
    );
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
      : fieldId === 'confirmPassword'
        ? 'CONFIRM PASSWORD'
        : fieldId === 'password'
        ? 'PASSWORD'
        : fieldId === 'username'
          ? 'USERNAME'
          : 'EMAIL';
    const hasPasswordToggle = fieldId === 'password' || fieldId === 'confirmPassword';
    const contentLeft = x - (width / 2) + 18;
    const contentRightInset = hasPasswordToggle ? 54 : 16;
    const valueWidth = width - 18 - contentRightInset;
    const background = this.add.rectangle(x, y, width, height, 0x000000, 0.001);
    background.setInteractive({ useHandCursor: true });
    background.on('pointerdown', () => this.selectLegacyAuthField(fieldId, { height, width, x, y }));
    if (isActive) {
      this.positionLegacyAuthNativeInput(fieldId, { height, width, x, y });
    }

    const isInvalid = this.authInvalidFields.has(fieldId);
    const borderColor = isInvalid
      ? 0xff7d7d
      : isActive ? LEGACY_PLAY_TOUCH_ACCENT : LEGACY_PLAY_TOUCH_BUTTON_STROKE;
    const borderAlpha = isInvalid ? 1 : isActive ? 0.95 : 0.68;
    const border = this.add.graphics();
    const left = x - (width / 2);
    const right = x + (width / 2);
    const top = y - (height / 2);
    const bottom = y + (height / 2);
    const radius = Math.min(18, height * 0.36);
    const labelWidth = Math.max(58, (fieldLabel.length * 7) + 18);
    const labelRight = right - radius - 8;
    const gapStart = labelRight - labelWidth - 7;
    const gapEnd = labelRight + 7;
    border.lineStyle(1, borderColor, borderAlpha);
    border.beginPath();
    border.moveTo(left + radius, top);
    border.lineTo(gapStart, top);
    border.moveTo(gapEnd, top);
    border.lineTo(right - radius, top);
    border.arc(right - radius, top + radius, radius, -Math.PI / 2, 0);
    border.lineTo(right, bottom - radius);
    border.arc(right - radius, bottom - radius, radius, 0, Math.PI / 2);
    border.lineTo(left + radius, bottom);
    border.arc(left + radius, bottom - radius, radius, Math.PI / 2, Math.PI);
    border.lineTo(left, top + radius);
    border.arc(left + radius, top + radius, radius, Math.PI, (Math.PI * 3) / 2);
    border.strokePath();

    const eyebrow = this.padLegacyCompactUiText(this.add.text(labelRight - (labelWidth / 2), top, fieldLabel, {
      fontFamily: LEGACY_AUTH_UI_FONT_FAMILY,
      fontSize: '11px',
      color: isInvalid ? '#ff7d7d' : isActive ? '#72e0bf' : '#9bcdbd'
    })).setOrigin(0.5);
    this.uiTexts.push(eyebrow);
    const valueFontSize = 14;
    const label = this.fitLegacyUiTextToWidth(this.padLegacyUiText(this.add.text(contentLeft, y + (height * 0.14), value, {
      fontFamily: LEGACY_AUTH_UI_FONT_FAMILY,
      fontSize: `${valueFontSize}px`,
      color: placeholder ? '#7894a0' : (isActive ? '#72e0bf' : '#ecfff5')
    })), valueWidth, valueFontSize, valueFontSize).setOrigin(0, 0.5);
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
        border.destroy();
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
      const iconViewportSize = 20;
      const iconScale = iconViewportSize / 24;
      icon.lineStyle(2.15 * iconScale, LEGACY_PLAY_TOUCH_ACCENT, active ? 1 : 0.82);
      const point = (px: number, py: number) => new Phaser.Math.Vector2(
        x + ((px - 12) * iconScale),
        y + ((py - 12) * iconScale)
      );
      const eyeSegments = [
        new Phaser.Curves.CubicBezier(point(2, 12), point(4.5, 8), point(7.8, 6), point(12, 6)),
        new Phaser.Curves.CubicBezier(point(12, 6), point(16.2, 6), point(19.5, 8), point(22, 12)),
        new Phaser.Curves.CubicBezier(point(22, 12), point(19.5, 16), point(16.2, 18), point(12, 18)),
        new Phaser.Curves.CubicBezier(point(12, 18), point(7.8, 18), point(4.5, 16), point(2, 12))
      ];
      const eyePoints = eyeSegments.flatMap((segment, index) => segment.getPoints(8).slice(index === 0 ? 0 : 1));
      icon.strokePoints(eyePoints, true, true);
      icon.strokeCircle(x, y, 3 * iconScale);
      if (!this.authPasswordVisible) {
        icon.lineBetween(x - (8 * iconScale), y - (8 * iconScale), x + (8 * iconScale), y + (8 * iconScale));
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
    const isPasswordField = fieldId === 'password' || fieldId === 'confirmPassword';
    input.type = isPasswordField ? 'password' : fieldId === 'email' ? 'email' : 'text';
    input.autocomplete = isPasswordField
      ? (this.isLegacyPasswordRecoveryActive() ? 'new-password' : 'current-password')
      : fieldId === 'email' ? 'email' : fieldId === 'username' ? 'username' : 'name';
    input.inputMode = fieldId === 'email' ? 'email' : 'text';
    input.enterKeyHint = fieldId === 'password' && this.isLegacyPasswordRecoveryActive() ? 'next' : isPasswordField ? 'done' : 'next';
    input.autocapitalize = fieldId === 'displayName' ? 'words' : 'none';
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
      this.authInvalidFields = new Set(
        [...this.authInvalidFields].filter((invalidField) => invalidField !== fieldId)
      );
      this.authSnapshot = {
        ...this.authSnapshot,
        error: null,
        info: null
      };
      this.latestAuthFeedbackMessageExpiresAtMs = Number.NEGATIVE_INFINITY;
      this.passwordRecoveryFeedback = null;
      this.clearQueuedLegacyPlayerMessagesBySource('auth');
      if (fieldId === 'username') {
        this.scheduleAuthUsernameEvaluation();
      }
      this.uiDirty = true;
    };
    this.authNativeKeyDownHandler = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        if (this.isLegacyPasswordRecoveryActive()) {
          const recoveryEnterAction = resolveLegacyPasswordRecoveryEnterAction(
            fieldId,
            this.passwordRecoveryUrlState.requested
          );
          if (recoveryEnterAction === 'focus-confirmation') {
            this.selectLegacyAuthField('confirmPassword');
          } else if (recoveryEnterAction === 'submit') {
            void this.handleLegacyPasswordRecoveryPrimaryAction();
          }
        } else {
          void this.handleLegacyAuthSubmit();
        }
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
      invalidFields: [...this.authInvalidFields],
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

    input.type = fieldId === 'password' || fieldId === 'confirmPassword'
      ? (this.authPasswordVisible ? 'text' : 'password')
      : fieldId === 'email' ? 'email' : 'text';
    input.value = this.authForm[fieldId];
    const rect = canvas.getBoundingClientRect();
    const cssRect = resolveLegacyAuthInputCssRect(bounds, rect, this.layout);
    input.style.left = `${cssRect.left}px`;
    input.style.top = `${cssRect.top}px`;
    // Keep the canvas eye control outside the native input hit target so the
    // password visibility affordance remains tappable on mobile browsers.
    const passwordToggleReserve = fieldId === 'password' || fieldId === 'confirmPassword'
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
    const fields: LegacyAuthFieldId[] = this.isLegacyPasswordRecoveryActive()
      ? ['password', 'confirmPassword']
      : this.authForm.mode === 'signup'
        ? ['username', 'email', 'password']
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
      password: 72,
      confirmPassword: 72,
      username: 15
    };
    const nextValue = update(this.authForm[fieldId]).slice(0, maxLengthByField[fieldId]);
    this.authForm = {
      ...this.authForm,
      [fieldId]: nextValue
    };
    this.authInvalidFields = new Set(
      [...this.authInvalidFields].filter((invalidField) => invalidField !== fieldId)
    );
    if (this.authNativeInput && this.authNativeInputField === fieldId && this.authNativeInput.value !== nextValue) {
      this.authNativeInput.value = nextValue;
    }
    this.authSnapshot = {
      ...this.authSnapshot,
      error: null,
      info: null
    };
    this.latestAuthFeedbackMessageExpiresAtMs = Number.NEGATIVE_INFINITY;
    this.passwordRecoveryFeedback = null;
    this.clearQueuedLegacyPlayerMessagesBySource('auth');
    if (fieldId === 'username') {
      this.scheduleAuthUsernameEvaluation();
    }
    this.uiDirty = true;
  }

  private scheduleAuthUsernameEvaluation(): void {
    if (this.authUsernameDebounceTimer !== null) {
      clearTimeout(this.authUsernameDebounceTimer);
      this.authUsernameDebounceTimer = null;
    }
    this.authUsernameSequence += 1;
    const sequence = this.authUsernameSequence;

    const candidate = this.authForm.username.trim();
    if (candidate.length === 0) {
      this.authUsernameStatus = 'idle';
      this.uiDirty = true;
      return;
    }

    if (!LEGACY_USERNAME_PATTERN.test(candidate)) {
      this.authUsernameStatus = 'error';
      this.uiDirty = true;
      return;
    }

    this.authUsernameStatus = 'checking';
    this.uiDirty = true;

    this.authUsernameDebounceTimer = setTimeout(() => {
      this.authUsernameDebounceTimer = null;
      void this.evaluateAuthUsername(candidate, sequence);
    }, 700);
  }

  private async evaluateAuthUsername(candidate: string, sequence: number): Promise<void> {
    const availability = await checkLegacyUsernameAvailable(candidate);
    if (sequence !== this.authUsernameSequence) {
      return;
    }

    if (availability.error) {
      this.authUsernameStatus = 'error';
      this.uiDirty = true;
      return;
    }

    this.authUsernameStatus = availability.available === false ? 'taken' : 'available';
    this.uiDirty = true;
  }

  private resetAuthUsernameEvaluation(): void {
    if (this.authUsernameDebounceTimer !== null) {
      clearTimeout(this.authUsernameDebounceTimer);
      this.authUsernameDebounceTimer = null;
    }
    this.authUsernameSequence += 1;
    this.authUsernameStatus = 'idle';
  }

  private maskLegacyAuthPassword(fieldId: 'confirmPassword' | 'password' = 'password'): string {
    const password = this.authForm[fieldId];
    if (password.length === 0) {
      return 'Enter password';
    }

    return this.authPasswordVisible
      ? password
      : '*'.repeat(Math.min(24, password.length));
  }

  private toggleLegacyAuthPasswordVisibility(): void {
    this.authPasswordVisible = !this.authPasswordVisible;
    if (
      this.authNativeInput
      && (this.authNativeInputField === 'password' || this.authNativeInputField === 'confirmPassword')
    ) {
      this.authNativeInput.type = this.authPasswordVisible ? 'text' : 'password';
    }
    this.uiDirty = true;
  }

  private async handleLegacyPasswordRecoveryPrimaryAction(): Promise<void> {
    if (this.passwordRecoveryState.phase === 'success') {
      this.passwordRecoveryState = createLegacyPasswordRecoveryState();
      this.passwordRecoveryFeedback = null;
      clearLegacyPasswordRecoveryUrl('continue');
      this.closeLegacyAuthOverlayToMainMenu();
      return;
    }

    if (this.passwordRecoveryState.phase === 'error') {
      this.passwordRecoveryState = createLegacyPasswordRecoveryState();
      this.passwordRecoveryFeedback = null;
      this.authForm = {
        ...this.authForm,
        confirmPassword: '',
        mode: 'login',
        password: ''
      };
      this.authInvalidFields = new Set();
      this.activeAuthField = this.authForm.email.length > 0 ? 'password' : 'email';
      this.destroyLegacyAuthNativeInput();
      clearLegacyPasswordRecoveryUrl('continue');
      this.uiDirty = true;
      return;
    }

    if (this.passwordRecoveryState.phase !== 'ready' || this.authSubmitting) {
      return;
    }

    this.syncLegacyAuthNativeInputValue();
    const submitState = resolveLegacyPasswordUpdateSubmitState(
      this.authForm.password,
      this.authForm.confirmPassword,
      this.authSnapshot.configured
    );
    this.authInvalidFields = new Set(submitState.invalidFields);
    if (!submitState.canSubmit) {
      this.passwordRecoveryFeedback = submitState.reason;
      this.activeAuthField = submitState.invalidFields[0] ?? 'password';
      this.uiDirty = true;
      return;
    }

    this.authSubmitting = true;
    this.passwordRecoveryFeedback = null;
    this.passwordRecoveryState = { error: null, phase: 'submitting' };
    this.uiDirty = true;

    let result: Awaited<ReturnType<typeof updateLegacyPassword>>;
    try {
      result = await updateLegacyPassword(this.authForm.password);
    } catch (error) {
      result = {
        error: error instanceof Error ? error.message : String(error),
        ok: false
      };
    }

    this.authSubmitting = false;
    if (result.ok) {
      this.authForm = {
        ...this.authForm,
        confirmPassword: '',
        password: ''
      };
      this.authInvalidFields = new Set();
      this.activeAuthField = null;
      this.destroyLegacyAuthNativeInput();
      this.passwordRecoveryState = { error: null, phase: 'success' };
      clearLegacyPasswordRecoveryUrl('continue');
      this.uiDirty = true;
      return;
    }

    const feedback = resolveLegacyPasswordRecoveryError(result.error);
    this.passwordRecoveryFeedback = feedback.copy;
    this.passwordRecoveryState = feedback.requiresNewLink
      ? { error: feedback.copy, phase: 'error' }
      : { error: null, phase: 'ready' };
    if (feedback.requiresNewLink) {
      this.authInvalidFields = new Set();
      this.activeAuthField = null;
      this.destroyLegacyAuthNativeInput();
      clearLegacyPasswordRecoveryUrl('invalid');
    }
    this.uiDirty = true;
  }

  private async handleLegacyAuthSubmit(): Promise<void> {
    if (this.authSubmitting) {
      return;
    }

    // Choosing the account form ends any temporary guest admission before
    // validation or a provider call begins. Otherwise a guest grant from an
    // earlier play session can survive a failed/unavailable sign-in and leave
    // the game looking as though the submitted credentials entered guest
    // mode. Account submission must either establish an authenticated session
    // or keep the auth gate closed.
    this.revokeLegacyGuestPlayGrant();
    this.syncLegacyAuthNativeInputValue();
    this.recordLegacyAuthActionDiagnostics({ stage: 'started' });
    this.authInvalidFields = new Set(resolveLegacyAuthInvalidFields(this.authForm));
    const submitState = resolveLegacyAuthSubmitState(this.authForm, this.authSnapshot.configured);
    if (!submitState.canSubmit) {
      this.recordLegacyAuthActionDiagnostics({
        canSubmit: false,
        reason: submitState.reason,
        stage: 'blocked'
      });
      if (this.authInvalidFields.size === 0) {
        this.authSnapshot = {
          ...this.authSnapshot,
          error: submitState.reason,
          info: null
        };
        this.armLegacyAuthFeedbackMessage();
      } else {
        this.authSnapshot = {
          ...this.authSnapshot,
          error: null,
          info: null
        };
        this.latestAuthFeedbackMessageExpiresAtMs = Number.NEGATIVE_INFINITY;
        this.clearQueuedLegacyPlayerMessagesBySource('auth');
      }
      this.uiDirty = true;
      return;
    }

    this.authInvalidFields = new Set();
    this.authSubmitting = true;
    this.uiDirty = true;
    this.recordLegacyAuthActionDiagnostics({
      canSubmit: true,
      stage: 'submitting'
    });
    writeLegacyRememberedIdentity(this.resolveBrowserLocalStorage(), this.authForm.email);

    const attemptId = ++this.authSubmitAttemptId;
    const authCall = this.authForm.mode === 'signup'
      ? signUpLegacyAuth(this.authForm.email, this.authForm.password, this.authForm.username)
      : signInLegacyAuth(this.authForm.email, this.authForm.password);

    // Whatever authCall eventually does, apply it once it settles -- the
    // attemptId guard inside makes this a no-op if a newer submit already
    // started (or a real response already landed) by the time it resolves.
    void authCall.then(
      (result) => this.applyLegacyAuthSubmitResult(attemptId, result, null),
      (error) => this.applyLegacyAuthSubmitResult(attemptId, null, error)
    );

    const timedOut = await Promise.race<boolean>([
      authCall.then(() => false, () => false),
      new Promise<boolean>((resolve) => {
        this.time.delayedCall(LEGACY_AUTH_SUBMIT_TIMEOUT_MS, () => resolve(true));
      })
    ]);

    if (timedOut && attemptId === this.authSubmitAttemptId && this.authSubmitting) {
      this.recordLegacyAuthActionDiagnostics({
        error: 'submit-timeout',
        stage: 'exception',
        status: this.authSnapshot.status
      });
      this.authSubmitting = false;
      this.authSnapshot = {
        ...this.authSnapshot,
        error: 'Request timed out.',
        info: null
      };
      this.armLegacyAuthFeedbackMessage();
      this.uiDirty = true;
    }
  }

  private handleLegacyGuestPlay(): void {
    // An authenticated player already has an account-scoped progression lane;
    // this control only exits a sign-in form for the local guest scope. It
    // never signs a player out or changes provider/session state.
    if (
      this.authSubmitting
      || this.authGateAwaitingResolution
      || this.authSnapshot.status === 'authenticated'
      || !LEGACY_GUEST_PLAY_ACCESS_ENABLED
    ) {
      return;
    }

    this.pendingBootPlayStart = false;
    this.guestPlayGranted = true;
    this.authGateLocked = false;
    this.pendingAuthGateTransition = false;
    this.activeAuthField = null;
    this.destroyLegacyAuthNativeInput();
    this.destroyAccountUsernameNativeInput();
    this.accountUsernameActive = false;
    this.startPlayMode();
    this.rebuildUi();
    this.publishVisualDiagnostics(this.time.now, true);
    this.publishRuntimeDiagnostics(this.time.now, true);
  }

  private revokeLegacyGuestPlayGrant(): void {
    if (!this.guestPlayGranted) {
      return;
    }

    this.guestPlayGranted = false;
    this.pendingBootPlayStart = false;
    this.authGateLocked = this.authSnapshot.status !== 'authenticated';
  }

  private applyLegacyAuthSubmitResult(
    attemptId: number,
    result: Awaited<ReturnType<typeof signInLegacyAuth | typeof signUpLegacyAuth>> | null,
    error: unknown
  ): void {
    if (attemptId !== this.authSubmitAttemptId) {
      return;
    }

    this.authSubmitting = false;
    this.authInvalidFields = new Set();

    if (result === null) {
      const message = error instanceof Error ? error.message : String(error);
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
    // A confirmed-available username typed during signup only ever gets
    // this far as a checked candidate, never auto-saved (there was no
    // account to save it to until this exact result came back) -- now
    // that one exists, save it. Anything else (empty, unchecked, taken,
    // invalid) is silently skipped; it can still be set later from the
    // account screen.
    if (
      this.authForm.mode === 'signup'
      && result.snapshot.status === 'authenticated'
      && result.snapshot.userId
      && this.authUsernameStatus === 'available'
    ) {
      const usernameToSave = this.authForm.username.trim();
      void saveLegacyAccountUsername(result.snapshot.userId, usernameToSave).then((saveResult) => {
        if (saveResult.ok) {
          this.accountUsernameDraft = usernameToSave;
          this.accountUsernameSavedValue = usernameToSave;
          this.accountUsernameLoadedForUserId = result.snapshot.userId;
          this.uiDirty = true;
        } else {
          this.reportAccountUsernameSaveFailure(saveResult.failure ?? 'failed', saveResult.error);
        }
      });
    }
    this.resetAuthUsernameEvaluation();
    this.applyLegacyAuthSnapshot(result.snapshot);
    if (shouldReturnToMainMenuAfterLogin) {
      this.closeLegacyAuthOverlayToMainMenu();
    }
    this.uiDirty = true;
  }

  private async handleLegacyAuthSignOut(): Promise<void> {
    if (this.authSubmitting) {
      return;
    }

    this.syncLegacyAuthNativeInputValue();
    this.authSubmitting = true;
    this.uiDirty = true;
    const result = await signOutLegacyAuth(this.authSnapshot);
    this.authSubmitting = false;
    this.authForm = createEmptyLegacyAuthFormState(
      'login',
      readLegacyRememberedIdentity(this.resolveBrowserLocalStorage())
    );
    this.authInvalidFields = new Set();
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
    this.uiDirty = true;
  }

  private commitAllOverlayFields(): void {
    const previousScale = this.settings.scale;
    const fieldIds: LegacyOptionFieldId[] = this.overlay === 'pause'
      ? []
      : ['scale', 'pathR', 'pathG', 'pathB', 'wallR', 'wallG', 'wallB'];

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

  private createAuthWordmark(y: number): void {
    const label = this.padLegacyCompactUiText(this.add.text(this.layout.width / 2, y, 'MAZER', {
      fontFamily: LEGACY_AUTH_UI_FONT_FAMILY,
      fontSize: '14px',
      color: '#3ddbd4',
      letterSpacing: 4
    })).setOrigin(0.5).setAlpha(1).setDepth(3);
    this.uiTexts.push(label);
  }

  private createOverlayTitle(text: string, y: number): void {
    const fontSize = this.overlay === 'auth' ? 48 : (this.layout.width < LEGACY_UI_COMPACT_BREAKPOINT ? 24 : (this.layout.width < 480 ? 28 : 34));
    const label = this.padLegacyUiText(this.add.text(
      this.layout.width / 2,
      resolveLegacyUiLabelCenterY(y, fontSize, 'overlay-title'),
      text,
      {
      fontFamily: this.overlay === 'auth' ? LEGACY_AUTH_UI_FONT_FAMILY : LEGACY_UI_FONT_FAMILY,
      fontSize: `${fontSize}px`,
      color: this.overlay === 'auth' ? '#f5f5f7' : '#6bc96f'
    })).setOrigin(0.5).setDepth(3);
    this.uiTexts.push(label);
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
    // Real-device input showed the old target registering below the visible
    // arrow, so this keeps a wider, lower-weighted envelope than the glyph
    // itself -- but hitPadBottom was cut from 24 to 8: at 24 this control's
    // own hit rect reached far enough down to overlap the Guide dropdown
    // header's hit rect on several overlays (Options/Pause both stack the
    // Guide card immediately below this button), so a tap aimed at the top
    // of the Guide bar could land on Back instead and exit the overlay --
    // reported twice. A smaller bottom pad still comfortably beats the bare
    // glyph while clearing that overlap.
    const hitPadTop = 12;
    const hitPadBottom = 8;
    const hitPadSides = 14;
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
    this.overlayBackChevronAction = onClick;
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
      safeArea: this.layout.headerSafeInset,
      sizeScale: this.layout.headerIconScale,
      width: this.layout.width
    });
    // Visual glyph stays 32-40px; the interactive zone is grown to the 44px
    // touch-target floor (see legacyHitTarget.ts).
    const hit = resolveLegacyMinHitRect(pauseRect, this.layout);
    const hitBounds = createVisualRect(hit.left, hit.top, hit.width, hit.height);
    this.menuSettingsCogActive = false;

    const background = this.add.rectangle(
      hit.centerX,
      hit.centerY,
      hit.width,
      hit.height,
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
      bounds: hitBounds,
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

  private createLegacyMenuLeaderboardButton(onClick: () => void): UiButton {
    const laneTop = this.layout.lanes.hud?.top ?? 0;
    const rect = resolveLegacyHeaderControlFrame({
      height: this.layout.height,
      hudHeight: this.layout.lanes.hud?.height ?? 64,
      hudTop: laneTop,
      placement: 'trailing',
      safeArea: this.layout.headerSafeInset,
      sizeScale: this.layout.headerIconScale,
      slot: 1,
      width: this.layout.width
    });
    const hit = resolveLegacyMinHitRect(rect, this.layout);
    const hitBounds = createVisualRect(hit.left, hit.top, hit.width, hit.height);
    this.menuLeaderboardActive = false;

    const background = this.add.rectangle(hit.centerX, hit.centerY, hit.width, hit.height, 0x000000, 0.001);
    background.setInteractive({ useHandCursor: true });
    background.setDepth(3);
    const label = this.add.text(rect.centerX, rect.centerY, '', {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: '18px'
    }).setOrigin(0.5).setVisible(false);
    const setActive = (active: boolean): void => {
      if (this.menuLeaderboardActive === active) {
        return;
      }
      this.menuLeaderboardActive = active;
      this.boardDynamicDirty = true;
    };
    background.on('pointerover', () => setActive(true));
    background.on('pointerout', () => setActive(false));
    background.on('pointerdown', onClick);

    return {
      background,
      bounds: hitBounds,
      iconOnly: true,
      label,
      semanticAction: 'Leaderboard',
      setActive,
      text: 'Leaderboard',
      destroy: () => {
        background.destroy();
        label.destroy();
      }
    };
  }

  // Main-menu account entry: the old username text is intentionally gone.
  // The control now occupies the same leading header slot, on the same row
  // as the title, but renders only the inner Mazer-green profile glyph. The
  // transparent square remains the complete touch target; no outer visual
  // circle or panel is drawn. Its pulse and hover response use the exact
  // settings-cog envelope so the two header actions feel like one family.
  private createLegacyMenuProfileButton(onClick: () => void): UiButton {
    const graphics = this.add.graphics();
    const iconImage = this.add.image(0, 0, MAZER_HUD_PROFILE_TEXTURE_KEY).setOrigin(0.5, 0.5).setVisible(false);
    const laneTop = this.layout.lanes.hud?.top ?? 0;
    const frame = resolveLegacyHeaderControlFrame({
      height: this.layout.height,
      hudHeight: this.layout.lanes.hud?.height ?? 64,
      hudTop: laneTop,
      placement: 'leading',
      safeArea: this.layout.headerSafeInset,
      sizeScale: this.layout.headerIconScale,
      width: this.layout.width
    });
    const hit = resolveLegacyMinHitRect(frame, this.layout);
    const hitBounds = createVisualRect(hit.left, hit.top, hit.width, hit.height);
    const background = this.add.rectangle(hit.centerX, hit.centerY, hit.width, hit.height, 0x000000, 0.001);
    background.setInteractive({ useHandCursor: true });
    background.setDepth(3);
    this.menuProfileActive = false;

    const setActive = (active: boolean): void => {
      this.menuProfileActive = active;
    };
    background.on('pointerover', () => setActive(true));
    background.on('pointerout', () => setActive(false));
    background.on('pointerdown', onClick);

    const label = this.add.text(frame.centerX, frame.centerY, '', {
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: '1px'
    }).setOrigin(0.5).setVisible(false);
    this.uiTexts.push(label);

    return {
      background,
      bounds: hitBounds,
      iconOnly: true,
      label,
      semanticAction: 'Account',
      setActive,
      text: 'Account',
      updateFrame: (time: number) => {
        if (
          this.mode !== 'menu'
          || this.overlay !== 'none'
          || this.authSnapshot.status === 'unavailable'
        ) {
          graphics.clear();
          background.setVisible(false);
          iconImage.setVisible(false);
          return;
        }
        if (this.authSnapshot.status === 'authenticated') {
          this.loadAccountUsernameIfNeeded();
        }
        background.setVisible(true);
        const phase = (Math.sin((time / LEGACY_MENU_BLINK_PULSE_MS) * Math.PI * 2) + 1) / 2;
        const blinkAlpha = clamp(0.22 + (phase * 0.78) + (this.menuProfileActive ? 0.08 : 0), 0.14, 1);
        const blinkScale = 0.92 + (phase * 0.08) + (this.menuProfileActive ? 0.02 : 0);
        const iconSize = Math.max(18, Math.round(Math.min(frame.width, frame.height) * 0.9));
        this.drawLegacyProfileIcon(
          graphics,
          iconImage,
          frame.centerX,
          frame.centerY,
          iconSize,
          time,
          blinkAlpha,
          blinkScale,
          false
        );
      },
      destroy: () => {
        graphics.destroy();
        iconImage.destroy();
        background.destroy();
        label.destroy();
      }
    };
  }

  // Shared by the overlay and main-menu profile buttons. Overlay callers
  // retain the rainbow ring (still procedural, drawn into `graphics`); the
  // menu caller explicitly suppresses it. The glyph itself is now the real
  // MAZER_HUD_PROFILE_TEXTURE_KEY icon (via applyLegacyHudIconFrame)
  // instead of the hand-drawn head-and-shoulders outline this replaced --
  // `image` is owned by the caller (created/destroyed alongside its own
  // `graphics`), not a shared scene-level field, since both callers are
  // independently creatable/destroyable UI button instances.
  private drawLegacyProfileIcon(
    graphics: Phaser.GameObjects.Graphics,
    image: Phaser.GameObjects.Image,
    centerX: number,
    centerY: number,
    iconSize: number,
    time: number,
    alpha: number,
    scale: number,
    showOuterRing = true
  ): void {
    graphics.clear();
    if (showOuterRing) {
      const ringRadius = (iconSize * 0.62) + 8;
      const ringColor = resolveLegacyIridescentTrailColor(0, 1, time);
      graphics.lineStyle(Math.max(1.2, iconSize * LEGACY_OVERLAY_ICON_RING_WIDTH_RATIO), ringColor, alpha * LEGACY_OVERLAY_ICON_RING_ALPHA_FACTOR);
      graphics.strokeCircle(centerX, centerY, ringRadius * scale);
    }
    this.applyLegacyHudIconFrame(image, MAZER_HUD_PROFILE_ICON_METRICS, centerX, centerY, iconSize * scale, alpha);
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

    for (const graphic of this.uiGraphics) {
      graphic.destroy();
    }
    this.uiGraphics = [];

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

  private async loadLeaderboard(): Promise<void> {
    const sequence = ++this.leaderboardSequence;
    const request = resolveLegacyLeaderboardRequest();
    this.leaderboardStatus = 'loading';
    this.leaderboardErrorMessage = null;
    this.uiDirty = true;

    const [pageResult, selfRankResult] = await Promise.all([
      fetchLegacyLeaderboardPage(request.offset, request.limit, this.authSnapshot),
      fetchLegacyLeaderboardSelfRank(this.authSnapshot)
    ]);
    if (sequence !== this.leaderboardSequence) {
      // A newer request (or the overlay closing and reopening) has already
      // started -- this response is stale, discard it rather than letting it
      // clobber whatever the newer request already resolved.
      return;
    }

    if (pageResult.error) {
      this.leaderboardStatus = 'error';
      this.leaderboardErrorMessage = pageResult.error;
      this.leaderboardEntries = [];
      this.leaderboardSelfRank = null;
      this.uiDirty = true;
      return;
    }

    this.leaderboardEntries = pageResult.entries;
    this.leaderboardSelfRank = selfRankResult.selfRank;
    this.leaderboardStatus = pageResult.entries.length === 0 ? 'empty' : 'ready';
    this.uiDirty = true;
  }

  // Header identity: the verified canonical username, top-left, immediately
  // right of the profile icon (replaces the old greeting + username pair
  // that sat above the Start button). Geometry comes from
  // resolveLegacyHeaderIdentityPlacement: the real profile-icon frame, the
  // real title footprint (not an assumed width), ellipsized to the room
  // between them, shortened/hidden on a tight header (the edge diamonds sit
  // behind it at fixed positions). Signed out / guest / no username -> no label at all.
  // Depth 3 like the other menu controls: above the board, below overlays.
  private createLegacyHeaderIdentityLabel(): void {
    const username = this.authSnapshot.status === 'authenticated'
      ? this.authSnapshot.canonicalUsername?.trim() ?? ''
      : '';
    if (username.length === 0) {
      return;
    }

    // No stroke/halo/plate (audit finding 1); 2 px padding keeps descenders.
    // Text resolution stays at the baseline: n > 1 paints glyphs n times larger
    // under this Canvas renderer (render/textCrispness.ts).
    const label = this.add.text(0, 0, username, {
      color: '#d7f7ee',
      fontFamily: LEGACY_UI_FONT_FAMILY,
      fontSize: '14px',
      padding: { top: LEGACY_HEADER_IDENTITY_LABEL_PADDING_Y_PX, bottom: LEGACY_HEADER_IDENTITY_LABEL_PADDING_Y_PX }
    }).setOrigin(0, 0.5).setDepth(3).setVisible(false);
    const placement = resolveLegacyHeaderIdentityPlacement({
      layout: this.layout,
      measure: (value, fontPx) => label.setFontSize(fontPx).setText(value).width,
      measureHeight: (fontPx) => label.setFontSize(fontPx).setText(username).height,
      username
    });
    if (!placement.visible || placement.anchor === null) {
      label.destroy();
      return;
    }
    label
      .setName(LEGACY_HEADER_IDENTITY_LABEL_NAME)
      .setFontSize(placement.identity.fontPx)
      .setText(placement.identity.displayText)
      .setPosition(placement.anchor.x, placement.anchor.y)
      .setVisible(true);
    this.uiTexts.push(label);
  }

  private createLegacySignedOutOAuthFailure(): void {
    if (
      this.authSnapshot.status === 'authenticated'
      || !isLegacyOAuthFailureCopy(this.authSnapshot.error)
    ) {
      return;
    }

    const compact = this.layout.width < LEGACY_UI_COMPACT_BREAKPOINT;
    const feedback = this.padLegacyCompactUiText(this.add.text(
      this.layout.centerButtonX,
      this.layout.centerButtonY - this.layout.buttonHeight - (compact ? 24 : 28),
      this.authSnapshot.error?.trim() ?? MAZER_OAUTH_SAFE_ERROR_MESSAGE,
      {
        align: 'center',
        color: '#ff9d9d',
        fontFamily: LEGACY_AUTH_UI_FONT_FAMILY,
        fontSize: `${compact ? 10 : 11}px`,
        wordWrap: { width: Math.min(this.layout.width - 48, 320), useAdvancedWrap: true }
      }
    )).setOrigin(0.5);
    this.uiTexts.push(feedback);
  }

  private openSharedAccountSurface(): void {
    if (this.authSnapshot.status === 'authenticated') {
      this.navigateToSharedAccountRoute('account');
      return;
    }
    void this.handleSharedAccountAuthorization();
  }

  private navigateToSharedAccountRoute(route: 'account' | 'reset-password'): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      navigateToMazerAccountPortal(route, window.location);
    } catch {
      this.authSnapshot = {
        ...this.authSnapshot,
        error: MAZER_OAUTH_SAFE_ERROR_MESSAGE,
        info: null
      };
      this.uiDirty = true;
    }
  }

  private async handleSharedAccountAuthorization(): Promise<void> {
    if (this.authSubmitting) {
      return;
    }
    this.authSubmitting = true;
    this.authOpeningStartedAtMs = -1;
    this.authOpeningTimedOut = false;
    this.authSnapshot = { ...this.authSnapshot, error: null, errorCode: null, info: null };
    this.uiDirty = true;
    const result = await beginMazerOAuthAuthorization();
    if (result.status === 'failed') {
      this.authSubmitting = false;
      this.authOpeningStartedAtMs = null;
      this.authSnapshot = {
        ...this.authSnapshot,
        error: resolveLegacyOAuthFailureCopy(result.category),
        errorCode: result.category,
        info: null
      };
      this.uiDirty = true;
    }
  }

  private openOverlay(kind: OverlayKind): void {
    const previousOverlay = this.overlay;
    this.orientationFlipOriginLandscape = null;
    this.settingsGuideOpen = false;
    this.overlayGuideBounds = null;
    if (previousOverlay === 'confirm-progression-reset' && kind !== 'confirm-progression-reset') {
      this.progressionResetState = INITIAL_LEGACY_PROGRESSION_RESET_STATE;
    }
    if (previousOverlay === 'auth' && kind !== 'auth') {
      // Leaving Account for anything else (not just an explicit close) must
      // tear down its native DOM input first -- otherwise it stays mounted
      // and focused at the auth layer's high z-index underneath whatever
      // overlay opens next (e.g. Account -> Reset Progress).
      this.destroyLegacyAuthNativeInput();
      this.destroyAccountUsernameNativeInput();
      this.accountUsernameActive = false;
    }
    this.quitConfirmState = IDLE_LEGACY_QUIT_CONFIRM_STATE;
    if (kind === 'pause') {
      this.pauseSettingsExpanded = false;
      this.previewLevelsExpanded = false;
    }
    if (kind === 'options' || kind === 'pause') {
      this.optionFieldDrafts = createLegacyOptionFieldDrafts(this.settings);
      this.pendingOverlayMazeRebuild = false;
    }
    if (kind === 'leaderboard') {
      // Fresh open: drop the previous standing so a stale You row never shows while loading.
      this.leaderboardSelfRank = null;
      void this.loadLeaderboard();
    }
    if (kind === 'auth') {
      // Opening account entry from a guest play session is an explicit change
      // of intent. Re-lock immediately so neither a form validation failure
      // nor a provider error can leave a stale guest grant in control.
      this.revokeLegacyGuestPlayGrant();
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
    this.overlayReturn =
      (kind === 'auth' && (previousOverlay === 'pause' || previousOverlay === 'options'))
      || (kind === 'confirm-progression-reset' && (previousOverlay === 'pause' || previousOverlay === 'auth' || previousOverlay === 'options'))
        ? previousOverlay
        : 'none';
    if (kind === 'confirm-progression-reset') {
      this.requestLegacyProgressionReset();
    }
    this.titleGraphics.setVisible(false);
    this.boardDynamicDirty = true;
    this.uiDirty = true;
    if (this.mode === 'play') {
      this.publishInteractionDiagnostics();
    }
    this.uiBridge?.refreshProjection('overlay-open');
  }

  private closeOverlay(): void {
    this.quitConfirmState = IDLE_LEGACY_QUIT_CONFIRM_STATE;
    this.orientationFlipOriginLandscape = null;
    this.settingsGuideOpen = false;
    this.overlayGuideBounds = null;
    if (this.overlay === 'confirm-progression-reset') {
      this.progressionResetState = INITIAL_LEGACY_PROGRESSION_RESET_STATE;
    }
    if (this.overlay === 'options' || this.overlay === 'pause') {
      this.commitAllOverlayFields();
    }
    if (this.overlay === 'auth') {
      this.destroyLegacyAuthNativeInput();
      this.destroyAccountUsernameNativeInput();
      this.accountUsernameActive = false;
    }
    const returnOverlay = (this.overlay === 'auth' || this.overlay === 'confirm-progression-reset')
      ? this.overlayReturn
      : 'none';
    this.resetLegacyOverlayScrollState();
    if (returnOverlay !== 'none') {
      this.overlay = returnOverlay;
      this.overlayReturn = 'none';
      this.activeInputField = null;
      this.activeAuthField = null;
      this.titleGraphics.setVisible(false);
      this.boardDynamicDirty = true;
      this.uiDirty = true;
      this.uiBridge?.refreshProjection('overlay-close');
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
    this.uiBridge?.refreshProjection('overlay-close');
  }

  private closeLegacyAuthOverlayToMainMenu(): void {
    this.destroyLegacyAuthNativeInput();
    this.destroyAccountUsernameNativeInput();
    this.accountUsernameActive = false;
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
      this.trailAnimationElapsedMs = 0;
      this.trailAnimationLastRealMs = null;
      this.trailShineLapStartedAtMs = 0;
      this.trailShineLapCycleLength = 0;
      this.trailOriginAdvanceDistancePx = 0;
      this.lastTrailOriginPoint = null;
      this.hasPlayerEverLeftStart = false;
      this.playCyclePath = [copyPoint(result.nextPlayer)];
      this.playCycleResetUsed = true;
      this.playStartedAtMs = this.time.now;
      this.playCompletedAtMs = null;
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

  // Server-first reset of the account's maze progression (levels and maze
  // progress for the player AND the menu-AI track; never account, profile,
  // credentials, username or device settings). For a signed-in account with
  // remote progression on, the mazer_reset_progression RPC must land BEFORE
  // anything local changes: load-time reconciliation takes the per-track MAX of
  // local and remote, so a local-only reset would be silently restored. If the
  // server call fails, local progression is left exactly as it was and the
  // sheet shows the failure. Guests (or remote progression off) reset this
  // device's own key only.
  private async resetLegacyPlayerProgression(): Promise<boolean> {
    const strategy = this.resolveLegacyProgressionResetStrategy();
    if (strategy.kind === 'blocked') {
      this.reduceLegacyProgressionResetState({ failure: 'network', type: 'failed' });
      return false;
    }
    const snapshot = { ...this.authSnapshot };
    const sequence = this.authAccountHydrationSequence;

    if (strategy.kind === 'server-first') {
      let result: LegacyRemoteProgressionSyncResult | null = null;
      try {
        result = await writeLegacyRemoteProgressionState(snapshot, this.progressionState, undefined, 'replace');
      } catch (error) {
        this.publishLegacyRemoteSyncException('progression', error);
      }
      if (result !== null) {
        this.publishLegacyRemoteSyncResult(result);
      }
      if (result === null || !result.synced) {
        this.reduceLegacyProgressionResetState({ failure: classifyLegacyProgressionResetFailure(result), type: 'failed' });
        return false;
      }
    }

    // Local effects use the keys of the account the reset was requested for,
    // even if the session changed while the RPC was in flight.
    const storage = this.resolveBrowserLocalStorage();
    const effects = storage
      ? applyLegacyProgressionResetLocalEffects(
        storage,
        (keyBase) => resolveLegacyAuthScopedStorageKey(keyBase, snapshot),
        new Date().toISOString()
      )
      : { ok: false, state: createEmptyLegacyProgressionState() };
    if (!isLegacyRemoteCompletionContextCurrent(snapshot, sequence, this.authSnapshot, this.authAccountHydrationSequence)) {
      this.progressionResetState = INITIAL_LEGACY_PROGRESSION_RESET_STATE;
      this.uiDirty = true;
      return strategy.kind === 'server-first';
    }
    if (!effects.ok && strategy.kind === 'local-only') {
      this.reduceLegacyProgressionResetState({ failure: 'unknown', type: 'failed' });
      return false;
    }

    this.progressionState = effects.state;
    this.loadPersistedMazeCycleTelemetryHistory();
    this.resetLegacyWorldTurnHost();
    this.setLatestOverlayMessage(createLegacyPlayerMessage({
      copy: 'Progression reset.',
      id: 'progression.player.reset',
      source: 'progression',
      tone: 'success'
    }));
    this.boardDynamicDirty = true;
    this.uiDirty = true;
    this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    this.reduceLegacyProgressionResetState({ type: 'succeeded' });
    return true;
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

  private loadPersistedLegacyGameToggleSettings(): void {
    const browserStorage = this.resolveBrowserLocalStorage();
    migrateLegacyGameToggleSettingsToGuestScope(
      browserStorage,
      this.resolveLegacyGuestGameToggleStorage(),
      LEGACY_DEFAULTS
    );
    const scopedStorage = this.resolveLegacyGameToggleStorage();
    this.settings = readLegacyGameToggleSettings(scopedStorage, LEGACY_DEFAULTS);
    // Board Zoom was removed: drop the zoom key an older build stored so a player cannot stay zoomed.
    scrubRemovedCameraZoomFromGameToggleStorage(scopedStorage);
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
      this.applyLegacyPasswordRecoveryEntry(runtimeAuthFixtureSnapshot, 'BOOTSTRAP_PATH', true);
      return;
    }

    this.authUnsubscribe = await subscribeLegacyAuthState((snapshot, event) => {
      // INITIAL_SESSION is Supabase's own "here's what the session already
      // was when you registered this listener" event -- redundant with the
      // explicit readLegacyAuthSessionSnapshot() call right below, which is
      // the deliberate, authoritative boot-time read. Applying BOTH was a
      // real race: subscribeLegacyAuthState's own onAuthStateChange
      // registration (plus a second, separate one inside the auth client's
      // first-construction persistence listener) could each fire their own
      // INITIAL_SESSION at any point relative to the explicit read below,
      // sometimes landing AFTER it with a momentarily different snapshot --
      // a spurious guest<->authenticated flicker a second or two after
      // boot. That flicker re-triggered the "account changed" path
      // (reloading progression from the guest-scoped storage key instead
      // of the real one, and re-locking the auth gate mid-launch), which is
      // almost certainly what "kicks back to the menu a second after
      // Start" and "progress looks reset" on a fresh load actually were --
      // it only ever showed up once, on the very first boot, because by a
      // second attempt every one of these races had already settled.
      if (event === 'INITIAL_SESSION') {
        return;
      }
      this.applyLegacyAuthSnapshot(snapshot);
      if (event === 'PASSWORD_RECOVERY') {
        this.applyLegacyPasswordRecoveryEntry(snapshot, 'PASSWORD_RECOVERY', true);
      }
    });

    const snapshot = await readLegacyAuthSessionSnapshot();
    this.applyLegacyAuthSnapshot(snapshot);
    this.applyLegacyPasswordRecoveryEntry(snapshot, 'BOOTSTRAP_PATH', true);
  }

  private applyLegacyPasswordRecoveryEntry(
    snapshot: LegacyAuthSessionSnapshot,
    event: 'BOOTSTRAP_PATH' | 'PASSWORD_RECOVERY',
    bootstrapComplete: boolean
  ): void {
    const nextState = resolveLegacyPasswordRecoveryEntry(this.passwordRecoveryState, {
      authenticated: snapshot.status === 'authenticated',
      bootstrapComplete,
      event,
      hasProviderError: this.passwordRecoveryUrlState.hasProviderError,
      pathRequested: this.passwordRecoveryUrlState.requested
    });
    if (nextState === this.passwordRecoveryState) {
      return;
    }

    this.passwordRecoveryState = nextState;
    this.passwordRecoveryFeedback = null;
    if (this.isLegacyPasswordRecoveryActive()) {
      this.enterForcedLegacyAuthOverlay();
      this.overlayReturn = 'none';
      this.authForm = {
        ...this.authForm,
        confirmPassword: '',
        password: ''
      };
      this.authInvalidFields = new Set();
      this.activeAuthField = nextState.phase === 'ready' ? 'password' : null;
      this.destroyLegacyAuthNativeInput();
      if (nextState.phase === 'error') {
        clearLegacyPasswordRecoveryUrl('invalid');
      }
    }
    this.pendingAuthGateTransition = true;
    this.uiDirty = true;
  }

  private resolveLegacyRuntimeAuthFixtureSnapshot(): LegacyAuthSessionSnapshot | null {
    if (this.levelPreviewLevel !== null) {
      return createLegacyLevelPreviewAuthSnapshot();
    }
    if (typeof window === 'undefined') {
      return null;
    }

    if (!isLegacyRuntimeDiagnosticsAuthFixtureRoute(window.location.search)) {
      return null;
    }

    return {
      canonicalUsername: 'qa-player',
      configured: true,
      displayName: 'QA Player',
      email: 'qa@mazer.local',
      error: null,
      info: 'Runtime diagnostics authenticated fixture.',
      status: 'authenticated',
      userId: LEGACY_RUNTIME_DIAGNOSTICS_AUTH_FIXTURE_USER_ID
    };
  }

  private applyLegacyAuthSnapshot(snapshot: LegacyAuthSessionSnapshot): void {
    const previousMenuActionMode = this.authSnapshot.status === 'authenticated' ? 'authenticated' : 'guest';
    const previousUserId = this.authSnapshot.userId;
    const accountOwnerChangedDuringPlay = this.mode === 'play' && previousUserId !== snapshot.userId;

    if (accountOwnerChangedDuringPlay) {
      // Auth subscribers can fire between Phaser frames. Stop an account-owned
      // run synchronously, while the OLD account scope is still active, so no
      // pointer/QA input can finish it after progression storage switches to a
      // signed-out or different-user scope.
      this.enterMenuMode();
    }

    this.authSnapshot = snapshot;
    this.authGateAwaitingResolution = false;
    if (snapshot.status === 'authenticated') {
      this.guestPlayGranted = false;
    }
    this.authGateLocked = snapshot.status !== 'authenticated' && !this.guestPlayGranted;
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
      // Signed out, or a different account signed in on the same session --
      // either way, any loaded/drafted username belonged to the PREVIOUS
      // account and must not leak into the next one's account screen, even
      // for a single frame before loadAccountUsernameIfNeeded re-fetches.
      this.accountUsernameLoadedForUserId = null;
      this.accountUsernameHydrationPending = false;
      this.accountUsernameHydrationError = false;
      this.accountUsernameDraft = '';
      this.accountUsernameSavedValue = '';
      this.accountUsernameActive = false;
      this.destroyAccountUsernameNativeInput();
      if (this.accountUsernameDebounceTimer !== null) {
        clearTimeout(this.accountUsernameDebounceTimer);
        this.accountUsernameDebounceTimer = null;
      }
      const hydrationSequence = ++this.authAccountHydrationSequence;
      this.loadPersistedLegacyGameToggleSettings();
      this.loadPersistedMazeCycleTelemetryHistory();
      this.loadPersistedLegacyProgressionState();
      if (isLegacyRemoteAccountProviderEligible(snapshot)) {
        void this.hydrateLegacyAccountDataAfterAuth(snapshot, hydrationSequence);
      }
      this.boardDynamicDirty = true;
      this.uiDirty = true;
      this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
      this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    }
    if (accountOwnerChangedDuringPlay && snapshot.status !== 'authenticated') {
      this.enterForcedLegacyAuthOverlay();
      this.overlayReturn = 'none';
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
    // uiBridge may still be null here if this runs during the synchronous
    // auth-fixture path inside create() itself, before the bridge is
    // constructed -- optional chaining makes that a safe no-op, and the
    // bridge's own constructor projects the (by-then-current) auth state.
    this.uiBridge?.refreshProjection('auth-change');
  }

  private hasLegacyPlayAccess(): boolean {
    return isLegacyPlayAccessAllowed(this.authSnapshot.status, {
      authResolved: !this.authGateAwaitingResolution,
      guestPlayGranted: this.guestPlayGranted
    });
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
    if (result.remoteSyncResult) {
      this.publishLegacyRemoteSyncResult(result.remoteSyncResult);
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
    if (this.levelPreviewLevel !== null) {
      this.progressionState = createLegacyLevelPreviewProgressionState(this.levelPreviewLevel);
      return;
    }
    this.progressionState = readLegacyProgressionState(this.resolveLegacyProgressionStorage());
  }

  private applyBootstrappedLegacyAccountState(): void {
    const bootstrapped = readLegacyBootstrappedAccountState();
    if (
      !bootstrapped
      || bootstrapped.snapshot.status !== 'authenticated'
      || bootstrapped.snapshot.userId === null
      || bootstrapped.snapshot.userId !== this.authSnapshot.userId
    ) {
      return;
    }

    if (bootstrapped.progressionState) {
      this.progressionState = writeLegacyProgressionState(
        this.resolveLegacyProgressionStorage(),
        bootstrapped.progressionState
      );
    }
    if (bootstrapped.settings) {
      this.settings = bootstrapped.settings;
      this.optionFieldDrafts = createLegacyOptionFieldDrafts(bootstrapped.settings);
    }
    this.latestRemoteSyncResult = bootstrapped.remoteSyncResult;
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
    if (this.levelPreviewStorage !== null) {
      return this.levelPreviewStorage;
    }
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

  private resolveLegacyProgressionScaleOptionsForMode(mode: RuntimeMode): LegacyProgressionGenerationScaleOptions {
    const browserMobileParity = this.resolveLegacyBrowserMobileParity(this.scale.width, this.scale.height);
    return {
      surface: mode === 'play' ? 'play' : 'menu-demo',
      viewport: {
        width: browserMobileParity ? LEGACY_PROGRESSION_PHONE_MENU_MAX_WIDTH : this.scale.width,
        height: this.scale.height,
        // Mirrors resolveLegacyBoardAspectRatioForMode's own safeArea/
        // useFloatingTouchControls -- without these the tile-size cap this
        // feeds into simulated a bigger, safe-area-free box than the real
        // render ever gets, capping the cell count for a box larger than
        // actually exists and leaving the true board short of the bottom
        // safe edge. Keep both in sync.
        safeArea: readMazerViewportGeometry().safeArea,
        useFloatingTouchControls: true
      }
    };
  }

  // MAZER-FLOW-007: play generates against the PLAYER's track, the menu demo
  // against the independent ai-runner track (see legacyMenuDemoTrack.ts). Every
  // generation resolver below goes through this one lookup.
  private resolveLegacyProgressionScaleForMode(mode: RuntimeMode): number {
    return resolveLegacyProgressionGenerationScale(
      this.settings.scale,
      resolveLegacyGenerationTrack(this.progressionState, mode),
      this.resolveLegacyProgressionScaleOptionsForMode(mode)
    );
  }

  private resolveLegacyBrowserMobileParity(
    width = this.layout?.width ?? this.scale.width,
    height = this.layout?.height ?? this.scale.height
  ): boolean {
    return shouldUseLegacyBrowserMobileParity({ width, height });
  }

  private resolveLegacyMazeGenerationProfileForMode(mode: RuntimeMode) {
    // See resolveLegacyProgressionScaleForMode's own comment.
    const track = resolveLegacyGenerationTrack(this.progressionState, mode);
    // Device-relative: how close this level's board already sits to what
    // THIS screen can legibly render drives feeder/bleed-path count now,
    // not just a fixed per-band number that assumes some unconfigured
    // screen size. See resolveLegacyMazeGenerationProfileForProgression's
    // own comment on why only feeder count reads this so far.
    const { fraction } = resolveLegacyProgressionScaleDetail(
      this.settings.scale,
      track,
      this.resolveLegacyProgressionScaleOptionsForMode(mode)
    );
    return resolveLegacyMazeGenerationProfileForProgression(track, { fraction });
  }

  private resolveLegacyTargetComplexityForMode(mode: RuntimeMode): number {
    // See resolveLegacyProgressionScaleForMode's own comment.
    return resolveLegacyGenerationTrack(this.progressionState, mode).targetComplexity;
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
      const previousProgressionState = this.progressionState;
      const completionAuthSnapshot = { ...this.authSnapshot };
      const completionAuthSequence = this.authAccountHydrationSequence;
      const completionProgressionStorage = this.resolveLegacyProgressionStorage();
      this.progressionState = recordLegacyProgressionCycle(
        completionProgressionStorage,
        this.progressionState,
        latestReceipt,
        this.maze
      );
      void writeLegacyRemoteCompletion(
        completionAuthSnapshot,
        previousProgressionState,
        this.progressionState,
        latestReceipt,
        undefined,
        this.resolveBrowserLocalStorage()
      )
        .then((result) => {
          if (!isLegacyRemoteCompletionContextCurrent(
            completionAuthSnapshot,
            completionAuthSequence,
            this.authSnapshot,
            this.authAccountHydrationSequence
          )) {
            return;
          }
          if (result.progressionState) {
            this.progressionState = writeLegacyProgressionState(
              completionProgressionStorage,
              result.progressionState
            );
          }
          this.publishLegacyRemoteSyncResult(result);
          this.offlineCompletionFlush?.noteCompletionResult(result);
        })
        .catch((error: unknown) => {
          if (!isLegacyRemoteCompletionContextCurrent(
            completionAuthSnapshot,
            completionAuthSequence,
            this.authSnapshot,
            this.authAccountHydrationSequence
          )) {
            return;
          }
          this.publishLegacyRemoteSyncException('progression', error);
        });
      this.boardDynamicDirty = true;
      this.uiDirty = true;
      this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
    }

    if (surface === 'menu-demo') {
      this.menuDemoCycleRecorded = true;
    }
    this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;
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

  // MAZER-FLOW-009: replay the durable completion outbox on the browser
  // `online` event and say once per outage that progress is saved.
  private installLegacyOfflineCompletionFlush(): void {
    if (this.levelPreviewStorage !== null) {
      return;
    }
    this.offlineCompletionFlush = createLegacyOfflineCompletionFlush({
      flush: async () => {
        const snapshot = { ...this.authSnapshot };
        const sequence = this.authAccountHydrationSequence;
        const storage = this.resolveLegacyProgressionStorage();
        const result = await replayLegacyRemoteCompletions(
          snapshot,
          this.progressionState,
          this.resolveBrowserLocalStorage()
        );
        if (!isLegacyRemoteCompletionContextCurrent(
          snapshot,
          sequence,
          this.authSnapshot,
          this.authAccountHydrationSequence
        )) {
          return null;
        }
        if (result.progressionState) {
          this.progressionState = writeLegacyProgressionState(storage, result.progressionState);
        }
        this.publishLegacyRemoteSyncResult(result);
        return result;
      },
      isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
      notify: (message) => this.pushLegacyPlayerMessage(message),
      target: window
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
      completionSyncState: 'pending',
      error: technicalDetail,
      pendingCompletionCount: 0,
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
      recoveredCompletionCount: 0,
      synced: false
    });
  }

  private handleBackAction(): void {
    // Full auth gate: no back-chevron, no Escape key, no route around this
    // -- the account overlay can only close by actually signing in (see
    // pendingAuthGateTransition in update()).
    if ((this.authGateLocked || this.isLegacyPasswordRecoveryActive()) && this.overlay === 'auth') {
      return;
    }
    // The Guide sits on top of its Settings sheet: back returns to Settings first.
    if (this.settingsGuideOpen && (this.overlay === 'options' || this.overlay === 'pause')) {
      this.closeLegacyGuideSheet();
      return;
    }
    if (this.overlay === 'confirm-progression-reset') {
      // An in-flight server reset cannot be cancelled from the UI.
      if (this.progressionResetState.phase === 'working') {
        return;
      }
      this.progressionResetState = INITIAL_LEGACY_PROGRESSION_RESET_STATE;
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
  // Bounded `Opening…`: the label only claims progress while the redirect is
  // in flight. After LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS the hand-off is
  // released (authSubmitting cleared, otherwise the retry would be inert) and
  // the screen shows the browser notice with an enabled `Sign in`.
  private syncLegacyAuthOpeningTimeout(time: number): void {
    if (this.authOpeningStartedAtMs === null) {
      return;
    }
    if (!this.authSubmitting) {
      this.authOpeningStartedAtMs = null;
      return;
    }
    if (this.authOpeningStartedAtMs < 0) {
      this.authOpeningStartedAtMs = time;
      return;
    }
    if (time - this.authOpeningStartedAtMs >= LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS) {
      this.authOpeningStartedAtMs = null;
      this.authSubmitting = false;
      this.authOpeningTimedOut = true;
      this.uiDirty = true;
    }
  }

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

    this.authGateLoadingText.setText(resolveLegacyAuthLoadingCopy({
      awaitingResolution: this.authGateAwaitingResolution,
      callbackInProgress: false,
      hasSession: this.authGateHasSessionEvidence
    }));
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
        // Field names kept for diagnostics consumers: the "sigils" are now the
        // eight static edge markers, so there is no orbit period/phase (0).
        sigilOrbitCount: EDGE_STATION_COUNT,
        sigilOrbitPeriodMs: 0,
        sigilOrbitPhase: 0,
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
      LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO,
      LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO,
      LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO,
      LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO
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
    const playerTransfer = this.resolveLegacyPlayerTransferState(time);
    const viewportGeometry = readMazerViewportGeometry();
    const measuredRects = [
      { id: 'board', bounds: mazeRenderBounds },
      { id: 'progression-badge', bounds: this.progressionBadgeBounds },
      { id: 'menu-ai-progression-badge', bounds: this.menuAiProgressionBadgeBounds },
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
        playerTransfer,
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
        implicitZoomApplied: false,
        renderBounds: mazeRenderBounds,
        renderSafeInset: mazeRenderFrame.safeInset,
        safeBounds,
        pathVisualStyle: this.pathVisualStyle,
        tileSize: mazeRenderFrame.tileSize,
        visualScale: {
          x: this.boardZoomContainer.scaleX,
          y: this.boardZoomContainer.scaleY
        },
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
        completionSyncState: this.latestRemoteSyncResult?.completionSyncState ?? null,
        lastError: this.latestRemoteSyncResult?.error ?? null,
        lastMessage: this.latestRemoteSyncResult?.playerMessage ?? null,
        lastSkippedReason: this.latestRemoteSyncResult?.skippedReason ?? null,
        lastSynced: this.latestRemoteSyncResult?.synced ?? null,
        pendingCompletionCount: this.latestRemoteSyncResult?.pendingCompletionCount ?? 0,
        recoveredCompletionCount: this.latestRemoteSyncResult?.recoveredCompletionCount ?? 0
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
      // There is no play-mode HUD timer -- it was removed from the app
      // entirely. This field previously kept computing and reporting
      // timerText/timerBounds/kind/visible as if a timer were live and
      // showing on screen, when nothing ever actually rendered it (see
      // drawHud). Reporting honestly instead of resurrecting it.
      hud: {
        kind: null,
        visible: false,
        bounds: null,
        timerBounds: null,
        timerText: null
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
