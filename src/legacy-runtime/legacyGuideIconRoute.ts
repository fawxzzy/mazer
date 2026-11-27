/**
 * Guide icon route: the Guide sheet's icons for every board thing come from the ONE mechanic icon registry
 * (src/render/mechanicIcons.ts), the same images the in-flow notice and the coach mark show, drawn by the board's own
 * painters. Glyphs with no board thing (Move, Levels, Online, Menu, In a maze, Sound, Sentry, Hunter) keep the scene's
 * own guide draw (MenuScene.drawLegacyGuideIcon).
 *
 * For goal, start, player, trail, wrap and switch the registry reproduces MenuScene's guide draw call for call
 * (tests/render/mechanic-icons.test.ts runs both), so routing those rows here changes no pixel. Pulse Gate and Shard
 * move from guide-local placeholders to the board art.
 */
import type { LegacyGuideGlyph, LegacyGuideIconSpec } from './legacyGuideContent';
import { LEGACY_GUIDE_SHEET_SIZES } from './legacyGuideSheetPlan';
import type { IconGraphics } from '../render/iconGraphics';
import { DEFAULT_BOARD_TILE_STYLE, type BoardTileStyleId } from '../render/boardTileStyle';
import { drawMechanicIcon, type MechanicIconId } from '../render/mechanicIcons';

export const LEGACY_GUIDE_GLYPH_MECHANIC_ICON: Readonly<Partial<Record<LegacyGuideGlyph, MechanicIconId>>> = Object.freeze({
  'goal-star': 'goal',
  'start-marker': 'start',
  'player-block': 'player',
  'trail-swatch': 'trail',
  'edge-marker': 'wrap',
  'bleed-gate': 'switch',
  'hazard-gate': 'pulse-gate',
  'hazard-shard': 'shard'
});

export const resolveLegacyGuideMechanicIcon = (glyph: LegacyGuideGlyph): MechanicIconId | null => (
  LEGACY_GUIDE_GLYPH_MECHANIC_ICON[glyph] ?? null
);

/** The scene surface the route reads (MenuScene; tests pass a stub). */
export interface LegacyGuideIconHost {
  boardTileStyle?: BoardTileStyleId;
  resolveBoardTileBackingScale?: () => number;
  drawLegacyGuideIcon: (icon: LegacyGuideIconSpec, centerX: number, centerY: number, accent: number, graphics: unknown) => void;
}

/** Draws one Guide icon: registry art for board things, the scene's guide draw for the rest. */
export const drawLegacyGuideRowIcon = (
  host: LegacyGuideIconHost,
  icon: LegacyGuideIconSpec,
  centerX: number,
  centerY: number,
  accent: number,
  graphics: IconGraphics
): void => {
  const id = resolveLegacyGuideMechanicIcon(icon.glyph);
  if (id === null) {
    host.drawLegacyGuideIcon(icon, centerX, centerY, accent, graphics);
    return;
  }
  drawMechanicIcon(graphics, id, centerX, centerY, LEGACY_GUIDE_SHEET_SIZES.badgeSize / 2, {
    accent,
    badge: icon.badge,
    env: {
      boardTileStyle: host.boardTileStyle ?? DEFAULT_BOARD_TILE_STYLE,
      devicePixelRatio: typeof host.resolveBoardTileBackingScale === 'function' ? host.resolveBoardTileBackingScale() : 1
    }
  });
};
