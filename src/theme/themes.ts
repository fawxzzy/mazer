/**
 * MAZER-UI-102: the dark theme's token set (owner-approved look, 2026-11-19 demo).
 *
 * ONE token shape. The default look is the identity theme: nothing is remapped and the app is the shipping app. The dark
 * look is near-black board, dim blue-grey corridors and every UI accent in one neon magenta-purple. Cosmetics (player,
 * trail, start/end marks, edge stars and beams) keep their own colours: see cosmeticScope.ts.
 *
 * `sourceRoles` is the migration map: today's registry value -> the role it plays. Anything not listed is mapped by
 * rule (neutral -> dark tone ramp, chromatic -> accent ramp) in darkThemeCanvasBridge.ts.
 */

export type MazerThemeId = 'default' | 'dark';

export interface MazerThemeTokens {
  /** Board void / page background (behind the maze). */
  void: string;
  /** Shell background one step up (HUD strips, scrims). */
  shell: string;
  /** Sheets, panels, menus. */
  panel: string;
  /** Raised controls on a panel. */
  elevated: string;
  /** Maze corridor (chip) fill. */
  corridor: string;
  /** Maze corridor lit rim. */
  corridorEdge: string;
  /** Wall-socket dots, dead-end rings. */
  socket: string;
  /** Hairlines / dividers on panels. */
  line: string;
  /** Bleed-gate tile floor (darker than a corridor). */
  gateFloor: string;
  /** Body text. */
  text: string;
  /** Secondary text. */
  textMuted: string;
  /** Disabled text. */
  textDisabled: string;
  /** THE accent: buttons, icons, text accents, HUD accents, gate ring. */
  accent: string;
  /** Accent for small text / thin strokes on panels (higher contrast). */
  accentBright: string;
  /** Accent for glows and large tinted fills. */
  accentDeep: string;
  /** Accent-tinted dark fill (toggle on, pressed). */
  accentDim: string;
}

export const DARK_THEME_TOKENS: MazerThemeTokens = Object.freeze({
  void: '#000103',
  shell: '#04060a',
  panel: '#0b0d12',
  elevated: '#151620',
  corridor: '#0f1a19',
  corridorEdge: '#293936',
  socket: '#1c2a28',
  line: '#2b2638',
  gateFloor: '#06080b',
  text: '#f6eeff',
  textMuted: '#bba9d0',
  // Raised from #6c6080 / #8d80a3 after the pixel contrast pass (help text 3.08:1, section header 4.19:1).
  textDisabled: '#9d90b3',
  accent: '#ff29ff',
  accentBright: '#ff8cff',
  accentDeep: '#c04ee0',
  accentDim: '#3a0e46'
});

export const mazerThemes: Readonly<Record<Exclude<MazerThemeId, 'default'>, MazerThemeTokens>> = Object.freeze({
  dark: DARK_THEME_TOKENS
});

/**
 * Exact source-value roles: the registry/derived colours that ship today, keyed by rgb hex, with the role they play.
 * Source: src/theme/tokens.css, src/render/boardTileStyle.ts (chip/rim), src/render/palette.ts (bleed gate tile).
 */
export const sourceRoles: Readonly<Record<string, keyof MazerThemeTokens>> = Object.freeze({
  '#03070b': 'void', // bg.canvas
  '#02080f': 'void', // legacy bg.page (also index.html / theme-color)
  '#02040a': 'void', // overlay.scrim
  '#000000': 'void',
  '#07131a': 'shell', // bg.shell
  '#071a22': 'shell',
  '#0b1a22': 'panel', // bg.panel
  '#07131d': 'panel', // legacy bg.control
  '#10242b': 'elevated', // bg.elevated
  '#031f20': 'panel', // legacy bg.gate (install gate)
  '#0f2c22': 'accentDim', // legacy bg.toggleOn
  '#3e6a67': 'corridor', // board chip = mix(line.normal, bg.canvas, .35)
  '#3e6a66': 'corridor',
  '#a7e7d9': 'accentBright', // line.active: icon ink and active strokes (the shipping starlit board rim is #cdf5ec below)
  '#5d9f98': 'socket', // line.normal
  '#23434a': 'line', // line.subtle
  '#1f3a38': 'gateFloor', // BLEED_GATE_TILE_FLOOR
  // The shipping tile set (H Starlit Bevel, palette.ts STARLIT_BEVEL_TILE): keeps its rim > highlight > floor > shade order.
  '#4c7a74': 'corridor', // starlit floor
  '#cdf5ec': 'corridorEdge', // starlit rim and wall specks
  '#9eddd0': 'socket', // starlit bevel highlight
  '#17312e': 'shell', // starlit bevel shade / gate sunken ring
  '#1b3532': 'gateFloor', // starlit gate face
  '#f2fbfa': 'accent', // BLEED_GATE_TILE_BRACKET (idle gate ring)
  '#f1faf6': 'text', // text.primary
  '#ecfff5': 'text', // legacy text.bright
  '#d7f7ee': 'text', // legacy text.soft
  '#94aaa8': 'textMuted', // text.muted
  '#a4beb8': 'textMuted', // legacy text.gate
  '#7894a0': 'textMuted', // legacy text.hint
  '#5d7478': 'textDisabled' // text.disabled
});

let activeMazerThemeId: MazerThemeId = 'default';
export const setActiveMazerThemeId = (id: MazerThemeId): void => { activeMazerThemeId = id; };
export const getActiveMazerThemeId = (): MazerThemeId => activeMazerThemeId;

/**
 * Theme hook for icon glyphs that share text.primary with body text (the menu burger): body text stays pale, icons take
 * the accent. The default theme returns the input unchanged, so the default render path is untouched.
 */
export const themeIconColor = (color: number): number => (
  activeMazerThemeId === 'default' ? color : parseInt(mazerThemes[activeMazerThemeId].accent.slice(1), 16)
);
