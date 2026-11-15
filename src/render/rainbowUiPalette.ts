/**
 * MAZER-VIS-035: the ONE rainbow material of the menu UI. The title / Login / level-number lettering colours each
 * chip from this HSV pair (MenuScene.drawLegacyGlyphWordTileBlock, hue = scene clock + column), and the rainbow
 * backdrop stars take their colour from the same pair (backdropStarHue.ts), so a star and a letter at the same hue
 * are the same colour. Pure: no Phaser, no DOM, no colour literals.
 */

/** HSV saturation of the rainbow UI material. */
export const RAINBOW_UI_SATURATION = 0.8;

/** HSV value of the rainbow UI material. */
export const RAINBOW_UI_VALUE = 1;

/** Packed 0xRRGGBB rainbow UI colour at a hue in [0, 1) (wraps). */
export const resolveRainbowUiColor = (hue: number): number => {
  const h = (hue - Math.floor(hue)) * 6;
  const sector = Math.floor(h);
  const f = h - sector;
  const value = RAINBOW_UI_VALUE;
  const p = value * (1 - RAINBOW_UI_SATURATION);
  const q = value * (1 - (RAINBOW_UI_SATURATION * f));
  const t = value * (1 - (RAINBOW_UI_SATURATION * (1 - f)));
  const [r, g, b] = [[value, t, p], [q, value, p], [p, value, t], [p, q, value], [t, p, value], [value, p, q]][Math.min(5, sector)];
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
};
