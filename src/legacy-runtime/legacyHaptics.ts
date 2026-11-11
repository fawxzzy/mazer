/**
 * Vibration helper (MAZER-CTRL-001). The ONE place that calls `navigator.vibrate`.
 *
 * Behaviour:
 * - Settings > Haptics (`LegacySettings.hapticsEnabled`, default on) turns every pulse off.
 * - Reduced motion (the OS preference) also silences pulses.
 * - Unsupported platforms are a silent no-op. iOS Safari (and every iOS browser, which runs WebKit) does not
 *   implement `navigator.vibrate`, and desktop browsers usually ignore it, so on iPhone the setting has no
 *   effect. This is documented, not device-checked.
 * - A throwing `vibrate` (blocked by permissions policy / no user gesture yet) never propagates: movement must
 *   never fail over a tactile nicety.
 *
 * Other features that want a pulse (for example a blocked-move bump) call `MenuScene.triggerLegacyHapticPulse`,
 * which delegates to `triggerLegacyHaptic`; they must not touch `navigator.vibrate` themselves.
 */

export type LegacyHapticPattern = number | number[];

/** Named patterns so call sites do not scatter magic numbers. */
export const LEGACY_HAPTIC_PATTERNS = Object.freeze({
  /** A single accepted step. */
  step: 6,
  /** A blocked move (wall bump): one short pulse, throttled by shouldBuzzWallBump. */
  wallBump: 8,
  /** Reaching the goal. */
  goal: Object.freeze([18, 40, 18, 40, 32]) as readonly number[]
});

export interface LegacyHapticVibrator {
  vibrate?: (pattern: LegacyHapticPattern) => boolean;
}

export interface LegacyHapticRequest {
  enabled: boolean;
  reducedMotion: boolean;
  pattern: LegacyHapticPattern;
}

/** True when this environment exposes a callable `vibrate` (false on iOS Safari and most desktops). */
export const isLegacyHapticSupported = (vibrator: LegacyHapticVibrator | undefined): boolean => (
  vibrator !== undefined && vibrator !== null && typeof vibrator.vibrate === 'function'
);

/**
 * Fires one vibration pulse when allowed. Returns true only when `vibrate` was called and did not report
 * failure. `vibrator` defaults to the global `navigator` when present.
 */
export const triggerLegacyHaptic = (
  request: LegacyHapticRequest,
  vibrator: LegacyHapticVibrator | undefined = typeof navigator === 'undefined' ? undefined : navigator
): boolean => {
  if (!request.enabled || request.reducedMotion || !isLegacyHapticSupported(vibrator)) {
    return false;
  }

  try {
    return vibrator!.vibrate!(request.pattern) !== false;
  } catch {
    return false;
  }
};
