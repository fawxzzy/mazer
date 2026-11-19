/**
 * MAZER-L9: the Settings > Floating anchor switch. A device-local preference, deliberately NOT part of the synced
 * game-toggle blob: it is about how a thumb feels on one phone, so it does not travel with the account (or change the
 * account sync fingerprint).
 * MAZER-CTRL-003 option B (Zac, 2026-11-19): default ON. With the key absent or unreadable the anchor follows; only a
 * stored 'off' (the player switched it off) gives the old fixed anchor.
 */
export const LEGACY_FLOATING_ANCHOR_STORAGE_KEY = 'mazer.floating-anchor.v1';

export const LEGACY_FLOATING_ANCHOR_LABEL = 'Floating anchor';
export const LEGACY_FLOATING_ANCHOR_DESCRIPTION =
  'When you drag far, your touch point follows your finger, so turning back is short. This device only.';

export const readLegacyFloatingAnchorPreference = (
  storage: Pick<Storage, 'getItem'> | undefined
): boolean => {
  if (!storage) {
    return true;
  }
  try {
    return storage.getItem(LEGACY_FLOATING_ANCHOR_STORAGE_KEY) !== 'off';
  } catch {
    return true;
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
