/**
 * Mazer UI rework -- Wave 1B semantic design tokens (Fawxzzy Precision Arcade).
 *
 * Renderer-independent token map: both the future DOM shell (via `cssCustomProperties` /
 * src/theme/tokens.css) and Phaser (via `phaserMaterialAliases`) consume the same values from the
 * same source of truth, `docs/contracts/mazer-ui-rework-design-tokens.v1.json`, per decision
 * `renderer-ownership-split` (tokens are a shared contract owned by neither renderer alone).
 *
 * This module is not imported by src/scenes/MenuScene.ts, src/boot/*, or any other live-render
 * path yet -- see docs/architecture/MAZER-UI-REWORK-DESIGN-TOKENS.md for what this wave does and
 * does not do.
 */
import tokenRegistry from '../../docs/contracts/mazer-ui-rework-design-tokens.v1.json';

export interface DesignTokenColorMap {
  'bg.canvas': string;
  'bg.shell': string;
  'bg.panel': string;
  'bg.elevated': string;
  'line.subtle': string;
  'line.normal': string;
  'line.active': string;
  'brand.mint': string;
  'world.pathCore': string;
  'semantic.energy': string;
  'semantic.info': string;
  'semantic.reward': string;
  'semantic.danger': string;
  'semantic.anomaly': string;
  'text.primary': string;
  'text.muted': string;
  'text.disabled': string;
}

export interface DesignTokens {
  color: DesignTokenColorMap;
  spacingPx: number[];
  radiusPx: { control: number; panel: number; sheet: number; round: number };
  strokePx: { hairline: number; normal: number; focus: number };
  motionMs: { instant: number; press: number; panel: number; emphasis: number };
  touchTargetMinPx: number;
  preferredTouchTargetPx: number;
  fonts: { ui: string; metrics: string; title: string };
}

export const CANONICAL_THEME_ID = tokenRegistry.canonicalThemeId;

export const designTokens = tokenRegistry.tokens as DesignTokens;

/** Legacy theme names (archived, non-public) mapped to the one canonical theme id. */
export const archivedThemeAliasMap: Readonly<Record<string, string>> = Object.freeze({
  ...tokenRegistry.archivedThemeAliasMap
});

export const legacyThemeAliases: readonly string[] = Object.freeze([...tokenRegistry.legacyThemeAliases]);

/** Resolves any legacy/archived theme name (or the canonical id itself) to the canonical theme id. */
export const resolveCanonicalThemeId = (themeName: string): string => (
  themeName === CANONICAL_THEME_ID ? CANONICAL_THEME_ID : (archivedThemeAliasMap[themeName] ?? CANONICAL_THEME_ID)
);

const hexToPhaserNumber = (hex: string): number => parseInt(hex.replace(/^#/, ''), 16);

/**
 * Same color tokens as `designTokens.color`, expressed as Phaser-friendly numeric hex (`0xRRGGBB`)
 * instead of CSS hex strings, for material/tint/fill consumption from Phaser scenes/renderers.
 */
export const phaserMaterialAliases: Readonly<Record<keyof DesignTokenColorMap, number>> = Object.freeze(
  Object.fromEntries(
    Object.entries(designTokens.color).map(([key, hex]) => [key, hexToPhaserNumber(hex)])
  ) as Record<keyof DesignTokenColorMap, number>
);

/** The CSS custom property name a given token path is bound to in src/theme/tokens.css. */
export const cssVariablePrefix = tokenRegistry.cssVariablePrefix;

export const cssVariableForColor = (key: keyof DesignTokenColorMap): string => (
  `${cssVariablePrefix}color-${key.replace(/\./g, '-')}`
);

export const cssVariableForSpacing = (px: number): string => `${cssVariablePrefix}spacing-${px}`;

export const cssVariableForRadius = (key: keyof DesignTokens['radiusPx']): string => (
  `${cssVariablePrefix}radius-${key}`
);

export const cssVariableForStroke = (key: keyof DesignTokens['strokePx']): string => (
  `${cssVariablePrefix}stroke-${key}`
);

export const cssVariableForMotion = (key: keyof DesignTokens['motionMs']): string => (
  `${cssVariablePrefix}motion-${key}`
);
