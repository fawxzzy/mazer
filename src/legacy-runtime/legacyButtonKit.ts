import { cyberArcadeMaterial } from '../render/cyberArcadeMaterial';
import { LEGACY_MIN_HIT_TARGET_PX } from './legacyHitTarget';

/**
 * MAZER-UI-015: the shared button vocabulary. Every button maps to exactly one
 * variant; a surface picks a variant, never a new look. Chrome drawing for each
 * variant stays with the existing renderers for now and migrates onto this table
 * one surface per PR; `chromeViaKit` records which buttons already draw from it
 * (the MenuScene action-button factory resolves fill/stroke/text from LEGACY_BUTTON_CHROME below),
 * and the test pins that set so migrations must flip entries.
 */
export type LegacyButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';

export const LEGACY_BUTTON_VARIANTS: readonly LegacyButtonVariant[] = Object.freeze(['primary', 'secondary', 'ghost', 'danger', 'icon']);

export interface LegacyButtonVariantSpec {
  readonly variant: LegacyButtonVariant;
  readonly minWidthPx: number;
  readonly minHeightPx: number;
  readonly filled: boolean;
  readonly bordered: boolean;
  readonly use: string;
}

export const LEGACY_BUTTON_KIT: Readonly<Record<LegacyButtonVariant, LegacyButtonVariantSpec>> = Object.freeze({
  primary: { variant: 'primary', minWidthPx: LEGACY_MIN_HIT_TARGET_PX, minHeightPx: LEGACY_MIN_HIT_TARGET_PX, filled: true, bordered: false, use: 'The one main action on a surface, solid mint (Back to Menu, Got it, Retry, Sign in)' },
  secondary: { variant: 'secondary', minWidthPx: LEGACY_MIN_HIT_TARGET_PX, minHeightPx: LEGACY_MIN_HIT_TARGET_PX, filled: false, bordered: true, use: 'Other actions, dark with an outline (Next level, Back to Menu beside a Retry)' },
  ghost: { variant: 'ghost', minWidthPx: LEGACY_MIN_HIT_TARGET_PX, minHeightPx: LEGACY_MIN_HIT_TARGET_PX, filled: false, bordered: false, use: 'Quiet text actions, no box (Jump to level rows, Skip, Not now)' },
  danger: { variant: 'danger', minWidthPx: LEGACY_MIN_HIT_TARGET_PX, minHeightPx: LEGACY_MIN_HIT_TARGET_PX, filled: false, bordered: true, use: 'Destructive actions (Sign out, Reset progress)' },
  icon: { variant: 'icon', minWidthPx: LEGACY_MIN_HIT_TARGET_PX, minHeightPx: LEGACY_MIN_HIT_TARGET_PX, filled: false, bordered: false, use: 'Icon-only controls (Settings cog, close x)' }
});

/**
 * Chrome (fill / stroke / label colour) for the Phaser action-button factory, per variant.
 * Values are the ones the factory hard-coded before MAZER-UI-015, so migrating onto the table
 * is look-neutral. `danger` has a filled (Sign out) and an outline (Reset progress) emphasis.
 */
export type LegacyButtonEmphasis = 'filled' | 'outline';
export type LegacyButtonTextKey = 'bright' | 'soft' | 'signOut' | 'ink' | 'link';
export type LegacyButtonFillKey = 'primary' | 'control' | 'dangerFilled' | 'none';
export interface LegacyButtonChromeSpec {
  /** Which scene-owned fill the button uses (MenuScene holds the values so the design-token evidence keeps citing it). */
  readonly fillKey: LegacyButtonFillKey;
  readonly stroke: number;
  /** Which scene-owned label colour (same note as fillKey). */
  readonly textKey: LegacyButtonTextKey;
  /** Drawn in the lit state even when idle (the one main action on a surface). */
  readonly litWhenIdle: boolean;
}

export const LEGACY_BUTTON_CHROME: Readonly<Record<'primary' | 'secondary' | 'ghost' | 'dangerFilled' | 'dangerOutline', LegacyButtonChromeSpec>> = Object.freeze({
  // MAZER-UI-099 (owner pick): the primary button is a solid mint fill with dark ink, so it is never mistaken for the
  // outlined secondary or the box-less ghost.
  primary: Object.freeze({ fillKey: 'primary', stroke: cyberArcadeMaterial.rail.mint, textKey: 'ink', litWhenIdle: false }),
  ghost: Object.freeze({ fillKey: 'none', stroke: cyberArcadeMaterial.rail.mint, textKey: 'link', litWhenIdle: false }),
  secondary: Object.freeze({ fillKey: 'control', stroke: cyberArcadeMaterial.rail.cyan, textKey: 'soft', litWhenIdle: false }),
  dangerFilled: Object.freeze({ fillKey: 'dangerFilled', stroke: cyberArcadeMaterial.signal.goal, textKey: 'signOut', litWhenIdle: false }),
  dangerOutline: Object.freeze({ fillKey: 'control', stroke: cyberArcadeMaterial.signal.goal, textKey: 'signOut', litWhenIdle: false })
});

export type LegacyActionTone = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';

/** The factory's tone names are the kit variants plus the danger emphasis. */
export const resolveLegacyActionTone = (tone: LegacyActionTone): { variant: LegacyButtonVariant; chrome: LegacyButtonChromeSpec } => {
  switch (tone) {
    case 'primary': return { variant: 'primary', chrome: LEGACY_BUTTON_CHROME.primary };
    case 'ghost': return { variant: 'ghost', chrome: LEGACY_BUTTON_CHROME.ghost };
    case 'danger': return { variant: 'danger', chrome: LEGACY_BUTTON_CHROME.dangerFilled };
    case 'danger-outline': return { variant: 'danger', chrome: LEGACY_BUTTON_CHROME.dangerOutline };
    default: return { variant: 'secondary', chrome: LEGACY_BUTTON_CHROME.secondary };
  }
};

/** Toggle row: label and On/Off state are always two separate elements (MAZER-UI-010). */
export interface LegacyToggleRowSpec {
  readonly minHeightPx: number;
  readonly labelElement: 'label';
  readonly stateElement: 'state';
}
export const LEGACY_TOGGLE_ROW: LegacyToggleRowSpec = Object.freeze({
  minHeightPx: LEGACY_MIN_HIT_TARGET_PX,
  labelElement: 'label',
  stateElement: 'state'
});

/**
 * Existing buttons by surface and the variant each one maps to.
 * `chromeViaKit`: the renderer already draws through the kit table; false entries are the
 * migration queue, one surface per PR.
 */
export interface LegacyButtonMapping {
  readonly id: string;
  readonly surface: 'front-door' | 'menu' | 'auth' | 'install' | 'settings' | 'guide' | 'leaderboard';
  readonly variant: LegacyButtonVariant;
  readonly chromeViaKit: boolean;
}

export const LEGACY_BUTTON_MAP: readonly LegacyButtonMapping[] = Object.freeze([
  { id: 'start', surface: 'front-door', variant: 'primary', chromeViaKit: false },
  { id: 'login', surface: 'front-door', variant: 'primary', chromeViaKit: false },
  { id: 'settings-cog', surface: 'front-door', variant: 'icon', chromeViaKit: false },
  { id: 'guide', surface: 'settings', variant: 'secondary', chromeViaKit: true },
  { id: 'sign-out', surface: 'settings', variant: 'danger', chromeViaKit: true },
  { id: 'reset-progress', surface: 'settings', variant: 'danger', chromeViaKit: true },
  { id: 'auth-submit', surface: 'auth', variant: 'primary', chromeViaKit: true },
  { id: 'sheet-exit', surface: 'settings', variant: 'primary', chromeViaKit: true },
  { id: 'guide-got-it', surface: 'guide', variant: 'primary', chromeViaKit: true },
  { id: 'leaderboard-retry', surface: 'leaderboard', variant: 'primary', chromeViaKit: true },
  { id: 'leaderboard-back', surface: 'leaderboard', variant: 'secondary', chromeViaKit: true },
  { id: 'preview-jump-row', surface: 'settings', variant: 'ghost', chromeViaKit: true },
  { id: 'auth-secondary', surface: 'auth', variant: 'secondary', chromeViaKit: true },
  { id: 'install', surface: 'install', variant: 'secondary', chromeViaKit: false },
  { id: 'overlay-close', surface: 'menu', variant: 'icon', chromeViaKit: false }
].map((entry) => Object.freeze(entry) as LegacyButtonMapping));

export const resolveLegacyButtonVariant = (id: string): LegacyButtonVariant | null => (
  LEGACY_BUTTON_MAP.find((entry) => entry.id === id)?.variant ?? null
);

/** Grows a requested button size to the variant's minimum; never shrinks it. */
export const resolveLegacyButtonSize = (
  variant: LegacyButtonVariant,
  size: { width: number; height: number }
): { width: number; height: number } => ({
  width: Math.max(size.width, LEGACY_BUTTON_KIT[variant].minWidthPx),
  height: Math.max(size.height, LEGACY_BUTTON_KIT[variant].minHeightPx)
});
