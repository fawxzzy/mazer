/**
 * Pure timing helpers for the play-mode player marker (MAZER-MOTION-003).
 *
 * - resolvePlayerGlideDurationMs: the glide hint handed to PlayerGlide.step(). It is derived from the live repeat
 *   interval (the touch stick caps that interval) and is NEVER longer than it, so a held move cannot overlap itself.
 *   The old fixed 90 ms floor exceeded the repeat interval at max speed (about 78 ms) and on the stick.
 * - resolveWallBumpNudge: the short whole-pixel nudge drawn when a move is blocked by a wall.
 *
 * No Phaser, no DOM, no wall clock.
 */

export const PLAYER_GLIDE_DURATION_RATIO = 0.85;
export const PLAYER_GLIDE_DURATION_MAX_MS = 190;
export const PLAYER_GLIDE_DURATION_FLOOR_MS = 40;

export const WALL_BUMP_DURATION_MS = 110;
export const WALL_BUMP_MAX_OFFSET_PX = 2;
export const WALL_BUMP_HAPTIC_MS = 8;
/** A held key or stick against a wall repeats every step; buzz at most this often. */
export const WALL_BUMP_HAPTIC_MIN_GAP_MS = 140;

export interface PlayerGlideDurationInput {
  /** Live repeat interval of the movement speed profile. */
  repeatIntervalMs: number;
  /** Touch-stick cap on the repeat interval, applied only while the stick is held. */
  stickRepeatIntervalMaxMs?: number;
  stickActive?: boolean;
}

export const resolvePlayerGlideDurationMs = (input: PlayerGlideDurationInput): number => {
  let repeat = Number.isFinite(input.repeatIntervalMs) && input.repeatIntervalMs > 0
    ? input.repeatIntervalMs
    : PLAYER_GLIDE_DURATION_MAX_MS;
  if (input.stickActive && input.stickRepeatIntervalMaxMs !== undefined && input.stickRepeatIntervalMaxMs > 0) {
    repeat = Math.min(repeat, input.stickRepeatIntervalMaxMs);
  }
  const scaled = Math.round(repeat * PLAYER_GLIDE_DURATION_RATIO);
  const bounded = Math.min(scaled, PLAYER_GLIDE_DURATION_MAX_MS);
  // The floor only keeps the value sane; it can never push the glide past the repeat interval.
  return Math.min(repeat, Math.max(PLAYER_GLIDE_DURATION_FLOOR_MS, bounded));
};

export interface WallBumpNudge {
  x: number;
  y: number;
}

/**
 * Offset (whole css px, per the Phaser pixel-alignment rule) toward the wall `elapsedMs` after a blocked move:
 * out and back in a triangle that peaks at WALL_BUMP_MAX_OFFSET_PX. Zero when finished, reduced motion, or no heading.
 */
export const resolveWallBumpNudge = (
  elapsedMs: number,
  directionX: number,
  directionY: number,
  reducedMotion: boolean
): WallBumpNudge => {
  if (reducedMotion || !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs >= WALL_BUMP_DURATION_MS) {
    return { x: 0, y: 0 };
  }
  const phase = elapsedMs / WALL_BUMP_DURATION_MS;
  const magnitude = Math.round((1 - Math.abs((phase * 2) - 1)) * WALL_BUMP_MAX_OFFSET_PX);
  return { x: (Math.sign(directionX) * magnitude) || 0, y: (Math.sign(directionY) * magnitude) || 0 };
};

export const shouldBuzzWallBump = (
  nowMs: number,
  lastBuzzMs: number | null,
  reducedMotion: boolean
): boolean => !reducedMotion && (lastBuzzMs === null || nowMs - lastBuzzMs >= WALL_BUMP_HAPTIC_MIN_GAP_MS);
