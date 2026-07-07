import { clampNumber } from './legacyDefaults';

export const LEGACY_MOVEMENT_SPEED_MIN = 0;
export const LEGACY_MOVEMENT_SPEED_MAX = 1;
export const LEGACY_MOVEMENT_SPEED_DEFAULT = 0.58;

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

export const resolveLegacyMovementSpeedProfile = (
  speed: number
): LegacyMovementSpeedProfile => {
  const normalizedSpeed = normalizeLegacyMovementSpeed(speed);
  const ease = Math.pow(normalizedSpeed, 0.82);
  const initialDelayMs = Math.round(360 - (ease * 210));
  const repeatIntervalMs = Math.round(150 - (ease * 78));
  const turnDelayMs = Math.round(initialDelayMs + 54 - (ease * 24));

  return {
    initialDelayMs,
    repeatIntervalMs,
    turnDelayMs
  };
};

export const formatLegacyMovementSpeedPercent = (speed: number): string => (
  `${Math.round(normalizeLegacyMovementSpeed(speed) * 100)}%`
);
