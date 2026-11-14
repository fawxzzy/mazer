/**
 * The goal star's slow spin (MAZER-VIS-041): a pure function of the shared scene clock, no Phaser, no DOM, no
 * wall clock, no randomness.
 *
 * Owner request (2026-11-13): "can we make the end tile star spin slowly".
 *
 * ONE REVOLUTION PER 14 s (the middle of the 12 to 16 s the brief allowed): a quarter-turn takes 3.5 s, so the tips
 * read as drifting, never as a rotor, and a 25 px tile's tip (about 9 px from the centre) moves 4 px per second.
 *
 * CENTRING. The star is drawn about its CIRCUMCENTRE (endpointTiles.ts / endpointOpticalCentre.ts, MAZER-VIS-034:
 * every tip is exactly one outer radius from that point, and it is the centre of mass of the painted glyph). A
 * rotation about that point keeps every tip on the same circle and keeps the painted centroid on the same pixel at
 * every angle, so the spin cannot wobble. The angle is applied to the star path only; the circumcentre target, the
 * size and the fit inside the lit rim do not move.
 *
 * FIVE-FOLD SYMMETRY. The star looks the same every 72 degrees, so the angle returned is reduced into one 72 degree
 * tooth: `resolveGoalStarRotation` is periodic in `periodMs / 5` (2.8 s) and stays a small, precise number however
 * long the scene has been running. Clockwise on screen (y grows down, so a positive angle turns clockwise).
 *
 * REDUCED MOTION. "Movement and pulsing stop, colours keep shifting": the star holds still (angle 0, tip straight
 * up, exactly the static star the Guide icon and the baked tests use).
 *
 * COST. The star is already painted fresh into the scene's dynamic Graphics on every dynamic redraw (it is not in
 * the baked board), so the spin is one rotated path through the same call: no extra layer, no board redraw, no
 * bake. The scene schedules those redraws on the shared colour-redraw cadence (isLegacyColourRedrawDue, 33 ms).
 */

export const GOAL_STAR_SPIN = Object.freeze({
  /** One full revolution. */
  periodMs: 14000,
  /** The star's rotational symmetry: it repeats every 360 / this degrees. */
  symmetry: 5
});

/** The angular period of the star's appearance (72 degrees), in radians. */
export const GOAL_STAR_TOOTH_RAD = (Math.PI * 2) / GOAL_STAR_SPIN.symmetry;

/**
 * The star's clockwise rotation, in radians within [0, 72 degrees), for scene time `timeMs`. 0 under reduced motion,
 * and for a non-finite clock.
 */
export const resolveGoalStarRotation = (timeMs: number, reducedMotion: boolean): number => {
  if (reducedMotion || !Number.isFinite(timeMs)) {
    return 0;
  }
  const toothMs = GOAL_STAR_SPIN.periodMs / GOAL_STAR_SPIN.symmetry;
  const within = ((timeMs % toothMs) + toothMs) % toothMs;
  return (within / toothMs) * GOAL_STAR_TOOTH_RAD;
};

/** Whether the star needs redraws as time passes (it does unless the player asked for reduced motion). */
export const isGoalStarSpinning = (reducedMotion: boolean): boolean => !reducedMotion;
