import { describe, expect, test } from 'vitest';
import {
  LEGACY_AUTH_MESSAGE_COPY,
  LEGACY_REMOTE_MESSAGE_COPY,
  LEGACY_PLAYER_MESSAGE_DEFAULT_DURATION_MS,
  LEGACY_PLAYER_MESSAGE_MAX_VISIBLE,
  createLegacyPlayerMessage,
  enqueueLegacyPlayerMessage,
  expireLegacyPlayerMessageQueue,
  resolveLegacyAuthFeedbackMessage,
  resolveLegacyAuthValidationMessage,
  resolveLegacyBootMessage,
  resolveLegacyOverlayFieldCommitMessage,
  resolveLegacyOverlayMovementSpeedMessage,
  resolveLegacyOverlayToggleMessage,
  resolveLegacyPlayerMessageColor,
  resolveLegacyRemoteSyncMessage
} from '../../src/legacy-runtime/legacyPlayerMessage';

describe('legacy player-facing message system', () => {
  test('normalizes player-facing messages into one reusable contract', () => {
    expect(LEGACY_PLAYER_MESSAGE_MAX_VISIBLE).toBe(3);
    expect(createLegacyPlayerMessage({
      copy: '  Saved.  ',
      id: 'settings.saved',
      source: 'overlay',
      technicalDetail: 'localStorage write completed',
      tone: 'success'
    })).toEqual({
      copy: 'Saved.',
      durationMs: LEGACY_PLAYER_MESSAGE_DEFAULT_DURATION_MS,
      id: 'settings.saved',
      source: 'overlay',
      technicalDetail: 'localStorage write completed',
      tone: 'success'
    });
    expect(createLegacyPlayerMessage({
      copy: ' ',
      id: 'empty',
      source: 'system',
      tone: 'info'
    })).toBeNull();
  });

  test('maps auth validation and feedback into fitness-style message tones', () => {
    expect(resolveLegacyAuthValidationMessage(LEGACY_AUTH_MESSAGE_COPY.loginReady, true)).toMatchObject({
      copy: LEGACY_AUTH_MESSAGE_COPY.loginReady,
      id: 'auth.validation.ready',
      source: 'auth',
      tone: 'success'
    });
    expect(resolveLegacyAuthValidationMessage(LEGACY_AUTH_MESSAGE_COPY.enterEmail, false)).toMatchObject({
      copy: LEGACY_AUTH_MESSAGE_COPY.enterEmail,
      id: 'auth.validation.blocked',
      source: 'auth',
      tone: 'warning'
    });
    expect(resolveLegacyAuthFeedbackMessage('Bad password.', null)).toMatchObject({
      copy: LEGACY_AUTH_MESSAGE_COPY.genericFailure,
      id: 'auth.feedback.error',
      source: 'auth',
      technicalDetail: null,
      tone: 'error'
    });
    expect(resolveLegacyAuthFeedbackMessage('Failed to fetch', null)).toMatchObject({
      copy: LEGACY_AUTH_MESSAGE_COPY.networkUnavailable,
      id: 'auth.feedback.error',
      source: 'auth',
      technicalDetail: null,
      tone: 'error'
    });
    expect(resolveLegacyAuthFeedbackMessage(LEGACY_AUTH_MESSAGE_COPY.invalidCredentials, null)?.copy)
      .toBe(LEGACY_AUTH_MESSAGE_COPY.invalidCredentials);
    expect(resolveLegacyAuthFeedbackMessage(LEGACY_AUTH_MESSAGE_COPY.networkUnavailable, null)?.copy)
      .toBe(LEGACY_AUTH_MESSAGE_COPY.networkUnavailable);
    expect(resolveLegacyAuthFeedbackMessage(null, LEGACY_AUTH_MESSAGE_COPY.signedIn)).toMatchObject({
      copy: LEGACY_AUTH_MESSAGE_COPY.signedIn,
      id: 'auth.feedback.info',
      source: 'auth',
      tone: 'success'
    });
  });

  test('keeps message colors centralized by tone', () => {
    expect(resolveLegacyPlayerMessageColor({ tone: 'error' })).toBe('#ff7d7d');
    expect(resolveLegacyPlayerMessageColor({ tone: 'info' })).toBe('#b7f2ff');
    expect(resolveLegacyPlayerMessageColor({ tone: 'success' })).toBe('#72e0bf');
    expect(resolveLegacyPlayerMessageColor({ tone: 'warning' })).toBe('#ffcf91');
  });

  test('queues player-facing messages with bounded visible count and expiry', () => {
    const first = createLegacyPlayerMessage({
      copy: 'First',
      id: 'message.first',
      source: 'system',
      tone: 'info'
    });
    const second = createLegacyPlayerMessage({
      copy: 'Second',
      id: 'message.second',
      source: 'system',
      tone: 'success'
    });
    const third = createLegacyPlayerMessage({
      copy: 'Third',
      id: 'message.third',
      source: 'system',
      tone: 'warning'
    });
    const replacement = createLegacyPlayerMessage({
      copy: 'Second updated',
      id: 'message.second',
      source: 'system',
      tone: 'error'
    });
    const fourth = createLegacyPlayerMessage({
      copy: 'Fourth',
      id: 'message.fourth',
      source: 'system',
      tone: 'info'
    });

    let queue = enqueueLegacyPlayerMessage([], first, 1000, 1);
    queue = enqueueLegacyPlayerMessage(queue, second, 1000, 2);
    queue = enqueueLegacyPlayerMessage(queue, third, 1000, 3);
    queue = enqueueLegacyPlayerMessage(queue, replacement, 1000, 4);
    queue = enqueueLegacyPlayerMessage(queue, fourth, 1000, 5);

    expect(queue).toHaveLength(LEGACY_PLAYER_MESSAGE_MAX_VISIBLE);
    expect(queue.map((entry) => entry.message.copy)).toEqual(['Third', 'Second updated', 'Fourth']);
    expect(expireLegacyPlayerMessageQueue(queue, 1000 + LEGACY_PLAYER_MESSAGE_DEFAULT_DURATION_MS - 1)).toHaveLength(3);
    expect(expireLegacyPlayerMessageQueue(queue, 1000 + LEGACY_PLAYER_MESSAGE_DEFAULT_DURATION_MS)).toEqual([]);
  });

  test('keeps boot failure messages player-safe while retaining hidden technical detail', () => {
    expect(resolveLegacyBootMessage('error', 'stack trace detail')).toMatchObject({
      copy: 'The maze did not finish loading. Try refreshing once.',
      id: 'boot.error',
      source: 'boot',
      technicalDetail: 'stack trace detail',
      tone: 'error'
    });
    expect(resolveLegacyBootMessage('service-worker-error', 'cache update failed')).toMatchObject({
      copy: 'The offline cache could not update. The game can still run online.',
      id: 'boot.service-worker-error',
      source: 'boot',
      technicalDetail: 'cache update failed',
      tone: 'warning'
    });
  });

  test('maps remote sync outcomes without exposing technical details as player copy', () => {
    expect(resolveLegacyRemoteSyncMessage('progression', {
      error: null,
      skippedReason: null,
      synced: true
    })).toBeNull();
    expect(resolveLegacyRemoteSyncMessage('progression', {
      error: null,
      skippedReason: 'disabled',
      synced: false
    })).toBeNull();
    expect(resolveLegacyRemoteSyncMessage('progression', {
      error: null,
      skippedReason: 'guest',
      synced: false
    })).toMatchObject({
      copy: LEGACY_REMOTE_MESSAGE_COPY.guest,
      id: 'remote.progression.guest',
      source: 'progression',
      tone: 'info'
    });
    expect(resolveLegacyRemoteSyncMessage('cycle-receipt', {
      error: 'new row violates row-level security policy',
      skippedReason: null,
      synced: false
    })).toMatchObject({
      copy: LEGACY_REMOTE_MESSAGE_COPY.cycleReceiptFailed,
      id: 'remote.cycle-receipt.failed',
      source: 'progression',
      technicalDetail: 'new row violates row-level security policy',
      tone: 'warning'
    });
  });

  test('maps overlay setting confirmations into the shared message contract', () => {
    expect(resolveLegacyOverlayToggleMessage('Trail Fade', 'Off')).toMatchObject({
      copy: 'Trail Fade: Off.',
      id: 'overlay.toggle.trail-fade',
      source: 'overlay',
      tone: 'success'
    });
    expect(resolveLegacyOverlayMovementSpeedMessage('88%')).toMatchObject({
      copy: 'Move speed updated. 88%.',
      id: 'overlay.movement-speed.updated',
      source: 'overlay',
      tone: 'success'
    });
    expect(resolveLegacyOverlayFieldCommitMessage('Maze Scale', '75', 'maze')).toMatchObject({
      copy: 'Setting updated. Maze Scale: 75.',
      id: 'overlay.field.maze-scale',
      source: 'overlay',
      tone: 'success'
    });
    expect(resolveLegacyOverlayFieldCommitMessage('Path R', '128', 'material')).toMatchObject({
      copy: 'Setting updated. Path R: 128.',
      id: 'overlay.field.path-r',
      source: 'overlay',
      tone: 'success'
    });
    expect(resolveLegacyOverlayFieldCommitMessage('Camera Scale', '0', 'unchanged')).toMatchObject({
      copy: 'Camera Scale: 0.',
      id: 'overlay.field.camera-scale',
      source: 'overlay',
      tone: 'info'
    });
  });
});
