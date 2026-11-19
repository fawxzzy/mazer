/**
 * How the backdrop star field reaches the canvas (MAZER-PERF-014).
 *
 * Measured cause of the star field's ~4.5 ms per frame (headless Chromium, 390x844 at DPR 3, 4x CPU throttle): the star
 * field is ~360 small filled circles, one fill style each (every star has its own twinkle alpha), and it is replayed
 * through Phaser's Graphics canvas renderer every frame. That renderer turns every fill style into a fresh
 * `'rgba(r,g,b,a)'` string (a float-to-string of the alpha) that the browser then has to parse, once per circle per
 * frame. In a replay of the real frame's circles that string work was about 60 % of the cost (2.9 ms of path + fill +
 * style, 1.8 ms of it the style strings alone); the arcs and fills themselves were about 0.8 ms.
 *
 * What this module does instead, with the same picture:
 *  - The scene fills a flat draw list (colour, alpha, x, y, radius per circle, in draw order) instead of pushing
 *    fillStyle / fillCircle commands into the Graphics command buffer.
 *  - The backdrop Graphics object keeps its place in the display list, but its canvas renderer paints the list:
 *    the colour as a cached `#rrggbb` string set only when it changes (a star's halo and core share one colour), the
 *    alpha through `globalAlpha` (a number, no string), then one beginPath / arc / fill per circle, exactly as before.
 *    Same circles, same order, same colour and alpha; the replay measured pixel-identical (max difference 0/255).
 *
 * Rejected on evidence: a baked star canvas (PR #661: the full-screen drawImage cost more than the circles), merging
 * circles into one path per fill (stars have continuous alphas, so nothing would merge without quantising, and merging
 * overlapping circles would change how they blend), and fillRect squares (a different look).
 *
 * Tests: tests/render/backdropStarBatch.test.ts. No Phaser at import time (the canvas hook reads it lazily).
 */
import Phaser from 'phaser';

/** Values per circle in the draw list: colour, alpha, x, y, radius. */
const STRIDE = 5;
/** Starting room: 240 stars draw at most 4 circles each. */
const INITIAL_CIRCLES = 1024;
/** The colour-string cache is cleared past this many colours (the rainbow stars sweep ~1,500 packed colours a lap). */
export const BACKDROP_STAR_STYLE_CACHE_LIMIT = 4096;

/** The draw list one backdrop frame paints. Reused frame to frame: `reset()` keeps the storage. */
export class BackdropStarDrawList {
  private data = new Float64Array(INITIAL_CIRCLES * STRIDE);
  private circleCount = 0;

  /** Circles in the list. */
  get count(): number {
    return this.circleCount;
  }

  /** Empty the list for the next frame. */
  reset(): void {
    this.circleCount = 0;
  }

  /** Append one filled circle: the same arguments as Graphics.fillStyle(color, alpha) then fillCircle(x, y, radius). */
  fillCircle(color: number, alpha: number, x: number, y: number, radius: number): void {
    const offset = this.circleCount * STRIDE;
    if (offset + STRIDE > this.data.length) {
      const grown = new Float64Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    this.data[offset] = color;
    this.data[offset + 1] = alpha;
    this.data[offset + 2] = x;
    this.data[offset + 3] = y;
    this.data[offset + 4] = radius;
    this.circleCount += 1;
  }

  /** Circle `index` as plain values (tests and diagnostics; the renderer reads the storage directly). */
  circleAt(index: number): { color: number; alpha: number; x: number; y: number; radius: number } {
    const offset = index * STRIDE;
    return {
      color: this.data[offset],
      alpha: this.data[offset + 1],
      x: this.data[offset + 2],
      y: this.data[offset + 3],
      radius: this.data[offset + 4]
    };
  }

  /** The raw storage and length, for the painter. */
  view(): { data: Float64Array; count: number } {
    return { data: this.data, count: this.circleCount };
  }
}

const styleCache = new Map<number, string>();
const PACKED_RGB_RANGE = 1 << 24;

/** `#rrggbb` for a packed 0xRRGGBB colour, cached (no allocation after the first time a colour is seen). */
export const resolveBackdropStarFillStyle = (color: number): string => {
  let style = styleCache.get(color);
  if (style === undefined) {
    if (styleCache.size >= BACKDROP_STAR_STYLE_CACHE_LIMIT) {
      styleCache.clear();
    }
    // Packed 24-bit RGB plus a leading 1 bit, so toString(16) always gives 7 digits; drop the 1 for zero padding.
    style = `#${((color & (PACKED_RGB_RANGE - 1)) | PACKED_RGB_RANGE).toString(16).slice(1)}`;
    styleCache.set(color, style);
  }
  return style;
};

/** The part of CanvasRenderingContext2D the painter uses (a fake one in tests). */
export interface BackdropStarCanvasContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  beginPath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  fill(): void;
}

const FULL_TURN = Math.PI * 2;

/**
 * Paint the list in order. `globalAlpha` on entry is the object's own alpha (Phaser sets camera alpha x object alpha
 * before calling the renderer) and is multiplied in, then restored, exactly as an rgba fill under that globalAlpha.
 */
export const paintBackdropStarDrawList = (ctx: BackdropStarCanvasContext, list: BackdropStarDrawList): void => {
  const { data, count } = list.view();
  if (count === 0) {
    return;
  }
  const baseAlpha = ctx.globalAlpha;
  let currentColor = -1;
  for (let index = 0; index < count; index += 1) {
    const offset = index * STRIDE;
    const color = data[offset];
    if (color !== currentColor) {
      currentColor = color;
      ctx.fillStyle = resolveBackdropStarFillStyle(color);
    }
    // An rgba() alpha outside 0..1 is clamped by CSS, but an out-of-range globalAlpha is ignored (the old value stays),
    // so clamp here: light mode's starAlphaScale (1.08) can push a bright star past 1. NaN paints nothing.
    const alpha = data[offset + 1];
    ctx.globalAlpha = baseAlpha * (alpha >= 1 ? 1 : (alpha > 0 ? alpha : 0));
    ctx.beginPath();
    ctx.arc(data[offset + 2], data[offset + 3], data[offset + 4], 0, FULL_TURN, false);
    ctx.fill();
  }
  ctx.globalAlpha = baseAlpha;
};

type GraphicsCanvasRender = (
  renderer: Phaser.Renderer.Canvas.CanvasRenderer,
  src: Phaser.GameObjects.Graphics,
  camera: Phaser.Cameras.Scene2D.Camera,
  parentMatrix?: Phaser.GameObjects.Components.TransformMatrix,
  renderTargetCtx?: CanvasRenderingContext2D,
  allowClip?: boolean
) => void;

/**
 * Make `graphics` paint `list` when Phaser renders it, in the same display-list slot and with the same camera transform
 * and alpha (Phaser's own SetTransform). Anything still drawn into the Graphics command buffer is rendered first by
 * Phaser's renderer, unchanged. As a mask (`allowClip`) only the command buffer applies.
 */
export const installBackdropStarCanvasRenderer = (
  graphics: Phaser.GameObjects.Graphics,
  list: BackdropStarDrawList
): void => {
  const target = graphics as unknown as { renderCanvas: GraphicsCanvasRender };
  const phaserRender = target.renderCanvas;
  target.renderCanvas = function renderBackdropStars(renderer, src, camera, parentMatrix, renderTargetCtx, allowClip) {
    if (src.commandBuffer.length > 0) {
      phaserRender.call(this, renderer, src, camera, parentMatrix, renderTargetCtx, allowClip);
    }
    if (list.count === 0 || allowClip) {
      return;
    }
    const ctx = renderTargetCtx ?? renderer.currentContext;
    if (!Phaser.Renderer.Canvas.SetTransform(renderer, ctx, src, camera, parentMatrix)) {
      return;
    }
    camera.addToRenderList(src);
    paintBackdropStarDrawList(ctx, list);
    // SetTransform saved the context.
    ctx.restore();
  };
};
