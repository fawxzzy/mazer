import { describe, expect, test, vi } from 'vitest';

import { LEGACY_MAIN_MENU_ROW_IDS, LEGACY_PLAY_MENU_ROW_IDS, LEGACY_SHARED_MENU_ROW_IDS } from '../../src/legacy-runtime/legacyMenuRows';
import { BUTTON_ICON_HUD_TEXTURE_IDS, isButtonIconId } from '../../src/render/buttonIcons';
import {
  MENU_ROW_ICON_SOURCES,
  drawMenuRowVectorIcon,
  resolveMenuRowVectorIconId
} from '../../src/render/menuRowIcons';

// MAZER-UI-095/096/097: one icon registry for both Menu dropdowns, every glyph from the C Star Dust set.
describe('menu row icons (menuRowIcons.ts)', () => {
  const allIds = [...new Set([...LEGACY_MAIN_MENU_ROW_IDS, ...LEGACY_PLAY_MENU_ROW_IDS])];

  test('every row of either dropdown has exactly one icon source, and the shared rows draw the same icon on both', () => {
    expect(Object.keys(MENU_ROW_ICON_SOURCES).sort()).toEqual([...allIds].sort());
    // Shared rows (Settings, Guide, Sound) are looked up by the same id on both screens, so they cannot differ.
    for (const id of LEGACY_SHARED_MENU_ROW_IDS) {
      expect(LEGACY_MAIN_MENU_ROW_IDS).toContain(id);
      expect(LEGACY_PLAY_MENU_ROW_IDS).toContain(id);
    }
  });

  test('every icon is a Star Dust button icon: vector ids are in the set, hud ids are baked HUD textures', () => {
    for (const id of allIds) {
      const source = MENU_ROW_ICON_SOURCES[id];
      if (source.kind === 'vector') {
        expect(isButtonIconId(source.iconId), id).toBe(true);
        if (source.offIconId !== undefined) {
          expect(isButtonIconId(source.offIconId), id).toBe(true);
        }
      } else {
        expect(Object.keys(BUTTON_ICON_HUD_TEXTURE_IDS), id).toContain(source.hudIcon);
      }
    }
  });

  test('Guide, Sound, Reset level and Main menu use guide, soundOn/soundOff, reset and home', () => {
    expect(resolveMenuRowVectorIconId('guide', { soundEnabled: true })).toBe('guide');
    expect(resolveMenuRowVectorIconId('sound', { soundEnabled: true })).toBe('soundOn');
    expect(resolveMenuRowVectorIconId('sound', { soundEnabled: false })).toBe('soundOff');
    expect(resolveMenuRowVectorIconId('reset-level', { soundEnabled: false })).toBe('reset');
    expect(resolveMenuRowVectorIconId('main-menu', { soundEnabled: true })).toBe('home');
    for (const id of ['settings', 'profile', 'leaderboard'] as const) {
      expect(resolveMenuRowVectorIconId(id, { soundEnabled: true }), id).toBeNull();
    }
  });

  const fakeGraphics = () => {
    const g = {
      setVisible: vi.fn(() => g),
      setAlpha: vi.fn(() => g),
      lineStyle: vi.fn(() => g),
      fillStyle: vi.fn(() => g),
      beginPath: vi.fn(() => g),
      moveTo: vi.fn(() => g),
      lineTo: vi.fn(() => g),
      arc: vi.fn(() => g),
      closePath: vi.fn(() => g),
      strokePath: vi.fn(() => g),
      fillPath: vi.fn(() => g),
      strokeCircle: vi.fn(() => g),
      fillCircle: vi.fn(() => g),
      strokeRoundedRect: vi.fn(() => g),
      fillRoundedRect: vi.fn(() => g),
      strokeRect: vi.fn(() => g),
      fillRect: vi.fn(() => g),
      strokeEllipse: vi.fn(() => g),
      fillEllipse: vi.fn(() => g),
      strokePoints: vi.fn(() => g),
      fillPoints: vi.fn(() => g),
      strokeLineShape: vi.fn(() => g),
      lineBetween: vi.fn(() => g),
      save: vi.fn(() => g),
      restore: vi.fn(() => g),
      translateCanvas: vi.fn(() => g),
      scaleCanvas: vi.fn(() => g),
      rotateCanvas: vi.fn(() => g)
    };
    return g;
  };

  test('a texture row or a fully faded row hides its graphics; a vector row shows it at the row alpha', () => {
    const hud = fakeGraphics();
    drawMenuRowVectorIcon(hud as never, 'settings', 10, 10, 20, 1, { soundEnabled: true });
    expect(hud.setVisible).toHaveBeenCalledWith(false);
    const faded = fakeGraphics();
    drawMenuRowVectorIcon(faded as never, 'guide', 10, 10, 20, 0, { soundEnabled: true });
    expect(faded.setVisible).toHaveBeenCalledWith(false);
    const shown = fakeGraphics();
    drawMenuRowVectorIcon(shown as never, 'guide', 10, 10, 20, 0.5, { soundEnabled: true });
    expect(shown.setVisible).toHaveBeenCalledWith(true);
    expect(shown.setAlpha).toHaveBeenCalledWith(0.5);
  });
});
