import { createMazerButton, createMazerField, createStatusBanner } from '../dom';
import {
  HELP_COPY,
  HELP_MESSAGE_MAX,
  createHelpDraft,
  reduceHelpDraft,
  resolveHelpViewModel,
  type HelpDraft,
  type HelpEvent
} from './helpState';

/**
 * Builds the Help sheet (MAZER-ONB-001 family). Everything visual is the real kit: createMazerButton (solid mint primary,
 * quiet Close / Back), createMazerField (the email), the kit field look for the message box, createStatusBanner (the
 * one in-flow notice) and the shared tokens; help.css dresses the panel and the answers in the neon edge text skin
 * (src/ui/skin/neonTextSkin.ts). What shows and when comes only from resolveHelpViewModel (helpState.ts).
 *
 * The two views share one sheet: "Help" (short answers, All tips, Contact us) and "Contact support" (the email-first
 * form). Inputs are built once and only shown, hidden and refilled, so typing never loses focus.
 */
export interface HelpPopupOptions {
  /** Optional starting draft (tests); the game starts with createHelpDraft(). */
  draft?: HelpDraft;
  /** The shard answer shows only while shards can appear (the hazard layer). */
  includeShards?: boolean;
  /** The "All tips" label when the first-time Guide hides tips; null/absent = no All tips block. */
  allTipsLabel?: string | null;
  onSubmit?: (draft: HelpDraft) => void;
  onAllTips?: () => void;
  onClose?: () => void;
  idPrefix?: string;
}

export interface HelpPopupHandle {
  root: HTMLElement;
  dispatch: (event: HelpEvent) => void;
  getDraft: () => HelpDraft;
}

/** The message counter appears near the cap only (a counter from the first letter reads like a test). */
export const HELP_COUNTER_FROM = 1500;

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

export const createHelpPopup = (options: HelpPopupOptions = {}, doc: Document = document): HelpPopupHandle => {
  const prefix = options.idPrefix ?? 'mazer-help';
  let draft = options.draft ?? createHelpDraft();
  const viewOptions = { allTipsLabel: options.allTipsLabel ?? null, includeShards: options.includeShards === true };

  const root = el(doc, 'section', 'mazer-help');
  root.dataset.mazerComponent = 'HelpPopup';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', `${prefix}-title`);

  // Head: kicker + title (the neon skin's two-line heading) and a quiet Close.
  const head = el(doc, 'header', 'mazer-help__head');
  const heading = el(doc, 'div', 'mazer-help__heading');
  const kicker = el(doc, 'span', 'mazer-help__kicker', HELP_COPY.kicker);
  const title = el(doc, 'h2', 'mazer-help__title mazer-sheet-title');
  title.id = `${prefix}-title`;
  heading.append(kicker, title);
  const close = createMazerButton({
    label: HELP_COPY.close,
    tone: 'quiet',
    className: 'mazer-help__close',
    onPress: () => options.onClose?.()
  }, doc);
  head.append(heading, close);

  // View A: short answers, then All tips (when anything is hidden), then the primary Contact us.
  const answers = el(doc, 'div', 'mazer-help__answers');
  const faqList = el(doc, 'div', 'mazer-help__faq-list');
  const vm0 = resolveHelpViewModel(draft, viewOptions);
  vm0.faqRows.forEach((row, index) => {
    const item = el(doc, 'details', 'mazer-help__faq');
    item.dataset.faqId = row.id;
    if (index === 0) item.open = true;
    const summary = el(doc, 'summary', 'mazer-help__question', row.question);
    const answer = el(doc, 'p', 'mazer-help__answer', row.answer);
    item.append(summary, answer);
    faqList.append(item);
  });
  const allTips = el(doc, 'div', 'mazer-help__all-tips');
  const allTipsLede = el(doc, 'p', 'mazer-help__all-tips-lede');
  const allTipsButton = createMazerButton({
    label: vm0.allTips?.label ?? '',
    tone: 'secondary',
    className: 'mazer-help__all-tips-button',
    onPress: () => options.onAllTips?.()
  }, doc);
  allTips.append(allTipsLede, allTipsButton);
  const contactUs = createMazerButton({
    label: HELP_COPY.contactUs,
    tone: 'primary',
    className: 'mazer-help__contact-us',
    onPress: () => {
      dispatch({ type: 'open-form' });
      email.input.focus({ preventScroll: true });
    }
  }, doc);
  answers.append(faqList, allTips, contactUs);

  // View C: email first, then the message, the notice, the Contact us fallback and the actions.
  const form = el(doc, 'form', 'mazer-help__form');
  form.noValidate = true;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });
  const fields = el(doc, 'div', 'mazer-help__fields');
  const email = createMazerField({
    id: `${prefix}-email`,
    label: HELP_COPY.emailLabel,
    type: 'email',
    autoComplete: 'email',
    inputMode: 'email',
    placeholder: HELP_COPY.emailPlaceholder,
    description: HELP_COPY.emailHint,
    className: 'mazer-help__email',
    onInput: () => dispatch({ type: 'email', email: email.input.value })
  }, doc);
  email.input.name = 'email';
  const messageField = el(doc, 'div', 'mazer-field mazer-help__message');
  const messageLabel = el(doc, 'label', 'mazer-field__label', HELP_COPY.messageLabel);
  const textarea = el(doc, 'textarea', 'mazer-field__input mazer-help__textarea');
  textarea.id = `${prefix}-message`;
  textarea.name = 'message';
  textarea.rows = 4;
  textarea.maxLength = HELP_MESSAGE_MAX;
  textarea.placeholder = HELP_COPY.messagePlaceholder;
  textarea.autocomplete = 'off';
  messageLabel.htmlFor = textarea.id;
  textarea.addEventListener('input', () => dispatch({ type: 'message', message: textarea.value }));
  const counter = el(doc, 'span', 'mazer-help__counter');
  counter.setAttribute('aria-live', 'off');
  messageField.append(messageLabel, textarea);
  fields.append(email.root, messageField, counter);

  const noticeSlot = el(doc, 'div', 'mazer-help__notice-slot');
  noticeSlot.setAttribute('aria-live', 'polite');
  const contactFallback = el(doc, 'p', 'mazer-help__contact');
  const contactLede = el(doc, 'span', 'mazer-help__contact-lede');
  const contactLink = el(doc, 'a', 'mazer-help__contact-link');
  contactFallback.append(contactLede, contactLink);

  const send = createMazerButton({
    label: HELP_COPY.send,
    tone: 'primary',
    className: 'mazer-help__send',
    onPress: () => submit()
  }, doc);
  send.type = 'submit';
  const back = createMazerButton({
    label: HELP_COPY.back,
    tone: 'quiet',
    className: 'mazer-help__back',
    onPress: () => {
      dispatch({ type: 'back' });
      contactUs.focus({ preventScroll: true });
    }
  }, doc);
  const actions = el(doc, 'div', 'mazer-help__actions');
  actions.append(send, back);
  form.append(fields, noticeSlot, contactFallback, actions);

  root.append(head, answers, form);

  function submit(): void {
    const before = draft;
    dispatch({ type: 'submit' });
    if (before.phase === 'editing' && draft.phase === 'sending') options.onSubmit?.(draft);
  }

  let renderedNoticeKey = '';
  const renderNotice = (): void => {
    const vm = resolveHelpViewModel(draft, viewOptions);
    const notice = vm.notice;
    const key = notice ? `${notice.tone}|${notice.message}|${notice.retry}` : '';
    if (key === renderedNoticeKey) return;
    renderedNoticeKey = key;
    noticeSlot.replaceChildren();
    if (!notice) return;
    noticeSlot.append(createStatusBanner({
      message: notice.message,
      tone: notice.tone,
      className: 'mazer-help__banner'
    }, doc));
  };

  const render = (): void => {
    const vm = resolveHelpViewModel(draft, viewOptions);
    root.dataset.view = vm.view;
    title.textContent = vm.title;
    answers.hidden = vm.view !== 'answers';
    form.hidden = vm.view !== 'form';
    allTips.hidden = vm.allTips === null;
    if (vm.allTips) {
      allTipsLede.textContent = vm.allTips.lede;
      allTipsButton.textContent = vm.allTips.label;
    }
    fields.hidden = vm.formHidden;
    send.hidden = vm.formHidden;
    if (email.input.value !== draft.email) email.input.value = draft.email;
    if (textarea.value !== draft.message) textarea.value = draft.message;
    email.input.disabled = vm.fieldsDisabled;
    textarea.disabled = vm.fieldsDisabled;
    const length = Array.from(draft.message).length;
    counter.textContent = length >= HELP_COUNTER_FROM ? `${length}/${HELP_MESSAGE_MAX}` : '';
    counter.hidden = counter.textContent.length === 0;
    send.disabled = vm.sendDisabled;
    send.textContent = vm.sendLabel;
    back.disabled = draft.phase === 'sending';
    renderNotice();
    contactFallback.hidden = vm.contactFallback === null;
    if (vm.contactFallback) {
      contactLede.textContent = `${vm.contactFallback.lede} `;
      contactLink.textContent = vm.contactFallback.email;
      contactLink.href = vm.contactFallback.href;
    }
  };

  function dispatch(event: HelpEvent): void {
    draft = reduceHelpDraft(draft, event);
    render();
  }

  render();
  return { root, dispatch, getDraft: () => draft };
};
