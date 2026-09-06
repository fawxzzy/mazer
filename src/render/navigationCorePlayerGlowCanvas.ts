/**
 * Canvas-2D compositor for Navigation Core v1's play-mode player marker glow.
 *
 * The frozen reference locks the player to a 64x64-viewBox rounded square
 * plus `filter: drop-shadow(0 0 3px accent) drop-shadow(0 0 8px core)` -- a
 * real Gaussian-blurred halo around the shape, not a second, larger copy of
 * the shape itself. The prior runtime approximated this (Phaser Graphics has
 * no blur under this game's `type: Phaser.CANVAS` config -- see
 * navigationCoreTrailCanvas.ts's own header comment) with two flat,
 * constant-alpha `fillRoundedRect` calls at increasing spread -- which reads
 * as nested solid rounded-rectangle bodies stepping outward from the core,
 * not light fading away from it, because a flat fill has a hard edge at its
 * own boundary regardless of how low its alpha is.
 *
 * This module draws the same two drop-shadow layers as actual
 * `shadowBlur`/`shadowColor` passes instead: fill the marker's own
 * rounded-rect shape (opaque, in the glow's own color) with shadowBlur set,
 * which paints a real soft halo bleeding outward from every edge, then let
 * the caller draw the crisp, unblurred core on top afterward (same
 * glow-then-core two-pass convention as navigationCoreTrailCanvas.ts) --
 * the opaque shape drawn here is entirely covered by that final crisp core,
 * so only the blurred halo outside its edges ends up visible.
 */

export interface PlayerGlowCanvasDrawOptions {
  /** Subtracted from the shape's own left/top before drawing -- the canvas's local origin, in the same coordinate space the shape's bounds are given in. */
  originX: number;
  originY: number;
  /** The crisp core's own rounded-rect bounds (pre-blur), in the same space as originX/originY. */
  shapeLeft: number;
  shapeTop: number;
  shapeWidth: number;
  shapeHeight: number;
  cornerRadius: number;
  /** 24-bit RGB colors for each drop-shadow layer -- matches the reference's two `drop-shadow()` filters, wide (core-color, larger blur) drawn first, tight (accent-color, smaller blur) drawn second. */
  wideGlowColor: number;
  wideGlowAlpha: number;
  wideGlowBlurPx: number;
  tightGlowColor: number;
  tightGlowAlpha: number;
  tightGlowBlurPx: number;
}

const colorToRgba = (color: number, alpha: number): string => {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

const fillShadowedRoundedRect = (
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  cornerRadius: number,
  fillStyle: string,
  shadowColor: string,
  shadowBlurPx: number
): void => {
  if (shadowBlurPx <= 0) {
    return;
  }
  ctx.shadowBlur = shadowBlurPx;
  ctx.shadowColor = shadowColor;
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  // Manual rounded-rect path -- roundRect() is unsupported in this project's
  // browser support matrix's older entries (see the codebase's other manual
  // rounded-rect stroke/fill call sites); a plain arcTo-based path is what
  // this file's siblings already use.
  const r = Math.min(cornerRadius, width / 2, height / 2);
  ctx.moveTo(left + r, top);
  ctx.lineTo(left + width - r, top);
  ctx.arcTo(left + width, top, left + width, top + r, r);
  ctx.lineTo(left + width, top + height - r);
  ctx.arcTo(left + width, top + height, left + width - r, top + height, r);
  ctx.lineTo(left + r, top + height);
  ctx.arcTo(left, top + height, left, top + height - r, r);
  ctx.lineTo(left, top + r);
  ctx.arcTo(left, top, left + r, top, r);
  ctx.closePath();
  ctx.fill();
};

/**
 * Draws both drop-shadow glow layers into the given 2D context, in the same
 * coordinate space as options.shapeLeft/Top minus originX/originY. Caller is
 * responsible for clearing the canvas first, drawing the crisp core on top
 * afterward (in a separate draw call, no shadow), and
 * translating/positioning the destination image.
 */
export const drawPlayerGlowToCanvasContext = (
  ctx: CanvasRenderingContext2D,
  options: PlayerGlowCanvasDrawOptions
): void => {
  ctx.save();
  const left = options.shapeLeft - options.originX;
  const top = options.shapeTop - options.originY;
  fillShadowedRoundedRect(
    ctx,
    left,
    top,
    options.shapeWidth,
    options.shapeHeight,
    options.cornerRadius,
    colorToRgba(options.wideGlowColor, options.wideGlowAlpha),
    colorToRgba(options.wideGlowColor, options.wideGlowAlpha),
    options.wideGlowBlurPx
  );
  fillShadowedRoundedRect(
    ctx,
    left,
    top,
    options.shapeWidth,
    options.shapeHeight,
    options.cornerRadius,
    colorToRgba(options.tightGlowColor, options.tightGlowAlpha),
    colorToRgba(options.tightGlowColor, options.tightGlowAlpha),
    options.tightGlowBlurPx
  );
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.restore();
};

export interface PlayerGlowCanvasBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The world-space bounding box the player's own shape plus its largest glow
 * radius needs, expanded by `padding` on every side -- what the caller
 * should size/position the backing canvas to, so the glow is never clipped
 * at the canvas edge.
 */
export const computePlayerGlowCanvasBounds = (
  shapeLeft: number,
  shapeTop: number,
  shapeWidth: number,
  shapeHeight: number,
  padding: number
): PlayerGlowCanvasBounds => ({
  left: shapeLeft - padding,
  top: shapeTop - padding,
  width: shapeWidth + (padding * 2),
  height: shapeHeight + (padding * 2)
});
