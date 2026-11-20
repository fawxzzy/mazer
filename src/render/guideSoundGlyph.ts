import { BUTTON_ICON_PALETTE, cssHexToNumber, drawButtonIconGraphics, type ButtonIconGraphics } from './buttonIcons';

/**
 * Guide icon for the Sound row (MAZER-AUDIO-003). Guide-local (the board has no speaker); the colour is the Guide
 * accent passed in by the scene. MAZER-UI-097: the glyph is the button icon set's soundOn (C Star Dust,
 * src/render/buttonIcons.ts) so the Guide shows the same speaker the buttons use; its dust spark stays C's cyan.
 */
export type GuideSoundGlyphGraphics = ButtonIconGraphics;

const GUIDE_SOUND_SPARK = cssHexToNumber(BUTTON_ICON_PALETTE.spark);

export const drawGuideSoundGlyph = (
  graphics: GuideSoundGlyphGraphics,
  centerX: number,
  centerY: number,
  radius: number,
  color: number
): void => {
  drawButtonIconGraphics(graphics, 'soundOn', centerX, centerY, radius * 2, { ink: color, spark: GUIDE_SOUND_SPARK }, 0.95);
};
