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
 * - Meaningful: a marker lights up (a core in the PLAYER's colour) while it is a live wrap end or
 *   the spawn laser's emitter, and flashes once (~120 ms) on a wrapped step,
 *   paired with the destination edge.
 * - Colour contract (trailPalette.ts is the single source of truth): the diamond's BORDER is always the live
 *   iridescent trail colour (the trail's own core colour at the trail head, same clock, same reduced-motion rule;
 *   never a fixed colour), and everything INSIDE it or fired out of it (the lit core, the beams, the landing
 *   sparkles) is the player's colour, `PLAYER_COLOR`.
 *
 * Lasers and fill (MAZER-VIS-030): on departure the player fires a beam out to ALL 8 diamonds; each diamond FILLS with
 * the player's colour from the exact instant its beam touches it (grows from its inner tip, full when the beam is fully
 * absorbed) and stays full through the deconstruct and the build. On arrival ALL 8 diamonds (orbiting, full, parked on
 * their rest stations once the build completes) fire a beam inward to the spawn tile and each DRAINS from the exact
 * instant its beam leaves it (empty when the beam has fully left). Each beam is a comet pulse (edgeBeamArt.ts:
 * bloom, tapered gradient body, bright pulsing head, a contact ripple), staggered by at most 60 ms across the ring and
 * derived only from the master laser clock (edgeBeamTimeline.ts), so menu and play can never disagree. Reduced motion:
 * no beam; the diamonds crossfade full/empty over the 200 ms crossfade.
 *
 * Geometry and state are pure; the draw helpers only call the tiny Graphics
 * surface declared below (so they are testable without Phaser). Colours come
 * exclusively from the trail palette (trailPalette.ts) and cyberArcadeMaterial tokens.
 */
import { isLegacyWrappedStepTransition } from '../legacy-runtime/legacyMaze';
import { PLAYER_COLOR, resolveTrailPaletteBorderColor } from './trailPalette';
import { MOTION_DURATION_MS, MOTION_LOOP_MS } from './motionScale';
import {
  EDGE_BEAM_FLIGHT_MS,
  EDGE_BEAM_PULSE_MS,
  inverseSmoothstep,
  resolveBeamHeadFromMaster,
  resolveBeamTail,
  resolveBeamTimes,
  resolveEdgeBeamPulse,
  type EdgeBeamDirection
} from './edgeBeamTimeline';
import {
  drawBeamPulse,
  drawContactRipple,
  drawDiamondFill,
  resolveOutlineExitPoint,
  type DiamondFillMode
} from './edgeBeamArt';

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
  /**
   * How full the diamond's interior is, 0..1 (MAZER-VIS-030). Optional: absent = empty (a standalone icon, the rest ring).
   * The interior is the player's colour.
   */
  readonly fill?: number;
  /** grow: the fill rises from the inner tip (the beam coming in); drain: it retreats to the outer tip (the beam leaving). */
  readonly fillMode?: DiamondFillMode;
  /** Reduced motion: the interior crossfades by alpha instead of sweeping. */
  readonly fillCrossfade?: boolean;
  /**
   * The border colour: the live trail colour (`resolveTrailPaletteBorderColor`). Optional only so a standalone
   * icon (the Guide legend) can omit it and get the static trail gradient's start colour; the board always sets it.
   */
  readonly borderColor?: number;
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
  readonly fillMode?: DiamondFillMode;
  /** Reduced motion: the interior crossfades by alpha instead of sweeping. */
  readonly fillCrossfade?: boolean;
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

/** Border colour of a marker with no explicit `borderColor`: the static trail palette at the trail's start. */
const STATIC_BORDER_COLOR = resolveTrailPaletteBorderColor(0, 0, true);

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
  const borderColor = resolveTrailPaletteBorderColor(
    Number.isFinite(input.trailHeadDistanceTiles) ? (input.trailHeadDistanceTiles ?? 0) : 0,
    Number.isFinite(input.trailTimeMs) ? (input.trailTimeMs ?? input.timeMs) : input.timeMs,
    input.reducedMotion || input.trailAnimated === false
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
      fillMode: input.fillMode ?? 'grow',
      fillCrossfade: input.fillCrossfade === true,
      spinRad: input.reducedMotion || !Number.isFinite(input.spinRad) ? 0 : (input.spinRad ?? 0),
      flash,
      hidden: input.hiddenIds?.has(id) ?? false,
      borderColor
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
  if ((state.fill ?? 0) > 0) {
    drawDiamondFill(graphics, {
      center: { x: station.x, y: station.y },
      crossfade: state.fillCrossfade === true,
      fill: state.fill ?? 0,
      halfHeight: EDGE_MARKER_HALF_HEIGHT,
      inwardAngle: station.inwardAngle,
      mode: state.fillMode ?? 'grow',
      vertices: outline
    });
  }
  if (state.energized || state.flash > 0) {
    // Player-coloured core: a smaller kite inside the outline.
    tracePolygon(graphics, resolveEdgeMarkerVertices(station, 0.5));
    graphics.fillStyle(
      PLAYER_COLOR,
      Math.max(state.flash, state.energized ? 0.7 * state.energy : 0) * state.alpha
    );
    graphics.fillPath();
  }
  tracePolygon(graphics, outline);
  graphics.lineStyle(
    EDGE_MARKER_STROKE_PX,
    state.borderColor ?? STATIC_BORDER_COLOR,
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
export const resolveEdgeRingFills = (
  lifecycle: EdgeRingLifecycle | null,
  count = EDGE_STATION_COUNT
): ReadonlyArray<number> => Array.from({ length: count }, (_, index) => {
  if (lifecycle === null) {
    return 0;
  }
  const ring = clampUnit(lifecycle.ringFill);
  if (lifecycle.crossfade === true) {
    return ring;
  }
  const pulse = resolveEdgeBeamPulse(lifecycle.direction, lifecycle.clockMs, index, count, ring);
  return lifecycle.direction === 'outward' ? Math.max(ring, pulse.diamondFill) : pulse.diamondFill;
});

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
  /** Each diamond's CURRENT position (resolveOrbitingEdgeStations); the rest layout while the ring is parked. */
  readonly stations: ReadonlyArray<EdgeStation>;
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
}

export interface EdgeBeam {
  readonly id: EdgeStationId;
  /** Path source and target. The diamond end is the exact point where the beam meets the diamond OUTLINE (the contact point). */
  readonly from: EdgePoint;
  readonly to: EdgePoint;
  /** The head position on the path (`progress` along from -> to). */
  readonly tip: EdgePoint;
  /** The tail position on the path (`tail` along from -> to). */
  readonly tailPoint: EdgePoint;
  readonly progress: number;
  readonly tail: number;
  /** The contact point on the diamond outline. */
  readonly contact: EdgePoint;
  /** True while any part of the pulse is on the path (head has left, tail has not yet arrived). */
  readonly firing: boolean;
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
  const count = input.stations.length;
  const beams = input.stations.map((station, index): EdgeBeam => {
    const centre = { x: station.x, y: station.y };
    const contact = resolveOutlineExitPoint(resolveEdgeMarkerVertices(station, 1), centre, input.focus);
    const from = input.direction === 'inward' ? contact : input.focus;
    const to = input.direction === 'inward' ? input.focus : contact;
    const pulse = resolveEdgeBeamPulse(input.direction, clockMs, index, count);
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
      tailPoint: lerpPoint(from, to, resolveBeamTail(clockMs, index, count)),
      progress: pulse.head,
      tail: pulse.tail,
      contact,
      firing: pulse.visible,
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

/** One comet pulse per diamond (bloom + tapered gradient body + pulsing head + contact ripple), plus the landing poof. */
export const drawEdgeBeams = (graphics: EdgeGraphics, input: EdgeBeamsInput): EdgeBeamsGeometry => {
  const geometry = resolveEdgeBeams(input);
  const dpr = input.devicePixelRatio ?? 1;
  const clockMs = resolveBeamClockMs(input);
  for (const beam of geometry.beams) {
    if (!beam.firing) {
      continue;
    }
    drawBeamPulse(graphics, { clockMs, devicePixelRatio: dpr, headPoint: beam.tip, tailPoint: beam.tailPoint });
    drawContactRipple(graphics, beam.contact, beam.rippleProgress, dpr);
  }
  geometry.sparkles.forEach((sparkle) => {
    graphics.lineStyle(1, PLAYER_COLOR, sparkle.alpha);
    graphics.lineBetween(sparkle.x - sparkle.size, sparkle.y, sparkle.x + sparkle.size, sparkle.y);
    graphics.lineBetween(sparkle.x, sparkle.y - sparkle.size, sparkle.x, sparkle.y + sparkle.size);
  });
  return geometry;
};
