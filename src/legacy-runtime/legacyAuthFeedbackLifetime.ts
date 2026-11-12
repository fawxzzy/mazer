/**
 * How long the sign-in feedback line stays on screen (MAZER-ACCT-015).
 *
 * Measured 2026-11-12 in headless Chromium at 390x844 on the unmodified scene:
 *   - a failure applied at boot (callback failure code) stayed 5015 ms, a fixed
 *     5000 ms timer, shorter than it takes to read the longest failure sentence
 *     (about 21 words) and gone before a player who looked away could return;
 *   - a failure from tapping Login (authorization or storage unavailable) stayed
 *     17 ms, a single frame, because that path never armed the timer, so the
 *     expiry check (`time >= expiresAt`, initially -Infinity) cleared it at once.
 *
 * Rule now: a sign-in FAILURE stays until the next sign-in attempt clears it
 * (handleSharedAccountAuthorization resets error and code first) or a new auth
 * snapshot replaces it. Other feedback (for example "Account connected.") keeps
 * the short timer. The toast copy of a failure has its own 8000 ms floor in
 * legacyPlayerMessage.ts (LEGACY_AUTH_FAILURE_MESSAGE_MIN_DURATION_MS).
 */
import { isLegacyOAuthFailureCopy } from './legacyPlayerMessage';

export const LEGACY_AUTH_INFO_FEEDBACK_DURATION_MS = 5000;

export interface LegacyAuthFeedbackInput {
  /** A signed-in player has nothing to retry, so a stray error keeps the short timer. */
  authenticated?: boolean;
  error: string | null | undefined;
  errorCode?: string | null | undefined;
  info: string | null | undefined;
}

/** True for a sign-in failure: it has an internal code, or it is a class sentence. */
export const isLegacyAuthSignInFailure = (feedback: LegacyAuthFeedbackInput): boolean => {
  const error = feedback.error?.trim() ?? '';
  if (error.length === 0 || feedback.authenticated === true) {
    return false;
  }
  return (feedback.errorCode?.length ?? 0) > 0 || isLegacyOAuthFailureCopy(error);
};

/**
 * Absolute scene time at which the feedback line is cleared. +Infinity means
 * "until the next attempt"; -Infinity means there is nothing to show.
 */
export const resolveLegacyAuthFeedbackExpiresAtMs = (
  nowMs: number,
  feedback: LegacyAuthFeedbackInput
): number => {
  if (isLegacyAuthSignInFailure(feedback)) {
    return Number.POSITIVE_INFINITY;
  }
  const hasFeedback = (feedback.error?.trim().length ?? 0) > 0 || (feedback.info?.trim().length ?? 0) > 0;
  return hasFeedback ? nowMs + LEGACY_AUTH_INFO_FEEDBACK_DURATION_MS : Number.NEGATIVE_INFINITY;
};
