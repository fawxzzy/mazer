import { clampNumber } from './legacyDefaults';

export const LEGACY_MOVEMENT_SPEED_MIN = 0;
export const LEGACY_MOVEMENT_SPEED_MAX = 1;
export const LEGACY_MOVEMENT_SPEED_DEFAULT = 0.04;
export const LEGACY_MOVEMENT_SPEED_STEP = 0.05;
export const LEGACY_MOVEMENT_PACE_PROFILE_VERSION = 'legacy-movement-pace-v2';

/**
 * Owner request (Zac, 2026-11-12): the player moves a little slower overall and at one constant speed. Step rate is
 * this factor times the previous rate, so repeat interval, hold-start delay and the touch-stick caps are divided by it.
 * Applied once, in scaleLegacyMovementDelayMs; level and pace never change the speed.
 */
export const LEGACY_MOVEMENT_STEP_RATE_FACTOR = 0.92;

export const scaleLegacyMovementDelayMs = (delayMs: number): number => (
  Math.round(delayMs / LEGACY_MOVEMENT_STEP_RATE_FACTOR)
);

export interface LegacyMovementSpeedProfile {
  readonly baseSpeed: number;
  readonly effectiveSpeed: number;
  readonly formulaVersion: typeof LEGACY_MOVEMENT_PACE_PROFILE_VERSION;
  readonly initialDelayMs: number;
  readonly repeatIntervalMs: number;
  readonly turnDelayMs: number;
}

export const normalizeLegacyMovementSpeed = (
  speed: number,
  fallback = LEGACY_MOVEMENT_SPEED_DEFAULT
): number => {
  if (!Number.isFinite(speed)) {
    return clampNumber(fallback, LEGACY_MOVEMENT_SPEED_MIN, LEGACY_MOVEMENT_SPEED_MAX);
  }

  return clampNumber(speed, LEGACY_MOVEMENT_SPEED_MIN, LEGACY_MOVEMENT_SPEED_MAX);
};

export const quantizeLegacyMovementSpeed = (
  speed: number,
  fallback = LEGACY_MOVEMENT_SPEED_DEFAULT
): number => {
  const normalizedSpeed = normalizeLegacyMovementSpeed(speed, fallback);
  const steppedSpeed = Math.round(normalizedSpeed / LEGACY_MOVEMENT_SPEED_STEP)
    * LEGACY_MOVEMENT_SPEED_STEP;

  return clampNumber(
    Number(steppedSpeed.toFixed(2)),
    LEGACY_MOVEMENT_SPEED_MIN,
    LEGACY_MOVEMENT_SPEED_MAX
  );
};

export const resolveLegacyMovementSpeedProfile = (
  speed: number
): LegacyMovementSpeedProfile => {
  const baseSpeed = normalizeLegacyMovementSpeed(speed);
  // The Move Speed setting is the whole story: no level or pace term.
  const effectiveSpeed = baseSpeed;
  const ease = Math.pow(effectiveSpeed, 0.82);
  const initialDelayMs = scaleLegacyMovementDelayMs(Math.round(316 - (ease * 156)));
  const repeatIntervalMs = scaleLegacyMovementDelayMs(Math.round(132 - (ease * 54)));
  const turnDelayMs = Math.round(initialDelayMs + 46 - (ease * 12));

  return {
    baseSpeed,
    effectiveSpeed,
    formulaVersion: LEGACY_MOVEMENT_PACE_PROFILE_VERSION,
    initialDelayMs,
    repeatIntervalMs,
    turnDelayMs
  };
};

export const formatLegacyMovementSpeedPercent = (speed: number): string => (
  `${Math.round(normalizeLegacyMovementSpeed(speed) * 100)}%`
);
