import { describe, expect, test, vi } from 'vitest';
import { LEGACY_DEFAULTS, copyLegacySettings } from '../../src/legacy-runtime/legacyDefaults';
import {
  LEGACY_HAPTIC_PATTERNS,
  isLegacyHapticSupported,
  triggerLegacyHaptic
} from '../../src/legacy-runtime/legacyHaptics';
import {
  normalizeLegacyGameTogglePreferences,
  readLegacyGameToggleSettings,
  writeLegacyGameToggleSettings
} from '../../src/legacy-runtime/legacyGameTogglePreferences';
import { applyLegacyOverlayToggleField } from '../../src/legacy-runtime/legacyOverlayToggleFields';
import { LEGACY_SETTINGS_GROUP_ROWS } from '../../src/legacy-runtime/legacySettingsSheetPlan';

const request = (over: Partial<Parameters<typeof triggerLegacyHaptic>[0]> = {}) => ({
  enabled: true,
  pattern: LEGACY_HAPTIC_PATTERNS.step,
  reducedMotion: false,
  ...over
});

describe('vibration helper', () => {
  test('vibrates with the requested pattern when enabled and supported', () => {
    const vibrate = vi.fn(() => true);
    expect(triggerLegacyHaptic(request({ pattern: [1, 2, 3] }), { vibrate })).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([1, 2, 3]);
  });

  test('does nothing when the Haptics setting is off', () => {
    const vibrate = vi.fn(() => true);
    expect(triggerLegacyHaptic(request({ enabled: false }), { vibrate })).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  test('does nothing under reduced motion', () => {
    const vibrate = vi.fn(() => true);
    expect(triggerLegacyHaptic(request({ reducedMotion: true }), { vibrate })).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  test('is a silent no-op where navigator.vibrate is missing (iOS Safari, desktop)', () => {
    expect(isLegacyHapticSupported({})).toBe(false);
    expect(isLegacyHapticSupported(undefined)).toBe(false);
    expect(triggerLegacyHaptic(request(), {})).toBe(false);
    expect(triggerLegacyHaptic(request(), undefined)).toBe(false);
  });

  test('swallows a throwing vibrate and reports a refused one', () => {
    expect(triggerLegacyHaptic(request(), { vibrate: () => { throw new Error('blocked'); } })).toBe(false);
    expect(triggerLegacyHaptic(request(), { vibrate: () => false })).toBe(false);
  });

  test('keeps the shipped step and goal patterns', () => {
    expect(LEGACY_HAPTIC_PATTERNS.step).toBe(6);
    expect([...LEGACY_HAPTIC_PATTERNS.goal]).toEqual([18, 40, 18, 40, 32]);
  });
});

describe('Haptics setting', () => {
  test('defaults on and survives copy', () => {
    expect(LEGACY_DEFAULTS.hapticsEnabled).toBe(true);
    expect(copyLegacySettings({ ...LEGACY_DEFAULTS, hapticsEnabled: false }).hapticsEnabled).toBe(false);
  });

  test('the toggle flips it and has a Settings row', () => {
    const off = applyLegacyOverlayToggleField(LEGACY_DEFAULTS, 'hapticsEnabled');
    expect(off.settings.hapticsEnabled).toBe(false);
    expect(off.stateText).toBe('Off');
    expect(applyLegacyOverlayToggleField(off.settings, 'hapticsEnabled').settings.hapticsEnabled).toBe(true);
    const row = LEGACY_SETTINGS_GROUP_ROWS.find((r) => r.id === 'haptics');
    expect(row?.settingKey).toBe('hapticsEnabled');
  });

  test('persists and normalises', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => { values.set(k, v); }
    };
    writeLegacyGameToggleSettings(storage, { ...LEGACY_DEFAULTS, hapticsEnabled: false });
    expect(readLegacyGameToggleSettings(storage, LEGACY_DEFAULTS).hapticsEnabled).toBe(false);
    expect(normalizeLegacyGameTogglePreferences({ hapticsEnabled: 'off' as unknown as boolean }).hapticsEnabled).toBe(false);
    expect(normalizeLegacyGameTogglePreferences({}).hapticsEnabled).toBe(true);
  });
});
