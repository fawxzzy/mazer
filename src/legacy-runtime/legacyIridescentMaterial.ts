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

// Violet through indigo, blue, teal, emerald, and orchid -- the same
// Terraria Midnight Rainbow dye hue sequence as before, pushed to a more
// saturated/brighter version of each stop (was capped near 0x8c per
// channel; now reaches ~0xe0) after players asked for the player's own
// rainbow shift to be more vibrant and easier to notice against the board.
export const LEGACY_IRIDESCENT_MIDNIGHT_STOPS = [
  0x8b2fe0,
  0x4a2fe0,
  0x2f7fe0,
  0x2fe0c0,
  0x2fe06a,
  0xe02f9c
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

// The trail now carries the midnight-rainbow material that used to belong
// to the player marker (see resolveLegacyIridescentPlayerCoreColor below --
// the two were swapped per feedback). Position along the trail spreads the
// cycle across LEGACY_TRAIL_IRIDESCENT_SPREAD of a full rotation on top of
// the same time-based shift, so it reads as a single rainbow gradient
// slowly flowing along the trail rather than every tile flashing the same
// color in lockstep.
const LEGACY_TRAIL_IRIDESCENT_SPREAD = 0.6;

export const resolveLegacyIridescentTrailColor = (
  index: number,
  total: number,
  timeMs: number,
  _anchorColor: number = LEGACY_IRIDESCENT_GREEN_ANCHOR
): number => {
  const positionPhase = total > 1 ? (index / (total - 1)) * LEGACY_TRAIL_IRIDESCENT_SPREAD : 0;
  return resolveLegacyIridescentMidnightColor((timeMs / LEGACY_IRIDESCENT_PLAYER_SHIFT_PERIOD_MS) + positionPhase);
};

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

// The player's own diamond core is the flat green anchor now -- the
// midnight-rainbow material it used to cycle through moved to the trail
// instead (see resolveLegacyIridescentTrailColor above; the two were
// swapped per feedback so the player reads as a single, stable, always-
// identifiable color while the trail carries the rainbow shimmer).
export const resolveLegacyIridescentPlayerCoreColor = (
  _timeMs = 0
): number => LEGACY_IRIDESCENT_GREEN_ANCHOR;

// A slightly darker rim of the same green, for a hint of facet depth
// between the core fill and its outline -- no more animated phase shift
// now that the core itself is flat, not cycling.
export const resolveLegacyIridescentPlayerAccentColor = (
  _timeMs: number,
  anchorColor: number = LEGACY_IRIDESCENT_GREEN_ANCHOR
): number => mixLegacyIridescentColor(anchorColor, 0x000000, 0.25);
