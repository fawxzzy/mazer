/**
 * Canvas-2D compositor for Navigation Core v1's goal-star ambient halo.
 *
 * The frozen reference's own `.end-halo` is a single CSS radial-gradient
 * circle -- a smooth, continuous falloff from its inner color/opacity down
 * to fully transparent at its outer edge. The prior runtime approximated it
 * with two flat, constant-alpha `fillCircle` calls (a smaller inner-color
 * disc on top of a larger outer-color disc) -- each disc has a hard edge at
 * its own radius regardless of how low its alpha is, so this read as two
 * sharply bounded "target" discs rather than one soft glow (flagged in
 * review). The ring and hollow star drawn on top of this halo are NOT part
 * of this module -- only the halo underneath them is affected.
 *
 * `CanvasRenderingContext2D.createRadialGradient` is a native, exact match
 * for the reference's own technique here (unlike the player marker's
 * drop-shadow glow, where `shadowBlur` was the closer fit) -- Phaser
 * Graphics has no gradient fill at all, but this game's Canvas renderer
 * gives direct access to a real 2D context that does.
 */

export interface GoalHaloCanvasDrawOptions {
  /** Subtracted from centerX/centerY before drawing -- the canvas's own local origin, in the same coordinate space centerX/centerY are given in. */
  originX: number;
  originY: number;
  centerX: number;
  centerY: number;
  /** Outer radius where the gradient reaches fully transparent. */
  radius: number;
  /** 24-bit RGB -- the hot inner color, peaking at the gradient's center. */
  innerColor: number;
  innerAlpha: number;
  /** 24-bit RGB -- the cooler outer color the gradient blooms into before fading to transparent. */
  outerColor: number;
  outerAlpha: number;
}

const colorToRgba = (color: number, alpha: number): string => {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

/**
 * Draws the goal's ambient halo as one continuous radial gradient into the
 * given 2D context, in the same coordinate space as centerX/centerY minus
 * originX/originY. Caller is responsible for clearing the canvas first and
 * for positioning/scaling the destination image afterward.
 */
export const drawGoalHaloToCanvasContext = (
  ctx: CanvasRenderingContext2D,
  options: GoalHaloCanvasDrawOptions
): void => {
  if (options.radius <= 0) {
    return;
  }
  const cx = options.centerX - options.originX;
  const cy = options.centerY - options.originY;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, options.radius);
  gradient.addColorStop(0, colorToRgba(options.innerColor, options.innerAlpha));
  gradient.addColorStop(0.45, colorToRgba(options.outerColor, options.outerAlpha));
  gradient.addColorStop(1, colorToRgba(options.outerColor, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, options.radius, 0, Math.PI * 2);
  ctx.fill();
};

export interface GoalHaloCanvasBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The world-space bounding box the halo's own radius needs, expanded by
 * `padding` on every side -- what the caller should size/position the
 * backing canvas to.
 */
export const computeGoalHaloCanvasBounds = (
  centerX: number,
  centerY: number,
  radius: number,
  padding: number
): GoalHaloCanvasBounds => ({
  left: centerX - radius - padding,
  top: centerY - radius - padding,
  width: (radius + padding) * 2,
  height: (radius + padding) * 2
});
