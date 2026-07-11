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

  test('routes menu options through the player-facing gate', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(source).toContain('const showAdvancedOptions = this.shouldShowLegacyAdvancedOptions();');
    expect(source).toContain('if (showAdvancedOptions) {');
    expect(source).toContain("this.createInputRow('Maze Scale'");
    expect(source).toContain("this.createInputRow('Camera Scale'");
    expect(source).toContain('if (showAdvancedOptions && !compact) {');
    expect(source).toContain("this.createColorInputRow('Path RGB 0-255'");
    expect(source).toContain("this.createColorInputRow('Wall RGB 0-255'");
  });
});
