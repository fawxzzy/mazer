/**
 * Help screen (MAZER-ONB-001 family): pure state, copy and view model. No DOM, no network.
 *
 * Zac's picks (2026-11-26, options page help-options.html from PR #728): a "Help" row right after Guide (placement A),
 * short answers plus a primary "Contact us" (view A), and an email-first form (form C). The send path is the live RPC
 * mazer.mazer_submit_help_request_v1 (docs/ops/sql-proposals/mazer-help-requests-20261126/README.md, "Client plan");
 * src/legacy-runtime/legacyHelpSubmit.ts maps its answers onto HelpSubmitResult.
 *
 * Rules this module pins (tests/ui/help-state.test.ts):
 *  - every notice is ONE calm in-flow banner (tone info or success), never red text under a field;
 *  - a rate-limited answer ALWAYS shows the "Contact us" fallback (the address outside the form), so a flooded guest
 *    pool never leaves a player with no way to ask for help (README "Known trade-off");
 *  - Send is disabled until the message has text; the message is capped at the server cap (2000 characters);
 *  - the typed email is never pre-filled, stored or logged: it lives only in the open form's draft;
 *  - a failed send keeps both fields, so a retry loses nothing.
 */

/** Server cap on the message (characters, after trimming). */
export const HELP_MESSAGE_MAX = 2000;
/** Server cap on the email (characters, after trimming). */
export const HELP_EMAIL_MAX = 254;
export const HELP_EMAIL_MIN = 3;
/** The same shape check the server runs (`local@domain.tld`, no spaces, one `@`). */
const HELP_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The "Contact us" fallback outside the form (Zac approved this address, 2026-11-28). */
export const HELP_CONTACT_EMAIL = 'fawxzzy@gmail.com';
export const HELP_CONTACT_HREF = `mailto:${HELP_CONTACT_EMAIL}`;

export const HELP_COPY = Object.freeze({
  title: 'Help',
  kicker: 'Mazer',
  close: 'Close',
  contactUs: 'Contact us',
  formTitle: 'Contact support',
  back: 'Back',
  emailLabel: 'Your email',
  emailHint: 'We reply here.',
  emailPlaceholder: 'you@example.com',
  messageLabel: 'Message',
  messagePlaceholder: 'Tell us what happened',
  send: 'Send',
  sending: 'Sending',
  tryAgain: 'Try again',
  allTipsLede: 'See every Guide tip, even the ones you have not met yet.',
  contactFallbackLede: 'You can also email us:',
  sent: 'Sent. Thank you, we will reply by email.',
  badEmail: 'Check your email address and try again.',
  messageEmpty: 'Write a message first.',
  messageTooLong: 'Your message is too long. Keep it under 2000 characters.',
  failed: 'Could not send. Check your connection and try again.',
  rateLimited: (retryAfterSeconds: number): string => (
    `You have sent a few messages already. Try again in ${formatHelpRetryWait(retryAfterSeconds)}.`
  )
});

export interface HelpFaqRow {
  readonly id: 'progress' | 'shards' | 'sound';
  readonly question: string;
  readonly answer: string;
}

/** The short answers (options page copy, view A). The shard row shows only while shards can appear (the hazard layer). */
export const HELP_FAQ_ROWS: readonly HelpFaqRow[] = Object.freeze([
  Object.freeze({
    id: 'progress' as const,
    question: 'My progress is missing',
    answer: 'Progress saves to this device. Sign in from Profile to keep it across devices.'
  }),
  Object.freeze({
    id: 'shards' as const,
    question: 'The shards will not let me finish',
    answer: 'Take every shard in order. The next one pulses; the star opens when all are taken.'
  }),
  Object.freeze({
    id: 'sound' as const,
    question: 'Sound is off',
    answer: 'Open the menu and set Sound to On. Your phone silent switch can also mute the game.'
  })
]);

export const resolveHelpFaqRows = (options: { includeShards?: boolean } = {}): readonly HelpFaqRow[] => (
  options.includeShards === true ? HELP_FAQ_ROWS : HELP_FAQ_ROWS.filter((row) => row.id !== 'shards')
);

/** "N minutes" from a wait in seconds: ceil to whole minutes, shown in hours when over 90 minutes. */
export const formatHelpRetryWait = (retryAfterSeconds: number): string => {
  const seconds = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : 60;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes > 90) {
    const hours = Math.ceil(minutes / 60);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
};

/** The server's email rule, client side, so an obvious typo never costs a round trip. */
export const isHelpEmailValid = (email: string): boolean => {
  const trimmed = email.trim();
  return trimmed.length >= HELP_EMAIL_MIN && trimmed.length <= HELP_EMAIL_MAX && HELP_EMAIL_PATTERN.test(trimmed);
};

export type HelpSubmitResult =
  | { status: 'saved' }
  | { status: 'rate_limited'; retryAfterSeconds: number }
  | { status: 'bad_email' }
  | { status: 'message_empty' }
  | { status: 'message_too_long' }
  | { status: 'offline' }
  | { status: 'failed' };

export interface HelpNotice {
  /** Never 'error' or 'warning': a help failure is not an alarm. */
  readonly tone: 'info' | 'success';
  readonly message: string;
  /** The banner carries a "Try again" action (offline / failed). */
  readonly retry: boolean;
  /** Show the "Contact us" fallback under the banner (always for rate_limited, and for a generic failure). */
  readonly contact: boolean;
}

export type HelpView = 'answers' | 'form';

export interface HelpDraft {
  readonly view: HelpView;
  readonly phase: 'editing' | 'sending' | 'sent';
  readonly email: string;
  readonly message: string;
  readonly notice: HelpNotice | null;
}

export type HelpEvent =
  | { type: 'open-form' }
  | { type: 'back' }
  | { type: 'email'; email: string }
  | { type: 'message'; message: string }
  | { type: 'submit' }
  | { type: 'result'; result: HelpSubmitResult };

/** Always starts on the answers with empty fields: nothing is pre-filled (never the account email either). */
export const createHelpDraft = (): HelpDraft => ({ view: 'answers', phase: 'editing', email: '', message: '', notice: null });

const clampHelpMessage = (value: string): string => (
  Array.from(value).length > HELP_MESSAGE_MAX ? Array.from(value).slice(0, HELP_MESSAGE_MAX).join('') : value
);

export const canSendHelp = (draft: HelpDraft): boolean => (
  draft.view === 'form' && draft.phase === 'editing' && draft.message.trim().length > 0
);

const notice = (message: string, extra: Partial<Omit<HelpNotice, 'message'>> = {}): HelpNotice => ({
  tone: extra.tone ?? 'info',
  message,
  retry: extra.retry ?? false,
  contact: extra.contact ?? false
});

/** One result into one notice. rate_limited always carries the Contact us fallback. */
export const resolveHelpResultNotice = (result: HelpSubmitResult): HelpNotice => {
  switch (result.status) {
    case 'saved': return notice(HELP_COPY.sent, { tone: 'success' });
    case 'rate_limited': return notice(HELP_COPY.rateLimited(result.retryAfterSeconds), { contact: true });
    case 'bad_email': return notice(HELP_COPY.badEmail);
    case 'message_empty': return notice(HELP_COPY.messageEmpty);
    case 'message_too_long': return notice(HELP_COPY.messageTooLong);
    case 'offline': return notice(HELP_COPY.failed, { retry: true });
    case 'failed': return notice(HELP_COPY.failed, { retry: true, contact: true });
  }
};

export const reduceHelpDraft = (draft: HelpDraft, event: HelpEvent): HelpDraft => {
  switch (event.type) {
    case 'open-form':
      return draft.view === 'form' ? draft : { ...draft, view: 'form', notice: draft.phase === 'sent' ? draft.notice : null };
    case 'back':
      // Back keeps what was typed (an accidental Back must not lose a message); a sent form starts clean next time.
      if (draft.phase === 'sending') return draft;
      return draft.phase === 'sent'
        ? { ...createHelpDraft() }
        : { ...draft, view: 'answers', notice: null };
    case 'email':
      if (draft.phase !== 'editing') return draft;
      return { ...draft, email: event.email.slice(0, HELP_EMAIL_MAX + 64), notice: null };
    case 'message':
      if (draft.phase !== 'editing') return draft;
      return { ...draft, message: clampHelpMessage(event.message), notice: null };
    case 'submit': {
      if (!canSendHelp(draft)) return draft;
      if (!isHelpEmailValid(draft.email)) return { ...draft, notice: resolveHelpResultNotice({ status: 'bad_email' }) };
      return { ...draft, phase: 'sending', notice: null };
    }
    case 'result': {
      if (draft.phase !== 'sending') return draft;
      const result = event.result;
      if (result.status === 'saved') {
        return { ...draft, phase: 'sent', email: '', message: '', notice: resolveHelpResultNotice(result) };
      }
      return { ...draft, phase: 'editing', notice: resolveHelpResultNotice(result) };
    }
  }
};

/** What the client sends to mazer.mazer_submit_help_request_v1 (no user id: the server reads auth.uid()). */
export interface HelpSubmitPayload {
  readonly p_email: string;
  readonly p_message: string;
  readonly p_build_id: string | null;
  readonly p_player_level: number | null;
  readonly p_game_mode: string | null;
}

export const buildHelpPayload = (
  draft: Pick<HelpDraft, 'email' | 'message'>,
  context: { buildId?: string | null; playerLevel?: number | null; gameMode?: string | null }
): HelpSubmitPayload => ({
  p_email: draft.email.trim(),
  p_message: draft.message.trim(),
  p_build_id: context.buildId ?? null,
  p_player_level: context.playerLevel ?? null,
  p_game_mode: context.gameMode ?? null
});

/** The view model the popup paints: which blocks show and their state. Pure, so the rules above are testable. */
export interface HelpViewModel {
  readonly view: HelpView;
  readonly title: string;
  readonly faqRows: readonly HelpFaqRow[];
  /** "All tips" (first-time cards, moved here from the Guide foot). Null when there is nothing hidden to show. */
  readonly allTips: { readonly label: string; readonly lede: string } | null;
  readonly sendLabel: string;
  readonly sendDisabled: boolean;
  readonly fieldsDisabled: boolean;
  /** The form fields and Send are hidden once sent (only the thank-you and Back stay). */
  readonly formHidden: boolean;
  readonly notice: HelpNotice | null;
  /** The address outside the form. Non-null whenever the notice asks for it (always on rate_limited). */
  readonly contactFallback: { readonly lede: string; readonly email: string; readonly href: string } | null;
}

export const resolveHelpViewModel = (
  draft: HelpDraft,
  options: { includeShards?: boolean; allTipsLabel?: string | null } = {}
): HelpViewModel => ({
  view: draft.view,
  title: draft.view === 'form' ? HELP_COPY.formTitle : HELP_COPY.title,
  faqRows: resolveHelpFaqRows({ includeShards: options.includeShards }),
  allTips: typeof options.allTipsLabel === 'string' && options.allTipsLabel.length > 0
    ? { label: options.allTipsLabel, lede: HELP_COPY.allTipsLede }
    : null,
  // After a failed send the primary button itself is the retry ("Try again"); the banner carries no second button, so
  // its message keeps the full width on a 390px phone.
  sendLabel: draft.phase === 'sending' ? HELP_COPY.sending : (draft.notice?.retry ? HELP_COPY.tryAgain : HELP_COPY.send),
  sendDisabled: !canSendHelp(draft),
  fieldsDisabled: draft.phase !== 'editing',
  formHidden: draft.phase === 'sent',
  notice: draft.view === 'form' ? draft.notice : null,
  contactFallback: draft.view === 'form' && draft.notice?.contact === true
    ? { lede: HELP_COPY.contactFallbackLede, email: HELP_CONTACT_EMAIL, href: HELP_CONTACT_HREF }
    : null
});
