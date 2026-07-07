import { clampNumber } from './legacyDefaults';

export const LEGACY_MOVEMENT_SPEED_MIN = 0;
export const LEGACY_MOVEMENT_SPEED_MAX = 1;
export const LEGACY_MOVEMENT_SPEED_DEFAULT = 0.58;
export const LEGACY_MOVEMENT_SPEED_STEP = 0.05;

export interface LegacyMovementSpeedProfile {
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
  const normalizedSpeed = normalizeLegacyMovementSpeed(speed);
  const ease = Math.pow(normalizedSpeed, 0.82);
  const initialDelayMs = Math.round(300 - (ease * 150));
  const repeatIntervalMs = Math.round(124 - (ease * 52));
  const turnDelayMs = Math.round(initialDelayMs + 42 - (ease * 12));

  return {
    initialDelayMs,
    repeatIntervalMs,
    turnDelayMs
  };
};

export const formatLegacyMovementSpeedPercent = (speed: number): string => (
  `${Math.round(normalizeLegacyMovementSpeed(speed) * 100)}%`
);
