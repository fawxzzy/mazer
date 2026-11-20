/**
 * MAZER-VIS-065: the Pinwheel start-tile mark in the play scene, as ONE baked strip shown through ONE Image.
 *
 * BAKE ONCE. All 72 frames of the quarter-turn cycle (startPinwheel.ts) are painted once into a canvas texture
 * (12 x 6 frames), keyed by (tile reach, sub-pixel centre, backing scale, keyline colour). They are painted by the same
 * `drawStartPinwheel` the Guide icon and the unit tests use. Per tick the layer only picks a frame, places the Image and
 * sets its alpha (the breathing): no path is rebuilt per frame, so the per-frame cost is lower than the Graphics redraw
 * it replaces.
 *
 * WHOLE CSS PX. Phaser floors an Image's position under roundPixels (pixelAlignment.ts), so the strip is placed at a
 * whole css offset m from the board image whose device offset m * scale is also whole: the strip's device grid is the
 * baked board's grid, and the mark's centre inside a frame keeps the exact sub-pixel centre the board's own geometry has.
 * At a scale where no such m exists within 24 css px, m is the plain whole css offset (the centre is still exact; the
 * strip is resampled by under a device px).
 */
import type Phaser from 'phaser';
import type { EndpointTileRect } from './endpointTiles';
import { resolveStartTileSkin, type EndpointSkinPainter } from './endpointTileSkins';
import {
  clampBoardDevicePixelRatio,
  resolveBoardTileStyle,
  resolveBoardTileStyleId,
  type BoardTileStyleId
} from './boardTileStyle';
import {
  START_PINWHEEL,
  drawStartPinwheel,
  resolveStartPinwheelClock,
  resolveStartPinwheelFrameRotation,
  resolveStartPinwheelTile,
  scaleStartPinwheelSpec
} from './startPinwheel';

/** Whole css px kept clear around the mark inside each frame. */
const FRAME_PAD_CSS = 2;
const ALIGN_SEARCH_CSS = 24;

/** A whole css offset m <= start whose device offset m * scale is whole (falls back to floor(start)). */
/** The layer draws the start mark when the board is Chip and the start skin is the Pinwheel (Trace keeps its own art). */
export const usesStartPinwheelLayer = (style: BoardTileStyleId | null | undefined, startTileSkin?: string | null): boolean => (
  resolveBoardTileStyleId(style) !== 'trace' && resolveStartTileSkin(startTileSkin) === 'blade-pinwheel'
);

export const resolveStartPinwheelAlignedOffset = (start: number, scale: number): number => {
  const m0 = Math.floor(start);
  for (let m = m0; m > m0 - ALIGN_SEARCH_CSS; m -= 1) {
    const v = m * scale;
    if (Math.abs(v - Math.round(v)) < 1e-4) {
      return m;
    }
  }
  return m0;
};

export interface StartPinwheelPlacement {
  /** Image position (container css px, whole). */
  readonly x: number;
  readonly y: number;
  /** Mark centre inside a frame (device px). */
  readonly fx: number;
  readonly fy: number;
  /** Frame size (device px). */
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly scale: number;
  readonly reach: number;
  readonly extent: number;
}

/**
 * Where the strip goes for a start tile (board-local css px, origin = the layer's `snappedOrigin`), the board image's
 * position and the backing scale. Pure.
 */
export const resolveStartPinwheelPlacement = (
  tile: EndpointTileRect,
  originX: number,
  originY: number,
  boardImageX: number,
  boardImageY: number,
  backingScale: number
): StartPinwheelPlacement => {
  // The same clamp drawBoardMarkers applies, so the strip and the Graphics path fit the same mark.
  const scale = clampBoardDevicePixelRatio(backingScale);
  const spec = resolveStartPinwheelTile(tile, scale);
  const absX = originX + spec.cx;
  const absY = originY + spec.cy;
  const x = boardImageX + resolveStartPinwheelAlignedOffset(absX - spec.extent - FRAME_PAD_CSS - boardImageX, scale);
  const y = boardImageY + resolveStartPinwheelAlignedOffset(absY - spec.extent - FRAME_PAD_CSS - boardImageY, scale);
  const fx = (absX - x) * scale;
  const fy = (absY - y) * scale;
  return {
    x,
    y,
    fx,
    fy,
    frameWidth: Math.ceil(fx + ((spec.extent + FRAME_PAD_CSS) * scale)),
    frameHeight: Math.ceil(fy + ((spec.extent + FRAME_PAD_CSS) * scale)),
    scale,
    reach: spec.reach,
    extent: spec.extent
  };
};

/** CanvasRenderingContext2D through the skin painter interface (non-zero fills, as the Guide's Graphics adapter). */
const canvasPainter = (ctx: CanvasRenderingContext2D): EndpointSkinPainter => ({
  fillStyle: (value) => { ctx.fillStyle = value; },
  strokeStyle: (value) => { ctx.strokeStyle = value; },
  lineWidth: (value) => { ctx.lineWidth = value; },
  begin: () => ctx.beginPath(),
  move: (x, y) => ctx.moveTo(x, y),
  line: (x, y) => ctx.lineTo(x, y),
  close: () => ctx.closePath(),
  circle: (cx, cy, r) => { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, Math.PI * 2); },
  fill: () => ctx.fill('nonzero'),
  stroke: () => ctx.stroke()
});

export interface StartPinwheelShowInput {
  /** The start tile (board-local css px; `BoardTileLayer.endpointTiles.start`). */
  tile: EndpointTileRect;
  /** The board layer's `snappedOrigin`. */
  originX: number;
  originY: number;
  /** The board image's position (`BoardTileLayer.image`). */
  boardImageX: number;
  boardImageY: number;
  backingScale: number;
  /** The board's tile style (the keyline is its void colour). */
  style: BoardTileStyleId;
  /** The marker's alpha (reveal and deconstruct fades); the breathing multiplies it. */
  alpha: number;
  timeMs: number;
  reducedMotion: boolean;
}

export class StartPinwheelLayer {
  readonly image: Phaser.GameObjects.Image;
  private readonly scene: Phaser.Scene;
  private readonly keyBase: string;
  private textureKey: string | null = null;
  private serial = 0;
  private bakeKey = '';
  /** Diagnostics: bakes so far and the last bake's cost (ms) and frame size (device px). */
  bakeCount = 0;
  lastBakeMs = 0;
  lastFrameSize: readonly [number, number] = [0, 0];

  constructor(scene: Phaser.Scene, keyBase: string) {
    this.scene = scene;
    this.keyBase = keyBase;
    this.textureKey = this.nextKey();
    scene.textures.createCanvas(this.textureKey, 1, 1);
    this.image = scene.add.image(0, 0, this.textureKey).setOrigin(0, 0).setVisible(false);
  }

  hide(): void {
    this.image.setVisible(false);
  }

  show(input: StartPinwheelShowInput): void {
    const place = resolveStartPinwheelPlacement(
      input.tile, input.originX, input.originY, input.boardImageX, input.boardImageY, input.backingScale
    );
    const ink = resolveBoardTileStyle(resolveBoardTileStyleId(input.style), 1, place.scale).material.void;
    const key = [
      place.scale, place.fx.toFixed(4), place.fy.toFixed(4), place.reach.toFixed(4), place.frameWidth, place.frameHeight, ink
    ].join('|');
    if (key !== this.bakeKey) {
      this.bake(place, input.tile, ink);
      this.bakeKey = key;
    }
    const clock = resolveStartPinwheelClock(input.timeMs, input.reducedMotion);
    this.image.setFrame(String(clock.frame));
    this.image.setScale(1 / place.scale);
    this.image.setPosition(place.x, place.y);
    this.image.setAlpha(Math.max(0, Math.min(1, input.alpha)) * clock.alpha);
    this.image.setVisible(true);
  }

  /** Removes the strip's texture (the TextureManager outlives the scene). */
  destroy(): void {
    if (this.textureKey !== null && this.scene.textures.exists(this.textureKey)) {
      this.scene.textures.remove(this.textureKey);
    }
    this.textureKey = null;
  }

  private nextKey(): string {
    this.serial += 1;
    return `${this.keyBase}-${this.serial}`;
  }

  private bake(place: StartPinwheelPlacement, tile: EndpointTileRect, ink: number): void {
    const t0 = performance.now();
    const k = START_PINWHEEL;
    const w = Math.max(1, place.frameWidth);
    const h = Math.max(1, place.frameHeight);
    const rows = Math.ceil(k.frames / k.stripColumns);
    if (this.textureKey !== null && this.scene.textures.exists(this.textureKey)) {
      this.image.setTexture('__DEFAULT');
      this.scene.textures.remove(this.textureKey);
    }
    this.textureKey = this.nextKey();
    const texture = this.scene.textures.createCanvas(this.textureKey, w * k.stripColumns, h * rows) as Phaser.Textures.CanvasTexture;
    const ctx = texture.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w * k.stripColumns, h * rows);
    const painter = canvasPainter(ctx);
    const spec = scaleStartPinwheelSpec(resolveStartPinwheelTile(tile, place.scale), place.fx, place.fy, place.scale);
    for (let i = 0; i < k.frames; i += 1) {
      const col = i % k.stripColumns;
      const row = Math.floor(i / k.stripColumns);
      ctx.save();
      ctx.beginPath();
      ctx.rect(col * w, row * h, w, h);
      ctx.clip();
      drawStartPinwheel(painter, ink, spec, resolveStartPinwheelFrameRotation(i), 1, col * w, row * h);
      ctx.restore();
      texture.add(String(i), 0, col * w, row * h, w, h);
    }
    texture.refresh();
    this.image.setTexture(this.textureKey, '0');
    this.bakeCount += 1;
    this.lastBakeMs = performance.now() - t0;
    this.lastFrameSize = [w, h];
  }
}
