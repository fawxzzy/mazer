// MAZER-VIS-011: the HUD icon atlas. One outline icon family drawn from scripted vector geometry
// (scripts/assets/build-hud-icon-atlas.mjs) and baked into one small lossless WebP, replacing the
// three 1254 px bitmaps. The glyphs are white on transparent: BootScene tints a copy of the three the
// menu draws (profile, leaderboard, settings) to a design token, and registers every glyph as a named
// frame on the atlas texture for the surfaces that will use the rest (close, check, info, share, install).
// tests/architecture/hud-icon-atlas.test.ts pins this layout to the build script and the shipped file.

export const HUD_ICON_ATLAS_PUBLIC_URL = '/assets/hud/hud-icons.webp';
export const HUD_ICON_CELL_PX = 128;
export const HUD_ICON_ATLAS_COLUMNS = 4;
/** Every glyph is drawn inside this box of its cell (a 16 px margin keeps the round caps clear of the edge). */
export const HUD_ICON_GLYPH_BOX = Object.freeze({ x: 16, y: 16, width: 96, height: 96 });
/** Atlas order, left to right then top to bottom. */
export const HUD_ICON_NAMES = ['profile', 'leaderboard', 'settings', 'close', 'check', 'info', 'share', 'install'] as const;
export type HudIconName = (typeof HUD_ICON_NAMES)[number];

export interface HudIconCell {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const resolveHudIconCell = (name: HudIconName): HudIconCell => {
  const index = HUD_ICON_NAMES.indexOf(name);
  return {
    x: (index % HUD_ICON_ATLAS_COLUMNS) * HUD_ICON_CELL_PX,
    y: Math.floor(index / HUD_ICON_ATLAS_COLUMNS) * HUD_ICON_CELL_PX,
    width: HUD_ICON_CELL_PX,
    height: HUD_ICON_CELL_PX
  };
};
