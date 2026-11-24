/**
 * MAZER-UI-102: the Settings > Dark mode switch. A device-local preference like Floating anchor (not part of the synced
 * game-toggle blob). Default OFF: with the key absent or unreadable the game looks exactly as it always has; only a
 * stored 'on' gives the dark theme.
 */
export const DARK_MODE_STORAGE_KEY = 'mazer.dark-mode.v1';

export const DARK_MODE_SETTING_LABEL = 'Dark mode';
export const DARK_MODE_SETTING_DESCRIPTION =
  'Dark look with neon purple accents. Your skins keep their colours. Reloads the game.';

export const readDarkModePreference = (storage: Pick<Storage, 'getItem'> | undefined): boolean => {
  if (!storage) {
    return false;
  }
  try {
    return storage.getItem(DARK_MODE_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
};

export const writeDarkModePreference = (
  storage: Pick<Storage, 'setItem'> | undefined,
  enabled: boolean
): boolean => {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(DARK_MODE_STORAGE_KEY, enabled ? 'on' : 'off');
    return true;
  } catch {
    // Best effort, like every other preference write; the caller keeps the old look when this fails.
    return false;
  }
};
