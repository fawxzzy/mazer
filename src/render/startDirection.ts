/**
 * Which way the start tile's play arrow points: the direction the player will first move.
 *
 * The arrow must read as "the player emerges from here", so it points along the FIRST STEP OF THE SOLUTION PATH:
 * the real wrap-aware shortest route from the start cell to the goal (the same solver the game's own AI and QA use).
 * When the start has a single open side (every level-1 corridor, and most generated starts) that is simply the open
 * side. A wrapped first step (leaving through the edge) is the direction of travel, not the jump across the board.
 * Without a goal, or when no route is found, it falls back to the first open side in a fixed order, then to
 * DEFAULT_START_DIRECTION, so the result is always defined and deterministic.
 *
 * Pure: no Phaser, no canvas. Level 1 reads: portrait corridor = 'down', landscape corridor = 'right'.
 */
import { resolveLegacyPlayableShortestPath } from '../legacy-runtime/legacyMaze';

export type StartDirection = 'up' | 'right' | 'down' | 'left';

export const START_DIRECTIONS: readonly StartDirection[] = Object.freeze(['up', 'right', 'down', 'left'] as const);

/** The arrow of a start tile with no board around it (the Guide icon): points right. */
export const DEFAULT_START_DIRECTION: StartDirection = 'right';

export interface StartDirectionCell {
  readonly x: number;
  readonly y: number;
}

/** Fallback order when no route is available: the first open side wins. */
const FALLBACK_ORDER: readonly StartDirection[] = Object.freeze(['right', 'down', 'left', 'up'] as const);

const DELTA: Readonly<Record<StartDirection, readonly [number, number]>> = Object.freeze({
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0]
});

const isFloor = (grid: ReadonlyArray<ReadonlyArray<boolean>>, x: number, y: number): boolean => grid[y]?.[x] === true;

/** The direction of travel of one path step, wrap-aware (a step across the board is travel the other way). */
export const resolveStepDirection = (from: StartDirectionCell, to: StartDirectionCell): StartDirection | null => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) {
    return null;
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx === 0) {
      return null;
    }
    // |dx| > 1 is a wrap: leaving the right edge and re-entering at x = 0 is travelling RIGHT.
    return (Math.abs(dx) > 1 ? dx < 0 : dx > 0) ? 'right' : 'left';
  }
  return (Math.abs(dy) > 1 ? dy < 0 : dy > 0) ? 'down' : 'up';
};

export const resolveStartDirection = (
  grid: ReadonlyArray<ReadonlyArray<boolean>>,
  start: StartDirectionCell,
  goal?: StartDirectionCell | null
): StartDirection => {
  if (goal) {
    const route = resolveLegacyPlayableShortestPath(grid as boolean[][], start, goal);
    const next = route.found ? route.path[1] : undefined;
    if (next) {
      const direction = resolveStepDirection(start, next);
      if (direction) {
        return direction;
      }
    }
  }
  for (const direction of FALLBACK_ORDER) {
    const [dx, dy] = DELTA[direction];
    if (isFloor(grid, start.x + dx, start.y + dy)) {
      return direction;
    }
  }
  return DEFAULT_START_DIRECTION;
};
