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
 * - Fully inside the viewport: the station centre is inset by at least
 *   max(12, safe-area + 12) px per edge and a kite never reaches more than
 *   10.5 px from its centre in ANY rotation, so no pixel can be clipped.
 * - Calm: one slow breathing alpha (0.45-0.6 over 3.6 s). No orbit, no
 *   per-marker sparkles. In reduced motion the markers are completely static.
 * - Meaningful: a marker lights up (mint core) while it is a live wrap end or
 *   the spawn laser's emitter, and flashes once (~120 ms) on a wrapped step,
 *   paired with the destination edge.
 *
 * Lasers: on arrival ALL 8 diamonds fire a beam inward to the spawn tile; on
 * departure the player fires a beam out to ALL 8 diamonds. Each beam is a 3 px
 * glow + 1 px core + head dot, staggered by at most 60 ms across the ring and
 * derived only from the master timeline's laserProgress, so menu and play can
 * never disagree. A diamond brightens while its beam is firing.
 *
 * Geometry and state are pure; the draw helpers only call the tiny Graphics
 * surface declared below (so they are testable without Phaser). Colours come
 * exclusively from cyberArcadeMaterial tokens.
 */
import { resolveLegacyHeaderControlFrame } from '../legacy-runtime/legacyHeaderControl';
import { isLegacyWrappedStepTransition } from '../legacy-runtime/legacyMaze';
import { cyberArcadeMaterial } from './cyberArcadeMaterial';
import { INTRO_BEAM_STAGGER_MS, INTRO_LASER_MS } from './introTimeline';

export type EdgeSide = 'top' | 'right' | 'bottom' | 'left';
export type EdgeStationId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface EdgeViewport {
  readonly width: number;
  readonly height: number;
}

export interface EdgeSafeArea {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
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

const finiteNonNegative = (value: number | undefined): number => (
  value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0
);

/** Per-edge centre inset: never closer than max(12, safeArea + 12). */
export const resolveEdgeMarkerInsets = (safeArea?: Partial<EdgeSafeArea>): EdgeSafeArea => ({
  top: Math.max(EDGE_MARKER_MIN_INSET_PX, finiteNonNegative(safeArea?.top) + EDGE_MARKER_MIN_INSET_PX),
  right: Math.max(EDGE_MARKER_MIN_INSET_PX, finiteNonNegative(safeArea?.right) + EDGE_MARKER_MIN_INSET_PX),
  bottom: Math.max(EDGE_MARKER_MIN_INSET_PX, finiteNonNegative(safeArea?.bottom) + EDGE_MARKER_MIN_INSET_PX),
  left: Math.max(EDGE_MARKER_MIN_INSET_PX, finiteNonNegative(safeArea?.left) + EDGE_MARKER_MIN_INSET_PX)
});

export interface EdgeRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Gap kept between a kite's bounding square and any header control. */
export const EDGE_MARKER_CONTROL_CLEARANCE_PX = 8;

/**
 * The three header controls (profile, leaderboard, settings) exactly as
 * MenuScene lays them out: same resolveLegacyHeaderControlFrame inputs the
 * draw/hit-test code uses, so the avoidance can never drift from the icons.
 */
export const resolveHeaderControlRects = (layout: {
  readonly width: number;
  readonly height: number;
  readonly headerIconScale: number;
  readonly lanes: { readonly hud: { readonly top: number; readonly height: number } | null };
}): ReadonlyArray<EdgeRect> => {
  const base = {
    height: layout.height,
    hudHeight: layout.lanes.hud?.height ?? 64,
    hudTop: layout.lanes.hud?.top ?? 0,
    sizeScale: layout.headerIconScale,
    width: layout.width
  };
  return [
    resolveLegacyHeaderControlFrame({ ...base, placement: 'leading' }),
    resolveLegacyHeaderControlFrame({ ...base, placement: 'trailing' }),
    resolveLegacyHeaderControlFrame({ ...base, placement: 'trailing', slot: 1 })
  ].map((frame) => ({ left: frame.left, top: frame.top, right: frame.right, bottom: frame.bottom }));
};

/** Kite bounding square (worst-case rotation) around a centre. */
export const resolveEdgeMarkerBounds = (station: Pick<EdgeStation, 'x' | 'y'>): EdgeRect => ({
  left: station.x - EDGE_MARKER_MAX_EXTENT_PX,
  top: station.y - EDGE_MARKER_MAX_EXTENT_PX,
  right: station.x + EDGE_MARKER_MAX_EXTENT_PX,
  bottom: station.y + EDGE_MARKER_MAX_EXTENT_PX
});

const overlapsInflated = (bounds: EdgeRect, rect: EdgeRect, clearance: number): boolean => (
  bounds.left < rect.right + clearance
  && bounds.right > rect.left - clearance
  && bounds.top < rect.bottom + clearance
  && bounds.bottom > rect.top - clearance
);

/**
 * Slides a top-edge station along the edge, only as far as needed, until its
 * bounding square clears every control rect by EDGE_MARKER_CONTROL_CLEARANCE_PX.
 * Corners slide toward the middle; the station id/edge never change.
 */
const clearStationOfControls = (
  station: EdgeStation,
  controls: ReadonlyArray<EdgeRect>,
  minX: number,
  maxX: number
): EdgeStation => {
  const direction = station.id === 0 ? 1 : station.id === 2 ? -1 : 0;
  if (direction === 0) {
    return station;
  }
  let x = station.x;
  for (let pass = 0; pass < controls.length + 1; pass += 1) {
    const blocker = controls.find((rect) => overlapsInflated(
      resolveEdgeMarkerBounds({ x, y: station.y }),
      rect,
      EDGE_MARKER_CONTROL_CLEARANCE_PX
    ));
    if (!blocker) {
      break;
    }
    x = direction > 0
      ? blocker.right + EDGE_MARKER_CONTROL_CLEARANCE_PX + EDGE_MARKER_MAX_EXTENT_PX
      : blocker.left - EDGE_MARKER_CONTROL_CLEARANCE_PX - EDGE_MARKER_MAX_EXTENT_PX;
  }
  return { ...station, x: Math.max(minX, Math.min(maxX, x)) };
};

export const resolveEdgeStations = (
  viewport: EdgeViewport,
  safeArea?: Partial<EdgeSafeArea>,
  controls: ReadonlyArray<EdgeRect> = []
): ReadonlyArray<EdgeStation> => {
  const inset = resolveEdgeMarkerInsets(safeArea);
  const left = inset.left;
  const right = Math.max(left, viewport.width - inset.right);
  const top = inset.top;
  const bottom = Math.max(top, viewport.height - inset.bottom);
  return STATION_IDS.map((id) => {
    const { x, y } = resolveEdgeStationPosition(id, left, right, top, bottom);
    const station: EdgeStation = {
      id,
      x,
      y,
      inwardAngle: INWARD_ANGLE[id],
      side: STATION_SIDE[id],
      isCorner: id % 2 === 0
    };
    // Only the two top corners can collide with the header controls.
    return controls.length > 0 && (id === 0 || id === 2)
      ? clearStationOfControls(station, controls, left, right)
      : station;
  });
};

export interface EdgePoint {
  readonly x: number;
  readonly y: number;
}

/** Kite outline (tip first, inward), in screen space. Long axis = inward direction. */
export const resolveEdgeMarkerVertices = (
  station: Pick<EdgeStation, 'x' | 'y' | 'inwardAngle'>,
  scale = 1
): ReadonlyArray<EdgePoint> => {
  const ux = Math.cos(station.inwardAngle);
  const uy = Math.sin(station.inwardAngle);
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

export const resolveEdgeMarkerStates = (input: EdgeMarkerStateInput): ReadonlyArray<EdgeMarkerState> => {
  const idleAlpha = resolveEdgeMarkerIdleAlpha(input.timeMs, input.reducedMotion);
  const flashProgress = !input.reducedMotion && input.flash
    ? Math.max(0, Math.min(1, (input.timeMs - input.flash.startedAtMs) / EDGE_MARKER_FLASH_MS))
    : 1;
  const flashLive = !input.reducedMotion && input.flash != null && flashProgress < 1 && input.timeMs >= input.flash.startedAtMs;
  return STATION_IDS.map((id) => {
    // Reduced motion: nothing animates, so nothing lights up either.
    const energized = !input.reducedMotion && (input.energizedIds?.has(id) ?? false);
    const flash = flashLive && (input.flash?.ids.includes(id) ?? false) ? 1 - flashProgress : 0;
    return {
      id,
      alpha: energized || flash > 0 ? EDGE_MARKER_ENERGIZED_ALPHA : idleAlpha,
      energized,
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
  const outline = resolveEdgeMarkerVertices(station);
  if (state.energized || state.flash > 0) {
    // Mint core: a smaller kite inside the outline.
    tracePolygon(graphics, resolveEdgeMarkerVertices(station, 0.5));
    graphics.fillStyle(cyberArcadeMaterial.rail.mint, Math.max(state.flash, state.energized ? 0.7 : 0) * state.alpha);
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

export const drawEdgeMarkers = (
  graphics: EdgeGraphics,
  stations: ReadonlyArray<EdgeStation>,
  states: ReadonlyArray<EdgeMarkerState>
): void => {
  stations.forEach((station) => {
    const state = states.find((candidate) => candidate.id === station.id);
    if (state) {
      drawEdgeMarker(graphics, station, state);
    }
  });
};

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
