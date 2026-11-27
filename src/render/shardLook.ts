/**
 * Shard look v1 (H8 UI): the numbers and the pure geometry behind the shard visuals Zac picked on the
 * 2026-11-26 options page (docs/playbook-notes/2026-11-26-mazer-shards-ui-v1.md).
 *
 *  - Gem: look "A Gem", made sharper. A brilliant-cut rhombus whose girdle sits high, split into four
 *    flat facets (light upper-left to dark lower-right), a hard dark keyline and one bright sliver on
 *    the lit edge. Gold is token `semantic.reward` (the Guide's shard accent); the facet tones are
 *    mixes toward `text.primary` and `bg.canvas`, so no new colour enters the palette.
 *  - Locked end star: a dotted cage ring (token `line.active`) that turns while the star holds still,
 *    and a star-shaped ping that travels INWARD into the star. On unlock the cage fades out, the ping
 *    goes back to the beacon's outward ping and the star spins again.
 *  - Unlock moment: the gathered gems fly into the star one after another, a star-dust burst, then the
 *    in-flow notice.
 *  - Reduced motion: no turn, no ping, no flight, no burst. The cage is drawn still and the unlock is a
 *    crossfade, so every state keeps the same meaning.
 *
 * Every duration is a motion token (motionScale.ts); the cage turn and the ping reuse the goal star's
 * and the beacon's own constants. Pure: no Phaser, DOM, randomness or wall clock.
 */
import { GOAL_BEACON } from './goalBeacon';
import { GOAL_STAR_SPIN } from './goalStarSpin';
import { MOTION_DURATION_MS, MOTION_EASING, MOTION_LOOP_MS, MOTION_REDUCED_MS } from './motionScale';
import { TWIN_STARS } from './endpointTileSkins';
import { mixColor } from './boardTileStyle';
import { phaserMaterialAliases } from '../theme/tokens';

export const SHARD_LOOK = Object.freeze({
  gem: Object.freeze({
    /** Half-height and half-width of the gem, as shares of the tile. Taller than wide: a sharp crystal. */
    halfHeightOfTile: 0.4,
    halfWidthOfTile: 0.27,
    /** The girdle (widest line) sits this far ABOVE the centre, as a share of the half-height: a high crown. */
    girdleRise: 0.22,
    /** Facet tones: mix of the gold toward white (lit) or toward the board void (shade). */
    litMix: 0.55,
    sideMix: 0.18,
    shadeMix: 0.42,
    /** The bright sliver on the lit edge: alpha of text.primary. */
    sliverAlpha: 0.85,
    /** Later shards (not next in order) are drawn at this alpha so the order reads at a glance. */
    laterAlpha: 0.55,
    /** The next shard breathes between these scales, one cycle per loop.blink. */
    breatheMin: 0.92,
    breatheMax: 1.08,
    breathePeriodMs: MOTION_LOOP_MS.blink
  }),
  cage: Object.freeze({
    /** Ring radius as a share of the tile (the star's tips sit at 0.35). */
    radiusOfTile: 0.6,
    dots: 12,
    dotRadiusOfTile: 0.05,
    minDotRadiusCss: 1,
    /** The ring turns twice as fast as the star does when free, so the turn reads on a still star. */
    periodMs: GOAL_STAR_SPIN.periodMs / 2,
    alpha: 0.92,
    /** The locked star is drawn at this opacity (dim, caged). */
    lockedStarOpacity: 0.62
  }),
  inwardPing: Object.freeze({
    periodMs: GOAL_BEACON.pingPeriodMs,
    durationMs: GOAL_BEACON.pingDurationMs,
    strokeCss: GOAL_BEACON.pingStrokeCss,
    peakAlpha: GOAL_BEACON.pingPeakAlpha,
    /** Starts at this multiple of the cage radius and closes to the star's tip radius. */
    startOfCage: 1.9,
    endOfTile: 0.35,
    innerShare: TWIN_STARS.pingInnerShare
  }),
  collect: Object.freeze({
    popMs: MOTION_DURATION_MS.base,
    popScale: 1.6
  }),
  gather: Object.freeze({
    staggerMs: MOTION_DURATION_MS.fast,
    flightMs: MOTION_DURATION_MS.reveal,
    /** Gems past this many share the last launch slot, so a long level never stalls the unlock. */
    maxStaggered: 8,
    /** Each flight bows sideways by up to this share of its length, alternating sides. */
    bow: 0.18,
    /** Gem scale at landing (it shrinks into the star). */
    landScale: 0.45
  }),
  burst: Object.freeze({
    ms: MOTION_DURATION_MS.long,
    sparks: 6,
    travelOfTile: 0.95,
    sparkRadiusOfTile: 0.16
  }),
  reducedCrossfadeMs: MOTION_REDUCED_MS.crossfade
});

/** Goal-hidden-while-locked toggle (Zac's open question; default decision). Flip to `true` to keep the
 * beacon halo and its outward ping while the star is caged. */
export const SHARD_LOCKED_GOAL_BEACON_VISIBLE = false;

export interface ShardPoint { readonly x: number; readonly y: number }

/** The gem's five key points about (cx, cy): top, right, bottom, left and the girdle centre. */
export interface ShardGemGeometry {
  readonly top: ShardPoint;
  readonly right: ShardPoint;
  readonly bottom: ShardPoint;
  readonly left: ShardPoint;
  readonly centre: ShardPoint;
}

export const resolveShardGemGeometry = (cx: number, cy: number, halfHeight: number, halfWidth: number): ShardGemGeometry => {
  const girdleY = cy - (halfHeight * SHARD_LOOK.gem.girdleRise);
  return {
    top: { x: cx, y: cy - halfHeight },
    right: { x: cx + halfWidth, y: girdleY },
    bottom: { x: cx, y: cy + halfHeight },
    left: { x: cx - halfWidth, y: girdleY },
    centre: { x: cx, y: girdleY }
  };
};

/** The four facets, lit to shade: upper-left, upper-right, lower-left, lower-right. */
export const resolveShardGemFacets = (g: ShardGemGeometry): readonly (readonly ShardPoint[])[] => [
  [g.top, g.centre, g.left],
  [g.top, g.right, g.centre],
  [g.left, g.centre, g.bottom],
  [g.centre, g.right, g.bottom]
];

/** The bright sliver just inside the lit upper-left edge. */
export const resolveShardGemSliver = (g: ShardGemGeometry): readonly ShardPoint[] => {
  const along = (a: ShardPoint, b: ShardPoint, t: number): ShardPoint => ({ x: a.x + ((b.x - a.x) * t), y: a.y + ((b.y - a.y) * t) });
  const inner = along(g.top, g.centre, 0.3);
  return [along(g.top, g.left, 0.08), along(g.top, g.left, 0.78), along(inner, g.left, 0.5)];
};

/** Points evenly spaced along the gem outline (a dotted "missing" gem). */
export const resolveShardGemOutlineDots = (g: ShardGemGeometry, perEdge: number): ShardPoint[] => {
  const ring = [g.top, g.right, g.bottom, g.left];
  const out: ShardPoint[] = [];
  const steps = Math.max(1, Math.floor(perEdge));
  for (let edge = 0; edge < 4; edge += 1) {
    const a = ring[edge]!;
    const b = ring[(edge + 1) % 4]!;
    for (let i = 0; i < steps; i += 1) {
      const t = i / steps;
      out.push({ x: a.x + ((b.x - a.x) * t), y: a.y + ((b.y - a.y) * t) });
    }
  }
  return out;
};

const wrap = (value: number, period: number): number => ((value % period) + period) % period;

/** Breath scale of the next shard; 1 under reduced motion. */
export const resolveShardBreathScale = (timeMs: number, reducedMotion: boolean): number => {
  if (reducedMotion || !Number.isFinite(timeMs)) return 1;
  const k = SHARD_LOOK.gem;
  const wave = (1 - Math.cos((wrap(timeMs, k.breathePeriodMs) / k.breathePeriodMs) * Math.PI * 2)) / 2;
  return k.breatheMin + ((k.breatheMax - k.breatheMin) * wave);
};

/** Clockwise turn of the cage ring in radians; 0 under reduced motion. */
export const resolveShardCageRotation = (timeMs: number, reducedMotion: boolean): number => {
  if (reducedMotion || !Number.isFinite(timeMs)) return 0;
  const period = SHARD_LOOK.cage.periodMs;
  return (wrap(timeMs, period) / period) * Math.PI * 2;
};

/** The inward star ping at `timeMs`, or null between pings and under reduced motion. */
export const resolveShardInwardPing = (
  timeMs: number,
  tileSize: number,
  reducedMotion: boolean
): { radius: number; alpha: number } | null => {
  if (reducedMotion || !Number.isFinite(timeMs)) return null;
  const k = SHARD_LOOK.inwardPing;
  const within = wrap(timeMs, k.periodMs);
  if (within >= k.durationMs) return null;
  const t = within / k.durationMs;
  // The beacon's ease run backwards (slow start, fast finish): it lingers outside, then is pulled in.
  const eased = 1 - MOTION_EASING.easeOutCubic(1 - t);
  const from = tileSize * SHARD_LOOK.cage.radiusOfTile * k.startOfCage;
  const to = tileSize * k.endOfTile;
  // Fades in at the rim, holds, gone the instant it reaches the star: the pull reads as going INTO the star.
  const alpha = k.peakAlpha * Math.min(1, t * 4) * Math.min(1, (1 - t) * 8);
  return { radius: from + ((to - from) * eased), alpha: Math.max(0, alpha) };
};

export type ShardGoalPhase = 'locked' | 'gather' | 'burst' | 'open';

export interface ShardGoalVisual {
  readonly phase: ShardGoalPhase;
  /** Cage ring opacity, 0..1. */
  readonly cageAlpha: number;
  /** True while the star is drawn caged: still, dim, no beacon. */
  readonly caged: boolean;
  /** 0..1 progress of the burst, or null outside it. */
  readonly burst: number | null;
  /** Scene time the star starts turning again (its spin clock origin), or null while caged. */
  readonly spinFromMs: number | null;
  /** True once the unlock notice is due. */
  readonly noticeDue: boolean;
}

/** End of the last gem flight after the unlock instant. */
export const resolveShardGatherEndMs = (count: number): number => {
  const k = SHARD_LOOK.gather;
  const slots = Math.max(0, Math.min(Math.max(0, count - 1), k.maxStaggered - 1));
  return (slots * k.staggerMs) + k.flightMs;
};

/**
 * The end star's state for `nowMs`. `unlockAtMs` null = still locked. Full motion: gather, then burst,
 * then open. Reduced motion: a crossfade straight to open, notice at once.
 */
export const resolveShardGoalVisual = (
  unlockAtMs: number | null,
  nowMs: number,
  count: number,
  reducedMotion: boolean
): ShardGoalVisual => {
  if (unlockAtMs === null) {
    return { phase: 'locked', cageAlpha: 1, caged: true, burst: null, spinFromMs: null, noticeDue: false };
  }
  const since = Math.max(0, nowMs - unlockAtMs);
  if (reducedMotion) {
    const fade = Math.min(1, since / SHARD_LOOK.reducedCrossfadeMs);
    return { phase: fade < 1 ? 'burst' : 'open', cageAlpha: 1 - fade, caged: false, burst: null, spinFromMs: unlockAtMs, noticeDue: true };
  }
  const gatherEnd = resolveShardGatherEndMs(count);
  if (since < gatherEnd) {
    return { phase: 'gather', cageAlpha: 1, caged: true, burst: null, spinFromMs: null, noticeDue: false };
  }
  const burstMs = SHARD_LOOK.burst.ms;
  const spinFromMs = unlockAtMs + gatherEnd;
  if (since < gatherEnd + burstMs) {
    const burst = (since - gatherEnd) / burstMs;
    return { phase: 'burst', cageAlpha: Math.max(0, 1 - (burst * 2)), caged: false, burst, spinFromMs, noticeDue: false };
  }
  return { phase: 'open', cageAlpha: 0, caged: false, burst: null, spinFromMs, noticeDue: true };
};

/**
 * Where gem `index` of `count` is during the gather, launched from `from` toward `to`; null before its
 * launch or after it landed. Each flight bows to alternate sides so the gems never stack on one line.
 */
export const resolveShardGatherFlight = (
  index: number,
  count: number,
  sinceUnlockMs: number,
  from: ShardPoint,
  to: ShardPoint
): { x: number; y: number; scale: number; alpha: number } | null => {
  const k = SHARD_LOOK.gather;
  const slot = Math.min(index, k.maxStaggered - 1);
  const local = sinceUnlockMs - (slot * k.staggerMs);
  if (local < 0 || local >= k.flightMs || index >= count) return null;
  const t = MOTION_EASING.smootherstep(local / k.flightMs);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const side = index % 2 === 0 ? 1 : -1;
  const bow = length * k.bow * side * (1 + Math.floor(index / 2) * 0.35) * Math.sin(Math.PI * t);
  const nx = length > 0 ? -dy / length : 0;
  const ny = length > 0 ? dx / length : 0;
  return {
    x: from.x + (dx * t) + (nx * bow),
    y: from.y + (dy * t) + (ny * bow),
    scale: 1 + ((k.landScale - 1) * t),
    alpha: 1
  };
};

/** Collect pop: the taken gem swells and fades over `popMs`; null when done. */
export const resolveShardCollectPop = (sinceCollectMs: number, reducedMotion: boolean): { scale: number; alpha: number } | null => {
  const k = SHARD_LOOK.collect;
  if (reducedMotion || sinceCollectMs < 0 || sinceCollectMs >= k.popMs) return null;
  const t = sinceCollectMs / k.popMs;
  return { scale: 1 + ((k.popScale - 1) * MOTION_EASING.easeOutCubic(t)), alpha: 1 - t };
};

/** HUD pip model: per-shard state up to `maxPips`, else counter only. */
export const SHARD_HUD_MAX_PIPS = 8;

export const resolveShardHudModel = (count: number, collected: number): { pips: boolean[] | null; label: string } => {
  const taken = Math.max(0, Math.min(collected, count));
  return {
    pips: count > 0 && count <= SHARD_HUD_MAX_PIPS ? Array.from({ length: count }, (_, i) => i < taken) : null,
    label: `${taken} / ${count}`
  };
};

/** The minimal Graphics surface the gem needs (Phaser Graphics, the Guide glyph adapter, test fakes). */
export interface ShardGemGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  fillPoints(points: Array<{ x: number; y: number }>, closeShape?: boolean): unknown;
}

const SHARD_GOLD = phaserMaterialAliases['semantic.reward'];
const SHARD_WHITE = phaserMaterialAliases['text.primary'];
const SHARD_VOID = phaserMaterialAliases['bg.canvas'];

/** Facet fills, lit to shade (same order as resolveShardGemFacets). */
export const SHARD_GEM_FACET_COLOURS: readonly number[] = Object.freeze([
  mixColor(SHARD_GOLD, SHARD_WHITE, SHARD_LOOK.gem.litMix),
  mixColor(SHARD_GOLD, SHARD_WHITE, SHARD_LOOK.gem.sideMix),
  SHARD_GOLD,
  mixColor(SHARD_GOLD, SHARD_VOID, SHARD_LOOK.gem.shadeMix)
]);

export const SHARD_GEM_KEYLINE = SHARD_VOID;
export const SHARD_GEM_HIGHLIGHT = SHARD_WHITE;

/**
 * Paints one sharp gem centred on (cx, cy). The keyline is a filled, slightly larger outline underneath
 * (fill-only, so the same call works on every surface), then four flat facets and the lit sliver.
 */
export const drawShardGem = (
  graphics: ShardGemGraphics,
  cx: number,
  cy: number,
  halfHeight: number,
  halfWidth: number,
  alpha = 1,
  keylinePx = 1
): void => {
  if (alpha <= 0 || halfHeight <= 0 || halfWidth <= 0) return;
  const key = resolveShardGemGeometry(cx, cy, halfHeight + (keylinePx * 1.6), halfWidth + (keylinePx * 1.15));
  graphics.fillStyle(SHARD_GEM_KEYLINE, alpha);
  graphics.fillPoints([key.top, key.right, key.bottom, key.left].map((p) => ({ x: p.x, y: p.y })), true);
  const gem = resolveShardGemGeometry(cx, cy, halfHeight, halfWidth);
  resolveShardGemFacets(gem).forEach((facet, index) => {
    graphics.fillStyle(SHARD_GEM_FACET_COLOURS[index]!, alpha);
    graphics.fillPoints(facet.map((p) => ({ x: p.x, y: p.y })), true);
  });
  graphics.fillStyle(SHARD_GEM_HIGHLIGHT, alpha * SHARD_LOOK.gem.sliverAlpha);
  graphics.fillPoints(resolveShardGemSliver(gem).map((p) => ({ x: p.x, y: p.y })), true);
};
