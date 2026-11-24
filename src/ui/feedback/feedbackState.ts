/**
 * In-game feedback popup: pure state and copy (no DOM, no network). MAZER-FB-001: wired into the Menu dropdown by
 * src/legacy-runtime/legacyFeedbackLauncher.ts (signed-in only, menu row only, no auto prompt). See
 * docs/ui/MAZER-FEEDBACK-POPUP-PLAN-2026-11-23.md and docs/ops/sql-proposals/mazer-feedback-20261124-v2/.
 *
 * Rules this module pins:
 *  - the popup always opens with NO star selected (rating 0) and Submit disabled until a star is picked;
 *  - the comment is optional, trimmed, and capped at the server cap (500 characters);
 *  - a failed or rate-limited submit never shows red inline text: it becomes ONE calm in-flow notice and the
 *    player's rating and note stay in place so a retry loses nothing.
 */

export const FEEDBACK_COMMENT_MAX = 500;
/** The counter only appears near the cap so a short note never shows one. */
export const FEEDBACK_COUNTER_FROM = 400;

export type FeedbackRating = 0 | 1 | 2 | 3 | 4 | 5;
export type FeedbackSource = 'menu' | 'post_level' | 'pause';

export interface FeedbackNotice {
  /** Never 'error': feedback failures are not alarms. */
  tone: 'info' | 'success';
  message: string;
}

export interface FeedbackDraft {
  rating: FeedbackRating;
  comment: string;
  phase: 'editing' | 'sending' | 'sent';
  notice: FeedbackNotice | null;
}

export const FEEDBACK_COPY = Object.freeze({
  title: 'How is Mazer?',
  hintNoStar: 'Tap a star.',
  noteLabel: 'Note (optional)',
  notePlaceholder: 'What should we know?',
  addNote: 'Add a note',
  submit: 'Submit',
  sending: 'Sending',
  dismiss: 'Not now',
  sent: 'Thanks. Your feedback was sent.',
  starWords: Object.freeze(['', 'Poor', 'Meh', 'OK', 'Good', 'Great'] as const),
  /** Offline or a failed call: the draft stays, nothing is lost. */
  failedNotice: 'Could not send. Your rating and note are kept, so try again in a minute.',
  offlineNotice: 'You are offline. Your rating and note are kept, so send it once you are back online.',
  signedOutNotice: 'You are signed out. Sign in again to send this. Your rating and note are kept until you close this.',
  rateLimitedNotice: (retryAfterSeconds: number): string => {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    return `You have sent a few already. Try again in about ${minutes} min.`;
  }
});

export const createFeedbackDraft = (): FeedbackDraft => ({
  rating: 0,
  comment: '',
  phase: 'editing',
  notice: null
});

export const clampFeedbackRating = (value: unknown): FeedbackRating => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
  return (n >= 1 && n <= 5 ? n : 0) as FeedbackRating;
};

export const clampFeedbackComment = (value: string): string => (
  value.length > FEEDBACK_COMMENT_MAX ? Array.from(value).slice(0, FEEDBACK_COMMENT_MAX).join('') : value
);

export type FeedbackEvent =
  | { type: 'rate'; rating: number }
  | { type: 'comment'; comment: string }
  | { type: 'submit' }
  | { type: 'result'; result: FeedbackSubmitResult };

export type FeedbackSubmitResult =
  | { status: 'saved' }
  | { status: 'rate_limited'; retryAfterSeconds: number }
  | { status: 'offline' }
  /** The session ended while the popup was open (the RPC is signed-in only). */
  | { status: 'signed_out' }
  | { status: 'failed' };

export const canSubmitFeedback = (draft: FeedbackDraft): boolean => (
  draft.rating >= 1 && draft.phase === 'editing'
);

export const reduceFeedbackDraft = (draft: FeedbackDraft, event: FeedbackEvent): FeedbackDraft => {
  if (draft.phase === 'sent') {
    return draft;
  }
  switch (event.type) {
    case 'rate': {
      if (draft.phase === 'sending') return draft;
      const rating = clampFeedbackRating(event.rating);
      return rating === 0 ? draft : { ...draft, rating, notice: null };
    }
    case 'comment':
      if (draft.phase === 'sending') return draft;
      return { ...draft, comment: clampFeedbackComment(event.comment), notice: null };
    case 'submit':
      return canSubmitFeedback(draft) ? { ...draft, phase: 'sending', notice: null } : draft;
    case 'result': {
      if (draft.phase !== 'sending') return draft;
      const { result } = event;
      if (result.status === 'saved') {
        return { ...draft, phase: 'sent', notice: { tone: 'success', message: FEEDBACK_COPY.sent } };
      }
      const message = result.status === 'rate_limited'
        ? FEEDBACK_COPY.rateLimitedNotice(result.retryAfterSeconds)
        : result.status === 'offline'
          ? FEEDBACK_COPY.offlineNotice
          : result.status === 'signed_out' ? FEEDBACK_COPY.signedOutNotice : FEEDBACK_COPY.failedNotice;
      return { ...draft, phase: 'editing', notice: { tone: 'info', message } };
    }
  }
};

/** What the client sends to mazer.mazer_submit_feedback_v1 (the server derives the user id; it is never a parameter). */
export interface FeedbackSubmitPayload {
  p_rating: number;
  p_comment: string | null;
  p_build_id: string | null;
  p_player_level: number | null;
  p_game_mode: string | null;
  p_source: FeedbackSource;
}

export const buildFeedbackPayload = (
  draft: FeedbackDraft,
  context: { buildId?: string | null; playerLevel?: number | null; gameMode?: string | null; source?: FeedbackSource }
): FeedbackSubmitPayload => {
  const comment = draft.comment.trim();
  return {
    p_rating: draft.rating,
    p_comment: comment.length > 0 ? comment : null,
    p_build_id: context.buildId ?? null,
    p_player_level: context.playerLevel ?? null,
    p_game_mode: context.gameMode ?? null,
    p_source: context.source ?? 'menu'
  };
};

/**
 * Where the popup may open. It is NEVER opened automatically while a run is active: only from the menu row,
 * and (later) at the end of a level once N levels have been completed, once per cooldown.
 */
export const FEEDBACK_AUTO_PROMPT_EVERY_LEVELS = 10;
export const FEEDBACK_AUTO_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export const shouldOfferFeedbackAfterLevel = (input: {
  runActive: boolean;
  levelsCompletedSincePrompt: number;
  lastPromptAtMs: number | null;
  nowMs: number;
}): boolean => (
  !input.runActive
  && input.levelsCompletedSincePrompt >= FEEDBACK_AUTO_PROMPT_EVERY_LEVELS
  && (input.lastPromptAtMs === null || input.nowMs - input.lastPromptAtMs >= FEEDBACK_AUTO_PROMPT_COOLDOWN_MS)
);
