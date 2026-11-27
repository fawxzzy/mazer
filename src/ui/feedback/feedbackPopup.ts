import { createMazerButton, createStatusBanner } from '../dom';
import {
  FEEDBACK_STAR_COLOUR_INTERVAL_MS,
  resolveFeedbackStarColour
} from './feedbackStarColour';
import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_COPY,
  FEEDBACK_COUNTER_FROM,
  canSubmitFeedback,
  createFeedbackDraft,
  reduceFeedbackDraft,
  type FeedbackDraft,
  type FeedbackEvent,
  type FeedbackNotice
} from './feedbackState';

/** Three candidate layouts for the same popup (Zac picks one). All share the state module and the kit buttons. */
export type FeedbackLayout = 'card' | 'sheet' | 'compact';

export interface FeedbackPopupOptions {
  layout: FeedbackLayout;
  /** Optional starting draft (options page states); the real game starts with createFeedbackDraft(). */
  draft?: FeedbackDraft;
  onSubmit?: (draft: FeedbackDraft) => void;
  onDismiss?: () => void;
  /** Stable id prefix so two popups on one page keep unique ids. */
  idPrefix?: string;
  /** Clock for the slow rainbow shift of the picked stars (tests pass a fixed one). Defaults to performance.now(). */
  now?: () => number;
}

export interface FeedbackPopupHandle {
  root: HTMLElement;
  dispatch: (event: FeedbackEvent) => void;
  getDraft: () => FeedbackDraft;
  /** Stops the star colour timer. Call when the popup is removed. */
  destroy: () => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const STAR_PATH = 'M12 2.4l2.9 6.1 6.7.9-4.9 4.6 1.2 6.6L12 17.4 6.1 20.6l1.2-6.6L2.4 9.4l6.7-.9z';

const createStar = (doc: Document): SVGSVGElement => {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('mazer-feedback__star-icon');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', STAR_PATH);
  svg.append(path);
  return svg;
};

const el = <K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] => {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * Builds one feedback popup. Everything visual comes from the real kit: createMazerButton (solid mint primary
 * Submit, quiet Not now), createStatusBanner (the in-flow notice), the shared design tokens, and the 44px touch
 * targets. The notice is ONE calm banner, never red inline text.
 */
export const createFeedbackPopup = (
  options: FeedbackPopupOptions,
  doc: Document = document
): FeedbackPopupHandle => {
  const prefix = options.idPrefix ?? `mazer-feedback-${options.layout}`;
  let draft = options.draft ?? createFeedbackDraft();
  const layout = options.layout;
  const now = options.now ?? (() => (typeof performance === 'undefined' ? 0 : performance.now()));

  const root = el(doc, 'section', `mazer-feedback mazer-feedback--${layout}`);
  root.dataset.mazerComponent = 'FeedbackPopup';
  root.dataset.layout = layout;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', `${prefix}-title`);

  const title = el(doc, 'h2', 'mazer-feedback__title mazer-sheet-title', FEEDBACK_COPY.title);
  title.id = `${prefix}-title`;

  const stars = el(doc, 'div', 'mazer-feedback__stars');
  stars.setAttribute('role', 'radiogroup');
  stars.setAttribute('aria-label', 'Rating, 1 to 5 stars');
  const starButtons: HTMLButtonElement[] = [];
  for (let value = 1; value <= 5; value += 1) {
    const button = el(doc, 'button', 'mazer-feedback__star');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-label', `${value} ${value === 1 ? 'star' : 'stars'}, ${FEEDBACK_COPY.starWords[value]}`);
    button.dataset.value = String(value);
    button.append(createStar(doc));
    button.addEventListener('click', () => dispatch({ type: 'rate', rating: value }));
    button.addEventListener('keydown', (event) => {
      const key = (event as KeyboardEvent).key;
      const step = key === 'ArrowRight' || key === 'ArrowUp' ? 1 : key === 'ArrowLeft' || key === 'ArrowDown' ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      const next = Math.min(5, Math.max(1, (draft.rating || (step > 0 ? 0 : 6)) + step));
      dispatch({ type: 'rate', rating: next });
      starButtons[next - 1]?.focus();
    });
    starButtons.push(button);
    stars.append(button);
  }

  const word = el(doc, 'p', 'mazer-feedback__word');
  word.setAttribute('aria-live', 'polite');

  const noteId = `${prefix}-note`;
  const noteWrap = el(doc, 'div', 'mazer-feedback__note');
  const noteLabel = el(doc, 'label', 'mazer-feedback__note-label', FEEDBACK_COPY.noteLabel);
  noteLabel.htmlFor = noteId;
  const textarea = el(doc, 'textarea', 'mazer-feedback__textarea');
  textarea.id = noteId;
  textarea.name = 'comment';
  textarea.rows = layout === 'compact' ? 2 : 3;
  textarea.maxLength = FEEDBACK_COMMENT_MAX;
  textarea.placeholder = FEEDBACK_COPY.notePlaceholder;
  textarea.autocomplete = 'off';
  textarea.addEventListener('input', () => dispatch({ type: 'comment', comment: textarea.value }));
  const counter = el(doc, 'span', 'mazer-feedback__counter');
  counter.setAttribute('aria-live', 'off');
  noteWrap.append(noteLabel, textarea, counter);

  // The sheet layout keeps the note folded until asked for (less friction, still optional).
  const addNote = createMazerButton({
    label: FEEDBACK_COPY.addNote,
    tone: 'quiet',
    className: 'mazer-feedback__add-note',
    onPress: () => {
      noteWrap.hidden = false;
      addNote.hidden = true;
      textarea.focus();
    }
  }, doc);

  const noticeSlot = el(doc, 'div', 'mazer-feedback__notice-slot');

  const submit = createMazerButton({
    label: FEEDBACK_COPY.submit,
    tone: 'primary',
    className: 'mazer-feedback__submit',
    onPress: () => {
      if (!canSubmitFeedback(draft)) return;
      dispatch({ type: 'submit' });
      options.onSubmit?.(draft);
    }
  }, doc);
  const dismiss = createMazerButton({
    label: FEEDBACK_COPY.dismiss,
    tone: 'quiet',
    className: 'mazer-feedback__dismiss',
    onPress: () => options.onDismiss?.()
  }, doc);
  const actions = el(doc, 'div', 'mazer-feedback__actions');
  actions.append(submit, dismiss);

  if (layout === 'sheet') {
    root.append(el(doc, 'span', 'mazer-feedback__grab'));
  }
  const head = el(doc, 'div', 'mazer-feedback__head');
  head.append(title);
  const rate = el(doc, 'div', 'mazer-feedback__rate');
  rate.append(stars, word);
  root.append(head, rate);
  if (layout === 'sheet') {
    root.append(addNote);
  }
  root.append(noteWrap, noticeSlot, actions);

  const renderNotice = (notice: FeedbackNotice | null): void => {
    noticeSlot.replaceChildren();
    if (!notice) return;
    noticeSlot.append(createStatusBanner({
      message: notice.message,
      tone: notice.tone === 'success' ? 'success' : 'info',
      className: 'mazer-feedback__banner'
    }, doc));
  };

  const render = (): void => {
    starButtons.forEach((button, index) => {
      const on = index < draft.rating;
      button.classList.toggle('is-on', on);
      // Picked stars: a flat fill in the shared rainbow material (never a glow); unpicked ones keep the outline colour.
      button.style.color = on ? resolveFeedbackStarColour(index, now()) : '';
      button.setAttribute('aria-checked', String(index + 1 === draft.rating));
      button.tabIndex = draft.rating === 0 ? (index === 0 ? 0 : -1) : (index + 1 === draft.rating ? 0 : -1);
      button.disabled = draft.phase !== 'editing';
    });
    word.textContent = draft.rating === 0 ? FEEDBACK_COPY.hintNoStar : FEEDBACK_COPY.starWords[draft.rating];
    word.classList.toggle('is-hint', draft.rating === 0);
    if (textarea.value !== draft.comment) textarea.value = draft.comment;
    textarea.disabled = draft.phase !== 'editing';
    const length = Array.from(draft.comment).length;
    counter.textContent = length >= FEEDBACK_COUNTER_FROM ? `${length}/${FEEDBACK_COMMENT_MAX}` : '';
    submit.disabled = !canSubmitFeedback(draft);
    submit.textContent = draft.phase === 'sending' ? FEEDBACK_COPY.sending : FEEDBACK_COPY.submit;
    if (draft.phase === 'sent') {
      actions.hidden = true;
    }
    renderNotice(draft.notice);
    if (layout === 'sheet' && draft.comment.length > 0) {
      noteWrap.hidden = false;
      addNote.hidden = true;
    }
  };

  function dispatch(event: FeedbackEvent): void {
    draft = reduceFeedbackDraft(draft, event);
    render();
  }

  if (layout === 'sheet' && draft.comment.length === 0) {
    noteWrap.hidden = true;
  }
  render();
  // The colour moves slowly in every motion mode (Reduce Motion stops movement, never colour: VIS-066).
  const colourTimer = typeof window === 'undefined'
    ? null
    : window.setInterval(() => {
      if (draft.rating > 0) {
        starButtons.forEach((button, index) => {
          if (index < draft.rating) button.style.color = resolveFeedbackStarColour(index, now());
        });
      }
    }, FEEDBACK_STAR_COLOUR_INTERVAL_MS);
  const destroy = (): void => {
    if (colourTimer !== null) window.clearInterval(colourTimer);
  };
  return { root, dispatch, getDraft: () => draft, destroy };
};
