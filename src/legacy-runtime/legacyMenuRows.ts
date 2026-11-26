/**
 * MAZER-UI-095 / MAZER-UI-096: the ONE row model for both Menu dropdowns (Zac, 2026-11-19). Pure: no Phaser, no DOM,
 * no storage, no wall clock.
 *
 * The main menu and a played game open the same dropdown (legacyMenuDropdown.ts geometry, menuDropdownButtons.ts
 * wiring) with the same row words, the same order for the rows they share, the same Sound toggle and the same width.
 * Each screen only adds its own rows after the shared three:
 *
 *   shared      Settings (the trimmed Settings sheet), Guide (out of Settings), Sound (tap toggle, On / Off on the row)
 *   main menu   + Profile, Leaderboard                         (no pause: its X just closes)
 *   in a game   + Reset level, Main menu                       (the dropdown IS the pause: its X is Resume)
 *
 * Play-only rules (reset availability, two-tap arming, back steps) live in legacyPlayMenu.ts.
 */
import type { LegacyMenuDropdownItem } from './legacyMenuDropdown';
import { LEGACY_QUIT_CONFIRM_ARMED_LABEL } from './legacyQuitConfirm';

export type LegacyMenuScreen = 'main' | 'play';

/** Rows both screens show first, in this order. */
export const LEGACY_SHARED_MENU_ROW_IDS = ['settings', 'guide', 'sound'] as const;
/**
 * No Feedback row on either screen (Zac, 2026-11-25): Feedback is a rating that offers itself on main-menu entry from
 * level 50 (legacyRatingPrompt.ts), not a menu destination.
 */
export const LEGACY_MAIN_MENU_ROW_IDS = [...LEGACY_SHARED_MENU_ROW_IDS, 'profile', 'leaderboard'] as const;
export const LEGACY_PLAY_MENU_ROW_IDS = [...LEGACY_SHARED_MENU_ROW_IDS, 'reset-level', 'main-menu'] as const;

export type LegacyMainMenuRowId = (typeof LEGACY_MAIN_MENU_ROW_IDS)[number];
export type LegacyPlayMenuRowId = (typeof LEGACY_PLAY_MENU_ROW_IDS)[number];
export type LegacyMenuRowId = LegacyMainMenuRowId | LegacyPlayMenuRowId;

export const LEGACY_MENU_ROW_LABELS: Readonly<Record<LegacyMenuRowId, string>> = Object.freeze({
  guide: 'Guide',
  leaderboard: 'Leaderboard',
  'main-menu': 'Main menu',
  profile: 'Profile',
  'reset-level': 'Reset level',
  settings: 'Settings',
  sound: 'Sound'
});

/**
 * Names published to visual QA (stable while a row's label changes to its armed text). Profile keeps 'Account', the
 * name of the retired corner button, so harnesses keep finding it.
 */
export const LEGACY_MENU_ROW_SEMANTIC_ACTIONS: Readonly<Record<LegacyMenuRowId, string>> = Object.freeze({
  guide: 'Guide',
  leaderboard: 'Leaderboard',
  'main-menu': 'Main menu',
  profile: 'Account',
  'reset-level': 'Reset level',
  settings: 'Settings',
  sound: 'Sound'
});

export const LEGACY_MENU_SOUND_ON_LABEL = 'On';
export const LEGACY_MENU_SOUND_OFF_LABEL = 'Off';
export const LEGACY_MENU_RESET_ARMED_LABEL = 'Tap again to reset';
/**
 * One width for both panels (was 176 px on the main menu): fits "Tap again to reset" and "Leaderboard" plus the
 * Sound state word on one line.
 */
export const LEGACY_MENU_ROW_PANEL_WIDTH_PX = 216;

export interface LegacyMenuRowsState {
  readonly soundEnabled: boolean;
  /** Main menu: Profile is dropped while the account service is unavailable. Default true. */
  readonly profileAvailable?: boolean;
  /** In a game: Reset level is drawn dim and ignores taps when false. Default true. */
  readonly resetAvailable?: boolean;
  readonly resetArmed?: boolean;
  readonly quitArmed?: boolean;
}

type LegacyRowAvailability = Pick<LegacyMenuRowsState, 'profileAvailable'>;
export function resolveLegacyMenuRowIds(screen: 'main', state?: LegacyRowAvailability): readonly LegacyMainMenuRowId[];
export function resolveLegacyMenuRowIds(screen: 'play', state?: LegacyRowAvailability): readonly LegacyPlayMenuRowId[];
export function resolveLegacyMenuRowIds(
  screen: LegacyMenuScreen,
  state: LegacyRowAvailability = {}
): readonly LegacyMenuRowId[] {
  const ids: readonly LegacyMenuRowId[] = screen === 'play' ? LEGACY_PLAY_MENU_ROW_IDS : LEGACY_MAIN_MENU_ROW_IDS;
  return ids.filter((id) => id !== 'profile' || screen === 'play' || state.profileAvailable !== false);
}

const buildRow = <TId extends LegacyMenuRowId>(id: TId, state: LegacyMenuRowsState): LegacyMenuDropdownItem<TId> => {
  let label = LEGACY_MENU_ROW_LABELS[id];
  let stateText: string | null = null;
  let disabled = false;
  if (id === 'sound') {
    stateText = state.soundEnabled ? LEGACY_MENU_SOUND_ON_LABEL : LEGACY_MENU_SOUND_OFF_LABEL;
  } else if (id === 'reset-level') {
    const available = state.resetAvailable !== false;
    disabled = !available;
    if (state.resetArmed === true && available) {
      label = LEGACY_MENU_RESET_ARMED_LABEL;
    }
  } else if (id === 'main-menu' && state.quitArmed === true) {
    label = LEGACY_QUIT_CONFIRM_ARMED_LABEL;
  }
  return Object.freeze({ disabled, id, label, semanticAction: LEGACY_MENU_ROW_SEMANTIC_ACTIONS[id], stateText });
};

export function buildLegacyMenuRows(screen: 'main', state: LegacyMenuRowsState): readonly LegacyMenuDropdownItem<LegacyMainMenuRowId>[];
export function buildLegacyMenuRows(screen: 'play', state: LegacyMenuRowsState): readonly LegacyMenuDropdownItem<LegacyPlayMenuRowId>[];
export function buildLegacyMenuRows(
  screen: LegacyMenuScreen,
  state: LegacyMenuRowsState
): readonly LegacyMenuDropdownItem<LegacyMenuRowId>[] {
  const ids: readonly LegacyMenuRowId[] = screen === 'play'
    ? resolveLegacyMenuRowIds('play', state)
    : resolveLegacyMenuRowIds('main', state);
  return Object.freeze(ids.map((id) => buildRow(id, state)));
}

/** Sound is a toggle, not a destination: on either screen a tap flips it and the panel stays open to show On / Off. */
export const isLegacyMenuRowToggle = (id: LegacyMenuRowId): boolean => id === 'sound';

/**
 * Where the Guide's Close / back goes. Opened from a Menu row it returns to where that Menu was: the paused dropdown in
 * a game, the plain main menu (closing the Settings overlay it borrowed) on the main menu. Opened from inside a
 * Settings sheet it returns to that sheet.
 */
export const resolveLegacyGuideCloseTarget = (input: {
  readonly screen: LegacyMenuScreen;
  readonly openedFromMenu: boolean;
}): 'menu-dropdown' | 'main-menu' | 'settings-sheet' => {
  if (!input.openedFromMenu) {
    return 'settings-sheet';
  }
  return input.screen === 'play' ? 'menu-dropdown' : 'main-menu';
};
