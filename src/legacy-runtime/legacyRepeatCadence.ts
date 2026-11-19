/**
 * Frame-independent step cadence for held touch moves (MAZER-PERF, 2026-11-19).
 *
 * The held-touch repeat is a Phaser `delayedCall(repeatIntervalMs)` re-armed from inside its own callback. A Phaser
 * timer only fires on a frame boundary, so each step really waits `ceil(delay / frame) * frame`, and because the next wait
 * starts at the late fire time the lateness compounds into the period instead of averaging out: a 139 ms step is 150 ms
 * on a 60 Hz screen (+8 %) but about 141.7 ms on a 120 Hz screen (+2 %). The same phone therefore walked about 6 %
 * faster on a ProMotion display than on a 60 Hz one, and any change of the speed constant was swallowed or amplified by
 * the frame grid.
 *
 * Chaining each step off the previous step's DUE time instead of its fire time makes the average period exactly the
 * requested delay at any refresh rate; each step still lands on a frame boundary, so an individual step is at most one
 * frame early or late, never a trend. Pure: no Phaser, no clock of its own.
 *
 * MAZER-CTRL-003 (2026-11-19): the catch-up is bounded to about one frame (`maxLateMs`, see resolveRepeatMaxLateMs).
 * Before, a step up to a whole interval late was made up by the next one, so any hitch (a heavy frame, a GC pause, often
 * on a turn) was followed by a short, fast-looking step (headless at 390x844: 50-67 ms steps after 183-200 ms ones,
 * against 122 ms). Lateness beyond the frame budget now re-anchors the cadence instead: speed stays constant.
 */

/** Jitter allowance on top of one frame before a late step counts as a hitch. */
export const LEGACY_REPEAT_LATE_MARGIN_MS = 4;

/**
 * The most lateness a chained step may make up: one frame at the measured frame rate (clamped to 30-60 fps: the game
 * loop is capped at 60, and below 30 the guess is unreliable) plus a small jitter margin. 60 fps -> ~20.7 ms.
 */
export const resolveRepeatMaxLateMs = (actualFps: number): number => {
  const fps = Number.isFinite(actualFps) && actualFps > 0 ? Math.min(60, Math.max(30, actualFps)) : 60;
  return (1000 / fps) + LEGACY_REPEAT_LATE_MARGIN_MS;
};

/**
 * How long to wait before the next step. `previousDueAtMs` is when the step that just fired was DUE (not when it ran),
 * `nowMs` is the scene clock now. Falls back to a plain `delayMs` when there is no usable anchor or the step fired more
 * than a whole step late (a stall, a hidden tab): the cadence re-anchors instead of bursting to catch up.
 */
export const resolveDriftCorrectedRepeatWaitMs = (
  previousDueAtMs: number | null,
  nowMs: number,
  delayMs: number,
  maxLateMs: number = Number.POSITIVE_INFINITY
): number => {
  const delay = Math.max(0, Math.round(delayMs));
  if (previousDueAtMs === null || !Number.isFinite(previousDueAtMs) || !Number.isFinite(nowMs)) {
    return delay;
  }
  const wait = (previousDueAtMs + delay) - nowMs;
  if (!(wait >= 0 && wait <= delay) || nowMs - previousDueAtMs > maxLateMs) {
    return delay;
  }
  return wait;
};
