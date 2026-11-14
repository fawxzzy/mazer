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
  scrubRetiredGameToggleKeysFromStorage,
  canonicalizeGameToggleFingerprint,
  RETIRED_GAME_TOGGLE_KEYS,
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
      hapticsEnabled: true,
      movementSpeed: 0.04,
      toggleReducedMotion: false
    });
  });

  test('writes only game-toggle choices into local browser storage', () => {
    const storage = new MemoryStorage();
    const settings = copyLegacySettings(LEGACY_DEFAULTS);
    settings.scale = 75;
    settings.controlMode = 'stick';
    settings.darkMode = true;
    settings.movementSpeed = 0.82;
    settings.toggleReducedMotion = true;

    const written = writeLegacyGameToggleSettings(storage, settings);

    expect(written.scale).toBe(75);
    expect(JSON.parse(storage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY) ?? '{}')).toEqual({
      controlMode: 'stick',
      darkMode: true,
      hapticsEnabled: true,
      movementSpeed: 0.82,
      toggleReducedMotion: true
    });
  });

  test('reads persisted toggles without overwriting non-toggle defaults', () => {
    const storage = new MemoryStorage();
    const fallback = copyLegacySettings(LEGACY_DEFAULTS);
    fallback.scale = 37;
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({
      controlMode: 'stick',
      darkMode: true,
      hapticsEnabled: true,
      movementSpeed: 0.33,
      toggleAnimatedBackdrop: false,
      toggleReducedMotion: true,
      toggleTrailFade: true,
      toggleTrailPulse: false
    }));

    const settings = readLegacyGameToggleSettings(storage, fallback);

    expect(settings.scale).toBe(37);
    expect(pickLegacyGameTogglePreferences(settings)).toEqual({
      controlMode: 'stick',
      darkMode: true,
      hapticsEnabled: true,
      movementSpeed: 0.33,
      toggleReducedMotion: true
    });
  });

  test('keys of removed settings stored by an older build (camScale, Trail Fade, Trail Shine, Animated Background) are ignored, never re-written, and scrubbed', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({
      camScale: 50,
      controlMode: 'arrows',
      toggleAnimatedBackdrop: false,
      toggleTrailFade: true,
      toggleTrailPulse: false
    }));

    const settings = readLegacyGameToggleSettings(storage, LEGACY_DEFAULTS);
    for (const key of RETIRED_GAME_TOGGLE_KEYS) {
      expect(settings, key).not.toHaveProperty(key);
      expect(pickLegacyGameTogglePreferences(settings), key).not.toHaveProperty(key);
    }
    expect(settings.controlMode).toBe('arrows');
    // a stored legacy value changes nothing: Reduce Motion stays at its own default
    expect(settings.toggleReducedMotion).toBe(false);

    // Writing never resurrects the keys.
    writeLegacyGameToggleSettings(storage, settings);
    for (const key of RETIRED_GAME_TOGGLE_KEYS) {
      expect(JSON.parse(storage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY) ?? '{}'), key).not.toHaveProperty(key);
    }

    // The scrub removes them from a blob that was not re-written, keeping the other keys.
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({
      camScale: -50, hapticsEnabled: false, toggleTrailFade: true, toggleTrailPulse: true, toggleAnimatedBackdrop: true
    }));
    expect(scrubRetiredGameToggleKeysFromStorage(storage)).toBe(true);
    expect(JSON.parse(storage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY) ?? '{}')).toEqual({ hapticsEnabled: false });
    expect(scrubRetiredGameToggleKeysFromStorage(storage)).toBe(false);
    expect(scrubRetiredGameToggleKeysFromStorage(undefined)).toBe(false);
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, '{');
    expect(scrubRetiredGameToggleKeysFromStorage(storage)).toBe(false);
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, '[1]');
    expect(scrubRetiredGameToggleKeysFromStorage(storage)).toBe(false);
  });

  test('a blob made only of removed keys, or with garbage in them, never crashes and reads as the defaults', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({
      toggleAnimatedBackdrop: 'maybe', toggleTrailFade: { nested: true }, toggleTrailPulse: null
    }));
    expect(readLegacyGameToggleSettings(storage, LEGACY_DEFAULTS)).toEqual(LEGACY_DEFAULTS);
  });

  test('account sync: a fingerprint stored by an older build is canonicalised, so the first load makes no phantom local edit', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);
    const current = JSON.stringify(pickLegacyGameTogglePreferences(settings));
    const oldBuild = JSON.stringify({
      controlMode: 'stick', darkMode: true, hapticsEnabled: true, movementSpeed: 0.04,
      toggleAnimatedBackdrop: true, toggleReducedMotion: false, toggleTrailFade: false, toggleTrailPulse: true
    });
    expect(canonicalizeGameToggleFingerprint(oldBuild)).toBe(current);
    expect(canonicalizeGameToggleFingerprint(current)).toBe(current);
    expect(canonicalizeGameToggleFingerprint('not json')).toBe('not json');
    expect(canonicalizeGameToggleFingerprint('[1]')).toBe('[1]');
  });

  test('account sync: the picked preferences (what is pushed to the profile) carry none of the removed keys, and older/newer payloads both read', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);
    expect(Object.keys(pickLegacyGameTogglePreferences(settings)).sort()).toEqual([
      'controlMode', 'darkMode', 'hapticsEnabled', 'movementSpeed', 'toggleReducedMotion'
    ]);
    // an older client's profile JSON (with the removed keys) merges without error and without leaking them
    const merged = mergeLegacyGameTogglePreferences(settings, {
      hapticsEnabled: false,
      toggleTrailFade: true,
      toggleTrailPulse: false,
      toggleAnimatedBackdrop: false
    } as never);
    expect(merged.hapticsEnabled).toBe(false);
    for (const key of RETIRED_GAME_TOGGLE_KEYS) {
      expect(merged, key).not.toHaveProperty(key);
    }
    // a newer client's profile JSON (without them) is a normal payload for an older reader: nothing else changed
    expect(mergeLegacyGameTogglePreferences(settings, { hapticsEnabled: false }).toggleReducedMotion).toBe(false);
  });

  test('a stored blob holding only removed keys is not migrated into guest scope', () => {
    const storage = new MemoryStorage();
    const guestStorage = createLegacyAuthScopedStorage(storage, LEGACY_GAME_TOGGLE_STORAGE_KEY, { userId: null });
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({ camScale: 25, toggleTrailFade: true, toggleTrailPulse: false }));

    expect(migrateLegacyGameToggleSettingsToGuestScope(storage, guestStorage, LEGACY_DEFAULTS)).toBe(false);
    expect(readLegacyGameToggleSettings(guestStorage, LEGACY_DEFAULTS)).toEqual(LEGACY_DEFAULTS);
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
      hapticsEnabled: 'no',
      toggleReducedMotion: 'on'
    }));

    const settings = readLegacyGameToggleSettings(storage, LEGACY_DEFAULTS);

    expect(settings.controlMode).toBe('stick');
    expect(settings.darkMode).toBe(true);
    expect(settings.movementSpeed).toBe(1);
    expect(settings.hapticsEnabled).toBe(false);
    expect(settings.toggleReducedMotion).toBe(true);

    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, '{');
    expect(readLegacyGameToggleSettings(storage, LEGACY_DEFAULTS)).toEqual(LEGACY_DEFAULTS);
  });

  test('continues when storage writes are blocked', () => {
    const settings = mergeLegacyGameTogglePreferences(LEGACY_DEFAULTS, {
      controlMode: 'stick',
      hapticsEnabled: false
    });

    const written = writeLegacyGameToggleSettings({
      setItem: () => {
        throw new Error('blocked');
      }
    }, settings);

    expect(written.controlMode).toBe('stick');
    expect(written.hapticsEnabled).toBe(false);
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
      hapticsEnabled: false
    }));
    writeLegacyGameToggleSettings(userStorage, mergeLegacyGameTogglePreferences(LEGACY_DEFAULTS, {
      controlMode: 'stick',
      hapticsEnabled: true
    }));

    expect(storage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(resolveLegacyAuthScopedStorageKey(LEGACY_GAME_TOGGLE_STORAGE_KEY, { userId: null }))).not.toBeNull();
    expect(storage.getItem(resolveLegacyAuthScopedStorageKey(LEGACY_GAME_TOGGLE_STORAGE_KEY, { userId: 'user-123' }))).not.toBeNull();
    expect(readLegacyGameToggleSettings(guestStorage, LEGACY_DEFAULTS).controlMode).toBe('arrows');
    expect(readLegacyGameToggleSettings(guestStorage, LEGACY_DEFAULTS).hapticsEnabled).toBe(false);
    expect(readLegacyGameToggleSettings(userStorage, LEGACY_DEFAULTS).controlMode).toBe('stick');
    expect(readLegacyGameToggleSettings(userStorage, LEGACY_DEFAULTS).hapticsEnabled).toBe(true);
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
      hapticsEnabled: true,
      movementSpeed: 0.72,
      toggleAnimatedBackdrop: false,
      toggleReducedMotion: true,
      toggleTrailFade: true,
      toggleTrailPulse: false
    }));

    expect(migrateLegacyGameToggleSettingsToGuestScope(storage, guestStorage, LEGACY_DEFAULTS)).toBe(true);

    const migrated = readLegacyGameToggleSettings(guestStorage, LEGACY_DEFAULTS);
    expect(pickLegacyGameTogglePreferences(migrated)).toEqual({
      controlMode: 'arrows',
      darkMode: false,
      hapticsEnabled: true,
      movementSpeed: 0.72,
      toggleReducedMotion: true
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
      hapticsEnabled: true
    }));
    writeLegacyGameToggleSettings(guestStorage, mergeLegacyGameTogglePreferences(LEGACY_DEFAULTS, {
      controlMode: 'stick',
      hapticsEnabled: false
    }));

    expect(migrateLegacyGameToggleSettingsToGuestScope(storage, guestStorage, LEGACY_DEFAULTS)).toBe(false);

    const retained = readLegacyGameToggleSettings(guestStorage, LEGACY_DEFAULTS);
    expect(retained.controlMode).toBe('stick');
    expect(retained.hapticsEnabled).toBe(false);
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
      hapticsEnabled: 'maybe'
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
    values.set(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({ hapticsEnabled: false }));
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
    expect(readLegacyGameToggleSettings(guestStorage, LEGACY_DEFAULTS).hapticsEnabled).toBe(false);
    expect(values.get(LEGACY_GAME_TOGGLE_STORAGE_KEY)).not.toBeUndefined();
  });
});
