import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, copyLegacySettings } from '../../src/legacy-runtime/legacyDefaults';
import {
  LEGACY_GAME_TOGGLE_STORAGE_KEY,
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

    expect(settings.controlMode).toBe('arrows');
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
});
