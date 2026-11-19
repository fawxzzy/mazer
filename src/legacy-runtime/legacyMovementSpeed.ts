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
 *
 * 2026-11-19 (Zac: "player feels faster, maybe slow ~5%"): 0.92 -> 0.85. The held-touch steps used to land on whole frames
 * (the stick's 113 ms really stepped every 116.7 ms, the d-pad's 139 ms every 150 ms at 60 Hz and 141.7 ms at 120 Hz), and
 * they are now timed exactly (legacyRepeatCadence.ts), so the constant is chosen against what the phone really did: the
 * stick now steps every 122 ms, 5% slower than its real 116.7 ms; the d-pad steps every 151 ms, equal to its 60 Hz feel
 * and 6% slower than its 120 Hz feel. 0.874 would be 5% under the old NOMINAL values but only 2% under the stick's real
 * one. Change it here only; tests/reset/legacy-movement-speed.test.ts pins the numbers.
 */
export const LEGACY_MOVEMENT_STEP_RATE_FACTOR = 0.85;

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
