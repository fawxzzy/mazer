import { LEGACY_MIN_HIT_TARGET_PX } from './legacyHitTarget';

/**
 * MAZER-UI-015: the shared button vocabulary. Every button maps to exactly one
 * variant; a surface picks a variant, never a new look. Chrome drawing for each
 * variant stays with the existing renderers for now and migrates onto this table
 * one surface per PR; `chromeViaKit` records which buttons already draw from it
 * (none yet), and the test pins that count so migrations must flip entries.
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
  primary: { variant: 'primary', minWidthPx: LEGACY_MIN_HIT_TARGET_PX, minHeightPx: LEGACY_MIN_HIT_TARGET_PX, filled: true, bordered: false, use: 'The one main action on a surface (Start, Login, Sign in)' },
  secondary: { variant: 'secondary', minWidthPx: LEGACY_MIN_HIT_TARGET_PX, minHeightPx: LEGACY_MIN_HIT_TARGET_PX, filled: false, bordered: true, use: 'Other actions (Guide, Install, Back, Close)' },
  ghost: { variant: 'ghost', minWidthPx: LEGACY_MIN_HIT_TARGET_PX, minHeightPx: LEGACY_MIN_HIT_TARGET_PX, filled: false, bordered: false, use: 'Quiet text actions (Skip, Not now)' },
  danger: { variant: 'danger', minWidthPx: LEGACY_MIN_HIT_TARGET_PX, minHeightPx: LEGACY_MIN_HIT_TARGET_PX, filled: false, bordered: true, use: 'Destructive actions (Sign out, Reset progress)' },
  icon: { variant: 'icon', minWidthPx: LEGACY_MIN_HIT_TARGET_PX, minHeightPx: LEGACY_MIN_HIT_TARGET_PX, filled: false, bordered: false, use: 'Icon-only controls (Settings cog, close x)' }
});

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
  readonly surface: 'front-door' | 'menu' | 'auth' | 'install' | 'settings' | 'guide';
  readonly variant: LegacyButtonVariant;
  readonly chromeViaKit: boolean;
}

export const LEGACY_BUTTON_MAP: readonly LegacyButtonMapping[] = Object.freeze([
  { id: 'start', surface: 'front-door', variant: 'primary', chromeViaKit: false },
  { id: 'login', surface: 'front-door', variant: 'primary', chromeViaKit: false },
  { id: 'settings-cog', surface: 'front-door', variant: 'icon', chromeViaKit: false },
  { id: 'guide', surface: 'settings', variant: 'secondary', chromeViaKit: false },
  { id: 'sign-out', surface: 'settings', variant: 'danger', chromeViaKit: false },
  { id: 'reset-progress', surface: 'settings', variant: 'danger', chromeViaKit: false },
  { id: 'auth-submit', surface: 'auth', variant: 'primary', chromeViaKit: false },
  { id: 'auth-secondary', surface: 'auth', variant: 'secondary', chromeViaKit: false },
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
