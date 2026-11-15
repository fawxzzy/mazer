import { describe, expect, test } from 'vitest';
import {
  LEGACY_AUTH_MESSAGE_COPY,
  LEGACY_BOOT_MESSAGE_COPY,
  LEGACY_OAUTH_FAILURE_MESSAGE_COPY,
  LEGACY_OFFLINE_MESSAGE_COPY,
  LEGACY_OVERLAY_MESSAGE_COPY,
  LEGACY_REMOTE_MESSAGE_COPY
} from '../../src/legacy-runtime/legacyPlayerMessage';
import { LEGACY_GUEST_PLAY_ACCESS_ENABLED } from '../../src/legacy-runtime/legacyGuestAccess';

// MAZER-UI-018: pins the player message rows to live copy and keeps stale
// guest-play promises out while guests cannot play.
describe('player message copy rows', () => {
  test('no player message promises guest play while guests cannot play', () => {
    expect(LEGACY_GUEST_PLAY_ACCESS_ENABLED).toBe(false);
    const tables = {
      LEGACY_AUTH_MESSAGE_COPY,
      LEGACY_BOOT_MESSAGE_COPY,
      LEGACY_OAUTH_FAILURE_MESSAGE_COPY,
      LEGACY_OFFLINE_MESSAGE_COPY,
      LEGACY_OVERLAY_MESSAGE_COPY,
      LEGACY_REMOTE_MESSAGE_COPY
    } as const;
    for (const [tableName, table] of Object.entries(tables)) {
      for (const [key, copy] of Object.entries(table as Record<string, string>)) {
        expect(copy, `${tableName}.${key} promises guest play`).not.toMatch(/\b(play as a guest|guest (play|progress|mode))\b/i);
      }
    }
  });

  test('message rows are pinned to live copy', () => {
    expect({
      auth: LEGACY_AUTH_MESSAGE_COPY,
      boot: LEGACY_BOOT_MESSAGE_COPY,
      oauthFailure: LEGACY_OAUTH_FAILURE_MESSAGE_COPY,
      offline: LEGACY_OFFLINE_MESSAGE_COPY,
      overlay: LEGACY_OVERLAY_MESSAGE_COPY,
      remote: LEGACY_REMOTE_MESSAGE_COPY
    }).toMatchInlineSnapshot(`
      {
        "auth": {
          "accountUnavailable": "Sign-in is unavailable right now. Try again in a minute.",
          "authUnavailable": "Sign-in is unavailable right now. Try again in a minute.",
          "emailInvalid": "Enter a valid email address.",
          "loginNotConfigured": "Sign-in is unavailable right now. Try again in a minute.",
          "networkUnavailable": "No connection. Check your internet and try again.",
          "passwordPolicy": "Choose a different, stronger password that meets the account security requirements.",
          "signedIn": "Signed in.",
          "signedOut": "Signed out.",
          "usernameInvalid": "Use 2-15 letters, numbers, periods, underscores, or hyphens.",
          "usernameTaken": "That username is already taken.",
        },
        "boot": {
          "bootError": "Check your connection and try again.",
          "serviceWorkerError": "The offline cache could not update. The game can still run online.",
        },
        "oauthFailure": {
          "cancelled": "Sign-in did not finish. Tap Sign in to try again.",
          "connection": "We could not finish signing you in. Sign in again.",
          "contextLost": "We could not finish signing you in. Sign in again.",
          "generic": "Sign-in is unavailable right now. Try again in a minute.",
          "providerUnreachable": "Sign-in is unavailable right now. Try again in a minute.",
          "session": "Your session ended. Sign in again to continue.",
          "storage": "This browser is blocking site data. Allow it, then tap Sign in.",
          "timedOut": "Sign-in took too long. Tap Sign in to try again.",
        },
        "offline": {
          "saved": "You are offline. Progress is saved on this device and will sync when you reconnect.",
          "synced": "Back online. Saved progress synced.",
        },
        "overlay": {
          "fieldUpdated": "Setting updated.",
          "movementSpeedUpdated": "Move speed updated.",
          "settingsUpdated": "Settings updated.",
        },
        "remote": {
          "cycleReceiptFailed": "Run history saved locally. Cloud sync will retry later.",
          "guest": "Sign in to sync progress across devices.",
          "missingClient": "Cloud sync is not ready in this build.",
          "progressionFailed": "Progress saved locally. Cloud sync will retry later.",
          "settingsFailed": "Settings saved locally. Cloud sync will retry later.",
        },
      }
    `);
  });
});
