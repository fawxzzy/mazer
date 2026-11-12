/**
 * When the play trail's canvas actually needs rebuilding (MAZER-PERF-002).
 *
 * Measured cause of "the game gets laggy in the upper levels": the trail is rebuilt and stroked in full (a bloom, an
 * underlay and a core pass over every 4 px of the route, 1,100 to 1,500 segments on a long route) every time the dynamic
 * board redraws, and that cost grows with the route. At a 4x CPU throttle one rebuild of a long route is 125 to 260 ms
 * (about 17 ms for the level 1 corridor), at the 30 Hz colour cadence. The scene also redraws the dynamic board for
 * other reasons (the bleed-dock glow on levels with wrap corridors redraws it every frame, the player locator ping, the
 * level announcer), and each of those redrew the unchanged trail too.
 *
 * Two pure rules, tested in tests/render/trail-redraw-gate.test.ts, no Phaser, DOM or wall clock:
 *
 *  1. A rebuild is needed only when the picture can differ: the route, the head, the geometry inputs or the alpha
 *     changed (the stamp below), or the colour clock has moved on by a redraw gap. Otherwise the canvas that is already
 *     on screen is exactly what a rebuild would paint, so it is kept.
 *  2. The redraw gap for a time-only (colour and shine) rebuild is the usual 33 ms floor, but stretches with what the
 *     last rebuild really cost, so a long route on a slow device spends at most about half of the main thread on its own
 *     colour drift and leaves the rest for input and everything else: gap = 2 x the last rebuild, between 33 and 250 ms.
 *     Fast rebuilds (short routes, fast devices) keep the 33 ms cadence untouched.
 */

/** The long-standing gap between time-only trail rebuilds. */
export const TRAIL_REDRAW_MIN_GAP_MS = 33;
/** Never let colour drift fall below 4 redraws a second, however slow the rebuild (the head still redraws as it moves). */
export const TRAIL_REDRAW_MAX_GAP_MS = 250;
/** Gap = this many rebuild-costs, so the trail's own share of the main thread stays near 1 / TRAIL_REDRAW_COST_MULTIPLE. */
export const TRAIL_REDRAW_COST_MULTIPLE = 2;

/** The gap before the next time-only rebuild, from the measured cost of the last rebuild (ms). */
export const resolveTrailRedrawGapMs = (lastRebuildCostMs: number | null): number => {
  if (lastRebuildCostMs === null || !Number.isFinite(lastRebuildCostMs) || lastRebuildCostMs <= 0) {
    return TRAIL_REDRAW_MIN_GAP_MS;
  }
  return Math.min(
    TRAIL_REDRAW_MAX_GAP_MS,
    Math.max(TRAIL_REDRAW_MIN_GAP_MS, lastRebuildCostMs * TRAIL_REDRAW_COST_MULTIPLE)
  );
};

/** Everything that changes what the trail looks like other than the colour clock. All plain values, compared by `===`. */
export interface TrailDrawStamp {
  /** Which route this is: bumped whenever the shortest-path route is recomputed (src/render/trailPerfectPathCache.ts). */
  routeRevision: number;
  /** The tile the player just left (it decides whether the head replaces or extends the arrival tile). */
  previousTileKey: string;
  /** The rendered head, interpolated during a glide (fractional). */
  headX: number;
  headY: number;
  originX: number;
  originY: number;
  tileSize: number;
  /** The lifecycle fade (the deconstruct animation). */
  alphaMultiplier: number;
  /** Zoom and settings that change widths, resolution or which passes run, folded into one string by the caller. */
  styleKey: string;
}

export interface TrailDrawRecord {
  stamp: TrailDrawStamp;
  /** Scene time of the rebuild. */
  drawnAtMs: number;
  /** Arc length of the route that was drawn (the colour phase and the bleed glow read it without a rebuild). */
  totalLength: number;
  /** What the rebuild cost, for the next gap: the draw call itself, raised to the real frame time once that is seen. */
  costMs: number;
  /** True once the following frame has been timed (see observeTrailFrameCost). */
  frameCostObserved?: boolean;
}

/** A longer gap than this between a rebuild and the next request is idle time, not the cost of the rebuild. */
export const TRAIL_FRAME_COST_OBSERVE_MAX_MS = 500;

/**
 * The draw call only measures the commands the scene issues: the canvas rasterises and is composited when the frame is
 * presented, which on a 3x phone canvas was measured at twice the draw call (level 300, phone, 1x CPU: 10 ms drawing,
 * 43 ms in the renderer). The time from the rebuild's frame to the NEXT frame is the whole cost, so the first request after a
 * rebuild raises `costMs` to it (once, and only when it is a frame, not an idle gap).
 */
export const observeTrailFrameCost = (record: TrailDrawRecord, nowMs: number): void => {
  if (record.frameCostObserved === true) {
    return;
  }
  record.frameCostObserved = true;
  const frameMs = nowMs - record.drawnAtMs;
  if (Number.isFinite(frameMs) && frameMs > record.costMs && frameMs <= TRAIL_FRAME_COST_OBSERVE_MAX_MS) {
    record.costMs = frameMs;
  }
};

const sameStamp = (a: TrailDrawStamp, b: TrailDrawStamp): boolean => (
  a.routeRevision === b.routeRevision
  && a.previousTileKey === b.previousTileKey
  && a.headX === b.headX
  && a.headY === b.headY
  && a.originX === b.originX
  && a.originY === b.originY
  && a.tileSize === b.tileSize
  && a.alphaMultiplier === b.alphaMultiplier
  && a.styleKey === b.styleKey
);

/**
 * Must the trail canvas be rebuilt now? `nowMs` is scene time. `timeDriven` says the picture also changes with the colour
 * clock (colour drift or shine on); when it is false only a changed stamp rebuilds. A backwards or non-finite clock
 * rebuilds (safe side).
 */
export const shouldRebuildTrail = (
  previous: TrailDrawRecord | null,
  next: TrailDrawStamp,
  nowMs: number,
  timeDriven = true
): boolean => {
  if (previous === null || !Number.isFinite(nowMs)) {
    return true;
  }
  if (!sameStamp(previous.stamp, next)) {
    return true;
  }
  if (!timeDriven) {
    return false;
  }
  const elapsed = nowMs - previous.drawnAtMs;
  return elapsed < 0 || elapsed >= resolveTrailRedrawGapMs(previous.costMs);
};
