import {
  LEGACY_DEFAULTS,
  copyLegacySettings,
  type LegacyControlMode,
  type LegacySettings
} from './legacyDefaults';

export const LEGACY_GAME_TOGGLE_STORAGE_KEY = 'mazer.game-toggles.v1';

export interface LegacyGameTogglePreferences {
  controlMode: LegacyControlMode;
  darkMode: boolean;
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

export const pickLegacyGameTogglePreferences = (
  settings: LegacySettings
): LegacyGameTogglePreferences => ({
  controlMode: settings.controlMode,
  darkMode: settings.darkMode,
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
