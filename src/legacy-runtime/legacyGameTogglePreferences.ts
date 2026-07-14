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

export interface LegacyGameTogglePreferences {
  controlMode: LegacyControlMode;
  darkMode: boolean;
  movementSpeed: number;
  toggleAnimatedBackdrop: boolean;
  toggleCameraFollow: boolean;
  toggleTrailFade: boolean;
  toggleTrailPulse: boolean;
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
    'movementSpeed',
    'toggleAnimatedBackdrop',
    'toggleCameraFollow',
    'toggleTrailFade',
    'toggleTrailPulse'
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
  movementSpeed: normalizeLegacyMovementSpeed(settings.movementSpeed),
  toggleAnimatedBackdrop: settings.toggleAnimatedBackdrop,
  toggleCameraFollow: settings.toggleCameraFollow,
  toggleTrailFade: settings.toggleTrailFade,
  toggleTrailPulse: settings.toggleTrailPulse
});

export const normalizeLegacyGameTogglePreferences = (
  value?: Partial<LegacyGameTogglePreferences> | null,
  fallback: LegacySettings = LEGACY_DEFAULTS
): LegacyGameTogglePreferences => ({
  controlMode: isControlMode(value?.controlMode) ? value.controlMode : fallback.controlMode,
  darkMode: normalizeBoolean(value?.darkMode, fallback.darkMode),
  movementSpeed: normalizeLegacyMovementSpeed(
    typeof value?.movementSpeed === 'number'
      ? value.movementSpeed
      : Number(value?.movementSpeed),
    clampNumber(fallback.movementSpeed, LEGACY_MOVEMENT_SPEED_MIN, LEGACY_MOVEMENT_SPEED_MAX)
  ),
  toggleAnimatedBackdrop: normalizeBoolean(value?.toggleAnimatedBackdrop, fallback.toggleAnimatedBackdrop),
  toggleCameraFollow: normalizeBoolean(value?.toggleCameraFollow, fallback.toggleCameraFollow),
  toggleTrailFade: normalizeBoolean(value?.toggleTrailFade, fallback.toggleTrailFade),
  toggleTrailPulse: normalizeBoolean(value?.toggleTrailPulse, fallback.toggleTrailPulse)
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
      JSON.parse(raw) as Partial<LegacyGameTogglePreferences>
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
      JSON.stringify(pickLegacyGameTogglePreferences(normalizedSettings))
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
