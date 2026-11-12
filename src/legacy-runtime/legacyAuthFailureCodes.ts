/**
 * Stable diagnostics codes for sign-in and boot failures that are NOT an OAuth
 * callback failure (those use MazerOAuthFailureCategory in
 * legacyAccountPortal.ts). MAZER-ACCT-014.
 *
 * Why: a player on a Galaxy S21 reported "a session was not available" and the
 * quarantine and session-read paths at boot showed generic copy with no code,
 * so a report could not be told apart from any other failure. Each path now
 * sets one of these on the auth snapshot (`errorCode`), which reaches
 * runtime diagnostics as `technicalDetail` of the auth message.
 *
 * Rules: codes are plain snake_case tokens, never carry an email, id, token or
 * provider text, and are never drawn to the player. The same strings must stay
 * recognised by LEGACY_OAUTH_FAILURE_CLASS_BY_CODE in legacyPlayerMessage.ts
 * (an unrecognised code is recorded as `oauth-failure:unmapped`).
 */
export const LEGACY_AUTH_FAILURE_CODES = {
  /** Leaving for the shared account portal threw (navigation refused). */
  portalNavigationFailed: 'portal_navigation_failed',
  /**
   * The pre-flight before leaving for the sign-in page found the account
   * service down, so the app stayed put (MAZER-ACCT-036). Emitted as an
   * oauth-failure category by beginMazerOAuthAuthorization.
   */
  providerUnreachable: 'provider_unreachable',
  /** A shared-account session commit is held in quarantine and did not clear. */
  sessionQuarantined: 'session_quarantined',
  /** Reading the saved session threw, or the read returned an error. */
  sessionReadFailed: 'session_read_failed'
} as const;

export type LegacyAuthFailureCode = typeof LEGACY_AUTH_FAILURE_CODES[keyof typeof LEGACY_AUTH_FAILURE_CODES];
