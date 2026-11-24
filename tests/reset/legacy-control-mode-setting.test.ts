import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveTouchControlLayout } from '../../src/input-human/touch';
import {
  LEGACY_GUIDE_HAZARD_ROWS,
  LEGACY_GUIDE_KEY_BINDINGS,
  LEGACY_GUIDE_PENDING_ROWS,
  LEGACY_GUIDE_ROWS
} from '../../src/legacy-runtime/legacyGuideContent';
import { buildLegacySettingsSheetModel } from '../../src/legacy-runtime/legacySettingsSheetPlan';

/**
 * MAZER-UI-093 audit pin: "Check whether the Arrows setting does anything".
 *
 * Finding (2026-11-24): the Arrows / Stick control style (`settings.controlMode`) does nothing a player can see or
 * feel. Commit 0723a26e (2026-08-20) replaced the fixed touch arrows with the floating stick and removed the Controls
 * row (offLabel 'Arrows', onLabel 'Stick') from Settings in the same change. Since then every touch in play starts a
 * floating stick wherever the thumb lands, in both modes. The value is still stored (device toggles, the remote
 * progress row, cycle telemetry, the QA diagnostics snapshot), which is data plumbing, not a setting.
 *
 * This test pins that result so the sheet, the Guide and the touch path cannot silently drift apart again: if a
 * later card brings a control style back it must change this file on purpose.
 */
const read = (path: string): string => readFileSync(resolve(__dirname, '../..', path), 'utf8').replace(/\r\n?/g, '\n');
const MENU_SCENE = read('src/scenes/MenuScene.ts');
const sceneMethod = (signature: string): string => {
  const start = MENU_SCENE.indexOf(signature);
  expect(start, signature).toBeGreaterThanOrEqual(0);
  return MENU_SCENE.slice(start, MENU_SCENE.indexOf('\n  }\n', start));
};
const CONTROL_STYLE_WORDS = /\bArrows\b|\bStick\b|control (?:style|mode)|controlMode/;

describe('MAZER-UI-093: the Arrows control style is not a setting any more', () => {
  test('neither Settings sheet has a row for it (no label or state word Arrows / Stick)', () => {
    for (const context of ['menu', 'pause'] as const) {
      const rows = buildLegacySettingsSheetModel(context).sections.flatMap((section) => section.rows);
      for (const row of rows) {
        expect(row.settingKey, row.id).not.toBe('controlMode');
        expect([row.label, row.onLabel ?? '', row.offLabel ?? ''].join(' '), row.id).not.toMatch(CONTROL_STYLE_WORDS);
      }
    }
  });

  test('the Guide does not mention a control style either (Arrow keys is the keyboard row)', () => {
    const guideText = [
      ...LEGACY_GUIDE_ROWS.map((row) => JSON.stringify(row)),
      ...LEGACY_GUIDE_HAZARD_ROWS.map((row) => JSON.stringify(row)),
      ...LEGACY_GUIDE_PENDING_ROWS.map((row) => JSON.stringify(row))
    ].join('\n');
    expect(guideText).not.toMatch(/\bArrows\b|control (?:style|mode)|controlMode/);
    expect(LEGACY_GUIDE_KEY_BINDINGS.map((binding) => binding.label)).toContain('Arrow keys');
  });

  test('touch play ignores it: the touch-down path never reads controlMode and always starts the floating stick', () => {
    const touchDown = sceneMethod('private handleLegacyPlayTouchControl(');
    expect(touchDown).not.toMatch(/controlMode/);
    expect(touchDown).toContain('this.playFloatingStickOrigin = { x, y };');
    // The fixed-arrows pointer slot is only ever cleared, never given a pointer.
    expect(MENU_SCENE).not.toMatch(/this\.playTouchArrowPointerId = (?!null;)/);
  });

  test('the play layout gives the Menu button the same hit target in both modes', () => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }, { width: 412, height: 915 }]) {
      const layout = (controlMode: 'arrows' | 'stick') => resolveTouchControlLayout(viewport, {
        compact: true,
        controlMode,
        placement: viewport.width >= 720 && viewport.height >= 600 ? 'bottom-centered' : undefined
      });
      expect(layout('arrows').controls.pause).toEqual(layout('stick').controls.pause);
    }
  });
});
