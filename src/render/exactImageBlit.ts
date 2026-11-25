/**
 * Exact (1:1) canvas blit for a big canvas-backed Image, MAZER-PERF follow-up of PERF-017 (board tile layer cost).
 *
 * Why: under `roundPixels: true` Phaser's canvas renderer draws every Image with its destination grown by HALF a source
 * pixel on each axis (node_modules/phaser/src/renderer/canvas/CanvasRenderer.js, batchSprite: `fw += 0.5; fh += 0.5`).
 * The baked board (boardTileLayer.ts) is a device-pixel texture shown at exactly 1 / resolution, so that half pixel turns
 * a straight copy into a resampled draw of the whole 2.75 Mpx board (level 300, 390x844 at 3x) every frame. WebKit pays
 * about 30 ms a frame for it (docs/playbook-notes/2026-11-24-mazer-board-tile-cost-options.md); a 1:1 copy at a whole
 * device pixel costs almost nothing there and is the same picture without the half-pixel stretch.
 *
 * `resolveExactImageBlit` is pure: it returns the whole device pixel to copy the texture to, or null when the image is
 * not shown 1:1 (any rotation, skew, flip, or a texture that is not exactly `resolution` times its world size, such as
 * the trail canvas, which has its own capped scale). `installExactImageBlit` swaps one Image's renderCanvas for the
 * exact copy and falls back to Phaser's own draw whenever the pure check says no, so it can never draw a wrong size.
 *
 * DORMANT: nothing in the game installs it yet. Only the board cost options page (board-cost-options.html) does, so the
 * page measures the exact code the game would run if this option is picked (tests/architecture/board-cost-options-dormant.test.ts).
 */

/** How far the world scale times the resolution may be from 1 and still count as a 1:1 copy (float32 matrices). */
export const EXACT_BLIT_SCALE_EPSILON = 1e-4;

export interface ExactImageBlitInput {
  /** World transform of the image (own display scale times every parent container), Phaser TransformMatrix a..f. */
  a: number;
  b: number;
  c: number;
  d: number;
  /** World position of the image's top-left (origin 0,0), css px. */
  tx: number;
  ty: number;
  /** Camera viewport offset and scroll (css px); the image's scroll factor. */
  cameraX: number;
  cameraY: number;
  scrollX: number;
  scrollY: number;
  scrollFactorX: number;
  scrollFactorY: number;
  cameraZoom: number;
  cameraRotation: number;
  /** Canvas backing resolution (device px per css px). */
  resolution: number;
  /** Image display origin (must be 0,0: the board is placed by its top-left). */
  originX: number;
  originY: number;
}

export interface ExactImageBlitTarget {
  /** Whole device pixel of the texture's top-left on the game canvas. */
  x: number;
  y: number;
}

const near = (value: number, target: number): boolean => Math.abs(value - target) <= EXACT_BLIT_SCALE_EPSILON;

export const resolveExactImageBlit = (input: ExactImageBlitInput): ExactImageBlitTarget | null => {
  const { resolution } = input;
  if (!Number.isFinite(resolution) || resolution <= 0) return null;
  if (input.originX !== 0 || input.originY !== 0) return null;
  if (input.cameraZoom !== 1 || input.cameraRotation !== 0) return null;
  if (!near(input.b, 0) || !near(input.c, 0)) return null;
  if (!near(input.a * resolution, 1) || !near(input.d * resolution, 1)) return null;
  const x = (input.cameraX + input.tx - (input.scrollX * input.scrollFactorX)) * resolution;
  const y = (input.cameraY + input.ty - (input.scrollY * input.scrollFactorY)) * resolution;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x), y: Math.round(y) };
};

/* ------------------------------------------------------------------------------------------ */
/* Phaser wiring (structural types, so the module does not import Phaser)                      */
/* ------------------------------------------------------------------------------------------ */

interface MatrixLike { a: number; b: number; c: number; d: number; tx: number; ty: number }
interface CameraLike {
  x: number; y: number; scrollX: number; scrollY: number; zoom: number; rotation: number; alpha: number;
  addToRenderList?: (child: unknown) => void;
}
interface CanvasRendererLike {
  currentContext: CanvasRenderingContext2D;
  blendModes: readonly string[];
}
export interface ExactBlitImageLike {
  alpha: number;
  blendMode: number;
  scrollFactorX: number;
  scrollFactorY: number;
  originX: number;
  originY: number;
  texture: { getSourceImage: () => unknown };
  getWorldTransformMatrix: (tempMatrix?: unknown, parentMatrix?: unknown) => MatrixLike;
  renderCanvas: (renderer: unknown, src: unknown, camera: unknown, parentMatrix?: unknown) => void;
}

export interface ExactImageBlitStats {
  exact: number;
  fallback: number;
}

/**
 * Makes `image` draw as an exact 1:1 copy when it is shown 1:1 (else Phaser's own draw). `readResolution` returns the
 * canvas backing resolution (canvasResolution.ts). Returns the stats object and an uninstall function.
 */
export const installExactImageBlit = (
  image: ExactBlitImageLike,
  readResolution: () => number,
  createMatrix: () => unknown
): { stats: ExactImageBlitStats; uninstall: () => void } => {
  const own = Object.prototype.hasOwnProperty.call(image, 'renderCanvas');
  const original = image.renderCanvas;
  const stats: ExactImageBlitStats = { exact: 0, fallback: 0 };
  const temp = createMatrix();
  const tempParent = createMatrix();
  image.renderCanvas = function exactRenderCanvas(renderer, src, camera, parentMatrix) {
    const cam = camera as CameraLike;
    const m = image.getWorldTransformMatrix(temp, tempParent);
    const target = resolveExactImageBlit({
      a: m.a, b: m.b, c: m.c, d: m.d, tx: m.tx, ty: m.ty,
      cameraX: cam.x, cameraY: cam.y, scrollX: cam.scrollX, scrollY: cam.scrollY,
      scrollFactorX: image.scrollFactorX, scrollFactorY: image.scrollFactorY,
      cameraZoom: cam.zoom, cameraRotation: cam.rotation,
      resolution: readResolution(), originX: image.originX, originY: image.originY
    });
    const alpha = cam.alpha * image.alpha;
    if (target === null || alpha <= 0) {
      if (target === null) stats.fallback += 1;
      original.call(image, renderer, src, camera, parentMatrix);
      return;
    }
    cam.addToRenderList?.(src);
    const r = renderer as CanvasRendererLike;
    const ctx = r.currentContext;
    ctx.save();
    // resetTransform, never setTransform(1,0,0,1,0,0): canvasResolution.ts patches setTransform to multiply by the resolution.
    ctx.resetTransform();
    ctx.globalCompositeOperation = (r.blendModes[image.blendMode] ?? 'source-over') as GlobalCompositeOperation;
    ctx.globalAlpha = alpha;
    ctx.drawImage(image.texture.getSourceImage() as CanvasImageSource, target.x, target.y);
    ctx.restore();
    stats.exact += 1;
  };
  return {
    stats,
    uninstall: () => {
      if (own) image.renderCanvas = original;
      else delete (image as Partial<ExactBlitImageLike>).renderCanvas;
    }
  };
};
