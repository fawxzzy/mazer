/**
 * Backing-store budget for the big scene canvases (MAZER-PERF-006).
 *
 * The play trail is drawn into its own 2D canvas that is sized to the route's bounding box times the scene resolution
 * (devicePixelRatio, capped at 3, times the board zoom). On a 3x phone a long route covers most of the board, so that
 * canvas reaches about 2.2 million pixels (level 300 at 393x852 css px, 3x: 918 x 2427 = 2.23 M, about 9 MB) and every
 * trail rebuild clears, strokes, blurs and uploads all of it. The cost of a rebuild scales with that pixel count, not
 * with what is visible, so the pixel count is the lever.
 *
 * Rule: the backing resolution is the requested one (devicePixelRatio x zoom) unless the canvas would hold more than
 * `MAZER_TRAIL_BACKING_MAX_PIXELS` pixels, in which case it shrinks until it fits, but never below
 * `MAZER_TRAIL_BACKING_MIN_RESOLUTION` (2 device pixels per css pixel) and never above the request. So:
 *  - 1x and 2x devices, and any canvas under the budget, are untouched (the request is already at or under the budget
 *    or at or under the floor);
 *  - a 3x phone with a long route draws the trail at about 2.2x to 2.6x instead of 3x, then the browser scales the
 *    canvas back up to its css size, a 15 to 25 percent linear softening of a smooth neon tube whose core is already
 *    about 15 device px wide. The board tiles (a separate baked image), the player, the end markers and the main canvas
 *    keep their full resolution, and nothing about board size, tile size or hit-testing changes: only how many pixels
 *    back the trail image.
 *
 * Pure: no Phaser, no DOM, no clock. Pinned by tests/architecture/frame-budget-guard.test.ts.
 */

/** Most pixels the trail canvas may hold before its resolution is reduced (a 1.6 M budget is a 1264 x 1264 square). */
export const MAZER_TRAIL_BACKING_MAX_PIXELS = 1_600_000;

/** The trail never drops below this many device pixels per css pixel (2x phones are never reduced). */
export const MAZER_TRAIL_BACKING_MIN_RESOLUTION = 2;

const roundResolution = (value: number): number => Math.floor(value * 100) / 100;

/**
 * The resolution to back a css-sized canvas with. `requestedResolution` is what the scene asked for (devicePixelRatio
 * times zoom). Never returns more than requested, and never less than min(requested, MIN_RESOLUTION).
 */
export const resolveCappedBackingResolution = (
  cssWidth: number,
  cssHeight: number,
  requestedResolution: number,
  maxPixels: number = MAZER_TRAIL_BACKING_MAX_PIXELS,
  minResolution: number = MAZER_TRAIL_BACKING_MIN_RESOLUTION
): number => {
  if (!Number.isFinite(requestedResolution) || requestedResolution <= 0) {
    return 1;
  }
  const area = cssWidth * cssHeight;
  if (!Number.isFinite(area) || area <= 0) {
    return requestedResolution;
  }
  if (area * requestedResolution * requestedResolution <= maxPixels) {
    return requestedResolution;
  }
  const fitting = roundResolution(Math.sqrt(maxPixels / area));
  const floor = Math.min(requestedResolution, minResolution);
  return Math.min(requestedResolution, Math.max(floor, fitting));
};
