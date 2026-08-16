import { clampNumber } from './legacyDefaults';

export const LEGACY_MOVEMENT_SPEED_MIN = 0;
export const LEGACY_MOVEMENT_SPEED_MAX = 1;
export const LEGACY_MOVEMENT_SPEED_DEFAULT = 0.3;
export const LEGACY_MOVEMENT_SPEED_STEP = 0.05;
export const LEGACY_MOVEMENT_PACE_PROFILE_VERSION = 'legacy-movement-pace-v1';

const LEGACY_MOVEMENT_LEVEL_ADJUSTMENT_MAX = 0.1;
const LEGACY_MOVEMENT_PACE_ADJUSTMENT_MAX = 0.05;

export interface LegacyMovementSpeedProgressionContext {
  readonly completedCycles: number;
  readonly level: number;
  readonly paceScore: number;
}

export interface LegacyMovementSpeedProfile {
  readonly baseSpeed: number;
  readonly completedCycles: number;
  readonly contextApplied: boolean;
  readonly effectiveSpeed: number;
  readonly formulaVersion: typeof LEGACY_MOVEMENT_PACE_PROFILE_VERSION;
  readonly initialDelayMs: number;
  readonly level: number;
  readonly levelAdjustment: number;
  readonly paceAdjustment: number;
  readonly paceScore: number;
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
  speed: number,
  context?: Partial<LegacyMovementSpeedProgressionContext>
): LegacyMovementSpeedProfile => {
  const baseSpeed = normalizeLegacyMovementSpeed(speed);
  const rawCompletedCycles = context?.completedCycles;
  const rawLevel = context?.level;
  const rawPaceScore = context?.paceScore;
  const completedCycles = Math.max(0, Math.round(typeof rawCompletedCycles === 'number' && Number.isFinite(rawCompletedCycles)
    ? rawCompletedCycles
    : 0));
  const level = Math.round(clampNumber(
    typeof rawLevel === 'number' && Number.isFinite(rawLevel) ? rawLevel : 1,
    1,
    99
  ));
  const paceScore = Math.round(clampNumber(
    typeof rawPaceScore === 'number' && Number.isFinite(rawPaceScore) ? rawPaceScore : 50,
    0,
    100
  ));
  const contextApplied = completedCycles > 0;
  const levelAdjustment = contextApplied
    ? ((level - 1) / 98) * LEGACY_MOVEMENT_LEVEL_ADJUSTMENT_MAX
    : 0;
  const paceAdjustment = contextApplied
    ? ((paceScore - 50) / 50) * LEGACY_MOVEMENT_PACE_ADJUSTMENT_MAX
    : 0;
  const preferenceEnvelope = 4 * baseSpeed * (1 - baseSpeed);
  const effectiveSpeed = normalizeLegacyMovementSpeed(Number((
    baseSpeed + ((levelAdjustment + paceAdjustment) * preferenceEnvelope)
  ).toFixed(4)), baseSpeed);
  const ease = Math.pow(effectiveSpeed, 0.82);
  const initialDelayMs = Math.round(316 - (ease * 156));
  const repeatIntervalMs = Math.round(132 - (ease * 54));
  const turnDelayMs = Math.round(initialDelayMs + 46 - (ease * 12));

  return {
    baseSpeed,
    completedCycles,
    contextApplied,
    effectiveSpeed,
    formulaVersion: LEGACY_MOVEMENT_PACE_PROFILE_VERSION,
    initialDelayMs,
    level,
    levelAdjustment: Number(levelAdjustment.toFixed(4)),
    paceAdjustment: Number(paceAdjustment.toFixed(4)),
    paceScore,
    repeatIntervalMs,
    turnDelayMs
  };
};

export const formatLegacyMovementSpeedPercent = (speed: number): string => (
  `${Math.round(normalizeLegacyMovementSpeed(speed) * 100)}%`
);
