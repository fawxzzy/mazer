/**
 * Yo-yo motion curve for the diamond ring orbit (MAZER lane L3).
 *
 * The ring circles counter-clockwise while the maze deconstructs and clockwise while it rebuilds. The two halves are
 * ONE continuous curve with a single turnaround at the instant the maze is fully gone:
 *
 *   approach(u) = (1 - (1 - u)^2)^2, u in 0..1
 *
 * approach has zero speed at u = 0 (the ring leaves rest smoothly), is monotone, and arrives at u = 1 with zero speed
 * AND a non-zero deceleration (approach''(1) = -4). That non-zero deceleration is what makes it a yo-yo and not a
 * stop: the speed reaches zero at one instant only (|speed| grows linearly on both sides of the apex), with no
 * zero-velocity plateau. The deconstruct plays approach forward (phase 0 -> -laps*2pi); the rebuild plays it
 * mirrored in time (phase -laps*2pi -> 0), so the velocity is continuous through the turnaround and the ring settles to
 * rest normally (zero speed) when the build finishes. Whole laps: the turnaround and both rests are rest layouts
 * (resolveOrbitingEdgeStations is 2*pi periodic), so a finished build/deconstruct is exactly phase 0.
 *
 * Pure: no Phaser, no clock. Reduced motion never calls this (the timeline keeps ringSpinRad at 0).
 */
export const YOYO_ORBIT_LAPS = 1;
const TAU = Math.PI * 2;

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

/** 0..1 travel toward the turnaround; zero speed at 0, zero speed + constant deceleration at 1. */
export const resolveYoYoApproach = (progress: number): number => {
  const remaining = 1 - clamp01(progress);
  const inner = 1 - (remaining * remaining);
  return inner * inner;
};

/** d(approach)/du. Exposed for the continuity tests. */
export const resolveYoYoApproachSpeed = (progress: number): number => {
  const remaining = 1 - clamp01(progress);
  return 4 * remaining * (1 - (remaining * remaining));
};

/**
 * Deconstruct half: phase (radians) over [startMs, endMs], 0 before startMs, counter-clockwise (negative) to
 * -laps*2pi at endMs (the turnaround). After the window it is held at 0 (the same rest layout, one lap unwound).
 */
export const resolveYoYoDeconstructPhase = (elapsedMs: number, startMs: number, endMs: number): number => {
  const progress = (elapsedMs - startMs) / (endMs - startMs);
  return progress <= 0 || progress >= 1 ? 0 : -TAU * YOYO_ORBIT_LAPS * resolveYoYoApproach(progress);
};

/**
 * Rebuild half: phase over [startMs, endMs]. At startMs (and before) it is the turnaround, -laps*2pi, then travels
 * clockwise to exactly 0 at endMs (and after), arriving with zero speed.
 */
export const resolveYoYoRebuildPhase = (elapsedMs: number, startMs: number, endMs: number): number => {
  const progress = (elapsedMs - startMs) / (endMs - startMs);
  return progress >= 1 ? 0 : -TAU * YOYO_ORBIT_LAPS * resolveYoYoApproach(1 - clamp01(progress));
};
