/**
 * Pure model for the redesigned Pause card.
 *
 * Title 'Paused'; actions in order Resume, Settings (collapsible toggle
 * section, collapsed by default), Quit to Menu. There is intentionally NO
 * restart / reset-player action (removed from the game) and NO account or
 * profile entry. No Phaser, no DOM, no wiring. See
 * docs/ui/MAZER-LEADERBOARD-PAUSE-IDENTITY-REDESIGN-2026-11-05.md.
 */
import type { UiCommand } from '../state/uiCommands';
import type { LegacyPauseCommand } from './legacyPauseLifecycle';
import {
  LEGACY_OVERLAY_HEADER_RESERVE,
  LEGACY_UI_COMPACT_BREAKPOINT,
  LEGACY_UI_MIN_TOUCH_TARGET,
  resolveLegacyFeatureControlLayout,
  resolveLegacyOverlayPanelLayout,
  type LegacyOverlayPanelLayout
} from './legacyUiStandards';

/**
 * The overlay id literal. holdLegacyPlayMazeLifecycleDuringPause (MenuScene)
 * and the QA/overlay routing depend on this exact id; do not rename.
 */
export const LEGACY_PAUSE_OVERLAY_ID = 'pause' as const;
export const LEGACY_PAUSE_TITLE = 'Paused';

export type LegacyPauseActionId = 'resume' | 'settings' | 'quit-to-menu';

/** The only pause lifecycle commands the redesigned card can issue. */
export type LegacyPauseMenuCommand = Extract<LegacyPauseCommand, 'resume' | 'return-menu'>;
/** The only UI bridge commands the redesigned card can dispatch. */
export type LegacyPauseMenuBridgeCommand = Extract<UiCommand, { type: 'RESUME_RUN' | 'RETURN_HOME' }>;

export interface LegacyPauseActionModel {
  id: LegacyPauseActionId;
  label: string;
  emphasis: 'primary' | 'secondary' | 'tertiary';
  /** Existing pause lifecycle command, or null for the Settings disclosure. */
  command: LegacyPauseMenuCommand | null;
  /** Existing UI bridge command dispatched first (scene falls back to `command`), or null. */
  bridgeCommand: LegacyPauseMenuBridgeCommand | null;
  /** Legacy model only. The live Pause sheet confirms Quit to Menu after the first move via legacyQuitConfirm.ts (settings sheet plan). */
  requiresConfirmation: false;
  /** Settings only: toggles an inline section instead of leaving the card. */
  togglesSection: boolean;
}

export interface LegacyPauseSettingsSectionModel {
  id: 'pause-settings';
  title: 'Settings';
  collapsedByDefault: true;
  /** Rows come from the scene's existing feature-control rows (createFeatureControlRows). */
  toggleRowSource: 'feature-control-rows';
  /** Matches today's pause call: includeMovementSpeed: false. */
  includeMovementSpeed: false;
}

export interface LegacyPauseMenuViewModel {
  overlayId: typeof LEGACY_PAUSE_OVERLAY_ID;
  title: typeof LEGACY_PAUSE_TITLE;
  actions: readonly LegacyPauseActionModel[];
  settingsSection: LegacyPauseSettingsSectionModel;
  /** Explicitly absent entries, pinned by tests. */
  excludes: readonly ['restart', 'reset-player', 'reset-progression', 'account', 'profile'];
}

export const LEGACY_PAUSE_ACTIONS: readonly LegacyPauseActionModel[] = Object.freeze([
  Object.freeze({
    bridgeCommand: { type: 'RESUME_RUN' } as const,
    command: 'resume' as const,
    emphasis: 'primary' as const,
    id: 'resume' as const,
    label: 'Resume',
    requiresConfirmation: false as const,
    togglesSection: false
  }),
  Object.freeze({
    bridgeCommand: null,
    command: null,
    emphasis: 'secondary' as const,
    id: 'settings' as const,
    label: 'Settings',
    requiresConfirmation: false as const,
    togglesSection: true
  }),
  Object.freeze({
    bridgeCommand: { type: 'RETURN_HOME' } as const,
    command: 'return-menu' as const,
    emphasis: 'tertiary' as const,
    id: 'quit-to-menu' as const,
    label: 'Quit to Menu',
    requiresConfirmation: false as const,
    togglesSection: false
  })
]);

/** action id -> existing pause lifecycle command (Settings has none). */
export const LEGACY_PAUSE_ACTION_COMMANDS: Readonly<Record<LegacyPauseActionId, LegacyPauseMenuCommand | null>> =
  Object.freeze({
    resume: 'resume',
    settings: null,
    'quit-to-menu': 'return-menu'
  });

export const resolveLegacyPauseActionCommand = (
  id: LegacyPauseActionId
): LegacyPauseMenuCommand | null => LEGACY_PAUSE_ACTION_COMMANDS[id];

export const buildLegacyPauseMenuViewModel = (): LegacyPauseMenuViewModel => ({
  actions: LEGACY_PAUSE_ACTIONS,
  excludes: ['restart', 'reset-player', 'reset-progression', 'account', 'profile'],
  overlayId: LEGACY_PAUSE_OVERLAY_ID,
  settingsSection: {
    collapsedByDefault: true,
    id: 'pause-settings',
    includeMovementSpeed: false,
    title: 'Settings',
    toggleRowSource: 'feature-control-rows'
  },
  title: LEGACY_PAUSE_TITLE
});

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

/** Default toggle rows in the Settings section (Trail Fade, Trail Shine, Animated Background). */
export const LEGACY_PAUSE_DEFAULT_TOGGLE_ROWS = 3;

export interface LegacyPauseMenuLayoutOptions {
  settingsExpanded?: boolean;
  toggleRowCount?: number;
  /**
   * Exact height of the expanded settings rows as the scene renders them
   * (createFeatureControlRows incl. section heading). When given it replaces
   * the toggleRowCount estimate so the card sizes to what is really drawn.
   */
  settingsContentHeight?: number;
}

export interface LegacyPauseMenuLayout {
  panel: LegacyOverlayPanelLayout;
  compact: boolean;
  cardLeft: number;
  cardTop: number;
  cardWidth: number;
  cardHeight: number;
  centerX: number;
  titleHeight: number;
  actionHeight: number;
  actionGap: number;
  cardPadding: number;
  settingsSectionHeight: number;
  /** Natural (unclipped) card height. */
  naturalCardHeight: number;
  /** Space available to the card below the header reserve. */
  availableHeight: number;
  fits: boolean;
  /** True when the natural height exceeds the space; the card body should scroll. */
  scrollable: boolean;
}

export const resolveLegacyPauseMenuLayout = (
  width: number,
  height: number,
  safeArea: { top?: number; bottom?: number } = {},
  options: LegacyPauseMenuLayoutOptions = {}
): LegacyPauseMenuLayout => {
  const panel = resolveLegacyOverlayPanelLayout(width, height, safeArea);
  const compact = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
  const cardPadding = compact ? 20 : 24;
  const titleHeight = compact ? 40 : 46;
  const titleGap = compact ? 14 : 16;
  const actionHeight = Math.max(LEGACY_UI_MIN_TOUCH_TARGET, compact ? 48 : 52);
  const actionGap = compact ? 10 : 14;
  const cardWidth = Math.min(compact ? 360 : 400, Math.max(1, panel.width - (compact ? 16 : 48)));
  const actionCount = LEGACY_PAUSE_ACTIONS.length;
  const toggleRowCount = Math.max(0, Math.round(options.toggleRowCount ?? LEGACY_PAUSE_DEFAULT_TOGGLE_ROWS));

  let settingsSectionHeight = 0;
  if (options.settingsExpanded === true && typeof options.settingsContentHeight === 'number' && options.settingsContentHeight > 0) {
    settingsSectionHeight = actionGap + Math.round(options.settingsContentHeight);
  } else if (options.settingsExpanded === true && toggleRowCount > 0) {
    const rows = resolveLegacyFeatureControlLayout(cardWidth, false);
    settingsSectionHeight = actionGap + (toggleRowCount * rows.rowHeight) + ((toggleRowCount - 1) * rows.rowGap);
  }

  const naturalCardHeight = cardPadding
    + titleHeight
    + titleGap
    + (actionCount * actionHeight)
    + ((actionCount - 1) * actionGap)
    + settingsSectionHeight
    + cardPadding;
  const headerReserve = LEGACY_OVERLAY_HEADER_RESERVE + (compact ? 6 : 8);
  const availableHeight = Math.max(1, panel.height - headerReserve);
  const cardHeight = Math.min(naturalCardHeight, availableHeight);
  const regionTop = panel.top + headerReserve;
  const cardTop = Math.round(regionTop + ((availableHeight - cardHeight) / 2));
  const cardLeft = Math.round(panel.centerX - (cardWidth / 2));

  return {
    actionGap,
    actionHeight,
    availableHeight,
    cardHeight,
    cardLeft,
    cardPadding,
    cardTop,
    cardWidth,
    centerX: panel.centerX,
    compact,
    fits: naturalCardHeight <= availableHeight,
    naturalCardHeight,
    panel,
    scrollable: naturalCardHeight > availableHeight,
    settingsSectionHeight,
    titleHeight
  };
};
