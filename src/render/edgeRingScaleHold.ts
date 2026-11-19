/**
 * Edge ring size hold (owner decision 2026-11-19, option 1): while the ring has a full-motion lifecycle (the whole menu teardown
 * plus rebuild) every star stays at FULL size. The MAZER-VIS-038 size cycle (outro growth from 50% and the drain back to 50% when the
 * spawn beams fire) is no longer applied to the drawn size or to the beam contact points; the pure curve in edgeBeamTimeline.ts
 * (`resolveEdgeDiamondScale`) is untouched. Outside a lifecycle the ring keeps the 50% rest size.
 *
 * Pure: no Phaser, no DOM.
 */

import { EDGE_DIAMOND_FULL_SCALE } from './edgeBeamTimeline';

/** Size of every ring star for the whole full-motion teardown + rebuild cycle (fraction of full size). */
export const EDGE_RING_HELD_SCALE = EDGE_DIAMOND_FULL_SCALE;

/** Drop-in for `resolveEdgeDiamondScale`: same arguments, constant result. */
export const resolveHeldEdgeDiamondScale = (
  _direction?: unknown,
  _clockMs?: number,
  _index?: number,
  _count?: number,
  _charge?: number
): number => EDGE_RING_HELD_SCALE;
