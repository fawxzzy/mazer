import { BUTTON_ICON_PALETTE, cssHexToNumber, drawButtonIconGraphics, type ButtonIconGraphics } from './buttonIcons';

/**
 * Guide icon for the "In a maze" row (UI consistency batch D, 2026-11-26). The Menu row already shows the header's
 * three-line burger, so this row must not repeat it: it draws the button icon set's existing `pause` icon (the run is
 * paused while the menu is open). Guide-local (the board has no pause mark); the ink is the Guide accent the scene
 * passes in. No new art: the glyph is src/render/buttonIcons.ts, the same way guideSoundGlyph.ts reuses soundOn.
 */
export type GuidePauseGlyphGraphics = ButtonIconGraphics;

const GUIDE_PAUSE_SPARK = cssHexToNumber(BUTTON_ICON_PALETTE.spark);

export const drawGuidePauseGlyph = (
  graphics: GuidePauseGlyphGraphics,
  centerX: number,
  centerY: number,
  radius: number,
  color: number
): void => {
  drawButtonIconGraphics(graphics, 'pause', centerX, centerY, radius * 2, { ink: color, spark: GUIDE_PAUSE_SPARK }, 0.95);
};
