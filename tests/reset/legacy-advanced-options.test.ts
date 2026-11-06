import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveLegacyAdvancedOptionsVisible } from '../../src/legacy-runtime/legacyAdvancedOptions';

describe('legacy advanced options visibility', () => {
  test('keeps non-player tuning controls hidden by default', () => {
    expect(resolveLegacyAdvancedOptionsVisible('')).toBe(false);
    expect(resolveLegacyAdvancedOptionsVisible('?runtimeDiagnostics=1')).toBe(false);
    expect(resolveLegacyAdvancedOptionsVisible('?content=core-only&mode=play')).toBe(false);
  });

  test('requires an explicit advanced or dev query flag', () => {
    expect(resolveLegacyAdvancedOptionsVisible('?advancedOptions=1')).toBe(true);
    expect(resolveLegacyAdvancedOptionsVisible('?advancedOptions=true')).toBe(true);
    expect(resolveLegacyAdvancedOptionsVisible('?devOptions=on')).toBe(true);
    expect(resolveLegacyAdvancedOptionsVisible(new URLSearchParams('advancedOptions=yes'))).toBe(true);
  });

  // 2026-11-06 wiring lane: the main-menu Settings sheet is the shared Pause-style sheet
  // (legacySettingsSheetPlan). The URL-flagged tuning rows (Maze Scale, Camera Scale, Path/Wall RGB)
  // are not part of that spec and are no longer painted; only the flag resolver above remains.
  test('the shared Settings sheet paints player-facing rows only; the Board Zoom slider is the zoom control', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(source).not.toContain('shouldShowLegacyAdvancedOptions');
    expect(source).not.toContain("this.createInputRow('Maze Scale'");
    expect(source).not.toContain("this.createColorInputRow('Path RGB 0-255'");
    expect(source).toContain('formatLegacyCameraZoomPercent(this.settings.camScale)');
    expect(source).toContain('resolveLegacyCameraZoomPosition(this.settings.camScale)');
    expect(source).toContain('private applyLegacyCameraZoom(value: number): void {');
  });
});
