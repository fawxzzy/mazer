/**
 * Which end markers are painted, and in what order (MAZER-VIS-041): pure rules, no drawing.
 *
 * Owner request (2026-11-13): "the end tile star should not disappear when the player passes over it, just have the
 * players ui draw over top of the end tile star".
 *
 * Until now the scene returned early for the goal while the player stood on it ("the star's keyline would poke out
 * around the player's rounded square as dark spikes"), so the star vanished the moment the player arrived. The star
 * is now ALWAYS painted; the player marker is painted after it and so draws over it.
 *
 * The start arrow keeps its rule: it is hidden while the player stands on it, because the player IS the start
 * (nothing is "passing over" it: the run begins there).
 *
 * Draw order in the scene, bottom to top (the scene composes it; a test pins it): baked board tiles, goal beacon halo
 * (its own Graphics), trail canvas, player glow canvas, then ONE Graphics (boardDynamicGraphics) painted in this order:
 * start arrow, GOAL STAR, player marker (locator ring, core, accent stroke).
 */
import type { EndpointKind } from './endpointTiles';

export const ENDPOINT_MARKER_DRAW_ORDER = Object.freeze(['start', 'goal', 'player'] as const);

export const shouldDrawEndpointMarker = (kind: EndpointKind, playerOnTile: boolean): boolean => (
  kind === 'goal' ? true : !playerOnTile
);

/**
 * Share of the player core's opacity kept while the player stands on the goal tile (the goal star shows through the
 * core: the star is never covered, the player marker is still drawn over it). The accent stroke around the core, the
 * keyline and the locator ring stay fully opaque so the player keeps its crisp outline and stays the brightest thing
 * on the tile.
 */
export const GOAL_OVERLAP_CORE_ALPHA = 0.45;

/**
 * Multiplier for the player core's fill alpha, from the marker's share of the goal tile (0 = elsewhere, 1 = resting on
 * the goal, in between while gliding on or off it: `resolveEndpointRingBlend`), so the core eases rather than pops.
 */
export const resolvePlayerCoreAlphaScale = (goalBlend: number): number => {
  const b = Number.isFinite(goalBlend) ? Math.max(0, Math.min(1, goalBlend)) : 0;
  return 1 - (b * (1 - GOAL_OVERLAP_CORE_ALPHA));
};
