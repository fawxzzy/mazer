import { describe, expect, test } from 'vitest';
import {
  LEGACY_AUTH_MESSAGE_COPY,
  LEGACY_BOOT_MESSAGE_COPY,
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
      offline: LEGACY_OFFLINE_MESSAGE_COPY,
      overlay: LEGACY_OVERLAY_MESSAGE_COPY,
      remote: LEGACY_REMOTE_MESSAGE_COPY
    }).toMatchInlineSnapshot(`
      {
        "auth": {
          "accountCreated": "Your account is ready.",
          "accountRecovery": "Account setup could not be completed. Try signing in or use Forgot Password.",
          "accountUnavailable": "Account service is unavailable right now. Try again shortly.",
          "authUnavailable": "Account access is unavailable right now. Try again shortly.",
          "createReady": "Details look good. Create your account when you are ready.",
          "emailInvalid": "Enter a valid email address.",
          "enterEmail": "Enter an email.",
          "loginNotConfigured": "Account access is unavailable right now. Try again shortly.",
          "loginReady": "Details look good. Sign in when you are ready.",
          "networkUnavailable": "Account service is unreachable. Try again shortly.",
          "passwordMinimum": "Password needs 6+ characters.",
          "passwordMismatch": "Passwords do not match.",
          "passwordPolicy": "Choose a different, stronger password that meets the account security requirements.",
          "passwordRecoveryInvalid": "This reset link is invalid or has expired. Request a new link.",
          "passwordRecoveryUpdated": "Password updated. You can continue to Mazer.",
          "passwordResetEmailRequired": "Enter an email before reset.",
          "passwordResetNotConfigured": "Password reset is unavailable right now. Try again shortly.",
          "passwordResetSent": "Password reset email sent.",
          "signedIn": "Signed in.",
          "signedOut": "Signed out.",
          "signupNotConfigured": "Account creation is unavailable right now. Try again shortly.",
          "usernameInvalid": "Use 2-15 letters, numbers, periods, underscores, or hyphens.",
          "usernameRequired": "Enter a username.",
          "usernameTaken": "That username is already taken.",
          "verifyEmail": "Check your email to finish account setup.",
        },
        "boot": {
          "bootError": "The maze did not finish loading. Try refreshing once.",
          "serviceWorkerError": "The offline cache could not update. The game can still run online.",
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
