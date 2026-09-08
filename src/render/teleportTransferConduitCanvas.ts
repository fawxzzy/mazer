/**
 * Canvas-2D compositor for the single-primary Teleport transfer conduit,
 * consuming teleportTransferPresentation.ts's pure output. Draws NOTHING
 * itself when that projection reports a closed state (openFraction <= 0)
 * -- the frozen contract's own "Prohibited regressions" list requires
 * zero conduit/glow/packet/rail pixels there, and this module's very
 * first check enforces exactly that before touching the context at all.
 *
 * This game runs `type: Phaser.CANVAS` (src/boot/phaserConfig.ts), so, like
 * navigationCoreTrailCanvas.ts and navigationCoreGoalHaloCanvas.ts before
 * it, this module reaches for a real CanvasRenderingContext2D rather than
 * any WebGL-only Phaser postFX/preFX pipeline:
 * - a single continuous stroked path with round joins/caps plus
 *   `shadowBlur`/`shadowColor` for the conduit's own soft glow (the same
 *   technique navigationCoreTrailCanvas.ts already uses for the play
 *   trail, not a new one);
 * - `drawGoalHaloToCanvasContext` (navigationCoreGoalHaloCanvas.ts) is
 *   REUSED directly, unmodified, for the target-end "contained one-cell
 *   energy" -- the frozen contract's own container flare is the same
 *   soft radial-gradient shape Navigation Core's goal halo already
 *   established and tested, not a re-derivation.
 *
 * Shared energy material (frozen contract: "one continuous distance/time
 * phase across conduit, packet, and target flare together, not
 * independent unrelated colors per element"): the caller supplies
 * `energyColorAtDistance(distancePx)`, a pure function sampling the SAME
 * canonical Navigation-Core-locked palette the play trail already uses
 * (sampleTrailEnergyColor / NAVIGATION_CORE_TRAIL_ENERGY_STOPS), at a
 * real distance along the conduit measured from `conduitStartPoint`.
 * This module never samples the palette itself, but it DOES vary the
 * conduit's own color spatially by calling that function at several
 * points along the stroked segment (real distance-based variation, not
 * one flat color per frame) -- reusing navigationCoreTrailCanvas.ts's
 * own chunked multi-segment stroker (`drawTrailToCanvasContext`)
 * directly for this, the same tested technique that already avoids
 * banding/corner artifacts for the play trail, not a re-derivation. The
 * traveling packet's glow and the target flare's outer color each sample
 * the SAME function at their own real position along that axis (the
 * packet's current distance from conduitStartPoint; the flare at the
 * conduit's full source-to-target distance) -- one continuous material,
 * not independently-colored parts. The packet's compact core stays
 * white-hot regardless (the frozen contract's one explicit exception to
 * "every decorative glint is a four-point sparkle" -- a payload, not
 * decoration).
 *
 * Conduit extent (frozen contract: "the conduit begins at that measured,
 * transformed tip and is drawn beneath the shell, so the shell's own art
 * masks the first few conduit pixels"): this module ALWAYS strokes
 * between `conduitStartPoint` and `conduitEndPoint` -- it never derives
 * the illuminated extent itself by branching on `packetVisible` (an
 * earlier version of this module did exactly that, which drew a
 * correctly-growing segment while a packet traveled but then jumped to
 * redrawing a full fixed-endpoint-to-fixed-endpoint line the instant
 * `packetVisible` turned false, since the two conventions -- "grow from
 * source" for delivery, "grow toward source" for extraction -- silently
 * disagreed about which endpoint was fixed; see
 * teleportTransferPresentation.ts's own module doc, "Conduit coverage vs.
 * packet position", for the full account). `conduitStartPoint`/
 * `conduitEndPoint` are that presentation module's fix: `conduitEndPoint`
 * is already guaranteed to equal the fully-extended tip's position the
 * instant a packet stops traveling, so this module drawing that segment
 * unconditionally is what makes the line continuous across that
 * boundary -- it is not itself responsible for the continuity, only for
 * not re-introducing a seam by second-guessing the presentation layer.
 * The packet marker is drawn separately, only when `packetVisible`.
 * Masking the first few pixels at the source so the beam never appears
 * to originate from transparent canvas space is a DRAW-ORDER concern
 * (the real shell Image must be composited on top of this canvas), not
 * something this module clips internally -- documented on
 * drawTeleportTransferConduitToCanvasContext below.
 */
import { drawGoalHaloToCanvasContext } from './navigationCoreGoalHaloCanvas';
import { drawTrailToCanvasContext, type TrailCanvasSegment } from './navigationCoreTrailCanvas';
import type { TeleportTransferPoint } from './teleportTransferPresentation';

const colorToRgba = (color: number, alpha: number): string => {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

// Granularity for spatial color sampling along the conduit -- short
// enough that a full-length conduit shows real, visible color drift
// (matching the play trail's own per-position variation), long enough
// not to spam tiny stroke segments for a routine short conduit.
const CONDUIT_COLOR_SAMPLE_SPACING_PX = 14;

export interface TeleportTransferConduitDrawOptions {
  /** Subtracted from every point's x/y before drawing -- the canvas's own local origin, in the same coordinate space every point below is given in. */
  originX: number;
  originY: number;
  /** The target-flare's own center -- see teleportTransferPresentation.ts's targetPoint. */
  targetPoint: TeleportTransferPoint;
  /** The segment to stroke, unconditional on packetVisible -- see teleportTransferPresentation.ts's own conduitStartPoint/conduitEndPoint doc. */
  conduitStartPoint: TeleportTransferPoint;
  conduitEndPoint: TeleportTransferPoint;
  /** Null while no packet is traveling (delivery flash, extraction closure tail, or the reduced-motion stable window). */
  packetPoint: TeleportTransferPoint | null;
  packetVisible: boolean;
  /** 0 => this function draws nothing at all (enforced as an early return, not merely a visual near-zero). Also the conduit segment's overall alpha. */
  openFraction: number;
  targetFlareIntensity: number;
  /**
   * Samples the SAME shared energy material at a real distance (px)
   * along the conduit, measured from conduitStartPoint -- see module doc
   * above. Called once per color sample along the stroked segment, plus
   * once for the packet (at its own current distance) and once for the
   * target flare (at the conduit's full length).
   */
  energyColorAtDistance: (distancePx: number) => number;
  conduitCoreWidth: number;
  conduitGlowWidth: number;
  conduitGlowBlurPx: number;
  packetRadius: number;
  targetFlareRadius: number;
}

const distanceBetween = (a: TeleportTransferPoint, b: TeleportTransferPoint): number => (
  Math.hypot(b.x - a.x, b.y - a.y)
);

/**
 * Builds real TrailCanvasSegment[] for the straight conduitStartPoint ->
 * conduitEndPoint run, sampling energyColorAtDistance at each sub-segment
 * boundary so the stroke shows genuine spatial color variation instead
 * of one flat color -- exported so the sampling itself is directly
 * unit-testable without a canvas.
 */
export const buildTeleportTransferConduitSegments = (
  start: TeleportTransferPoint,
  end: TeleportTransferPoint,
  alpha: number,
  energyColorAtDistance: (distancePx: number) => number
): TrailCanvasSegment[] => {
  const totalLength = distanceBetween(start, end);
  if (totalLength <= 0 || alpha <= 0) {
    return [];
  }
  const steps = Math.max(1, Math.ceil(totalLength / CONDUIT_COLOR_SAMPLE_SPACING_PX));
  const segments: TrailCanvasSegment[] = [];
  let previous = start;
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const current = {
      x: start.x + ((end.x - start.x) * t),
      y: start.y + ((end.y - start.y) * t)
    };
    // Sample at the sub-segment's midpoint distance -- a representative
    // color for that stretch, not just its trailing edge.
    const sampleDistance = totalLength * (t - (0.5 / steps));
    const color = energyColorAtDistance(sampleDistance);
    segments.push({ previous, current, glowColor: color, coreColor: color, alpha });
    previous = current;
  }
  return segments;
};

/**
 * Draws the conduit's glow pass, core stroke, traveling packet, and target
 * flare into the given 2D context, in the same coordinate space as every
 * point in `options` minus originX/originY. Caller is responsible for:
 * - clearing the canvas first;
 * - positioning/scaling/showing the destination image afterward;
 * - compositing the REAL canonical shell Image on top of this canvas at
 *   the source end, so the shell's own art masks the first few conduit
 *   pixels (frozen contract) -- this function draws the conduit's full
 *   extent starting exactly at sourcePoint and relies entirely on that
 *   external draw order for the masking, it does not clip or inset its
 *   own stroke to fake it.
 *
 * Draws absolutely nothing (leaves the context untouched) when
 * `openFraction <= 0` -- the frozen contract's own closed-state
 * requirement ("openFraction <= 0 must render zero conduit/glow/packet/
 * rail pixels"), verified in tests by asserting zero recorded calls.
 */
export const drawTeleportTransferConduitToCanvasContext = (
  ctx: CanvasRenderingContext2D,
  options: TeleportTransferConduitDrawOptions
): void => {
  if (options.openFraction <= 0) {
    return;
  }

  const originX = options.originX;
  const originY = options.originY;

  // While a packet travels, the conduit stays near-full brightness (matching
  // the existing eight-origin volley's own growth alpha, which stays close
  // to 1 throughout its travel rather than fading in from 0) -- only its
  // LENGTH grows, via conduitEndPoint, not its opacity. Once no packet is
  // traveling, openFraction is the segment's own fade (the delivery flash /
  // extraction closure tail / reduced-motion stable-then-closing window).
  const conduitAlpha = options.packetVisible
    ? Math.max(0.85, clamp01(options.openFraction))
    : clamp01(options.openFraction);

  if (conduitAlpha > 0) {
    const segments = buildTeleportTransferConduitSegments(
      options.conduitStartPoint,
      options.conduitEndPoint,
      conduitAlpha,
      options.energyColorAtDistance
    );
    drawTrailToCanvasContext(ctx, segments, {
      originX,
      originY,
      coreWidth: options.conduitCoreWidth,
      glowWidth: options.conduitGlowWidth,
      glowAlphaRatio: 0.45,
      glowBlurPx: options.conduitGlowBlurPx
    });
  }

  if (options.packetVisible && options.packetPoint !== null && options.packetRadius > 0) {
    const packet = { x: options.packetPoint.x - originX, y: options.packetPoint.y - originY };
    const packetDistance = distanceBetween(options.conduitStartPoint, options.packetPoint);
    const packetGlowColor = options.energyColorAtDistance(packetDistance);
    ctx.save();
    ctx.shadowColor = colorToRgba(packetGlowColor, 0.9);
    ctx.shadowBlur = options.conduitGlowBlurPx;
    // A compact white-hot center is the one frozen-contract exception to
    // "every decorative glint is a four-point sparkle" -- the packet is a
    // payload, not decoration, and keeps a round core deliberately.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(packet.x, packet.y, options.packetRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (options.targetFlareIntensity > 0 && options.targetFlareRadius > 0) {
    const flareDistance = distanceBetween(options.conduitStartPoint, options.targetPoint);
    const flareColor = options.energyColorAtDistance(flareDistance);
    drawGoalHaloToCanvasContext(ctx, {
      originX,
      originY,
      centerX: options.targetPoint.x,
      centerY: options.targetPoint.y,
      radius: options.targetFlareRadius,
      innerColor: 0xffffff,
      innerAlpha: clamp01(options.targetFlareIntensity),
      outerColor: flareColor,
      outerAlpha: clamp01(options.targetFlareIntensity) * 0.6
    });
  }
};

export interface TeleportTransferConduitCanvasBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The world-space bounding box this conduit needs (source, target, and a
 * generous padding for the glow/flare radii), what the caller should
 * size/position the backing canvas to.
 */
export const computeTeleportTransferConduitCanvasBounds = (
  sourcePoint: TeleportTransferPoint,
  targetPoint: TeleportTransferPoint,
  padding: number
): TeleportTransferConduitCanvasBounds => {
  const left = Math.min(sourcePoint.x, targetPoint.x) - padding;
  const top = Math.min(sourcePoint.y, targetPoint.y) - padding;
  const right = Math.max(sourcePoint.x, targetPoint.x) + padding;
  const bottom = Math.max(sourcePoint.y, targetPoint.y) + padding;
  return { left, top, width: right - left, height: bottom - top };
};
