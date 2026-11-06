/**
 * Image-based analysis of a maze-lifecycle capture (see
 * capture-maze-lifecycle.mjs). Everything exported is a pure function over
 * RGBA images / per-frame feature records, so it is unit-testable with tiny
 * synthetic images. The CLI at the bottom decodes a capture directory frame
 * by frame (streaming, bounded memory), extracts compact features and runs
 * the detectors:
 *
 *   (a) residual      - lit components left after the board should be gone,
 *                       and tile-sized islands near a screen edge that outlive
 *                       the rest of the board (the "bleed remnant" signature)
 *   (b) partial-bleed - edge/dock strips drawn strictly between 0 and 1 of
 *                       their settled extent for more than a few frames, or a
 *                       border cell lit while its strip is absent (or vice versa)
 *   (c) flicker       - build/deconstruct regions that go lit -> unlit -> lit,
 *                       and non-monotone total lit area
 *   (d) stall         - long runs of identical frames mid-build
 *   (e) timing        - simulated ms to first tile, build complete, input
 *                       unlocked, deconstruct start, board empty
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng } from './lib/png-codec.mjs';

export const DEFAULT_ANALYSIS_OPTIONS = Object.freeze({
  /** Path-core / dock pixels: bright and nearly neutral/mint. Excludes saturated stars, gear, digits, beams. */
  litMinChannel: 150,
  litMaxSpread: 70,
  /** Components smaller than this (px) are noise (sparkle cores, anti-aliasing). */
  minComponentArea: 24,
  /** Gaps up to this many px (rims, the cyan core stripe) do not split a component. */
  bridgePx: 2,
  /** Block size (px) for the flicker occupancy grid. */
  blockPx: 8,
  /** Block counts as lit when at least this fraction of its pixels are lit. */
  blockLitFraction: 0.4,
  /** A component whose bbox is within this many px of a screen edge is "near the edge". */
  edgeTolerancePx: 10,
  /** Tail = frames where total lit area <= this fraction of the deconstruct peak. */
  tailFraction: 0.06,
  /** Frames a lingering island must persist to be reported. */
  minPersistFrames: 4,
  /** Islands up to this many tile^2 are "tile-sized" (stub + tile fits). */
  islandMaxTiles: 4,
  /** Partial bleed: strip fraction strictly inside (low, high) ... */
  partialLow: 0.1,
  partialHigh: 0.9,
  /** ... for more than this many consecutive frames. */
  partialMinFrames: 3,
  /** Flicker: total-area drop (fraction of peak so far) tolerated before it counts as non-monotone. */
  monotoneTolerance: 0.01,
  /** Stall: consecutive near-identical frames (lit-pixel changes <= stallMaxChangedPx). */
  stallMinFrames: 10,
  /** Lit-pixel change at or below this (sparkle cores, anti-aliasing) still counts as an unchanged frame. */
  stallMaxChangedPx: 16,
  /** Blink: a block must flip lit<->unlit this many times (excluding the first transition) to count. */
  blinkMinReversals: 1
});

const isLit = (data, p, minChannel, maxSpread) => {
  const r = data[p]; const g = data[p + 1]; const b = data[p + 2];
  const lo = r < g ? (r < b ? r : b) : (g < b ? g : b);
  if (lo < minChannel) return false;
  const hi = r > g ? (r > b ? r : b) : (g > b ? g : b);
  return (hi - lo) <= maxSpread;
};

/** @returns {Uint8Array} 1 where the pixel is path/dock-lit. */
export const computeLitMask = (image, options = DEFAULT_ANALYSIS_OPTIONS) => {
  const { width, height, data } = image;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    mask[i] = isLit(data, i * 4, options.litMinChannel, options.litMaxSpread) ? 1 : 0;
  }
  return mask;
};

/** Box dilation (Chebyshev radius r) of a mask, separable. */
export const dilateMask = (mask, width, height, r) => {
  if (r <= 0) return mask;
  const horizontal = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let last = -Infinity;
    for (let x = 0; x < width; x += 1) if (mask[row + x]) last = x; else if (x - last <= r && last >= 0) horizontal[row + x] = 1; else horizontal[row + x] = 0;
    for (let x = 0; x < width; x += 1) if (mask[row + x]) horizontal[row + x] = 1;
    last = Infinity;
    for (let x = width - 1; x >= 0; x -= 1) if (mask[row + x]) last = x; else if (last - x <= r) horizontal[row + x] = 1;
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < width; x += 1) {
    let last = -Infinity;
    for (let y = 0; y < height; y += 1) { const i = y * width + x; if (horizontal[i]) { last = y; out[i] = 1; } else if (y - last <= r && last >= 0) out[i] = 1; }
    last = Infinity;
    for (let y = height - 1; y >= 0; y -= 1) { const i = y * width + x; if (horizontal[i]) last = y; else if (last - y <= r) out[i] = 1; }
  }
  return out;
};

/**
 * 4-connected components. `mask` defines connectivity (pass a dilated mask to
 * bridge small gaps); `areaMask` (default: mask) is what area/bbox/centroid
 * count. Components with area < minArea are dropped.
 */
export const labelComponents = (mask, width, height, minArea = 1, areaMask = mask) => {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let area = 0; let x0 = width; let y0 = height; let x1 = -1; let y1 = -1; let sx = 0; let sy = 0;
    while (sp > 0) {
      const i = stack[--sp];
      const x = i % width; const y = (i - x) / width;
      if (areaMask[i]) {
        area += 1; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < width - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && mask[i - width] && !seen[i - width]) { seen[i - width] = 1; stack[sp++] = i - width; }
      if (y < height - 1 && mask[i + width] && !seen[i + width]) { seen[i + width] = 1; stack[sp++] = i + width; }
    }
    if (area >= minArea) {
      components.push({ area, bbox: { x0, y0, x1, y1 }, cx: sx / area, cy: sy / area });
    }
  }
  return components;
};

const rectArea = (r) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);

const countLitInRect = (mask, width, height, rect) => {
  const x0 = Math.max(0, Math.floor(rect.x0)); const x1 = Math.min(width, Math.ceil(rect.x1));
  const y0 = Math.max(0, Math.floor(rect.y0)); const y1 = Math.min(height, Math.ceil(rect.y1));
  let lit = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) lit += mask[y * width + x];
  }
  return lit;
};

/** Furthest lit pixel from the board edge along the outward axis (px), 0 when none. */
const outwardExtent = (mask, width, height, rect, direction) => {
  const x0 = Math.max(0, Math.floor(rect.x0)); const x1 = Math.min(width, Math.ceil(rect.x1));
  const y0 = Math.max(0, Math.floor(rect.y0)); const y1 = Math.min(height, Math.ceil(rect.y1));
  let extent = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (!mask[y * width + x]) continue;
      const d = direction === 'right' ? x - x0 + 1
        : direction === 'left' ? x1 - x
          : direction === 'bottom' ? y - y0 + 1
            : y1 - y;
      if (d > extent) extent = d;
    }
  }
  return extent;
};

/**
 * Dock footprints from the capture manifest geometry: for each dock-eligible
 * border tile, the border cell and the outward strip between the board's
 * render bounds and the screen edge. Directions follow the tile's own border.
 * @returns {{id:string, direction:string, cell:object, strip:object}[]}
 */
export const resolveDockFootprints = ({ dockEligible, maze, board, screen }) => {
  if (!Array.isArray(dockEligible) || !maze || !board?.renderBounds || !board.tileSize) return [];
  const { left, top, right, bottom } = board.renderBounds;
  const tile = board.tileSize;
  const footprints = [];
  for (const key of dockEligible) {
    const [x, y] = String(key).split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const cx0 = left + (x * tile); const cy0 = top + (y * tile);
    const cell = { x0: cx0, y0: cy0, x1: cx0 + tile, y1: cy0 + tile };
    let direction = null;
    let strip = null;
    if (x === 0) { direction = 'left'; strip = { x0: 0, x1: left, y0: cell.y0, y1: cell.y1 }; }
    else if (x === maze.width - 1) { direction = 'right'; strip = { x0: right, x1: screen.width, y0: cell.y0, y1: cell.y1 }; }
    else if (y === 0) { direction = 'top'; strip = { x0: cell.x0, x1: cell.x1, y0: 0, y1: top }; }
    else if (y === maze.height - 1) { direction = 'bottom'; strip = { x0: cell.x0, x1: cell.x1, y0: bottom, y1: screen.height }; }
    if (direction && rectArea(strip) > 0) footprints.push({ id: key, direction, cell, strip });
  }
  return footprints;
};

/**
 * Compact per-frame features. `previousMask` (optional) is the previous
 * frame's lit mask, used for the changed-pixel count behind the stall detector.
 */
export const extractFrameFeatures = (image, { options = DEFAULT_ANALYSIS_OPTIONS, docks = [], previousMask = null, excludeMask = null } = {}) => {
  const { width, height } = image;
  const mask = computeLitMask(image, options);
  // Static decoration (title, sigils, HUD) lit in the baseline frame is not board content.
  if (excludeMask && excludeMask.length === mask.length) {
    for (let i = 0; i < mask.length; i += 1) if (excludeMask[i]) mask[i] = 0;
  }
  let litArea = 0;
  for (let i = 0; i < mask.length; i += 1) litArea += mask[i];
  const components = labelComponents(dilateMask(mask, width, height, options.bridgePx ?? 0), width, height, options.minComponentArea, mask);

  const bw = Math.ceil(width / options.blockPx);
  const bh = Math.ceil(height / options.blockPx);
  const blocks = new Uint8Array(bw * bh);
  const blockCounts = new Uint16Array(bw * bh);
  for (let y = 0; y < height; y += 1) {
    const by = Math.floor(y / options.blockPx) * bw;
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) blockCounts[by + Math.floor(x / options.blockPx)] += 1;
    }
  }
  const blockThreshold = options.blockLitFraction * options.blockPx * options.blockPx;
  for (let i = 0; i < blocks.length; i += 1) blocks[i] = blockCounts[i] >= blockThreshold ? 1 : 0;

  let changedPx = null;
  if (previousMask && previousMask.length === mask.length) {
    changedPx = 0;
    for (let i = 0; i < mask.length; i += 1) if (mask[i] !== previousMask[i]) changedPx += 1;
  }

  const dockStats = docks.map((dock) => ({
    id: dock.id,
    direction: dock.direction,
    cellLit: countLitInRect(mask, width, height, dock.cell),
    cellArea: rectArea(dock.cell),
    stripLit: countLitInRect(mask, width, height, dock.strip),
    stripArea: rectArea(dock.strip),
    stripExtent: outwardExtent(mask, width, height, dock.strip, dock.direction)
  }));

  return { width, height, litArea, components, blocks, blockGrid: { cols: bw, rows: bh }, changedPx, dockStats, mask };
};

const bboxCenterDistance = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);

const expandedOverlap = (a, b, pad) => !(
  a.x1 + pad < b.x0 || b.x1 + pad < a.x0 || a.y1 + pad < b.y0 || b.y1 + pad < a.y0
);

const nearestEdge = (bbox, width, height) => {
  const distances = { left: bbox.x0, top: bbox.y0, right: (width - 1) - bbox.x1, bottom: (height - 1) - bbox.y1 };
  let best = 'left';
  for (const side of Object.keys(distances)) if (distances[side] < distances[best]) best = side;
  return { side: best, distancePx: distances[best] };
};

const phaseRange = (frames, phases) => {
  const indices = frames.map((f, i) => (phases.includes(f.phase) ? i : -1)).filter((i) => i >= 0);
  return indices.length === 0 ? null : { from: indices[0], to: indices[indices.length - 1] };
};

/**
 * Components that exist in the baseline frame (before the board is built:
 * title, sigils, HUD) are static decoration, never residuals.
 */
const isStatic = (component, baselineComponents, pad = 3) => baselineComponents.some((b) => expandedOverlap(component.bbox, b.bbox, pad));

/**
 * (a) RESIDUAL detector.
 * features: per-frame feature records aligned with `frames` (manifest frames:
 * { index, phase, simMs }). Only frames in the deconstruct phase are scanned.
 */
export const detectResidual = ({ frames, features, tileSize = 12, options = DEFAULT_ANALYSIS_OPTIONS, baselineComponents = [] }) => {
  const range = phaseRange(frames, ['deconstruct']);
  const result = { applicable: range !== null, peakLitArea: 0, tailStartFrame: null, emptyFrame: null, residualAtEnd: [], islands: [], edgeOrphans: [] };
  if (!range) return result;
  const width = features[0].width; const height = features[0].height;
  for (let i = range.from; i <= range.to; i += 1) result.peakLitArea = Math.max(result.peakLitArea, features[i].litArea);
  const tailLimit = result.peakLitArea * options.tailFraction;

  const fresh = (i) => features[i].components.filter((c) => !isStatic(c, baselineComponents));
  const freshArea = (i) => fresh(i).reduce((sum, c) => sum + c.area, 0);

  for (let i = range.from; i <= range.to; i += 1) {
    if (result.tailStartFrame === null && freshArea(i) <= tailLimit) result.tailStartFrame = frames[i].index;
    if (result.emptyFrame === null && fresh(i).length === 0) result.emptyFrame = frames[i].index;
  }
  const last = fresh(range.to);
  result.residualAtEnd = last.map((c) => ({ ...summariseComponent(c, width, height, tileSize, options), frame: frames[range.to].index }));

  // Track islands in the tail: components matched across frames by centre distance.
  const tailFrom = result.tailStartFrame === null ? range.to + 1 : frames.findIndex((f) => f.index === result.tailStartFrame);
  const tracks = [];
  for (let i = Math.max(range.from, tailFrom); i <= range.to; i += 1) {
    for (const component of fresh(i)) {
      const match = tracks.find((t) => t.lastFrameIdx === i - 1 && expandedOverlap(t.last.bbox, component.bbox, 2));
      if (match) {
        match.last = component; match.lastFrameIdx = i; match.frameIdxs.push(i);
        match.maxArea = Math.max(match.maxArea, component.area);
      } else {
        tracks.push({ first: component, last: component, lastFrameIdx: i, frameIdxs: [i], maxArea: component.area });
      }
    }
  }
  for (const track of tracks) {
    if (track.frameIdxs.length < options.minPersistFrames) continue;
    const summary = summariseComponent(track.last, width, height, tileSize, options);
    const soleFrames = track.frameIdxs.filter((i) => fresh(i).length === 1).length;
    const island = {
      ...summary,
      firstFrame: frames[track.frameIdxs[0]].index,
      lastFrame: frames[track.frameIdxs[track.frameIdxs.length - 1]].index,
      persistFrames: track.frameIdxs.length,
      persistMs: frames[track.frameIdxs[track.frameIdxs.length - 1]].simMs - frames[track.frameIdxs[0]].simMs,
      soleSurvivorFrames: soleFrames,
      survivesToEnd: track.lastFrameIdx === range.to
    };
    result.islands.push(island);
    if (island.nearEdge && island.tileSized) result.edgeOrphans.push(island);
  }
  return result;
};

const summariseComponent = (component, width, height, tileSize, options) => {
  const bw = component.bbox.x1 - component.bbox.x0 + 1;
  const bh = component.bbox.y1 - component.bbox.y0 + 1;
  const edge = nearestEdge(component.bbox, width, height);
  return {
    bbox: component.bbox,
    area: component.area,
    widthPx: bw,
    heightPx: bh,
    nearEdge: edge.distancePx <= options.edgeTolerancePx,
    edge: edge.side,
    edgeDistancePx: edge.distancePx,
    tileSized: component.area <= options.islandMaxTiles * tileSize * tileSize && Math.max(bw, bh) <= options.islandMaxTiles * tileSize
  };
};

/**
 * (b) PARTIAL-BLEED detector over per-dock series from extractFrameFeatures.
 * Normalises each dock's strip/cell occupancy by its own settled maximum, so
 * the result is independent of absolute geometry.
 */
export const detectPartialBleed = ({ frames, features, options = DEFAULT_ANALYSIS_OPTIONS, phases = ['build', 'play', 'goal-hold', 'deconstruct'] }) => {
  const dockIds = new Map();
  for (const feature of features) for (const d of feature.dockStats) dockIds.set(d.id, d.direction);
  const findings = [];
  const perDock = [];
  for (const [id, direction] of dockIds) {
    const series = features.map((f) => f.dockStats.find((d) => d.id === id) ?? null);
    // Reference = the dock as it sits for most of its lifetime: the median over
    // frames where its border cell is lit (the extent uses the mode, being an
    // integer px length), so transient glow/laser overlays cannot inflate it.
    const present = series.filter((sample) => sample && sample.cellLit > 0);
    const median = (pick) => {
      const values = present.map(pick).sort((x, y) => x - y);
      return Math.max(1, values.length > 0 ? values[Math.floor(values.length / 2)] : 1);
    };
    const mode = (pick) => {
      const counts = new Map();
      for (const sample of present) { const v = pick(sample); counts.set(v, (counts.get(v) ?? 0) + 1); }
      let best = 1; let bestCount = 0;
      for (const [v, c] of counts) if (v > 0 && (c > bestCount || (c === bestCount && v > best))) { best = v; bestCount = c; }
      return best;
    };
    const refStrip = median((x) => x.stripLit);
    const refExtent = mode((x) => x.stripExtent);
    const refCell = median((x) => x.cellLit);
    const stripFrac = series.map((s) => (s ? Math.min(1.5, s.stripLit / refStrip) : 0));
    const extentFrac = series.map((s) => (s ? Math.min(1.5, s.stripExtent / refExtent) : 0));
    const cellFrac = series.map((s) => (s ? Math.min(1.5, s.cellLit / refCell) : 0));
    const inPhase = frames.map((f) => phases.includes(f.phase));

    const runs = (predicate) => {
      const out = [];
      let start = null;
      for (let i = 0; i <= frames.length; i += 1) {
        const hit = i < frames.length && inPhase[i] && predicate(i);
        if (hit && start === null) start = i;
        if (!hit && start !== null) { out.push([start, i - 1]); start = null; }
      }
      return out;
    };
    const describe = (kind, [a, b]) => ({
      kind, dock: id, direction,
      firstFrame: frames[a].index, lastFrame: frames[b].index, frames: b - a + 1,
      durationMs: frames[b].simMs - frames[a].simMs,
      phase: frames[a].phase,
      stripFractionRange: [Math.min(...stripFrac.slice(a, b + 1)), Math.max(...stripFrac.slice(a, b + 1))].map((v) => Math.round(v * 100) / 100),
      extentFractionRange: [Math.min(...extentFrac.slice(a, b + 1)), Math.max(...extentFrac.slice(a, b + 1))].map((v) => Math.round(v * 100) / 100)
    });
    const cellOn = (i) => cellFrac[i] >= 0.5;
    const stripOn = (i) => stripFrac[i] >= 0.5;
    const stripOff = (i) => stripFrac[i] < options.partialLow;
    const partial = (i) => extentFrac[i] > options.partialLow && extentFrac[i] < options.partialHigh;

    for (const run of runs(partial)) {
      if (run[1] - run[0] + 1 > options.partialMinFrames) findings.push(describe('partial-strip', run));
    }
    for (const run of runs((i) => cellOn(i) && stripOff(i))) {
      if (run[1] - run[0] + 1 > options.partialMinFrames) findings.push(describe('cell-without-strip', run));
    }
    for (const run of runs((i) => stripOn(i) && !cellOn(i) && cellFrac[i] < options.partialLow)) {
      if (run[1] - run[0] + 1 > options.partialMinFrames) findings.push(describe('strip-without-cell', run));
    }
    perDock.push({
      dock: id, direction,
      referenceStripPx: refStrip, referenceExtentPx: refExtent, referenceCellPx: refCell,
      firstCellFrame: firstWhere(frames, cellFrac, (v) => v >= 0.5),
      firstStripFrame: firstWhere(frames, stripFrac, (v) => v >= 0.1),
      fullStripFrame: firstWhere(frames, extentFrac, (v) => v >= options.partialHigh),
      lastStripFrame: lastWhere(frames, stripFrac, (v) => v >= 0.1),
      lastCellFrame: lastWhere(frames, cellFrac, (v) => v >= 0.5)
    });
  }
  return { applicable: dockIds.size > 0, docks: perDock, findings };
};

const firstWhere = (frames, values, predicate) => {
  const i = values.findIndex(predicate);
  return i < 0 ? null : frames[i].index;
};
const lastWhere = (frames, values, predicate) => {
  for (let i = values.length - 1; i >= 0; i -= 1) if (predicate(values[i])) return frames[i].index;
  return null;
};

/**
 * (c) FLICKER / non-monotone detector.
 * Build frames: total lit area and every block should only grow; deconstruct
 * frames: only shrink. Reports total-area reversals and blocks that flip
 * lit -> unlit -> lit (build) or unlit -> lit after having been lit (deconstruct).
 */
export const detectFlicker = ({ frames, features, options = DEFAULT_ANALYSIS_OPTIONS, baselineBlocks = null }) => {
  const result = { build: summariseMonotone(frames, features, 'build', +1, options, baselineBlocks), deconstruct: summariseMonotone(frames, features, 'deconstruct', -1, options, baselineBlocks) };
  return result;
};

const summariseMonotone = (frames, features, phase, direction, options, baselineBlocks) => {
  const idx = frames.map((f, i) => (f.phase === phase ? i : -1)).filter((i) => i >= 0);
  const out = { applicable: idx.length > 1, areaReversals: [], blinkingBlocks: [] };
  if (idx.length < 2) return out;
  // Total-area reversals: build must not fall below its running max (deconstruct: rise above running min).
  let extreme = features[idx[0]].litArea;
  let active = null;
  for (const i of idx) {
    const area = features[i].litArea;
    const tol = Math.max(1, options.monotoneTolerance * Math.max(extreme, 1));
    const violating = direction > 0 ? area < extreme - tol : area > extreme + tol;
    if (violating) {
      if (!active) active = { fromFrame: frames[i].index, toFrame: frames[i].index, worstDeltaPx: 0, simMs: frames[i].simMs };
      active.toFrame = frames[i].index;
      active.worstDeltaPx = Math.max(active.worstDeltaPx, Math.abs(area - extreme));
    } else if (active) {
      out.areaReversals.push(active); active = null;
    }
    extreme = direction > 0 ? Math.max(extreme, area) : Math.min(extreme, area);
  }
  if (active) out.areaReversals.push(active);

  // Per-block blink: build expects only 0->1 transitions, deconstruct only 1->0.
  // Every transition in the other direction is "unexpected"; a block with at
  // least blinkMinReversals of them flickered (it vanished/appeared against
  // the phase direction, usually then flipped back).
  const blocks = features[idx[0]].blocks.length;
  const offenders = [];
  for (let b = 0; b < blocks; b += 1) {
    if (baselineBlocks && baselineBlocks[b]) continue;
    let prev = features[idx[0]].blocks[b];
    const unexpectedFrames = [];
    for (let k = 1; k < idx.length; k += 1) {
      const cur = features[idx[k]].blocks[b];
      if (cur !== prev) {
        const expected = direction > 0 ? cur === 1 : cur === 0;
        if (!expected) unexpectedFrames.push(frames[idx[k]].index);
        prev = cur;
      }
    }
    if (unexpectedFrames.length >= options.blinkMinReversals) {
      offenders.push({ block: b, transitions: unexpectedFrames.length, frames: unexpectedFrames.slice(0, 8) });
    }
  }
  const cols = features[idx[0]].blockGrid.cols;
  out.blinkingBlocks = offenders
    .sort((a, b) => b.transitions - a.transitions)
    .slice(0, 20)
    .map((o) => ({ ...o, xPx: (o.block % cols) * options.blockPx, yPx: Math.floor(o.block / cols) * options.blockPx }));
  out.blinkingBlockCount = offenders.length;
  return out;
};

/**
 * (d) STALL detector: runs of >= stallMinFrames frames whose lit mask is
 * unchanged while the build is still visually in progress (between the first
 * growth and the last growth in the build phase). A leading run before the
 * first tile is reported separately as `leadingIdle`.
 */
export const detectStalls = ({ frames, features, options = DEFAULT_ANALYSIS_OPTIONS, phase = 'build' }) => {
  const idx = frames.map((f, i) => (f.phase === phase ? i : -1)).filter((i) => i >= 0);
  const out = { applicable: idx.length > 2, leadingIdle: null, stalls: [], firstGrowthFrame: null, lastGrowthFrame: null };
  if (idx.length <= 2) return out;
  // idx[0]'s change is measured against the pre-baseline (menu hand-over) frame, so skip it.
  const grows = (i) => i !== idx[0] && features[i].changedPx !== null && features[i].changedPx > options.stallMaxChangedPx;
  const firstGrowth = idx.find(grows);
  const lastGrowth = [...idx].reverse().find(grows);
  if (firstGrowth === undefined) return out;
  out.firstGrowthFrame = frames[firstGrowth].index;
  out.lastGrowthFrame = frames[lastGrowth].index;
  out.trailingIdleMs = frames[idx[idx.length - 1]].simMs - frames[lastGrowth].simMs;
  out.leadingIdle = { frames: firstGrowth - idx[0], ms: frames[firstGrowth].simMs - frames[idx[0]].simMs, fromStartMs: frames[firstGrowth].simMs };
  let runStart = null;
  for (let i = firstGrowth; i <= lastGrowth + 1; i += 1) {
    const idle = i <= lastGrowth && !grows(i);
    if (idle && runStart === null) runStart = i;
    if (!idle && runStart !== null) {
      const length = i - runStart;
      if (length >= options.stallMinFrames) {
        out.stalls.push({ fromFrame: frames[runStart].index, toFrame: frames[i - 1].index, frames: length, ms: frames[i - 1].simMs - frames[runStart].simMs + (frames[1] ? frames[1].simMs - frames[0].simMs : 0) });
      }
      runStart = null;
    }
  }
  return out;
};

/** (e) TIMING from the manifest milestones + image-derived first/last growth and empty frame. */
export const computeTiming = ({ manifest, frames, features, residual, stalls }) => {
  const at = (frameIndex) => (frameIndex === null || frameIndex === undefined ? null : frames.find((f) => f.index === frameIndex)?.simMs ?? null);
  const m = manifest?.milestones ?? {};
  return {
    startPressSimMs: 0,
    firstTileVisibleSimMs: at(stalls.firstGrowthFrame),
    buildVisuallyCompleteSimMs: at(stalls.lastGrowthFrame),
    inputUnlockedSimMs: m.inputUnlockedSimMs ?? null,
    goalReachedSimMs: m.goalReachedSimMs ?? null,
    deconstructStartSimMs: m.deconstructStartSimMs ?? null,
    boardEmptyProbeSimMs: m.boardEmptyProbeSimMs ?? null,
    boardEmptyImageSimMs: at(residual.emptyFrame),
    startToInputUnlockedMs: m.inputUnlockedSimMs ?? null,
    startToBoardEmptyMs: at(residual.emptyFrame),
    deconstructDurationMs: at(residual.emptyFrame) !== null && m.deconstructStartSimMs != null ? at(residual.emptyFrame) - m.deconstructStartSimMs : null,
    lastFrameSimMs: m.lastFrameSimMs ?? null
  };
};

/**
 * Baseline = the emptiest play-board frame near the start of the build (after
 * the menu board has gone, before the first tile): title/HUD/sigils live in it,
 * so anything that overlaps one of its components is static decoration.
 * @returns {number} index into frames/features
 */
export const selectBaselineIndex = (frames, features, window = 25) => {
  const buildIdx = frames.map((f, i) => (f.phase === 'build' ? i : -1)).filter((i) => i >= 0).slice(0, window);
  if (buildIdx.length === 0) return 0;
  let best = buildIdx[0];
  for (const i of buildIdx) if (features[i].litArea < features[best].litArea) best = i;
  return best;
};

/**
 * Isolated tile-sized components (not the main body) that persist for
 * >= minPersistFrames consecutive frames in build or deconstruct. A tile+dock
 * that is lit while none of its on-screen neighbours are is the signature of
 * a reveal-order/wrap-partner artefact; `nearEdge` marks the bleed-dock case.
 */
export const detectIslands = ({ frames, features, tileSize = 12, options = DEFAULT_ANALYSIS_OPTIONS, baselineComponents = [], phases = ['build', 'deconstruct'] }) => {
  const tracks = [];
  let previous = [];
  for (let i = 0; i < frames.length; i += 1) {
    if (!phases.includes(frames[i].phase)) { previous = []; continue; }
    const { width, height } = features[i];
    const fresh = features[i].components.filter((c) => !isStatic(c, baselineComponents));
    const main = fresh.reduce((best, c) => (!best || c.area > best.area ? c : best), null);
    const current = [];
    for (const component of fresh) {
      if (component === main) continue;
      const summary = summariseComponent(component, width, height, tileSize, options);
      if (!summary.tileSized) continue;
      const match = previous.find((t) => expandedOverlap(t.last.bbox, component.bbox, 2));
      if (match) {
        match.last = component; match.idxs.push(i); match.maxArea = Math.max(match.maxArea, component.area); current.push(match);
      } else {
        const track = { last: component, idxs: [i], maxArea: component.area, phase: frames[i].phase, width, height };
        tracks.push(track); current.push(track);
      }
    }
    previous = current;
  }
  return tracks
    .filter((t) => t.idxs.length >= options.minPersistFrames)
    .map((t) => {
      const first = frames[t.idxs[0]]; const last = frames[t.idxs[t.idxs.length - 1]];
      return {
        phase: t.phase,
        firstFrame: first.index, lastFrame: last.index, frames: t.idxs.length, durationMs: last.simMs - first.simMs,
        ...summariseComponent(t.last, t.width, t.height, tileSize, options)
      };
    });
};

/** Run every detector over already-extracted features. */
export const analyzeFeatures = ({ manifest, frames, features, options = DEFAULT_ANALYSIS_OPTIONS, tileSize }) => {
  const baselineIdx = selectBaselineIndex(frames, features);
  const baselineComponents = features[baselineIdx]?.components ?? [];
  const baselineBlocks = features[baselineIdx]?.blocks ?? null;
  // Build-phase detectors ignore the menu->play hand-over frames before the baseline.
  const fromBaseline = (arr) => arr.slice(baselineIdx);
  const residual = detectResidual({ frames, features, tileSize, options, baselineComponents });
  const islands = detectIslands({ frames, features, tileSize, options, baselineComponents });
  const partialBleed = detectPartialBleed({ frames, features, options });
  const flicker = detectFlicker({ frames: fromBaseline(frames), features: fromBaseline(features), options, baselineBlocks });
  const stalls = detectStalls({ frames: fromBaseline(frames), features: fromBaseline(features), options });
  const timing = computeTiming({ manifest, frames, features, residual, stalls });
  return { baselineFrame: frames[baselineIdx]?.index ?? null, residual, islands, partialBleed, flicker, stalls, timing };
};

const fmtBox = (b) => `[${b.x0},${b.y0}..${b.x1},${b.y1}]`;

export const formatReport = (label, report) => {
  const lines = [`== Maze lifecycle analysis: ${label} ==`];
  const t = report.timing;
  lines.push('Timing (simulated ms)');
  lines.push(`  Start press -> first tile visible : ${t.firstTileVisibleSimMs}`);
  lines.push(`  Start press -> build visually done: ${t.buildVisuallyCompleteSimMs}`);
  lines.push(`  Start press -> input unlocked     : ${t.inputUnlockedSimMs}`);
  lines.push(`  Goal reached                      : ${t.goalReachedSimMs}`);
  lines.push(`  Deconstruct start                 : ${t.deconstructStartSimMs}`);
  lines.push(`  Board empty (probe / image)       : ${t.boardEmptyProbeSimMs} / ${t.boardEmptyImageSimMs}`);
  lines.push(`  Deconstruct duration (image)      : ${t.deconstructDurationMs}`);
  const r = report.residual;
  lines.push(`Residual: ${r.applicable ? '' : 'n/a'}`);
  if (r.applicable) {
    lines.push(`  peak lit area ${r.peakLitArea}px; tail starts frame ${r.tailStartFrame}; image-empty frame ${r.emptyFrame}`);
    lines.push(`  residual components in LAST frame: ${r.residualAtEnd.length}`);
    for (const c of r.residualAtEnd) lines.push(`    ${fmtBox(c.bbox)} area ${c.area} ${c.nearEdge ? `near ${c.edge} edge (${c.edgeDistancePx}px)` : ''}`);
    lines.push(`  lingering islands in tail: ${r.islands.length} (edge orphans: ${r.edgeOrphans.length})`);
    for (const c of r.islands) {
      lines.push(`    frames ${c.firstFrame}-${c.lastFrame} (${c.persistFrames}f, ${c.persistMs}ms) ${fmtBox(c.bbox)} area ${c.area} ${c.tileSized ? 'tile-sized' : 'larger'}${c.nearEdge ? ` near ${c.edge} edge` : ''}; sole survivor ${c.soleSurvivorFrames}f${c.survivesToEnd ? '; SURVIVES TO END' : ''}`);
    }
  }
  lines.push(`Isolated islands (tile-sized, not main body, persisting >= minPersist frames): ${report.islands.length}`);
  for (const c of report.islands) {
    lines.push(`  ${c.phase} frames ${c.firstFrame}-${c.lastFrame} (${c.frames}f, ${c.durationMs}ms) ${fmtBox(c.bbox)} area ${c.area}${c.nearEdge ? ` NEAR ${c.edge.toUpperCase()} EDGE (${c.edgeDistancePx}px)` : ''}`);
  }
  const p = report.partialBleed;
  lines.push(`Partial bleed: ${p.applicable ? `${p.docks.length} dock(s), ${p.findings.length} finding(s)` : 'no docks in this capture'}`);
  for (const d of p.docks) lines.push(`  dock ${d.dock} (${d.direction}): cell first ${d.firstCellFrame}, strip first ${d.firstStripFrame}, strip full ${d.fullStripFrame}, strip last ${d.lastStripFrame}, cell last ${d.lastCellFrame}`);
  for (const f of p.findings) lines.push(`  ${f.kind} dock ${f.dock} frames ${f.firstFrame}-${f.lastFrame} (${f.frames}f, ${f.durationMs}ms, ${f.phase}) strip ${f.stripFractionRange.join('-')} extent ${f.extentFractionRange.join('-')}`);
  const f = report.flicker;
  for (const phase of ['build', 'deconstruct']) {
    const s = f[phase];
    lines.push(`Flicker (${phase}): ${s.applicable ? `${s.areaReversals.length} area reversal(s), ${s.blinkingBlockCount ?? 0} blinking block(s)` : 'n/a'}`);
    for (const a of s.areaReversals.slice(0, 8)) lines.push(`  area reversal frames ${a.fromFrame}-${a.toFrame} worst ${a.worstDeltaPx}px`);
    for (const b of s.blinkingBlocks.slice(0, 6)) lines.push(`  block @(${b.xPx},${b.yPx}) flipped on frames ${b.frames.join(',')}`);
  }
  const s = report.stalls;
  lines.push(`Stall (build): ${s.applicable ? `first tile at ${s.leadingIdle?.fromStartMs}ms after Start; trailing dead time ${s.trailingIdleMs ?? 0}ms after the last visible growth; ${s.stalls.length} mid-build stall(s)` : 'n/a'}`);
  for (const x of s.stalls) lines.push(`  frames ${x.fromFrame}-${x.toFrame} (${x.frames}f, ~${x.ms}ms)`);
  return lines.join('\n');
};

const stripMask = (feature) => { const { mask, ...rest } = feature; return rest; };

export const analyzeCaptureDirectory = async (runDir, { options = DEFAULT_ANALYSIS_OPTIONS } = {}) => {
  const manifest = JSON.parse(await readFile(join(runDir, 'manifest.json'), 'utf8'));
  const frames = manifest.frames;
  const viewport = manifest.options.viewport;
  // Dock footprints from the first frame that reports eligible docks (settled maze).
  // Geometry must come from the play maze (not the menu maze shown at frame 0):
  // use the settled/play frame at which input first unlocked.
  const hasDocks = (f) => Array.isArray(f.dockEligible) && f.dockEligible.length > 0 && f.board?.renderBounds;
  const geometryFrame = frames.find((f) => f.phase === 'play' && hasDocks(f)) ?? frames.find((f) => f.mode === 'play' && f.drawPhase === 'settled' && hasDocks(f)) ?? null;
  const docks = geometryFrame
    ? resolveDockFootprints({ dockEligible: geometryFrame.dockEligible, maze: geometryFrame.maze, board: geometryFrame.board, screen: viewport })
    : [];
  const tileSize = geometryFrame?.board?.tileSize ?? frames.find((f) => f.board?.tileSize)?.board?.tileSize ?? 12;
  // Pass 1: pick the baseline (emptiest early build frame) and keep its lit mask.
  const earlyBuild = frames.filter((f) => f.phase === 'build').slice(0, 25);
  let baselineMask = null;
  let baselineLit = Infinity;
  for (const frame of earlyBuild) {
    const mask = computeLitMask(decodePng(await readFile(join(runDir, frame.file))), options);
    let lit = 0;
    for (let i = 0; i < mask.length; i += 1) lit += mask[i];
    if (lit < baselineLit) { baselineLit = lit; baselineMask = mask; }
  }
  const excludeMask = baselineMask ? dilateMask(baselineMask, viewport.width, viewport.height, 1) : null;
  // Pass 2: stream every frame into compact features.
  const features = [];
  let previousMask = null;
  for (const frame of frames) {
    const image = decodePng(await readFile(join(runDir, frame.file)));
    const feature = extractFrameFeatures(image, { options, docks, previousMask, excludeMask });
    previousMask = feature.mask;
    features.push(stripMask(feature));
  }
  const report = analyzeFeatures({ manifest, frames, features, options, tileSize });
  return { label: manifest.label, options: manifest.options, tileSize, docks: docks.map((d) => ({ id: d.id, direction: d.direction })), ...report, text: formatReport(manifest.label, report) };
};

const parseArgs = (argv) => {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const body = argv[i].slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) args[body.slice(0, eq)] = body.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) { args[body] = argv[i + 1]; i += 1; } else args[body] = true;
    } else args._.push(argv[i]);
  }
  return args;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args._.length === 0 || args.help) {
    process.stdout.write('Usage: node scripts/visual/analyze-maze-lifecycle.mjs <captureRunDir> [<runDir>...] [--json report.json]\n');
    return;
  }
  const reports = [];
  for (const dir of args._) {
    const report = await analyzeCaptureDirectory(resolve(dir));
    process.stdout.write(`${report.text}\n\n`);
    reports.push(report);
    const target = typeof args.json === 'string' && args._.length === 1 ? resolve(args.json) : join(resolve(dir), 'analysis.json');
    const { text, ...json } = report;
    await writeFile(target, JSON.stringify(json, null, 2));
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('FATAL', error);
    process.exitCode = 1;
  });
}
