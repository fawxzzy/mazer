/**
 * A frame-rate cap for high-refresh screens (MAZER-PERF, 2026-11-19).
 *
 * Nothing capped the loop, so a 120 Hz phone (ProMotion) ran every update and every Phaser canvas render twice as often as
 * the 60 Hz the game is tuned for, doubling the main-thread cost of the board, trail and glow redraws for no visible gain.
 * Phaser's own `fps.limit` is not safe here: it skips a frame whenever the accumulated delta is below 1000/limit, and a
 * real 60 Hz display's deltas jitter around 16.67 ms, so it would halve a 60 Hz screen to 30 fps.
 *
 * This gate lays a grid of due times `1000 / maxFps` apart and runs a frame when it is the closest display frame to the
 * next due time (it runs once `time + displayFrame / 2 >= due`). A display at or below the cap never skips; a 120 Hz
 * display runs every other frame; between (75, 90 Hz) the result lands between the cap and the display rate, never
 * below half. Skipped frames' time is handed to the next run frame, so Phaser's clock (delayed calls, tweens) keeps true
 * time: only the number of updates and renders per second changes, never the game's speed.
 *
 * Pure: no Phaser, no DOM, no wall clock.
 */
import type Phaser from 'phaser';

export const FRAME_RATE_CAP_FPS = 60;

export interface FrameRateGate {
  /** Offer one display frame (`timeMs` = the loop's timestamp, `deltaMs` = the loop's delta for this frame). Returns the
   *  delta to run the frame with (skipped frames' time included), or null to skip it. */
  offer(timeMs: number, deltaMs: number): number | null;
}

export const createFrameRateGate = (maxFps: number = FRAME_RATE_CAP_FPS): FrameRateGate => {
  const interval = Number.isFinite(maxFps) && maxFps > 0 ? 1000 / maxFps : 0;
  let lastTimeMs: number | null = null;
  let dueMs = 0;
  let pendingDeltaMs = 0;
  return {
    offer(timeMs, deltaMs) {
      const safeDelta = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
      pendingDeltaMs += safeDelta;
      if (interval === 0 || !Number.isFinite(timeMs)) {
        const out = pendingDeltaMs;
        pendingDeltaMs = 0;
        return out;
      }
      const previousTimeMs = lastTimeMs;
      lastTimeMs = timeMs;
      if (previousTimeMs === null) {
        // First frame: run it and start the grid here.
        dueMs = timeMs + interval;
        const out = pendingDeltaMs;
        pendingDeltaMs = 0;
        return out;
      }
      const displayFrameMs = Math.max(0, timeMs - previousTimeMs);
      if (timeMs + displayFrameMs / 2 < dueMs) {
        return null;
      }
      dueMs += interval;
      // A stall (hidden tab, long frame) must not leave a backlog of due frames: re-anchor to now.
      if (dueMs < timeMs - interval) {
        dueMs = timeMs + interval;
      }
      const out = pendingDeltaMs;
      pendingDeltaMs = 0;
      return out;
    }
  };
};

/** Wrap `game.step` so frames the gate skips never update or render. Call from the config's `postBoot` (before the loop starts). */
export const installFrameRateCap = (game: Phaser.Game, maxFps: number = FRAME_RATE_CAP_FPS): FrameRateGate => {
  const gate = createFrameRateGate(maxFps);
  const originalStep = game.step.bind(game);
  game.step = (time: number, delta: number): void => {
    const runDelta = gate.offer(time, delta);
    if (runDelta !== null) {
      originalStep(time, runDelta);
    }
  };
  return gate;
};
