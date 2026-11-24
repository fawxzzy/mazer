/**
 * MAZER-UI-095: the in-game Menu (Zac, 2026-11-19). Pure model: no Phaser, no DOM, no storage, no wall clock.
 *
 * In a played game the corner Settings cog is gone. In its place is a Menu button that opens the SAME dropdown the
 * main menu uses (legacyMenuDropdown.ts geometry, menuDropdownButtons.ts wiring), with these rows, in this order:
 *
 *   Settings     opens the existing in-game Settings sheet (now only Reduce Motion, Haptics, the floating anchor)
 *   Guide        opens the Guide (moved out of Settings)
 *   Sound        tap to toggle; the row shows On / Off and the panel stays open (moved out of Settings)
 *   Feedback     opens the 1-5 star feedback popup (signed-in only, MAZER-FB-001; the run stays paused)
 *   Reset level  puts you back at this maze's start (the existing reset-player path); two taps after a move
 *   Main menu    leaves the run (moved out of Settings); two taps after a move, as before
 *
 * The open X is the Resume button: it says "Resume" in words next to it and publishes 'Resume'. A tap outside the
 * panel resumes too. While the dropdown (or anything it opened) is up the run is PAUSED through the existing pause
 * overlay, so the lifecycle hold (legacyLifecycleHold.ts) shifts the run clock by exactly the paused time: nothing
 * jumps, and no stat, score, death/finish logic or saved data changes from opening or closing it.
 *
 * RESET LEVEL CONFIRMATION (decided in this lane): no dialog. A reset throws away real progress only when you have
 * moved, so it uses the same inline two-tap arm as Main menu (legacyQuitConfirm.ts): with no move made it resets at
 * once; after a move the first tap relabels the row "Tap again to reset" for 3 s and the second tap resets.
 */
import type { LegacyMenuDropdownItem } from './legacyMenuDropdown';
import {
  LEGACY_MENU_RESET_ARMED_LABEL,
  LEGACY_MENU_ROW_LABELS,
  LEGACY_MENU_ROW_PANEL_WIDTH_PX,
  LEGACY_MENU_ROW_SEMANTIC_ACTIONS,
  LEGACY_MENU_SOUND_OFF_LABEL,
  LEGACY_MENU_SOUND_ON_LABEL,
  LEGACY_PLAY_MENU_ROW_IDS,
  buildLegacyMenuRows,
  isLegacyMenuRowToggle,
  type LegacyPlayMenuRowId
} from './legacyMenuRows';
import {
  IDLE_LEGACY_QUIT_CONFIRM_STATE,
  isLegacyQuitConfirmArmed,
  type LegacyQuitConfirmState
} from './legacyQuitConfirm';

// The rows themselves come from the one shared row model (legacyMenuRows.ts, MAZER-UI-096): the main menu shows the
// same Settings / Guide / Sound rows first. These names are the in-game view of it.
export { LEGACY_PLAY_MENU_ROW_IDS, type LegacyPlayMenuRowId };

export const LEGACY_PLAY_MENU_LABELS: Readonly<Record<LegacyPlayMenuRowId, string>> = Object.freeze(
  Object.fromEntries(LEGACY_PLAY_MENU_ROW_IDS.map((id) => [id, LEGACY_MENU_ROW_LABELS[id]])) as Record<LegacyPlayMenuRowId, string>
);

/** Names published to visual QA (stable while a row's label changes to its armed text). */
export const LEGACY_PLAY_MENU_SEMANTIC_ACTIONS: Readonly<Record<LegacyPlayMenuRowId, string>> = Object.freeze(
  Object.fromEntries(LEGACY_PLAY_MENU_ROW_IDS.map((id) => [id, LEGACY_MENU_ROW_SEMANTIC_ACTIONS[id]])) as Record<LegacyPlayMenuRowId, string>
);

/** The closed in-game toggle (the button that replaced the Settings cog). */
export const LEGACY_PLAY_MENU_TOGGLE_ACTION = 'Menu';
/** The open toggle (the X) and its visible word. */
export const LEGACY_PLAY_MENU_RESUME_ACTION = 'Resume';
export const LEGACY_PLAY_MENU_RESUME_LABEL = 'Resume';
export const LEGACY_PLAY_MENU_SOUND_ON_LABEL = LEGACY_MENU_SOUND_ON_LABEL;
export const LEGACY_PLAY_MENU_SOUND_OFF_LABEL = LEGACY_MENU_SOUND_OFF_LABEL;
export const LEGACY_PLAY_MENU_RESET_ARMED_LABEL = LEGACY_MENU_RESET_ARMED_LABEL;
/** Same width as the main menu's panel (one shared width, legacyMenuRows.ts). */
export const LEGACY_PLAY_MENU_PANEL_WIDTH_PX = LEGACY_MENU_ROW_PANEL_WIDTH_PX;
/** Board dim under the open dropdown: lighter than the sheet's 0.82 so the paused maze stays readable. */
export const LEGACY_PLAY_MENU_DIM_ALPHA = 0.5;

export interface LegacyPlayMenuRowsInput {
  readonly soundEnabled: boolean;
  readonly resetAvailable: boolean;
  readonly resetArmed: boolean;
  readonly quitArmed: boolean;
  /** MAZER-FB-001: Feedback row, signed-in players only. Default false (row hidden). */
  readonly feedbackAvailable?: boolean;
}

export const buildLegacyPlayMenuRows = (
  input: LegacyPlayMenuRowsInput
): readonly LegacyMenuDropdownItem<LegacyPlayMenuRowId>[] => buildLegacyMenuRows('play', input);

/**
 * Reset level is offered only while there is a live maze to put you back into: not once the run has finished (the
 * finish flow owns what happens next), not while a reset is already queued, not while the next maze is generating.
 */
export const resolveLegacyPlayResetAvailability = (input: {
  readonly runCompleted: boolean;
  readonly resetPending: boolean;
  readonly levelGenerating: boolean;
}): boolean => !input.runCompleted && !input.resetPending && !input.levelGenerating;

/** Which pause surface is showing: the dropdown, or the Settings sheet it opened. The Guide sits on top of either. */
export type LegacyPlayMenuView = 'menu' | 'settings';

/** Why the run paused. Only an orientation flip opens straight on the sheet (it carries the "Rotate back" notice). */
export type LegacyPlayMenuOpenReason = 'menu' | 'page-leave' | 'rotate';

export const resolveLegacyPlayMenuOpenView = (reason: LegacyPlayMenuOpenReason): LegacyPlayMenuView => (
  reason === 'rotate' ? 'settings' : 'menu'
);

export type LegacyPlayMenuBackAction = 'close-guide' | 'show-menu' | 'resume';

/** Esc / browser back while paused: the Guide closes first, then the Settings sheet steps back to the dropdown. */
export const resolveLegacyPlayMenuBack = (input: {
  readonly view: LegacyPlayMenuView;
  readonly guideOpen: boolean;
}): LegacyPlayMenuBackAction => {
  if (input.guideOpen) {
    return 'close-guide';
  }
  return input.view === 'settings' ? 'show-menu' : 'resume';
};

/**
 * Whether a press of a two-tap row (Reset level, Main menu) would only ARM it (so the panel must stay open to show
 * "Tap again to ..."), using the same rule as pressLegacyQuitConfirm: arms only after a move and when not armed.
 */
export const wouldLegacyPlayMenuPressArm = (
  state: LegacyQuitConfirmState,
  input: { readonly nowMs: number; readonly movesMade: boolean }
): boolean => input.movesMade && !isLegacyQuitConfirmArmed(state, input.nowMs);

/** Rows whose pick leaves the dropdown open: Sound always; Reset level / Main menu on the arming press. */
export const shouldLegacyPlayMenuStayOpen = (
  id: LegacyPlayMenuRowId,
  input: {
    readonly nowMs: number;
    readonly movesMade: boolean;
    readonly resetState: LegacyQuitConfirmState;
    readonly quitState: LegacyQuitConfirmState;
  }
): boolean => {
  if (isLegacyMenuRowToggle(id)) {
    return true;
  }
  if (id === 'reset-level') {
    return wouldLegacyPlayMenuPressArm(input.resetState, input);
  }
  if (id === 'main-menu') {
    return wouldLegacyPlayMenuPressArm(input.quitState, input);
  }
  return false;
};

export const IDLE_LEGACY_PLAY_RESET_CONFIRM_STATE: LegacyQuitConfirmState = IDLE_LEGACY_QUIT_CONFIRM_STATE;
