/**
 * Edge beam + diamond-fill art (MAZER-VIS-030): the pure geometry and the draw helpers behind the laser pulses and the
 * colour that fills and drains inside each edge diamond. Timing lives in edgeBeamTimeline.ts; this module only turns a
 * state (fill 0..1, head/tail 0..1) into shapes.
 *
 * - Diamond fill: the diamond's own outline polygon cut by a plane perpendicular to its long (inward) axis. The colour
 *   is ALWAYS anchored at the INNER tip (the end the beams touch and leave through): a fill GROWS from the inner tip
 *   toward the outer tip, and a drain is that same motion run backwards, so the colour leaves from the OUTER tip first
 *   and the last of it exits at the inner tip, toward where the outgoing laser shoots out. One shape function, one
 *   direction, so a diamond can never show two different fills. A one-pixel bright front line sits on the cut while it
 *   moves. Reduced motion: no sweeping front, the whole interior crossfades by alpha instead.
 * - Beam (MAZER-VIS-038): one colour (the player's, trailPalette.PLAYER_COLOR). A beam is a steady STREAM between its
 *   source end (tail) and sink end (head): a soft bloom (two wide, low-alpha strokes), a body whose alpha ramps up toward the
 *   head (a few nested spans, so no seam and no per-segment overdraw), short bright dashes that flow tail -> head at a fixed
 *   px/s speed (so the beam visibly keeps flowing while it is attached), and a pulsing head. While the beam is still
 *   attached at its source end (a diamond that is still draining) the tail end gets a pulsing port glow too. Both ends sit
 *   on the diamond's INNERMOST point (the tip that faces the board; edgeMarkers.ts `resolveEdgeInnerTip`), snapped to a
 *   device pixel: the head touches the diamond at the very instant the fill starts and the tail stays on it until the
 *   drain is over. The layer counts are small on purpose (the cost was five times the old beam): see BEAM_*_LAYERS.
 * - Contact ripple: one thin ring on the contact point, growing and fading over the pulse window.
 * - Crisp on fractional DPR: line ends and widths snap to the device pixel grid (`snapToDevice`).
 *
 * Colours: PLAYER_COLOR and mixes of it toward white (trailPalette.mixPaletteRgb) only. No Phaser import.
 */
import { cyberArcadeMaterial } from './cyberArcadeMaterial';
import { PLAYER_COLOR, mixPaletteRgb } from './trailPalette';

export interface ArtPoint {
  readonly x: number;
  readonly y: number;
}

/** The slice of Phaser Graphics the art uses (structurally the same as edgeMarkers' `EdgeGraphics`). */
export interface ArtGraphics {
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

/** Peak alpha of the interior fill (the border stroke stays on top). */
export const DIAMOND_FILL_ALPHA = 0.82;
/** The fill front line and the beam head are this far from PLAYER_COLOR toward white. */
export const BEAM_HOT_MIX = 0.55;
export const BEAM_PEAK_ALPHA = 0.95;
export const BEAM_BODY_LAYERS = 5;
export const BEAM_BODY_MIN_WIDTH_PX = 1;
export const BEAM_BODY_MAX_WIDTH_PX = 2;
export const BEAM_BLOOM_OUTER_PX = 9;
export const BEAM_BLOOM_OUTER_ALPHA = 0.2;
export const BEAM_BLOOM_INNER_PX = 5;
export const BEAM_BLOOM_INNER_ALPHA = 0.36;
export const BEAM_BLOOM_LAYERS = 3;
export const BEAM_HEAD_RADIUS_PX = 2.2;
export const BEAM_HEAD_HALO_RADIUS_PX = 5.5;
export const BEAM_HEAD_PULSE_PX = 0.7;
/** Head pulse period; derived from the clock so it is deterministic. */
export const BEAM_HEAD_PULSE_PERIOD_MS = 120;
export const RIPPLE_START_RADIUS_PX = 4;
export const RIPPLE_END_RADIUS_PX = 15;
export const RIPPLE_PEAK_ALPHA = 0.55;
export const RIPPLE_SEGMENTS = 14;
/** The stream: short bright dashes flowing tail -> head (never more than BEAM_STREAM_MAX_DASHES per beam). */
export const BEAM_STREAM_DASH_PX = 9;
export const BEAM_STREAM_MIN_SPACING_PX = 56;
export const BEAM_STREAM_MAX_DASHES = 8;
export const BEAM_STREAM_SPEED_PX_PER_S = 260;
export const BEAM_STREAM_ALPHA = 0.85;
export const BEAM_PORT_HALO_RADIUS_PX = 4.5;

const WHITE: number = cyberArcadeMaterial.rail.white;

const clampUnit = (value: number): number => (
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
);

/** Centre of the device pixel containing `value` (so a 1-device-px line is crisp), in css px. */
export const snapToDevice = (value: number, devicePixelRatio: number): number => (
  devicePixelRatio > 0 && Number.isFinite(devicePixelRatio) ? (Math.floor(value * devicePixelRatio) + 0.5) / devicePixelRatio : value
);

/** A line width in css px rounded to a whole number of device pixels, at least one. */
export const snapWidthToDevice = (width: number, devicePixelRatio: number): number => (
  devicePixelRatio > 0 && Number.isFinite(devicePixelRatio)
    ? Math.max(1, Math.round(width * devicePixelRatio)) / devicePixelRatio
    : width
);

/**
 * Clip a convex polygon to the half-plane `dot(p - origin, axis) >= offset` (keep 'ge') or `<= offset` (keep 'le').
 * Sutherland-Hodgman; returns [] when nothing is left.
 */
export const clipPolygonAlongAxis = (
  vertices: ReadonlyArray<ArtPoint>,
  origin: ArtPoint,
  axis: ArtPoint,
  offset: number,
  keep: 'ge' | 'le'
): ArtPoint[] => {
  const sign = keep === 'ge' ? 1 : -1;
  const signed = (point: ArtPoint): number => sign * ((((point.x - origin.x) * axis.x) + ((point.y - origin.y) * axis.y)) - offset);
  const out: ArtPoint[] = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index] as ArtPoint;
    const next = vertices[(index + 1) % vertices.length] as ArtPoint;
    const a = signed(current);
    const b = signed(next);
    if (a >= 0) {
      out.push(current);
    }
    if ((a >= 0) !== (b >= 0)) {
      const t = a / (a - b);
      out.push({ x: current.x + ((next.x - current.x) * t), y: current.y + ((next.y - current.y) * t) });
    }
  }
  return out;
};

export interface DiamondFillShape {
  /** The filled part of the diamond (empty when fill is 0). */
  readonly polygon: ReadonlyArray<ArtPoint>;
  /** The moving edge of the fill (null when empty, full, or when no chord exists). */
  readonly front: readonly [ArtPoint, ArtPoint] | null;
}

/**
 * The part of a diamond that is filled at `fill` 0..1. `vertices` is the OUTLINE polygon, `center` its centre,
 * `inwardAngle` the direction of its long axis (the end it points to is the INNER tip) and `halfHeight` its half length
 * along that axis. The region is [inner tip .. inner tip - fill * length] for a rising fill (incoming beam) and a falling
 * one (outgoing beam) alike. Exactly 0 -> nothing, exactly 1 -> the whole outline.
 */
export const resolveDiamondFillShape = (
  vertices: ReadonlyArray<ArtPoint>,
  center: ArtPoint,
  inwardAngle: number,
  halfHeight: number,
  fill: number
): DiamondFillShape => {
  const level = clampUnit(fill);
  if (level <= 0) {
    return { polygon: [], front: null };
  }
  if (level >= 1) {
    return { polygon: vertices, front: null };
  }
  const axis = { x: Math.cos(inwardAngle), y: Math.sin(inwardAngle) };
  const length = 2 * halfHeight;
  const offset = halfHeight - (length * level);
  const polygon = clipPolygonAlongAxis(vertices, center, axis, offset, 'ge');
  // The front chord: the two clipped vertices that lie on the cutting plane.
  const onPlane = polygon.filter((point) => Math.abs((((point.x - center.x) * axis.x) + ((point.y - center.y) * axis.y)) - offset) < 1e-6);
  const front = onPlane.length >= 2 ? ([onPlane[0] as ArtPoint, onPlane[onPlane.length - 1] as ArtPoint] as const) : null;
  return { polygon, front };
};

const tracePolygon = (graphics: ArtGraphics, polygon: ReadonlyArray<ArtPoint>): void => {
  graphics.beginPath();
  polygon.forEach((point, index) => {
    if (index === 0) {
      graphics.moveTo(point.x, point.y);
    } else {
      graphics.lineTo(point.x, point.y);
    }
  });
  graphics.closePath();
};

export interface DiamondFillDraw {
  readonly vertices: ReadonlyArray<ArtPoint>;
  readonly center: ArtPoint;
  readonly inwardAngle: number;
  readonly halfHeight: number;
  readonly fill: number;
  /** Reduced motion: no sweeping front, the whole interior is drawn at alpha = fill. */
  readonly crossfade: boolean;
}

/** Fill the inside of one diamond. Drawn BEFORE its outline stroke. Nothing at fill 0. */
export const drawDiamondFill = (graphics: ArtGraphics, input: DiamondFillDraw): void => {
  const level = clampUnit(input.fill);
  if (level <= 0) {
    return;
  }
  if (input.crossfade) {
    tracePolygon(graphics, input.vertices);
    graphics.fillStyle(PLAYER_COLOR, DIAMOND_FILL_ALPHA * level);
    graphics.fillPath();
    return;
  }
  const shape = resolveDiamondFillShape(input.vertices, input.center, input.inwardAngle, input.halfHeight, level);
  if (shape.polygon.length < 3) {
    return;
  }
  tracePolygon(graphics, shape.polygon);
  graphics.fillStyle(PLAYER_COLOR, DIAMOND_FILL_ALPHA);
  graphics.fillPath();
  if (shape.front) {
    graphics.lineStyle(1, mixPaletteRgb(PLAYER_COLOR, WHITE, BEAM_HOT_MIX), 0.9);
    graphics.lineBetween(shape.front[0].x, shape.front[0].y, shape.front[1].x, shape.front[1].y);
  }
};

/** Equal per-layer alpha so that `layers` stacked layers reach `peak` where they all overlap (the head end). */
export const resolveLayerAlpha = (peak: number, layers: number): number => (
  1 - ((1 - clampUnit(peak)) ** (1 / Math.max(1, layers)))
);

/** Start fraction (0 at the tail .. <1) of gradient layer `index` of `layers`: spaced so the brightness piles up at the head. */
export const resolveLayerStart = (index: number, layers: number): number => (
  (Math.max(0, index) / Math.max(1, layers)) ** 1.25
);

export interface BeamPulseDraw {
  /** The source end of the visible beam (the tail; the diamond's inner tip while an outgoing beam is still draining it). */
  readonly tailPoint: ArtPoint;
  /** The leading end (the head; the diamond's inner tip once an incoming beam has landed). */
  readonly headPoint: ArtPoint;
  /** Laser clock in ms: only used to flow the stream and pulse the head/port. */
  readonly clockMs: number;
  readonly devicePixelRatio: number;
  /** True while the tail is still held at the source (a diamond is still being fed or emptied): draws the pulsing port glow on the tail end. */
  readonly tailPort?: boolean;
}

/** Where the stream's dashes start along a beam of `length` css px at laser clock `clockMs` (distances from the tail). */
export const resolveStreamDashStarts = (length: number, clockMs: number): number[] => {
  if (!(length > 1)) {
    return [];
  }
  const spacing = Math.max(BEAM_STREAM_MIN_SPACING_PX, length / BEAM_STREAM_MAX_DASHES);
  const travelled = (((Number.isFinite(clockMs) ? clockMs : 0) * BEAM_STREAM_SPEED_PX_PER_S) / 1000) % spacing;
  const starts: number[] = [];
  for (let start = travelled; start < length && starts.length < BEAM_STREAM_MAX_DASHES; start += spacing) {
    starts.push(start);
  }
  return starts;
};

/** One beam: bloom, ramped body, flowing stream dashes and a pulsing head (and port while attached). PLAYER_COLOR family only. */
export const drawBeamPulse = (graphics: ArtGraphics, input: BeamPulseDraw): void => {
  const dpr = input.devicePixelRatio;
  const tail = { x: snapToDevice(input.tailPoint.x, dpr), y: snapToDevice(input.tailPoint.y, dpr) };
  const head = { x: snapToDevice(input.headPoint.x, dpr), y: snapToDevice(input.headPoint.y, dpr) };
  const spanFrom = (fraction: number): ArtPoint => ({
    x: tail.x + ((head.x - tail.x) * fraction),
    y: tail.y + ((head.y - tail.y) * fraction)
  });
  const clock = Number.isFinite(input.clockMs) ? input.clockMs : 0;
  const pulse = 0.5 + (0.5 * Math.sin((clock / BEAM_HEAD_PULSE_PERIOD_MS) * Math.PI * 2));
  const hot = mixPaletteRgb(PLAYER_COLOR, WHITE, BEAM_HOT_MIX);
  // A fixed set of strokes per beam (a zero-length one paints nothing), so a beam is a constant-size group of draw calls.
  // Bloom: two wide, low-alpha gradients under the body.
  for (const [width, peak] of [[BEAM_BLOOM_OUTER_PX, BEAM_BLOOM_OUTER_ALPHA], [BEAM_BLOOM_INNER_PX, BEAM_BLOOM_INNER_ALPHA]] as const) {
    const alpha = resolveLayerAlpha(peak, BEAM_BLOOM_LAYERS);
    graphics.lineStyle(snapWidthToDevice(width, dpr), PLAYER_COLOR, alpha);
    for (let layer = 0; layer < BEAM_BLOOM_LAYERS; layer += 1) {
      const from = spanFrom(resolveLayerStart(layer, BEAM_BLOOM_LAYERS));
      graphics.lineBetween(from.x, from.y, head.x, head.y);
    }
  }
  // Body: alpha ramps toward the head (a steady stream, never thinner than one layer), width tapers tail -> head.
  const bodyAlpha = resolveLayerAlpha(BEAM_PEAK_ALPHA, BEAM_BODY_LAYERS);
  for (let layer = 0; layer < BEAM_BODY_LAYERS; layer += 1) {
    const taper = BEAM_BODY_LAYERS > 1 ? layer / (BEAM_BODY_LAYERS - 1) : 1;
    graphics.lineStyle(
      snapWidthToDevice(BEAM_BODY_MIN_WIDTH_PX + ((BEAM_BODY_MAX_WIDTH_PX - BEAM_BODY_MIN_WIDTH_PX) * taper), dpr),
      PLAYER_COLOR,
      bodyAlpha
    );
    const from = spanFrom(resolveLayerStart(layer, BEAM_BODY_LAYERS));
    graphics.lineBetween(from.x, from.y, head.x, head.y);
  }
  // Stream: bright dashes flowing tail -> head, one device pixel wide.
  const length = Math.hypot(head.x - tail.x, head.y - tail.y);
  if (length > 1) {
    graphics.lineStyle(snapWidthToDevice(1, dpr), hot, BEAM_STREAM_ALPHA);
    for (const start of resolveStreamDashStarts(length, clock)) {
      const end = Math.min(length, start + BEAM_STREAM_DASH_PX);
      const a = spanFrom(start / length);
      const b = spanFrom(end / length);
      graphics.lineBetween(a.x, a.y, b.x, b.y);
    }
  }
  if (input.tailPort === true) {
    graphics.fillStyle(PLAYER_COLOR, 0.3);
    graphics.fillCircle(tail.x, tail.y, BEAM_PORT_HALO_RADIUS_PX + (BEAM_HEAD_PULSE_PX * (1 - pulse)));
  }
  graphics.fillStyle(PLAYER_COLOR, 0.28);
  graphics.fillCircle(head.x, head.y, BEAM_HEAD_HALO_RADIUS_PX + (BEAM_HEAD_PULSE_PX * pulse));
  graphics.fillStyle(hot, BEAM_PEAK_ALPHA);
  graphics.fillCircle(head.x, head.y, BEAM_HEAD_RADIUS_PX + (BEAM_HEAD_PULSE_PX * pulse * 0.5));
};

/** One thin ring on the contact point; `progress` 0..1 over the pulse window (nothing outside it). */
export const drawContactRipple = (
  graphics: ArtGraphics,
  center: ArtPoint,
  progress: number,
  devicePixelRatio: number
): void => {
  if (!(progress > 0 && progress < 1)) {
    return;
  }
  const radius = RIPPLE_START_RADIUS_PX + ((RIPPLE_END_RADIUS_PX - RIPPLE_START_RADIUS_PX) * progress);
  graphics.lineStyle(snapWidthToDevice(1, devicePixelRatio), PLAYER_COLOR, RIPPLE_PEAK_ALPHA * ((1 - progress) ** 2));
  graphics.beginPath();
  for (let step = 0; step < RIPPLE_SEGMENTS; step += 1) {
    const angle = (step / RIPPLE_SEGMENTS) * Math.PI * 2;
    const x = center.x + (Math.cos(angle) * radius);
    const y = center.y + (Math.sin(angle) * radius);
    if (step === 0) {
      graphics.moveTo(x, y);
    } else {
      graphics.lineTo(x, y);
    }
  }
  graphics.closePath();
  graphics.strokePath();
};
