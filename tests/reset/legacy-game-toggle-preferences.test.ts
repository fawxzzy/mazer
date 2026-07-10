import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, copyLegacySettings } from '../../src/legacy-runtime/legacyDefaults';
import {
  createLegacyAuthScopedStorage,
  resolveLegacyAuthScopedStorageKey
} from '../../src/legacy-runtime/legacyAuth';
import {
  LEGACY_GAME_TOGGLE_STORAGE_KEY,
  migrateLegacyGameToggleSettingsFromGlobalStorage,
  mergeLegacyGameTogglePreferences,
  pickLegacyGameTogglePreferences,
  readLegacyGameToggleSettings,
  writeLegacyGameToggleSettings
} from '../../src/legacy-runtime/legacyGameTogglePreferences';

class MemoryStorage {
  public values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('legacy game toggle preferences', () => {
  test('defaults fresh app sessions to the shared menu and play toggle baseline', () => {
    const settings = readLegacyGameToggleSettings(undefined, LEGACY_DEFAULTS);

    expect(LEGACY_DEFAULTS.controlMode).toBe('stick');
    expect(pickLegacyGameTogglePreferences(settings)).toEqual({
      controlMode: 'stick',
      darkMode: true,
      movementSpeed: 0.3,
      toggleAnimatedBackdrop: true,
      toggleCameraFollow: false,
      toggleTrailFade: false,
      toggleTrailPulse: true
    });
  });

  test('writes only game-toggle choices into local browser storage', () => {
    const storage = new MemoryStorage();
    const settings = copyLegacySettings(LEGACY_DEFAULTS);
    settings.scale = 75;
    settings.controlMode = 'stick';
    settings.darkMode = true;
    settings.movementSpeed = 0.82;
    settings.toggleAnimatedBackdrop = false;
    settings.toggleCameraFollow = true;
    settings.toggleTrailFade = true;
    settings.toggleTrailPulse = false;

    const written = writeLegacyGameToggleSettings(storage, settings);

    expect(written.scale).toBe(75);
    expect(JSON.parse(storage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY) ?? '{}')).toEqual({
      controlMode: 'stick',
      darkMode: true,
      movementSpeed: 0.82,
      toggleAnimatedBackdrop: false,
      toggleCameraFollow: true,
      toggleTrailFade: true,
      toggleTrailPulse: false
    });
  });

  test('reads persisted toggles without overwriting non-toggle defaults', () => {
    const storage = new MemoryStorage();
    const fallback = copyLegacySettings(LEGACY_DEFAULTS);
    fallback.scale = 37;
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({
      controlMode: 'stick',
      darkMode: true,
      movementSpeed: 0.33,
      toggleAnimatedBackdrop: false,
      toggleCameraFollow: true,
      toggleTrailFade: true,
      toggleTrailPulse: false
    }));

    const settings = readLegacyGameToggleSettings(storage, fallback);

    expect(settings.scale).toBe(37);
    expect(pickLegacyGameTogglePreferences(settings)).toEqual({
      controlMode: 'stick',
      darkMode: true,
      movementSpeed: 0.33,
      toggleAnimatedBackdrop: false,
      toggleCameraFollow: true,
      toggleTrailFade: true,
      toggleTrailPulse: false
    });
  });

  test('preserves an explicit persisted arrows control choice', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({
      controlMode: 'arrows'
    }));

    const settings = readLegacyGameToggleSettings(storage, LEGACY_DEFAULTS);

    expect(settings.controlMode).toBe('arrows');
    expect(pickLegacyGameTogglePreferences(settings).controlMode).toBe('arrows');
  });

  test('ignores corrupt or invalid stored values and keeps safe fallbacks', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({
      controlMode: 'teleport',
      darkMode: 'yes',
      movementSpeed: '1.4',
      toggleAnimatedBackdrop: 'no',
      toggleCameraFollow: 1,
      toggleTrailFade: null,
      toggleTrailPulse: 'off'
    }));

    const settings = readLegacyGameToggleSettings(storage, LEGACY_DEFAULTS);

    expect(settings.controlMode).toBe('stick');
    expect(settings.darkMode).toBe(true);
    expect(settings.movementSpeed).toBe(1);
    expect(settings.toggleAnimatedBackdrop).toBe(false);
    expect(settings.toggleCameraFollow).toBe(false);
    expect(settings.toggleTrailFade).toBe(false);
    expect(settings.toggleTrailPulse).toBe(false);

    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, '{');
    expect(readLegacyGameToggleSettings(storage, LEGACY_DEFAULTS)).toEqual(LEGACY_DEFAULTS);
  });

  test('continues when storage writes are blocked', () => {
    const settings = mergeLegacyGameTogglePreferences(LEGACY_DEFAULTS, {
      controlMode: 'stick',
      toggleCameraFollow: true
    });

    const written = writeLegacyGameToggleSettings({
      setItem: () => {
        throw new Error('blocked');
      }
    }, settings);

    expect(written.controlMode).toBe('stick');
    expect(written.toggleCameraFollow).toBe(true);
  });

  test('keeps game-toggle preferences isolated by guest and signed-in account scope', () => {
    const storage = new MemoryStorage();
    const guestStorage = createLegacyAuthScopedStorage(
      storage,
      LEGACY_GAME_TOGGLE_STORAGE_KEY,
      { userId: null }
    );
    const userStorage = createLegacyAuthScopedStorage(
      storage,
      LEGACY_GAME_TOGGLE_STORAGE_KEY,
      { userId: 'user-123' }
    );

    writeLegacyGameToggleSettings(guestStorage, mergeLegacyGameTogglePreferences(LEGACY_DEFAULTS, {
      controlMode: 'arrows',
      toggleCameraFollow: false
    }));
    writeLegacyGameToggleSettings(userStorage, mergeLegacyGameTogglePreferences(LEGACY_DEFAULTS, {
      controlMode: 'stick',
      toggleCameraFollow: true
    }));

    expect(storage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(resolveLegacyAuthScopedStorageKey(LEGACY_GAME_TOGGLE_STORAGE_KEY, { userId: null }))).not.toBeNull();
    expect(storage.getItem(resolveLegacyAuthScopedStorageKey(LEGACY_GAME_TOGGLE_STORAGE_KEY, { userId: 'user-123' }))).not.toBeNull();
    expect(readLegacyGameToggleSettings(guestStorage, LEGACY_DEFAULTS).controlMode).toBe('arrows');
    expect(readLegacyGameToggleSettings(guestStorage, LEGACY_DEFAULTS).toggleCameraFollow).toBe(false);
    expect(readLegacyGameToggleSettings(userStorage, LEGACY_DEFAULTS).controlMode).toBe('stick');
    expect(readLegacyGameToggleSettings(userStorage, LEGACY_DEFAULTS).toggleCameraFollow).toBe(true);
  });

  test('migrates old unscoped game toggles into the current account scope once', () => {
    const storage = new MemoryStorage();
    const userStorage = createLegacyAuthScopedStorage(
      storage,
      LEGACY_GAME_TOGGLE_STORAGE_KEY,
      { userId: 'user-456' }
    );
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({
      controlMode: 'arrows',
      darkMode: false,
      movementSpeed: 0.72,
      toggleAnimatedBackdrop: false,
      toggleCameraFollow: true,
      toggleTrailFade: true,
      toggleTrailPulse: false
    }));

    expect(migrateLegacyGameToggleSettingsFromGlobalStorage(storage, userStorage, LEGACY_DEFAULTS)).toBe(true);

    const migrated = readLegacyGameToggleSettings(userStorage, LEGACY_DEFAULTS);
    expect(pickLegacyGameTogglePreferences(migrated)).toEqual({
      controlMode: 'arrows',
      darkMode: false,
      movementSpeed: 0.72,
      toggleAnimatedBackdrop: false,
      toggleCameraFollow: true,
      toggleTrailFade: true,
      toggleTrailPulse: false
    });
    expect(storage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY)).not.toBeNull();
  });

  test('does not let old unscoped toggles overwrite existing scoped preferences', () => {
    const storage = new MemoryStorage();
    const userStorage = createLegacyAuthScopedStorage(
      storage,
      LEGACY_GAME_TOGGLE_STORAGE_KEY,
      { userId: 'user-789' }
    );
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({
      controlMode: 'arrows',
      toggleCameraFollow: true
    }));
    writeLegacyGameToggleSettings(userStorage, mergeLegacyGameTogglePreferences(LEGACY_DEFAULTS, {
      controlMode: 'stick',
      toggleCameraFollow: false
    }));

    expect(migrateLegacyGameToggleSettingsFromGlobalStorage(storage, userStorage, LEGACY_DEFAULTS)).toBe(false);

    const retained = readLegacyGameToggleSettings(userStorage, LEGACY_DEFAULTS);
    expect(retained.controlMode).toBe('stick');
    expect(retained.toggleCameraFollow).toBe(false);
  });

  test('ignores corrupt old unscoped game-toggle data during scoped migration', () => {
    const storage = new MemoryStorage();
    const guestStorage = createLegacyAuthScopedStorage(
      storage,
      LEGACY_GAME_TOGGLE_STORAGE_KEY,
      { userId: null }
    );
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, '{');

    expect(migrateLegacyGameToggleSettingsFromGlobalStorage(storage, guestStorage, LEGACY_DEFAULTS)).toBe(false);
    expect(storage.getItem(resolveLegacyAuthScopedStorageKey(LEGACY_GAME_TOGGLE_STORAGE_KEY, { userId: null }))).toBeNull();
  });
});
