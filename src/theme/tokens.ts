/**
 * Mazer UI rework -- Wave 1B semantic design tokens (Fawxzzy Precision Arcade).
 *
 * Renderer-independent token map: both the future DOM shell (via `cssCustomProperties` /
 * src/theme/tokens.css) and Phaser (via `phaserMaterialAliases`) consume the same values from the
 * same source of truth, `docs/contracts/mazer-ui-rework-design-tokens.v1.json`, per decision
 * `renderer-ownership-split` (tokens are a shared contract owned by neither renderer alone).
 *
 * The live Phaser material imports this module directly, while the boot presentation resolver uses
 * only its canonical-theme/archived-alias boundary. The DOM shell consumes the matching CSS export
 * through src/styles/base.css. See docs/architecture/MAZER-UI-REWORK-DESIGN-TOKENS.md.
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
  'tone.success': string;
  'tone.warning': string;
  'tone.error': string;
  'tone.info': string;
  'overlay.scrim': string;
  'text.primary': string;
  'text.muted': string;
  'text.disabled': string;
}

export type DesignEasingFunctionName = 'smoothstep' | 'smootherstep' | 'easeOutCubic' | 'sineInOut';

/**
 * Motion tokens. Every value equals a duration/period that already ships (see
 * docs/contracts/mazer-ui-rework-design-tokens-evidence.v1.json); no call site consumes them yet.
 */
export interface DesignMotionTokens {
  durationMs: { fast: number; base: number; slow: number; long: number; reveal: number };
  introBeatMs: number;
  staggerMs: { beamTotal: number };
  loopMs: { beat: number; blink: number; drift: number };
  reducedMotionMs: { introCrossfade: number; outroCrossfade: number; teleportCrossfade: number; teleportFadeEdge: number };
  easing: { css: { standard: string; inOut: string }; functions: DesignEasingFunctionName[] };
}

export interface DesignLegacyColorMap {
  'bg.page': string;
  'bg.gate': string;
  'bg.control': string;
  'bg.toggleOn': string;
  'brand.gate': string;
  'text.gate': string;
  'text.bright': string;
  'text.soft': string;
  'text.hint': string;
  'text.title': string;
  'text.danger': string;
  'text.signOut': string;
  'player.core': string;
  'player.halo': string;
  'player.markerAccent': string;
  'goal.magenta': string;
  'goal.violet': string;
}

/**
 * Named shipping values that are NOT canonical tokens: they give off-scale literals a registry name so
 * call sites can migrate per wave, and so each can later be collapsed into (or retuned to) a canonical
 * token deliberately. Values here must keep matching what ships until that happens.
 */
export interface DesignLegacyTokens {
  color: DesignLegacyColorMap;
  spacingPx: { rowGapCompact: number; rowGap: number; overlayHeaderReserve: number };
  radiusPx: { inset: number; card: number };
  hitTargetPx: { headerMin: number; header: number; headerMax: number };
  fontSizePx: { micro: number; caption: number; small: number; body: number; label: number; heading: number };
  fonts: { system: string };
}

export interface DesignTokens {
  color: DesignTokenColorMap;
  spacingPx: number[];
  radiusPx: { control: number; panel: number; sheet: number; round: number };
  strokePx: { hairline: number; normal: number; focus: number };
  motionMs: { instant: number; press: number; panel: number; emphasis: number };
  motion: DesignMotionTokens;
  legacy: DesignLegacyTokens;
  touchTargetMinPx: number;
  preferredTouchTargetPx: number;
  fonts: { ui: string; metrics: string; title: string };
}

export type CanonicalThemeId = 'precision-arcade';
export const CANONICAL_THEME_ID: CanonicalThemeId = tokenRegistry.canonicalThemeId as CanonicalThemeId;

export const designTokens = tokenRegistry.tokens as DesignTokens;

/** Legacy theme names (archived, non-public) mapped to the one canonical theme id. */
export const archivedThemeAliasMap: Readonly<Record<string, string>> = Object.freeze({
  ...tokenRegistry.archivedThemeAliasMap
});

export const legacyThemeAliases: readonly string[] = Object.freeze([...tokenRegistry.legacyThemeAliases]);

/** Resolves a registered legacy/archived alias (or the canonical id itself) to the canonical id. */
export const resolveCanonicalThemeId = (themeName: string): CanonicalThemeId | null => (
  themeName === CANONICAL_THEME_ID || archivedThemeAliasMap[themeName] === CANONICAL_THEME_ID
    ? CANONICAL_THEME_ID
    : null
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

/** Numeric (0xRRGGBB) aliases for `designTokens.legacy.color`, same derivation as `phaserMaterialAliases`. */
export const legacyPhaserAliases: Readonly<Record<keyof DesignLegacyColorMap, number>> = Object.freeze(
  Object.fromEntries(
    Object.entries(designTokens.legacy.color).map(([key, hex]) => [key, hexToPhaserNumber(hex)])
  ) as Record<keyof DesignLegacyColorMap, number>
);

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

/**
 * Pure easing functions for the names registered in `motion.easing.functions`. They are numerically identical
 * to the local copies in render/introTimeline.ts and to the Phaser `Sine.easeInOut` the auth caret uses today
 * (parity is asserted in tests/architecture/design-tokens-sync.test.ts). Nothing consumes them yet.
 */
export const motionEasing: Readonly<Record<DesignEasingFunctionName, (t: number) => number>> = Object.freeze({
  smoothstep: (t: number): number => {
    const x = clamp01(t);
    return x * x * (3 - (2 * x));
  },
  smootherstep: (t: number): number => {
    const x = clamp01(t);
    const s = x * x * (3 - (2 * x));
    return s * s * (3 - (2 * s));
  },
  easeOutCubic: (t: number): number => 1 - ((1 - clamp01(t)) ** 3),
  sineInOut: (t: number): number => 0.5 * (1 - Math.cos(Math.PI * clamp01(t)))
});

const kebab = (key: string): string => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const dotted = (key: string): string => key.replace(/\./g, '-');

export interface CssCustomProperty {
  name: string;
  value: string;
}

/**
 * Every CSS custom property src/theme/tokens.css must declare, derived from `designTokens` alone. This is the
 * TypeScript-side counterpart of deriveExpectedCssDeclarations() in scripts/check-design-tokens.mjs; the sync
 * test requires both derivations and the CSS file to agree exactly.
 *
 * Naming: color keys keep their registry spelling with dots turned into dashes (`color-world-pathCore`);
 * every other group converts camelCase keys to kebab-case (`motion-duration-fast`, `legacy-spacing-row-gap`).
 */
export const listCssCustomProperties = (tokens: DesignTokens = designTokens): CssCustomProperty[] => {
  const p = cssVariablePrefix;
  const out: CssCustomProperty[] = [];
  const add = (name: string, value: string | number, unit = ''): void => {
    out.push({ name: `${p}${name}`, value: `${value}${unit}` });
  };
  for (const [key, hex] of Object.entries(tokens.color)) add(`color-${dotted(key)}`, hex);
  for (const px of tokens.spacingPx) add(`spacing-${px}`, px, 'px');
  for (const [key, px] of Object.entries(tokens.radiusPx)) add(`radius-${key}`, px, 'px');
  for (const [key, px] of Object.entries(tokens.strokePx)) add(`stroke-${key}`, px, 'px');
  for (const [key, ms] of Object.entries(tokens.motionMs)) add(`motion-${key}`, ms, 'ms');
  const m = tokens.motion;
  for (const [key, ms] of Object.entries(m.durationMs)) add(`motion-duration-${kebab(key)}`, ms, 'ms');
  add('motion-intro-beat', m.introBeatMs, 'ms');
  for (const [key, ms] of Object.entries(m.staggerMs)) add(`motion-stagger-${kebab(key)}`, ms, 'ms');
  for (const [key, ms] of Object.entries(m.loopMs)) add(`motion-loop-${kebab(key)}`, ms, 'ms');
  for (const [key, ms] of Object.entries(m.reducedMotionMs)) add(`motion-reduced-${kebab(key)}`, ms, 'ms');
  for (const [key, value] of Object.entries(m.easing.css)) add(`motion-ease-${kebab(key)}`, value);
  add('touch-target-min', tokens.touchTargetMinPx, 'px');
  add('touch-target-preferred', tokens.preferredTouchTargetPx, 'px');
  add('font-ui', tokens.fonts.ui);
  add('font-metrics', tokens.fonts.metrics);
  const l = tokens.legacy;
  for (const [key, hex] of Object.entries(l.color)) add(`legacy-color-${dotted(key)}`, hex);
  for (const [key, px] of Object.entries(l.spacingPx)) add(`legacy-spacing-${kebab(key)}`, px, 'px');
  for (const [key, px] of Object.entries(l.radiusPx)) add(`legacy-radius-${kebab(key)}`, px, 'px');
  for (const [key, px] of Object.entries(l.hitTargetPx)) add(`legacy-hit-target-${kebab(key)}`, px, 'px');
  for (const [key, px] of Object.entries(l.fontSizePx)) add(`legacy-font-size-${kebab(key)}`, px, 'px');
  for (const [key, value] of Object.entries(l.fonts)) add(`legacy-font-${kebab(key)}`, value);
  return out;
};
