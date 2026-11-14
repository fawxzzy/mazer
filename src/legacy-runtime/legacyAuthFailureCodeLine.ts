import type { LegacyPlayerMessage } from './legacyPlayerMessage';

/**
 * MAZER-ACCT-031: the one small "Code: <short_code>" line under a sign-in
 * failure message, so a screenshot from a player's phone identifies the failure.
 *
 * Source of truth is the message's `technicalDetail`, which MAZER-ACCT-014 fills
 * with `oauth-failure:<code>` where <code> is a known stable code or the literal
 * `unmapped` (resolveLegacyOAuthFailureTechnicalDetail). Provider text may follow
 * after `;`, so ONLY the leading code token is ever read, and only when it is a
 * plain snake_case token. No name, address, id or provider text can reach the
 * line.
 */
const CODE_DETAIL_PATTERN = /^oauth-failure:([a-z][a-z0-9_]{0,39})(?:;|$)/;

export const LEGACY_AUTH_FAILURE_CODE_LINE_PREFIX = 'Code: ';

export const resolveLegacyAuthFailureCodeLine = (
  message: Pick<LegacyPlayerMessage, 'source' | 'technicalDetail' | 'tone'>
): string | null => {
  if (message.source !== 'auth' || message.tone !== 'error' || message.technicalDetail === null) {
    return null;
  }
  const match = CODE_DETAIL_PATTERN.exec(message.technicalDetail);
  return match ? `${LEGACY_AUTH_FAILURE_CODE_LINE_PREFIX}${match[1]}` : null;
};
