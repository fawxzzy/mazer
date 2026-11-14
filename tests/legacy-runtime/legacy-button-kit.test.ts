import { describe, expect, test } from 'vitest';
import {
  LEGACY_BUTTON_KIT,
  LEGACY_BUTTON_MAP,
  LEGACY_BUTTON_VARIANTS,
  LEGACY_TOGGLE_ROW,
  resolveLegacyButtonSize,
  resolveLegacyButtonVariant
} from '../../src/legacy-runtime/legacyButtonKit';

describe('legacy button kit', () => {
  test('offers primary, secondary, ghost, danger and icon, each with a 44 px minimum', () => {
    expect([...LEGACY_BUTTON_VARIANTS]).toEqual(['primary', 'secondary', 'ghost', 'danger', 'icon']);
    for (const variant of LEGACY_BUTTON_VARIANTS) {
      expect(LEGACY_BUTTON_KIT[variant].minWidthPx).toBeGreaterThanOrEqual(44);
      expect(LEGACY_BUTTON_KIT[variant].minHeightPx).toBeGreaterThanOrEqual(44);
    }
    expect(LEGACY_TOGGLE_ROW.minHeightPx).toBeGreaterThanOrEqual(44);
    expect(LEGACY_TOGGLE_ROW.labelElement).not.toBe(LEGACY_TOGGLE_ROW.stateElement);
  });

  test('every existing button maps to exactly one kit variant', () => {
    const ids = LEGACY_BUTTON_MAP.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of LEGACY_BUTTON_MAP) {
      expect(LEGACY_BUTTON_VARIANTS).toContain(entry.variant);
    }
    for (const id of ['start', 'login', 'sign-out', 'guide', 'auth-submit', 'install']) {
      expect(resolveLegacyButtonVariant(id)).not.toBeNull();
    }
    expect(resolveLegacyButtonVariant('sign-out')).toBe('danger');
    expect(resolveLegacyButtonVariant('nope')).toBeNull();
  });

  test('size resolution grows to the minimum and never shrinks', () => {
    expect(resolveLegacyButtonSize('icon', { width: 20, height: 20 })).toEqual({ width: 44, height: 44 });
    expect(resolveLegacyButtonSize('primary', { width: 200, height: 60 })).toEqual({ width: 200, height: 60 });
  });

  test('migration ratchet: no button draws its chrome from the kit yet (flip entries as surfaces migrate)', () => {
    expect(LEGACY_BUTTON_MAP.filter((entry) => entry.chromeViaKit)).toEqual([]);
  });
});
