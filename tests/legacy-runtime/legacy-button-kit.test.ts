import { describe, expect, test } from 'vitest';
import {
  LEGACY_BUTTON_KIT,
  LEGACY_BUTTON_MAP,
  LEGACY_BUTTON_VARIANTS,
  LEGACY_TOGGLE_ROW,
  resolveLegacyActionTone,
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

  test('migration ratchet: the action-button factory surfaces draw from the kit table (flip entries as surfaces migrate)', () => {
    expect(LEGACY_BUTTON_MAP.filter((entry) => entry.chromeViaKit).map((entry) => entry.id).sort()).toEqual(
      ['auth-secondary', 'auth-submit', 'guide', 'guide-got-it', 'leaderboard-back', 'leaderboard-retry', 'preview-jump-row', 'reset-progress', 'sheet-exit', 'sign-out']
    );
  });

  test('the three emphasis levels are visibly different: solid fill, outlined dark fill, no fill', () => {
    const primary = resolveLegacyActionTone('primary').chrome;
    const secondary = resolveLegacyActionTone('secondary').chrome;
    const ghost = resolveLegacyActionTone('ghost').chrome;
    expect(new Set([primary.fillKey, secondary.fillKey, ghost.fillKey]).size).toBe(3);
    expect(new Set([primary.textKey, secondary.textKey, ghost.textKey]).size).toBe(3);
    expect(LEGACY_BUTTON_KIT.primary.filled).toBe(true);
    expect(LEGACY_BUTTON_KIT.secondary.bordered).toBe(true);
    expect(LEGACY_BUTTON_KIT.ghost).toMatchObject({ filled: false, bordered: false });
  });

  test('every kit button keeps the 44 px minimum target', () => {
    for (const variant of LEGACY_BUTTON_VARIANTS) {
      expect(LEGACY_BUTTON_KIT[variant].minWidthPx).toBeGreaterThanOrEqual(44);
      expect(LEGACY_BUTTON_KIT[variant].minHeightPx).toBeGreaterThanOrEqual(44);
    }
  });

  test('action tones resolve to a kit variant and keep the pre-kit colours', () => {
    // MAZER-UI-099: primary is the solid mint fill with dark ink and no idle glow (never confusable with the outlined secondary).
    expect(resolveLegacyActionTone('primary')).toMatchObject({ variant: 'primary', chrome: { fillKey: 'primary', textKey: 'ink', litWhenIdle: false } });
    expect(resolveLegacyActionTone('ghost')).toMatchObject({ variant: 'ghost', chrome: { fillKey: 'none', textKey: 'link', litWhenIdle: false } });
    expect(resolveLegacyActionTone('secondary')).toMatchObject({ variant: 'secondary', chrome: { fillKey: 'control', textKey: 'soft', litWhenIdle: false } });
    expect(resolveLegacyActionTone('danger')).toMatchObject({ variant: 'danger', chrome: { fillKey: 'dangerFilled', textKey: 'signOut' } });
    expect(resolveLegacyActionTone('danger-outline')).toMatchObject({ variant: 'danger', chrome: { fillKey: 'control', textKey: 'signOut' } });
  });
});
