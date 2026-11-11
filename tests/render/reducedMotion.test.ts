import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, copyLegacySettings } from '../../src/legacy-runtime/legacyDefaults';
import {
  LEGACY_GAME_TOGGLE_STORAGE_KEY,
  readLegacyGameToggleSettings,
  writeLegacyGameToggleSettings
} from '../../src/legacy-runtime/legacyGameTogglePreferences';
import { applyLegacyOverlayToggleField } from '../../src/legacy-runtime/legacyOverlayToggleFields';
import {
  LEGACY_SETTINGS_GROUP_ROWS,
  buildLegacySettingsSheetPlan
} from '../../src/legacy-runtime/legacySettingsSheetPlan';
import {
  REDUCED_MOTION_BLINK_PHASE,
  REDUCED_MOTION_SETTING_NOTE,
  resolveMenuBlinkPhase,
  resolveReducedMotion,
  resolveReducedMotionSource,
  resolveWordmarkHueTimeMs
} from '../../src/render/reducedMotion';

class MemoryStorage {
  public values = new Map<string, string>();
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('reduced motion resolution', () => {
  test('is on when the device asks OR the setting is on; the setting cannot switch the device off', () => {
    expect(resolveReducedMotion(false, false)).toBe(false);
    expect(resolveReducedMotion(true, false)).toBe(true);
    expect(resolveReducedMotion(false, true)).toBe(true);
    expect(resolveReducedMotion(true, true)).toBe(true);
    expect(resolveReducedMotionSource(false, false)).toBe('none');
    expect(resolveReducedMotionSource(true, false)).toBe('system');
    expect(resolveReducedMotionSource(false, true)).toBe('setting');
    expect(resolveReducedMotionSource(true, true)).toBe('system+setting');
  });

  test('blink icons are held fully lit and the wordmark hue is held at one phase', () => {
    const samples = [0, 600, 1234, 98765];
    expect(new Set(samples.map((t) => resolveMenuBlinkPhase(t, 2400, true)))).toEqual(new Set([REDUCED_MOTION_BLINK_PHASE]));
    expect(new Set(samples.map((t) => resolveMenuBlinkPhase(t, 2400, false))).size).toBeGreaterThan(1);
    expect(new Set(samples.map((t) => resolveWordmarkHueTimeMs(t, true)))).toEqual(new Set([0]));
    expect(resolveWordmarkHueTimeMs(1234, false)).toBe(1234);
  });
});

describe('Reduce Motion setting', () => {
  test('defaults to System (off), toggles, and persists across a reload', () => {
    expect(LEGACY_DEFAULTS.toggleReducedMotion).toBe(false);
    const toggled = applyLegacyOverlayToggleField(copyLegacySettings(LEGACY_DEFAULTS), 'toggleReducedMotion');
    expect(toggled.settings.toggleReducedMotion).toBe(true);
    expect(toggled.stateText).toBe('On');
    expect(toggled.affectsBackdrop).toBe(true);
    const back = applyLegacyOverlayToggleField(toggled.settings, 'toggleReducedMotion');
    expect(back.settings.toggleReducedMotion).toBe(false);
    expect(back.stateText).toBe('System');

    const storage = new MemoryStorage();
    writeLegacyGameToggleSettings(storage, toggled.settings);
    expect(JSON.parse(storage.values.get(LEGACY_GAME_TOGGLE_STORAGE_KEY)!).toggleReducedMotion).toBe(true);
    expect(readLegacyGameToggleSettings(storage).toggleReducedMotion).toBe(true);
  });

  test('an older stored blob without the key reads as System', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_GAME_TOGGLE_STORAGE_KEY, JSON.stringify({ controlMode: 'arrows', toggleTrailPulse: false }));
    const settings = readLegacyGameToggleSettings(storage);
    expect(settings.toggleReducedMotion).toBe(false);
    expect(settings.controlMode).toBe('arrows');
  });

  test('both Settings sheets list the toggle and a note that names what it freezes', () => {
    const ids = LEGACY_SETTINGS_GROUP_ROWS.map((r) => r.id);
    expect(ids.slice(-2)).toEqual(['reduce-motion', 'reduce-motion-note']);
    for (const word of ['trail', 'edge-marker', 'title', 'level-number', 'icons', 'background', 'sparkles', 'Gameplay is unchanged', 'System']) {
      expect(REDUCED_MOTION_SETTING_NOTE).toContain(word);
    }
    for (const viewport of [{ height: 568, width: 320 }, { height: 844, width: 390 }, { height: 720, width: 1280 }]) {
      for (const context of ['menu', 'pause'] as const) {
        const plan = buildLegacySettingsSheetPlan({ context, settingsExpanded: true, signedIn: true, ...viewport });
        const note = plan.items.find((item) => item.model.id === 'reduce-motion-note')!;
        const toggle = plan.items.find((item) => item.model.id === 'reduce-motion')!;
        expect(note.interactive).toBe(false);
        expect(toggle.interactive).toBe(true);
        expect(note.rect.top).toBeGreaterThan(toggle.rect.top);
      }
    }
  });

  test('the scene folds the setting into the one reduced-motion gate and never reads the media query elsewhere', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    expect(source).toContain('resolveReducedMotion(this.legacyReducedMotionEnabled, this.settings.toggleReducedMotion)');
    expect(source.match(/matchMedia\('\(prefers-reduced-motion/g)?.length).toBe(1);
    expect(source).not.toMatch(/Math\.sin\(\(time \/ LEGACY_MENU_BLINK_PULSE_MS\)/);
  });
});
