/**
 * STAR DUST, the trail skin picked by the owner on 2026-11-19 (L7; see skinRegistry.ts): tiny four-point sparkles that
 * twinkle along the route. Only the FORM changes: every colour is today's trail material, read from the same segments
 * the neon tube draws (each segment's core colour, with the travelling shine already mixed in, and its bloom colour,
 * both from trailPalette.ts). So the hue sweep, the swell, the sheen and the shine band all run through the sparkles.
 *
 * Layers, bottom to top, on the trail's existing 2D canvas:
 *   1. the soft bloom along the route (the neon tube's own downscaled bloom, trailLayersCanvas.ts), narrower and fainter;
 *   2. a thin glow thread joining the sparkles, so the route still reads as one line between them;
 *   3. one batched dark keyline round every sparkle (boardMaterial.void: separates them from the chips and each other);
 *   4. the sparkle fills, each in the core colour of the segment it sits on, a glint toward white at a twinkle's peak.
 *
 * Placement: sparkles sit at fixed PHYSICAL distances along the route (multiples of `spacingTileRatio` tiles from where
 * the route began, counting how far Trail Fade has slid the origin), so they stay put as the head grows and the tail
 * trims; each one's size and phase come from an integer hash of its index, so a given sparkle is always the same size.
 *
 * Motion: each sparkle twinkles (size) and turns slowly. Both are MOVEMENT (reducedMotion.ts): off under reduced motion or
 * Trail Shine off (`animated` false), where every sparkle holds a fixed size and its own fixed angle. Colour drift is
 * unaffected (the caller's segment colours already follow the colour clock).
 *
 * Cost: one pass over the segments to place sparkles into a module-level Float64Array (grown, never reallocated per frame),
 * one bloom (shared code), one thread stroke per colour chunk, one keyline stroke for all sparkles, one fill per sparkle.
 * No objects or arrays are allocated per frame; the only per-frame values built are the canvas colour strings (one per
 * sparkle, as the neon tube builds one per chunk).
 */
import { chunkTrailSegments, type TrailCanvasSegment } from './navigationCoreTrailCanvas';
import { drawTrailBloomChunks } from './trailLayersCanvas';
import { PALETTE_WHITE, mixPaletteRgb } from './trailPalette';
import { withCosmeticColours } from '../theme/cosmeticScope';

export const STAR_DUST_TRAIL = Object.freeze({
  /** Distance between sparkle centres along the route, in tiles. */
  spacingTileRatio: 0.34,
  /** Outer radius range of a sparkle at full twinkle, in tiles (picked per sparkle by hash). */
  minRadiusTileRatio: 0.2,
  maxRadiusTileRatio: 0.44,
  /** Inner (waist) radius of the four-point star, as a share of its outer radius. */
  waistRatio: 0.28,
  /** Size taper from head to tail: the oldest sparkle is (1 - taper) of the newest. */
  taper: 0.4,
  /** Twinkle: size swings between `twinkleMin` and 1 at about `twinkleHz`; still size when not animated. */
  twinkleMin: 0.55,
  twinkleHz: 0.95,
  stillTwinkle: 0.85,
  /** Slow turn, rad per second (animated only). */
  spinRadPerSec: 0.6,
  /** Glint: at the top of a twinkle the fill eases toward white by up to this share. */
  glintMax: 0.45,
  /** Keyline: full stroke width (half shows outside the fill), as a share of the tile, with a css px floor. */
  keylineTileRatio: 0.067,
  keylineMinCss: 1.2,
  keylineAlpha: 0.88,
  /** Bloom: the neon tube's glow width and alpha, scaled. */
  bloomWidthScale: 0.75,
  bloomAlphaScale: 0.7,
  /** Thread: width as a share of the neon tube's core width (css px floor), and its alpha. */
  threadOfCore: 0.32,
  threadMinCss: 0.75,
  threadAlpha: 0.4
});

/** A trail segment as the scene builds it; `distance` (px from the route's current start) when the vertices carry it. */
export interface StarDustSegment extends TrailCanvasSegment {
  previous: { x: number; y: number; distance?: number };
  current: { x: number; y: number; distance?: number };
}

export interface StarDustDrawOptions {
  originX: number;
  originY: number;
  tileSize: number;
  /** The neon tube's widths this frame (resolveTrailWidths, breath-scaled): the bloom and thread derive from them. */
  coreWidth: number;
  glowWidth: number;
  glowAlphaRatio: number;
  /** shadowBlur in DEVICE px for the bloom. */
  glowBlurPx: number;
  keylineColor: number;
  /** Lifecycle fade (0..1) for the keylines; the fills use each segment's own alpha. */
  keylineAlpha: number;
  /** Pausable animation clock, ms. */
  timeMs: number;
  /** Twinkle and spin run only when true (false under reduced motion or Trail Shine off). */
  animated: boolean;
  /** How far (px) Trail Fade has moved the route's start since the level began: keeps sparkles fixed on the floor. */
  originAdvancePx: number;
}

/** Largest distance (css px) a sparkle reaches past the route, keyline included: the trail canvas's padding. */
export const resolveStarDustReach = (tileSize: number): number => {
  const tile = Math.max(0, tileSize);
  return (tile * STAR_DUST_TRAIL.maxRadiusTileRatio) + resolveStarDustKeylineWidth(tile);
};

export const resolveStarDustKeylineWidth = (tileSize: number): number => (
  Math.max(STAR_DUST_TRAIL.keylineMinCss, Math.max(0, tileSize) * STAR_DUST_TRAIL.keylineTileRatio)
);

/** Deterministic 0..1 hash of an integer (a sparkle's index along the route). */
export const hashSparkleIndex = (index: number, salt: number): number => {
  let h = Math.imul((index | 0) ^ Math.imul(salt | 0, 0x27d4eb2d), 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca77);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae3d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const TAU = Math.PI * 2;
/** Unit directions of the star's eight points (outer at even, waist at odd), angle 0. */
const STAR_UNIT_X = new Float64Array(8);
const STAR_UNIT_Y = new Float64Array(8);
for (let j = 0; j < 8; j += 1) {
  STAR_UNIT_X[j] = Math.cos((j * Math.PI) / 4);
  STAR_UNIT_Y[j] = Math.sin((j * Math.PI) / 4);
}

/** Per sparkle: x, y, outer radius, cos, sin, fill colour, fill alpha. */
const STRIDE = 7;
let sparkleScratch = new Float64Array(STRIDE * 64);

const ensureScratch = (count: number): Float64Array => {
  if (sparkleScratch.length < count * STRIDE) {
    let size = sparkleScratch.length;
    while (size < count * STRIDE) {
      size *= 2;
    }
    const grown = new Float64Array(size);
    grown.set(sparkleScratch);
    sparkleScratch = grown;
  }
  return sparkleScratch;
};

const HEX_PAIRS: readonly string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
const hexColor = (color: number): string => `#${HEX_PAIRS[(color >> 16) & 255]}${HEX_PAIRS[(color >> 8) & 255]}${HEX_PAIRS[color & 255]}`;
const rgba = (color: number, alpha: number): string => (
  `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${Math.max(0, Math.min(1, alpha))})`
);

const segmentStart = (segment: StarDustSegment, fallback: number): number => (
  Number.isFinite(segment.previous.distance) ? segment.previous.distance! : fallback
);

/**
 * Places the sparkles for these segments into the module scratch (x, y, radius, cos, sin, colour, alpha per sparkle) and
 * returns how many. Exported for tests; the draw calls it.
 */
export const placeStarDustSparkles = (
  segments: readonly StarDustSegment[],
  options: Pick<StarDustDrawOptions, 'tileSize' | 'timeMs' | 'animated' | 'originAdvancePx'>
): number => {
  const k = STAR_DUST_TRAIL;
  const tile = options.tileSize;
  if (segments.length === 0 || !(tile > 0)) {
    return 0;
  }
  const spacing = tile * k.spacingTileRatio;
  const advance = Number.isFinite(options.originAdvancePx) ? Math.max(0, options.originAdvancePx) : 0;
  const seconds = options.timeMs / 1000;

  // Route length: the last segment's end distance, or the summed segment lengths when the vertices carry none.
  let total = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i]!;
    const len = Math.hypot(s.current.x - s.previous.x, s.current.y - s.previous.y);
    total = Number.isFinite(s.current.distance) ? s.current.distance! : total + len;
  }
  if (!(total > 0)) {
    return 0;
  }
  ensureScratch(Math.ceil(total / spacing) + 2);

  let count = 0;
  let walked = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i]!;
    const len = Math.hypot(s.current.x - s.previous.x, s.current.y - s.previous.y);
    const d0 = segmentStart(s, walked);
    walked = d0 + len;
    if (!(len > 0)) {
      continue;
    }
    const last = i === segments.length - 1;
    let index = Math.ceil((d0 + advance) / spacing - 1e-9);
    for (;;) {
      const d = (index * spacing) - advance;
      if (d > d0 + len + 1e-9 || (!last && d >= d0 + len - 1e-9)) {
        break;
      }
      const t = (d - d0) / len;
      const sizeHash = hashSparkleIndex(index, 1);
      const phaseHash = hashSparkleIndex(index, 2);
      const twinkleWave = 0.5 + (0.5 * Math.sin((seconds * k.twinkleHz * TAU) + (phaseHash * TAU)));
      const twinkle = options.animated ? k.twinkleMin + ((1 - k.twinkleMin) * twinkleWave) : k.stillTwinkle;
      const age = 1 - Math.max(0, Math.min(1, d / total));
      const radius = tile
        * (k.minRadiusTileRatio + ((k.maxRadiusTileRatio - k.minRadiusTileRatio) * sizeHash))
        * (1 - (k.taper * age))
        * twinkle;
      const angle = options.animated ? (seconds * k.spinRadPerSec) + (phaseHash * TAU) : phaseHash * TAU;
      const glint = options.animated ? k.glintMax * Math.max(0, (twinkleWave - 0.8) / 0.2) : 0;
      const base = count * STRIDE;
      const out = ensureScratch(count + 1);
      out[base] = s.previous.x + ((s.current.x - s.previous.x) * t);
      out[base + 1] = s.previous.y + ((s.current.y - s.previous.y) * t);
      out[base + 2] = radius;
      out[base + 3] = Math.cos(angle);
      out[base + 4] = Math.sin(angle);
      out[base + 5] = glint > 0 ? mixPaletteRgb(s.coreColor, PALETTE_WHITE, glint) : s.coreColor;
      out[base + 6] = s.alpha;
      count += 1;
      index += 1;
    }
  }
  return count;
};

/** Read-only view of the last placement (tests and diagnostics). */
export const readStarDustSparkle = (index: number): { x: number; y: number; radius: number; color: number; alpha: number } => {
  const base = index * STRIDE;
  return {
    x: sparkleScratch[base]!,
    y: sparkleScratch[base + 1]!,
    radius: sparkleScratch[base + 2]!,
    color: sparkleScratch[base + 5]!,
    alpha: sparkleScratch[base + 6]!
  };
};

/** Where a star outline is traced: the context's own path or a Path2D (both implement CanvasPath). */
type StarPathSink = Pick<CanvasPath, 'moveTo' | 'lineTo' | 'closePath'>;

const traceStar = (ctx: StarPathSink, base: number, ox: number, oy: number, waist: number): void => {
  const data = sparkleScratch;
  const x = data[base]! - ox;
  const y = data[base + 1]! - oy;
  const r = data[base + 2]!;
  const c = data[base + 3]!;
  const s = data[base + 4]!;
  for (let j = 0; j < 8; j += 1) {
    const reach = (j & 1) === 0 ? r : r * waist;
    const ux = STAR_UNIT_X[j]!;
    const uy = STAR_UNIT_Y[j]!;
    const px = x + (((ux * c) - (uy * s)) * reach);
    const py = y + (((ux * s) + (uy * c)) * reach);
    if (j === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
};

/** Sparkles per Path2D batch in the keyline path (see traceKeylinePath). */
export const STAR_DUST_KEYLINE_BATCH = 64;

/**
 * MAZER-PERF-017: the keyline path for the first `count` placed sparkles, built as Path2D batches joined with addPath, or
 * null when Path2D is unavailable (the caller then traces into the context path, as before).
 *
 * Why: Chromium's closePath costs time in proportion to the path it closes (measured in Chrome 158: one path of 4000
 * eight-point stars took 161 ms with closePath, 6 ms without). With every keyline in one path, the keyline pass grew
 * with the SQUARE of the sparkle count, which is what made long trails lag (L300 at 390x844@3, 4x CPU throttle: about
 * half of every trail rebuild). Each batch now closes only its own few subpaths, so the cost is linear. addPath with no
 * transform appends the same verbs and points in the same order, and it is still one stroke, so overlapping keylines
 * are painted once as before: the pixels are identical (getImageData diff 0, scripts/analysis/check-star-dust-keyline-equivalence.mjs).
 */
const traceKeylinePath = (count: number, ox: number, oy: number, waist: number): Path2D | null => {
  if (typeof Path2D !== 'function') {
    return null;
  }
  const path = new Path2D();
  for (let first = 0; first < count; first += STAR_DUST_KEYLINE_BATCH) {
    const batch = new Path2D();
    const end = Math.min(count, first + STAR_DUST_KEYLINE_BATCH);
    for (let i = first; i < end; i += 1) {
      traceStar(batch, i * STRIDE, ox, oy, waist);
    }
    path.addPath(batch);
  }
  return path;
};

/** The subset of Phaser.GameObjects.Graphics the static star-dust legend paints with. */
export interface StarDustGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  beginPath(): unknown;
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  closePath(): unknown;
  fillPath(): unknown;
  strokePath(): unknown;
}

const traceStarGraphics = (g: StarDustGraphics, base: number, waist: number): void => {
  const data = sparkleScratch;
  const x = data[base]!;
  const y = data[base + 1]!;
  const r = data[base + 2]!;
  const c = data[base + 3]!;
  const s = data[base + 4]!;
  g.beginPath();
  for (let j = 0; j < 8; j += 1) {
    const reach = (j & 1) === 0 ? r : r * waist;
    const ux = STAR_UNIT_X[j]!;
    const uy = STAR_UNIT_Y[j]!;
    const px = x + (((ux * c) - (uy * s)) * reach);
    const py = y + (((ux * s) + (uy * c)) * reach);
    if (j === 0) {
      g.moveTo(px, py);
    } else {
      g.lineTo(px, py);
    }
  }
  g.closePath();
};

/**
 * The star-dust trail, still (no twinkle, no spin), through Phaser Graphics: the Guide's trail legend. Same placement,
 * sizes, keyline and colours as the board; no bloom (the legend has no canvas). Returns the sparkle count.
 */
const drawStarDustToGraphicsImpl = (
  g: StarDustGraphics,
  segments: readonly StarDustSegment[],
  options: { tileSize: number; threadWidth: number; keylineColor: number; keylineAlpha: number }
): number => {
  if (segments.length === 0) {
    return 0;
  }
  const k = STAR_DUST_TRAIL;
  for (const segment of segments) {
    g.lineStyle(options.threadWidth, segment.glowColor, segment.alpha * k.threadAlpha * 1.5);
    g.beginPath();
    g.moveTo(segment.previous.x, segment.previous.y);
    g.lineTo(segment.current.x, segment.current.y);
    g.strokePath();
  }
  const count = placeStarDustSparkles(segments, { tileSize: options.tileSize, timeMs: 0, animated: false, originAdvancePx: 0 });
  const keyline = resolveStarDustKeylineWidth(options.tileSize);
  for (let i = 0; i < count; i += 1) {
    g.lineStyle(keyline, options.keylineColor, k.keylineAlpha * options.keylineAlpha);
    traceStarGraphics(g, i * STRIDE, k.waistRatio);
    g.strokePath();
  }
  for (let i = 0; i < count; i += 1) {
    const base = i * STRIDE;
    g.fillStyle(sparkleScratch[base + 5]!, Math.max(0, Math.min(1, sparkleScratch[base + 6]!)));
    traceStarGraphics(g, base, k.waistRatio);
    g.fillPath();
  }
  return count;
};

/** Draws the star-dust trail into the trail canvas (already cleared and transformed by the caller). Returns the sparkle count. */
const drawStarDustTrailToCanvasContextImpl = (
  ctx: CanvasRenderingContext2D,
  segments: readonly StarDustSegment[],
  options: StarDustDrawOptions
): number => {
  if (segments.length === 0) {
    return 0;
  }
  const k = STAR_DUST_TRAIL;
  const ox = options.originX;
  const oy = options.originY;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 1. bloom along the route (the neon tube's own, narrower and fainter).
  const chunks = chunkTrailSegments(segments);
  drawTrailBloomChunks(ctx, chunks, {
    originX: ox,
    originY: oy,
    glowWidth: options.glowWidth * k.bloomWidthScale,
    glowAlphaRatio: options.glowAlphaRatio * k.bloomAlphaScale,
    glowBlurPx: options.glowBlurPx
  });

  // 2. thin glow thread through the sparkles.
  ctx.lineWidth = Math.max(k.threadMinCss, options.coreWidth * k.threadOfCore);
  for (const chunk of chunks) {
    const first = chunk[0]!;
    ctx.beginPath();
    ctx.moveTo(first.previous.x - ox, first.previous.y - oy);
    for (const segment of chunk) {
      ctx.lineTo(segment.current.x - ox, segment.current.y - oy);
    }
    ctx.strokeStyle = rgba(first.glowColor, first.alpha * k.threadAlpha);
    ctx.stroke();
  }

  const count = placeStarDustSparkles(segments, options);
  if (count > 0) {
    // 3. every keyline in one path, one stroke (same colour and alpha for all).
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 4;
    const keylinePath = traceKeylinePath(count, ox, oy, k.waistRatio);
    if (!keylinePath) {
      ctx.beginPath();
      for (let i = 0; i < count; i += 1) {
        traceStar(ctx, i * STRIDE, ox, oy, k.waistRatio);
      }
    }
    ctx.lineWidth = resolveStarDustKeylineWidth(options.tileSize);
    ctx.strokeStyle = rgba(options.keylineColor, k.keylineAlpha * Math.max(0, Math.min(1, options.keylineAlpha)));
    if (keylinePath) {
      ctx.stroke(keylinePath);
    } else {
      ctx.stroke();
    }

    // 4. fills, oldest first so the newer (larger) sparkles sit on top.
    for (let i = 0; i < count; i += 1) {
      const base = i * STRIDE;
      ctx.globalAlpha = Math.max(0, Math.min(1, sparkleScratch[base + 6]!));
      ctx.fillStyle = hexColor(sparkleScratch[base + 5]!);
      ctx.beginPath();
      traceStar(ctx, base, ox, oy, k.waistRatio);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return count;
};

// MAZER-UI-102: cosmetics keep their own colours under dark mode (src/theme/cosmeticScope.ts).
export const drawStarDustToGraphics: typeof drawStarDustToGraphicsImpl = (...args: Parameters<typeof drawStarDustToGraphicsImpl>) => withCosmeticColours(() => drawStarDustToGraphicsImpl(...args));
export const drawStarDustTrailToCanvasContext: typeof drawStarDustTrailToCanvasContextImpl = (...args: Parameters<typeof drawStarDustTrailToCanvasContextImpl>) => withCosmeticColours(() => drawStarDustTrailToCanvasContextImpl(...args));
