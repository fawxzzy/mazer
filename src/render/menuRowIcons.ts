import type Phaser from 'phaser';
import { designTokens } from '../theme/tokens';
import type { LegacyMenuRowId } from '../legacy-runtime/legacyMenuRows';
import { HUD_ICON_CELL_PX, resolveHudIconCell, type HudIconName } from './hudIconAtlas';
import { drawGuideSoundGlyph } from './guideSoundGlyph';
import { resolveStartSpiralArm, START_SPIRAL } from './endpointSpiral';
import { MENU_DROPDOWN_ACCENT, drawMenuBurgerGlyph } from './menuDropdownArt';

/**
 * MAZER-UI-095 / MAZER-UI-096: the ONE place the row icons of BOTH Menu dropdowns (main menu and in-game) are chosen.
 * Every icon is existing art; nothing new is drawn:
 *
 *   Settings     the HUD settings glyph (the baked texture the main-menu Settings row and the old in-game cog used)
 *   Profile      the HUD profile glyph (main menu only)
 *   Leaderboard  the HUD leaderboard glyph (main menu only)
 *   Guide        the HUD atlas "info" glyph, tinted to the same token as the other HUD icons
 *   Sound        the Guide's speaker glyph (guideSoundGlyph.ts); dimmed with a slash when Sound is off
 *   Reset level  the board's START spiral held still (endpointSpiral.ts): "back to the start"
 *   Main menu    the main menu's own three-line button glyph, closed (menuDropdownArt.ts)
 *
 * A later icons lane swaps a row's art here and nowhere else. MenuScene only asks this module; for the three 'hud'
 * glyphs it maps the name to BootScene's baked texture and its source metrics in one method
 * (resolveLegacyMenuRowIconTexture).
 */

/** Same tint the BootScene bakes the three menu HUD icons with. */
const PLAY_MENU_ICON_TINT = designTokens.color['semantic.info'];
/** Vector icons use the dropdown accent, which is that same token (cyberArcadeMaterial.rail.cyan). */
const PLAY_MENU_VECTOR_COLOR = MENU_DROPDOWN_ACCENT;
const PLAY_MENU_SOUND_OFF_ALPHA = 0.5;

/** Baked tinted copy of the atlas "info" glyph (BootScene only bakes profile, leaderboard and settings). */
export const PLAY_MENU_GUIDE_TEXTURE_KEY = 'mazerHudPlayMenuGuide';
const PLAY_MENU_ATLAS_TEXTURE_KEY = 'mazerHudIconAtlas';

export type MenuRowHudIcon = 'settings' | 'profile' | 'leaderboard';

export type MenuRowIconSource =
  | { readonly kind: 'hud'; readonly hudIcon: MenuRowHudIcon }
  | { readonly kind: 'texture'; readonly textureKey: string; readonly atlasGlyph: HudIconName }
  | { readonly kind: 'vector' };

export const MENU_ROW_ICON_SOURCES: Readonly<Record<LegacyMenuRowId, MenuRowIconSource>> = Object.freeze({
  guide: { atlasGlyph: 'info', kind: 'texture', textureKey: PLAY_MENU_GUIDE_TEXTURE_KEY },
  leaderboard: { hudIcon: 'leaderboard', kind: 'hud' },
  'main-menu': { kind: 'vector' },
  profile: { hudIcon: 'profile', kind: 'hud' },
  'reset-level': { kind: 'vector' },
  settings: { hudIcon: 'settings', kind: 'hud' },
  sound: { kind: 'vector' }
});

/**
 * Bakes the tinted Guide glyph once per game (textures are global). Same 'source-in' recolour as
 * BootScene.deriveHudIconTextures; a missing atlas leaves it absent and the row draws Phaser's placeholder, never fatal.
 */
export const ensureMenuRowIconTextures = (scene: Phaser.Scene): void => {
  for (const source of Object.values(MENU_ROW_ICON_SOURCES)) {
    if (source.kind !== 'texture' || scene.textures.exists(source.textureKey)) {
      continue;
    }
    if (!scene.textures.exists(PLAY_MENU_ATLAS_TEXTURE_KEY)) {
      return;
    }
    const atlasSource = scene.textures.get(PLAY_MENU_ATLAS_TEXTURE_KEY).getSourceImage() as CanvasImageSource;
    const cell = resolveHudIconCell(source.atlasGlyph);
    const canvasTexture = scene.textures.createCanvas(source.textureKey, HUD_ICON_CELL_PX, HUD_ICON_CELL_PX);
    const context = canvasTexture?.getContext();
    if (!canvasTexture || !context) {
      continue;
    }
    context.drawImage(atlasSource, cell.x, cell.y, cell.width, cell.height, 0, 0, HUD_ICON_CELL_PX, HUD_ICON_CELL_PX);
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = PLAY_MENU_ICON_TINT;
    context.fillRect(0, 0, HUD_ICON_CELL_PX, HUD_ICON_CELL_PX);
    context.globalCompositeOperation = 'source-over';
    canvasTexture.refresh();
  }
};

export interface MenuRowIconState {
  readonly soundEnabled: boolean;
}

/** Paints a vector row icon centred on (centerX, centerY) into its own graphics (the caller clears it). */
export const drawMenuRowVectorIcon = (
  graphics: Phaser.GameObjects.Graphics,
  id: LegacyMenuRowId,
  centerX: number,
  centerY: number,
  size: number,
  alpha: number,
  state: MenuRowIconState
): void => {
  if (MENU_ROW_ICON_SOURCES[id].kind !== 'vector' || alpha <= 0) {
    graphics.setVisible(false);
    return;
  }
  graphics.setVisible(true).setAlpha(alpha);
  if (id === 'sound') {
    const radius = size / 2;
    if (!state.soundEnabled) {
      graphics.setAlpha(alpha * PLAY_MENU_SOUND_OFF_ALPHA);
    }
    drawGuideSoundGlyph(graphics, centerX + (radius * 0.05), centerY, radius, PLAY_MENU_VECTOR_COLOR);
    if (!state.soundEnabled) {
      graphics.lineStyle(Math.max(1.5, size * 0.09), PLAY_MENU_VECTOR_COLOR, 1);
      graphics.lineBetween(centerX - (radius * 0.85), centerY + (radius * 0.85), centerX + (radius * 0.85), centerY - (radius * 0.85));
    }
    return;
  }
  if (id === 'reset-level') {
    const outer = size * 0.42;
    graphics.lineStyle(Math.max(1.5, size * 0.1), PLAY_MENU_VECTOR_COLOR, 1);
    for (let arm = 0; arm < START_SPIRAL.arms; arm += 1) {
      const flat = resolveStartSpiralArm({ cx: centerX, cy: centerY, inner: outer * START_SPIRAL.innerShare, outer }, arm, 0);
      const points: Array<{ x: number; y: number }> = [];
      for (let index = 0; index + 1 < flat.length; index += 2) {
        points.push({ x: flat[index]!, y: flat[index + 1]! });
      }
      graphics.strokePoints(points, false, false);
    }
    return;
  }
  // main-menu: the closed three-line glyph, sized from the row icon box (it is drawn for a 32-40 px toggle frame).
  drawMenuBurgerGlyph(graphics, centerX, centerY, size * 1.6, 0, PLAY_MENU_VECTOR_COLOR);
};
