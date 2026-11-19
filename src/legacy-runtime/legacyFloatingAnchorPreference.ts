/**
 * MAZER-L9: the Settings > Floating anchor switch. A device-local preference, deliberately NOT part of the synced
 * game-toggle blob: it is an experiment about how a thumb feels on one phone, and it must not travel with the
 * account (or change the account sync fingerprint) until it has been tuned and Zac has chosen it as a default.
 * Default OFF: with the key absent or unreadable the stick behaves exactly as before.
 */
export const LEGACY_FLOATING_ANCHOR_STORAGE_KEY = 'mazer.floating-anchor.v1';

export const LEGACY_FLOATING_ANCHOR_LABEL = 'Floating anchor';
export const LEGACY_FLOATING_ANCHOR_DESCRIPTION =
  'Experimental. When you drag far, your touch point follows your finger. This device only.';

export const readLegacyFloatingAnchorPreference = (
  storage: Pick<Storage, 'getItem'> | undefined
): boolean => {
  if (!storage) {
    return false;
  }
  try {
    return storage.getItem(LEGACY_FLOATING_ANCHOR_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
};

export const writeLegacyFloatingAnchorPreference = (
  storage: Pick<Storage, 'setItem'> | undefined,
  enabled: boolean
): boolean => {
  if (!storage) {
    return enabled;
  }
  try {
    storage.setItem(LEGACY_FLOATING_ANCHOR_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Best effort, like every other preference write: the switch still works for this session.
  }
  return enabled;
};
