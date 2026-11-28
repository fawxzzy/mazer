import { BUTTON_ICON_PALETTE, cssHexToNumber, drawButtonIconGraphics, type ButtonIconGraphics } from './buttonIcons';

/**
 * Guide icon for the "Help" row (Help screen, MAZER-ONB-001 family). It draws the same `lifebuoy` button icon the Help
 * row in the Menu shows (menuRowIcons.ts), so the Guide and the Menu cannot disagree. The ink is the Guide accent the
 * scene passes in, the same way guidePauseGlyph.ts reuses `pause`.
 */
export type GuideHelpGlyphGraphics = ButtonIconGraphics;

const GUIDE_HELP_SPARK = cssHexToNumber(BUTTON_ICON_PALETTE.spark);

export const drawGuideHelpGlyph = (
  graphics: GuideHelpGlyphGraphics,
  centerX: number,
  centerY: number,
  radius: number,
  color: number
): void => {
  drawButtonIconGraphics(graphics, 'lifebuoy', centerX, centerY, radius * 2, { ink: color, spark: GUIDE_HELP_SPARK }, 0.95);
};
