/**
 * MAZER-FB-001: keeps keys typed into the feedback popup away from the game behind it. No CSS, no kit imports, so the
 * always-loaded control-hint presenter can import the target check without pulling the popup into the boot bundle.
 *
 *  - Bubble-phase listeners (Phaser's window keyboard, the scene's document key handlers) never see a key typed in the
 *    popup: keydown / keyup / keypress stop at the scrim.
 *  - Capture-phase window listeners run BEFORE the scrim, so stopping there cannot help; they call
 *    isInsideFeedbackPopup(event.target) and skip the event themselves.
 */

export const FEEDBACK_SCRIM_CLASS = 'mazer-feedback-scrim';

/** True when the event target sits inside the feedback popup's scrim (a key typed into the note, a focused star). */
export const isInsideFeedbackPopup = (target: EventTarget | null | undefined): boolean => {
  const candidate = target as { closest?: (selector: string) => unknown } | null | undefined;
  if (candidate === null || candidate === undefined || typeof candidate.closest !== 'function') return false;
  try {
    return candidate.closest(`.${FEEDBACK_SCRIM_CLASS}`) !== null;
  } catch {
    return false;
  }
};

export interface FeedbackKeyIsolationOptions {
  /** Escape: the popup closes (default is prevented first). */
  onEscape: () => void;
  /** Tab / Shift+Tab: the caller keeps focus inside the card. */
  onTab: (event: KeyboardEvent) => void;
}

export const installFeedbackKeyIsolation = (
  scrim: Pick<EventTarget, 'addEventListener'>,
  options: FeedbackKeyIsolationOptions
): void => {
  const stop = (event: Event): void => event.stopPropagation();
  scrim.addEventListener('keyup', stop);
  scrim.addEventListener('keypress', stop);
  scrim.addEventListener('keydown', (event) => {
    event.stopPropagation();
    const key = (event as KeyboardEvent).key;
    if (key === 'Escape') {
      event.preventDefault();
      options.onEscape();
      return;
    }
    if (key === 'Tab') options.onTab(event as KeyboardEvent);
  });
};
