/**
 * Edge star size curve (lane "edge stars smooth + rainbow + shared player colour", MAZER-VIS-030 / VIS-043 / VIS-060).
 *
 * One rule: a star's SIZE is a function of its FILL, and nothing else.
 *   scale = REST + (FULL - REST) * growth(fill),  growth = smootherstep
 * The player-energy laser fills a star 0 -> 1 over EDGE_BEAM_PULSE_MS (edgeBeamTimeline.ts, linear from the exact contact
 * instant) and drains it 1 -> 0 the same way; with this curve the star therefore GROWS smoothly while it fills, SHRINKS smoothly
 * while it drains, and stays full (full size) for the whole time it is full (the full-size decision of VIS-060 stands: a full star
 * is exactly EDGE_DIAMOND_FULL_SCALE, never smaller mid-orbit). Because stars are scaled about their OUTER tip
 * (edgeCornerAnchor.ts `anchorStationToOuterTip`), the star's POSITION (its centre and its inner tip, the beam contact) moves
 * with that size with no extra state: growing glides the inner tip inward, shrinking glides it back out.
 *
 * Continuity (tests/render/edgeStarMotion.test.ts):
 *  - size is continuous in fill, and its slope is ZERO at fill 0 and at fill 1 (smootherstep is C2: zero first and second
 *    derivative at both ends), so there is no kink where a fill or drain starts or ends, nor against the held-full plateau;
 *  - fill 0 is exactly the rest size, so a ring that enters or leaves its lifecycle (ring teardown/rebuild, level change:
 *    the null lifecycle draws the rest size) meets the rest size with no step. The earlier hold at 100% for the whole
 *    lifecycle (edgeRingScaleHold.ts, retired) popped 50% -> 100% on the first frame and 100% -> 50% on the last.
 *
 * Pure: no Phaser, no DOM, no allocation.
 */
import { EDGE_DIAMOND_FULL_SCALE, EDGE_DIAMOND_REST_SCALE } from './edgeBeamTimeline';
import { MOTION_EASING } from './motionScale';

const { smootherstep } = MOTION_EASING;

/** 0..1 growth for a 0..1 fill: 0 and 1 at the ends, zero slope at both. Non-finite fill is empty. */
export const resolveEdgeStarGrowth = (fill: number): number => (
  Number.isFinite(fill) ? smootherstep(Math.max(0, Math.min(1, fill))) : 0
);

/** Star size (REST..FULL, a fraction of the full size) for a fill 0..1. */
export const resolveEdgeStarScale = (fill: number): number => (
  EDGE_DIAMOND_REST_SCALE + ((EDGE_DIAMOND_FULL_SCALE - EDGE_DIAMOND_REST_SCALE) * resolveEdgeStarGrowth(fill))
);
