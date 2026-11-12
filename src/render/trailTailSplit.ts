/**
 * Head-only trail updates while the player walks (MAZER-PERF-004).
 *
 * Measured cause of the lag that remained after MAZER-PERF-002: while the head MOVES the trail is rebuilt in full every
 * frame (a bloom, an underlay and a core stroke over 1,100 to 1,500 4 px segments on a level 268+ route), so one walking
 * frame costs as much as the whole route is long (182 to 230 ms at a 4x CPU throttle on a phone).
 *
 * Why the picture cannot be reused pixel for pixel: every segment's colour is a function of (distance along the trail,
 * colour clock), and the width and bloom breathe on the same clock, so with the default settings EVERY pixel of the trail
 * changes at every colour tick. A bitmap of the old trail is exactly right only for the clock it was drawn at.
 *
 * What this module does instead, and what it costs visually: when a full rebuild is expensive (>= TRAIL_SPLIT_MIN_COST_MS,
 * measured, so short routes and fast devices are untouched), that rebuild draws the route up to a cut a few tiles behind the
 * head into the main trail canvas (the PREFIX) and the last few tiles into a second small canvas (the TAIL), both at one
 * frozen colour clock (the "epoch"). While the head moves and the epoch is not yet due, a frame redraws only the tail, at the
 * epoch's clock, so the work per walking frame does not depend on the route length. The epoch is due on the gate's usual gap
 * (trailRedrawGate.ts: 2x the rebuild cost, 33 to 250 ms), exactly the cadence the still trail already uses since
 * MAZER-PERF-002, and then the whole trail is rebuilt again with fresh colours. The only visible difference: on a long
 * route, while walking, the colour, sheen and breath of the trail advance in steps of that gap, like the still trail.
 *
 * Pure: no Phaser, DOM, randomness or wall clock. Tested in tests/render/trail-tail-split.test.ts.
 */
import { shouldRebuildTrail, type TrailDrawRecord, type TrailDrawStamp } from './trailRedrawGate';

/** A full rebuild measured below this (ms) is cheap enough to stay as it is: no split, behaviour unchanged. */
export const TRAIL_SPLIT_MIN_COST_MS = 40;
/** At a full rebuild the cut sits this many tiles behind the head (clear of the head's corner rounding). */
export const TRAIL_SPLIT_TAIL_TILES = 6;
/**
 * How long a split epoch lives while the head keeps moving: this many full-rebuild costs, between the two bounds. The ordinary
 * redraw gap (trailRedrawGate.ts: 2x the cost, at most 250 ms) is shorter than one slow frame, which would make every
 * walking frame an epoch again; a head-only frame is only cheap if the epoch outlives the frames it serves. A still head keeps
 * the ordinary gap (the colour clock redraws as it did).
 */
export const TRAIL_SPLIT_EPOCH_COST_MULTIPLE = 3;
export const TRAIL_SPLIT_EPOCH_MIN_GAP_MS = 250;
export const TRAIL_SPLIT_EPOCH_MAX_GAP_MS = 1000;

/** The epoch length for a measured full-rebuild cost (ms). */
export const resolveTrailSplitEpochGapMs = (rebuildCostMs: number | null): number => {
  if (rebuildCostMs === null || !Number.isFinite(rebuildCostMs) || rebuildCostMs <= 0) {
    return TRAIL_SPLIT_EPOCH_MIN_GAP_MS;
  }
  return Math.min(
    TRAIL_SPLIT_EPOCH_MAX_GAP_MS,
    Math.max(TRAIL_SPLIT_EPOCH_MIN_GAP_MS, rebuildCostMs * TRAIL_SPLIT_EPOCH_COST_MULTIPLE)
  );
};

/** The tail may grow to this many tiles before the next full rebuild is forced, which bounds the per-frame stroke work. */
export const TRAIL_SPLIT_MAX_TAIL_TILES = 24;

export interface TrailSplitVertex {
  x: number;
  y: number;
  distance: number;
  newSubpath: boolean;
}

/** Where a split cuts the trail: the vertex, its arc length, its point and the unit direction of the path through it. */
export interface TrailSplitCut {
  cutIndex: number;
  /** The last vertex that must stay unchanged for the cut to stay valid: the straight stretch ahead of the cut. */
  stableIndex: number;
  cutDistance: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** What a full rebuild that split leaves behind for the head-only frames that follow it. */
export interface TrailSplitState extends TrailSplitCut {
  /** The resampled vertices the prefix was drawn from (compared, not copied: the scene hands over a fresh array every frame). */
  prefixVertices: readonly TrailSplitVertex[];
}

export type TrailRedrawMode = 'keep' | 'tail' | 'full';

/** How far a point may stray from the straight line through the cut and still count as on it (px). */
const COLLINEAR_TOLERANCE_PX = 0.05;
/** How much further back than the preferred tail a straight cut is looked for, in tiles. */
export const TRAIL_SPLIT_SEARCH_BACK_TILES = 8;

/**
 * Where to cut: the latest vertex at least `tailTiles` tiles behind the end (searching back up to
 * TRAIL_SPLIT_SEARCH_BACK_TILES further) around which the path is a straight line for `clearancePx` each way. The straight
 * cut is what lets the tail be drawn leaving a small box behind it untouched and meet the prefix without a seam
 * (trailLayersCanvas.ts, excludeBehind). `accept` lets the caller veto a cut: the scene only accepts a vertex where a stroke
 * chunk of the whole trail starts, so the tail's chunks are exactly the whole trail's from there on. Null when the route is too short, a subpath break (a wrap corridor) lies in the tail,
 * or no straight cut is found: the caller then rebuilds in full as before.
 */
export const chooseTrailSplit = (
  vertices: readonly TrailSplitVertex[],
  tileSize: number,
  clearancePx: number,
  accept?: (cutIndex: number) => boolean,
  tailTiles: number = TRAIL_SPLIT_TAIL_TILES
): TrailSplitCut | null => {
  if (vertices.length < 4 || !(tileSize > 0)) {
    return null;
  }
  const totalLength = vertices[vertices.length - 1]!.distance;
  const preferred = totalLength - (tailTiles * tileSize);
  const earliest = totalLength - ((tailTiles + TRAIL_SPLIT_SEARCH_BACK_TILES) * tileSize);
  let start = -1;
  for (let i = 0; i < vertices.length - 1; i += 1) {
    if (vertices[i]!.distance <= preferred) {
      start = i;
    } else {
      break;
    }
  }
  for (let cut = start; cut >= 1 && vertices[cut]!.distance >= earliest; cut -= 1) {
    if (isStraightAround(vertices, cut, clearancePx) && (accept === undefined || accept(cut))) {
      for (let i = cut + 1; i < vertices.length; i += 1) {
        if (vertices[i]!.newSubpath) {
          return null;
        }
      }
      const here = vertices[cut]!;
      const ahead = vertices[cut + 1]!;
      const length = Math.hypot(ahead.x - here.x, ahead.y - here.y);
      let stableIndex = cut + 1;
      while (stableIndex < vertices.length - 1 && vertices[stableIndex]!.distance < here.distance + clearancePx) {
        stableIndex += 1;
      }
      return { cutIndex: cut, stableIndex, cutDistance: here.distance, x: here.x, y: here.y, dx: (ahead.x - here.x) / length, dy: (ahead.y - here.y) / length };
    }
  }
  return null;
};

/** Are all vertices within `clearancePx` of arc length of vertex `cut` (and one more each way) on one straight line? */
const isStraightAround = (vertices: readonly TrailSplitVertex[], cut: number, clearancePx: number): boolean => {
  const here = vertices[cut]!;
  const ahead = vertices[cut + 1];
  if (!ahead || ahead.newSubpath) {
    return false;
  }
  const length = Math.hypot(ahead.x - here.x, ahead.y - here.y);
  if (!(length > 0)) {
    return false;
  }
  const dx = (ahead.x - here.x) / length;
  const dy = (ahead.y - here.y) / length;
  const limitBack = here.distance - clearancePx;
  const limitAhead = here.distance + clearancePx;
  for (let i = cut - 1; i >= 0; i -= 1) {
    const v = vertices[i]!;
    if (Math.abs(((v.x - here.x) * dy) - ((v.y - here.y) * dx)) > COLLINEAR_TOLERANCE_PX || vertices[i + 1]!.newSubpath) {
      return false;
    }
    if (v.distance <= limitBack) {
      break;
    }
    if (i === 0) {
      return false;
    }
  }
  for (let i = cut + 1; i < vertices.length; i += 1) {
    const v = vertices[i]!;
    if (v.newSubpath || Math.abs(((v.x - here.x) * dy) - ((v.y - here.y) * dx)) > COLLINEAR_TOLERANCE_PX) {
      return false;
    }
    if (v.distance >= limitAhead) {
      break;
    }
    if (i === vertices.length - 1) {
      // The head itself is inside the clearance window: the cut is too close to the end.
      return false;
    }
  }
  return true;
};

/** True when `next` starts with exactly the first `cutIndex + 1` vertices of `previous` (same points, same distances). */
export const isTrailPrefixUnchanged = (
  previous: readonly TrailSplitVertex[],
  next: readonly TrailSplitVertex[],
  cutIndex: number
): boolean => {
  if (cutIndex < 1 || previous.length <= cutIndex || next.length <= cutIndex + 1) {
    return false;
  }
  for (let i = 0; i <= cutIndex; i += 1) {
    const a = previous[i]!;
    const b = next[i]!;
    if (a.x !== b.x || a.y !== b.y || a.distance !== b.distance || a.newSubpath !== b.newSubpath) {
      return false;
    }
  }
  return true;
};

/** Only the head (or the route it extends) moved: every input that restyles the old part is the same. */
export const isHeadOnlyStampChange = (previous: TrailDrawStamp, next: TrailDrawStamp): boolean => (
  previous.originX === next.originX
  && previous.originY === next.originY
  && previous.tileSize === next.tileSize
  && previous.alphaMultiplier === next.alphaMultiplier
  && previous.styleKey === next.styleKey
);

/** The head (or the route it extends) moved between two stamps. */
const hasHeadMoved = (previous: TrailDrawStamp, next: TrailDrawStamp): boolean => (
  previous.routeRevision !== next.routeRevision
  || previous.previousTileKey !== next.previousTileKey
  || previous.headX !== next.headX
  || previous.headY !== next.headY
);

/**
 * What the scene should do for this frame's trail request: `keep` the canvases as they are, redraw the `tail` only, or
 * rebuild `full`. `tail` is a candidate: the scene confirms it (isTrailPrefixUnchanged, the tail length bound) once the
 * geometry is built and falls back to `full` otherwise.
 */
export const planTrailRedraw = (
  previous: (TrailDrawRecord & { split?: TrailSplitState }) | null,
  next: TrailDrawStamp,
  nowMs: number,
  timeDriven: boolean
): TrailRedrawMode => {
  if (!shouldRebuildTrail(previous, next, nowMs, timeDriven)) {
    return 'keep';
  }
  if (
    previous === null
    || previous.split === undefined
    || !Number.isFinite(nowMs)
    || !isHeadOnlyStampChange(previous.stamp, next)
    || !hasHeadMoved(previous.stamp, next)
  ) {
    // Nothing split yet, something other than the head changed, or the head is still and only the colour clock is due.
    return 'full';
  }
  // The head moved. While the epoch is young, redraw just the tail at the epoch's clock; once it is due, everything.
  const elapsed = nowMs - previous.drawnAtMs;
  if (elapsed < 0 || (timeDriven && elapsed >= resolveTrailSplitEpochGapMs(previous.costMs))) {
    return 'full';
  }
  return 'tail';
};

/** Is the tail still short enough to keep redrawing on its own? */
export const isTrailTailWithinBound = (
  totalLength: number,
  split: TrailSplitState,
  tileSize: number
): boolean => (totalLength - split.cutDistance) <= TRAIL_SPLIT_MAX_TAIL_TILES * tileSize;
