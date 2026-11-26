/**
 * Board layer frame cache, MAZER-PERF-017 follow-up (board tile layer cost, option A "exact board copy" of
 * board-cost-options.html, done so that nothing visible changes).
 *
 * Why: under `roundPixels: true` Phaser's canvas renderer draws every Image with its destination grown by half a css
 * pixel (node_modules/phaser/src/renderer/canvas/CanvasRenderer.js, batchSprite: `fw += 0.5; fh += 0.5`), so the baked
 * board (boardTileLayer.ts, a device-pixel texture of about 2.75 Mpx at level 300, 390x844 at 3x) is RESAMPLED every
 * frame, even though nothing about it changed. WebKit pays about 30 ms a frame for that draw
 * (docs/playbook-notes/2026-11-24-mazer-board-tile-cost-options.md).
 *
 * What: the first option, a plain 1:1 copy of the texture, is cheap but not the same picture (the grown destination
 * stretches the board by up to 1.5 device px at its far edge, so every tile edge sits a fraction of a device px
 * elsewhere). This module keeps today's picture exactly: when the board image has drawn the same thing for a couple of
 * frames, it runs Phaser's own draw ONCE into an offscreen layer the size of the game canvas (same transform, same
 * stretch, same resampling), then every following frame copies that layer 1:1 at device pixel (0, 0). The copy is the
 * resampled board, so the frame shows the same pixels; only the per-frame resample is gone.
 *
 * Safe by construction: the layer is used only while every input of the draw is unchanged (a key of the board texture's
 * content version, the image and parent transforms, camera, alpha, canvas size and resolution). Anything that changes
 * (the build/teardown reveal, zoom, resize, theme rebake, a scene restart) simply draws through Phaser as before and the
 * layer is refilled once the picture holds still again. Normal blend only, no mask, no crop, no per-frame allocation.
 *
 * Lost pixels: the key cannot see the browser discarding the layer's backing store (a canvas `contextlost` on Chrome, iOS
 * memory pressure or backgrounding), so the layer is also dropped on the layer canvas `contextlost` / `contextrestored`
 * and when the document becomes visible again; the next still frames refill it with one Phaser draw. Listeners are added
 * when the layer canvas is created and removed in release().
 *
 * Key assumption: the board image sits at origin (0, 0) with no flip (boardTileLayer.ts: setOrigin(0, 0), never flipped).
 * The key reads originX/originY/flipX/flipY, so a future setOrigin / setFlip already changes it; but the fill itself relies
 * on the layer being drawn at device (0, 0) 1:1, which only holds for that placement. A change to the origin or flip
 * policy must revisit this module (the "origin 0,0, no flip" test pins it).
 *
 * Kill switch: `?boardLayerCache=0` leaves the board image on Phaser's own draw.
 */

/** Frames the draw inputs must hold still before the layer is filled (so a reveal / zoom animation never pays the fill). */
export const BOARD_LAYER_CACHE_STABLE_FRAMES = 2;

/** `?boardLayerCache=0` (or `off`) turns the cache off. Anything else leaves it on. Never throws. */
export const resolveBoardLayerCacheEnabled = (search: string | null | undefined): boolean => {
  try {
    const raw = new URLSearchParams(search ?? '').get('boardLayerCache');
    return !(raw === '0' || raw === 'off' || raw === 'false');
  } catch {
    return true;
  }
};

interface MatrixLike { a: number; b: number; c: number; d: number; tx?: number; ty?: number; e?: number; f?: number }

interface CameraLike {
  alpha: number;
  scrollX: number;
  scrollY: number;
  roundPixels: boolean;
  renderRoundPixels?: boolean;
  matrix: MatrixLike & { e: number; f: number };
  addToRenderList?: (child: unknown) => void;
}

interface CacheCanvasLike {
  width: number;
  height: number;
  getContext: (type: '2d') => CacheContextLike | null;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

/** The slice of `document` used to notice the page coming back to the foreground. */
export interface BoardLayerCacheVisibilityTargetLike {
  visibilityState?: string;
  addEventListener: (type: 'visibilitychange', listener: () => void) => void;
  removeEventListener: (type: 'visibilitychange', listener: () => void) => void;
}

interface CacheContextLike {
  save(): void;
  restore(): void;
  resetTransform(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: unknown, dx: number, dy: number): void;
  globalAlpha: number;
  globalCompositeOperation: string;
  isContextLost?: () => boolean;
}

interface CanvasRendererLike {
  currentContext: CacheContextLike & { canvas: { width: number; height: number } };
}

export interface BoardLayerCacheImageLike {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  originX: number;
  originY: number;
  flipX: boolean;
  flipY: boolean;
  alpha: number;
  blendMode: number;
  scrollFactorX: number;
  scrollFactorY: number;
  isCropped?: boolean;
  mask?: unknown;
  frame: { cutWidth: number; cutHeight: number; source?: { resolution?: number } };
  renderCanvas: (renderer: unknown, src: unknown, camera: unknown, parentMatrix?: unknown) => void;
  once?: (event: string, listener: () => void) => unknown;
}

export interface BoardLayerCacheStats {
  /** Frames drawn as a 1:1 copy of the layer. */
  hits: number;
  /** Times the layer was (re)filled by Phaser's own draw. */
  fills: number;
  /** Frames drawn through Phaser because the picture had not held still yet, or could not be cached. */
  passes: number;
}

export interface BoardLayerCacheOptions {
  /** Content version of the board texture; bumped whenever the baked/composed pixels change. */
  readVersion: () => number;
  /** Backing resolution (device px per css px) the game context multiplies its transforms by. */
  readResolution: (context: unknown) => number;
  /** Makes the layer's setTransform multiply by the resolution, as the game context's does (canvasResolution.ts). */
  patchResolution: (context: unknown, resolution: number) => void;
  /** Offscreen canvas factory (default: a DOM canvas). */
  createCanvas?: () => CacheCanvasLike;
  /** Where `visibilitychange` is heard (default: `document` when there is one). */
  visibilityTarget?: BoardLayerCacheVisibilityTargetLike | null;
  stableFrames?: number;
}

export interface BoardLayerCacheHandle {
  stats: BoardLayerCacheStats;
  /** Forget the layer (the next stable frames refill it). */
  invalidate: () => void;
  /** Runtime switch (benchmarks, diagnostics): off = Phaser's own draw on every frame. On by default. */
  setEnabled: (enabled: boolean) => void;
  /** Free the layer's memory and put Phaser's own draw back. */
  uninstall: () => void;
}

// Fixed key layout (one reused array, compared field by field).
const KEY_LENGTH = 38;

const defaultCreateCanvas = (): CacheCanvasLike => document.createElement('canvas') as unknown as CacheCanvasLike;

export const installBoardLayerFrameCache = (
  image: BoardLayerCacheImageLike,
  options: BoardLayerCacheOptions
): BoardLayerCacheHandle => {
  const own = Object.prototype.hasOwnProperty.call(image, 'renderCanvas');
  const original = image.renderCanvas;
  const stats: BoardLayerCacheStats = { hits: 0, fills: 0, passes: 0 };
  const stableNeeded = Math.max(1, options.stableFrames ?? BOARD_LAYER_CACHE_STABLE_FRAMES);
  let key = new Float64Array(KEY_LENGTH);
  let next = new Float64Array(KEY_LENGTH);
  let haveKey = false;
  let stable = 0;
  let layerCanvas: CacheCanvasLike | null = null;
  let layerContext: CacheContextLike | null = null;
  let layerValid = false;
  let layerResolution = Number.NaN;
  let enabled = true;

  const invalidate = (): void => {
    haveKey = false;
    stable = 0;
    layerValid = false;
  };

  // The browser may have dropped the layer's pixels without telling the key: forget the layer and its context state.
  const onLayerPixelsLost = (): void => {
    layerResolution = Number.NaN; // a lost/restored context starts from default state: re-patch before the next fill
    invalidate();
  };
  const onVisibilityChange = (): void => {
    if (visibilityTarget?.visibilityState === 'visible') onLayerPixelsLost();
  };
  const visibilityTarget: BoardLayerCacheVisibilityTargetLike | null = options.visibilityTarget !== undefined
    ? options.visibilityTarget
    : (typeof document !== 'undefined' ? document as unknown as BoardLayerCacheVisibilityTargetLike : null);
  let listeningCanvas: CacheCanvasLike | null = null;
  let listeningVisibility = false;
  const listen = (canvas: CacheCanvasLike): void => {
    canvas.addEventListener?.('contextlost', onLayerPixelsLost);
    canvas.addEventListener?.('contextrestored', onLayerPixelsLost);
    listeningCanvas = canvas;
    if (visibilityTarget && !listeningVisibility) {
      visibilityTarget.addEventListener('visibilitychange', onVisibilityChange);
      listeningVisibility = true;
    }
  };
  const unlisten = (): void => {
    listeningCanvas?.removeEventListener?.('contextlost', onLayerPixelsLost);
    listeningCanvas?.removeEventListener?.('contextrestored', onLayerPixelsLost);
    listeningCanvas = null;
    if (visibilityTarget && listeningVisibility) {
      visibilityTarget.removeEventListener('visibilitychange', onVisibilityChange);
      listeningVisibility = false;
    }
  };

  const writeKey = (
    out: Float64Array,
    renderer: CanvasRendererLike,
    camera: CameraLike,
    parent: MatrixLike | undefined,
    resolution: number
  ): void => {
    const canvas = renderer.currentContext.canvas;
    const cam = camera.matrix;
    let i = 0;
    out[i++] = options.readVersion();
    out[i++] = resolution;
    out[i++] = canvas.width;
    out[i++] = canvas.height;
    out[i++] = image.x;
    out[i++] = image.y;
    out[i++] = image.scaleX;
    out[i++] = image.scaleY;
    out[i++] = image.rotation;
    out[i++] = image.originX;
    out[i++] = image.originY;
    out[i++] = image.flipX ? 1 : 0;
    out[i++] = image.flipY ? 1 : 0;
    out[i++] = image.alpha;
    out[i++] = camera.alpha;
    out[i++] = image.scrollFactorX;
    out[i++] = image.scrollFactorY;
    out[i++] = camera.scrollX;
    out[i++] = camera.scrollY;
    out[i++] = camera.roundPixels ? 1 : 0;
    out[i++] = camera.renderRoundPixels ? 1 : 0;
    out[i++] = cam.a;
    out[i++] = cam.b;
    out[i++] = cam.c;
    out[i++] = cam.d;
    out[i++] = cam.e;
    out[i++] = cam.f;
    if (parent) {
      out[i++] = 1;
      out[i++] = parent.a;
      out[i++] = parent.b;
      out[i++] = parent.c;
      out[i++] = parent.d;
      out[i++] = parent.e ?? parent.tx ?? 0;
      out[i++] = parent.f ?? parent.ty ?? 0;
    } else {
      out[i++] = 0;
      i += 6;
    }
    out[i++] = image.frame.cutWidth;
    out[i++] = image.frame.cutHeight;
    out[i++] = image.frame.source?.resolution ?? 1;
  };

  const sameKey = (): boolean => {
    for (let i = 0; i < KEY_LENGTH; i += 1) {
      if (key[i] !== next[i]) return false;
    }
    return true;
  };

  image.renderCanvas = function boardLayerCachedRenderCanvas(renderer, src, camera, parentMatrix) {
    const r = renderer as CanvasRendererLike;
    const cam = camera as CameraLike;
    const game = r.currentContext;
    const resolution = options.readResolution(game);
    const cacheable = enabled
      && image.blendMode === 0
      && !image.isCropped
      && !image.mask
      && Number.isFinite(resolution)
      && resolution > 0
      && cam.alpha * image.alpha > 0
      && game.canvas.width > 0
      && game.canvas.height > 0;
    if (!cacheable) {
      invalidate();
      stats.passes += 1;
      original.call(image, renderer, src, camera, parentMatrix);
      return;
    }

    writeKey(next, r, cam, parentMatrix as MatrixLike | undefined, resolution);
    if (haveKey && sameKey()) {
      stable += 1;
    } else {
      const swap = key;
      key = next;
      next = swap;
      haveKey = true;
      stable = 0;
      layerValid = false;
    }

    if (!layerValid && stable < stableNeeded) {
      stats.passes += 1;
      original.call(image, renderer, src, camera, parentMatrix);
      return;
    }

    if (!layerValid) {
      // One draw through Phaser itself, aimed at the offscreen layer: same matrices, same grown destination, same smoothing.
      if (layerCanvas === null) {
        layerCanvas = (options.createCanvas ?? defaultCreateCanvas)();
        layerContext = layerCanvas.getContext('2d');
        layerResolution = Number.NaN;
        listen(layerCanvas);
      }
      if (layerContext === null || layerContext.isContextLost?.() === true) {
        invalidate();
        stats.passes += 1;
        original.call(image, renderer, src, camera, parentMatrix);
        return;
      }
      if (layerCanvas.width !== game.canvas.width || layerCanvas.height !== game.canvas.height) {
        layerCanvas.width = game.canvas.width;
        layerCanvas.height = game.canvas.height;
        layerResolution = Number.NaN;
      }
      if (layerResolution !== resolution) {
        options.patchResolution(layerContext, resolution);
        layerResolution = resolution;
      }
      layerContext.resetTransform();
      layerContext.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
      r.currentContext = layerContext as CanvasRendererLike['currentContext'];
      try {
        original.call(image, renderer, src, camera, parentMatrix);
      } finally {
        r.currentContext = game;
      }
      layerValid = true;
      stats.fills += 1;
    } else {
      cam.addToRenderList?.(src);
    }

    game.save();
    // resetTransform, never setTransform(1,0,0,1,0,0): canvasResolution.ts patches setTransform to multiply by the resolution.
    game.resetTransform();
    game.globalAlpha = 1;
    game.globalCompositeOperation = 'source-over';
    game.drawImage(layerCanvas, 0, 0);
    game.restore();
    stats.hits += 1;
  };

  const release = (): void => {
    unlisten();
    layerValid = false;
    if (layerCanvas !== null) {
      layerCanvas.width = 0;
      layerCanvas.height = 0;
    }
    layerCanvas = null;
    layerContext = null;
  };
  image.once?.('destroy', release);

  return {
    stats,
    invalidate,
    setEnabled: (value) => {
      enabled = value;
      if (!value) invalidate();
    },
    uninstall: () => {
      release();
      if (own) image.renderCanvas = original;
      else delete (image as Partial<BoardLayerCacheImageLike>).renderCanvas;
    }
  };
};
