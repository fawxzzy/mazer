/**
 * Options-page seam for the star-dust trail draw (MAZER-PERF-017 follow-up, trail cost options). Dormant in the game:
 * nothing in a shipping entry sets it, so `drawStarDustTrailToCanvasContext` always runs the shipped draw. Only the dev
 * page `trail-perf-options.html` (not a build input) installs a renderer here, to show cheaper variants on the real
 * scene with the real trail. Pinned by tests/architecture/trail-perf-options-dormant.test.ts.
 */
import type { StarDustDrawOptions, StarDustSegment } from './starDustTrailCanvas';

export type StarDustTrailRenderer = (
  ctx: CanvasRenderingContext2D,
  segments: readonly StarDustSegment[],
  options: StarDustDrawOptions
) => number;

let override: StarDustTrailRenderer | null = null;

/** Installs (or with null removes) the options-page renderer. */
export const setStarDustTrailRenderOverride = (renderer: StarDustTrailRenderer | null): void => {
  override = renderer;
};

export const getStarDustTrailRenderOverride = (): StarDustTrailRenderer | null => override;
