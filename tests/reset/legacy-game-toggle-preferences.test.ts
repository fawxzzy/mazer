import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, copyLegacySettings } from '../../src/legacy-runtime/legacyDefaults';
import {
  createLegacyAuthScopedStorage,
  resolveLegacyAuthScopedStorageKey
} from '../../src/legacy-runtime/legacyAuth';
import {
  LEGACY_GAME_TOGGLE_STORAGE_KEY,
  migrateLegacyGameToggleSettingsToGuestScope,
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

  public removeItem(key: string): void {
    this.values.delete(key);
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
      smartSteering: true,
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
    settings.smartSteering = false;
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
      smartSteering: false,
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
      smartSteering: false,
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
      smartSteering: false,
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
      smartSteering: 'off',
      toggleAnimatedBackdrop: 'no',
      toggleCameraFollow: 1,
      toggleTrailFade: null,
      toggleTrailPulse: 'off'
    }));

    const settings = readLegacyGameToggleSettings(storage, LEGACY_DEFAULTS);

    expect(settings.controlMode).toBe('stick');
    expect(settings.darkMode).toBe(true);
    expect(settings.movementSpeed).toBe(1);
    expect(settings.smartSteering).toBe(false);
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

  test('migrates valid old unscoped game toggles into guest scope once', () => {
    const storage = new MemoryStorage();
    const guestStorage = createLegacyAuthScopedStorage(
      storage,
      LEGACY_GAME_TOGGLE_STORAGE_KEY,
      { userId: null }
    );
    const userStorage = createLegacyAuthScopedStorage(
      storage,
      LEGACY_GAME_TOGGLE_STORAGE_KEY,
      { userId: 'user-456' }
    );
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({
      controlMode: 'arrows',
      darkMode: false,
      movementSpeed: 0.72,
      smartSteering: false,
      toggleAnimatedBackdrop: false,
      toggleCameraFollow: true,
      toggleTrailFade: true,
      toggleTrailPulse: false
    }));

    expect(migrateLegacyGameToggleSettingsToGuestScope(storage, guestStorage, LEGACY_DEFAULTS)).toBe(true);

    const migrated = readLegacyGameToggleSettings(guestStorage, LEGACY_DEFAULTS);
    expect(pickLegacyGameTogglePreferences(migrated)).toEqual({
      controlMode: 'arrows',
      darkMode: false,
      movementSpeed: 0.72,
      smartSteering: false,
      toggleAnimatedBackdrop: false,
      toggleCameraFollow: true,
      toggleTrailFade: true,
      toggleTrailPulse: false
    });
    expect(storage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(resolveLegacyAuthScopedStorageKey(
      LEGACY_GAME_TOGGLE_STORAGE_KEY,
      { userId: 'user-456' }
    ))).toBeNull();
    expect(readLegacyGameToggleSettings(userStorage, LEGACY_DEFAULTS)).toEqual(LEGACY_DEFAULTS);
    expect(migrateLegacyGameToggleSettingsToGuestScope(storage, guestStorage, LEGACY_DEFAULTS)).toBe(false);
  });

  test('does not let old unscoped toggles overwrite existing guest preferences', () => {
    const storage = new MemoryStorage();
    const guestStorage = createLegacyAuthScopedStorage(
      storage,
      LEGACY_GAME_TOGGLE_STORAGE_KEY,
      { userId: null }
    );
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({
      controlMode: 'arrows',
      toggleCameraFollow: true
    }));
    writeLegacyGameToggleSettings(guestStorage, mergeLegacyGameTogglePreferences(LEGACY_DEFAULTS, {
      controlMode: 'stick',
      toggleCameraFollow: false
    }));

    expect(migrateLegacyGameToggleSettingsToGuestScope(storage, guestStorage, LEGACY_DEFAULTS)).toBe(false);

    const retained = readLegacyGameToggleSettings(guestStorage, LEGACY_DEFAULTS);
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

    expect(migrateLegacyGameToggleSettingsToGuestScope(storage, guestStorage, LEGACY_DEFAULTS)).toBe(false);
    expect(storage.getItem(resolveLegacyAuthScopedStorageKey(LEGACY_GAME_TOGGLE_STORAGE_KEY, { userId: null }))).toBeNull();
    expect(storage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY)).toBe('{');
  });

  test('rejects parseable legacy data when every recognized value is invalid', () => {
    const storage = new MemoryStorage();
    const guestStorage = createLegacyAuthScopedStorage(
      storage,
      LEGACY_GAME_TOGGLE_STORAGE_KEY,
      { userId: null }
    );
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({
      controlMode: 'teleport',
      movementSpeed: 'fast',
      toggleTrailPulse: 'maybe'
    }));

    expect(migrateLegacyGameToggleSettingsToGuestScope(storage, guestStorage, LEGACY_DEFAULTS)).toBe(false);
    expect(storage.getItem(resolveLegacyAuthScopedStorageKey(LEGACY_GAME_TOGGLE_STORAGE_KEY, { userId: null }))).toBeNull();
    expect(storage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY)).not.toBeNull();
  });

  test('keeps the legacy key when the guest-scoped write fails', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({ controlMode: 'arrows' }));

    expect(migrateLegacyGameToggleSettingsToGuestScope(storage, {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      }
    }, LEGACY_DEFAULTS)).toBe(false);
    expect(storage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY)).not.toBeNull();
  });

  test('keeps a successful guest migration when legacy-key removal is blocked', () => {
    const values = new Map<string, string>();
    values.set(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({ toggleTrailPulse: false }));
    const rootStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: () => {
        throw new Error('blocked');
      }
    };
    const guestStorage = createLegacyAuthScopedStorage(
      rootStorage,
      LEGACY_GAME_TOGGLE_STORAGE_KEY,
      { userId: null }
    );

    expect(migrateLegacyGameToggleSettingsToGuestScope(rootStorage, guestStorage, LEGACY_DEFAULTS)).toBe(true);
    expect(readLegacyGameToggleSettings(guestStorage, LEGACY_DEFAULTS).toggleTrailPulse).toBe(false);
    expect(values.get(LEGACY_GAME_TOGGLE_STORAGE_KEY)).not.toBeUndefined();
  });
});
