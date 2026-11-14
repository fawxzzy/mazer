/**
 * Soft maze build-in / build-out (MAZER-VIS-040): one closed-form timeline for the whole maze.
 *
 * Before: the floor was revealed by a rank MASK. `introTimeline.ts` counts `tilesVisible` up (build) or down
 * (deconstruct) in BFS order and the board showed exactly the first N cells, hard: every frame a handful of
 * cells went from fully absent to fully drawn (a tile pop of 100% alpha), the wrap docks switched on / off in
 * one frame, and the start / goal markers snapped from 0 to full when the beams landed.
 *
 * Now: every floor cell has its OWN eased fade, positioned on the same BFS order, so the reveal front is a soft
 * band that is `MAZE_REVEAL_RAMP_MS` wide (700 ms at the shipped motion scale, a quarter of the build) instead
 * of one tile wide, and no cell ever changes by more than a small step per frame.
 *
 *   cell with rank r of N (position p = r / (N - 1)), window [start, start + span]:
 *     build        alpha = smoothstep((t - (start + (span - ramp) * p)) / ramp)
 *     deconstruct  alpha = 1 - smoothstep((t - (start + (span - ramp) * (1 - p))) / ramp)
 *
 * The first cell starts at the window start and the LAST cell finishes exactly at the window end, so the build
 * is complete at `resolveIntroRevealEndMs` (the instant the beams leave, unchanged) and the deconstruct is empty
 * at `resolveOutroTilesEndMs` (unchanged); input unlock and every total duration are untouched. The window
 * itself is the shipped `introTimeline.ts` one (build 100 ms in, N / 70 tiles per s clamped to 2.0-3.2 s;
 * deconstruct 400 ms in, clamped to 1.8-3.0 s).
 *
 * The other things that used to pop ride the same clock, each on a motion-scale duration:
 *   - wrap docks (the atomic edge-path group): fade in over `MAZE_DOCK_FADE_MS` right after the build, fade out
 *     over the same length ending at the instant the edge paths switch off (400 ms into the deconstruct);
 *   - start / goal markers (alpha only, through a thin hook): fade in over the beam flight (the cast used to snap
 *     in when the beams landed).
 * The strict 0/1 `bleedProgress` switch of `introTimeline.ts` is NOT changed: it still drives the edge-path
 * logic (trail, bleed glow, dock-owning cells); only the baked board's own alpha follows the ramps here.
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
  OUTRO_EDGE_PATHS_OFF_MS,
  OUTRO_REDUCED_MOTION_MS,
  OUTRO_TILES_START_MS,
  resolveIntroRevealEndMs,
  resolveIntroRevealMs,
  resolveOutroRemoveMs
} from './introTimeline';
import { MOTION_DURATION_MS, MOTION_EASING } from './motionScale';

export type MazeRevealDirection = 'build' | 'deconstruct';

/** Width of the soft front, in time: the "reveal" step of the motion scale (700 ms). */
export const MAZE_REVEAL_RAMP_MS = MOTION_DURATION_MS.reveal;
/** The wrap docks fade over this long (200 ms, the "base" step). */
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
  /** Instant (ms, intro / deconstruct clock) the first cell starts to fade. */
  readonly startMs: number;
  /** Instant the last cell has finished fading (build: the build end; deconstruct: the tiles-gone instant). */
  readonly endMs: number;
  /** Length of one cell's fade. Never more than half the window. */
  readonly rampMs: number;
}

export const resolveMazeRevealWindow = (direction: MazeRevealDirection, tileCount: number): MazeRevealWindow => {
  const count = normalizeCount(tileCount);
  const startMs = direction === 'build' ? INTRO_BUILD_START_MS : OUTRO_TILES_START_MS;
  const spanMs = direction === 'build' ? resolveIntroRevealMs(count) : resolveOutroRemoveMs(count);
  return { startMs, endMs: startMs + spanMs, rampMs: Math.min(MAZE_REVEAL_RAMP_MS, spanMs / 2) };
};

/** Where cell `rank` sits in the BFS order, 0 (the spawn tile) .. 1 (the last cell). */
export const resolveRankPosition = (rank: number, tileCount: number): number => (
  tileCount <= 1 ? 0 : clamp01(rank / (tileCount - 1))
);

/** Alpha 0..1 of the floor cell with BFS rank `rank` at `elapsedMs`. */
export const resolveCellRevealAlpha = (
  direction: MazeRevealDirection,
  window: MazeRevealWindow,
  rank: number,
  tileCount: number,
  elapsedMs: number
): number => {
  const position = resolveRankPosition(rank, tileCount);
  const travel = window.endMs - window.startMs - window.rampMs;
  const cellStartMs = window.startMs + (travel * (direction === 'build' ? position : 1 - position));
  const progress = smoothstep(clamp01((normalizeElapsed(elapsedMs) - cellStartMs) / window.rampMs));
  return direction === 'build' ? progress : 1 - progress;
};

/**
 * Fills `out[i]` with the alpha of every cell whose `ranks[i] >= 0` (a floor cell in the reveal order) and 0
 * for the others (walls: the board mask spreads their alpha from the floors around them).
 */
export const fillMazeRevealCellAlpha = (
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
    out[index] = rank < 0 ? 0 : resolveCellRevealAlpha(direction, window, rank, tileCount, elapsedMs);
  }
};

/**
 * Alpha of the wrap docks (and of the border cells that own one). Build: 0 until the build ends, then a
 * `MAZE_DOCK_FADE_MS` fade (the beams fire at the same instant). Deconstruct: 1 until the fade starts, then a
 * fade that is exactly 0 when the edge paths switch off at OUTRO_EDGE_PATHS_OFF_MS.
 */
export const resolveDockRevealAlpha = (
  direction: MazeRevealDirection,
  tileCount: number,
  elapsedMs: number
): number => {
  const elapsed = normalizeElapsed(elapsedMs);
  if (direction === 'build') {
    return smoothstep(clamp01((elapsed - resolveIntroRevealEndMs(tileCount)) / MAZE_DOCK_FADE_MS));
  }
  return 1 - smoothstep(clamp01((elapsed - (OUTRO_EDGE_PATHS_OFF_MS - MAZE_DOCK_FADE_MS)) / MAZE_DOCK_FADE_MS));
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
  /** 0..1 alpha of the wrap docks and their border cells. */
  readonly dockAlpha: number;
  /** Changes whenever anything this frame draws changes: lets the board layer skip an identical recompose. */
  readonly key: string;
}

/**
 * The soft reveal at `elapsedMs`, or null when the board is NOT in a soft reveal: reduced motion (the crossfade
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
  // The build frame lives through the dock fade, the deconstruct frame until the board is empty.
  if (elapsed >= (direction === 'build' ? window.endMs + MAZE_DOCK_FADE_MS : window.endMs)) {
    return null;
  }
  const dockAlpha = resolveDockRevealAlpha(direction, count, elapsed);
  // Nothing on the board changes after `contentEndMs`, so the key stops changing there: no recompose for an
  // identical board. Sub-millisecond steps are finer than 8-bit alpha can show.
  const contentEndMs = direction === 'build' ? window.endMs + MAZE_DOCK_FADE_MS : window.endMs;
  const stamp = Math.round(Math.min(elapsed, contentEndMs) * 4);
  return {
    direction,
    elapsedMs: elapsed,
    tileCount: count,
    window,
    dockAlpha,
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
