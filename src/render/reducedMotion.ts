/**
 * One definition of "reduced motion" for presentation (MAZER-MOTION-004).
 *
 * Reduced motion is ON when the device asks for it (`prefers-reduced-motion: reduce`) OR the player
 * turned on Settings > Reduce Motion. The in-game switch can only add to the device preference; it
 * never switches a device preference off, so it is a two-state toggle ("System" / "On").
 *
 * What it settles (pure presentation; input cadence, glide speed, turns, collisions and every
 * persisted setting are untouched):
 *   - the trail colour sweep and shine, and the edge-marker border that samples the trail colour
 *   - the title, START / Login and level-number rainbow (held at one defined hue phase)
 *   - the blinking header and HUD icons (settings cog, leaderboard, account; held fully lit)
 *   - the animated background, sparkles, locator ping and goal/start marker pulses
 *   - the intro/outro reveal, which becomes a short crossfade
 * Anything not listed above is not gated.
 */

export type ReducedMotionSource = 'system' | 'setting' | 'system+setting' | 'none';

export const resolveReducedMotion = (systemPrefersReduced: boolean, settingOn: boolean): boolean => (
  systemPrefersReduced || settingOn
);

export const resolveReducedMotionSource = (
  systemPrefersReduced: boolean,
  settingOn: boolean
): ReducedMotionSource => {
  if (systemPrefersReduced && settingOn) {
    return 'system+setting';
  }
  if (systemPrefersReduced) {
    return 'system';
  }
  return settingOn ? 'setting' : 'none';
};

/** The blink pulse (0..1) every header/HUD icon shares; reduced motion holds it at fully lit. */
export const REDUCED_MOTION_BLINK_PHASE = 1;

export const resolveMenuBlinkPhase = (timeMs: number, periodMs: number, reducedMotion: boolean): number => (
  reducedMotion ? REDUCED_MOTION_BLINK_PHASE : (Math.sin((timeMs / periodMs) * Math.PI * 2) + 1) / 2
);

/** Time fed to the wordmark rainbow; reduced motion holds one defined hue phase (time 0). */
export const resolveWordmarkHueTimeMs = (timeMs: number, reducedMotion: boolean): number => (
  reducedMotion ? 0 : timeMs
);

/** Settings copy: says exactly what the switch holds still. Pinned by tests. */
export const REDUCED_MOTION_SETTING_LABEL = 'Reduce Motion';
export const REDUCED_MOTION_SETTING_ON_LABEL = 'On';
export const REDUCED_MOTION_SETTING_OFF_LABEL = 'System';
export const REDUCED_MOTION_SETTING_NOTE =
  'Holds still: trail and edge-marker colours, title and level-number colours, blinking icons, '
  + 'background and sparkles. Gameplay is unchanged. System follows your device.';
