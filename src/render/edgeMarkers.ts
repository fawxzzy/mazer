/**
 * Edge markers and the single spawn laser.
 *
 * Eight procedural concave four-point stars (MAZER-VIS-055; they were kites) sit on the viewport perimeter (4 corners + 4 edge
 * midpoints, clockwise from the top-left corner -- the SAME stations, ids and
 * order the old "title orbit sigils" used and that the teleport anchors in
 * teleportAnchorPose.ts / teleportPrimaryAnchor.ts are defined against). They
 * replace the 1254 px iridescent PNG sigils that sat 2 px from the edge and
 * were mostly clipped by the viewport.
 *
 * - Fixed, UI-independent layout: the stations are a pure perimeter
 *   parametrization of the viewport (no safe-area, no header-control
 *   avoidance -- the kites sit BEHIND all UI). Along its edge a station sits
 *   at index/8 of the way round the rectangle inset EDGE_MARKER_MIN_INSET_PX
 *   (top row at 12 / w/2 / w-12); across it, the kite's outer tip is flush
 *   with the screen edge (inset by its own extent along the edge normal, 10.5
 *   px for a midpoint, ~7.6 px for a 45 degree corner kite). The layout is
 *   mirror-symmetric (top row = y-mirror of the bottom row, left = x-mirror of
 *   right). At rest nothing is clipped.
 * - Orbit ("title orbit sigils"): while the maze generates (intro) and while
 *   it deconstructs (outro) the whole ring CIRCULATES along the viewport
 *   perimeter (resolveOrbitingEdgeStations). The phase is the timeline's
 *   ringSpinRad reinterpreted as laps (2 pi = one full lap of the path;
 *   positive = clockwise, the direction of increasing station id). The phase
 *   is a fraction of the path LENGTH (MAZER-VIS-061), so the ring moves at one
 *   constant on-screen speed, corners and long sides alike; a whole lap (the
 *   timelines return an exact 0 at rest) is exactly the fixed layout. The kite
 *   keeps pointing inward: its angle rises linearly with the perimeter
 *   coordinate (diagonal at a corner, pure edge normal at the midpoint, next
 *   corner diagonal), flush with the screen edge along the top/bottom sides
 *   and near-flush on the left/right sides, and never outside the viewport.
 * - Calm at rest: one slow breathing alpha (0.45-0.6 over 3.6 s), no per-marker
 *   sparkles. In reduced motion the markers are completely static (phase 0).
 * - Meaningful: a marker's BORDER brightens while it is a live wrap end, and flashes once (~120 ms) on a wrapped step,
 *   paired with the destination edge. The interior is never lit by those cues (there used to be a small instant core;
 *   it was removed in MAZER-VIS-033 because it showed a second, different fill next to the beam fill): the only colour
 *   inside a diamond is the beam fill below.
 * - Colour contract (playerColour.ts is the single source of truth, lane "edge stars smooth + rainbow"): the player's colour is
 *   the shifting rainbow today (the trail's own core colour at the trail head, same clock, same reduced-motion rule) and ONE
 *   setter (`setPlayerColour`) changes it everywhere. The diamond's BORDER, the colour INSIDE it (the fill) and everything
 *   fired out of it (the beams, the landing sparkles) all read it; none is a fixed green any more.
 *
 * Size (MAZER-VIS-038, anchor changed by MAZER-VIS-043): while the maze runs a diamond is EDGE_DIAMOND_REST_SCALE (50%) of
 * its full size. It is scaled about its OUTER tip (`anchorStationToOuterTip`), so the outer tip stays on the screen edge at every
 * size (50%, 100% and in between); the INNER tip, the point both beams attach to, moves inward as the diamond grows and back
 * outward as it shrinks (`resolveEdgeInnerTip(station, scale)`, recomputed every frame from the current scale). The diamond grows back
 * to 100% over the departure beam's flight (exactly full at contact) and shrinks again once it is empty after the arrival beam has
 * left (edgeBeamTimeline.ts); reduced motion keeps it at 50%, static.
 *
 * Placement (MAZER-VIS-043): every diamond sits fully inside the canvas with its OUTER tip touching the screen edge: the painted
 * bounding box (outline plus the miter join of a 1 px stroke, `resolveEdgeMarkerPaintedPolygon`) touches the edge exactly and
 * never crosses it. The four edge midpoints point straight in. The four corner diamonds point along the corner diagonal with their outer tip
 * ON the corner of the view, 0 px from BOTH edges (MAZER-VIS-044, edgeCornerAnchor.ts): in the actual corner at every viewport
 * size, scaled about that tip (a physically rounded display corner may trim the very tip: accepted by the owner).
 *
 * Lasers and fill (MAZER-VIS-030, VIS-038): on departure the player fires a beam out to ALL 8 diamonds; each diamond FILLS with
 * the player's colour from the exact instant its beam touches it (grows from its inner tip, full when the beam is fully
 * absorbed) and stays full through the deconstruct and the build; its size follows the fill (edgeStarMotion.ts: grows smoothly while it fills, shrinks smoothly while it drains). On arrival ALL 8 diamonds (orbiting, full, parked on
 * their rest stations once the build completes) fire a beam inward to the spawn tile and each DRAINS from the exact
 * instant its beam leaves it (empty when the beam has fully left). The colour is always anchored at the inner tip: it
 * fills from the inner tip outward and drains the other way round, leaving from the OUTER tip first, so the last of it
 * exits at the inner tip, toward where the laser shoots out. Each beam is a comet pulse (edgeBeamArt.ts:
 * bloom, tapered gradient body, bright pulsing head, a contact ripple), staggered by at most 60 ms across the ring and
 * derived only from the master laser clock (edgeBeamTimeline.ts), so menu and play can never disagree. Both ends of a beam
 * sit on the diamond's INNERMOST point (`resolveEdgeInnerTip`) and the beam stays attached there for the whole fill / the
 * whole drain. Reduced motion: no beam; the diamonds crossfade full/empty over the 200 ms crossfade.
 *
 * Geometry and state are pure; the draw helpers only call the tiny Graphics
 * surface declared below (so they are testable without Phaser). Colours come
 * exclusively from the trail palette (trailPalette.ts) and cyberArcadeMaterial tokens.
 */
import { isLegacyWrappedStepTransition } from '../legacy-runtime/legacyMaze';
import {
  resolveEdgeCornerBottomHiddenBand,
  resolveEdgeCornerBottomTipInset,
  resolveEdgeCornerMaxScale,
  resolveEdgeCornerTipInset
} from './edgeCornerAnchor';
import { resolvePlayerColour, resolveSharedBorderColor, resolveTrailPaletteBorderColor } from './playerColour';
import { MOTION_DURATION_MS, MOTION_LOOP_MS } from './motionScale';
import {
  EDGE_BEAM_FLIGHT_MS,
  EDGE_BEAM_PULSE_MS,
  EDGE_DIAMOND_REST_SCALE,
  inverseSmoothstep,
  resolveBeamHeadFromMaster,
  resolveBeamTimes,
  resolveEdgeBeamPulse,
  type EdgeBeamDirection
} from './edgeBeamTimeline';
import { resolveEdgeStarScale } from './edgeStarMotion';
import {
  drawBeamPulse,
  drawContactRipple,
  drawDiamondFill
} from './edgeBeamArt';
import { withCosmeticColours } from '../theme/cosmeticScope';

export type EdgeSide = 'top' | 'right' | 'bottom' | 'left';
export type EdgeStationId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface EdgeViewport {
  readonly width: number;
  readonly height: number;
  /** env(safe-area-inset-bottom), css px (viewportGeometry.ts). > 0: the bottom corners are rounded display corners (MAZER-VIS-056). */
  readonly safeAreaBottom?: number;
  /** env(safe-area-inset-left / right), css px: with a short landscape viewport they mark a notch-class phone whose top corners are rounded too (MAZER-VIS-057). */
  readonly safeAreaLeft?: number;
  readonly safeAreaRight?: number;
}

export interface EdgeStation {
  readonly id: EdgeStationId;
  readonly x: number;
  readonly y: number;
  /** Radians. Direction the kite points: inward along the edge normal (diagonal at corners). */
  readonly inwardAngle: number;
  /** The edge this station sits on; corners report their horizontal (top/bottom) edge. */
  readonly side: EdgeSide;
  readonly isCorner: boolean;
  /** Largest size (0..1 of full) this diamond may draw at; absent = 1. Set on corner stations of narrow phones (edgeCornerAnchor.ts). */
  readonly maxScale?: number;
}

export const EDGE_STATION_COUNT = 8;
/**
 * MAZER-VIS-055: the marker is a concave four-point star (the end-of-maze star's family), not a kite. Designed on a 44 x 32 grid
 * (outer tip at x 0, inner tip / beam port at x 44, shoulders at x 22, y +-16) and scaled to a 17.6 px length (the kite was 20):
 * the star's needle tips paint a longer stroke miter than the kite's, and 17.6 keeps its painted 45 degree corner reach inside the
 * 16 px header budget (LEGACY_HEADER_CORNER_DIAMOND_REACH_PX), so no header layout moves. Half length 8.8, half width 6.4.
 */
export const EDGE_MARKER_HALF_HEIGHT = 8.8;
export const EDGE_MARKER_HALF_WIDTH = (16 * 2 * EDGE_MARKER_HALF_HEIGHT) / 44;
export const EDGE_MARKER_STROKE_PX = 1;

export const EDGE_MARKER_IDLE_PERIOD_MS = MOTION_LOOP_MS.drift;
export const EDGE_MARKER_IDLE_ALPHA_MIN = 0.45;
export const EDGE_MARKER_IDLE_ALPHA_MAX = 0.6;
export const EDGE_MARKER_ENERGIZED_ALPHA = 0.95;
export const EDGE_MARKER_FLASH_MS = MOTION_DURATION_MS.fast;
export const SPAWN_LASER_POOF_SPARKLES = 6;

/** Station ids of the four edge midpoints. */
export const EDGE_MIDPOINT_STATION_ID: Readonly<Record<EdgeSide, EdgeStationId>> = Object.freeze({
  top: 1,
  right: 3,
  bottom: 5,
  left: 7
});

const STATION_IDS: ReadonlyArray<EdgeStationId> = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * The one perimeter parametrization every consumer shares: index/8 of the way
 * round the inset rectangle, clockwise from the top-left corner (even ids =
 * corners, odd ids = edge midpoints). teleportAnchorPose.ts's
 * anchorPerimeterPosition is the same arithmetic; tests/render/edgeMarkers
 * proves the two agree for every id.
 */
export const resolveEdgeStationPosition = (
  id: EdgeStationId,
  left: number,
  right: number,
  top: number,
  bottom: number
): { x: number; y: number } => {
  const perimeter = (id / EDGE_STATION_COUNT) * 4;
  if (perimeter < 1) {
    return { x: left + ((right - left) * perimeter), y: top };
  }
  if (perimeter < 2) {
    return { x: right, y: top + ((bottom - top) * (perimeter - 1)) };
  }
  if (perimeter < 3) {
    return { x: right - ((right - left) * (perimeter - 2)), y: bottom };
  }
  return { x: left, y: bottom - ((bottom - top) * (perimeter - 3)) };
};

const INWARD_ANGLE: Readonly<Record<EdgeStationId, number>> = Object.freeze({
  0: Math.PI / 4,
  1: Math.PI / 2,
  2: (3 * Math.PI) / 4,
  3: Math.PI,
  4: -(3 * Math.PI) / 4,
  5: -Math.PI / 2,
  6: -Math.PI / 4,
  7: 0
});

const STATION_SIDE: Readonly<Record<EdgeStationId, EdgeSide>> = Object.freeze({
  0: 'top',
  1: 'top',
  2: 'top',
  3: 'right',
  4: 'bottom',
  5: 'bottom',
  6: 'bottom',
  7: 'left'
});

/** Outward unit normal of the edge each station is flush with. */
const OUTWARD_NORMAL: Readonly<Record<EdgeSide, EdgePoint>> = Object.freeze({
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
});

/**
 * How far the PAINTED kite (outline plus the miter join of the stroke, `resolveEdgeMarkerPaintedPolygon`) at its REST orientation
 * reaches from its centre toward the outside of the edge it is flush with: 11 px for an edge midpoint, ~7.8 px for a 45 degree
 * corner kite. Centre = edge - this, so the painted tip touches the edge exactly.
 */
export const resolveEdgeStationNormalExtent = (id: EdgeStationId): number => (
  resolveEdgeKiteOutwardReach(INWARD_ANGLE[id], STATION_SIDE[id])
);

/** Painted reach of a kite pointing `inwardAngle` toward the outside of `side` (see resolveEdgeStationNormalExtent). */
const resolveEdgeKiteOutwardReach = (inwardAngle: number, side: EdgeSide): number => {
  const normal = OUTWARD_NORMAL[side];
  return resolveEdgeMarkerPaintedPolygon({ x: 0, y: 0, inwardAngle })
    .reduce((max, vertex) => Math.max(max, (vertex.x * normal.x) + (vertex.y * normal.y)), Number.NEGATIVE_INFINITY);
};

/**
 * The distance, on BOTH axes, from the screen corner to the CENTRE of a corner diamond (the inset of the perimeter rectangle the
 * stations are laid on): the painted outer tip sits resolveEdgeCornerTipInset(viewport) from both edges (0 px, or 16 px on a tall
 * rounded-display phone, MAZER-VIS-054) and a 45 degree corner kite paints ~7.8 px to either side of its centre, so ~7.8 px or
 * ~23.8 px. Without a viewport: the square-corner value.
 */
export const resolveEdgeCornerInset = (viewport?: EdgeViewport): number => (
  resolveEdgeCornerTipInset(viewport) + resolveEdgeKiteOutwardReach(INWARD_ANGLE[0], 'left')
);

/**
 * MAZER-VIS-056: the same distance for the two BOTTOM corner stars (ids 4 and 6): their painted outer tip sits
 * resolveEdgeCornerBottomTipInset(viewport) from both edges (0, or 20 px when the bottom corners are rounded display corners).
 */
export const resolveEdgeBottomCornerInset = (viewport?: EdgeViewport): number => (
  resolveEdgeCornerBottomTipInset(viewport) + resolveEdgeKiteOutwardReach(INWARD_ANGLE[0], 'left')
);

/**
 * MAZER-VIS-068: distance from the BOTTOM edge to the centre of a bottom corner star. The owner's iPhone 16 still cut the bottom
 * corner stars off in portrait (rotating or still) after VIS-056 placed them by a display-corner model, which headless runs show as
 * clear, so the model alone is not enough. The star's whole painted reach at any spin and its largest scale (EDGE_MARKER_MAX_EXTENT_PX
 * around the centre) stays above the bottom band the page reports as possibly hidden (resolveEdgeCornerBottomHiddenBand: the bottom
 * safe area, 0 when none is reported). With no band: the VIS-056 inset (resolveEdgeBottomCornerInset). The side inset is unchanged.
 */
export const resolveEdgeBottomCornerRise = (viewport?: EdgeViewport): number => {
  const band = resolveEdgeCornerBottomHiddenBand(viewport);
  const inset = resolveEdgeBottomCornerInset(viewport);
  return band > 0 ? Math.max(inset, band + EDGE_MARKER_MAX_EXTENT_PX) : inset;
};

/**
 * The extent of a canvas axis that is actually painted, in world (css) px: the backing store is `round(css * dpr)` device px and the
 * context is scaled by `dpr`, so the last visible world coordinate is `round(css * dpr) / dpr`. Equal to `css` at dpr 1 (integer sizes).
 */
export const resolveEdgeVisibleExtent = (cssPx: number, devicePixelRatio = 1): number => (
  devicePixelRatio > 0 && Number.isFinite(devicePixelRatio) && cssPx > 0
    ? Math.max(1, Math.round(cssPx * devicePixelRatio)) / devicePixelRatio
    : cssPx
);

/**
 * The eight stations for a viewport: pure function of width/height (and the device pixel ratio, which only decides where the
 * backing store ends). Along the edge: the shared perimeter parametrization of the rectangle inset by `resolveEdgeCornerInset()`
 * (the corner diamonds sit in the corners). Across it: flush, the painted outer tip exactly on the VISIBLE screen edge.
 */
export const resolveEdgeStations = (viewport: EdgeViewport, devicePixelRatio = 1): ReadonlyArray<EdgeStation> => {
  const width = resolveEdgeVisibleExtent(viewport.width, devicePixelRatio);
  const height = resolveEdgeVisibleExtent(viewport.height, devicePixelRatio);
  const inset = resolveEdgeCornerInset(viewport);
  const left = inset;
  const right = Math.max(left, width - inset);
  const top = inset;
  const bottom = Math.max(top, height - inset);
  // MAZER-VIS-056: the bottom corners have their own inset (rounded display corners); the midpoints keep the shared rectangle.
  const bottomInset = resolveEdgeBottomCornerInset(viewport);
  // MAZER-VIS-068: and their own rise above the bottom edge (clear of a reported bottom safe area).
  const bottomRise = resolveEdgeBottomCornerRise(viewport);
  return STATION_IDS.map((id) => {
    const along = resolveEdgeStationPosition(id, left, right, top, bottom);
    const side = STATION_SIDE[id];
    const extent = resolveEdgeStationNormalExtent(id);
    const isCorner = id % 2 === 0;
    const isBottomCorner = isCorner && side === 'bottom';
    const cornerMaxScale = isCorner ? resolveEdgeCornerMaxScale(viewport.width) : 1;
    // Corners sit ON the inset rectangle's corners (snug on the diagonal); midpoints are flush with their edge.
    const cornerX = isBottomCorner ? (along.x < width / 2 ? bottomInset : Math.max(bottomInset, width - bottomInset)) : along.x;
    const cornerY = isBottomCorner ? Math.max(top, height - bottomRise) : along.y;
    const x = isCorner ? cornerX : side === 'left' ? extent : side === 'right' ? width - extent : along.x;
    const y = isCorner ? cornerY : side === 'top' ? extent : side === 'bottom' ? height - extent : along.y;
    return {
      id,
      x,
      y,
      inwardAngle: INWARD_ANGLE[id],
      side,
      isCorner,
      ...(cornerMaxScale < 1 ? { maxScale: cornerMaxScale } : {})
    };
  });
};

export interface EdgePoint {
  readonly x: number;
  readonly y: number;
}

const ORBIT_SIDES: ReadonlyArray<EdgeSide> = ['top', 'right', 'bottom', 'left'];
/** Station steps in one full lap of the perimeter (one step = id -> id + 1). */
export const EDGE_ORBIT_STEPS_PER_LAP = EDGE_STATION_COUNT;
const ORBIT_SNAP_EPSILON = 1e-9;

const wrapStep = (value: number): number => ((value % EDGE_STATION_COUNT) + EDGE_STATION_COUNT) % EDGE_STATION_COUNT;

/**
 * The orbit PATH: the pose at perimeter coordinate s (station units, 0..8, 2 per side, clockwise from the top-left corner).
 * Whole s is the rest orientation of that station. Along the side it interpolates between the rest corner centres through the
 * rest midpoint (linear when both corners are the same distance from it), and its angle is (s + 1) pi / 4 -- the rest orientation at
 * every station, so the kite swings smoothly through the corners. Top/bottom: outer tip flush with the screen edge. Left/right: the
 * centre eases from the corner inset to the flush offset at the midpoint (the rest corners are inset along the left/right edges), so
 * the kite never leaves the viewport at any point of the path.
 */
const resolveOrbitPathPose = (
  viewport: EdgeViewport,
  id: EdgeStationId,
  s: number,
  restStations: ReadonlyArray<EdgeStation>
): EdgeStation => {
  const sideIndex = Math.min(3, Math.floor(s / 2));
  const side = ORBIT_SIDES[sideIndex] as EdgeSide;
  const u = (s - (2 * sideIndex)) / 2;
  const angle = ((s + 1) * Math.PI) / 4;
  const reach = resolveEdgeKiteOutwardReach(angle, side);
  // The four corners come from the REST layout (MAZER-VIS-056: the bottom corners may sit further in than the top ones), so the
  // path always runs through exactly where the corner stars rest.
  const topLeft = restStations[0] as EdgeStation;
  const topRight = restStations[2] as EdgeStation;
  const bottomRight = restStations[4] as EdgeStation;
  const bottomLeft = restStations[6] as EdgeStation;
  const cornerReach = resolveEdgeStationNormalExtent(0);
  // 0 at the side midpoint, 1 at its corners (squared: the kite stays flush for most of the side).
  const cornerBlend = ((2 * u) - 1) ** 2;
  // Along the side: from the start corner to the end corner, bent smoothly (4u(1 - u) is 1 at the midpoint, 0 at both corners) so
  // u = 1/2 lands exactly on the rest MIDPOINT even when the two corners are not the same distance from it (VIS-056 bottom inset).
  const midBend = 4 * u * (1 - u);
  const along = (from: number, to: number, mid: number): number => from + ((to - from) * u) + ((mid - ((from + to) / 2)) * midBend);
  let x: number;
  let y: number;
  if (side === 'top') {
    x = along(topLeft.x, topRight.x, (restStations[1] as EdgeStation).x);
    y = reach + ((topLeft.y - cornerReach) * cornerBlend);
  } else if (side === 'right') {
    const cornerGap = ((viewport.width - topRight.x) * (1 - u)) + ((viewport.width - bottomRight.x) * u);
    x = viewport.width - (reach + ((cornerGap - cornerReach) * cornerBlend));
    y = along(topRight.y, bottomRight.y, (restStations[3] as EdgeStation).y);
  } else if (side === 'bottom') {
    x = along(bottomRight.x, bottomLeft.x, (restStations[5] as EdgeStation).x);
    y = viewport.height - (reach + (((viewport.height - bottomRight.y) - cornerReach) * cornerBlend));
  } else {
    const cornerGap = (bottomLeft.x * (1 - u)) + (topLeft.x * u);
    x = reach + ((cornerGap - cornerReach) * cornerBlend);
    y = along(bottomLeft.y, topLeft.y, (restStations[7] as EdgeStation).y);
  }
  // A narrow phone caps the corner stars (edgeCornerAnchor.ts); the cap eases away as the star leaves the corner and back as it
  // arrives, so the size has no step at the first/last orbit frame.
  const cornerCap = (restStations[0] as EdgeStation).maxScale ?? 1;
  const maxScale = 1 - ((1 - cornerCap) * cornerBlend);
  return { id, x, y, inwardAngle: angle, side, isCorner: false, ...(maxScale < 1 ? { maxScale } : {}) };
};

/**
 * MAZER-VIS-061: arc-length table of the orbit path, so the ring moves at ONE constant on-screen speed all the way round. The old
 * phase mapping gave every half side the same time, so a star sped up ~2x as it turned a corner onto a long side of a phone. The
 * path is sampled ORBIT_ARC_SAMPLES_PER_SIDE times per side; the cumulative centre-path length is kept in one reused buffer and
 * rebuilt only when the viewport or the rest layout changes (no per-frame allocation once warm).
 */
export const ORBIT_ARC_SAMPLES_PER_SIDE = 64;
const ORBIT_ARC_SAMPLES = ORBIT_ARC_SAMPLES_PER_SIDE * 4;
const ORBIT_ARC_SAMPLES_PER_STEP = ORBIT_ARC_SAMPLES / EDGE_STATION_COUNT;
const orbitArcLength = new Float64Array(ORBIT_ARC_SAMPLES + 1);
const ORBIT_ARC_KEY_CAP = 2 + (EDGE_STATION_COUNT * 2);
const orbitArcKey = new Float64Array(ORBIT_ARC_KEY_CAP + 1).fill(Number.NaN);

/** Builds (or reuses) the arc-length table for this viewport + rest layout; returns the full path length in css px. */
const ensureOrbitArcTable = (viewport: EdgeViewport, restStations: ReadonlyArray<EdgeStation>): number => {
  const cap = (restStations[0] as EdgeStation).maxScale ?? 1;
  let same = orbitArcKey[0] === viewport.width && orbitArcKey[1] === viewport.height && orbitArcKey[ORBIT_ARC_KEY_CAP] === cap;
  for (let index = 0; same && index < EDGE_STATION_COUNT; index += 1) {
    const rest = restStations[index] as EdgeStation;
    same = orbitArcKey[2 + (index * 2)] === rest.x && orbitArcKey[3 + (index * 2)] === rest.y;
  }
  if (same) {
    return orbitArcLength[ORBIT_ARC_SAMPLES] as number;
  }
  orbitArcKey[0] = viewport.width;
  orbitArcKey[1] = viewport.height;
  orbitArcKey[ORBIT_ARC_KEY_CAP] = cap;
  for (let index = 0; index < EDGE_STATION_COUNT; index += 1) {
    const rest = restStations[index] as EdgeStation;
    orbitArcKey[2 + (index * 2)] = rest.x;
    orbitArcKey[3 + (index * 2)] = rest.y;
  }
  const first = resolveOrbitPathPose(viewport, 0, 0, restStations);
  let previous = first;
  orbitArcLength[0] = 0;
  for (let sample = 1; sample <= ORBIT_ARC_SAMPLES; sample += 1) {
    // The last sample is s = 8, back at the top-left corner: reuse the s = 0 pose so the loop closes exactly.
    const pose = sample === ORBIT_ARC_SAMPLES
      ? first
      : resolveOrbitPathPose(viewport, 0, sample / ORBIT_ARC_SAMPLES_PER_STEP, restStations);
    orbitArcLength[sample] = (orbitArcLength[sample - 1] as number) + Math.hypot(pose.x - previous.x, pose.y - previous.y);
    previous = pose;
  }
  return orbitArcLength[ORBIT_ARC_SAMPLES] as number;
};

/** Perimeter coordinate s (0..8) at centre-path length `arc` (0..path length) along the cached table. */
const orbitCoordinateAtArc = (arc: number): number => {
  let low = 0;
  let high = ORBIT_ARC_SAMPLES;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if ((orbitArcLength[middle] as number) <= arc) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const start = orbitArcLength[low] as number;
  const span = (orbitArcLength[high] as number) - start;
  const fraction = span > 0 ? Math.max(0, Math.min(1, (arc - start) / span)) : 0;
  return (low + fraction) / ORBIT_ARC_SAMPLES_PER_STEP;
};

/**
 * One diamond at ring phase `phaseRad` (radians; 2 pi = one full clockwise lap, negative = counter-clockwise). Pure function of the
 * viewport, the id and the phase. Phase 0 and every whole lap return the REST station of `id`, copied from `restStations`, so the end
 * of every timeline lands exactly on the fixed layout.
 *
 * MAZER-VIS-061: the phase is a fraction of the path LENGTH, not of the station count. Every diamond starts at its own rest station and
 * travels phase / 2pi of the whole path, so all eight move as one rigid ring at one constant on-screen speed through the corners and
 * along the long and short sides alike (the old station-step mapping gave each half side equal time: ~2x faster on the long sides of
 * a phone). Off whole laps a diamond is generally between stations; a whole lap is exactly the rest layout.
 */
export const resolveOrbitingEdgeStation = (
  viewport: EdgeViewport,
  id: EdgeStationId,
  phaseRad: number,
  restStations: ReadonlyArray<EdgeStation> = resolveEdgeStations(viewport)
): EdgeStation => {
  const laps = Number.isFinite(phaseRad) ? phaseRad / (Math.PI * 2) : 0;
  if (Math.abs(laps - Math.round(laps)) * EDGE_ORBIT_STEPS_PER_LAP < ORBIT_SNAP_EPSILON) {
    const rest = restStations[id] as EdgeStation;
    return { ...rest, id };
  }
  const pathLength = ensureOrbitArcTable(viewport, restStations);
  if (!(pathLength > 0)) {
    return resolveOrbitPathPose(viewport, id, wrapStep(id + (laps * EDGE_ORBIT_STEPS_PER_LAP)), restStations);
  }
  const start = orbitArcLength[id * ORBIT_ARC_SAMPLES_PER_STEP] as number;
  const arc = (start + ((laps - Math.floor(laps)) * pathLength)) % pathLength;
  return resolveOrbitPathPose(viewport, id, wrapStep(orbitCoordinateAtArc(arc)), restStations);
};

/** All 8 diamonds at ring phase `phaseRad` (see resolveOrbitingEdgeStation). Phase 0 = resolveEdgeStations. */
export const resolveOrbitingEdgeStations = (
  viewport: EdgeViewport,
  phaseRad: number
): ReadonlyArray<EdgeStation> => {
  const rest = resolveEdgeStations(viewport);
  return STATION_IDS.map((id) => resolveOrbitingEdgeStation(viewport, id, phaseRad, rest));
};

/** Exact inverse of resolveEdgeStations' width/height (from the right and bottom midpoints), or null. */
const inferRestViewport = (stations: ReadonlyArray<EdgeStation>): EdgeViewport | null => {
  const rightMid = stations.find((station) => station.id === EDGE_MIDPOINT_STATION_ID.right);
  const bottomMid = stations.find((station) => station.id === EDGE_MIDPOINT_STATION_ID.bottom);
  if (stations.length !== EDGE_STATION_COUNT || !rightMid || !bottomMid) {
    return null;
  }
  return {
    width: rightMid.x + resolveEdgeStationNormalExtent(EDGE_MIDPOINT_STATION_ID.right),
    height: bottomMid.y + resolveEdgeStationNormalExtent(EDGE_MIDPOINT_STATION_ID.bottom)
  };
};

const STAR_GRID_UNIT = (2 * EDGE_MARKER_HALF_HEIGHT) / 44;
/** Segments each of the four concave sides of the star is flattened into (Phaser paths and the fill clip are polygons). */
export const EDGE_STAR_CURVE_SEGMENTS = 8;
/**
 * The star's four quadratic sides on the design grid (x along the long axis from the OUTER tip, y across), starting at the INNER tip:
 * inner -> shoulder(+) -> outer -> shoulder(-) -> inner. Each entry is [control x, control y, end x, end y].
 */
const STAR_SIDES: ReadonlyArray<readonly [number, number, number, number]> = [
  [26, 3, 22, 16],
  [18, 3, 0, 0],
  [18, -3, 22, -16],
  [26, -3, 44, 0]
];

const placeOnStation = (
  station: Pick<EdgeStation, 'x' | 'y' | 'inwardAngle'>,
  scale: number
): ((along: number, across: number) => EdgePoint) => {
  const angle = station.inwardAngle;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vx = -uy;
  const vy = ux;
  return (along, across) => ({
    x: station.x + (ux * along * scale) + (vx * across * scale),
    y: station.y + (uy * along * scale) + (vy * across * scale)
  });
};

/** The 4 corner vertices of the star in screen space: 0 inner tip, 1 shoulder (+across), 2 outer tip, 3 shoulder (-across). */
export const resolveEdgeMarkerVertices = (
  station: Pick<EdgeStation, 'x' | 'y' | 'inwardAngle'>,
  scale = 1
): ReadonlyArray<EdgePoint> => {
  const at = placeOnStation(station, scale);
  return [
    at(EDGE_MARKER_HALF_HEIGHT, 0),
    at(0, EDGE_MARKER_HALF_WIDTH),
    at(-EDGE_MARKER_HALF_HEIGHT, 0),
    at(0, -EDGE_MARKER_HALF_WIDTH)
  ];
};

/**
 * The star's OUTLINE polygon in screen space (the four concave sides flattened, starting at the inner tip; vertices
 * 0, N, 2N, 3N are the inner tip, +shoulder, outer tip, -shoulder for N = EDGE_STAR_CURVE_SEGMENTS). This is what is stroked,
 * filled and clipped by the fill sweep.
 */
export const resolveEdgeMarkerOutline = (
  station: Pick<EdgeStation, 'x' | 'y' | 'inwardAngle'>,
  scale = 1
): ReadonlyArray<EdgePoint> => {
  const at = placeOnStation(station, scale);
  const grid = (x: number, y: number): EdgePoint => at(-EDGE_MARKER_HALF_HEIGHT + (x * STAR_GRID_UNIT), y * STAR_GRID_UNIT);
  const points: EdgePoint[] = [grid(44, 0)];
  let from: readonly [number, number] = [44, 0];
  STAR_SIDES.forEach(([cx, cy, ex, ey], side) => {
    for (let step = 1; step <= EDGE_STAR_CURVE_SEGMENTS; step += 1) {
      const t = step / EDGE_STAR_CURVE_SEGMENTS;
      const k = 1 - t;
      // The last point of the last side is the start again: do not repeat it.
      if (side === STAR_SIDES.length - 1 && step === EDGE_STAR_CURVE_SEGMENTS) {
        break;
      }
      points.push(grid(
        (k * k * from[0]) + (2 * k * t * cx) + (t * t * ex),
        (k * k * from[1]) + (2 * k * t * cy) + (t * t * ey)
      ));
    }
    from = [ex, ey];
  });
  return points;
};

/**
 * The station a diamond drawn at `scale` (0..1 of full size) occupies when it is scaled about its OUTER tip: the centre slides
 * along the long axis toward the outer tip so the outer-tip vertex never moves (it stays on the screen edge at every size). Draw the
 * kite with `resolveEdgeMarkerVertices(anchorStationToOuterTip(station, scale), scale)`. Scale 1 returns the station itself.
 */
export const anchorStationToOuterTip = <T extends Pick<EdgeStation, 'x' | 'y' | 'inwardAngle'>>(station: T, scale: number): T => {
  const level = Number.isFinite(scale) ? Math.max(0, Math.min(1, scale)) : 1;
  if (level === 1) {
    return station;
  }
  const shift = EDGE_MARKER_HALF_HEIGHT * (1 - level);
  return {
    ...station,
    x: station.x - (Math.cos(station.inwardAngle) * shift),
    y: station.y - (Math.sin(station.inwardAngle) * shift)
  };
};

/**
 * The diamond's INNERMOST point: the tip that faces the board, for a diamond drawn at `scale` (default 1 = full size) and anchored on
 * its outer tip (anchorStationToOuterTip). It moves inward as the diamond grows and outward as it shrinks, so beam endpoints must
 * pass the CURRENT scale: at scale 1 this is the full-size kite's vertex 0.
 */
export const resolveEdgeInnerTip = (station: Pick<EdgeStation, 'x' | 'y' | 'inwardAngle'>, scale = 1): EdgePoint => {
  const level = Number.isFinite(scale) ? Math.max(0, Math.min(1, scale)) : 1;
  const along = -EDGE_MARKER_HALF_HEIGHT + (2 * EDGE_MARKER_HALF_HEIGHT * level);
  return {
    x: station.x + (Math.cos(station.inwardAngle) * along),
    y: station.y + (Math.sin(station.inwardAngle) * along)
  };
};

/**
 * The outer boundary of the PAINTED star: the outline polygon with the stroke's miter joins (half a stroke outward on every edge,
 * adjacent offset edges intersected). Its bounding box is the diamond's true painted bounding box. `scale` is the same scale
 * as `resolveEdgeMarkerVertices`; the stroke stays EDGE_MARKER_STROKE_PX at every size.
 */
export const resolveEdgeMarkerPaintedPolygon = (
  station: Pick<EdgeStation, 'x' | 'y' | 'inwardAngle'>,
  scale = 1
): ReadonlyArray<EdgePoint> => {
  const vertices = resolveEdgeMarkerOutline(station, scale);
  const half = EDGE_MARKER_STROKE_PX / 2;
  const area = vertices.reduce((sum, a, index) => {
    const b = vertices[(index + 1) % vertices.length] as EdgePoint;
    return sum + ((a.x * b.y) - (b.x * a.y));
  }, 0);
  const sign = area >= 0 ? 1 : -1;
  const outwardNormal = (from: EdgePoint, to: EdgePoint): EdgePoint => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: (sign * dy) / length, y: (-sign * dx) / length };
  };
  return vertices.map((vertex, index) => {
    const previous = vertices[(index + vertices.length - 1) % vertices.length] as EdgePoint;
    const next = vertices[(index + 1) % vertices.length] as EdgePoint;
    const n1 = outwardNormal(previous, vertex);
    const n2 = outwardNormal(vertex, next);
    const denominator = 1 + (n1.x * n2.x) + (n1.y * n2.y);
    if (denominator < 0.02) {
      return { x: vertex.x + (n1.x * half), y: vertex.y + (n1.y * half) };
    }
    return { x: vertex.x + (((n1.x + n2.x) * half) / denominator), y: vertex.y + (((n1.y + n2.y) * half) / denominator) };
  });
};

/**
 * How far the miter join of the stroke at the OUTER (and inner) tip paints beyond the vertex, along the long axis (measured on the
 * flattened outline, so it is exactly what the canvas paints: Canvas strokes join with 'miter' (limit 10) by default and Phaser
 * Graphics does not change it; the tip's half-angle is ~12 degrees, miter ratio ~4.8).
 */
export const EDGE_MARKER_TIP_PAINT_PX = resolveEdgeMarkerPaintedPolygon({ x: 0, y: 0, inwardAngle: 0 })
  .reduce((max, vertex) => Math.max(max, -vertex.x), Number.NEGATIVE_INFINITY) - EDGE_MARKER_HALF_HEIGHT;

/** Farthest any painted pixel (outline plus the miter tip) can be from the station centre, in any rotation. */
export const EDGE_MARKER_MAX_EXTENT_PX = EDGE_MARKER_HALF_HEIGHT + EDGE_MARKER_TIP_PAINT_PX;

export interface EdgeMarkerState {
  readonly id: EdgeStationId;
  readonly alpha: number;
  readonly energized: boolean;
  /** 0..1 lighting strength (1 for a plain energized marker; ring lighting ramps/fades). */
  readonly energy: number;
  /** Ring orbit phase in radians, 2 pi = one lap (0 at rest and in reduced motion). Despite the name the kite no longer spins about itself. */
  readonly spinRad: number;
  /** 1 at the instant of a wrap flash, falling to 0 over EDGE_MARKER_FLASH_MS. */
  readonly flash: number;
  readonly hidden: boolean;
  /**
   * How full the diamond's interior is, 0..1 (MAZER-VIS-030). Optional: absent = empty (a standalone icon, the rest ring).
   * The interior is the player's colour.
   */
  readonly fill?: number;
  /** Reduced motion: the interior crossfades by alpha instead of sweeping. */
  readonly fillCrossfade?: boolean;
  /**
   * Size of the diamond as a fraction of full size (MAZER-VIS-038), scaled about its OUTER tip (MAZER-VIS-043). Optional: absent = 1
   * (a standalone icon such as the Guide legend); the board sets it from `resolveEdgeRingScales`.
   */
  readonly scale?: number;
  /**
   * The border colour: the live trail colour (`resolveTrailPaletteBorderColor`). Optional only so a standalone
   * icon (the Guide legend) can omit it and get the static trail gradient's start colour; the board always sets it.
   */
  readonly borderColor?: number;
  /** The colour inside the diamond (the fill): the player colour. Optional: absent = the border colour. */
  readonly fillColor?: number;
}

export interface EdgeWrapFlash {
  readonly ids: ReadonlyArray<number>;
  readonly startedAtMs: number;
}

export interface EdgeMarkerStateInput {
  readonly timeMs: number;
  readonly reducedMotion: boolean;
  readonly energizedIds?: ReadonlySet<number>;
  /** Per-station interior fill 0..1 indexed by id (resolveEdgeRingFills). */
  readonly fills?: ReadonlyArray<number>;
  /** Reduced motion: the interior crossfades by alpha instead of sweeping. */
  readonly fillCrossfade?: boolean;
  /** Per-station size 0..1 indexed by id (resolveEdgeRingScales). Absent = full size (1). */
  readonly scales?: ReadonlyArray<number>;
  /** Ring orbit phase in radians (timeline ringSpinRad: 2 pi = one lap, positive = clockwise). */
  readonly spinRad?: number;
  readonly flash?: EdgeWrapFlash | null;
  /** Stations whose kite must not draw (e.g. the teleport shell is occupying it). */
  readonly hiddenIds?: ReadonlySet<number>;
  /**
   * Physical distance, in tiles, of the player's end of the trail along the trail (the same distance the trail's own
   * colour phase uses). The border colour is the trail colour there. 0 when there is no trail (menu).
   */
  readonly trailHeadDistanceTiles?: number;
  /** The trail's own (pausable) animation clock, so the border and the trail share one phase; defaults to `timeMs`. */
  readonly trailTimeMs?: number;
  /**
   * False (Trail Shine off) and reduced motion both stop the trail's sheen band and swell in the border colour. Neither
   * freezes the hue: the scene passes `trailTimeMs` 0 for the Trail Shine OFF static trail, and the colour clock otherwise.
   */
  readonly trailAnimated?: boolean;
}

/** Border colour of a marker with no explicit `borderColor`: the player colour at the trail's start (read per draw, so a new player colour shows). */
const resolveStaticBorderColor = (): number => resolveTrailPaletteBorderColor(0, 0, true);

export const resolveEdgeMarkerIdleAlpha = (timeMs: number, reducedMotion: boolean): number => {
  const middle = (EDGE_MARKER_IDLE_ALPHA_MIN + EDGE_MARKER_IDLE_ALPHA_MAX) / 2;
  if (reducedMotion || !Number.isFinite(timeMs)) {
    return middle;
  }
  const breath = 0.5 - (0.5 * Math.cos((timeMs / EDGE_MARKER_IDLE_PERIOD_MS) * Math.PI * 2));
  return EDGE_MARKER_IDLE_ALPHA_MIN + ((EDGE_MARKER_IDLE_ALPHA_MAX - EDGE_MARKER_IDLE_ALPHA_MIN) * breath);
};

const clampUnit = (value: number): number => (
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
);

export const resolveEdgeMarkerStates = (input: EdgeMarkerStateInput): ReadonlyArray<EdgeMarkerState> => {
  const idleAlpha = resolveEdgeMarkerIdleAlpha(input.timeMs, input.reducedMotion);
  // The shared border colour (trailPalette.ts): the end star's border calls the same function (MAZER-VIS-053).
  const borderColor = resolveSharedBorderColor(
    { distanceTiles: input.trailHeadDistanceTiles, timeMs: input.trailTimeMs, animated: input.trailAnimated },
    input.timeMs,
    input.reducedMotion
  );
  const flashProgress = !input.reducedMotion && input.flash
    ? Math.max(0, Math.min(1, (input.timeMs - input.flash.startedAtMs) / EDGE_MARKER_FLASH_MS))
    : 1;
  const flashLive = !input.reducedMotion && input.flash != null && flashProgress < 1 && input.timeMs >= input.flash.startedAtMs;
  return STATION_IDS.map((id) => {
    // Reduced motion: nothing animates, so nothing lights up either.
    // Reduced motion: nothing pulses, so the wrap-end lighting and the flash stay off; the interior fill is a state
    // crossfade (MOTION_REDUCED_MS.crossfade) and is allowed.
    const fill = clampUnit(input.fills?.[id] ?? 0);
    const energy = input.reducedMotion ? 0 : ((input.energizedIds?.has(id) ?? false) ? 1 : 0);
    const energized = energy > 0;
    const flash = flashLive && (input.flash?.ids.includes(id) ?? false) ? 1 - flashProgress : 0;
    // The crossfade interior carries its own alpha; the border does not brighten with it (reduced motion: nothing pulses).
    const brighten = Math.max(energy, input.fillCrossfade === true ? 0 : fill, flash > 0 ? 1 : 0);
    return {
      id,
      alpha: brighten > 0
        ? idleAlpha + ((EDGE_MARKER_ENERGIZED_ALPHA - idleAlpha) * brighten)
        : idleAlpha,
      energized,
      energy,
      fill,
      fillCrossfade: input.fillCrossfade === true,
      scale: input.scales?.[id] === undefined ? 1 : clampUnit(input.scales[id] as number),
      spinRad: input.reducedMotion || !Number.isFinite(input.spinRad) ? 0 : (input.spinRad ?? 0),
      flash,
      hidden: input.hiddenIds?.has(id) ?? false,
      borderColor,
      fillColor: borderColor
    };
  });
};

/**
 * Wrapped step -> the two paired edge midpoint stations to flash (exit edge
 * and the destination edge it re-enters from). Null for ordinary steps.
 */
export const resolveWrapFlashStationIds = (
  from: EdgePoint,
  to: EdgePoint,
  maze: { readonly width: number; readonly height: number }
): { sourceId: EdgeStationId; destinationId: EdgeStationId } | null => {
  if (!isLegacyWrappedStepTransition(from, to)) {
    return null;
  }
  const lastX = maze.width - 1;
  const lastY = maze.height - 1;
  if (from.x === 0 && to.x === lastX && from.y === to.y) {
    return { sourceId: EDGE_MIDPOINT_STATION_ID.left, destinationId: EDGE_MIDPOINT_STATION_ID.right };
  }
  if (from.x === lastX && to.x === 0 && from.y === to.y) {
    return { sourceId: EDGE_MIDPOINT_STATION_ID.right, destinationId: EDGE_MIDPOINT_STATION_ID.left };
  }
  if (from.y === 0 && to.y === lastY && from.x === to.x) {
    return { sourceId: EDGE_MIDPOINT_STATION_ID.top, destinationId: EDGE_MIDPOINT_STATION_ID.bottom };
  }
  if (from.y === lastY && to.y === 0 && from.x === to.x) {
    return { sourceId: EDGE_MIDPOINT_STATION_ID.bottom, destinationId: EDGE_MIDPOINT_STATION_ID.top };
  }
  return null;
};

/** Which edge midpoints belong to a live wrap pair, from the dock-owning border cells. */
export const resolveWrapEndStationIds = (
  dockCellKeys: Iterable<string>,
  maze: { readonly width: number; readonly height: number }
): ReadonlySet<number> => {
  const ids = new Set<number>();
  for (const key of dockCellKeys) {
    const [xText, yText] = key.split(',');
    const x = Number(xText);
    const y = Number(yText);
    if (x === 0) {
      ids.add(EDGE_MIDPOINT_STATION_ID.left);
    }
    if (x === maze.width - 1) {
      ids.add(EDGE_MIDPOINT_STATION_ID.right);
    }
    if (y === 0) {
      ids.add(EDGE_MIDPOINT_STATION_ID.top);
    }
    if (y === maze.height - 1) {
      ids.add(EDGE_MIDPOINT_STATION_ID.bottom);
    }
  }
  return ids;
};

/** The Phaser Graphics surface the draw helpers need (so tests can supply a recorder). */
export interface EdgeGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  beginPath(): unknown;
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  closePath(): unknown;
  fillPath(): unknown;
  strokePath(): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown;
}

const tracePolygon = (graphics: EdgeGraphics, vertices: ReadonlyArray<EdgePoint>): void => {
  graphics.beginPath();
  vertices.forEach((vertex, index) => {
    if (index === 0) {
      graphics.moveTo(vertex.x, vertex.y);
    } else {
      graphics.lineTo(vertex.x, vertex.y);
    }
  });
  graphics.closePath();
};

const drawEdgeMarkerImpl = (
  graphics: EdgeGraphics,
  station: EdgeStation,
  state: EdgeMarkerState
): void => {
  if (state.hidden) {
    return;
  }
  const scale = Math.min(state.scale ?? 1, station.maxScale ?? 1);
  const anchored = anchorStationToOuterTip(station, scale);
  const outline = resolveEdgeMarkerOutline(anchored, scale);
  if ((state.fill ?? 0) > 0) {
    drawDiamondFill(graphics, {
      center: { x: anchored.x, y: anchored.y },
      colour: state.fillColor ?? state.borderColor ?? resolveStaticBorderColor(),
      crossfade: state.fillCrossfade === true,
      fill: state.fill ?? 0,
      halfHeight: EDGE_MARKER_HALF_HEIGHT * scale,
      inwardAngle: station.inwardAngle,
      vertices: outline
    });
  }
  tracePolygon(graphics, outline);
  graphics.lineStyle(
    EDGE_MARKER_STROKE_PX,
    state.borderColor ?? resolveStaticBorderColor(),
    state.alpha
  );
  graphics.strokePath();
};

/**
 * `stations` is the REST layout (resolveEdgeStations). Each diamond is placed
 * on its orbit at its state's phase (state.spinRad); phase 0 draws it on its
 * rest station untouched.
 */
const drawEdgeMarkersImpl = (
  graphics: EdgeGraphics,
  stations: ReadonlyArray<EdgeStation>,
  states: ReadonlyArray<EdgeMarkerState>
): void => {
  const viewport = states.some((state) => state.spinRad !== 0) ? inferRestViewport(stations) : null;
  stations.forEach((station) => {
    const state = states.find((candidate) => candidate.id === station.id);
    if (state) {
      const placed = viewport !== null && state.spinRad !== 0
        ? resolveOrbitingEdgeStation(viewport, station.id, state.spinRad, stations)
        : station;
      drawEdgeMarker(graphics, placed, state);
    }
  });
};

export interface EdgeRingLifecycle {
  /** inward = arrival (diamonds -> spawn tile, they DRAIN), outward = departure (player -> diamonds, they FILL). */
  readonly direction: EdgeBeamDirection;
  /** Master laser clock in ms (timeline `laserClockMs`); negative before the beams leave. */
  readonly clockMs: number;
  /**
   * Timeline `ringFill`: how full the ring is before any beam leaves (inward: 1 after a deconstruct, charging on a cold
   * start) / the reduced-motion crossfade level (both directions). 0 for a full-motion outward lifecycle.
   */
  readonly ringFill: number;
  /** Reduced motion: no beams, the whole ring crossfades (`ringFill` is the crossfade level). */
  readonly crossfade?: boolean;
}

/**
 * Per-station interior fill (index = station id), derived from each beam's own contact/release instant
 * (edgeBeamTimeline.ts):
 * - departure (outward): diamond i fills from EXACTLY its beam's contact, 0 -> 1 over EDGE_BEAM_PULSE_MS, and stays full;
 * - arrival (inward): diamond i is at `ringFill` (full after a deconstruct) until EXACTLY its beam leaves, then drains
 *   1 -> 0 over EDGE_BEAM_PULSE_MS and stays empty;
 * - reduced motion (`crossfade`): all 8 equal `ringFill`, no per-beam timing.
 * Null lifecycle = at rest = all zero.
 */
/** One star's interior fill (see `resolveEdgeRingFills`); allocation-free. */
export const resolveEdgeRingFill = (
  lifecycle: EdgeRingLifecycle | null,
  index: number,
  count = EDGE_STATION_COUNT
): number => {
  if (lifecycle === null) {
    return 0;
  }
  const ring = clampUnit(lifecycle.ringFill);
  if (lifecycle.crossfade === true) {
    return ring;
  }
  const pulse = resolveEdgeBeamPulse(lifecycle.direction, lifecycle.clockMs, index, count, ring);
  return lifecycle.direction === 'outward' ? Math.max(ring, pulse.diamondFill) : pulse.diamondFill;
};

export const resolveEdgeRingFills = (
  lifecycle: EdgeRingLifecycle | null,
  count = EDGE_STATION_COUNT
): ReadonlyArray<number> => Array.from({ length: count }, (_, index) => resolveEdgeRingFill(lifecycle, index, count));

/**
 * Per-station size 0..1 (index = station id): the size FOLLOWS THE FILL (edgeStarMotion.ts `resolveEdgeStarScale`): rest size when
 * the star is empty, growing smoothly while it fills, full while it is full (the whole orbit between the fill and the drain, so a
 * full star never shrinks mid-orbit), shrinking smoothly while it drains back to rest. Rest size and fill 0 are the same size, so
 * the ring enters and leaves its lifecycle with no size jump (the older hold at 100% popped on the first and the last frame).
 * Null lifecycle (at rest, the maze is running) and the reduced-motion crossfade lifecycle both give the fixed rest size
 * EDGE_DIAMOND_REST_SCALE: reduced motion keeps the diamonds static at 50% (the same size the maze runs at) and only
 * crossfades the interior colour.
 */
export const resolveEdgeRingScales = (
  lifecycle: EdgeRingLifecycle | null,
  count = EDGE_STATION_COUNT
): ReadonlyArray<number> => Array.from({ length: count }, (_, index) => (
  lifecycle === null || lifecycle.crossfade === true
    ? EDGE_DIAMOND_REST_SCALE
    : resolveEdgeStarScale(resolveEdgeRingFill(lifecycle, index, count))
));

export interface SpawnSparkle {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly alpha: number;
}

/**
 * Head position 0..1 of beam `index` of `count`, derived ONLY from the master timeline's laserProgress. Beams are
 * staggered by at most INTRO_BEAM_STAGGER_MS across the ring and every head still lands exactly when the master laser
 * does. (The shipped flight, unchanged; edgeBeamTimeline.ts owns it.)
 */
export const resolveEdgeBeamProgress = (laserProgress: number, index: number, count = EDGE_STATION_COUNT): number => (
  resolveBeamHeadFromMaster(laserProgress, index, count)
);

export type { EdgeBeamDirection };

export interface EdgeBeamsInput {
  /**
   * The REST layout (resolveEdgeStations), moved to each diamond's current orbit position by `spinRad`; or stations that are
   * already orbited, with `spinRad` absent / 0.
   */
  readonly stations: ReadonlyArray<EdgeStation>;
  /**
   * The ring phase this frame (the timeline's ringSpinRad, the value the diamonds are drawn at). MAZER-VIS-061: the outro ring
   * starts to orbit at the first beam contact, while the beams are still attached, so each beam end follows its diamond's
   * CURRENT position. Absent / 0: `stations` are used as given.
   */
  readonly spinRad?: number;
  /** The maze spawn tile (arrival) or the player (departure), in screen space. */
  readonly focus: EdgePoint;
  /** inward: diamonds -> focus (build). outward: focus -> diamonds (deconstruct). */
  readonly direction: EdgeBeamDirection;
  /** introTimeline laserProgress (intro) or OutroState.laserProgress (outro), 0..1. Only used when `clockMs` is absent. */
  readonly laserProgress: number;
  /** introTimeline spawnPop, 0..1 (inward only). */
  readonly spawnPop: number;
  /** Master laser clock in ms (same clock as the ring fill). Derived from `laserProgress` when absent. */
  readonly clockMs?: number;
  /** Backing scale, so line ends and widths land on whole device pixels. Default 1. */
  readonly devicePixelRatio?: number;
  /** The player colour the beams, the contact ripple and the landing sparkles are drawn in (playerColour.ts). Absent: the colour at the trail start. */
  readonly playerColour?: number;
}

export interface EdgeBeam {
  readonly id: EdgeStationId;
  /** Path source and target. The diamond end is the diamond's INNERMOST point (its inner tip), both directions. */
  readonly from: EdgePoint;
  readonly to: EdgePoint;
  /** The head position on the path (`progress` along from -> to). */
  readonly tip: EdgePoint;
  /** The tail position on the path (`tail` along from -> to). */
  readonly tailPoint: EdgePoint;
  readonly progress: number;
  readonly tail: number;
  /** The contact point: the diamond's inner tip at its CURRENT size (the same point as the diamond end of the path). */
  readonly contact: EdgePoint;
  /** True while any part of the beam is on the path (head has left, tail has not yet run in). */
  readonly firing: boolean;
  /** True while the tail is still held at the source: the diamond is still filling (departure) / draining (arrival). */
  readonly connected: boolean;
  /** 0..1 over the fill/drain window of this diamond (the contact ripple clock); 0 outside it. */
  readonly rippleProgress: number;
}

export interface EdgeBeamsGeometry {
  readonly beams: ReadonlyArray<EdgeBeam>;
  readonly firingIds: ReadonlySet<number>;
  /** The 6-sparkle poof where the inward beams converge (empty otherwise). */
  readonly sparkles: ReadonlyArray<SpawnSparkle>;
}

const lerpPoint = (a: EdgePoint, b: EdgePoint, t: number): EdgePoint => ({ x: a.x + ((b.x - a.x) * t), y: a.y + ((b.y - a.y) * t) });

const resolveBeamClockMs = (input: EdgeBeamsInput): number => (
  input.clockMs !== undefined && Number.isFinite(input.clockMs)
    ? input.clockMs
    : EDGE_BEAM_FLIGHT_MS * inverseSmoothstep(Math.max(0, Math.min(1, input.laserProgress)))
);

export const resolveEdgeBeams = (input: EdgeBeamsInput): EdgeBeamsGeometry => {
  const laserProgress = Math.max(0, Math.min(1, input.laserProgress));
  const clockMs = resolveBeamClockMs(input);
  const pop = Math.max(0, Math.min(1, input.spawnPop));
  const firingIds = new Set<number>();
  const spinRad = input.spinRad !== undefined && Number.isFinite(input.spinRad) ? input.spinRad : 0;
  const viewport = spinRad !== 0 ? inferRestViewport(input.stations) : null;
  const stations = viewport !== null
    ? input.stations.map((station) => resolveOrbitingEdgeStation(viewport, station.id, spinRad, input.stations))
    : input.stations;
  const count = stations.length;
  const beams = stations.map((station, index): EdgeBeam => {
    const pulse = resolveEdgeBeamPulse(input.direction, clockMs, index, count);
    // The diamond grows/shrinks about its OUTER tip with its fill (edgeStarMotion.ts), so the inner tip moves: follow the diamond's
    // current size every frame (the same size `resolveEdgeRingScales` draws it at).
    const scale = Math.min(resolveEdgeStarScale(pulse.diamondFill), station.maxScale ?? 1);
    const contact = resolveEdgeInnerTip(station, scale);
    const from = input.direction === 'inward' ? contact : input.focus;
    const to = input.direction === 'inward' ? input.focus : contact;
    const times = resolveBeamTimes(index, count);
    const windowStart = input.direction === 'inward' ? times.launchMs : times.contactMs;
    const rippleProgress = clockMs > windowStart && clockMs < windowStart + EDGE_BEAM_PULSE_MS
      ? (clockMs - windowStart) / EDGE_BEAM_PULSE_MS
      : 0;
    if (pulse.visible) {
      firingIds.add(station.id);
    }
    return {
      id: station.id,
      from,
      to,
      tip: lerpPoint(from, to, pulse.head),
      tailPoint: lerpPoint(from, to, pulse.tail),
      progress: pulse.head,
      tail: pulse.tail,
      contact,
      firing: pulse.visible,
      connected: pulse.connected,
      rippleProgress
    };
  });
  const sparkles: SpawnSparkle[] = [];
  if (input.direction === 'inward' && laserProgress >= 1 && pop > 0 && pop < 1) {
    const radius = 3 + (pop * 12);
    for (let index = 0; index < SPAWN_LASER_POOF_SPARKLES; index += 1) {
      const angle = ((index / SPAWN_LASER_POOF_SPARKLES) * Math.PI * 2) + (pop * 0.6);
      sparkles.push({
        x: input.focus.x + (Math.cos(angle) * radius),
        y: input.focus.y + (Math.sin(angle) * radius),
        size: Math.max(1, 3.5 * (1 - pop)),
        alpha: 1 - pop
      });
    }
  }
  return { beams, firingIds, sparkles };
};

/** One beam per diamond (bloom + ramped body + flowing stream + pulsing head + contact ripple), plus the landing poof. */
const drawEdgeBeamsImpl = (graphics: EdgeGraphics, input: EdgeBeamsInput): EdgeBeamsGeometry => {
  const geometry = resolveEdgeBeams(input);
  const dpr = input.devicePixelRatio ?? 1;
  const clockMs = resolveBeamClockMs(input);
  const playerColour = input.playerColour ?? resolvePlayerColour(null, 0, true);
  for (const beam of geometry.beams) {
    if (!beam.firing) {
      continue;
    }
    drawBeamPulse(graphics, {
      clockMs,
      colour: playerColour,
      devicePixelRatio: dpr,
      headPoint: beam.tip,
      tailPoint: beam.tailPoint,
      // An outgoing beam is attached to its diamond's tip until the drain is over: glow there.
      tailPort: input.direction === 'inward' && beam.connected
    });
    drawContactRipple(graphics, beam.contact, beam.rippleProgress, dpr, playerColour);
  }
  geometry.sparkles.forEach((sparkle) => {
    graphics.lineStyle(1, playerColour, sparkle.alpha);
    graphics.lineBetween(sparkle.x - sparkle.size, sparkle.y, sparkle.x + sparkle.size, sparkle.y);
    graphics.lineBetween(sparkle.x, sparkle.y - sparkle.size, sparkle.x, sparkle.y + sparkle.size);
  });
  return geometry;
};

// MAZER-UI-102: cosmetics keep their own colours under dark mode (src/theme/cosmeticScope.ts).
export const drawEdgeMarker: typeof drawEdgeMarkerImpl = (...args: Parameters<typeof drawEdgeMarkerImpl>) => withCosmeticColours(() => drawEdgeMarkerImpl(...args));
export const drawEdgeMarkers: typeof drawEdgeMarkersImpl = (...args: Parameters<typeof drawEdgeMarkersImpl>) => withCosmeticColours(() => drawEdgeMarkersImpl(...args));
export const drawEdgeBeams: typeof drawEdgeBeamsImpl = (...args: Parameters<typeof drawEdgeBeamsImpl>) => withCosmeticColours(() => drawEdgeBeamsImpl(...args));
