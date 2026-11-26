import type Phaser from 'phaser';
import type { LegacyMenuRowId } from '../legacy-runtime/legacyMenuRows';
import {
  BUTTON_ICON_HUD_TEXTURE_IDS,
  cssHexToNumber,
  drawButtonIconGraphics,
  resolveButtonIconColours,
  type ButtonIconId
} from './buttonIcons';

/**
 * MAZER-UI-095 / MAZER-UI-096: the ONE place the row icons of BOTH Menu dropdowns (main menu and in-game) are chosen.
 * MAZER-UI-097: every icon is a C Star Dust button icon (src/render/buttonIcons.ts), so both menus draw the same set:
 *
 *   Settings     settings  (BootScene's baked HUD texture + its pressed bake)
 *   Profile      profile   (baked HUD texture; main menu only)
 *   Leaderboard  leaderboard (baked HUD texture; main menu only)
 *   Guide        guide     (Graphics)
 *   Sound        soundOn / soundOff by the current setting (Graphics; Sound off has no spark, per the set)
 *   Reset level  reset     (Graphics; in-game only)
 *   Main menu    home      (Graphics; in-game only)
 *
 * A highlighted (lit) row uses the set's pressed colours, the same as the baked textures' pressed variant.
 * MenuScene only asks this module; for the three 'hud' glyphs it maps the name to BootScene's baked texture and its
 * source metrics in one method (resolveLegacyMenuRowIconTexture).
 */

export type MenuRowHudIcon = keyof typeof BUTTON_ICON_HUD_TEXTURE_IDS;

export type MenuRowIconSource =
  | { readonly kind: 'hud'; readonly hudIcon: MenuRowHudIcon }
  | { readonly kind: 'vector'; readonly iconId: ButtonIconId; readonly offIconId?: ButtonIconId };

export const MENU_ROW_ICON_SOURCES: Readonly<Record<LegacyMenuRowId, MenuRowIconSource>> = Object.freeze({
  guide: { iconId: 'guide', kind: 'vector' },
  leaderboard: { hudIcon: 'leaderboard', kind: 'hud' },
  'main-menu': { iconId: 'home', kind: 'vector' },
  profile: { hudIcon: 'profile', kind: 'hud' },
  'reset-level': { iconId: 'reset', kind: 'vector' },
  settings: { hudIcon: 'settings', kind: 'hud' },
  sound: { iconId: 'soundOn', kind: 'vector', offIconId: 'soundOff' }
});

export interface MenuRowIconState {
  readonly soundEnabled: boolean;
}

/** Which Star Dust glyph a vector row draws right now (null for texture rows). */
export const resolveMenuRowVectorIconId = (id: LegacyMenuRowId, state: MenuRowIconState): ButtonIconId | null => {
  const source = MENU_ROW_ICON_SOURCES[id];
  if (source.kind !== 'vector') {
    return null;
  }
  return id === 'sound' && !state.soundEnabled && source.offIconId !== undefined ? source.offIconId : source.iconId;
};

/**
 * The baked HUD textures draw the glyph on HUD_ICON_GLYPH_BOX of the cell and MenuScene crops to it, so the visible
 * glyph fills the row's icon box; the Graphics glyphs use the same box so both kinds read at the same size.
 */
export const MENU_ROW_VECTOR_ICON_SCALE = 1;

/** Paints a vector row icon centred on (centerX, centerY) into its own graphics (the caller clears it). */
export const drawMenuRowVectorIcon = (
  graphics: Phaser.GameObjects.Graphics,
  id: LegacyMenuRowId,
  centerX: number,
  centerY: number,
  size: number,
  alpha: number,
  state: MenuRowIconState,
  lit = false
): void => {
  const iconId = resolveMenuRowVectorIconId(id, state);
  if (iconId === null || alpha <= 0) {
    graphics.setVisible(false);
    return;
  }
  graphics.setVisible(true).setAlpha(alpha);
  const colours = resolveButtonIconColours(lit ? 'pressed' : 'idle');
  drawButtonIconGraphics(
    graphics,
    iconId,
    centerX,
    centerY,
    size * MENU_ROW_VECTOR_ICON_SCALE,
    { ink: cssHexToNumber(colours.ink), spark: cssHexToNumber(colours.spark) },
    1
  );
};
