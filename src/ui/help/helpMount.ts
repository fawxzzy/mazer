import '../dom/primitives.css';
import '../feedback/feedbackPopup.css';
import './help.css';
import { FEEDBACK_SCRIM_CLASS, installFeedbackKeyIsolation } from '../feedback/feedbackKeyIsolation';
import { applyFeedbackTheme } from '../feedback/feedbackTheme';
import { createHelpPopup, type HelpPopupHandle } from './helpPopup';
import type { HelpDraft, HelpSubmitResult } from './helpState';

/**
 * Help screen (MAZER-ONB-001 family): puts the Help sheet on the page as a modal over the game. The only module that
 * touches the real document for Help, loaded on demand (legacyHelpLauncher.ts), so the sheet, its CSS and the kit are
 * not in the boot bundle.
 *
 * It reuses the rating popup's modal plumbing on purpose: the same scrim class (so the game's window-level key handlers
 * skip anything typed here, feedbackKeyIsolation.ts), the same z-index, the same dark-theme remap (feedbackTheme.ts).
 *
 *  - Keyboard: keys stop at the scrim; Escape closes; Tab stays inside the sheet.
 *  - Close: the Close button, Escape, or a tap on the dim backdrop while nothing is typed (an accidental tap must never
 *    throw away a message). Focus goes back to where it was.
 */
export interface HelpMountOptions {
  /** Sends the draft. Resolves to the outcome; must not throw (a throw is treated as a generic failure). */
  submit: (draft: HelpDraft) => Promise<HelpSubmitResult>;
  /** Called once, after the sheet is gone, however it closed. */
  onClose: () => void;
  /** "All tips": the sheet closes first, then the scene opens the Guide with every tip. */
  onAllTips?: () => void;
  includeShards?: boolean;
  allTipsLabel?: string | null;
  theme?: 'default' | 'dark';
  host?: HTMLElement;
  doc?: Document;
}

export interface HelpMountHandle {
  readonly scrim: HTMLElement;
  readonly popup: HelpPopupHandle;
  close: () => void;
  isClosed: () => boolean;
}

const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), [href], input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

const isVisible = (node: HTMLElement): boolean => {
  for (let current: HTMLElement | null = node; current; current = current.parentElement) {
    if (current.hidden) return false;
  }
  return true;
};

export const mountHelpPopup = (options: HelpMountOptions): HelpMountHandle => {
  const doc = options.doc ?? document;
  const host = options.host ?? doc.body;
  const previousFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
  let closed = false;

  const scrim = doc.createElement('div');
  scrim.className = `${FEEDBACK_SCRIM_CLASS} mazer-help-scrim`;
  scrim.dataset.mazerComponent = 'HelpScrim';
  applyFeedbackTheme(scrim, options.theme ?? 'default');

  const close = (): void => {
    if (closed) return;
    closed = true;
    scrim.remove();
    try {
      previousFocus?.focus({ preventScroll: true });
    } catch {
      // The element may be gone; the game keeps working without a restored focus.
    }
    options.onClose();
  };

  const popup = createHelpPopup({
    allTipsLabel: options.allTipsLabel ?? null,
    includeShards: options.includeShards === true,
    onAllTips: () => {
      close();
      options.onAllTips?.();
    },
    // Close is ignored while a send is in flight, so a player never reopens and sends the same message twice.
    onClose: () => {
      if (popup.getDraft().phase !== 'sending') close();
    },
    onSubmit: (draft) => {
      void options.submit(draft).then(
        (result) => result,
        (): HelpSubmitResult => ({ status: 'failed' })
      ).then((result) => {
        if (closed) return;
        popup.dispatch({ type: 'result', result });
      });
    }
  }, doc);

  // Escape never throws away a typed draft or a send in flight (same rule as a backdrop tap); the Close button still works.
  installFeedbackKeyIsolation(scrim, { onEscape: () => {
    const draft = popup.getDraft();
    const typed = draft.email.trim().length > 0 || draft.message.trim().length > 0;
    if (draft.phase !== 'sending' && !typed) close();
  }, onTab: (event) => {
    const items = Array.from(popup.root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
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
  } });
  scrim.addEventListener('click', (event) => {
    if (event.target !== scrim) return;
    const draft = popup.getDraft();
    const typed = draft.email.trim().length > 0 || draft.message.trim().length > 0;
    if (draft.phase !== 'sending' && !typed) close();
  });

  scrim.append(popup.root);
  host.append(scrim);
  popup.root.tabIndex = -1;
  popup.root.focus({ preventScroll: true });

  return { close, isClosed: () => closed, popup, scrim };
};
