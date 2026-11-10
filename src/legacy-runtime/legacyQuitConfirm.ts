/**
 * Quit to Menu confirmation (card MAZER-FLOW-005).
 *
 * Pure two-step state machine, no Phaser, DOM or wall clock. The pause sheet's
 * Quit to Menu row works like this:
 *
 *  - No move made on this maze: the first press quits immediately.
 *  - At least one move made:    the first press ARMS (the row relabels to
 *    "Tap again to quit"); a second press inside CONFIRM_TIMEOUT_MS quits; if
 *    the window runs out the row silently reverts to "Quit to Menu".
 *
 * It is an inline relabel inside the same sheet: no browser dialog, no modal,
 * no animation (so there is no separate reduced-motion form). The same two
 * steps apply to touch, pointer and the Q key.
 */

/** How long the armed "Tap again to quit" label stays before it reverts. */
export const LEGACY_QUIT_CONFIRM_TIMEOUT_MS = 3000;
export const LEGACY_QUIT_CONFIRM_ARMED_LABEL = 'Tap again to quit';

export interface LegacyQuitConfirmState {
  /** Scene-clock time the row was armed, or null when idle. */
  readonly armedAtMs: number | null;
}

export const IDLE_LEGACY_QUIT_CONFIRM_STATE: LegacyQuitConfirmState = Object.freeze({ armedAtMs: null });

export type LegacyQuitConfirmOutcome = 'quit' | 'armed';

export interface LegacyQuitConfirmPress {
  readonly outcome: LegacyQuitConfirmOutcome;
  readonly state: LegacyQuitConfirmState;
}

export const isLegacyQuitConfirmArmed = (state: LegacyQuitConfirmState, nowMs: number): boolean => (
  state.armedAtMs !== null
  && nowMs >= state.armedAtMs
  && nowMs - state.armedAtMs < LEGACY_QUIT_CONFIRM_TIMEOUT_MS
);

/** True when the armed window has run out and the row must revert (state is still armed in storage). */
export const hasLegacyQuitConfirmExpired = (state: LegacyQuitConfirmState, nowMs: number): boolean => (
  state.armedAtMs !== null && !isLegacyQuitConfirmArmed(state, nowMs)
);

export const pressLegacyQuitConfirm = (
  state: LegacyQuitConfirmState,
  input: { readonly nowMs: number; readonly movesMade: boolean }
): LegacyQuitConfirmPress => {
  if (!input.movesMade) {
    return { outcome: 'quit', state: IDLE_LEGACY_QUIT_CONFIRM_STATE };
  }
  if (isLegacyQuitConfirmArmed(state, input.nowMs)) {
    return { outcome: 'quit', state: IDLE_LEGACY_QUIT_CONFIRM_STATE };
  }
  return { outcome: 'armed', state: { armedAtMs: input.nowMs } };
};
