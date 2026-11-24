/**
 * SPARK, the player skin picked by the owner on 2026-11-19 (L7; see skinRegistry.ts): a faceted kite that points where
 * the player travels and turns with it, with a kite-shaped find-me ping.
 *
 * Material: the player carries the TRAIL's shifting colour instead of flat green. Every colour comes from trailPalette.ts
 * (`sampleIridescentTrail`): the core and bloom stops, the hue sweep and the sheen. The kite is sampled at the trail head
 * (the same point the end star's border and the edge diamonds read, so the kite, the trail beside it and those borders are
 * one colour), and its rear facets half a tile further back along the sweep, so the colour visibly flows across the body
 * as the hue moves.
 *
 * Shape (tile-relative, local frame with +x = heading): nose (noseTileRatio, 0), wing tips (0, +/-wingTileRatio), tail
 * (-tailTileRatio, 0); four facets meet at the centre. Front-upper facet = core eased toward white (the catchlight),
 * front-lower = core, rear-upper = the rear core, rear-lower = the rear bloom colour (the shadow side). A dark keyline
 * (boardMaterial.void, the end markers' keyline width) separates it from the trail running through the tile.
 *
 * Motion (same rules as the chip marker, playerMarker.ts): a small stretch along the heading while gliding, a slow breath
 * (frozen in reduced motion). Turning: `SparkHeading` eases the drawn angle toward the travel direction along the shortest
 * arc (time constant `turnTimeConstantMs`), so a direction change reads as the kite turning with you; reduced motion snaps.
 * Before the first move of a level the kite faces the start direction (the first step of the solution path).
 *
 * Cost: one sample of the palette per facet pair (two per frame), a handful of Graphics path calls, no gradients and no
 * per-frame allocation (module scratch records; the heading state mutates numbers). The soft glow is a shadowBlur fill of
 * the same kite on the scene's existing player-glow canvas (`drawSparkGlowToCanvasContext`).
 *
 * Pure: no Date, no Math.random. The draw is a function of (geometry, angle, colours, timeMs, pingStartMs, reducedMotion).
 */
import { BOARD_TILE_GEOMETRY, boardMaterial, clampBoardDevicePixelRatio, snapLineWidth } from './boardTileStyle';
import { PLAYER_LOCATOR, resolvePingRingProgress, resolvePlayerLocatorMetrics } from './playerLocator';
import { samplePlayerColour } from './playerColour';
import { PALETTE_WHITE, mixPaletteRgb, type IridescentTrailSample, type TrailPaletteHeadSample } from './trailPalette';
import type { StartDirection } from './startDirection';
import { withCosmeticColours } from '../theme/cosmeticScope';

export const SPARK_PLAYER = Object.freeze({
  /** Kite points, as shares of the tile: the nose stays inside the tile at the top of a breath. */
  noseTileRatio: 0.44,
  wingTileRatio: 0.27,
  tailTileRatio: 0.29,
  /** Glide stretch: along the heading x(1 + stretch), across x(1 - stretch * squeeze). */
  glideStretch: 0.1,
  glideSqueeze: 0.6,
  /** Breath (frozen in reduced motion). */
  breathePeriodMs: 1500,
  breatheAmount: 0.06,
  /** Turning: exponential ease toward the heading, this time constant (ms). */
  turnTimeConstantMs: 45,
  /** Front-upper facet: core eased this far toward white. */
  catchlightLift: 0.5,
  /** Rear facets sample the palette this many tiles behind the head (toward the trail's tail). */
  rearSampleTiles: 0.5,
  /** Rear-lower facet: rear bloom eased this far toward the rear core so the shadow side never goes muddy. */
  shadowLift: 0.3,
  keylineOfRadius: BOARD_TILE_GEOMETRY.endpoint.keylineOfRadius,
  keylineAlpha: 0.9,
  /** Kite ping ring proportions (r = travel radius): nose r, wings 0.62 r, tail 0.7 r. */
  pingWingRatio: 0.62,
  pingTailRatio: 0.7,
  /** The two shadowBlur glow layers, blur radii as shares of the tile (as the chip marker's glow). */
  glow: Object.freeze({
    tightBlurTileRatio: 3 / 64,
    tightAlpha: (0xee / 0xff) * 0.55,
    wideBlurTileRatio: 9 / 64,
    wideAlpha: (0x99 / 0xff) * 0.55
  })
});

/** The subset of Phaser.GameObjects.Graphics Spark paints with (a fake in tests). */
export interface SparkGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  beginPath(): unknown;
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  closePath(): unknown;
  fillPath(): unknown;
  strokePath(): unknown;
}

const START_DIRECTION_ANGLE: Readonly<Record<StartDirection, number>> = Object.freeze({
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2
});

/** Screen angle (radians, y down) of a start direction; `up` when unknown. */
export const resolveStartDirectionAngle = (direction: StartDirection | null | undefined): number => (
  direction ? START_DIRECTION_ANGLE[direction] : START_DIRECTION_ANGLE.up
);

const TAU = Math.PI * 2;

/** Signed shortest turn from `from` to `to`, in (-PI, PI]. */
export const resolveShortestTurn = (from: number, to: number): number => {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) {
    delta -= TAU;
  } else if (delta <= -Math.PI) {
    delta += TAU;
  }
  return delta;
};

/**
 * The drawn heading. Feed it once per frame with the glide's heading (zero while the glide has not moved since a reset)
 * and the start direction's angle. A zero heading SNAPS to the start direction (a new level never spins in from the last
 * one); a heading eases toward its angle along the shortest arc; reduced motion snaps. Mutates numbers only.
 */
export class SparkHeading {
  private angleRad = START_DIRECTION_ANGLE.up;
  private clockMs = Number.NaN;

  get angle(): number {
    return this.angleRad;
  }

  update(timeMs: number, headingX: number, headingY: number, restAngle: number, reducedMotion: boolean): number {
    const moving = Number.isFinite(headingX) && Number.isFinite(headingY) && (headingX !== 0 || headingY !== 0);
    const target = moving ? Math.atan2(headingY, headingX) : restAngle;
    const dtMs = Number.isFinite(this.clockMs) && Number.isFinite(timeMs) ? timeMs - this.clockMs : Number.NaN;
    this.clockMs = timeMs;
    if (!moving || reducedMotion || !Number.isFinite(dtMs) || dtMs < 0 || dtMs > 1000) {
      this.angleRad = target;
      return this.angleRad;
    }
    const share = 1 - Math.exp(-dtMs / SPARK_PLAYER.turnTimeConstantMs);
    const next = this.angleRad + (resolveShortestTurn(this.angleRad, target) * share);
    this.angleRad = Math.abs(resolveShortestTurn(next, target)) < 1e-4 ? target : next;
    return this.angleRad;
  }
}

export interface SparkMaterial {
  /** Front-upper facet (catchlight), front-lower facet, rear-upper facet, rear-lower facet. */
  catchlight: number;
  core: number;
  rear: number;
  shadow: number;
  /** Bloom colour at the head: the wide glow and the ping's halo. */
  glow: number;
}

export const createSparkMaterial = (): SparkMaterial => ({ catchlight: 0, core: 0, rear: 0, shadow: 0, glow: 0 });

const SAMPLE_HEAD: IridescentTrailSample = { core: 0, glow: 0, wave: 0, sheen: 0 };
const SAMPLE_REAR: IridescentTrailSample = { core: 0, glow: 0, wave: 0, sheen: 0 };

/**
 * The kite's colours from the trail palette. Same inputs and rule as `resolveSharedBorderColor` (trailPalette.ts): the
 * trail head sample when there is a trail (null in the menu: distance 0 on the scene clock), reduced motion or an
 * un-animated trail stop the sheen and swell; the hue sweep always follows the clock. Fills and returns `out`.
 */
export const resolveSparkMaterial = (
  head: TrailPaletteHeadSample | null | undefined,
  timeMs: number,
  reducedMotion: boolean,
  out: SparkMaterial
): SparkMaterial => {
  const distance = Number.isFinite(head?.distanceTiles) ? (head?.distanceTiles ?? 0) : 0;
  const time = Number.isFinite(head?.timeMs) ? (head?.timeMs ?? timeMs) : timeMs;
  const stopped = reducedMotion || head?.animated === false;
  const front = samplePlayerColour(distance, time, stopped, SAMPLE_HEAD);
  const rear = samplePlayerColour(distance - SPARK_PLAYER.rearSampleTiles, time, stopped, SAMPLE_REAR);
  out.core = front.core;
  out.glow = front.glow;
  out.catchlight = mixPaletteRgb(front.core, PALETTE_WHITE, SPARK_PLAYER.catchlightLift);
  out.rear = rear.core;
  out.shadow = mixPaletteRgb(rear.glow, rear.core, SPARK_PLAYER.shadowLift);
  return out;
};

/** The kite's four points in css px, after heading, glide stretch and breath. */
export interface SparkFrame {
  centerX: number;
  centerY: number;
  angle: number;
  noseX: number;
  noseY: number;
  leftX: number;
  leftY: number;
  tailX: number;
  tailY: number;
  rightX: number;
  rightY: number;
  /** Largest distance any point can reach from the centre (top of a breath, full stretch): sizes the glow canvas. */
  reachCss: number;
  keylineCss: number;
}

export const createSparkFrame = (): SparkFrame => ({
  centerX: 0, centerY: 0, angle: 0,
  noseX: 0, noseY: 0, leftX: 0, leftY: 0, tailX: 0, tailY: 0, rightX: 0, rightY: 0,
  reachCss: 0, keylineCss: 0
});

export interface SparkFrameInput {
  centerX: number;
  centerY: number;
  tileSize: number;
  devicePixelRatio: number;
  timeMs: number;
  reducedMotion: boolean;
  /** Drawn heading (radians, screen space: 0 = right, PI/2 = down). */
  angle: number;
  /** Glide pose 0 (rest) .. 1 (mid-step). */
  motionAmount: number;
}

/** Largest reach of the kite from its centre for a tile size (nose, top of a breath, full glide stretch). */
export const resolveSparkReach = (tileSize: number): number => (
  Math.max(0, tileSize) * SPARK_PLAYER.noseTileRatio * (1 + SPARK_PLAYER.glideStretch) * (1 + SPARK_PLAYER.breatheAmount)
);

/** Fills `out` with the kite's geometry for one frame. Pure. */
export const resolveSparkFrame = (input: SparkFrameInput, out: SparkFrame): SparkFrame => {
  const k = SPARK_PLAYER;
  const tile = Math.max(0, input.tileSize);
  const scale = clampBoardDevicePixelRatio(input.devicePixelRatio);
  const stretch = Math.max(0, Math.min(1, input.motionAmount)) * k.glideStretch;
  const breathe = input.reducedMotion ? 1 : 1 + (Math.sin((input.timeMs / k.breathePeriodMs) * TAU) * k.breatheAmount);
  const along = (1 + stretch) * breathe;
  const across = (1 - (stretch * k.glideSqueeze)) * breathe;
  const nose = tile * k.noseTileRatio * along;
  const tail = tile * k.tailTileRatio * along;
  const wing = tile * k.wingTileRatio * across;
  const cos = Math.cos(input.angle);
  const sin = Math.sin(input.angle);
  const cx = input.centerX;
  const cy = input.centerY;
  out.centerX = cx;
  out.centerY = cy;
  out.angle = input.angle;
  out.noseX = cx + (cos * nose);
  out.noseY = cy + (sin * nose);
  out.tailX = cx - (cos * tail);
  out.tailY = cy - (sin * tail);
  // Local (0, -wing) is the upper wing (screen-left of the heading); (0, +wing) the lower one.
  out.leftX = cx + (sin * wing);
  out.leftY = cy - (cos * wing);
  out.rightX = cx - (sin * wing);
  out.rightY = cy + (cos * wing);
  out.reachCss = resolveSparkReach(tile);
  out.keylineCss = snapLineWidth((tile / 2) * k.keylineOfRadius, scale);
  return out;
};

const kitePath = (g: SparkGraphics, f: SparkFrame): void => {
  g.beginPath();
  g.moveTo(f.noseX, f.noseY);
  g.lineTo(f.leftX, f.leftY);
  g.lineTo(f.tailX, f.tailY);
  g.lineTo(f.rightX, f.rightY);
  g.closePath();
};

const facet = (g: SparkGraphics, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void => {
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.lineTo(cx, cy);
  g.closePath();
  g.fillPath();
};

/** Kite ping ring of travel radius `r` about the centre, rotated to the heading. */
const pingKitePath = (g: SparkGraphics, cx: number, cy: number, r: number, cos: number, sin: number): void => {
  const wing = r * SPARK_PLAYER.pingWingRatio;
  const tail = r * SPARK_PLAYER.pingTailRatio;
  g.beginPath();
  g.moveTo(cx + (cos * r), cy + (sin * r));
  g.lineTo(cx + (sin * wing), cy - (cos * wing));
  g.lineTo(cx - (cos * tail), cy - (sin * tail));
  g.lineTo(cx - (sin * wing), cy + (cos * wing));
  g.closePath();
  g.strokePath();
};

const LOCATOR_METRICS = resolvePlayerLocatorMetrics(0, 1, 0);

export interface SparkDrawInput {
  tileSize: number;
  devicePixelRatio: number;
  /** Lifecycle fade 0..1. */
  alpha: number;
  timeMs: number;
  material: SparkMaterial;
  /** Running find-me ping start, or negative for none (always negative in the menu demo and the Guide). */
  pingStartMs: number;
  reducedMotion: boolean;
  /** Multiplier (0..1, default 1) on the facet fills only: below 1 over the goal star so the star shows through. */
  coreAlphaScale?: number;
}

/** Paints the ping (behind), the keyline, then the four facets. The shadowBlur glow is a canvas the scene puts under it. */
const drawSparkPlayerImpl = (g: SparkGraphics, f: SparkFrame, input: SparkDrawInput): void => {
  const alpha = Math.max(0, Math.min(1, input.alpha));
  if (alpha <= 0) {
    return;
  }
  const k = SPARK_PLAYER;
  const m = input.material;

  // 1. find-me ping: two staggered kite rings travelling out from the tile edge (timing and travel: playerLocator.ts).
  if (!input.reducedMotion && input.pingStartMs >= 0) {
    const metrics = resolvePlayerLocatorMetrics(input.tileSize, input.devicePixelRatio, f.reachCss, LOCATOR_METRICS);
    const inner = (input.tileSize / 2) * 0.9;
    const elapsed = input.timeMs - input.pingStartMs;
    const cos = Math.cos(f.angle);
    const sin = Math.sin(f.angle);
    for (let i = 0; i < PLAYER_LOCATOR.pingCount; i += 1) {
      const t = resolvePingRingProgress(elapsed, i);
      if (t < 0) {
        continue;
      }
      const eased = 1 - ((1 - t) * (1 - t));
      const radius = inner + ((metrics.pingTravelHalfCss - inner) * eased);
      const fade = PLAYER_LOCATOR.pingPeakAlpha * (1 - t) * alpha;
      g.lineStyle(PLAYER_LOCATOR.pingStrokeCss + PLAYER_LOCATOR.pingKeylineExtraCss, boardMaterial.void, fade * 0.7);
      pingKitePath(g, f.centerX, f.centerY, radius, cos, sin);
      g.lineStyle(PLAYER_LOCATOR.pingStrokeCss, m.core, fade);
      pingKitePath(g, f.centerX, f.centerY, radius, cos, sin);
    }
  }

  // 2. dark keyline: the outline stroked twice its width, so the outer half shows round the facets drawn on top.
  g.lineStyle(f.keylineCss * 2, boardMaterial.void, k.keylineAlpha * alpha);
  kitePath(g, f);
  g.strokePath();

  // 3. facets, meeting at the centre.
  const fillAlpha = alpha * Math.max(0, Math.min(1, input.coreAlphaScale ?? 1));
  const cx = f.centerX;
  const cy = f.centerY;
  g.fillStyle(m.catchlight, fillAlpha);
  facet(g, f.noseX, f.noseY, f.leftX, f.leftY, cx, cy);
  g.fillStyle(m.core, fillAlpha);
  facet(g, f.noseX, f.noseY, cx, cy, f.rightX, f.rightY);
  g.fillStyle(m.rear, fillAlpha);
  facet(g, f.leftX, f.leftY, f.tailX, f.tailY, cx, cy);
  g.fillStyle(m.shadow, fillAlpha);
  facet(g, cx, cy, f.tailX, f.tailY, f.rightX, f.rightY);
};

/** Square glow-canvas bounds (css px) for a frame: constant while the tile size holds, so the canvas never resizes as the kite turns. */
export const resolveSparkGlowPadding = (tileSize: number): number => (
  Math.ceil(Math.max(0, tileSize) * SPARK_PLAYER.glow.wideBlurTileRatio * 2.5)
);

export interface SparkGlowDrawOptions {
  /** Canvas origin in the frame's coordinate space. */
  originX: number;
  originY: number;
  wideColor: number;
  wideAlpha: number;
  /** shadowBlur radii in DEVICE px (the canvas ignores its transform for shadowBlur). */
  wideBlurPx: number;
  tightColor: number;
  tightAlpha: number;
  tightBlurPx: number;
}

/** One rgba string per glow layer per drawn frame (two per frame): the only strings Spark builds. */
const rgba = (color: number, alpha: number): string => (
  `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${Math.max(0, Math.min(1, alpha))})`
);

const fillKiteShadow = (
  ctx: CanvasRenderingContext2D,
  f: SparkFrame,
  ox: number,
  oy: number,
  color: number,
  alpha: number,
  blurPx: number
): void => {
  if (blurPx <= 0 || alpha <= 0) {
    return;
  }
  const style = rgba(color, alpha);
  ctx.shadowBlur = blurPx;
  ctx.shadowColor = style;
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.moveTo(f.noseX - ox, f.noseY - oy);
  ctx.lineTo(f.leftX - ox, f.leftY - oy);
  ctx.lineTo(f.tailX - ox, f.tailY - oy);
  ctx.lineTo(f.rightX - ox, f.rightY - oy);
  ctx.closePath();
  ctx.fill();
};

/** The kite's two soft glow layers (wide bloom, tight core glow) into the player-glow canvas. Caller clears first. */
const drawSparkGlowToCanvasContextImpl = (
  ctx: CanvasRenderingContext2D,
  f: SparkFrame,
  options: SparkGlowDrawOptions
): void => {
  ctx.save();
  fillKiteShadow(ctx, f, options.originX, options.originY, options.wideColor, options.wideAlpha, options.wideBlurPx);
  fillKiteShadow(ctx, f, options.originX, options.originY, options.tightColor, options.tightAlpha, options.tightBlurPx);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.restore();
};

// MAZER-UI-102: cosmetics keep their own colours under dark mode (src/theme/cosmeticScope.ts).
export const drawSparkPlayer: typeof drawSparkPlayerImpl = (...args: Parameters<typeof drawSparkPlayerImpl>) => withCosmeticColours(() => drawSparkPlayerImpl(...args));
export const drawSparkGlowToCanvasContext: typeof drawSparkGlowToCanvasContextImpl = (...args: Parameters<typeof drawSparkGlowToCanvasContextImpl>) => withCosmeticColours(() => drawSparkGlowToCanvasContextImpl(...args));
