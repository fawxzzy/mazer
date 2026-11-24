import '../dom/primitives.css';
import './feedbackPopup.css';
import { createFeedbackPopup, type FeedbackPopupHandle } from './feedbackPopup';
import type { FeedbackDraft, FeedbackSubmitResult } from './feedbackState';
import { applyFeedbackTheme } from './feedbackTheme';

/**
 * MAZER-FB-001: puts the picked layout (A, Card) on the page as a modal over the game. This is the only module that
 * touches the real document for the in-game popup, and it is loaded on demand (legacyFeedbackLauncher.ts), so none of
 * the popup, its CSS or the kit buttons are in the boot bundle.
 *
 * Everything shown is the real kit (feedbackPopup.ts: the kit buttons, the in-flow banner, the shared tokens). This
 * module only adds the scrim, the keyboard isolation and the close paths.
 *
 *  - Keyboard: keydown / keyup / keypress stop at the scrim, so a key typed into the note (Space, P, Enter, the arrows)
 *    never reaches the game's window-level handlers behind it. Escape closes. Tab stays inside the card.
 *  - Close: "Not now", Escape, and a moment after a successful send. A tap on the dim backdrop closes only a SENT popup
 *    (an accidental tap must never throw away a typed note).
 */

export const FEEDBACK_SENT_AUTO_CLOSE_MS = 2200;

export interface FeedbackMountOptions {
  /** Sends the draft. Resolves to the outcome; must not throw (a throw is treated as a generic failure). */
  submit: (draft: FeedbackDraft) => Promise<FeedbackSubmitResult>;
  /** Called once, after the popup is gone, however it closed. */
  onClose: () => void;
  theme?: 'default' | 'dark';
  host?: HTMLElement;
  doc?: Document;
  now?: () => number;
}

export interface FeedbackMountHandle {
  readonly scrim: HTMLElement;
  readonly popup: FeedbackPopupHandle;
  close: () => void;
  isClosed: () => boolean;
}

const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const mountFeedbackPopup = (options: FeedbackMountOptions): FeedbackMountHandle => {
  const doc = options.doc ?? document;
  const host = options.host ?? doc.body;
  const previousFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
  let closed = false;
  let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  const scrim = doc.createElement('div');
  scrim.className = 'mazer-feedback-scrim mazer-feedback-scrim--card';
  scrim.dataset.mazerComponent = 'FeedbackScrim';
  applyFeedbackTheme(scrim, options.theme ?? 'default');

  const close = (): void => {
    if (closed) return;
    closed = true;
    if (autoCloseTimer !== null) clearTimeout(autoCloseTimer);
    popup.destroy();
    scrim.remove();
    try {
      previousFocus?.focus({ preventScroll: true });
    } catch {
      // The element may be gone; the game keeps working without a restored focus.
    }
    options.onClose();
  };

  const popup = createFeedbackPopup({
    layout: 'card',
    now: options.now,
    onDismiss: close,
    onSubmit: (draft) => {
      void options.submit(draft).then(
        (result) => result,
        (): FeedbackSubmitResult => ({ status: 'failed' })
      ).then((result) => {
        if (closed) return;
        popup.dispatch({ type: 'result', result });
        if (result.status === 'saved') {
          autoCloseTimer = setTimeout(close, FEEDBACK_SENT_AUTO_CLOSE_MS);
        }
      });
    }
  }, doc);

  const stop = (event: Event): void => event.stopPropagation();
  scrim.addEventListener('keyup', stop);
  scrim.addEventListener('keypress', stop);
  scrim.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(popup.root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((node) => !node.hidden);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = doc.activeElement;
    if (event.shiftKey && (active === first || active === popup.root)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });
  scrim.addEventListener('click', (event) => {
    if (event.target === scrim && popup.getDraft().phase === 'sent') close();
  });

  scrim.append(popup.root);
  host.append(scrim);
  // Focus the card itself, not the first star: a focus ring on star 1 would read as "1 star already picked". Tab then
  // lands on the first star.
  popup.root.tabIndex = -1;
  popup.root.focus({ preventScroll: true });

  return { close, isClosed: () => closed, popup, scrim };
};
