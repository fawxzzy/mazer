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
  REDUCED_MOTION_BLEED_GLOW_PROGRESS,
  resolveReducedMotionSource,
  resolveTrailColourTimeMs,
  resolveTrailMotionPlan
} from '../../src/render/reducedMotion';
import { resolveBleedGlowColor, resolveBleedGlowEnvelope, resolveBleedGlowProgress } from '../../src/render/bleedGlow';
import { resolveEdgeMarkerStates } from '../../src/render/edgeMarkers';
import { resolveTrailBreath } from '../../src/render/trailIridescence';
import { TRAIL_PULSE_REDUCED_LEVEL, sampleIridescentTrail } from '../../src/render/trailPalette';

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

  test('blink icons are held fully lit under reduced motion', () => {
    const samples = [0, 600, 1234, 98765];
    expect(new Set(samples.map((t) => resolveMenuBlinkPhase(t, 2400, true)))).toEqual(new Set([REDUCED_MOTION_BLINK_PHASE]));
    expect(new Set(samples.map((t) => resolveMenuBlinkPhase(t, 2400, false))).size).toBeGreaterThan(1);
  });
});

describe('owner rule: reduced motion stops movement and pulsing, never colour', () => {
  test('the trail motion plan separates the shine/breath (movement) from the hue drift (colour)', () => {
    // Trail Shine on: reduced motion stops the shine but the colour keeps drifting.
    expect(resolveTrailMotionPlan(true, false)).toEqual({ shineVisible: true, colourDrifts: true });
    expect(resolveTrailMotionPlan(true, true)).toEqual({ shineVisible: false, colourDrifts: true });
    // Trail Shine off is the player's own static-trail choice and still holds both, reduced motion or not.
    expect(resolveTrailMotionPlan(false, false)).toEqual({ shineVisible: false, colourDrifts: false });
    expect(resolveTrailMotionPlan(false, true)).toEqual({ shineVisible: false, colourDrifts: false });
  });

  test('the colour time is the live colour clock whenever the colour drifts, else one fixed phase', () => {
    const reduced = resolveTrailMotionPlan(true, true);
    expect([0, 700, 98765].map((t) => resolveTrailColourTimeMs(t, reduced))).toEqual([0, 700, 98765]);
    const staticTrail = resolveTrailMotionPlan(false, true);
    expect([0, 700, 98765].map((t) => resolveTrailColourTimeMs(t, staticTrail))).toEqual([0, 0, 0]);
  });

  test('the bleed-dock band holds at its lit peak under reduced motion and still travels otherwise', () => {
    expect(resolveBleedGlowProgress(0, true)).toBe(REDUCED_MOTION_BLEED_GLOW_PROGRESS);
    expect(resolveBleedGlowProgress(123456, true)).toBe(REDUCED_MOTION_BLEED_GLOW_PROGRESS);
    expect(resolveBleedGlowEnvelope(REDUCED_MOTION_BLEED_GLOW_PROGRESS)).toBe(1);
    expect(resolveBleedGlowProgress(0)).not.toBe(resolveBleedGlowProgress(500));
  });

  test('under reduced motion the trail, edge-marker border and dock glow colours still change with the colour clock, while shine and swell are still', () => {
    const out = { core: 0, glow: 0, wave: 0, sheen: 0 };
    const plan = resolveTrailMotionPlan(true, true);
    const cores = new Set<number>();
    for (let t = 0; t < 8000; t += 500) {
      const time = resolveTrailColourTimeMs(t, plan);
      cores.add(sampleIridescentTrail(4, time, !plan.shineVisible, out).core);
      expect(out.sheen).toBe(0);
      expect(out.wave).toBe(TRAIL_PULSE_REDUCED_LEVEL);
      expect(resolveTrailBreath(t, !plan.shineVisible)).toBe(0.5);
    }
    expect(cores.size).toBeGreaterThan(6);
    const border = (t: number) => resolveEdgeMarkerStates({ reducedMotion: true, timeMs: t, trailTimeMs: t, trailHeadDistanceTiles: 4, trailAnimated: false })[0]!.borderColor;
    expect(border(0)).not.toBe(border(1500));
    const glow = (t: number) => resolveBleedGlowColor({ distanceTiles: 4, timeMs: t, animated: false }, t, true);
    expect(glow(0)).not.toBe(glow(1500));
    expect(glow(1500)).toBe(border(1500));
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

  test('both Settings sheets list the toggle and a note that says it stops movement and pulsing and colours keep shifting', () => {
    const ids = LEGACY_SETTINGS_GROUP_ROWS.map((r) => r.id);
    const at = ids.indexOf('reduce-motion');
    expect(at).toBeGreaterThan(-1);
    expect(ids.slice(at, at + 2)).toEqual(['reduce-motion', 'reduce-motion-note']);
    for (const word of ['Stops movement and pulsing', 'trail shine', 'blinking icons', 'Colours keep shifting', 'Gameplay is unchanged', 'System']) {
      expect(REDUCED_MOTION_SETTING_NOTE).toContain(word);
    }
    // the old "holds still: colours" wording is gone
    expect(REDUCED_MOTION_SETTING_NOTE).not.toMatch(/Holds still/i);
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
