import { cyberArcadeMaterial } from '../render/cyberArcadeMaterial';

export const LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR = cyberArcadeMaterial.path.core;
/**
 * The active rail is intentionally quieter than the energy/player signal, but
 * still must remain distinct from the pale path core. This bound is calibrated
 * to the canonical Precision Arcade active token rather than the retired neon
 * palette.
 */
export const LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE = 72;
export const LEGACY_IRIDESCENT_GREEN_ANCHOR = cyberArcadeMaterial.signal.player;
export const LEGACY_TRAIL_SHINE_COLOR = cyberArcadeMaterial.shine.core;
export const LEGACY_TRAIL_SHINE_EDGE_COLOR = cyberArcadeMaterial.shine.edge;

// Deep, saturated jewel tones -- violet through indigo, blue, teal, emerald,
// and orchid -- instead of the bright primary-color rainbow. Modeled on
// Terraria's Midnight Rainbow dye: the same continuous hue cycle as a
// regular rainbow shift, just moodier/richer instead of neon-bright.
export const LEGACY_IRIDESCENT_MIDNIGHT_STOPS = [
  0x6a2c8c,
  0x3b2c8c,
  0x2c5c8c,
  0x2c8c7a,
  0x2c8c4e,
  0x8c2c6a
] as const;

export const LEGACY_IRIDESCENT_PLAYER_SHIFT_PERIOD_MS = 6400;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const normalizeUnit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value - Math.floor(value);
};

const mixChannel = (from: number, to: number, amount: number): number => (
  Math.round(from + ((to - from) * clamp01(amount)))
);

export const mixLegacyIridescentColor = (from: number, to: number, amount: number): number => {
  const fromR = (from >> 16) & 0xff;
  const fromG = (from >> 8) & 0xff;
  const fromB = from & 0xff;
  const toR = (to >> 16) & 0xff;
  const toG = (to >> 8) & 0xff;
  const toB = to & 0xff;
  return (
    (mixChannel(fromR, toR, amount) << 16)
    | (mixChannel(fromG, toG, amount) << 8)
    | mixChannel(fromB, toB, amount)
  );
};

export const measureLegacyIridescentColorDistance = (left: number, right: number): number => {
  const leftR = (left >> 16) & 0xff;
  const leftG = (left >> 8) & 0xff;
  const leftB = left & 0xff;
  const rightR = (right >> 16) & 0xff;
  const rightG = (right >> 8) & 0xff;
  const rightB = right & 0xff;
  return Math.sqrt(
    ((leftR - rightR) ** 2)
    + ((leftG - rightG) ** 2)
    + ((leftB - rightB) ** 2)
  );
};

export const resolveLegacyPathSafeIridescentColor = (
  color: number,
  fallback: number = LEGACY_IRIDESCENT_GREEN_ANCHOR
): number => {
  if (
    measureLegacyIridescentColorDistance(color, LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR)
    >= LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE
  ) {
    return color;
  }

  if (
    measureLegacyIridescentColorDistance(fallback, LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR)
    >= LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE
  ) {
    return fallback;
  }

  return 0xff61c7;
};

export const resolveLegacyIridescentMidnightColor = (
  position: number,
  stops: readonly number[] = LEGACY_IRIDESCENT_MIDNIGHT_STOPS
): number => {
  if (stops.length === 0) {
    return LEGACY_IRIDESCENT_GREEN_ANCHOR;
  }
  if (stops.length === 1) {
    return stops[0] ?? LEGACY_IRIDESCENT_GREEN_ANCHOR;
  }

  const wrapped = normalizeUnit(position) * stops.length;
  const startIndex = Math.floor(wrapped) % stops.length;
  const endIndex = (startIndex + 1) % stops.length;
  return mixLegacyIridescentColor(
    stops[startIndex] ?? LEGACY_IRIDESCENT_GREEN_ANCHOR,
    stops[endIndex] ?? LEGACY_IRIDESCENT_GREEN_ANCHOR,
    wrapped - Math.floor(wrapped)
  );
};

export const resolveLegacyIridescentTrailColor = (
  _index: number,
  _total: number,
  _timeMs: number,
  _anchorColor: number = LEGACY_IRIDESCENT_GREEN_ANCHOR
): number => LEGACY_IRIDESCENT_GREEN_ANCHOR;

export const resolveLegacyIridescentPulseColor = (
  _index: number,
  _total: number,
  _timeMs: number,
  anchorColor: number = LEGACY_TRAIL_SHINE_COLOR
): number => anchorColor;

export const resolveLegacyIridescentPlayerHaloColor = (
  _timeMs: number,
  _anchorColor: number = cyberArcadeMaterial.signal.playerHalo
): number => cyberArcadeMaterial.signal.playerHalo;

// Cycles the player's own diamond core through the midnight-rainbow stops
// continuously over time -- a "Terraria Midnight Rainbow dye" effect for the
// player marker instead of a fixed color.
export const resolveLegacyIridescentPlayerCoreColor = (
  timeMs = 0
): number => resolveLegacyIridescentMidnightColor(timeMs / LEGACY_IRIDESCENT_PLAYER_SHIFT_PERIOD_MS);

// The core's outline/accent rides the same cycle a quarter-phase ahead, so
// the two rims of the diamond are always two adjacent hues rather than a
// single flat color -- a subtle shimmer instead of a plain solid shift.
export const resolveLegacyIridescentPlayerAccentColor = (
  timeMs: number,
  _anchorColor: number = LEGACY_IRIDESCENT_GREEN_ANCHOR
): number => resolveLegacyIridescentMidnightColor((timeMs / LEGACY_IRIDESCENT_PLAYER_SHIFT_PERIOD_MS) + 0.25);
