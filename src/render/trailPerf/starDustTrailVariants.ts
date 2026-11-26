/**
 * Trail-cost OPTIONS (MAZER-PERF-017 follow-up): the ways to paint the Star Dust trail that the owner picked from on the
 * options page `trail-perf-options.html`. The owner picked C + A (shipped 2026-11-24, src/render/starDustTrailCache.ts)
 * and then asked for the old look back (2026-11-25): the game paints with Before (the full painter) again. This module
 * stays page-only: nothing in a shipping entry imports it; the page installs one of these renderers (or, for row 'CA',
 * the real cached painter) through starDustRenderOverride.ts on the real scene.
 *
 * The plan painter itself (layers, coarse bloom) moved to src/render/starDustTrailPlan.ts, which the game uses; it is
 * re-exported here for the page and its tests. Page-only knobs on a plan:
 *   - idleRepaintMs: the shortest gap between repaints that only the colour clock asks for (standing still). The scene's
 *     redraw gate owns that gap; the options page holds it open (trailPerfOptionsHarness.ts) as the game would;
 *   - bodyCache: everything older than the last `headTiles` of route is painted once into a cached layer, re-painted
 *     every `refreshMs` (or when the route changes); only the head is painted per frame (the page's first cut of C; the
 *     shipped cache is starDustTrailCache.ts).
 */
import type { StarDustSegment } from '../starDustTrailCanvas';
import type { StarDustTrailRenderer } from '../starDustRenderOverride';
import { LIGHT_BLOOM_PLAN, SHIPPED_PLAN, drawStarDustWithPlan, type StarDustRenderPlan } from '../starDustTrailPlan';

export {
  LIGHT_BLOOM_PLAN,
  SHIPPED_PLAN,
  chunkTrailSegmentsByLength,
  drawStarDustWithPlan,
  type LayerMode,
  type StarDustRenderPlan
} from '../starDustTrailPlan';

export type TrailPerfVariantId = 'shipped' | 'A' | 'B' | 'C' | 'CA';

export interface TrailPerfVariant {
  id: TrailPerfVariantId;
  name: string;
  /** Plain words: what the player sees change. */
  look: string;
  plan: Readonly<StarDustRenderPlan>;
}

export const TRAIL_PERF_VARIANTS: readonly TrailPerfVariant[] = Object.freeze([
  {
    id: 'shipped',
    name: 'Before (full repaint)',
    look: 'The game\'s Star Dust painter (again since 2026-11-25): bloom and thread stroked in ~1,300 small colour pieces '
      + 'and every sparkle repainted every frame.',
    plan: SHIPPED_PLAN
  },
  {
    id: 'A',
    name: 'A. Light bloom',
    look: 'Same sparkles. The soft glow and the thin thread are stroked one piece per tile (about 25x fewer blurred '
      + 'strokes), each a smooth colour fade, so the rainbow still flows; the glow\'s halo shifts colour per tile.',
    plan: LIGHT_BLOOM_PLAN
  },
  {
    id: 'B',
    name: 'B. Calm sparkles',
    look: 'Sparkles hold still (no twinkle or spin; colours still shift). While you stand still the trail repaints '
      + '4 times a second instead of every other frame. Walking is unchanged.',
    plan: Object.freeze({ ...SHIPPED_PLAN, still: true, idleRepaintMs: 250 })
  },
  {
    id: 'C',
    name: 'C. Cached tail',
    look: 'The newest 8 to 16 tiles are painted live and twinkle. Everything older is painted once into a saved layer '
      + 'and refreshed every 2 s (or after 8 steps): older sparkles hold still and their colours move in steps.',
    plan: Object.freeze({ ...SHIPPED_PLAN, bodyCache: Object.freeze({ headTiles: 8, refreshMs: 2000, minTiles: 24 }) })
  },
  {
    id: 'CA',
    name: 'C + A (withdrawn)',
    look: 'Shipped 2026-11-24, withdrawn 2026-11-25 (the game is back on Before): C\'s cached older trail (its own full '
      + 'glow, refreshed every 2 s or 8 steps) with A\'s light glow on the live head. Trails under 48 tiles are painted '
      + 'whole, exactly as Before.',
    // Not painted from this plan: the page installs the real cached painter (starDustTrailCache.ts) through the seam.
    plan: Object.freeze({ ...LIGHT_BLOOM_PLAN, bodyCache: Object.freeze({ headTiles: 8, refreshMs: 2000, minTiles: 48 }) })
  }
]);

export const findTrailPerfVariant = (id: string | null | undefined): TrailPerfVariant => (
  TRAIL_PERF_VARIANTS.find((variant) => variant.id === id) ?? TRAIL_PERF_VARIANTS[0]!
);

type Canvas2D = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };

const createCanvas2D = (): Canvas2D | null => {
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  return ctx ? { canvas, ctx } : null;
};

const sizeCanvas = (target: Canvas2D, width: number, height: number): void => {
  if (target.canvas.width !== width || target.canvas.height !== height) {
    target.canvas.width = width;
    target.canvas.height = height;
  } else {
    target.ctx.setTransform(1, 0, 0, 1, 0, 0);
    target.ctx.clearRect(0, 0, width, height);
  }
};

const blit = (ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, dx: number, dy: number): void => {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(source, dx, dy);
  ctx.restore();
};

const segmentEnd = (segment: StarDustSegment, fallback: number): number => (
  Number.isFinite(segment.current.distance) ? segment.current.distance! : fallback
);

/** Counters the options page shows: how many paints were full, head-only (C), or rebuilt C's cached body. */
export interface TrailPerfRenderStats {
  fullPaints: number;
  headPaints: number;
  bodyRebuilds: number;
  lastSparkles: number;
}

/**
 * A renderer for the override seam that follows `plan`. Keeps its own cached body canvas for bodyCache; `stats` counts
 * what it did.
 */
export const createStarDustPlanRenderer = (
  plan: Readonly<StarDustRenderPlan>,
  stats: TrailPerfRenderStats = { fullPaints: 0, headPaints: 0, bodyRebuilds: 0, lastSparkles: 0 }
): StarDustTrailRenderer & { stats: TrailPerfRenderStats } => {
  let body: (Canvas2D & {
    originX: number; originY: number; scale: number; splitDistance: number; splitX: number; splitY: number;
    builtAtMs: number; key: string;
  }) | null = null;

  const renderer = ((ctx, segments, options) => {
    const target = ctx.canvas as HTMLCanvasElement | undefined;
    const scale = typeof ctx.getTransform === 'function' ? ctx.getTransform().a : 1;
    const last = segments[segments.length - 1];
    if (!target || !last) {
      stats.fullPaints += 1;
      return drawStarDustWithPlan(ctx, segments, options, plan);
    }

    // B's idle cadence (idleRepaintMs) is not a painter concern: the scene's redraw gate decides when to call this, and the
    // page holds that gap open (trailPerfOptionsHarness), exactly as the game would. Here B only paints still sparkles.

    // C: body layer cached, head painted live.
    const cache = plan.bodyCache;
    const tile = options.tileSize;
    let total = 0;
    for (let i = 0; i < segments.length; i += 1) {
      const s = segments[i]!;
      total = segmentEnd(s, total + Math.hypot(s.current.x - s.previous.x, s.current.y - s.previous.y));
    }
    if (!cache || !(tile > 0) || total < cache.minTiles * tile || !Number.isFinite(last.current.distance)) {
      stats.fullPaints += 1;
      stats.lastSparkles = drawStarDustWithPlan(ctx, segments, options, plan);
      return stats.lastSparkles;
    }
    const headPx = cache.headTiles * tile;
    const styleKey = `${scale}|${tile}|${options.keylineAlpha}|${options.keylineColor}`;
    let split = -1;
    if (body && body.key === styleKey && options.timeMs >= body.builtAtMs && options.timeMs - body.builtAtMs < cache.refreshMs
      && total - body.splitDistance <= headPx * 2 && body.splitDistance < total) {
      // The route up to the cached split must be the same route (not a new level, a step back, or a trimmed start).
      for (let i = 0; i < segments.length; i += 1) {
        const p = segments[i]!.previous;
        if (Math.abs((p.distance ?? Number.NaN) - body.splitDistance) < 1e-6) {
          if (p.x === body.splitX && p.y === body.splitY) {
            split = i;
          }
          break;
        }
      }
    }
    const dx = body ? (body.originX - options.originX) * scale : 0;
    const dy = body ? (body.originY - options.originY) * scale : 0;
    const whole = Math.abs(dx - Math.round(dx)) < 1e-6 && Math.abs(dy - Math.round(dy)) < 1e-6;
    if (split < 0 || !whole) {
      // Rebuild: split at the first segment start at or past (total - head).
      const want = total - headPx;
      split = segments.findIndex((s) => (s.previous.distance ?? 0) >= want);
      if (split <= 0) {
        stats.fullPaints += 1;
        stats.lastSparkles = drawStarDustWithPlan(ctx, segments, options, plan);
        return stats.lastSparkles;
      }
      if (!body) {
        const made = createCanvas2D();
        body = made ? { ...made, originX: 0, originY: 0, scale: 0, splitDistance: 0, splitX: 0, splitY: 0, builtAtMs: 0, key: '' } : null;
      }
      if (!body) {
        stats.fullPaints += 1;
        stats.lastSparkles = drawStarDustWithPlan(ctx, segments, options, plan);
        return stats.lastSparkles;
      }
      sizeCanvas(body, target.width, target.height);
      body.ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawStarDustWithPlan(body.ctx, segments.slice(0, split), options, plan, false);
      const at = segments[split]!.previous;
      body.originX = options.originX;
      body.originY = options.originY;
      body.scale = scale;
      body.splitDistance = at.distance ?? 0;
      body.splitX = at.x;
      body.splitY = at.y;
      body.builtAtMs = options.timeMs;
      body.key = styleKey;
      stats.bodyRebuilds += 1;
      blit(ctx, body.canvas, 0, 0);
    } else {
      blit(ctx, body!.canvas, Math.round(dx), Math.round(dy));
    }
    stats.headPaints += 1;
    stats.lastSparkles = drawStarDustWithPlan(ctx, segments.slice(split), options, plan);
    return stats.lastSparkles;
  }) as StarDustTrailRenderer & { stats: TrailPerfRenderStats };
  renderer.stats = stats;
  return renderer;
};
