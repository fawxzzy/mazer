import {
  LEGACY_DEFAULTS,
  clampNumber,
  copyLegacySettings,
  type LegacyControlMode,
  type LegacySettings
} from './legacyDefaults';
import {
  LEGACY_MOVEMENT_SPEED_MAX,
  LEGACY_MOVEMENT_SPEED_MIN,
  normalizeLegacyMovementSpeed
} from './legacyMovementSpeed';

export const LEGACY_GAME_TOGGLE_STORAGE_KEY = 'mazer.game-toggles.v1';

/**
 * MAZER-AUDIO-004 one-time migration marker. Sound effects used to default OFF, so stored settings (local blob and
 * the account profile `settings` JSON) hold `soundEnabled: false` for people who never touched it. The marker is
 * written next to the toggles by every write from this build on. A blob/remote settings object WITHOUT the marker is
 * pre-migration and reads as sound ON, once; one WITH the marker is a real choice and is respected. The marker is
 * not a setting: it is never part of the picked preferences or of the sync fingerprint's comparison (the
 * fingerprint carries it only so an old fingerprint can be told apart, see canonicalizeGameToggleFingerprint).
 */
export const LEGACY_SOUND_DEFAULT_ON_MARKER_KEY = 'soundDefaultOnV1';

/** True when a stored toggle object (local blob or remote settings JSON) is pre-migration for sound. */
export const needsLegacySoundDefaultOnMigration = (value: unknown): boolean => (
  value === null
  || typeof value !== 'object'
  || Array.isArray(value)
  || (value as Record<string, unknown>)[LEGACY_SOUND_DEFAULT_ON_MARKER_KEY] !== true
);

/** Adds the marker to a picked-preferences object for storage / the remote settings JSON. */
export const withLegacySoundDefaultOnMarker = (
  preferences: LegacyGameTogglePreferences
): LegacyGameTogglePreferences & { soundDefaultOnV1: true } => ({
  ...preferences,
  [LEGACY_SOUND_DEFAULT_ON_MARKER_KEY]: true
} as LegacyGameTogglePreferences & { soundDefaultOnV1: true });

/**
 * Applies the one-time migration to a stored toggle object: pre-migration objects read as sound ON, marked ones are
 * returned untouched. Pure; callers decide whether to persist (a later write adds the marker).
 */
export const applyLegacySoundDefaultOnMigration = <T extends Partial<LegacyGameTogglePreferences>>(
  value: T | null | undefined
): T | null | undefined => (
  value !== null && value !== undefined && typeof value === 'object' && needsLegacySoundDefaultOnMigration(value)
    ? { ...value, soundEnabled: true }
    : value
);

export interface LegacyGameTogglePreferences {
  controlMode: LegacyControlMode;
  darkMode: boolean;
  hapticsEnabled: boolean;
  soundEnabled: boolean;
  movementSpeed: number;
  toggleReducedMotion: boolean;
}

const isControlMode = (value: unknown): value is LegacyControlMode => (
  value === 'arrows' || value === 'stick'
);

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
};

const isMigratableBoolean = (value: unknown): boolean => (
  typeof value === 'boolean'
  || (
    typeof value === 'string'
    && ['true', '1', 'yes', 'on', 'false', '0', 'no', 'off'].includes(value.trim().toLowerCase())
  )
);

const isMigratableMovementSpeed = (value: unknown): boolean => (
  (typeof value === 'number' && Number.isFinite(value))
  || (typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Number(value)))
);

const isMigratableLegacyGameTogglePreferences = (value: unknown): value is Partial<LegacyGameTogglePreferences> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const hasOwn = (key: keyof LegacyGameTogglePreferences): boolean => (
    Object.prototype.hasOwnProperty.call(record, key)
  );
  const presentKeys = [
    'controlMode',
    'darkMode',
    'hapticsEnabled',
    'soundEnabled',
    'movementSpeed',
    'toggleReducedMotion'
  ] satisfies Array<keyof LegacyGameTogglePreferences>;

  if (!presentKeys.some(hasOwn)) {
    return false;
  }
  if (hasOwn('controlMode') && !isControlMode(record.controlMode)) {
    return false;
  }
  if (hasOwn('movementSpeed') && !isMigratableMovementSpeed(record.movementSpeed)) {
    return false;
  }

  return presentKeys
    .filter((key) => key !== 'controlMode' && key !== 'movementSpeed' && hasOwn(key))
    .every((key) => isMigratableBoolean(record[key]));
};

export const pickLegacyGameTogglePreferences = (
  settings: LegacySettings
): LegacyGameTogglePreferences => ({
  controlMode: settings.controlMode,
  darkMode: settings.darkMode,
  hapticsEnabled: settings.hapticsEnabled,
  soundEnabled: settings.soundEnabled,
  movementSpeed: normalizeLegacyMovementSpeed(settings.movementSpeed),
  toggleReducedMotion: settings.toggleReducedMotion
});

export const normalizeLegacyGameTogglePreferences = (
  value?: Partial<LegacyGameTogglePreferences> | null,
  fallback: LegacySettings = LEGACY_DEFAULTS
): LegacyGameTogglePreferences => ({
  controlMode: isControlMode(value?.controlMode) ? value.controlMode : fallback.controlMode,
  darkMode: normalizeBoolean(value?.darkMode, fallback.darkMode),
  hapticsEnabled: normalizeBoolean(value?.hapticsEnabled, fallback.hapticsEnabled),
  soundEnabled: normalizeBoolean(value?.soundEnabled, fallback.soundEnabled),
  movementSpeed: normalizeLegacyMovementSpeed(
    typeof value?.movementSpeed === 'number'
      ? value.movementSpeed
      : Number(value?.movementSpeed),
    clampNumber(fallback.movementSpeed, LEGACY_MOVEMENT_SPEED_MIN, LEGACY_MOVEMENT_SPEED_MAX)
  ),
  toggleReducedMotion: normalizeBoolean(value?.toggleReducedMotion, fallback.toggleReducedMotion)
});

export const mergeLegacyGameTogglePreferences = (
  settings: LegacySettings,
  value?: Partial<LegacyGameTogglePreferences> | null
): LegacySettings => {
  const normalized = normalizeLegacyGameTogglePreferences(value, settings);

  return {
    ...copyLegacySettings(settings),
    ...normalized
  };
};

export const readLegacyGameToggleSettings = (
  storage: Pick<Storage, 'getItem'> | undefined,
  fallback: LegacySettings = LEGACY_DEFAULTS
): LegacySettings => {
  if (!storage) {
    return copyLegacySettings(fallback);
  }

  try {
    const raw = storage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY);
    if (!raw) {
      return copyLegacySettings(fallback);
    }

    return mergeLegacyGameTogglePreferences(
      fallback,
      applyLegacySoundDefaultOnMigration(JSON.parse(raw) as Partial<LegacyGameTogglePreferences>)
    );
  } catch {
    return copyLegacySettings(fallback);
  }
};

export const writeLegacyGameToggleSettings = (
  storage: Pick<Storage, 'setItem'> | undefined,
  settings: LegacySettings
): LegacySettings => {
  const normalizedSettings = mergeLegacyGameTogglePreferences(settings, pickLegacyGameTogglePreferences(settings));
  if (!storage) {
    return normalizedSettings;
  }

  try {
    storage.setItem(
      LEGACY_GAME_TOGGLE_STORAGE_KEY,
      JSON.stringify(withLegacySoundDefaultOnMarker(pickLegacyGameTogglePreferences(normalizedSettings)))
    );
  } catch {
    // Browser storage is best-effort; gameplay must continue if storage is blocked.
  }

  return normalizedSettings;
};

export const migrateLegacyGameToggleSettingsToGuestScope = (
  rootStorage: (
    Pick<Storage, 'getItem' | 'setItem'>
    & Partial<Pick<Storage, 'removeItem'>>
  ) | undefined,
  guestStorage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  fallback: LegacySettings = LEGACY_DEFAULTS
): boolean => {
  if (!rootStorage || !guestStorage) {
    return false;
  }

  try {
    if (guestStorage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY) !== null) {
      return false;
    }

    const rawLegacyPreferences = rootStorage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY);
    if (!rawLegacyPreferences) {
      return false;
    }

    const parsedPreferences = JSON.parse(rawLegacyPreferences) as unknown;
    if (!isMigratableLegacyGameTogglePreferences(parsedPreferences)) {
      return false;
    }
    const normalizedPreferences = normalizeLegacyGameTogglePreferences(parsedPreferences, fallback);

    guestStorage.setItem(
      LEGACY_GAME_TOGGLE_STORAGE_KEY,
      JSON.stringify(normalizedPreferences)
    );
    try {
      rootStorage.removeItem?.(LEGACY_GAME_TOGGLE_STORAGE_KEY);
    } catch {
      // The scoped write already succeeded. A stale global key cannot overwrite guest or account data.
    }
    return true;
  } catch {
    return false;
  }
};

/**
 * Keys a past build stored in the scoped game-toggle blob (and the account profile `settings` JSON) for settings
 * that no longer exist. They are never read back into settings and never written again:
 *   - `camScale`: Board Zoom, removed because the board size is frozen.
 *   - `toggleTrailFade`, `toggleTrailPulse`, `toggleAnimatedBackdrop` (MAZER-UI-026): the Trail Fade, Trail Shine
 *     and Animated Background rows, removed because Reduce Motion now decides all three
 *     (see src/render/reducedMotion.ts, "Retired Display switches").
 */
export const RETIRED_GAME_TOGGLE_KEYS: readonly string[] = Object.freeze([
  'camScale',
  'toggleAnimatedBackdrop',
  'toggleTrailFade',
  'toggleTrailPulse'
]);

/**
 * Strips the retired keys from the stored blob so no tool or later build can resurrect them. Best effort:
 * storage failures are swallowed like every other preference write. Returns whether anything was removed.
 */
export const scrubRetiredGameToggleKeysFromStorage = (
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined
): boolean => {
  if (!storage) {
    return false;
  }

  try {
    const raw = storage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY);
    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false;
    }
    const record = parsed as Record<string, unknown>;
    const retiredPresent = RETIRED_GAME_TOGGLE_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(record, key));
    if (retiredPresent.length === 0) {
      return false;
    }

    const rest = Object.fromEntries(Object.entries(record).filter(([key]) => !RETIRED_GAME_TOGGLE_KEYS.includes(key)));
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify(rest));
    return true;
  } catch {
    return false;
  }
};

/**
 * Account sync keeps a fingerprint (the JSON of the picked preferences) to tell "this device changed a setting"
 * from "the server changed it". A fingerprint stored by an older build still lists the retired keys, so it is
 * canonicalised here; otherwise the first load after this change would see a phantom local edit and overwrite
 * the account's settings with this device's. Anything that does not parse is returned unchanged.
 */
export const canonicalizeGameToggleFingerprint = (fingerprint: string): string => {
  try {
    const parsed = JSON.parse(fingerprint) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fingerprint;
    }
    const record = parsed as Record<string, unknown>;
    const hasOwn = (key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);
    const hasRetired = RETIRED_GAME_TOGGLE_KEYS.some(hasOwn);
    // A fingerprint stored before Sound effects existed has no soundEnabled: add the default in the picked key
    // position so the first load of the new build is not a phantom local edit.
    const missingSound = hasOwn('hapticsEnabled') && !hasOwn('soundEnabled');
    // MAZER-AUDIO-004: a fingerprint from before the sound-default-on migration has no marker and holds the old
    // "off" value; the migrated local settings read as ON, so rewrite it the same way (once) or the first load would
    // see a phantom local edit and overwrite the account settings with this device's.
    const missingMarker = hasOwn('hapticsEnabled') && !hasOwn(LEGACY_SOUND_DEFAULT_ON_MARKER_KEY);
    if (!hasRetired && !missingSound && !missingMarker) {
      return fingerprint;
    }
    const entries = Object.entries(record).filter(([key]) => !RETIRED_GAME_TOGGLE_KEYS.includes(key));
    if (missingSound) {
      const at = entries.findIndex(([key]) => key === 'hapticsEnabled');
      entries.splice(at + 1, 0, ['soundEnabled', LEGACY_DEFAULTS.soundEnabled]);
    }
    if (missingMarker) {
      const soundAt = entries.findIndex(([key]) => key === 'soundEnabled');
      entries[soundAt] = ['soundEnabled', true];
      entries.push([LEGACY_SOUND_DEFAULT_ON_MARKER_KEY, true]);
    }
    return JSON.stringify(Object.fromEntries(entries));
  } catch {
    return fingerprint;
  }
};
