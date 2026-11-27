import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_PLAY_LABEL_DESKTOP,
  LEGACY_PLAY_LABEL_TOUCH,
  isLegacyDesktopPointerDevice,
  isLegacyPlayLabel,
  resolveLegacyDesktopPlayLabelCell,
  resolveLegacyPlayLabel
} from '../../src/legacy-runtime/legacyPlayLabel';
import { isLegacyGlyphWordRenderable, resolveLegacyGlyphWordColumns } from '../../src/legacy-runtime/legacyMenuTitle';

const DESKTOP = { coarsePointer: false, finePointer: true, hoverCapable: true, standalone: false, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130' };
const PHONE = { coarsePointer: true, finePointer: false, hoverCapable: false, standalone: false, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148' };

describe('front-door play label (UI consistency batch D)', () => {
  test('touch keeps TAP TO PLAY; only a positively-desktop device reads PRESS TO PLAY', () => {
    expect(resolveLegacyPlayLabel(PHONE)).toBe(LEGACY_PLAY_LABEL_TOUCH);
    expect(resolveLegacyPlayLabel({})).toBe(LEGACY_PLAY_LABEL_TOUCH);
    expect(resolveLegacyPlayLabel({ ...DESKTOP, standalone: true })).toBe(LEGACY_PLAY_LABEL_TOUCH);
    expect(resolveLegacyPlayLabel({ finePointer: true, hoverCapable: false })).toBe(LEGACY_PLAY_LABEL_TOUCH);
    expect(resolveLegacyPlayLabel(DESKTOP)).toBe(LEGACY_PLAY_LABEL_DESKTOP);
    expect(isLegacyDesktopPointerDevice(DESKTOP)).toBe(true);
    expect(isLegacyDesktopPointerDevice(PHONE)).toBe(false);
  });

  test('both labels are recognised and both render through the dot-matrix glyph set', () => {
    for (const label of [LEGACY_PLAY_LABEL_TOUCH, LEGACY_PLAY_LABEL_DESKTOP]) {
      expect(isLegacyPlayLabel(label)).toBe(true);
      expect(isLegacyGlyphWordRenderable(label), label).toBe(true);
    }
    expect(isLegacyPlayLabel('Login')).toBe(false);
    expect(resolveLegacyGlyphWordColumns(LEGACY_PLAY_LABEL_DESKTOP)).toBeGreaterThan(resolveLegacyGlyphWordColumns(LEGACY_PLAY_LABEL_TOUCH));
  });

  test('the desktop cell comes from the viewport, is clamped to 4-8 px, and never drops below the old fit', () => {
    const columns = resolveLegacyGlyphWordColumns(LEGACY_PLAY_LABEL_DESKTOP);
    const cell = (viewportWidth: number, fallbackCell = 3) => resolveLegacyDesktopPlayLabelCell({ fallbackCell, glyphColumns: columns, viewportWidth });
    expect(cell(1280)).toBeGreaterThan(3);
    expect(cell(1280)).toBeGreaterThanOrEqual(4);
    expect(cell(3840)).toBe(8);
    expect(cell(700)).toBe(4);
    expect(cell(1280, 9)).toBe(9);
    // 40% of the viewport is the most the label may span.
    for (const width of [900, 1280, 1920, 2560]) {
      expect(cell(width) * columns).toBeLessThanOrEqual(Math.max(width * 0.4, 4 * columns));
    }
  });

  test('MenuScene wires the label through the module, on desktop-width layouts only', () => {
    const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n?/g, '\n');
    expect(scene).toContain('const startLabel = resolveLegacyPlayLabel(this.readLegacyPlayLabelDeviceFacts());');
    expect(scene).toContain('isLegacyPlayLabel(text) && this.layout.width >= LEGACY_MENU_PLAY_LABEL_PHONE_MAX_WIDTH_PX && isLegacyDesktopPointerDevice(');
    expect(scene).not.toContain('text === MAIN_MENU_BUTTONS[0]');
  });
});
