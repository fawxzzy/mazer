/**
 * One definition of "reduced motion" for presentation (MAZER-MOTION-004).
 *
 * Reduced motion is ON when the device asks for it (`prefers-reduced-motion: reduce`) OR the player
 * turned on Settings > Reduce Motion. The in-game switch can only add to the device preference; it
 * never switches a device preference off, so it is a two-state toggle ("System" / "On").
 *
 * OWNER RULE (Zac, 2026-11-12): reduced motion stops MOVEMENT and PULSING, never colour. Colours keep
 * shifting over time.
 *
 * Keeps running (time-driven colour only):
 *   - the trail hue drift, and the edge-marker border and bleed-dock glow that sample the trail colour
 *   - the title, START / Login and level-number rainbow
 * Stops (held still; input cadence, glide speed, turns, collisions and every persisted setting are untouched):
 *   - the trail's travelling shine / sheen band and its swell and width breathing
 *   - the find-me ping, the idle player-marker breath, goal/start marker pulses
 *   - the blinking header and HUD icons (settings cog, leaderboard, account; held fully lit)
 *   - the bleed-dock glow's travelling band (held at its peak, colour still shifting)
 *   - backdrop star drift and twinkle, sparkles, the AI option-tile pulse, loading pulses, the touch-stick anchor orbit
 *   - the intro/outro reveal, which becomes a short crossfade
 *   - the Start hand-off, overlay open/close and boot splash fade (MAZER-MOTION-002): one 200 ms crossfade, no outward drift;
 *     the loading pulse (splash dot, in-game "Signing you in" diamond) is held lit
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

/**
 * What the trail animates. Two independent gates, so reduced motion can stop movement without stopping colour:
 *   - `shineVisible`: the travelling shine / sheen band, the swell and the width breathing (MOVEMENT).
 *     On whenever reduced motion is off.
 *   - `colourDrifts`: the hue sweep that follows the colour clock (COLOUR). Always on, reduced motion or not.
 *
 * Retired Display switches (MAZER-UI-026). Settings used to carry three more rows, Trail Fade, Trail Shine and
 * Animated Background. Reduce Motion now decides all three; there is no independent switch and a value stored
 * by an older build is ignored (see RETIRED_GAME_TOGGLE_KEYS). The mapping, exactly as the app behaves:
 *   - Trail Shine (was default On): the shine band and its breathing follow Reduce Motion (`shineVisible`);
 *     the colour drift stays on in both states, as the Reduce Motion rule above already said.
 *   - Animated Background (was default Animated): drift and twinkle follow Reduce Motion
 *     (`resolveBackdropMotion`); Reduce Motion is the old "Still", and the colours keep shifting.
 *   - Trail Fade (was default Off): the whole route stays drawn at one even brightness in BOTH states
 *     (`TRAIL_TAIL_FADE`). It never was a motion effect: ON cut the route down to the last few tiles, which hides
 *     where you have been, so it is not tied to Reduce Motion. This keeps what every player sees today.
 */
export interface TrailMotionPlan {
  readonly shineVisible: boolean;
  readonly colourDrifts: boolean;
}

export const resolveTrailMotionPlan = (reducedMotion: boolean): TrailMotionPlan => ({
  shineVisible: !reducedMotion,
  colourDrifts: true
});

/** Whether the backdrop stars drift and twinkle. Reduce Motion holds them still (colour keeps shifting). */
export const resolveBackdropMotion = (reducedMotion: boolean): boolean => !reducedMotion;

/** Trail Fade retired: the trail is never cut to a short fading tail. See "Retired Display switches" above. */
export const TRAIL_TAIL_FADE = false;

/** Time fed to the trail's hue sweep: the colour clock while the colour drifts, otherwise one fixed phase (0). */
export const resolveTrailColourTimeMs = (colourClockMs: number, plan: TrailMotionPlan): number => (
  plan.colourDrifts ? colourClockMs : 0
);

/** The bleed-dock glow band's loop position under reduced motion: the peak of its envelope, so it holds still, lit. */
export const REDUCED_MOTION_BLEED_GLOW_PROGRESS = 0.5;

/** Settings copy: says exactly what the switch stops, and that colours keep moving. Pinned by tests. */
export const REDUCED_MOTION_SETTING_LABEL = 'Reduce Motion';
export const REDUCED_MOTION_SETTING_ON_LABEL = 'On';
export const REDUCED_MOTION_SETTING_OFF_LABEL = 'System';
export const REDUCED_MOTION_SETTING_NOTE =
  'Stops movement and pulsing: trail shine, blinking icons, background, sparkles. '
  + 'Colours keep shifting. Gameplay is unchanged. System follows your device.';
