import { describe, expect, test } from 'vitest';
import { MAIN_MENU_BUTTONS } from '../../src/legacy-runtime/legacyDefaults';
import {
  isLegacyGlyphWordRenderable,
  resolveLegacyGlyphWordColumns,
  resolveLegacyGlyphWordLayout
} from '../../src/legacy-runtime/legacyMenuTitle';

describe('front-door play label (MAZER-UI-050)', () => {
  test('the primary menu label is TAP TO PLAY and renders through the tile-glyph system', () => {
    expect(MAIN_MENU_BUTTONS[0]).toBe('TAP TO PLAY');
    expect(isLegacyGlyphWordRenderable(MAIN_MENU_BUTTONS[0])).toBe(true);
  });

  test('11 characters span 65 columns and fit inside 320 / 390 wide viewports at the cell size the button derives', () => {
    expect(resolveLegacyGlyphWordColumns('TAP TO PLAY')).toBe(65);
    for (const viewportWidth of [320, 390]) {
      const padding = Math.max(10, Math.round(viewportWidth * 0.1));
      const cell = Math.max(2, Math.floor((viewportWidth - (padding * 2)) / 65));
      const layout = resolveLegacyGlyphWordLayout('TAP TO PLAY', viewportWidth / 2, 100, cell);
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.left + layout.width).toBeLessThanOrEqual(viewportWidth);
    }
  });

  test('the word space draws nothing and P / Y have lit cells', () => {
    expect(resolveLegacyGlyphWordLayout(' ', 0, 0, 1).cells).toHaveLength(0);
    expect(resolveLegacyGlyphWordLayout('P', 0, 0, 1).cells.length).toBeGreaterThan(0);
    expect(resolveLegacyGlyphWordLayout('Y', 0, 0, 1).cells.length).toBeGreaterThan(0);
  });
});
