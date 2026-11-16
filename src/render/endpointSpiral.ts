/**
 * The START marker's spiral (MAZER-VIS-053): pure geometry and a pure clock function, no Phaser, no DOM, no wall clock.
 *
 * Owner request: replace the start triangle with a spiral of the same size that spins slowly, in phase with the end star.
 *
 * SHAPE. Two interleaved arms (a pinwheel galaxy), each an Archimedean spiral that winds clockwise outward. Two arms
 * because a one-arm spiral is lopsided: its painted mass is not at its centre, so turning it about the tile centre would
 * make the visible mass circle the tile (a wobble the star, which turns about its circumcentre, never has). Two arms
 * half a turn apart are 2-fold symmetric, so the painted centroid is exactly the spin axis at every angle, and the glyph
 * stays centred on the same optical centre as the star (endpointOpticalCentre.ts). Two arms also keep the gaps between
 * passes twice as wide as one arm winding the same number of turns, which matters on a 15 px tile.
 *
 * SIZE. The outer radius is the circle that circumscribes the old play triangle (`endpoint.startPlay*`), which is also
 * the goal star's tip radius, so the two end glyphs have one footprint. The fit inside the lit rim is unchanged: the
 * keyline's farthest point stays an inset inside the tile's fill.
 *
 * SPIN, IN PHASE WITH THE STAR. The star turns once per `GOAL_STAR_SPIN.periodMs` (14 s) and its angle is reduced into
 * one 72 degree tooth (five-fold symmetry). The spiral has no such symmetry, so it needs the full angle, and that is the
 * same sawtooth un-reduced: `resolveStartSpiralRotation(t)` is exactly the star's angle plus a whole number of teeth, at
 * every t, with the same direction (clockwise on screen) and the same zero. Reduced motion holds both still at angle 0.
 */
import { GOAL_STAR_SPIN, GOAL_STAR_TOOTH_RAD } from './goalStarSpin';

export const START_SPIRAL = Object.freeze({
  /** Interleaved arms (2-fold symmetric: the painted centroid is the spin axis). */
  arms: 2,
  /** Turns each arm winds from its inner to its outer radius. */
  turns: 0.85,
  /** Where an arm starts, as a share of the outer radius (keeps the two round caps from merging at the centre). */
  innerShare: 0.14,
  /** Polyline segments per arm (a smooth curve at phone size; cheap). */
  segments: 22
});

export interface StartSpiralGeometry {
  /** Spin axis (board-local css px). */
  readonly cx: number;
  readonly cy: number;
  /** Radius of the arm's centre line at its outer end. */
  readonly outer: number;
  readonly inner: number;
}

/**
 * The full clockwise angle of the spiral, radians in [0, 2 pi), for scene time `timeMs`. 0 under reduced motion and for
 * a non-finite clock. Equals `resolveGoalStarRotation` plus k * GOAL_STAR_TOOTH_RAD (k = 0..4): in phase with the star.
 */
export const resolveStartSpiralRotation = (timeMs: number, reducedMotion: boolean): number => {
  if (reducedMotion || !Number.isFinite(timeMs)) {
    return 0;
  }
  const period = GOAL_STAR_SPIN.periodMs;
  const within = ((timeMs % period) + period) % period;
  return (within / period) * GOAL_STAR_TOOTH_RAD * GOAL_STAR_SPIN.symmetry;
};

/** Whether the spiral needs redraws as time passes (the same rule as the star). */
export const isStartSpiralSpinning = (reducedMotion: boolean): boolean => !reducedMotion;

/**
 * One arm's centre-line points, flat [x0, y0, x1, y1, ...], turned `rotation` radians clockwise about (cx, cy).
 * y grows down, so an increasing angle runs clockwise on screen; the radius grows with the angle, so the arm winds
 * clockwise outward.
 */
export const resolveStartSpiralArm = (geometry: StartSpiralGeometry, arm: number, rotation: number): number[] => {
  const { turns, segments, arms } = START_SPIRAL;
  const points: number[] = [];
  const sweep = turns * Math.PI * 2;
  const base = rotation + (arm * (Math.PI * 2)) / arms - Math.PI / 2;
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const radius = geometry.inner + ((geometry.outer - geometry.inner) * t);
    const angle = base + (sweep * t);
    points.push(geometry.cx + (Math.cos(angle) * radius), geometry.cy + (Math.sin(angle) * radius));
  }
  return points;
};
