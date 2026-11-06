import { existsSync, readFileSync } from 'node:fs';
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
  test('the shared Settings sheet paints player-facing rows only; no zoom control or zoom setting exists', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(source).not.toContain('shouldShowLegacyAdvancedOptions');
    expect(source).not.toContain("this.createInputRow('Maze Scale'");
    expect(source).not.toContain("this.createColorInputRow('Path RGB 0-255'");
    // Board Zoom was removed 2026-11-06: the board size is frozen by product decision.
    expect(source).not.toContain('camScale');
    expect(source).not.toContain('applyLegacyCameraZoom');
    expect(source).not.toContain('createBoardZoomSliderRow');
    expect(source).not.toContain('legacyCameraZoom');
    expect(existsSync(resolve(process.cwd(), 'src/legacy-runtime/legacyCameraZoom.ts'))).toBe(false);
  });
});
