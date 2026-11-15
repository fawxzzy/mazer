/**
 * Maze build-in / build-out (MAZER-VIS-040, reworked by MAZER-MOTION-020): one closed-form timeline for the whole maze.
 *
 * History: the floor was first revealed by a hard rank MASK (a handful of cells popped per frame), then (VIS-040)
 * by a per-cell ALPHA fade on the BFS order. The owner did not like the fade: a half-faded tile showed its pale rim
 * ahead of its dark fill (the thin white line), and a soft band of ghost tiles is not a build.
 *
 * Now nothing fades. Every floor cell has an EXTENT, 0 (nothing of it drawn) .. 1 (all of it), positioned on the same
 * BFS order, and the board draws that part of the cell at full strength, growing from the side its BFS parent is on
 * (boardTileLayer.ts composeBoardTileRevealSoft). Cells are staggered by their rank, so the corridors extrude along
 * their paths like a line being drawn and the tear-down pulls them back to the start the same way.
 *
 *   cell with rank r of N (position p = r / (N - 1)), window [start, start + span], per-cell wipe w = span / N:
 *     build        extent = clamp((t - (start + (span - w) * p)) / w)             = clamp((t - start) / w - r)
 *     deconstruct  extent = 1 - clamp((t - (start + (span - w) * (1 - p))) / w)   (the build run backwards)
 *
 * The wipe of one cell is exactly one rank step long, so cell r starts the instant cell r - 1 is whole. A cell's BFS
 * parent always has a lower rank, so a cell never starts before its parent is complete: the drawn line has no gap
 * in it at any instant, on any maze, and its tip advances at a constant speed (linear, no easing: an eased wipe
 * stutters when it repeats every ~14 ms).
 *
 * The first cell starts at the window start and the LAST cell finishes exactly at the window end, so the build
 * is complete at `resolveIntroRevealEndMs` (the instant the beams leave, unchanged) and the deconstruct is empty
 * at `resolveOutroTilesEndMs` (unchanged); input unlock and every total duration are untouched. The window
 * itself is the shipped `introTimeline.ts` one (build 100 ms in, N / 70 tiles per s clamped to 2.0-3.2 s;
 * deconstruct 400 ms in, clamped to 1.8-3.0 s).
 *
 * The bleed-off docks (the short paths that run off the board edge) are part of that same sequence (follow-up to
 * MOTION-020: they used to pop in as one group after the build and out as one group before the tear-down). Each dock
 * is one more stretch of line after the border cell that owns it: it starts to grow outward from that cell the
 * instant the cell is whole and advances at the same speed as the rest of the line (one cell length per rank step),
 * so the docks are drawn out in step with their neighbours. The tear-down is the same run backwards: a dock is pulled
 * back into its cell just before that cell starts to go. A dock's growth is capped at `MAZE_DOCK_FADE_MS` so a tiny
 * maze (a rank step of seconds) cannot crawl. The border cell itself no longer waits for the dock: it follows its rank
 * like every other cell.
 *
 * The other thing that used to pop rides the same clock on a motion-scale duration:
 *   - start / goal markers (alpha only, through a thin hook): fade in over the beam flight (the cast used to snap
 *     in when the beams landed). Markers are sprites, not baked board art, so a fade has no rim to leak.
 * The strict 0/1 `bleedProgress` switch of `introTimeline.ts` is NOT changed: it still drives the edge-path
 * logic (trail, bleed glow); only the baked board's own extent (cells and docks) follows the timeline here.
 *
 * Reduced motion: no front at all (`resolveMazeRevealFrame` returns null); the 200 ms crossfade of
 * `introTimeline.ts` is the whole effect. `introTimeline.ts` already computed its `boardAlpha` but nothing applied it:
 * the board used to cut in / out in one frame at that setting, so `resolveReducedBoardFade` now gives the board layer
 * that crossfade (one Image alpha, no recompose).
 *
 * Pure: no Phaser, DOM, randomness or wall-clock dependency.
 */
import {
  INTRO_BUILD_START_MS,
  INTRO_LASER_MS,
  INTRO_REDUCED_MOTION_MS,
  OUTRO_REDUCED_MOTION_MS,
  OUTRO_TILES_START_MS,
  resolveIntroRevealEndMs,
  resolveIntroRevealMs,
  resolveOutroRemoveMs
} from './introTimeline';
import { MOTION_DURATION_MS, MOTION_EASING } from './motionScale';

export type MazeRevealDirection = 'build' | 'deconstruct';

/**
 * Longest a bleed-off dock takes to grow out of its cell (200 ms, the "base" step), and how long after the last cell
 * the build frame lives so the last dock can finish.
 */
export const MAZE_DOCK_FADE_MS = MOTION_DURATION_MS.base;
/** The start / goal markers fade in over the beam flight (INTRO_LASER_MS, the "long" step). */
export const MAZE_MARKER_FADE_MS = INTRO_LASER_MS;

const { smoothstep } = MOTION_EASING;

const clamp01 = (value: number): number => (
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
);

const normalizeCount = (value: number): number => (
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
);

const normalizeElapsed = (value: number): number => (
  Number.isFinite(value) ? Math.max(0, value) : 0
);

export interface MazeRevealWindow {
  /** Instant (ms, intro / deconstruct clock) the first cell starts to grow (build) or shrink (deconstruct). */
  readonly startMs: number;
  /** Instant the last cell has finished (build: the build end; deconstruct: the tiles-gone instant). */
  readonly endMs: number;
  /** Length of one cell's wipe: the window divided by the cell count, so one cell starts as the previous one finishes. */
  readonly rampMs: number;
}

export const resolveMazeRevealWindow = (direction: MazeRevealDirection, tileCount: number): MazeRevealWindow => {
  const count = normalizeCount(tileCount);
  const startMs = direction === 'build' ? INTRO_BUILD_START_MS : OUTRO_TILES_START_MS;
  const spanMs = direction === 'build' ? resolveIntroRevealMs(count) : resolveOutroRemoveMs(count);
  return { startMs, endMs: startMs + spanMs, rampMs: spanMs / Math.max(1, count) };
};

/** Where cell `rank` sits in the BFS order, 0 (the spawn tile) .. 1 (the last cell). */
export const resolveRankPosition = (rank: number, tileCount: number): number => (
  tileCount <= 1 ? 0 : clamp01(rank / (tileCount - 1))
);

/** The instant (ms) the floor cell with BFS rank `rank` starts to grow (build) or to shrink (deconstruct). */
export const resolveCellStartMs = (
  direction: MazeRevealDirection,
  window: MazeRevealWindow,
  rank: number,
  tileCount: number
): number => {
  const position = resolveRankPosition(rank, tileCount);
  const travel = window.endMs - window.startMs - window.rampMs;
  return window.startMs + (travel * (direction === 'build' ? position : 1 - position));
};

/** How much (0..1) of the floor cell with BFS rank `rank` is shown at `elapsedMs`. */
export const resolveCellRevealExtent = (
  direction: MazeRevealDirection,
  window: MazeRevealWindow,
  rank: number,
  tileCount: number,
  elapsedMs: number
): number => {
  const cellStartMs = resolveCellStartMs(direction, window, rank, tileCount);
  // Snap the last float crumbs so a finished cell is exactly 1 / 0 (the window ends are contracts) and a cell that
  // has not started is exactly 0.
  const raw = clamp01((normalizeElapsed(elapsedMs) - cellStartMs) / window.rampMs);
  const progress = raw < 1e-9 ? 0 : (raw > 1 - 1e-9 ? 1 : raw);
  return direction === 'build' ? progress : 1 - progress;
};

/**
 * Fills `out[i]` with the extent of every cell whose `ranks[i] >= 0` (a floor cell in the reveal order) and 0
 * for the others (walls: the board mask derives their extent from the floors around them).
 */
export const fillMazeRevealCellExtent = (
  out: Float32Array,
  ranks: Int32Array,
  tileCount: number,
  direction: MazeRevealDirection,
  window: MazeRevealWindow,
  elapsedMs: number
): void => {
  const count = Math.min(out.length, ranks.length);
  for (let index = 0; index < count; index += 1) {
    const rank = ranks[index]!;
    out[index] = rank < 0 ? 0 : resolveCellRevealExtent(direction, window, rank, tileCount, elapsedMs);
  }
};

/** How long a dock of `lengthCells` cells takes to grow out of (or retract into) its border cell. */
export const resolveDockGrowMs = (window: MazeRevealWindow, lengthCells: number): number => (
  Math.min(MAZE_DOCK_FADE_MS, window.rampMs * Math.max(0.01, Number.isFinite(lengthCells) ? lengthCells : 1))
);

/**
 * How far (0..1) the bleed-off dock of the border cell with BFS rank `ownerRank` has grown out of the board edge at
 * `elapsedMs`. It is one more stretch of line after its cell, drawn at the same speed as the rest of the maze (one
 * cell length per rank step, linear; see the file header):
 *   build        0 until the owner cell is whole, then grows to 1 over `resolveDockGrowMs`
 *   deconstruct  1 until just before the owner cell starts to go, then retracts so it is exactly 0 the instant the owner
 *                starts to shrink (the build run backwards)
 * A cell outside the reveal order (`ownerRank < 0`) never shows its dock here.
 */
export const resolveDockReachExtent = (
  direction: MazeRevealDirection,
  window: MazeRevealWindow,
  ownerRank: number,
  tileCount: number,
  lengthCells: number,
  elapsedMs: number
): number => {
  if (ownerRank < 0) {
    return 0;
  }
  const growMs = resolveDockGrowMs(window, lengthCells);
  const elapsed = normalizeElapsed(elapsedMs);
  const cellStartMs = resolveCellStartMs(direction, window, ownerRank, tileCount);
  const raw = clamp01(direction === 'build'
    ? (elapsed - (cellStartMs + window.rampMs)) / growMs
    : (cellStartMs - elapsed) / growMs);
  return raw < 1e-9 ? 0 : (raw > 1 - 1e-9 ? 1 : raw);
};

/**
 * Alpha multiplier of the start / goal markers during the BUILD: 0 until the beams leave (the build end), eased
 * to 1 over the beam flight, so the cast lands as the beams do. The deconstruct keeps its own fade.
 */
export const resolveMarkerRevealAlpha = (tileCount: number, elapsedMs: number): number => (
  smoothstep(clamp01((normalizeElapsed(elapsedMs) - resolveIntroRevealEndMs(tileCount)) / MAZE_MARKER_FADE_MS))
);

export interface MazeRevealFrame {
  readonly direction: MazeRevealDirection;
  readonly elapsedMs: number;
  readonly tileCount: number;
  readonly window: MazeRevealWindow;
  /** Changes whenever anything this frame draws changes: lets the board layer skip an identical recompose. */
  readonly key: string;
}

/**
 * The build / tear-down frame at `elapsedMs`, or null when the board is NOT in a soft reveal: reduced motion (the crossfade
 * is the whole effect), nothing to reveal, the build finished and its docks have faded in, or the deconstruct has
 * emptied the board (the hard limit of 0 keeps it empty until the next maze).
 */
export const resolveMazeRevealFrame = (
  direction: MazeRevealDirection,
  elapsedMs: number,
  tileCount: number,
  reducedMotion: boolean
): MazeRevealFrame | null => {
  const count = normalizeCount(tileCount);
  if (reducedMotion || count <= 0) {
    return null;
  }
  const elapsed = normalizeElapsed(elapsedMs);
  const window = resolveMazeRevealWindow(direction, count);
  // The build frame lives through the last dock's growth, the deconstruct frame until the board is empty.
  if (elapsed >= (direction === 'build' ? window.endMs + MAZE_DOCK_FADE_MS : window.endMs)) {
    return null;
  }
  // Nothing on the board changes after `contentEndMs`, so the key stops changing there: no recompose for an
  // identical board. A quarter of a millisecond is far finer than a device pixel of wipe at these speeds.
  const contentEndMs = direction === 'build' ? window.endMs + MAZE_DOCK_FADE_MS : window.endMs;
  const stamp = Math.round(Math.min(elapsed, contentEndMs) * 4);
  return {
    direction,
    elapsedMs: elapsed,
    tileCount: count,
    window,
    key: `${direction}|${count}|${stamp}`
  };
};

/**
 * Reduced motion only: the alpha of the whole board layer during the 200 ms crossfade (build: 0 to 1, deconstruct:
 * 1 to 0), or null when there is no crossfade (full motion, or it has finished and the hard state applies).
 */
export const resolveReducedBoardFade = (
  direction: MazeRevealDirection,
  elapsedMs: number,
  tileCount: number,
  reducedMotion: boolean
): number | null => {
  if (!reducedMotion || normalizeCount(tileCount) <= 0) {
    return null;
  }
  const elapsed = normalizeElapsed(elapsedMs);
  const length = direction === 'build' ? INTRO_REDUCED_MOTION_MS : OUTRO_REDUCED_MOTION_MS;
  if (elapsed >= length) {
    return null;
  }
  const progress = clamp01(elapsed / length);
  return direction === 'build' ? progress : 1 - progress;
};
