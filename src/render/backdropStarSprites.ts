/**
 * MAZER-VIS-066: how the shaped backdrop stars (backdropStarShapes.ts) reach the canvas.
 *
 * Every (glyph, device-px radius, hue step) sprite is baked ONCE into one atlas canvas, all of them up front on the first
 * paint (2 glyphs x 16 radii x 24 hues = 768 small sprites, 840 x 640 device px). A frame then only picks a sprite
 * per star and blits it 1:1 with globalAlpha: no paths, no colour strings, no scaling, no smoothing per frame.
 * (Measured on the throwaway demo, headless 390x844 DPR 3, 4x CPU throttle: backdrop 2.43 ms / frame 11.44 ms against
 * 1.86 / 11.36 ms for the old circles.) Baking inside the frame that also draws from the atlas left most stars undrawn in
 * Chromium, which is why nothing is baked lazily.
 *
 * Crispness: the painter maps each star's css position through the context's own transform, then drops that transform
 * and blits at a whole DEVICE pixel, so every star is pixel-exact at any device pixel ratio (3, 2.625, 2.75 ...).
 * Trap: it must call ctx.resetTransform(), never ctx.setTransform(1, 0, 0, 1, 0, 0): src/boot/canvasResolution.ts patches
 * the game context's setTransform to multiply by the backing resolution, which sends device-pixel blits 3x off-canvas.
 *
 * Every sprite is a hard-edged pointed shape (four-point sparkle or five-point star) in one flat colour, plus at most one
 * lighter core pixel on the bigger ones: no radial gradient, no blur, no halo (owner, 2026-11-19: "actual stars, never
 * glowy lights, soft discs or blurred glow"). Below a minimum device radius a glyph's points merge into a blob, so the
 * painter never picks a smaller sprite (BACKDROP_STAR_MIN_RADIUS_DEV).
 *
 * Tests: tests/render/backdropStarSprites.test.ts.
 */
import Phaser from 'phaser';
import {
  BACKDROP_STAR_GLYPHS,
  BACKDROP_STAR_GLYPH_SPARKLE4,
  BACKDROP_STAR_GLYPH_STAR5,
  BACKDROP_STAR_HUE_STEPS,
  BACKDROP_STAR_PALETTE,
  type BackdropStarShapeList
} from './backdropStarShapes';

/** Largest sprite radius in device px (a near star at DPR 3 at the top of its twinkle is clamped here). */
export const BACKDROP_STAR_MAX_RADIUS_DEV = 16;
const PAD = 1;
/** Side of the square cell of a radius `r` sprite: the centre is a pixel centre, with one clear pixel around. */
export const backdropStarCellSize = (r: number): number => (2 * (r + PAD)) + 1;

/**
 * Smallest device-px radius at which each glyph still reads as a pointed star (by glyph id): a sparkle needs 3 (a 7 px
 * cross with thin arms), a five-point star needs 5 (below that its five points merge into a blob).
 */
export const BACKDROP_STAR_MIN_RADIUS_DEV: Readonly<Record<number, number>> = {
  [BACKDROP_STAR_GLYPH_SPARKLE4]: 3,
  [BACKDROP_STAR_GLYPH_STAR5]: 5
};

/**
 * Sprite radius in device px for a css radius at a device scale: whole, at least `minRadius` (the glyph's
 * BACKDROP_STAR_MIN_RADIUS_DEV in the painter, 1 by default), at most the atlas maximum.
 */
export const resolveBackdropStarDeviceRadius = (radiusCss: number, deviceScale: number, minRadius = 1): number => {
  const scaled = Math.round(radiusCss * deviceScale);
  return scaled >= BACKDROP_STAR_MAX_RADIUS_DEV ? BACKDROP_STAR_MAX_RADIUS_DEV : (scaled > minRadius ? scaled : minRadius);
};

// ---- glyph raster --------------------------------------------------------------------------------------------------
/** The canvas calls the glyph raster uses (a recording fake in tests). */
export interface BackdropStarRasterContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  closePath(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
}

const CHANNEL_MAX = 255;
/** `rgb()` of a packed colour mixed `t` of the way to white (the bright core pixel of the bigger stars). */
const mixToWhite = (color: number, t: number): string => {
  const mix = (channel: number) => Math.round(channel + ((CHANNEL_MAX - channel) * t));
  return `rgb(${mix((color >> 16) & CHANNEL_MAX)},${mix((color >> 8) & CHANNEL_MAX)},${mix(color & CHANNEL_MAX)})`;
};

const starPath = (ctx: BackdropStarRasterContext, cx: number, cy: number, points: number, outer: number, inner: number): void => {
  ctx.beginPath();
  const total = points * 2;
  for (let i = 0; i < total; i += 1) {
    const angle = (-Math.PI / 2) + ((i * Math.PI) / points);
    const r = i % 2 === 0 ? outer : inner;
    const x = cx + (Math.cos(angle) * r);
    const y = cy + (Math.sin(angle) * r);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
};

/** Draw `glyph` of outer radius `r` device px in `color`, centred on the pixel centre (cx, cy). */
export const drawBackdropStarGlyph = (
  ctx: BackdropStarRasterContext,
  glyph: number,
  r: number,
  color: number,
  cx: number,
  cy: number
): void => {
  ctx.fillStyle = mixToWhite(color, 0);
  if (glyph === BACKDROP_STAR_GLYPH_SPARKLE4) {
    // Concave diamond cross: four tips joined by inward-curving sides.
    const k = Math.max(0.35, r * 0.16);
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + k, cy - k, cx + r, cy);
    ctx.quadraticCurveTo(cx + k, cy + k, cx, cy + r);
    ctx.quadraticCurveTo(cx - k, cy + k, cx - r, cy);
    ctx.quadraticCurveTo(cx - k, cy - k, cx, cy - r);
    ctx.closePath();
    ctx.fill();
    if (r >= 4) {
      ctx.fillStyle = mixToWhite(color, 0.45);
      ctx.fillRect(Math.floor(cx), Math.floor(cy), 1, 1);
    }
    return;
  }
  // Classic five-point star, point up.
  starPath(ctx, cx, cy, 5, r, r * 0.45);
  ctx.fill();
  if (r >= 5) {
    ctx.fillStyle = mixToWhite(color, 0.4);
    ctx.fillRect(Math.floor(cx), Math.floor(cy), 1, 1);
  }
};

// ---- atlas ---------------------------------------------------------------------------------------------------------
/** A canvas the atlas can bake into (an HTMLCanvasElement in the browser, a fake in tests). */
export interface BackdropStarAtlasCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): BackdropStarRasterContext | null;
}

/** Row of a (glyph, radius) pair in the atlas; each row holds its 24 hue steps side by side. */
const rowIndex = (glyph: number, r: number): number => (glyph * BACKDROP_STAR_MAX_RADIUS_DEV) + (r - 1);

/** The fixed atlas layout: a row per (glyph, radius), stacked; cell x = hue step x cell size. */
export const resolveBackdropStarAtlasLayout = (): { width: number; height: number; rowY: Int32Array } => {
  const rowY = new Int32Array(BACKDROP_STAR_GLYPHS.length * BACKDROP_STAR_MAX_RADIUS_DEV);
  let y = 0;
  for (const glyph of BACKDROP_STAR_GLYPHS) {
    for (let r = 1; r <= BACKDROP_STAR_MAX_RADIUS_DEV; r += 1) {
      rowY[rowIndex(glyph, r)] = y;
      y += backdropStarCellSize(r);
    }
  }
  return { width: BACKDROP_STAR_HUE_STEPS * backdropStarCellSize(BACKDROP_STAR_MAX_RADIUS_DEV), height: y, rowY };
};

export interface BackdropStarAtlas {
  readonly canvas: BackdropStarAtlasCanvas;
  /** Top-left of the sprite cell in the atlas. */
  cellX(r: number, hueStep: number): number;
  cellY(glyph: number, r: number): number;
}

/** Bake every sprite once into a fresh canvas from `createCanvas`. Null when the canvas has no 2D context. */
export const bakeBackdropStarAtlas = (createCanvas: () => BackdropStarAtlasCanvas): BackdropStarAtlas | null => {
  const layout = resolveBackdropStarAtlasLayout();
  const canvas = createCanvas();
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.clearRect(0, 0, layout.width, layout.height);
  ctx.globalAlpha = 1;
  for (const glyph of BACKDROP_STAR_GLYPHS) {
    for (let r = 1; r <= BACKDROP_STAR_MAX_RADIUS_DEV; r += 1) {
      const cell = backdropStarCellSize(r);
      const y = layout.rowY[rowIndex(glyph, r)];
      for (let hue = 0; hue < BACKDROP_STAR_HUE_STEPS; hue += 1) {
        drawBackdropStarGlyph(ctx, glyph, r, BACKDROP_STAR_PALETTE[hue], (hue * cell) + r + PAD + 0.5, y + r + PAD + 0.5);
      }
    }
  }
  return {
    canvas,
    cellX: (r, hueStep) => hueStep * backdropStarCellSize(r),
    cellY: (glyph, r) => layout.rowY[rowIndex(glyph, r)]
  };
};

// ---- painter -------------------------------------------------------------------------------------------------------
/** The canvas calls the painter uses (a recording fake in tests). */
export interface BackdropStarPaintContext {
  globalAlpha: number;
  getTransform(): { a: number; d: number; e: number; f: number };
  resetTransform(): void;
  drawImage(image: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
}

/**
 * Paint `list` from `atlas`. The context's transform on entry (Phaser SetTransform: camera x object x backing
 * resolution) maps each css position to device px; the transform is then reset and every sprite lands on a whole device
 * pixel. `globalAlpha` on entry (camera alpha x object alpha) is multiplied in and restored. The caller restores the
 * transform (SetTransform saved the context).
 */
export const paintBackdropStarShapeList = (
  ctx: BackdropStarPaintContext,
  list: BackdropStarShapeList,
  atlas: BackdropStarAtlas
): void => {
  const { data, count, stride } = list.view();
  if (count === 0) {
    return;
  }
  const m = ctx.getTransform();
  const deviceScale = m.a > 0 ? m.a : 1;
  ctx.resetTransform();
  const baseAlpha = ctx.globalAlpha;
  const image = atlas.canvas;
  for (let index = 0; index < count; index += 1) {
    const offset = index * stride;
    const glyph = data[offset];
    const r = resolveBackdropStarDeviceRadius(data[offset + 1], deviceScale, BACKDROP_STAR_MIN_RADIUS_DEV[glyph] ?? 1);
    const cell = backdropStarCellSize(r);
    const half = r + PAD;
    const dx = Math.round((m.a * data[offset + 3]) + m.e) - half;
    const dy = Math.round((m.d * data[offset + 4]) + m.f) - half;
    // An out-of-range globalAlpha is ignored by the canvas (the old value stays), so clamp; NaN paints nothing.
    const alpha = data[offset + 5];
    ctx.globalAlpha = baseAlpha * (alpha >= 1 ? 1 : (alpha > 0 ? alpha : 0));
    ctx.drawImage(image, atlas.cellX(r, data[offset + 2]), atlas.cellY(glyph, r), cell, cell, dx, dy, cell, cell);
  }
  ctx.globalAlpha = baseAlpha;
};

// ---- Phaser hook ---------------------------------------------------------------------------------------------------
let sharedAtlas: BackdropStarAtlas | null | undefined;
/** The page's one atlas, baked on first use (scene restarts reuse it). */
const resolveSharedAtlas = (): BackdropStarAtlas | null => {
  if (sharedAtlas === undefined) {
    sharedAtlas = typeof document === 'undefined'
      ? null
      : bakeBackdropStarAtlas(() => document.createElement('canvas') as unknown as BackdropStarAtlasCanvas);
  }
  return sharedAtlas;
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
 * Make `graphics` paint the shaped star `list` when Phaser renders it, in the same display-list slot, with the camera
 * transform and alpha Phaser's own SetTransform sets. Anything in the Graphics command buffer is rendered first by
 * Phaser, unchanged. As a mask (`allowClip`) only the command buffer applies. `atlas` is for tests; the scene uses the
 * page's shared atlas.
 */
export const installBackdropStarSpriteRenderer = (
  graphics: Phaser.GameObjects.Graphics,
  list: BackdropStarShapeList,
  atlas: () => BackdropStarAtlas | null = resolveSharedAtlas
): void => {
  const target = graphics as unknown as { renderCanvas: GraphicsCanvasRender };
  const phaserRender = target.renderCanvas;
  target.renderCanvas = function renderBackdropStarSprites(renderer, src, camera, parentMatrix, renderTargetCtx, allowClip) {
    if (src.commandBuffer.length > 0) {
      phaserRender.call(this, renderer, src, camera, parentMatrix, renderTargetCtx, allowClip);
    }
    if (list.count === 0 || allowClip) {
      return;
    }
    const sprites = atlas();
    if (!sprites) {
      return;
    }
    const ctx = renderTargetCtx ?? renderer.currentContext;
    if (!Phaser.Renderer.Canvas.SetTransform(renderer, ctx, src, camera, parentMatrix)) {
      return;
    }
    camera.addToRenderList(src);
    paintBackdropStarShapeList(ctx as unknown as BackdropStarPaintContext, list, sprites);
    // SetTransform saved the context; this also restores the transform the painter reset.
    ctx.restore();
  };
};
