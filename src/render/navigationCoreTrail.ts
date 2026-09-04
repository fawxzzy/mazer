import type { LegacyPoint } from '../legacy-runtime/legacyMaze';
import { resolveLegacyIridescentMidnightColor } from '../legacy-runtime/legacyIridescentMaterial';

// Pure geometry/color/shine math for Navigation Core v1's continuous player
// trail (docs/assets/reference/navigation-core-v1/). Deliberately has no
// Phaser dependency and no MenuScene state -- every function here is a pure
// function of its explicit inputs, so it can be unit-tested directly and so
// MenuScene.ts (already 16k+ lines) doesn't grow a second, harder-to-test
// geometry system inside itself. See tests/render/navigationCoreTrail.test.ts.
//
// The live game already computes, every frame, "the perfect route from the
// start tile to wherever the player currently stands" as a plain grid-point
// array (MenuScene.resolveLegacyPlayPerfectPathTrail) -- a BFS shortest path
// through visited tiles, using the 'playable-wrap-aware' graph policy, so it
// can already contain a non-grid-adjacent point pair where the route crosses
// a wraparound edge. This module consumes exactly that array (with its final
// point replaced by the caller's fractional/interpolated player position, so
// the trail visibly grows during a glide instead of popping in on arrival)
// and turns it into: (1) a flat list of pixel-space vertices carrying one
// continuous cumulative distance, split into separate "subpaths" wherever the
// input jumps non-adjacently, so a wrap crossing never draws one straight
// line through the middle of the board but distance/color/shine still read
// continuously across that split; (2) a continuous energy-palette color
// sampled by that same distance (never by array index, so extending the
// trail never recolors what was already drawn); (3) one shared traveling
// shine advanced by an explicit, caller-persisted lap-start timestamp rather
// than `(time % duration) / currentLength`, so growing the trail mid-lap
// never remaps or teleports a shine that's already partway along it.

const EPSILON = 1e-6;

export interface PixelPoint {
  x: number;
  y: number;
}

export interface TrailVertex extends PixelPoint {
  /** Cumulative arc-length distance from the trail's origin, monotonically nondecreasing across the whole vertex list (including across subpath breaks). */
  distance: number;
  /** True for the first vertex of a subpath -- callers must NOT draw a connecting line from the previous vertex to this one (e.g. a wraparound crossing), even though distance/color/shine continue across the break. */
  newSubpath: boolean;
}

export interface TrailGeometry {
  vertices: TrailVertex[];
  /** Total arc length across every subpath, after end-trimming has been applied. */
  totalLength: number;
}

const subtract = (a: PixelPoint, b: PixelPoint): PixelPoint => ({ x: a.x - b.x, y: a.y - b.y });
const vectorLength = (v: PixelPoint): number => Math.hypot(v.x, v.y);
const normalize = (v: PixelPoint): PixelPoint => {
  const len = vectorLength(v);
  return len > EPSILON ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
};
const pointsEqual = (a: LegacyPoint, b: LegacyPoint): boolean => (
  Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON
);

// Same definition as MenuScene's own isLegacyWrappedStepTransition -- any
// step whose grid delta exceeds one cell in either axis is a topology
// discontinuity (a wraparound edge crossing today; deliberately not special-
// cased to "wrap specifically" so any other future non-adjacent jump is
// handled the same way with no extra work).
const isDiscontinuousStep = (a: LegacyPoint, b: LegacyPoint): boolean => (
  Math.abs(a.x - b.x) > 1 + EPSILON || Math.abs(a.y - b.y) > 1 + EPSILON
);

/**
 * Drops consecutive duplicate points (revisiting/pausing on the same tile)
 * and splits the path into separate subpaths at any non-adjacent jump.
 * Fractional (non-integer) coordinates -- the caller's interpolated player
 * point -- pass through unaffected; the adjacency check only cares about the
 * magnitude of the step.
 */
export function splitGridPathAtDiscontinuities(path: readonly LegacyPoint[]): LegacyPoint[][] {
  const subpaths: LegacyPoint[][] = [];
  let current: LegacyPoint[] = [];
  for (const point of path) {
    const previous = current[current.length - 1];
    if (previous && pointsEqual(previous, point)) {
      continue;
    }
    if (previous && isDiscontinuousStep(previous, point)) {
      subpaths.push(current);
      current = [];
    }
    current.push({ x: point.x, y: point.y });
  }
  if (current.length > 0) {
    subpaths.push(current);
  }
  return subpaths;
}

export function projectGridPointToPixel(
  point: LegacyPoint,
  originX: number,
  originY: number,
  tileSize: number
): PixelPoint {
  return {
    x: originX + ((point.x + 0.5) * tileSize),
    y: originY + ((point.y + 0.5) * tileSize)
  };
}

export function projectGridPathToPixels(
  subpaths: readonly LegacyPoint[][],
  originX: number,
  originY: number,
  tileSize: number
): PixelPoint[][] {
  return subpaths.map((subpath) => (
    subpath.map((point) => projectGridPointToPixel(point, originX, originY, tileSize))
  ));
}

/**
 * Drops interior vertices where the path continues in (almost) exactly the
 * same direction -- i.e. genuinely redundant points, not real turns. A
 * near-180-degree reversal is a real turn by this definition (the direction
 * flips, it does not continue) and is always kept.
 */
export function collapseCollinearPoints(points: readonly PixelPoint[]): PixelPoint[] {
  if (points.length < 3) {
    return points.slice();
  }
  const result: PixelPoint[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i += 1) {
    const previous = result[result.length - 1]!;
    const current = points[i]!;
    const next = points[i + 1]!;
    const dirIn = normalize(subtract(current, previous));
    const dirOut = normalize(subtract(next, current));
    const dot = (dirIn.x * dirOut.x) + (dirIn.y * dirOut.y);
    if (dot < 1 - 1e-4) {
      result.push(current);
    }
  }
  result.push(points[points.length - 1]!);
  return result;
}

/**
 * Replaces each real interior corner with a short quadratic-bezier rounded
 * transition (radius capped by half of each adjacent segment's own length,
 * per the frozen contract, so a rounded corner never overshoots a short
 * segment). Never rounds a near-180-degree reversal -- there is no sensible
 * corner to smooth when the path doubles back on itself, and attempting to
 * would draw a small loop instead of a point turn.
 */
export function roundPolylineCorners(
  points: readonly PixelPoint[],
  cornerRadius: number,
  segmentsPerCorner = 6
): PixelPoint[] {
  const collapsed = collapseCollinearPoints(points);
  if (collapsed.length < 3 || cornerRadius <= EPSILON) {
    return collapsed;
  }

  const result: PixelPoint[] = [collapsed[0]!];
  for (let i = 1; i < collapsed.length - 1; i += 1) {
    const previous = collapsed[i - 1]!;
    const vertex = collapsed[i]!;
    const next = collapsed[i + 1]!;
    const inVector = subtract(vertex, previous);
    const outVector = subtract(next, vertex);
    const inLength = vectorLength(inVector);
    const outLength = vectorLength(outVector);
    const dirIn = normalize(inVector);
    const dirOut = normalize(outVector);
    const dot = (dirIn.x * dirOut.x) + (dirIn.y * dirOut.y);

    if (dot > 1 - 1e-4 || dot < -1 + 1e-3) {
      result.push(vertex);
      continue;
    }

    const radius = Math.min(cornerRadius, inLength / 2, outLength / 2);
    if (radius <= EPSILON) {
      result.push(vertex);
      continue;
    }

    const p1: PixelPoint = { x: vertex.x - (dirIn.x * radius), y: vertex.y - (dirIn.y * radius) };
    const p2: PixelPoint = { x: vertex.x + (dirOut.x * radius), y: vertex.y + (dirOut.y * radius) };
    result.push(p1);
    for (let step = 1; step < segmentsPerCorner; step += 1) {
      const t = step / segmentsPerCorner;
      const invT = 1 - t;
      result.push({
        x: (invT * invT * p1.x) + (2 * invT * t * vertex.x) + (t * t * p2.x),
        y: (invT * invT * p1.y) + (2 * invT * t * vertex.y) + (t * t * p2.y)
      });
    }
    result.push(p2);
  }
  result.push(collapsed[collapsed.length - 1]!);
  return result;
}

/**
 * Shortens a polyline from its END by exactly trimLength, recomputing the
 * precise trimmed endpoint by interpolating along whichever trailing
 * segment(s) the trim distance spans (not just the last one, in case the
 * final segment(s) are shorter than the trim itself). Returns a
 * single-point (zero-length) polyline, never fewer than one point, if the
 * whole polyline is shorter than the trim.
 */
export function trimPolylineEnd(points: readonly PixelPoint[], trimLength: number): PixelPoint[] {
  if (points.length === 0) {
    return [];
  }
  if (trimLength <= EPSILON || points.length < 2) {
    return points.slice();
  }

  const result = points.slice();
  let remaining = trimLength;
  while (remaining > EPSILON && result.length >= 2) {
    const last = result[result.length - 1]!;
    const secondLast = result[result.length - 2]!;
    const segmentLength = vectorLength(subtract(last, secondLast));
    if (segmentLength <= remaining + EPSILON) {
      result.pop();
      remaining -= segmentLength;
      continue;
    }
    const t = 1 - (remaining / segmentLength);
    result[result.length - 1] = {
      x: secondLast.x + ((last.x - secondLast.x) * t),
      y: secondLast.y + ((last.y - secondLast.y) * t)
    };
    remaining = 0;
  }
  return result;
}

/** Flattens pixel subpaths into one cumulative-distance vertex list. */
export function buildTrailGeometryFromPixelSubpaths(pixelSubpaths: readonly PixelPoint[][]): TrailGeometry {
  const vertices: TrailVertex[] = [];
  let distance = 0;
  for (const subpath of pixelSubpaths) {
    subpath.forEach((point, index) => {
      if (index > 0) {
        distance += vectorLength(subtract(point, subpath[index - 1]!));
      }
      vertices.push({ x: point.x, y: point.y, distance, newSubpath: index === 0 });
    });
  }
  return { vertices, totalLength: distance };
}

export interface BuildContinuousTrailPathOptions {
  /**
   * The visited-tiles shortest path from start to the player, with its
   * final point replaced by the caller's current rendered/interpolated
   * player position (a fractional LegacyPoint mid-glide, or exactly the
   * logical player point at rest) -- never the raw logical player point
   * during a glide, or the trail will pop to full length instantly instead
   * of visibly growing with the player's own motion.
   */
  gridPath: readonly LegacyPoint[];
  originX: number;
  originY: number;
  tileSize: number;
  /** Corner rounding radius as a fraction of tileSize. */
  cornerRadiusRatio: number;
  /** How far short of the player's center the trail terminates, as a fraction of tileSize (the frozen contract's exact 0.3). */
  playerTrimRatio: number;
}

export function buildContinuousTrailPath(options: BuildContinuousTrailPathOptions): TrailGeometry {
  const gridSubpaths = splitGridPathAtDiscontinuities(options.gridPath);
  const pixelSubpaths = projectGridPathToPixels(gridSubpaths, options.originX, options.originY, options.tileSize);
  const rounded = pixelSubpaths.map((subpath) => (
    roundPolylineCorners(subpath, options.tileSize * options.cornerRadiusRatio)
  ));
  if (rounded.length > 0) {
    const lastIndex = rounded.length - 1;
    rounded[lastIndex] = trimPolylineEnd(rounded[lastIndex]!, options.tileSize * options.playerTrimRatio);
  }
  return buildTrailGeometryFromPixelSubpaths(rounded);
}

/**
 * Resamples a vertex list at a fixed distance interval so a renderer that
 * can only stroke flat-colored line segments (Phaser's Canvas-mode Graphics
 * has no per-vertex gradient stroke) can still approximate one continuous
 * color/alpha field: every inserted point gets its own exact interpolated
 * position and distance, so a caller sampling color/alpha per point and
 * drawing short segments between consecutive points gets adjacent segments
 * that share exact endpoint colors and positions, with no subdivision
 * aligned to a maze cell boundary. Corner-rounding's own points (already
 * closely spaced) are preserved as-is if they're already denser than
 * intervalPx; this only ever adds points, never removes the original
 * vertices (including subpath-start markers).
 */
export function resampleTrailVertices(vertices: readonly TrailVertex[], intervalPx: number): TrailVertex[] {
  if (intervalPx <= EPSILON || vertices.length === 0) {
    return vertices.slice();
  }

  const result: TrailVertex[] = [vertices[0]!];
  for (let i = 1; i < vertices.length; i += 1) {
    const previous = vertices[i - 1]!;
    const current = vertices[i]!;
    if (current.newSubpath) {
      result.push(current);
      continue;
    }
    const segmentLength = current.distance - previous.distance;
    const steps = Math.max(1, Math.round(segmentLength / intervalPx));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      result.push({
        x: previous.x + ((current.x - previous.x) * t),
        y: previous.y + ((current.y - previous.y) * t),
        distance: previous.distance + (segmentLength * t),
        newSubpath: false
      });
    }
  }
  return result;
}

// Navigation Core v1's own ENERGY palette (read directly out of the frozen
// reference's embedded generator, docs/assets/reference/navigation-core-v1/
// mazer-navigation-core-v1-approved.html: `ENERGY = [...]`) -- cyan, blue,
// violet, magenta dominant; red, orange, yellow brief accents; green a
// transition tone, exactly as the visual contract describes, and in this
// exact cyclic order. Never the old LEGACY_IRIDESCENT_MIDNIGHT_STOPS
// palette, which doesn't match this contract (different hues, no true
// cool/warm weighting).
export const NAVIGATION_CORE_TRAIL_ENERGY_STOPS = [
  0x00d4ff,
  0x2f8bff,
  0x8b3ff0,
  0xe030c0,
  0xff3d5c,
  0xff8a2f,
  0xffd23d,
  0x3de07a
] as const;

export interface TrailColorOptions {
  /** Path distance (px) representing one full trip around the palette cycle. */
  distancePeriodPx: number;
  /** Time (ms) for the shared phase to drift one full trip around the palette cycle -- this is what makes the trail feel like it's slowly flowing even while the player stands still. */
  timePeriodMs: number;
}

/**
 * color = f(absoluteDistance + sharedPhase) -- deliberately never a function
 * of index/total or of the trail's current total length, so extending the
 * trail (appending a new segment) can never recolor a position that was
 * already drawn; only time and this point's own fixed distance from the
 * trail's origin determine its color.
 */
export function sampleTrailEnergyColor(distance: number, timeMs: number, options: TrailColorOptions): number {
  const distancePhase = options.distancePeriodPx > 0 ? distance / options.distancePeriodPx : 0;
  const timePhase = options.timePeriodMs > 0 ? timeMs / options.timePeriodMs : 0;
  return resolveLegacyIridescentMidnightColor(distancePhase + timePhase, NAVIGATION_CORE_TRAIL_ENERGY_STOPS);
}

export interface TrailShineOptions {
  /** Constant physical speed, px of path distance per ms -- the shine always advances at this rate; nothing here is normalized by the trail's current length. */
  speedPxPerMs: number;
  /** Shine BODY length as a fraction of the trail's CURRENT total length (the frozen contract's ~9.5%) -- its size scales with the trail, but see advanceTrailShineState for why its motion still doesn't remap when that length changes. This is the shine's own visible extent, not the fade window -- see travelEnvelopeRatio for that. */
  lengthRatio: number;
  /**
   * Fraction of the trail's CURRENT TOTAL LENGTH used for the whole-shine
   * fade-in (near the origin) and fade-out (near the player), per the
   * frozen contract's "fading in over the first ~4% of its travel and
   * fading out over the final ~4%" -- travel across the whole path, not 4%
   * of the shine's own (~9.5%-length) body. Confusing this with a fraction
   * of lengthRatio previously made the actual fade window 0.095 * 0.04 =
   * 0.38% of the path (~10x too short), which reads as a hard on/off flick
   * instead of a smooth emerge/vanish. Deliberately a separate ratio from
   * lengthRatio -- one sizes the shine body, the other sizes the envelope
   * that fades it in/out over the journey.
   */
  travelEnvelopeRatio: number;
  /** Extra quiet-interval length, as a fraction of total length, appended after the shine reaches the player end before it restarts at the origin. */
  quietGapRatio: number;
  /** Below this absolute total length (px), suppress the shine entirely rather than rendering an unstable sliver or a rapid loop. */
  minTotalLengthForShine: number;
}

export interface TrailShineState {
  visible: boolean;
  /** Distance (px) along the trail where the shine's own center currently sits. */
  centerDistance: number;
  /** Half of the shine BODY's own length (lengthRatio * totalLength / 2) -- used for the front/rear taper internal to the shine, not the whole-path fade envelope. */
  halfLength: number;
  /** The whole-path travel-envelope length (travelEnvelopeRatio * totalLength) used for envelopeAlpha below -- see TrailShineOptions.travelEnvelopeRatio. */
  travelEnvelopeLength: number;
  /**
   * Smooth 0..1 multiplier fading the whole shine out as its center
   * approaches the trail's two ends (origin fade-in / pre-player fade-out),
   * ramped over travelEnvelopeLength -- separate from the shine's own
   * front/rear taper across its own body width (halfLength).
   */
  envelopeAlpha: number;
  /** Caller must persist this and pass it back in as previousLapStartedAtMs next frame. */
  lapStartedAtMs: number;
}

/**
 * Advances the shared shine by elapsed real time at a constant speed,
 * tracking lap boundaries explicitly via a caller-persisted lap-start
 * timestamp instead of `(time % duration) / currentLength`. Within an
 * ongoing lap, the shine's position depends only on `timeMs -
 * lapStartedAtMs` and the constant speed -- never on totalLength -- so
 * growing the trail mid-lap (the ordinary case: the player takes another
 * step while the shine is already partway along) only changes how much
 * farther the current lap has to travel before it completes; it can never
 * retroactively move or teleport a shine that's already in flight. Only the
 * lap-completion check (and thus the render's origin position for the *next*
 * lap) reads the current totalLength.
 */
export function advanceTrailShineState(
  totalLength: number,
  timeMs: number,
  previousLapStartedAtMs: number,
  options: TrailShineOptions
): TrailShineState {
  const shineLength = totalLength * options.lengthRatio;
  const travelEnvelopeLength = totalLength * options.travelEnvelopeRatio;

  if (totalLength < options.minTotalLengthForShine || shineLength <= EPSILON || options.speedPxPerMs <= 0) {
    return {
      visible: false,
      centerDistance: 0,
      halfLength: shineLength / 2,
      travelEnvelopeLength,
      envelopeAlpha: 0,
      lapStartedAtMs: previousLapStartedAtMs
    };
  }

  const quietGap = totalLength * options.quietGapRatio;
  const cycleLength = totalLength + quietGap;
  let lapStartedAtMs = previousLapStartedAtMs;
  let traveled = Math.max(0, (timeMs - lapStartedAtMs) * options.speedPxPerMs);

  if (traveled >= cycleLength) {
    const overshoot = cycleLength > EPSILON ? traveled % cycleLength : 0;
    lapStartedAtMs = timeMs - (overshoot / options.speedPxPerMs);
    traveled = overshoot;
  }

  const visible = traveled <= totalLength;
  const centerDistance = Math.min(traveled, totalLength);
  const envelopeWindow = Math.max(travelEnvelopeLength, EPSILON);
  const rampIn = Math.min(1, centerDistance / envelopeWindow);
  const rampOut = Math.min(1, (totalLength - centerDistance) / envelopeWindow);
  const envelopeAlpha = visible ? Math.max(0, Math.min(rampIn, rampOut)) : 0;

  return {
    visible,
    centerDistance,
    halfLength: shineLength / 2,
    travelEnvelopeLength,
    envelopeAlpha,
    lapStartedAtMs
  };
}
