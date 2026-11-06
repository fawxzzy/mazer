/**
 * Edge markers and the single spawn laser.
 *
 * Eight procedural kites sit on the viewport perimeter (4 corners + 4 edge
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
 *   ringSpinRad reinterpreted as laps (2 pi = one full lap = 8 station steps;
 *   positive = clockwise, the direction of increasing station id). Diamond i
 *   travels the same perimeter parametrization as the rest stations, so after
 *   a whole number of steps it sits EXACTLY on station i+k and a whole lap (the
 *   timelines return an exact 0 at rest) is exactly the fixed layout. The kite
 *   keeps pointing inward: its angle rises linearly with the perimeter
 *   coordinate (diagonal at a corner, pure edge normal at the midpoint, next
 *   corner diagonal), flush with the screen edge along the top/bottom sides
 *   and near-flush on the left/right sides, and never outside the viewport.
 * - Calm at rest: one slow breathing alpha (0.45-0.6 over 3.6 s), no per-marker
 *   sparkles. In reduced motion the markers are completely static (phase 0).
 * - Meaningful: a marker lights up (mint core) while it is a live wrap end or
 *   the spawn laser's emitter, and flashes once (~120 ms) on a wrapped step,
 *   paired with the destination edge.
 *
 * Lasers: on arrival ALL 8 diamonds (orbiting and lit through the whole build, parked on their
 * rest stations once it completes) fire a beam inward to the spawn tile; on
 * departure the player fires a beam out to ALL 8 diamonds. Each beam is a 3 px
 * glow + 1 px core + head dot, staggered by at most 60 ms across the ring and
 * derived only from the master timeline's laserProgress, so menu and play can
 * never disagree. A diamond brightens while its beam is firing.
 *
 * Geometry and state are pure; the draw helpers only call the tiny Graphics
 * surface declared below (so they are testable without Phaser). Colours come
 * exclusively from cyberArcadeMaterial tokens.
 */
import { isLegacyWrappedStepTransition } from '../legacy-runtime/legacyMaze';
import { cyberArcadeMaterial } from './cyberArcadeMaterial';
import { INTRO_BEAM_STAGGER_MS, INTRO_LASER_MS } from './introTimeline';

export type EdgeSide = 'top' | 'right' | 'bottom' | 'left';
export type EdgeStationId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface EdgeViewport {
  readonly width: number;
  readonly height: number;
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
}

export const EDGE_STATION_COUNT = 8;
export const EDGE_MARKER_HALF_WIDTH = 7;
export const EDGE_MARKER_HALF_HEIGHT = 10;
export const EDGE_MARKER_STROKE_PX = 1;
export const EDGE_MARKER_MIN_INSET_PX = 12;
export const EDGE_MARKER_IDLE_PERIOD_MS = 3600;
export const EDGE_MARKER_IDLE_ALPHA_MIN = 0.45;
export const EDGE_MARKER_IDLE_ALPHA_MAX = 0.6;
export const EDGE_MARKER_ENERGIZED_ALPHA = 0.95;
export const EDGE_MARKER_FLASH_MS = 120;
export const SPAWN_LASER_GLOW_PX = 3;
export const SPAWN_LASER_CORE_PX = 1;
export const SPAWN_LASER_POOF_SPARKLES = 6;
export const EDGE_BEAM_ALPHA = 0.95;

/** Station ids of the four edge midpoints. */
export const EDGE_MIDPOINT_STATION_ID: Readonly<Record<EdgeSide, EdgeStationId>> = Object.freeze({
  top: 1,
  right: 3,
  bottom: 5,
  left: 7
});

const STATION_IDS: ReadonlyArray<EdgeStationId> = [0, 1, 2, 3, 4, 5, 6, 7];

/** Farthest any kite vertex (or its stroke) can be from the station centre, in any rotation. */
export const EDGE_MARKER_MAX_EXTENT_PX = EDGE_MARKER_HALF_HEIGHT + (EDGE_MARKER_STROKE_PX / 2);

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
 * How far the kite (at its REST orientation, plus half a stroke) reaches from
 * its centre toward the outside of the edge it is flush with. 10.5 px for an
 * edge midpoint, ~7.57 px for a 45 degree corner kite.
 */
export const resolveEdgeStationNormalExtent = (id: EdgeStationId): number => (
  resolveEdgeKiteOutwardReach(INWARD_ANGLE[id], STATION_SIDE[id])
);

/** Reach (plus half a stroke) of a kite pointing `inwardAngle` toward the outside of `side`. */
const resolveEdgeKiteOutwardReach = (inwardAngle: number, side: EdgeSide): number => {
  const normal = OUTWARD_NORMAL[side];
  const reach = resolveEdgeMarkerVertices({ x: 0, y: 0, inwardAngle })
    .reduce((max, vertex) => Math.max(max, (vertex.x * normal.x) + (vertex.y * normal.y)), 0);
  return reach + (EDGE_MARKER_STROKE_PX / 2);
};

/**
 * The eight stations for a viewport: pure function of width/height only. Along
 * the edge: the shared perimeter parametrization of the rectangle inset by
 * EDGE_MARKER_MIN_INSET_PX. Across it: flush (outer tip on the screen edge).
 */
export const resolveEdgeStations = (viewport: EdgeViewport): ReadonlyArray<EdgeStation> => {
  const inset = EDGE_MARKER_MIN_INSET_PX;
  const left = inset;
  const right = Math.max(left, viewport.width - inset);
  const top = inset;
  const bottom = Math.max(top, viewport.height - inset);
  return STATION_IDS.map((id) => {
    const along = resolveEdgeStationPosition(id, left, right, top, bottom);
    const side = STATION_SIDE[id];
    const extent = resolveEdgeStationNormalExtent(id);
    const x = side === 'left' ? extent : side === 'right' ? viewport.width - extent : along.x;
    const y = side === 'top' ? extent : side === 'bottom' ? viewport.height - extent : along.y;
    return {
      id,
      x,
      y,
      inwardAngle: INWARD_ANGLE[id],
      side,
      isCorner: id % 2 === 0
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
 * One diamond at ring phase `phaseRad` (radians; 2 pi = one full clockwise lap,
 * negative = counter-clockwise). Pure function of the viewport, the id and the
 * phase. A whole number of station steps (a whole number of laps included)
 * returns the REST station of id + steps (same id), copied from `restStations`,
 * so the end of every timeline lands exactly on the fixed layout.
 *
 * Between stations the diamond moves along the perimeter coordinate s (station
 * units, 2 per side, clockwise from the top-left corner): along the side it
 * interpolates linearly between the rest corner centres, and its angle is
 * (s + 1) pi / 4 -- the rest orientation at every station, so the kite swings
 * smoothly through the corners. Top/bottom: outer tip flush with the screen
 * edge. Left/right: the centre eases from the corner inset to the flush offset
 * at the midpoint (the rest corners are inset along the left/right edges), so
 * the kite never leaves the viewport at any phase.
 */
export const resolveOrbitingEdgeStation = (
  viewport: EdgeViewport,
  id: EdgeStationId,
  phaseRad: number,
  restStations: ReadonlyArray<EdgeStation> = resolveEdgeStations(viewport)
): EdgeStation => {
  const shift = Number.isFinite(phaseRad) ? (phaseRad / (Math.PI * 2)) * EDGE_ORBIT_STEPS_PER_LAP : 0;
  const nearest = Math.round(shift);
  if (Math.abs(shift - nearest) < ORBIT_SNAP_EPSILON) {
    const rest = restStations[wrapStep(id + nearest)] as EdgeStation;
    return { ...rest, id };
  }
  const s = wrapStep(id + shift);
  const sideIndex = Math.min(3, Math.floor(s / 2));
  const side = ORBIT_SIDES[sideIndex] as EdgeSide;
  const u = (s - (2 * sideIndex)) / 2;
  const angle = ((s + 1) * Math.PI) / 4;
  const reach = resolveEdgeKiteOutwardReach(angle, side);
  const inset = EDGE_MARKER_MIN_INSET_PX;
  const left = inset;
  const right = Math.max(left, viewport.width - inset);
  const cornerReach = resolveEdgeStationNormalExtent(0);
  const topCornerY = cornerReach;
  const bottomCornerY = viewport.height - cornerReach;
  // 0 at the side midpoint, 1 at its corners (squared: the kite stays flush for most of the side).
  const cornerBlend = ((2 * u) - 1) ** 2;
  let x: number;
  let y: number;
  if (side === 'top') {
    x = left + ((right - left) * u);
    y = reach;
  } else if (side === 'right') {
    x = viewport.width - (reach + (((viewport.width - right) - cornerReach) * cornerBlend));
    y = topCornerY + ((bottomCornerY - topCornerY) * u);
  } else if (side === 'bottom') {
    x = right + ((left - right) * u);
    y = viewport.height - reach;
  } else {
    x = reach + ((left - cornerReach) * cornerBlend);
    y = bottomCornerY + ((topCornerY - bottomCornerY) * u);
  }
  return { id, x, y, inwardAngle: angle, side, isCorner: false };
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

/** Kite outline (tip first, inward), in screen space. Long axis = inward direction. */
export const resolveEdgeMarkerVertices = (
  station: Pick<EdgeStation, 'x' | 'y' | 'inwardAngle'>,
  scale = 1
): ReadonlyArray<EdgePoint> => {
  const angle = station.inwardAngle;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vx = -uy;
  const vy = ux;
  const at = (along: number, across: number): EdgePoint => ({
    x: station.x + (ux * along * scale) + (vx * across * scale),
    y: station.y + (uy * along * scale) + (vy * across * scale)
  });
  return [
    at(EDGE_MARKER_HALF_HEIGHT, 0),
    at(2, EDGE_MARKER_HALF_WIDTH),
    at(-EDGE_MARKER_HALF_HEIGHT, 0),
    at(2, -EDGE_MARKER_HALF_WIDTH)
  ];
};

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
}

export interface EdgeWrapFlash {
  readonly ids: ReadonlyArray<number>;
  readonly startedAtMs: number;
}

export interface EdgeMarkerStateInput {
  readonly timeMs: number;
  readonly reducedMotion: boolean;
  readonly energizedIds?: ReadonlySet<number>;
  /** Per-station ring lighting 0..1 indexed by id (resolveEdgeRingEnergies). */
  readonly ringEnergies?: ReadonlyArray<number>;
  /** Ring orbit phase in radians (timeline ringSpinRad: 2 pi = one lap, positive = clockwise). */
  readonly spinRad?: number;
  readonly flash?: EdgeWrapFlash | null;
  /** Stations whose kite must not draw (e.g. the teleport shell is occupying it). */
  readonly hiddenIds?: ReadonlySet<number>;
}

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
  const flashProgress = !input.reducedMotion && input.flash
    ? Math.max(0, Math.min(1, (input.timeMs - input.flash.startedAtMs) / EDGE_MARKER_FLASH_MS))
    : 1;
  const flashLive = !input.reducedMotion && input.flash != null && flashProgress < 1 && input.timeMs >= input.flash.startedAtMs;
  return STATION_IDS.map((id) => {
    // Reduced motion: nothing animates, so nothing lights up either.
    const ring = input.reducedMotion ? 0 : clampUnit(input.ringEnergies?.[id] ?? 0);
    const energy = input.reducedMotion ? 0 : Math.max(ring, (input.energizedIds?.has(id) ?? false) ? 1 : 0);
    const energized = energy > 0;
    const flash = flashLive && (input.flash?.ids.includes(id) ?? false) ? 1 - flashProgress : 0;
    return {
      id,
      alpha: energized || flash > 0
        ? idleAlpha + ((EDGE_MARKER_ENERGIZED_ALPHA - idleAlpha) * Math.max(energy, flash > 0 ? 1 : 0))
        : idleAlpha,
      energized,
      energy,
      spinRad: input.reducedMotion || !Number.isFinite(input.spinRad) ? 0 : (input.spinRad ?? 0),
      flash,
      hidden: input.hiddenIds?.has(id) ?? false
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

export const drawEdgeMarker = (
  graphics: EdgeGraphics,
  station: EdgeStation,
  state: EdgeMarkerState
): void => {
  if (state.hidden) {
    return;
  }
  const outline = resolveEdgeMarkerVertices(station, 1);
  if (state.energized || state.flash > 0) {
    // Mint core: a smaller kite inside the outline.
    tracePolygon(graphics, resolveEdgeMarkerVertices(station, 0.5));
    graphics.fillStyle(
      cyberArcadeMaterial.rail.mint,
      Math.max(state.flash, state.energized ? 0.7 * state.energy : 0) * state.alpha
    );
    graphics.fillPath();
  }
  tracePolygon(graphics, outline);
  graphics.lineStyle(
    EDGE_MARKER_STROKE_PX,
    state.energized || state.flash > 0 ? cyberArcadeMaterial.rail.mint : cyberArcadeMaterial.rail.cyan,
    state.alpha
  );
  graphics.strokePath();
};

/**
 * `stations` is the REST layout (resolveEdgeStations). Each diamond is placed
 * on its orbit at its state's phase (state.spinRad); phase 0 draws it on its
 * rest station untouched.
 */
export const drawEdgeMarkers = (
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
  /** inward = arrival (diamonds -> spawn tile), outward = departure (player -> diamonds). */
  readonly direction: EdgeBeamDirection;
  /** Timeline laserProgress (intro.laserProgress / outro.laserProgress), 0..1. */
  readonly laserProgress: number;
  /** Timeline ringEnergy envelope, 0..1 (1 while active, fading to 0 at the end). */
  readonly ringEnergy: number;
}

/** Fraction of the beam flight over which a departing beam brightens the diamond it reaches. */
export const EDGE_RING_LANDING_RAMP = 0.2;
/** Fraction of the beam flight over which an arriving diamond brightens after it fires. */
export const EDGE_RING_FIRE_RAMP = 0.2;
/**
 * Arrival lighting floor: all 8 diamonds are lit (at this fraction of full energy) for the whole
 * build, while the ring orbits and before any beam leaves; firing brightens a diamond to 1.
 */
export const EDGE_RING_BUILD_LIT = 0.6;

const smoothUnit = (value: number): number => {
  const x = clampUnit(value);
  return x * x * (3 - (2 * x));
};

/**
 * Per-station lighting (index = station id) derived from each beam's own
 * progress and the ring-wide envelope:
 * - arrival (inward): all 8 diamonds are lit (EDGE_RING_BUILD_LIT) from the start of the build
 *   while the ring orbits, brighten to full as their own beam fires (the beams leave only after the
 *   build is complete) and the envelope fades all 8 out together after the landing;
 * - departure (outward): a diamond lights as the player's beam REACHES it
 *   (progress -> 1) and stays lit until the envelope fades at the end.
 * Null lifecycle = at rest = all zero.
 */
export const resolveEdgeRingEnergies = (
  lifecycle: EdgeRingLifecycle | null,
  count = EDGE_STATION_COUNT
): ReadonlyArray<number> => Array.from({ length: count }, (_, index) => {
  if (lifecycle === null) {
    return 0;
  }
  const progress = resolveEdgeBeamProgress(clampUnit(lifecycle.laserProgress), index, count);
  const own = lifecycle.direction === 'inward'
    ? EDGE_RING_BUILD_LIT + ((1 - EDGE_RING_BUILD_LIT) * (progress > 0 ? smoothUnit(progress / EDGE_RING_FIRE_RAMP) : 0))
    : smoothUnit((progress - (1 - EDGE_RING_LANDING_RAMP)) / EDGE_RING_LANDING_RAMP);
  return own * clampUnit(lifecycle.ringEnergy);
});

export interface SpawnSparkle {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly alpha: number;
}

/**
 * Beam progress for diamond `index` of `count`, derived ONLY from the master
 * timeline's laserProgress. Beams are staggered by at most
 * INTRO_BEAM_STAGGER_MS across the ring and every beam still lands exactly
 * when the master laser does.
 */
export const resolveEdgeBeamProgress = (laserProgress: number, index: number, count = EDGE_STATION_COUNT): number => {
  const stagger = INTRO_BEAM_STAGGER_MS / INTRO_LASER_MS;
  const offset = count > 1 ? (Math.max(0, Math.min(count - 1, index)) / (count - 1)) * stagger : 0;
  const local = (laserProgress - offset) / (1 - stagger);
  return Math.max(0, Math.min(1, local));
};

export type EdgeBeamDirection = 'inward' | 'outward';

export interface EdgeBeamsInput {
  /** Each diamond's CURRENT position (resolveOrbitingEdgeStations); the rest layout while the ring is parked. */
  readonly stations: ReadonlyArray<EdgeStation>;
  /** The maze spawn tile (arrival) or the player (departure), in screen space. */
  readonly focus: EdgePoint;
  /** inward: diamonds -> focus (build). outward: focus -> diamonds (deconstruct). */
  readonly direction: EdgeBeamDirection;
  /** introTimeline laserProgress (intro) or OutroState.laserProgress (outro), 0..1. */
  readonly laserProgress: number;
  /** introTimeline spawnPop, 0..1 (inward only). */
  readonly spawnPop: number;
}

export interface EdgeBeam {
  readonly id: EdgeStationId;
  readonly from: EdgePoint;
  readonly to: EdgePoint;
  readonly tip: EdgePoint;
  readonly progress: number;
  /** True while the head is travelling (0 < progress < 1). */
  readonly firing: boolean;
}

export interface EdgeBeamsGeometry {
  readonly beams: ReadonlyArray<EdgeBeam>;
  readonly firingIds: ReadonlySet<number>;
  /** The 6-sparkle poof where the inward beams converge (empty otherwise). */
  readonly sparkles: ReadonlyArray<SpawnSparkle>;
}

export const resolveEdgeBeams = (input: EdgeBeamsInput): EdgeBeamsGeometry => {
  const laserProgress = Math.max(0, Math.min(1, input.laserProgress));
  const pop = Math.max(0, Math.min(1, input.spawnPop));
  const firingIds = new Set<number>();
  const beams = input.stations.map((station, index): EdgeBeam => {
    const progress = resolveEdgeBeamProgress(laserProgress, index, input.stations.length);
    const from = input.direction === 'inward' ? { x: station.x, y: station.y } : input.focus;
    const to = input.direction === 'inward' ? input.focus : { x: station.x, y: station.y };
    const firing = progress > 0 && progress < 1;
    if (firing) {
      firingIds.add(station.id);
    }
    return {
      id: station.id,
      from,
      to,
      tip: { x: from.x + ((to.x - from.x) * progress), y: from.y + ((to.y - from.y) * progress) },
      progress,
      firing
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

/** One beam per diamond (3 px glow + 1 px core + head dot), plus the landing poof. */
export const drawEdgeBeams = (graphics: EdgeGraphics, input: EdgeBeamsInput): EdgeBeamsGeometry => {
  const geometry = resolveEdgeBeams(input);
  for (const beam of geometry.beams) {
    if (!beam.firing) {
      continue;
    }
    graphics.lineStyle(SPAWN_LASER_GLOW_PX, cyberArcadeMaterial.signal.player, EDGE_BEAM_ALPHA * 0.35);
    graphics.lineBetween(beam.from.x, beam.from.y, beam.tip.x, beam.tip.y);
    graphics.lineStyle(SPAWN_LASER_CORE_PX, cyberArcadeMaterial.rail.mint, EDGE_BEAM_ALPHA);
    graphics.lineBetween(beam.from.x, beam.from.y, beam.tip.x, beam.tip.y);
    graphics.fillStyle(cyberArcadeMaterial.rail.mint, EDGE_BEAM_ALPHA);
    graphics.fillCircle(beam.tip.x, beam.tip.y, 2.5);
  }
  geometry.sparkles.forEach((sparkle, index) => {
    graphics.lineStyle(
      1,
      index % 2 === 0 ? cyberArcadeMaterial.rail.mint : cyberArcadeMaterial.signal.player,
      sparkle.alpha
    );
    graphics.lineBetween(sparkle.x - sparkle.size, sparkle.y, sparkle.x + sparkle.size, sparkle.y);
    graphics.lineBetween(sparkle.x, sparkle.y - sparkle.size, sparkle.x, sparkle.y + sparkle.size);
  });
  return geometry;
};
