// Pure rules for "the page went away" (tab hidden, app backgrounded, window
// blurred) so a run neither keeps ticking nor skips an intro/outro when the
// player comes back. No Phaser, no DOM: MenuScene owns the listeners and
// feeds this module plain values.
//
// Three decisions live here:
//   1. Which signals pause a run, and when that is allowed (exactly one
//      overlay: never open Pause on top of another overlay).
//   2. How the page-visibility state evolves (hidden, then one "resume frame"
//      whose elapsed time is the whole hidden gap).
//   3. How many ms of wall clock a frame must be shifted out of every
//      absolute-time anchor (intro/outro/reset deadlines, the run timer) so
//      a paused or hidden interval costs the run nothing and a time-derived
//      animation continues from the exact phase it froze at.

export type LegacyPageLeaveSignal = 'visibility-hidden' | 'page-hide' | 'window-blur';
export type LegacyPageReturnSignal = 'visibility-visible' | 'page-show';

export interface LegacyPageVisibilityState {
  /** The page is hidden (tab switch, app background, page-hide). A blur alone does not set this. */
  hidden: boolean;
  /** The first frame after coming back: its delta is the whole hidden gap. */
  resumeFramePending: boolean;
}

export const INITIAL_LEGACY_PAGE_VISIBILITY_STATE: LegacyPageVisibilityState = {
  hidden: false,
  resumeFramePending: false
};

export interface LegacyAutoPauseInput {
  mode: 'menu' | 'play';
  overlay: string;
}

/**
 * Auto-pause only a live run with no overlay open. Menu mode has nothing to
 * protect; any open overlay (pause, settings, confirm, auth) already owns the
 * screen, and opening Pause on top would stack two overlays.
 */
export const shouldAutoPauseLegacyRun = ({ mode, overlay }: LegacyAutoPauseInput): boolean => (
  mode === 'play' && overlay === 'none'
);

export const reduceLegacyPageVisibilityOnLeave = (
  state: LegacyPageVisibilityState,
  signal: LegacyPageLeaveSignal
): LegacyPageVisibilityState => (
  signal === 'window-blur'
    ? state
    : { hidden: true, resumeFramePending: false }
);

export const reduceLegacyPageVisibilityOnReturn = (
  state: LegacyPageVisibilityState,
  _signal: LegacyPageReturnSignal
): LegacyPageVisibilityState => (
  state.hidden
    ? { hidden: false, resumeFramePending: true }
    : state
);

/** Call once per frame after the hold has been applied. */
export const consumeLegacyResumeFrame = (
  state: LegacyPageVisibilityState
): LegacyPageVisibilityState => (
  state.resumeFramePending
    ? { hidden: state.hidden, resumeFramePending: false }
    : state
);

export interface LegacyLifecycleHoldInput {
  mode: 'menu' | 'play';
  overlay: string;
  pageVisibility: LegacyPageVisibilityState;
}

/**
 * True while the run's lifecycle must stand still: a Play-mode overlay is
 * open, the page is hidden, or this is the first frame after a hidden gap.
 * Menu-mode overlays (Settings, Leaderboard) deliberately do not hold: the
 * ambient demo keeps walking behind them.
 */
export const isLegacyLifecycleHeld = ({ mode, overlay, pageVisibility }: LegacyLifecycleHoldInput): boolean => (
  (mode === 'play' && overlay !== 'none')
  || pageVisibility.hidden
  || pageVisibility.resumeFramePending
);

export interface LegacyLifecycleHoldMsInput extends LegacyLifecycleHoldInput {
  frameDeltaMs: number;
}

/** ms every absolute-time anchor must move forward this frame (0 when running). */
export const resolveLegacyLifecycleHoldMs = (input: LegacyLifecycleHoldMsInput): number => {
  if (!(input.frameDeltaMs > 0) || !Number.isFinite(input.frameDeltaMs)) {
    return 0;
  }
  return isLegacyLifecycleHeld(input) ? input.frameDeltaMs : 0;
};

/** A deadline or anchor shifted by a hold; null stays null. */
export const shiftLegacyLifecycleAnchor = (anchorMs: number | null, holdMs: number): number | null => (
  anchorMs === null ? null : anchorMs + holdMs
);
