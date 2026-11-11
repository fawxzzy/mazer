/**
 * Continuous visual glide for the player marker (menu demo walker and play).
 *
 * Why this exists (measured, see PR): the previous visual motion was ONE independent smoothstep tween per
 * logical step, 80ms long for the menu walker while steps fire every ~100ms (88ms configured, rounded up to
 * whole frames). Every tile therefore accelerated from zero, peaked at 1.5x the mean speed, braked to zero and
 * rested for a few frames: a ~10Hz stop-and-go pulse (speed 0..18 tiles/s, 16% of in-run frames with no
 * displacement). When a frame took longer than the tween (slow phone, dropped frames) the marker degraded to
 * whole-tile jumps.
 *
 * This module replaces that with a path follower: each logical step appends a waypoint, the marker moves along
 * the queued polyline at one steady speed derived from the observed step cadence, and a new step never restarts
 * the motion from rest. The follower never trails the logical position by more than MAX_LAG_TILES, which keeps
 * the rendered point on (or within a hair of) the last segment the trail renderer expects.
 *
 * Pure and deterministic: no Phaser, no DOM, no wall clock. The caller supplies monotonic millisecond times.
 * Position reads are idempotent for a given time (several draw paths may ask within one frame).
 */

export interface PlayerGlidePoint {
  x: number;
  y: number;
}

/** The marker may trail the logical tile by at most this many tiles of path before it is pulled forward. */
export const PLAYER_GLIDE_MAX_LAG_TILES = 1.35;
/** Observed step cadence is trusted between these bounds; outside, the caller's hint is used. */
export const PLAYER_GLIDE_MIN_INTERVAL_MS = 40;
export const PLAYER_GLIDE_MAX_INTERVAL_MS = 600;
/** A gap longer than this many hints is a pause (new move after rest), not a cadence sample. */
export const PLAYER_GLIDE_CADENCE_GAP_HINTS = 2.5;
/** Weight of the newest cadence sample in the running estimate. */
export const PLAYER_GLIDE_CADENCE_BLEND = 0.5;
/** Time constant (ms) of the smoothed "in motion" amount that drives the squash and stretch. */
export const PLAYER_GLIDE_MOTION_TAU_MS = 70;

const copy = (point: PlayerGlidePoint): PlayerGlidePoint => ({ x: point.x, y: point.y });
const distance = (a: PlayerGlidePoint, b: PlayerGlidePoint): number => Math.hypot(b.x - a.x, b.y - a.y);
const same = (a: PlayerGlidePoint, b: PlayerGlidePoint): boolean => a.x === b.x && a.y === b.y;

export class PlayerGlide {
  private position: PlayerGlidePoint = { x: 0, y: 0 };
  private queue: PlayerGlidePoint[] = [];
  private speedTilesPerMs = 0;
  private clockMs = 0;
  private lastAppendMs: number | null = null;
  private cadenceMs: number | null = null;
  private motionAmount = 0;
  private heading: PlayerGlidePoint = { x: 0, y: 0 };
  /** Start tile of the newest logical step: the trail's last segment runs segmentStart -> target. */
  private segmentStart: PlayerGlidePoint = { x: 0, y: 0 };

  /** Place the marker with no motion (spawn, reset, reduced motion, wrapped step). Clears any pending path. */
  public snapTo(point: PlayerGlidePoint, timeMs?: number): void {
    this.position = copy(point);
    this.segmentStart = copy(point);
    this.queue = [];
    this.speedTilesPerMs = 0;
    this.motionAmount = 0;
    this.heading = { x: 0, y: 0 };
    this.lastAppendMs = null;
    this.cadenceMs = null;
    if (timeMs !== undefined && Number.isFinite(timeMs)) {
      this.clockMs = timeMs;
    }
  }

  /** Logical destination: the end of the queued path, or where the marker rests. */
  public getTarget(): PlayerGlidePoint {
    return copy(this.queue.length > 0 ? this.queue[this.queue.length - 1]! : this.position);
  }

  /**
   * A logical step from `from` to `to` was committed at `timeMs`. `hintMs` is the cadence the caller expects
   * (menu walker: its scheduled delay; play: the repeat interval); it is used until real cadence is observed and
   * whenever the player has paused.
   */
  public step(from: PlayerGlidePoint, to: PlayerGlidePoint, timeMs: number, hintMs: number): void {
    this.advanceTo(timeMs);
    // If the logical start does not continue the queued path the follower is stale: re-anchor.
    const pathEnd = this.getTarget();
    if (!same(pathEnd, from)) {
      this.position = copy(from);
      this.queue = [];
    }
    if (same(from, to)) {
      return;
    }
    this.segmentStart = copy(from);

    const safeHint = Number.isFinite(hintMs) && hintMs > 0 ? hintMs : 100;
    const gap = this.lastAppendMs === null ? null : timeMs - this.lastAppendMs;
    if (gap !== null && gap > 0 && gap <= safeHint * PLAYER_GLIDE_CADENCE_GAP_HINTS) {
      this.cadenceMs = this.cadenceMs === null
        ? gap
        : (this.cadenceMs * (1 - PLAYER_GLIDE_CADENCE_BLEND)) + (gap * PLAYER_GLIDE_CADENCE_BLEND);
    } else {
      this.cadenceMs = null;
    }
    this.lastAppendMs = timeMs;
    const intervalMs = Math.min(
      PLAYER_GLIDE_MAX_INTERVAL_MS,
      Math.max(PLAYER_GLIDE_MIN_INTERVAL_MS, this.cadenceMs ?? safeHint)
    );

    this.queue.push(copy(to));
    // Pull the marker forward if it has fallen too far behind the logical position.
    while (this.queue.length > 1 && this.remainingTiles() > PLAYER_GLIDE_MAX_LAG_TILES) {
      this.position = this.queue.shift()!;
    }
    this.speedTilesPerMs = this.remainingTiles() / intervalMs;
  }

  /** Rendered position at `timeMs`. Safe to call repeatedly in one frame. */
  public sample(timeMs: number): PlayerGlidePoint {
    this.advanceTo(timeMs);
    return copy(this.position);
  }

  /**
   * Position to hand the trail renderer as the trail head. The trail's last logical vertex is the previous tile,
   * so the head must not sit behind it (that would draw a small reversal): while the marker is still catching up
   * to the previous tile, the head rests on that tile. Equal to sample() whenever the marker is on the last segment.
   */
  public sampleTrailHead(timeMs: number): PlayerGlidePoint {
    this.advanceTo(timeMs);
    if (this.queue.length === 0) {
      return copy(this.position);
    }
    const target = this.queue[this.queue.length - 1]!;
    return this.remainingTiles() > distance(this.segmentStart, target) + 1e-9
      ? copy(this.segmentStart)
      : copy(this.position);
  }

  /** True while the marker still has path to cover, so the owner keeps redrawing. */
  public isMoving(timeMs: number): boolean {
    this.advanceTo(timeMs);
    return this.queue.length > 0 || this.motionAmount > 0;
  }

  /** Smoothed 0..1 motion amount and travel direction, for squash/stretch that does not pulse per step. */
  public getMotionPose(timeMs: number): { amount: number; headingX: number; headingY: number } {
    this.advanceTo(timeMs);
    return { amount: this.motionAmount, headingX: this.heading.x, headingY: this.heading.y };
  }

  private remainingTiles(): number {
    let total = 0;
    let cursor = this.position;
    for (const waypoint of this.queue) {
      total += distance(cursor, waypoint);
      cursor = waypoint;
    }
    return total;
  }

  private advanceTo(timeMs: number): void {
    if (!Number.isFinite(timeMs) || timeMs <= this.clockMs) {
      return;
    }
    const dtMs = timeMs - this.clockMs;
    this.clockMs = timeMs;

    let budget = this.speedTilesPerMs * dtMs;
    while (this.queue.length > 0 && budget > 0) {
      const next = this.queue[0]!;
      const segment = distance(this.position, next);
      if (segment > 0) {
        this.heading = { x: (next.x - this.position.x) / segment, y: (next.y - this.position.y) / segment };
      }
      if (segment <= budget) {
        budget -= segment;
        this.position = copy(next);
        this.queue.shift();
      } else {
        const ratio = budget / segment;
        this.position = {
          x: this.position.x + ((next.x - this.position.x) * ratio),
          y: this.position.y + ((next.y - this.position.y) * ratio)
        };
        budget = 0;
      }
    }
    if (this.queue.length === 0) {
      this.speedTilesPerMs = 0;
    }
    const target = this.queue.length > 0 ? 1 : 0;
    const blend = 1 - Math.exp(-dtMs / PLAYER_GLIDE_MOTION_TAU_MS);
    this.motionAmount += (target - this.motionAmount) * blend;
    if (this.queue.length === 0 && this.motionAmount < 0.02) {
      this.motionAmount = 0;
    }
  }
}
